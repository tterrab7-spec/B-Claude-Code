/* Parcelyst client core: API client (server or in-browser demo backend), shell, formatting, modals. */
(function () {
  'use strict';
  var script = document.currentScript;
  var BASE = script ? script.src.replace(/js\/ui\.js(\?.*)?$/, '') : '/';
  var ROOT = (function () { try { var u = new URL(BASE); return u.pathname; } catch (e) { return '/'; } })();

  // ---------- formatting ----------
  function usd(v, opts) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    opts = opts || {};
    var neg = v < 0, a = Math.abs(v);
    if (opts.compact && a >= 1e6) return (neg ? '-' : '') + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (opts.compact && a >= 1e4) return (neg ? '-' : '') + '$' + Math.round(a / 1e3) + 'k';
    return (neg ? '-' : '') + '$' + Math.round(a).toLocaleString('en-US');
  }
  function pct(v, d) { if (v === null || v === undefined || !isFinite(v)) return '—'; return (v * 100).toFixed(d === undefined ? 1 : d) + '%'; }
  function x(v, d) { if (v === null || v === undefined || !isFinite(v)) return '—'; return v.toFixed(d === undefined ? 2 : d) + 'x'; }
  function n(v, d) { if (v === null || v === undefined || !isFinite(v)) return '—'; return Number(v).toLocaleString('en-US', { maximumFractionDigits: d || 0 }); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtBy(kind, v) { return kind === 'pct' ? pct(v) : kind === 'usd' ? usd(v) : kind === 'x' ? x(v) : kind === 'x1' ? x(v, 1) : kind === 'bps' ? (v === null ? '—' : (v >= 0 ? '+' : '') + Math.round(v * 10000) + ' bps') : kind === 'yrs' ? (v === null ? '—' : v.toFixed(1) + ' yrs') : n(v); }
  function toneOfScore(s) { return s >= 60 ? 'good' : s >= 40 ? 'warn' : 'bad'; }
  function qs(name) { return new URLSearchParams(location.search).get(name); }

  // ---------- API ----------
  var modeP = null, demo = null;
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); }; document.head.appendChild(s); }); }
  function detect() {
    if (modeP) return modeP;
    modeP = (location.protocol === 'file:' ? Promise.reject(new Error('file')) : fetch(ROOT + 'api/health', { credentials: 'same-origin' }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (!r.ok || ct.indexOf('json') === -1) throw new Error('static');
      return r.json();
    })).then(function () { return 'server'; }).catch(function () {
      var need = [];
      ['markets', 'plans', 'engine', 'scoring', 'defaults', 'csv'].forEach(function (k) { if (!window['P' + { markets: 'Markets', plans: 'Plans', engine: 'Engine', scoring: 'Scoring', defaults: 'Defaults', csv: 'Csv' }[k]]) need.push(k); });
      var chain = Promise.resolve();
      need.concat(['seed', 'service']).forEach(function (k) { chain = chain.then(function () { return window['P' + k.charAt(0).toUpperCase() + k.slice(1)] ? null : loadScript(BASE + 'js/shared/' + k + '.js'); }); });
      return chain.then(function () { return loadScript(BASE + 'js/demo-backend.js'); }).then(function () { demo = window.PDemoBackend; return 'demo'; });
    });
    return modeP;
  }
  function api(method, path, body, opts) {
    opts = opts || {};
    return detect().then(function (mode) {
      var qIdx = path.indexOf('?'), p = qIdx === -1 ? path : path.slice(0, qIdx), query = {};
      if (qIdx !== -1) new URLSearchParams(path.slice(qIdx + 1)).forEach(function (v, k) { query[k] = v; });
      if (mode === 'demo') {
        return demo.handle(method, p, query, body).then(function (res) {
          if (res.csv !== undefined) return { csv: res.csv, filename: res.filename };
          if (res.status >= 400) { var e = new Error(res.json.error || 'Request failed'); e.status = res.status; e.data = res.json; throw e; }
          return res.json;
        });
      }
      var init = { method: method, credentials: 'same-origin', headers: {} };
      if (body !== undefined && method !== 'GET') { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
      return fetch(ROOT + p.replace(/^\//, '') + (qIdx === -1 ? '' : path.slice(qIdx)), init).then(function (r) {
        var ct = r.headers.get('content-type') || '';
        if (ct.indexOf('text/csv') !== -1) return r.text().then(function (t) { if (!r.ok) throw new Error('Export failed'); var fn = (r.headers.get('content-disposition') || '').match(/filename="([^"]+)"/); return { csv: t, filename: fn ? fn[1] : 'export.csv' }; });
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || 'Request failed (' + r.status + ')'); e.status = r.status; e.data = j; throw e; }
          return j;
        });
      });
    });
  }

  var meP = null, configP = null;
  function me(force) { if (!meP || force) meP = api('GET', '/api/me').then(function (j) { return j.user; }).catch(function () { return null; }); return meP; }
  function config() { if (!configP) configP = api('GET', '/api/config'); return configP; }

  // ---------- toast + modal ----------
  function toast(msg, isErr) {
    var host = document.querySelector('.toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'toast-host'; host.setAttribute('role', 'status'); document.body.appendChild(host); }
    var t = document.createElement('div'); t.className = 'toast' + (isErr ? ' err' : ''); t.textContent = msg; host.appendChild(t);
    setTimeout(function () { t.remove(); }, isErr ? 6000 : 3500);
  }
  function modal(html, onMount) {
    var back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="modal-body">' + html + '</div></div>';
    function close() { back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    var f = back.querySelector('input, button'); if (f) f.focus();
    if (onMount) onMount(back.querySelector('.modal-body'), close);
    return close;
  }
  function errorHandler(e) {
    if (e && e.status === 401) { location.href = ROOT + 'auth.html?next=' + encodeURIComponent(location.pathname + location.search); return; }
    if (e && e.status === 402) { paywall(e.message, e.data && e.data.code); return; }
    toast((e && e.message) || 'Something went wrong', true);
  }
  function paywall(message, code) {
    modal('<span class="eyebrow">' + (code === 'limit' ? 'Monthly limit reached' : 'Upgrade') + '</span><h3>' + esc(message || 'This is a paid feature.') + '</h3>' +
      '<p class="muted">Plans start at $79/month with a 7-day free trial, or buy a single report for $29.</p>' +
      '<div class="row"><a class="btn btn-primary" href="' + ROOT + 'pricing.html">See plans</a><button class="btn btn-line" data-close>Not now</button></div>');
  }
  function checkout(product) {
    return me().then(function (u) {
      if (!u) { location.href = ROOT + 'auth.html?mode=signup&next=' + encodeURIComponent(ROOT + 'pricing.html?buy=' + product); return; }
      return api('POST', '/api/billing/checkout', { product: product }).then(function (j) { location.href = j.url; }).catch(errorHandler);
    });
  }
  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'text/csv' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- brand ----------
  var MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1.5" y="1.5" width="29" height="29" rx="3" fill="var(--ink)"/><path d="M6 22.5 L13 9.5 L26 12 L22.5 25.5 Z" fill="none" stroke="var(--paper)" stroke-width="1.6"/><path d="M13 9.5 L17.5 18.5 L22.5 25.5 M17.5 18.5 L6 22.5" fill="none" stroke="var(--paper)" stroke-width="1" opacity=".55"/><circle cx="17.5" cy="18.5" r="3" fill="var(--blaze)"/></svg>';
  var BRAND = 'Parcelyst';

  // ---------- marketing header / footer ----------
  function siteHeader(active) {
    var links = [['product.html', 'Product'], ['pricing.html', 'Pricing'], ['sample-report.html', 'Sample Report'], ['markets.html', 'Markets'], ['about.html', 'About'], ['faq.html', 'FAQ']];
    var h = document.createElement('header'); h.className = 'site-header';
    h.innerHTML = '<div class="wrap"><a class="brand" href="' + ROOT + 'index.html">' + MARK + '<span>' + BRAND + '</span></a>' +
      '<nav class="nav" id="site-nav" aria-label="Main">' + links.map(function (l) { return '<a href="' + ROOT + l[0] + '"' + (active === l[0] ? ' aria-current="page"' : '') + '>' + l[1] + '</a>'; }).join('') + '</nav>' +
      '<div class="header-cta" id="header-cta"><a class="btn btn-ghost btn-sm" href="' + ROOT + 'auth.html">Sign in</a><a class="btn btn-ink btn-sm" href="' + ROOT + 'auth.html?mode=signup">Start free</a></div>' +
      '<button class="btn btn-line btn-sm menu-btn" id="menu-btn" aria-expanded="false" aria-controls="site-nav">Menu</button></div>';
    document.body.prepend(h);
    h.querySelector('#menu-btn').addEventListener('click', function () { var nav = h.querySelector('#site-nav'); nav.classList.toggle('open'); this.setAttribute('aria-expanded', nav.classList.contains('open')); });
    me().then(function (u) { if (u) h.querySelector('#header-cta').innerHTML = '<a class="btn btn-ink btn-sm" href="' + ROOT + 'app/dashboard.html">Open app</a>'; });
  }
  function siteFooter() {
    var f = document.createElement('footer'); f.className = 'site-footer';
    f.innerHTML = '<div class="wrap"><div class="cols">' +
      '<div class="stack"><a class="brand" href="' + ROOT + 'index.html">' + MARK + '<span>' + BRAND + '</span></a><p class="muted small" style="max-width:34ch">Underwriting, off-market deal finding and listing prospecting for residential, commercial and land. Live in Hampton Roads and Richmond.</p></div>' +
      '<div><h4>Product</h4><ul><li><a href="' + ROOT + 'app/analyze.html">Analyze a property</a></li><li><a href="' + ROOT + 'app/finder.html?mode=investor">Deal Finder</a></li><li><a href="' + ROOT + 'app/finder.html?mode=agent">Listing Prospector</a></li><li><a href="' + ROOT + 'app/finder.html?mode=land">Land Finder</a></li></ul></div>' +
      '<div><h4>Company</h4><ul><li><a href="' + ROOT + 'about.html">About</a></li><li><a href="' + ROOT + 'pricing.html">Pricing</a></li><li><a href="' + ROOT + 'markets.html">Markets</a></li><li><a href="' + ROOT + 'faq.html">FAQ</a></li></ul></div>' +
      '<div><h4>Legal</h4><ul><li><a href="' + ROOT + 'terms.html">Terms</a></li><li><a href="' + ROOT + 'privacy.html">Privacy</a></li><li><a href="' + ROOT + 'methodology.html">Methodology</a></li></ul></div>' +
      '</div><div class="legal"><span>&copy; ' + new Date().getFullYear() + ' ' + BRAND + '. Analysis is informational and is not financial, legal or tax advice.</span><span>Not affiliated with any MLS. Equal Housing Opportunity.</span></div></div>';
    document.body.appendChild(f);
  }

  // ---------- app shell ----------
  var ICONS = {
    dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"/>',
    analyze: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    finder: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    agent: '<path d="M3 11 12 4l9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
    land: '<path d="m3 17 6-10 4 6 3-4 5 8z"/>',
    pipeline: '<path d="M4 6h16M4 12h10M4 18h6"/>',
    import: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    reports: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'
  };
  function icon(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[k] + '</svg>'; }
  function appShell(active, opts) {
    opts = opts || {};
    var main = document.querySelector('main');
    var shell = document.createElement('div'); shell.className = 'app';
    var nav = [
      ['grp', 'Workspace'], ['dashboard.html', 'Dashboard', 'dash'], ['analyze.html', 'Analyze', 'analyze'], ['reports.html', 'Reports', 'reports'],
      ['grp', 'Find'], ['finder.html?mode=investor', 'Deal Finder', 'finder', 'finder'], ['finder.html?mode=agent', 'Listing Prospector', 'agent', 'prospector'], ['finder.html?mode=land', 'Land Finder', 'land', 'landFinder'],
      ['pipeline.html', 'Pipeline', 'pipeline'], ['imports.html', 'List Import', 'import'],
      ['grp', 'Account'], ['account.html', 'Plan & Settings', 'account']
    ];
    var side = document.createElement('aside'); side.className = 'sidebar'; side.id = 'sidebar';
    side.innerHTML = '<a class="brand" href="' + ROOT + 'index.html">' + MARK + '<span>' + BRAND + '</span></a><nav class="side-nav" aria-label="App">' +
      nav.map(function (l) { if (l[0] === 'grp') return '<div class="grp">' + l[1] + '</div>'; return '<a href="' + ROOT + 'app/' + l[0] + '"' + (active === l[0] ? ' aria-current="page"' : '') + ' data-feature="' + (l[3] || '') + '">' + icon(l[2]) + '<span>' + l[1] + '</span></a>'; }).join('') +
      '</nav><div class="side-foot" id="side-foot"></div>';
    var top = document.createElement('div'); top.className = 'app-top';
    top.innerHTML = '<button class="btn btn-line btn-sm" id="side-toggle" aria-controls="sidebar" aria-expanded="false">Menu</button><a class="brand" href="' + ROOT + 'index.html">' + MARK + '<span>' + BRAND + '</span></a>';
    var wrap = document.createElement('div'); wrap.style.minWidth = '0';
    wrap.appendChild(top);
    main.classList.add('main');
    main.parentNode.insertBefore(shell, main);
    wrap.appendChild(main);
    shell.appendChild(side); shell.appendChild(wrap);
    top.querySelector('#side-toggle').addEventListener('click', function () { side.classList.toggle('open'); this.setAttribute('aria-expanded', side.classList.contains('open')); });
    document.addEventListener('click', function (e) { if (side.classList.contains('open') && !side.contains(e.target) && !top.contains(e.target)) side.classList.remove('open'); });
    return Promise.all([me(), detect()]).then(function (r) {
      var u = r[0], mode = r[1];
      var foot = side.querySelector('#side-foot');
      if (mode === 'demo') foot.insertAdjacentHTML('beforeend', '<div class="notice warn xs">Demo mode: data stays in this browser. Run the server for real accounts and billing.</div>');
      if (!u) {
        foot.insertAdjacentHTML('beforeend', '<a class="btn btn-ink btn-sm" href="' + ROOT + 'auth.html?mode=signup&next=' + encodeURIComponent(location.pathname + location.search) + '">Create free account</a><a class="btn btn-ghost btn-sm" href="' + ROOT + 'auth.html">Sign in</a>');
        if (opts.requireAuth) location.href = ROOT + 'auth.html?next=' + encodeURIComponent(location.pathname + location.search);
        return u;
      }
      side.querySelectorAll('[data-feature]').forEach(function (a) { var f = a.getAttribute('data-feature'); if (f && !u.features[f]) a.insertAdjacentHTML('beforeend', '<span class="lock" title="Paid plan">PRO</span>'); });
      var rep = u.usage.reports, look = u.usage.lookups;
      foot.insertAdjacentHTML('beforeend', '<div class="plan-card"><div class="row" style="justify-content:space-between"><strong>' + esc(u.planName) + '</strong>' + (u.plan === 'free' ? '<a class="small" href="' + ROOT + 'pricing.html">Upgrade</a>' : '') + '</div>' +
        '<div class="xs muted" style="margin-top:8px">Reports ' + rep.used + (rep.limit !== null ? ' / ' + rep.limit : '') + (u.credits ? ' · ' + u.credits + ' credit' + (u.credits > 1 ? 's' : '') : '') + '</div>' + (rep.limit ? '<div class="meter"><i style="width:' + Math.min(100, rep.used / rep.limit * 100) + '%"></i></div>' : '') +
        '<div class="xs muted" style="margin-top:8px">Live pulls ' + look.used + (look.limit !== null ? ' / ' + look.limit : '') + '</div>' + (look.limit ? '<div class="meter"><i style="width:' + Math.min(100, look.used / look.limit * 100) + '%"></i></div>' : '') + '</div>' +
        '<div class="row xs" style="justify-content:space-between"><span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px">' + esc(u.email) + '</span><button class="btn btn-ghost btn-sm" id="signout">Sign out</button></div>');
      foot.querySelector('#signout').addEventListener('click', function () { api('POST', '/api/auth/logout', {}).then(function () { location.href = ROOT + 'index.html'; }); });
      return u;
    });
  }

  function addressBox(el, opts) {
    // Address search with kind toggle; emits go(address, kind).
    opts = opts || {};
    el.innerHTML = '<form class="addr" autocomplete="off"><div class="seg" role="group" aria-label="Property type">' +
      ['residential', 'commercial', 'land'].map(function (k, i) { return '<button type="button" data-kind="' + k + '" aria-pressed="' + (i === 0) + '">' + k.charAt(0).toUpperCase() + k.slice(1) + '</button>'; }).join('') +
      '</div><div class="addr-row"><input class="input" id="' + (opts.id || 'addr') + '" name="address" placeholder="' + esc(opts.placeholder || 'Enter a property address, e.g. 1200 Laskin Rd, Virginia Beach, VA 23451') + '" aria-label="Property address" required>' +
      '<button class="btn btn-primary" type="submit">' + esc(opts.cta || 'Analyze') + '</button></div></form>';
    var kind = 'residential';
    el.querySelectorAll('[data-kind]').forEach(function (b) { b.addEventListener('click', function () { kind = b.getAttribute('data-kind'); el.querySelectorAll('[data-kind]').forEach(function (o) { o.setAttribute('aria-pressed', o === b); }); }); });
    el.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); var v = el.querySelector('input').value.trim(); if (v) opts.go(v, kind); });
  }

  window.PUI = {
    ROOT: ROOT, BASE: BASE, api: api, me: me, config: config, detect: detect, toast: toast, modal: modal, paywall: paywall, errorHandler: errorHandler, checkout: checkout, download: download,
    siteHeader: siteHeader, siteFooter: siteFooter, appShell: appShell, addressBox: addressBox, MARK: MARK, BRAND: BRAND, icon: icon,
    fmt: { usd: usd, pct: pct, x: x, n: n, by: fmtBy }, esc: esc, toneOfScore: toneOfScore, qs: qs
  };
})();
