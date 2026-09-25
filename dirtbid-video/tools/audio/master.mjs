// Mastering pass on a rendered MP4: lifts the mix to web loudness and re-encodes
// audio at 320 kbps AAC, video stream copied. Usage: node tools/audio/master.mjs out/file.mp4 [gainDb]
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
const FF = 'node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg';
const [input, gainArg] = process.argv.slice(2);
const gain = Number(gainArg ?? 1.7);
if (!input) throw new Error('usage: node tools/audio/master.mjs out/file.mp4 [gainDb]');
const tmp = input.replace(/\.mp4$/, '.master.mp4');
execFileSync(FF, ['-y', '-loglevel', 'error', '-i', input, '-c:v', 'copy', '-af', `volume=${gain}dB`, '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', tmp]);
fs.renameSync(tmp, input);
import {spawnSync} from 'node:child_process';
const r = spawnSync(FF, ['-hide_banner', '-i', input, '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], {encoding: 'utf8'});
const out = r.stdout + r.stderr;
const m = (k) => (out.match(new RegExp(`"${k}"\\s*:\\s*"([-\\d.]+)"`)) || [])[1];
console.log(`${input}: +${gain} dB → integrated ${m('input_i')} LUFS, true peak ${m('input_tp')} dBTP`);
