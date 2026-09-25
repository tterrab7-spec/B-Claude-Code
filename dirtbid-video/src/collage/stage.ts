import {useVideoConfig} from 'remotion';

export type Aspect = 'wide' | 'vertical' | 'square';
export type Pt = {x: number; y: number; s?: number; r?: number};
/** Per-aspect placement. `s` is a scale multiplier, `r` a rotation in degrees. */
export type Place = {wide: Pt; vertical: Pt; square: Pt};

export type Stage = {
  W: number;
  H: number;
  aspect: Aspect;
  cx: number;
  cy: number;
  /** Safe square side and origin: all critical type stays inside it */
  safe: {x: number; y: number; w: number; h: number};
  /** Resolve a per-aspect placement */
  at: (p: Place) => Required<Pt>;
  /** Global scale for sizes: 1 on wide, ~0.8 on square, 0.92 on vertical */
  k: number;
};

export const useStage = (): Stage => {
  const {width: W, height: H} = useVideoConfig();
  const aspect: Aspect = W === H ? 'square' : W > H ? 'wide' : 'vertical';
  const side = Math.min(W, H) - 140;
  const safe = {x: (W - side) / 2, y: (H - side) / 2, w: side, h: side};
  const k = aspect === 'wide' ? 1 : aspect === 'vertical' ? 0.92 : 0.82;
  return {
    W, H, aspect, cx: W / 2, cy: H / 2, safe, k,
    at: (p) => {
      const q = p[aspect];
      return {x: q.x, y: q.y, s: (q.s ?? 1) * k, r: q.r ?? 0};
    },
  };
};
