import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, F} from '../theme';
import {pop, writeOn, noise} from '../motion';

type Props = {
  children: string;
  size?: number;
  color?: string;
  font?: string;
  at?: number;
  /** write: left-to-right reveal; pop: each word springs in; none */
  mode?: 'write' | 'pop' | 'none';
  dur?: number;
  align?: 'left' | 'center' | 'right';
  style?: React.CSSProperties;
  weight?: number;
  lineHeight?: number;
  accent?: string[];
  /** small per-word rotation jitter for a hand-placed look */
  jitter?: number;
  maxWidth?: number;
};

/** Hand-lettered text (Caveat by default). */
export const HandText: React.FC<Props> = ({
  children, size = 64, color = C.ink, font = F.hand, at = 0, mode = 'write', dur = 18, align = 'left', style, weight = 700, lineHeight = 1.05, accent = [], jitter = 0, maxWidth,
}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const common: React.CSSProperties = {fontFamily: font, fontSize: size, fontWeight: weight, color, lineHeight, textAlign: align, whiteSpace: 'pre-wrap', maxWidth, textWrap: 'balance', ...style};
  if (mode === 'pop') {
    const words = children.split(' ');
    return (
      <div style={common}>
        {words.map((w, i) => {
          const s = pop(frame, at + i * 2, 0.9);
          const isAccent = accent.includes(w.replace(/[.,!?:]/g, ''));
          return (
            <span key={i} style={{display: 'inline-block', transform: `scale(${s}) rotate(${noise(i, 4) * jitter}deg)`, opacity: Math.min(1, s * 1.4), color: isAccent ? C.clay : undefined, marginRight: '0.28em'}}>
              {w}
            </span>
          );
        })}
      </div>
    );
  }
  if (mode === 'write') {
    const p = writeOn(frame, at, dur);
    return (
      <div style={{...common, clipPath: `inset(-20% ${(1 - p) * 102}% -20% -5%)`}}>
        {accent.length ? children.split(' ').map((w, i) => <span key={i} style={{color: accent.includes(w.replace(/[.,!?:]/g, '')) ? C.clay : undefined}}>{w} </span>) : children}
      </div>
    );
  }
  return <div style={common}>{children}</div>;
};
