import React from 'react';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {Topo} from '../components/Topo';
import {Parcel, parcelToScreen} from '../components/Parcel';
import {KineticText, Label, fmtUSD} from '../components/KineticText';
import {SurveyWipe} from '../components/Transitions';
import {useLayout, boxStyle} from '../layout';
import {colors, fonts, type} from '../theme';
import {content} from '../content';
import {sceneStart} from '../timing';

const BEAT_A = 140;
const BEAT_B = 130;
const WIPE = 14;

/**
 * SCENE 5 — THE PRODUCT. Three beats, each wiped in along a survey line:
 * A) the parcel fills with a USDA-style soil map, B) a CSI estimate cascades
 * and a markup waterfall steps to a total, C) a speed arc.
 */
export const Product: React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  const beatC = durationInFrames - BEAT_A - BEAT_B;
  return (
    <AbsoluteFill style={{backgroundColor: colors.base}}>
      <Sequence from={0} durationInFrames={BEAT_A + WIPE} layout="none">
        <BeatSoil />
      </Sequence>
      <Sequence from={BEAT_A} durationInFrames={BEAT_B + WIPE} layout="none">
        <SurveyWipe frames={WIPE}>
          <BeatEstimate />
        </SurveyWipe>
      </Sequence>
      <Sequence from={BEAT_A + BEAT_B} durationInFrames={beatC} layout="none">
        <SurveyWipe frames={WIPE} angleDeg={-22}>
          <BeatSpeed />
        </SurveyWipe>
      </Sequence>
    </AbsoluteFill>
  );
};

/** Soil map units in parcel coordinates. Hand-cut cells; clipped to the parcel. */
const CELLS: {pts: [number, number][]; color: number; unit: number; label: [number, number]}[] = [
  {pts: [[0, 0], [420, 0], [380, 420], [0, 480]], color: 1, unit: 0, label: [230, 300]},
  {pts: [[420, 0], [1000, 0], [1000, 330], [620, 380], [380, 420]], color: 5, unit: 1, label: [640, 250]},
  {pts: [[0, 480], [380, 420], [620, 380], [560, 650], [300, 700], [0, 760]], color: 4, unit: 2, label: [390, 560]},
  {pts: [[620, 380], [1000, 330], [1000, 760], [760, 700], [560, 650]], color: 0, unit: 3, label: [770, 540]},
  {pts: [[0, 760], [300, 700], [560, 650], [760, 700], [700, 1000], [0, 1000]], color: 2, unit: 4, label: [420, 820]},
  {pts: [[760, 700], [1000, 760], [1000, 1000], [700, 1000]], color: 3, unit: 5, label: [850, 860]},
];
/** Which cell each callout points to */
const CALLOUT_CELL = [2, 3, 4];

