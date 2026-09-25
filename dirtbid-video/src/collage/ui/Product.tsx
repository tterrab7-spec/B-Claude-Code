import React from 'react';
import {useCurrentFrame, interpolate} from 'remotion';
import {C, F} from '../theme';
import {RRect, RLine, RPoly, RPath, REllipse} from './Rough';
import {PARCEL_PTS} from './Parcel';
import {Tape} from './Tape';
import {pop, prog, easeOut, stepped, slap} from '../motion';
import {copy} from '../content';

/** Soil map units in the 400x400 parcel box (clipped to the parcel). */
const CELLS: {pts: [number, number][]; c: number; code: string}[] = [
  {pts: [[0, 0], [190, 0], [170, 170], [0, 200]], c: 1, code: 'MkB'},
  {pts: [[190, 0], [400, 0], [400, 140], [260, 160], [170, 170]], c: 5, code: 'Bh'},
  {pts: [[0, 200], [170, 170], [260, 160], [240, 270], [120, 290], [0, 310]], c: 4, code: 'Do'},
  {pts: [[260, 160], [400, 140], [400, 320], [320, 300], [240, 270]], c: 0, code: 'Ur'},
  {pts: [[0, 310], [120, 290], [240, 270], [320, 300], [300, 400], [0, 400]], c: 2, code: 'Cl'},
  {pts: [[320, 300], [400, 320], [400, 400], [300, 400]], c: 3, code: 'Sf'},
];

