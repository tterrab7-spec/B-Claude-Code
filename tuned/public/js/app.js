import * as store from './store.js';
import { DOORS, SPRINTS, EXERCISES, RED_FLAGS, US_STATES, exName, doseText } from './data.js';
import { CONFIG } from './config.js';
import * as E from './engine.js';
import { TESTS, runScreen, composite } from './screen.js';
import { ask } from './coach.js';
import { speak, listen, canListen, parseCheckin, setMuted, isMuted } from './voice.js';
import { health, scheduleSync, api, inbox } from './api.js';
import { initPose, startCamera, stopStream, track, formModel, visible } from './pose.js';

const app = document.getElementById('app');
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => store.get();
const brand = () => S().quiet ? 'Daily' : CONFIG.brand;
// Hash routing, with an in-memory fallback for sandboxed previews (about:srcdoc)
// where the frame's URL cannot change and '#' links would navigate away.
const hashOK = location.protocol !== 'about:';
let memRoute = '#/';
export const route = () => (hashOK ? location.hash : memRoute) || '#/';
export const go = r => { if (hashOK) location.hash = r; else { memRoute = r; render(); } };
if (!hashOK) document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || e.defaultPrevented) return;
  e.preventDefault();
  const href = a.getAttribute('href');
  if (href.startsWith('#/')) go(href); else document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
});
let cleanup = null;   // per-view teardown (camera, timers)

store.subscribe(() => scheduleSync());

// ---------- Boot: referral attribution, partner co-brand, Quiet Mode lock
(function boot() {
  const q = new URLSearchParams(location.search);
  const ref = q.get('ref');
  if (ref) {
    store.save(s => { s.ref = s.ref || ref.toUpperCase(); });
    health().then(ok => ok && api.post('ref/hit', { code: ref.toUpperCase(), userId: S().id }).catch(() => {}));
  }
  if (q.get('door') && !S().profile) go('#/start/' + q.get('door'));
  // Strip the query so ?ref= is not re-sent on refresh. Sandboxed previews refuse this; that is fine.
  if (location.search) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {} }
})();


function render() {
  cleanup?.(); cleanup = null;
  speechSynthesis?.cancel?.();
  const s = S();
  document.body.classList.toggle('quiet', !!s.quiet);
  document.title = s.quiet ? 'Daily' : 'TUNED | Performance maintenance for men';
  if (s.quiet && s.quietPin && !sessionStorageGet('unlocked')) return viewLock();
  const [, seg, arg] = route().split('/');
  const r = seg || '';
  if (!s.profile && !['', 'start', 'pt', 'partners', 'plans', 'score'].includes(r)) return go('#/');
  const views = { '': s.profile ? viewHome : viewLanding, home: viewHome, start: viewStart, score: viewScore, result: viewResult,
    session: viewSession, coach: viewCoach, form: viewForm, squad: viewSquad, plans: viewPlans, settings: viewSettings,
    pt: () => import('./pt.js').then(m => m.viewPT(shell)), partners: () => import('./partners.js').then(m => m.viewPartners(shell)), program: viewProgram };
  (views[r] || viewLanding)(arg);
  window.scrollTo(0, 0);
}

function sessionStorageGet(k) { try { return sessionStorage.getItem('tuned.' + k); } catch (e) { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem('tuned.' + k, v); } catch (e) {} }

// ---------- Layout
function shell(inner, { nav = true, wide = false } = {}) {
  const s = S();
  const r = (route().split('/')[1] || '');
  const tab = (id, label, icon) => `<a href="#/${id}" class="${r === id || (id === 'home' && r === '') ? 'on' : ''}">${ICON[icon]}<span>${label}</span></a>`;
  app.innerHTML = `
    <header class="top">
      <a class="logo" href="#/">${s.quiet ? '<span class="qlogo">Daily</span>' : LOGO}</a>
      ${s.profile ? `<div class="top-right"><span class="pts" title="Tune Points">${E.points(s).toLocaleString()} pts</span><a href="#/settings" class="iconbtn" aria-label="Settings">${ICON.gear}</a></div>` : `<nav class="top-links"><a href="#/plans">Pricing</a><a href="#/partners">Partners</a><a href="#/pt">For PTs</a></nav>`}
    </header>
    ${partnerStrip()}
    <main class="${wide ? 'wide' : ''}">${inner}</main>
    ${nav && s.profile ? `<nav class="tabs">${tab('home', 'Today', 'home')}${tab('score', 'Score', 'gauge')}${tab('coach', 'Coach', 'chat')}${tab('squad', s.quiet ? 'Group' : 'Squad', 'squad')}</nav>` : ''}`;
  return app;
}

function partnerStrip() {
  const s = S();
  const p = s.ref && CONFIG.partners[s.ref];
  if (!p || s.quiet) return '';
  return `<div class="partner-strip">In partnership with <b>${h(p.name)}</b></div>`;
}

// ---------- Landing
function viewLanding() {
  const partner = S().ref && CONFIG.partners[S().ref];
  shell(`
    <section class="hero">
      <p class="eyebrow">Performance maintenance for men</p>
      <h1>Keep the machine <em>running.</em></h1>
      <p class="lede">You keep your truck serviced. Do the same for your body, so you can keep lifting, golfing, working and keeping up with your kids. Licensed physical therapy, built like a training program.</p>
      <div class="row gap wrap">
        <a class="btn primary big" href="#/start/${partner ? partner.door + '/' + partner.option : ''}">Get my free Body Score</a>
        <a class="btn ghost big" href="#how">How it works</a>
      </div>
      <p class="fine">5 minutes. Your phone camera. No appointment. Video is processed on your phone and never uploaded.</p>
      <div class="hero-gauge">${gauge(712, { label: 'Sample Body Score' })}</div>
    </section>
    <section>
      <h2 class="sec">What brought you in?</h2>
      <div class="doors">
        ${DOORS.map(d => `<a class="door ${d.launch ? 'launch' : ''}" href="#/start/${d.id}"><span class="door-label">${h(d.label)}</span><span class="door-blurb">${h(d.blurb)}</span>${ICON.arrow}</a>`).join('')}
      </div>
    </section>
    <section id="how" class="how">
      <h2 class="sec">One engine. Five ways in.</h2>
      <div class="grid3">
        ${feature('gauge', 'Body Score', 'A number for how your body moves, like a credit score. 300 to 850. Check it, then beat it.')}
        ${feature('flag', '6-week Sprints', '"Fix your back in 6 weeks." A project with a finish line, not open-ended therapy.')}
        ${feature('chat', 'AI coach between visits', 'Form checks from your camera, voice check-ins and progressions that adjust every session. Supervised by a licensed PT.')}
        ${feature('squad', 'Squads', 'Small crews, weekly challenges, a leaderboard. Competition beats reminders.')}
        ${feature('lock', 'Quiet Mode', 'A discreet track for pelvic health after prostate treatment. No branding on screen.')}
        ${feature('pt', 'Real PTs', 'Licensed physical therapists run your video visits and review everything the coach changes.')}
      </div>
    </section>
    <section class="cta-band">
      <h2>Men will check a number long before they book an appointment.</h2>
      <a class="btn primary big" href="#/start/">Get my number</a>
    </section>
    <footer class="foot">
      <p>${CONFIG.brand} is a physical therapy service. The Body Score is a movement screen, not a diagnosis. If you have a medical emergency call 911.</p>
      <p><a href="#/plans">Pricing</a> · <a href="#/partners">Partner with us</a> · <a href="#/pt">Clinician login</a></p>
    </footer>`, { nav: false });
}

