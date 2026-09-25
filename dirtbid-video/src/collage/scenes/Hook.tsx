import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Paper} from '../ui/Paper';
import {Defs} from '../ui/Defs';
import {Item} from '../ui/Item';
import {Peep} from '../ui/Peep';
import {Parcel} from '../ui/Parcel';
import {Tape} from '../ui/Tape';
import {HandText} from '../ui/HandText';
import {Circle} from '../ui/Marker';
import {Sun, Cloud, Burst, Sparkle} from '../ui/Doodles';
import {RRect, RLine} from '../ui/Rough';
import {useStage} from '../stage';
import {C, F} from '../theme';
import {cue, scene, f} from '../timeline';
import {slap, pop, wobble, prog} from '../motion';
import {copy} from '../content';
import {setLayout} from '../layouts';

/**
 * SCENE 1 — HOOK. A parcel sticker slaps onto the page, Sam pops in and waves,
 * "40 acres" gets circled, a FOR SALE sign wobbles in.
 */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useStage();
  const t0 = scene('hook').start;
  const L01 = f(cue('L01').start - t0);
  const L02 = f(cue('L02').start - t0);

  const parcelAt = 6;
  const samAt = L01 - 2;
  const nameAt = L01 + 6;
  const acresAt = L02 + 22;
  const signAt = L02 + 40;

  const {parcel, sam, sun: sunP, cloud: cloudP} = setLayout(S);

  const ps = slap(frame, parcelAt);
  const ss = slap(frame, samAt);
  const nameS = pop(frame, nameAt);
  const acresS = pop(frame, acresAt);
  const signS = pop(frame, signAt, 0.8);
  const cloudDrift = prog(frame, 0, 200, (t) => t) * 40;

  return (
    <AbsoluteFill>
      <Defs />
      <Paper>
        {/* sky doodles */}
        <Item x={sunP.x} y={sunP.y} scale={sunP.s * pop(frame, 2, 0.7)} rotate={wobble(frame, 1, 3)} sticker="thin" shadow={0.4}>
          <Sun size={120} />
        </Item>
        <Item x={cloudP.x + cloudDrift} y={cloudP.y} scale={cloudP.s * pop(frame, 8, 0.7)} sticker="thin" shadow={0.4}>
          <Cloud w={170} />
        </Item>

        {/* the parcel */}
        <Item x={parcel.x} y={parcel.y} scale={ps.scale * parcel.s} opacity={ps.opacity} rotate={wobble(frame, 2, 1) - 3} sticker shadow={ps.shadow}>
          <Parcel size={460} />
        </Item>
        {/* 40 acres tag on the parcel */}
        <Item x={parcel.x + 10 * parcel.s} y={parcel.y - 10 * parcel.s} scale={acresS * parcel.s} rotate={-6 + wobble(frame, 3, 1.5)} z={3} sticker shadow={0.8}>
          <div style={{position: 'relative', padding: '10px 26px 6px', background: C.white}}>
            <HandText size={72} mode="none" color={C.ink}>{copy.hook.acres}</HandText>
            <Circle w={250} h={110} at={acresAt + 8} color={C.clay} />
            <Tape x={20} y={0} w={90} h={28} color={C.tapeTeal} rotate={-30} />
          </div>
        </Item>
        {/* for sale sign */}
        <Item x={parcel.x + 220 * parcel.s} y={parcel.y + 150 * parcel.s} scale={signS * parcel.s} rotate={8 + wobble(frame, 4, 2)} z={3} sticker origin="50% 100%">
          <svg width={150} height={150} viewBox="0 0 150 150" style={{display: 'block', overflow: 'visible'}}>
            <RLine x1={75} y1={150} x2={75} y2={70} seed={21} opts={{stroke: C.clayDeep, strokeWidth: 8}} />
            <RRect x={8} y={8} w={134} h={66} seed={22} opts={{fill: C.clay, fillStyle: 'solid', stroke: C.ink, strokeWidth: 3, roughness: 1.3}} />
            <text x={75} y={53} textAnchor="middle" fontFamily={F.round} fontWeight={700} fontSize={30} fill={C.white}>{copy.hook.sign}</text>
          </svg>
        </Item>

        {/* Sam */}
        <Item x={sam.x} y={sam.y} scale={ss.scale * sam.s} opacity={ss.opacity} rotate={-2 + wobble(frame, 5, 1)} sticker shadow={ss.shadow} z={4}>
          <Peep name="sam-smile" size={420} seed={1} />
        </Item>
        {frame >= samAt + 3 && frame < samAt + 30 && (
          <Item x={sam.x} y={sam.y - 40} z={3}>
            <Burst at={samAt + 3} r={230 * sam.s} n={12} color={C.clay} />
          </Item>
        )}
        {/* name label */}
        <Item x={sam.x - 40 * sam.s} y={sam.y + 250 * sam.s} scale={nameS * sam.s} rotate={-4} z={5} sticker shadow={0.8}>
          <div style={{position: 'relative', padding: '4px 30px 0', background: C.white}}>
            <HandText size={80} mode="none" color={C.clay}>{copy.hook.name}</HandText>
            <Tape x={36} y={2} w={80} h={26} color={C.tapePeach} rotate={-12} />
          </div>
        </Item>
        <Item x={sam.x + 210 * sam.s} y={sam.y - 170 * sam.s} scale={pop(frame, nameAt + 4) * sam.s} z={5}>
          <Sparkle size={44} seed={2} />
        </Item>
        <Item x={sam.x + 250 * sam.s} y={sam.y - 100 * sam.s} scale={pop(frame, nameAt + 9) * sam.s} z={5}>
          <Sparkle size={30} seed={3} color={C.clay} />
        </Item>
      </Paper>
    </AbsoluteFill>
  );
};
