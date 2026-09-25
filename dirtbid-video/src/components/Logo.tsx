import React from 'react';
import {colors, fonts} from '../theme';
import {content} from '../content';

/**
 * DirtBid mark: three strata of earth stacked as an excavation profile.
 * 12 segments (5 / 4 / 3) so the amber flags from the problem scene can
 * snap into it one-for-one.
 */
export const MARK_SEGMENTS: {x: number; y: number; w: number; h: number; row: number}[] = (() => {
  const rows = [
    {n: 5, x0: 4, x1: 96, y: 4},
    {n: 4, x0: 14, x1: 86, y: 36},
    {n: 3, x0: 24, x1: 76, y: 68},
  ];
  const h = 26;
  const gap = 5;
  const out: {x: number; y: number; w: number; h: number; row: number}[] = [];
  rows.forEach((r, ri) => {
    const span = r.x1 - r.x0;
    const w = (span - gap * (r.n - 1)) / r.n;
    for (let i = 0; i < r.n; i++) out.push({x: r.x0 + i * (w + gap), y: r.y, w, h, row: ri});
  });
  return out;
})();

export const rowColor = (row: number) => [colors.sand, colors.clay, colors.clayDeep][row];

export const Mark: React.FC<{size: number; style?: React.CSSProperties}> = ({size, style}) => (
  <svg viewBox="0 0 100 100" width={size} height={size} style={style}>
    {MARK_SEGMENTS.map((s, i) => (
      <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={2} fill={rowColor(s.row)} />
    ))}
  </svg>
);

export const Wordmark: React.FC<{size: number; style?: React.CSSProperties}> = ({size, style}) => (
  <div
    style={{
      fontFamily: fonts.headline,
      fontSize: size,
      letterSpacing: -size * 0.03,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      color: colors.sand,
      ...style,
    }}
  >
    {content.brand.wordmarkA}
    <span style={{color: colors.clay}}>{content.brand.wordmarkB}</span>
  </div>
);

export const Lockup: React.FC<{size: number; style?: React.CSSProperties}> = ({size, style}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: size * 0.28, ...style}}>
    <Mark size={size} />
    <Wordmark size={size * 0.92} />
  </div>
);