const feature = (icon, t, d) => `<div class="feature">${ICON[icon]}<h3>${t}</h3><p>${d}</p></div>`;

// ---------- Intake
function viewStart(doorId) {
  const parts = route().split('/');
  const optId = parts[3];
  if (!doorId) {
    return shell(`<section class="narrow"><p class="eyebrow">Step 1 of 3</p><h1 class="h2">What brought you in?</h1>
      <div class="doors stack">${DOORS.map(d => `<a class="door ${d.launch ? 'launch' : ''}" href="#/start/${d.id}"><span class="door-label">${h(d.label)}</span><span class="door-blurb">${h(d.blurb)}</span>${ICON.arrow}</a>`).join('')}</div></section>`, { nav: false });
  }
  const door = DOORS.find(d => d.id === doorId);
  if (!door) return go('#/start/');
  if (!optId) {
    return shell(`<section class="narrow"><a href="#/start/" class="back">${ICON.back} Back</a><p class="eyebrow">Step 1 of 3</p><h1 class="h2">${h(door.label)}</h1>
      <div class="opts">${door.options.map(o => `<a class="opt" href="#/start/${door.id}/${o.id}"><b>${h(o.label)}</b><span>${h(SPRINTS[o.id].title)}</span></a>`).join('')}</div></section>`, { nav: false });
  }
  const sp = SPRINTS[optId];
  if (!sp) return go('#/start/' + doorId);
  const quiet = !!sp.quiet;
  const flags = RED_FLAGS.filter(f => !(f.skipFor || []).includes(optId));
  shell(`<section class="narrow">
    <a href="#/start/${door.id}" class="back">${ICON.back} Back</a>
    <p class="eyebrow">Step 2 of 3</p>
    <h1 class="h2">${h(quiet ? 'Private program' : sp.title)}</h1>
    <p class="muted">${h(sp.goal)}</p>
    ${quiet ? `<div class="note quietnote">${ICON.lock}<div><b>Quiet Mode turns on for this program.</b> No ${CONFIG.brand} branding on screen, a neutral name for the program and exercises, and an optional PIN. Your PT sees your data; nobody looking at your phone does.</div></div>` : ''}
    <form id="intake" class="form">
      <label>First name<input name="name" required autocomplete="given-name" maxlength="40"></label>
      <div class="row gap"><label>Age<input name="age" type="number" min="18" max="99" required inputmode="numeric"></label>
      <label>State<select name="state" required><option value="">Select</option>${US_STATES.map(x => `<option>${x}</option>`).join('')}</select></label></div>
      <label>${quiet ? 'How much does this affect your day? (0 none, 10 constant)' : 'Pain or limitation right now (0 none, 10 worst)'}
        <div class="slider"><input name="pain" type="range" min="0" max="10" value="4"><output>4</output></div></label>
      ${quiet ? `<label>Pads per day right now<input name="pads" type="number" min="0" max="20" value="0" inputmode="numeric"></label>` : ''}
      <label>What do you want to get back to?<input name="goal" maxlength="120" placeholder="${quiet ? 'Golf without worrying, a full night of sleep' : 'Pick up my son, play 18, deadlift 315'}"></label>
      <fieldset class="flags"><legend>Safety check. Any of these true right now?</legend>
        ${flags.map(f => `<label class="check"><input type="checkbox" name="flag" value="${f.id}"><span>${h(f.q)}</span></label>`).join('')}
      </fieldset>
      ${sp.needsClearance ? `<label class="check"><input type="checkbox" name="cleared" required><span>My surgeon has cleared me to start rehab and I will follow their protocol and restrictions.</span></label>` : ''}
      <label class="check"><input type="checkbox" name="consent" required><span>I understand ${quiet ? 'this program' : CONFIG.brand} provides physical therapy and the Body Score is a screen, not a diagnosis.</span></label>
      <button class="btn primary big full">Continue to my Body Score</button>
    </form></section>`, { nav: false });
  const f = document.getElementById('intake');
  const rng = f.querySelector('input[type=range]'), out = f.querySelector('output');
  rng.oninput = () => out.textContent = rng.value;
  f.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(f);
    const flagged = fd.getAll('flag');
    const urgent = flagged.some(id => RED_FLAGS.find(r => r.id === id)?.urgent);
    if (urgent) return viewStop(flagged);
    store.save(s => {
      s.profile = { name: fd.get('name').trim(), age: +fd.get('age'), state: fd.get('state'), door: doorId, sprintId: optId,
        painBaseline: +fd.get('pain'), goal: (fd.get('goal') || '').trim(), flags: flagged, needsReview: flagged.length > 0,
        outOfState: !CONFIG.ptStates.includes(fd.get('state')), joined: new Date().toISOString() };
      s.sprint = E.startSprint(optId);
      if (quiet) { s.quiet = true; s.pads = [{ date: today(), count: +fd.get('pads') || 0 }]; }
    });
    go('#/score');
  };
}

function viewStop(flags) {
  shell(`<section class="narrow stop">
    <div class="stop-icon">${ICON.alert}</div>
    <h1 class="h2">Let's get you checked first.</h1>
    <p>What you checked can be a sign of something that needs a doctor before any exercise program. That is not us brushing you off. It is the same call any good PT would make in person.</p>
    <ul class="list">${flags.map(id => `<li>${h(RED_FLAGS.find(r => r.id === id)?.q)}</li>`).join('')}</ul>
    <p><b>If symptoms are sudden or severe, call 911 or go to the ER now.</b> Otherwise, see your doctor or an urgent care this week. Once you are cleared, come back and we will pick up right here.</p>
    <div class="row gap wrap"><a class="btn primary" href="tel:911">Call 911</a><a class="btn ghost" href="#/">Back to start</a></div>
  </section>`, { nav: false });
}

// ---------- Body Score
function viewScore() {
  const s = S();
  if (!s.profile) {
    return shell(`<section class="narrow"><h1 class="h2">Body Score</h1><p>Tell us what brought you in first so the score means something.</p><a class="btn primary" href="#/start/">Start</a></section>`, { nav: false });
  }
  shell(`<section class="narrow" id="score-root">
    <p class="eyebrow">${s.scores.length ? 'Re-screen' : 'Step 3 of 3'}</p>
    <h1 class="h2">Your Body Score</h1>
    <p class="muted">Five movements, about 5 minutes. Prop your phone at waist height about 7 feet away, so your whole body is in frame. Wear something fitted. The video stays on your phone.</p>
    <ol class="tests">${TESTS.map((t, i) => `<li><span class="num">${i + 1}</span><b>${t.title}</b><span class="muted">${t.view}</span></li>`).join('')}</ol>
    <div class="row gap wrap"><button class="btn primary big" id="cam">Start camera screen</button><button class="btn ghost big" id="manual">No camera? Self-test</button></div>
    <p class="fine" id="cam-msg"></p>
  </section>`);
  const root = document.getElementById('score-root');
  initPose().catch(() => {}); // warm the model while the user reads
  document.getElementById('cam').onclick = async () => {
    root.classList.add('running');
    const res = await runScreen(root, { onCancel: () => render() });
    if (!res) return;
    if (res.error) { render(); document.getElementById('cam-msg').textContent = `Camera unavailable: ${res.error}. Use the self-test instead.`; return; }
    const got = Object.values(res.results).filter(Boolean).length;
    if (got < 2) { render(); document.getElementById('cam-msg').textContent = 'We need at least 2 completed tests for a score. Try again with your whole body in frame, or use the self-test.'; return; }
    finishScore(res.results, 'camera');
  };
  document.getElementById('manual').onclick = () => manualScreen(root);
}

