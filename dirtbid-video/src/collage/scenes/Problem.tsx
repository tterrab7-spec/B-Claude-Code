import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Paper} from '../ui/Paper';
import {Defs} from '../ui/Defs';
import {Item} from '../ui/Item';
import {Doc} from '../ui/Doc';
import {StandingSet} from '../ui/Set';
import {HandText} from '../ui/HandText';
import {Underline} from '../ui/Marker';
import {RPath} from '../ui/Rough';
import {useStage} from '../stage';
import {C} from '../theme';
import {cue, scene, f} from '../timeline';
import {slap, pop, wobble, prog, stepped} from '../motion';
import {copy} from '../content';
import {setLayout} from '../layouts';

/** Big hand-drawn question mark, draws on. */
export const QuestionMark: React.FC<{draw: number; size?: number; color?: string; seed?: number}> = ({draw, size = 200, color = C.clay, seed = 7}) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 100 140" style={{display: 'block', overflow: 'visible'}}>
    <RPath d="M22 38 C 22 8, 80 8, 78 40 C 76 62, 50 60, 50 92" seed={seed} opts={{stroke: color, strokeWidth: 10, roughness: 1.6, fill: 'none'}} draw={draw} />
    <RPath d="M46 118 a 7 7 0 1 0 8 0 a 7 7 0 1 0 -8 0" seed={seed + 1} opts={{stroke: color, strokeWidth: 8, roughness: 1.4, fill: color, fillStyle: 'solid'}} draw={Math.max(0, (draw - 0.8) / 0.2)} />
  </svg>
);

/**
 * SCENE 2 — THE PROBLEM. Sam's documents slap in one by one, then the parcel
 * gets a big question mark and the real question is lettered underneath.
 */
export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useStage();
  const t0 = scene('problem').start;
  const L03 = f(cue('L03').start - t0);
  const L04 = f(cue('L04').start - t0);
  const {parcel, sam} = setLayout(S);

  const docAt = [L03 + 10, L03 + 36, L03 + 62];
  const qAt = L04 + 14;
  const faceAt = L04 + 20;
  const capAt = L04 + 62;

  const docs = [
    S.at({wide: {x: S.cx - 20, y: S.cy - 150, r: -9}, vertical: {x: S.cx + 300, y: S.cy + 150, r: -8}, square: {x: S.cx + 230, y: S.cy + 240, r: -8}}),
    S.at({wide: {x: S.cx + 30, y: S.cy + 10, r: 5}, vertical: {x: S.cx + 330, y: S.cy + 330, r: 6}, square: {x: S.cx + 350, y: S.cy + 330, r: 5}}),
    S.at({wide: {x: S.cx - 40, y: S.cy + 180, r: -4}, vertical: {x: S.cx + 290, y: S.cy + 520, r: -5}, square: {x: S.cx + 240, y: S.cy + 430, r: -4}}),
  ];
  const caption = S.at({wide: {x: parcel.x - 20, y: parcel.y + 330}, vertical: {x: S.cx, y: parcel.y + 340}, square: {x: S.cx + 150, y: parcel.y + 250}});
  const face = frame >= faceAt ? 'sam-concerned' : 'sam-calm';
  const blink = frame >= faceAt && frame < faceAt + 3 ? 0.94 : 1;
  const qDraw = prog(frame, qAt, 20);
  const capSize = S.aspect === 'wide' ? 78 : S.aspect === 'vertical' ? 66 : 56;

  return (
    <AbsoluteFill>
      <Defs />
      <Paper>
        <StandingSet
          face={face}
          parcelOverlay={
            <Item x={parcel.x + 10 * parcel.s} y={parcel.y + 20 * parcel.s} scale={parcel.s * (0.9 + 0.1 * pop(frame, qAt))} rotate={wobble(frame, 8, 3)} z={3}>
              <QuestionMark draw={qDraw} size={190} />
            </Item>
          }
          hideAcres={frame >= qAt}
        />

        {/* documents */}
        {copy.problem.docs.map((title, i) => {
          const s = slap(frame, docAt[i]);
          const p = docs[i];
          return (
            <Item key={title} x={p.x} y={p.y} scale={s.scale * p.s} opacity={s.opacity} rotate={p.r + wobble(frame, 10 + i, 1.2)} z={6 + i} sticker shadow={s.shadow}>
              <Doc title={title} seed={20 + i * 3} tape={[C.tapeYellow, C.tapeTeal, C.tapePeach][i]} accent={[C.blue, C.green, C.clay][i]} />
            </Item>
          );
        })}

        {/* little question marks over Sam's head */}
        {[0, 1, 2].map((i) => {
          const at = faceAt + 4 + i * 5;
          const s = pop(frame, at, 0.8);
          const st = stepped(frame, 8);
          return (
            <Item key={i} x={sam.x + (S.aspect === 'wide' ? -60 + i * 70 : 150 + i * 60) * sam.s} y={sam.y - (S.aspect === 'wide' ? 250 + (i % 2) * 40 : 200 + i * 45) * sam.s - Math.sin(st * 0.3 + i) * 6} scale={s * sam.s * (0.55 + i * 0.12)} rotate={-12 + i * 12} z={8}>
              <QuestionMark draw={1} size={70} color={C.ink} seed={30 + i} />
            </Item>
          );
        })}

        {/* the question */}
        <Item x={caption.x} y={caption.y} scale={caption.s} rotate={-2} z={9}>
          <div style={{position: 'relative', whiteSpace: 'nowrap'}}>
            <HandText size={capSize} at={capAt} mode="pop" jitter={3} accent={['dirt', 'cost?']}>{copy.problem.question}</HandText>
            <Underline w={capSize * 8.2} at={capAt + 16} color={C.clay} />
          </div>
        </Item>
        <Item x={sam.x} y={sam.y} scale={blink} opacity={0}><div /></Item>
      </Paper>
    </AbsoluteFill>
  );
};
