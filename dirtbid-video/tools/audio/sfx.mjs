// sfx.mjs - renders the short UI/foley sound effects for the DirtBid video into public/audio/sfx/.
// Everything is synthesized from noise/sine oscillators or built from the soundfont samples,
// peak-normalized to -3 dBFS, with short fades so nothing clicks. Deterministic (seeded noise).
import fs from 'node:fs';
import path from 'node:path';
import * as D from './dsp.mjs';

const OUT = path.join(D.ROOT, 'public/audio/sfx');
fs.mkdirSync(OUT, {recursive: true});
const {secs, makeBuffer, whiteNoise, sine, adsr, applyEnvelope, mixInto, highpass, lowpass, peakEq, sweepFilter, filter, reverb, playSample, Instrument, noteToMidi, saturate, normalizePeak, fadeIn, fadeOut, resize, writeWav, ffprobeDuration, peak, toDb, rng} = D;

const glock = new Instrument('glockenspiel');
const celesta = new Instrument('celesta');
const vibes = new Instrument('vibraphone');
const marimba = new Instrument('marimba');
const woodblock = new Instrument('woodblock');
const pizz = new Instrument('pizzicato_strings');

const index = [];
function finish(name, buf, {seconds, fadeInS = 0.002, fadeOutS = 0.012, mono = false} = {}) {
  let b = resize(buf, seconds);
  if (mono && b.ch.length === 2) b = D.toMono(b);
  D.dcBlock(b);
  fadeIn(b, fadeInS);
  fadeOut(b, fadeOutS);
  normalizePeak(b, -3);
  const file = path.join(OUT, name + '.wav');
  writeWav(file, b, {bits: 16});
  const dur = ffprobeDuration(file);
  index.push({file: 'sfx/' + name + '.wav', seconds: +dur.toFixed(3), channels: b.ch.length, peakDb: +toDb(peak(b)).toFixed(2)});
  console.log(`${(name + '.wav').padEnd(16)} ${dur.toFixed(3)} s  ${b.ch.length}ch  peak ${toDb(peak(b)).toFixed(2)} dBFS`);
}
/** Mono noise burst shaped by an envelope and band-limited. */
function burst(seconds, {seed = 1, hp = 200, lp = 8000, env = {}} = {}) {
  const n = whiteNoise(seconds, seed);
  highpass(n, hp, {passes: 2}); lowpass(n, lp, {passes: 2});
  applyEnvelope(n, adsr(D.length(n), env));
  return n;
}
/** Sine thump: pitch sweeps f0->f1, exponential amplitude decay. */
function thump(seconds, f0, f1, {sweep = 0.05, tau = 0.08, attack = 0.001} = {}) {
  const s = sine(seconds, f0, {f1, sweep});
  const n = D.length(s);
  const e = D.expDecayEnv(n, tau);
  const a = Math.max(1, secs(attack));
  for (let i = 0; i < a && i < n; i++) e[i] *= i / a;
  applyEnvelope(s, e);
  return s;
}
function stereoOf(mono) { return D.toStereo(mono); }
function withReverb(buf, sendDb, opts) {
  const wet = reverb(buf, opts);
  const out = makeBuffer(D.duration(wet), 2);
  mixInto(out, buf, {gain: 1});
  mixInto(out, wet, {gain: D.dB(sendDb)});
  return out;
}

// ---------------------------------------------------------------- pops: a rounded bubble "plip"
function pop(name, pitchMul, seed) {
  const len = 0.15;
  const b = makeBuffer(len, 1);
  // body: sine that rises then falls quickly (a bubble), 2 partials
  const body = sine(len, 380 * pitchMul, {f1: 720 * pitchMul, sweep: 0.03});
  const n = D.length(body);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / D.SR; env[i] = Math.min(1, t / 0.004) * Math.exp(-t / 0.028); }
  applyEnvelope(body, env);
  mixInto(b, body, {gain: 0.9});
  // second partial for roundness
  const p2 = sine(len, 760 * pitchMul, {f1: 1350 * pitchMul, sweep: 0.03});
  applyEnvelope(p2, env.map((v) => v * Math.exp(-0.0) * 0.35));
  lowpass(p2, 3000 * pitchMul);
  mixInto(b, p2, {gain: 0.6});
  // tiny lip transient
  const t = burst(0.02, {seed, hp: 800 * pitchMul, lp: 5000 * pitchMul, env: {attack: 0.0005, decay: 0.004, sustain: 0, release: 0.004}});
  mixInto(b, t, {gain: 0.5});
  saturate(b, {drive: 1.4, mix: 0.4});
  finish(name, b, {seconds: len, mono: true});
}
pop('pop', 1.0, 11);
pop('pop-low', 0.68, 12);
pop('pop-high', 1.45, 13);

