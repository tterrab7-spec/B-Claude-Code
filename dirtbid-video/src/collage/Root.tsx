import React from 'react';
import {Composition} from 'remotion';
import {CollageVideo} from './Video';
import {FPS, TOTAL_FRAMES} from './timeline';

export const CollageCompositions: React.FC = () => (
  <>
    <Composition id="Collage-Wide" component={CollageVideo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="Collage-Vertical" component={CollageVideo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} />
    <Composition id="Collage-Square" component={CollageVideo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1080} />
  </>
);
