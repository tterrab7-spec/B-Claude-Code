// music.mjs - composes and renders the DirtBid explainer score to public/audio/music.wav (61 s, stereo, 44.1 kHz).
//
// The piece is written directly against the scene timeline (tools/audio/timeline.json):
//   hook (C major, curious)  -> problem (A minor, unsettled) -> stakes (rising bass line, clock ticks, stutter + drop-out at 21.49)
//   -> turn (lift to D major, chord hit at 22.0) -> product (bouncy groove) -> partners (warmer, pizzicato + vibes)
//   -> cta (biggest) -> final D major chord at 57.0, decaying to silence by 60.5.
// The bar grid is anchored on two musical moments (the chord hit and the final cadence), which fixes the tempo at ~109.7 BPM.
// Everything is deterministic (seeded humanization) so re-renders are identical.
import fs from 'node:fs';
import path from 'node:path';
import * as D from './dsp.mjs';

const OUT = path.join(D.ROOT, 'public/audio/music.wav');
const TMP = path.join(D.CACHE_DIR, 'music-premaster.wav');
const timeline = JSON.parse(fs.readFileSync(path.join(D.ROOT, 'tools/audio/timeline.json'), 'utf8'));

// ------------------------------------------------------------------ grid / tuning
export const KEY_SHIFT = 0;           // semitones; transposes the whole score (0 = C major hook, D major second half)
const HIT = 22.0;                     // chord hit that opens the "turn" (bar 10, beat 1)
const FINAL = 57.0;                   // final cadence (bar 26, beat 1)
const BAR = (FINAL - HIT) / 16;       // 2.1875 s  -> 109.7 BPM
const BEAT = BAR / 4;
const BPM = 60 / BEAT;
const OFFSET = HIT - 10 * BAR;        // bar 0 starts at 0.125 s
const TOTAL = 61;
const GATE_AT = 21.49, GATE_OPEN = 21.70; // sudden drop-out at the scene transition
const LUFS_TARGET = -18, CEILING_DB = -1;

const swingFor = (bar) => (bar >= 12 ? 0.11 : bar <= 1 ? 0.06 : 0);
/** Seconds for (bar, beat); beat is 0-based and may be fractional. Off-beat eighths get the section swing. */
function T(bar, beat = 0) {
  let t = OFFSET + bar * BAR + beat * BEAT;
  const frac = beat - Math.floor(beat);
  if (Math.abs(frac - 0.5) < 1e-6) t += swingFor(bar) * BEAT / 2;
  return t;
}
const N = (name) => D.noteToMidi(name) + KEY_SHIFT;
const rnd = D.rng(2024);

// ------------------------------------------------------------------ instruments and buses
const inst = {};
const I = (name) => (inst[name] ??= new D.Instrument(name));
const BUSES = {
  guitar:   {inst: 'acoustic_guitar_nylon', gainDb: -5.5, room: 0.16, hall: 0.10, jitter: 0.006},
  bass:     {inst: 'acoustic_bass',         gainDb: -6.5, room: 0.00, hall: 0.00, jitter: 0.004},
  marimba:  {inst: 'marimba',               gainDb: -8.0, room: 0.18, hall: 0.30, jitter: 0.007},
  kalimba:  {inst: 'kalimba',               gainDb: -10.5, room: 0.15, hall: 0.30, jitter: 0.007},
  glock:    {inst: 'glockenspiel',          gainDb: -14.5, room: 0.10, hall: 0.50, jitter: 0.006},
  musicbox: {inst: 'music_box',             gainDb: -12.0, room: 0.12, hall: 0.45, jitter: 0.006},
  vibes:    {inst: 'vibraphone',            gainDb: -12.5, room: 0.10, hall: 0.55, jitter: 0.008},
  pizz:     {inst: 'pizzicato_strings',     gainDb: -10.0, room: 0.18, hall: 0.22, jitter: 0.006},
  woodblock:{inst: 'woodblock',             gainDb: -13.5, room: 0.20, hall: 0.08, jitter: 0.003},
  shaker:   {inst: null,                    gainDb: -17.0, room: 0.12, hall: 0.04, jitter: 0.003},
  kick:     {inst: null,                    gainDb: -8.0,  room: 0.04, hall: 0.00, jitter: 0.002},
};
for (const b of Object.values(BUSES)) { b.buf = D.makeBuffer(TOTAL, 2); b.events = []; }

let sectionVel = 1;
const velGain = (v) => Math.pow(D.clamp(v, 0, 1.2), 1.5);
/** Schedule a sampled note. t seconds, dur seconds (Infinity = ring), vel 0..1, pan -1..1. */
function note(bus, pitch, t, {dur = Infinity, vel = 0.6, pan = 0, release = 0.12, attack = 0.0015, rateMul = 1, rateEnd = null, humanize = true} = {}) {
  const b = BUSES[bus];
  const midi = typeof pitch === 'number' ? pitch + KEY_SHIFT : N(pitch);
  const tt = humanize ? t + rnd.gauss() * b.jitter : t;
  const v = D.clamp(vel * sectionVel * (humanize ? 1 + rnd.gauss() * 0.05 : 1), 0.02, 1.15);
  b.events.push({midi, t: Math.max(0, tt), dur, vel: v, pan, release, attack, rateMul: rateMul * (humanize ? 1 + rnd.gauss() * 0.0012 : 1), rateEnd});
}
/** Synth percussion is rendered straight into its bus. */
function kick(t, vel = 0.6) {
  const b = BUSES.kick; const tt = t + rnd.gauss() * b.jitter; const v = velGain(vel * sectionVel);
  const s = D.sine(0.32, 150, {f1: 47, sweep: 0.05});
  const env = D.expDecayEnv(D.length(s), 0.075); const a = D.secs(0.0015); for (let i = 0; i < a; i++) env[i] *= i / a;
  D.applyEnvelope(s, env);
  const click = D.whiteNoise(0.006, Math.floor(rnd() * 1e6)); D.lowpass(click, 2500); D.applyEnvelope(click, D.expDecayEnv(D.length(click), 0.0015));
  D.mixInto(s, click, {gain: 0.18});
  D.saturate(s, {drive: 1.6, mix: 0.6});
  D.mixInto(b.buf, s, {time: tt, gain: v * 0.9});
  b.events.push({t: tt, vel});
}
function shaker(t, vel = 0.45, {open = false} = {}) {
  const b = BUSES.shaker; const tt = t + rnd.gauss() * b.jitter; const v = velGain(vel * sectionVel);
  const len = open ? 0.14 : 0.075;
  const n = D.whiteNoise(len, Math.floor(rnd() * 1e6));
  D.highpass(n, 3400, {passes: 2}); D.lowpass(n, 9500);
  D.applyEnvelope(n, D.adsr(D.length(n), {attack: open ? 0.012 : 0.006, decay: open ? 0.06 : 0.03, sustain: 0.25, release: open ? 0.06 : 0.03}));
  D.mixInto(b.buf, n, {time: tt, gain: v, pan: -0.32 + rnd.gauss() * 0.03});
  b.events.push({t: tt, vel});
}
function wb(t, vel = 0.5, hi = true) {
  note('woodblock', 'C4', t, {dur: 0.05, vel, pan: 0.3, release: 0.05, rateMul: hi ? 1.0 : 0.82});
}

