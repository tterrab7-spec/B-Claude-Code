// Local-first state. Everything works offline in the browser; when the TUNED server
// is reachable the same records sync to it (see api.js).

const KEY = 'tuned.v1';

const blank = () => ({
  id: 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
  created: new Date().toISOString(),
  profile: null,          // { name, age, state, door, sprintId, painBaseline, goal, flags:[], cleared }
  scores: [],             // [{ at, total, parts:{mobility,stability,control,symmetry}, tests:{}, method }]
  sprint: null,           // { id, startedAt, sessions:[{at, idx, pain, effort, done:[], note}], mods:{}, easyStreak, changes:[] }
  pads: [],               // Quiet Mode bladder log [{date, count}]
  coach: [],              // [{role, text, at}]
  squad: null,            // { code, name }
  visits: [],             // video visit requests
  plan: 'free',           // free | member | sprint
  quiet: false,
  quietPin: '',
  ref: null,              // partner attribution code
  points: 0,
});

let state;
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch (e) { /* private mode or blocked storage */ }
  return blank();
}

export function get() { return state || (state = load()); }

export function save(mutator) {
  const s = get();
  if (mutator) mutator(s);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
  listeners.forEach(fn => fn(s));
  return s;
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function reset() {
  try { localStorage.removeItem(KEY); } catch (e) {}
  state = blank();
  listeners.forEach(fn => fn(state));
}

export function exportData() {
  return JSON.stringify(get(), null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !parsed.id) throw new Error('Not a TUNED export');
  state = { ...blank(), ...parsed };
  save();
}

// Small per-device preferences kept apart from health data.
export function pref(key, val) {
  try {
    if (val === undefined) return localStorage.getItem('tuned.pref.' + key);
    localStorage.setItem('tuned.pref.' + key, val);
  } catch (e) { return null; }
}
