import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, Easing} from 'remotion';
import {Topo} from '../components/Topo';
import {Parcel} from '../components/Parcel';
import {KineticText, Label} from '../components/KineticText';
import {useLayout, boxStyle} from '../layout';
import {colors, type} from '../theme';
import {content} from '../content';

/**
 * SCENE 1 — HOOK. Survey boundary draws itself around an empty black parcel.
 * Two hard-cut lines of type.
 */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const draw = interpolate(frame, [4, 78], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const CUT = 80;
  const size = type.h1 * L.textScale;

  return (
    <AbsoluteFill style={{backgroundColor: colors.base}}>
      <Topo />
      <Parcel id="hook" box={L.graphic} draw={draw} />

      {/* parcel tag */}
      <div style={{...boxStyle(L.graphic), display: 'flex', justifyContent: 'center', alignItems: 'flex-end', pointerEvents: 'none'}}>
        <Label from={60} size={18} style={{transform: `translateY(${L.aspect === 'wide' ? 60 : 44}px)`}}>
          {content.hook.parcelLabel}
        </Label>
      </div>

      <div style={{...boxStyle(L.text), display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
        <KineticText text={content.hook.line1} size={size} from={8} until={CUT} />
        <KineticText text={content.hook.line2} size={size} from={CUT} accent={['dirt', 'costs']} />
      </div>
    </AbsoluteFill>
  );
};
