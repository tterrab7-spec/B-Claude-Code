import React from 'react';
import {C, F} from '../theme';
import {REllipse, RPoly, RPath} from './Rough';
import {Flag} from './Doodles';

/** Marine clay: a lumpy grey-blue blob. */
export const Clay: React.FC<{size?: number}> = ({size = 150}) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 150 112" style={{display: 'block', overflow: 'visible'}}>
    <RPath d="M20 70 Q 6 40 36 30 Q 50 8 84 18 Q 122 6 136 40 Q 150 72 118 86 Q 90 108 52 96 Q 22 96 20 70 Z" seed={41} opts={{fill: '#8797A8', fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.8}} />
    <RPath d="M48 52 q 14 -8 28 0 M70 72 q 12 -6 24 0" seed={42} opts={{stroke: '#5E6D7E', strokeWidth: 3, roughness: 1.2, fill: 'none'}} />
  </svg>
);

/** Shallow rock: a chunky boulder. */
export const Rock: React.FC<{size?: number}> = ({size = 150}) => (
  <svg width={size} height={size * 0.8} viewBox="0 0 150 120" style={{display: 'block', overflow: 'visible'}}>
    <RPoly pts={[[18, 96], [30, 46], [66, 18], [110, 24], [140, 62], [128, 104], [44, 110]]} seed={43} opts={{fill: '#9A948A', fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.6}} />
    <RPath d="M52 40 L 84 58 L 70 92 M84 58 L 116 50" seed={44} opts={{stroke: '#6B655C', strokeWidth: 3, roughness: 1.4, fill: 'none'}} />
  </svg>
);

/** High water table: stacked waves. */
export const Water: React.FC<{size?: number}> = ({size = 150}) => (
  <svg width={size} height={size * 0.7} viewBox="0 0 150 105" style={{display: 'block', overflow: 'visible'}}>
    <REllipse cx={75} cy={56} w={140} h={84} seed={45} opts={{fill: '#7FB2D6', fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.6}} />
    {[36, 56, 76].map((y, i) => (
      <RPath key={i} d={`M22 ${y} q 13 -12 26 0 t 26 0 t 26 0 t 26 0`} seed={46 + i} opts={{stroke: '#2F5D7C', strokeWidth: 3.5, roughness: 1.1, fill: 'none'}} />
    ))}
  </svg>
);

/** Risk sticker: icon + hand-printed label + a warning flag. */
export const RiskSticker: React.FC<{kind: 'clay' | 'rock' | 'water'; label: string}> = ({kind, label}) => (
  <div style={{position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2}}>
    {kind === 'clay' ? <Clay /> : kind === 'rock' ? <Rock /> : <Water />}
    <div style={{fontFamily: F.print, fontSize: 34, color: C.ink, background: C.white, padding: '0 12px', lineHeight: 1.15, whiteSpace: 'nowrap', transform: 'rotate(-2deg)'}}>{label}</div>
    <div style={{position: 'absolute', right: -26, top: -30}}>
      <Flag size={44} />
    </div>
  </div>
);
