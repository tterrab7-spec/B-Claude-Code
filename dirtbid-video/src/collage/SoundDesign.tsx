import React from 'react';
import {Audio, Sequence, staticFile, interpolate, useVideoConfig} from 'remotion';
import {TIMELINE, f, FPS} from './timeline';
import {SFX_CUES} from './sfx';

const MUSIC_BASE = 0.42;
const MUSIC_UNDER_VO = 0.2;

/** Music volume with ducking under every voiceover cue (0.35 s ramps). */
const musicVolume = (frame: number) => {
  const t = frame / FPS;
  let duck = 0;
  for (const c of TIMELINE.cues) {
    const inRamp = interpolate(t, [c.start - 0.35, c.start], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    const outRamp = interpolate(t, [c.end, c.end + 0.45], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    duck = Math.max(duck, Math.min(inRamp, outRamp));
  }
  return MUSIC_BASE + (MUSIC_UNDER_VO - MUSIC_BASE) * duck;
};

/** Voiceover, music bed and every sound effect, placed from the shared timeline. */
export const SoundDesign: React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  return (
    <>
      <Audio src={staticFile('audio/music.wav')} volume={(fr) => musicVolume(fr)} />
      {TIMELINE.cues.map((c) => (
        <Sequence key={c.id} from={f(c.start)} durationInFrames={Math.min(durationInFrames - f(c.start), f(c.end - c.start) + 4)} layout="none">
          <Audio src={staticFile(c.file)} volume={1} />
        </Sequence>
      ))}
      {SFX_CUES.map((s, i) => {
        const from = f(s.t);
        if (from >= durationInFrames - 2) return null;
        return (
          <Sequence key={i} from={from} durationInFrames={Math.min(60, durationInFrames - from)} layout="none">
            <Audio src={staticFile(`audio/sfx/${s.file}.wav`)} volume={s.vol ?? 0.6} />
          </Sequence>
        );
      })}
    </>
  );
};
