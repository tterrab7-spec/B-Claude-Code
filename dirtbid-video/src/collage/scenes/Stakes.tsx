import React from 'react';
import {AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';
import {Paper} from '../ui/Paper';
import {Defs} from '../ui/Defs';
import {Item} from '../ui/Item';
import {StandingSet} from '../ui/Set';
import {RiskSticker} from '../ui/Risks';
import {ProForma, PriceTag} from '../ui/ProForma';
import {HandText} from '../ui/HandText';
import {Underline} from '../ui/Marker';
import {Stamp} from '../ui/Stamp';
import {QuestionMark} from './Problem';
import {useStage} from '../stage';
import {C} from '../theme';
import {cue, scene, f} from '../timeline';
import {slap, pop, wobble, prog, easeIn, stepped} from '../motion';
import {copy} from '../content';
import {setLayout} from '../layouts';

/**
 * SCENE 3 — THE STAKES. Three risk stickers slap onto the parcel, Sam panics,
 * the pro forma slides in and a $250,000 change order literally walks out of it.
 */
export const Stakes: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useStage();
  const t0 = scene('stakes').start;
  const L05 = f(cue('L05').start - t0);
  const L06 = f(cue('L06').start - t0);
  const {parcel, sam} = setLayout(S);

  const riskAt = [L05 + 4, L05 + 32, L05 + 62];
  const fearAt = L05 + 70;
  // L06: "Guess high, she loses the deal." 0–1.9 s | "Guess low, and a quarter million walks out of the pro forma." 2.0–4.9 s
  const soldAt = L06 + 22;
  const pfAt = L06 + 62;
  const tagAt = L06 + 84;
  const walkAt = L06 + 112;
  const hitAt = L06 + 128;

  const riskPos = [
    {x: -95, y: -100, r: -8}, {x: 100, y: -50, r: 6}, {x: -5, y: 115, r: -4},
  ];
  const pf = S.at({wide: {x: S.cx + 60, y: S.cy + 210, s: 0.9}, vertical: {x: S.cx, y: S.cy - 50, s: 0.98}, square: {x: S.cx + 90, y: S.cy + 210, s: 0.75}});
  const caption = S.at({wide: {x: parcel.x + 40, y: parcel.y + 385}, vertical: {x: S.cx, y: parcel.y + 350}, square: {x: S.cx + 150, y: parcel.y + 260}});
  const capSize = S.aspect === 'wide' ? 74 : S.aspect === 'vertical' ? 62 : 54;

  const pfIn = prog(frame, pfAt, 18);
  const pfY = interpolate(pfIn, [0, 1], [S.H * 0.6, 0]);
  const tag = slap(frame, tagAt);
  // walking off: the tag hops right, stepped at 8 fps
  const walkFrame = frame - walkAt;
  const walkX = walkFrame > 0 ? Math.floor(walkFrame / 4) * 46 : 0;
  const walkHop = walkFrame > 0 ? (Math.floor(walkFrame / 4) % 2 === 0 ? -10 : 0) : 0;
  const walkRot = walkFrame > 0 ? (Math.floor(walkFrame / 4) % 2 === 0 ? 4 : -4) : 0;
  const capOpacity = 1 - prog(frame, soldAt, 8);
  const face = frame >= fearAt ? 'sam-fear' : 'sam-concerned';

  return (
    <AbsoluteFill>
      <Defs />
      <Paper>
        <StandingSet
          face={face}
          hideAcres
          parcelOverlay={
            <>
              <Item x={parcel.x + 10 * parcel.s} y={parcel.y + 20 * parcel.s} scale={parcel.s} rotate={wobble(frame, 8, 3)} z={3} opacity={1 - prog(frame, riskAt[0], 6)}>
                <QuestionMark draw={1} size={190} />
              </Item>
              {copy.stakes.risks.map((label, i) => {
                const s = slap(frame, riskAt[i]);
                const p = riskPos[i];
                return (
                  <Item key={label} x={parcel.x + p.x * parcel.s} y={parcel.y + p.y * parcel.s} scale={s.scale * parcel.s * 0.8} opacity={s.opacity} rotate={p.r + wobble(frame, 20 + i, 1.5)} z={5 + i} sticker shadow={s.shadow}>
                    <RiskSticker kind={(['clay', 'rock', 'water'] as const)[i]} label={label} />
                  </Item>
                );
              })}
            </>
          }
        />

        {/* "guess high": someone else buys the land */}
        <Item x={parcel.x + 20 * parcel.s} y={parcel.y - 40 * parcel.s} scale={parcel.s * 1.1} rotate={0} z={9}>
          <Stamp text={copy.stakes.sold} sub={copy.stakes.soldSub} at={soldAt} color={C.red} size={54} rotate={-14} />
        </Item>

        {/* leftover question caption fades as the pro forma arrives */}
        <Item x={caption.x} y={caption.y} scale={caption.s} rotate={-2} z={4} opacity={capOpacity}>
          <div style={{position: 'relative', whiteSpace: 'nowrap'}}>
            <HandText size={capSize} mode="none" accent={['site', 'work']}>{copy.problem.question}</HandText>
            <Underline w={capSize * 9.6} at={0} color={C.clay} dur={1} />
          </div>
        </Item>

        {/* sweat drops on Sam */}
        {frame >= fearAt && [0, 1].map((i) => {
          const st = stepped(frame - fearAt, 8);
          return (
            <Item key={i} x={sam.x + (140 + i * 30) * sam.s} y={sam.y - (120 - i * 50) * sam.s + (st % 24) * 1.2} scale={sam.s * 0.9} z={9} opacity={1}>
              <svg width={22} height={32} viewBox="0 0 22 32"><path d="M11 2 C 16 12, 20 16, 20 22 A 9 9 0 0 1 2 22 C 2 16, 6 12, 11 2 Z" fill="#7FB2D6" stroke={C.ink} strokeWidth={2.5} /></svg>
            </Item>
          );
        })}

        {/* pro forma */}
        {frame >= pfAt && (
          <Item x={pf.x} y={pf.y + pfY} scale={pf.s} rotate={-2 + wobble(frame, 30, 1)} z={10} sticker shadow={1}>
            <ProForma hitAt={hitAt} />
          </Item>
        )}
        {/* price tag slaps on, then walks off */}
        {frame >= tagAt && (
          <Item x={pf.x + (walkFrame > 0 ? 40 : 40) * pf.s + walkX} y={pf.y + pfY - 40 * pf.s + walkHop} scale={tag.scale * pf.s * 0.95} opacity={tag.opacity} rotate={-6 + walkRot + wobble(frame, 31, 1)} z={12} sticker shadow={tag.shadow}>
            <PriceTag walkFrame={walkFrame} />
          </Item>
        )}
        {/* torn hole left behind */}
        {walkFrame > 2 && (
          <Item x={pf.x + 40 * pf.s} y={pf.y + pfY - 40 * pf.s} scale={pf.s * 0.95} rotate={-6} z={11} opacity={1}>
            <svg width={300} height={190} viewBox="0 0 300 190" style={{display: 'block'}}>
              <path d="M24 44 L 60 36 L 100 48 L 140 34 L 190 46 L 226 38 L 250 74 L 222 104 L 170 96 L 120 110 L 70 98 L 30 104 Z" fill={C.paperDeep} stroke="#FFFDF8" strokeWidth={5} strokeLinejoin="round" opacity={0.95} />
            </svg>
          </Item>
        )}
      </Paper>
    </AbsoluteFill>
  );
};