const BeatSoil: React.FC = () => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const c = content.product.beatA;
  const sweep = interpolate(frame, [14, 74], [0, 1000], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});

  const rows = c.callouts.map((_, i) => 60 + i * 24);
  const rowH = L.aspect === 'wide' ? 84 : 90;
  const listTop = L.text.y + 70;
  const fontSize = type.h3 * L.textScale * (L.aspect === 'wide' ? 1 : 1);

  return (
    <AbsoluteFill style={{backgroundColor: colors.base}}>
      <Topo frameOffset={sceneStart('product')} opacity={0.6} />
      <Parcel id="soil" box={L.graphic} draw={1} fill={colors.baseDeep}>
        <g clipPath="url(#soil-sweep)">
          <clipPath id="soil-sweep">
            <rect x={0} y={0} width={sweep} height={1000} />
          </clipPath>
          {CELLS.map((cell, i) => (
            <g key={i}>
              <polygon points={cell.pts.map((p) => p.join(',')).join(' ')} fill={colors.soil[cell.color]} fillOpacity={0.92} stroke={colors.base} strokeWidth={4} />
              <text x={cell.label[0]} y={cell.label[1]} fill={colors.base} fontFamily={fonts.mono} fontSize={30} fontWeight={600} textAnchor="middle" dominantBaseline="middle" opacity={0.85}>
                {c.units[cell.unit]}
              </text>
            </g>
          ))}
          {/* fine hatch for texture */}
          <g stroke={colors.base} strokeWidth={1} strokeOpacity={0.25}>
            {Array.from({length: 40}).map((_, i) => (
              <line key={i} x1={i * 25} y1={0} x2={i * 25 - 300} y2={1000} />
            ))}
          </g>
        </g>
        {/* sweep edge */}
        {sweep > 0 && sweep < 1000 && <line x1={sweep} y1={0} x2={sweep} y2={1000} stroke={colors.sand} strokeWidth={4} />}
      </Parcel>

      {/* kicker + callouts (inside safe square) */}
      <div style={boxStyle(L.text)}>
        <Label from={2} size={20} color={colors.clay}>{c.kicker}</Label>
      </div>
      {c.callouts.map((t, i) => {
        const at = rows[i];
        const s = interpolate(frame, [at, at + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
        if (frame < at) return null;
        const y = listTop + i * rowH;
        return (
          <div key={t} style={{position: 'absolute', left: L.text.x, top: y, width: L.text.w, display: 'flex', alignItems: 'center', gap: 18, opacity: s, transform: `translateX(${(1 - s) * -20}px)`}}>
            <div style={{width: 14, height: 14, borderRadius: 7, background: colors.amber, flex: 'none', boxShadow: `0 0 0 5px rgba(224,165,38,0.25)`}} />
            <div style={{fontFamily: fonts.body, fontWeight: 700, fontSize, color: colors.sand, whiteSpace: 'nowrap'}}>{t}</div>
          </div>
        );
      })}
      {/* leader lines */}
      <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        {c.callouts.map((t, i) => {
          const at = rows[i];
          if (frame < at + 4) return null;
          const p = interpolate(frame, [at + 4, at + 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
          const cell = CELLS[CALLOUT_CELL[i]];
          const target = parcelToScreen(cell.label[0], cell.label[1] + 40, L.graphic);
          const start = {x: L.text.x + 7, y: listTop + i * rowH + 7};
          // elbow: go vertical/horizontal first depending on layout
          const mid = L.aspect === 'wide' ? {x: start.x - 50 - i * 26, y: start.y} : {x: start.x + 40 + i * 30, y: L.text.y - 24};
          const d = `M${start.x} ${start.y} L${mid.x} ${mid.y} L${target.x} ${target.y}`;
          return (
            <g key={t}>
              <path d={d} fill="none" stroke={colors.amber} strokeWidth={2.5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} strokeOpacity={0.9} />
              <circle cx={target.x} cy={target.y} r={7} fill={colors.amber} opacity={p} />
            </g>
          );
        })}
      </svg>
      {/* source */}
      <div style={{position: 'absolute', left: L.safe.x, width: L.safe.w, top: L.safe.y + L.safe.h - 30, textAlign: L.aspect === 'wide' ? 'right' : 'center'}}>
        <Label from={70} size={18}>{c.source}</Label>
      </div>
    </AbsoluteFill>
  );
};

const BeatEstimate: React.FC = () => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const c = content.product.beatB;
  const items = c.lineItems;
  const subtotal = items.reduce((s, it) => s + it.amount, 0);
  const T = {rows: 10, gap: 7, subtotal: 52, markups: 60, mgap: 8, total: 118, caption: 122};
  let running = subtotal;
  const steps = c.markups.map((m) => {
    const add = subtotal * m.pct;
    running += add;
    return {...m, add, to: running};
  });
  const grand = running;
  const rowFont = L.aspect === 'wide' ? 24 : 26;
  const padX = 8;
  const rowH = 44;
  const mRowH = 38;
  const barMax = 420;

  return (
    <AbsoluteFill style={{backgroundColor: colors.base}}>
      <Topo frameOffset={sceneStart('product') + BEAT_A} opacity={0.5} />
      <div style={{...boxStyle(L.safe), fontFamily: fonts.mono, color: colors.sand}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 12, borderBottom: `2px solid ${colors.sandFaint}`}}>
          <Label from={0} size={20} color={colors.clay}>{c.kicker}</Label>
          <Label from={0} size={16}>CSI MasterFormat · Div 31–33</Label>
        </div>

        {/* line items */}
        {items.map((it, i) => {
          const at = T.rows + i * T.gap;
          const s = interpolate(frame, [at, at + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
          const v = interpolate(frame, [at, at + 16], [0, it.amount], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad)});
          if (frame < at) return <div key={it.code} style={{height: rowH}} />;
          return (
            <div key={it.code} style={{height: rowH, display: 'flex', alignItems: 'center', gap: 20, padding: `0 ${padX}px`, borderBottom: `1px solid ${colors.sandFaint}`, fontSize: rowFont, opacity: s, transform: `translateX(${(1 - s) * 30}px)`}}>
              <span style={{color: colors.sandMuted, width: 150, flex: 'none', whiteSpace: 'nowrap'}}>{it.code}</span>
              <span style={{fontFamily: fonts.body, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{it.name}</span>
              <span style={{marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 600}}>{fmtUSD(v)}</span>
            </div>
          );
        })}
        {/* subtotal */}
        <div style={{height: rowH + 6, display: 'flex', alignItems: 'center', padding: `0 ${padX}px`, fontSize: rowFont, opacity: interpolate(frame, [T.subtotal, T.subtotal + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), borderBottom: `2px solid ${colors.sand}`}}>
          <span style={{fontFamily: fonts.body, fontWeight: 700, color: colors.sandMuted}}>{c.subtotalLabel}</span>
          <span style={{marginLeft: 'auto', fontWeight: 600, fontVariantNumeric: 'tabular-nums'}}>{fmtUSD(subtotal)}</span>
        </div>

        {/* markup waterfall (horizontal) */}
        <div style={{marginTop: 14}}>
          {steps.map((st, i) => {
            const at = T.markups + i * T.mgap;
            const s = interpolate(frame, [at, at + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
            const fromX = ((st.to - st.add) / grand) * barMax;
            const w = (st.add / grand) * barMax * s;
            return (
              <div key={st.label} style={{height: mRowH, display: 'flex', alignItems: 'center', gap: 16, padding: `0 ${padX}px`, fontSize: rowFont - 4, opacity: frame >= at ? 1 : 0}}>
                <span style={{fontFamily: fonts.body, fontWeight: 600, width: L.aspect === 'wide' ? 150 : 160, flex: 'none', color: colors.sandMuted}}>{st.label}</span>
                <span style={{width: 70, color: colors.sandMuted, flex: 'none'}}>{(st.pct * 100).toFixed(1)}%</span>
                <div style={{position: 'relative', flex: 1, height: 18}}>
                  <div style={{position: 'absolute', left: 0, top: 8, width: barMax, height: 2, background: colors.sandFaint}} />
                  <div style={{position: 'absolute', left: fromX, top: 0, width: Math.max(0, w), height: 18, background: colors.clay, borderRadius: 2}} />
                </div>
                <span style={{marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', opacity: s, whiteSpace: 'nowrap'}}>+{fmtUSD(st.add * s)}</span>
              </div>
            );
          })}
        </div>

        {/* total */}
        {frame >= T.total && (
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, padding: `14px ${padX}px 0`, borderTop: `3px solid ${colors.clay}`, opacity: interpolate(frame, [T.total, T.total + 8], [0, 1], {extrapolateRight: 'clamp'}), transform: `scale(${1 + 0.04 * Math.sin(Math.min(1, (frame - T.total) / 10) * Math.PI)})`, transformOrigin: 'right center'}}>
            <span style={{fontFamily: fonts.body, fontWeight: 700, fontSize: rowFont + 2, color: colors.sand}}>{c.totalLabel}</span>
            <span style={{fontWeight: 600, fontSize: L.aspect === 'wide' ? 52 : 60, color: colors.clay, fontVariantNumeric: 'tabular-nums', letterSpacing: -2}}>{fmtUSD(grand)}</span>
          </div>
        )}

        {/* caption */}
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 0}}>
          <KineticText text={c.caption} size={L.aspect === 'wide' ? 30 : 34} font={fonts.body} weight={700} from={T.caption} color={colors.sand} lineHeight={1.2} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const BeatSpeed: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const c = content.product.beatC;
  const ringR = L.aspect === 'wide' ? 180 : 210;
  const stroke = 26;
  const cx = L.cx;
  const cy = L.safe.y + (L.aspect === 'wide' ? 300 : 320);
  const p = interpolate(frame, [10, 72], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const circ = 2 * Math.PI * ringR;
  const pop = spring({frame: frame - 68, fps, config: {damping: 14, stiffness: 240, mass: 0.7}});
  const struck = interpolate(frame, [30, 44], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const line1Top = cy + ringR + 70;

  return (
    <AbsoluteFill style={{backgroundColor: colors.base}}>
      <Topo frameOffset={sceneStart('product') + BEAT_A + BEAT_B} opacity={0.6} />
      <div style={{position: 'absolute', left: L.safe.x, top: L.safe.y, width: L.safe.w}}>
        <Label from={0} size={20} color={colors.clay}>{c.kicker}</Label>
      </div>
      <svg width={L.W} height={L.H} style={{position: 'absolute', inset: 0}}>
        {/* tick marks like a stopwatch */}
        {Array.from({length: 60}).map((_, i) => {
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const r1 = ringR + 34, r2 = ringR + (i % 5 === 0 ? 52 : 44);
          const lit = i / 60 <= p;
          return <line key={i} x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1} x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2} stroke={lit ? colors.clay : colors.sandFaint} strokeWidth={i % 5 === 0 ? 3 : 2} />;
        })}
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={colors.sandFaint} strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={colors.clay} strokeWidth={stroke} strokeLinecap="butt" strokeDasharray={circ} strokeDashoffset={circ * (1 - p)} transform={`rotate(-90 ${cx} ${cy})`} />
      </svg>
      {/* center readout */}
      <div style={{position: 'absolute', left: cx - ringR, top: cy - ringR, width: ringR * 2, height: ringR * 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6}}>
        <div style={{fontFamily: fonts.mono, fontWeight: 600, fontSize: ringR * 0.21, color: colors.sandMuted, position: 'relative', opacity: struck > 0 ? 1 : 0.9}}>
          {c.before}
          <div style={{position: 'absolute', left: 0, top: '52%', height: 4, width: `${struck * 100}%`, background: colors.red}} />
        </div>
        <div style={{fontFamily: fonts.headline, fontSize: ringR * 0.5, color: colors.sand, lineHeight: 1, transform: `scale(${0.85 + 0.15 * pop})`, opacity: interpolate(frame, [40, 52], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
          {c.after}
        </div>
        <Label from={50} size={16} color={colors.clay}>{c.afterLabel}</Label>
      </div>
      <div style={{position: 'absolute', left: L.safe.x, top: line1Top, width: L.safe.w, textAlign: 'center'}}>
        <KineticText text={c.line1} size={type.h2 * L.textScale} from={48} align="center" accent={['30', 'minutes.']} />
        <KineticText text={c.line2} size={type.h3 * L.textScale} from={78} align="center" font={fonts.body} weight={700} color={colors.sandMuted} style={{marginTop: 22}} />
      </div>
    </AbsoluteFill>
  );
};
