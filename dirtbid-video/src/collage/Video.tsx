import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {TIMELINE, f} from './timeline';
import {TornWipe} from './ui/Transitions';
import {SoundDesign} from './SoundDesign';
import {C} from './theme';
import {Hook} from './scenes/Hook';
import {Problem} from './scenes/Problem';
import {Stakes} from './scenes/Stakes';
import {Turn} from './scenes/Turn';
import {Product} from './scenes/Product';
import {Partners} from './scenes/Partners';
import {CTA} from './scenes/CTA';

export const SCENE_COMPONENTS: Record<string, React.FC> = {hook: Hook, problem: Problem, stakes: Stakes, turn: Turn, product: Product, partners: Partners, cta: CTA};

/** Transition into each scene: how many frames of torn-paper wipe, and direction. */
export const TRANSITIONS: Record<string, {frames: number; direction: 'ltr' | 'ttb'} | null> = {
  hook: null, problem: null, stakes: null, turn: {frames: 16, direction: 'ltr'}, product: {frames: 16, direction: 'ttb'}, partners: null, cta: {frames: 18, direction: 'ltr'},
};

export const CollageVideo: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: C.paper}}>
    {TIMELINE.scenes.map((s, i) => {
      const Comp = SCENE_COMPONENTS[s.id];
      if (!Comp) return null;
      const tr = TRANSITIONS[s.id];
      const next = TIMELINE.scenes[i + 1];
      const hold = next && TRANSITIONS[next.id] ? TRANSITIONS[next.id]!.frames : 0;
      const from = f(s.start);
      const dur = f(s.end) - from + hold;
      const node = tr ? <TornWipe frames={tr.frames} direction={tr.direction} seed={i + 1}><Comp /></TornWipe> : <Comp />;
      return (
        <Sequence key={s.id} name={s.id} from={from} durationInFrames={dur} layout="none">
          {node}
        </Sequence>
      );
    })}
    <SoundDesign />
  </AbsoluteFill>
);
