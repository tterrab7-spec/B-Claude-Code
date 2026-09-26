# DirtBid promo videos (Remotion)

Two cuts of an animated promo for DirtBid, both built entirely in code with
[Remotion](https://www.remotion.dev). No stock footage, no licensed assets.

| Cut | Look | Audio | Length |
| --- | --- | --- | --- |
| **Collage** (`src/collage/`) | Whimsical hand-drawn paper collage: stickers, washi tape, rough linework, hand lettering, a cast of hand-drawn characters | Narration (Kokoro TTS), original score, sound design | 60.0 s |
| **Kinetic** (`src/scenes/`, v1) | Dark topographic, kinetic type, engineered motion | Silent-first, no audio track | 60.0 s |

Each cut renders in three formats from one composition with a per-aspect
re-layout (not a letterbox): 1920×1080, 1080×1920, 1080×1080, 30 fps, H.264
(CRF 18).

## Outputs

```
out/dirtbid-collage-16x9.mp4   website hero, YouTube, email
out/dirtbid-collage-9x16.mp4   Reels, TikTok, LinkedIn vertical
out/dirtbid-collage-1x1.mp4    feed posts
out/collage-endcard-*.png      end-card thumbnails
out/dirtbid-16x9.mp4 …         the v1 kinetic cut (silent)
```

## Re-render

```bash
cd dirtbid-video
npm install                     # once
node scripts/fetch-fonts.mjs    # once: Google Fonts files into public/fonts
npm run render:collage          # all three collage MP4s
npm run still:collage           # end-card PNGs
npm run render:all              # the v1 kinetic cut
npm run dev                     # Remotion Studio: scrub every frame live
npm run stills                  # review JPGs at key frames (COMPS=Collage-Wide to pick)
```

A render needs Chrome. `remotion.config.ts` points at a local Chromium if one
exists at the Playwright paths; elsewhere delete that block and Remotion
downloads its own headless shell.

## How the collage cut is put together

Everything is driven by the narration. The flow is:

1. **Script** in `tools/vo/script.json` (13 lines, voice `af_heart`, speed 1.04).
2. **Voiceover** by `npm run vo`: runs Kokoro-82M locally through
   `kokoro-onnx` (model weights in `tools/tts/`, fetched from the
   kokoro-onnx GitHub release; `pip install kokoro-onnx soundfile`),
   trims silence, normalizes, writes `public/audio/vo/*.wav` and a
   `manifest.json` with every line's duration.
3. **Timeline** in `src/collage/timeline.ts`: scene boundaries and cue times
   are computed from the manifest plus the gaps in
   `src/collage/timing-config.json`. Change a gap or re-record a line and
   every scene, sound effect and music cue re-flows.
4. **Scenes** in `src/collage/scenes/`, one file each, reading their cue
   frames from the timeline (`cue('L05').start`), so animation beats sit on
   the words.
5. **Sound design** in `src/collage/sfx.ts` (cue sheet, times relative to
   narration cues) and `src/collage/SoundDesign.tsx` (VO, music with
   automatic ducking under speech, SFX placement). Remotion mixes it all at
   render time.
6. **Music and SFX** are synthesized offline by `npm run audio`
   (`tools/audio/`): the score is sequenced in Node from FluidR3 General MIDI
   instrument samples (nylon guitar, marimba, glockenspiel, pizzicato,
   bass, woodblock) with reverb, bus compression and a limiter, and every
   sound effect is synthesized or built from those samples. See
   `tools/audio/README.md`.

### Edit the on-screen copy

`src/collage/content.ts` holds every word that appears on screen. The spoken
script is `tools/vo/script.json`; after editing it run `npm run vo`.

### Retime

- Gaps between lines and the hold at the end of each scene:
  `src/collage/timing-config.json`.
- Beats inside a scene: the `*At` constants at the top of each scene file
  (frames after the scene start or after a cue).
- Word-level hits in the partner scene: `STAGE_T` in
  `src/collage/scenes/Partners.tsx`.

### Swap or restyle

- Palette and fonts: `src/collage/theme.ts` (Caveat for hand lettering,
  Patrick Hand for labels, Fredoka for the CTA, Manrope for the DirtBid
  wordmark).
- Brand: `src/collage/ui/Brand.tsx` draws the DirtBid mark in code (teal V,
  gold inner V, geometry in `STROKES`), the wordmark, the tagline and the
  full lockup. `Bug` is the persistent corner logo shown on every scene
  except the turn and the end card, where the full lockup takes over.
  `FlyingMark` is the turn's fly-in: the four strokes come in as paper
  strips, snap into the V, then settle into one die-cut mark. Brand colors
  are the `brand*` entries in the theme.
- Cast: `scripts/peeps.mjs` generates the characters (Open Peeps by Pablo
  Stanley, CC0, rendered through DiceBear) into `public/peeps/`. Change a
  head, face or clothing color there and run `npm run peeps`. Sam's variants
  get a blazer and collared shirt drawn over the torso (`addBlazer`). Render
  the `Cast-Sheet` composition to review the whole cast at once.
- Collage vocabulary lives in `src/collage/ui/`: `Paper` (grain, grid,
  handheld drift), `Item` (placement + die-cut sticker outline + shadow),
  `Tape`, `Rough` (rough.js shapes), `HandText`, `Marker`, `Doodles`,
  `Stamp`, `Transitions` (torn-paper wipe).
- Motion vocabulary in `src/collage/motion.ts`: `slap`, `pop`, `slide`,
  `wobble`, `bob` (8 fps stop-motion breathing), `writeOn`.

### Change the voice

Kokoro voices: `af_heart`, `af_bella`, `am_michael`, `bm_george`, and more
(`python3 -c "from kokoro_onnx import Kokoro; ..."` lists them). Set
`voice` in `tools/vo/script.json`, or per line, then `npm run vo`.

### Replace the music with a licensed track

Drop the file in `public/audio/` and point the `<Audio>` in
`src/collage/SoundDesign.tsx` at it. Ducking under narration is automatic
(`MUSIC_BASE` / `MUSIC_UNDER_VO` set the levels).

## Licenses of bundled assets

- Fonts: Google Fonts (SIL OFL), self-hosted in `public/fonts`.
- Characters: Open Peeps, CC0.
- Instrument samples: FluidR3_GM via gleitz/midi-js-soundfonts, MIT.
- Voice: Kokoro-82M, Apache-2.0.
- Everything else is drawn in code in this repository.

## Layout of the code

```
src/
  Root.tsx                 registers both cuts' compositions
  collage/                 the hand-drawn collage cut
    timeline.ts, timing-config.json, content.ts, theme.ts, motion.ts, stage.ts
    sfx.ts, SoundDesign.tsx, Video.tsx, Root.tsx
    ui/                    collage components
    scenes/                Hook, Problem, Stakes, Turn, Product, Partners, CTA
  scenes/, components/     the v1 kinetic cut
tools/
  vo/                      script + Kokoro generator
  tts/                     Kokoro model files
  audio/                   score + SFX synthesis
  samples/                 instrument samples
scripts/
  fetch-fonts.mjs, peeps.mjs, stills.mjs
```
