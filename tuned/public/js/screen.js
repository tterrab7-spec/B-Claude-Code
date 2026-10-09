// Body Score: a 5-minute phone-camera movement screen. Five tests, one number (300-850).
import { initPose, startCamera, stopStream, track, L, angle, mid, visible, clamp01, formModel } from './pose.js';
import { toScore } from './engine.js';
import { speak } from './voice.js';

export const TESTS = [
  { id: 'squat', title: 'Overhead Squat', view: 'Face the camera', secs: 18,
    say: 'Face the camera, feet shoulder width. Arms straight overhead. Do 3 slow, deep squats.',
    steps: ['Phone at waist height, about 7 feet away', 'Arms overhead the whole time', '3 slow squats, as deep as is comfortable'],
    manual: { q: 'Arms overhead, how deep can you squat comfortably?', opts: [['Thighs below parallel, heels down', 95], ['Thighs parallel', 75], ['Halfway', 50], ['Barely bend, or it hurts', 20]] } },
  { id: 'toe', title: 'Toe Touch', view: 'Turn sideways', secs: 12,
    say: 'Turn sideways to the camera. Keep your knees straight and reach slowly toward your toes. Hold at the bottom.',
    steps: ['Turn your side to the camera', 'Knees straight', 'Reach down slowly and hold 3 seconds'],
    manual: { q: 'Knees straight, how far can you reach?', opts: [['Palms flat on the floor', 100], ['Fingertips to the floor', 82], ['Shins or ankles', 58], ['Knees or above', 28]] } },
  { id: 'reach', title: 'Overhead Reach', view: 'Face the camera', secs: 10,
    say: 'Face the camera. Keep your arms straight and raise them overhead as high as you can, thumbs up. Hold.',
    steps: ['Face the camera', 'Arms straight, thumbs up', 'Raise them as high as you can and hold'],
    manual: { q: 'Arms straight, can you get your biceps by your ears without arching your back?', opts: [['Yes, both sides easily', 95], ['Almost, both sides', 72], ['One side is noticeably worse', 50], ['No, or it hurts', 25]] } },
  { id: 'balance', title: 'Single-Leg Balance', view: 'Face the camera', secs: 22,
    say: 'Face the camera. Lift your right foot and balance on your left leg. I will tell you when to switch.',
    steps: ['Hands on hips', '10 seconds on the left leg', 'Switch when told, 10 seconds on the right'],
    manual: { q: 'Eyes open, hands on hips, how long can you stand on one leg?', opts: [['30 seconds plus, both legs', 95], ['About 15 seconds', 70], ['Under 10 seconds', 42], ['I need to hold something', 15]] } },
  { id: 'turn', title: 'Head Turn', view: 'Face the camera', secs: 12,
    say: 'Face the camera, shoulders still. Slowly turn your head all the way left, then all the way right.',
    steps: ['Shoulders stay square', 'Turn your head fully left, hold', 'Then fully right, hold'],
    manual: { q: 'Shoulders still, can you turn your chin over each shoulder?', opts: [['Yes, both sides', 95], ['Almost', 70], ['One side is stiff', 48], ['Both sides stiff or painful', 25]] } },
];

