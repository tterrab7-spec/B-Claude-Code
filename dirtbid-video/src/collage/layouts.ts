import {Stage} from './stage';

/** Positions shared by the hook, problem and stakes scenes so the set stays put. */
export const setLayout = (S: Stage) => ({
  parcel: S.at({wide: {x: S.cx + 330, y: S.cy + 10, s: 1.15}, vertical: {x: S.cx, y: S.cy - 330, s: 1.15}, square: {x: S.cx + 200, y: S.cy - 150, s: 0.95}}),
  sam: S.at({wide: {x: S.cx - 380, y: S.cy + 60, s: 1.15}, vertical: {x: S.cx - 40, y: S.cy + 390, s: 1.2}, square: {x: S.cx - 250, y: S.cy + 180, s: 1.05}}),
  sun: S.at({wide: {x: S.W - 190, y: 150}, vertical: {x: S.W - 160, y: 190}, square: {x: S.W - 150, y: 130}}),
  cloud: S.at({wide: {x: 520, y: 150}, vertical: {x: 430, y: 150}, square: {x: 420, y: 130}}),
});
