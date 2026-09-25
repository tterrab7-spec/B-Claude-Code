import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Item} from './Item';
import {Peep} from './Peep';
import {Parcel} from './Parcel';
import {Tape} from './Tape';
import {HandText} from './HandText';
import {Sun, Cloud} from './Doodles';
import {useStage} from '../stage';
import {C} from '../theme';
import {wobble} from '../motion';
import {copy} from '../content';
import {setLayout} from '../layouts';

/**
 * The standing set carried across hook → problem → stakes: sky doodles, the
 * parcel and Sam with a name tag. `face` swaps Sam's expression.
 */
export const StandingSet: React.FC<{face: string; parcelChildren?: React.ReactNode; parcelOverlay?: React.ReactNode; samZ?: number; hideAcres?: boolean; parcelFill?: string; parcelSeedShift?: number}> = ({face, parcelChildren, parcelOverlay, samZ = 4, hideAcres, parcelFill}) => {
  const frame = useCurrentFrame();
  const S = useStage();
  const {parcel, sam, sun, cloud} = setLayout(S);
  return (
    <>
      <Item x={sun.x} y={sun.y} scale={sun.s} rotate={wobble(frame, 1, 3)} sticker="thin" shadow={0.4}>
        <Sun size={120} />
      </Item>
      <Item x={cloud.x + 40} y={cloud.y} scale={cloud.s} sticker="thin" shadow={0.4}>
        <Cloud w={170} />
      </Item>
      <Item x={parcel.x} y={parcel.y} scale={parcel.s} rotate={wobble(frame, 2, 1) - 3} sticker shadow={1}>
        <Parcel size={460} fill={parcelFill}>{parcelChildren}</Parcel>
      </Item>
      {parcelOverlay}
      {!hideAcres && (
        <Item x={parcel.x + 10 * parcel.s} y={parcel.y - 10 * parcel.s} scale={parcel.s} rotate={-6 + wobble(frame, 3, 1.5)} z={3} sticker shadow={0.8}>
          <div style={{position: 'relative', padding: '10px 26px 6px', background: C.white}}>
            <HandText size={72} mode="none" color={C.ink}>{copy.hook.acres}</HandText>
            <Tape x={20} y={0} w={90} h={28} color={C.tapeTeal} rotate={-30} />
          </div>
        </Item>
      )}
      <Item x={sam.x} y={sam.y} scale={sam.s} rotate={-2 + wobble(frame, 5, 1)} sticker shadow={1} z={samZ}>
        <Peep name={face} size={420} seed={1} />
      </Item>
      <Item x={sam.x - 40 * sam.s} y={sam.y + 250 * sam.s} scale={sam.s} rotate={-4} z={samZ + 1} sticker shadow={0.8}>
        <div style={{position: 'relative', padding: '4px 30px 0', background: C.white}}>
          <HandText size={80} mode="none" color={C.clay}>{copy.hook.name}</HandText>
          <Tape x={36} y={2} w={80} h={26} color={C.tapePeach} rotate={-12} />
        </div>
      </Item>
    </>
  );
};
