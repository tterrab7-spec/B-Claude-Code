// Clinician-side logic shared by the server and the on-device demo clinic:
// patient summaries, triage alerts and every PT action.
import { SPRINTS } from './data.js';
import { dropoutRisk, weekOf } from './engine.js';
import { rtmStatus } from './rtm.js';

export const newClinical = () => ({ messages: [], minutes: [], visits: [], overrides: [], changeStatus: {}, notes: [], reviewed: null });

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
  return {
    id: u.id, demo: !!u.demo, name: u.profile?.name, age: u.profile?.age, state: u.profile?.state, quiet: !!u.quiet, plan: u.plan, ref: u.ref,
    program: def?.title, sprintId: sp?.id, week: sp ? weekOf(sp.sessions.length) + 1 : null, sessions: sp?.sessions.length || 0,
    lastSession: sp?.sessions.at(-1)?.at || null, painBaseline: u.profile?.painBaseline, painLatest: pains.at(-1) ?? null,
    scoreFirst: scores[0]?.total ?? null, scoreLatest: scores.at(-1)?.total ?? null, risk, alerts, pendingChanges,
    rtm: rtmStatus(u, c.minutes), syncedAt: u._syncedAt,
  };
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
    c.messages.push({ from: by, text: clean(b.text, 1000), at: now });
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
    ['sets', 'reps', 'secs'].forEach(k => { const v = Math.round(+b[k] || 0); if (v) mod[k] = Math.max(-20, Math.min(30, v)); });
    c.overrides.push({ id: 'o' + Date.now(), base: clean(b.base, 40), mod, at: now, by, why: 'PT plan edit' });
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