// ------------------------------------------------------------------ musical helpers
const V = { // guitar voicings (low -> high). Roles for fingerpicking: bass=0, alt=1, mid=2, hi=second from top, top=last
  C: ['C3', 'E3', 'G3', 'C4', 'E4'], Fmaj7: ['F3', 'A3', 'C4', 'E4'], 'G/B': ['B2', 'D3', 'G3', 'B3', 'D4'],
  Am: ['A2', 'E3', 'A3', 'C4', 'E4'], Dm: ['D3', 'A3', 'D4', 'F4', 'A4'], E7sus: ['E2', 'B2', 'D3', 'A3', 'B3', 'E4'], E7: ['E2', 'B2', 'D3', 'G#3', 'B3', 'E4'],
  'Am/E': ['E3', 'A3', 'C4', 'E4', 'A4'], Fmaj7hi: ['F3', 'A3', 'C4', 'E4', 'A4'], 'F#dim7': ['F#3', 'C4', 'Eb4', 'A4'], 'E/G#': ['G#3', 'B3', 'E4', 'G#4'], A7low: ['A2', 'E3', 'G3', 'C#4', 'E4'],
  D: ['D3', 'A3', 'D4', 'F#4'], Dbig: ['D3', 'A3', 'D4', 'F#4', 'A4', 'D5'], A: ['A2', 'E3', 'A3', 'C#4', 'E4'], Bm: ['B2', 'F#3', 'B3', 'D4', 'F#4'], G: ['G2', 'D3', 'G3', 'B3', 'D4'],
  'A/C#': ['C#3', 'E3', 'A3', 'C#4', 'E4'], A7: ['A2', 'E3', 'G3', 'C#4', 'E4'], Bm7: ['B2', 'F#3', 'A3', 'D4', 'F#4'], Gmaj7: ['G2', 'D3', 'F#3', 'B3', 'D4'],
  'D/F#': ['F#2', 'A2', 'D3', 'A3', 'D4', 'F#4'], Em7: ['E2', 'B2', 'D3', 'G3', 'B3', 'E4'], A7sus: ['A2', 'E3', 'G3', 'D4', 'E4'],
};
const roles = (v) => ({bass: 0, alt: 1, mid: v.length >= 5 ? 2 : 1, hi: v.length - 2, top: v.length - 1});
const gpan = (idx, len) => -0.12 + 0.24 * idx / Math.max(1, len - 1);

/** Fingerpick: steps = [[beat, [role...], vel, durBeats]]. */
function pick(bar, chord, steps, {vel = 1} = {}) {
  const v = V[chord], r = roles(v);
  for (const [beat, who, sv, db = 1.5] of steps) {
    for (const w of who) { const idx = typeof w === 'number' ? w : r[w]; note('guitar', v[idx], T(bar, beat), {dur: db * BEAT, vel: sv * vel, pan: gpan(idx, v.length), release: 0.14}); }
  }
}
/** Strum: down = low->high. spread seconds across strings, dur seconds (short = muted chop). */
function strum(t, chord, {vel = 0.6, up = false, spread = 0.02, dur = Infinity, release = 0.12} = {}) {
  const v = V[chord]; const n = v.length;
  const off = rnd.gauss() * BUSES.guitar.jitter, vmul = 1 + rnd.gauss() * 0.05;
  for (let k = 0; k < n; k++) {
    const idx = up ? n - 1 - k : k;
    const tt = t + off + (spread * k) / (n - 1) * (0.9 + 0.2 * rnd());
    note('guitar', v[idx], tt, {dur, vel: vel * vmul * (up ? 0.85 - 0.1 * (k / n) : 0.92 + 0.08 * (k / n)), pan: gpan(idx, n), release, humanize: false});
  }
}
/** Melody: steps = [[beat, pitch, durBeats, vel]]. Pan by pitch for mallets (low left, high right). */
function mel(bus, bar, steps, {vel = 1, pan = null, spreadPan = 0.45, release = 0.15, ring = false} = {}) {
  for (const [beat, p, db, sv = 0.6] of steps) {
    if (p == null) continue;
    const midi = N(p);
    const pp = pan != null ? pan : D.clamp(((midi - 72) / 24) * spreadPan, -spreadPan, spreadPan);
    note(bus, p, T(bar, beat), {dur: ring ? Infinity : db * BEAT, vel: sv * vel, pan: pp, release});
  }
}
/** Rolled chord for mallets/vibes: pitches low->high, spread seconds. */
function roll(bus, t, pitches, {vel = 0.5, spread = 0.015, dur = Infinity, pans = null, release = 0.3} = {}) {
  pitches.forEach((p, k) => note(bus, p, t + (spread * k) / Math.max(1, pitches.length - 1), {dur, vel, pan: pans ? pans[k] : -0.3 + 0.6 * k / Math.max(1, pitches.length - 1), release}));
}
function bassNote(p, t, durBeats, vel = 0.6) { note('bass', p, t, {dur: durBeats * BEAT, vel, pan: 0, release: 0.1}); }
/** Vibraphone pad: chord tones spread across the stereo field, long. */
function pad(t, pitches, vel = 0.4, dur = 2.2) { roll('vibes', t, pitches, {vel, spread: 0.03, dur, pans: pitches.map((_, k) => -0.55 + 1.1 * k / Math.max(1, pitches.length - 1)), release: 0.6}); }
function sparkle(t, pitches, vel = 0.6, gap = 0.04) { pitches.forEach((p, k) => note('glock', p, t + k * gap, {vel: vel * (0.9 + 0.1 * k), pan: -0.4 + 0.8 * k / (pitches.length - 1), release: 0.5})); }

// fingerpicking patterns (product/partners), see roles()
const P1 = [[0, ['bass', 'top'], 0.6], [0.5, ['mid'], 0.42], [1, ['alt'], 0.5], [1.5, ['hi'], 0.45], [2, ['bass', 'top'], 0.58], [2.5, ['mid'], 0.42], [3, ['alt'], 0.5], [3.5, ['hi'], 0.45]];
const P2 = [[0, ['bass', 'top'], 0.6], [0.5, ['mid'], 0.42], [1, ['alt', 'hi'], 0.5], [2.5, ['mid'], 0.42], [3, ['alt'], 0.48], [3.5, ['top'], 0.45]];
const P3 = [[0, ['bass', 'top'], 0.6], [1, ['alt'], 0.48], [1.5, ['hi', 'top'], 0.5], [2.5, ['bass'], 0.5], [3, ['mid'], 0.42], [3.5, ['top'], 0.46]];
const HALF = [[0, ['bass', 'top'], 0.6], [0.5, ['mid'], 0.42], [1, ['alt'], 0.5], [1.5, ['hi'], 0.45]];
const shift = (steps, by) => steps.map(([b, ...r]) => [b + by, ...r]);
function strumBar(bar, chord, {vel = 0.6} = {}) { // P4: strummed bar
  strum(T(bar, 0), chord, {vel, dur: 0.9 * BEAT});
  strum(T(bar, 1), chord, {vel: vel * 0.7, up: true, dur: 0.3});
  strum(T(bar, 1.5), chord, {vel: vel * 0.85, dur: 0.45 * BEAT});
  pick(bar, chord, [[2, ['bass'], 0.55, 0.5]]);
  strum(T(bar, 2.5), chord, {vel: vel * 0.9, dur: 0.9 * BEAT});
  strum(T(bar, 3.5), chord, {vel: vel * 0.7, up: true, dur: 0.35});
}
function shakerBar(bar, {vel = 0.45, div = 2, fillFrom = null, fillVel = 0.5} = {}) {
  for (let b = 0; b < 4; b += 1 / div) {
    if (fillFrom != null && b >= fillFrom) break;
    const on = Math.abs(b - Math.round(b)) < 1e-6;
    shaker(T(bar, b), on ? vel : vel * 0.78, {open: on && (b === 0 || b === 2) && div === 2 ? false : false});
  }
  if (fillFrom != null) for (let b = fillFrom; b < 4; b += 0.25) shaker(T(bar, b), fillVel * (0.8 + 0.2 * (b - fillFrom) / (4 - fillFrom)) * (Math.abs(b - Math.round(b)) < 1e-6 ? 1 : 0.82));
}

