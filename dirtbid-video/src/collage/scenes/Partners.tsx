import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Paper} from '../ui/Paper';
import {Defs} from '../ui/Defs';
import {Item} from '../ui/Item';
import {Peep} from '../ui/Peep';
import {Parcel} from '../ui/Parcel';
import {HandText} from '../ui/HandText';
import {Underline} from '../ui/Marker';
import {Sparkle, Burst} from '../ui/Doodles';
import {House, Excavator, Verified, Label, Road} from '../ui/Partners';
import {useStage} from '../stage';
import {C} from '../theme';
import {cue, scene, f} from '../timeline';
import {slap, pop, wobble, prog} from '../motion';
import {copy} from '../content';

/** Word timing inside L11 (seconds after the line starts), estimated from the read. */
const STAGE_T = [2.85, 3.35, 3.9, 4.45, 4.95, 6.4];

/**
 * SCENE 6 — THE PARTNER NETWORK. A road draws across the page; a vetted partner
 * pops up at each stop as the narrator names it; at the end of the road the
 * parcel turns into a little subdivision.
 */
export const Partners: React.FC = () => {
  const frame = useCurrentFrame();
  const S = useStage();
  const t0 = scene('partners').start;
  const L11 = f(cue('L11').start - t0);
  const titleAt = L11 + 6;
  const roadAt = L11 + 24;
  const stageAt = STAGE_T.map((t) => L11 + f(t));
  const parcelAt = L11 + f(5.9);
  const housesAt = L11 + f(6.7);

  // stop coordinates per aspect
  const stops: [number, number][] = S.aspect === 'wide'
    ? [[S.cx - 760, S.cy + 40], [S.cx - 520, S.cy + 130], [S.cx - 280, S.cy + 30], [S.cx - 40, S.cy + 130], [S.cx + 200, S.cy + 40], [S.cx + 440, S.cy + 130]]
    : S.aspect === 'vertical'
      ? [[S.cx - 330, S.cy - 420], [S.cx + 60, S.cy - 380], [S.cx + 330, S.cy - 150], [S.cx - 60, S.cy - 40], [S.cx - 330, S.cy + 180], [S.cx + 80, S.cy + 260]]
      : [[S.cx - 340, S.cy - 130], [S.cx - 40, S.cy - 180], [S.cx + 300, S.cy - 90], [S.cx + 60, S.cy + 60], [S.cx - 320, S.cy + 150], [S.cx + 30, S.cy + 260]];
  const parcelP = S.aspect === 'wide' ? {x: S.cx + 760, y: S.cy - 60, s: 0.6} : S.aspect === 'vertical' ? {x: S.cx + 260, y: S.cy + 560, s: 0.62} : {x: S.cx + 330, y: S.cy + 300, s: 0.48};
  const roadPts: [number, number][] = [[stops[0][0] - 400, stops[0][1] + 40], ...stops, S.aspect === 'wide' ? [parcelP.x - 120, parcelP.y + 90] : [parcelP.x, parcelP.y + 20]];
  const roadDraw = prog(frame, roadAt, 70, (t) => t);
  const peepSize = S.aspect === 'wide' ? 190 : S.aspect === 'vertical' ? 200 : 150;
  const titleP = S.at({wide: {x: S.cx, y: S.safe.y + 40}, vertical: {x: S.cx, y: S.safe.y - 160}, square: {x: S.cx, y: S.safe.y + 10}});
  const houses: [number, number][] = [[-70, -60], [30, -90], [90, 10], [-40, 40], [40, 90], [-90, 100]];

  return (
    <AbsoluteFill>
      <Defs />
      <Paper>
        {/* title */}
        <Item x={titleP.x} y={titleP.y} z={2}>
          <div style={{position: 'relative', whiteSpace: 'nowrap'}}>
            <HandText size={S.aspect === 'wide' ? 78 : 66} at={titleAt} mode="pop" jitter={2} align="center" accent={['vetted']}>{copy.partners.title}</HandText>
            <Underline w={(S.aspect === 'wide' ? 78 : 66) * 12.5} at={titleAt + 14} color={C.green} />
          </div>
        </Item>

        <Road pts={roadPts} draw={roadDraw} W={S.W} H={S.H} />

        {/* stops */}
        {copy.partners.stages.map((st, i) => {
          const at = stageAt[i];
          const s = slap(frame, at);
          const [x, y] = stops[i];
          const v = pop(frame, at + 9, 0.9);
          return (
            <React.Fragment key={st.key}>
              <Item x={x} y={y - 60} scale={s.scale} opacity={s.opacity} rotate={(i % 2 ? 3 : -3) + wobble(frame, 70 + i, 1)} z={5 + i} sticker shadow={s.shadow}>
                <Peep name={st.peep} size={peepSize} seed={10 + i} />
              </Item>
              <Item x={x} y={y + peepSize * 0.45} scale={pop(frame, at + 5, 0.9)} rotate={i % 2 ? -2 : 2} z={12} sticker="thin" shadow={0.7}>
                <Label text={st.label} size={S.aspect === 'wide' ? 32 : 30} />
              </Item>
              <Item x={x + peepSize * 0.42} y={y - peepSize * 0.48} scale={v} rotate={-8} z={13} sticker="thin" shadow={0.8}>
                <Verified size={S.aspect === 'wide' ? 58 : 54} />
              </Item>
              {frame >= at + 9 && frame < at + 30 && <Item x={x + peepSize * 0.42} y={y - peepSize * 0.48} z={13}><Burst at={at + 9} r={60} n={8} color={C.green} /></Item>}
            </React.Fragment>
          );
        })}

        {/* destination parcel becomes a subdivision */}
        <Item x={parcelP.x} y={parcelP.y} scale={pop(frame, parcelAt, 0.8) * parcelP.s} rotate={-3 + wobble(frame, 90, 1)} z={4} sticker shadow={1}>
          <Parcel size={520} fill={C.grass} hachureGap={7} stakes={false}>
            {houses.map(([hx, hy], i) => {
              const p = pop(frame, housesAt + i * 5, 0.9);
              return (
                <g key={i} transform={`translate(${200 + hx} ${200 + hy}) scale(${p})`}>
                  <g transform="translate(-35 -35)"><House size={70} color={[C.clay, C.blue, C.amber, C.green, C.clay, C.blue][i]} seed={160 + i * 4} /></g>
                </g>
              );
            })}
          </Parcel>
        </Item>
        <Item x={parcelP.x - 220 * parcelP.s} y={parcelP.y + 200 * parcelP.s} scale={pop(frame, housesAt - 8, 0.8) * parcelP.s * 1.1} rotate={-4} z={14} sticker shadow={0.9}>
          <Excavator size={200} />
        </Item>
        <Item x={parcelP.x + 170 * parcelP.s} y={parcelP.y - 200 * parcelP.s} scale={pop(frame, housesAt + 30)} z={15}><Sparkle size={50} seed={31} /></Item>
        <Item x={parcelP.x - 120 * parcelP.s} y={parcelP.y - 230 * parcelP.s} scale={pop(frame, housesAt + 36)} z={15}><Sparkle size={34} seed={32} color={C.green} /></Item>
      </Paper>
    </AbsoluteFill>
  );
};
