/* Analyzer: address lookup -> editable assumptions -> live results -> save / full report. */
(function () {
  'use strict';
  var U = window.PUI, F = U.fmt, esc = U.esc, E = window.PEngine;

  var FIELDS = {
    residential: [
      ['Deal', [['price', 'Purchase price', 'usd'], ['estValue', 'Current / after-repair value', 'usd'], ['rehab', 'Rehab budget', 'usd'], ['rentMonthly', 'Market rent / mo', 'usd'], ['otherIncomeMonthly', 'Other income / mo', 'usd']]],
      ['Property', [['propertyType', 'Type', 'select', ['SFR', 'Townhouse', 'Condo', '2-4 Unit']], ['units', 'Units', 'int'], ['beds', 'Beds', 'num'], ['baths', 'Baths', 'num'], ['sqft', 'Square feet', 'int'], ['yearBuilt', 'Year built', 'int']]],
      ['Operating costs', [['taxAnnual', 'Property tax / yr', 'usd'], ['insuranceAnnual', 'Insurance / yr', 'usd'], ['hoaMonthly', 'HOA / mo', 'usd'], ['utilitiesMonthly', 'Owner utilities / mo', 'usd'], ['vacancyPct', 'Vacancy', 'pct'], ['maintenancePct', 'Maintenance (% rent)', 'pct'], ['capexPct', 'CapEx reserve (% rent)', 'pct'], ['mgmtPct', 'Management (% EGI)', 'pct']]],
      ['Financing', [['cash', 'All-cash purchase', 'bool'], ['downPct', 'Down payment', 'pct'], ['rate', 'Interest rate', 'pct2'], ['termYears', 'Term (years)', 'int'], ['closingPct', 'Closing costs', 'pct']]],
      ['Growth & exit', [['appreciation', 'Appreciation / yr', 'pct'], ['rentGrowth', 'Rent growth / yr', 'pct'], ['expenseGrowth', 'Expense growth / yr', 'pct'], ['holdYears', 'Hold (years)', 'int'], ['sellingPct', 'Selling costs', 'pct']]],
      ['Tax & flip', [['marginalTaxRate', 'Marginal tax bracket', 'pct'], ['landPct', 'Land share of price', 'pct'], ['flipTargetRoi', 'Flip target ROI', 'pct']]]
    ],
    commercial: [
      ['Deal', [['assetClass', 'Asset class', 'select', ['industrial', 'retail', 'office', 'multifamily', 'self-storage', 'mixed-use']], ['price', 'Purchase price', 'usd'], ['buildingSf', 'Building SF', 'int'], ['units', 'Units (multifamily)', 'int'], ['yearBuilt', 'Year built', 'int']]],
      ['Market', [['marketRentPsf', 'Market rent $/SF/yr', 'num'], ['marketCap', 'Market cap rate', 'pct2'], ['vacancyPct', 'General vacancy', 'pct'], ['creditLossPct', 'Credit loss', 'pct'], ['otherIncomeAnnual', 'Other income / yr', 'usd']]],
      ['Expenses (annual)', [['expenses.taxes', 'Real estate taxes', 'usd'], ['expenses.insurance', 'Insurance', 'usd'], ['expenses.cam', 'CAM', 'usd'], ['expenses.utilities', 'Utilities', 'usd'], ['expenses.repairs', 'Repairs & maint.', 'usd'], ['expenses.payroll', 'Payroll', 'usd'], ['expenses.other', 'Other', 'usd'], ['mgmtPct', 'Management (% EGI)', 'pct'], ['reservesPsf', 'Reserves $/SF', 'num'], ['reservesPerUnit', 'Reserves $/unit', 'usd']]],
      ['Leasing', [['renewProb', 'Renewal probability', 'pct'], ['downtimeMonths', 'Downtime (months)', 'int'], ['tiNewPsf', 'TI new $/SF', 'num'], ['tiRenewPsf', 'TI renewal $/SF', 'num'], ['lcPct', 'Leasing commission', 'pct']]],
      ['Debt', [['ltv', 'Max LTV', 'pct'], ['rate', 'Interest rate', 'pct2'], ['amortYears', 'Amortization (yrs)', 'int'], ['ioYears', 'Interest-only (yrs)', 'int'], ['minDscr', 'Lender min DSCR', 'num'], ['loanSizing', 'Loan sizing', 'select', ['auto', 'ltv']]]],
      ['Exit & tax', [['holdYears', 'Hold (years)', 'int'], ['exitCap', 'Exit cap rate', 'pct2'], ['sellingPct', 'Selling costs', 'pct'], ['rentGrowth', 'Rent growth / yr', 'pct'], ['expenseGrowth', 'Expense growth / yr', 'pct'], ['marginalTaxRate', 'Marginal tax bracket', 'pct'], ['costSegPct', 'Cost seg reclass %', 'pct']]]
    ],
    land: [
      ['Parcel', [['price', 'Asking price', 'usd'], ['acres', 'Gross acres', 'num'], ['zoning', 'Zoning', 'text'], ['product', 'Product', 'select', ['sfd', 'th']], ['netDevelopablePct', 'Net developable', 'pct'], ['density', 'Lots / developable acre', 'num'], ['lots', 'Lot count override', 'int']]],
      ['Lots & costs', [['finishedLotValue', 'Finished lot value', 'usd'], ['devCostPerLot', 'Site work $/lot', 'usd'], ['impactFeePerLot', 'Impact fees / proffers per lot', 'usd'], ['softCostPct', 'Soft costs (% hard)', 'pct'], ['contingencyPct', 'Contingency', 'pct'], ['entitlementCost', 'Entitlement / zoning costs', 'usd']]],
      ['Schedule & returns', [['entitlementMonths', 'Entitlement (months)', 'int'], ['devMonths', 'Site work (months)', 'int'], ['takedownPerYear', 'Takedown lots / yr', 'int'], ['lotEscalation', 'Lot price escalation', 'pct'], ['costEscalation', 'Cost escalation', 'pct'], ['marginPct', 'Required margin', 'pct'], ['discountRate', 'Discount rate', 'pct']]]
    ]
  };

  function get(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); }
  function set(o, path, v) { var ks = path.split('.'), t = o; for (var i = 0; i < ks.length - 1; i++) { if (!t[ks[i]]) t[ks[i]] = {}; t = t[ks[i]]; } t[ks[ks.length - 1]] = v; }
  function show(type, v) {
    if (v === null || v === undefined || v === '') return '';
    if (type === 'pct') return +(v * 100).toFixed(2);
    if (type === 'pct2') return +(v * 100).toFixed(3);
    if (type === 'usd') return Math.round(v);
    return v;
  }
  function read(type, raw) {
    if (type === 'text' || type === 'select') return raw;
    var n = parseFloat(String(raw).replace(/[$,%\s]/g, ''));
    if (isNaN(n)) return undefined;
    return type === 'pct' || type === 'pct2' ? n / 100 : n;
  }

  var state = { kind: 'residential', inputs: null, record: null, id: null, result: null, saved: false };
  var el = {};

  function fieldHtml(f, inputs) {
    var key = f[0], label = f[1], type = f[2], id = 'f-' + key.replace(/\./g, '-'), v = get(inputs, key);
    var src = inputs.sources && inputs.sources[key.split('.')[0]];
    if (type === 'bool') return '<div class="field" style="display:flex;align-items:flex-end"><label class="check" for="' + id + '"><input type="checkbox" id="' + id + '" data-k="' + key + '" data-t="bool"' + (v ? ' checked' : '') + '> ' + esc(label) + '</label></div>';
    if (type === 'select') return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><select class="input" id="' + id + '" data-k="' + key + '" data-t="select">' + f[3].map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>';
    var suffix = type === 'pct' || type === 'pct2' ? '%' : '';
    return '<div class="field"><label for="' + id + '">' + esc(label) + (suffix ? ' (%)' : '') + '</label><input class="input' + (type === 'text' ? '' : ' num') + '" id="' + id + '" data-k="' + key + '" data-t="' + type + '" inputmode="decimal" value="' + esc(show(type, v)) + '">' + (src ? '<div class="hint" title="' + esc(src) + '">' + esc(src.length > 60 ? src.slice(0, 58) + '…' : src) + '</div>' : '') + '</div>';
  }

  function rentRollHtml(roll) {
    return '<div class="panel" style="margin-top:4px"><div class="panel-head"><h3>Rent roll</h3><button class="btn btn-line btn-sm" type="button" id="rr-add">Add line</button></div><div class="table-wrap" style="border:0;border-radius:0"><table class="t" id="rr"><thead><tr><th>Tenant / unit</th><th class="n">Count</th><th class="n">SF</th><th class="n">Rent $/SF/yr</th><th class="n">Rent / mo</th><th>Type</th><th class="n">Yrs left</th><th class="n">Bumps %</th><th></th></tr></thead><tbody>' +
      roll.map(function (r, i) {
        return '<tr data-i="' + i + '"><td><input class="input" data-rr="label" value="' + esc(r.label || '') + '" aria-label="Tenant" style="min-width:170px"></td><td><input class="input num" data-rr="count" value="' + esc(r.count || 1) + '" style="width:64px" aria-label="Count"></td><td><input class="input num" data-rr="sf" value="' + esc(r.sf || '') + '" style="width:90px" aria-label="SF"></td>' +
          '<td><input class="input num" data-rr="rentPsfYr" value="' + esc(r.rentPsfYr !== undefined ? r.rentPsfYr : '') + '" style="width:84px" aria-label="Rent per SF"></td><td><input class="input num" data-rr="rentMonthly" value="' + esc(r.rentMonthly !== undefined ? r.rentMonthly : '') + '" style="width:90px" aria-label="Rent per month"></td>' +
          '<td><select class="input" data-rr="leaseType" aria-label="Lease type">' + ['NNN', 'MG', 'GROSS'].map(function (t) { return '<option' + (t === (r.leaseType || 'NNN') ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></td>' +
          '<td><input class="input num" data-rr="leaseEndYears" value="' + esc(r.leaseEndYears !== undefined && r.leaseEndYears !== null ? (+r.leaseEndYears).toFixed(1) : '') + '" style="width:70px" aria-label="Years left"></td><td><input class="input num" data-rr="escalation" value="' + esc(r.escalation !== undefined ? +(r.escalation * 100).toFixed(2) : 3) + '" style="width:64px" aria-label="Escalation"></td>' +
          '<td><button class="btn btn-ghost btn-sm" type="button" data-rr-del="' + i + '" aria-label="Remove line">&times;</button></td></tr>';
      }).join('') + '</tbody></table></div><p class="xs muted" style="padding:10px 14px">Enter rent as $/SF/yr (commercial) or $/mo per unit (multifamily). Leave years blank for month-to-month units. Rent of 0 marks the space vacant.</p></div>';
  }

  function renderForm() {
    var inp = state.inputs, groups = FIELDS[state.kind];
    var html = groups.map(function (g) { return '<fieldset class="panel panel-pad" style="border:1px solid var(--line);margin:0"><legend class="eyebrow" style="padding:0 6px">' + esc(g[0]) + '</legend><div class="grid g3" style="gap:12px">' + g[1].map(function (f) { return fieldHtml(f, inp); }).join('') + '</div></fieldset>'; }).join('');
    if (state.kind === 'commercial') html = groups.slice(0, 1).map(function (g) { return '<fieldset class="panel panel-pad" style="border:1px solid var(--line);margin:0"><legend class="eyebrow" style="padding:0 6px">' + esc(g[0]) + '</legend><div class="grid g3" style="gap:12px">' + g[1].map(function (f) { return fieldHtml(f, inp); }).join('') + '</div></fieldset>'; }).join('') + rentRollHtml(inp.rentRoll || []) +
      groups.slice(1).map(function (g) { return '<fieldset class="panel panel-pad" style="border:1px solid var(--line);margin:0"><legend class="eyebrow" style="padding:0 6px">' + esc(g[0]) + '</legend><div class="grid g3" style="gap:12px">' + g[1].map(function (f) { return fieldHtml(f, inp); }).join('') + '</div></fieldset>'; }).join('');
    el.form.innerHTML = html;
    el.form.querySelectorAll('[data-k]').forEach(function (i) { i.addEventListener(i.tagName === 'SELECT' || i.type === 'checkbox' ? 'change' : 'input', onField); });
    if (state.kind === 'commercial') bindRentRoll();
  }
  function bindRentRoll() {
    var tb = el.form.querySelector('#rr tbody');
    tb.addEventListener('input', onRoll); tb.addEventListener('change', onRoll);
    el.form.querySelector('#rr-add').addEventListener('click', function () { state.inputs.rentRoll = (state.inputs.rentRoll || []).concat([{ label: 'New suite', sf: 0, rentPsfYr: state.inputs.marketRentPsf || 0, leaseType: 'NNN', leaseEndYears: 5, escalation: 0.03 }]); renderForm(); recompute(); });
    tb.querySelectorAll('[data-rr-del]').forEach(function (b) { b.addEventListener('click', function () { state.inputs.rentRoll.splice(+b.getAttribute('data-rr-del'), 1); renderForm(); recompute(); }); });
  }
  function onRoll(e) {
    var tr = e.target.closest('tr'); if (!tr) return;
    var i = +tr.getAttribute('data-i'), k = e.target.getAttribute('data-rr'), row = state.inputs.rentRoll[i], v = e.target.value;
    if (k === 'label' || k === 'leaseType') row[k] = v;
    else if (v === '') delete row[k];
    else { var n = parseFloat(v.replace(/[$,%]/g, '')); if (!isNaN(n)) row[k] = k === 'escalation' ? n / 100 : n; }
    if (k === 'rentPsfYr' && v !== '') delete row.rentMonthly;
    if (k === 'rentMonthly' && v !== '') delete row.rentPsfYr;
    row.vacant = !(parseFloat(row.rentPsfYr || 0) > 0 || parseFloat(row.rentMonthly || 0) > 0);
    schedule();
  }
  function onField(e) {
    var t = e.target, k = t.getAttribute('data-k'), type = t.getAttribute('data-t');
    var v = type === 'bool' ? t.checked : read(type, t.value);
    if (v === undefined && type !== 'text') return;
    set(state.inputs, k, v);
    if (k === 'assetClass' || k === 'product') { /* defaults depend on class; keep user values */ }
    if (k === 'cash') { var dp = el.form.querySelector('#f-downPct'); if (dp) dp.disabled = !!v; }
    schedule();
  }
  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(recompute, 160); state.saved = false; updateSave(); }

  function recompute() {
    try { state.result = E.analyze(state.inputs); } catch (err) { console.error(err); return; }
    renderResults();
  }

  function metricTiles(r) {
    var m = r.metrics;
    if (r.kind === 'commercial') return [['Going-in cap', F.pct(m.cap, 2)], ['NOI', F.usd(m.noi, { compact: true })], ['DSCR', F.x(m.dscr)], ['Debt yield', F.pct(m.debtYield)], ['Levered IRR', F.pct(m.leveredIrr)], ['Equity multiple', F.x(m.equityMultiple)]];
    if (r.kind === 'land') return [['Lots', F.n(m.lots)], ['Land / lot', F.usd(m.landPerLot)], ['% of lot value', F.pct(m.landPctOfLot)], ['Static residual', F.usd(m.staticResidual, { compact: true })], ['Margin at ask', F.pct(m.margin)], ['Project IRR', F.pct(m.irr)]];
    return [['Cash flow / mo', F.usd(m.cfMonthly)], ['Cap rate', F.pct(m.cap)], ['Cash-on-cash', F.pct(m.coc)], ['DSCR', F.x(m.dscr)], [r.assumptions.holdYears + '-yr IRR', F.pct(m.irr)], ['Break-even price', F.usd(r.breakEvenPrice)]];
  }

  function renderResults() {
    var r = state.result;
    el.results.innerHTML = '<div class="panel"><div class="panel-pad stack" style="gap:14px"><div class="row" style="justify-content:space-between;align-items:center"><div class="stack" style="gap:6px"><span class="eyebrow">Investment score</span><span class="verdict ' + r.verdict.tone + '">' + esc(r.verdict.label) + '</span></div><div style="width:150px">' + window.PReport.gauge(r.score, r.verdict.tone) + '</div></div>' +
      '<div class="grid g2" style="gap:12px 16px">' + metricTiles(r).map(function (t) { return '<div class="stat"><span class="k">' + t[0] + '</span><span class="v" style="font-size:1.2rem">' + t[1] + '</span></div>'; }).join('') + '</div><hr class="divider">' +
      '<div class="stack" style="gap:8px">' + r.factors.map(function (f) { var c = f.rating === 'Strong' ? 'good' : f.rating === 'Fair' ? 'warn' : 'bad'; return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;font-size:.86rem"><span>' + esc(f.label) + ' <span class="muted mono">' + F.by(f.fmt, f.value) + '</span></span><span class="chip ' + c + '">' + f.earned + ' / ' + f.max + '</span></div>'; }).join('') + '</div><hr class="divider">' +
      '<div class="stack" style="gap:6px"><span class="eyebrow">Price to hit each rating</span>' + r.priceTargets.map(function (t) { return '<div class="row small" style="justify-content:space-between"><span>' + t.label + ' (' + t.score + '+)</span><span class="num">' + (t.achievable ? F.usd(t.price) + ' <span class="muted">' + (t.discount >= 0 ? '+' : '') + F.pct(t.discount) + '</span>' : 'n/a') + '</span></div>'; }).join('') + '</div>' +
      '<div class="stack" style="gap:8px">' + r.insights.slice(0, 2).map(function (i) { return '<div class="insight"><i class="bg-' + i.tone + '"></i><p class="small">' + esc(i.text) + '</p></div>'; }).join('') + '</div>' +
      '<div class="row"><button class="btn btn-primary" id="save">Save analysis</button><button class="btn btn-ink" id="full">Full report</button></div><p class="xs muted" id="save-note"></p></div></div>';
    el.results.querySelector('#save').addEventListener('click', function () { save().then(function (id) { if (id) U.toast('Saved'); }); });
    el.results.querySelector('#full').addEventListener('click', function () { save().then(function (id) { if (id) location.href = U.ROOT + 'app/report.html?id=' + id; }); });
    updateSave();
  }
  function updateSave() {
    var b = el.results && el.results.querySelector('#save'); if (!b) return;
    b.textContent = state.id ? (state.saved ? 'Saved' : 'Save changes') : 'Save analysis';
    b.disabled = state.saved;
  }

  function save() {
    return U.me().then(function (u) {
      if (!u) {
        try { sessionStorage.setItem('parcelyst-pending', JSON.stringify({ inputs: state.inputs, kind: state.kind })); } catch (e) { /* ignore */ }
        location.href = U.ROOT + 'auth.html?mode=signup&next=' + encodeURIComponent(U.ROOT + 'app/analyze.html?pending=1');
        return null;
      }
      return U.api('POST', '/api/analyze', { inputs: state.inputs, id: state.id || undefined }).then(function (j) {
        state.id = j.id; state.saved = true; updateSave();
        history.replaceState(null, '', U.ROOT + 'app/analyze.html?id=' + j.id);
        return j.id;
      }).catch(function (e) { U.errorHandler(e); return null; });
    });
  }

  function propertyCard(rec, extra) {
    if (!rec) { el.prop.innerHTML = ''; return; }
    var src = rec.source === 'sample' ? '<span class="tag-demo">Sample deal</span>' : rec.source === 'demo' ? '<span class="tag-demo">Demo record</span>' : rec.source && rec.source.indexOf('import') === 0 ? '<span class="chip plat">Your import</span>' : rec.source === 'geocode' ? '<span class="chip">Address verified (Census)</span>' : rec.source ? '<span class="chip good">Live: ' + esc(rec.source) + '</span>' : '';
    var facts = [];
    if (rec.assetType) facts.push(esc(rec.assetType));
    if (rec.beds) facts.push(rec.beds + ' bd / ' + rec.baths + ' ba');
    if (rec.sqft) facts.push(F.n(rec.sqft) + ' sf');
    if (rec.buildingSf) facts.push(F.n(rec.buildingSf) + ' SF bldg');
    if (rec.lotAcres) facts.push(rec.lotAcres + ' ac');
    if (rec.yearBuilt) facts.push('Built ' + rec.yearBuilt);
    var owner = rec.ownerName ? '<div class="small"><span class="muted">Owner:</span> ' + esc(rec.ownerName) + (rec.absentee ? ' <span class="chip warn">Absentee</span>' : '') + '</div>' : '';
    var sale = rec.lastSaleDate ? '<div class="small"><span class="muted">Last sale:</span> ' + F.usd(rec.lastSalePrice) + ' on ' + esc(rec.lastSaleDate) + '</div>' : '';
    el.prop.innerHTML = '<div class="panel panel-pad row" style="justify-content:space-between;align-items:flex-start;gap:16px"><div class="stack" style="gap:6px;min-width:0"><div class="row" style="gap:8px">' + src + (extra || '') + '</div><h3>' + esc(rec.address || 'Manual entry') + '</h3><div class="muted small">' + esc([rec.city, rec.state, rec.zip].filter(Boolean).join(', ')) + (rec.localityName ? ' · ' + esc(rec.localityName) : '') + '</div><div class="small">' + facts.join(' · ') + '</div>' + owner + sale + '</div>' +
      '<div class="row" style="gap:6px"><span class="muted xs">Analyze as</span><div class="seg" id="kind-seg">' + ['residential', 'commercial', 'land'].map(function (k) { return '<button type="button" data-kind="' + k + '" aria-pressed="' + (state.kind === k) + '">' + k.charAt(0).toUpperCase() + k.slice(1) + '</button>'; }).join('') + '</div></div></div>';
    el.prop.querySelectorAll('[data-kind]').forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-kind'); if (k === state.kind) return; start(rec, k); }); });
  }

  var ratesP = null;
  function rates() { if (!ratesP) ratesP = U.config().then(function (c) { return { rates: c.rates, sources: c.rateSources }; }); return ratesP; }

  function start(rec, kind, inputs) {
    state.record = rec; state.kind = kind;
    var go = inputs ? Promise.resolve(inputs) : rates().then(function (r) { return window.PDefaults.build(rec || {}, { kind: kind, rates: r.rates, rateSources: r.sources }); });
    return go.then(function (inp) {
      inp.kind = kind;
      // Fill any field the form shows but the inputs omit with the engine's resolved default.
      var resolved = E.analyze(inp).assumptions;
      FIELDS[kind].forEach(function (g) { g[1].forEach(function (f) { if (get(inp, f[0]) === undefined && get(resolved, f[0]) !== undefined && get(resolved, f[0]) !== null) set(inp, f[0], get(resolved, f[0])); }); });
      state.inputs = inp;
      propertyCard(rec || { address: inp.address, city: inp.city, state: inp.state, zip: inp.zip });
      el.work.hidden = false; el.empty.hidden = true;
      renderForm(); recompute();
    });
  }

  function lookup(address, kind) {
    el.status.innerHTML = '<span class="spinner"></span> Pulling records for ' + esc(address) + '…';
    return U.api('POST', '/api/lookup', { address: address, kind: kind === 'residential' ? undefined : kind }).then(function (j) {
      el.status.innerHTML = '';
      if (!j.record) {
        el.status.innerHTML = '<div class="notice warn"><div>' + esc(j.message || 'No record found.') + (j.errors && j.errors.length ? ' <span class="xs muted">(' + esc(j.errors.join('; ')) + ')</span>' : '') + '</div></div>';
        var parts = address.split(',');
        return start({ address: parts[0].trim(), city: (parts[1] || '').trim(), state: ((parts[2] || '').trim().split(' ')[0] || '').toUpperCase(), zip: ((address.match(/\b\d{5}\b/) || [])[0] || '') }, kind);
      }
      var k = kind !== 'residential' ? kind : j.kind;
      if (!j.inMarket) el.status.innerHTML = '<div class="notice"><div>This address is outside our live markets, so taxes, rents and growth use national defaults. Edit any field to match local data.</div></div>';
      return start(j.record, k, k === j.kind ? j.inputs : null);
    }).catch(function (e) { el.status.innerHTML = ''; U.errorHandler(e); });
  }

  function init() {
    el.form = document.getElementById('form'); el.results = document.getElementById('results'); el.prop = document.getElementById('prop');
    el.work = document.getElementById('work'); el.empty = document.getElementById('empty'); el.status = document.getElementById('status');
    U.addressBox(document.getElementById('search'), { go: lookup, cta: 'Pull records' });
    document.getElementById('manual').addEventListener('click', function () { var k = document.querySelector('#search [aria-pressed="true"]').getAttribute('data-kind'); start({ address: '', city: '', state: 'VA', zip: '', market: 'hampton-roads' }, k); });
    document.querySelectorAll('[data-sample]').forEach(function (b) { b.addEventListener('click', function () { var s = window.PSamples[b.getAttribute('data-sample')]; start(s.record, s.kind, s.inputs ? JSON.parse(JSON.stringify(s.inputs)) : null); }); });
    var id = U.qs('id'), prop = U.qs('property'), addr = U.qs('address'), kind = U.qs('kind') || 'residential';
    if (id) {
      U.api('GET', '/api/analyses/' + encodeURIComponent(id)).then(function (j) { state.id = id; state.saved = true; start({ address: j.analysis.inputs.address, city: j.analysis.inputs.city, state: j.analysis.inputs.state, zip: j.analysis.inputs.zip }, j.analysis.kind, j.analysis.inputs); }).catch(U.errorHandler);
    } else if (prop) {
      U.api('GET', '/api/property/' + encodeURIComponent(prop)).then(function (j) { start(j.record, U.qs('kind') || j.kind, U.qs('kind') && U.qs('kind') !== j.kind ? null : j.inputs); }).catch(U.errorHandler);
    } else if (U.qs('sample') && window.PSamples && window.PSamples[U.qs('sample')]) {
      var sm = window.PSamples[U.qs('sample')]; start(sm.record, sm.kind, JSON.parse(JSON.stringify(sm.inputs)));
    } else if (U.qs('pending')) {
      try { var p = JSON.parse(sessionStorage.getItem('parcelyst-pending')); sessionStorage.removeItem('parcelyst-pending'); if (p) start({ address: p.inputs.address, city: p.inputs.city, state: p.inputs.state, zip: p.inputs.zip }, p.kind, p.inputs).then(save); } catch (e) { /* ignore */ }
    } else if (addr) {
      document.querySelector('#search input').value = addr;
      document.querySelectorAll('#search [data-kind]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-kind') === kind); });
      lookup(addr, kind);
    }
  }

  window.PAnalyzer = { init: init };
})();
