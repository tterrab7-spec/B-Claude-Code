import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {colors} from '../theme';

/**
 * Wipe along a survey line: a slanted edge sweeps left-to-right revealing the
 * incoming scene, with a thin sand line riding the edge.
 */
export const SurveyWipe: React.FC<{frames: number; children: React.ReactNode; angleDeg?: number}> = ({frames, children, angleDeg = 22}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const p = interpolate(frame, [0, frames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  if (p >= 1) return <AbsoluteFill>{children}</AbsoluteFill>;
  const slope = Math.tan((angleDeg * Math.PI) / 180) * height;
  const x = -slope + p * (width + slope * 2);
  const poly = `polygon(0 0, ${x + slope}px 0, ${x - slope}px ${height}px, 0 ${height}px)`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{clipPath: poly}}>{children}</AbsoluteFill>
      <svg width={width} height={height} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <line x1={x + slope} y1={0} x2={x - slope} y2={height} stroke={colors.sand} strokeWidth={4} />
        <line x1={x + slope + 18} y1={0} x2={x - slope + 18} y2={height} stroke={colors.clay} strokeWidth={2} strokeDasharray="14 10" />
      </svg>
    </AbsoluteFill>
  );
};

/** Iris mask reveal from the centre (parcel-shaped, seven sides). */
export const IrisReveal: React.FC<{frames: number; children: React.ReactNode}> = ({frames, children}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const p = interpolate(frame, [0, frames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  if (p >= 1) return <AbsoluteFill>{children}</AbsoluteFill>;
  const r = p * Math.hypot(width, height) * 0.62;
  const cx = width / 2, cy = height / 2;
  const pts: string[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const rr = r * (1 + 0.12 * Math.sin(i * 2.1));
    pts.push(`${cx + Math.cos(a) * rr}px ${cy + Math.sin(a) * rr}px`);
  }
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{clipPath: `polygon(${pts.join(',')})`}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