/** The map sheet: roads, grid, the parcel, then soil cells popping in. */
export const MapSheet: React.FC<{size?: number; cellsAt: number[]; pinAt: number}> = ({size = 560, cellsAt, pinAt}) => {
  const frame = useCurrentFrame();
  const w = size, h = size * 0.86;
  const px = (w - 400 * 0.62) / 2 + 10, py = (h - 400 * 0.62) / 2 + 10, ps = 0.62;
  const pinP = pop(frame, pinAt, 0.9);
  const drop = interpolate(prog(frame, pinAt, 10, easeOut), [0, 1], [-260, 0]);
  const ripple = prog(frame, pinAt + 8, 22);
  return (
    <div style={{position: 'relative', width: w, height: h}}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display: 'block', overflow: 'visible'}}>
        <defs>
          <clipPath id="soil-clip"><polygon points={PARCEL_PTS.map(([x, y]) => `${px + x * ps},${py + y * ps}`).join(' ')} /></clipPath>
        </defs>
        <RRect x={4} y={4} w={w - 8} h={h - 8} seed={70} opts={{fill: '#F8F2E6', fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.3}} />
        {/* roads */}
        <RPath d={`M0 ${h * 0.72} Q ${w * 0.3} ${h * 0.6} ${w * 0.55} ${h * 0.78} T ${w} ${h * 0.7}`} seed={71} opts={{stroke: '#C9BFAE', strokeWidth: 10, roughness: 1, fill: 'none'}} />
        <RPath d={`M${w * 0.78} 0 Q ${w * 0.7} ${h * 0.4} ${w * 0.86} ${h}`} seed={72} opts={{stroke: '#C9BFAE', strokeWidth: 8, roughness: 1, fill: 'none'}} />
        <RPath d={`M0 ${h * 0.28} Q ${w * 0.2} ${h * 0.2} ${w * 0.3} 0`} seed={73} opts={{stroke: '#C9BFAE', strokeWidth: 7, roughness: 1, fill: 'none'}} />
        {/* contour doodles */}
        <RPath d={`M${w * 0.62} ${h * 0.2} q 40 -30 90 -10 q 40 20 70 -10`} seed={74} opts={{stroke: '#D8CFBD', strokeWidth: 2, roughness: 1.2, fill: 'none'}} />
        <RPath d={`M${w * 0.6} ${h * 0.3} q 50 -35 110 -12 q 40 20 80 -8`} seed={75} opts={{stroke: '#D8CFBD', strokeWidth: 2, roughness: 1.2, fill: 'none'}} />
        {/* parcel */}
        <g transform={`translate(${px} ${py}) scale(${ps})`}>
          <RPoly pts={PARCEL_PTS} seed={11} opts={{fill: C.khaki, fillStyle: 'hachure', hachureGap: 9, fillWeight: 1.6, stroke: C.ink, strokeWidth: 5, roughness: 1.6}} />
        </g>
        {/* soil cells */}
        <g clipPath="url(#soil-clip)">
          {CELLS.map((cell, i) => {
            const p = pop(frame, cellsAt[i] ?? 0, 0.8);
            if (p <= 0) return null;
            const cxp = cell.pts.reduce((a, q) => a + q[0], 0) / cell.pts.length, cyp = cell.pts.reduce((a, q) => a + q[1], 0) / cell.pts.length;
            return (
              <g key={i} transform={`translate(${px + cxp * ps} ${py + cyp * ps}) scale(${p}) translate(${-(px + cxp * ps)} ${-(py + cyp * ps)})`}>
                <g transform={`translate(${px} ${py}) scale(${ps})`}>
                  <RPoly pts={cell.pts} seed={80 + i} opts={{fill: C.soil[cell.c], fillStyle: 'solid', stroke: C.ink, strokeWidth: 4, roughness: 1.5}} />
                  <RPoly pts={cell.pts} seed={90 + i} opts={{fill: 'rgba(0,0,0,0.18)', fillStyle: 'hachure', hachureGap: 12, fillWeight: 1.2, stroke: 'none', roughness: 1.5}} />
                  <text x={cxp} y={cyp + 12} textAnchor="middle" fontFamily={F.print} fontSize={40} fill={C.ink} opacity={0.85}>{cell.code}</text>
                </g>
              </g>
            );
          })}
        </g>
        <g transform={`translate(${px} ${py}) scale(${ps})`}>
          <RPoly pts={PARCEL_PTS} seed={11} opts={{fill: 'none', stroke: C.ink, strokeWidth: 5, roughness: 1.6}} />
        </g>
        {/* ripple */}
        {ripple > 0 && ripple < 1 && (
          <circle cx={px + 200 * ps} cy={py + 200 * ps} r={8 + ripple * 90} fill="none" stroke={C.clay} strokeWidth={4 * (1 - ripple)} opacity={1 - ripple} />
        )}
      </svg>
      {/* pin */}
      {pinP > 0 && (
        <div style={{position: 'absolute', left: px + 200 * ps - 34, top: py + 200 * ps - 84 + drop, width: 68, height: 90, transform: `scale(${pinP})`, transformOrigin: '50% 100%', filter: 'url(#sticker-thin) drop-shadow(2px 6px 5px rgba(50,35,15,0.3))'}}>
          <svg width={68} height={90} viewBox="0 0 68 90" style={{display: 'block', overflow: 'visible'}}>
            <RPath d="M34 88 C 34 88, 6 52, 6 32 A 28 28 0 0 1 62 32 C 62 52, 34 88, 34 88 Z" seed={76} opts={{fill: C.clay, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.2}} />
            <circle cx={34} cy={32} r={10} fill={C.white} stroke={C.ink} strokeWidth={2.5} />
          </svg>
        </div>
      )}
      <Tape x={w * 0.15} y={4} w={100} h={28} color={C.tapeYellow} rotate={-8} />
      <Tape x={w * 0.85} y={h - 4} w={100} h={28} color={C.tapeTeal} rotate={10} />
    </div>
  );
};

