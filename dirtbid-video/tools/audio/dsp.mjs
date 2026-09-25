// dsp.mjs - a small offline audio DSP toolkit for the DirtBid video audio.
//
// Everything here works on "buffers": { sr, ch: [Float32Array, ...] } where
// ch has one Float32Array per channel (1 = mono, 2 = stereo), samples in the
// range -1..1, at 44.1 kHz. All functions are plain JS, no native deps.
// The only external process used is the ffmpeg binary that ships with
// Remotion, and only for decoding mp3 -> wav and for LUFS measurement.

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const SR = 44100;
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const FFMPEG = path.join(ROOT, 'node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg');
export const SAMPLES_DIR = path.join(ROOT, 'tools/samples');
export const CACHE_DIR = path.join(HERE, '.cache');

// ---------------------------------------------------------------- utilities
export const dB = (x) => Math.pow(10, x / 20);
export const toDb = (x) => 20 * Math.log10(Math.max(Math.abs(x), 1e-12));
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const secs = (s) => Math.round(s * SR);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Deterministic PRNG (mulberry32) so renders are reproducible. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  // approx gaussian (sum of 4 uniforms), std ~ 1
  next.gauss = () => (next() + next() + next() + next() - 2) * Math.sqrt(3);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

// ---------------------------------------------------------------- buffers
export function makeBuffer(seconds, channels = 2, sr = SR) {
  const n = Math.ceil(seconds * sr);
  return {sr, ch: Array.from({length: channels}, () => new Float32Array(n))};
}
export const length = (buf) => buf.ch[0].length;
export const duration = (buf) => buf.ch[0].length / buf.sr;

export function cloneBuffer(buf) {
  return {sr: buf.sr, ch: buf.ch.map((c) => Float32Array.from(c))};
}
export function toMono(buf) {
  if (buf.ch.length === 1) return buf;
  const n = length(buf);
  const out = new Float32Array(n);
  const g = 1 / buf.ch.length;
  for (const c of buf.ch) for (let i = 0; i < n; i++) out[i] += c[i] * g;
  return {sr: buf.sr, ch: [out]};
}
export function toStereo(buf) {
  if (buf.ch.length === 2) return buf;
  return {sr: buf.sr, ch: [buf.ch[0], Float32Array.from(buf.ch[0])]};
}
export function resize(buf, seconds) {
  const n = Math.ceil(seconds * buf.sr);
  return {sr: buf.sr, ch: buf.ch.map((c) => { const o = new Float32Array(n); o.set(c.subarray(0, Math.min(n, c.length))); return o; })};
}
export function trimTo(buf, seconds) { return resize(buf, seconds); }

