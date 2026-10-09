// Clinician dashboard: caseload triage, AI change review, RTM billing readiness, visits.
import { api, health } from './api.js';
import { get as getState } from './store.js';
import { exName, SPRINTS } from './data.js';
import { RTM_CODES, rtmStatus } from './rtm.js';
import { toast, ICON } from './app.js';

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'tuned.ptkey';
const key = () => { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
const hdr = () => ({ 'x-clinician-key': key() });
const ago = iso => { if (!iso) return 'never'; const d = Math.floor((Date.now() - new Date(iso)) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + 'd ago'; };

export async function viewPT(shell) {
  const online = await health();
  if (!online) {
    return shell(`<section class="narrow"><p class="eyebrow">Clinician</p><h1 class="h2">PT dashboard</h1>
      <p>The clinician dashboard needs the TUNED server running, because it reads every patient's data. Start it with <span class="mono">npm start</span> and open the app from that address.</p>
      ${getState().profile ? `<p class="muted">Preview with this device's patient below.</p>${localPreview()}` : ''}</section>`, { nav: false, wide: true });
  }
  if (!key()) return login(shell);
  const [, , id] = location.hash.split('/');
  try { id ? await detail(shell, id) : await caseload(shell); }
  catch (e) { if (/key/i.test(e.message)) { try { sessionStorage.removeItem(KEY); } catch (er) {} return login(shell, e.message); } shell(`<section class="narrow"><p>${h(e.message)}</p></section>`, { nav: false }); }
}

function login(shell, err = '') {
  shell(`<section class="narrow"><p class="eyebrow">Clinician</p><h1 class="h2">PT sign in</h1>
    <form id="ptlogin" class="card form"><label>Clinician key<input type="password" name="k" required autocomplete="current-password"></label>
    <label>Your name (shown to patients)<input name="n" placeholder="Dr. Jordan Reed, PT, DPT" maxlength="40"></label>
    ${err ? `<p class="err">${h(err)}</p>` : ''}<button class="btn primary full">Sign in</button></form></section>`, { nav: false });
  document.getElementById('ptlogin').onsubmit = e => {
    e.preventDefault(); const fd = new FormData(e.target);
    try { sessionStorage.setItem(KEY, fd.get('k')); sessionStorage.setItem('tuned.ptname', fd.get('n') || 'Your PT'); } catch (er) {}
    viewPT(shell);
  };
}

const ptName = () => { try { return sessionStorage.getItem('tuned.ptname') || 'Your PT'; } catch (e) { return 'Your PT'; } };

async function caseload(shell) {
  const { patients } = await api.get('clinician/patients', hdr());
  const totals = patients.reduce((a, p) => { a.alerts += p.alerts.filter(x => x.level !== 'info').length; a.supply += p.rtm.codes.some(c => c === '98977' || c === '98985') ? 1 : 0; a.active += p.lastSession && Date.now() - new Date(p.lastSession) < 7 * 86400000 ? 1 : 0; return a; }, { alerts: 0, supply: 0, active: 0 });
  shell(`<section class="pt">
    <div class="row between wrap"><div><p class="eyebrow">Clinician · ${h(ptName())}</p><h1 class="h2">Caseload</h1></div>
      <div class="row gap"><a class="btn ghost sm" href="#/partners">Partners</a><button class="btn ghost sm" id="out">Sign out</button></div></div>
    <div class="kpis">
      <div class="kpi"><b>${patients.length}</b><span>Patients</span></div>
      <div class="kpi"><b>${totals.active}</b><span>Active this week</span></div>
      <div class="kpi ${totals.alerts ? 'hot' : ''}"><b>${totals.alerts}</b><span>Open alerts</span></div>
      <div class="kpi"><b>${totals.supply}</b><span>RTM supply billable</span></div>
    </div>
    ${patients.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Patient</th><th>Program</th><th>Progress</th><th>Pain</th><th>Body Score</th><th>RTM this period</th><th>Alerts</th></tr></thead><tbody>
    ${patients.map(p => `<tr data-id="${h(p.id)}">
      <td><b>${h(p.name)}</b><span class="sub">${h(p.age)} · ${h(p.state)}${p.quiet ? ' · Quiet' : ''}${p.ref ? ' · via ' + h(p.ref) : ''}</span></td>
      <td>${h(p.program || '–')}<span class="sub">${h(p.plan)}</span></td>
      <td>Wk ${p.week ?? '–'} · ${p.sessions}/24<span class="sub">last ${ago(p.lastSession)}</span></td>
      <td>${p.painBaseline ?? '–'} → <b>${p.painLatest ?? '–'}</b></td>
      <td>${p.scoreFirst ?? '–'} → <b>${p.scoreLatest ?? '–'}</b></td>
      <td>${p.rtm.days} days · ${p.rtm.minutes} min<span class="sub">${p.rtm.codes.join(', ') || 'none yet'}</span></td>
      <td>${p.alerts.map(a => `<span class="alert ${a.level}">${h(a.text)}</span>`).join('') || '<span class="sub">–</span>'}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card"><p>No patients yet. Patients appear here as soon as they finish intake on a device connected to this server.</p></div>`}
  </section>`, { nav: false, wide: true });
  document.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { location.hash = '#/pt/' + tr.dataset.id; });
  document.getElementById('out').onclick = () => { try { sessionStorage.removeItem(KEY); } catch (e) {} viewPT(shell); };
}

async function detail(shell, id) {
  const { user: u, clinical: c, summary: s } = await api.get('clinician/patients/' + encodeURIComponent(id), hdr());
  const sp = u.sprint || { sessions: [], changes: [] };
  const verb = { regress: 'Regressed', progress: 'Progressed', add: 'Added volume', reduce: 'Reduced volume' };
  const pending = (u.visits || []).filter(v => v.status === 'requested' && !c.visits.some(cv => cv.requestId === v.id));
  const scores = u.scores || [];
  shell(`<section class="pt">
    <a href="#/pt" class="back">${ICON.back} Caseload</a>
    <div class="row between wrap"><div><p class="eyebrow">${h(s.program)} · Week ${s.week} · ${s.sessions}/24 sessions</p>
      <h1 class="h2">${h(u.profile.name)}, ${h(u.profile.age)} · ${h(u.profile.state)}</h1>
      <p class="muted">Goal: ${h(u.profile.goal || '–')} · Joined ${ago(u.profile.joined)} · Plan ${h(u.plan)}${u.ref ? ' · Referred by ' + h(u.ref) : ''}</p></div></div>
    ${s.alerts.length ? `<div class="alerts">${s.alerts.map(a => `<span class="alert ${a.level}">${h(a.text)}</span>`).join('')}</div>` : ''}
    <div class="pt-grid">
      <div class="card"><h3>Intake</h3>
        <p>Pain baseline <b>${u.profile.painBaseline}/10</b>. Safety flags: ${u.profile.flags?.length ? u.profile.flags.map(h).join(', ') : 'none'}.</p>
        ${c.reviewed ? `<p class="muted">Reviewed by ${h(c.reviewed.by)} ${ago(c.reviewed.at)}${c.reviewed.note ? ': ' + h(c.reviewed.note) : ''}</p>` : `<form id="review" class="form"><input name="note" placeholder="Review note (optional)"><button class="btn primary sm">Mark intake reviewed and cleared</button></form>`}
      </div>
      <div class="card"><h3>RTM · period ${s.rtm.periodStart} to ${s.rtm.periodEnd}</h3>
        <div class="kpis small"><div class="kpi"><b>${s.rtm.days}</b><span>data days</span></div><div class="kpi"><b>${s.rtm.minutes}</b><span>mgmt min (month)</span></div></div>
        <p>${s.rtm.codes.length ? s.rtm.codes.map(cd => `<span class="tag" title="${h(RTM_CODES[cd])}">${cd}</span>`).join(' ') : 'No codes met yet.'}</p>
        <p class="fine">${s.rtm.toSupply16 ? `${s.rtm.toSupply16} more data days for 98977. ` : ''}${s.rtm.interactive ? '' : 'Management codes need at least one interactive communication logged. '}Confirm payer rules before billing.</p>
        <form id="mins" class="form row gap wrap"><input name="minutes" type="number" min="1" max="120" placeholder="Minutes" required style="max-width:110px"><label class="check"><input type="checkbox" name="interactive"><span>Live call or video</span></label><input name="note" placeholder="What you did" style="flex:1;min-width:160px"><button class="btn ghost sm">Log time</button></form>
      </div>
      <div class="card"><h3>Body Score</h3>
        ${scores.length ? `<div class="spark tall">${scores.map(x => `<i style="height:${((x.total - 300) / 550) * 100}%" title="${x.at.slice(0, 10)}: ${x.total}"></i>`).join('')}</div>
        <p>${scores[0].total} → <b>${scores.at(-1).total}</b> over ${scores.length} screens. Latest: ${Object.entries(scores.at(-1).parts).map(([k, v]) => `${k} ${v ?? '–'}`).join(' · ')} (${scores.at(-1).method})</p>` : '<p class="muted">No screens yet.</p>'}
      </div>
      <div class="card"><h3>Video visits</h3>
        ${pending.map(v => `<p><span class="alert medium">Requested ${ago(v.requested)}</span></p>`).join('')}
        ${c.visits.map(v => `<p>${new Date(v.when).toLocaleString()} · <a href="${h(v.link)}" target="_blank" rel="noopener">Join link</a></p>`).join('') || '<p class="muted">None scheduled.</p>'}
        <form id="visit" class="form row gap wrap"><input type="datetime-local" name="when" required><button class="btn primary sm">Schedule</button></form>
        <p class="fine">Links use Jitsi Meet for the pilot. Swap in a BAA-covered video vendor before treating real patients.</p>
      </div>
    </div>
    <div class="card"><h3>AI coach changes · review queue</h3>
      ${sp.changes.length ? `<table class="tbl"><thead><tr><th>When</th><th>Change</th><th>Why</th><th></th></tr></thead><tbody>${sp.changes.map((ch, i) => ({ ch, i })).reverse().map(({ ch, i }) => {
        const st = c.changeStatus[i];
        return `<tr><td>${ago(ch.at)}<span class="sub">session ${ch.session + 1}</span></td><td>${verb[ch.type]}: ${h(exName(ch.from))}${ch.to !== ch.from ? ' → ' + h(exName(ch.to)) : ''}</td><td>${ch.flare ? 'Pain flare' : ch.via === 'coach' ? 'Coach chat' : 'Two easy sessions'}</td>
          <td>${st ? `<span class="tag">${st.status}</span>` : `<button class="btn ghost sm" data-ch="${i}" data-st="approved">Approve</button> <button class="btn ghost sm" data-ch="${i}" data-st="reverted">Revert</button>`}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">No automatic changes yet.</p>'}
    </div>
    <div class="pt-grid">
      <div class="card"><h3>Session log</h3>${sp.sessions.length ? `<table class="tbl"><thead><tr><th>#</th><th>Date</th><th>Pain</th><th>Effort</th><th>Note</th></tr></thead><tbody>${sp.sessions.map((x, i) => `<tr><td>${i + 1}</td><td>${x.at.slice(0, 10)}</td><td>${x.pain}</td><td>${x.effort}${x.minimal ? ' (10-min)' : ''}</td><td>${h(x.note)}</td></tr>`).reverse().join('')}</tbody></table>` : '<p class="muted">No sessions yet.</p>'}
        ${u.pads?.length ? `<p>Daily log: ${u.pads.map(p => p.count).join(' → ')}</p>` : ''}
        ${u.formChecks?.length ? `<p>Form checks: ${u.formChecks.slice(-5).map(f => `${h(exName(f.ex))} ${f.reps} reps${f.cues.length ? ' (' + f.cues.length + ' cues)' : ''}`).join(' · ')}</p>` : ''}
      </div>
      <div class="card"><h3>Coach conversation</h3><div class="transcript">${(u.coach || []).slice(-30).map(m => `<p class="${m.role}"><b>${m.role === 'me' ? h(u.profile.name) : 'Coach' + (m.source === 'ai' ? ' (AI)' : '')}:</b> ${h(m.text)}</p>`).join('') || '<p class="muted">No messages.</p>'}</div>
        <h3>Message ${h(u.profile.name)}</h3>${c.messages.slice(-3).map(m => `<p class="muted">${h(m.from)} ${ago(m.at)}: ${h(m.text)}</p>`).join('')}
        <form id="msg" class="form"><textarea name="text" rows="2" required placeholder="Shows on his Today screen"></textarea><button class="btn primary sm">Send</button></form></div>
    </div>
  </section>`, { nav: false, wide: true });
  const post = async (action, body) => { try { await api.post(`clinician/patients/${encodeURIComponent(id)}/${action}`, { ...body, by: ptName() }, hdr()); toast('Saved'); detail(shell, id); } catch (e) { toast(e.message); } };
  const form = (sel, fn) => { const f = document.querySelector(sel); if (f) f.onsubmit = e => { e.preventDefault(); fn(new FormData(f)); }; };
  form('#review', fd => post('review', { note: fd.get('note') }));
  form('#mins', fd => post('minutes', { minutes: +fd.get('minutes'), interactive: !!fd.get('interactive'), note: fd.get('note') }));
  form('#visit', fd => post('visit', { when: fd.get('when'), requestId: pending[0]?.id }));
  form('#msg', fd => post('message', { text: fd.get('text') }));
  document.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => post('change', { index: +b.dataset.ch, status: b.dataset.st }));
}

function localPreview() {
  const u = getState();
  const r = rtmStatus(u, []);
  const sp = u.sprint;
  return `<div class="card"><h3>${h(u.profile.name)} · ${h(SPRINTS[sp?.id]?.title)}</h3><p>${sp?.sessions.length || 0}/24 sessions · RTM ${r.days} data days this period · codes: ${r.codes.join(', ') || 'none yet'}</p>
    <p>${(sp?.changes || []).slice(-5).map(c => `${c.type}: ${h(exName(c.from))} → ${h(exName(c.to))}`).join('<br>') || 'No coach changes yet.'}</p></div>`;
}
