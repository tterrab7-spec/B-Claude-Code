import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';
import {fontFamily as CAVEAT} from '@remotion/google-fonts/Caveat';
import {fontFamily as PATRICK} from '@remotion/google-fonts/PatrickHand';
import {fontFamily as FREDOKA} from '@remotion/google-fonts/Fredoka';
import {fontFamily as NUNITO} from '@remotion/google-fonts/Nunito';
import {fontFamily as PLEX} from '@remotion/google-fonts/IBMPlexMono';

export const fontsReady = Promise.all([
  loadFont({family: CAVEAT, url: staticFile('fonts/Caveat-700.woff2'), weight: '700'}),
  loadFont({family: PATRICK, url: staticFile('fonts/PatrickHand-400.woff2'), weight: '400'}),
  loadFont({family: FREDOKA, url: staticFile('fonts/Fredoka-700.woff2'), weight: '700'}),
  loadFont({family: NUNITO, url: staticFile('fonts/Nunito-800.woff2'), weight: '800'}),
  loadFont({family: PLEX, url: staticFile('fonts/IBMPlexMono-600.woff2'), weight: '600'}),
]);

/** Collage palette: warm paper, ink, and the DirtBid clay/amber/green. */
export const C = {
  paper: '#F3EADB',
  paperDeep: '#E7DCC8',
  paperLine: 'rgba(60, 50, 40, 0.09)',
  sky: '#CFE3F2',
  skyDeep: '#9DC3E0',
  ink: '#2B2823',
  inkSoft: '#5B554C',
  clay: '#D4622A',
  clayDeep: '#A8481B',
  amber: '#E9AE2B',
  green: '#4A7C59',
  greenSoft: '#8FBF9A',
  red: '#C8402F',
  blue: '#3B6B8F',
  blueSoft: '#8FB4CF',
  white: '#FFFDF8',
  tapePeach: 'rgba(242, 181, 138, 0.85)',
  tapeTeal: 'rgba(127, 183, 190, 0.8)',
  tapeYellow: 'rgba(242, 208, 107, 0.85)',
  tapeBlue: 'rgba(143, 180, 207, 0.8)',
  // soil map unit colors: printed-map muted
  soil: ['#9C8A63', '#B29A5E', '#7A8B6E', '#8E7F6A', '#7C8FA3', '#B8844E'],
  khaki: '#D9CDA8',
  grass: '#B9CF9A',
} as const;

export const F = {
  hand: CAVEAT, // bold handwriting, headlines
  print: PATRICK, // neat hand printing, captions and labels
  round: FREDOKA, // rounded sans, brand + CTA
  body: NUNITO,
  mono: PLEX,
} as const;