// ---------------------------------------------------------------- slap: sticker slapped onto a page
{
  const len = 0.25;
  const b = makeBuffer(len, 1);
  const n1 = burst(0.06, {seed: 21, hp: 900, lp: 7000, env: {attack: 0.0006, decay: 0.012, sustain: 0.15, release: 0.03}});
  peakEq(n1, 2200, 4, 1.2);
  mixInto(b, n1, {gain: 0.9});
  const n2 = burst(0.09, {seed: 22, hp: 250, lp: 1800, env: {attack: 0.002, decay: 0.03, sustain: 0.1, release: 0.04}});
  mixInto(b, n2, {gain: 0.5});
  const th = thump(0.2, 170, 62, {sweep: 0.04, tau: 0.045});
  mixInto(b, th, {gain: 0.9});
  saturate(b, {drive: 1.6, mix: 0.5});
  finish('slap', b, {seconds: len, mono: true});
}

// ---------------------------------------------------------------- whoosh: airy noise sweep
function whoosh(name, up) {
  const len = 0.35;
  const n = whiteNoise(len, 31, 2);
  // right channel gets its own noise so it reads as a wide, airy sweep
  const r = whiteNoise(len, 32, 1); n.ch[1] = r.ch[0];
  const f = (t) => { const u = D.clamp(t / 0.3, 0, 1); const k = up ? u : 1 - u; return 260 * Math.pow(4200 / 260, k); };
  sweepFilter(n, 'bandpass', f, {q: 1.6});
  sweepFilter(n, 'bandpass', (t) => f(t) * 1.02, {q: 1.6});
  const N = D.length(n);
  const env = new Float32Array(N);
  for (let i = 0; i < N; i++) { const t = i / D.SR; env[i] = Math.pow(Math.sin(Math.PI * D.clamp(t / len, 0, 1)), 1.4) * (up ? Math.min(1, 0.35 + t / 0.2) : 1); }
  applyEnvelope(n, env);
  highpass(n, 180);
  finish(name, n, {seconds: len, fadeOutS: 0.02});
}
whoosh('whoosh', true);
whoosh('whoosh-down', false);

// ---------------------------------------------------------------- tear: grainy paper rip with a stuttering amplitude
{
  const len = 0.5;
  const r = rng(41);
  const n = whiteNoise(len, 42);
  highpass(n, 1200, {passes: 2}); lowpass(n, 6500);
  peakEq(n, 2800, 5, 1.5);
  const N = D.length(n), c = n.ch[0];
  // irregular fibre-snapping modulation: a random pulse train at 35..90 Hz plus sparse crackles
  let phase = 0, rate = 45, g = 0;
  for (let i = 0; i < N; i++) {
    const t = i / D.SR;
    phase += rate / D.SR;
    if (phase >= 1) { phase -= 1; rate = 35 + r() * 60; g = 0.35 + r() * 0.65; }
    const pulse = g * Math.exp(-phase * 6);
    const macro = t < 0.03 ? t / 0.03 : t > 0.4 ? Math.max(0, 1 - (t - 0.4) / 0.1) : 1 - 0.25 * Math.sin(t * 9);
    c[i] *= (0.25 + pulse) * macro;
    if (r() < 0.0025) c[i] += (r() * 2 - 1) * 0.9 * macro; // crackle
  }
  // a little body from the paper sheet
  const body = burst(len, {seed: 43, hp: 300, lp: 1200, env: {attack: 0.02, decay: 0.2, sustain: 0.5, release: 0.15}});
  const b = makeBuffer(len, 1);
  mixInto(b, n, {gain: 1});
  mixInto(b, body, {gain: 0.28});
  saturate(b, {drive: 1.8, mix: 0.5});
  finish('tear', b, {seconds: len, fadeOutS: 0.03, mono: true});
}

// ---------------------------------------------------------------- slide: paper sliding across a desk
function slideBuf(len, seed, f0 = 900, f1 = 1900) {
  const n = whiteNoise(len, seed);
  sweepFilter(n, 'bandpass', (t) => f0 * Math.pow(f1 / f0, D.clamp(t / len, 0, 1)), {q: 0.9});
  lowpass(n, 5000);
  const N = D.length(n), env = new Float32Array(N);
  for (let i = 0; i < N; i++) { const u = i / N; env[i] = Math.pow(Math.sin(Math.PI * u), 0.8) * (1 - 0.5 * u); }
  applyEnvelope(n, env);
  return n;
}
finish('slide', slideBuf(0.3, 51), {seconds: 0.3, fadeOutS: 0.03, mono: true});

