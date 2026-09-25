import React, {useMemo} from 'react';
import rough from 'roughjs/bin/rough';
import type {Options} from 'roughjs/bin/core';

const gen = rough.generator();

type Common = {opts?: Options; seed?: number; /** 0..1 draw-on progress for strokes */ draw?: number};

const Paths: React.FC<{drawable: ReturnType<typeof gen.rectangle>; draw?: number}> = ({drawable, draw}) => {
  const paths = useMemo(() => gen.toPaths(drawable), [drawable]);
  return (
    <>
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          fill={p.fill}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={draw !== undefined ? 1 : undefined}
          strokeDasharray={draw !== undefined ? 1 : undefined}
          strokeDashoffset={draw !== undefined ? 1 - draw : undefined}
          style={draw !== undefined && p.fill !== 'none' ? {opacity: draw > 0.02 ? 1 : 0} : undefined}
        />
      ))}
    </>
  );
};

const base = (seed = 1, opts?: Options): Options => ({roughness: 1.4, bowing: 1.2, strokeWidth: 3, stroke: '#2B2823', seed, fillStyle: 'hachure', hachureGap: 7, fillWeight: 1.4, ...opts});

export const RRect: React.FC<Common & {x: number; y: number; w: number; h: number}> = ({x, y, w, h, opts, seed = 1, draw}) => {
  const d = useMemo(() => gen.rectangle(x, y, w, h, base(seed, opts)), [x, y, w, h, opts, seed]);
  return <Paths drawable={d} draw={draw} />;
};
export const REllipse: React.FC<Common & {cx: number; cy: number; w: number; h: number}> = ({cx, cy, w, h, opts, seed = 1, draw}) => {
  const d = useMemo(() => gen.ellipse(cx, cy, w, h, base(seed, opts)), [cx, cy, w, h, opts, seed]);
  return <Paths drawable={d} draw={draw} />;
};
export const RPoly: React.FC<Common & {pts: [number, number][]}> = ({pts, opts, seed = 1, draw}) => {
  const d = useMemo(() => gen.polygon(pts, base(seed, opts)), [pts, opts, seed]);
  return <Paths drawable={d} draw={draw} />;
};
export const RLine: React.FC<Common & {x1: number; y1: number; x2: number; y2: number}> = ({x1, y1, x2, y2, opts, seed = 1, draw}) => {
  const d = useMemo(() => gen.line(x1, y1, x2, y2, base(seed, opts)), [x1, y1, x2, y2, opts, seed]);
  return <Paths drawable={d} draw={draw} />;
};
export const RPath: React.FC<Common & {d: string}> = ({d: pd, opts, seed = 1, draw}) => {
  const d = useMemo(() => gen.path(pd, base(seed, opts)), [pd, opts, seed]);
  return <Paths drawable={d} draw={draw} />;
};
export const RCurve: React.FC<Common & {pts: [number, number][]}> = ({pts, opts, seed = 1, draw}) => {
  const d = useMemo(() => gen.curve(pts, base(seed, opts)), [pts, opts, seed]);
  return <Paths drawable={d} draw={draw} />;
};
