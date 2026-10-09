// Builds dist/TUNED.html: the whole app in one file you can double-click or email.
// The camera's movement engine loads from a CDN, so the Body Score camera test needs
// internet; everything else works offline. Run: npm run build:single
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = p => path.join(here, 'public', p);
const MP = '0.10.14';
const vendor = {
  bundle: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP}/vision_bundle.mjs`,
  wasmJs: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP}/wasm/vision_wasm_internal.js`,
  wasmBin: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP}/wasm/vision_wasm_internal.wasm`,
  model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  ...(process.env.VENDOR_JSON ? JSON.parse(process.env.VENDOR_JSON) : {}),
};

const out = await build({ entryPoints: [pub('js/app.js')], bundle: true, format: 'iife', minify: true, write: false, logLevel: 'error', target: 'es2020' });
const js = out.outputFiles[0].text;
const css = fs.readFileSync(pub('css/app.css'), 'utf8');
const qr = fs.readFileSync(pub('vendor/qrcode.js'), 'utf8');
const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(pub('icon.svg')).toString('base64');
const esc = s => s.replace(/<\/script/gi, '<\\/script');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>TUNED | Performance maintenance for men</title>
<meta name="theme-color" content="#0e0f11">
<link rel="icon" href="${icon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Saira+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<div id="app"><main class="boot"><p>Loading</p></main></div>
<script>window.TUNED_VENDOR = ${JSON.stringify(vendor)};</script>
<script>${esc(qr)}</script>
<script>${esc(js)}</script>
</body>
</html>
`;
fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
const file = path.join(here, 'dist', 'TUNED.html');
fs.writeFileSync(file, html);
console.log(`${file} (${Math.round(html.length / 1024)} KB)`);