// ================================================================== THE SCORE
const arrangement = []; // [bar, section, text] for the summary
const mark = (bar, section, text) => arrangement.push({bar, section, text});

// ---------------- HOOK (bars 0-1, C major): curious and light
sectionVel = 0.85;
mark(0, 'hook', 'music box question motif (E5 G5 C6 .. B5 D6?), guitar pinch, soft bass C2');
mel('musicbox', 0, [[0, 'E5', 0.5, 0.6], [0.5, 'G5', 0.5, 0.6], [1, 'C6', 1.5, 0.75], [2.5, 'B5', 0.5, 0.5], [3, 'D6', 1, 0.7]], {pan: 0.2, ring: true});
mel('glock', 0, [[1, 'C6', 1.5, 0.32], [3, 'D6', 1, 0.38]], {ring: true});
pick(0, 'C', [[0, [0, 4], 0.55, 3], [2, [2], 0.42, 1], [2.5, [3], 0.42, 1.5]]);
bassNote('C2', T(0, 0), 3.6, 0.5);
mark(1, 'hook', 'guitar Fmaj7 -> G/B arpeggio, kalimba answer (A5 G5 E5), bass F2 G2, clock tick pickup');
pick(1, 'Fmaj7', [[0, [0], 0.5, 2], [0.5, [1], 0.45, 1.5], [1, [2], 0.45, 1], [1.5, [3], 0.5, 1]]);
pick(1, 'G/B', [[2.5, [0, 4], 0.5, 1.5], [3, [2], 0.42, 1]]);
mel('kalimba', 1, [[2, 'A5', 0.5, 0.5], [2.5, 'G5', 0.5, 0.45], [3, 'E5', 1, 0.5]], {pan: -0.4});
bassNote('F2', T(1, 0), 1.9, 0.5); bassNote('G2', T(1, 2), 1.8, 0.5);
wb(T(1, 3.5), 0.3, false);

// ---------------- PROBLEM (bars 2-5, A minor): a little unsettled, sparse, held tension
sectionVel = 0.8;
mark(2, 'problem', 'Am: sparse fingerpicking, bass A2 whole note, marimba E4 C4 sigh');
pick(2, 'Am', [[0, [0], 0.55, 3], [1, [2], 0.4, 1], [1.5, [3], 0.42, 1], [2.5, [4], 0.45, 1.5], [3, [1], 0.38, 1]]);
bassNote('A2', T(2, 0), 3.6, 0.55);
mel('marimba', 2, [[2, 'E4', 1, 0.45], [3, 'C4', 1, 0.4]]);
mark(3, 'problem', 'Fmaj7: guitar pinch, clock ticks on 2 and 4, low pizz A2, marimba A3');
pick(3, 'Fmaj7', [[0, [0, 3], 0.5, 2], [1.5, [1], 0.4, 1], [2, [2], 0.42, 1], [3, [3], 0.4, 1]]);
bassNote('F2', T(3, 0), 3.6, 0.55);
wb(T(3, 1), 0.35); wb(T(3, 3), 0.32, false);
note('pizz', 'A2', T(3, 3.5), {dur: 0.5, vel: 0.42, pan: -0.25});
mel('marimba', 3, [[2.5, 'A3', 1, 0.4]]);
mark(4, 'problem', 'Dm: guitar, vibraphone held A3+E4, clock ticks, marimba F4 E4 D4 falling');
pick(4, 'Dm', [[0, [0], 0.55, 2], [0.5, [1], 0.4, 1], [1, [2], 0.42, 1], [2, [3], 0.45, 1.5], [3.5, [2], 0.4, 1]]);
bassNote('D2', T(4, 0), 3.6, 0.55);
pad(T(4, 0), ['A3', 'E4'], 0.34, 2.0);
wb(T(4, 1), 0.35); wb(T(4, 3), 0.32, false);
mel('marimba', 4, [[1.5, 'F4', 1, 0.45], [2.5, 'E4', 0.5, 0.45], [3, 'D4', 1, 0.42]]);
mark(5, 'problem', 'E7sus -> E7: bass E2, vibraphone G#3+D4 tritone, marimba E3 tremolo swell, ticks');
pick(5, 'E7sus', [[0, [0, 1], 0.55, 2], [1, [3], 0.42, 1]]);
pick(5, 'E7', [[2, [0, 3], 0.55, 1.5], [3, [4], 0.4, 1], [3.5, [5], 0.42, 0.5]]);
bassNote('E2', T(5, 0), 1.9, 0.6); bassNote('E2', T(5, 2), 1.4, 0.5); bassNote('E2', T(5, 3.5), 0.45, 0.45);
pad(T(5, 2), ['G#3', 'D4'], 0.34, 1.6);
wb(T(5, 1), 0.38); wb(T(5, 3), 0.38, false); wb(T(5, 3.5), 0.3);
for (let i = 0; i < 8; i++) note('marimba', 'E3', T(5, 2 + i * 0.25), {dur: 0.12, vel: 0.22 + 0.04 * i, pan: -0.2, release: 0.08});
note('pizz', 'E3', T(5, 1.5), {dur: 0.5, vel: 0.4, pan: -0.25});