/** Receipt that unrolls from the top, lines ticking in. */
export const Receipt: React.FC<{w?: number; unrollAt: number; linesAt: number[]; totalAt: number}> = ({w = 520, unrollAt, linesAt, totalAt}) => {
  const frame = useCurrentFrame();
  const rowH = 54;
  const lines = copy.product.lines;
  const h = 110 + lines.length * rowH + 130;
  const unroll = prog(frame, unrollAt, 22);
  const totalP = pop(frame, totalAt, 0.9);
  const zig = Array.from({length: 18}).map((_, i) => `${(i / 17) * (w - 8) + 4},${h - 8 - (i % 2) * 12}`).join(' ');
  return (
    <div style={{position: 'relative', width: w, height: h, clipPath: `inset(0 0 ${(1 - unroll) * 100}% 0)`}}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display: 'block', overflow: 'visible'}}>
        <polygon points={`4,4 ${w - 4},4 ${w - 4},${h - 8} ${zig} 4,${h - 8}`} fill={C.white} stroke={C.ink} strokeWidth={3} strokeLinejoin="round" />
        <text x={w / 2} y={58} textAnchor="middle" fontFamily={F.print} fontSize={34} fill={C.ink} letterSpacing={3}>SITE WORK ESTIMATE</text>
        <RLine x1={30} y1={82} x2={w - 30} y2={82} seed={100} opts={{stroke: C.ink, strokeWidth: 2, roughness: 0.8}} />
        {lines.map((l, i) => {
          const p = prog(frame, linesAt[i] ?? 0, 8);
          if (p <= 0) return null;
          const y = 112 + i * rowH + 30;
          return (
            <g key={l[0]} opacity={p} transform={`translate(${(1 - p) * 20} 0)`}>
              <text x={30} y={y} fontFamily={F.mono} fontSize={22} fill={C.inkSoft}>{l[0]}</text>
              <text x={150} y={y} fontFamily={F.print} fontSize={30} fill={C.ink}>{l[1]}</text>
              <text x={w - 30} y={y} textAnchor="end" fontFamily={F.mono} fontSize={26} fontWeight={600} fill={C.ink}>{l[2]}</text>
            </g>
          );
        })}
        <RLine x1={30} y1={112 + lines.length * rowH + 6} x2={w - 30} y2={112 + lines.length * rowH + 6} seed={101} opts={{stroke: C.ink, strokeWidth: 3, roughness: 0.9}} />
        <g opacity={totalP > 0 ? 1 : 0} transform={`translate(${w - 30} ${112 + lines.length * rowH + 70}) scale(${0.8 + 0.2 * totalP})`}>
          <text x={0} y={0} textAnchor="end" fontFamily={F.round} fontWeight={700} fontSize={54} fill={C.clay}>{copy.product.total[1]}</text>
        </g>
        <text x={30} y={112 + lines.length * rowH + 62} fontFamily={F.print} fontSize={28} fill={C.inkSoft} opacity={totalP > 0 ? 1 : 0}>{copy.product.total[0]}</text>
      </svg>
    </div>
  );
};

/** Address search bar that types itself, then shows a search button. */
export const AddressBar: React.FC<{typeAt: number; w?: number}> = ({typeAt, w = 620}) => {
  const frame = useCurrentFrame();
  const text = copy.product.address;
  const n = Math.max(0, Math.min(text.length, Math.floor((frame - typeAt) / 2)));
  const done = n >= text.length;
  const caret = !done && Math.floor(frame / 8) % 2 === 0;
  return (
    <div style={{position: 'relative', width: w, height: 84}}>
      <svg width={w} height={84} viewBox={`0 0 ${w} 84`} style={{display: 'block', overflow: 'visible'}}>
        <RRect x={4} y={4} w={w - 8} h={76} seed={190} opts={{fill: C.white, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3.5, roughness: 1.2}} />
        <RRect x={w - 96} y={12} w={82} h={60} seed={191} opts={{fill: done ? C.clay : '#D9CFBF', fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.1}} />
        <circle cx={w - 60} cy={38} r={11} fill="none" stroke={C.white} strokeWidth={4} />
        <line x1={w - 52} y1={46} x2={w - 42} y2={56} stroke={C.white} strokeWidth={4} strokeLinecap="round" />
        <RPath d="M40 60 C 40 60, 24 40, 24 30 A 16 16 0 0 1 56 30 C 56 40, 40 60, 40 60 Z" seed={192} opts={{fill: C.clay, fillStyle: 'solid', stroke: C.ink, strokeWidth: 2.5, roughness: 1}} />
        <circle cx={40} cy={30} r={5} fill={C.white} />
        <text x={78} y={54} fontFamily={F.print} fontSize={36} fill={n === 0 ? '#B8AE9F' : C.ink}>{n === 0 ? copy.product.addressPlaceholder : text.slice(0, n)}{caret ? '|' : ''}</text>
      </svg>
    </div>
  );
};

