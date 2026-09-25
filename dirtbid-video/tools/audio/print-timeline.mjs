// Prints the timeline as JSON so the audio tools can read the same numbers.
import {createRequire} from 'node:module';
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync(new URL('../../public/audio/vo/manifest.json', import.meta.url)));
const timing = JSON.parse(fs.readFileSync(new URL('../../src/collage/timing-config.json', import.meta.url)));
const GAP_BEFORE = timing.gapBefore, HOLD = timing.holdAfterScene;
const cues = [], scenes = []; let t = 0, cur = null;
for (const l of manifest) {
  if (!cur || cur.id !== l.scene) { if (cur) { cur.end = t + HOLD[cur.id]; t = cur.end; } cur = {id: l.scene, start: t, end: t}; scenes.push(cur); }
  t += GAP_BEFORE[l.id] ?? 0.4; cues.push({id: l.id, start: +t.toFixed(3), end: +(t + l.seconds).toFixed(3), text: l.text}); t += l.seconds;
}
cur.end = t + HOLD[cur.id]; t = cur.end;
const out = {total: +t.toFixed(3), scenes: scenes.map(s => ({...s, start: +s.start.toFixed(3), end: +s.end.toFixed(3)})), cues};
fs.writeFileSync(new URL('./timeline.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
