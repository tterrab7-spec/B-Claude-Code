import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from '../theme';
import {smoothNoise} from '../motion';

/**
 * Paper background: cream (or sky) with grain, faint grid and a soft vignette.
 * Wraps children in a slow handheld drift so the page never feels static.
 */
export const Paper: React.FC<{variant?: 'cream' | 'sky'; grid?: boolean; children?: React.ReactNode; drift?: number}> = ({
  variant = 'cream', grid = true, children, drift = 1,
}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const dx = smoothNoise(frame * 0.012, 3) * 6 * drift;
  const dy = smoothNoise(frame * 0.012, 9) * 5 * drift;
  const rot = smoothNoise(frame * 0.008, 5) * 0.25 * drift;
  const bg = variant === 'sky'
    ? `linear-gradient(180deg, ${C.skyDeep} 0%, ${C.sky} 55%, #E8EFE6 100%)`
    : `radial-gradient(ellipse at 50% 40%, #F7F0E3 0%, ${C.paper} 55%, ${C.paperDeep} 100%)`;
  return (
    <AbsoluteFill style={{background: bg, overflow: 'hidden'}}>
      {/* grain */}
      <svg width={width} height={height} style={{position: 'absolute', inset: 0, mixBlendMode: 'multiply', opacity: 0.55}}>
        <rect width={width} height={height} filter="url(#paper-grain)" />
      </svg>
      {grid && (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${C.paperLine} 1px, transparent 1px), linear-gradient(90deg, ${C.paperLine} 1px, transparent 1px)`,
            backgroundSize: '64px 64px',
            backgroundPosition: '32px 32px',
            opacity: variant === 'sky' ? 0.35 : 0.8,
          }}
        />
      )}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 60%, rgba(60,40,20,0.16) 100%)'}} />
      <AbsoluteFill style={{transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1.02)`}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
