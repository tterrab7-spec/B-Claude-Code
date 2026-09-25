import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {SCENES, TRANSITIONS, SceneId} from './timing';
import {SurveyWipe, IrisReveal} from './components/Transitions';
import {colors} from './theme';
import {Hook} from './scenes/Hook';
import {Problem} from './scenes/Problem';
import {Stakes} from './scenes/Stakes';
import {Turn} from './scenes/Turn';
import {Product} from './scenes/Product';
import {Partners} from './scenes/Partners';
import {CTA} from './scenes/CTA';

const SCENE_COMPONENTS: Record<SceneId, React.FC> = {
  hook: Hook,
  problem: Problem,
  stakes: Stakes,
  turn: Turn,
  product: Product,
  partners: Partners,
  cta: CTA,
};

/**
 * Root video: scenes laid end to end from timing.ts. A scene whose transition
 * is a wipe or iris starts on time and reveals over the previous scene, which
 * is held for the overlap frames. Swap a scene here or retime it in timing.ts.
 */
export const Video: React.FC = () => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{backgroundColor: colors.base}}>
      {SCENES.map((s, i) => {
        const Comp = SCENE_COMPONENTS[s.id];
        const tr = TRANSITIONS[s.id];
        const next = SCENES[i + 1];
        const hold = next ? TRANSITIONS[next.id].overlap : 0;
        const from = cursor;
        cursor += s.frames;
        let node: React.ReactNode = <Comp />;
        if (tr.kind === 'wipe') node = <SurveyWipe frames={tr.overlap}>{node}</SurveyWipe>;
        if (tr.kind === 'iris') node = <IrisReveal frames={tr.overlap}>{node}</IrisReveal>;
        return (
          <Sequence key={s.id} name={s.id} from={from} durationInFrames={s.frames + hold} layout="none">
            {node}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
