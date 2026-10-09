// Partner portal: channel playbooks, QR chair cards, and partner attribution stats.
import { api, health } from './api.js';
import { DOORS, SPRINTS } from './data.js';
import { CONFIG } from './config.js';
import { toast, ICON } from './app.js';

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CHANNELS = [
  { id: 'barbershop', name: 'Barbershops', line: 'Men talk to their barber more than their doctor.', card: 'Free Body Score. 5 minutes, right here in the chair.', ask: 'QR at every chair. $10 per member who stays past week 4.', door: '' },
  { id: 'gym', name: 'Gyms, golf courses and rec leagues', line: 'Keep members playing instead of sitting out hurt.', card: 'Hurt? Stiff? Get your Body Score before you sit out.', ask: '20% revenue share on memberships for 12 months.', door: 'sport' },
  { id: 'clinic', name: 'Urologists and orthopedists', line: 'Pre-hab and post-op follow-through your patients will actually do.', card: 'Your recovery program, in your pocket, supervised by a licensed PT.', ask: 'Referral pad and QR. Progress reports back to the referring office.', door: 'life' },
  { id: 'employer', name: 'Employers, unions and trade associations', line: 'Fewer comp claims and less lost time from the guys doing the hard work.', card: 'Free for members. Keep your body working.', ask: 'Per-member-per-month group contract. Phase 2 channel.', door: 'work' },
  { id: 'creator', name: 'Podcasts and former athletes', line: 'The trust channel men already listen to.', card: 'Take the Body Score I take.', ask: 'Custom code, co-branded landing, revenue share.', door: '' },
];

export async function viewPartners(shell) {
  const online = await health();
  const base = location.origin + location.pathname;
  shell(`<section class="partners">
    <p class="eyebrow">Partners</p><h1 class="h2">Put a free Body Score where men already are.</h1>
    <p class="muted">Every partner gets a code. Every scan, signup and paid member is attributed back to it.</p>
    <div class="grid3">${CHANNELS.map(c => `<div class="feature"><h3>${c.name}</h3><p>${c.line}</p><p class="fine">${c.ask}</p></div>`).join('')}</div>

    <div class="card form" id="maker"><h3>Make a QR card</h3>
      <div class="row gap wrap">
        <label>Partner code<input name="code" value="${h(Object.keys(CONFIG.partners)[0] || '')}" maxlength="16" style="text-transform:uppercase"></label>
        <label>Partner name<input name="name" value="${h(Object.values(CONFIG.partners)[0]?.name || '')}" maxlength="60"></label>
        <label>Channel<select name="channel">${CHANNELS.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></label>
        <label>Front door<select name="door"><option value="">Let him choose</option>${DOORS.map(d => `<optgroup label="${h(d.label)}">${d.options.map(o => `<option value="${d.id}/${o.id}">${h(SPRINTS[o.id].title)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      </div>
      <button class="btn primary" id="mk">Generate card</button>
    </div>
    <div id="card-out"></div>

    <div class="card" id="admin"><h3>Partner performance</h3>${online ? `<form id="adm" class="form row gap wrap"><input type="password" name="k" placeholder="Admin key" required><button class="btn ghost sm">Load</button></form><div id="stats"></div>` : '<p class="muted">Connect the TUNED server to track scans, signups and paid members by partner.</p>'}</div>
  </section>`, { nav: false, wide: true });

  const maker = document.getElementById('maker');
  const val = n => maker.querySelector(`[name=${n}]`).value.trim();
  document.getElementById('mk').onclick = async () => {
    const code = val('code').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!code) return toast('Add a partner code');
    const ch = CHANNELS.find(c => c.id === val('channel'));
    const door = val('door') || ch.door;
    const full = !door ? `${base}?ref=${code}` : door.includes('/') ? `${base}?ref=${code}#/start/${door}` : `${base}?ref=${code}&door=${door}`;
    await loadQR();
    const qr = window.qrcode(0, 'M'); qr.addData(full); qr.make();
    document.getElementById('card-out').innerHTML = `
      <div class="chair-card" id="print-card">
        <div class="cc-top">${CONFIG.brand}${val('name') ? `<span> × ${h(val('name'))}</span>` : ''}</div>
        <div class="cc-head">What's your<br><em>Body Score?</em></div>
        <div class="cc-qr">${qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })}</div>
        <div class="cc-sub">${h(ch.card)}</div>
        <div class="cc-fine">Scan with your phone camera · Free · 5 minutes · Licensed PTs</div>
      </div>
      <div class="row gap wrap"><button class="btn primary" id="print">Print card</button><button class="btn ghost" id="copy">Copy link</button><span class="mono fine">${h(full)}</span></div>`;
    document.getElementById('print').onclick = () => window.print();
    document.getElementById('copy').onclick = async () => { try { await navigator.clipboard.writeText(full); toast('Link copied'); } catch (e) { toast(full); } };
  };

  const adm = document.getElementById('adm');
  if (adm) adm.onsubmit = async e => { e.preventDefault(); const k = new FormData(adm).get('k'); await stats(k); };
}

async function stats(k) {
  const el = document.getElementById('stats');
  try {
    const { partners } = await api.get('partners', { 'x-admin-key': k });
    el.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Partner</th><th>Type</th><th>Scans</th><th>Signups</th><th>Scored</th><th>Active 4+</th><th>Paid</th><th>Rev share</th></tr></thead><tbody>
      ${partners.map(p => `<tr><td class="mono">${h(p.code)}</td><td>${h(p.name)}</td><td>${h(p.kind)}</td><td>${p.scans}</td><td>${p.signups}</td><td>${p.scored}</td><td>${p.active}</td><td>${p.paid}</td><td>${p.revShare || 0}%</td></tr>`).join('')}</tbody></table></div>
      <form id="addp" class="form row gap wrap"><input name="code" placeholder="CODE" required maxlength="16"><input name="name" placeholder="Partner name" required><select name="kind">${CHANNELS.map(c => `<option>${c.id}</option>`).join('')}</select><input name="revShare" type="number" min="0" max="50" placeholder="Rev %" style="max-width:90px"><input name="contact" placeholder="Contact"><button class="btn primary sm">Add partner</button></form>`;
    document.getElementById('addp').onsubmit = async e => {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
      try { await api.post('partners', fd, { 'x-admin-key': k }); toast('Partner saved'); stats(k); } catch (er) { toast(er.message); }
    };
  } catch (e) { el.innerHTML = `<p class="err">${h(e.message)}</p>`; }
}

function loadQR() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/qrcode.js'; s.onload = res; s.onerror = () => rej(new Error('QR library failed to load')); document.head.appendChild(s); });
}
