import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts} from '../theme';

type Props = {
  text: string;
  size: number;
  /** Frame (relative to scene) when the reveal starts */
  from?: number;
  /** Frame at which the text hard-cuts out (optional) */
  until?: number;
  color?: string;
  font?: string;
  align?: 'left' | 'center';
  lineHeight?: number;
  style?: React.CSSProperties;
  /** Frames between consecutive words */
  stagger?: number;
  /** Words matching these strings render in the accent color */
  accent?: string[];
  weight?: number | string;
  maxWidth?: number;
};

/**
 * Word-by-word kinetic type. Each word rises out of a clipped line box with a
 * critically damped spring. No bounce.
 */
export const KineticText: React.FC<Props> = ({
  text, size, from = 0, until, color = colors.sand, font = fonts.headline, align = 'left',
  lineHeight = 1.02, style, stagger = 2, accent = [], weight, maxWidth,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (frame < from || (until !== undefined && frame >= until)) return null;
  const words = text.split(' ');
  return (
    <div
      style={{
        fontFamily: font,
        fontSize: size,
        lineHeight,
        color,
        textAlign: align,
        letterSpacing: font === fonts.headline ? -size * 0.02 : 0,
        fontWeight: weight,
        maxWidth,
        textWrap: 'balance',
        ...style,
      }}
    >
      {words.map((w, i) => {
        const s = spring({frame: frame - from - i * stagger, fps, config: {damping: 200, stiffness: 180, mass: 0.9}});
        const y = interpolate(s, [0, 1], [1.05, 0]);
        const isAccent = accent.some((a) => w.replace(/[.,!?]/g, '') === a);
        return (
          <span key={i} style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: size * 0.08, marginBottom: -size * 0.08}}>
            <span style={{display: 'inline-block', transform: `translateY(${y * 100}%)`, color: isAccent ? colors.clay : undefined}}>
              {w}
            </span>
            {i < words.length - 1 ? <span>&nbsp;</span> : null}
          </span>
        );
      })}
    </div>
  );
};

/** Small mono label, used for kickers and data captions. */
export const Label: React.FC<{children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties; from?: number}> = ({
  children, size = 22, color = colors.sandMuted, style, from = 0,
}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame - from, [0, 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{fontFamily: fonts.mono, fontSize: size, letterSpacing: size * 0.12, textTransform: 'uppercase', color, opacity: o, fontWeight: 600, ...style}}>
      {children}
    </div>
  );
};

export const fmtUSD = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