// ---------------- STAKES (bars 6-9, A minor -> A7): tension builds, rising bass line, clock accelerates, stutter and drop-out
const stakes = [ // [bar, beat, chord, bassNote, marimbaArp, pizz]
  [6, 0, 'Am', 'A2', ['A4', 'C5', 'E5']], [6, 2, 'G/B', 'B2', ['B4', 'D5', 'G5']],
  [7, 0, 'C', 'C3', ['C5', 'E5', 'G5']], [7, 2, 'Dm', 'D3', ['D5', 'F5', 'A5']],
  [8, 0, 'Am/E', 'E3', ['E5', 'A5', 'C6']], [8, 2, 'Fmaj7hi', 'F3', ['F5', 'A5', 'C6']],
  [9, 0, 'F#dim7', 'F#3', ['F#5', 'A5', 'C6', 'Eb6']], [9, 1, 'E/G#', 'G#3', ['G#5', 'B5', 'E6']],
];
mark(6, 'stakes', 'Am -> G/B: bass A2 B2 half notes, guitar low arpeggios, marimba rising arps, pizz on changes, clock ticks quarters, kick on 1');
mark(7, 'stakes', 'C -> Dm: same, rising (bass C3 D3), ticks + kick on 1 and 3');
mark(8, 'stakes', 'Am/E -> Fmaj7: guitar 8th-note chops, bass quarters E3 F3, shaker enters, ticks 8ths, vibraphone E4+B4');
mark(9, 'stakes', 'F#dim7 -> E/G#: chromatic bass F#3 G#3, then A7 STUTTER (16ths, all hands) beats 3-4, hard DROP-OUT at 21.49, glock pickup A5 C#6');
stakes.forEach(([bar, beat, chord, bn, arp], k) => {
  const prog = k / (stakes.length - 1);
  sectionVel = 0.8 + 0.22 * prog;
  const v = V[chord];
  if (bar <= 7) { // arpeggiated
    [0, 0.5, 1, 1.5].forEach((b, i) => note('guitar', v[Math.min(i, v.length - 1)], T(bar, beat + b), {dur: 1.6 * BEAT, vel: 0.5 + 0.05 * i, pan: gpan(i, v.length), release: 0.14}));
    bassNote(bn, T(bar, beat), 1.9, 0.6);
  } else if (bar === 8) { // chopped 8ths
    [0, 0.5, 1, 1.5].forEach((b, i) => strum(T(bar, beat + b), chord, {vel: 0.55 + (i % 2 ? -0.08 : 0.05), up: i % 2 === 1, spread: 0.012, dur: 0.22}));
    bassNote(bn, T(bar, beat), 0.9, 0.62); bassNote(bn, T(bar, beat + 1), 0.9, 0.58);
  } else { // bar 9: one beat each
    strum(T(bar, beat), chord, {vel: 0.68, spread: 0.012, dur: 0.22}); strum(T(bar, beat + 0.5), chord, {vel: 0.6, up: true, spread: 0.012, dur: 0.2});
    bassNote(bn, T(bar, beat), 0.45, 0.68); bassNote(bn, T(bar, beat + 0.5), 0.45, 0.62);
  }
  const step = bar === 9 ? 0.25 : 0.5;
  arp.forEach((p, i) => note('marimba', p, T(bar, beat + i * step), {dur: (i === arp.length - 1 ? 1.5 : 0.6) * BEAT, vel: 0.45 + 0.28 * prog + 0.03 * i, pan: -0.25 + 0.5 * i / 3, release: 0.15}));
  note('pizz', bn, T(bar, beat), {dur: 0.4, vel: 0.5 + 0.2 * prog, pan: -0.25});
});
// percussion across the stakes
sectionVel = 0.85;
[0, 1, 2, 3].forEach((b) => wb(T(6, b), 0.4, b % 2 === 0));
[0, 1, 2, 3, 3.5].forEach((b) => wb(T(7, b), 0.44, Math.floor(b) % 2 === 0));
for (let b = 0; b < 4; b += 0.5) wb(T(8, b), 0.46, Math.floor(b) % 2 === 0);
for (let b = 0; b < 2; b += 0.5) wb(T(9, b), 0.52, Math.floor(b) % 2 === 0);
kick(T(6, 0), 0.5); kick(T(7, 0), 0.52); kick(T(7, 2), 0.5);
[0, 1, 2, 3].forEach((b) => kick(T(8, b), 0.52 + 0.02 * b));
[0, 0.5, 1, 1.5].forEach((b) => kick(T(9, b), 0.6 + 0.03 * b));
shakerBar(8, {vel: 0.38});
for (let b = 0; b < 2; b += 0.25) shaker(T(9, b), 0.45);
pad(T(8, 0), ['E4', 'B4'], 0.34, 2.0);
pad(T(9, 0), ['F#4', 'C5'], 0.4, 1.0);
mel('glock', 8, [[0, 'A5', 1, 0.35], [2, 'C6', 1, 0.4]], {ring: true});
mel('glock', 9, [[0, 'Eb6', 1, 0.45]], {ring: true});
// the stutter on A7 (beats 3-4 of bar 9), staccato 16ths, then the drop-out
sectionVel = 1.05;
[2, 2.25, 2.5, 2.75, 3].forEach((b, i) => {
  strum(T(9, b), 'A7low', {vel: 0.72 + 0.03 * i, spread: 0.008, dur: 0.07, release: 0.05});
  bassNote('A2', T(9, b), 0.14, 0.75 + 0.03 * i);
  roll('marimba', T(9, b), ['A4', 'C#5', 'E5'], {vel: 0.7 + 0.03 * i, spread: 0.004, dur: 0.07, release: 0.05});
  note('pizz', 'A2', T(9, b), {dur: 0.08, vel: 0.7, pan: -0.25, release: 0.05});
  kick(T(9, b), 0.68 + 0.03 * i); wb(T(9, b), 0.6, i % 2 === 0); shaker(T(9, b), 0.5);
});
// pickup into the lift (after the silence)
sectionVel = 1;
note('glock', 'A5', T(9, 3.5), {vel: 0.42, pan: 0.25, release: 0.4});
note('glock', 'C#6', T(9, 3.75), {vel: 0.5, pan: 0.3, release: 0.4});

// ---------------- TURN (bars 10-11, D major): the lift. Chord hit at 22.0 with glockenspiel sparkle
sectionVel = 1.0;
mark(10, 'turn', 'D MAJOR HIT at 22.0: big guitar strum, bass D2, vibraphone D4 F#4 A4, glock sparkle D6 F#6 A6 D7, kick; kalimba answer F#5 A5 B5 A5');
strum(T(10, 0), 'Dbig', {vel: 0.85, spread: 0.024});
bassNote('D2', T(10, 0), 3.7, 0.8);
pad(T(10, 0), ['D4', 'F#4', 'A4'], 0.5, 3.0);
sparkle(T(10, 0) + 0.005, ['D6', 'F#6', 'A6', 'D7'], 0.62, 0.042);
roll('marimba', T(10, 0), ['D4', 'F#4', 'A4', 'D5'], {vel: 0.55, spread: 0.012, dur: 1.8});
kick(T(10, 0), 0.62); wb(T(10, 0), 0.5); shaker(T(10, 0), 0.42, {open: true});
mel('kalimba', 10, [[2, 'F#5', 0.5, 0.5], [2.5, 'A5', 0.5, 0.5], [3, 'B5', 0.5, 0.55], [3.5, 'A5', 1, 0.45]], {pan: -0.4});
pick(10, 'D', [[2, ['bass', 'top'], 0.45, 1.5], [3, ['alt'], 0.4, 1]]);
mark(11, 'turn', 'G -> A: strums, bass G2 A2 + walk-up A2 B2 C#3, drum fill from 25.3 (kick/woodblock/shaker), marimba pickup A4 B4 C#5');
strum(T(11, 0), 'G', {vel: 0.6, spread: 0.02, dur: 1.9 * BEAT});
bassNote('G2', T(11, 0), 1.9, 0.6);
strum(T(11, 2), 'A', {vel: 0.65, spread: 0.02, dur: 1.4 * BEAT});
bassNote('A2', T(11, 2), 0.9, 0.65); bassNote('A2', T(11, 3), 0.45, 0.6); bassNote('B2', T(11, 3.5), 0.22, 0.65); bassNote('C#3', T(11, 3.75), 0.22, 0.7);
note('glock', 'A5', T(11, 2), {vel: 0.35, pan: 0.25, release: 0.4});
kick(T(11, 0), 0.5); kick(T(11, 2), 0.52); kick(T(11, 3), 0.55); kick(T(11, 3.5), 0.62);
[2.5, 3, 3.25, 3.5, 3.75].forEach((b, i) => wb(T(11, b), 0.4 + 0.06 * i, i % 2 === 0));
for (let b = 2.5; b < 4; b += 0.25) shaker(T(11, b), 0.35 + 0.18 * (b - 2.5) / 1.5);
mel('marimba', 11, [[3, 'A4', 0.5, 0.5], [3.5, 'B4', 0.25, 0.55], [3.75, 'C#5', 0.25, 0.6]]);
mel('kalimba', 11, [[0, 'B5', 1, 0.42], [1, 'G5', 1, 0.4]], {pan: -0.4});

