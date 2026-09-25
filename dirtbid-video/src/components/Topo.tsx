import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors} from '../theme';

type Props = {
  /** Line opacity multiplier */
  opacity?: number;
  /** Background color */
  bg?: string;
  /** Line color */
  stroke?: string;
  /** Drift speed. 0 freezes the contours. */
  drift?: number;
  /** Extra frame offset so two scenes can share continuous motion */
  frameOffset?: number;
};

/**
 * Dark topographic contour background. Rings are deformed ellipses around a
 * few centers so the field reads as terrain, not decoration. Motion is a slow
 * phase drift on the deformation, never a translation, so it feels geologic.
 */
export const Topo: React.FC<Props> = ({
  opacity = 1,
  bg = colors.base,
  stroke = colors.sand,
  drift = 1,
  frameOffset = 0,
}) => {
  const frame = useCurrentFrame() + frameOffset;
  const {width, height} = useVideoConfig();

  const centers = useMemo(
    () => [
      {x: width * 0.18, y: height * 0.22, max: Math.max(width, height) * 0.62, seed: 0.7},
      {x: width * 0.82, y: height * 0.74, max: Math.max(width, height) * 0.7, seed: 2.1},
      {x: width * 0.55, y: height * 1.05, max: Math.max(width, height) * 0.5, seed: 4.3},
    ],
    [width, height],
  );

  const phase = frame * 0.0045 * drift;
  const paths: string[] = [];
  for (const c of centers) {
    for (let r = 54; r < c.max; r += 58) {
      const pts: string[] = [];
      const n = 84;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2;
        const wob =
          1 +
          0.16 * Math.sin(3 * t + c.seed + phase) +
          0.09 * Math.sin(5 * t - c.seed * 1.7 - phase * 1.3) +
          0.05 * Math.sin(8 * t + r * 0.01 + phase * 0.6);
        const rr = r * wob;
        pts.push(`${(c.x + Math.cos(t) * rr * 1.18).toFixed(1)},${(c.y + Math.sin(t) * rr).toFixed(1)}`);
      }
      paths.push(`M${pts.join('L')}Z`);
    }
  }

  return (
    <AbsoluteFill style={{backgroundColor: bg}}>
      <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
        <g fill="none" stroke={stroke} strokeOpacity={0.1 * opacity} strokeWidth={1.25}>
          {paths.map((d, i) => (
            <path key={i} d={d} strokeWidth={i % 5 === 0 ? 2 : 1.25} strokeOpacity={(i % 5 === 0 ? 0.16 : 0.09) * opacity} />
          ))}
        </g>
      </svg>
      {/* Vignette so type always sits on the darkest part of the frame */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.45) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
