import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {Topo} from '../components/Topo';
import {Parcel, FLAG_POINTS} from '../components/Parcel';
import {KineticText, Label} from '../components/KineticText';
import {RiskIcon} from '../components/Icons';
import {useLayout, boxStyle} from '../layout';
import {colors, fonts, type} from '../theme';
import {content} from '../content';
import {sceneFrames} from '../timing';

const CARD_START = 62;
const CARD_GAP = 24;

/** Frame at which risk card i lands. Exported so the Turn scene can echo the flags. */
export const cardLandFrame = (i: number) => CARD_START + i * CARD_GAP;

/**
 * SCENE 2 — THE PROBLEM. Headline, then eight risk cards stack into a pile
 * that gets heavier while the parcel outline goes amber and sprouts flags.
 */
export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const risks = content.problem.risks;
  const n = risks.length;
  const lastLand = cardLandFrame(n - 1);

  // parcel glow ramps with each landed card
  const landed = risks.filter((_, i) => frame >= cardLandFrame(i)).length;
  const glow = interpolate(landed, [0, n], [0, 1]) * interpolate(frame, [lastLand, lastLand + 20], [1, 1.15], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pulse = 1 + 0.06 * Math.sin(frame * 0.35) * Math.min(1, glow);

  // 12 flags; 8 come with cards, the rest fill in after
  const flagFrames = FLAG_POINTS.map((_, i) => (i < n ? cardLandFrame(i) + 6 : lastLand + 8 + (i - n) * 7));

  const hSize = type.h2 * L.textScale * (L.aspect === 'wide' ? 1.05 : 1);

  // pile geometry inside the text box, under the headline
  const headH = L.aspect === 'wide' ? 250 : L.aspect === 'square' ? 130 : 180;
  const pile = {x: L.text.x, y: L.text.y + headH, w: L.text.w, h: L.text.h - headH};
  const cardW = Math.min(520, pile.w - 40);
  const cardH = L.aspect === 'square' ? 46 : 52;
  // cards nearly touch: every label stays readable, weight comes from jitter, sink and shadow
  const stackStep = cardH - 2;
  const stackH = cardH + (n - 1) * stackStep;
  const baseY = pile.y + (pile.h - stackH) / 2 + stackH - cardH - 10;
  const sink = interpolate(landed, [0, n], [0, 22]); // whole pile compresses down as weight builds

  return (
    <AbsoluteFill style={{backgroundColor: colors.base}}>
      <Topo frameOffset={sceneFrames('hook')} />
      <Parcel id="problem" box={L.graphic} draw={1} glow={Math.min(1, glow * pulse)} flagFrames={flagFrames} />

      <div style={boxStyle(L.text)}>
        <KineticText text={content.problem.headline} size={hSize} from={4} accent={['before']} maxWidth={L.text.w} />
      </div>

      {/* the pile */}
      <div style={{position: 'absolute', left: 0, top: 0}}>
        {risks.map((r, i) => {
          const land = cardLandFrame(i);
          if (frame < land - 16) return null;
          const s = spring({frame: frame - (land - 16), fps, config: {damping: 22, stiffness: 190, mass: 0.9}});
          const drop = interpolate(s, [0, 1], [-(L.H * 0.35), 0]);
          const rot = ((i % 2 === 0 ? 1 : -1) * (0.4 + (i % 3) * 0.4)) * s;
          const dx = ((i * 37) % 23) - 11;
          const y = baseY - i * stackStep + sink;
          const x = pile.x + (pile.w - cardW) / 2 + dx;
          // squash on impact
          const impact = spring({frame: frame - land, fps, config: {damping: 12, stiffness: 300, mass: 0.5}});
          const sq = 1 - 0.06 * Math.sin(impact * Math.PI);
          return (
            <div
              key={r.label}
              style={{
                position: 'absolute',
                left: x,
                top: y + drop,
                width: cardW,
                height: cardH,
                transform: `rotate(${rot}deg) scaleY(${sq})`,
                transformOrigin: '50% 100%',
                background: colors.surface,
                border: `2px solid ${i === n - 1 ? colors.amber : colors.sandFaint}`,
                borderRadius: 6,
                boxShadow: `0 ${10 + i * 2}px ${20 + i * 4}px rgba(0,0,0,${0.35 + i * 0.04})`,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '0 20px',
                color: colors.sand,
                fontFamily: fonts.body,
                fontWeight: 700,
                fontSize: L.aspect === 'square' ? 23 : 26,
                lineHeight: 1.1,
                zIndex: i,
              }}
            >
              <div style={{color: colors.amber, flex: 'none'}}>
                <RiskIcon name={r.icon} size={26} color={colors.amber} />
              </div>
              <div style={{whiteSpace: 'nowrap'}}>{r.label}</div>
              <div style={{marginLeft: 'auto', fontFamily: fonts.mono, fontSize: 16, color: colors.sandMuted, letterSpacing: 1}}>
                {String(i + 1).padStart(2, '0')}
              </div>
            </div>
          );
        })}
      </div>

      {/* ground line under the pile, bends as it takes weight */}
      <svg style={{position: 'absolute', left: 0, top: 0}} width={L.W} height={L.H}>
        <path
          d={`M${pile.x} ${baseY + cardH + 22 + sink} Q${pile.x + pile.w / 2} ${baseY + cardH + 22 + sink + sink * 1.4} ${pile.x + pile.w} ${baseY + cardH + 22 + sink}`}
          fill="none"
          stroke={colors.sandFaint}
          strokeWidth={3}
        />
      </svg>

      {frame > lastLand + 10 && (
        <div style={{position: 'absolute', left: pile.x, top: baseY + cardH + 40 + sink, width: pile.w, textAlign: 'center'}}>
          <Label from={lastLand + 10} size={18} color={colors.amber}>
            {content.problem.pileLabel} · {String(n).padStart(2, '0')}
          </Label>
        </div>
      )}
    </AbsoluteFill>
  );
};
