import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {Topo} from '../components/Topo';
import {Lockup} from '../components/Logo';
import {KineticText, Label} from '../components/KineticText';
import {useLayout} from '../layout';
import {colors, fonts, type} from '../theme';
import {content} from '../content';
import {sceneStart} from '../timing';

/**
 * SCENE 7 — CALL TO ACTION. Clean end card. The domain is the single most
 * legible thing on screen; an underline draws beneath it and holds.
 */
export const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const c = content.cta;

  const lockIn = spring({frame: frame - 2, fps, config: {damping: 200, stiffness: 140}});
  const domainSize = Math.min(118 * (L.aspect === 'wide' ? 0.98 : 1), (L.safe.w / c.domain.length) * 1.66);
  const domainIn = spring({frame: frame - 26, fps, config: {damping: 200, stiffness: 150}});
  const underline = interpolate(frame, [40, 66], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const domainW = domainSize * 0.6 * c.domain.length;

  const gap = L.aspect === 'wide' ? 34 : 44;

  return (
    <AbsoluteFill style={{backgroundColor: colors.base}}>
      <Topo frameOffset={sceneStart('cta')} opacity={0.8} drift={0.6} />
      <div style={{position: 'absolute', left: L.safe.x, top: L.safe.y, width: L.safe.w, height: L.safe.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap}}>
        <div style={{opacity: lockIn, transform: `translateY(${(1 - lockIn) * 20}px)`}}>
          <Lockup size={L.aspect === 'wide' ? 96 : 110} />
        </div>

        <KineticText text={c.headline} size={type.h1 * L.textScale * 0.9} from={10} align="center" />

        <div style={{position: 'relative', opacity: domainIn, transform: `scale(${0.96 + 0.04 * domainIn})`}}>
          <div style={{fontFamily: fonts.headline, fontSize: domainSize, color: colors.clay, lineHeight: 1, letterSpacing: -domainSize * 0.025, whiteSpace: 'nowrap'}}>{c.domain}</div>
          <svg width={domainW} height={26} style={{display: 'block', margin: '10px auto 0', overflow: 'visible'}}>
            <line x1={0} y1={10} x2={domainW * underline} y2={10} stroke={colors.sand} strokeWidth={6} strokeLinecap="square" />
            {underline > 0.98 && (
              <path d={`M${domainW - 26} 0 L${domainW} 10 L${domainW - 26} 20`} fill="none" stroke={colors.sand} strokeWidth={6} strokeLinecap="square" strokeLinejoin="miter" opacity={interpolate(frame, [66, 72], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
            )}
          </svg>
        </div>

        <KineticText text={c.sub} size={type.h3 * L.textScale * 0.95} from={54} align="center" font={fonts.body} weight={700} />
        <Label from={68} size={L.aspect === 'wide' ? 20 : 22} color={colors.sandMuted} style={{textAlign: 'center', letterSpacing: 3}}>
          {c.states}
        </Label>
      </div>
    </AbsoluteFill>
  );
};
