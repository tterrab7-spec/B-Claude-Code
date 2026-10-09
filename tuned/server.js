// TUNED server: static app + API for sync, squads, partners, clinician dashboard and
// the AI coach. Pilot-grade: one process, JSON file storage. See README for the
// production path (HIPAA hosting, real auth, database).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { points, sessionPlan, dropoutRisk, weekOf } from './public/js/engine.js';
import { rtmStatus } from './public/js/rtm.js';
import { SPRINTS } from './public/js/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const DATA = process.env.DATA_FILE || path.join(here, 'data', 'db.json');
const PORT = +process.env.PORT || 8080;
const CLINICIAN_KEY = process.env.CLINICIAN_KEY || 'tuned-demo';
const ADMIN_KEY = process.env.ADMIN_KEY || CLINICIAN_KEY;
const COACH_MODEL = process.env.COACH_MODEL || 'claude-opus-5-5';
const coachOn = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && process.env.COACH !== 'off';
const anthropic = coachOn ? new Anthropic() : null;

if (!process.env.CLINICIAN_KEY) console.warn('[tuned] CLINICIAN_KEY not set. Using the demo key "tuned-demo". Set it before real use.');

// ---------- Storage
let db = { users: {}, squads: {}, partners: {}, refHits: [], clinical: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DATA, 'utf8')) }; } catch (e) { /* first run */ }
if (!db.partners.DADBACK) db.partners.DADBACK = { code: 'DADBACK', name: 'The Dad Back', kind: 'creator', door: 'life', option: 'dad', revShare: 20, created: new Date().toISOString() };
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    const tmp = DATA + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DATA);
  }, 300);
}
const clinical = id => (db.clinical[id] ||= { messages: [], minutes: [], visits: [], overrides: [], changeStatus: {}, reviewed: null });

// ---------- HTTP helpers
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(data);
}

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}

const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const isClinician = req => safeEq(req.headers['x-clinician-key'], CLINICIAN_KEY);
const isAdmin = req => safeEq(req.headers['x-admin-key'], ADMIN_KEY) || isClinician(req) && ADMIN_KEY === CLINICIAN_KEY;
const code6 = () => crypto.randomBytes(4).toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6).padEnd(6, 'X');
const validId = id => typeof id === 'string' && /^u_[a-z0-9]{6,24}$/i.test(id);
const clean = (s, n = 60) => String(s || '').replace(/[<>]/g, '').slice(0, n).trim();

function weekSessions(u) { const wk = Date.now() - 7 * 86400000; return (u.sprint?.sessions || []).filter(s => new Date(s.at).getTime() > wk).length; }

function summary(u) {
  const c = clinical(u.id), sp = u.sprint, def = sp && SPRINTS[sp.id];
  const scores = u.scores || [];
  const pains = (sp?.sessions || []).map(s => s.pain);
  const pendingChanges = (sp?.changes || []).filter((ch, i) => !c.changeStatus[i]).length;
  const visitReq = (u.visits || []).filter(v => v.status === 'requested' && !c.visits.some(cv => cv.requestId === v.id)).length;
  const alerts = [];
  if (u.profile?.urgentFlag) alerts.push({ level: 'urgent', text: 'Coach detected urgent symptoms' });
  if (u.profile?.needsReview && !c.reviewed) alerts.push({ level: 'high', text: 'Intake safety flags need review' });
  if (u.profile?.outOfState) alerts.push({ level: 'info', text: `Lives in ${u.profile.state}: needs a PT licensed there` });
  const risk = dropoutRisk(sp);
  if (risk.level === 'high') alerts.push({ level: 'high', text: 'Drop-off risk: ' + risk.reason });
  const flares = (sp?.changes || []).filter((ch, i) => ch.flare && !c.changeStatus[i]).length;
  if (flares) alerts.push({ level: 'medium', text: `${flares} pain-flare regressions to review` });
  if (visitReq) alerts.push({ level: 'medium', text: 'Requested a video visit' });
  return {
    id: u.id, name: u.profile?.name, age: u.profile?.age, state: u.profile?.state, quiet: !!u.quiet, plan: u.plan, ref: u.ref,
    program: def?.title, sprintId: sp?.id, week: sp ? weekOf(sp.sessions.length) + 1 : null, sessions: sp?.sessions.length || 0,
    lastSession: sp?.sessions.at(-1)?.at || null, painBaseline: u.profile?.painBaseline, painLatest: pains.at(-1) ?? null,
    scoreFirst: scores[0]?.total ?? null, scoreLatest: scores.at(-1)?.total ?? null, risk, alerts, pendingChanges,
    rtm: rtmStatus(u, c.minutes), syncedAt: u._syncedAt,
  };
}