function manualScreen(root) {
  let i = 0; const results = {};
  const step = () => {
    if (i >= TESTS.length) return finishScore(results, 'self');
    const t = TESTS[i];
    root.innerHTML = `<p class="eyebrow">Self-test ${i + 1} of ${TESTS.length}</p><h1 class="h2">${t.title}</h1>
      <p>${h(t.steps.join('. '))}.</p><p><b>${h(t.manual.q)}</b></p>
      <div class="opts">${t.manual.opts.map(([label, pct], k) => `<button class="opt" data-k="${k}"><b>${h(label)}</b></button>`).join('')}</div>`;
    root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      const pct = t.manual.opts[+b.dataset.k][1];
      results[t.id] = { pct, metrics: {}, asym: /one side|one leg/i.test(t.manual.opts[+b.dataset.k][0]) ? 0.6 : 0.1, control: t.id === 'squat' ? pct : undefined };
      if (t.id === 'squat') results[t.id].metrics.depth = pct;
      i++; step();
    });
  };
  step();
}

function finishScore(results, method) {
  const c = composite(results);
  if (!c.total) return render();
  store.save(s => { s.scores.push({ at: new Date().toISOString(), total: c.total, parts: c.parts, tests: results, method }); });
  go('#/result');
}

function viewResult() {
  const s = S();
  const last = s.scores[s.scores.length - 1];
  if (!last) return go('#/score');
  const prev = s.scores.length > 1 ? s.scores[s.scores.length - 2] : null;
  const first = s.scores[0];
  const band = E.scoreBand(last.total);
  const weakest = Object.entries(last.parts).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1])[0];
  const def = SPRINTS[s.profile.sprintId];
  const isFirst = s.scores.length === 1;
  shell(`<section class="narrow center">
    <p class="eyebrow">${isFirst ? 'Your baseline' : 'Re-screen'} · ${last.method === 'camera' ? 'Camera screen' : 'Self-test'}</p>
    ${gauge(last.total, { label: band.label, delta: prev ? last.total - prev.total : null })}
    ${!isFirst ? `<p class="delta-line">${last.total >= first.total ? 'Up' : 'Down'} <b>${Math.abs(last.total - first.total)}</b> since your first screen</p>` : ''}
    <div class="parts">${Object.entries(last.parts).map(([k, v]) => `<div class="part"><span>${k}</span><div class="bar"><i style="width:${v ?? 0}%"></i></div><b>${v ?? '–'}</b></div>`).join('')}</div>
    ${weakest ? `<p class="muted">Your biggest opportunity is <b>${weakest[0]}</b>. ${isFirst ? `The ${s.quiet ? 'program' : h(def.title)} is built to move it. Re-screen at the end of week 2. Most men see their first jump there.` : 'Keep going.'}</p>` : ''}
    <div class="tests-detail">${TESTS.map(t => { const r = last.tests[t.id]; return `<div class="td"><span>${t.title}</span><b>${r ? r.pct : 'skipped'}</b></div>`; }).join('')}</div>
    <div class="row gap wrap center">${isFirst ? `<a class="btn primary big" href="#/program">See my ${s.quiet ? 'program' : 'Sprint'}</a>` : `<a class="btn primary big" href="#/home">Back to today</a>`}
    <button class="btn ghost" id="share">Share my score</button></div>
  </section>`);
  document.getElementById('share').onclick = async () => {
    const text = s.quiet ? `My Daily score: ${last.total}` : `My TUNED Body Score is ${last.total}. What's yours? Free 5-minute screen:`;
    const url = location.origin + location.pathname + (s.ref ? '?ref=' + s.ref : '');
    try { if (navigator.share) await navigator.share({ text, url }); else { await navigator.clipboard.writeText(text + ' ' + url); toast('Copied to clipboard'); } } catch (e) {}
  };
}

// ---------- Program overview
function viewProgram() {
  const s = S(), sp = s.sprint, def = E.sprintDef(sp), q = s.quiet;
  if (!def) return go('#/home');
  shell(`<section class="narrow">
    <p class="eyebrow">6-week ${q ? 'program' : 'Sprint'}</p>
    <h1 class="h2">${h(q ? def.title : def.title)}</h1>
    <p class="lede-sm">${h(def.goal)}</p>
    <div class="finish"><span>Finish line</span><b>${h(def.outcome)}</b></div>
    <div class="timeline">${def.phases.map((p, i) => `<div class="phase"><span class="wk">Weeks ${i * 2 + 1}-${i * 2 + 2}</span><b>${h(p.name)}</b>
      <ul>${[...new Set([...p.A, ...p.B])].map(id => `<li>${h(exName(id, q))}</li>`).join('')}</ul></div>`).join('')}</div>
    <ul class="list checks">
      <li>4 sessions a week, about 25 minutes, at home or the gym</li>
      <li>The coach adjusts every session from your pain and effort ratings</li>
      <li>Re-screen your Body Score at week 2 and week 6</li>
      <li>Licensed PT video visits at intake, mid-point and discharge (Sprint + PT plan)</li>
    </ul>
    ${s.profile.needsReview ? `<div class="note warn">${ICON.alert}<div>You flagged something on the safety check. A PT will review your intake before week 2. Go easy and stop anything that causes sharp or spreading pain.</div></div>` : ''}
    ${s.profile.outOfState ? `<div class="note">${ICON.pt}<div>We are adding PTs licensed in ${h(s.profile.state)}. The program and coach work now; video visits will be scheduled with a PT licensed in your state.</div></div>` : ''}
    <a class="btn primary big full" href="#/session">Start session 1</a>
  </section>`);
}

