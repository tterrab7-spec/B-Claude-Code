// Engine, scoring and RTM checks. Run: npm test
import assert from 'node:assert/strict';
import { SPRINTS, EXERCISES, DOORS } from '../public/js/data.js';
import * as E from '../public/js/engine.js';
import { composite } from '../public/js/screen.js';
import { rtmStatus } from '../public/js/rtm.js';
import { parseCheckin } from '../public/js/voice.js';

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

console.log(`\n${n} passed`);