// ---------------- PRODUCT (bars 12-18, D major): bouncy driving groove, full arrangement
sectionVel = 0.95;
const productChords = {12: 'D', 13: 'A', 14: 'Bm', 15: 'G', 16: 'D', 17: 'A/C#'};
const gPatterns = {12: P1, 13: P2, 14: P1, 15: P3, 16: null, 17: P1};
const bassLines = { // [beat, note, durBeats, vel]
  12: [[0, 'D2', 1.4, 0.62], [1.5, 'D2', 0.45, 0.5], [2, 'A2', 1.0, 0.58], [3.5, 'G#2', 0.45, 0.55]],
  13: [[0, 'A2', 0.9, 0.62], [1, 'A3', 0.45, 0.5], [2, 'E2', 0.9, 0.58], [2.5, 'A2', 0.45, 0.5], [3.5, 'A#2', 0.45, 0.55]],
  14: [[0, 'B2', 1.4, 0.62], [1.5, 'B2', 0.45, 0.5], [2, 'F#2', 1.0, 0.58], [3.5, 'F#2', 0.45, 0.55]],
  15: [[0, 'G2', 1.4, 0.62], [1.5, 'G2', 0.45, 0.5], [2, 'D3', 0.9, 0.56], [3, 'B2', 0.45, 0.5], [3.5, 'C#3', 0.45, 0.55]],
  16: [[0, 'D2', 0.9, 0.64], [1, 'D3', 0.45, 0.5], [2, 'A2', 0.9, 0.58], [2.5, 'D2', 0.45, 0.5], [3.5, 'C#3', 0.45, 0.55]],
  17: [[0, 'C#3', 1.4, 0.62], [1.5, 'C#3', 0.45, 0.5], [2, 'A2', 1.0, 0.58], [3, 'B2', 0.45, 0.5], [3.5, 'A2', 0.45, 0.55]],
  18: [[0, 'G2', 1.4, 0.62], [1.5, 'G2', 0.45, 0.5], [2, 'A2', 0.9, 0.62], [3, 'A2', 0.45, 0.58], [3.5, 'A2', 0.45, 0.62]],
};
const theme = { // marimba melody, [beat, pitch, durBeats, vel]
  12: [[0, 'D5', 1, 0.62], [1, 'F#5', 0.5, 0.58], [1.5, 'A5', 1, 0.62], [2.5, 'B5', 0.5, 0.58], [3, 'A5', 1, 0.6]],
  13: [[0, 'G5', 0.5, 0.58], [0.5, 'E5', 0.5, 0.55], [1, 'C#5', 1, 0.58], [2, 'E5', 0.5, 0.55], [2.5, 'F#5', 0.5, 0.55], [3, 'E5', 1, 0.58]],
  14: [[0, 'D5', 0.5, 0.6], [0.5, 'F#5', 0.5, 0.58], [1, 'B5', 1.5, 0.64], [2.5, 'A5', 0.5, 0.56], [3, 'F#5', 1, 0.58]],
  15: [[0, 'G5', 1, 0.6], [1, 'B5', 0.5, 0.58], [1.5, 'A5', 0.5, 0.55], [2, 'G5', 1, 0.56]],
  16: [[0, 'D5', 1, 0.64], [1, 'F#5', 0.5, 0.6], [1.5, 'A5', 1, 0.64], [2.5, 'D6', 0.5, 0.62], [3, 'A5', 1, 0.6]],
  17: [[0, 'C#5', 0.5, 0.6], [0.5, 'E5', 0.5, 0.58], [1, 'A5', 1, 0.62], [2.5, 'G5', 0.5, 0.56], [3, 'E5', 1, 0.58]],
  18: [[0, 'G5', 0.5, 0.6], [0.5, 'B5', 0.5, 0.6], [1, 'D6', 1, 0.64], [2.5, 'C#6', 0.5, 0.58], [3, 'E6', 1, 0.6]],
};
const productText = {
  12: 'D: groove starts - Travis-picked guitar (P1), bouncy bass D2/A2, kick 1+3, shaker 8ths, woodblock 2+4, marimba theme "D F# A B A"',
  13: 'A: guitar P2 (strum on 3), bass A2/E2 with octave, kick pickup on 4&, shaker 16th fill, marimba theme answer, kalimba fill',
  14: 'Bm: guitar P1, extra woodblock on 3&, marimba theme (B5 peak)',
  15: 'G: guitar P3 (syncopated, rests), marimba rests 2nd half, kalimba turn B4 A4 G4, shaker fill',
  16: 'D: strummed bar (P4), bass with octave, glock doubles marimba peaks, pizz on 1',
  17: 'A/C#: guitar P1, bass C#3, marimba + glock',
  18: 'G -> A7: guitar half patterns, bass G2 A2, drum fill, marimba lick G5 B5 D6 C#6 E6, vibraphone C#4 G4 pad enters (partners crossfade)',
};
for (let bar = 12; bar <= 18; bar++) {
  mark(bar, 'product', productText[bar]);
  const chord = productChords[bar];
  if (bar === 18) { pick(18, 'G', HALF); pick(18, 'A7', shift(HALF, 2)); }
  else if (gPatterns[bar]) pick(bar, chord, gPatterns[bar]);
  else strumBar(bar, chord, {vel: 0.62});
  for (const [b, p, db, v] of bassLines[bar]) bassNote(p, T(bar, b), db, v);
  mel('marimba', bar, theme[bar]);
  if (bar >= 16) mel('glock', bar, theme[bar].filter((s) => s[2] >= 1).map((s) => [s[0], s[1], s[2], 0.34]), {ring: true});
  // drums
  kick(T(bar, 0), 0.58); kick(T(bar, 2), 0.55);
  if (bar >= 16) kick(T(bar, 1.5), 0.45);
  if (bar === 13 || bar === 15 || bar === 18) kick(T(bar, 3.5), 0.5);
  const fill = (bar === 13 || bar === 15) ? 3 : bar === 18 ? 2 : null;
  shakerBar(bar, {vel: 0.45, fillFrom: fill, fillVel: 0.48});
  wb(T(bar, 1), 0.5); wb(T(bar, 3), 0.5);
  if (bar === 14 || bar === 16) wb(T(bar, 2.5), 0.38, false);
  if (bar === 18) [3, 3.25, 3.5, 3.75].forEach((b, i) => wb(T(bar, b), 0.5 + 0.07 * i, i % 2 === 0));
}
mel('kalimba', 13, [[3.5, 'C#5', 0.5, 0.45]], {pan: -0.4});
mel('kalimba', 15, [[2.5, 'B4', 0.5, 0.48], [3, 'A4', 0.5, 0.46], [3.5, 'G4', 0.5, 0.44]], {pan: -0.4});
mel('kalimba', 16, [[3.5, 'F#5', 0.5, 0.42]], {pan: -0.4});
note('pizz', 'D3', T(16, 0), {dur: 0.4, vel: 0.5, pan: -0.25});
pad(T(18, 2), ['C#4', 'G4'], 0.36, 1.2);

