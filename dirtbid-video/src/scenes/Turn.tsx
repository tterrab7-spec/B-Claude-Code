import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {MARK_SEGMENTS, rowColor, Wordmark} from '../components/Logo';
import {KineticText} from '../components/KineticText';
import {useLayout} from '../layout';
import {colors, type} from '../theme';
import {content} from '../content';

const T = {black: 18, fly: 22, snap: 66, word: 84, tag: 104};

/**
 * SCENE 4 — THE TURN. Hard cut to black. Beat. Twelve amber flags fly in from
 * the edges and snap into the three strata of the DirtBid mark. Wordmark,
 * then tagline.
 */
export const Turn: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();

  const markSize = L.aspect === 'wide' ? 170 : 190;
  const wordSize = L.aspect === 'wide' ? 128 : 140;
  const lockupW = markSize + markSize * 0.28 + wordSize * 0.92 * 3.55;
  const fitScale = Math.min(1, (L.safe.w - 20) / lockupW);
  const mS = markSize * fitScale;
  const wS = wordSize * fitScale;
  const gapS = mS * 0.28;
  const totalW = mS + gapS + wS * 0.92 * 3.55;
  const lockupX = L.cx - totalW / 2;
  const lockupY = L.cy - mS / 2 - (L.aspect === 'vertical' ? 60 : 40);

  // wordmark slides in from behind the mark
  const wordIn = spring({frame: frame - T.word, fps, config: {damping: 200, stiffness: 120}});
  const tagSize = type.h2 * L.textScale;

  return (
    <AbsoluteFill style={{backgroundColor: colors.baseDeep}}>
      {frame >= T.black && (
        <>
          {/* flags → mark segments */}
          {MARK_SEGMENTS.map((seg, i) => {
            const from = T.fly + (i % 4) * 2;
            const s = spring({frame: frame - from, fps, config: {damping: 26, stiffness: 90, mass: 1.1}});
            // scattered start positions around the frame edges (deterministic)
            const a = (i / MARK_SEGMENTS.length) * Math.PI * 2 + 0.6;
            const R = Math.max(L.W, L.H) * 0.62;
            const sx = L.cx + Math.cos(a) * R;
            const sy = L.cy + Math.sin(a) * R * 0.9;
            const tx = lockupX + (seg.x + seg.w / 2) * (mS / 100);
            const ty = lockupY + (seg.y + seg.h / 2) * (mS / 100);
            const x = interpolate(s, [0, 1], [sx, tx]);
            const y = interpolate(s, [0, 1], [sy, ty]);
            const snap = spring({frame: frame - T.snap, fps, config: {damping: 16, stiffness: 320, mass: 0.6}});
            const segW = seg.w * (mS / 100);
            const segH = seg.h * (mS / 100);
            const flagO = 1 - snap;
            const pop = 1 + 0.12 * Math.sin(snap * Math.PI);
            const rot = interpolate(s, [0, 1], [(i % 2 ? -1 : 1) * 40, 0]);
            return (
              <div key={i} style={{position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) rotate(${rot}deg)`}}>
                {/* flag */}
                <svg width={60} height={70} viewBox="-30 -60 60 70" style={{position: 'absolute', left: -30, top: -50, opacity: flagO}}>
                  <line x1={0} y1={0} x2={0} y2={-52} stroke={colors.sand} strokeWidth={4} />
                  <path d="M0 -52 L36 -40 L0 -28 Z" fill={colors.amber} />
                  <circle cx={0} cy={0} r={5} fill={colors.amber} />
                </svg>
                {/* segment */}
                <div
                  style={{
                    position: 'absolute',
                    left: -segW / 2,
                    top: -segH / 2,
                    width: segW,
                    height: segH,
                    borderRadius: 4,
                    background: rowColor(seg.row),
                    opacity: snap,
                    transform: `scale(${pop})`,
                  }}
                />
              </div>
            );
          })}

          {/* wordmark */}
          {frame >= T.word && (
            <div style={{position: 'absolute', left: lockupX + mS + gapS, top: lockupY + mS / 2 - wS * 0.6, height: wS * 1.2, overflow: 'hidden', paddingRight: 20, display: 'flex', alignItems: 'center'}}>
              <div style={{transform: `translateX(${interpolate(wordIn, [0, 1], [-110, 0])}%)`, opacity: wordIn}}>
                <Wordmark size={wS} />
              </div>
            </div>
          )}

          {/* tagline */}
          <div style={{position: 'absolute', left: L.safe.x, width: L.safe.w, top: lockupY + mS + (L.aspect === 'wide' ? 70 : 90), textAlign: 'center'}}>
            <KineticText text={content.turn.tagline} size={tagSize} from={T.tag} align="center" accent={['dirt']} />
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
