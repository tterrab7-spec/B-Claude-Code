// Clinician-side logic shared by the server and the on-device demo clinic:
// patient summaries, triage alerts and every PT action.
import { SPRINTS, EXERCISES, isBuiltinExercise, isBuiltinProgram, itemId } from './data.js';
import { dropoutRisk, weekOf } from './engine.js';
import { rtmStatus } from './rtm.js';

export const newClinical = () => ({ messages: [], minutes: [], visits: [], overrides: [], changeStatus: {}, notes: [], reviewed: null, ptReadAt: '', assignment: null });
export const newLibrary = () => ({ exercises: {}, programs: {}, videos: {} });

const clean = (s, n = 60) => String(s || '').replace(/[<>]/g, '').slice(0, n).trim();
const hex = n => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

export function summary(u, c) {
  c = { ...newClinical(), ...c };
  const sp = u.sprint, def = sp && SPRINTS[sp.id];
  const scores = u.scores || [];
  const pains = (sp?.sessions || []).map(s => s.pain);
  const pendingChanges = (sp?.changes || []).filter((ch, i) => !c.changeStatus[i]).length;
  const visitReq = (u.visits || []).filter(v => v.status === 'requested' && !c.visits.some(cv => cv.requestId === v.id)).length;
  const alerts = [];
  if (u.profile?.urgentFlag && !(c.reviewed && c.reviewed.at > u.profile.urgentFlag)) alerts.push({ level: 'urgent', text: 'Coach detected urgent symptoms' });
  if (u.profile?.flags?.length && !c.reviewed) alerts.push({ level: 'high', text: 'Intake safety flags need review' });
  if (u.profile?.outOfState) alerts.push({ level: 'info', text: `Lives in ${u.profile.state}: needs a PT licensed there` });
  const risk = dropoutRisk(sp);
  if (risk.level === 'high') alerts.push({ level: 'high', text: 'Drop-off risk: ' + risk.reason });
  const flares = (sp?.changes || []).filter((ch, i) => ch.flare && !c.changeStatus[i]).length;
  if (flares) alerts.push({ level: 'medium', text: `${flares} pain-flare regressions to review` });
  if (visitReq) alerts.push({ level: 'medium', text: 'Requested a video visit' });
  const unread = c.messages.filter(m => m.role === 'patient' && m.at > (c.ptReadAt || '')).length;
  if (unread) alerts.push({ level: 'medium', text: `${unread} unread message${unread === 1 ? '' : 's'}` });
  const comp = compliance(u);
  if (comp.expected >= 4 && comp.pct < 60) alerts.push({ level: 'medium', text: `Compliance ${comp.pct}%` });
  return {
    id: u.id, demo: !!u.demo, name: u.profile?.name, age: u.profile?.age, state: u.profile?.state, quiet: !!u.quiet, plan: u.plan, ref: u.ref,
    program: def?.title, sprintId: sp?.id, week: sp ? weekOf(sp.sessions.length) + 1 : null, sessions: sp?.sessions.length || 0,
    lastSession: sp?.sessions.at(-1)?.at || null, painBaseline: u.profile?.painBaseline, painLatest: pains.at(-1) ?? null,
    scoreFirst: scores[0]?.total ?? null, scoreLatest: scores.at(-1)?.total ?? null, risk, alerts, pendingChanges,
    rtm: rtmStatus(u, c.minutes), syncedAt: u._syncedAt, unread, compliance: comp,
    email: u.profile?.dailyEmail ? u.profile.email : null,
  };
}

// Compliance: sessions logged vs sessions expected by now (4 a week from the start date).
export function compliance(u, now = Date.now()) {
  const sp = u.sprint;
  if (!sp) return { done: 0, expected: 0, pct: 0 };
  const days = Math.max(0, (now - new Date(sp.startedAt).getTime()) / 86400000);
  const expected = Math.min(24, Math.max(1, Math.round(days / 7 * 4)));
  const done = sp.sessions.length;
  return { done, expected, pct: Math.min(100, Math.round(done / expected * 100)) };
}

export function triageRank(s) {
  return s.alerts.some(a => a.level === 'urgent') ? 0 : s.alerts.some(a => a.level === 'high') ? 1 : s.alerts.some(a => a.level !== 'info') ? 2 : 3;
}