/** "Priced on the safe side" badge: a round green sticker with a shield-like inner ring. */
export const SafeSide: React.FC<{size?: number}> = ({size = 170}) => (
  <div style={{position: 'relative', width: size, height: size}}>
    <svg width={size} height={size} viewBox="0 0 170 170" style={{display: 'block', overflow: 'visible'}}>
      <REllipse cx={85} cy={85} w={160} h={160} seed={195} opts={{fill: C.green, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3.5, roughness: 1.3}} />
      <REllipse cx={85} cy={85} w={136} h={136} seed={196} opts={{fill: 'none', stroke: C.white, strokeWidth: 2.5, roughness: 1.2}} />
      <text x={85} y={70} textAnchor="middle" fontFamily={F.print} fontSize={20} fill={C.white} letterSpacing={1.5}>{copy.product.safeSide}</text>
      <text x={85} y={104} textAnchor="middle" fontFamily={F.round} fontWeight={700} fontSize={31} fill={C.white} letterSpacing={0.5}>{copy.product.safeSideBig}</text>
      <path d="M55 122 L78 140 L118 118" fill="none" stroke={C.white} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

/** Sticker chip with hand-printed text. */
export const Chip: React.FC<{text: string; color?: string; bg?: string; size?: number}> = ({text, color = C.white, bg = C.green, size = 34}) => (
  <div style={{fontFamily: F.print, fontSize: size, color, background: bg, padding: `${size * 0.15}px ${size * 0.6}px`, borderRadius: size * 0.35, border: `3px solid ${C.ink}`, whiteSpace: 'nowrap', lineHeight: 1.15}}>{text}</div>
);

/** Clock sticker with a hand that sweeps quickly. */
export const Clock: React.FC<{size?: number; sweepAt: number}> = ({size = 300, sweepAt}) => {
  const frame = useCurrentFrame();
  const r = size / 2;
  const sweep = prog(frame, sweepAt, 40, (t) => t);
  const ang = stepped(sweep * 1080, 30) * 1 - 90;
  return (
    <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`} style={{display: 'block', overflow: 'visible'}}>
      <REllipse cx={0} cy={0} w={size - 20} h={size - 20} seed={110} opts={{fill: C.white, fillStyle: 'solid', stroke: C.ink, strokeWidth: 5, roughness: 1.4}} />
      {Array.from({length: 12}).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r1 = r - 26, r2 = r - (i % 3 === 0 ? 48 : 38);
        return <RLine key={i} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * r2} y2={Math.sin(a) * r2} seed={111 + i} opts={{stroke: C.ink, strokeWidth: i % 3 === 0 ? 5 : 3}} />;
      })}
      <g transform={`rotate(${ang})`}>
        <RLine x1={0} y1={0} x2={r * 0.6} y2={0} seed={130} opts={{stroke: C.clay, strokeWidth: 7}} />
      </g>
      <g transform={`rotate(${ang / 12 - 60})`}>
        <RLine x1={0} y1={0} x2={r * 0.4} y2={0} seed={131} opts={{stroke: C.ink, strokeWidth: 8}} />
      </g>
      <circle cx={0} cy={0} r={9} fill={C.ink} />
      <RLine x1={-r * 0.35} y1={-r - 8} x2={r * 0.35} y2={-r - 8} seed={132} opts={{stroke: C.ink, strokeWidth: 6}} />
      <RRect x={-16} y={-r - 30} w={32} h={24} seed={133} opts={{fill: C.clay, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1}} />
    </svg>
  );
};
