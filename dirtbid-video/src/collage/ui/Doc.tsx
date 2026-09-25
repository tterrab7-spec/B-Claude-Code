import React from 'react';
import {C, F} from '../theme';
import {RRect, RLine} from './Rough';
import {Tape} from './Tape';

/** A paper document sticker with a hand-printed title and ruled lines. */
export const Doc: React.FC<{title: string; w?: number; h?: number; seed?: number; tape?: string; accent?: string}> = ({title, w = 190, h = 240, seed = 3, tape = C.tapeYellow, accent = C.blue}) => (
  <div style={{position: 'relative', width: w, height: h}}>
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display: 'block', overflow: 'visible'}}>
      <RRect x={4} y={4} w={w - 8} h={h - 8} seed={seed} opts={{fill: C.white, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.3}} />
      {Array.from({length: 6}).map((_, i) => (
        <RLine key={i} x1={26} y1={86 + i * 24} x2={w - 26 - (i % 3) * 22} y2={86 + i * 24} seed={seed + i + 1} opts={{stroke: '#B8B0A2', strokeWidth: 2.5, roughness: 0.8}} />
      ))}
      <RRect x={26} y={h - 60} w={70} h={28} seed={seed + 9} opts={{fill: accent, fillStyle: 'hachure', hachureGap: 5, stroke: accent, strokeWidth: 1.5, roughness: 1}} />
      <text x={w / 2} y={56} textAnchor="middle" fontFamily={F.print} fontSize={34} fill={C.ink}>{title}</text>
    </svg>
    <Tape x={w / 2} y={6} w={100} h={28} color={tape} rotate={-4} />
  </div>
);
