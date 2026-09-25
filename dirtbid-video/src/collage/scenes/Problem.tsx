import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Paper} from '../ui/Paper';
import {Defs} from '../ui/Defs';
import {Item} from '../ui/Item';
import {Doc} from '../ui/Doc';
import {StandingSet} from '../ui/Set';
import {HandText} from '../ui/HandText';
import {Underline, Strike} from '../ui/Marker';
import {RPath, RRect} from '../ui/Rough';
import {Tape} from '../ui/Tape';
import {useStage} from '../stage';
import {C, F} from '../theme';
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

/** Red X scribbled over something of width w. */
const CrossOut: React.FC<{w: number; h: number; at: number}> = ({w, h, at}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const p = prog(frame, at, 10);
  return (
    <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
      <RPath d={`M${w * 0.15} ${h * 0.15} L${w * 0.85} ${h * 0.85}`} seed={31} opts={{stroke: C.red, strokeWidth: 9, roughness: 1.6}} draw={Math.min(1, p * 2)} />
      <RPath d={`M${w * 0.85} ${h * 0.15} L${w * 0.15} ${h * 0.85}`} seed={32} opts={{stroke: C.red, strokeWidth: 9, roughness: 1.6}} draw={Math.max(0, p * 2 - 1)} />
    </svg>
  );
};

/** Index card with the only thing Sam has: an address. */
const AddressCard: React.FC = () => (
  <div style={{position: 'relative', width: 330, height: 190}}>
    <svg width={330} height={190} viewBox="0 0 330 190" style={{display: 'block', overflow: 'visible'}}>
      <RRect x={4} y={4} w={322} h={182} seed={35} opts={{fill: C.white, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.3}} />
      {[70, 108, 146].map((y, i) => <RPath key={i} d={`M28 ${y} L302 ${y}`} seed={36 + i} opts={{stroke: '#D9CFBF', strokeWidth: 2, roughness: 0.8}} />)}
      <RPath d="M44 92 C 44 92, 26 70, 26 58 A 18 18 0 0 1 62 58 C 62 70, 44 92, 44 92 Z" seed={39} opts={{fill: C.clay, fillStyle: 'solid', stroke: C.ink, strokeWidth: 2.5, roughness: 1.1}} />
      <circle cx={44} cy={58} r={6} fill={C.white} stroke={C.ink} strokeWidth={2} />
      <text x={80} y={82} fontFamily={F.hand} fontWeight={700} fontSize={44} fill={C.ink}>{copy.problem.address}</text>
      <text x={30} y={140} fontFamily={F.print} fontSize={24} fill={C.inkSoft}>{copy.problem.addressSub}</text>
    </svg>
    <Tape x={165} y={6} w={110} h={28} color={C.tapeTeal} rotate={-3} />
  </div>
);

/** Asking price tag. */
const AskingTag: React.FC = () => (
  <svg width={230} height={110} viewBox="0 0 230 110" style={{display: 'block', overflow: 'visible'}}>
    <RPath d="M16 22 L 170 22 L 214 55 L 170 88 L 16 88 Z" seed={45} opts={{fill: C.amber, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3.5, roughness: 1.4}} />
    <circle cx={190} cy={55} r={6} fill={C.white} stroke={C.ink} strokeWidth={2.5} />
    <text x={92} y={62} textAnchor="middle" fontFamily={F.round} fontWeight={700} fontSize={40} fill={C.ink}>{copy.problem.asking}</text>
    <text x={92} y={84} textAnchor="middle" fontFamily={F.print} fontSize={20} fill={C.inkSoft}>{copy.problem.askingSub}</text>
  </svg>
);

/**
 * SCENE 2 — THE PROBLEM. "No survey. No soil report." Two documents slap in
 * and get crossed out; all Sam has is an address card and an asking price.
 * Then the parcel gets a question mark and the real question is lettered.
 */
