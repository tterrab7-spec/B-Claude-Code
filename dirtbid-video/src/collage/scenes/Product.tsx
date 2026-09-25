import React from 'react';
import {AbsoluteFill, useCurrentFrame, interpolate} from 'remotion';
import {Paper} from '../ui/Paper';
import {Defs} from '../ui/Defs';
import {Item} from '../ui/Item';
import {HandText} from '../ui/HandText';
import {Stamp} from '../ui/Stamp';
import {Strike} from '../ui/Marker';
import {Sparkle, Burst} from '../ui/Doodles';
import {MapSheet, Receipt, Chip, Clock, AddressBar, Accuracy} from '../ui/Product';
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
  // L08 "Type in the address." → the bar types itself, then the pin drops
  const barAt = L08 - 10;
  const typeAt = L08 - 4;
  const pinAt = L08 + 36;
  // L09 word hits: "pulls the official USDA soil survey" 0.4–2.6 | "adds local and regional cost data" 2.7–4.6 |
  // "and prices the site work line by line" 4.7–7.0 | "within five percent" 7.1–8.9
  const cellsAt = [0, 1, 2, 3, 4, 5].map((i) => L09 + 18 + i * 8);
  const stampAt = L09 + 74;
  const chipAt = [L09 + 100, L09 + 200];
  const receiptAt = L09 + 142;
  const linesAt = [0, 1, 2, 3, 4].map((i) => L09 + 152 + i * 9);
  const totalAt = L09 + 212;
  const pctAt = L09 + 230;
  const clockAt = L10 + 2;
  const beforeAt = L10 + 24;
  const afterAt = L10 + 58;

  const mapP = S.at({wide: {x: S.cx - 430, y: S.cy + 10, s: 1}, vertical: {x: S.cx, y: S.cy - 420, s: 1.05}, square: {x: S.cx - 250, y: S.cy - 170, s: 0.8}});
  const recP = S.at({wide: {x: S.cx + 400, y: S.cy - 20, s: 1}, vertical: {x: S.cx, y: S.cy + 300, s: 1.25}, square: {x: S.cx + 250, y: S.cy + 120, s: 0.85}});
  const chipP = [
    S.at({wide: {x: S.cx - 430, y: S.cy + 300, r: -5}, vertical: {x: S.cx - 200, y: S.cy - 120, r: -5}, square: {x: S.cx - 250, y: S.cy + 30, r: -5}}),
    S.at({wide: {x: S.cx + 300, y: S.cy + 350, r: 4}, vertical: {x: S.cx - 200, y: S.cy + 780, r: 4}, square: {x: S.cx + 150, y: S.cy + 450, r: 4}}),
  ];
  const pctP = S.at({wide: {x: S.cx + 700, y: S.cy + 335, s: 1}, vertical: {x: S.cx + 330, y: S.cy + 720, s: 1}, square: {x: S.cx + 420, y: S.cy + 400, s: 0.85}});
  const barP = S.at({wide: {x: S.cx - 430, y: S.cy - 330, s: 1}, vertical: {x: S.cx, y: S.cy - 780, s: 1.05}, square: {x: S.cx - 250, y: S.cy - 420, s: 0.75}});
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
        {/* address bar */}
        <Item x={mapX + (barP.x - mapP.x)} y={barP.y + mapShift} scale={pop(frame, barAt, 0.9) * barP.s} rotate={-2} z={5} sticker shadow={0.9}>
          <AddressBar typeAt={typeAt} />
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
        {/* chips: local + regional data rides with the map; CSI-organized sits under the receipt */}
        {copy.product.badges.map((b, i) => (
          <Item key={b} x={i === 0 ? mapX + (chipP[0].x - mapP.x) : chipP[i].x} y={chipP[i].y + (i === 0 ? mapShift : 0)} scale={pop(frame, chipAt[i], 0.9) * chipP[i].s} rotate={chipP[i].r} z={8} sticker="thin" shadow={0.8}>
            <Chip text={b} bg={i === 0 ? C.blue : C.green} size={S.aspect === 'wide' ? 36 : 32} />
          </Item>
        ))}
        {/* ±5% badge slams onto the total */}
        <Item x={pctP.x} y={pctP.y} scale={slap(frame, pctAt).scale * pctP.s} opacity={slap(frame, pctAt).opacity} rotate={12 + wobble(frame, 63, 2)} z={9} sticker shadow={1}>
          <Accuracy size={150} />
        </Item>
        {frame >= pctAt + 4 && frame < pctAt + 30 && <Item x={pctP.x} y={pctP.y} z={9}><Burst at={pctAt + 4} r={110} n={12} color={C.green} /></Item>}

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
