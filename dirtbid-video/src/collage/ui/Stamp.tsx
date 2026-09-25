import React from 'react';
import {useCurrentFrame, interpolate} from 'remotion';
import {C, F} from '../theme';
import {prog, easeIn} from '../motion';

/** Rubber stamp that slams down: rotated bordered text, ink texture. */
export const Stamp: React.FC<{text: string; at: number; color?: string; size?: number; rotate?: number; sub?: string}> = ({text, at, color = C.green, size = 30, rotate = -8, sub}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const p = prog(frame, at, 5, easeIn);
  const scale = interpolate(p, [0, 1], [1.8, 1]);
  return (
    <div
      style={{
        display: 'inline-block',
        padding: `${size * 0.25}px ${size * 0.5}px`,
        border: `${Math.max(3, size * 0.14)}px solid ${color}`,
        borderRadius: size * 0.3,
        color,
        fontFamily: F.round,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: size * 0.06,
        textTransform: 'uppercase',
        lineHeight: 1.05,
        textAlign: 'center',
        transform: `rotate(${rotate}deg) scale(${scale})`,
        opacity: Math.min(1, p * 1.5) * 0.92,
        maskImage: 'radial-gradient(ellipse at 40% 40%, rgba(0,0,0,1) 55%, rgba(0,0,0,0.75) 100%)',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
      {sub && <div style={{fontSize: size * 0.5, letterSpacing: 1, marginTop: 2}}>{sub}</div>}
    </div>
  );
};