// Applies one PT action. Mutates u (patient) and c (clinical record). Returns an error string or null.
export function applyAction(u, c, action, b = {}) {
  const by = clean(b.by || 'Your PT', 40);
  const now = new Date().toISOString();
  if (action === 'message') {
    if (!b.text) return 'Write a message first';
    c.messages.push({ from: by, role: 'pt', text: clean(b.text, 1000), at: now });
  } else if (action === 'minutes') {
    const m = Math.max(1, Math.min(120, +b.minutes || 0));
    c.minutes.push({ minutes: m, interactive: !!b.interactive, note: clean(b.note, 200), by, at: now });
  } else if (action === 'visit') {
    const when = new Date(b.when);
    if (isNaN(when)) return 'Pick a date and time';
    c.visits.push({ id: 'cv' + Date.now(), requestId: b.requestId || null, when: when.toISOString(), link: `https://meet.jit.si/TUNED-${hex(6)}`, status: 'scheduled', by });
  } else if (action === 'review') {
    c.reviewed = { by, at: now, note: clean(b.note, 300) };
    if (u.profile) u.profile.urgentFlag = null;
  } else if (action === 'change') {
    const i = +b.index, ch = u.sprint?.changes?.[i];
    if (!ch) return 'No such change';
    c.changeStatus[i] = { status: b.status === 'reverted' ? 'reverted' : 'approved', by, at: now };
    if (b.status === 'reverted') c.overrides.push({ id: 'o' + Date.now() + i, base: ch.base, mod: ch.from === ch.base ? {} : { swap: ch.from }, at: now, by, why: 'Reverted coach change' });
  } else if (action === 'plan') {
    if (!b.base) return 'Pick an exercise';
    const mod = {};
    if (b.swap && b.swap !== b.base) mod.swap = clean(b.swap, 40);
    if (b.note) mod.note = clean(b.note, 300);
    ['sets', 'reps', 'secs'].forEach(k => { const v = Math.round(+b[k] || 0); if (v) mod[k] = Math.max(-20, Math.min(30, v)); });
    c.overrides.push({ id: 'o' + Date.now(), base: clean(b.base, 40), mod, at: now, by, why: 'PT plan edit' });
  } else if (action === 'read') {
    c.ptReadAt = now;
  } else if (action === 'assign') {
    if (!SPRINTS[b.programId]) return 'Unknown program';
    c.assignment = { programId: b.programId, at: now, by };
  } else if (action === 'note') {
    if (!b.text) return 'Write a note first';
    c.notes.push({ text: clean(b.text, 4000), kind: clean(b.kind || 'Progress note', 30), by, at: now });
  } else return 'Unknown action';
  return null;
}

// Current plan modifications for a patient: what the coach set, then PT overrides on top.
export function effectiveMods(u, c) {
  const mods = { ...(u.sprint?.mods || {}) };
  const applied = new Set(u.appliedOverrides || []);
  (c?.overrides || []).forEach(o => { if (!applied.has(o.id)) { if (Object.keys(o.mod).length) mods[o.base] = o.mod; else delete mods[o.base]; } });
  return mods;
}

// Patient-to-PT message (patient side of the thread).
export function patientMessage(u, c, text) {
  if (!text || !String(text).trim()) return 'Write a message first';
  c.messages.push({ from: u.profile?.name || 'Patient', role: 'patient', text: clean(text, 1000), at: new Date().toISOString() });
  return null;
}

