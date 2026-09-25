import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {colors, fonts} from '../theme';
import {Box} from '../layout';

/** Parcel outline in a 0..1000 coordinate system. */
export const PARCEL: [number, number][] = [
  [120, 270],
  [410, 130],
  [760, 200],
  [905, 520],
  [790, 860],
  [430, 905],
  [140, 720],
];

export const parcelPath = () =>
  PARCEL.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') + ' Z';

/** Fixed points inside the parcel where warning flags land. */
export const FLAG_POINTS: [number, number][] = [
  [330, 330], [600, 300], [740, 470], [420, 520], [560, 640], [300, 640],
  [700, 720], [470, 790], [250, 470], [820, 600], [540, 420], [380, 860],
];

/** Convert a parcel coordinate to screen space for a given box. */
export const parcelToScreen = (px: number, py: number, box: Box) => {
  const s = Math.min(box.w, box.h) / 1000;
  const ox = box.x + (box.w - 1000 * s) / 2;
  const oy = box.y + (box.h - 1000 * s) / 2;
  return {x: ox + px * s, y: oy + py * s};
};

const bearing = (a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) * 0.62; // fake feet
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI; // math angle, y up
  const ns = angle >= 0 ? 'N' : 'S';
  const ew = dx >= 0 ? 'E' : 'W';
  const deg = Math.abs(90 - Math.abs(angle));
  const d = Math.floor(deg);
  const m = Math.floor((deg - d) * 60);
  return `${ns} ${d}°${String(m).padStart(2, '0')}' ${ew}  ${len.toFixed(1)}'`;
};

type Props = {
  box: Box;
  /** 0..1 outline draw progress */
  draw?: number;
  /** Outline color */
  stroke?: string;
  /** Interior fill */
  fill?: string;
  fillOpacity?: number;
  /** 0..1 amber warning glow */
  glow?: number;
  /** Frame at which each flag appears (undefined = hidden) */
  flagFrames?: (number | undefined)[];
  /** Show survey bearings along edges (fade in with draw) */
  bearings?: boolean;
  /** Corner monuments */
  monuments?: boolean;
  /** Unique id prefix for clip paths */
  id: string;
  /** Extra SVG rendered in parcel coordinates, clipped to the parcel */
  children?: React.ReactNode;
  /** Extra SVG rendered in parcel coordinates, unclipped, above the outline */
  overlay?: React.ReactNode;
  strokeWidth?: number;
  opacity?: number;
};

export const Parcel: React.FC<Props> = ({
  box, draw = 1, stroke = colors.sand, fill = colors.baseDeep, fillOpacity = 1, glow = 0,
  flagFrames = [], bearings = true, monuments = true, id, children, overlay, strokeWidth = 5, opacity = 1,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const d = parcelPath();
  const glowColor = colors.amber;
  const lineColor = glow > 0 ? mix(stroke, glowColor, glow) : stroke;

  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid meet"
      style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, overflow: 'visible', opacity}}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={d} />
        </clipPath>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={18} />
        </filter>
      </defs>

      {/* interior */}
      <path d={d} fill={fill} fillOpacity={fillOpacity * Math.min(1, draw * 1.6)} />

      {/* amber hazard glow under the outline */}
      {glow > 0 && (
        <path d={d} fill="none" stroke={glowColor} strokeWidth={26} strokeOpacity={0.55 * glow} filter={`url(#${id}-glow)`} />
      )}
      {glow > 0 && <path d={d} fill={glowColor} fillOpacity={0.12 * glow} />}

      <g clipPath={`url(#${id}-clip)`}>{children}</g>

      {/* survey outline */}
      <path
        d={d}
        fill="none"
        stroke={lineColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />

      {/* bearings + monuments */}
      {PARCEL.map((p, i) => {
        const q = PARCEL[(i + 1) % PARCEL.length];
        const segStart = i / PARCEL.length;
        const t = interpolate(draw, [segStart, segStart + 0.1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        const mx = (p[0] + q[0]) / 2;
        const my = (p[1] + q[1]) / 2;
        let ang = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
        if (ang > 90 || ang < -90) ang += 180;
        // offset label outward from centroid
        const cxp = 520, cyp = 520;
        const nx = mx - cxp, ny = my - cyp;
        const nl = Math.hypot(nx, ny);
        const ox = (nx / nl) * 34, oy = (ny / nl) * 34;
        return (
          <g key={i} opacity={t}>
            {monuments && (
              <g>
                <circle cx={p[0]} cy={p[1]} r={11} fill={colors.base} stroke={lineColor} strokeWidth={4} />
                <circle cx={p[0]} cy={p[1]} r={3} fill={lineColor} />
              </g>
            )}
            {bearings && (
              <text
                x={mx + ox}
                y={my + oy}
                fill={colors.sandMuted}
                fontFamily={fonts.mono}
                fontSize={21}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${ang} ${mx + ox} ${my + oy})`}
              >
                {bearing(p, q)}
              </text>
            )}
          </g>
        );
      })}

      {/* warning flags */}
      {FLAG_POINTS.map(([x, y], i) => {
        const at = flagFrames[i];
        if (at === undefined || frame < at) return null;
        const s = spring({frame: frame - at, fps, config: {damping: 14, stiffness: 260, mass: 0.6}});
        return (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <line x1={0} y1={0} x2={0} y2={-52} stroke={colors.sand} strokeWidth={4} />
            <path d="M0 -52 L36 -40 L0 -28 Z" fill={colors.amber} />
            <circle cx={0} cy={0} r={5} fill={colors.amber} />
          </g>
        );
      })}

      {overlay}
    </svg>
  );
};

/** Linear mix of two hex colors. */
export const mix = (a: string, b: string, t: number) => {
  const pa = hex(a), pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};
const hex = (h: string) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

export const easeOut = Easing.out(Easing.cubic);
export const easeInOut = Easing.inOut(Easing.cubic);
export const easeIn = Easing.in(Easing.cubic);
