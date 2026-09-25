import React from 'react';
import {C} from '../theme';
import {RPoly, RLine} from './Rough';

/** Parcel outline in a 400x400 box. Irregular, with corner stakes. */
export const PARCEL_PTS: [number, number][] = [[52, 108], [172, 44], [312, 74], [372, 208], [318, 350], [166, 372], [56, 288]];

export const Parcel: React.FC<{size?: number; fill?: string; fillStyle?: string; draw?: number; seed?: number; children?: React.ReactNode; stakes?: boolean; hachureGap?: number; stroke?: string}> = ({
  size = 400, fill = C.khaki, fillStyle = 'hachure', draw, seed = 11, children, stakes = true, hachureGap = 9, stroke = C.ink,
}) => (
  <svg width={size} height={size} viewBox="0 0 400 400" style={{display: 'block', overflow: 'visible'}}>
    <RPoly pts={PARCEL_PTS} seed={seed} opts={{fill, fillStyle, hachureGap, fillWeight: 1.6, stroke, strokeWidth: 4, roughness: 1.6}} draw={draw} />
    {children}
    {stakes && PARCEL_PTS.map(([x, y], i) => (
      <g key={i} opacity={draw === undefined ? 1 : draw > (i + 1) / PARCEL_PTS.length - 0.05 ? 1 : 0}>
        <RLine x1={x} y1={y + 4} x2={x} y2={y - 22} seed={seed + i} opts={{stroke: C.ink, strokeWidth: 3}} />
        <RPoly pts={[[x, y - 22], [x + 16, y - 17], [x, y - 11]]} seed={seed + i + 40} opts={{fill: C.clay, fillStyle: 'solid', stroke: C.ink, strokeWidth: 2, roughness: 1}} />
      </g>
    ))}
  </svg>
);
