import {Easing, interpolate, spring} from 'remotion';
import {FPS} from './timeline';

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const easeOut = Easing.out(Easing.cubic);
export const easeIn = Easing.in(Easing.cubic);
export const easeInOut = Easing.inOut(Easing.cubic);
export const backOut = Easing.out(Easing.back(1.4));

/** Deterministic noise in [-1, 1] from an integer + seed. */
export const noise = (i: number, seed = 1) => {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

/** Smooth 1D value noise, for handheld drift. */
export const smoothNoise = (t: number, seed = 1) => {
  const i = Math.floor(t);
  const fr = t - i;
  const u = fr * fr * (3 - 2 * fr);
  return noise(i, seed) * (1 - u) + noise(i + 1, seed) * u;
};

/** Quantize a frame to a lower rate for stop-motion feel. */
export const stepped = (frame: number, rate = 12) => Math.floor((frame * rate) / FPS) * (FPS / rate);

/** 0..1 progress between two frames with easing. */
export const prog = (frame: number, from: number, dur: number, easing = easeOut) =>
  interpolate(frame, [from, from + dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});

/** A sticker slapped down: comes from above the page (big, faint) and lands with a small overshoot. */
export const slap = (frame: number, at: number) => {
  if (frame < at) return {scale: 0, opacity: 0, rotate: 0, shadow: 0};
  const p = prog(frame, at, 5, easeIn);
  const settle = spring({frame: frame - at - 4, fps: FPS, config: {damping: 11, stiffness: 320, mass: 0.6}});
  const scale = frame < at + 5 ? interpolate(p, [0, 1], [1.45, 1.0]) : 1 - 0.06 * (1 - settle) * Math.cos((frame - at - 4) * 0.9);
  return {scale: Math.max(0.01, scale), opacity: interpolate(p, [0, 0.4], [0, 1], {extrapolateRight: 'clamp'}), rotate: 0, shadow: interpolate(p, [0, 1], [0.15, 1])};
};

/** Pop in: spring scale from 0 with slight overshoot. */
export const pop = (frame: number, at: number, overshoot = 1) => {
  if (frame < at) return 0;
  return spring({frame: frame - at, fps: FPS, config: {damping: 10 + (1 - overshoot) * 20, stiffness: 240, mass: 0.7}});
};

/** Slide in with a critically damped spring (no bounce). */
export const slide = (frame: number, at: number, dur = 16) => prog(frame, at, dur, easeOut);

/** Gentle wobble rotation in degrees (paper never sits perfectly still). */
export const wobble = (frame: number, seed = 1, amount = 1.2, speed = 0.05) => smoothNoise(frame * speed, seed) * amount;

/** Breathing bob for characters at a stepped rate. */
export const bob = (frame: number, seed = 1) => {
  const s = stepped(frame, 8);
  return {y: Math.round(Math.sin(s * 0.11 + seed) * 4), rotate: Math.round(Math.sin(s * 0.07 + seed * 2) * 1.5 * 2) / 2};
};

/** Write-on progress in 0..1 for hand text. */
export const writeOn = (frame: number, at: number, dur = 18) => prog(frame, at, dur, Easing.inOut(Easing.quad));
