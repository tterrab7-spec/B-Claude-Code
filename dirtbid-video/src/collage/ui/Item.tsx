import React from 'react';

type Props = {
  x: number;
  y: number;
  scale?: number;
  rotate?: number;
  opacity?: number;
  z?: number;
  /** Transform origin as CSS value, default center */
  origin?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** Apply the die-cut sticker outline + paper shadow */
  sticker?: boolean | 'thin';
  shadow?: number;
  width?: number;
};

/** Absolutely placed collage element, centered on (x, y). */
export const Item: React.FC<Props> = ({x, y, scale = 1, rotate = 0, opacity = 1, z = 1, origin = '50% 50%', children, style, sticker, shadow = 1, width}) => {
  if (opacity <= 0 || scale <= 0) return null;
  const filters: string[] = [];
  if (sticker) filters.push(`url(#${sticker === 'thin' ? 'sticker-thin' : 'sticker'})`);
  if (shadow > 0) filters.push(`drop-shadow(${3 * shadow}px ${9 * shadow}px ${7 * shadow}px rgba(50, 35, 15, ${0.32 * Math.min(1, shadow)}))`);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: width ?? 'max-content',
        zIndex: z,
        transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`,
        transformOrigin: origin,
        opacity,
        filter: filters.join(' ') || undefined,
        willChange: 'transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