export function gainBuffer(buf, g) {
  for (const c of buf.ch) for (let i = 0; i < c.length; i++) c[i] *= g;
  return buf;
}
export function peak(buf) {
  let p = 0;
  for (const c of buf.ch) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > p) p = v; }
  return p;
}
export function rms(buf) {
  let s = 0, n = 0;
  for (const c of buf.ch) { for (let i = 0; i < c.length; i++) s += c[i] * c[i]; n += c.length; }
  return Math.sqrt(s / Math.max(1, n));
}
/** Scale so the absolute peak equals targetDb (dBFS). */
export function normalizePeak(buf, targetDb = -3) {
  const p = peak(buf);
  if (p > 0) gainBuffer(buf, dB(targetDb) / p);
  return buf;
}
export function fadeIn(buf, seconds, start = 0) {
  const s0 = secs(start), n = Math.max(1, secs(seconds));
  for (const c of buf.ch) for (let i = 0; i < n && s0 + i < c.length; i++) c[s0 + i] *= i / n;
  return buf;
}
export function fadeOut(buf, seconds, end = duration(buf)) {
  const e = Math.min(length(buf), secs(end)), n = Math.max(1, secs(seconds));
  for (const c of buf.ch) for (let i = 0; i < n && e - 1 - i >= 0; i++) c[e - 1 - i] *= i / n;
  return buf;
}
/** Multiply each sample by env(t) (t in seconds). */
export function applyCurve(buf, fn) {
  const n = length(buf);
  for (let i = 0; i < n; i++) { const g = fn(i / buf.sr); for (const c of buf.ch) c[i] *= g; }
  return buf;
}
/** Mix src into dest at offset seconds with gain and constant-power pan (-1..1). */
export function mixInto(dest, src, {time = 0, gain = 1, pan = 0} = {}) {
  const off = Math.round(time * dest.sr);
  const n = length(src), dn = length(dest);
  const stereoDest = dest.ch.length === 2;
  const pl = Math.cos((pan + 1) * Math.PI / 4), pr = Math.sin((pan + 1) * Math.PI / 4);
  if (src.ch.length === 1 && stereoDest) {
    const s = src.ch[0], L = dest.ch[0], R = dest.ch[1];
    for (let i = 0; i < n; i++) { const j = off + i; if (j < 0 || j >= dn) continue; L[j] += s[i] * gain * pl * Math.SQRT2; R[j] += s[i] * gain * pr * Math.SQRT2; }
  } else if (src.ch.length === 2 && stereoDest) {
    const gl = pan <= 0 ? 1 : 1 - pan, gr = pan >= 0 ? 1 : 1 + pan;
    const [sL, sR] = src.ch, [L, R] = dest.ch;
    for (let i = 0; i < n; i++) { const j = off + i; if (j < 0 || j >= dn) continue; L[j] += sL[i] * gain * gl; R[j] += sR[i] * gain * gr; }
  } else {
    const s = toMono(src).ch[0], D = dest.ch[0];
    for (let i = 0; i < n; i++) { const j = off + i; if (j < 0 || j >= dn) continue; D[j] += s[i] * gain; }
  }
  return dest;
}
export function concat(bufs) {
  const total = bufs.reduce((a, b) => a + length(b), 0);
  const out = {sr: bufs[0].sr, ch: bufs[0].ch.map(() => new Float32Array(total))};
  let off = 0;
  for (const b of bufs) { b.ch.forEach((c, k) => out.ch[k].set(c, off)); off += length(b); }
  return out;
}

// ---------------------------------------------------------------- wav io
/** Write a wav. bits: 16 (PCM, TPDF dithered) or 32 (IEEE float). Never clips: hard-clamps as a last resort. */
export function writeWav(file, buf, {bits = 16, dither = true} = {}) {
  const nch = buf.ch.length, n = length(buf), sr = buf.sr;
  const bytesPer = bits / 8;
  const dataLen = n * nch * bytesPer;
  const b = Buffer.alloc(44 + dataLen);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataLen, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(bits === 32 ? 3 : 1, 20);
  b.writeUInt16LE(nch, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * nch * bytesPer, 28);
  b.writeUInt16LE(nch * bytesPer, 32); b.writeUInt16LE(bits, 34);
  b.write('data', 36); b.writeUInt32LE(dataLen, 40);
  let o = 44;
  const r = rng(12345);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const v = clamp(buf.ch[c][i], -1, 1);
      if (bits === 32) { b.writeFloatLE(v, o); o += 4; }
      else {
        const d = dither ? (r() - r()) / 32768 : 0; // TPDF, 1 LSB
        const q = Math.round(clamp(v + d, -1, 1) * 32767);
        b.writeInt16LE(clamp(q, -32768, 32767), o); o += 2;
      }
    }
  }
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, b);
  return file;
}

