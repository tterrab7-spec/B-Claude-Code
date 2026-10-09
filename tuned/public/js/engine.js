// Clinical engine: Sprint schedule, progression rules, Body Score scale, points.
import { EXERCISES, SPRINTS } from './data.js';

export const SESSIONS_PER_WEEK = 4;
export const TOTAL_SESSIONS = 24;          // 6 weeks x 4
export const RESCORE_AT = [8, 24];         // end of week 2 and end of Sprint

export function startSprint(id) {
  return { id, startedAt: new Date().toISOString(), sessions: [], mods: {}, easyStreak: 0, changes: [] };
}

export function sprintDef(sp) { return sp ? SPRINTS[sp.id] : null; }

export function nextIndex(sp) { return sp.sessions.length; }

export function weekOf(idx) { return Math.min(5, Math.floor(idx / SESSIONS_PER_WEEK)); }
export function phaseOf(idx) { return Math.floor(weekOf(idx) / 2); }

// Resolve the session plan for a given index with the user's personal modifications.
export function sessionPlan(sp, idx = nextIndex(sp)) {
  const def = sprintDef(sp);
  if (!def) return null;
  const phase = def.phases[phaseOf(Math.min(idx, TOTAL_SESSIONS - 1))];
  const variant = idx % 2 === 0 ? 'A' : 'B';
  const items = phase[variant].map(base => {
    const m = sp.mods[base] || {};
    const id = m.swap || base;
    return { base, id, ex: EXERCISES[id], mod: m };
  });
  return { idx, week: weekOf(idx) + 1, phase: phase.name, phaseIdx: phaseOf(idx), variant, items };
}

export function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function lastSessionAt(sp) {
  const s = sp && sp.sessions[sp.sessions.length - 1];
  return s ? s.at : sp ? sp.startedAt : null;
}

export function streak(sp) {
  if (!sp || !sp.sessions.length) return 0;
  // Weekly streak: consecutive weeks (back from this week) with >= 3 sessions logged.
  const byWeek = {};
  const start = new Date(sp.startedAt).getTime();
  sp.sessions.forEach(s => { const k = Math.floor((new Date(s.at).getTime() - start) / 604800000); byWeek[k] = (byWeek[k] || 0) + 1; });
  let n = 0;
  const cur = Math.floor(daysSince(sp.startedAt) / 7);
  for (let k = cur; k >= 0; k--) { if ((byWeek[k] || 0) >= 3) n++; else if (k !== cur) break; }
  return n;
}

// Week-3 cliff: flag risk early so the coach and PT both act before the user quits.
export function dropoutRisk(sp) {
  if (!sp) return { level: 'none' };
  const idle = daysSince(lastSessionAt(sp));
  const wk = weekOf(sp.sessions.length) + 1;
  const recentPain = sp.sessions.slice(-3).map(s => s.pain);
  const painUp = recentPain.length >= 2 && recentPain[recentPain.length - 1] > recentPain[0];
  if (idle >= 5) return { level: 'high', reason: `${idle} days since last session` };
  if (idle >= 3 && wk >= 2 && wk <= 4) return { level: 'high', reason: `Week ${wk} gap of ${idle} days. This is the drop-off window.` };
  if (painUp) return { level: 'medium', reason: 'Pain trending up over the last sessions' };
  if (idle >= 3) return { level: 'medium', reason: `${idle} days since last session` };
  return { level: 'low' };
}

// Progression engine. Runs after every logged session. Returns change notes that
// are applied immediately and land in the PT review queue.
export function progress(sp, log, painBaseline) {
  const plan = sessionPlan(sp, log.idx);
  const changes = [];
  const flare = log.pain >= 7 || log.pain >= painBaseline + 2;
  if (flare) {
    sp.easyStreak = 0;
    changes.push(...ease(sp, plan));
  } else if (log.effort === 'easy' && log.pain <= 3) {
    sp.easyStreak = (sp.easyStreak || 0) + 1;
    if (sp.easyStreak >= 2) {
      sp.easyStreak = 0;
      plan.items.forEach(({ base, id, ex }) => {
        if (ex.prog && EXERCISES[ex.prog]) {
          sp.mods[base] = { swap: ex.prog };
          changes.push({ type: 'progress', base, from: id, to: ex.prog });
        } else if (ex.reps || ex.secs || ex.mins) {
          const m = sp.mods[base] || {};
          if (ex.reps) m.reps = Math.min(8, (m.reps || 0) + 2);
          if (ex.secs) m.secs = Math.min(30, (m.secs || 0) + 10);
          if (ex.mins) m.mins = Math.min(15, (m.mins || 0) + 5);
          sp.mods[base] = m;
          changes.push({ type: 'add', base, from: id, to: id });
        }
      });
    }
  } else if (log.effort === 'hard' && log.pain >= 5) {
    sp.easyStreak = 0;
    plan.items.forEach(({ base, id, ex }) => {
      if (ex.sets > 1) { const m = sp.mods[base] || {}; m.sets = Math.max(-(ex.sets - 1), (m.sets || 0) - 1); sp.mods[base] = m; changes.push({ type: 'reduce', base, from: id, to: id }); }
    });
  } else {
    sp.easyStreak = log.effort === 'easy' ? (sp.easyStreak || 0) + 1 : 0;
  }
  const stamped = changes.map(c => ({ ...c, at: new Date().toISOString(), session: log.idx, flare, status: 'auto' }));
  sp.changes.push(...stamped);
  return { changes: stamped, flare };
}

// Ease a session: swap to the easier variant where one exists, otherwise cut volume.
export function ease(sp, plan = sessionPlan(sp)) {
  const changes = [];
  plan.items.forEach(({ base, id, ex }) => {
    if (ex.reg) {
      sp.mods[base] = { swap: ex.reg };
      changes.push({ type: 'regress', base, from: id, to: ex.reg });
    } else if (ex.reps || ex.secs || ex.mins) {
      const m = sp.mods[base] || {};
      if (ex.reps) m.reps = Math.max(-(ex.reps - 4), (m.reps || 0) - 2);
      if (ex.secs) m.secs = Math.max(-(ex.secs - 10), (m.secs || 0) - 10);
      if (ex.mins) m.mins = Math.max(-(ex.mins - 10), (m.mins || 0) - 5);
      sp.mods[base] = m;
      changes.push({ type: 'reduce', base, from: id, to: id });
    }
  });
  return changes;
}

// Body Score scale: 300 to 850, like a credit score.
export function toScore(pct) { return Math.round(300 + Math.max(0, Math.min(100, pct)) * 5.5); }

export function scoreBand(score) {
  if (score >= 760) return { label: 'Tuned', tone: 'top' };
  if (score >= 680) return { label: 'Strong', tone: 'good' };
  if (score >= 600) return { label: 'Solid', tone: 'ok' };
  if (score >= 500) return { label: 'Needs work', tone: 'warn' };
  return { label: 'Check engine', tone: 'bad' };
}

export function points(s) {
  const sp = s.sprint;
  const sessions = sp ? sp.sessions.length : 0;
  const scores = s.scores;
  const gain = scores.length >= 2 ? Math.max(0, scores[scores.length - 1].total - scores[0].total) : 0;
  return sessions * 100 + streak(sp) * 150 + gain * 5 + scores.length * 50;
}

export function rescoreDue(s) {
  const sp = s.sprint;
  if (!sp) return false;
  const n = sp.sessions.length;
  const since = s.scores.filter(x => new Date(x.at) > new Date(sp.startedAt)).length;
  return RESCORE_AT.some((at, i) => n >= at && since < i + 1);
}