// ---------- Program and exercise library (PT-built content)
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
const num = (v, lo, hi) => { const n = Math.round(+v); return n ? Math.max(lo, Math.min(hi, n)) : undefined; };
const safeUrl = u => { const v = String(u || '').trim(); return /^https:\/\/[^\s<>"']+$/i.test(v) ? v.slice(0, 500) : ''; };

export function applyLibraryOp(lib, op, b = {}) {
  lib.exercises ||= {}; lib.programs ||= {}; lib.videos ||= {};
  const now = new Date().toISOString();
  if (op === 'saveExercise') {
    const name = clean(b.name, 60); if (!name) return 'Exercise needs a name';
    const id = b.id && !isBuiltinExercise(b.id) ? clean(b.id, 40) : 'x_' + slug(name) + '_' + Date.now().toString(36).slice(-4);
    const e = { name, region: clean(b.region || 'general', 20), cues: String(b.cues || '').split('\n').map(x => clean(x, 160)).filter(Boolean).slice(0, 6), sets: num(b.sets, 1, 10) || 3, perSide: !!b.perSide, by: clean(b.by, 40), at: now };
    if (+b.secs) e.secs = num(b.secs, 5, 600); else if (+b.mins) e.mins = num(b.mins, 1, 90); else e.reps = num(b.reps, 1, 100) || 10;
    lib.exercises[id] = e;
    if (b.video !== undefined) { const v = safeUrl(b.video); if (v) lib.videos[id] = v; else delete lib.videos[id]; }
    return null;
  }
  if (op === 'setVideo') {
    if (!b.id) return 'Pick an exercise';
    const v = safeUrl(b.video);
    if (b.video && !v) return 'Video link must start with https://';
    if (v) lib.videos[b.id] = v; else delete lib.videos[b.id];
    return null;
  }
  if (op === 'deleteExercise') { if (isBuiltinExercise(b.id)) return 'Built-in exercises cannot be deleted'; delete lib.exercises[b.id]; delete lib.videos[b.id]; return null; }
  if (op === 'saveProgram') {
    const title = clean(b.title, 80); if (!title) return 'Program needs a title';
    const phases = (b.phases || []).slice(0, 3).map((ph, i) => ({
      name: clean(ph.name, 40) || ['Phase 1', 'Phase 2', 'Phase 3'][i],
      ...Object.fromEntries(['A', 'B'].map(v => [v, (ph[v] || []).slice(0, 12).filter(it => EXERCISES[itemId(it)] || lib.exercises[itemId(it)]).map(it => {
        const o = { id: clean(itemId(it), 40) };
        ['sets', 'reps', 'secs', 'mins'].forEach(k => { const n = num(it[k], 1, k === 'secs' ? 600 : 100); if (n) o[k] = n; });
        if (it.note) o.note = clean(it.note, 300);
        return o;
      })])),
    }));
    if (phases.length !== 3 || phases.some(p => !p.A.length || !p.B.length)) return 'Each of the 3 phases needs at least one exercise in Session A and Session B';
    const id = b.id && !isBuiltinProgram(b.id) ? clean(b.id, 40) : 'p_' + slug(title) + '_' + Date.now().toString(36).slice(-4);
    lib.programs[id] = { title, short: clean(b.short || title, 20), door: 'custom', goal: clean(b.goal, 200), outcome: clean(b.outcome, 200), phases, by: clean(b.by, 40), at: now };
    return null;
  }
  if (op === 'deleteProgram') { if (isBuiltinProgram(b.id)) return 'Built-in programs cannot be deleted'; delete lib.programs[b.id]; return null; }
  return 'Unknown library operation';
}

// ---------- Activity feed: patient events derived from the records, plus PT actions.
export function activity(records, audit = [], limit = 60) {
  const ev = [];
  records.forEach(({ u, c }) => {
    const who = u.profile?.name || 'Patient';
    (u.sprint?.sessions || []).forEach((x, i) => ev.push({ at: x.at, actor: who, kind: 'session', text: `Logged session ${i + 1} · pain ${x.pain}/10 · ${x.effort}`, pid: u.id }));
    (u.scores || []).forEach(x => ev.push({ at: x.at, actor: who, kind: 'score', text: `Body Score ${x.total} (${x.method})`, pid: u.id }));
    (u.checkins || []).forEach(x => ev.push({ at: x.at, actor: who, kind: 'checkin', text: `Check-in · pain ${x.pain}/10`, pid: u.id }));
    (u.sprint?.changes || []).forEach(x => ev.push({ at: x.at, actor: 'AI coach', kind: 'change', text: `${x.type} ${EXERCISES[x.from]?.name || x.from} for ${who}`, pid: u.id }));
    (c?.messages || []).forEach(x => ev.push({ at: x.at, actor: x.role === 'patient' ? who : x.from, kind: 'message', text: (x.role === 'patient' ? 'Message to PT: ' : `Message to ${who}: `) + x.text.slice(0, 80), pid: u.id }));
  });
  audit.forEach(a => ev.push({ ...a, kind: 'pt' }));
  return ev.filter(e => e.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export const auditEntry = (actor, action, pid, text) => ({ at: new Date().toISOString(), actor: clean(actor, 40), action, pid, text: clean(text, 160) });

export function libraryAuditText(op, b = {}) {
  const ex = EXERCISES[b.id]?.name || b.name || b.id;
  return { saveExercise: `Saved exercise ${b.name || ex}`, setVideo: b.video ? `Set demo video for ${ex}` : `Removed demo video from ${ex}`, deleteExercise: `Deleted exercise ${ex}`,
    saveProgram: `Saved program ${b.title}`, deleteProgram: `Deleted program ${SPRINTS[b.id]?.title || b.id}` }[op] || op;
}

export function actionText(action, u, b = {}) {
  const n = u.profile?.name || 'patient';
  return { message: `Message to ${n}: ${String(b.text || '').slice(0, 70)}`, note: `${b.kind || 'Note'} for ${n}`, minutes: `Logged ${b.minutes} min${b.interactive ? ' live' : ''} for ${n}`,
    visit: `Scheduled video visit with ${n}`, review: `Reviewed and cleared ${n}`, change: `${b.status === 'reverted' ? 'Reverted' : 'Approved'} a coach change for ${n}`,
    plan: `Edited ${EXERCISES[b.base]?.name || b.base} in ${n}'s plan`, assign: `Assigned ${SPRINTS[b.programId]?.title || b.programId} to ${n}` }[action] || `${action} · ${n}`;
}
