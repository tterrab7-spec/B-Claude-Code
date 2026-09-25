import React from 'react';

/**
 * Shared SVG filter definitions. Rendered once per scene root so HTML
 * elements can use `filter: url(#sticker)` for the die-cut white outline.
 */
export const Defs: React.FC = () => (
  <svg width={0} height={0} style={{position: 'absolute'}} aria-hidden>
    <defs>
      <filter id="sticker" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius="7" result="dil" />
        <feFlood floodColor="#FFFDF8" result="white" />
        <feComposite in="white" in2="dil" operator="in" result="outline" />
        <feMerge>
          <feMergeNode in="outline" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="sticker-thin" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="dil" />
        <feFlood floodColor="#FFFDF8" result="white" />
        <feComposite in="white" in2="dil" operator="in" result="outline" />
        <feMerge>
          <feMergeNode in="outline" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="saturate" values="0" result="g" />
        <feComponentTransfer in="g">
          <feFuncA type="table" tableValues="0 0.18" />
        </feComponentTransfer>
      </filter>
      <filter id="rough-edge" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="3" result="t" />
        <feDisplacementMap in="SourceGraphic" in2="t" scale="6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>
);
