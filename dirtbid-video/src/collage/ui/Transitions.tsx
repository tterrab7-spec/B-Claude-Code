import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {prog, easeInOut, noise} from '../motion';

/**
 * Torn-paper wipe: the incoming scene is revealed behind a jagged tear that
 * travels across the frame, with a white fibrous edge.
 */
export const TornWipe: React.FC<{frames: number; children: React.ReactNode; direction?: 'ltr' | 'ttb'; seed?: number}> = ({frames, children, direction = 'ltr', seed = 1}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const p = prog(frame, 0, frames, easeInOut);
  const edge = useMemo(() => {
    const n = 40;
    return Array.from({length: n + 1}).map((_, i) => ({t: i / n, off: noise(i, seed) * 22 + noise(i * 3, seed + 1) * 9}));
  }, [seed]);
  if (p >= 1) return <AbsoluteFill>{children}</AbsoluteFill>;
  const travel = direction === 'ltr' ? width : height;
  const pos = -60 + p * (travel + 120);
  const pts = direction === 'ltr'
    ? edge.map((e) => `${pos + e.off}px ${e.t * height}px`)
    : edge.map((e) => `${e.t * width}px ${pos + e.off}px`);
  const poly = direction === 'ltr' ? `polygon(0 0, ${pts.join(',')}, 0 ${height}px)` : `polygon(0 0, ${width}px 0, ${pts.reverse().join(',')})`;
  const edgePath = direction === 'ltr'
    ? edge.map((e, i) => `${i ? 'L' : 'M'}${pos + e.off} ${e.t * height}`).join(' ')
    : edge.map((e, i) => `${i ? 'L' : 'M'}${e.t * width} ${pos + e.off}`).join(' ');
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{clipPath: poly}}>{children}</AbsoluteFill>
      <svg width={width} height={height} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <path d={edgePath} fill="none" stroke="#FFFDF8" strokeWidth={14} strokeLinejoin="round" opacity={0.95} />
        <path d={edgePath} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={3} strokeLinejoin="round" transform={direction === 'ltr' ? 'translate(6 0)' : 'translate(0 6)'} />
      </svg>
    </AbsoluteFill>
  );
};
