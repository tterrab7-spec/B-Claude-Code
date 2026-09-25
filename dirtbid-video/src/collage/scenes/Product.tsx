import React from 'react';
import {AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';
import {Paper} from '../ui/Paper';
import {Defs} from '../ui/Defs';
import {Item} from '../ui/Item';
import {HandText} from '../ui/HandText';
import {Stamp} from '../ui/Stamp';
import {Strike} from '../ui/Marker';
import {Sparkle, Burst} from '../ui/Doodles';
import {MapSheet, Receipt, Chip, Clock} from '../ui/Product';
import {useStage} from '../stage';
import {C, F} from '../theme';
import {cue, scene, f} from '../timeline';
import {slap, pop, wobble, prog, easeIn} from '../motion';
import {copy} from '../content';

/**
 * SCENE 5 — THE PRODUCT. Map sheet + pin, soil cells pop onto the parcel with a
 * USDA stamp, a CSI receipt unrolls line by line, then the clock beat.
 */
export const Product: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useStage();
  const t0 = scene('product').start;
  const L08 = f(cue('L08').start - t0);
  const L09 = f(cue('L09').start - t0);
  const L10 = f(cue('L10').start - t0);

  const mapAt = 2;
  const pinAt = L08 + 10;
  const pinLabelAt = L08 + 16;
  const cellsAt = [0, 1, 2, 3, 4, 5].map((i) => L09 + 20 + i * 8);
  const stampAt = L09 + 74;
  const receiptAt = L09 + 88;
  const linesAt = [0, 1, 2, 3, 4].map((i) => L09 + 100 + i * 11);
  const totalAt = L09 + 168;
  const chipAt = [L09 + 172, L09 + 214];
  const clockAt = L10 + 2;
  const beforeAt = L10 + 24;
  const afterAt = L10 + 58;

  const mapP = S.at({wide: {x: S.cx - 430, y: S.cy + 10, s: 1}, vertical: {x: S.cx, y: S.cy - 420, s: 1.05}, square: {x: S.cx - 250, y: S.cy - 170, s: 0.8}});
  const recP = S.at({wide: {x: S.cx + 400, y: S.cy - 20, s: 1}, vertical: {x: S.cx, y: S.cy + 300, s: 1.25}, square: {x: S.cx + 250, y: S.cy + 120, s: 0.85}});
  const chipP = [
    S.at({wide: {x: S.cx + 250, y: S.cy + 330, r: -6}, vertical: {x: S.cx - 220, y: S.cy + 760, r: -6}, square: {x: S.cx + 120, y: S.cy + 440, r: -6}}),
    S.at({wide: {x: S.cx + 590, y: S.cy + 360, r: 5}, vertical: {x: S.cx + 220, y: S.cy + 790, r: 5}, square: {x: S.cx + 400, y: S.cy + 470, r: 5}}),
  ];
  const mapS = slap(frame, mapAt);
  const mapSlide = prog(frame, receiptAt - 14, 18);
  const mapX = S.aspect === 'wide' ? interpolate(mapSlide, [0, 1], [S.cx, mapP.x]) : mapP.x;
  // at the clock beat the map slides out and the clock takes its place
  const mapOut = prog(frame, clockAt - 4, 14, easeIn);
  const mapShift = interpolate(mapOut, [0, 1], [0, -S.H * 0.9]);
  const clockP = pop(frame, clockAt + 4, 0.8);
  const clockC = S.at({wide: {x: S.cx - 430, y: S.cy - 40, s: 1}, vertical: {x: S.cx, y: S.cy - 480, s: 1.0}, square: {x: S.cx - 250, y: S.cy - 200, s: 0.8}});
  const textSize = S.aspect === 'wide' ? 64 : 56;

  return (
    <AbsoluteFill>
      <Defs />
      <Paper>
        {/* map sheet */}
        <Item x={mapX} y={mapP.y + mapShift} scale={mapS.scale * mapP.s} opacity={mapS.opacity} rotate={-2 + wobble(frame, 60, 0.8)} sticker shadow={mapS.shadow} z={3}>
          <MapSheet size={560} cellsAt={cellsAt} pinAt={pinAt} />
        </Item>
        {/* drop a pin label */}
        <Item x={mapX + 40 * mapP.s} y={mapP.y - 330 * mapP.s + mapShift} scale={pop(frame, pinLabelAt) * mapP.s} rotate={-4} z={5} sticker shadow={0.7}>
          <div style={{background: C.white, padding: '2px 22px 0'}}><HandText size={56} mode="none" color={C.clay}>{copy.product.pin}</HandText></div>
        </Item>
        {/* USDA stamp */}
        <Item x={mapX + 150 * mapP.s} y={mapP.y + 200 * mapP.s + mapShift} scale={mapP.s} z={6}>
          <Stamp text="USDA-NRCS" sub="official soil survey" at={stampAt} color={C.green} size={30} rotate={-10} />
        </Item>

        {/* receipt */}
        <Item x={recP.x} y={recP.y} scale={recP.s} rotate={2 + wobble(frame, 61, 0.6)} z={4} sticker shadow={1} opacity={frame >= receiptAt ? 1 : 0}>
          <Receipt w={520} unrollAt={receiptAt} linesAt={linesAt} totalAt={totalAt} />
        </Item>
        {frame >= totalAt && frame < totalAt + 28 && (
          <Item x={recP.x + 150 * recP.s} y={recP.y + 210 * recP.s} z={7}><Burst at={totalAt} r={120} n={10} color={C.clay} /></Item>
        )}
        {/* chips */}
        {copy.product.badges.map((b, i) => (
          <Item key={b} x={chipP[i].x} y={chipP[i].y} scale={pop(frame, chipAt[i], 0.9) * chipP[i].s} rotate={chipP[i].r} z={8} sticker="thin" shadow={0.8}>
            <Chip text={b} bg={i === 0 ? C.green : C.blue} size={S.aspect === 'wide' ? 36 : 32} />
          </Item>
        ))}

        {/* clock beat */}
        <Item x={clockC.x} y={clockC.y} scale={clockP * clockC.s} rotate={-4 + wobble(frame, 62, 1)} z={9} sticker shadow={1}>
          <Clock size={330} sweepAt={clockAt + 10} />
        </Item>
        <Item x={clockC.x - 150 * clockC.s} y={clockC.y + 250 * clockC.s} scale={pop(frame, beforeAt) * clockC.s} rotate={-5} z={10} sticker="thin" shadow={0.7}>
          <div style={{position: 'relative', background: C.white, padding: '0 18px'}}>
            <div style={{fontFamily: F.print, fontSize: textSize, color: C.inkSoft, whiteSpace: 'nowrap'}}>{copy.product.before}</div>
            <Strike w={textSize * 3.6} at={beforeAt + 10} />
          </div>
        </Item>
        <Item x={clockC.x + 150 * clockC.s} y={clockC.y + 280 * clockC.s} scale={pop(frame, afterAt, 1) * clockC.s} rotate={4} z={11} sticker shadow={0.9}>
          <div style={{background: C.clay, padding: '4px 26px 0', border: `3px solid ${C.ink}`, borderRadius: 10}}>
            <HandText size={textSize * 1.5} mode="none" color={C.white}>{copy.product.after}</HandText>
          </div>
        </Item>
        <Item x={clockC.x + 260 * clockC.s} y={clockC.y + 170 * clockC.s} scale={pop(frame, afterAt + 6) * clockC.s} z={12}><Sparkle size={50} seed={21} /></Item>
        <Item x={clockC.x - 220 * clockC.s} y={clockC.y - 200 * clockC.s} scale={pop(frame, afterAt + 10) * clockC.s} z={12}><Sparkle size={36} seed={22} color={C.clay} /></Item>
      </Paper>
    </AbsoluteFill>
  );
};
