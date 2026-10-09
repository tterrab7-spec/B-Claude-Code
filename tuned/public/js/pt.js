// Clinician dashboard: caseload triage, plan editing, AI change review, notes,
// RTM billing, visits. Runs against the server, or an on-device demo clinic when
// no server is connected.
import { api, health } from './api.js';
import { get as getState, save as saveState } from './store.js';
import { EXERCISES, SPRINTS, exName, doseText } from './data.js';
import { RTM_CODES } from './rtm.js';
import { CONFIG } from './config.js';
import { sessionPlan } from './engine.js';
import { summary, applyAction, triageRank, newClinical, effectiveMods } from './clinic.js';
import { demoCaseload } from './demo.js';
import { toast, ICON, route, go } from './app.js';

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ss = { get: k => { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: k => { try { sessionStorage.removeItem(k); } catch (e) {} } };
const ago = iso => { if (!iso) return 'never'; const d = Math.floor((Date.now() - new Date(iso)) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + 'd ago'; };
const ptName = () => ss.get('tuned.ptname') || 'Your PT';
const money = n => '$' + Math.round(n).toLocaleString();

// ---------- Backends
const remote = {
  hdr: () => ({ 'x-clinician-key': ss.get('tuned.ptkey') }),
  async list() { return (await api.get('clinician/patients', this.hdr())).patients; },
  async get(id) { return api.get('clinician/patients/' + encodeURIComponent(id), this.hdr()); },
  async act(id, action, body) { return api.post(`clinician/patients/${encodeURIComponent(id)}/${action}`, { ...body, by: ptName() }, this.hdr()); },
};

const LS = 'tuned.clinic';
const local = {
  store() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } },
  put(all) { try { localStorage.setItem(LS, JSON.stringify(all)); } catch (e) {} },
  records() {
    const all = this.store();
    const list = demoCaseload();
    const me = getState();
    if (me.profile && !online) list.unshift({ user: me, clinical: {} });
    return list.map(({ user, clinical }) => ({ u: user, c: { ...newClinical(), ...clinical, ...all[user.id] } }));
  },
  async list() { return this.records().map(r => summary(r.u, r.c)).sort((a, b) => triageRank(a) - triageRank(b) || (b.lastSession || '').localeCompare(a.lastSession || '')); },
  async get(id) { const r = this.records().find(x => x.u.id === id); if (!r) throw new Error('No such patient'); return { user: r.u, clinical: r.c, summary: summary(r.u, r.c) }; },
  async act(id, action, body) {
    const r = this.records().find(x => x.u.id === id); if (!r) throw new Error('No such patient');
    const err = applyAction(r.u, r.c, action, { ...body, by: ptName() });
    if (err) throw new Error(err);
    const all = this.store(); all[id] = r.c; this.put(all);
    if (id === getState().id && action === 'review') saveState(s => { if (s.profile) { s.profile.urgentFlag = null; s.profile.needsReview = false; } });
    return { ok: true };
  },
};

let backend = local, online = false;

// Server mode with optional demo patients mixed in (demo ids route to the local clinic).
const demoOn = () => ss.get('tuned.ptdemo') === '1';
const mixed = {
  async list() {
    const real = await remote.list();
    if (!demoOn()) return real;
    const demo = (await local.list()).filter(p => p.demo);
    return [...real, ...demo].sort((a, b) => triageRank(a) - triageRank(b) || (b.lastSession || '').localeCompare(a.lastSession || ''));
  },
  get: id => (id.startsWith('demo_') ? local : remote).get(id),
  act: (id, a, b) => (id.startsWith('demo_') ? local : remote).act(id, a, b),
};