// ---------- Home dashboard
async function viewHome() {
  const s = S(), sp = s.sprint, def = E.sprintDef(sp), q = s.quiet;
  if (!sp) return go('#/start/');
  const plan = E.sessionPlan(sp);
  const n = sp.sessions.length, done = n >= E.TOTAL_SESSIONS;
  const last = s.scores[s.scores.length - 1], first = s.scores[0];
  const risk = E.dropoutRisk(sp);
  const name = s.profile.name;
  shell(`
    <section class="home">
      <div class="hello"><p class="eyebrow">${greeting()}, ${h(name)}</p>
        <h1 class="h2">${done ? 'Sprint complete.' : `Week ${plan.week} of 6`}</h1>
        <p class="muted">${h(q ? def.title : def.title)} · ${h(plan.phase)}</p></div>
      <div class="home-grid">
        <a class="card score-card" href="#/score">${last ? gauge(last.total, { small: true, delta: first && last !== first ? last.total - first.total : null }) : `<div class="empty-score"><b>No score yet</b><span>Take your 5-minute screen</span></div>`}</a>
        <div class="card progress-card">
          <div class="ring" style="--p:${Math.round(n / E.TOTAL_SESSIONS * 100)}"><b>${n}</b><span>of ${E.TOTAL_SESSIONS}</span></div>
          <div><b>${E.streak(sp)} week streak</b><span class="muted">${(k => `${k} session${k === 1 ? '' : 's'} to finish this week`)(E.SESSIONS_PER_WEEK - (n % E.SESSIONS_PER_WEEK))}</span></div>
        </div>
      </div>
      <div id="inbox"></div>
      ${E.rescoreDue(s) ? `<a class="banner hot" href="#/score">${ICON.gauge}<div><b>Re-screen is due.</b> You have put in the work. Go see the number move.</div>${ICON.arrow}</a>` : ''}
      ${risk.level === 'high' ? `<a class="banner warn" href="#/session?min=1">${ICON.alert}<div><b>${h(risk.reason)}.</b> Do the 10-minute version today to keep your streak.</div>${ICON.arrow}</a>` : ''}
      ${done ? `<div class="card"><h3>You crossed the finish line.</h3><p>Take your final Body Score, then pick your next Sprint. Members roll straight into the next one.</p><div class="row gap wrap"><a class="btn primary" href="#/score">Final score</a><a class="btn ghost" href="#/settings">Choose next Sprint</a></div></div>` : `
      <div class="card session-card">
        <div class="row between"><h3>Today · Session ${n + 1}</h3><span class="tag">${plan.items.length} moves · ~25 min</span></div>
        <ul class="ex-list">${plan.items.map(i => `<li><span>${h(exName(i.id, q))}</span><span class="muted">${doseText(i.ex, i.mod)}</span>${i.ex.form ? `<span class="tag cam">${ICON.cam} form check</span>` : ''}</li>`).join('')}</ul>
        <a class="btn primary big full" href="#/session">Start session</a>
      </div>`}
      ${def.quiet ? padCard() : ''}
      <div class="card coach-card"><div class="row between"><h3>Check in with your coach</h3>${canListen() ? `<button class="btn ghost sm" id="voice-checkin">${ICON.mic} Voice</button>` : ''}</div>
        <p class="muted">Tell it how you feel today. It adjusts the session and your PT sees it.</p>
        <div class="chips">${['Pain is about a 3 today', 'Short on time', 'No band at home', 'Why am I doing this?'].map(c => `<button class="chip" data-ask="${h(c)}">${h(c)}</button>`).join('')}</div>
      </div>
      <div id="squad-mini"></div>
      ${s.plan === 'free' ? `<a class="banner" href="#/plans">${ICON.flag}<div><b>Free plan.</b> ${q ? 'Unlock the full program and PT review.' : 'Unlock every Sprint, PT review and Squads.'}</div>${ICON.arrow}</a>` : ''}
    </section>`);
  app.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => { sessionStorageSet('ask', b.dataset.ask); go('#/coach'); });
  const v = document.getElementById('voice-checkin');
  if (v) v.onclick = () => { sessionStorageSet('voice', '1'); go('#/coach'); };
  bindPads();
  // PT inbox and squad preview load async
  inbox().then(r => {
    if (!r) return;
    const fresh = (r.overrides || []).filter(o => !(S().appliedOverrides || []).includes(o.id));
    if (fresh.length || (r.reviewed && S().profile.needsReview)) {
      store.save(st => {
        fresh.forEach(o => { if (o.mod && Object.keys(o.mod).length) st.sprint.mods[o.base] = o.mod; else delete st.sprint.mods[o.base]; });
        st.appliedOverrides = [...(st.appliedOverrides || []), ...fresh.map(o => o.id)];
        if (r.reviewed) st.profile.needsReview = false;
      });
    }
    const el = document.getElementById('inbox'); if (!el) return;
    el.innerHTML = [...(r.messages || []).slice(-2).map(m => `<div class="banner pt">${ICON.pt}<div><b>${h(m.from)}:</b> ${h(m.text)}</div></div>`),
      ...(r.visits || []).filter(v => v.status === 'scheduled').map(v => `<a class="banner hot" href="${h(v.link)}" target="_blank" rel="noopener">${ICON.cam}<div><b>Video visit ${new Date(v.when).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.</b> Tap to join at the time.</div>${ICON.arrow}</a>`)].join('');
  });
  squadMini();
}

async function squadMini() {
  const el = document.getElementById('squad-mini'); if (!el) return;
  const s = S(), word = s.quiet ? 'group' : 'squad';
  if (!s.squad) { el.innerHTML = `<a class="banner" href="#/squad">${ICON.squad}<div><b>Start a ${word}.</b> ${s.quiet ? 'Men who do this together stick with it.' : 'Men who train with a crew finish their Sprint.'}</div>${ICON.arrow}</a>`; return; }
  let members = null;
  if (await health()) { try { members = (await api.get(`squads/${s.squad.code}`)).members; } catch (e) {} }
  members = members || localBoard();
  const me = members.findIndex(m => m.me || m.userId === s.id);
  if (!document.body.contains(el)) return;
  el.innerHTML = `<a class="card banner" href="#/squad">${ICON.squad}<div><b>${h(s.squad.name)}</b> · you are <b>#${me + 1}</b> of ${members.length}. ${h(weeklyChallenge().title)} this week.</div>${ICON.arrow}</a>`;
}

function padCard() {
  const s = S();
  const log = s.pads.slice(-14);
  const t = s.pads.find(p => p.date === today());
  const max = Math.max(4, ...log.map(p => p.count));
  return `<div class="card"><div class="row between"><h3>Daily log</h3><span class="muted">${log.length > 1 ? `${log[0].count} → ${log[log.length - 1].count}` : ''}</span></div>
    <div class="row gap center-v"><span>Today</span><button class="btn ghost sm" data-pad="-1">−</button><b class="padn">${t ? t.count : '–'}</b><button class="btn ghost sm" data-pad="1">+</button></div>
    <div class="spark">${log.map(p => `<i style="height:${(p.count / max) * 100}%" title="${p.date}: ${p.count}"></i>`).join('')}</div></div>`;
}

function bindPads() {
  app.querySelectorAll('[data-pad]').forEach(b => b.onclick = () => {
    store.save(s => { let t = s.pads.find(p => p.date === today()); if (!t) { t = { date: today(), count: s.pads.length ? s.pads[s.pads.length - 1].count : 0 }; s.pads.push(t); } t.count = Math.max(0, t.count + +b.dataset.pad); });
    render();
  });
}

