// Engine, scoring and RTM checks. Run: npm test
import assert from 'node:assert/strict';
import { SPRINTS, EXERCISES, DOORS } from '../public/js/data.js';
import * as E from '../public/js/engine.js';
import { composite } from '../public/js/screen.js';
import { rtmStatus } from '../public/js/rtm.js';
import { parseCheckin } from '../public/js/voice.js';
import { summary, applyAction, newClinical, effectiveMods, newLibrary, applyLibraryOp, compliance } from '../public/js/clinic.js';
import { registerLibrary } from '../public/js/data.js';
import { dailyEmail } from '../public/js/email.js';
import { demoCaseload } from '../public/js/demo.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('every Sprint references real exercises and every door option has a Sprint', () => {
  for (const [id, s] of Object.entries(SPRINTS)) for (const ph of s.phases) for (const ex of [...ph.A, ...ph.B]) assert.ok(EXERCISES[ex], `${id}: ${ex}`);
  for (const [id, e] of Object.entries(EXERCISES)) { if (e.prog) assert.ok(EXERCISES[e.prog], id + ' prog'); if (e.reg) assert.ok(EXERCISES[e.reg], id + ' reg'); }
  DOORS.forEach(d => d.options.forEach(o => assert.ok(SPRINTS[o.id], o.id)));
});

t('schedule: 24 sessions, phases advance every 2 weeks, A/B alternate', () => {
  const sp = E.startSprint('back40');
  assert.equal(E.sessionPlan(sp, 0).phaseIdx, 0);
  assert.equal(E.sessionPlan(sp, 8).phaseIdx, 1);
  assert.equal(E.sessionPlan(sp, 23).phaseIdx, 2);
  assert.notDeepEqual(E.sessionPlan(sp, 0).items.map(i => i.id), E.sessionPlan(sp, 1).items.map(i => i.id));
});

t('flare regresses exercises that have an easier version', () => {
  const sp = E.startSprint('back40');
  const log = { idx: 8, pain: 8, effort: 'right', at: new Date().toISOString() };
  const r = E.progress(sp, log, 4);
  assert.ok(r.flare);
  assert.ok(r.changes.some(c => c.type === 'regress' && c.from === 'deadBug' && c.to === 'pelvicTilt'));
  assert.equal(E.sessionPlan(sp, 8).items.find(i => i.base === 'deadBug').id, 'pelvicTilt');
  assert.ok(r.changes.some(c => c.type === 'reduce'));
});

t('two easy, low-pain sessions in a row level up', () => {
  const sp = E.startSprint('back40');
  const log = i => { const l = { idx: i, pain: 2, effort: 'easy', at: new Date().toISOString() }; sp.sessions.push(l); return E.progress(sp, l, 5); };
  assert.equal(log(0).changes.length, 0);
  const r = log(1);
  assert.ok(r.changes.some(c => c.type === 'progress'));
});

t('Body Score maps to 300-850 and handles skipped tests', () => {
  assert.equal(E.toScore(0), 300); assert.equal(E.toScore(100), 850);
  const c = composite({ squat: { pct: 80, control: 70, metrics: { depth: 85 } }, toe: { pct: 60 }, reach: { pct: 90, asym: 0.1 }, balance: null, turn: { pct: 70, asym: 0.2 } });
  assert.ok(c.total >= 300 && c.total <= 850);
  assert.equal(c.parts.stability, null);
});

t('RTM: 16+ data days earns 98977, 2-15 earns 98985, minutes need interaction', () => {
  const start = new Date(Date.now() - 20 * 86400000);
  const sessions = Array.from({ length: 17 }, (_, i) => ({ at: new Date(start.getTime() + i * 86400000).toISOString(), pain: 3 }));
  const u = { sprint: { startedAt: start.toISOString(), sessions }, scores: [] };
  assert.ok(rtmStatus(u).codes.includes('98977'));
  u.sprint.sessions = sessions.slice(0, 5);
  assert.ok(rtmStatus(u).codes.includes('98985'));
  const now = new Date().toISOString();
  assert.ok(!rtmStatus(u, [{ minutes: 25, at: now }]).codes.includes('98980'));
  assert.ok(rtmStatus(u, [{ minutes: 25, at: now, interactive: true }]).codes.includes('98980'));
  assert.ok(rtmStatus(u, [{ minutes: 12, at: now, interactive: true }]).codes.includes('98979'));
});