// ---------- Coach
const COACH_SYSTEM = `You are the TUNED coach, an AI assistant inside a physical therapy service for men. You work between visits under the supervision of a licensed physical therapist, who reviews every conversation.

Voice: a knowledgeable training partner. Direct, warm, brief. Plain language, no jargon, no hype. 2 to 5 short sentences unless the user asks for detail. Never use em dashes.

What you do:
- Daily check-ins: get a pain number (0-10), sleep and how the last session felt, then tune today's plan.
- Explain why an exercise is in the program and give one or two form cues.
- Offer equipment swaps and a 10-minute minimum version when they are short on time.
- Keep them going in weeks 2-4, the drop-off window. Point to concrete progress (sessions logged, Body Score change).
- Use the pain-monitoring rule: up to 5/10 during exercise is acceptable if it settles to baseline by the next morning.

Hard limits:
- Do not diagnose, interpret imaging, or recommend medications or supplements.
- Do not change the program beyond the swaps and regressions described above. For anything bigger, tell them their PT will review it, and suggest a video visit.
- Red flags (new bladder or bowel changes, numbness in the groin or inner thighs, progressive weakness, chest pain, shortness of breath, fever with back pain, unexplained weight loss, a fall or impact with severe pain): tell them to stop and get medical care today, or call 911 if severe. Say their PT has been flagged.
- If the context says quiet is true, the user is on a private pelvic-health program. Never write the brand name, and refer to the program as the "core program". Be matter-of-fact and discreet.

The <context> block in each message is the user's current program data from the app. Use it; do not read it back verbatim.`;

function normalizeHistory(history = []) {
  const out = [];
  for (const m of history.slice(-12)) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim()) continue;
    if (!out.length && m.role !== 'user') continue;
    if (out.length && out.at(-1).role === m.role) out.at(-1).content += '\n' + m.content;
    else out.push({ role: m.role, content: m.content.slice(0, 2000) });
  }
  if (out.length && out.at(-1).role === 'user') out.pop(); // the new message is appended below
  return out;
}

