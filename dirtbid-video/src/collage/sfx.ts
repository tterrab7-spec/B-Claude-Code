import {cue, scene} from './timeline';
import {STAGE_T} from './scenes/Partners';

export type SfxCue = {t: number; file: string; vol?: number};

/**
 * Sound effect cue sheet, in absolute seconds. Every time is expressed
 * relative to a voiceover cue or scene start so the effects follow the
 * narration if the VO is regenerated. Frame offsets mirror the `*At`
 * constants in each scene file.
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
  {t: s('hook') + 9 * F, file: 'pop', vol: 0.35},
  {t: s('product') + 20 * F, file: 'pop', vol: 0.3},
  {t: L01 - 2 * F, file: 'slap', vol: 0.75},
  {t: L01 + 1 * F, file: 'sparkle', vol: 0.35},
  {t: L01 + 6 * F, file: 'pop', vol: 0.5},
  {t: L02 + 22 * F, file: 'pop-high', vol: 0.55},
  {t: L02 + 30 * F, file: 'slide', vol: 0.4},
  {t: L02 + 40 * F, file: 'pop-low', vol: 0.5},
  // ---- problem: two crossed-out documents, an address card, an asking price
  {t: L03 + 2 * F, file: 'slap', vol: 0.65},
  {t: L03 + 12 * F, file: 'slide', vol: 0.5},
  {t: L03 + 30 * F, file: 'slap', vol: 0.65},
  {t: L03 + 42 * F, file: 'slide', vol: 0.5},
  {t: L03 + 66 * F, file: 'slap', vol: 0.7},
  {t: L03 + 96 * F, file: 'coin', vol: 0.45},
  {t: L04 + 10 * F, file: 'slide', vol: 0.5},
  {t: L04 + 18 * F, file: 'pop-low', vol: 0.45},
  {t: L04 + 22 * F, file: 'pop-high', vol: 0.3}, {t: L04 + 27 * F, file: 'pop-high', vol: 0.3}, {t: L04 + 32 * F, file: 'pop-high', vol: 0.3},
  {t: L04 + 68 * F, file: 'riffle', vol: 0.45},
  {t: L04 + 84 * F, file: 'slide', vol: 0.4},
  // ---- stakes
  {t: L05 + 4 * F, file: 'slap', vol: 0.7},
  {t: L05 + 32 * F, file: 'thud', vol: 0.6},
  {t: L05 + 62 * F, file: 'slap', vol: 0.7},
  {t: L05 + 70 * F, file: 'pop-low', vol: 0.4},
  {t: L06 + 22 * F, file: 'stamp', vol: 0.8},
  {t: L06 + 26 * F, file: 'sad-slide', vol: 0.45},
  {t: L06 + 62 * F, file: 'whoosh', vol: 0.55},
  {t: L06 + 84 * F, file: 'thud', vol: 0.75},
  {t: L06 + 86 * F, file: 'coin', vol: 0.45},
  {t: L06 + 112 * F, file: 'tear', vol: 0.6},
  {t: L06 + 116 * F, file: 'tick', vol: 0.3}, {t: L06 + 124 * F, file: 'tick', vol: 0.3}, {t: L06 + 132 * F, file: 'tick', vol: 0.3}, {t: L06 + 140 * F, file: 'tick', vol: 0.3},
  {t: L06 + 128 * F, file: 'sad-slide', vol: 0.55},
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
  {t: L08 - 10 * F, file: 'pop', vol: 0.5},
  ...Array.from({length: 9}).map((_, i) => ({t: L08 + (-4 + i * 4) * F, file: 'tick', vol: 0.28})),
  {t: L08 + 34 * F, file: 'pop-high', vol: 0.4},
  {t: L08 + 36 * F, file: 'whoosh-down', vol: 0.5},
  {t: L08 + 44 * F, file: 'thud', vol: 0.55},
  ...[0, 1, 2, 3, 4, 5].map((i) => ({t: L09 + (18 + i * 8) * F, file: i % 2 ? 'pop-high' : 'pop', vol: 0.45})),
  {t: L09 + 74 * F, file: 'stamp', vol: 0.75},
  {t: L09 + 100 * F, file: 'pop', vol: 0.5},
  {t: L09 + 142 * F, file: 'riffle', vol: 0.55},
  ...[0, 1, 2, 3, 4].map((i) => ({t: L09 + (152 + i * 9) * F, file: 'tick', vol: 0.45})),
  {t: L09 + 200 * F, file: 'pop-high', vol: 0.5},
  {t: L09 + 212 * F, file: 'coin', vol: 0.6},
  {t: L09 + 230 * F, file: 'stamp', vol: 0.8},
  {t: L09 + 234 * F, file: 'success', vol: 0.5},
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
  ...STAGE_T.map((t) => ({t: L11 + t, file: 'slap', vol: 0.6})),
  ...STAGE_T.map((t, i) => ({t: L11 + t + 9 * F, file: ['ding', 'ding-2', 'ding-3', 'ding', 'ding-2', 'ding-3'][i], vol: 0.4})),
  {t: L11 + 5.5, file: 'pop-low', vol: 0.5},
  ...[0, 1, 2, 3, 4, 5].map((i) => ({t: L11 + 6.2 + i * 5 * F, file: i % 2 ? 'pop-high' : 'pop', vol: 0.4})),
  {t: L11 + 7.0, file: 'success', vol: 0.55},
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
