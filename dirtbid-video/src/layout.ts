import {useVideoConfig} from 'remotion';

export type Aspect = 'vertical' | 'square' | 'wide';
export type Box = {x: number; y: number; w: number; h: number};

/** Side of the centered safe square. All critical type and numbers live inside it. */
export const SAFE = 920;

export type Layout = {
  aspect: Aspect;
  W: number;
  H: number;
  /** Centered safe square */
  safe: Box;
  /** Where the hero graphic (parcel, chart) sits for graphic + text scenes */
  graphic: Box;
  /** Where the kinetic type sits for graphic + text scenes. Always inside `safe`. */
  text: Box;
  cx: number;
  cy: number;
  /** Multiplier on the type scale so long headlines fit the narrower wide-format text column */
  textScale: number;
};

export const getLayout = (W: number, H: number): Layout => {
  const aspect: Aspect = W === H ? 'square' : W > H ? 'wide' : 'vertical';
  const safe: Box = {x: (W - SAFE) / 2, y: (H - SAFE) / 2, w: SAFE, h: SAFE};
  const cx = W / 2;
  const cy = H / 2;

  if (aspect === 'vertical') {
    // Graphic rides above the safe square, type fills the lower ~70% of it.
    return {
      aspect, W, H, safe, cx, cy,
      graphic: {x: 140, y: 150, w: 800, h: 600},
      text: {x: safe.x, y: safe.y + 290, w: SAFE, h: SAFE - 290},
      textScale: 1,
    };
  }
  if (aspect === 'square') {
    // Everything is stacked inside the square; graphic is smaller.
    return {
      aspect, W, H, safe, cx, cy,
      graphic: {x: 290, y: 50, w: 500, h: 400},
      text: {x: safe.x, y: safe.y + 410, w: SAFE, h: SAFE - 410},
      textScale: 0.86,
    };
  }
  // Wide: graphic sits to the left of the safe square's centre, type takes the
  // right two thirds of the square.
  return {
    aspect, W, H, safe, cx, cy,
    graphic: {x: 90, y: 150, w: 720, h: 780},
    text: {x: 840, y: safe.y, w: 580, h: SAFE},
    textScale: 0.8,
  };
};

export const useLayout = (): Layout => {
  const {width, height} = useVideoConfig();
  return getLayout(width, height);
};

export const boxStyle = (b: Box): React.CSSProperties => ({
  position: 'absolute',
  left: b.x,
  top: b.y,
  width: b.w,
  height: b.h,
});

export const center = (b: Box) => ({x: b.x + b.w / 2, y: b.y + b.h / 2});