/** Read a wav (PCM 16/24/32 or float 32) into a buffer. */
export function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a wav: ' + file);
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4);
    if (id === 'fmt ') {
      fmt = {tag: b.readUInt16LE(o + 8), nch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22)};
      if (fmt.tag === 0xfffe && sz >= 26) fmt.tag = b.readUInt16LE(o + 8 + 24);
    } else if (id === 'data') { data = b.subarray(o + 8, Math.min(b.length, o + 8 + sz)); break; }
    o += 8 + sz + (sz & 1);
  }
  if (!fmt || !data) throw new Error('bad wav: ' + file);
  const {nch, sr, bits, tag} = fmt;
  const bytes = bits / 8, frames = Math.floor(data.length / (bytes * nch));
  const ch = Array.from({length: nch}, () => new Float32Array(frames));
  let p = 0;
  for (let i = 0; i < frames; i++) for (let c = 0; c < nch; c++) {
    let v;
    if (tag === 3) v = b.readFloatLE(data.byteOffset + p);
    else if (bits === 16) v = data.readInt16LE(p) / 32768;
    else if (bits === 24) v = ((data[p] | (data[p + 1] << 8) | (data[p + 2] << 16)) << 8 >> 8) / 8388608;
    else if (bits === 32) v = data.readInt32LE(p) / 2147483648;
    else throw new Error('unsupported wav bits ' + bits);
    ch[c][i] = v; p += bytes;
  }
  return {sr, ch};
}

/** Decode an mp3 (or anything ffmpeg reads) to a 44.1 kHz buffer, caching a wav in tools/audio/.cache. */
export function decodeAudio(file) {
  const rel = path.relative(ROOT, path.resolve(file)).replace(/[\\/]/g, '__').replace(/\.[^.]+$/, '') + '.wav';
  const cached = path.join(CACHE_DIR, rel);
  if (!fs.existsSync(cached) || fs.statSync(cached).mtimeMs < fs.statSync(file).mtimeMs) {
    fs.mkdirSync(CACHE_DIR, {recursive: true});
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', file, '-acodec', 'pcm_s16le', '-ar', String(SR), cached], {stdio: 'pipe'});
  }
  return readWav(cached);
}

/** Integrated loudness / true peak of a file via ffmpeg loudnorm (first pass, EBU R128). */
export function measureLoudness(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 24});
  return parseLoudnorm(String(r.stderr || '') + String(r.stdout || ''));
}
function parseLoudnorm(text) {
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error('loudnorm output not found:\n' + text);
  const j = JSON.parse(m[0]);
  return {lufs: parseFloat(j.input_i), truePeak: parseFloat(j.input_tp), lra: parseFloat(j.input_lra), thresh: parseFloat(j.input_thresh)};
}
export function ffprobeDuration(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file], {encoding: 'utf8'});
  const m = String(r.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null;
}

