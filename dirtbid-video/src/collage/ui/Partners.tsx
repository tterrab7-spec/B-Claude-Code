import React from 'react';
import {C, F} from '../theme';
import {RRect, RPoly, RPath, REllipse} from './Rough';
import {Check} from '../../components/Icons';

/** A little house sticker (for the subdivision payoff). */
export const House: React.FC<{size?: number; color?: string; seed?: number}> = ({size = 70, color = C.clay, seed = 1}) => (
  <svg width={size} height={size} viewBox="0 0 70 70" style={{display: 'block', overflow: 'visible'}}>
    <RRect x={12} y={32} w={46} h={32} seed={seed} opts={{fill: '#F6EEDD', fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.3}} />
    <RPoly pts={[[6, 34], [35, 8], [64, 34]]} seed={seed + 1} opts={{fill: color, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.3}} />
    <RRect x={30} y={44} w={12} h={20} seed={seed + 2} opts={{fill: C.ink, fillStyle: 'solid', stroke: C.ink, strokeWidth: 2, roughness: 1}} />
    <RRect x={46} y={12} w={8} h={14} seed={seed + 3} opts={{fill: C.ink, fillStyle: 'solid', stroke: C.ink, strokeWidth: 2, roughness: 1}} />
  </svg>
);

/** Excavator sticker. */
export const Excavator: React.FC<{size?: number}> = ({size = 190}) => (
  <svg width={size} height={size * 0.7} viewBox="0 0 190 133" style={{display: 'block', overflow: 'visible'}}>
    <REllipse cx={70} cy={112} w={116} h={30} seed={140} opts={{fill: '#4D4740', fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.2}} />
    {[30, 50, 70, 90, 110].map((x, i) => <circle key={i} cx={x} cy={112} r={6} fill="#8C857B" stroke={C.ink} strokeWidth={2} />)}
    <RRect x={24} y={62} w={92} h={38} seed={141} opts={{fill: C.amber, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.3}} />
    <RRect x={34} y={30} w={44} h={36} seed={142} opts={{fill: C.amber, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.3}} />
    <RRect x={40} y={36} w={28} h={22} seed={143} opts={{fill: '#BFD7EA', fillStyle: 'solid', stroke: C.ink, strokeWidth: 2.5, roughness: 1}} />
    <RPath d="M100 66 L 146 22 L 176 60" seed={144} opts={{stroke: C.ink, strokeWidth: 12, roughness: 1.1, fill: 'none'}} />
    <RPath d="M100 66 L 146 22 L 176 60" seed={145} opts={{stroke: C.amber, strokeWidth: 7, roughness: 1.1, fill: 'none'}} />
    <RPath d="M176 60 L 188 92 L 160 96 L 158 74 Z" seed={146} opts={{fill: '#6B655C', fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.3}} />
  </svg>
);

/** Verified badge: green circle with a check. */
export const Verified: React.FC<{size?: number}> = ({size = 56}) => (
  <div style={{width: size, height: size, borderRadius: size / 2, background: C.green, border: `3px solid ${C.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
    <Check size={size * 0.6} color={C.white} />
  </div>
);

/** Small label plate. */
export const Label: React.FC<{text: string; size?: number; color?: string}> = ({text, size = 30, color = C.ink}) => (
  <div style={{fontFamily: F.print, fontSize: size, color, background: C.white, padding: `0 ${size * 0.4}px`, whiteSpace: 'nowrap', lineHeight: 1.2}}>{text}</div>
);

/** Road: a rough path through points with a dashed centerline, drawn on with `draw` 0..1. */
export const Road: React.FC<{pts: [number, number][]; draw: number; W: number; H: number}> = ({pts, draw, W, H}) => {
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]} ${p[1]}` : `L${p[0]} ${p[1]}`)).join(' ');
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      <RPath d={d} seed={150} opts={{stroke: '#A89B86', strokeWidth: 26, roughness: 1.2, fill: 'none', bowing: 0.6}} draw={draw} />
      <path d={d} fill="none" stroke="#FFFDF8" strokeWidth={4} strokeLinecap="round" pathLength={1} strokeDasharray="0.02 0.018" strokeDashoffset={0} opacity={draw > 0.02 ? 1 : 0} style={{clipPath: `inset(0 ${(1 - draw) * 100}% 0 0)`}} />
    </svg>
  );
};