// ---------------- PARTNERS (bars 19-22, D major): fuller and warmer, pizzicato + vibraphone pads
sectionVel = 0.95;
const partnersText = {
  19: 'Bm7: vibraphone pad F#4 A4 D5, pizz offbeats, guitar P2, bass B2/F#2, marimba warm variation, glock sparkle on the change',
  20: 'Gmaj7: vibraphone G4 B4 D5, pizz offbeats, guitar P1, bass G2/D3, kalimba pickup',
  21: 'D/F# -> Em7: guitar half patterns, bass F#2 E2 walk, vibraphone pads, pizz countermelody G3 B3, woodblock 3&',
  22: 'A7sus -> A7: strums, driving bass A2, pads E4 G4 A4 -> C#4 E4 G4, kalimba rising fill A4 B4 C#5 E5, shaker fill into CTA',
};
for (let bar = 19; bar <= 22; bar++) mark(bar, 'partners', partnersText[bar]);
pick(19, 'Bm7', P2); pick(20, 'Gmaj7', P1); pick(21, 'D/F#', HALF); pick(21, 'Em7', shift(HALF, 2));
strum(T(22, 0), 'A7sus', {vel: 0.55, dur: 1.4 * BEAT}); strum(T(22, 1.5), 'A7sus', {vel: 0.5, dur: 0.45 * BEAT});
strum(T(22, 2), 'A7', {vel: 0.6, dur: 0.9 * BEAT}); strum(T(22, 3), 'A7', {vel: 0.5, up: true, dur: 0.3}); strum(T(22, 3.5), 'A7', {vel: 0.55, dur: 0.25});
const pBass = {
  19: [[0, 'B2', 1.4, 0.62], [1.5, 'B2', 0.45, 0.5], [2, 'F#2', 1.0, 0.58], [3.5, 'A2', 0.45, 0.55]],
  20: [[0, 'G2', 1.4, 0.62], [1.5, 'G2', 0.45, 0.5], [2, 'D3', 0.9, 0.56], [3, 'D2', 0.45, 0.5], [3.5, 'E2', 0.45, 0.55]],
  21: [[0, 'F#2', 1.4, 0.62], [1.5, 'A2', 0.45, 0.5], [2, 'E2', 0.9, 0.6], [3, 'G2', 0.45, 0.5], [3.5, 'G#2', 0.45, 0.55]],
  22: [[0, 'A2', 1.4, 0.64], [1.5, 'A2', 0.45, 0.52], [2, 'E2', 0.9, 0.6], [3, 'A2', 0.45, 0.58], [3.5, 'A2', 0.45, 0.62]],
};
for (const bar of [19, 20, 21, 22]) for (const [b, p, db, v] of pBass[bar]) bassNote(p, T(bar, b), db, v);
pad(T(19, 0), ['F#4', 'A4', 'D5'], 0.4); pad(T(20, 0), ['G4', 'B4', 'D5'], 0.4);
pad(T(21, 0), ['F#4', 'A4', 'D5'], 0.38, 1.0); pad(T(21, 2), ['E4', 'G4', 'B4'], 0.38, 1.0);
pad(T(22, 0), ['E4', 'G4', 'A4'], 0.4, 1.0); pad(T(22, 2), ['C#4', 'E4', 'G4'], 0.42, 1.0);
const pizzOff = {19: ['F#3', 'D4'], 20: ['B3', 'D4'], 21: ['A3', 'G3'], 22: ['E4', 'C#4']};
for (const bar of [19, 20, 21, 22]) { note('pizz', pizzOff[bar][0], T(bar, 1.5), {dur: 0.4, vel: 0.5, pan: -0.25}); note('pizz', pizzOff[bar][1], T(bar, 3.5), {dur: 0.4, vel: 0.5, pan: -0.25}); }
mel('pizz', 21, [[2.5, 'G3', 0.5, 0.48], [3, 'B3', 0.5, 0.5]], {pan: -0.25, release: 0.1});
mel('pizz', 22, [[0.5, 'A3', 0.5, 0.48], [1, 'G3', 0.5, 0.46]], {pan: -0.25, release: 0.1});
const themeB = {
  19: [[0, 'F#5', 1, 0.6], [1, 'D5', 0.5, 0.55], [1.5, 'E5', 0.5, 0.55], [2, 'F#5', 1.5, 0.6]],
  20: [[0, 'G5', 0.5, 0.58], [0.5, 'A5', 0.5, 0.56], [1, 'B5', 1, 0.62], [2.5, 'D5', 0.5, 0.52], [3, 'E5', 0.5, 0.54], [3.5, 'F#5', 0.5, 0.56]],
  21: [[0, 'A5', 1, 0.62], [1, 'F#5', 0.5, 0.56], [1.5, 'D5', 0.5, 0.54], [2, 'E5', 1, 0.58], [3, 'G5', 0.5, 0.56], [3.5, 'F#5', 0.5, 0.55]],
  22: [[0, 'E5', 1.5, 0.6], [2, 'C#5', 0.5, 0.56], [2.5, 'D5', 0.5, 0.56], [3, 'E5', 0.5, 0.58], [3.5, 'G5', 0.5, 0.6]],
};
for (const bar of [19, 20, 21, 22]) { mel('marimba', bar, themeB[bar]); mel('glock', bar, [[0, themeB[bar][0][1].replace(/\d/, (d) => +d + 1), 1, 0.3]], {ring: true}); }
sparkle(T(19, 0), ['B5', 'D6', 'F#6'], 0.4, 0.05);
mel('kalimba', 20, [[3.5, 'D5', 0.5, 0.42]], {pan: -0.4});
mel('kalimba', 22, [[2.5, 'A4', 0.5, 0.46], [3, 'B4', 0.5, 0.48], [3.25, 'C#5', 0.25, 0.5], [3.5, 'E5', 0.5, 0.54]], {pan: -0.4});
for (const bar of [19, 20, 21, 22]) {
  kick(T(bar, 0), 0.58); kick(T(bar, 2), 0.55);
  if (bar === 20 || bar === 22) kick(T(bar, 3.5), 0.5);
  shakerBar(bar, {vel: 0.45, fillFrom: bar === 22 ? 2 : null, fillVel: 0.52});
  wb(T(bar, 1), 0.5); wb(T(bar, 3), 0.5);
  if (bar === 21) wb(T(bar, 2.5), 0.38, false);
}
[3, 3.25, 3.5, 3.75].forEach((b, i) => wb(T(22, b), 0.52 + 0.07 * i, i % 2 === 0));