// ---------------------------------------------------------------- notes & samples
const NOTE_INDEX = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** 'C4' -> 60. Accepts sharps (#) and flats (b). */
export function noteToMidi(name) {
  if (typeof name === 'number') return name;
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error('bad note ' + name);
  let n = NOTE_INDEX[m[1].toUpperCase()];
  if (m[2] === '#') n++; if (m[2] === 'b') n--;
  return 12 * (parseInt(m[3], 10) + 1) + n;
}
export const midiToNote = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * A sampled instrument: one mp3 per note in tools/samples/<name>/<Note><Octave>.mp3.
 * Notes outside the sampled range (or missing) are pitch-shifted from the nearest sample.
 * Samples are decoded on demand, mono-summed, trimmed to their onset, peak-normalized to 1.0
 * and given a short fade at the very end so the hard cut of the soundfont render never clicks.
 */
export class Instrument {
  constructor(name) {
    this.name = name;
    this.dir = path.join(SAMPLES_DIR, name);
    if (!fs.existsSync(this.dir)) throw new Error('no such instrument ' + name);
    this.files = new Map();
    for (const f of fs.readdirSync(this.dir)) {
      const m = /^([A-G][b#]?\d)\.(mp3|wav)$/.exec(f);
      if (m) this.files.set(noteToMidi(m[1]), path.join(this.dir, f));
    }
    this.cache = new Map();
  }
  get available() { return [...this.files.keys()].sort((a, b) => a - b); }
  nearest(midi) {
    if (this.files.has(midi)) return midi;
    let best = null, bd = 1e9;
    for (const k of this.files.keys()) { const d = Math.abs(k - midi) + (k > midi ? 0.01 : 0); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  /** Mono Float32Array for the sampled note (not pitch shifted). */
  sample(sampledMidi) {
    if (this.cache.has(sampledMidi)) return this.cache.get(sampledMidi);
    const raw = toMono(decodeAudio(this.files.get(sampledMidi))).ch[0];
    // trim leading silence (to -50 dB of peak), with 1 ms of pre-roll
    let p = 0; for (let i = 0; i < raw.length; i++) p = Math.max(p, Math.abs(raw[i]));
    const thr = p * 0.00316;
    let on = 0; while (on < raw.length && Math.abs(raw[on]) < thr) on++;
    on = Math.max(0, on - secs(0.001));
    const data = Float32Array.from(raw.subarray(on));
    const g = p > 0 ? 1 / p : 1;
    for (let i = 0; i < data.length; i++) data[i] *= g;
    // gentle fade over the last 120 ms so the soundfont's hard end never clicks
    const f = Math.min(data.length, secs(0.12));
    for (let i = 0; i < f; i++) data[data.length - 1 - i] *= i / f;
    // tiny fade-in over 0.5 ms to kill any residual onset click
    const fi = Math.min(data.length, secs(0.0005));
    for (let i = 0; i < fi; i++) data[i] *= i / fi;
    this.cache.set(sampledMidi, data);
    return data;
  }
  /** Returns {data, rate} to play `midi`: nearest sample and the playback-rate to pitch it. */
  get(midi) {
    const s = this.nearest(midi);
    return {data: this.sample(s), rate: Math.pow(2, (midi - s) / 12), sampled: s};
  }
}

/**
 * Render a mono sample into a stereo/mono buffer.
 *  time: seconds, rate: playback rate (pitch), gain: linear, pan: -1..1,
 *  dur: seconds the note is held before its release (Infinity = let it ring),
 *  attack/release: seconds (release is an exponential fade reaching -60 dB at `release`),
 *  rateEnd: optional final rate for a linear glide over the note (pitch bends).
 * Uses 4-point Hermite interpolation.
 */
export function playSample(dest, data, {time = 0, rate = 1, rateEnd = null, gain = 1, pan = 0, dur = Infinity, attack = 0.0015, release = 0.09, maxDur = Infinity} = {}) {
  const sr = dest.sr;
  const start = Math.round(time * sr);
  const dn = length(dest);
  const stereo = dest.ch.length === 2;
  const pl = stereo ? Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2 : 1;
  const pr = stereo ? Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2 : 1;
  const L = dest.ch[0], R = stereo ? dest.ch[1] : null;
  const attN = Math.max(1, Math.round(attack * sr));
  const durN = Number.isFinite(dur) ? Math.round(dur * sr) : Infinity;
  const relTau = Math.max(1, (release * sr) / 6.9); // -60 dB after `release`
  const maxN = Number.isFinite(maxDur) ? Math.round(maxDur * sr) : Infinity;
  const n = data.length;
  let pos = 0;
  const glide = rateEnd != null && Number.isFinite(durN) ? (rateEnd - rate) / durN : 0;
  let i = 0;
  for (; ; i++) {
    const j = start + i;
    if (j >= dn || i >= maxN) break;
    const ip = Math.floor(pos);
    if (ip + 2 >= n) break;
    const fr = pos - ip;
    const y0 = ip > 0 ? data[ip - 1] : data[0], y1 = data[ip], y2 = data[ip + 1], y3 = data[ip + 2];
    const c0 = y1, c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    let v = ((c3 * fr + c2) * fr + c1) * fr + c0;
    let env = i < attN ? i / attN : 1;
    if (i > durN) { const e = Math.exp(-(i - durN) / relTau); if (e < 1e-3) break; env *= e; }
    v *= env * gain;
    if (j >= 0) { L[j] += v * pl; if (R) R[j] += v * pr; }
    pos += rate + glide * Math.min(i, durN);
  }
  return i;
}

// ---------------------------------------------------------------- synthesis helpers
export function silence(seconds, channels = 1) { return makeBuffer(seconds, channels); }
export function whiteNoise(seconds, seed = 1, channels = 1) {
  const b = makeBuffer(seconds, channels);
  const r = rng(seed);
  for (const c of b.ch) for (let i = 0; i < c.length; i++) c[i] = r() * 2 - 1;
  return b;
}
/** Sine with optional exponential frequency sweep f0->f1 over sweepSeconds. */
export function sine(seconds, f0, {f1 = f0, sweep = seconds, phase = 0, curve = 'exp'} = {}) {
  const b = makeBuffer(seconds, 1), c = b.ch[0];
  let ph = phase;
  for (let i = 0; i < c.length; i++) {
    const t = i / SR;
    const u = clamp(t / sweep, 0, 1);
    const f = curve === 'exp' ? f0 * Math.pow(f1 / f0, u) : lerp(f0, f1, u);
    c[i] = Math.sin(ph);
    ph += 2 * Math.PI * f / SR;
  }
  return b;
}
/**
 * ADSR envelope as a Float32Array of `n` samples. Times in seconds, sustain 0..1.
 * `hold` is the time the gate stays open (default: n - release). Curves are exponential-ish.
 */
export function adsr(n, {attack = 0.005, decay = 0.05, sustain = 1, release = 0.05, hold = null} = {}) {
  const a = Math.max(1, secs(attack)), d = Math.max(1, secs(decay)), r = Math.max(1, secs(release));
  const gate = hold == null ? n - r : Math.min(n, secs(hold));
  const env = new Float32Array(n);
  let v = 0, atGate = sustain;
  for (let i = 0; i < n; i++) {
    if (i < a) v = i / a;
    else if (i < a + d) { const u = (i - a) / d; v = 1 + (sustain - 1) * (1 - Math.pow(1 - u, 2)); }
    else if (i < gate) v = sustain;
    else { if (i === gate) atGate = i > 0 ? env[i - 1] : 0; v = atGate * Math.exp(-6.9 * (i - gate) / r); }
    env[i] = v;
  }
  return env;
}
export function applyEnvelope(buf, env) {
  for (const c of buf.ch) for (let i = 0; i < c.length; i++) c[i] *= i < env.length ? env[i] : 0;
  return buf;
}
export function expDecayEnv(n, tau) { const e = new Float32Array(n); for (let i = 0; i < n; i++) e[i] = Math.exp(-i / (tau * SR)); return e; }

// ---------------------------------------------------------------- biquad filters (RBJ cookbook)
export class Biquad {
  constructor(type = 'lowpass', freq = 1000, {q = Math.SQRT1_2, gainDb = 0, sr = SR} = {}) {
    this.sr = sr; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(type, freq, {q, gainDb});
  }
  set(type, freq, {q = Math.SQRT1_2, gainDb = 0} = {}) {
    const w0 = 2 * Math.PI * clamp(freq, 1, this.sr * 0.49) / this.sr;
    const cs = Math.cos(w0), sn = Math.sin(w0);
    const A = Math.pow(10, gainDb / 40);
    let alpha = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lowpass': b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'highpass': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break; // constant 0 dB peak
      case 'notch': b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'peak': b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A; break;
      case 'lowshelf': { const s = 2 * Math.sqrt(A) * alpha; b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s); a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s; break; }
      case 'highshelf': { const s = 2 * Math.sqrt(A) * alpha; b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s); a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; break; }
      default: throw new Error('unknown filter ' + type);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  process(x) { // in place on a Float32Array
    let {x1, x2, y1, y2} = this;
    const {b0, b1, b2, a1, a2} = this;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
    }
    this.x1 = x1; this.x2 = x2; this.y1 = y1; this.y2 = y2;
    return x;
  }
  tick(v) {
    const y = this.b0 * v + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = v; this.y2 = this.y1; this.y1 = y; return y;
  }
}
/** Apply a filter to every channel (fresh state per channel). `passes` > 1 for steeper slopes. */
export function filter(buf, type, freq, {q = Math.SQRT1_2, gainDb = 0, passes = 1} = {}) {
  for (const c of buf.ch) for (let p = 0; p < passes; p++) new Biquad(type, freq, {q, gainDb, sr: buf.sr}).process(c);
  return buf;
}
export const lowpass = (buf, f, o) => filter(buf, 'lowpass', f, o);
export const highpass = (buf, f, o) => filter(buf, 'highpass', f, o);
export const lowshelf = (buf, f, gainDb, o = {}) => filter(buf, 'lowshelf', f, {...o, gainDb});
export const highshelf = (buf, f, gainDb, o = {}) => filter(buf, 'highshelf', f, {...o, gainDb});
export const peakEq = (buf, f, gainDb, q = 1) => filter(buf, 'peak', f, {q, gainDb});
/** Band-pass with a time-varying centre frequency: fn(t) -> Hz (used for whooshes). */
export function sweepFilter(buf, type, fn, {q = 1} = {}) {
  for (const c of buf.ch) {
    const bq = new Biquad(type, fn(0), {q, sr: buf.sr});
    for (let i = 0; i < c.length; i++) {
      if ((i & 31) === 0) bq.set(type, fn(i / buf.sr), {q});
      c[i] = bq.tick(c[i]);
    }
  }
  return buf;
}

// ---------------------------------------------------------------- reverb (Freeverb: parallel combs + series allpasses)
class Comb {
  constructor(n) { this.buf = new Float32Array(n); this.i = 0; this.store = 0; this.feedback = 0.8; this.damp1 = 0.2; this.damp2 = 0.8; }
  tick(x) {
    const out = this.buf[this.i];
    this.store = out * this.damp2 + this.store * this.damp1;
    this.buf[this.i] = x + this.store * this.feedback;
    if (++this.i >= this.buf.length) this.i = 0;
    return out;
  }
}
class Allpass {
  constructor(n) { this.buf = new Float32Array(n); this.i = 0; this.feedback = 0.5; }
  tick(x) {
    const b = this.buf[this.i];
    const out = -x + b;
    this.buf[this.i] = x + b * this.feedback;
    if (++this.i >= this.buf.length) this.i = 0;
    return out;
  }
}
/**
 * Stereo algorithmic reverb. Returns a NEW stereo buffer containing the wet signal only
 * (mix it in yourself), extended by `tail` seconds so the decay is not cut off.
 *   roomSize 0..1 (0.85 ~ 1.5 s hall), damping 0..1 (high-frequency loss),
 *   preDelay seconds, size scales the delay lines (1 = Freeverb defaults, >1 bigger space),
 *   width 0..1 stereo spread, lowCut/highCut filters on the wet output.
 */
export function reverb(input, {roomSize = 0.82, damping = 0.35, preDelay = 0.02, size = 1, width = 1, lowCut = 120, highCut = 9000, tail = 3, gain = 1} = {}) {
  const sr = input.sr;
  const scale = sr / 44100 * size;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => Math.round(n * scale));
  const apT = [556, 441, 341, 225].map((n) => Math.round(n * scale));
  const spread = Math.round(23 * scale);
  const mk = (off) => ({combs: combT.map((n) => { const c = new Comb(n + off); c.feedback = roomSize * 0.28 + 0.7; c.damp1 = damping * 0.4; c.damp2 = 1 - c.damp1; return c; }), aps: apT.map((n) => new Allpass(n + off))});
  const L = mk(0), R = mk(spread);
  const n = length(input), outN = n + secs(tail);
  const out = makeBuffer(outN / sr, 2, sr);
  const mono = toMono(input).ch[0];
  const pd = secs(preDelay);
  const wet1 = (width / 2 + 0.5), wet2 = ((1 - width) / 2);
  const inGain = 0.015 * gain;
  for (let i = 0; i < outN; i++) {
    const k = i - pd;
    const x = (k >= 0 && k < n ? mono[k] : 0) * inGain;
    let l = 0, r = 0;
    for (const c of L.combs) l += c.tick(x);
    for (const c of R.combs) r += c.tick(x);
    for (const a of L.aps) l = a.tick(l);
    for (const a of R.aps) r = a.tick(r);
    out.ch[0][i] = l * wet1 + r * wet2;
    out.ch[1][i] = r * wet1 + l * wet2;
  }
  if (lowCut > 0) highpass(out, lowCut, {passes: 2});
  if (highCut > 0 && highCut < sr / 2) lowpass(out, highCut);
  return out;
}

// ---------------------------------------------------------------- dynamics
/** Soft-knee feed-forward compressor, stereo linked. Works in place. Gain in dB smoothed with attack/release. */
export function compress(buf, {threshold = -18, ratio = 2, knee = 6, attack = 0.02, release = 0.2, makeup = 0, detector = 'peak', rmsWindow = 0.01} = {}) {
  const n = length(buf), sr = buf.sr, chs = buf.ch;
  const aA = Math.exp(-1 / (attack * sr)), aR = Math.exp(-1 / (release * sr));
  const aRms = Math.exp(-1 / (rmsWindow * sr));
  let grDb = 0, rmsSq = 0, maxGr = 0;
  const mk = dB(makeup);
  const computer = (xDb) => {
    const over = xDb - threshold;
    if (2 * over < -knee) return 0;
    if (2 * Math.abs(over) <= knee) { const t = over + knee / 2; return (1 / ratio - 1) * t * t / (2 * knee); }
    return over / ratio - over;
  };
  for (let i = 0; i < n; i++) {
    let lvl = 0;
    if (detector === 'rms') { let s = 0; for (const c of chs) s += c[i] * c[i]; rmsSq = aRms * rmsSq + (1 - aRms) * (s / chs.length); lvl = Math.sqrt(rmsSq); }
    else for (const c of chs) { const v = Math.abs(c[i]); if (v > lvl) lvl = v; }
    const target = computer(toDb(lvl)); // <= 0
    grDb = target < grDb ? aA * grDb + (1 - aA) * target : aR * grDb + (1 - aR) * target;
    if (grDb < maxGr) maxGr = grDb;
    const g = dB(grDb) * mk;
    for (const c of chs) c[i] *= g;
  }
  return {buf, maxGainReductionDb: maxGr};
}

/** 4x oversampled peak estimate (ITU-R BS.1770 style true-peak approximation). */
export function truePeak(buf) {
  const taps = truePeakTaps();
  let p = 0;
  for (const c of buf.ch) {
    const n = c.length;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(c[i]); if (a > p) p = a;
      for (let ph = 1; ph < 4; ph++) {
        let s = 0; const h = taps[ph];
        for (let k = 0; k < h.length; k++) { const j = i + k - 6; if (j >= 0 && j < n) s += h[k] * c[j]; }
        const v = Math.abs(s); if (v > p) p = v;
      }
    }
  }
  return p;
}
let _tpTaps = null;
function truePeakTaps() {
  if (_tpTaps) return _tpTaps;
  // 4-phase polyphase windowed-sinc interpolator, 12 taps per phase
  const N = 12, taps = [];
  for (let ph = 0; ph < 4; ph++) {
    const h = new Float32Array(N); let sum = 0;
    for (let k = 0; k < N; k++) {
      const x = k - 6 + 1 - ph / 4; // sample offset relative to interpolation point
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (k + 0.5) / N);
      const v = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      h[k] = v * w; sum += h[k];
    }
    for (let k = 0; k < N; k++) h[k] /= sum;
    taps.push(h);
  }
  return (_tpTaps = taps);
}

