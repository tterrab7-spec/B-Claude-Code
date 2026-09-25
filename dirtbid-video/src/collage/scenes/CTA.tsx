import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Paper} from '../ui/Paper';
import {Defs} from '../ui/Defs';
import {Item} from '../ui/Item';
import {Peep} from '../ui/Peep';
import {HandText} from '../ui/HandText';
import {Underline} from '../ui/Marker';
import {Sparkle, Arrow} from '../ui/Doodles';
import {Lockup} from '../ui/Brand';
import {RPoly} from '../ui/Rough';
import {useStage} from '../stage';
import {C, F} from '../theme';
import {cue, scene, f} from '../timeline';
import {slap, pop, wobble, prog} from '../motion';
import {copy} from '../content';

/** Starburst badge */
const Badge: React.FC<{text: string; size?: number}> = ({text, size = 150}) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 ? size * 0.4 : size * 0.5;
    pts.push([size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r]);
  }
  return (
    <div style={{position: 'relative', width: size, height: size}}>
      <svg width={size} height={size} style={{display: 'block', overflow: 'visible'}}>
        <RPoly pts={pts} seed={170} opts={{fill: C.amber, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.2}} />
      </svg>
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.round, fontWeight: 700, fontSize: size * 0.3, color: C.ink, transform: 'rotate(-12deg)'}}>{text}</div>
    </div>
  );
};

/**
 * SCENE 7 — CALL TO ACTION. Sky paper end card: lockup, headline, the domain
 * as the biggest sticker on the page with a marker underline, FREE badge,
 * the cast peeking up from the bottom edge.
 */
export const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useStage();
  const t0 = scene('cta').start;
  const L12 = f(cue('L12').start - t0);
  const L13 = f(cue('L13').start - t0);
  const lockAt = 4;
  const headAt = L12 + 2;
  const domainAt = L12 + 52;
  const badgeAt = L12 + 78;
  const subAt = L13 + 2;
  const statesAt = L13 + 36;
  const castAt = L13 + 14;

  const wide = S.aspect === 'wide';
  const col = S.at({wide: {x: S.cx, y: S.cy - 10}, vertical: {x: S.cx, y: S.cy - 150}, square: {x: S.cx, y: S.cy - 60}});
  const domainSize = wide ? 150 : S.aspect === 'vertical' ? 124 : 116;
  const headSize = wide ? 84 : S.aspect === 'vertical' ? 62 : 56;
  const ds = slap(frame, domainAt);
  const lockSize = wide ? 110 : 96;
  const gap = wide ? 132 : S.aspect === 'vertical' ? 150 : 112;
  const castRise = prog(frame, castAt, 16);
  const cast = [
    {name: 'sam-big', x: wide ? 230 : 150, s: wide ? 1 : 0.8, r: 6},
    {name: 'p-crew', x: S.W - (wide ? 420 : 300), s: wide ? 0.85 : 0.68, r: -5},
    {name: 'p-surveyor', x: S.W - (wide ? 230 : 140), s: wide ? 0.9 : 0.72, r: 8},
  ];

  return (
    <AbsoluteFill>
      <Defs />
      <Paper variant="sky" grid={false}>
        <Item x={col.x} y={col.y - gap * 2.3} z={4} sticker shadow={1}>
          <Lockup size={lockSize} at={lockAt} />
        </Item>
        <Item x={col.x} y={col.y - gap * 0.9} z={5}>
          <HandText size={headSize} at={headAt} mode="pop" jitter={2} align="center" style={{whiteSpace: 'nowrap'}}>{copy.cta.headline}</HandText>
        </Item>
        {/* domain */}
        <Item x={col.x} y={col.y + gap * 0.35} scale={ds.scale} opacity={ds.opacity} rotate={-2 + wobble(frame, 80, 0.6)} z={8} sticker shadow={ds.shadow}>
          <div style={{position: 'relative', background: C.white, padding: `${domainSize * 0.08}px ${domainSize * 0.25}px ${domainSize * 0.02}px`}}>
            <div style={{fontFamily: F.round, fontWeight: 700, fontSize: domainSize, color: C.clay, lineHeight: 1.05, letterSpacing: -domainSize * 0.02, whiteSpace: 'nowrap'}}>{copy.cta.domain}</div>
            <Underline w={domainSize * 6.3} at={domainAt + 10} color={C.ink} stroke={8} dur={16} style={{marginTop: -domainSize * 0.08}} />
          </div>
        </Item>
        <Item x={col.x + domainSize * 3.6} y={col.y - gap * 0.1} scale={pop(frame, badgeAt, 1)} rotate={12 + wobble(frame, 81, 2)} z={9} sticker="thin" shadow={0.9}>
          <Badge text={copy.cta.free} size={wide ? 170 : 140} />
        </Item>
        <Item x={col.x - domainSize * 3.9} y={col.y + gap * 0.6} scale={pop(frame, domainAt + 18)} z={9}><Arrow w={130} at={domainAt + 18} color={C.ink} /></Item>
        <Item x={col.x + domainSize * 2.9} y={col.y + gap * 1.0} scale={pop(frame, badgeAt + 8)} z={9}><Sparkle size={48} seed={41} /></Item>
        <Item x={col.x - domainSize * 3.2} y={col.y - gap * 0.2} scale={pop(frame, badgeAt + 14)} z={9}><Sparkle size={34} seed={42} color={C.clay} /></Item>
        {/* sub + states */}
        <Item x={col.x} y={col.y + gap * 1.45} z={6}>
          <HandText size={wide ? 62 : 54} at={subAt} mode="pop" jitter={1.5} align="center" color={C.ink} style={{whiteSpace: 'nowrap'}}>{copy.cta.sub}</HandText>
        </Item>
        <Item x={col.x} y={col.y + gap * 2.15} z={6}>
          <HandText size={wide ? 34 : 30} at={statesAt} mode="write" dur={20} align="center" font={F.print} weight={400} color={C.inkSoft} style={{whiteSpace: 'nowrap', letterSpacing: 2}}>{copy.cta.states}</HandText>
        </Item>
        {/* cast peeks up from the bottom */}
        {cast.map((c, i) => (
          <Item key={c.name} x={c.x} y={S.H - (wide ? 30 : 10) + (1 - castRise) * 420 - (i === 0 ? 50 : 0)} scale={c.s * S.k * 1.05} rotate={c.r + wobble(frame, 82 + i, 1)} z={20 + i} sticker shadow={1}>
            <Peep name={c.name} size={380} seed={20 + i} />
          </Item>
        ))}
      </Paper>
    </AbsoluteFill>
  );
};
