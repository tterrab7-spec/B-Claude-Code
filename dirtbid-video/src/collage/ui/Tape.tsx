import React from 'react';
import {C} from '../theme';

/** A strip of washi tape. Place with absolute positioning inside a sticker. */
export const Tape: React.FC<{w?: number; h?: number; color?: string; rotate?: number; x?: number; y?: number; style?: React.CSSProperties}> = ({
  w = 120, h = 34, color = C.tapePeach, rotate = -6, x, y, style,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      height: h,
      transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
      background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 6px, rgba(255,255,255,0) 6px 12px), ${color}`,
      boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
      clipPath: 'polygon(1% 0, 99% 2%, 100% 100%, 0 97%)',
      zIndex: 5,
      ...style,
    }}
  />
);
