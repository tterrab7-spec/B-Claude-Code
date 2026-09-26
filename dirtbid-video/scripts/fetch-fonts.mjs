// Downloads the exact Google Fonts files that @remotion/google-fonts resolves,
// so renders never depend on the network. Run once: node scripts/fetch-fonts.mjs
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {getInfo as archivoBlack} from '@remotion/google-fonts/ArchivoBlack';
import {getInfo as archivo} from '@remotion/google-fonts/Archivo';
import {getInfo as plexMono} from '@remotion/google-fonts/IBMPlexMono';
import {getInfo as caveat} from '@remotion/google-fonts/Caveat';
import {getInfo as patrick} from '@remotion/google-fonts/PatrickHand';
import {getInfo as fredoka} from '@remotion/google-fonts/Fredoka';
import {getInfo as nunito} from '@remotion/google-fonts/Nunito';
import {getInfo as manrope} from '@remotion/google-fonts/Manrope';

const wanted = [
  {info: archivoBlack(), weights: ['400'], file: 'ArchivoBlack'},
  {info: archivo(), weights: ['500', '600', '700'], file: 'Archivo'},
  {info: plexMono(), weights: ['500', '600'], file: 'IBMPlexMono'},
  {info: caveat(), weights: ['700'], file: 'Caveat'},
  {info: patrick(), weights: ['400'], file: 'PatrickHand'},
  {info: fredoka(), weights: ['700'], file: 'Fredoka'},
  {info: nunito(), weights: ['800'], file: 'Nunito'},
  {info: manrope(), weights: ['800', '500'], file: 'Manrope'},
];
fs.mkdirSync('public/fonts', {recursive: true});
const manifest = [];
for (const w of wanted) {
  for (const weight of w.weights) {
    const url = w.info.fonts.normal[weight].latin;
    const out = `public/fonts/${w.file}-${weight}.woff2`;
    if (!fs.existsSync(out)) execFileSync('curl', ['-sSL', '--fail', '-o', out, url]);
    manifest.push({family: w.info.fontFamily, weight, file: `fonts/${w.file}-${weight}.woff2`, source: url});
    console.log('ok', out, fs.statSync(out).size, 'bytes');
  }
}
fs.writeFileSync('public/fonts/manifest.json', JSON.stringify(manifest, null, 2));
