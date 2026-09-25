import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, F} from '../theme';
import {Item} from './Item';
import {Tape} from './Tape';
import {slap, pop, wobble} from '../motion';
import {copy} from '../content';

/** Mark geometry: three strata of paper strips (5 / 4 / 3) in a 100-unit box. */
export const STRIPS = (() => {
  const rows = [
    {n: 5, x0: 2, x1: 98, y: 4, c: '#EADFCB'},
    {n: 4, x0: 12, x1: 88, y: 36, c: C.clay},
    {n: 3, x0: 22, x1: 78, y: 68, c: C.clayDeep},
  ];
  const out: {x: number; y: number; w: number; h: number; c: string; row: number}[] = [];
  rows.forEach((r, ri) => {
    const gap = 5, w = (r.x1 - r.x0 - gap * (r.n - 1)) / r.n;
    for (let i = 0; i < r.n; i++) out.push({x: r.x0 + i * (w + gap), y: r.y, w, h: 27, c: r.c, row: ri});
  });
  return out;
})();

/** Static mark (for the end card). */
export const Mark: React.FC<{size: number}> = ({size}) => (
  <div style={{position: 'relative', width: size, height: size}}>
    {STRIPS.map((s, i) => (
      <div key={i} style={{position: 'absolute', left: (s.x / 100) * size, top: (s.y / 100) * size, width: (s.w / 100) * size, height: (s.h / 100) * size, background: s.c, borderRadius: size * 0.03, border: `${Math.max(2, size * 0.012)}px solid ${C.ink}`, boxSizing: 'border-box'}} />
    ))}
  </div>
);

export const Wordmark: React.FC<{size: number}> = ({size}) => (
  <div style={{fontFamily: F.round, fontWeight: 700, fontSize: size, lineHeight: 1, color: C.ink, letterSpacing: -size * 0.02, whiteSpace: 'nowrap'}}>
    {copy.brand.a}<span style={{color: C.clay}}>{copy.brand.b}</span>
  </div>
);

/** Logo lockup on a white sticker plate with tape. */
export const Lockup: React.FC<{size?: number; at?: number}> = ({size = 120, at = 0}) => {
  const frame = useCurrentFrame();
  const s = slap(frame, at);
  return (
    <div style={{transform: `scale(${s.scale})`, opacity: s.opacity, position: 'relative', display: 'flex', alignItems: 'center', gap: size * 0.3, padding: `${size * 0.18}px ${size * 0.3}px`, background: C.white}}>
      <Mark size={size} />
      <Wordmark size={size * 0.95} />
      <Tape x={size * 0.2} y={0} w={size * 0.9} h={size * 0.24} color={C.tapeTeal} rotate={-16} />
      <Tape w={size * 0.8} h={size * 0.22} color={C.tapePeach} rotate={-20} style={{left: 'auto', right: -size * 0.28, top: 'auto', bottom: -size * 0.1, transform: 'rotate(-24deg)'}} />
    </div>
  );
};

/**
 * Animated mark: the strips fly in from around the frame and slap into place.
 * Returns absolutely positioned Items; place inside a scene at (cx, cy).
 */
export const FlyingMark: React.FC<{cx: number; cy: number; size: number; at: number; W: number; H: number}> = ({cx, cy, size, at, W, H}) => {
  const frame = useCurrentFrame();
  return (
    <>
      {STRIPS.map((s, i) => {
        const t = at + (i % 5) * 2 + s.row * 4;
        const p = pop(frame, t, 0.6);
        const a = (i / STRIPS.length) * Math.PI * 2 + 0.7;
        const R = Math.max(W, H) * 0.7;
        const tx = cx + ((s.x + s.w / 2) / 100 - 0.5) * size;
        const ty = cy + ((s.y + s.h / 2) / 100 - 0.5) * size;
        const x = tx + Math.cos(a) * R * (1 - p);
        const y = ty + Math.sin(a) * R * (1 - p);
        return (
          <Item key={i} x={x} y={y} scale={0.4 + 0.6 * p} rotate={(1 - p) * (i % 2 ? 90 : -90) + wobble(frame, 40 + i, 0.6)} opacity={p > 0.02 ? 1 : 0} sticker="thin" shadow={0.8} z={5}>
            <div style={{width: (s.w / 100) * size, height: (s.h / 100) * size, background: s.c, borderRadius: size * 0.03, border: `${Math.max(2, size * 0.012)}px solid ${C.ink}`, boxSizing: 'border-box'}} />
          </Item>
        );
      })}
    </>
  );
};