// ---------------------------------------------------------------- dings: a single mallet note for a checkmark
function ding(name, note) {
  const len = 0.8;
  const b = makeBuffer(len, 2);
  const g = glock.get(noteToMidi(note));
  playSample(b, g.data, {rate: g.rate, gain: 0.9, pan: 0.05, dur: 0.5, release: 0.25});
  const c = celesta.get(noteToMidi(note));
  playSample(b, c.data, {rate: c.rate, gain: 0.35, pan: -0.1, dur: 0.4, release: 0.3});
  const out = withReverb(b, -13, {roomSize: 0.78, damping: 0.5, preDelay: 0.012, tail: 0.5, lowCut: 500});
  D.applyCurve(out, (t) => t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.25));
  finish(name, out, {seconds: len, fadeOutS: 0.05});
}
ding('ding', 'E6');
ding('ding-2', 'G6');
ding('ding-3', 'C6');

// ---------------------------------------------------------------- stamp: rubber stamp thud
{
  const len = 0.3;
  const b = makeBuffer(len, 1);
  mixInto(b, thump(0.25, 95, 42, {sweep: 0.05, tau: 0.06}), {gain: 1});
  const click = burst(0.012, {seed: 61, hp: 1500, lp: 9000, env: {attack: 0.0003, decay: 0.003, sustain: 0, release: 0.003}});
  mixInto(b, click, {gain: 0.55});
  const wood = burst(0.05, {seed: 62, hp: 300, lp: 900, env: {attack: 0.001, decay: 0.02, sustain: 0.05, release: 0.02}});
  mixInto(b, wood, {gain: 0.6});
  saturate(b, {drive: 2, mix: 0.6});
  finish('stamp', b, {seconds: len, mono: true});
}

// ---------------------------------------------------------------- coin: two bright metallic pings
{
  const len = 0.4;
  const b = makeBuffer(len, 2);
  const notes = [['B5', 0], ['E6', 0.075]];
  for (const [nt, t] of notes) {
    const v = vibes.get(noteToMidi(nt) + 12); // vibraphone sample an octave up: a brighter, more metallic ping
    playSample(b, v.data, {time: t, rate: v.rate, gain: 0.8, pan: t ? 0.15 : -0.15, dur: 0.18, release: 0.12});
    const c = celesta.get(noteToMidi(nt));
    playSample(b, c.data, {time: t, rate: c.rate, gain: 0.5, pan: t ? 0.1 : -0.1, dur: 0.15, release: 0.12});
  }
  // metallic transient
  for (const t of [0, 0.075]) mixInto(b, burst(0.01, {seed: 71, hp: 4000, lp: 12000, env: {attack: 0.0003, decay: 0.003, sustain: 0, release: 0.003}}), {time: t, gain: 0.35});
  const out = withReverb(b, -16, {roomSize: 0.6, damping: 0.4, preDelay: 0.008, tail: 0.2, lowCut: 800});
  finish('coin', out, {seconds: len, fadeOutS: 0.04});
}

// ---------------------------------------------------------------- tick and clock sweep
function tickInto(b, t, {rate = 1, gain = 1} = {}) {
  const w = woodblock.get(noteToMidi('C4'));
  playSample(b, w.data, {time: t, rate: w.rate * rate, gain, dur: 0.03, release: 0.03});
}
{
  const b = makeBuffer(0.08, 1);
  tickInto(b, 0, {rate: 1.15});
  finish('tick', b, {seconds: 0.08, fadeOutS: 0.01, mono: true});
}
{
  const len = 1.2;
  const b = makeBuffer(len, 1);
  // ticks accelerating: interval shrinks geometrically from 0.19 s to 0.045 s
  let t = 0, iv = 0.19, k = 0;
  while (t < 1.02) { tickInto(b, t, {rate: 1.15 * (k % 2 ? 1 : 0.94), gain: 0.85 + 0.15 * (k % 2)}); t += iv; iv = Math.max(0.045, iv * 0.86); k++; }
  const out = withReverb(b, -20, {roomSize: 0.5, damping: 0.6, preDelay: 0.005, tail: 0.15, lowCut: 300});
  finish('clock-sweep', out, {seconds: len, fadeOutS: 0.06});
}

// ---------------------------------------------------------------- riffle: a stack of pages flicked
{
  const len = 0.5;
  const b = makeBuffer(len, 1);
  const r = rng(81);
  let t = 0.005;
  for (let i = 0; i < 6; i++) {
    const s = slideBuf(0.09, 82 + i, 700 + r() * 600, 1600 + r() * 1200);
    mixInto(b, s, {time: t, gain: 0.7 + 0.3 * r()});
    t += 0.058 + r() * 0.03;
  }
  mixInto(b, burst(0.12, {seed: 90, hp: 150, lp: 900, env: {attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.05}}), {time: 0.3, gain: 0.3});
  finish('riffle', b, {seconds: len, fadeOutS: 0.03, mono: true});
}

