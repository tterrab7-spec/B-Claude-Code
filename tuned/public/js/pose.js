// On-device pose estimation (MediaPipe Pose Landmarker). Video never leaves the phone.
// Engine file locations. The hosted app serves them from vendor/; the single-file
// build sets window.TUNED_VENDOR to CDN URLs before this module runs.
const VENDOR = (typeof window !== 'undefined' && window.TUNED_VENDOR) || (() => {
  const V = new URL('../vendor/mediapipe/', import.meta.url).href;
  return { bundle: V + 'vision_bundle.mjs', wasmJs: V + 'vision_wasm_internal.js', wasmBin: V + 'vision_wasm_internal.wasm', model: V + 'pose_landmarker_lite.task' };
})();

let landmarker = null;
let loading = null;

export const L = { nose: 0, lEar: 7, rEar: 8, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28 };

export function initPose() {
  if (landmarker) return Promise.resolve(landmarker);
  if (loading) return loading;
  loading = (async () => {
    const { PoseLandmarker } = await import(/* @vite-ignore */ VENDOR.bundle);
    const fileset = { wasmLoaderPath: VENDOR.wasmJs, wasmBinaryPath: VENDOR.wasmBin };
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: VENDOR.model, delegate },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch (e) { landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU')); }
    return landmarker;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera.');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  video.srcObject = stream;
  video.muted = true; video.playsInline = true;
  await video.play();
  return stream;
}

export function stopStream(stream) { stream?.getTracks().forEach(t => t.stop()); }

// Runs detection on every animation frame. Returns a stop function.
export function track(video, canvas, onFrame, { mirror = true } = {}) {
  const ctx = canvas.getContext('2d');
  let raf = 0, last = -1, stopped = false;
  const loop = () => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (!video.videoWidth || video.readyState < 2) return;
    if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    const ts = performance.now();
    if (ts <= last) return;
    last = ts;
    let lm = null;
    try { lm = landmarker.detectForVideo(video, ts).landmarks?.[0] || null; } catch (e) { return; }
    draw(ctx, canvas, lm, mirror);
    onFrame(lm, ts / 1000, { w: canvas.width, h: canvas.height });
  };
  loop();
  return () => { stopped = true; cancelAnimationFrame(raf); };
}

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

function draw(ctx, c, lm, mirror) {
  ctx.clearRect(0, 0, c.width, c.height);
  if (!lm) return;
  const X = p => (mirror ? 1 - p.x : p.x) * c.width, Y = p => p.y * c.height;
  ctx.lineWidth = Math.max(3, c.width / 160);
  ctx.strokeStyle = 'rgba(255,106,19,.95)';
  ctx.lineCap = 'round';
  BONES.forEach(([a, b]) => {
    if (lm[a].visibility < 0.4 || lm[b].visibility < 0.4) return;
    ctx.beginPath(); ctx.moveTo(X(lm[a]), Y(lm[a])); ctx.lineTo(X(lm[b]), Y(lm[b])); ctx.stroke();
  });
  ctx.fillStyle = '#fff';
  [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(i => {
    if (lm[i].visibility < 0.4) return;
    ctx.beginPath(); ctx.arc(X(lm[i]), Y(lm[i]), ctx.lineWidth * 1.3, 0, 7); ctx.fill();
  });
}

// ---- Geometry helpers (aspect-corrected)
export function angle(a, b, c, aspect = 4 / 3) {
  const v1 = { x: (a.x - b.x) * aspect, y: a.y - b.y }, v2 = { x: (c.x - b.x) * aspect, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const visible = (lm, ids, min = 0.5) => !!lm && ids.every(i => (lm[i]?.visibility ?? 0) >= min);
export const clamp01 = v => Math.max(0, Math.min(1, v));

// ---- Rep-based form models, shared by Body Score and live form checks.
export function formModel(kind) {
  if (kind === 'squat') return squatModel();
  if (kind === 'hinge') return hingeModel();
  if (kind === 'overhead') return overheadModel();
  return null;
}

function squatModel() {
  let base = null, down = false, reps = 0, bottom = 0, worstValgus = 9, cues = new Set(), depthBest = 0, frames = 0;
  const repDepths = [];
  return {
    need: [L.lHip, L.rHip, L.lKn, L.rKn, L.lAn, L.rAn],
    frame(lm) {
      const hip = mid(lm[L.lHip], lm[L.rHip]), knee = mid(lm[L.lKn], lm[L.rKn]);
      if (!base) { if (++frames > 8) base = { hip: hip.y, knee: knee.y }; return; }
      if (!down) { base.hip = base.hip * 0.9 + hip.y * 0.1; base.knee = base.knee * 0.9 + knee.y * 0.1; }
      const span = Math.max(0.05, base.knee - base.hip);
      const d = (hip.y - base.hip) / span;           // 1.0 = hip at standing knee height (parallel)
      const kneeW = Math.abs(lm[L.lKn].x - lm[L.rKn].x), ankW = Math.abs(lm[L.lAn].x - lm[L.rAn].x) || 0.01;
      if (d > 0.35) {
        down = true; bottom = Math.max(bottom, d);
        const ratio = kneeW / ankW;
        worstValgus = Math.min(worstValgus, ratio);
        if (ratio < 0.75) cues.add('Knees are caving in. Push them out over your toes.');
      }
      if (down && d < 0.12) {
        down = false; reps++; repDepths.push(bottom); depthBest = Math.max(depthBest, bottom);
        if (bottom < 0.6) cues.add('Go deeper. Aim for hips level with knees if it is pain-free.');
        bottom = 0;
      }
    },
    get reps() { return reps; },
    get cue() { return [...cues].pop() || ''; },
    result() {
      const depth = clamp01(depthBest / 0.95), valgus = worstValgus === 9 ? 0.6 : clamp01((worstValgus - 0.55) / 0.4);
      const consistency = repDepths.length >= 2 ? clamp01(1 - (Math.max(...repDepths) - Math.min(...repDepths)) / 0.5) : 0.6;
      return { reps, depth, valgus, consistency, cues: [...cues] };
    },
  };
}

function hingeModel() {
  let down = false, reps = 0, cues = new Set(), maxFlex = 0, kneeAtBottom = [];
  let curFlex = 0;
  return {
    need: [L.lSh, L.lHip, L.lKn, L.lAn],
    frame(lm) {
      // Side view: use whichever side is more visible.
      const s = (lm[L.lHip].visibility >= lm[L.rHip].visibility) ? [L.lSh, L.lHip, L.lKn, L.lAn] : [L.rSh, L.rHip, L.rKn, L.rAn];
      const hipAng = angle(lm[s[0]], lm[s[1]], lm[s[2]]);   // 180 standing
      const kneeAng = angle(lm[s[1]], lm[s[2]], lm[s[3]]);
      curFlex = 180 - hipAng;
      if (curFlex > 40) { down = true; maxFlex = Math.max(maxFlex, curFlex); kneeAtBottom.push(kneeAng); if (kneeAng < 120) cues.add('That is turning into a squat. Push the hips back more, keep the shins vertical.'); }
      if (down && curFlex < 15) { down = false; reps++; }
    },
    get reps() { return reps; },
    get cue() { return [...cues].pop() || ''; },
    result() { return { reps, hipFlexion: maxFlex, cues: [...cues] }; },
  };
}

function overheadModel() {
  let up = false, reps = 0, best = 0, cues = new Set();
  return {
    need: [L.lHip, L.rHip, L.lSh, L.rSh, L.lEl, L.rEl],
    frame(lm) {
      const a = Math.min(angle(lm[L.lHip], lm[L.lSh], lm[L.lEl]), angle(lm[L.rHip], lm[L.rSh], lm[L.rEl]));
      if (a > 150) { if (!up) reps++; up = true; best = Math.max(best, a); }
      if (a < 100) up = false;
      const shrug = (lm[L.lEar].y - lm[L.lSh].y);
      if (up && Math.abs(shrug) < 0.04) cues.add('Shoulders are shrugging up to your ears. Keep them down.');
    },
    get reps() { return reps; },
    get cue() { return [...cues].pop() || ''; },
    result() { return { reps, best, cues: [...cues] }; },
  };
}
