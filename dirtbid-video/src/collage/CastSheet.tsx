import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import index from '../../public/peeps/index.json';
import {F, C} from './theme';

/** Review sheet of the whole cast. Render with: npx remotion still Cast-Sheet out/stills/cast.png */
export const CastSheet: React.FC = () => (
  <AbsoluteFill style={{background: C.paper, display: 'flex', flexWrap: 'wrap', padding: 20, gap: 12, alignContent: 'flex-start'}}>
    {Object.keys(index).map((h) => (
      <div key={h} style={{width: 300, textAlign: 'center', fontFamily: F.print, fontSize: 26, color: C.ink}}>
        <Img src={staticFile(`peeps/${h}.svg`)} style={{width: 300, height: 300}} />
        {h}
      </div>
    ))}
  </AbsoluteFill>
);