/**
 * Brick-wall look-ahead limiter with true-peak detection. In place, stereo linked.
 * Guarantees sample peaks <= ceiling; the 4x oversampled detector keeps inter-sample peaks below it too.
 */
export function limit(buf, {ceilingDb = -1, lookahead = 0.004, release = 0.08} = {}) {
  const n = length(buf), sr = buf.sr, chs = buf.ch;
  const ceil = dB(ceilingDb);
  const la = Math.max(1, Math.round(lookahead * sr));
  const taps = truePeakTaps();
  // 1. required gain per sample from the oversampled peak
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of chs) {
      const a = Math.abs(c[i]); if (a > p) p = a;
      for (let ph = 1; ph < 4; ph++) { let s = 0; const h = taps[ph]; for (let k = 0; k < 12; k++) { const j = i + k - 6; if (j >= 0 && j < n) s += h[k] * c[j]; } const v = Math.abs(s); if (v > p) p = v; }
    }
    req[i] = p > ceil ? ceil / p : 1;
  }
  // 2. running minimum over the look-ahead window (monotonic deque)
  const mn = new Float32Array(n);
  const dq = new Int32Array(n); let head = 0, tailIdx = 0;
  for (let i = 0; i < n; i++) {
    while (tailIdx > head && req[dq[tailIdx - 1]] >= req[i]) tailIdx--;
    dq[tailIdx++] = i;
    const winStart = i - la + 1; // min over [i-la+1, i] of req -> assign to position i-la+1... we want min over [j, j+la-1]
    while (dq[head] < winStart) head++;
    if (winStart >= 0) mn[winStart] = req[dq[head]];
  }
  for (let i = Math.max(0, n - la + 1); i < n; i++) { let m = 1; for (let j = i; j < n; j++) if (req[j] < m) m = req[j]; mn[i] = m; }
  // 3. attack smoothing: moving average of length la over the running minima (gain reaches the minimum right when the peak arrives)
  const sm = new Float32Array(n); let acc = 0;
  for (let i = 0; i < n; i++) { acc += mn[i]; if (i >= la) acc -= mn[i - la]; sm[i] = acc / Math.min(la, i + 1); }
  // 4. release: one-pole recovery towards 1, never above the smoothed requirement
  const aR = Math.exp(-1 / (release * sr));
  let g = 1, minG = 1;
  for (let i = 0; i < n; i++) {
    const t = sm[i];
    g = t < g ? t : aR * g + (1 - aR) * 1;
    if (g > t) g = t;
    if (g < minG) minG = g;
    for (const c of chs) c[i] *= g;
  }
  // 5. final safety clamp (should never engage)
  for (const c of chs) for (let i = 0; i < n; i++) c[i] = clamp(c[i], -ceil, ceil);
  return {buf, maxGainReductionDb: toDb(minG)};
}

/** Soft saturation: tanh(drive*x)/drive, blended with the dry signal by `mix`. In place. */
export function saturate(buf, {drive = 1.5, mix = 1} = {}) {
  for (const c of buf.ch) for (let i = 0; i < c.length; i++) c[i] = c[i] * (1 - mix) + (Math.tanh(drive * c[i]) / drive) * mix;
  return buf;
}
/** Simple DC blocker. */
export function dcBlock(buf) { return highpass(buf, 8); }

/**
 * Mix a list of tracks {buf, gain (linear), pan, time} into a new stereo buffer of `seconds` and
 * make sure it can never clip: if the sum peaks above `ceiling`, the whole mix is scaled down.
 */
export function mixdown(tracks, {seconds, ceiling = 0.99} = {}) {
  const len = seconds ?? Math.max(...tracks.map((t) => (t.time || 0) + duration(t.buf)));
  const out = makeBuffer(len, 2);
  for (const t of tracks) mixInto(out, t.buf, {time: t.time || 0, gain: t.gain ?? 1, pan: t.pan ?? 0});
  const p = peak(out);
  if (p > ceiling) gainBuffer(out, ceiling / p);
  return out;
}