export async function viewPT(shell) {
  online = !!(await health());
  backend = online ? mixed : local;
  if (online && !ss.get('tuned.ptkey')) return login(shell);
  if (!online && !ss.get('tuned.ptname')) ss.set('tuned.ptname', 'Demo PT');
  const [, , id] = route().split('/');
  try {
    if (id === 'billing') await billing(shell);
    else if (id) await detail(shell, id);
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

const demoBanner = () => online ? '' : `<div class="note">${ICON.pt}<div><b>Demo clinic.</b> Six sample patients plus anyone who used the patient app on this device. Your actions are saved on this device and reach this device's patient screens. Connect the TUNED server to see real patients across devices.</div></div>`;

function header(active) {
  return `<div class="row between wrap"><div><p class="eyebrow">Clinician · ${h(ptName())}</p><h1 class="h2">${active === 'billing' ? 'RTM billing' : 'Caseload'}</h1></div>
    <div class="row gap wrap"><a class="btn ${active === 'caseload' ? 'primary' : 'ghost'} sm" href="#/pt">Caseload</a><a class="btn ${active === 'billing' ? 'primary' : 'ghost'} sm" href="#/pt/billing">Billing</a>
    ${online ? `<button class="btn ghost sm" id="ptdemo">${demoOn() ? 'Hide' : 'Show'} demo patients</button>` : ''}
    <button class="btn ghost sm" id="ptname">${online ? 'Sign out' : 'Set my name'}</button></div></div>`;
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
    rtm: patients.reduce((a, p) => a + p.rtm.codes.reduce((x, c) => x + (CONFIG.rtmRates[c] || 0), 0), 0),
  };
  const filter = ss.get('tuned.ptfilter') || 'all';
  const shown = patients.filter(p => filter === 'all' || (filter === 'alerts' ? p.alerts.some(a => a.level !== 'info') : filter === 'review' ? p.pendingChanges : true));
  shell(`<section class="pt">
    ${header('caseload')}${demoBanner()}
    <div class="kpis">
      <div class="kpi ${totals.urgent ? 'hot' : ''}"><b>${totals.urgent}</b><span>Urgent</span></div>
      <div class="kpi"><b>${totals.open}</b><span>Open alerts</span></div>
      <div class="kpi"><b>${totals.review}</b><span>Coach changes to review</span></div>
      <div class="kpi"><b>${totals.active}/${patients.length}</b><span>Active this week</span></div>
      <div class="kpi"><b>${money(totals.rtm)}</b><span>RTM billable now (est.)</span></div>
    </div>
    <div class="seg filters">${[['all', 'All patients'], ['alerts', 'Needs attention'], ['review', 'Changes to review']].map(([v, l]) => `<label><input type="radio" name="f" value="${v}" ${filter === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    ${shown.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Patient</th><th>Program</th><th>Progress</th><th>Pain</th><th>Body Score</th><th>RTM period</th><th>Alerts</th></tr></thead><tbody>
    ${shown.map(p => `<tr data-id="${h(p.id)}">
      <td><b>${h(p.name)}</b>${p.demo ? ' <span class="tag">demo</span>' : p.id === getState().id ? ' <span class="tag">this device</span>' : ''}<span class="sub">${h(p.age)} · ${h(p.state)}${p.quiet ? ' · Quiet Mode' : ''}${p.ref ? ' · via ' + h(p.ref) : ''}</span></td>
      <td>${h(p.program || '–')}<span class="sub">${h(p.plan)}</span></td>
      <td>Wk ${p.week ?? '–'} · ${p.sessions}/24<span class="sub">last ${ago(p.lastSession)}</span></td>
      <td>${p.painBaseline ?? '–'} → <b>${p.painLatest ?? '–'}</b></td>
      <td>${p.scoreFirst ?? '–'} → <b>${p.scoreLatest ?? '–'}</b></td>
      <td>${p.rtm.days} day${p.rtm.days === 1 ? "" : "s"} · ${p.rtm.minutes} min<span class="sub">${p.rtm.codes.join(', ') || 'none yet'}</span></td>
      <td>${p.alerts.map(a => `<span class="alert ${a.level}">${h(a.text)}</span>`).join('') || '<span class="sub">On track</span>'}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card"><p>${patients.length ? 'Nobody matches this filter.' : 'No patients yet. Patients appear here as soon as they finish intake on a device connected to this server.'}</p></div>`}
  </section>`, { nav: false, wide: true });
  document.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => go('#/pt/' + tr.dataset.id));
  document.querySelectorAll('input[name=f]').forEach(r => r.onchange = () => { ss.set('tuned.ptfilter', r.value); caseload(shell); });
  bindHeader(shell);
}

// ---------- Billing
async function billing(shell) {
  const patients = await backend.list();
  const R = CONFIG.rtmRates;
  const rows = patients.map(p => ({ p, amt: p.rtm.codes.reduce((a, c) => a + (R[c] || 0), 0) }));
  const total = rows.reduce((a, r) => a + r.amt, 0);
  const near = patients.filter(p => p.rtm.days >= 10 && p.rtm.days < 16);
  shell(`<section class="pt">
    ${header('billing')}${demoBanner()}
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
    const csv = lines.map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `tuned-rtm-${new Date().toISOString().slice(0, 7)}.csv`; a.click();
  };
  bindHeader(shell);
}

function nextBilling(p) {
  const r = p.rtm;
  if (r.days < 2) return 'Needs 2+ data days for 98985';
  if (r.days < 16) return `${16 - r.days} more data days for 98977`;
  if (!r.interactive) return 'Log a live call or video to bill management';
  if (r.minutes < 20) return `${20 - r.minutes} more minutes for 98980`;
  return 'Fully billable this period';
}

// ---------- Patient detail
async function detail(shell, id) {
  const { user: u, clinical: c, summary: s } = await backend.get(id);
  const sp = u.sprint || { sessions: [], changes: [], mods: {} };
  const verb = { regress: 'Regressed', progress: 'Progressed', add: 'Added volume', reduce: 'Reduced volume' };
  const pending = (u.visits || []).filter(v => v.status === 'requested' && !c.visits.some(cv => cv.requestId === v.id));
  const scores = u.scores || [];
  const mods = effectiveMods(u, c);
  const planSp = { ...sp, mods };
  const plan = sp.id ? sessionPlan(planSp, Math.min(sp.sessions.length, 23)) : null;
  const other = plan ? sessionPlan(planSp, Math.min(sp.sessions.length + 1, 23)) : null;
  const planItems = plan ? [...plan.items, ...other.items.filter(i => !plan.items.some(x => x.base === i.base))] : [];
  const pains = sp.sessions.map(x => x.pain);
  shell(`<section class="pt">
    <a href="#/pt" class="back">${ICON.back} Caseload</a>
    <div class="row between wrap"><div><p class="eyebrow">${h(s.program)} · Week ${s.week} · ${s.sessions}/24 sessions${u.demo ? ' · demo patient' : ''}</p>
      <h1 class="h2">${h(u.profile.name)}, ${h(u.profile.age)} · ${h(u.profile.state)}</h1>
      <p class="muted">Goal: ${h(u.profile.goal || '–')} · Joined ${ago(u.profile.joined)} · Plan ${h(u.plan)}${u.ref ? ' · Referred by ' + h(u.ref) : ''}${u.quiet ? ' · Quiet Mode' : ''}</p></div></div>
    ${s.alerts.length ? `<div class="alerts">${s.alerts.map(a => `<span class="alert ${a.level}">${h(a.text)}</span>`).join('')}</div>` : ''}
    <div class="pt-grid">
      <div class="card"><h3>Intake and safety</h3>
        <p>Pain baseline <b>${u.profile.painBaseline}/10</b>. Safety flags: ${u.profile.flags?.length ? u.profile.flags.map(h).join(', ') : 'none'}.${u.profile.outOfState ? ` <b>Out of your license states.</b>` : ''}</p>
        ${u.profile.urgentFlag ? `<p class="alert urgent">Coach flagged urgent symptoms ${ago(u.profile.urgentFlag)}. Contact the patient.</p>` : ''}
        ${c.reviewed ? `<p class="muted">Reviewed by ${h(c.reviewed.by)} ${ago(c.reviewed.at)}${c.reviewed.note ? ': ' + h(c.reviewed.note) : ''}</p>` : ''}
        <form id="review" class="form"><input name="note" placeholder="${c.reviewed ? 'Add a review note' : 'Review note (optional)'}"><button class="btn ${c.reviewed ? 'ghost' : 'primary'} sm">${c.reviewed ? 'Re-review and clear alerts' : 'Mark reviewed and cleared'}</button></form>
      </div>
      <div class="card"><h3>Trends</h3>
        <p class="sub">Pain per session (0-10)</p><div class="spark">${pains.map(v => `<i style="height:${v * 10}%;${v >= 7 ? 'background:var(--bad)' : ''}" title="${v}"></i>`).join('') || '<span class="muted">No sessions</span>'}</div>
        <p class="sub" style="margin-top:12px">Body Score</p>${scores.length ? `<div class="spark">${scores.map(x => `<i style="height:${((x.total - 300) / 550) * 100}%" title="${x.at.slice(0, 10)}: ${x.total}"></i>`).join('')}</div>
        <p>${scores[0].total} → <b>${scores.at(-1).total}</b> over ${scores.length} screens. Latest: ${Object.entries(scores.at(-1).parts).map(([k, v]) => `${k} ${v ?? '–'}`).join(' · ')} (${scores.at(-1).method})</p>` : '<p class="muted">No screens yet.</p>'}
        ${u.pads?.length ? `<p class="sub">Pads per day</p><p>${u.pads.map(p => p.count).join(' → ')}</p>` : ''}
      </div>
      <div class="card"><h3>RTM · ${s.rtm.periodStart} to ${s.rtm.periodEnd}</h3>
        <div class="kpis small"><div class="kpi"><b>${s.rtm.days}</b><span>data days</span></div><div class="kpi"><b>${s.rtm.minutes}</b><span>mgmt min (month)</span></div></div>
        <p>${s.rtm.codes.length ? s.rtm.codes.map(cd => `<span class="tag" title="${h(RTM_CODES[cd])}">${cd}</span>`).join(' ') : 'No codes met yet.'}</p>
        <p class="fine">${h(nextBilling(s))}.</p>
        <form id="mins" class="form"><div class="row gap wrap"><input name="minutes" type="number" min="1" max="120" placeholder="Minutes" required style="max-width:110px"><label class="check"><input type="checkbox" name="interactive"><span>Live call or video</span></label></div><input name="note" placeholder="What you did (reviewed data, adjusted plan, called patient)"><button class="btn ghost sm">Log time</button></form>
        ${c.minutes.length ? `<p class="fine">${c.minutes.slice(-4).reverse().map(m => `${ago(m.at)}: ${m.minutes} min${m.interactive ? ' live' : ''}${m.note ? ' · ' + h(m.note) : ''}`).join('<br>')}</p>` : ''}
      </div>
      <div class="card"><h3>Video visits</h3>
        ${pending.map(v => `<p><span class="alert medium">Requested ${ago(v.requested)}</span></p>`).join('')}
        ${c.visits.map(v => `<p>${new Date(v.when).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · <a href="${h(v.link)}" target="_blank" rel="noopener">Join link</a></p>`).join('') || '<p class="muted">None scheduled.</p>'}
        <form id="visit" class="form row gap wrap"><input type="datetime-local" name="when" required><button class="btn primary sm">Schedule</button></form>
        <p class="fine">Pilot links use Jitsi Meet. Use a BAA-covered video vendor before treating real patients.</p>
      </div>
    </div>

    ${plan ? `<div class="card"><div class="row between wrap"><h3>Plan · week ${plan.week}, ${h(plan.phase)}</h3><span class="sub">Edits apply to this phase's sessions on the patient's next sync</span></div>
      <div class="table-wrap flat"><table class="tbl plan-ed"><thead><tr><th>Exercise</th><th>Current dose</th><th>Swap to</th><th>Sets ±</th><th>Reps/secs ±</th><th></th></tr></thead><tbody>
      ${planItems.map(i => { const m = mods[i.base] || {}; const opts = Object.entries(EXERCISES).filter(([k, e]) => e.region === EXERCISES[i.base].region || k === i.base || k === i.id);
        return `<tr data-base="${h(i.base)}"><td><b>${h(exName(i.id))}</b>${i.id !== i.base ? `<span class="sub">base: ${h(exName(i.base))}</span>` : ''}</td><td class="mono">${doseText(i.ex, m)}</td>
          <td><select name="swap">${opts.map(([k, e]) => `<option value="${k}" ${k === i.id ? 'selected' : ''}>${h(e.name)}</option>`).join('')}</select></td>
          <td><input name="sets" type="number" min="-5" max="5" value="${m.sets || 0}" style="max-width:70px"></td>
          <td><input name="${i.ex.secs ? 'secs' : 'reps'}" type="number" min="-20" max="30" value="${(i.ex.secs ? m.secs : m.reps) || 0}" style="max-width:80px"></td>
          <td><button class="btn ghost sm" data-save>Save</button></td></tr>`; }).join('')}
      </tbody></table></div>
      ${c.overrides.length ? `<p class="fine">PT changes: ${c.overrides.slice(-5).reverse().map(o => `${ago(o.at)} ${h(o.why || 'edit')}: ${h(exName(o.base))}${o.mod.swap ? ' → ' + h(exName(o.mod.swap)) : ''}`).join(' · ')}</p>` : ''}
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
          <textarea name="text" rows="4" required placeholder="S: ...&#10;O: ...&#10;A: ...&#10;P: ..."></textarea>
          <div class="row gap wrap"><button class="btn primary sm">Save note</button><button type="button" class="btn ghost sm" id="draft">Draft from data</button></div></form>
      </div>
      <div class="card"><h3>Message ${h(u.profile.name.split(' ')[0])}</h3>${c.messages.slice(-3).map(m => `<p class="muted">${h(m.from)} ${ago(m.at)}: ${h(m.text)}</p>`).join('')}
        <form id="msg" class="form"><textarea name="text" rows="2" required placeholder="Shows on his Today screen"></textarea><button class="btn primary sm">Send</button></form>
        <h3 style="margin-top:16px">Coach conversation</h3><div class="transcript">${(u.coach || []).slice(-30).map(m => `<p class="${m.role}"><b>${m.role === 'me' ? h(u.profile.name.split(' ')[0]) : 'Coach' + (m.source === 'ai' ? ' (AI)' : '')}:</b> ${h(m.text)}</p>`).join('') || '<p class="muted">No messages.</p>'}</div>
      </div>
    </div>
    <div class="card"><h3>Session log</h3>${sp.sessions.length ? `<div class="table-wrap flat"><table class="tbl"><thead><tr><th>#</th><th>Date</th><th>Pain</th><th>Effort</th><th>Note</th></tr></thead><tbody>${sp.sessions.map((x, i) => `<tr><td>${i + 1}</td><td>${x.at.slice(0, 10)}</td><td>${x.pain}</td><td>${x.effort}${x.minimal ? ' (10-min)' : ''}</td><td>${h(x.note)}</td></tr>`).reverse().join('')}</tbody></table></div>` : '<p class="muted">No sessions yet.</p>'}
      ${u.formChecks?.length ? `<p>Form checks: ${u.formChecks.slice(-5).map(f => `${h(exName(f.ex))} ${f.reps} reps${f.cues.length ? ' (' + h(f.cues[0]) + ')' : ', clean'}`).join(' · ')}</p>` : ''}
    </div>
  </section>`, { nav: false, wide: true });

  const post = async (action, body, msg = 'Saved') => { try { await backend.act(id, action, body); toast(msg); detail(shell, id); } catch (e) { toast(e.message); } };
  const form = (sel, fn) => { const f = document.querySelector(sel); if (f) f.onsubmit = e => { e.preventDefault(); fn(new FormData(f)); }; };
  form('#review', fd => post('review', { note: fd.get('note') }, 'Marked reviewed'));
  form('#mins', fd => post('minutes', { minutes: +fd.get('minutes'), interactive: !!fd.get('interactive'), note: fd.get('note') }, 'Time logged'));
  form('#visit', fd => post('visit', { when: fd.get('when'), requestId: pending[0]?.id }, 'Visit scheduled'));
  form('#msg', fd => post('message', { text: fd.get('text') }, 'Message sent'));
  form('#note', fd => post('note', { text: fd.get('text'), kind: fd.get('kind') }, 'Note saved'));
  document.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => post('change', { index: +b.dataset.ch, status: b.dataset.st }, b.dataset.st === 'reverted' ? 'Reverted' : 'Approved'));
  document.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
    const tr = b.closest('tr'); const val = n => tr.querySelector(`[name=${n}]`)?.value;
    post('plan', { base: tr.dataset.base, swap: val('swap'), sets: val('sets'), reps: val('reps'), secs: val('secs') }, 'Plan updated');
  });
  const all = document.getElementById('approve-all');
  if (all) all.onclick = async () => {
    for (const [i] of sp.changes.entries()) if (!c.changeStatus[i]) { try { await backend.act(id, 'change', { index: i, status: 'approved' }); } catch (e) { return toast(e.message); } }
    toast('All approved'); detail(shell, id);
  };
  document.getElementById('draft').onclick = () => {
    const ta = document.querySelector('#note textarea');
    const last = sp.sessions.at(-1);
    ta.value = `S: ${u.profile.goal ? 'Goal: ' + u.profile.goal + '. ' : ''}Pain ${u.profile.painBaseline}/10 at intake, ${last ? last.pain + '/10 at last session' : 'no sessions yet'}.${(u.coach || []).filter(m => m.role === 'me').slice(-1).map(m => ' Reports: "' + m.text + '"').join('')}
O: ${s.sessions}/24 sessions over ${s.week} weeks. Body Score ${s.scoreFirst ?? '–'} → ${s.scoreLatest ?? '–'}.${scores.length ? ' Latest ' + Object.entries(scores.at(-1).parts).map(([k, v]) => k + ' ' + (v ?? '–')).join(', ') + '.' : ''}${u.pads?.length ? ' Pads/day ' + u.pads[0].count + ' → ' + u.pads.at(-1).count + '.' : ''} RTM: ${s.rtm.days} data days this period.
A: ${pains.length > 1 && pains.at(-1) < pains[0] ? 'Improving.' : pains.length > 1 && pains.at(-1) > pains[0] ? 'Symptoms up since start, monitor.' : 'Early in plan.'} ${s.risk.level === 'high' ? 'Adherence risk: ' + s.risk.reason + '.' : ''}
P: Continue ${SPRINTS[sp.id]?.title || 'program'}, ${plan ? 'phase "' + plan.phase + '"' : ''}. `;
    ta.focus();
  };
}