// ---------------- CTA (bars 23-25, D major): biggest, cheerful; final cadence lands at 57.0 (bar 26)
sectionVel = 1.05;
mark(23, 'cta', 'D: tutti - strummed guitar (P4), bass D2/A2, kick 1 2& 3 4&, shaker 16ths, marimba theme + glock doubling, pizz offbeats, vibraphone D4 F#4 A4');
mark(24, 'cta', 'Bm7 -> G: strums, bass B2 / G2, pads B3 D4 F#4 -> G3 B3 D4, marimba theme answer + glock');
mark(25, 'cta', 'A7sus -> A7: driving 8th-note bass A2, strums, drum fill (kick/woodblock/shaker), marimba + glock rising run A..A6');
mark(26, 'cta', 'FINAL D MAJOR at 57.0: big strum D3-D5, bass D2, marimba + vibraphone D4 F#4 A4 D5, glock sparkle D6 F#6 A6 D7 (+ A6 D7 twinkle), kick/woodblock hit; rings out, silence by 60.5');
strumBar(23, 'D', {vel: 0.7});
strum(T(24, 0), 'Bm7', {vel: 0.68, dur: 0.9 * BEAT}); strum(T(24, 1), 'Bm7', {vel: 0.5, up: true, dur: 0.3}); strum(T(24, 1.5), 'Bm7', {vel: 0.6, dur: 0.45 * BEAT});
strum(T(24, 2), 'G', {vel: 0.7, dur: 0.9 * BEAT}); strum(T(24, 3), 'G', {vel: 0.5, up: true, dur: 0.3}); strum(T(24, 3.5), 'G', {vel: 0.6, dur: 0.45 * BEAT});
strum(T(25, 0), 'A7sus', {vel: 0.7, dur: 0.9 * BEAT}); strum(T(25, 1), 'A7sus', {vel: 0.55, up: true, dur: 0.3}); strum(T(25, 1.5), 'A7sus', {vel: 0.62, dur: 0.45 * BEAT});
strum(T(25, 2), 'A7', {vel: 0.72, dur: 0.45 * BEAT}); strum(T(25, 2.5), 'A7', {vel: 0.62, up: true, dur: 0.22}); strum(T(25, 3), 'A7', {vel: 0.75, dur: 0.45 * BEAT}); strum(T(25, 3.5), 'A7', {vel: 0.62, dur: 0.18});
const ctaBass = {
  23: [[0, 'D2', 1.4, 0.66], [1.5, 'D2', 0.45, 0.54], [2, 'A2', 1.0, 0.6], [3.5, 'B2', 0.45, 0.58]],
  24: [[0, 'B2', 1.4, 0.66], [1.5, 'B2', 0.45, 0.54], [2, 'G2', 1.4, 0.64], [3.5, 'G2', 0.45, 0.56]],
  25: [[0, 'A2', 1.4, 0.68], [1.5, 'A2', 0.45, 0.56], [2, 'A2', 0.45, 0.64], [2.5, 'A2', 0.45, 0.6], [3, 'A2', 0.45, 0.68], [3.5, 'A2', 0.45, 0.66]],
};
for (const bar of [23, 24, 25]) for (const [b, p, db, v] of ctaBass[bar]) bassNote(p, T(bar, b), db, v);
mel('marimba', 23, theme[12]); mel('glock', 23, theme[12].filter((s) => s[2] >= 1).map((s) => [s[0], s[1], s[2], 0.38]), {ring: true});
mel('marimba', 24, [[0, 'B5', 1, 0.62], [1, 'A5', 0.5, 0.58], [1.5, 'F#5', 1, 0.6], [2.5, 'G5', 0.5, 0.58], [3, 'B5', 0.5, 0.6], [3.5, 'A5', 0.5, 0.6]]);
mel('glock', 24, [[0, 'B5', 1, 0.36], [1.5, 'F#5', 1, 0.34], [3, 'B5', 0.5, 0.36]], {ring: true});
const run = ['A4', 'B4', 'C#5', 'D5', 'E5', 'F#5', 'G5', 'A5'];
mel('marimba', 25, run.map((p, i) => [i < 4 ? i * 0.5 : 2 + (i - 4) * 0.5, p, 0.5, 0.6 + 0.03 * i]));
mel('glock', 25, ['A5', 'B5', 'C#6', 'D6', 'E6', 'F#6', 'G6', 'A6'].map((p, i) => [2 + i * 0.25, p, 0.25, 0.44 + 0.03 * i]), {ring: true});
pad(T(23, 0), ['D4', 'F#4', 'A4'], 0.42); pad(T(24, 0), ['B3', 'D4', 'F#4'], 0.4, 1.0); pad(T(24, 2), ['G3', 'B3', 'D4'], 0.4, 1.0);
pad(T(25, 0), ['A3', 'D4', 'E4'], 0.42, 1.0); pad(T(25, 2), ['A3', 'C#4', 'G4'], 0.45, 1.0);
for (const bar of [23, 24]) { const tones = bar === 23 ? ['A3', 'F#4'] : ['D4', 'B3']; note('pizz', tones[0], T(bar, 1.5), {dur: 0.4, vel: 0.54, pan: -0.25}); note('pizz', tones[1], T(bar, 3.5), {dur: 0.4, vel: 0.54, pan: -0.25}); }
for (let b = 0; b < 4; b += 0.5) note('pizz', 'A3', T(25, b), {dur: 0.3, vel: 0.5 + 0.04 * b, pan: -0.25});
// drums
kick(T(23, 0), 0.62); kick(T(23, 1.5), 0.5); kick(T(23, 2), 0.6); kick(T(23, 3.5), 0.52);
kick(T(24, 0), 0.62); kick(T(24, 2), 0.6); kick(T(24, 3.5), 0.52);
[0, 1, 2, 2.5, 3, 3.5].forEach((b, i) => kick(T(25, b), 0.6 + 0.03 * i));
shakerBar(23, {vel: 0.48, div: 4});
shakerBar(24, {vel: 0.46});
for (let b = 0; b < 4; b += 0.25) shaker(T(25, b), (0.42 + 0.1 * b / 4) * (Math.abs(b - Math.round(b)) < 1e-6 ? 1 : 0.82));
for (const bar of [23, 24]) { wb(T(bar, 1), 0.54); wb(T(bar, 3), 0.54); }
wb(T(23, 2.5), 0.4, false);
wb(T(25, 1), 0.54); [2.5, 2.75, 3, 3.25, 3.5, 3.75].forEach((b, i) => wb(T(25, b), 0.5 + 0.06 * i, i % 2 === 0));
// the final chord
sectionVel = 1.1;
const F0 = T(26, 0);
strum(F0, 'Dbig', {vel: 0.95, spread: 0.03});
bassNote('D2', F0, 3.6, 0.85);
roll('marimba', F0, ['D4', 'F#4', 'A4', 'D5'], {vel: 0.72, spread: 0.014, dur: 2.5, release: 0.5});
pad(F0, ['D4', 'F#4', 'A4', 'D5'], 0.55, 3.0);
sparkle(F0 + 0.004, ['D6', 'F#6', 'A6', 'D7'], 0.68, 0.04);
note('glock', 'A6', F0 + 0.5, {vel: 0.4, pan: -0.2, release: 0.6}); note('glock', 'D7', F0 + 0.62, {vel: 0.45, pan: 0.3, release: 0.6});
note('kalimba', 'D5', F0 + 0.01, {vel: 0.5, pan: -0.3}); note('kalimba', 'A5', F0 + 0.03, {vel: 0.45, pan: -0.25});
note('pizz', 'D3', F0, {dur: 0.6, vel: 0.7, pan: -0.25});
kick(F0, 0.7); wb(F0, 0.6); shaker(F0, 0.5, {open: true});

// ================================================================== RENDER
const t0 = Date.now();
let noteCount = 0;
for (const [name, b] of Object.entries(BUSES)) {
  if (!b.inst) continue;
  const ins = I(b.inst);
  for (const e of b.events) {
    const s = ins.get(e.midi);
    D.playSample(b.buf, s.data, {time: e.t, rate: s.rate * e.rateMul, rateEnd: e.rateEnd, gain: velGain(e.vel), pan: e.pan, dur: e.dur, attack: e.attack, release: e.release});
    noteCount++;
  }
}
console.log(`rendered ${noteCount} sampled notes + ${BUSES.kick.events.length} kicks + ${BUSES.shaker.events.length} shaker hits in ${Date.now() - t0} ms`);

// per-bus processing (EQ, colour, dynamics)
D.highpass(BUSES.guitar.buf, 85, {passes: 2}); D.peakEq(BUSES.guitar.buf, 230, -2.5, 1.1); D.highshelf(BUSES.guitar.buf, 5500, 1.0); D.saturate(BUSES.guitar.buf, {drive: 1.35, mix: 0.5});
D.highpass(BUSES.bass.buf, 34, {passes: 2}); D.lowpass(BUSES.bass.buf, 4200); D.peakEq(BUSES.bass.buf, 95, 1.5, 1.0); D.saturate(BUSES.bass.buf, {drive: 1.8, mix: 0.45}); D.compress(BUSES.bass.buf, {threshold: -14, ratio: 3, knee: 6, attack: 0.012, release: 0.15, detector: 'rms'});
D.highpass(BUSES.marimba.buf, 130); D.peakEq(BUSES.marimba.buf, 420, -1.5, 1.2);
D.highpass(BUSES.kalimba.buf, 200);
D.highpass(BUSES.glock.buf, 700); D.peakEq(BUSES.glock.buf, 5200, -2.5, 1.4); D.highshelf(BUSES.glock.buf, 10000, -2);
D.highpass(BUSES.musicbox.buf, 400); D.peakEq(BUSES.musicbox.buf, 4000, -2, 1.4);
D.highpass(BUSES.vibes.buf, 150); D.lowpass(BUSES.vibes.buf, 9000);
D.highpass(BUSES.pizz.buf, 90); D.peakEq(BUSES.pizz.buf, 300, -1.5, 1.2);
D.highpass(BUSES.woodblock.buf, 300);
D.lowpass(BUSES.kick.buf, 260); D.highpass(BUSES.kick.buf, 32, {passes: 2});

