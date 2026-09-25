import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {Topo} from '../components/Topo';
import {Parcel, parcelPath} from '../components/Parcel';
import {KineticText, Label} from '../components/KineticText';
import {Check} from '../components/Icons';
import {useLayout} from '../layout';
import {colors, fonts, type} from '../theme';
import {content} from '../content';
import {sceneStart} from '../timing';

const STAGE_START = 26;
const STAGE_GAP = 22;
const COLLAPSE = 226; // timeline compresses into a strip
const PAYOFF = 238; // parcel starts building
const SPACING = 300;

const smooth = (t: number) => Easing.inOut(Easing.cubic)(Math.max(0, Math.min(1, t)));

/**
 * Subdivision geometry in parcel coordinates: an entrance road from the south
 * boundary into a loop road, lots fronting both sides of the loop.
 */
const LOOP = {x0: 300, y0: 330, x1: 700, y1: 720, r: 70};
const ROADS = [
  `M480 905 L480 ${LOOP.y1}`,
  `M${LOOP.x0 + LOOP.r} ${LOOP.y0} L${LOOP.x1 - LOOP.r} ${LOOP.y0} Q${LOOP.x1} ${LOOP.y0} ${LOOP.x1} ${LOOP.y0 + LOOP.r} L${LOOP.x1} ${LOOP.y1 - LOOP.r} Q${LOOP.x1} ${LOOP.y1} ${LOOP.x1 - LOOP.r} ${LOOP.y1} L${LOOP.x0 + LOOP.r} ${LOOP.y1} Q${LOOP.x0} ${LOOP.y1} ${LOOP.x0} ${LOOP.y1 - LOOP.r} L${LOOP.x0} ${LOOP.y0 + LOOP.r} Q${LOOP.x0} ${LOOP.y0} ${LOOP.x0 + LOOP.r} ${LOOP.y0} Z`,
];

/** Lot lines: perpendiculars off each straight run of the loop, outward and inward. */
const LOT_LINES = (() => {
  const {x0, y0, x1, y1, r} = LOOP;
  // [ax, ay, bx, by, nx, ny] straight runs with outward normal
  const runs: [number, number, number, number, number, number][] = [
    [x0 + r, y0, x1 - r, y0, 0, -1],
    [x1, y0 + r, x1, y1 - r, 1, 0],
    [x1 - r, y1, x0 + r, y1, 0, 1],
    [x0, y1 - r, x0, y0 + r, -1, 0],
  ];
  const out: {x1: number; y1: number; x2: number; y2: number; order: number}[] = [];
  const edge = 22, outDepth = 150, inDepth = 110, every = 58;
  let order = 0;
  for (const [ax, ay, bx, by, nx, ny] of runs) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    // back lines
    out.push({x1: ax + nx * (edge + outDepth), y1: ay + ny * (edge + outDepth), x2: bx + nx * (edge + outDepth), y2: by + ny * (edge + outDepth), order: order++});
    const inner = nx !== 0; // inner lots only front the east/west runs
    if (inner) out.push({x1: ax - nx * (edge + inDepth), y1: ay - ny * (edge + inDepth), x2: bx - nx * (edge + inDepth), y2: by - ny * (edge + inDepth), order: order++});
    for (let d = 0; d <= len + 1; d += every) {
      const px = ax + ux * d, py = ay + uy * d;
      // skip outer lines that would cross the entrance road
      const nearEntrance = ny === 1 && Math.abs(px - 480) < 50;
      if (!nearEntrance) out.push({x1: px + nx * edge, y1: py + ny * edge, x2: px + nx * (edge + outDepth), y2: py + ny * (edge + outDepth), order: order++});
      if (inner) out.push({x1: px - nx * edge, y1: py - ny * edge, x2: px - nx * (edge + inDepth), y2: py - ny * (edge + inDepth), order: order++});
    }
  }
  // lots along the entrance road
  for (let y = 780; y < 900; y += every) {
    out.push({x1: 480 - edge, y1: y, x2: 480 - edge - 120, y2: y, order: order++});
    out.push({x1: 480 + edge, y1: y, x2: 480 + edge + 120, y2: y, order: order++});
  }
  return out;
})();

