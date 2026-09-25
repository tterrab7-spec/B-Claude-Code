# DirtBid promo video (Remotion)

A 60-second, silent-first animated promo for DirtBid, built entirely in code
with [Remotion](https://www.remotion.dev). No stock footage, no licensed
assets. Three deliverable formats render from one composition with a
per-aspect re-layout (not a letterbox).

| Composition        | Size        | Use                                   | Output                    |
| ------------------ | ----------- | ------------------------------------- | ------------------------- |
| `DirtBid-Vertical` | 1080 × 1920 | Reels, TikTok, LinkedIn vertical      | `out/dirtbid-9x16.mp4`    |
| `DirtBid-Square`   | 1080 × 1080 | Feed posts                            | `out/dirtbid-1x1.mp4`     |
| `DirtBid-Wide`     | 1920 × 1080 | YouTube, website hero, email          | `out/dirtbid-16x9.mp4`    |

All three: 30 fps, 1800 frames, 60.0 s, H.264 MP4 (CRF 18), no audio track.
End-card thumbnails: `out/endcard-thumbnail-1x1.png`, `-16x9.png`, `-9x16.png`.

## Re-render

```bash
cd dirtbid-video
npm install                 # once
node scripts/fetch-fonts.mjs   # once; downloads the Google Fonts files into public/fonts
npm run render:all          # all three MP4s into out/
npm run still:endcard       # the three end-card PNGs
npm run dev                 # Remotion Studio for live preview and scrubbing
npm run stills              # review JPGs at key frames for every format -> out/stills/
```

Single format: `npm run render:vertical`, `render:square`, `render:wide`.

A render needs Chrome. `remotion.config.ts` points at a local Chromium if one
exists at the Playwright paths; on a normal machine delete that block and
Remotion downloads its own headless shell.

## Edit the script

Every word on screen is in **`src/content.ts`**. Change a string there and
re-render; nothing in the animation code references literal copy. Partner firm
names in `content.partners.stages` are invented placeholders. Swap them for
real partners there.

## Retime a scene

Scene lengths live in **`src/timing.ts`** as frames at 30 fps:

```ts
export const SCENES = [
  {id: 'hook', frames: 150},
  {id: 'problem', frames: 330},
  ...
```

Change a number and every later scene shifts automatically. Keep the total at
1800 for a 60 s master (the compositions read `TOTAL_FRAMES`). Transitions
into each scene (`cut`, `wipe`, `iris`) and their overlap are in the same
file under `TRANSITIONS`.

Beats inside a scene are timed at the top of that scene's file
(`src/scenes/*.tsx`, look for a `T = {...}` constant or `STAGE_START`).

## Swap a scene

`src/Video.tsx` maps each scene id to a component. Replace a component there
or point an id at a new file in `src/scenes/`. Scenes are independent: each
one renders its own `<AbsoluteFill>` background and uses `useCurrentFrame()`
relative to its own start.

## Colors and fonts

**`src/theme.ts`**. The palette is the fallback set from the brief because the
build machine could not reach dirtbidai.com. Edit the hex values there to
rebrand every scene at once.

Fonts are Archivo Black (headlines), Archivo (body) and IBM Plex Mono
(figures, bearings, CSI codes). The family names come from
`@remotion/google-fonts`; the font files themselves are the exact Google
Fonts files that package resolves, downloaded once by
`scripts/fetch-fonts.mjs` into `public/fonts` and self-hosted, so renders are
deterministic and never depend on the network.

## Safe area

`src/layout.ts` defines a centered 920 px safe square in every format. All
critical type and figures sit inside it; graphics and backgrounds extend
past it. The hook returns per-aspect `graphic` and `text` boxes so scenes
lay out side by side in 16:9, stacked in 9:16, and compact in 1:1.

## Adding a music track

The audio track is intentionally empty. When you license a track:

1. Put the file in `public/` (for example `public/music.mp3`).
2. In `src/Video.tsx`, inside the root `<AbsoluteFill>`, add:

```tsx
import {Audio, staticFile} from 'remotion';
// ...
<Audio src={staticFile('music.mp3')} volume={0.8} />
```

Remotion muxes it into all three renders. Use `startFrom` / `endAt` on
`<Audio>` to trim, and `volume={(f) => ...}` for a fade under the end card.

## Layout of the code

```
src/
  index.ts          registerRoot
  Root.tsx          the three <Composition>s
  Video.tsx         scene order + transitions
  content.ts        every on-screen string
  theme.ts          colors, fonts, type scale
  timing.ts         scene durations, transitions
  layout.ts         safe square + per-aspect boxes
  components/       Topo (contours), Parcel (survey polygon), Logo, KineticText,
                    Transitions (survey-line wipe, iris), Icons
  scenes/           Hook, Problem, Stakes, Turn, Product, Partners, CTA
scripts/
  fetch-fonts.mjs   downloads the font files once
  stills.mjs        review stills for every format
```
