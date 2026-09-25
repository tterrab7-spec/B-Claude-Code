/**
 * Scene timing. Durations are in frames at 30 fps.
 * Change a number here to retime a scene; the scenes after it shift
 * automatically. Total must stay at 1800 frames (60 s) for the master.
 */
export const FPS = 30;

export const SCENES = [
  {id: 'hook', frames: 150}, // 0:00 – 0:05
  {id: 'problem', frames: 330}, // 0:05 – 0:16
  {id: 'stakes', frames: 300}, // 0:16 – 0:26
  {id: 'turn', frames: 150}, // 0:26 – 0:31
  {id: 'product', frames: 390}, // 0:31 – 0:44
  {id: 'partners', frames: 330}, // 0:44 – 0:55
  {id: 'cta', frames: 150}, // 0:55 – 1:00
] as const;

export type SceneId = (typeof SCENES)[number]['id'];

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0);

export const sceneStart = (id: SceneId): number => {
  let n = 0;
  for (const s of SCENES) {
    if (s.id === id) return n;
    n += s.frames;
  }
  return n;
};

export const sceneFrames = (id: SceneId): number =>
  SCENES.find((s) => s.id === id)?.frames ?? 0;

/**
 * Transitions into each scene. 'cut' is a hard cut. 'wipe' is a wipe along a
 * survey line over `overlap` frames. 'iris' is a mask reveal from the center.
 * Overlap frames are taken from the tail of the previous scene.
 */
export const TRANSITIONS: Record<SceneId, {kind: 'cut' | 'wipe' | 'iris'; overlap: number}> = {
  hook: {kind: 'cut', overlap: 0},
  problem: {kind: 'cut', overlap: 0},
  stakes: {kind: 'wipe', overlap: 14},
  turn: {kind: 'cut', overlap: 0},
  product: {kind: 'cut', overlap: 0},
  partners: {kind: 'wipe', overlap: 14},
  cta: {kind: 'iris', overlap: 16},
};
