import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C} from '../theme';
import {RLine, RPath, REllipse} from './Rough';
import {prog, stepped, noise} from '../motion';

/** Radiating sparkle lines that burst out and fade. */
export const Burst: React.FC<{at: number; r?: number; n?: number; color?: string; seed?: number}> = ({at, r = 90, n = 10, color = C.ink, seed = 1}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + 26) return null;
  const p = prog(frame, at, 14);
  const fade = 1 - prog(frame, at + 12, 14);
  return (
    <svg width={r * 2.6} height={r * 2.6} viewBox={`${-r * 1.3} ${-r * 1.3} ${r * 2.6} ${r * 2.6}`} style={{position: 'absolute', left: -r * 1.3, top: -r * 1.3, overflow: 'visible', opacity: fade}}>
      {Array.from({length: n}).map((_, i) => {
        const a = (i / n) * Math.PI * 2 + noise(i, seed) * 0.2;
        const r0 = r * (0.55 + 0.35 * p), r1 = r * (0.7 + 0.5 * p);
        return <RLine key={i} x1={Math.cos(a) * r0} y1={Math.sin(a) * r0} x2={Math.cos(a) * r1} y2={Math.sin(a) * r1} seed={seed + i} opts={{stroke: color, strokeWidth: 4, roughness: 1.2}} />;
      })}
    </svg>
  );
};

/** A hand-drawn four-point sparkle that twinkles at a stepped rate. */
export const Sparkle: React.FC<{size?: number; color?: string; seed?: number; at?: number}> = ({size = 40, color = C.amber, seed = 1, at = 0}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const s = 0.75 + 0.25 * Math.sin(stepped(frame, 8) * 0.5 + seed);
  const h = size / 2;
  return (
    <svg width={size} height={size} viewBox={`${-h} ${-h} ${size} ${size}`} style={{display: 'block', transform: `scale(${s}) rotate(${noise(seed, 3) * 20}deg)`, overflow: 'visible'}}>
      <RPath d={`M0 ${-h} Q 2 -2 ${h} 0 Q 2 2 0 ${h} Q -2 2 ${-h} 0 Q -2 -2 0 ${-h} Z`} seed={seed} opts={{fill: color, fillStyle: 'solid', stroke: color, strokeWidth: 2, roughness: 0.8}} />
    </svg>
  );
};

/** Sun doodle with rays */
export const Sun: React.FC<{size?: number; seed?: number}> = ({size = 120, seed = 4}) => {
  const frame = useCurrentFrame();
  const r = size / 2;
  const rot = stepped(frame, 6) * 0.15;
  return (
    <svg width={size * 1.7} height={size * 1.7} viewBox={`${-r * 1.7} ${-r * 1.7} ${size * 1.7} ${size * 1.7}`} style={{display: 'block', overflow: 'visible'}}>
      <g transform={`rotate(${rot})`}>
        {Array.from({length: 12}).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <RLine key={i} x1={Math.cos(a) * r * 1.15} y1={Math.sin(a) * r * 1.15} x2={Math.cos(a) * r * (1.45 + (i % 2) * 0.15)} y2={Math.sin(a) * r * (1.45 + (i % 2) * 0.15)} seed={seed + i} opts={{stroke: C.amber, strokeWidth: 4}} />;
        })}
      </g>
      <REllipse cx={0} cy={0} w={size} h={size} seed={seed} opts={{fill: C.amber, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.6}} />
    </svg>
  );
};

/** Cloud doodle */
export const Cloud: React.FC<{w?: number; seed?: number}> = ({w = 160, seed = 6}) => (
  <svg width={w} height={w * 0.55} viewBox="0 0 160 88" style={{display: 'block', overflow: 'visible'}}>
    <RPath d="M30 70 Q 5 70 8 50 Q 10 32 30 34 Q 34 12 58 14 Q 78 2 96 20 Q 118 8 128 30 Q 152 30 150 52 Q 150 70 128 70 Z" seed={seed} opts={{fill: '#FFFDF8', fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.4}} />
  </svg>
);

/** Hand-drawn arrow pointing right, draws on */
export const Arrow: React.FC<{w?: number; at: number; color?: string; seed?: number}> = ({w = 120, at, color = C.ink, seed = 9}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const p = prog(frame, at, 12);
  return (
    <svg width={w} height={60} viewBox={`0 0 ${w} 60`} style={{display: 'block', overflow: 'visible'}}>
      <RPath d={`M4 30 Q ${w * 0.5} 10 ${w - 8} 30`} seed={seed} opts={{stroke: color, strokeWidth: 5, roughness: 1.6}} draw={p} />
      <RPath d={`M${w - 30} 14 L${w - 6} 30 L${w - 30} 46`} seed={seed + 1} opts={{stroke: color, strokeWidth: 5, roughness: 1.6}} draw={Math.max(0, (p - 0.6) / 0.4)} />
    </svg>
  );
};

/** Little amber warning flag on a pin */
export const Flag: React.FC<{size?: number; seed?: number; color?: string}> = ({size = 48, seed = 2, color = C.amber}) => (
  <svg width={size} height={size * 1.25} viewBox="0 0 40 50" style={{display: 'block', overflow: 'visible'}}>
    <RLine x1={8} y1={48} x2={8} y2={6} seed={seed} opts={{stroke: C.ink, strokeWidth: 3}} />
    <RPath d="M9 6 L36 14 L9 24 Z" seed={seed + 1} opts={{fill: color, fillStyle: 'solid', stroke: C.ink, strokeWidth: 2.5, roughness: 1.2}} />
  </svg>
);