async function coachReply({ context, history, message }) {
  const messages = [...normalizeHistory(history), { role: 'user', content: `<context>${JSON.stringify(context || {}).slice(0, 6000)}</context>\n\n${String(message).slice(0, 2000)}` }];
  const resp = await anthropic.beta.messages.create({
    model: COACH_MODEL,
    max_tokens: 1024,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: COACH_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  if (resp.stop_reason === 'refusal') return null;
  return resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim() || null;
}

// ---------- Routes
async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api\//, '').split('/').map(decodeURIComponent);
  const M = req.method;

  if (p[0] === 'health') return send(res, 200, { ok: true, coach: coachOn, version: 1 });

  if (p[0] === 'sync' && M === 'POST') {
    const { user } = await readBody(req);
    if (!user || !validId(user.id)) return send(res, 400, { error: 'Bad user' });
    db.users[user.id] = { ...user, _syncedAt: new Date().toISOString() };
    persist();
    return send(res, 200, { ok: true });
  }

  if (p[0] === 'inbox' && M === 'GET') {
    if (!validId(p[1])) return send(res, 400, { error: 'Bad id' });
    const c = db.clinical[p[1]];
    return send(res, 200, c ? { messages: c.messages, visits: c.visits, overrides: c.overrides, reviewed: c.reviewed } : { messages: [], visits: [], overrides: [] });
  }

  if (p[0] === 'coach' && M === 'POST') {
    if (!coachOn) return send(res, 503, { error: 'Coach AI not configured' });
    const body = await readBody(req, 200_000);
    if (!body.message) return send(res, 400, { error: 'Empty message' });
    try {
      const text = await coachReply(body);
      return text ? send(res, 200, { text }) : send(res, 502, { error: 'No reply' });
    } catch (e) {
      console.error('[coach]', e.status || '', e.message);
      return send(res, 502, { error: 'Coach unavailable' });
    }
  }

  // Squads
  if (p[0] === 'squads') {
    if (M === 'POST' && !p[1]) {
      const b = await readBody(req);
      if (!validId(b.userId)) return send(res, 400, { error: 'Bad user' });
      let code; do { code = code6(); } while (db.squads[code]);
      db.squads[code] = { code, name: clean(b.name, 30) || 'Squad', members: [{ userId: b.userId, display: clean(b.display, 40) }], created: new Date().toISOString() };
      persist();
      return send(res, 200, { code });
    }
    const sq = db.squads[(p[1] || '').toUpperCase()];
    if (!sq) return send(res, 404, { error: 'No squad with that code' });
    if (M === 'POST' && p[2] === 'join') {
      const b = await readBody(req);
      if (!validId(b.userId)) return send(res, 400, { error: 'Bad user' });
      if (!sq.members.some(m => m.userId === b.userId)) {
        if (sq.members.length >= 12) return send(res, 400, { error: 'Squad is full' });
        sq.members.push({ userId: b.userId, display: clean(b.display, 40) });
        persist();
      }
      return send(res, 200, { name: sq.name });
    }
    if (M === 'GET') {
      const members = sq.members.map(m => { const u = db.users[m.userId]; return { userId: m.userId, display: m.display, points: u ? points(u) : 0, weekSessions: u ? weekSessions(u) : 0 }; }).sort((a, b) => b.points - a.points);
      return send(res, 200, { name: sq.name, members });
    }
  }

  // Partner attribution
  if (p[0] === 'ref' && p[1] === 'hit' && M === 'POST') {
    const b = await readBody(req);
    const code = clean(b.code, 20).toUpperCase();
    if (code && db.refHits.length < 500000) { db.refHits.push({ code, userId: validId(b.userId) ? b.userId : null, at: new Date().toISOString() }); persist(); }
    return send(res, 200, { ok: true, partner: db.partners[code] ? { name: db.partners[code].name } : null });
  }

  if (p[0] === 'partners') {
    if (M === 'GET' && p[1] && p[2] === 'public') { const pt = db.partners[p[1].toUpperCase()]; return pt ? send(res, 200, { name: pt.name, door: pt.door, option: pt.option }) : send(res, 404, { error: 'Unknown partner' }); }
    if (!isAdmin(req)) return send(res, 401, { error: 'Admin key required' });
    if (M === 'GET') {
      const users = Object.values(db.users);
      const list = Object.values(db.partners).map(pt => {
        const mine = users.filter(u => u.ref === pt.code);
        return { ...pt, scans: db.refHits.filter(x => x.code === pt.code).length, signups: mine.length,
          scored: mine.filter(u => u.scores?.length).length, active: mine.filter(u => (u.sprint?.sessions?.length || 0) >= 4).length,
          paid: mine.filter(u => u.plan && u.plan !== 'free').length };
      });
      return send(res, 200, { partners: list });
    }
    if (M === 'POST') {
      const b = await readBody(req);
      const code = clean(b.code, 16).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!code || !b.name) return send(res, 400, { error: 'Code and name are required' });
      db.partners[code] = { code, name: clean(b.name, 60), kind: clean(b.kind, 20), door: clean(b.door, 20), option: clean(b.option, 20), revShare: Math.max(0, Math.min(50, +b.revShare || 0)), contact: clean(b.contact, 80), created: db.partners[code]?.created || new Date().toISOString() };
      persist();
      return send(res, 200, db.partners[code]);
    }
  }

  // Clinician
  if (p[0] === 'clinician') {
    if (!isClinician(req)) return send(res, 401, { error: 'Clinician key required' });
    if (p[1] === 'patients' && !p[2] && M === 'GET') {
      const list = Object.values(db.users).filter(u => u.profile).map(summary);
      const rank = s => s.alerts.some(a => a.level === 'urgent') ? 0 : s.alerts.some(a => a.level === 'high') ? 1 : s.alerts.length ? 2 : 3;
      list.sort((a, b) => rank(a) - rank(b) || (b.lastSession || '').localeCompare(a.lastSession || ''));
      return send(res, 200, { patients: list });
    }
    const u = db.users[p[2]];
    if (p[1] === 'patients' && !u) return send(res, 404, { error: 'No such patient' });
    const c = u && clinical(u.id);
    if (p[1] === 'patients' && !p[3] && M === 'GET') return send(res, 200, { user: u, clinical: c, summary: summary(u) });
    if (p[1] === 'patients' && M === 'POST') {
      const b = await readBody(req);
      const by = clean(b.by || 'Your PT', 40);
      if (p[3] === 'message') { if (!b.text) return send(res, 400, { error: 'Empty' }); c.messages.push({ from: by, text: clean(b.text, 1000), at: new Date().toISOString() }); }
      else if (p[3] === 'minutes') { const m = Math.max(1, Math.min(120, +b.minutes || 0)); c.minutes.push({ minutes: m, interactive: !!b.interactive, note: clean(b.note, 200), by, at: new Date().toISOString() }); }
      else if (p[3] === 'visit') {
        const when = new Date(b.when); if (isNaN(when)) return send(res, 400, { error: 'Pick a date and time' });
        c.visits.push({ id: 'cv' + Date.now(), requestId: b.requestId || null, when: when.toISOString(), link: `https://meet.jit.si/TUNED-${crypto.randomBytes(6).toString('hex')}`, status: 'scheduled', by });
      }
      else if (p[3] === 'review') { c.reviewed = { by, at: new Date().toISOString(), note: clean(b.note, 300) }; if (u.profile) u.profile.urgentFlag = null; }
      else if (p[3] === 'change') {
        const i = +b.index; const ch = u.sprint?.changes?.[i]; if (!ch) return send(res, 400, { error: 'No such change' });
        c.changeStatus[i] = { status: b.status === 'reverted' ? 'reverted' : 'approved', by, at: new Date().toISOString() };
        if (b.status === 'reverted') c.overrides.push({ id: 'o' + Date.now() + i, base: ch.base, mod: ch.type === 'regress' || ch.type === 'progress' ? (ch.from === ch.base ? {} : { swap: ch.from }) : {}, at: new Date().toISOString() });
      }
      else return send(res, 404, { error: 'Unknown action' });
      persist();
      return send(res, 200, { ok: true, clinical: c, summary: summary(u) });
    }
  }
  return send(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback
      return fs.createReadStream(path.join(PUBLIC, 'index.html')).pipe((res.writeHead(200, { 'content-type': MIME['.html'] }), res));
    }
    const ext = path.extname(file);
    const long = rel.startsWith('/vendor/');
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'content-length': st.size, 'cache-control': long ? 'public, max-age=604800' : 'no-cache',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'permissions-policy': 'camera=(self), microphone=(self)' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    serveStatic(req, res, url);
  } catch (e) {
    send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
    if (!e.status) console.error(e);
  }
});

server.listen(PORT, () => console.log(`[tuned] http://localhost:${PORT}  coach AI: ${coachOn ? COACH_MODEL : 'off (rules coach)'}`));