// Per-test analyzers turn landmark streams into a 0-100 score plus metrics.
function analyzer(id) {
  if (id === 'squat') {
    const m = formModel('squat'); let armsUp = 0, n = 0;
    return { need: m.need, frame(lm) { m.frame(lm); n++; if (lm[L.lWr].y < lm[L.nose].y && lm[L.rWr].y < lm[L.nose].y) armsUp++; },
      result() { const r = m.result(); const arms = n ? armsUp / n : 0;
        return { pct: Math.round((r.depth * 0.45 + r.valgus * 0.3 + r.consistency * 0.1 + arms * 0.15) * 100), metrics: { reps: r.reps, depth: Math.round(r.depth * 100), kneeTracking: Math.round(r.valgus * 100), armsOverhead: Math.round(arms * 100) }, cues: r.cues, control: Math.round((r.valgus * 0.7 + r.consistency * 0.3) * 100) }; } };
  }
  if (id === 'toe') {
    let best = 0;
    return { need: [L.lHip, L.lAn, L.lWr], frame(lm) {
      const s = lm[L.lHip].visibility >= lm[L.rHip].visibility ? [L.lHip, L.lWr, L.lAn] : [L.rHip, L.rWr, L.rAn];
      const span = lm[s[2]].y - lm[s[0]].y; if (span < 0.1) return;
      best = Math.max(best, (lm[s[1]].y - lm[s[0]].y) / span);
    }, result() { const pct = Math.round(clamp01((best - 0.25) / 0.85) * 100); return { pct, metrics: { reach: Math.round(best * 100) + '% of hip-to-ankle' } }; } };
  }
  if (id === 'reach') {
    let l = 0, r = 0;
    return { need: [L.lHip, L.rHip, L.lSh, L.rSh, L.lEl, L.rEl], frame(lm) {
      l = Math.max(l, angle(lm[L.lHip], lm[L.lSh], lm[L.lEl])); r = Math.max(r, angle(lm[L.rHip], lm[L.rSh], lm[L.rEl]));
    }, result() { const avg = (l + r) / 2; return { pct: Math.round(clamp01((avg - 115) / 60) * 100), metrics: { left: Math.round(l) + '°', right: Math.round(r) + '°' }, asym: Math.abs(l - r) / 30 }; } };
  }
  if (id === 'balance') {
    const sides = { left: [], right: [] }; const downs = { left: 0, right: 0 }; let wasDown = false; let t0 = null;
    return { need: [L.lSh, L.rSh, L.lHip, L.rHip, L.lAn, L.rAn], frame(lm, t) {
      if (t0 === null) t0 = t;
      const el = t - t0; const side = el < 11 ? 'left' : 'right';
      if (el > 10.5 && el < 11.5 && !this._switched) { this._switched = true; speak('Switch. Balance on your right leg.'); }
      if ((el > 9.5 && el < 12.5)) return; // transition window
      const sw = Math.abs(lm[L.lSh].x - lm[L.rSh].x) || 0.1;
      sides[side].push(mid(lm[L.lHip], lm[L.rHip]).x / sw);
      const h = Math.abs(mid(lm[L.lSh], lm[L.rSh]).y - mid(lm[L.lAn], lm[L.rAn]).y) || 0.5;
      const down = Math.abs(lm[L.lAn].y - lm[L.rAn].y) < h * 0.03;
      if (down && !wasDown) downs[side]++; wasDown = down;
    }, result() {
      const sway = a => { if (a.length < 5) return 0.4; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
      const sc = s => clamp01(1 - sway(sides[s]) / 0.12 - downs[s] * 0.18);
      const lS = sc('left'), rS = sc('right');
      return { pct: Math.round((lS + rS) / 2 * 100), metrics: { left: Math.round(lS * 100), right: Math.round(rS * 100), footDowns: downs.left + downs.right }, asym: Math.abs(lS - rS) * 2 };
    } };
  }
  if (id === 'turn') {
    let l = 0, r = 0;
    return { need: [L.nose, L.lSh, L.rSh], frame(lm) {
      const sw = Math.abs(lm[L.lSh].x - lm[L.rSh].x) || 0.1;
      const off = (lm[L.nose].x - mid(lm[L.lSh], lm[L.rSh]).x) / sw;
      if (off > 0) l = Math.max(l, off); else r = Math.max(r, -off);
    }, result() { const sc = v => clamp01(v / 0.32); return { pct: Math.round((sc(l) + sc(r)) / 2 * 100), metrics: { left: Math.round(sc(l) * 100), right: Math.round(sc(r) * 100) }, asym: Math.abs(sc(l) - sc(r)) * 1.5 }; } };
  }
}

export function composite(results) {
  const g = id => results[id]?.pct;
  const avg = a => { const v = a.filter(x => typeof x === 'number'); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const mobility = avg([g('toe'), g('reach'), g('turn'), results.squat?.metrics?.depth]);
  const stability = avg([g('balance')]);
  const control = avg([results.squat?.control ?? g('squat')]);
  const asyms = ['reach', 'balance', 'turn'].map(k => results[k]?.asym).filter(x => typeof x === 'number');
  const symmetry = asyms.length ? Math.round(clamp01(1 - asyms.reduce((a, b) => a + b, 0) / asyms.length) * 100) : avg([mobility, stability]);
  const parts = { mobility, stability, control, symmetry };
  const W = { mobility: 0.3, stability: 0.25, control: 0.25, symmetry: 0.2 };
  let tot = 0, wt = 0;
  Object.entries(parts).forEach(([k, v]) => { if (v != null) { tot += v * W[k]; wt += W[k]; } });
  Object.keys(parts).forEach(k => parts[k] = parts[k] == null ? null : Math.round(parts[k]));
  return { total: wt ? toScore(tot / wt) : null, parts };
}

// Runs the guided camera screen inside `root`. Resolves with { results, method } or null if cancelled.
export function runScreen(root, { onCancel } = {}) {
  return new Promise(async (resolve) => {
    root.innerHTML = `
      <div class="screen-stage">
        <div class="cam"><video playsinline muted></video><canvas></canvas>
          <div class="cam-hud"><div class="hud-test"></div><div class="hud-big"></div><div class="hud-sub"></div><div class="hud-bar"><i></i></div></div>
        </div>
        <div class="screen-side">
          <div class="screen-progress"></div>
          <h3 class="st-title"></h3><p class="st-view eyebrow"></p><ol class="st-steps"></ol>
          <div class="row gap"><button class="btn ghost st-skip">Skip test</button><button class="btn ghost st-quit">Cancel</button></div>
        </div>
      </div>`;
    const $ = s => root.querySelector(s);
    const video = $('video'), canvas = $('canvas');
    let stream, stop;
    const results = {};
    let skip = false, quit = false;
    $('.st-skip').onclick = () => { skip = true; };
    $('.st-quit').onclick = () => { quit = true; };
    const hud = (big, sub = '', pct = null) => { $('.hud-big').textContent = big; $('.hud-sub').textContent = sub; $('.hud-bar i').style.width = pct == null ? '0' : pct + '%'; };
    const cleanup = () => { stop?.(); stopStream(stream); };

    try {
      hud('Loading', 'Starting the movement engine on your phone');
      await initPose();
      stream = await startCamera(video);
    } catch (e) {
      cleanup();
      resolve({ error: e.message || String(e) });
      return;
    }

    let current = null;
    stop = track(video, canvas, (lm, t) => current?.(lm, t));

    for (let i = 0; i < TESTS.length; i++) {
      if (quit) break;
      const T = TESTS[i];
      skip = false;
      $('.screen-progress').innerHTML = TESTS.map((x, j) => `<span class="${j < i ? 'done' : j === i ? 'on' : ''}">${j + 1}</span>`).join('');
      $('.st-title').textContent = T.title; $('.st-view').textContent = T.view;
      $('.st-steps').innerHTML = T.steps.map(s => `<li>${s}</li>`).join('');
      $('.hud-test').textContent = `Test ${i + 1} of ${TESTS.length}: ${T.title}`;
      speak(T.say);
      const A = analyzer(T.id);

      // 1) Wait for the body to be in frame, steadily.
      let okFrames = 0;
      await new Promise(res => {
        hud('Get in frame', 'Step back until your whole body shows, head to feet');
        current = (lm) => {
          if (skip || quit) { current = null; return res(); }
          okFrames = visible(lm, A.need, 0.55) ? okFrames + 1 : 0;
          hud(okFrames ? 'Hold still' : 'Get in frame', okFrames ? 'Locked on' : 'Step back until your whole body shows, head to feet', Math.min(100, okFrames / 25 * 100));
          if (okFrames >= 25) { current = null; res(); }
        };
      });
      if (skip || quit) { results[T.id] = null; continue; }

      // 2) Countdown, then capture.
      for (const n of ['3', '2', '1']) { hud(n, T.title); await wait(800); if (skip || quit) break; }
      if (skip || quit) { results[T.id] = null; continue; }
      speak('Go.');
      const start = performance.now() / 1000;
      await new Promise(res => {
        current = (lm, t) => {
          const el = t - start;
          if (skip || quit || el >= T.secs) { current = null; return res(); }
          if (lm && visible(lm, A.need, 0.4)) A.frame(lm, t);
          hud(String(Math.ceil(T.secs - el)), T.id === 'balance' ? (el < 11 ? 'Balance on your LEFT leg' : 'Balance on your RIGHT leg') : 'Keep going', el / T.secs * 100);
        };
      });
      results[T.id] = skip || quit ? null : A.result();
      if (results[T.id]) { hud('Got it', `${T.title}: ${results[T.id].pct}/100`, 100); speak('Got it.'); await wait(1100); }
    }
    cleanup();
    if (quit) { onCancel?.(); return resolve(null); }
    resolve({ results, method: 'camera' });
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));
