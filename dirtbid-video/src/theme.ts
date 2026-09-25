/**
 * DirtBid brand tokens. Every color and font in the video comes from here.
 *
 * Palette is the fallback set from the brief (dirtbidai.com could not be
 * fetched from the build machine). Swap the hex values below to rebrand
 * every scene at once.
 */
import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';
import {fontFamily as ARCHIVO_BLACK} from '@remotion/google-fonts/ArchivoBlack';
import {fontFamily as ARCHIVO} from '@remotion/google-fonts/Archivo';
import {fontFamily as PLEX_MONO} from '@remotion/google-fonts/IBMPlexMono';

/**
 * Fonts are the Google Fonts files that @remotion/google-fonts resolves to,
 * downloaded once by `node scripts/fetch-fonts.mjs` into public/fonts and
 * self-hosted, so a render never depends on the network. The family names
 * still come from @remotion/google-fonts so they stay in sync.
 */
const fontLoads = [
  loadFont({family: ARCHIVO_BLACK, url: staticFile('fonts/ArchivoBlack-400.woff2'), weight: '400'}),
  loadFont({family: ARCHIVO, url: staticFile('fonts/Archivo-500.woff2'), weight: '500 700'}),
  loadFont({family: PLEX_MONO, url: staticFile('fonts/IBMPlexMono-500.woff2'), weight: '500'}),
  loadFont({family: PLEX_MONO, url: staticFile('fonts/IBMPlexMono-600.woff2'), weight: '600'}),
];
export const fontsReady = Promise.all(fontLoads);

export const colors = {
  /** Deep earth / charcoal base */
  base: '#1C1B18',
  /** Even darker, used for the "blind" parcel interior and hard-cut blacks */
  baseDeep: '#0F0E0C',
  /** Slightly lifted surface for cards */
  surface: '#26241F',
  /** Clay / orange accent: primary CTA and highlights */
  clay: '#D4622A',
  clayDeep: '#A8481B',
  /** Warm sand: primary type color */
  sand: '#E8DFD2',
  sandMuted: '#B4AA9B',
  sandFaint: 'rgba(232, 223, 210, 0.16)',
  /** Signal green: resolved / good outcomes */
  green: '#4A7C59',
  greenBright: '#6BA57C',
  /** Alert amber: risk flags */
  amber: '#E0A526',
  /** Loss red for the pro forma hit */
  red: '#C4402E',
  /** USDA-style soil map unit colors (muted, print-map feel) */
  soil: ['#7C6A4E', '#9A8B5B', '#5E6E5A', '#8A7D6B', '#6B7A8C', '#A3784A', '#75665C'],
} as const;

export const fonts = {
  /** Heavy geometric sans for headlines */
  headline: ARCHIVO_BLACK,
  /** Clean sans for body copy and labels */
  body: ARCHIVO,
  /** Monospace for figures, survey bearings and CSI codes */
  mono: PLEX_MONO,
} as const;

/** Type scale in px at the 920px safe square. Scenes multiply by layout.textScale. */
export const type = {
  hero: 96,
  h1: 76,
  h2: 56,
  h3: 40,
  body: 30,
  label: 22,
  micro: 18,
} as const;