/**
 * SCENE 6 — THE PARTNER NETWORK. A horizontal timeline pans left as each
 * stage lights up and its partner card snaps in. Then the timeline compresses
 * into a strip and the parcel resolves from raw dirt to a graded, roaded
 * subdivision.
 */
export const Partners: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const c = content.partners;
  const stages = c.stages;
  const n = stages.length;
  const stageFrame = (i: number) => STAGE_START + i * STAGE_GAP;

  // continuous pan position
  let active = 0;
  for (let i = 1; i < n; i++) active += smooth((frame - (stageFrame(i) - 12)) / 12);

  const collapse = smooth((frame - COLLAPSE) / 16);
  const spacing = interpolate(collapse, [0, 1], [SPACING, Math.min(96, (L.safe.w - 40) / (n - 1))]);
  const panCenter = interpolate(collapse, [0, 1], [active, (n - 1) / 2]);
  const bandY0 = L.safe.y + (L.aspect === 'wide' ? 400 : 420);
  const bandY1 = L.safe.y + (L.aspect === 'wide' ? 280 : 292);
  const bandY = interpolate(collapse, [0, 1], [bandY0, bandY1]);
  const nodeR = interpolate(collapse, [0, 1], [14, 10]);
  const lineIn = interpolate(frame, [8, 26], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});

  const xOf = (i: number) => L.cx + (i - panCenter) * spacing;
  const cardW = Math.min(600, L.safe.w);
  const cardH = 160;
  const hSize = type.h2 * L.textScale;

  // payoff
  const pBox = {x: L.cx - 300, y: L.safe.y + (L.aspect === 'wide' ? 300 : 330), w: 600, h: 590};
  const pIn = interpolate(frame, [PAYOFF, PAYOFF + 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const roadP = (i: number) => interpolate(frame, [PAYOFF + 6 + i * 16, PAYOFF + 30 + i * 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const lotP = (i: number) => interpolate(frame, [PAYOFF + 40 + i * 0.55, PAYOFF + 48 + i * 0.55], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const graded = interpolate(frame, [PAYOFF + 60, PAYOFF + 84], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});

  return (
    <AbsoluteFill style={{backgroundColor: colors.base}}>
      <Topo frameOffset={sceneStart('partners')} opacity={0.7} />

      {/* headline + subline */}
      <div style={{position: 'absolute', left: L.safe.x, top: L.safe.y, width: L.safe.w}}>
        <KineticText text={c.headline} size={hSize} from={4} accent={['built.']} />
        <KineticText text={c.subline} size={type.body * L.textScale * 1.05} from={COLLAPSE + 4} font={fonts.body} weight={600} color={colors.sandMuted} lineHeight={1.25} style={{marginTop: 18}} />
      </div>

      {/* timeline */}
      <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0, opacity: lineIn}}>
        {/* unlit line */}
        <line x1={xOf(0)} x2={xOf(n - 1)} y1={bandY} y2={bandY} stroke={colors.sandFaint} strokeWidth={4} strokeDasharray="6 10" />
        {/* lit line */}
        <line x1={xOf(0)} x2={xOf(Math.min(n - 1, active))} y1={bandY} y2={bandY} stroke={colors.sand} strokeWidth={4} />
        {stages.map((s, i) => {
          const lit = frame >= stageFrame(i);
          const litS = spring({frame: frame - stageFrame(i), fps, config: {damping: 16, stiffness: 300, mass: 0.6}});
          const dist = Math.abs(i - active);
          const labelO = interpolate(dist, [0, 1.5], [1, 0], {extrapolateRight: 'clamp'}) * (1 - collapse);
          const x = xOf(i);
          return (
            <g key={s.stage}>
              <circle cx={x} cy={bandY} r={nodeR + 4 * litS} fill={lit ? colors.clay : colors.base} stroke={lit ? colors.clay : colors.sandMuted} strokeWidth={3} />
              {lit && (
                <g transform={`translate(${x - 8 * (nodeR / 14)} ${bandY - 8 * (nodeR / 14)}) scale(${nodeR / 14})`}>
                  <path d="M3 8.5l3.5 3.5L13 5" fill="none" stroke={colors.base} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}
              <text x={x} y={bandY - 34} textAnchor="middle" fill={lit ? colors.sand : colors.sandMuted} fontFamily={fonts.mono} fontSize={20} fontWeight={600} letterSpacing={2} opacity={labelO}>
                {s.stage.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      {/* active partner card */}
      {collapse < 1 &&
        stages.map((s, i) => {
          const dist = Math.abs(i - active);
          if (dist >= 1) return null;
          const at = stageFrame(i);
          if (frame < at - 6) return null;
          const drop = spring({frame: frame - (at - 6), fps, config: {damping: 200, stiffness: 170}});
          const o = (1 - dist) * (1 - collapse);
          const x = xOf(i);
          return (
            <div
              key={s.firm}
              style={{
                position: 'absolute',
                left: x - cardW / 2,
                top: bandY + 40 + (1 - drop) * 40,
                width: cardW,
                height: cardH,
                opacity: o * drop,
                background: colors.surface,
                border: `2px solid ${colors.sandFaint}`,
                borderLeft: `8px solid ${colors.clay}`,
                borderRadius: 8,
                padding: '22px 28px',
                boxSizing: 'border-box',
                boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
              }}
            >
              <div style={{fontFamily: fonts.mono, fontSize: 18, letterSpacing: 2, color: colors.sandMuted, textTransform: 'uppercase'}}>
                {String(i + 1).padStart(2, '0')} · {s.stage}
              </div>
              <div style={{fontFamily: fonts.headline, fontSize: cardW > 560 ? 40 : 34, color: colors.sand, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: -0.5}}>{s.firm}</div>
              <div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, color: colors.greenBright, fontFamily: fonts.body, fontWeight: 700, fontSize: 22}}>
                <div style={{width: 26, height: 26, borderRadius: 13, background: colors.green, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                  <Check size={16} color={colors.sand} />
                </div>
                {c.verified}
              </div>
            </div>
          );
        })}

      {/* payoff: parcel → subdivision */}
      {frame >= PAYOFF && (
        <>
          <Parcel id="payoff" box={pBox} draw={pIn} bearings={false} opacity={pIn} stroke={graded > 0.5 ? colors.greenBright : colors.sand} fill={colors.baseDeep}>
            {/* graded fill */}
            <path d={parcelPath()} fill={colors.green} fillOpacity={0.22 * graded} />
            {/* lot lines */}
            <g stroke={colors.sand} strokeWidth={2.5} strokeOpacity={0.85}>
              {LOT_LINES.map((l, i) => {
                const p = lotP(i);
                if (p <= 0) return null;
                return <line key={i} x1={l.x1} y1={l.y1} x2={l.x1 + (l.x2 - l.x1) * p} y2={l.y1 + (l.y2 - l.y1) * p} />;
              })}
            </g>
            {/* roads */}
            {ROADS.map((d, i) => (
              <g key={i}>
                <path d={d} fill="none" stroke={colors.base} strokeWidth={36} strokeLinecap="butt" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - roadP(i)} />
                <path d={d} fill="none" stroke={colors.sand} strokeWidth={2.5} strokeLinejoin="round" pathLength={1} strokeDasharray={`${roadP(i)} 1`} strokeOpacity={0.8} />
              </g>
            ))}
          </Parcel>
          <div style={{position: 'absolute', left: L.safe.x, width: L.safe.w, top: pBox.y + pBox.h - 14, textAlign: 'center'}}>
            <Label from={PAYOFF + 70} size={18} color={colors.greenBright}>{c.payoffStats}</Label>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
