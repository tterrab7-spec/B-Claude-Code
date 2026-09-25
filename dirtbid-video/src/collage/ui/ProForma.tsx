import React from 'react';
import {useCurrentFrame, interpolate} from 'remotion';
import {C, F} from '../theme';
import {RRect, RLine, RPath} from './Rough';
import {Tape} from './Tape';
import {prog, easeIn} from '../motion';
import {copy} from '../content';

/**
 * Pro forma paper with four bars. `hitAt` is when the profit bar tears down
 * below the line and turns red.
 */
export const ProForma: React.FC<{hitAt: number; w?: number; h?: number}> = ({hitAt, w = 540, h = 340}) => {
  const frame = useCurrentFrame();
  const base = h - 92;
  const bars = [{l: 'land', v: 110, c: '#B7AD9C'}, {l: 'site work', v: 140, c: '#B7AD9C'}, {l: 'soft', v: 70, c: '#B7AD9C'}, {l: copy.stakes.profit, v: 95, c: C.green}];
  const hit = prog(frame, hitAt, 10, easeIn);
  const profitV = interpolate(hit, [0, 1], [95, -70]);
  const profitC = hit > 0.35 ? C.red : C.green;
  const slot = (w - 80) / bars.length;
  return (
    <div style={{position: 'relative', width: w, height: h}}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display: 'block', overflow: 'visible'}}>
        <RRect x={4} y={4} w={w - 8} h={h - 8} seed={50} opts={{fill: C.white, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.3}} />
        <text x={40} y={54} fontFamily={F.print} fontSize={34} fill={C.ink} letterSpacing={2}>{copy.stakes.proforma}</text>
        {bars.map((b, i) => {
          const v = i === 3 ? profitV : b.v;
          const x = 40 + i * slot + 16;
          const bw = slot - 32;
          const y = v >= 0 ? base - v : base;
          return (
            <g key={b.l}>
              <RRect x={x} y={y} w={bw} h={Math.abs(v)} seed={51 + i} opts={{fill: i === 3 ? profitC : b.c, fillStyle: i === 3 ? 'solid' : 'hachure', hachureGap: 6, stroke: C.ink, strokeWidth: 2.5, roughness: 1.2}} />
              <text x={x + bw / 2} y={base + 30} textAnchor="middle" fontFamily={F.print} fontSize={22} fill={C.inkSoft}>{b.l}</text>
            </g>
          );
        })}
        <RLine x1={30} y1={base} x2={w - 30} y2={base} seed={58} opts={{stroke: C.ink, strokeWidth: 3.5}} />
        {hit > 0.5 && <RPath d={`M${40 + 3 * slot + 10} ${base - 4} l 10 -14 l 8 20 l 10 -22 l 8 16`} seed={59} opts={{stroke: C.amber, strokeWidth: 3, roughness: 1.2, fill: 'none'}} />}
      </svg>
      <Tape x={w - 70} y={6} w={110} h={30} color={C.tapeBlue} rotate={6} />
    </div>
  );
};

/** The $250,000 price tag. Grows two little legs and walks when `walkAt` passes. */
export const PriceTag: React.FC<{walkFrame: number}> = ({walkFrame}) => {
  const step = Math.floor(Math.max(0, walkFrame) / 4);
  const legA = walkFrame > 0 ? (step % 2 === 0 ? 14 : -14) : 0;
  return (
    <div style={{position: 'relative', width: 300, height: 190}}>
      <svg width={300} height={190} viewBox="0 0 300 190" style={{display: 'block', overflow: 'visible'}}>
        <RPath d="M20 40 L 210 40 L 262 74 L 210 108 L 20 108 Z" seed={61} opts={{fill: C.amber, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3.5, roughness: 1.4}} />
        <circle cx={232} cy={74} r={7} fill={C.white} stroke={C.ink} strokeWidth={3} />
        <RPath d="M239 72 q 40 -30 34 -66" seed={62} opts={{stroke: C.ink, strokeWidth: 2.5, roughness: 1.6, fill: 'none'}} />
        <text x={112} y={84} textAnchor="middle" fontFamily={F.round} fontWeight={700} fontSize={44} fill={C.ink}>{copy.stakes.tag}</text>
        <text x={112} y={126} textAnchor="middle" fontFamily={F.print} fontSize={22} fill={C.inkSoft}>{copy.stakes.tagSub}</text>
        {walkFrame > 0 && (
          <g>
            <RLine x1={80} y1={108} x2={80 + legA} y2={150} seed={63} opts={{stroke: C.ink, strokeWidth: 4}} />
            <RLine x1={150} y1={108} x2={150 - legA} y2={150} seed={64} opts={{stroke: C.ink, strokeWidth: 4}} />
            <RLine x1={80 + legA} y1={150} x2={80 + legA + 22} y2={150} seed={65} opts={{stroke: C.ink, strokeWidth: 5}} />
            <RLine x1={150 - legA} y1={150} x2={150 - legA + 22} y2={150} seed={66} opts={{stroke: C.ink, strokeWidth: 5}} />
          </g>
        )}
      </svg>
    </div>
  );
};
