/* Desktop Valuation Review workspace: subject + assessment + comps grid + income + cost + weights -> live conclusion. */
(function () {
  'use strict';
  var U = window.PUI, F = U.fmt, esc = U.esc, V = window.PValuation, E = window.PEngine;
  var state = { inputs: null, result: null, id: null, saved: false };
  var el = {};
  var COND = [[1, 'Poor'], [2, 'Fair'], [3, 'Average'], [4, 'Good'], [5, 'Excellent']];
  var CLASS_ASSET = { industrial: 'Industrial', retail: 'Retail', office: 'Office', multifamily: 'Multifamily 5+', 'self-storage': 'Self-Storage', 'mixed-use': 'Mixed-Use' };

  function get(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); }
  function set(o, path, v) { var ks = path.split('.'), t = o; for (var i = 0; i < ks.length - 1; i++) { if (!t[ks[i]] || typeof t[ks[i]] !== 'object') t[ks[i]] = {}; t = t[ks[i]]; } if (v === undefined) delete t[ks[ks.length - 1]]; else t[ks[ks.length - 1]] = v; }
  function show(type, v) { if (v === null || v === undefined || v === '') return ''; if (type === 'pct') return +(v * 100).toFixed(3); if (type === 'usd') return Math.round(v); return v; }
  function read(type, raw) {
    if (type === 'text' || type === 'select' || type === 'date') return raw === '' ? undefined : raw;
    if (String(raw).trim() === '') return undefined;
    var n = parseFloat(String(raw).replace(/[$,%\s]/g, '')); if (isNaN(n)) return undefined;
    return type === 'pct' ? n / 100 : n;
  }
  function isRes() { return (state.inputs.subject || {}).type !== 'commercial'; }

  function groups() {
    var res = isRes(), cls = (state.inputs.subject || {}).assetClass;
    var g = [
      ['Assignment', [['assignment.client', 'Client', 'text'], ['assignment.purpose', 'Intended use', 'select', Object.keys(V.PURPOSES).map(function (k) { return [k, V.PURPOSES[k]]; })], ['assignment.effectiveDate', 'Effective date', 'date'], ['assignment.interest', 'Interest valued', 'select', [['Fee simple', 'Fee simple'], ['Leased fee', 'Leased fee']]], ['assignment.fileNo', 'File no.', 'text'],
        ['assignment.preparedBy', 'Prepared by', 'text'], ['assignment.firm', 'Firm', 'text'], ['assignment.credentials', 'Credentials', 'text'], ['assignment.reviewer', 'Reviewing appraiser (optional)', 'text'], ['assignment.reviewerLicense', 'Appraiser license no.', 'text']]],
      ['Subject property', [['address', 'Street address', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['zip', 'ZIP', 'text'],
        res ? ['subject.propertyType', 'Property type', 'select', V.RES_TYPES.map(function (t) { return [t, t]; })] : ['subject.assetClass', 'Asset class', 'select', V.CLASSES.map(function (t) { return [t, t]; })],
        ['subject.sf', res ? 'Living area (SF)' : 'Building area (SF)', 'num'], ['subject.units', 'Units', 'num'], ['subject.lotAcres', 'Site (acres)', 'num'], ['subject.yearBuilt', 'Year built', 'num']]
        .concat(res ? [['subject.beds', 'Bedrooms', 'num'], ['subject.baths', 'Bathrooms', 'num'], ['subject.garage', 'Garage bays', 'num']] : [['subject.occupancyPct', 'Occupancy', 'pct']])
        .concat([['subject.condition', 'Condition', 'select', COND], ['subject.quality', 'Quality', 'select', COND], ['subject.zoning', 'Zoning', 'text'], ['subject.parcelId', 'Parcel ID', 'text']])],
      ['Tax assessment', [['assessment.total', 'Total assessed value', 'usd'], ['assessment.land', 'Assessed land', 'usd'], ['assessment.improvements', 'Assessed improvements', 'usd'], ['assessment.taxYear', 'Tax year', 'text'], ['assessment.taxRate', 'Tax rate (% of value)', 'pct'], ['assessment.ratio', 'Assessment ratio', 'pct'], ['assessment.feePct', 'Contingency fee', 'pct'], ['assessment.horizonYears', 'Savings horizon (years)', 'num']]],
      ['__comps'],
      ['Adjustment rates', res ? [['sales.rates.timePctPerYear', 'Market conditions / yr', 'pct'], ['sales.rates.glaPerSf', 'Living area $/SF', 'num'], ['sales.rates.lotPerAcre', 'Site $/acre', 'usd'], ['sales.rates.agePctPerYear', 'Age / yr', 'pct'], ['sales.rates.conditionPctPerStep', 'Condition / step', 'pct'], ['sales.rates.qualityPctPerStep', 'Quality / step', 'pct'], ['sales.rates.perBed', 'Per bedroom $', 'usd'], ['sales.rates.perBath', 'Per bathroom $', 'usd'], ['sales.rates.perGarage', 'Per garage bay $', 'usd']]
        : [['sales.rates.timePctPerYear', 'Market conditions / yr', 'pct'], ['sales.rates.sizePctPerDoubling', 'Size, per doubling', 'pct'], ['sales.rates.agePctPerYear', 'Age / yr', 'pct'], ['sales.rates.conditionPctPerStep', 'Condition / step', 'pct'], ['sales.rates.qualityPctPerStep', 'Quality / step', 'pct'], ['sales.rates.occupancyFactor', 'Occupancy factor', 'pct']], 'Blank fields use the market-derived default shown in grey.'],
      res ? ['Income approach (gross rent multiplier)', [['income.enabled', 'Develop the income approach', 'bool'], ['income.monthlyRent', 'Market rent / month', 'usd'], ['income.grm', 'Gross rent multiplier', 'num']], 'Used mainly for 2-4 unit property. Add a monthly rent to comparables to extract the multiplier.']
        : ['Income approach', [['income.enabled', 'Develop the income approach', 'bool'], ['income.rentBasis', 'Rent basis', 'select', [['market', 'Market rent (fee simple)'], ['contract', 'Contract rent (leased fee)']]], ['income.marketRentPsf', 'Market rent $/SF/yr', 'num'], ['income.vacancyPct', 'Stabilized vacancy', 'pct'], ['income.creditLossPct', 'Credit loss', 'pct'], ['income.otherIncomeAnnual', 'Other income / yr', 'usd'],
          ['income.capRate', 'Capitalization rate', 'pct'], ['income.loadedCap', 'Tax-loaded cap rate', 'bool'], ['income.expenses.taxes', 'Real estate taxes', 'usd'], ['income.expenses.insurance', 'Insurance', 'usd'], ['income.expenses.cam', 'CAM', 'usd'], ['income.expenses.utilities', 'Utilities', 'usd'], ['income.expenses.repairs', 'Repairs & maint.', 'usd'], ['income.expenses.payroll', 'Payroll', 'usd'], ['income.expenses.other', 'Other', 'usd'],
          ['income.mgmtPct', 'Management (% EGI)', 'pct'], ['income.reservesPsf', 'Reserves $/SF', 'num'], ['income.reservesPerUnit', 'Reserves $/unit', 'usd'], ['income.deductLeaseUp', 'Deduct lease-up of excess vacancy', 'bool'], ['income.downtimeMonths', 'Lease-up downtime (mo)', 'num'], ['income.tiNewPsf', 'TI $/SF', 'num'], ['income.lcPct', 'Leasing commission', 'pct'], ['income.deferredMaintenance', 'Deferred maintenance $', 'usd'],
          ['income.ltv', 'Band: loan-to-value', 'pct'], ['income.loanRate', 'Band: loan rate', 'pct'], ['income.amortYears', 'Band: amortization (yrs)', 'num'], ['income.equityDividend', 'Band: equity dividend', 'pct'], ['income.dscr', 'Debt coverage ratio', 'num'], ['income.discountRate', 'DCF discount rate', 'pct'], ['income.exitCap', 'DCF terminal cap', 'pct']], cls === 'multifamily' ? 'For multifamily enter unit types in the rent roll with a count and monthly rent.' : ''],
      res ? null : ['__roll'],
      ['Cost approach', [['cost.enabled', 'Develop the cost approach', 'bool'], ['cost.landValue', 'Land value', 'usd'], ['cost.landPerAcre', 'or land $/acre', 'usd'], ['cost.baseCostPsf', 'Base cost $/SF', 'num'], ['cost.localMultiplier', 'Local multiplier', 'num'], ['cost.siteImprovements', 'Site improvements $', 'usd'], ['cost.softPct', 'Soft costs', 'pct'], ['cost.incentivePct', 'Entrepreneurial incentive', 'pct'], ['cost.economicLife', 'Economic life (yrs)', 'num'], ['cost.effectiveAge', 'Effective age (yrs)', 'num'], ['cost.functionalPct', 'Functional obsolescence', 'pct'], ['cost.externalPct', 'External obsolescence', 'pct']], 'Cost figures are reference values. Confirm with a cost service for contested matters.'],
      ['Reconciliation weights', [['weights.sales', 'Sales comparison', 'pct'], ['weights.income', 'Income', 'pct'], ['weights.cost', 'Cost', 'pct']], 'Leave blank for standard weights by property type. Weights are normalized across the approaches that could be developed.']
    ];
    return g.filter(Boolean);
  }

  // Resolved (defaulted) value for a field, shown as its placeholder.
  function resolved(path) {
    var r = state.result; if (!r) return undefined;
    if (path === 'income.capRate') return r.income && r.income.cap;
    if (path === 'income.grm') return r.income && r.income.grm;
    if (path === 'income.discountRate') return r.income && r.income.dcf && r.income.dcf.discountRate;
    if (path === 'income.exitCap') return r.income && r.income.dcf && r.income.dcf.exitCap;
    if (path.indexOf('weights.') === 0) { var row = r.reconciliation.rows.filter(function (x) { return x.key === path.slice(8); })[0]; return row && row.developed ? row.weight : undefined; }
    if (path === 'cost.landValue') return r.cost && r.cost.land;
    return get(r.assumptions, path);
  }

  function fieldHtml(f) {
    var key = f[0], label = f[1], type = f[2], id = 'v-' + key.replace(/\./g, '-'), v = get(state.inputs, key);
    if (type === 'bool') { var on = v === undefined ? !!resolved(key) : !!v; return '<div class="field" style="display:flex;align-items:flex-end"><label class="check" for="' + id + '"><input type="checkbox" id="' + id + '" data-k="' + key + '" data-t="bool"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label></div>'; }
    if (type === 'select') { var cur = v === undefined ? resolved(key) : v; return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><select class="input" id="' + id + '" data-k="' + key + '" data-t="select">' + f[3].map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>'; }
    return '<div class="field"><label for="' + id + '">' + esc(label) + (type === 'pct' ? ' (%)' : '') + '</label><input class="input' + (type === 'text' || type === 'date' ? '' : ' num') + '" id="' + id + '" data-k="' + key + '" data-t="' + type + '"' + (type === 'date' ? ' type="date"' : type === 'text' ? '' : ' inputmode="decimal"') + ' value="' + esc(show(type, v)) + '"></div>';
  }

  var COMP_COLS_RES = [['address', 'Address', 'text', 170], ['saleDate', 'Sale date', 'date', 130], ['salePrice', 'Price', 'num', 100], ['sf', 'SF', 'num', 72], ['lotAcres', 'Acres', 'num', 64], ['yearBuilt', 'Built', 'num', 66], ['beds', 'Bd', 'num', 50], ['baths', 'Ba', 'num', 54], ['garage', 'Gar', 'num', 50], ['condition', 'Cond.', 'cond', 96], ['distanceMi', 'Miles', 'num', 60], ['assessed', 'Assessed', 'num', 100], ['rent', 'Rent/mo', 'num', 80], ['locationAdjPct', 'Loc. %', 'pct', 62], ['conditionsAdjPct', 'Sale cond. %', 'pct', 70], ['otherAdj', 'Other $', 'num', 80]];
  var COMP_COLS_COM = [['address', 'Address', 'text', 190], ['saleDate', 'Sale date', 'date', 130], ['salePrice', 'Price', 'num', 110], ['sf', 'SF', 'num', 80], ['units', 'Units', 'num', 60], ['yearBuilt', 'Built', 'num', 66], ['occupancyPct', 'Occ. %', 'pct', 62], ['capRate', 'Cap %', 'pct', 62], ['noi', 'NOI', 'num', 90], ['condition', 'Cond.', 'cond', 96], ['quality', 'Class', 'cond', 96], ['distanceMi', 'Miles', 'num', 60], ['assessed', 'Assessed', 'num', 110], ['locationAdjPct', 'Loc. %', 'pct', 62], ['conditionsAdjPct', 'Sale cond. %', 'pct', 70], ['otherAdjPct', 'Other %', 'pct', 62]];
  var ROLL_COLS = [['label', 'Tenant / unit type', 'text', 180], ['count', 'Count', 'num', 60], ['sf', 'SF', 'num', 80], ['rentPsfYr', 'Rent $/SF/yr', 'num', 90], ['rentMonthly', 'Rent / mo (per unit)', 'num', 110], ['leaseType', 'Lease', 'lease', 90], ['leaseEndYears', 'Yrs left', 'num', 70], ['escalation', 'Bumps %', 'pct', 64]];

  function cell(col, row, attr) {
    var k = col[0], t = col[2], v = row[k], w = col[3];
    if (t === 'cond') return '<select class="input" ' + attr + '="' + k + '" data-t="num" style="width:' + w + 'px" aria-label="' + esc(col[1]) + '"><option value="">—</option>' + COND.map(function (o) { return '<option value="' + o[0] + '"' + (String(v) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
    if (t === 'lease') return '<select class="input" ' + attr + '="' + k + '" data-t="text" style="width:' + w + 'px" aria-label="Lease type">' + ['NNN', 'MG', 'GROSS'].map(function (o) { return '<option' + (o === (v || 'NNN') ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>';
    return '<input class="input' + (t === 'text' || t === 'date' ? '' : ' num') + '" ' + attr + '="' + k + '" data-t="' + t + '"' + (t === 'date' ? ' type="date"' : '') + ' value="' + esc(show(t, v)) + '" style="width:' + w + 'px" aria-label="' + esc(col[1]) + '">';
  }
  function gridHtml(id, title, cols, rows, attr, buttons, note) {
    return '<div class="panel"><div class="panel-head"><h3>' + title + '</h3><div class="row">' + buttons + '</div></div><div class="table-wrap" style="border:0;border-radius:0"><table class="t vgrid" id="' + id + '"><thead><tr><th>#</th>' + cols.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r, i) { return '<tr data-i="' + i + '"><td class="muted num">' + (i + 1) + '</td>' + cols.map(function (c) { return '<td>' + cell(c, r, attr) + '</td>'; }).join('') + '<td><button class="btn btn-ghost btn-sm" type="button" data-del="' + i + '" aria-label="Remove row">&times;</button></td></tr>'; }).join('') : '<tr><td colspan="' + (cols.length + 2) + '" class="muted small">None yet.</td></tr>') +
      '</tbody></table></div>' + (note ? '<p class="xs muted" style="padding:10px 14px">' + note + '</p>' : '') + '</div>';
  }

  function renderForm() {
    var inp = state.inputs, res = isRes();
    inp.sales = inp.sales || {}; inp.sales.comps = inp.sales.comps || []; inp.income = inp.income || {}; inp.income.rentRoll = inp.income.rentRoll || [];
    el.form.innerHTML = '<div class="row"><span class="small muted">Valuing as</span><div class="seg" id="v-type"><button type="button" data-type="residential" aria-pressed="' + res + '">Residential</button><button type="button" data-type="commercial" aria-pressed="' + !res + '">Commercial</button></div></div>' +
      groups().map(function (g) {
        if (g[0] === '__comps') return gridHtml('v-comps', 'Comparable sales', res ? COMP_COLS_RES : COMP_COLS_COM, inp.sales.comps, 'data-c', '<button class="btn btn-line btn-sm" type="button" id="c-suggest">Suggest from database</button><button class="btn btn-line btn-sm" type="button" id="c-paste">Paste CSV</button><button class="btn btn-ink btn-sm" type="button" id="c-add">Add comp</button>', 'Three to six closed sales within the last 12 months (24 for commercial). Adjustment percentages are positive when the comparable is inferior to the subject. Enter each comparable\'s assessed value to run the uniformity test.');
        if (g[0] === '__roll') return gridHtml('v-roll', 'Rent roll', ROLL_COLS, inp.income.rentRoll, 'data-r', '<button class="btn btn-ink btn-sm" type="button" id="r-add">Add line</button>', 'Enter rent as $/SF/yr, or as monthly rent per unit with a count for multifamily. A rent of 0 marks the space vacant.');
        return '<fieldset class="panel panel-pad" style="border:1px solid var(--line);margin:0"><legend class="eyebrow" style="padding:0 6px">' + esc(g[0]) + '</legend><div class="grid vfields" style="gap:12px">' + g[1].map(fieldHtml).join('') + '</div>' + (g[2] ? '<p class="xs muted" style="margin-top:10px">' + esc(g[2]) + '</p>' : '') + '</fieldset>';
      }).join('');
    el.form.querySelectorAll('[data-k]').forEach(function (i) { i.addEventListener(i.tagName === 'SELECT' || i.type === 'checkbox' || i.type === 'date' ? 'change' : 'input', onField); });
    el.form.querySelectorAll('[data-type]').forEach(function (b) { b.addEventListener('click', function () { var t = b.getAttribute('data-type'); if ((t === 'residential') === isRes()) return; set(state.inputs, 'subject.type', t); if (t === 'commercial' && !state.inputs.subject.assetClass) state.inputs.subject.assetClass = 'industrial'; renderForm(); recompute(); }); });
    bindGrid('#v-comps', inp.sales.comps, 'data-c');
    el.form.querySelector('#c-add').addEventListener('click', function () { inp.sales.comps.push({ condition: 3 }); renderForm(); touch(); });
    el.form.querySelector('#c-suggest').addEventListener('click', suggest);
    el.form.querySelector('#c-paste').addEventListener('click', pasteCsv);
    if (!res) { bindGrid('#v-roll', inp.income.rentRoll, 'data-r'); el.form.querySelector('#r-add').addEventListener('click', function () { inp.income.rentRoll.push({ label: 'New space', leaseType: 'NNN', escalation: 0.03 }); renderForm(); touch(); }); }
    placeholders();
  }
  function bindGrid(sel, rows, attr) {
    var tb = el.form.querySelector(sel + ' tbody'); if (!tb) return;
    function on(e) {
      var k = e.target.getAttribute(attr); if (!k) return;
      var tr = e.target.closest('tr'), row = rows[+tr.getAttribute('data-i')], v = read(e.target.getAttribute('data-t'), e.target.value);
      if (v === undefined) delete row[k]; else row[k] = v;
      if (attr === 'data-r') { if (k === 'rentPsfYr' && v !== undefined) delete row.rentMonthly; if (k === 'rentMonthly' && v !== undefined) delete row.rentPsfYr; row.vacant = !((row.rentPsfYr || 0) > 0 || (row.rentMonthly || 0) > 0); }
      touch();
    }
    tb.addEventListener('input', on); tb.addEventListener('change', on);
    tb.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', function () { rows.splice(+b.getAttribute('data-del'), 1); renderForm(); touch(); }); });
  }
  function placeholders() {
    el.form.querySelectorAll('input[data-k]').forEach(function (i) {
      var t = i.getAttribute('data-t'); if (t === 'bool' || t === 'text' || t === 'date') return;
      var rv = resolved(i.getAttribute('data-k'));
      i.placeholder = rv === undefined || rv === null || rv === '' ? '' : String(show(t, typeof rv === 'number' ? (t === 'pct' ? rv : Math.round(rv * 100) / 100) : rv));
    });
  }
  function onField(e) {
    var t = e.target, k = t.getAttribute('data-k'), type = t.getAttribute('data-t');
    var v = type === 'bool' ? t.checked : read(type, t.value);
    if (type === 'select' && /condition|quality/.test(k)) v = +v;
    set(state.inputs, k, v);
    if (k === 'subject.assetClass' || k === 'assignment.purpose' || k === 'subject.propertyType') { recompute(); renderForm(); return; }
    touch();
  }
  var timer = null;
  function touch() { state.saved = false; clearTimeout(timer); timer = setTimeout(recompute, 180); }
  function recompute() {
    try { state.result = E.analyze(state.inputs); } catch (err) { console.error(err); return; }
    renderResults(); placeholders();
  }

  function renderResults() {
    var r = state.result, R = r.reconciliation, AX = r.assessment;
    var rows = R.rows.map(function (x) { return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;font-size:.88rem;align-items:baseline"><span>' + esc(x.label) + '</span><span class="num">' + (x.developed ? F.usd(x.value) : '<span class="muted xs">' + esc(x.reason || 'n/a') + '</span>') + '</span><span class="chip">' + (x.developed ? F.pct(x.weight, 0) : '—') + '</span></div>'; }).join('');
    var flags = (r.sales.comps || []).reduce(function (s, c) { return s + c.flags.length; }, 0);
    el.results.innerHTML = '<div class="panel"><div class="panel-pad stack" style="gap:14px"><div class="row" style="justify-content:space-between;align-items:center;flex-wrap:nowrap"><div class="stack" style="gap:4px;min-width:0"><span class="eyebrow">Indicated market value</span><span class="num" style="font-size:1.9rem;font-weight:700;letter-spacing:-.02em">' + (R.final ? F.usd(R.final) : '—') + '</span><span class="xs muted">' + (R.final ? F.usd(R.low) + ' to ' + F.usd(R.high) + (R.perSf ? ' · $' + R.perSf.toFixed(2) + '/SF' : '') : 'Add comparables or income data') + '</span></div><div style="width:120px;flex:none">' + window.PReport.gauge(R.confidence, R.confidence >= 80 ? 'good' : R.confidence >= 60 ? 'warn' : 'bad') + '</div></div>' +
      '<div class="xs muted" style="margin-top:-8px;text-align:right">Confidence: ' + R.confidenceLabel + '</div><hr class="divider"><div class="stack" style="gap:8px">' + rows + '</div>' +
      (AX ? '<hr class="divider"><div class="stack" style="gap:8px"><div class="row" style="justify-content:space-between"><span class="eyebrow">Assessment test</span><span class="verdict ' + (AX.recommendation.tone === 'info' ? 'good' : AX.recommendation.tone) + '" style="font-size:.78rem;padding:6px 10px">' + esc(AX.recommendation.label) + '</span></div>' +
        '<dl class="kv"><dt>Assessed</dt><dd>' + F.usd(AX.total) + '</dd><dt>Over (under)</dt><dd class="' + (AX.variance > 0 ? 'tone-bad' : 'tone-good') + '">' + F.usd(AX.variance) + ' (' + F.pct(AX.variancePct) + ')</dd><dt>Tax reduction / yr</dt><dd>' + F.usd(AX.annualSavings) + '</dd>' + (r.equity ? '<dt>Peer ratio vs. subject</dt><dd>' + F.pct(r.equity.medianRatio, 0) + ' vs. ' + F.pct(r.equity.subjectRatio, 0) + '</dd>' : '') + '</dl></div>' : '') +
      '<hr class="divider"><div class="stack" style="gap:6px">' + R.factors.slice(0, 5).map(function (f) { return '<div class="row xs" style="justify-content:space-between;flex-wrap:nowrap"><span class="muted">' + esc(f.text) + '</span><span class="num tone-bad">' + f.points + '</span></div>'; }).join('') + (flags ? '<div class="xs tone-warn">' + flags + ' comparable flag' + (flags > 1 ? 's' : '') + ' (see the full report)</div>' : '') + '</div>' +
      '<div class="row"><button class="btn btn-primary" id="v-save">' + (state.id ? 'Save changes' : 'Save review') + '</button><button class="btn btn-ink" id="v-full">Full report</button></div><p class="xs muted">Not an appraisal. A desktop analysis for the intended use you select.</p></div></div>';
    el.results.querySelector('#v-save').addEventListener('click', function () { save().then(function (id) { if (id) U.toast('Saved'); }); });
    el.results.querySelector('#v-full').addEventListener('click', function () { save().then(function (id) { if (id) location.href = U.ROOT + 'app/report.html?id=' + id; }); });
  }

  function save() {
    return U.me().then(function (u) {
      if (!u) { try { sessionStorage.setItem('parcelyst-pending-val', JSON.stringify(state.inputs)); } catch (e) { /* ignore */ } location.href = U.ROOT + 'auth.html?mode=signup&next=' + encodeURIComponent(U.ROOT + 'app/valuation.html?pending=1'); return null; }
      var title = 'Valuation review: ' + ([state.inputs.address, state.inputs.city].filter(Boolean).join(', ') || 'untitled');
      return U.api('POST', '/api/analyze', { inputs: state.inputs, id: state.id || undefined, title: title }).then(function (j) { state.id = j.id; state.saved = true; history.replaceState(null, '', U.ROOT + 'app/valuation.html?id=' + j.id); return j.id; }).catch(function (e) { U.errorHandler(e); return null; });
    });
  }

  function suggest() {
    var S = state.inputs.subject || {}, res = isRes();
    U.api('POST', '/api/comps', { subject: { assetType: res ? (S.propertyType || 'SFR') : CLASS_ASSET[S.assetClass || 'industrial'], sf: S.sf, yearBuilt: S.yearBuilt, zip: state.inputs.zip, market: state.inputs.marketId || (state.result && state.result.assumptions.marketId), locality: state.inputs.localityId || (state.result && state.result.assumptions.localityId), address: state.inputs.address } }).then(function (j) {
      if (!j.comps.length) return U.toast(j.message || 'No recent sales of this type were found nearby. Enter comparables manually.', true);
      U.modal('<span class="eyebrow">Candidate sales</span><h3>Pick comparables to add</h3>' + (j.demo ? '<div class="notice warn xs"><div>These are synthetic demo records. Connect a data provider or import sold data to get real sales.</div></div>' : '') +
        '<div class="stack" style="gap:8px">' + j.comps.map(function (c, i) { return '<label class="check" style="align-items:flex-start"><input type="checkbox" data-pick="' + i + '" checked><span><strong>' + esc(c.address) + '</strong><span class="xs muted" style="display:block">' + esc(c.saleDate) + ' · ' + F.usd(c.salePrice) + (c.sf ? ' · ' + F.n(c.sf) + ' SF · $' + (c.salePrice / c.sf).toFixed(0) + '/SF' : '') + (c.yearBuilt ? ' · built ' + c.yearBuilt : '') + '</span></span></label>'; }).join('') + '</div>' +
        '<div class="row"><button class="btn btn-primary" id="pick-go">Add selected</button><button class="btn btn-line" data-close>Cancel</button></div>', function (body, close) {
        body.querySelector('#pick-go').onclick = function () { body.querySelectorAll('[data-pick]:checked').forEach(function (b) { state.inputs.sales.comps.push(j.comps[+b.getAttribute('data-pick')]); }); close(); renderForm(); touch(); };
      });
    }).catch(U.errorHandler);
  }

  var CSV_MAP = { address: ['address', 'property address', 'street address', 'location'], saleDate: ['sale date', 'sold date', 'close date', 'closing date', 'date'], salePrice: ['sale price', 'sold price', 'close price', 'price'], sf: ['sf', 'sqft', 'building sf', 'gla', 'living area', 'square feet', 'rba', 'building size'], units: ['units'], lotAcres: ['acres', 'lot acres', 'land acres'], yearBuilt: ['year built', 'built'], beds: ['beds', 'bedrooms'], baths: ['baths', 'bathrooms'], garage: ['garage'], assessed: ['assessed', 'assessed value', 'assessment'], capRate: ['cap rate', 'cap'], noi: ['noi'], occupancyPct: ['occupancy', 'occupancy %', 'leased %'], distanceMi: ['distance', 'miles'], rent: ['rent', 'monthly rent'] };
  function pasteCsv() {
    U.modal('<span class="eyebrow">Import comparables</span><h3>Paste rows from MLS, CoStar, Crexi or the assessor</h3><p class="small muted">Include a header row. Recognized columns: address, sale date, sale price, SF, units, acres, year built, beds, baths, assessed value, cap rate, NOI, occupancy, distance.</p><textarea class="input mono" id="csv-in" rows="8" placeholder="Address,Sale Date,Sale Price,SF,Year Built,Assessed Value"></textarea><div class="row"><button class="btn btn-primary" id="csv-go">Add comparables</button><button class="btn btn-line" data-close>Cancel</button></div>', function (body, close) {
      body.querySelector('#csv-go').onclick = function () {
        var txt = body.querySelector('#csv-in').value; if (txt.indexOf('\t') !== -1 && txt.indexOf(',') === -1) txt = txt.replace(/\t/g, ',');
        var rows = window.PCsv.parse(txt); if (rows.length < 2) return U.toast('Paste a header row and at least one sale', true);
        var hs = rows[0].map(function (h) { return String(h).toLowerCase().replace(/[_]+/g, ' ').trim(); }), map = {};
        Object.keys(CSV_MAP).forEach(function (k) { for (var s = 0; s < CSV_MAP[k].length && map[k] === undefined; s++) { var i = hs.indexOf(CSV_MAP[k][s]); if (i !== -1) map[k] = i; } });
        if (map.address === undefined || map.salePrice === undefined) return U.toast('Could not find Address and Sale Price columns', true);
        var n = 0;
        rows.slice(1).forEach(function (r) {
          var c = { condition: 3, source: 'Pasted by reviewer' };
          Object.keys(map).forEach(function (k) { var raw = String(r[map[k]] || '').trim(); if (!raw) return; if (k === 'address') c.address = raw; else if (k === 'saleDate') { var d = new Date(raw); c.saleDate = isNaN(d) ? raw : d.toISOString().slice(0, 10); } else { var x = parseFloat(raw.replace(/[$,%\s]/g, '')); if (!isNaN(x)) c[k] = (k === 'capRate' || k === 'occupancyPct') && x > 1 ? x / 100 : x; } });
          if (c.address && c.salePrice) { state.inputs.sales.comps.push(c); n++; }
        });
        close(); renderForm(); touch(); U.toast(n + ' comparable' + (n === 1 ? '' : 's') + ' added');
      };
    });
  }

  function start(inputs) {
    state.inputs = inputs; state.inputs.kind = 'valuation';
    el.work.hidden = false; el.empty.hidden = true;
    state.result = E.analyze(state.inputs);
    renderForm(); renderResults();
  }
  function blank(type, rec) {
    return U.me().then(function (u) {
      var b = (u && u.branding) || {};
      var inp = V.fromRecord(rec || {}, { type: type, firm: b.brokerage || '', preparedBy: b.name || (u && u.name) || '' });
      if (!rec) inp.subject.type = type;
      return inp;
    });
  }
  function lookup(address, kind) {
    el.status.innerHTML = '<span class="spinner"></span> Pulling records for ' + esc(address) + '…';
    U.api('POST', '/api/lookup', { address: address }).then(function (j) {
      el.status.innerHTML = j.record ? (j.record.source === 'demo' ? '<div class="notice warn"><div>This is a synthetic demo record. Replace its figures with the real subject data.</div></div>' : '') : '<div class="notice warn"><div>No record found. Enter the subject details below.</div></div>';
      var parts = address.split(',');
      var rec = j.record || { address: parts[0].trim(), city: (parts[1] || '').trim(), state: ((parts[2] || '').trim().split(' ')[0] || '').toUpperCase(), zip: ((address.match(/\b\d{5}\b/) || [])[0] || '') };
      return blank(kind === 'commercial' ? 'commercial' : 'residential', rec).then(start);
    }).catch(function (e) { el.status.innerHTML = ''; U.errorHandler(e); });
  }

  function init() {
    el.form = document.getElementById('form'); el.results = document.getElementById('results'); el.work = document.getElementById('work'); el.empty = document.getElementById('empty'); el.status = document.getElementById('status');
    U.addressBox(document.getElementById('search'), { go: lookup, cta: 'Start review', id: 'v-addr' });
    var landBtn = document.querySelector('#search [data-kind="land"]'); if (landBtn) landBtn.remove();
    document.getElementById('manual').addEventListener('click', function () { var k = document.querySelector('#search [aria-pressed="true"]').getAttribute('data-kind'); blank(k === 'commercial' ? 'commercial' : 'residential').then(start); });
    document.querySelectorAll('[data-sample]').forEach(function (b) { b.addEventListener('click', function () { state.id = null; history.replaceState(null, '', U.ROOT + 'app/valuation.html'); start(JSON.parse(JSON.stringify(window.PSamples[b.getAttribute('data-sample')].inputs))); }); });
    var id = U.qs('id'), prop = U.qs('property'), sample = U.qs('sample');
    if (id) U.api('GET', '/api/analyses/' + encodeURIComponent(id)).then(function (j) { state.id = id; state.saved = true; start(j.analysis.inputs); }).catch(U.errorHandler);
    else if (prop) U.api('GET', '/api/property/' + encodeURIComponent(prop)).then(function (j) { return blank(null, j.record).then(start); }).catch(U.errorHandler);
    else if (sample && window.PSamples[sample]) start(JSON.parse(JSON.stringify(window.PSamples[sample].inputs)));
    else if (U.qs('pending')) { try { var p = JSON.parse(sessionStorage.getItem('parcelyst-pending-val')); sessionStorage.removeItem('parcelyst-pending-val'); if (p) { start(p); save(); } } catch (e) { /* ignore */ } }
  }
  window.PValuationUI = { init: init };
})();