// sum to master and to the two reverb sends
const master = D.makeBuffer(TOTAL, 2), roomSend = D.makeBuffer(TOTAL, 2), hallSend = D.makeBuffer(TOTAL, 2);
for (const b of Object.values(BUSES)) {
  const g = D.dB(b.gainDb);
  D.mixInto(master, b.buf, {gain: g});
  if (b.room) D.mixInto(roomSend, b.buf, {gain: g * b.room});
  if (b.hall) D.mixInto(hallSend, b.buf, {gain: g * b.hall});
}
if (process.env.DEBUG) {
  const win = (buf, t0, t1) => { const a = D.resize({sr: buf.sr, ch: buf.ch.map((c) => c.subarray(D.secs(t0), D.secs(t1)))}, t1 - t0); return D.toDb(D.rms(a)); };
  console.log('bus levels (post-gain RMS dBFS): whole | product 26-40 s | peak');
  for (const [n, b] of Object.entries(BUSES)) { const g = D.dB(b.gainDb); console.log(`  ${n.padEnd(10)} ${(D.toDb(D.rms(b.buf) * g)).toFixed(1).padStart(6)} ${(win(b.buf, 26, 40) + b.gainDb).toFixed(1).padStart(6)} ${(D.toDb(D.peak(b.buf) * g)).toFixed(1).padStart(6)}`); }
}
const room = D.reverb(roomSend, {roomSize: 0.62, damping: 0.55, preDelay: 0.008, size: 0.7, width: 1, lowCut: 200, highCut: 7000, tail: 0});
const hall = D.reverb(hallSend, {roomSize: 0.88, damping: 0.38, preDelay: 0.028, size: 1.35, width: 1, lowCut: 250, highCut: 8500, tail: 0});
D.mixInto(master, room, {gain: 0.9});
D.mixInto(master, hall, {gain: 0.85});
if (process.env.DEBUG) console.log(`reverb levels: dry ${D.toDb(D.rms(master)).toFixed(1)} dB, room ${D.toDb(D.rms(room) * 0.9).toFixed(1)} dB, hall ${D.toDb(D.rms(hall) * 0.85).toFixed(1)} dB`);

// the drop-out: hard gate (including reverb) at the scene transition, reopened just before the glock pickup
D.applyCurve(master, (t) => {
  if (t < GATE_AT) return 1;
  if (t < GATE_AT + 0.008) return 1 - (t - GATE_AT) / 0.008;
  if (t < GATE_OPEN) return 0;
  if (t < GATE_OPEN + 0.006) return (t - GATE_OPEN) / 0.006;
  return 1;
});
// master chain: high-pass 40 Hz, gentle bus compression, fade to silence by 60.5
D.highpass(master, 40, {passes: 2});
const busComp = D.compress(master, {threshold: -16, ratio: 1.8, knee: 8, attack: 0.03, release: 0.25, detector: 'rms', rmsWindow: 0.02});
D.applyCurve(master, (t) => (t < 59.3 ? 1 : t < 60.4 ? Math.pow(1 - (t - 59.3) / 1.1, 1.6) : 0));

// loudness calibration: measure with ffmpeg loudnorm, adjust gain, limit, repeat until within 0.3 LU of target
let gainDb = 0, result = null, final = null;
for (let iter = 0; iter < 5; iter++) {
  final = D.cloneBuffer(master);
  D.gainBuffer(final, D.dB(gainDb));
  const lim = D.limit(final, {ceilingDb: CEILING_DB, lookahead: 0.004, release: 0.09});
  D.writeWav(OUT, final, {bits: 16});
  result = D.measureLoudness(OUT);
  console.log(`pass ${iter + 1}: gain ${gainDb.toFixed(2)} dB -> ${result.lufs.toFixed(2)} LUFS, true peak ${result.truePeak.toFixed(2)} dBTP, limiter GR ${lim.maxGainReductionDb.toFixed(2)} dB, bus comp GR ${busComp.maxGainReductionDb.toFixed(2)} dB`);
  if (Math.abs(result.lufs - LUFS_TARGET) <= 0.3) break;
  gainDb += LUFS_TARGET - result.lufs;
}
if (process.env.DEBUG) {
  const pre = D.cloneBuffer(master); D.gainBuffer(pre, D.dB(gainDb));
  const hot = []; for (let bar = 0; bar <= 26; bar++) { const a = D.resize({sr: D.SR, ch: pre.ch.map((c) => c.subarray(D.secs(T(bar)), D.secs(T(bar + 1))))}, BAR); const p = D.toDb(D.truePeak(a)); if (p > CEILING_DB) hot.push(`bar ${bar}: ${p.toFixed(1)}`); }
  console.log('bars where the limiter works (pre-limiter true peak > ceiling): ' + (hot.join(', ') || 'none'));
}
const pk = D.peak(final), tp = D.truePeak(final);
console.log(`\nwrote ${path.relative(D.ROOT, OUT)}: ${D.duration(final).toFixed(2)} s, ${D.ffprobeDuration(OUT).toFixed(2)} s per ffmpeg, sample peak ${D.toDb(pk).toFixed(2)} dBFS, true peak ${D.toDb(tp).toFixed(2)} dBTP, integrated ${result.lufs} LUFS (LRA ${result.lra} LU)`);
// silence check on the tail
{ let last = 0; for (const c of final.ch) for (let i = c.length - 1; i >= 0; i--) if (Math.abs(c[i]) > 1e-4) { last = Math.max(last, i / D.SR); break; } console.log(`last audible sample at ${last.toFixed(2)} s`); }

// ================================================================== ARRANGEMENT SUMMARY
console.log(`\nTempo ${BPM.toFixed(1)} BPM, 4/4, bar = ${BAR.toFixed(4)} s, bar 0 at ${OFFSET.toFixed(3)} s. Key C major / A minor, lifting to D major at ${HIT} s. Final chord at ${FINAL} s.`);
console.log('Scenes: ' + timeline.scenes.map((s) => `${s.id} ${s.start.toFixed(2)}-${s.end.toFixed(2)}`).join(' | '));
console.log('\nbar  time(s)      section   instruments (note counts)       what happens');
const busNames = Object.keys(BUSES);
for (const a of arrangement) {
  const t0b = T(a.bar), t1b = T(a.bar + 1);
  const counts = busNames.map((n) => { const c = BUSES[n].events.filter((e) => e.t >= t0b - 0.02 && e.t < t1b - 0.02).length; return c ? `${n}:${c}` : null; }).filter(Boolean).join(' ');
  console.log(`${String(a.bar).padStart(3)}  ${t0b.toFixed(2).padStart(5)}-${t1b.toFixed(2).padStart(5)}  ${a.section.padEnd(9)} ${counts}\n     ${a.text}`);
}