t('voice check-in parsing', () => {
  assert.equal(parseCheckin("back's about a 4 today, slept bad").pain, 4);
  assert.equal(parseCheckin("back's about a 4 today, slept bad").sleep, 'poor');
  assert.equal(parseCheckin('knee is a seven').pain, 7);
});

t('clinic: revert, plan edit, urgent alert clears on review', () => {
  const sp = E.startSprint('back40');
  const l = { idx: 8, pain: 8, effort: 'right', at: new Date().toISOString() };
  sp.sessions.push(l); E.progress(sp, l, 4);
  const u = { id: 'u_test1234', profile: { name: 'T', painBaseline: 4, flags: [], urgentFlag: new Date(Date.now() - 1000).toISOString() }, sprint: sp, scores: [] };
  const c = newClinical();
  assert.ok(summary(u, c).alerts.some(a => a.level === 'urgent'));
  const i = sp.changes.findIndex(ch => ch.type === 'regress');
  assert.equal(applyAction(u, c, 'change', { index: i, status: 'reverted' }), null);
  assert.equal(effectiveMods(u, c).deadBug, undefined);
  assert.equal(applyAction(u, c, 'plan', { base: 'deadBug', swap: 'deadBugHold', reps: 2 }), null);
  assert.deepEqual(effectiveMods(u, c).deadBug, { swap: 'deadBugHold', reps: 2 });
  applyAction(u, c, 'review', { note: 'ok' });
  assert.ok(!summary(u, c).alerts.some(a => a.level === 'urgent'));
  assert.equal(applyAction(u, c, 'bogus', {}), 'Unknown action');
});

t('demo caseload covers every alert type', () => {
  const levels = new Set(demoCaseload().flatMap(({ user, clinical }) => summary(user, clinical).alerts.map(a => a.level)));
  ['urgent', 'high', 'medium', 'info'].forEach(l => assert.ok(levels.has(l), l));
});

t('library: custom exercise, video, program with prescriptions runs in the engine', () => {
  const lib = newLibrary();
  assert.equal(applyLibraryOp(lib, 'saveExercise', { name: 'Hip Airplane', region: 'hip', reps: 6, cues: 'a\nb', video: 'https://youtu.be/abcdefghijk' }), null);
  const xid = Object.keys(lib.exercises)[0];
  assert.equal(applyLibraryOp(lib, 'setVideo', { id: 'gluteBridge', video: 'javascript:alert(1)' }), 'Video link must start with https://');
  assert.equal(applyLibraryOp(lib, 'saveProgram', { title: 'Bad', phases: [] }).startsWith('Each'), true);
  const ph = { name: 'P', A: [{ id: xid, sets: 2, reps: 8, note: 'slow' }], B: ['gluteBridge'] };
  assert.equal(applyLibraryOp(lib, 'saveProgram', { title: 'Hip Plan', phases: [ph, ph, ph] }), null);
  registerLibrary(lib);
  const pid = Object.keys(lib.programs)[0];
  const plan = E.sessionPlan(E.startSprint(pid), 0);
  assert.equal(plan.items[0].id, xid); assert.equal(plan.items[0].ex.reps, 8); assert.equal(plan.items[0].ex.sets, 2); assert.equal(plan.items[0].note, 'slow');
  assert.equal(plan.items[0].ex.video, 'https://youtu.be/abcdefghijk');
});

t('daily email uses a newly assigned program and compliance math', () => {
  const pid = Object.keys(SPRINTS).find(k => k.startsWith('p_'));
  const u = { id: 'u_mail12345', profile: { name: 'Sam Hill', email: 's@x.com', dailyEmail: true }, sprint: E.startSprint('back40'), scores: [] };
  const c = newClinical(); c.assignment = { programId: pid, at: new Date().toISOString() };
  const em = dailyEmail(u, c, 'https://tuned.example/');
  assert.ok(em.html.includes('Hip Airplane') && em.html.includes('From your PT') && em.html.includes('#/session'));
  assert.equal(em.to, 's@x.com');
  const sp = E.startSprint('back40'); sp.startedAt = new Date(Date.now() - 14 * 86400000).toISOString(); sp.sessions = [1, 2, 3, 4].map(() => ({ at: new Date().toISOString(), pain: 3 }));
  assert.deepEqual(compliance({ sprint: sp }), { done: 4, expected: 8, pct: 50 });
});

console.log(`\n${n} passed`);
