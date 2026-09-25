import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {bob} from '../motion';

/** A hand-drawn character sticker (Open Peeps). Breathes at 8 fps. */
export const Peep: React.FC<{name: string; size?: number; seed?: number; still?: boolean; flip?: boolean}> = ({name, size = 300, seed = 1, still, flip}) => {
  const frame = useCurrentFrame();
  const b = still ? {y: 0, rotate: 0} : bob(frame, seed);
  return (
    <div style={{width: size, height: size, transform: `translateY(${b.y}px) rotate(${b.rotate}deg) ${flip ? 'scaleX(-1)' : ''}`}}>
      <Img src={staticFile(`peeps/${name}.svg`)} style={{width: size, height: size, display: 'block'}} />
    </div>
  );
};
