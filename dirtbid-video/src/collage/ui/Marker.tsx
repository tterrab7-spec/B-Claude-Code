import React, {useMemo} from 'react';
import rough from 'roughjs/bin/rough';
import {useCurrentFrame} from 'remotion';
import {C} from '../theme';
import {prog} from '../motion';

const gen = rough.generator();

/** Hand-drawn marker underline that draws itself on. Width w, drawn at `at`. */
export const Underline: React.FC<{w: number; at: number; color?: string; stroke?: number; seed?: number; dur?: number; style?: React.CSSProperties}> = ({w, at, color = C.clay, stroke = 7, seed = 2, dur = 12, style}) => {
  const frame = useCurrentFrame();
  const paths = useMemo(() => gen.toPaths(gen.line(4, 12, w - 4, 10, {roughness: 2.2, bowing: 2, stroke: color, strokeWidth: stroke, seed})), [w, color, stroke, seed]);
  if (frame < at) return null;
  const p = prog(frame, at, dur);
  return (
    <svg width={w} height={24} style={{display: 'block', overflow: 'visible', ...style}}>
      {paths.map((q, i) => (
        <path key={i} d={q.d} stroke={q.stroke} strokeWidth={q.strokeWidth} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      ))}
    </svg>
  );
};

/** Hand-drawn marker circle around something of size w x h. */
export const Circle: React.FC<{w: number; h: number; at: number; color?: string; stroke?: number; seed?: number; dur?: number}> = ({w, h, at, color = C.clay, stroke = 6, seed = 5, dur = 16}) => {
  const frame = useCurrentFrame();
  const paths = useMemo(() => gen.toPaths(gen.ellipse(w / 2, h / 2, w, h, {roughness: 2, bowing: 2.5, stroke: color, strokeWidth: stroke, seed, fill: 'none'})), [w, h, color, stroke, seed]);
  if (frame < at) return null;
  const p = prog(frame, at, dur);
  return (
    <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}}>
      {paths.map((q, i) => (
        <path key={i} d={q.d} stroke={q.stroke} strokeWidth={q.strokeWidth} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      ))}
    </svg>
  );
};

/** Scribble-out: a zig-zag stroke across text of width w. */
export const Strike: React.FC<{w: number; at: number; color?: string; dur?: number; seed?: number}> = ({w, at, color = C.red, dur = 10, seed = 8}) => {
  const frame = useCurrentFrame();
  const paths = useMemo(() => gen.toPaths(gen.linearPath([[0, 14], [w * 0.3, 8], [w * 0.55, 16], [w * 0.8, 6], [w, 12]], {roughness: 1.5, stroke: color, strokeWidth: 6, seed})), [w, color, seed]);
  if (frame < at) return null;
  const p = prog(frame, at, dur);
  return (
    <svg width={w} height={24} style={{position: 'absolute', left: 0, top: '40%', overflow: 'visible'}}>
      {paths.map((q, i) => (
        <path key={i} d={q.d} stroke={q.stroke} strokeWidth={q.strokeWidth} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      ))}
    </svg>
  );
};
