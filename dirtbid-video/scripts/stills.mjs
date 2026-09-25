// Renders review stills for every composition at key frames.
// Usage: node scripts/stills.mjs [frame,frame,...]
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition, openBrowser} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';

const FRAMES = (process.argv[2] ? process.argv[2].split(',').map(Number) : [100, 380, 470, 570, 620, 770, 900, 1030, 1190, 1300, 1400, 1640, 1760]);
const COMPS = ['DirtBid-Vertical', 'DirtBid-Square', 'DirtBid-Wide'];
const chrome = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));

const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), onProgress: () => {}});
const browser = await openBrowser('chrome', {browserExecutable: chrome});
fs.mkdirSync('out/stills', {recursive: true});
for (const id of COMPS) {
  const composition = await selectComposition({serveUrl, id, puppeteerInstance: browser, browserExecutable: chrome});
  for (const frame of FRAMES) {
    const output = `out/stills/${id}-f${String(frame).padStart(4, '0')}.jpg`;
    await renderStill({composition, serveUrl, output, frame, imageFormat: 'jpeg', jpegQuality: 85, puppeteerInstance: browser, browserExecutable: chrome, chromiumOptions: {gl: 'swangle'}});
    console.log('wrote', output);
  }
}
await browser.close({silent: true});
