import {cue, scene} from './timeline';

export type SfxCue = {t: number; file: string; vol?: number};

/**
 * Sound effect cue sheet, in absolute seconds. Every time is expressed
 * relative to a voiceover cue or scene start so the effects follow the
 * narration if the VO is regenerated. Frame offsets in the scene files use
 * the same anchors (see each scene's `*At` constants).
 */
const s = (id: string) => scene(id).start;
const c = (id: string) => cue(id).start;
const F = 1 / 30;

const L01 = c('L01'), L02 = c('L02'), L03 = c('L03'), L04 = c('L04'), L05 = c('L05'), L06 = c('L06'), L07 = c('L07'), L08 = c('L08'), L09 = c('L09'), L10 = c('L10'), L11 = c('L11'), L12 = c('L12'), L13 = c('L13');

export const SFX_CUES: SfxCue[] = [
  // ---- hook
  {t: s('hook') + 6 * F, file: 'slap', vol: 0.7},
  {t: s('hook') + 2 * F, file: 'pop-low', vol: 0.3},
  {t: s('hook') + 8 * F, file: 'pop-high', vol: 0.3},
  {t: L01 - 2 * F, file: 'slap', vol: 0.75},
  {t: L01 + 1 * F, file: 'sparkle', vol: 0.35},
  {t: L01 + 6 * F, file: 'pop', vol: 0.5},
  {t: L02 + 22 * F, file: 'pop-high', vol: 0.55},
  {t: L02 + 30 * F, file: 'slide', vol: 0.4},
  {t: L02 + 40 * F, file: 'pop-low', vol: 0.5},
  // ---- problem
  {t: L03 + 10 * F, file: 'slap', vol: 0.65},
  {t: L03 + 36 * F, file: 'slap', vol: 0.65},
  {t: L03 + 62 * F, file: 'slap', vol: 0.65},
  {t: L04 + 14 * F, file: 'slide', vol: 0.5},
  {t: L04 + 20 * F, file: 'pop-low', vol: 0.45},
  {t: L04 + 24 * F, file: 'pop-high', vol: 0.3},
  {t: L04 + 29 * F, file: 'pop-high', vol: 0.3},
  {t: L04 + 34 * F, file: 'pop-high', vol: 0.3},
  {t: L04 + 62 * F, file: 'riffle', vol: 0.45},
  {t: L04 + 78 * F, file: 'slide', vol: 0.4},
  // ---- stakes
  {t: L05 + 4 * F, file: 'slap', vol: 0.7},
  {t: L05 + 32 * F, file: 'thud', vol: 0.6},
  {t: L05 + 62 * F, file: 'slap', vol: 0.7},
  {t: L05 + 70 * F, file: 'pop-low', vol: 0.4},
  {t: L06 + 2 * F, file: 'whoosh', vol: 0.55},
  {t: L06 + 32 * F, file: 'thud', vol: 0.75},
  {t: L06 + 34 * F, file: 'coin', vol: 0.45},
  {t: L06 + 76 * F, file: 'tear', vol: 0.6},
  {t: L06 + 80 * F, file: 'tick', vol: 0.3}, {t: L06 + 88 * F, file: 'tick', vol: 0.3}, {t: L06 + 96 * F, file: 'tick', vol: 0.3}, {t: L06 + 104 * F, file: 'tick', vol: 0.3},
  {t: L06 + 92 * F, file: 'sad-slide', vol: 0.55},
  // ---- transition + turn
  {t: s('turn') + 0 * F, file: 'tear', vol: 0.7},
  {t: s('turn') + 4 * F, file: 'whoosh', vol: 0.5},
  {t: s('turn') + 12 * F, file: 'pop', vol: 0.3}, {t: s('turn') + 16 * F, file: 'pop-high', vol: 0.3}, {t: s('turn') + 20 * F, file: 'pop-low', vol: 0.3},
  {t: s('turn') + 26 * F, file: 'sparkle', vol: 0.5},
  {t: L07 - 2 * F, file: 'slap', vol: 0.75},
  {t: L07 + 40 * F, file: 'slide', vol: 0.45},
  {t: L07 + 24 * F, file: 'pop-high', vol: 0.4},
  // ---- transition + product
  {t: s('product') + 0 * F, file: 'tear', vol: 0.6},
  {t: s('product') + 2 * F, file: 'slap', vol: 0.65},
  {t: L08 + 10 * F, file: 'whoosh-down', vol: 0.5},
  {t: L08 + 18 * F, file: 'thud', vol: 0.55},
  {t: L08 + 16 * F, file: 'pop-high', vol: 0.4},
  ...[0, 1, 2, 3, 4, 5].map((i) => ({t: L09 + (20 + i * 8) * F, file: i % 2 ? 'pop-high' : 'pop', vol: 0.45})),
  {t: L09 + 74 * F, file: 'stamp', vol: 0.75},
  {t: L09 + 88 * F, file: 'riffle', vol: 0.55},
  ...[0, 1, 2, 3, 4].map((i) => ({t: L09 + (100 + i * 11) * F, file: 'tick', vol: 0.45})),
  {t: L09 + 168 * F, file: 'coin', vol: 0.6},
  {t: L09 + 172 * F, file: 'pop', vol: 0.5},
  {t: L09 + 214 * F, file: 'pop-high', vol: 0.5},
  {t: L10 - 2 * F, file: 'whoosh', vol: 0.45},
  {t: L10 + 6 * F, file: 'pop-low', vol: 0.55},
  {t: L10 + 12 * F, file: 'clock-sweep', vol: 0.55},
  {t: L10 + 24 * F, file: 'pop', vol: 0.45},
  {t: L10 + 34 * F, file: 'tear', vol: 0.35},
  {t: L10 + 58 * F, file: 'slap', vol: 0.7},
  {t: L10 + 64 * F, file: 'sparkle', vol: 0.45},
  // ---- partners
  {t: L11 + 6 * F, file: 'riffle', vol: 0.4},
  {t: L11 + 24 * F, file: 'slide', vol: 0.5},
  ...[2.85, 3.35, 3.9, 4.45, 4.95, 6.4].map((t) => ({t: L11 + t, file: 'slap', vol: 0.6})),
  ...[2.85, 3.35, 3.9, 4.45, 4.95, 6.4].map((t, i) => ({t: L11 + t + 9 * F, file: ['ding', 'ding-2', 'ding-3', 'ding', 'ding-2', 'ding-3'][i], vol: 0.4})),
  {t: L11 + 5.9, file: 'pop-low', vol: 0.5},
  ...[0, 1, 2, 3, 4, 5].map((i) => ({t: L11 + 6.7 + i * 5 * F, file: i % 2 ? 'pop-high' : 'pop', vol: 0.4})),
  {t: L11 + 7.7, file: 'success', vol: 0.55},
  // ---- transition + cta
  {t: s('cta') + 0 * F, file: 'tear', vol: 0.7},
  {t: s('cta') + 4 * F, file: 'slap', vol: 0.6},
  {t: L12 + 2 * F, file: 'pop', vol: 0.45},
  {t: L12 + 52 * F, file: 'slap', vol: 0.8},
  {t: L12 + 62 * F, file: 'slide', vol: 0.5},
  {t: L12 + 78 * F, file: 'pop-high', vol: 0.5},
  {t: L12 + 84 * F, file: 'sparkle', vol: 0.5},
  {t: L13 + 2 * F, file: 'pop', vol: 0.45},
  {t: L13 + 14 * F, file: 'whoosh', vol: 0.45},
  {t: L13 + 36 * F, file: 'slide', vol: 0.35},
  {t: L13 + 60 * F, file: 'sparkle', vol: 0.35},
];
