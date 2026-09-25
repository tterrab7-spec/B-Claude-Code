// Generates the cast of hand-drawn characters (Open Peeps, CC0, via DiceBear) into public/peeps/.
import {createAvatar} from '@dicebear/core';
import {openPeeps} from '@dicebear/collection';
import fs from 'node:fs';

const base = {accessoriesProbability: 0, facialHairProbability: 0, maskProbability: 0, size: 512};
// Sam, the developer. Same head/skin, different expressions per scene.
const sam = {head: ['bun'], skinColor: ['d08b5b'], headContrastColor: ['2c1b18'], clothingColor: ['d4622a'], accessories: ['glasses3'], accessoriesProbability: 100};
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
for (const [name, opts] of Object.entries(cast)) {
  const svg = createAvatar(openPeeps, {...base, ...opts, seed: name}).toString();
  fs.writeFileSync(`public/peeps/${name}.svg`, svg);
  index[name] = `peeps/${name}.svg`;
}
fs.writeFileSync('public/peeps/index.json', JSON.stringify(index, null, 2));
console.log('wrote', Object.keys(cast).length, 'peeps');
