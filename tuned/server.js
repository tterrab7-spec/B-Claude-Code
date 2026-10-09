// TUNED server: static app + API for sync, squads, partners, clinician dashboard and
// the AI coach. Pilot-grade: one process, JSON file storage. See README for the
// production path (HIPAA hosting, real auth, database).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { points } from './public/js/engine.js';
import { summary as clinicSummary, applyAction, triageRank, newClinical, newLibrary, applyLibraryOp, patientMessage, activity, auditEntry, libraryAuditText, actionText } from './public/js/clinic.js';
import { registerLibrary, SPRINTS, EXERCISES } from './public/js/data.js';
import { dailyEmail } from './public/js/email.js';

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
let db = { users: {}, squads: {}, partners: {}, refHits: [], clinical: {}, library: newLibrary(), audit: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DATA, 'utf8')) }; } catch (e) { /* first run */ }
registerLibrary(db.library);
const STARTED = new Date().toISOString();
const audit = (req, action, pid, text) => { db.audit.push(auditEntry(req.headers['x-pt-name'] || 'PT', action, pid, text)); if (db.audit.length > 5000) db.audit.splice(0, db.audit.length - 5000); };
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
const clinical = id => { const c = (db.clinical[id] ||= newClinical()); for (const [k, v] of Object.entries(newClinical())) if (!(k in c)) c[k] = v; return c; };

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

const summary = u => clinicSummary(u, clinical(u.id));

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

  if (p[0] === 'health') return send(res, 200, { ok: true, coach: coachOn, model: coachOn ? COACH_MODEL : null, version: 2, storage: 'json-file', startedAt: STARTED });

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
    return send(res, 200, { messages: c?.messages || [], visits: c?.visits || [], overrides: c?.overrides || [], reviewed: c?.reviewed || null, assignment: c?.assignment || null, library: db.library });
  }

  if (p[0] === 'messages' && M === 'POST') {
    if (!validId(p[1]) || !db.users[p[1]]) return send(res, 400, { error: 'Unknown patient' });
    const b = await readBody(req, 20_000);
    const err = patientMessage(db.users[p[1]], clinical(p[1]), b.text);
    if (err) return send(res, 400, { error: err });
    persist();
    return send(res, 200, { ok: true, messages: clinical(p[1]).messages });
  }

  // Daily email feed for n8n (or any scheduler). One entry per opted-in patient.
  if (p[0] === 'daily' && M === 'GET') {
    if (!isAdmin(req)) return send(res, 401, { error: 'Admin key required' });
    const appUrl = process.env.APP_URL || `https://${req.headers.host}/`;
    const today = new Date().toISOString().slice(0, 10);
    const emails = Object.values(db.users).filter(u => u.profile?.dailyEmail && u.profile?.email && !(u.sprint?.sessions || []).some(x => x.at.slice(0, 10) === today))
      .map(u => dailyEmail(u, clinical(u.id), appUrl)).filter(Boolean);
    return send(res, 200, { date: today, count: emails.length, emails });
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
    if (p[1] === 'library') {
      if (M === 'GET') return send(res, 200, db.library);
      const b = await readBody(req, 300_000);
      const text = libraryAuditText(b.op, b);
      const err = applyLibraryOp(db.library, b.op, { ...b, by: req.headers['x-pt-name'] || 'PT' });
      if (err) return send(res, 400, { error: err });
      registerLibrary(db.library);
      if (b.op === 'deleteProgram') delete SPRINTS[b.id];
      if (b.op === 'deleteExercise') delete EXERCISES[b.id];
      audit(req, 'library.' + b.op, null, text);
      persist();
      return send(res, 200, db.library);
    }
    if (p[1] === 'system' && M === 'GET') {
      const users = Object.values(db.users).filter(u => u.profile);
      const records = users.map(u => ({ u, c: clinical(u.id) }));
      let bytes = 0; try { bytes = fs.statSync(DATA).size; } catch (e) {}
      const count = f => users.reduce((a, u) => a + (f(u) || 0), 0);
      return send(res, 200, {
        mode: 'server', storage: 'JSON file on the server', dataFile: path.basename(DATA), bytes, startedAt: STARTED, coach: coachOn, model: coachOn ? COACH_MODEL : null, node: process.version,
        counts: { patients: users.length, sessions: count(u => u.sprint?.sessions?.length), scores: count(u => u.scores?.length), checkins: count(u => u.checkins?.length), coachChanges: count(u => u.sprint?.changes?.length),
          messages: records.reduce((a, r) => a + r.c.messages.length, 0), notes: records.reduce((a, r) => a + r.c.notes.length, 0), squads: Object.keys(db.squads).length, partners: Object.keys(db.partners).length,
          customPrograms: Object.keys(db.library.programs).length, customExercises: Object.keys(db.library.exercises).length, videos: Object.keys(db.library.videos).length },
        activity: activity(records, db.audit),
      });
    }
    if (p[1] === 'export' && M === 'GET') return send(res, 200, { exportedAt: new Date().toISOString(), ...db }, { 'content-disposition': 'attachment; filename="tuned-export.json"' });
    if (p[1] === 'patients' && !p[2] && M === 'GET') {
      const list = Object.values(db.users).filter(u => u.profile).map(summary);
      list.sort((a, b) => triageRank(a) - triageRank(b) || (b.lastSession || '').localeCompare(a.lastSession || ''));
      return send(res, 200, { patients: list });
    }
    const u = db.users[p[2]];
    if (p[1] === 'patients' && !u) return send(res, 404, { error: 'No such patient' });
    const c = u && clinical(u.id);
    if (p[1] === 'patients' && !p[3] && M === 'GET') return send(res, 200, { user: u, clinical: c, summary: summary(u) });
    if (p[1] === 'patients' && M === 'POST') {
      const b = await readBody(req);
      const err = applyAction(u, c, p[3], b);
      if (err) return send(res, 400, { error: err });
      if (p[3] !== 'read') audit(req, p[3], u.id, actionText(p[3], u, b));
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
