import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {Topo} from '../components/Topo';
import {KineticText, Label, fmtUSD} from '../components/KineticText';
import {useLayout, boxStyle, center} from '../layout';
import {colors, fonts, type} from '../theme';
import {content} from '../content';
import {sceneFrames} from '../timing';
import {mix} from '../components/Parcel';

const T = {
  headline: 4,
  counterStart: 34,
  counterEnd: 104,
  slam: 126, // counter hits chart
  cut2: 176, // headline 2 + receipt
  receiptStart: 200,
  receiptGap: 22,
};

/**
 * SCENE 3 — THE STAKES. A change-order counter rolls up to $250,000, slams
 * into the pro forma and knocks profit below the line. Then the receipt for
 * money already spent tallies up.
 */
export const Stakes: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const c = content.stakes;

  // ---- counter
  const counterVal = interpolate(frame, [T.counterStart, T.counterEnd], [0, c.changeOrder], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad)});
  const counterIn = spring({frame: frame - T.counterStart, fps, config: {damping: 200, stiffness: 160}});
  const flight = interpolate(frame, [T.slam - 14, T.slam], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic)});
  const counterGone = frame >= T.slam;

  // ---- chart
  const chart = L.graphic;
  const pad = L.aspect === 'square' ? 40 : 60;
  const barsN = c.proForma.bars.length;
  const gap = 22;
  const slotW = (chart.w - pad * 2 - gap * (barsN - 1)) / barsN;
  const baseline = chart.y + chart.h * 0.66;
  const unit = (chart.h * 0.5) / 100;
  const hit = spring({frame: frame - T.slam, fps, config: {damping: 9, stiffness: 240, mass: 0.7}});
  const shake = frame >= T.slam ? Math.sin((frame - T.slam) * 1.4) * 14 * Math.exp(-(frame - T.slam) * 0.16) : 0;
  const chartIn = interpolate(frame, [T.headline + 10, T.headline + 30], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});

  // counter start position: text box; end: profit bar
  const profitIdx = barsN - 1;
  const profitX = chart.x + pad + profitIdx * (slotW + gap) + slotW / 2;
  const counterHome = {x: L.text.x + L.text.w / 2, y: L.text.y + L.text.h * 0.5};
  const cx = interpolate(flight, [0, 1], [counterHome.x, profitX]);
  const cy = interpolate(flight, [0, 1], [counterHome.y, baseline - 40]);
  const cs = interpolate(flight, [0, 1], [1, 0.45]);

  const numSize = Math.min(type.hero * L.textScale * 1.25, (L.text.w / 8) * 1.62);
  const hSize = type.h2 * L.textScale * (L.aspect === 'wide' ? 1.05 : 1);

  // ---- receipt
  const items = c.receipt.items;
  const receiptTotal = items.reduce((s, it) => s + it.amount, 0);
  const receiptDone = T.receiptStart + items.length * T.receiptGap + 18;

  return (
    <AbsoluteFill style={{backgroundColor: colors.base}}>
      <Topo frameOffset={sceneFrames('hook') + sceneFrames('problem')} opacity={0.7} />

      {/* Pro forma chart */}
      <div style={{...boxStyle(chart), opacity: chartIn, transform: `translateX(${shake}px)`}}>
        <Label size={18} from={T.headline + 10} style={{position: 'absolute', left: pad, top: 0}}>
          {c.proForma.title}
        </Label>
        <svg width={chart.w} height={chart.h} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
          {/* grid */}
          {[-40, -20, 20, 40, 60, 80].map((v) => (
            <line key={v} x1={pad} x2={chart.w - pad} y1={baseline - chart.y - v * unit} y2={baseline - chart.y - v * unit} stroke={colors.sandFaint} strokeWidth={1} strokeDasharray="4 8" />
          ))}
          {c.proForma.bars.map((b, i) => {
            const x = pad + i * (slotW + gap);
            const grow = interpolate(frame, [T.headline + 14 + i * 5, T.headline + 40 + i * 5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
            const isProfit = i === profitIdx;
            let value = b.value * grow;
            let fill: string = isProfit ? colors.green : colors.sandMuted;
            if (isProfit && frame >= T.slam) {
              value = interpolate(hit, [0, 1], [b.value, c.proForma.profitAfter]);
              fill = mix(colors.green, colors.red, Math.min(1, hit * 1.4));
            }
            const h = Math.abs(value) * unit;
            const y = value >= 0 ? baseline - chart.y - h : baseline - chart.y;
            return (
              <g key={b.label}>
                <rect x={x} y={y} width={slotW} height={h} fill={fill} rx={3} opacity={isProfit ? 1 : 0.55} />
                <text x={x + slotW / 2} y={baseline - chart.y + 34} textAnchor="middle" fill={colors.sandMuted} fontFamily={fonts.mono} fontSize={slotW < 120 ? 14 : 18} fontWeight={600} letterSpacing={slotW < 120 ? 0.5 : 1.5}>
                  {b.label.toUpperCase()}
                </text>
                {isProfit && frame >= T.slam + 6 && (
                  <text x={x + slotW / 2} y={baseline - chart.y + h + 40} textAnchor="middle" fill={colors.red} fontFamily={fonts.mono} fontSize={22} fontWeight={600}>
                    {Math.round(value)}%
                  </text>
                )}
              </g>
            );
          })}
          {/* baseline */}
          <line x1={pad - 10} x2={chart.w - pad + 10} y1={baseline - chart.y} y2={baseline - chart.y} stroke={colors.sand} strokeWidth={3} />
          {/* impact crack */}
          {frame >= T.slam && (
            <g opacity={interpolate(frame, [T.slam, T.slam + 40], [1, 0], {extrapolateRight: 'clamp'})}>
              <path d={`M${profitX - chart.x - 30} ${baseline - chart.y} l12 -18 l10 26 l14 -30 l8 22`} fill="none" stroke={colors.amber} strokeWidth={3} />
            </g>
          )}
        </svg>
      </div>

      {/* Headline 1 → counter */}
      <div style={boxStyle(L.text)}>
        <KineticText text={c.headline} size={hSize} from={T.headline} until={T.cut2} accent={['margin']} maxWidth={L.text.w} />
      </div>

      {!counterGone && frame >= T.counterStart && (
        <div
          style={{
            position: 'absolute',
            left: cx,
            top: cy,
            transform: `translate(-50%, -50%) scale(${cs * interpolate(counterIn, [0, 1], [0.92, 1])})`,
            opacity: counterIn,
            textAlign: 'center',
            width: L.text.w,
          }}
        >
          <div style={{fontFamily: fonts.mono, fontWeight: 600, fontSize: numSize, color: colors.amber, letterSpacing: -numSize * 0.04, lineHeight: 1, fontVariantNumeric: 'tabular-nums'}}>
            {fmtUSD(counterVal)}
          </div>
          <Label from={T.counterStart + 6} size={20} color={colors.sand} style={{marginTop: 14}}>
            {c.changeOrderLabel}
          </Label>
        </div>
      )}

      {/* Headline 2 + receipt */}
      <div style={{...boxStyle(L.text), display: 'flex', flexDirection: 'column'}}>
        <KineticText text={c.headline2} size={hSize * 0.92} from={T.cut2} accent={['civil', 'geotech', 'survey']} maxWidth={L.text.w} />
        {frame >= T.receiptStart && (
          <div style={{marginTop: L.aspect === 'wide' ? 30 : 40, fontFamily: fonts.mono, fontSize: L.aspect === 'wide' ? 24 : 28, color: colors.sand, width: '100%'}}>
            {items.map((it, i) => {
              const at = T.receiptStart + i * T.receiptGap;
              if (frame < at) return null;
              const v = interpolate(frame, [at, at + 18], [0, it.amount], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
              const o = interpolate(frame, [at, at + 6], [0, 1], {extrapolateRight: 'clamp'});
              return (
                <div key={it.label} style={{display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px dashed ${colors.sandFaint}`, opacity: o}}>
                  <span>{it.label}</span>
                  <span style={{fontVariantNumeric: 'tabular-nums'}}>{fmtUSD(v)}</span>
                </div>
              );
            })}
            {frame >= receiptDone && (
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 16, gap: 20, opacity: interpolate(frame, [receiptDone, receiptDone + 8], [0, 1], {extrapolateRight: 'clamp'})}}>
                <span style={{fontFamily: fonts.body, fontWeight: 600, fontSize: L.aspect === 'wide' ? 20 : 24, color: colors.sandMuted, lineHeight: 1.15}}>{c.receipt.totalLabel}</span>
                <span style={{color: colors.amber, fontWeight: 600, fontSize: L.aspect === 'wide' ? 34 : 42, whiteSpace: 'nowrap'}}>{fmtUSD(receiptTotal)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