// ---------- Session runner
function viewSession() {
  const s = S(), sp = s.sprint, q = s.quiet;
  const minimal = /min=1/.test(route());
  const plan = E.sessionPlan(sp);
  if (!plan || sp.sessions.length >= E.TOTAL_SESSIONS) return go('#/home');
  const items = minimal ? plan.items.slice(0, 2) : plan.items;
  const draft = JSON.parse(sessionStorageGet('draft') || '{}');
  const doneSet = new Set(draft.idx === plan.idx ? draft.done : []);
  shell(`<section class="narrow">
    <a href="#/home" class="back">${ICON.back} Today</a>
    <p class="eyebrow">Week ${plan.week} · ${h(plan.phase)} · Session ${plan.idx + 1}${minimal ? ' · 10-minute version' : ''}</p>
    <h1 class="h2">Today's session</h1>
    <ol class="session">${items.map((i, k) => `
      <li class="ex ${doneSet.has(i.base) ? 'done' : ''}" data-base="${i.base}">
        <div class="ex-head"><span class="num">${k + 1}</span><div><b>${h(exName(i.id, q))}</b><span class="dose">${doseText(i.ex, i.mod)}</span></div>
          <button class="tick" aria-label="Mark done">${ICON.check}</button></div>
        <ul class="cues">${i.ex.cues.map(c => `<li>${h(c)}</li>`).join('')}</ul>
        <div class="row gap wrap">
          ${i.ex.secs ? `<button class="btn ghost sm timer" data-secs="${i.ex.secs + (i.mod.secs || 0)}" data-sets="${(i.ex.sets || 1) + (i.mod.sets || 0)}">${ICON.clock} Timer</button>` : ''}
          ${i.ex.form ? `<a class="btn ghost sm" href="#/form/${i.id}">${ICON.cam} Form check</a>` : ''}
          ${i.mod.swap ? `<span class="tag">${i.mod.swap === i.ex.reg ? 'Eased' : 'Leveled up'} by coach</span>` : ''}
        </div>
      </li>`).join('')}
    </ol>
    ${minimal ? '' : `<p class="fine">Pain up to 5/10 during exercise is acceptable if it settles by the next morning. Sharp, spreading or numb: stop that move.</p>`}
    <form id="finish" class="card form">
      <h3>Finish and rate it</h3>
      <label>Pain during the session<div class="slider"><input name="pain" type="range" min="0" max="10" value="${sp.sessions.length ? sp.sessions[sp.sessions.length - 1].pain : s.profile.painBaseline}"><output></output></div></label>
      <div class="seg" role="radiogroup">${[['easy', 'Too easy'], ['right', 'Just right'], ['hard', 'Too hard']].map(([v, l], k) => `<label><input type="radio" name="effort" value="${v}" ${k === 1 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <label>Notes for your PT (optional)<input name="note" maxlength="200"></label>
      <button class="btn primary big full">Log session</button>
    </form></section>`);
  const persist = () => sessionStorageSet('draft', JSON.stringify({ idx: plan.idx, done: [...doneSet] }));
  app.querySelectorAll('.ex').forEach(li => li.querySelector('.tick').onclick = () => {
    const b = li.dataset.base; doneSet.has(b) ? doneSet.delete(b) : doneSet.add(b); li.classList.toggle('done'); persist();
  });
  let tmr = null;
  app.querySelectorAll('.timer').forEach(b => b.onclick = () => {
    clearInterval(tmr);
    let set = 1, left = +b.dataset.secs, rest = false; const sets = +b.dataset.sets;
    const tick = () => {
      b.innerHTML = `${ICON.clock} ${rest ? 'Rest' : `Set ${set}/${sets}`} · ${left}s`;
      if (left-- > 0) return;
      if (!rest && set >= sets) { clearInterval(tmr); b.innerHTML = `${ICON.check} Done`; speak('Done. Nice work.'); return; }
      if (rest) { rest = false; set++; left = +b.dataset.secs; speak(`Set ${set}. Go.`); } else { rest = true; left = 30; speak('Rest.'); }
    };
    speak('Go.'); tick(); tmr = setInterval(tick, 1000);
  });
  cleanup = () => clearInterval(tmr);
  const f = document.getElementById('finish');
  const rng = f.querySelector('input[type=range]'), out = f.querySelector('output');
  out.textContent = rng.value; rng.oninput = () => out.textContent = rng.value;
  f.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(f);
    const log = { at: new Date().toISOString(), idx: plan.idx, pain: +fd.get('pain'), effort: fd.get('effort'), note: fd.get('note') || '', done: [...doneSet], minimal };
    let result;
    store.save(st => { st.sprint.sessions.push(log); result = E.progress(st.sprint, log, st.profile.painBaseline); });
    try { sessionStorage.removeItem('tuned.draft'); } catch (er) {}
    sessionSummary(log, result);
  };
}

function sessionSummary(log, { changes, flare }) {
  const s = S(), q = s.quiet, n = s.sprint.sessions.length;
  const verb = { regress: 'Eased', progress: 'Leveled up', add: 'Added volume to', reduce: 'Reduced volume on' };
  speak(flare ? 'Logged. We will ease off next time.' : 'Session logged. Good work.');
  shell(`<section class="narrow center">
    <div class="big-check">${ICON.check}</div>
    <h1 class="h2">Session ${n} logged.</h1>
    <p class="muted">+100 Tune Points · ${E.TOTAL_SESSIONS - n} sessions to the finish line</p>
    ${changes.length ? `<div class="card left"><h3>${flare ? 'Pain was up, so the coach eased your next sessions' : 'Two easy sessions in a row. The coach leveled you up'}</h3>
      <ul class="list">${changes.slice(0, 6).map(c => `<li>${verb[c.type]} <b>${h(exName(c.from, q))}</b>${c.to !== c.from ? ` → ${h(exName(c.to, q))}` : ''}</li>`).join('')}</ul>
      <p class="fine">Your PT reviews every change.</p></div>` : ''}
    ${E.rescoreDue(s) ? `<a class="btn primary big" href="#/score">Re-screen my Body Score</a>` : `<a class="btn primary big" href="#/home">Done</a>`}
  </section>`);
}

// ---------- Live form check (camera or uploaded video)
function viewForm(exId) {
  const ex = EXERCISES[exId];
  if (!ex?.form) return go('#/session');
  const q = S().quiet;
  shell(`<section class="narrow">
    <a href="#/session" class="back">${ICON.back} Session</a>
    <p class="eyebrow">Form check</p><h1 class="h2">${h(exName(exId, q))}</h1>
    <p class="muted">${ex.form === 'hinge' ? 'Turn sideways to the camera.' : 'Face the camera.'} Whole body in frame. The coach counts reps and calls out form.</p>
    <div class="cam form-cam"><video playsinline muted></video><canvas></canvas>
      <div class="cam-hud"><div class="hud-big" id="reps">0</div><div class="hud-sub" id="cue">Loading the movement engine</div></div></div>
    <div class="row gap wrap"><button class="btn primary" id="live">Use camera</button>
      <label class="btn ghost">Upload a video<input type="file" accept="video/*" id="upload" hidden></label>
      <button class="btn ghost" id="stop" hidden>Stop and save</button></div>
    <div id="form-result"></div></section>`);
  const video = app.querySelector('video'), canvas = app.querySelector('canvas');
  const repsEl = document.getElementById('reps'), cueEl = document.getElementById('cue');
  let stream, stopT, model, lastCue = '', lastReps = 0, fileURL;
  const finish = () => {
    stopT?.(); stopStream(stream); stream = null;
    if (fileURL) { video.pause(); URL.revokeObjectURL(fileURL); fileURL = null; }
    if (!model) return;
    const r = model.result();
    document.getElementById('form-result').innerHTML = `<div class="card"><h3>${r.reps} reps counted</h3>${r.cues.length ? `<ul class="list">${r.cues.map(c => `<li>${h(c)}</li>`).join('')}</ul>` : '<p>Clean reps. No form faults detected.</p>'}<a class="btn primary" href="#/session">Back to session</a></div>`;
    store.save(s => { (s.formChecks = s.formChecks || []).push({ at: new Date().toISOString(), ex: exId, reps: r.reps, cues: r.cues }); });
    model = null;
  };
  const begin = (mirror) => {
    model = formModel(ex.form); lastReps = 0; lastCue = '';
    video.classList.toggle('mirror', mirror);
    stopT = track(video, canvas, (lm) => {
      if (!lm || !visible(lm, model.need, 0.45)) { cueEl.textContent = 'Step back until your whole body is in frame'; return; }
      model.frame(lm);
      repsEl.textContent = model.reps;
      if (model.reps !== lastReps) { lastReps = model.reps; speak(String(model.reps)); }
      const c = model.cue; cueEl.textContent = c || 'Looking good';
      if (c && c !== lastCue) { lastCue = c; speak(c); }
    }, { mirror });
    document.getElementById('stop').hidden = false;
  };
  initPose().then(() => cueEl.textContent = 'Ready').catch(e => cueEl.textContent = 'Could not load the movement engine: ' + e.message);
  document.getElementById('live').onclick = async () => {
    try { await initPose(); finish(); stream = await startCamera(video); begin(true); }
    catch (e) { cueEl.textContent = 'Camera unavailable: ' + e.message + '. Try uploading a video.'; }
  };
  document.getElementById('upload').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    await initPose(); finish();
    fileURL = URL.createObjectURL(file);
    video.srcObject = null; video.src = fileURL; video.muted = true;
    video.onended = finish;
    await video.play(); begin(false);
  };
  document.getElementById('stop').onclick = finish;
  cleanup = () => { stopT?.(); stopStream(stream); };
}

// ---------- Coach chat
function viewCoach() {
  const s = S();
  if (!s.coach.length) store.save(st => st.coach.push({ role: 'coach', text: `I'm your ${st.quiet ? '' : 'TUNED '}coach. I see your logs, scores and plan, and your licensed PT sees everything I change. Tell me how you feel today, give me a pain number, or ask me anything about your program.`, at: new Date().toISOString() }));
  shell(`<section class="chat">
    <div class="msgs" id="msgs"></div>
    <div class="chips" id="chips">${['Pain is a 6 today', "What's today's session?", 'I have 10 minutes', 'Swap an exercise', 'Talk to my PT'].map(c => `<button class="chip" data-ask="${h(c)}">${h(c)}</button>`).join('')}</div>
    <form class="composer" id="composer">
      ${canListen() ? `<button type="button" class="iconbtn mic" id="mic" aria-label="Voice check-in">${ICON.mic}</button>` : ''}
      <input id="msg" placeholder="How's the body today?" autocomplete="off" maxlength="600">
      <button class="btn primary">Send</button>
    </form></section>`);
  const msgs = document.getElementById('msgs');
  const draw = () => {
    msgs.innerHTML = S().coach.map((m, i) => `<div class="msg ${m.role}"><div class="bubble">${h(m.text).replace(/\n/g, '<br>')}</div>
      ${m.actions?.length && i === S().coach.length - 1 ? `<div class="acts">${m.actions.map((a, k) => a.href ? `<a class="btn primary sm" href="${h(a.href)}">${h(a.label)}</a>` : `<button class="btn primary sm" data-act="${k}">${h(a.label)}</button>`).join('')}</div>` : ''}</div>`).join('');
    msgs.scrollTop = msgs.scrollHeight;
    msgs.querySelectorAll('[data-act]').forEach(b => b.onclick = () => doAction(S().coach[S().coach.length - 1].actions[+b.dataset.act]));
  };
  const send = async (text, spoken) => {
    if (!text.trim()) return;
    store.save(st => st.coach.push({ role: 'me', text, at: new Date().toISOString() }));
    const ci = parseCheckin(text);
    if (ci.pain != null) store.save(st => { (st.checkins = st.checkins || []).push({ at: new Date().toISOString(), pain: ci.pain, sleep: ci.sleep, text }); });
    draw();
    msgs.insertAdjacentHTML('beforeend', '<div class="msg coach typing"><div class="bubble"><i></i><i></i><i></i></div></div>');
    msgs.scrollTop = msgs.scrollHeight;
    const r = await ask(text);
    store.save(st => { st.coach.push({ role: 'coach', text: r.text, actions: r.actions || [], at: new Date().toISOString(), source: r.source }); if (r.flag) st.profile.urgentFlag = new Date().toISOString(); });
    draw();
    if (spoken) speak(r.text);
  };
  draw();
  const input = document.getElementById('msg');
  document.getElementById('composer').onsubmit = e => { e.preventDefault(); const t = input.value; input.value = ''; send(t); };
  app.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => send(b.dataset.ask));
  const mic = document.getElementById('mic');
  const voice = async () => {
    mic.classList.add('live'); input.placeholder = 'Listening...';
    try { const t = await listen({ onInterim: x => input.value = x }); input.value = ''; if (t) send(t, true); }
    catch (e) { toast(e.message); }
    mic.classList.remove('live'); input.placeholder = "How's the body today?";
  };
  if (mic) mic.onclick = voice;
  const pre = sessionStorageGet('ask'); if (pre) { try { sessionStorage.removeItem('tuned.ask'); } catch (e) {} send(pre); }
  if (sessionStorageGet('voice') && mic) { try { sessionStorage.removeItem('tuned.voice'); } catch (e) {} speak('How is your body today? Give me a pain number.'); setTimeout(voice, 2600); }
}

function doAction(a) {
  if (!a) return;
  if (a.do === 'session') return go('#/session');
  if (a.do === 'score') return go('#/score');
  if (a.do === 'visit') return requestVisit();
  if (a.do === 'regress') {
    store.save(s => {
      const plan = E.sessionPlan(s.sprint);
      const now = new Date().toISOString();
      s.sprint.changes.push(...E.ease(s.sprint, plan).map(c => ({ ...c, at: now, session: plan.idx, flare: true, status: 'auto', via: 'coach' })));
      s.coach.push({ role: 'coach', text: 'Done. Today\'s session is dialed back: easier versions where they exist, less volume everywhere else. Your PT can see the change.', at: new Date().toISOString() });
    });
    return render();
  }
}

async function requestVisit() {
  const ok = await health();
  store.save(s => { s.visits.push({ id: 'v' + Date.now(), requested: new Date().toISOString(), status: 'requested' }); s.coach.push({ role: 'coach', text: ok ? 'Visit requested. Your PT will pick a time and it will show up on your Today screen with a join link.' : 'Visit requested. It will reach your PT as soon as you are connected.', at: new Date().toISOString() }); });
  render();
}

// ---------- Squads
async function viewSquad() {
  const s = S(), q = s.quiet;
  const word = q ? 'group' : 'squad';
  const online = await health();
  if (!s.squad) {
    shell(`<section class="narrow">
      <p class="eyebrow">${q ? 'Groups' : 'Squads'}</p><h1 class="h2">${q ? 'Private groups' : 'Competition beats reminders.'}</h1>
      <p class="muted">${q ? 'An anonymous group of men on the same program. First names are hidden.' : 'Get 3 to 8 of your boys in a squad. Weekly challenges, a leaderboard, and nobody wants to be last.'}</p>
      <form id="create" class="card form"><h3>Start a ${word}</h3><label>${q ? 'Group' : 'Squad'} name<input name="name" required maxlength="30" placeholder="${q ? 'Tuesday group' : 'Saturday Golf Crew'}"></label><button class="btn primary full">Create ${word}</button></form>
      <form id="join" class="card form"><h3>Join with a code</h3><label>Invite code<input name="code" required maxlength="8" placeholder="ABC123" style="text-transform:uppercase"></label><button class="btn ghost full">Join</button></form>
      ${online ? '' : `<p class="fine">Offline mode: ${word}s run on this device until the TUNED server is connected.</p>`}
    </section>`);
    document.getElementById('create').onsubmit = async e => {
      e.preventDefault(); const name = new FormData(e.target).get('name');
      let code = Math.random().toString(36).slice(2, 8).toUpperCase();
      if (online) { try { code = (await api.post('squads', { name, userId: s.id, display: displayName() })).code; } catch (er) { return toast(er.message); } }
      store.save(st => st.squad = { code, name }); render();
    };
    document.getElementById('join').onsubmit = async e => {
      e.preventDefault(); const code = new FormData(e.target).get('code').trim().toUpperCase();
      if (!online) return toast('Joining a squad by code needs the TUNED server.');
      try { const r = await api.post(`squads/${code}/join`, { userId: s.id, display: displayName() }); store.save(st => st.squad = { code, name: r.name }); render(); }
      catch (er) { toast(er.message); }
    };
    return;
  }
  let board = null;
  if (online) { try { await api.post('sync', { user: S() }); board = await api.get(`squads/${s.squad.code}`); } catch (e) {} }
  const members = board ? board.members : localBoard();
  const ch = board?.challenge || weeklyChallenge();
  const meIdx = members.findIndex(m => m.me || m.userId === s.id);
  const inviteURL = location.origin + location.pathname + '?squad=' + s.squad.code + (s.ref ? '&ref=' + s.ref : '');
  shell(`<section class="narrow">
    <p class="eyebrow">${q ? 'Group' : 'Squad'} · code <b class="mono">${h(s.squad.code)}</b></p>
    <h1 class="h2">${h(s.squad.name)}</h1>
    <div class="card challenge"><span class="tag">This week</span><h3>${h(ch.title)}</h3><p class="muted">${h(ch.desc)}</p></div>
    <div class="card"><h3>Leaderboard</h3><ol class="board">${members.map((m, i) => `<li class="${i === meIdx ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="who">${h(q ? (i === meIdx ? 'You' : 'Member ' + (i + 1)) : m.display)}${m.demo ? ' <span class="tag">demo</span>' : ''}</span><span class="stat">${m.weekSessions ?? 0}/4 this wk</span><b>${(m.points || 0).toLocaleString()}</b></li>`).join('')}</ol></div>
    <div class="row gap wrap"><button class="btn primary" id="invite">Invite to ${word}</button><button class="btn ghost" id="leave">Leave</button></div>
    ${online ? '' : `<p class="fine">Offline mode. Members marked demo are placeholders until the server is connected and your crew joins with your code.</p>`}
  </section>`);
  document.getElementById('invite').onclick = async () => {
    const text = `Join my ${q ? 'group' : 'TUNED squad'} "${s.squad.name}". Code ${s.squad.code}.`;
    try { if (navigator.share) await navigator.share({ text, url: inviteURL }); else { await navigator.clipboard.writeText(text + ' ' + inviteURL); toast('Invite copied'); } } catch (e) {}
  };
  document.getElementById('leave').onclick = () => { if (confirm('Leave this ' + word + '?')) { store.save(st => st.squad = null); render(); } };
}

function displayName() { const p = S().profile; return p ? `${p.name} ${p.state ? '· ' + p.state : ''}`.trim() : 'Member'; }

function weekSessions(sp) { if (!sp) return 0; const wk = Date.now() - 7 * 86400000; return sp.sessions.filter(x => new Date(x.at).getTime() > wk).length; }

function localBoard() {
  const s = S();
  const seed = [...s.squad.code].reduce((a, c) => a + c.charCodeAt(0), 0);
  const names = ['Marcus', 'Dave', 'Tony', 'Jerome', 'Mike', 'Chris'];
  const rivals = names.slice(0, 4).map((n, i) => ({ display: n, demo: true, points: 300 + ((seed * (i + 3)) % 1400), weekSessions: (seed + i) % 5 }));
  return [{ display: displayName(), me: true, points: E.points(s), weekSessions: weekSessions(s.sprint) }, ...rivals].sort((a, b) => b.points - a.points);
}

export function weeklyChallenge() {
  const list = [
    { title: '4 for 4', desc: 'Log all 4 sessions this week. Everyone who finishes gets +300 points.' },
    { title: 'Biggest score jump', desc: 'Largest Body Score gain this week takes the crown.' },
    { title: 'Carry week', desc: 'Every carry in your sessions counts double. Grip it and walk.' },
    { title: 'No zero days', desc: 'Something every day, even a 10-minute minimum.' },
  ];
  return list[Math.floor(Date.now() / 604800000) % list.length];
}

// ---------- Plans
function viewPlans() {
  const s = S();
  shell(`<section>
    <p class="eyebrow center">Pricing</p><h1 class="h2 center">Pay for results, not waiting rooms.</h1>
    <p class="muted center">Most in-person PT runs $100 to $200 a visit. Membership is HSA / FSA eligible.</p>
    <div class="plans">${CONFIG.plans.map(p => `<div class="plan ${p.featured ? 'featured' : ''}">
      ${p.featured ? '<span class="tag">Most popular</span>' : ''}<h3>${p.name}</h3><div class="price">${p.price ? '$' + p.price : 'Free'}<span>${p.per}</span></div><p class="muted">${p.blurb}</p>
      <ul class="list checks">${p.features.map(f => `<li>${f}</li>`).join('')}</ul>
      <button class="btn ${p.featured ? 'primary' : 'ghost'} full" data-plan="${p.id}">${s.plan === p.id ? 'Current plan' : p.price ? 'Choose' : 'Start free'}</button></div>`).join('')}</div>
    <div class="card kit"><div><h3>${CONFIG.kit.name} · $${CONFIG.kit.price}</h3><p class="muted">${CONFIG.kit.items.join(' · ')}</p></div><button class="btn ghost" data-kit>Add the kit</button></div>
    <p class="fine center">Employer, union or trade association? <a href="mailto:${CONFIG.supportEmail}?subject=Group%20contract">Ask about group contracts.</a> Insurance billing through Remote Therapeutic Monitoring is available where your plan covers it.</p>
  </section>`, { nav: !!s.profile });
  app.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => {
    const p = CONFIG.plans.find(x => x.id === b.dataset.plan);
    if (!p.price) return go(s.profile ? '#/home' : '#/start/');
    if (p.checkout) { location.href = p.checkout + (p.checkout.includes('?') ? '&' : '?') + 'client_reference_id=' + s.id; return; }
    if (!s.profile) return go('#/start/');
    store.save(st => st.plan = p.id); toast(`${p.name} activated (payments not yet connected, see README)`); render();
  });
  const kit = app.querySelector('[data-kit]');
  kit.onclick = () => { if (CONFIG.kit.checkout) location.href = CONFIG.kit.checkout; else toast('Kit checkout link not configured yet'); };
}

// ---------- Settings
function viewSettings() {
  const s = S();
  shell(`<section class="narrow">
    <h1 class="h2">Settings</h1>
    <div class="card form">
      <label class="check toggle"><input type="checkbox" id="quiet" ${s.quiet ? 'checked' : ''}><span><b>Quiet Mode</b><br><span class="muted">No branding, neutral names, discreet screen title.</span></span></label>
      <label>Quiet Mode PIN (4 digits, optional)<input id="pin" inputmode="numeric" maxlength="4" pattern="\\d{4}" value="${h(s.quietPin)}" placeholder="None"></label>
      <label class="check toggle"><input type="checkbox" id="mute" ${isMuted() ? 'checked' : ''}><span><b>Mute voice coach</b></span></label>
    </div>
    <div class="card form"><h3>Switch program</h3><p class="muted">Starting a new Sprint resets your session count. Scores are kept.</p>
      <select id="sprint">${Object.entries(SPRINTS).map(([id, d]) => `<option value="${id}" ${s.sprint?.id === id ? 'selected' : ''}>${h(d.title)}</option>`).join('')}</select>
      <button class="btn ghost" id="switch">Start this Sprint</button></div>
    <div class="card form"><h3>Your data</h3><p class="muted">Plan: <b>${h(s.plan)}</b> · ID <span class="mono">${h(s.id)}</span></p>
      <div class="row gap wrap"><button class="btn ghost" id="export">Download my data</button><label class="btn ghost">Restore from file<input type="file" id="import" accept="application/json" hidden></label><button class="btn danger" id="reset">Delete everything</button></div></div>
    <p class="fine"><a href="#/plans">Plans</a> · <a href="#/partners">Partners</a> · <a href="#/pt">Clinician view</a></p>
  </section>`);
  document.getElementById('quiet').onchange = e => { store.save(st => st.quiet = e.target.checked); sessionStorageSet('unlocked', '1'); render(); };
  document.getElementById('pin').onchange = e => { const v = e.target.value.trim(); if (v && !/^\d{4}$/.test(v)) return toast('PIN must be 4 digits'); store.save(st => st.quietPin = v); sessionStorageSet('unlocked', '1'); toast(v ? 'PIN set' : 'PIN removed'); };
  document.getElementById('mute').onchange = e => setMuted(e.target.checked);
  document.getElementById('switch').onclick = () => { const id = document.getElementById('sprint').value; if (!confirm('Start ' + SPRINTS[id].title + '?')) return; store.save(st => { st.sprint = E.startSprint(id); st.profile.sprintId = id; if (SPRINTS[id].quiet) st.quiet = true; }); go('#/program'); };
  document.getElementById('export').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.exportData()], { type: 'application/json' })); a.download = 'tuned-data.json'; a.click(); };
  document.getElementById('import').onchange = async e => { try { store.importData(await e.target.files[0].text()); toast('Restored'); go('#/home'); } catch (er) { toast(er.message); } };
  document.getElementById('reset').onclick = () => { if (confirm('Delete all your data on this device? This cannot be undone.')) { store.reset(); go('#/'); } };
}

function viewLock() {
  app.innerHTML = `<main class="lock"><div class="qlogo big">Daily</div><form id="lock"><input id="lockpin" type="password" inputmode="numeric" maxlength="4" autofocus placeholder="PIN" aria-label="PIN"><button class="btn primary">Open</button></form></main>`;
  document.getElementById('lock').onsubmit = e => { e.preventDefault(); if (document.getElementById('lockpin').value === S().quietPin) { sessionStorageSet('unlocked', '1'); render(); } else toast('Wrong PIN'); };
}

// ---------- Squad deep link (?squad=CODE)
(async function squadLink() {
  const code = new URLSearchParams(location.search).get('squad');
  if (!code) return;
  sessionStorageSet('pendingSquad', code.toUpperCase());
})();
store.subscribe(async s => {
  const code = sessionStorageGet('pendingSquad');
  if (!code || !s.profile || s.squad) return;
  try { sessionStorage.removeItem('tuned.pendingSquad'); } catch (e) {}
  if (await health()) { try { const r = await api.post(`squads/${code}/join`, { userId: s.id, display: displayName() }); store.save(st => st.squad = { code, name: r.name }); toast('Joined ' + r.name); } catch (e) {} }
});

// ---------- Components
export function gauge(score, { label = '', delta = null, small = false } = {}) {
  const pct = (score - 300) / 550;
  const a = Math.PI * (1 - pct);
  const r = 80, cx = 100, cy = 100;
  const nx = cx + r * Math.cos(a), ny = cy - r * Math.sin(a);
  const ticks = Array.from({ length: 12 }, (_, i) => { const t = Math.PI * (1 - i / 11); return `<line x1="${cx + 92 * Math.cos(t)}" y1="${cy - 92 * Math.sin(t)}" x2="${cx + 99 * Math.cos(t)}" y2="${cy - 99 * Math.sin(t)}"/>`; }).join('');
  return `<div class="gauge ${small ? 'small' : ''}"><svg viewBox="0 0 200 116" aria-label="Body Score ${score}">
    <g class="g-ticks">${ticks}</g>
    <path class="g-track" d="M20 100 A80 80 0 0 1 180 100"/>
    <path class="g-fill" d="M20 100 A80 80 0 0 1 180 100" pathLength="100" style="stroke-dasharray:${(pct * 100).toFixed(1)} 100"/>
    <circle class="g-dot" cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="6"/>
    </svg><div class="g-num">${score}</div><div class="g-label">${h(label || E.scoreBand(score).label)}${delta ? ` <span class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : ''}${delta}</span>` : ''}</div><div class="g-scale"><span>300</span><span>850</span></div></div>`;
}

export function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}

function greeting() { const hr = new Date().getHours(); return hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening'; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

const LOGO = `<svg class="wordmark" viewBox="0 0 132 28" aria-label="TUNED"><path d="M2 4h20v5h-7.3v17h-5.4V9H2z M26 4h5.4v13.2c0 3.4 1.7 5 4.6 5s4.6-1.6 4.6-5V4H46v13.4c0 6.3-3.8 9.1-10 9.1s-10-2.8-10-9.1z M51 4h5l10 13.6V4h5.3v22h-5L56.3 12.3V26H51z M76 4h16.6v4.8H81.4v3.9h10.2v4.6H81.4v3.9h11.4V26H76z M97 4h8.4c7 0 11.4 4.2 11.4 11s-4.4 11-11.4 11H97z m5.4 4.9v12.2h2.8c3.7 0 6-2.3 6-6.1s-2.3-6.1-6-6.1z"/><rect x="121" y="19" width="7" height="7" class="dot"/></svg>`;

const I = d => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  home: I('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  gauge: I('<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>'),
  chat: I('<path d="M4 5h16v11H9l-5 4z"/>'),
  squad: I('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 14.5c3 0 6 2 6 5.5"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  arrow: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  back: I('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
  check: I('<path d="M5 12l5 5L20 7"/>'),
  flag: I('<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>'),
  lock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  pt: I('<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>'),
  alert: I('<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>'),
  cam: I('<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>'),
  mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  qr: I('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4"/>'),
};

window.addEventListener('hashchange', render);
render();
