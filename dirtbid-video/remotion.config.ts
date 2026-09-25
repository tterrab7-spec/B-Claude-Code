import {Config} from '@remotion/cli/config';
import fs from 'node:fs';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setJpegQuality(95);

// Use the machine's Chromium when one is available so Remotion never has
// to download a browser. Remove this block on a machine with normal internet.
const localChrome = [
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].find((p) => fs.existsSync(p));
if (localChrome) {
  Config.setBrowserExecutable(localChrome);
}