// ---------------------------------------------------------------- sparkle: rising glockenspiel arpeggio with reverb
{
  const len = 0.9;
  const b = makeBuffer(len, 2);
  const seq = ['C6', 'E6', 'G6', 'C7'];
  seq.forEach((nt, i) => {
    const g = glock.get(noteToMidi(nt));
    playSample(b, g.data, {time: i * 0.062, rate: g.rate, gain: 0.55 + i * 0.12, pan: -0.3 + i * 0.2, dur: 0.35, release: 0.3});
    const c = celesta.get(noteToMidi(nt));
    playSample(b, c.data, {time: i * 0.062 + 0.004, rate: c.rate, gain: 0.25, pan: 0.3 - i * 0.2, dur: 0.3, release: 0.3});
  });
  const out = withReverb(b, -9, {roomSize: 0.86, damping: 0.35, preDelay: 0.015, size: 1.3, tail: 0.6, lowCut: 600});
  D.applyCurve(out, (t) => t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.35));
  finish('sparkle', out, {seconds: len, fadeOutS: 0.06});
}

// ---------------------------------------------------------------- thud: a heavy soft landing
{
  const len = 0.35;
  const b = makeBuffer(len, 1);
  mixInto(b, thump(0.33, 110, 34, {sweep: 0.08, tau: 0.11, attack: 0.003}), {gain: 1});
  mixInto(b, thump(0.2, 60, 40, {sweep: 0.05, tau: 0.07, attack: 0.002}), {gain: 0.5});
  const air = burst(0.12, {seed: 91, hp: 120, lp: 700, env: {attack: 0.004, decay: 0.05, sustain: 0.1, release: 0.05}});
  mixInto(b, air, {gain: 0.45});
  saturate(b, {drive: 2.2, mix: 0.7});
  lowpass(b, 1800);
  finish('thud', b, {seconds: len, fadeOutS: 0.03, mono: true});
}

// ---------------------------------------------------------------- sad-slide: three descending "wah" notes (pizzicato, each bent down)
{
  const len = 0.6;
  const b = makeBuffer(len, 2);
  const notes = ['E4', 'D4', 'C4'];
  notes.forEach((nt, i) => {
    const p = pizz.get(noteToMidi(nt));
    const t = i * 0.17;
    playSample(b, p.data, {time: t, rate: p.rate, rateEnd: p.rate * (i === 2 ? 0.86 : 0.93), gain: 0.9 - i * 0.05, pan: -0.15 + i * 0.15, dur: i === 2 ? 0.26 : 0.14, release: 0.12});
    const m = marimba.get(noteToMidi(nt) - 12);
    playSample(b, m.data, {time: t + 0.003, rate: m.rate, rateEnd: m.rate * 0.95, gain: 0.35, pan: 0, dur: 0.14, release: 0.1});
  });
  const out = withReverb(b, -15, {roomSize: 0.7, damping: 0.5, preDelay: 0.01, tail: 0.2, lowCut: 200});
  finish('sad-slide', out, {seconds: len, fadeOutS: 0.05});
}

// ---------------------------------------------------------------- success: a bright two-note "ta-da"
{
  const len = 1.0;
  const b = makeBuffer(len, 2);
  const mar = (nt, t, g, pan = 0, dur = 0.5) => { const s = marimba.get(noteToMidi(nt)); playSample(b, s.data, {time: t, rate: s.rate, gain: g, pan, dur, release: 0.25}); };
  const glk = (nt, t, g, pan = 0, dur = 0.5) => { const s = glock.get(noteToMidi(nt)); playSample(b, s.data, {time: t, rate: s.rate, gain: g, pan, dur, release: 0.35}); };
  mar('C5', 0, 0.8, -0.1, 0.16); glk('C6', 0.002, 0.35, 0.2, 0.14);
  const t2 = 0.16;
  // "da": G5 on top of a C major chord, slightly rolled
  mar('C4', t2 + 0.000, 0.55, -0.25); mar('E4', t2 + 0.012, 0.5, -0.1); mar('G4', t2 + 0.022, 0.5, 0.1); mar('G5', t2 + 0.03, 0.85, 0.15);
  glk('G6', t2 + 0.03, 0.6, 0.3); glk('E6', t2 + 0.045, 0.3, -0.3); glk('C7', t2 + 0.09, 0.3, 0.1);
  const out = withReverb(b, -11, {roomSize: 0.82, damping: 0.4, preDelay: 0.015, size: 1.2, tail: 0.6, lowCut: 250});
  D.applyCurve(out, (t) => t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4));
  finish('success', out, {seconds: len, fadeOutS: 0.08});
}

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({sampleRate: D.SR, normalizedPeakDb: -3, files: index}, null, 2) + '\n');
console.log(`wrote ${index.length} files + index.json to ${path.relative(D.ROOT, OUT)}`);
