import React from 'react';
import {useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import {C, F} from '../theme';
import {Item} from './Item';
import {Tape} from './Tape';
import {slap, pop, wobble} from '../motion';
import {copy} from '../content';
import {useStage} from '../stage';
import {TIMELINE} from '../timeline';

/**
 * The DirtBid mark: a teal V with a gold inner V, drawn as four rounded
 * strokes in a 100-unit box (geometry traced from the supplied app icon).
 */
export const STROKES = [
  {x1: 21, y1: 30, x2: 50, y2: 63, w: 12.5, grad: 'teal'},
  {x1: 79, y1: 30, x2: 50, y2: 63, w: 12.5, grad: 'teal'},
  {x1: 34, y1: 42, x2: 50, y2: 75, w: 11, grad: 'gold'},
  {x1: 66, y1: 42, x2: 50, y2: 75, w: 11, grad: 'gold'},
] as const;

const Grads: React.FC<{id: string}> = ({id}) => (
  <defs>
    <linearGradient id={`${id}-teal`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={C.brandTealLight} />
      <stop offset="1" stopColor={C.brandTealDeep} />
    </linearGradient>
    <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={C.brandGold} />
      <stop offset="1" stopColor={C.brandGoldDeep} />
    </linearGradient>
  </defs>
);

export const Mark: React.FC<{size: number; id?: string}> = ({size, id = 'mk'}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{display: 'block', overflow: 'visible'}}>
    <Grads id={id} />
    {STROKES.map((s, i) => (
      <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={`url(#${id}-${s.grad})`} strokeWidth={s.w} strokeLinecap="round" />
    ))}
  </svg>
);

/** "DirtBid" in the brand typeface: navy + teal. */
export const Wordmark: React.FC<{size: number; color?: string}> = ({size, color = C.brandNavy}) => (
  <div style={{fontFamily: F.brand, fontWeight: 800, fontSize: size, lineHeight: 1, color, letterSpacing: -size * 0.03, whiteSpace: 'nowrap'}}>
    {copy.brand.a}<span style={{color: C.brandTeal}}>{copy.brand.b}</span>
  </div>
);

export const BrandTagline: React.FC<{size: number}> = ({size}) => (
  <div style={{fontFamily: F.brand, fontWeight: 500, fontSize: size, letterSpacing: size * 0.18, color: C.brandGray, whiteSpace: 'nowrap', lineHeight: 1}}>{copy.brand.tagline}</div>
);

/** Full lockup on a white sticker plate: mark, wordmark, tagline. */
export const Lockup: React.FC<{size?: number; at?: number; tagline?: boolean; id?: string}> = ({size = 120, at = 0, tagline = true, id = 'lk'}) => {
  const frame = useCurrentFrame();
  const s = slap(frame, at);
  return (
    <div style={{transform: `scale(${s.scale})`, opacity: s.opacity, position: 'relative', display: 'flex', alignItems: 'center', gap: size * 0.22, padding: `${size * 0.18}px ${size * 0.32}px`, background: C.white}}>
      <Mark size={size * 1.15} id={id} />
      <div style={{display: 'flex', flexDirection: 'column', gap: size * 0.1}}>
        <Wordmark size={size * 0.86} />
        {tagline && <BrandTagline size={size * 0.2} />}
      </div>
      <Tape x={size * 0.25} y={0} w={size * 0.9} h={size * 0.24} color={C.tapeTeal} rotate={-16} />
      <Tape w={size * 0.8} h={size * 0.22} color={C.tapePeach} rotate={-20} style={{left: 'auto', right: -size * 0.28, top: 'auto', bottom: -size * 0.1, transform: 'rotate(-24deg)'}} />
    </div>
  );
};

/**
 * Animated mark for the turn: the four strokes fly in from the edges of the
 * frame and snap into the V. `at` is the first stroke's start frame.
 */
export const FlyingMark: React.FC<{cx: number; cy: number; size: number; at: number; W: number; H: number}> = ({cx, cy, size, at, W, H}) => {
  const frame = useCurrentFrame();
  const R = Math.max(W, H) * 0.7;
  const angles = [Math.PI * 1.2, Math.PI * 1.8, Math.PI * 0.85, Math.PI * 0.15];
  // once the strips have snapped together (under the burst), swap to the one-piece mark
  const settledAt = at + 24;
  if (frame >= settledAt) {
    return (
      <Item x={cx} y={cy} rotate={wobble(frame, 40, 0.4)} sticker="thin" shadow={0.8} z={5}>
        <Mark size={size} id="flymk" />
      </Item>
    );
  }
  return (
    <>
      {STROKES.map((s, i) => {
        const p = pop(frame, at + i * 4, 0.6);
        const mx = ((s.x1 + s.x2) / 2 / 100 - 0.5) * size, my = ((s.y1 + s.y2) / 2 / 100 - 0.5) * size;
        const x = cx + mx + Math.cos(angles[i]) * R * (1 - p);
        const y = cy + my + Math.sin(angles[i]) * R * (1 - p);
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / 100 * size;
        const w = (s.w / 100) * size;
        const ang = (Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI;
        return (
          <Item key={i} x={x} y={y} scale={0.5 + 0.5 * p} rotate={ang + (1 - p) * (i % 2 ? 140 : -140) + wobble(frame, 40 + i, 0.4)} opacity={p > 0.02 ? 1 : 0} sticker="thin" shadow={0.8} z={5 + i}>
            <svg width={len + w} height={w} viewBox={`0 0 ${len + w} ${w}`} style={{display: 'block', overflow: 'visible'}}>
              {/* user-space gradient: a horizontal line has a zero-height bounding box, which would make a bbox gradient paint nothing */}
              <defs>
                <linearGradient id={`fly${i}`} gradientUnits="userSpaceOnUse" x1={w / 2} y1={0} x2={len + w / 2} y2={0}>
                  <stop offset="0" stopColor={s.grad === 'teal' ? C.brandTealLight : C.brandGold} />
                  <stop offset="1" stopColor={s.grad === 'teal' ? C.brandTealDeep : C.brandGoldDeep} />
                </linearGradient>
              </defs>
              <line x1={w / 2} y1={w / 2} x2={len + w / 2} y2={w / 2} stroke={`url(#fly${i})`} strokeWidth={w} strokeLinecap="round" />
            </svg>
          </Item>
        );
      })}
    </>
  );
};

/**
 * Persistent corner logo: a small sticker with the mark and wordmark in the
 * top-left of every scene. Hidden during the turn and the end card, where the
 * full lockup is on screen.
 */
export const Bug: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const S = useStage();
  const t = frame / fps;
  const hidden = TIMELINE.scenes.some((s) => (s.id === 'turn' || s.id === 'cta') && t >= s.start - 0.3 && t < s.end);
  const size = S.aspect === 'wide' ? 44 : 40;
  const P = S.at({wide: {x: 150, y: 76}, vertical: {x: 150, y: 76}, square: {x: 140, y: 70}});
  const o = interpolate(frame, [8, 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const dropAt = TIMELINE.scenes.find((s) => s.id === 'product');
  const inP = pop(frame, 8, 0.9);
  const reIn = dropAt ? pop(frame, Math.round(dropAt.start * fps) + 20, 0.9) : 1;
  const scale = t < (dropAt?.start ?? 0) ? inP : reIn;
  if (hidden) return null;
  return (
    <Item x={P.x} y={P.y} scale={scale} opacity={o} rotate={-2 + wobble(frame, 99, 0.6)} z={100} sticker="thin" shadow={0.8}>
      <div style={{display: 'flex', alignItems: 'center', gap: size * 0.22, padding: `${size * 0.12}px ${size * 0.3}px`, background: C.white}}>
        <Mark size={size * 1.1} id="bug" />
        <Wordmark size={size * 0.82} />
      </div>
    </Item>
  );
};