export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useStage();
  const t0 = scene('problem').start;
  const L03 = f(cue('L03').start - t0);
  const L04 = f(cue('L04').start - t0);
  const {parcel, sam} = setLayout(S);

  // L03 word hits: "No survey." 0.0 | "No soil report." 0.95 | "Just an address" 2.1 | "and an asking price." 3.1
  const docAt = [L03 + 2, L03 + 30];
  const xAt = [L03 + 12, L03 + 42];
  const addrAt = L03 + 66;
  const askAt = L03 + 96;
  // L04: "Before she makes an offer," 0 | "she needs one number:" 1.3 | "what the site work will cost." 2.3
  const qAt = L04 + 10;
  const faceAt = L04 + 18;
  const capAt = L04 + 68;

  const docs = [
    S.at({wide: {x: S.cx - 20, y: S.cy - 150, r: -9}, vertical: {x: S.cx + 300, y: S.cy + 150, r: -8}, square: {x: S.cx + 230, y: S.cy + 240, r: -8}}),
    S.at({wide: {x: S.cx + 40, y: S.cy + 40, r: 5}, vertical: {x: S.cx + 330, y: S.cy + 340, r: 6}, square: {x: S.cx + 350, y: S.cy + 330, r: 5}}),
  ];
  const addrP = S.at({wide: {x: S.cx - 70, y: S.cy + 230, r: -3, s: 1}, vertical: {x: S.cx + 250, y: S.cy + 560, r: -4, s: 1}, square: {x: S.cx + 250, y: S.cy + 440, r: -4, s: 0.9}});
  const askP = S.at({wide: {x: parcel.x + 240, y: parcel.y + 215, r: 8}, vertical: {x: parcel.x - 260, y: parcel.y + 250, r: -8}, square: {x: parcel.x + 210, y: parcel.y + 190, r: 8}});
  const caption = S.at({wide: {x: parcel.x + 40, y: parcel.y + 385}, vertical: {x: S.cx, y: parcel.y + 350}, square: {x: S.cx + 150, y: parcel.y + 260}});
  const face = frame >= faceAt ? 'sam-concerned' : 'sam-calm';
  const qDraw = prog(frame, qAt, 20);
  const capSize = S.aspect === 'wide' ? 74 : S.aspect === 'vertical' ? 62 : 54;
  const docS = S.aspect === 'wide' ? 0.95 : 0.85;

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

        {/* the documents Sam does not have */}
        {copy.problem.missing.map((title, i) => {
          const s = slap(frame, docAt[i]);
          const p = docs[i];
          return (
            <Item key={title} x={p.x} y={p.y} scale={s.scale * p.s * docS} opacity={s.opacity} rotate={p.r + wobble(frame, 10 + i, 1.2)} z={6 + i} sticker shadow={s.shadow}>
              <div style={{position: 'relative'}}>
                <Doc title={title} seed={20 + i * 3} tape={[C.tapeYellow, C.tapeTeal][i]} accent={[C.blue, C.green][i]} />
                <CrossOut w={190} h={240} at={xAt[i]} />
              </div>
            </Item>
          );
        })}

        {/* the address card: all she has */}
        {(() => {
          const s = slap(frame, addrAt);
          return (
            <Item x={addrP.x} y={addrP.y} scale={s.scale * addrP.s} opacity={s.opacity} rotate={addrP.r + wobble(frame, 14, 1)} z={9} sticker shadow={s.shadow}>
              <AddressCard />
            </Item>
          );
        })()}
        {/* asking price tag on the parcel */}
        <Item x={askP.x} y={askP.y} scale={pop(frame, askAt, 1) * askP.s} rotate={askP.r + wobble(frame, 15, 2)} z={9} sticker shadow={0.9}>
          <AskingTag />
        </Item>

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
        <Item x={caption.x} y={caption.y} scale={caption.s} rotate={-2} z={10}>
          <div style={{position: 'relative', whiteSpace: 'nowrap'}}>
            <HandText size={capSize} at={capAt} mode="pop" jitter={3} accent={['site', 'work']}>{copy.problem.question}</HandText>
            <Underline w={capSize * 9.6} at={capAt + 16} color={C.clay} />
          </div>
        </Item>
      </Paper>
    </AbsoluteFill>
  );
};
