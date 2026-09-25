/**
 * Master timeline for the collage cut. Every number is seconds.
 * Voiceover starts are derived from the real line durations in
 * public/audio/vo/manifest.json plus the gaps below, so regenerating the VO
 * re-flows the whole animation.
 */
import manifest from '../../public/audio/vo/manifest.json';

export const FPS = 30;

type Line = {id: string; scene: string; text: string; file: string; seconds: number};
const LINES = manifest as Line[];

import timing from './timing-config.json';
const GAP_BEFORE: Record<string, number> = timing.gapBefore;
const HOLD_AFTER_SCENE: Record<string, number> = timing.holdAfterScene;

export type Cue = {id: string; start: number; end: number; text: string; file: string; scene: string};
export type SceneSpan = {id: string; start: number; end: number; lines: Cue[]};

const build = () => {
  const cues: Cue[] = [];
  const scenes: SceneSpan[] = [];
  let t = 0;
  let current: SceneSpan | null = null;
  for (const l of LINES) {
    if (!current || current.id !== l.scene) {
      if (current) {
        current.end = t + HOLD_AFTER_SCENE[current.id];
        t = current.end;
      }
      current = {id: l.scene, start: t, end: t, lines: []};
      scenes.push(current);
    }
    t += GAP_BEFORE[l.id] ?? 0.4;
    const cue = {id: l.id, start: t, end: t + l.seconds, text: l.text, file: l.file, scene: l.scene};
    cues.push(cue);
    current.lines.push(cue);
    t = cue.end;
  }
  if (current) {
    current.end = t + HOLD_AFTER_SCENE[current.id];
    t = current.end;
  }
  return {cues, scenes, total: t};
};

export const TIMELINE = build();
export const TOTAL_SECONDS = TIMELINE.total;
export const TOTAL_FRAMES = Math.ceil(TOTAL_SECONDS * FPS);

export const cue = (id: string): Cue => {
  const c = TIMELINE.cues.find((x) => x.id === id);
  if (!c) throw new Error(`no cue ${id}`);
  return c;
};
export const scene = (id: string): SceneSpan => {
  const s = TIMELINE.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
};
/** Seconds to frames */
export const f = (seconds: number) => Math.round(seconds * FPS);
