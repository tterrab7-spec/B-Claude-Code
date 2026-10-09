// Clinician dashboard: caseload triage, program builder, exercise library with
// videos, patient chart, messaging, notes, RTM billing, and a System view that
// shows the backend. Runs against the TUNED server, or an on-device clinic when
// no server is connected.
import { api, health, LOCAL_KEYS, localRead, localWrite } from './api.js';
import { get as getState, save as saveState } from './store.js';
import { EXERCISES, SPRINTS, exName, doseText, registerLibrary, isBuiltinProgram, itemId } from './data.js';
import { RTM_CODES } from './rtm.js';
import { CONFIG } from './config.js';
import { sessionPlan, startSprint } from './engine.js';
import { summary, applyAction, triageRank, newClinical, newLibrary, effectiveMods, compliance, applyLibraryOp, activity, auditEntry, libraryAuditText, actionText } from './clinic.js';
import { dailyEmail } from './email.js';
import { demoCaseload } from './demo.js';
import { toast, ICON, route, go, videoEmbed } from './app.js';

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ss = { get: k => { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: k => { try { sessionStorage.removeItem(k); } catch (e) {} } };
const ago = iso => { if (!iso) return 'never'; const d = Math.floor((Date.now() - new Date(iso)) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + 'd ago'; };
const when = iso => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ptName = () => ss.get('tuned.ptname') || 'Your PT';
const money = n => '$' + Math.round(n).toLocaleString();
const REGIONS = ['back', 'core', 'hip', 'knee', 'ankle', 'shoulder', 'neck', 'thoracic', 'elbow', 'pelvic', 'general'];
const byTriage = (a, b) => triageRank(a) - triageRank(b) || (b.lastSession || '').localeCompare(a.lastSession || '');

// ---------- Backends
const remote = {
  hdr: () => ({ 'x-clinician-key': ss.get('tuned.ptkey'), 'x-pt-name': ptName() }),
  async list() { return (await api.get('clinician/patients', remote.hdr())).patients; },
  async get(id) { return api.get('clinician/patients/' + encodeURIComponent(id), remote.hdr()); },
  async act(id, action, body) { return api.post(`clinician/patients/${encodeURIComponent(id)}/${action}`, { ...body, by: ptName() }, remote.hdr()); },
  async library() { const lib = await api.get('clinician/library', remote.hdr()); registerLibrary(lib); return lib; },
  async libraryOp(op, body) { const lib = await api.post('clinician/library', { ...body, op, by: ptName() }, remote.hdr()); registerLibrary(lib); return lib; },
  async system() { return api.get('clinician/system', remote.hdr()); },
  async exportAll() { return api.get('clinician/export', remote.hdr()); },
};

const local = {
  store: () => localRead(LOCAL_KEYS.clinic, {}),
  audit(action, pid, text) { const a = localRead(LOCAL_KEYS.audit, []); a.push(auditEntry(ptName(), action, pid, text)); localWrite(LOCAL_KEYS.audit, a.slice(-500)); },
  records() {
    const all = local.store();
    const list = demoCaseload();
    const me = getState();
    if (me.profile && !online) list.unshift({ user: me, clinical: {} });
    return list.map(({ user, clinical }) => {
      const c = { ...newClinical(), ...clinical, ...all[user.id] };
      // A program the PT assigned to a demo patient starts a fresh block.
      if (user.demo && c.assignment && SPRINTS[c.assignment.programId]) { user.sprint = startSprint(c.assignment.programId); user.sprint.startedAt = c.assignment.at; user.profile.sprintId = c.assignment.programId; }
      return { u: user, c };
    });
  },
  async list() { return local.records().map(r => summary(r.u, r.c)).sort(byTriage); },
  async get(id) { const r = local.records().find(x => x.u.id === id); if (!r) throw new Error('No such patient'); return { user: r.u, clinical: r.c, summary: summary(r.u, r.c) }; },
  async act(id, action, body) {
    const r = local.records().find(x => x.u.id === id); if (!r) throw new Error('No such patient');
    const err = applyAction(r.u, r.c, action, { ...body, by: ptName() });
    if (err) throw new Error(err);
    const all = local.store(); all[id] = r.c; localWrite(LOCAL_KEYS.clinic, all);
    if (id === getState().id && action === 'review') saveState(s => { if (s.profile) { s.profile.urgentFlag = null; s.profile.needsReview = false; } });
    if (action !== 'read') local.audit(action, id, actionText(action, r.u, body));
    return { ok: true };
  },
  async library() { const lib = localRead(LOCAL_KEYS.library, newLibrary()); registerLibrary(lib); return lib; },
  async libraryOp(op, body) {
    const lib = localRead(LOCAL_KEYS.library, newLibrary());
    const text = libraryAuditText(op, body);
    const err = applyLibraryOp(lib, op, { ...body, by: ptName() });
    if (err) throw new Error(err);
    localWrite(LOCAL_KEYS.library, lib); registerLibrary(lib);
    local.audit('library.' + op, null, text);
    return lib;
  },
  async system() {
    const recs = local.records();
    const bytes = ['tuned.v1', LOCAL_KEYS.clinic, LOCAL_KEYS.library, LOCAL_KEYS.audit].reduce((a, k) => { try { return a + (localStorage.getItem(k) || '').length; } catch (e) { return a; } }, 0);
    const lib = localRead(LOCAL_KEYS.library, newLibrary());
    const count = f => recs.reduce((a, r) => a + (f(r) || 0), 0);
    return { mode: 'device', storage: 'Browser storage on this device', bytes, counts: {
      patients: recs.length, sessions: count(r => r.u.sprint?.sessions?.length), scores: count(r => r.u.scores?.length), checkins: count(r => r.u.checkins?.length), coachChanges: count(r => r.u.sprint?.changes?.length),
      messages: count(r => r.c.messages.length), notes: count(r => r.c.notes.length), customPrograms: Object.keys(lib.programs).length, customExercises: Object.keys(lib.exercises).length, videos: Object.keys(lib.videos).length },
      activity: activity(recs, localRead(LOCAL_KEYS.audit, [])) };
  },
  async exportAll() { return { exportedAt: new Date().toISOString(), mode: 'device', patients: local.records(), library: localRead(LOCAL_KEYS.library, newLibrary()), audit: localRead(LOCAL_KEYS.audit, []) }; },
};

// Server mode with optional demo patients mixed in (demo ids route to the local clinic).
const demoOn = () => ss.get('tuned.ptdemo') === '1';
const mixed = {
  ...remote,
  async list() { const real = await remote.list(); return demoOn() ? [...real, ...(await local.list()).filter(p => p.demo)].sort(byTriage) : real; },
  get: id => (id.startsWith('demo_') ? local : remote).get(id),
  act: (id, a, b) => (id.startsWith('demo_') ? local : remote).act(id, a, b),
};

let backend = local, online = false;

export async function viewPT(shell) {
  online = !!(await health());
  backend = online ? mixed : local;
  if (online && !ss.get('tuned.ptkey')) return login(shell);
  if (!online && !ss.get('tuned.ptname')) ss.set('tuned.ptname', 'Demo PT');
  const [, , sec, a, b] = route().split('/');
  try {
    await backend.library();
    if (sec === 'billing') await billing(shell);
    else if (sec === 'programs') await programs(shell, a, b);
    else if (sec === 'exercises') await exercises(shell);
    else if (sec === 'system') await system(shell);
    else if (sec) await detail(shell, sec);
    else await caseload(shell);
  } catch (e) {
    if (online && /key/i.test(e.message)) { ss.del('tuned.ptkey'); return login(shell, e.message); }
    shell(`<section class="narrow"><p class="err">${h(e.message)}</p><a class="btn ghost" href="#/pt">Back to caseload</a></section>`, { nav: false });
  }
}

function login(shell, err = '') {
  shell(`<section class="narrow"><p class="eyebrow">Clinician</p><h1 class="h2">PT sign in</h1>
    <form id="ptlogin" class="card form"><label>Clinician key<input type="password" name="k" required autocomplete="current-password"></label>
    <label>Your name (shown to patients)<input name="n" placeholder="Jordan Reed, PT, DPT" maxlength="40"></label>
    ${err ? `<p class="err">${h(err)}</p>` : ''}<button class="btn primary full">Sign in</button></form></section>`, { nav: false });
  document.getElementById('ptlogin').onsubmit = e => {
    e.preventDefault(); const fd = new FormData(e.target);
    ss.set('tuned.ptkey', fd.get('k')); ss.set('tuned.ptname', fd.get('n') || 'Your PT');
    viewPT(shell);
  };
}

const demoBanner = () => online ? '' : `<div class="note">${ICON.pt}<div><b>On-device clinic.</b> No server is connected, so this dashboard runs in this browser: six demo patients plus anyone who used the patient app here. Open <a href="#/pt/system">System</a> to see exactly where the data lives.</div></div>`;

const TABS = [['', 'Caseload'], ['programs', 'Programs'], ['exercises', 'Exercises'], ['billing', 'Billing'], ['system', 'System']];
function header(active, title) {
  return `<div class="pt-head"><div><p class="eyebrow">Clinician · ${h(ptName())} · ${online ? 'server connected' : 'on-device mode'}</p><h1 class="h2">${h(title)}</h1></div>
    <div class="row gap wrap">${online ? `<button class="btn ghost sm" id="ptdemo">${demoOn() ? 'Hide' : 'Show'} demo patients</button>` : ''}<button class="btn ghost sm" id="ptname">${online ? 'Sign out' : 'Set my name'}</button></div></div>
    <nav class="pt-tabs">${TABS.map(([id, l]) => `<a href="#/pt${id ? '/' + id : ''}" class="${active === id ? 'on' : ''}">${l}</a>`).join('')}</nav>${demoBanner()}`;
}

function bindHeader(shell) {
  const d = document.getElementById('ptdemo');
  if (d) d.onclick = () => { ss.set('tuned.ptdemo', demoOn() ? '0' : '1'); viewPT(shell); };
  document.getElementById('ptname').onclick = () => {
    if (online) { ss.del('tuned.ptkey'); return viewPT(shell); }
    const n = prompt('Your name as patients will see it', ptName());
    if (n) { ss.set('tuned.ptname', n.slice(0, 40)); viewPT(shell); }
  };
}

// ---------- Caseload
async function caseload(shell) {
  const patients = await backend.list();
  const week = Date.now() - 7 * 86400000;
  const totals = {
    open: patients.reduce((a, p) => a + p.alerts.filter(x => x.level !== 'info').length, 0),
    urgent: patients.filter(p => p.alerts.some(a => a.level === 'urgent')).length,
    active: patients.filter(p => p.lastSession && new Date(p.lastSession) > week).length,
    review: patients.reduce((a, p) => a + p.pendingChanges, 0),
    unread: patients.reduce((a, p) => a + (p.unread || 0), 0),
    comp: patients.length ? Math.round(patients.reduce((a, p) => a + (p.compliance?.pct || 0), 0) / patients.length) : 0,
  };
  const filter = ss.get('tuned.ptfilter') || 'all';
  const shown = patients.filter(p => filter === 'all' || (filter === 'alerts' ? p.alerts.some(a => a.level !== 'info') : filter === 'review' ? p.pendingChanges : filter === 'unread' ? p.unread : true));
  shell(`<section class="pt">
    ${header('', 'Caseload')}
    <div class="kpis">
      <div class="kpi ${totals.urgent ? 'hot' : ''}"><b>${totals.urgent}</b><span>Urgent</span></div>
      <div class="kpi"><b>${totals.open}</b><span>Open alerts</span></div>
      <div class="kpi ${totals.unread ? 'hot' : ''}"><b>${totals.unread}</b><span>Unread messages</span></div>
      <div class="kpi"><b>${totals.review}</b><span>Coach changes to review</span></div>
      <div class="kpi"><b>${totals.comp}%</b><span>Avg compliance</span></div>
      <div class="kpi"><b>${totals.active}/${patients.length}</b><span>Active this week</span></div>
    </div>
    <div class="seg filters">${[['all', 'All'], ['alerts', 'Needs attention'], ['unread', 'Unread'], ['review', 'To review']].map(([v, l]) => `<label><input type="radio" name="f" value="${v}" ${filter === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    ${shown.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Patient</th><th>Program</th><th>Progress</th><th>Compliance</th><th>Pain</th><th>Body Score</th><th>RTM period</th><th>Alerts</th></tr></thead><tbody>
    ${shown.map(p => `<tr data-id="${h(p.id)}">
      <td><b>${h(p.name)}</b>${p.demo ? ' <span class="tag">demo</span>' : p.id === getState().id ? ' <span class="tag">this device</span>' : ''}<span class="sub">${h(p.age)} · ${h(p.state)}${p.quiet ? ' · Quiet Mode' : ''}${p.ref ? ' · via ' + h(p.ref) : ''}</span></td>
      <td>${h(p.program || '–')}<span class="sub">${h(p.plan)}${SPRINTS[p.sprintId]?.custom ? ' · custom' : ''}</span></td>
      <td>Wk ${p.week ?? '–'} · ${p.sessions}/24<span class="sub">last ${ago(p.lastSession)}</span></td>
      <td><b class="${(p.compliance?.pct ?? 100) < 60 ? 'warn-t' : ''}">${p.compliance?.pct ?? 0}%</b><span class="sub">${p.compliance?.done ?? 0} of ${p.compliance?.expected ?? 0} due</span></td>
      <td>${p.painBaseline ?? '–'} → <b>${p.painLatest ?? '–'}</b></td>
      <td>${p.scoreFirst ?? '–'} → <b>${p.scoreLatest ?? '–'}</b></td>
      <td>${p.rtm.days} day${p.rtm.days === 1 ? '' : 's'} · ${p.rtm.minutes} min<span class="sub">${p.rtm.codes.join(', ') || 'none yet'}</span></td>
      <td>${p.alerts.map(a => `<span class="alert ${a.level}">${h(a.text)}</span>`).join('') || '<span class="sub">On track</span>'}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card"><p>${patients.length ? 'Nobody matches this filter.' : 'No patients yet. Patients appear here as soon as they finish intake on a device connected to this server. Use "Show demo patients" to explore.'}</p></div>`}
  </section>`, { nav: false, wide: true });
  document.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => go('#/pt/' + tr.dataset.id));
  document.querySelectorAll('input[name=f]').forEach(r => r.onchange = () => { ss.set('tuned.ptfilter', r.value); caseload(shell); });
  bindHeader(shell);
}

// ---------- Patient chart
async function detail(shell, id) {
  const { user: u, clinical: c, summary: s } = await backend.get(id);
  const act = async (action, body, msg = 'Saved') => { try { await backend.act(id, action, body); toast(msg); detail(shell, id); } catch (e) { toast(e.message); } };
  if (s.unread) backend.act(id, 'read', {}).catch(() => {});
  const sp = u.sprint || { sessions: [], changes: [], mods: {} };
  const verb = { regress: 'Regressed', progress: 'Progressed', add: 'Added volume', reduce: 'Reduced volume' };
  const pending = (u.visits || []).filter(v => v.status === 'requested' && !c.visits.some(cv => cv.requestId === v.id));
  const scores = u.scores || [];
  const mods = effectiveMods(u, c);
  const planSp = { ...sp, mods };
  const plan = sp.id && SPRINTS[sp.id] ? sessionPlan(planSp, Math.min(sp.sessions.length, 23)) : null;
  const other = plan ? sessionPlan(planSp, Math.min(sp.sessions.length + 1, 23)) : null;
  const planItems = plan ? [...plan.items, ...other.items.filter(i => !plan.items.some(x => x.base === i.base))] : [];
  const pains = sp.sessions.map(x => x.pain);
  const comp = compliance(u);
  const first = (u.profile.name || '').split(' ')[0];
  const loads = {};
  sp.sessions.forEach(x => Object.entries(x.loads || {}).forEach(([k, v]) => (loads[k] ||= []).push({ at: x.at, v })));
  const pendingAssign = c.assignment && c.assignment.programId !== sp.id;
  shell(`<section class="pt">
    <nav class="pt-tabs">${TABS.map(([tid, l]) => `<a href="#/pt${tid ? '/' + tid : ''}">${l}</a>`).join('')}</nav>
    <a href="#/pt" class="back">${ICON.back} Caseload</a>
    <div class="row between wrap"><div><p class="eyebrow">${h(s.program)} · Week ${s.week} · ${s.sessions}/24 sessions${u.demo ? ' · demo patient' : ''}</p>
      <h1 class="h2">${h(u.profile.name)}, ${h(u.profile.age)} · ${h(u.profile.state)}</h1>
      <p class="muted">Goal: ${h(u.profile.goal || '–')} · Joined ${ago(u.profile.joined)} · Plan ${h(u.plan)}${u.ref ? ' · Referred by ' + h(u.ref) : ''}${u.quiet ? ' · Quiet Mode' : ''}${u.profile.email ? ` · ${h(u.profile.email)}${u.profile.dailyEmail ? ' (daily email on)' : ''}` : ''}</p></div></div>
    ${s.alerts.length ? `<div class="alerts">${s.alerts.map(a => `<span class="alert ${a.level}">${h(a.text)}</span>`).join('')}</div>` : ''}

    <div class="pt-grid">
      <div class="card"><h3>Program</h3>
        <p><b>${h(SPRINTS[sp.id]?.title || '–')}</b>${SPRINTS[sp.id]?.custom ? ' <span class="tag">custom</span>' : ''}<br><span class="muted">${h(SPRINTS[sp.id]?.goal || '')}</span></p>
        ${pendingAssign ? `<p class="alert medium">Assigned ${h(SPRINTS[c.assignment.programId]?.title)} ${ago(c.assignment.at)}. Starts on the patient's next sync.</p>` : ''}
        <form id="assign" class="form"><select name="programId">${programOptions(sp.id)}</select>
          <div class="row gap wrap"><button class="btn primary sm">Assign program</button><a class="btn ghost sm" href="#/pt/programs/new">Build a new one</a></div>
          <p class="fine">Assigning starts a fresh 6-week block. History and scores are kept.</p></form>
      </div>
      <div class="card"><h3>Compliance · ${comp.pct}%</h3>
        <p class="muted">${comp.done} of ${comp.expected} sessions due so far (4 a week).</p>
        ${calendar(u)}
      </div>
      <div class="card"><h3>Intake and safety</h3>
        <p>Pain baseline <b>${u.profile.painBaseline}/10</b>. Safety flags: ${u.profile.flags?.length ? u.profile.flags.map(h).join(', ') : 'none'}.${u.profile.outOfState ? ` <b>Out of your license states.</b>` : ''}</p>
        ${u.profile.urgentFlag ? `<p class="alert urgent">Coach flagged urgent symptoms ${ago(u.profile.urgentFlag)}. Contact the patient.</p>` : ''}
        ${c.reviewed ? `<p class="muted">Reviewed by ${h(c.reviewed.by)} ${ago(c.reviewed.at)}${c.reviewed.note ? ': ' + h(c.reviewed.note) : ''}</p>` : ''}
        <form id="review" class="form"><input name="note" placeholder="${c.reviewed ? 'Add a review note' : 'Review note (optional)'}"><button class="btn ${c.reviewed ? 'ghost' : 'primary'} sm">${c.reviewed ? 'Re-review and clear alerts' : 'Mark reviewed and cleared'}</button></form>
      </div>
      <div class="card"><h3>Trends</h3>
        <p class="sub">Pain per session (0-10)</p><div class="spark">${pains.map(v => `<i style="height:${Math.max(4, v * 10)}%;${v >= 7 ? 'background:var(--bad)' : ''}" title="${v}"></i>`).join('') || '<span class="muted">No sessions</span>'}</div>
        <p class="sub" style="margin-top:12px">Body Score</p>${scores.length ? `<div class="spark">${scores.map(x => `<i style="height:${((x.total - 300) / 550) * 100}%" title="${x.at.slice(0, 10)}: ${x.total}"></i>`).join('')}</div>
        <p>${scores[0].total} → <b>${scores.at(-1).total}</b> over ${scores.length} screens. Latest: ${Object.entries(scores.at(-1).parts).map(([k, v]) => `${k} ${v ?? '–'}`).join(' · ')} (${scores.at(-1).method})</p>` : '<p class="muted">No screens yet.</p>'}
        ${u.pads?.length ? `<p class="sub">Pads per day</p><p>${u.pads.map(p => p.count).join(' → ')}</p>` : ''}
        ${Object.keys(loads).length ? `<p class="sub">Weights logged (lbs)</p><p>${Object.entries(loads).map(([k, l]) => `${h(exName(k))}: ${l.map(x => x.v).join(' → ')}`).join('<br>')}</p>` : ''}
      </div>
    </div>

    <div class="pt-grid">
      <div class="card"><h3>Messages with ${h(first)}</h3>
        <div class="thread">${c.messages.length ? c.messages.slice(-12).map(m => `<div class="tmsg ${m.role === 'patient' ? 'them' : 'us'}"><span class="sub">${h(m.role === 'patient' ? first : m.from)} · ${when(m.at)}</span><p>${h(m.text)}</p></div>`).join('') : '<p class="muted">No messages yet.</p>'}</div>
        <form id="msg" class="form"><textarea name="text" rows="2" required placeholder="Shows on ${h(first)}'s Today screen and in his My PT thread"></textarea><button class="btn primary sm">Send</button></form>
      </div>
      <div class="card"><h3>Coach conversation <span class="sub">AI, read-only</span></h3><div class="transcript">${(u.coach || []).slice(-30).map(m => `<p class="${m.role}"><b>${m.role === 'me' ? h(first) : 'Coach' + (m.source === 'ai' ? ' (AI)' : '')}:</b> ${h(m.text)}</p>`).join('') || '<p class="muted">No messages.</p>'}</div></div>
    </div>

    ${plan ? `<div class="card"><div class="row between wrap"><h3>Plan · week ${plan.week}, ${h(plan.phase)}</h3><span class="sub">Edits reach the patient's next session on his next sync</span></div>
      <div class="table-wrap flat"><table class="tbl plan-ed"><thead><tr><th>Exercise</th><th>Dose</th><th>Swap to</th><th>Sets ±</th><th>Reps/secs ±</th><th>Note to patient</th><th></th></tr></thead><tbody>
      ${planItems.map(i => { const m = mods[i.base] || {}; const reg = (EXERCISES[i.base] || i.ex).region; const opts = Object.entries(EXERCISES).filter(([k, e]) => e.region === reg || k === i.base || k === i.id);
        return `<tr data-base="${h(i.base)}"><td><b>${h(exName(i.id))}</b>${i.ex.video ? ` <span class="tag">${ICON.play} video</span>` : ''}${i.id !== i.base ? `<span class="sub">base: ${h(exName(i.base))}</span>` : ''}</td><td class="mono">${doseText(i.ex, m)}</td>
          <td><select name="swap">${opts.map(([k, e]) => `<option value="${k}" ${k === i.id ? 'selected' : ''}>${h(e.name)}</option>`).join('')}</select></td>
          <td><input name="sets" type="number" min="-5" max="5" value="${m.sets || 0}" style="max-width:66px"></td>
          <td><input name="${i.ex.secs ? 'secs' : 'reps'}" type="number" min="-20" max="30" value="${(i.ex.secs ? m.secs : m.reps) || 0}" style="max-width:74px"></td>
          <td><input name="note" maxlength="300" value="${h(m.note || '')}" placeholder="${h(i.note && !m.note ? i.note : 'e.g. light band, left side only')}"></td>
          <td><button class="btn ghost sm" data-save>Save</button></td></tr>`; }).join('')}
      </tbody></table></div>
      ${c.overrides.length ? `<p class="fine">PT changes: ${c.overrides.slice(-5).reverse().map(o => `${ago(o.at)} ${h(o.why || 'edit')}: ${h(exName(o.base))}${o.mod.swap ? ' → ' + h(exName(o.mod.swap)) : ''}${o.mod.note ? ' (note)' : ''}`).join(' · ')}</p>` : ''}
    </div>` : ''}

    <div class="card"><h3>AI coach changes · review queue</h3>
      ${sp.changes.length ? `<div class="table-wrap flat"><table class="tbl"><thead><tr><th>When</th><th>Change</th><th>Why</th><th></th></tr></thead><tbody>${sp.changes.map((ch, i) => ({ ch, i })).reverse().map(({ ch, i }) => {
        const st = c.changeStatus[i];
        return `<tr><td>${ago(ch.at)}<span class="sub">session ${ch.session + 1}</span></td><td>${verb[ch.type]}: ${h(exName(ch.from))}${ch.to !== ch.from ? ' → ' + h(exName(ch.to)) : ''}</td><td>${ch.flare ? 'Pain flare' : ch.via === 'coach' ? 'Coach chat' : 'Two easy sessions'}</td>
          <td>${st ? `<span class="tag">${st.status}</span>` : `<button class="btn ghost sm" data-ch="${i}" data-st="approved">Approve</button> <button class="btn ghost sm" data-ch="${i}" data-st="reverted">Revert</button>`}</td></tr>`; }).join('')}</tbody></table></div>
        ${sp.changes.some((ch, i) => !c.changeStatus[i]) ? '<button class="btn ghost sm" id="approve-all">Approve all pending</button>' : ''}` : '<p class="muted">No automatic changes yet.</p>'}
    </div>

    <div class="pt-grid">
      <div class="card"><h3>Clinical notes</h3>
        ${c.notes.length ? c.notes.slice().reverse().map(n => `<div class="note-entry"><p class="sub">${h(n.kind)} · ${h(n.by)} · ${new Date(n.at).toLocaleDateString()}</p><p>${h(n.text).replace(/\n/g, '<br>')}</p></div>`).join('') : '<p class="muted">No notes yet.</p>'}
        <form id="note" class="form"><select name="kind"><option>Progress note</option><option>Plan of care</option><option>Visit note</option><option>Discharge summary</option><option>Phone call</option></select>
          <textarea name="text" rows="5" required placeholder="S: ...&#10;O: ...&#10;A: ...&#10;P: ..."></textarea>
          <div class="row gap wrap"><button class="btn primary sm">Save note</button><button type="button" class="btn ghost sm" id="draft">Draft from data</button></div></form>
      </div>
      <div class="card"><h3>RTM · ${s.rtm.periodStart} to ${s.rtm.periodEnd}</h3>
        <div class="kpis small"><div class="kpi"><b>${s.rtm.days}</b><span>data days</span></div><div class="kpi"><b>${s.rtm.minutes}</b><span>mgmt min (month)</span></div></div>
        <p>${s.rtm.codes.length ? s.rtm.codes.map(cd => `<span class="tag" title="${h(RTM_CODES[cd])}">${cd}</span>`).join(' ') : 'No codes met yet.'}</p>
        <p class="fine">${h(nextBilling(s))}.</p>
        <form id="mins" class="form"><div class="row gap wrap"><input name="minutes" type="number" min="1" max="120" placeholder="Minutes" required style="max-width:110px"><label class="check"><input type="checkbox" name="interactive"><span>Live call or video</span></label></div><input name="note" placeholder="What you did (reviewed data, adjusted plan, called patient)"><button class="btn ghost sm">Log time</button></form>
        ${c.minutes.length ? `<p class="fine">${c.minutes.slice(-4).reverse().map(m => `${ago(m.at)}: ${m.minutes} min${m.interactive ? ' live' : ''}${m.note ? ' · ' + h(m.note) : ''}`).join('<br>')}</p>` : ''}
        <h3 style="margin-top:14px">Video visits</h3>
        ${pending.map(v => `<p><span class="alert medium">Requested ${ago(v.requested)}</span></p>`).join('')}
        ${c.visits.map(v => `<p>${when(v.when)} · <a href="${h(v.link)}" target="_blank" rel="noopener">Join link</a></p>`).join('') || '<p class="muted">None scheduled.</p>'}
        <form id="visit" class="form row gap wrap"><input type="datetime-local" name="when" required><button class="btn primary sm">Schedule</button></form>
      </div>
    </div>
    <div class="card"><h3>Session log</h3>${sp.sessions.length ? `<div class="table-wrap flat"><table class="tbl"><thead><tr><th>#</th><th>Date</th><th>Pain</th><th>Effort</th><th>Weights</th><th>Note</th></tr></thead><tbody>${sp.sessions.map((x, i) => `<tr><td>${i + 1}</td><td>${x.at.slice(0, 10)}</td><td>${x.pain}</td><td>${x.effort}${x.minimal ? ' (10-min)' : ''}</td><td class="sub">${Object.entries(x.loads || {}).map(([k, v]) => `${h(exName(k))} ${v}`).join(', ')}</td><td>${h(x.note)}</td></tr>`).reverse().join('')}</tbody></table></div>` : '<p class="muted">No sessions yet.</p>'}
      ${u.formChecks?.length ? `<p>Form checks: ${u.formChecks.slice(-5).map(f => `${h(exName(f.ex))} ${f.reps} reps${f.cues.length ? ' (' + h(f.cues[0]) + ')' : ', clean'}`).join(' · ')}</p>` : ''}
      <p class="row gap"><a class="btn ghost sm" href="#/pt/system" id="raw-link">View raw stored record</a></p>
    </div>
  </section>`, { nav: false, wide: true });

  const form = (sel, fn) => { const f = document.querySelector(sel); if (f) f.onsubmit = e => { e.preventDefault(); fn(new FormData(f)); }; };
  form('#review', fd => act('review', { note: fd.get('note') }, 'Marked reviewed'));
  form('#mins', fd => act('minutes', { minutes: +fd.get('minutes'), interactive: !!fd.get('interactive'), note: fd.get('note') }, 'Time logged'));
  form('#visit', fd => act('visit', { when: fd.get('when'), requestId: pending[0]?.id }, 'Visit scheduled'));
  form('#msg', fd => act('message', { text: fd.get('text') }, 'Message sent'));
  form('#note', fd => act('note', { text: fd.get('text'), kind: fd.get('kind') }, 'Note saved'));
  form('#assign', fd => { const pid = fd.get('programId'); if (confirm(`Assign "${SPRINTS[pid].title}" to ${first}? This starts a fresh 6-week block.`)) act('assign', { programId: pid }, 'Program assigned'); });
  document.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => act('change', { index: +b.dataset.ch, status: b.dataset.st }, b.dataset.st === 'reverted' ? 'Reverted' : 'Approved'));
  document.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
    const tr = b.closest('tr'); const val = n => tr.querySelector(`[name=${n}]`)?.value;
    act('plan', { base: tr.dataset.base, swap: val('swap'), sets: val('sets'), reps: val('reps'), secs: val('secs'), note: val('note') }, 'Plan updated');
  });
  document.getElementById('raw-link').onclick = () => ss.set('tuned.rawid', id);
  const all = document.getElementById('approve-all');
  if (all) all.onclick = async () => {
    for (const [i] of sp.changes.entries()) if (!c.changeStatus[i]) { try { await backend.act(id, 'change', { index: i, status: 'approved' }); } catch (e) { return toast(e.message); } }
    toast('All approved'); detail(shell, id);
  };
  document.getElementById('draft').onclick = () => {
    const ta = document.querySelector('#note textarea');
    const last = sp.sessions.at(-1);
    ta.value = `S: ${u.profile.goal ? 'Goal: ' + u.profile.goal + '. ' : ''}Pain ${u.profile.painBaseline}/10 at intake, ${last ? last.pain + '/10 at last session' : 'no sessions yet'}.${(u.coach || []).filter(m => m.role === 'me').slice(-1).map(m => ' Reports: "' + m.text + '"').join('')}
O: ${s.sessions}/24 sessions, compliance ${comp.pct}% (${comp.done}/${comp.expected}). Body Score ${s.scoreFirst ?? '–'} → ${s.scoreLatest ?? '–'}.${scores.length ? ' Latest ' + Object.entries(scores.at(-1).parts).map(([k, v]) => k + ' ' + (v ?? '–')).join(', ') + '.' : ''}${u.pads?.length ? ' Pads/day ' + u.pads[0].count + ' → ' + u.pads.at(-1).count + '.' : ''}${Object.keys(loads).length ? ' Loads: ' + Object.entries(loads).map(([k, l]) => exName(k) + ' ' + l[0].v + '→' + l.at(-1).v + ' lb').join(', ') + '.' : ''} RTM: ${s.rtm.days} data days this period.
A: ${pains.length > 1 && pains.at(-1) < pains[0] ? 'Improving.' : pains.length > 1 && pains.at(-1) > pains[0] ? 'Symptoms up since start, monitor.' : 'Early in plan.'} ${s.risk.level === 'high' ? 'Adherence risk: ' + s.risk.reason + '.' : ''}
P: Continue ${SPRINTS[sp.id]?.title || 'program'}${plan ? ', phase "' + plan.phase + '"' : ''}. `;
    ta.focus();
  };
}

function programOptions(selected) {
  const built = Object.entries(SPRINTS).filter(([id]) => isBuiltinProgram(id));
  const custom = Object.entries(SPRINTS).filter(([id]) => !isBuiltinProgram(id));
  const o = list => list.map(([id, p]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${h(p.title)}</option>`).join('');
  return `${custom.length ? `<optgroup label="Your programs">${o(custom)}</optgroup>` : ''}<optgroup label="TUNED programs">${o(built)}</optgroup>`;
}

function calendar(u) {
  const sp = u.sprint; if (!sp) return '';
  const start = new Date(sp.startedAt); start.setHours(0, 0, 0, 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const loc = s => iso(new Date(s));
  const done = new Set(sp.sessions.map(x => loc(x.at)));
  const chk = new Set((u.checkins || []).map(x => loc(x.at)));
  const today = iso(new Date());
  const days = Array.from({ length: 42 }, (_, i) => iso(new Date(start.getTime() + i * 86400000)));
  return `<div class="cal">${days.map((d, i) => `<span class="${done.has(d) ? 'done' : ''} ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}" title="${d}${done.has(d) ? ' · session' : ''}${chk.has(d) ? ' · check-in' : ''}">${chk.has(d) && !done.has(d) ? '•' : ''}</span>`).join('')}</div>
    <p class="fine cal-key"><span class="lg done"></span> session <span class="lg"></span> no session <span class="lg today"></span> today · dot = check-in only · one row per week</p>`;
}

function nextBilling(p) {
  const r = p.rtm;
  if (r.days < 2) return 'Needs 2+ data days for 98985';
  if (r.days < 16) return `${16 - r.days} more data days for 98977`;
  if (!r.interactive) return 'Log a live call or video to bill management';
  if (r.minutes < 20) return `${20 - r.minutes} more minutes for 98980`;
  return 'Fully billable this period';
}

// ---------- Programs: list and builder
async function programs(shell, mode, pid) {
  if (mode === 'new' || mode === 'edit' || mode === 'copy') return programEditor(shell, mode, pid);
  const all = Object.entries(SPRINTS);
  const custom = all.filter(([id]) => !isBuiltinProgram(id)), built = all.filter(([id]) => isBuiltinProgram(id));
  const card = ([id, p], own) => `<div class="card prog"><div><b>${h(p.title)}</b><span class="sub">${own ? `Built by ${h(p.by || 'you')} · ${ago(p.at)}` : 'TUNED · ' + h(p.door)} · 3 phases · ${new Set(p.phases.flatMap(ph => [...ph.A, ...ph.B].map(itemId))).size} exercises</span><p class="muted">${h(p.goal || '')}</p></div>
    <div class="row gap wrap">${own ? `<a class="btn primary sm" href="#/pt/programs/edit/${id}">Edit</a><button class="btn ghost sm" data-del="${id}">Delete</button>` : ''}<a class="btn ghost sm" href="#/pt/programs/copy/${id}">${own ? 'Duplicate' : 'Duplicate and edit'}</a></div></div>`;
  shell(`<section class="pt">${header('programs', 'Programs')}
    <div class="row between wrap"><p class="muted">Build programs with your own exercises, prescriptions, notes and videos. Assign them from any patient's chart.</p><a class="btn primary" href="#/pt/programs/new">New program</a></div>
    <h3 class="sec-sm">Your programs (${custom.length})</h3>
    ${custom.length ? custom.map(p => card(p, true)).join('') : '<div class="card"><p class="muted">None yet. Start from scratch or duplicate one of the TUNED programs below.</p></div>'}
    <h3 class="sec-sm">TUNED programs (${built.length})</h3>${built.map(p => card(p, false)).join('')}
  </section>`, { nav: false, wide: true });
  bindHeader(shell);
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this program? Patients already on it keep their current block.')) return;
    try { await backend.libraryOp('deleteProgram', { id: b.dataset.del }); delete SPRINTS[b.dataset.del]; toast('Deleted'); programs(shell); } catch (e) { toast(e.message); }
  });
}

function exerciseOptions(selected) {
  const groups = {};
  Object.entries(EXERCISES).forEach(([id, e]) => (groups[e.region] ||= []).push([id, e]));
  return Object.entries(groups).sort().map(([r, list]) => `<optgroup label="${h(r)}">${list.sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, e]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${h(e.name)}${e.custom ? ' (yours)' : ''}${e.video ? ' ▶' : ''}</option>`).join('')}</optgroup>`).join('');
}

function programEditor(shell, mode, pid) {
  const src = pid && SPRINTS[pid];
  const toItem = it => {
    const id = itemId(it); const e = EXERCISES[id] || {}; const o = typeof it === 'string' ? {} : it;
    const unit = o.secs ? 'secs' : o.mins ? 'mins' : o.reps ? 'reps' : e.secs ? 'secs' : e.mins ? 'mins' : 'reps';
    return { id, sets: o.sets || e.sets || 3, unit, dose: o[unit] || e[unit] || 10, note: o.note || '' };
  };
  const draft = src ? { id: mode === 'edit' ? pid : null, title: (mode === 'copy' ? 'Copy of ' : '') + src.title, goal: src.goal || '', outcome: src.outcome || '', phases: src.phases.map(ph => ({ name: ph.name, A: ph.A.map(toItem), B: ph.B.map(toItem) })) }
    : { id: null, title: '', goal: '', outcome: '', phases: ['Calm it down', 'Build', 'Load'].map(name => ({ name, A: [], B: [] })) };
  const rowHtml = (it, pi, v, k) => `<div class="b-row" data-p="${pi}" data-v="${v}" data-k="${k}">
    <select name="id" aria-label="Exercise">${exerciseOptions(it.id)}</select>
    <span class="b-dose"><input name="sets" type="number" min="1" max="10" value="${it.sets}" aria-label="Sets"><span class="x">x</span>
    <input name="dose" type="number" min="1" max="600" value="${it.dose}" aria-label="Dose">
    <select name="unit" aria-label="Unit"><option ${it.unit === 'reps' ? 'selected' : ''}>reps</option><option ${it.unit === 'secs' ? 'selected' : ''}>secs</option><option ${it.unit === 'mins' ? 'selected' : ''}>mins</option></select></span>
    <input name="note" maxlength="300" value="${h(it.note)}" placeholder="Note to patient (optional)" aria-label="Note">
    <button type="button" class="iconbtn" data-rm aria-label="Remove">×</button></div>`;
  const read = () => {
    const f = document.getElementById('builder');
    draft.title = f.elements.title.value; draft.goal = f.elements.goal.value; draft.outcome = f.elements.outcome.value;
    f.querySelectorAll('[name=phname]').forEach((inp, i) => { draft.phases[i].name = inp.value; });
    draft.phases.forEach(ph => { ph.A = []; ph.B = []; });
    f.querySelectorAll('.b-row').forEach(r => { const g = n => r.querySelector(`[name=${n}]`).value; draft.phases[+r.dataset.p][r.dataset.v].push({ id: g('id'), sets: +g('sets'), dose: +g('dose'), unit: g('unit'), note: g('note') }); });
  };
  const draw = () => {
    shell(`<section class="pt">${header('programs', mode === 'edit' ? 'Edit program' : 'New program')}
      <a href="#/pt/programs" class="back">${ICON.back} Programs</a>
      <form id="builder" class="form">
        <div class="card form"><label>Program title<input name="title" required maxlength="80" value="${h(draft.title)}" placeholder="Fix Your Hip in 6 Weeks"></label>
          <div class="row gap wrap"><label>Goal (patient sees this)<input name="goal" maxlength="200" value="${h(draft.goal)}" placeholder="Walk, squat and sleep without hip pain"></label>
          <label>Finish line<input name="outcome" maxlength="200" value="${h(draft.outcome)}" placeholder="Pain under 2/10 and full-depth squat"></label></div>
          <p class="fine">Structure: 6 weeks, 3 two-week phases, 4 sessions a week alternating Session A and Session B. The AI coach still eases or progresses each patient from his ratings, and you review every change.</p></div>
        ${draft.phases.map((ph, pi) => `<div class="card"><div class="row gap wrap"><span class="tag">Weeks ${pi * 2 + 1}-${pi * 2 + 2}</span><input name="phname" value="${h(ph.name)}" maxlength="40" style="max-width:260px" aria-label="Phase name"></div>
          <div class="b-cols">${['A', 'B'].map(v => `<div><h4>Session ${v}</h4>${ph[v].map((it, k) => rowHtml(it, pi, v, k)).join('') || '<p class="muted">No exercises yet.</p>'}
            <button type="button" class="btn ghost sm" data-add="${pi}${v}">+ Add exercise</button></div>`).join('')}</div></div>`).join('')}
        <div class="row gap wrap"><button class="btn primary big" id="saveprog">Save program</button><a class="btn ghost" href="#/pt/exercises">Manage exercises and videos</a></div>
      </form></section>`, { nav: false, wide: true });
    bindHeader(shell);
    const f = document.getElementById('builder');
    f.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { read(); const pi = +b.dataset.add[0], v = b.dataset.add[1]; draft.phases[pi][v].push(toItem(draft.phases[pi][v].at(-1)?.id || 'gluteBridge')); draw(); });
    f.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(); const r = b.closest('.b-row'); draft.phases[+r.dataset.p][r.dataset.v].splice(+r.dataset.k, 1); draw(); });
    f.querySelectorAll('.b-row select[name=id]').forEach(sel => sel.onchange = () => { read(); const r = sel.closest('.b-row'); const list = draft.phases[+r.dataset.p][r.dataset.v]; list[+r.dataset.k] = { ...toItem(sel.value), note: list[+r.dataset.k].note }; draw(); });
    f.onsubmit = async e => {
      e.preventDefault(); read();
      const phases = draft.phases.map(ph => ({ name: ph.name, ...Object.fromEntries(['A', 'B'].map(v => [v, ph[v].map(it => ({ id: it.id, sets: it.sets, [it.unit]: it.dose, note: it.note }))])) }));
      try { await backend.libraryOp('saveProgram', { id: draft.id, title: draft.title, goal: draft.goal, outcome: draft.outcome, phases }); toast('Program saved'); go('#/pt/programs'); }
      catch (er) { toast(er.message); }
    };
  };
  draw();
}

// ---------- Exercise library and videos
async function exercises(shell) {
  const q = (ss.get('tuned.exq') || '').toLowerCase(), region = ss.get('tuned.exr') || '';
  const list = Object.entries(EXERCISES).filter(([, e]) => (!region || e.region === region) && (!q || e.name.toLowerCase().includes(q))).sort((a, b) => a[1].region.localeCompare(b[1].region) || a[1].name.localeCompare(b[1].name));
  const withVideo = Object.values(EXERCISES).filter(e => e.video).length;
  shell(`<section class="pt">${header('exercises', 'Exercise library')}
    <div class="kpis"><div class="kpi"><b>${Object.keys(EXERCISES).length}</b><span>Exercises</span></div><div class="kpi"><b>${Object.values(EXERCISES).filter(e => e.custom).length}</b><span>Yours</span></div><div class="kpi ${withVideo ? '' : 'hot'}"><b>${withVideo}</b><span>With demo video</span></div></div>
    <details class="card" id="newex-box"><summary><b>Add your own exercise</b></summary>
      <form id="newex" class="form" style="margin-top:12px">
        <div class="row gap wrap"><label>Name<input name="name" required maxlength="60" placeholder="Banded Hip Airplane"></label><label>Region<select name="region">${REGIONS.map(r => `<option>${r}</option>`).join('')}</select></label></div>
        <div class="row gap wrap"><label>Sets<input name="sets" type="number" min="1" max="10" value="3"></label><label>Dose<input name="dose" type="number" min="1" max="600" value="10"></label><label>Unit<select name="unit"><option>reps</option><option>secs</option><option>mins</option></select></label><label class="check" style="align-self:end"><input type="checkbox" name="perSide"><span>Per side</span></label></div>
        <label>Cues, one per line<textarea name="cues" rows="3" placeholder="Hold a wall for balance&#10;Rotate the pelvis open, then closed&#10;Slow and controlled"></textarea></label>
        <label>Demo video link (YouTube, Vimeo or a direct .mp4)<input name="video" type="url" placeholder="https://youtu.be/..."></label>
        <button class="btn primary">Add exercise</button></form></details>
    <div class="row gap wrap"><input id="exq" placeholder="Search exercises" value="${h(q)}" style="max-width:280px" aria-label="Search"><select id="exr" style="max-width:200px" aria-label="Region"><option value="">All regions</option>${REGIONS.map(r => `<option ${r === region ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    <div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Exercise</th><th>Region</th><th>Default dose</th><th>Demo video</th><th></th></tr></thead><tbody>
      ${list.map(([id, e]) => `<tr data-ex="${id}"><td><b>${h(e.name)}</b>${e.custom ? ' <span class="tag">yours</span>' : ''}<span class="sub">${h((e.cues || [])[0] || '')}</span></td><td>${h(e.region)}</td><td class="mono">${doseText(e)}</td>
        <td><div class="row gap"><input name="video" type="url" value="${h(e.video || '')}" placeholder="Paste a video link" style="min-width:200px" aria-label="Video link">${e.video ? `<button class="btn ghost sm" data-play aria-label="Play">${ICON.play}</button>` : ''}</div><div class="vslot"></div></td>
        <td><div class="row gap"><button class="btn ghost sm" data-vsave>Save video</button>${e.custom ? '<button class="btn ghost sm" data-exdel>Delete</button>' : ''}</div></td></tr>`).join('')}
    </tbody></table></div>
    <p class="fine">Videos play inside the patient's session and are linked in the daily email. For launch, filming your own library gives you consistent, branded demos.</p>
  </section>`, { nav: false, wide: true });
  bindHeader(shell);
  const rerender = () => exercises(shell);
  let t; document.getElementById('exq').oninput = e => { clearTimeout(t); t = setTimeout(async () => { ss.set('tuned.exq', e.target.value); await rerender(); const i = document.getElementById('exq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 350); };
  document.getElementById('exr').onchange = e => { ss.set('tuned.exr', e.target.value); rerender(); };
  document.getElementById('newex').onsubmit = async e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
    try { await backend.libraryOp('saveExercise', { name: fd.name, region: fd.region, sets: fd.sets, [fd.unit]: fd.dose, perSide: !!fd.perSide, cues: fd.cues, video: fd.video }); toast('Exercise added'); rerender(); } catch (er) { toast(er.message); }
  };
  document.querySelectorAll('[data-vsave]').forEach(b => b.onclick = async () => {
    const tr = b.closest('tr');
    try { await backend.libraryOp('setVideo', { id: tr.dataset.ex, video: tr.querySelector('[name=video]').value.trim() }); toast('Video saved'); rerender(); } catch (er) { toast(er.message); }
  });
  document.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { const slot = b.closest('td').querySelector('.vslot'); slot.innerHTML = slot.innerHTML ? '' : videoEmbed(EXERCISES[b.closest('tr').dataset.ex].video); });
  document.querySelectorAll('[data-exdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this exercise?')) return;
    const id = b.closest('tr').dataset.ex;
    try { await backend.libraryOp('deleteExercise', { id }); delete EXERCISES[id]; toast('Deleted'); rerender(); } catch (er) { toast(er.message); }
  });
}

// ---------- Billing
async function billing(shell) {
  const patients = await backend.list();
  const R = CONFIG.rtmRates;
  const rows = patients.map(p => ({ p, amt: p.rtm.codes.reduce((a, c) => a + (R[c] || 0), 0) }));
  const total = rows.reduce((a, r) => a + r.amt, 0);
  const near = patients.filter(p => p.rtm.days >= 10 && p.rtm.days < 16);
  shell(`<section class="pt">
    ${header('billing', 'RTM billing')}
    <div class="kpis">
      <div class="kpi hot"><b>${money(total)}</b><span>Billable this period (est.)</span></div>
      <div class="kpi"><b>${patients.filter(p => p.rtm.codes.includes('98977')).length}</b><span>At 16+ data days (98977)</span></div>
      <div class="kpi"><b>${near.length}</b><span>10-15 days: nudge to 16</span></div>
      <div class="kpi"><b>${patients.filter(p => !p.rtm.codes.some(c => ['98979', '98980'].includes(c))).length}</b><span>No management time yet</span></div>
    </div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Patient</th><th>Period</th><th>Data days</th><th>Mgmt min</th><th>Codes met</th><th>Est.</th><th>Next action</th></tr></thead><tbody>
      ${rows.map(({ p, amt }) => `<tr data-id="${h(p.id)}"><td><b>${h(p.name)}</b>${p.demo ? ' <span class="tag">demo</span>' : ''}<span class="sub">${h(p.plan)}</span></td><td>${p.rtm.periodStart}<span class="sub">to ${p.rtm.periodEnd}</span></td>
        <td>${p.rtm.days}</td><td>${p.rtm.minutes}${p.rtm.interactive ? '' : '<span class="sub">no live contact</span>'}</td>
        <td>${p.rtm.codes.map(c => `<span class="tag" title="${h(RTM_CODES[c])}">${c}</span>`).join(' ') || '–'}</td><td><b>${money(amt)}</b></td>
        <td class="sub">${nextBilling(p)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="row gap wrap"><button class="btn primary" id="csv">Export CSV</button></div>
    <div class="card"><h3>Code reference</h3><ul class="list">${Object.entries(RTM_CODES).map(([c, d]) => `<li><b>${c}</b> · ${h(d)} · est. ${money(R[c] || 0)}</li>`).join('')}</ul>
      <p class="fine">Rates are placeholders in <span class="mono">js/config.js</span>. Set them to your contracted or locality-adjusted rates. Supply codes need data on enough days in each 30-day period; management codes need at least one live interaction in the calendar month. Payer rules vary, so confirm with your biller.</p></div>
  </section>`, { nav: false, wide: true });
  document.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => go('#/pt/' + tr.dataset.id));
  document.getElementById('csv').onclick = () => {
    const lines = [['patient', 'state', 'plan', 'period_start', 'period_end', 'data_days', 'mgmt_minutes', 'live_contact', 'codes', 'estimate_usd']]
      .concat(rows.map(({ p, amt }) => [p.name, p.state, p.plan, p.rtm.periodStart, p.rtm.periodEnd, p.rtm.days, p.rtm.minutes, p.rtm.interactive ? 'yes' : 'no', p.rtm.codes.join(' '), amt]));
    download(`tuned-rtm-${new Date().toISOString().slice(0, 7)}.csv`, lines.map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };
  bindHeader(shell);
}

function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
}

// ---------- System: the backend, made visible
const ENDPOINTS = [
  ['GET', '/api/health', 'public', 'Server status, AI coach on or off'],
  ['POST', '/api/sync', 'patient app', 'Patient device uploads its record (profile, sessions, scores, check-ins, coach chat)'],
  ['GET', '/api/inbox/:patientId', 'patient app', 'Patient device pulls PT messages, visits, plan edits, assigned program, library'],
  ['POST', '/api/messages/:patientId', 'patient app', 'Patient sends a message to the PT'],
  ['POST', '/api/coach', 'patient app', 'AI coach reply (Claude, server-side key)'],
  ['GET', '/api/clinician/patients', 'PT key', 'Caseload with alerts, compliance and RTM status'],
  ['GET', '/api/clinician/patients/:id', 'PT key', 'Full patient chart'],
  ['POST', '/api/clinician/patients/:id/:action', 'PT key', 'message, note, minutes, visit, review, change, plan, assign, read. Each is written to the audit log'],
  ['GET / POST', '/api/clinician/library', 'PT key', 'Custom programs, custom exercises, video links'],
  ['GET', '/api/clinician/system', 'PT key', 'This screen: record counts, storage, activity'],
  ['GET', '/api/clinician/export', 'PT key', 'Full data export (JSON)'],
  ['GET', '/api/daily', 'admin key', "Today's session email for every opted-in patient (n8n sends them)"],
  ['POST', '/api/squads, /api/squads/:code/join', 'patient app', 'Squads and leaderboards'],
  ['GET / POST', '/api/partners, /api/ref/hit', 'admin key', 'Partner codes and referral attribution'],
];

async function system(shell) {
  const sys = await backend.system();
  const patients = await backend.list();
  const saved = ss.get('tuned.rawid');
  const rawId = patients.some(p => p.id === saved) ? saved : patients[0]?.id || '';
  const appUrl = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : '';
  const k = sys.counts;
  const kb = n => n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  shell(`<section class="pt">${header('system', 'System')}
    <div class="card sys-status ${online ? 'ok' : ''}"><span class="dot"></span><div>
      <b>${online ? 'TUNED server connected' : 'On-device mode: no server connected'}</b>
      <p class="muted">${online ? `Data is stored on the server in <span class="mono">${h(sys.dataFile)}</span> (${kb(sys.bytes)}). Server running since ${when(sys.startedAt)} on Node ${h(sys.node)}. AI coach: ${sys.coach ? 'on, ' + h(sys.model) : 'off, rules coach answering'}.`
        : `This site is running as static files with no server behind it. Every record is in this browser's storage (${kb(sys.bytes)}) under four keys: <span class="mono">tuned.v1</span> (patient app), <span class="mono">tuned.clinic</span> (PT records), <span class="mono">tuned.library</span> (programs, exercises, videos) and <span class="mono">tuned.audit</span> (PT activity). Deploy the server (README, "Deploy") and these same screens switch to shared data across every device.`}</p></div>
    </div>
    <div class="card"><h3>How it fits together</h3>
      <div class="arch">
        <div class="node"><b>Patient app</b><span>Phone browser or home-screen app. The camera pose model runs on the phone; video never leaves it.</span></div>
        <div class="wire">${online ? 'HTTPS /api' : 'same browser'}</div>
        <div class="node core"><b>${online ? 'TUNED server' : 'On-device clinic'}</b><span>${online ? 'Node.js API, clinic logic, audit log' : 'Same clinic logic as the server, running in this browser'}</span></div>
        <div class="wire">${online ? 'read / write' : 'localStorage'}</div>
        <div class="node"><b>Data store</b><span>${online ? h(sys.storage) + '. Swap for Postgres (AWS RDS) for production.' : 'Browser storage on this device'}</span></div>
      </div>
      <div class="arch side"><div class="node"><b>PT dashboard</b><span>This screen. Same API, clinician key.</span></div><div class="node"><b>AI coach</b><span>${online && sys.coach ? 'Claude, through the server key' : 'Rules coach now; Claude when the server has a key'}</span></div><div class="node"><b>Daily email</b><span>n8n calls /api/daily each morning and sends through your email provider</span></div></div>
    </div>
    <div class="kpis">${Object.entries({ Patients: k.patients, Sessions: k.sessions, 'Body Scores': k.scores, 'Check-ins': k.checkins, 'Coach changes': k.coachChanges, Messages: k.messages, Notes: k.notes, 'Your programs': k.customPrograms, 'Your exercises': k.customExercises, Videos: k.videos }).map(([l, v]) => `<div class="kpi"><b>${v ?? 0}</b><span>${l}</span></div>`).join('')}</div>
    <div class="pt-grid">
      <div class="card"><h3>Live activity</h3><p class="fine">Patient events from their records and every PT action from the audit log, newest first.</p>
        <div class="feed">${sys.activity.map(a => `<div class="ev ${a.kind}"><span class="sub">${when(a.at)} · ${h(a.actor)}</span><p>${h(a.text)}</p></div>`).join('') || '<p class="muted">Nothing yet.</p>'}</div></div>
      <div class="card"><h3>Raw data</h3><p class="fine">The exact record stored for a patient: what the app wrote, plus what the clinic added.</p>
        <select id="rawsel" aria-label="Patient">${patients.map(p => `<option value="${h(p.id)}" ${p.id === rawId ? 'selected' : ''}>${h(p.name)}${p.demo ? ' (demo)' : ''}</option>`).join('')}</select>
        <pre class="json" id="raw">Loading</pre>
        <div class="row gap wrap"><button class="btn primary sm" id="export">Download full export (JSON)</button></div></div>
    </div>
    <div class="card"><h3>Daily email preview</h3><p class="fine">What <span id="emname">this patient</span> gets tomorrow morning, built by the same code the server serves at <span class="mono">/api/daily</span>.</p>
      <div class="email-frame" id="email"></div>
      <details><summary class="fine">How sending works (n8n)</summary><ol class="list fine"><li>Deploy the server and set <span class="mono">ADMIN_KEY</span> and <span class="mono">APP_URL</span>.</li><li>In n8n, import <span class="mono">tuned/n8n/daily-session-email.json</span>.</li><li>Put the server URL and admin key in the HTTP Request node, and your email credentials in the Send Email node.</li><li>It runs at 6:30 AM, pulls one email for each opted-in patient who has not trained yet today, and sends them.</li></ol></details>
    </div>
    <div class="card"><h3>API endpoints</h3><div class="table-wrap flat"><table class="tbl"><thead><tr><th>Method</th><th>Path</th><th>Who</th><th>What</th></tr></thead><tbody>
      ${ENDPOINTS.map(([m, p, w, d]) => `<tr><td class="mono">${m}</td><td class="mono">${h(p)}</td><td>${w}</td><td>${h(d)}</td></tr>`).join('')}</tbody></table></div>
      <p class="fine">Source: <span class="mono">tuned/server.js</span> (API), <span class="mono">public/js/clinic.js</span> (clinic logic, shared by server and device), <span class="mono">public/js/engine.js</span> (progression), <span class="mono">public/js/rtm.js</span> (billing), <span class="mono">public/js/email.js</span> (daily email).</p></div>
  </section>`, { nav: false, wide: true });
  bindHeader(shell);
  const showRaw = async id => {
    if (!id) return;
    ss.set('tuned.rawid', id);
    try {
      const r = await backend.get(id);
      const { coach, ...rest } = r.user;
      document.getElementById('raw').textContent = JSON.stringify({ patient: { ...rest, coach: `${(coach || []).length} messages (shown in the chart)` }, clinical: r.clinical }, null, 2);
      const em = dailyEmail(r.user, r.clinical, appUrl);
      document.getElementById('emname').textContent = r.user.profile?.name || 'this patient';
      document.getElementById('email').innerHTML = em ? `<p class="sub">To: ${h(em.to || '(no email on file)')} · Subject: <b>${h(em.subject)}</b></p><div class="email-body">${em.html.replace(/^[\s\S]*?<body[^>]*>|<\/body>[\s\S]*$/g, '')}</div>` : '<p class="muted">No session to send (program complete or not started).</p>';
    } catch (e) { document.getElementById('raw').textContent = e.message; }
  };
  showRaw(rawId);
  document.getElementById('rawsel').onchange = e => showRaw(e.target.value);
  document.getElementById('export').onclick = async () => { try { download(`tuned-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await backend.exportAll(), null, 2), 'application/json'); } catch (e) { toast(e.message); } };
}
