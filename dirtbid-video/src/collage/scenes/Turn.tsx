import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Paper} from '../ui/Paper';
import {Defs} from '../ui/Defs';
import {Item} from '../ui/Item';
import {Peep} from '../ui/Peep';
import {Tape} from '../ui/Tape';
import {HandText} from '../ui/HandText';
import {Burst, Sparkle} from '../ui/Doodles';
import {FlyingMark, Wordmark, BrandTagline} from '../ui/Brand';
import {useStage} from '../stage';
import {C} from '../theme';
import {cue, scene, f} from '../timeline';
import {slap, pop, wobble, prog} from '../motion';
import {copy} from '../content';

/**
 * SCENE 4 — THE TURN. Sky paper. The mark's paper strips fly in and snap
 * together, the wordmark slaps on, the tagline is lettered underneath.
 */
export const Turn: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useStage();
  const t0 = scene('turn').start;
  const L07 = f(cue('L07').start - t0);
  const markAt = 4;
  const wordAt = L07 - 2;
  const tagAt = L07 + 40;

  const markSize = S.aspect === 'wide' ? 300 : 280;
  const lock = S.at({wide: {x: S.cx, y: S.cy - 120}, vertical: {x: S.cx, y: S.cy - 260}, square: {x: S.cx, y: S.cy - 160}});
  const wordSize = S.aspect === 'wide' ? 180 : S.aspect === 'vertical' ? 160 : 140;
  // lockup geometry: mark left, wordmark right (wide/square); stacked on vertical
  const stacked = S.aspect === 'vertical';
  const wordW = wordSize * 3.45;
  const totalW = stacked ? Math.max(markSize, wordW) : markSize + 40 + wordW;
  const markC = stacked ? {x: lock.x, y: lock.y - 170} : {x: lock.x - totalW / 2 + markSize / 2, y: lock.y};
  const wordC = stacked ? {x: lock.x, y: lock.y + 120} : {x: lock.x + totalW / 2 - wordW / 2, y: lock.y};
  const ws = slap(frame, wordAt);
  const tagline = S.at({wide: {x: S.cx, y: S.cy + 180}, vertical: {x: S.cx, y: S.cy + 160}, square: {x: S.cx, y: S.cy + 150}});
  const samP = S.at({wide: {x: 250, y: S.H - 120, s: 0.9}, vertical: {x: 220, y: S.H - 160, s: 0.9}, square: {x: 180, y: S.H - 110, s: 0.75}});
  const samRise = prog(frame, L07 + 24, 14);

  return (
    <AbsoluteFill>
      <Defs />
      <Paper variant="sky" grid={false}>
        <FlyingMark cx={markC.x} cy={markC.y} size={markSize} at={markAt} W={S.W} H={S.H} />
        {frame >= markAt + 22 && frame < markAt + 50 && (
          <Item x={markC.x} y={markC.y} z={4}><Burst at={markAt + 22} r={markSize * 0.9} n={14} color={C.white} /></Item>
        )}
        {/* wordmark on a sticker plate */}
        <Item x={wordC.x} y={wordC.y} scale={ws.scale} opacity={ws.opacity} rotate={-2 + wobble(frame, 50, 0.8)} z={6} sticker shadow={ws.shadow}>
          <div style={{position: 'relative', padding: `${wordSize * 0.12}px ${wordSize * 0.22}px ${wordSize * 0.1}px`, background: C.white, display: 'flex', flexDirection: 'column', gap: wordSize * 0.1}}>
            <Wordmark size={wordSize} />
            <BrandTagline size={wordSize * 0.2} />
            <Tape x={wordSize * 0.3} y={0} w={wordSize * 0.9} h={wordSize * 0.2} color={C.tapePeach} rotate={-14} />
          </div>
        </Item>
        <Item x={wordC.x + wordW * 0.55} y={wordC.y - wordSize * 0.55} scale={pop(frame, wordAt + 8)} z={7}><Sparkle size={54} seed={11} /></Item>
        <Item x={wordC.x - wordW * 0.5} y={wordC.y + wordSize * 0.5} scale={pop(frame, wordAt + 14)} z={7}><Sparkle size={36} seed={12} color={C.clay} /></Item>

        {/* tagline */}
        <Item x={tagline.x} y={tagline.y} scale={tagline.s} rotate={-1.5} z={8}>
          <HandText size={S.aspect === 'wide' ? 84 : 72} at={tagAt} mode="write" dur={34} align="center" accent={['dirt']} maxWidth={S.aspect === 'wide' ? 1400 : 900} style={{whiteSpace: 'normal'}}>
            {copy.turn.tagline}
          </HandText>
        </Item>

        {/* Sam peeks up from the bottom corner */}
        <Item x={samP.x} y={samP.y + (1 - samRise) * 360} scale={samP.s} rotate={8 + wobble(frame, 51, 1)} z={9} sticker shadow={1}>
          <Peep name="sam-big" size={380} seed={3} />
        </Item>
      </Paper>
    </AbsoluteFill>
  );
};
