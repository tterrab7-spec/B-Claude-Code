// Generates the cast of hand-drawn characters (Open Peeps, CC0, via DiceBear) into public/peeps/.
import {createAvatar} from '@dicebear/core';
import {openPeeps} from '@dicebear/collection';
import fs from 'node:fs';

const base = {accessoriesProbability: 0, facialHairProbability: 0, maskProbability: 0, size: 512};
// Sam, the developer. Same head/skin, different expressions per scene.
// Business attire: DiceBear's Open Peeps only offers a crew-neck top, so Sam's
// variants get a blazer + collared shirt drawn over the torso, clipped to the
// character's own body path (see addBlazer).
const sam = {head: ['mediumStraight'], skinColor: ['d08b5b'], headContrastColor: ['2c1b18'], clothingColor: ['2b3a4a'], accessories: ['glasses3'], accessoriesProbability: 100, blazer: true};
const cast = {
  'sam-smile': {...sam, face: ['smile']},
  'sam-calm': {...sam, face: ['calm']},
  'sam-concerned': {...sam, face: ['concerned']},
  'sam-fear': {...sam, face: ['fear']},
  'sam-awe': {...sam, face: ['awe']},
  'sam-big': {...sam, face: ['smileBig']},
  'sam-driven': {...sam, face: ['driven']},
  // Partner network
  'p-surveyor': {head: ['hatHip'], skinColor: ['ffdbb4'], headContrastColor: ['4a7c59'], clothingColor: ['4a7c59'], face: ['smile']},
  'p-civil': {head: ['short4'], skinColor: ['ae5d29'], headContrastColor: ['1c1b18'], clothingColor: ['3b6b8f'], face: ['smileBig'], facialHair: ['chin'], facialHairProbability: 100},
  'p-geotech': {head: ['hijab'], skinColor: ['edb98a'], headContrastColor: ['d4622a'], clothingColor: ['e0a526'], face: ['calm']},
  'p-title': {head: ['grayShort'], skinColor: ['ffdbb4'], headContrastColor: ['9a9a9a'], clothingColor: ['6b5b95'], face: ['smile'], facialHair: ['moustache1'], facialHairProbability: 100},
  'p-attorney': {head: ['mediumBangs'], skinColor: ['694d3d'], headContrastColor: ['1c1b18'], clothingColor: ['2f5d7c'], face: ['calm']},
  'p-finance': {head: ['pomp'], skinColor: ['edb98a'], headContrastColor: ['5a3a1a'], clothingColor: ['1c1b18'], face: ['smile'], accessories: ['glasses'], accessoriesProbability: 100},
  'p-insurance': {head: ['longCurly'], skinColor: ['d08b5b'], headContrastColor: ['2c1b18'], clothingColor: ['c0392b'], face: ['smileTeethGap']},
  'p-crew': {head: ['hatBeanie'], skinColor: ['ae5d29'], headContrastColor: ['e0a526'], clothingColor: ['d4622a'], face: ['smileBig'], facialHair: ['full'], facialHairProbability: 100},
  'p-screen': {head: ['twists'], skinColor: ['694d3d'], headContrastColor: ['1c1b18'], clothingColor: ['4a7c59'], face: ['cheeky']},
};
fs.mkdirSync('public/peeps', {recursive: true});
const index = {};
/**
 * Overlay a navy blazer with lapels and an off-white collared shirt. Open Peeps
 * draws the torso with a wide neck cut-out and the neck skin underneath, so the
 * overlay is clipped to torso + skin and inserted above the torso's ink outline.
 */
const addBlazer = (svg) => {
  const body = svg.match(/<path[^>]*fill="#2b3a4a"[^>]*>/);
  const skin = svg.match(/<path[^>]*fill="#d08b5b"[^>]*>/);
  if (!body || !skin) throw new Error('torso or skin path not found');
  const bodyD = body[0].match(/ d="([^"]+)"/)[1];
  const skinD = skin[0].match(/ d="([^"]+)"/)[1];
  const after = svg.indexOf('<path', svg.indexOf(body[0]) + body[0].length);
  const outlineEnd = svg.indexOf('>', after) + 1; // the torso ink outline that follows the torso
  const cx = 383;
  const lapel = '#37495B', shirt = '#F6F1E7', ink = '#2B2823';
  const overlay = `
<clipPath id="torsoclip" clip-rule="nonzero"><path d="${bodyD}"/><path d="${skinD}"/></clipPath>
<g clip-path="url(#torsoclip)">
  <polygon points="${cx - 118},584 ${cx + 118},584 ${cx},800" fill="${shirt}"/>
  <polygon points="${cx - 160},574 ${cx - 96},580 ${cx + 6},790 ${cx + 6},840" fill="${lapel}" stroke="${ink}" stroke-width="7" stroke-linejoin="round"/>
  <polygon points="${cx + 160},574 ${cx + 96},580 ${cx - 6},790 ${cx - 6},840" fill="${lapel}" stroke="${ink}" stroke-width="7" stroke-linejoin="round"/>
  <polygon points="${cx - 100},572 ${cx - 46},576 ${cx - 28},640" fill="${shirt}" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/>
  <polygon points="${cx + 100},572 ${cx + 46},576 ${cx + 28},640" fill="${shirt}" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/>
</g>`;
  return svg.slice(0, outlineEnd) + overlay + svg.slice(outlineEnd);
};

for (const [name, {blazer, ...opts}] of Object.entries(cast)) {
  let svg = createAvatar(openPeeps, {...base, ...opts, seed: name}).toString();
  if (blazer) svg = addBlazer(svg);
  fs.writeFileSync(`public/peeps/${name}.svg`, svg);
  index[name] = `peeps/${name}.svg`;
}
fs.writeFileSync('public/peeps/index.json', JSON.stringify(index, null, 2));
console.log('wrote', Object.keys(cast).length, 'peeps');
