/* Renders an engine result as the full investment report (residential, commercial, land). */
(function () {
  'use strict';
  var U = window.PUI, F = U.fmt, esc = U.esc;

  // ---------- small SVG charts ----------
  function gauge(score, tone) {
    var r = 70, c = Math.PI * r, frac = Math.max(0, Math.min(1, score / 100));
    var col = tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--warn)' : 'var(--bad)';
    return '<svg viewBox="0 0 180 112" class="chart" style="max-width:220px" role="img" aria-label="Investment score ' + score + ' of 100">' +
      '<path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="var(--line)" stroke-width="14" stroke-linecap="round"/>' +
      '<path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="' + col + '" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (c * frac).toFixed(1) + ' ' + c.toFixed(1) + '"/>' +
      '<text x="90" y="84" text-anchor="middle" style="font:700 34px var(--mono);fill:var(--ink)">' + score + '</text><text x="90" y="104" text-anchor="middle">OUT OF 100</text></svg>';
  }
  function lineChart(series, labels, opts) {
    opts = opts || {};
    var W = 640, H = 240, L = 64, R = 16, T = 14, B = 30;
    var all = []; series.forEach(function (s) { all = all.concat(s.values); });
    var min = Math.min.apply(null, all.concat([opts.zero ? 0 : Infinity])), max = Math.max.apply(null, all);
    if (min === max) { max = min + 1; }
    var pad = (max - min) * 0.08; min -= pad; max += pad;
    var nx = labels.length - 1 || 1;
    function X(i) { return L + (W - L - R) * i / nx; } function Y(v) { return T + (H - T - B) * (1 - (v - min) / (max - min)); }
    var ticks = 4, g = '';
    for (var t = 0; t <= ticks; t++) { var v = min + (max - min) * t / ticks, y = Y(v); g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text x="' + (L - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + F.usd(v, { compact: true }) + '</text>'; }
    labels.forEach(function (lb, i) { if (labels.length <= 12 || i % 2 === 0) g += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lb) + '</text>'; });
    var paths = series.map(function (s) {
      var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' ');
      var area = s.area ? '<path d="' + d + ' L' + X(s.values.length - 1).toFixed(1) + ' ' + Y(Math.max(min, 0)).toFixed(1) + ' L' + X(0).toFixed(1) + ' ' + Y(Math.max(min, 0)).toFixed(1) + ' Z" fill="' + s.color + '" opacity=".1"/>' : '';
      var last = s.values.length - 1;
      return area + '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.5"' + (s.dash ? ' stroke-dasharray="5 4"' : '') + '/><circle cx="' + X(last).toFixed(1) + '" cy="' + Y(s.values[last]).toFixed(1) + '" r="4" fill="' + s.color + '"/>';
    }).join('');
    var legend = '<div class="row xs" style="gap:16px;margin-top:6px">' + series.map(function (s) { return '<span class="row" style="gap:6px"><i style="width:14px;height:3px;background:' + s.color + ';display:inline-block"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="' + esc(opts.label || 'Chart') + '">' + g + paths + '</svg>' + legend;
  }
  function hbars(rows) {
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); }).concat([1]));
    return '<div class="stack" style="gap:8px">' + rows.map(function (r) {
      var w = Math.max(2, Math.abs(r.value) / max * 100);
      return '<div style="display:grid;grid-template-columns:minmax(90px,170px) minmax(0,1fr) 96px;gap:10px;align-items:center;font-size:.85rem"><span class="muted">' + esc(r.label) + '</span><span style="height:18px;background:var(--line-2);border-radius:3px;overflow:hidden"><i style="display:block;height:100%;width:' + w.toFixed(1) + '%;background:' + (r.color || (r.value >= 0 ? 'var(--good)' : 'var(--bad)')) + '"></i></span><span class="num" style="text-align:right;font-weight:600">' + (r.fmt ? r.fmt(r.value) : F.usd(r.value)) + '</span></div>';
    }).join('') + '</div>';
  }
  function table(head, rows, opts) {
    opts = opts || {};
    return '<div class="table-wrap"><table class="t' + (opts.cls ? ' ' + opts.cls : '') + '"><thead><tr>' + head.map(function (h, i) { return '<th' + (opts.num && opts.num.indexOf(i) !== -1 ? ' class="n"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { var cls = r._cls ? ' class="' + r._cls + '"' : ''; var cells = r._cells || r; return '<tr' + cls + '>' + cells.map(function (c, i) { return '<td' + (opts.num && opts.num.indexOf(i) !== -1 ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function kv(pairs) { return '<dl class="kv">' + pairs.map(function (p) { return '<dt>' + p[0] + '</dt><dd' + (p[2] ? ' class="' + p[2] + '"' : '') + '>' + p[1] + '</dd>'; }).join('') + '</dl>'; }
  function toneCls(v, good, bad) { return v === null || v === undefined ? '' : v >= good ? 'tone-good' : v <= bad ? 'tone-bad' : 'tone-warn'; }
  function signed(v) { return '<span class="' + (v >= 0 ? 'tone-good' : 'tone-bad') + '">' + F.usd(v) + '</span>'; }
  function tile(label, value, tone) { return '<div><div class="tone-bar ' + (tone ? 'bg-' + tone : '') + '"></div><div class="stat"><span class="v' + (tone ? ' tone-' + tone : '') + '">' + value + '</span><span class="k">' + label + '</span></div></div>'; }
  function sec(no, title, sub, body, opts) { opts = opts || {}; return '<section class="rsec' + (opts.pb ? ' pb' : '') + '" id="' + (opts.id || '') + '"><h2><span class="sec-no">' + no + '</span>' + title + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</section>'; }
  function insights(list) { return '<div class="stack">' + list.map(function (i) { return '<div class="insight"><i class="bg-' + i.tone + '"></i><div><h4>' + esc(i.title) + '</h4><p>' + esc(i.text) + '</p></div></div>'; }).join('') + '</div>'; }
  function factorTable(factors) {
    return table(['Factor', 'Value', 'Benchmark', 'Max', 'Earned', 'Rating'], factors.map(function (f) {
      var t = f.rating === 'Strong' ? 'good' : f.rating === 'Fair' ? 'warn' : 'bad';
      return [esc(f.label), F.by(f.fmt, f.value), '<span class="muted small">' + esc(f.bench || '') + '</span>', f.max, '<strong>' + f.earned + '</strong>', '<span class="chip ' + t + '">' + f.rating + '</span>'];
    }), { num: [1, 3, 4] });
  }
  function targetsTable(targets, price) {
    return table(['Rating', 'Score', 'Price needed', 'vs. asking'], [{ _cls: 'hl', _cells: ['Current', '', F.usd(price), 'Asking'] }].concat(targets.map(function (t) {
      return [esc(t.label), t.score + '+', t.achievable ? F.usd(t.price) : '<span class="muted">Not achievable</span>', t.achievable ? '<span class="' + (t.discount >= 0 ? 'tone-good' : 'tone-bad') + '">' + (t.discount >= 0 ? '+' : '') + F.pct(t.discount) + '</span>' : '—'];
    })), { num: [1, 2, 3] });
  }
  function sourcesTable(a, extra) {
    var labels = { price: 'Purchase price', taxAnnual: 'Property tax', rate: 'Interest rate', rentMonthly: 'Market rent', insuranceAnnual: 'Insurance', vacancyPct: 'Vacancy', appreciation: 'Appreciation', rentGrowth: 'Rent growth', maintenancePct: 'Maintenance', capexPct: 'CapEx reserve', mgmtPct: 'Management', marketCap: 'Market cap rate', marketRentPsf: 'Market rent / SF', rentRoll: 'Rent roll', expenses: 'Operating expenses', finishedLotValue: 'Finished lot value', devCostPerLot: 'Development cost / lot', impactFeePerLot: 'Impact fees / proffers', carryTaxRate: 'Carry tax rate' };
    var s = a.sources || {};
    var rows = Object.keys(s).map(function (k) { return [esc(labels[k] || k), '<span class="src-cell">' + esc(s[k]) + '</span>']; });
    (extra || []).forEach(function (e) { rows.push(e); });
    if (!rows.length) rows.push(['All inputs', '<span class="src-cell">Entered by user</span>']);
    return table(['Input', 'Source'], rows);
  }
  function brandStrip(b) {
    if (!b || !(b.name || b.brokerage)) return '';
    return '<div class="brand-strip">' + (b.photoUrl ? '<img src="' + esc(b.photoUrl) + '" alt="">' : '') + '<div style="min-width:0"><strong>' + esc(b.name || '') + '</strong>' + (b.title ? ' · ' + esc(b.title) : '') + '<div class="small muted">' + [b.brokerage, b.phone, b.email, b.license ? 'Lic. ' + b.license : ''].filter(Boolean).map(esc).join(' · ') + '</div></div></div>';
  }
  function cover(r, title, sideRows, metrics, opts) {
    var a = r.assumptions;
    return '<section class="rsec cover"><div class="c-main"><span class="eyebrow">' + esc(opts.eyebrow) + '</span><h1>' + esc(title) + '</h1><div class="muted">' + esc([a.city, a.state, a.zip].filter(Boolean).join(', ')) + '</div>' +
      '<div class="row" style="gap:18px;align-items:flex-end"><div class="price">' + F.usd(opts.price !== undefined ? opts.price : a.price) + '</div><span class="verdict ' + r.verdict.tone + '">' + esc(r.verdict.label) + '</span></div>' +
      '<div class="tiles">' + metrics.join('') + '</div></div>' +
      '<div class="c-side"><div class="tb" style="display:grid;place-items:center">' + gauge(r.score, r.verdict.tone) + '</div>' + sideRows.map(function (s) { return '<div class="tb"><div class="tb-label">' + s[0] + '</div><div class="num">' + s[1] + '</div></div>'; }).join('') + '</div></section>';
  }
  function disclaimer() {
    return sec('', 'Disclaimer', '', '<ol class="small muted" style="margin:0;padding-left:18px;display:grid;gap:6px"><li>Projections are estimates built from the inputs and sources listed above. They are not guarantees of future performance.</li><li>Reference defaults (tax rates, insurance, vacancy, appreciation, cap rates, lot values) are reviewed periodically and can lag the market. Verify locally before you commit capital.</li><li>Rent and value estimates for demo records are synthetic. Live estimates require a connected data provider.</li><li>Tax figures are simplified and ignore passive-loss limits, AMT, state tax and depreciation recapture timing beyond what is shown. Consult a CPA.</li><li>This report is for information only and is not investment, legal, appraisal or tax advice.</li></ol>');
  }
  function taxCta(partner) {
    return '<div class="notice"><div style="min-width:0"><strong>Want the tax savings verified?</strong> ' + (partner && partner.name ? esc(partner.name) + ' reviews depreciation, cost segregation and entity structure for investors.' : 'Have a CPA confirm depreciation, cost segregation and passive-loss treatment before you buy.') +
      ' <a href="#" class="tax-ref no-print">Request a tax review</a></div></div>';
  }

  // =========================== RESIDENTIAL ===========================
  function residential(r, opts) {
    var a = r.assumptions, y = r.year1, p = r.projection, m = r.metrics;
    var title = a.address || 'Residential property';
    var out = [];
    out.push(cover(r, title, [['Property', esc(a.propertyType) + (a.units > 1 ? ' · ' + a.units + ' units' : '')], ['Beds / Baths / SqFt', a.beds + ' / ' + a.baths + ' / ' + F.n(a.sqft)], ['Year built', a.yearBuilt || '—'], ['Analysis date', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })]],
      [tile('Cap rate', F.pct(m.cap), m.cap >= 0.06 ? 'good' : m.cap >= 0.04 ? 'warn' : 'bad'), tile('Cash flow / mo', F.usd(m.cfMonthly), m.cfMonthly > 100 ? 'good' : m.cfMonthly >= -50 ? 'warn' : 'bad'), tile('Cash-on-cash', F.pct(m.coc), m.coc >= 0.08 ? 'good' : m.coc >= 0.04 ? 'warn' : 'bad'), tile(a.holdYears + '-yr IRR', F.pct(m.irr), (m.irr || 0) >= 0.12 ? 'good' : (m.irr || 0) >= 0.07 ? 'warn' : 'bad')],
      { eyebrow: 'Residential investment analysis' }));
    if (opts.branding) out.push(brandStrip(opts.branding));
    out.push(sec('01', 'Executive summary', 'Six weighted factors produce the 0-100 investment score. Each is rated against common lender and investor benchmarks.',
      '<div class="cards2"><div class="stack">' + factorTable(r.factors) + '</div><div class="stack">' + insights(r.insights.slice(0, 3)) + '</div></div>'));
    // free sections end here
    var locked = [];
    locked.push(sec('02', 'Operating statement', 'Year-one income and expenses. Every line is editable in the analyzer.',
      '<div class="cards2"><div>' + table(['Income', 'Annual'], [['Gross scheduled rent', F.usd(y.gross)], ['Less vacancy (' + F.pct(a.vacancyPct) + ')', F.usd(-y.vacancyLoss)], { _cls: 'total', _cells: ['Effective gross income', F.usd(y.egi)] }], { num: [1] }) + '</div>' +
      '<div>' + table(['Expense', 'Annual', 'Monthly'], [['Property tax', F.usd(y.expenses.tax), F.usd(y.expenses.tax / 12)], ['Insurance', F.usd(y.expenses.insurance), F.usd(y.expenses.insurance / 12)], ['HOA', F.usd(y.expenses.hoa), F.usd(y.expenses.hoa / 12)], ['Owner-paid utilities', F.usd(y.expenses.utilities), F.usd(y.expenses.utilities / 12)], ['Maintenance (' + F.pct(a.maintenancePct, 0) + ')', F.usd(y.expenses.maintenance), F.usd(y.expenses.maintenance / 12)], ['CapEx reserve (' + F.pct(a.capexPct, 0) + ')', F.usd(y.expenses.capex), F.usd(y.expenses.capex / 12)], ['Management (' + F.pct(a.mgmtPct, 0) + ')', F.usd(y.expenses.management), F.usd(y.expenses.management / 12)], { _cls: 'total', _cells: ['Total operating expenses', F.usd(y.opex), F.usd(y.opex / 12)] }], { num: [1, 2] }) + '</div></div>' +
      '<div class="tiles">' + tile('Net operating income', F.usd(y.noi)) + tile('Gross yield', F.pct(m.grossYield)) + tile('GRM', F.x(m.grm, 1)) + tile('Rent / price (1% rule)', F.pct(m.onePct, 2), m.onePct >= 0.01 ? 'good' : m.onePct >= 0.007 ? 'warn' : 'bad') + '</div>'));
    locked.push(sec('03', 'Financing', a.cash ? 'All-cash purchase.' : F.pct(a.downPct, 0) + ' down, ' + a.termYears + '-year fixed at ' + F.pct(a.rate, 2) + '.',
      '<div class="cards2"><div>' + kv([['Down payment', F.usd(a.price * a.downPct)], ['Loan amount', F.usd(y.loan)], ['Closing costs (' + F.pct(a.closingPct, 0) + ')', F.usd(a.price * a.closingPct)], ['Rehab budget', F.usd(a.rehab)], ['<strong>Total cash invested</strong>', '<strong>' + F.usd(y.cash) + '</strong>'], ['Principal & interest', F.usd(y.piMonthly) + '/mo'], ['PITI + HOA', F.usd(y.pitiMonthly) + '/mo'], ['DSCR', F.x(y.dscr), toneCls(y.dscr, 1.25, 1.0)], ['Break-even occupancy', F.pct(y.breakEvenOcc), y.breakEvenOcc <= 0.85 ? 'tone-good' : y.breakEvenOcc > 1 ? 'tone-bad' : 'tone-warn']]) + '</div>' +
      '<div class="stack"><h4>Rent vs. monthly outflow</h4>' + hbars([{ label: 'Gross rent', value: a.rentMonthly + a.otherIncomeMonthly, color: 'var(--good)' }, { label: 'PITI + HOA', value: y.pitiMonthly, color: 'var(--plat)' }, { label: 'All costs + debt', value: y.opex / 12 + y.piMonthly, color: 'var(--bad)' }]) +
      '<p class="small muted">Monthly cash flow after every expense and debt service: <strong class="' + (y.cfMonthly >= 0 ? 'tone-good' : 'tone-bad') + '">' + F.usd(y.cfMonthly) + '</strong>.</p></div></div>'));
    var labels = ['Today'].concat(p.rows.map(function (q) { return 'Y' + q.year; }));
    locked.push(sec('04', 'Value, equity and cash flow projection', 'Appreciation at ' + F.pct(a.appreciation) + '/yr, rent growth ' + F.pct(a.rentGrowth) + '/yr, expense growth ' + F.pct(a.expenseGrowth) + '/yr.',
      lineChart([{ name: 'Property value', values: [a.estValue || a.price].concat(p.rows.map(function (q) { return q.value; })), color: 'var(--plat)', area: true }, { name: 'Equity', values: [a.price * a.downPct + Math.max(0, (a.estValue || a.price) - a.price)].concat(p.rows.map(function (q) { return q.equity; })), color: 'var(--good)' }, { name: 'Loan balance', values: [y.loan].concat(p.rows.map(function (q) { return q.balance; })), color: 'var(--ink-3)', dash: true }], labels, { label: 'Projection' }) +
      table(['Year', 'Value', 'Loan', 'Equity', 'NOI', 'Cash flow', 'Cumulative CF'], p.rows.map(function (q) { return { _cls: q.year === a.holdYears ? 'hl' : '', _cells: [q.year, F.usd(q.value), F.usd(q.balance), F.usd(q.equity), F.usd(q.noi), signed(q.cf), signed(q.cumCf)] }; }), { num: [1, 2, 3, 4, 5, 6] }), { pb: true }));
    var comp = [{ label: 'Appreciation', value: p.appreciationGain, color: 'var(--plat)' }, { label: 'Principal paydown', value: p.principalPaydown, color: 'var(--good)' }, { label: 'Net cash flow', value: p.cumCf }, { label: 'Selling costs', value: -p.sellCost }, { label: 'Closing + rehab', value: -(a.price * a.closingPct + a.rehab) }];
    locked.push(sec('05', 'Total return', 'Combined return from income, paydown and appreciation over a ' + a.holdYears + '-year hold, net of ' + F.pct(a.sellingPct, 0) + ' selling costs.',
      '<div class="cards2"><div>' + kv([['Net operating cash flow', signed(p.cumCf)], ['Capital appreciation', signed(p.appreciationGain)], ['Principal paydown', signed(p.principalPaydown)], ['Sale price (year ' + a.holdYears + ')', F.usd(p.saleValue)], ['Less selling costs', F.usd(-p.sellCost)], ['Less loan payoff', F.usd(-p.payoff)], ['<strong>Net profit</strong>', '<strong>' + signed(p.profit) + '</strong>'], ['Total ROI', F.pct(p.roi)], ['IRR', F.pct(p.irr)], ['After-tax IRR', F.pct(r.tax.afterTaxIrr)], ['Equity multiple', F.x(p.equityMultiple)]]) + '</div><div class="stack"><h4>Where the return comes from</h4>' + hbars(comp) + '</div></div>'));
    locked.push(sec('06', 'Bidding scenarios', 'What each offer price does to cash flow at today\'s rate. Break-even is solved directly, not interpolated.',
      table(['Offer', 'vs. ask', 'Down', 'P&I / mo', 'OpEx / mo', 'Cash flow / mo', 'Cap', 'CoC', 'Status'], r.bidding.map(function (b) { return { _cls: b.premium === 0 ? 'hl' : '', _cells: [F.usd(b.price), b.premium === 0 ? 'Asking' : (b.premium > 0 ? '+' : '') + F.pct(b.premium, 0), F.usd(b.down), F.usd(b.piMonthly), F.usd(b.opexMonthly), signed(b.cfMonthly), F.pct(b.cap), F.pct(b.coc), '<span class="chip ' + (b.status === 'positive' ? 'good' : b.status === 'breakeven' ? 'warn' : 'bad') + '">' + (b.status === 'positive' ? 'Cash flows' : b.status === 'breakeven' ? 'Break-even' : 'Negative') + '</span>'] }; }), { num: [0, 1, 2, 3, 4, 5, 6, 7] }) +
      '<div class="notice"><div><strong>Cash-flow break-even price: ' + (r.breakEvenPrice ? F.usd(r.breakEvenPrice) + ' (' + F.pct(r.breakEvenPrice / a.price - 1) + ' vs. ask)' : 'not reachable at these rents') + '.</strong> Above this price the property needs a monthly subsidy at ' + F.pct(a.rate, 2) + ' with ' + F.pct(a.downPct, 0) + ' down.</div></div>' +
      '<h4>Price needed for each rating</h4>' + targetsTable(r.priceTargets, a.price), { pb: true }));
    var S = r.sensitivity;
    locked.push(sec('07', 'Sensitivity: price vs. interest rate', 'Monthly cash flow after PITI and operating costs. Your current scenario is outlined.',
      '<div class="table-wrap"><table class="t heat"><thead><tr><th>Rate \\ Price</th>' + S.prices.map(function (pp) { return '<th class="n">' + (pp.step === 0 ? 'Ask' : (pp.step > 0 ? '+' : '') + F.pct(pp.step, 0)) + '<br><span class="muted">' + F.usd(pp.price, { compact: true }) + '</span></th>'; }).join('') + '</tr></thead><tbody>' +
      S.grid.map(function (row, i) { return '<tr><th>' + F.pct(S.rates[i], 2) + '</th>' + row.map(function (v, j) { var cur = Math.abs(S.rates[i] - a.rate) < 1e-9 && S.prices[j].step === 0; var bg = v >= 100 ? 'var(--good-wash)' : v >= -50 ? 'var(--warn-wash)' : 'var(--bad-wash)'; return '<td class="' + (cur ? 'cur' : '') + '" style="background:' + bg + '">' + F.usd(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'));
    locked.push(sec('08', 'Scenario analysis', 'Conservative, base and optimistic cases flex appreciation, vacancy and rent growth together.',
      '<div class="cards3">' + r.scenarios.map(function (s) { return '<div class="card-t"><header class="' + (s.key === 'optimistic' ? 'good' : s.key === 'conservative' ? 'plat' : '') + '">' + s.label + '</header><div class="body">' + kv([['Appreciation', F.pct(s.appreciation)], ['Vacancy', F.pct(s.vacancy)], ['Rent growth', F.pct(s.rentGrowth)], ['Total profit', signed(s.profit)], ['IRR', F.pct(s.irr)], ['Equity multiple', F.x(s.equityMultiple)]]) + '</div></div>'; }).join('') + '</div>'));
    locked.push(sec('09', 'Fix & flip: maximum allowable offer', 'The most you can pay for each renovation tier and still hit a ' + F.pct(a.flipTargetRoi, 0) + ' return. Selling costs ' + F.pct(a.flipSellingPct, 0) + ' of ARV; buyer closing ' + F.pct(a.flipBuyerClosingPct, 0) + '.',
      '<div class="cards3">' + r.flip.map(function (t) { return '<div class="card-t' + (t.key === r.bestFlip.key ? ' best' : '') + '"><header class="' + (t.key === 'cosmetic' ? 'good' : t.key === 'major' ? 'bad' : '') + '">' + t.label + '</header><div class="body"><p class="xs muted">' + esc(t.desc) + '</p>' + kv([['Renovation ($' + t.psf + '/sf)', F.usd(t.reno)], ['Hold', t.months + ' months'], ['Holding costs', F.usd(t.holding)], ['After-repair value', F.usd(t.arv)], ['Selling costs', F.usd(-t.sellCost)], ['<strong>Max offer</strong>', '<strong>' + F.usd(t.mao) + '</strong>'], ['Discount to ask', F.pct(t.discount)], ['Profit at max offer', signed(t.profitAtMao)], ['Profit at ask', signed(t.profitAtAsk)], ['ROI at ask', F.pct(t.roiAtAsk)]]) + '<p class="xs muted">Renovation recoups ~' + Math.round(t.recoup * 100) + '% of cost in value.</p></div></div>'; }).join('') + '</div>' +
      '<div class="notice blaze"><div><strong>' + esc(r.bestFlip.label) + ': pay no more than ' + F.usd(r.bestFlip.mao) + '</strong> (' + F.pct(r.bestFlip.discount) + ' below asking) to clear a ' + F.pct(a.flipTargetRoi, 0) + ' return.</div></div>', { pb: true }));
    var alt = r.altIncome;
    locked.push(sec('10', 'Strategy fit', 'How the property scores for four common strategies, and the monthly cash flow each would produce.',
      '<div class="cards2">' + r.strategies.map(function (s) { return '<div class="card-t' + (s.key === r.bestStrategy ? ' best' : '') + '"><header class="' + (s.key === r.bestStrategy ? 'good' : '') + '">' + s.label + (s.key === r.bestStrategy ? ' (best fit)' : '') + '<span class="mono">' + '&#9733;'.repeat(s.stars) + '<span style="opacity:.35">' + '&#9733;'.repeat(5 - s.stars) + '</span></span></header><div class="body"><ul class="pts">' + s.points.map(function (pt) { return '<li class="' + (pt.good ? 'good' : '') + '">' + esc(pt.text) + '</li>'; }).join('') + '</ul></div></div>'; }).join('') + '</div>' +
      table(['', 'Gross / mo', 'OpEx / mo', 'Debt / mo', 'Cash flow / mo'], ['ltr', 'houseHack', 'strLow', 'strHigh'].map(function (k) { var o = alt[k]; return [esc(o.label), F.usd(o.gross), F.usd(o.opex), F.usd(o.debt), signed(o.cf)]; }), { num: [1, 2, 3, 4] }) +
      '<p class="xs muted">' + esc(alt.houseHack.note) + ' Short-term rental assumes ' + a.strMultLow + 'x and ' + a.strMultHigh + 'x long-term rent with 30% higher operating costs plus 12% of rent for cleaning and platform fees. Check local STR rules.</p>'));
    var t = r.tax;
    locked.push(sec('11', 'Tax benefits', 'Residential rental property depreciates over 27.5 years. Land (' + F.pct(a.landPct, 0) + ' of price) does not depreciate.',
      '<div class="cards2"><div>' + kv([['Depreciable basis', F.usd(t.building)], ['Annual depreciation', F.usd(t.annualDepreciation)], ['Depreciation tax shield (' + F.pct(t.marginalTaxRate, 0) + ')', F.usd(t.depreciationShield) + '/yr'], ['Year-1 NOI', F.usd(t.year1.noi)], ['Less mortgage interest', F.usd(-t.year1.interest)], ['Less depreciation', F.usd(-t.year1.depreciation)], ['<strong>Year-1 taxable income</strong>', '<strong>' + F.usd(t.year1.taxable) + '</strong>'], ['Tax effect year 1', signed(t.year1.taxEffect)], ['Pre-tax IRR', F.pct(p.irr)], ['After-tax IRR (incl. recapture)', F.pct(t.afterTaxIrr)]]) + '</div>' +
      '<div class="stack"><h4>Cost segregation estimate</h4>' + kv([['Reclassified to 5/7/15-yr (~' + F.pct(t.costSeg.pct, 0) + ')', F.usd(t.costSeg.accelerated)], ['Bonus depreciation', F.pct(t.costSeg.bonusPct, 0)], ['Year-1 deduction with study', F.usd(t.costSeg.year1Deduction)], ['Extra year-1 deduction', F.usd(t.costSeg.extraYear1)], ['Value at ' + F.pct(t.marginalTaxRate, 0) + ' bracket', F.usd(t.costSeg.extraYear1Value)]]) +
      '<p class="xs muted">Rental losses are passive. Up to $25,000 can offset ordinary income for active participants with MAGI under $100k, phasing out by $150k. Real estate professionals and short-term rental owners may qualify for different treatment.</p>' + taxCta(opts.partner) + '</div></div>', { pb: true }));
    locked.push(sec('12', 'Versus the alternatives', 'The same ' + F.usd(y.cash) + ' of cash in risk-free and bank instruments for ' + a.holdYears + ' years, at current published rates.',
      table(['', 'Annual return', 'Ending value', 'Profit'], r.alternatives.map(function (x) { return { _cls: x.key === 'property' ? 'hl' : '', _cells: [esc(x.label), F.pct(x.rate, 2), F.usd(x.final), signed(x.profit)] }; }), { num: [1, 2, 3] }) +
      (r.appreciationShare !== null && r.appreciationShare > 0.7 ? '<div class="notice warn"><div><strong>Appreciation-dependent return.</strong> ' + Math.round(r.appreciationShare * 100) + '% of the projected profit comes from price appreciation, which is not guaranteed. The cap rate (' + F.pct(m.cap) + ') ' + (m.cap < a.rates.treasury5y ? 'is below' : 'is above') + ' the 5-year Treasury (' + F.pct(a.rates.treasury5y, 2) + ').</div></div>' : '')));
    locked.push(sec('13', 'Key insights', '', insights(r.insights)));
    locked.push(sec('14', 'Data sources & assumptions', 'Every default below can be overridden in the analyzer. Live sources show their publication date.', sourcesTable(a)));
    locked.push(disclaimer());
    return { free: out.join(''), locked: locked.join('') };
  }

  // =========================== COMMERCIAL ===========================
  function commercial(r, opts) {
    var a = r.assumptions, m = r.metrics, run = r.run, y = r.year1;
    var title = a.address || ('Commercial ' + a.assetClass);
    var out = [], locked = [];
    var cls = a.assetClass.replace(/(^|-)\w/g, function (c) { return c.toUpperCase(); });
    out.push(cover(r, title, [['Asset class', esc(cls)], ['Size', (a.units ? F.n(a.units) + ' units · ' : '') + F.n(a.buildingSf) + ' SF'], ['Price / SF' + (a.units ? ' · / unit' : ''), F.usd(m.pricePsf) + (a.units ? ' · ' + F.usd(m.pricePerUnit) : '')], ['Hold / exit cap', a.holdYears + ' yrs · ' + F.pct(a.exitCap, 2)]],
      [tile('Going-in cap', F.pct(m.cap, 2), m.cap >= a.marketCap ? 'good' : m.cap >= a.marketCap - 0.005 ? 'warn' : 'bad'), tile('Year-1 NOI', F.usd(m.noi, { compact: true })), tile('DSCR', F.x(m.dscr), (m.dscr || 2) >= 1.3 ? 'good' : (m.dscr || 2) >= 1.15 ? 'warn' : 'bad'), tile('Levered IRR', F.pct(m.leveredIrr), (m.leveredIrr || 0) >= 0.13 ? 'good' : (m.leveredIrr || 0) >= 0.08 ? 'warn' : 'bad')],
      { eyebrow: 'Commercial underwriting · ' + cls }));
    if (opts.branding) out.push(brandStrip(opts.branding));
    out.push(sec('01', 'Executive summary', 'Six factors weighted for institutional underwriting: pricing vs. market, coverage, yield, leverage-adjusted return and rollover risk.', '<div class="cards2"><div>' + factorTable(r.factors) + '</div><div>' + insights(r.insights.slice(0, 3)) + '</div></div>'));
    locked.push(sec('02', 'Rent roll', a.rentRoll.length + ' line items. NNN leases reimburse a pro-rata share of taxes, insurance and CAM.',
      table(['Tenant / unit', 'Count', 'SF', 'Annual rent', '$/SF', 'Lease', 'Remaining', 'Bumps'], a.rentRoll.map(function (x) { return [esc(x.label) + (x.vacant ? ' <span class="chip bad">Vacant</span>' : ''), x.count, F.n(x.sf), F.usd(x.annualRent), x.sf ? '$' + (x.annualRent / x.sf).toFixed(2) : '—', x.leaseType, x.leaseEndYears === null ? (a.assetClass === 'multifamily' ? '12-mo' : '—') : x.leaseEndYears.toFixed(1) + ' yrs', F.pct(x.escalation, 1)]; }), { num: [1, 2, 3, 4, 6, 7] }) +
      (r.rollover.length ? '<h4>Lease rollover during hold</h4>' + table(['Tenant', 'SF', 'Expires (year)', '% of rent'], r.rollover.map(function (x) { return [esc(x.label), F.n(x.sf), 'Year ' + x.year, F.pct(x.pctOfRent)]; }), { num: [1, 2, 3] }) + '<p class="xs muted">Rollover modeled at ' + F.pct(a.renewProb, 0) + ' renewal probability, ' + a.downtimeMonths + ' months downtime on non-renewal, TI $' + a.tiRenewPsf + '/$' + a.tiNewPsf + ' per SF (renew/new) and ' + F.pct(a.lcPct, 0) + ' leasing commissions.</p>' : '')));
    var ol = y.opexLines;
    locked.push(sec('03', 'Year-1 operating statement', '',
      '<div class="cards2"><div>' + table(['Income', 'Annual', '$/SF'], [['Base rent', F.usd(y.pgr), (y.pgr / (a.buildingSf || 1)).toFixed(2)], ['Expense recoveries', F.usd(y.recoveries), (y.recoveries / (a.buildingSf || 1)).toFixed(2)], ['Other income', F.usd(y.other), ''], ['Less general vacancy (' + F.pct(a.vacancyPct) + ')', F.usd(-y.vacancyLoss), ''], ['Less credit loss (' + F.pct(a.creditLossPct) + ')', F.usd(-y.creditLoss), ''], { _cls: 'total', _cells: ['Effective gross income', F.usd(y.egi), (y.egi / (a.buildingSf || 1)).toFixed(2)] }], { num: [1, 2] }) + '</div>' +
      '<div>' + table(['Expense', 'Annual', '$/SF'], [['Real estate taxes', ol.taxes], ['Insurance', ol.insurance], ['CAM', ol.cam], ['Utilities', ol.utilities], ['Repairs & maintenance', ol.repairs], ['Payroll', ol.payroll], ['Other', ol.other], ['Management (' + F.pct(a.mgmtPct, 0) + ')', ol.management], ['Reserves', ol.reserves]].filter(function (q) { return q[1] > 0; }).map(function (q) { return [q[0], F.usd(q[1]), (q[1] / (a.buildingSf || 1)).toFixed(2)]; }).concat([{ _cls: 'total', _cells: ['Total expenses', F.usd(y.opex), (y.opex / (a.buildingSf || 1)).toFixed(2)] }]), { num: [1, 2] }) + '</div></div>' +
      '<div class="tiles">' + tile('Net operating income', F.usd(y.noi)) + tile('Expense ratio', F.pct(m.expenseRatio)) + tile('NOI / SF', m.noiPsf ? '$' + m.noiPsf.toFixed(2) : '—') + tile('Break-even occupancy', F.pct(m.breakEvenOcc), m.breakEvenOcc <= 0.8 ? 'good' : m.breakEvenOcc <= 0.9 ? 'warn' : 'bad') + '</div>', { pb: true }));
    var L = run.loan;
    locked.push(sec('04', 'Debt sizing', 'Loan is the lesser of ' + F.pct(a.ltv, 0) + ' LTV and the amount that keeps DSCR at ' + a.minDscr.toFixed(2) + 'x.',
      '<div class="cards2"><div>' + kv([['Max loan by LTV', F.usd(L.byLtv)], ['Max loan by DSCR', F.usd(L.byDscr)], ['<strong>Loan amount</strong>', '<strong>' + F.usd(L.loan) + '</strong> (' + L.constrainedBy + ')'], ['Rate / amortization', F.pct(a.rate, 2) + ' / ' + a.amortYears + ' yrs' + (a.ioYears ? ' (' + a.ioYears + ' yrs IO)' : '')], ['Annual debt service', F.usd(y.debt)], ['Loan fee + closing', F.usd(run.loanFee + run.closing)], ['<strong>Equity required</strong>', '<strong>' + F.usd(run.equity) + '</strong>']]) + '</div>' +
      '<div>' + kv([['LTV', F.pct(m.ltv)], ['DSCR (yr 1)', F.x(m.dscr), toneCls(m.dscr, 1.3, 1.15)], ['Debt yield', F.pct(m.debtYield), toneCls(m.debtYield, 0.10, 0.08)], ['Cash-on-cash (yr 1)', F.pct(m.coc), toneCls(m.coc, 0.08, 0.04)], ['Value at market cap (' + F.pct(a.marketCap, 2) + ')', F.usd(m.valueAtMarketCap)], ['Implied premium / discount', F.pct(m.valueAtMarketCap / a.price - 1)]]) + '</div></div>'));
    locked.push(sec('05', 'Cash flow projection', 'Rent growth ' + F.pct(a.rentGrowth) + '/yr, expense growth ' + F.pct(a.expenseGrowth) + '/yr. Sale at year ' + a.holdYears + ' on forward NOI at a ' + F.pct(a.exitCap, 2) + ' cap.',
      lineChart([{ name: 'NOI', values: run.rows.map(function (q) { return q.noi; }), color: 'var(--plat)', area: true }, { name: 'Cash flow after debt + TI/LC', values: run.rows.map(function (q) { return q.cfbt; }), color: 'var(--good)' }], run.rows.map(function (q) { return 'Y' + q.year; }), { label: 'NOI and cash flow', zero: true }) +
      table(['Year', 'EGI', 'OpEx', 'NOI', 'TI / LC', 'Debt service', 'Cash flow', 'DSCR'], run.rows.map(function (q) { return [q.year, F.usd(q.egi), F.usd(q.opex), F.usd(q.noi), F.usd(q.tilc), F.usd(q.debt), signed(q.cfbt), F.x(q.dscr)]; }), { num: [1, 2, 3, 4, 5, 6, 7] }) +
      '<div class="cards2"><div>' + kv([['Forward NOI (yr ' + (a.holdYears + 1) + ')', F.usd(run.fwdNoi)], ['Gross sale price', F.usd(run.sale)], ['Selling costs (' + F.pct(a.sellingPct, 1) + ')', F.usd(-run.sellCost)], ['Loan payoff', F.usd(-run.payoff)], ['<strong>Net profit</strong>', '<strong>' + signed(run.profit) + '</strong>']]) + '</div><div>' + kv([['Levered IRR', F.pct(m.leveredIrr)], ['Unlevered IRR', F.pct(m.unleveredIrr)], ['Equity multiple', F.x(m.equityMultiple)], ['WALT', m.walt === null ? '—' : m.walt.toFixed(1) + ' yrs']]) + '</div></div>', { pb: true }));
    var S = r.sensitivity;
    locked.push(sec('06', 'Sensitivity: purchase price vs. exit cap', 'Levered IRR. Your current scenario is outlined.',
      '<div class="table-wrap"><table class="t heat"><thead><tr><th>Exit cap \\ Price</th>' + S.prices.map(function (pp) { return '<th class="n">' + (pp.step === 0 ? 'Ask' : (pp.step > 0 ? '+' : '') + F.pct(pp.step, 0)) + '<br><span class="muted">' + F.usd(pp.price, { compact: true }) + '</span></th>'; }).join('') + '</tr></thead><tbody>' +
      S.grid.map(function (row, i) { return '<tr><th>' + F.pct(S.exitCaps[i], 2) + '</th>' + row.map(function (v, j) { var cur = Math.abs(S.exitCaps[i] - a.exitCap) < 1e-9 && S.prices[j].step === 0; var bg = v === null ? 'var(--line-2)' : v >= 0.14 ? 'var(--good-wash)' : v >= 0.08 ? 'var(--warn-wash)' : 'var(--bad-wash)'; return '<td class="' + (cur ? 'cur' : '') + '" style="background:' + bg + '">' + F.pct(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="cards3">' + r.scenarios.map(function (s) { return '<div class="card-t"><header class="' + (s.key === 'optimistic' ? 'good' : s.key === 'conservative' ? 'plat' : '') + '">' + s.label + '</header><div class="body">' + kv([['Rent growth', F.pct(s.rentGrowth)], ['Vacancy', F.pct(s.vacancy)], ['Exit cap', F.pct(s.exitCap, 2)], ['Levered IRR', F.pct(s.leveredIrr)], ['Unlevered IRR', F.pct(s.unleveredIrr)], ['Equity multiple', F.x(s.equityMultiple)]]) + '</div></div>'; }).join('') + '</div>' +
      '<h4>Price needed for each rating</h4>' + targetsTable(r.priceTargets, a.price)));
    var t = r.tax;
    locked.push(sec('07', 'Depreciation & cost segregation', (a.assetClass === 'multifamily' ? 'Residential rental property: 27.5-year' : 'Nonresidential real property: 39-year') + ' straight-line on the building (' + F.pct(1 - a.landPct, 0) + ' of price).',
      '<div class="cards2"><div>' + kv([['Depreciable basis', F.usd(t.building)], ['Annual straight-line', F.usd(t.annualDepreciation)], ['Shield at ' + F.pct(t.marginalTaxRate, 0), F.usd(t.depreciationShield) + '/yr'], ['Year-1 taxable income', F.usd(t.year1.taxable)]]) + '</div><div class="stack">' + kv([['Typical reclassification', F.pct(t.costSeg.pct, 0)], ['Accelerated basis', F.usd(t.costSeg.accelerated)], ['Year-1 deduction with study', F.usd(t.costSeg.year1Deduction)], ['Extra year-1 deduction', F.usd(t.costSeg.extraYear1)], ['Tax value of the acceleration', F.usd(t.costSeg.extraYear1Value)]]) + taxCta(opts.partner) + '</div></div>'));
    locked.push(sec('08', 'Key insights', '', insights(r.insights)));
    locked.push(sec('09', 'Data sources & assumptions', '', sourcesTable(a)));
    locked.push(disclaimer());
    return { free: out.join(''), locked: locked.join('') };
  }

  // =========================== LAND ===========================
  function land(r, opts) {
    var a = r.assumptions, m = r.metrics, run = r.run, out = [], locked = [];
    out.push(cover(r, a.address || 'Land parcel', [['Acreage', F.n(a.acres, 1) + ' ac · ' + F.n(run.devAcres, 1) + ' developable'], ['Zoning / product', esc(a.zoning || '—') + ' · ' + (a.product === 'th' ? 'Townhome' : 'Single-family') + ' lots'], ['Price / acre', F.usd(m.pricePerAcre)], ['Sell-out', run.holdYears.toFixed(1) + ' years']],
      [tile('Lot yield', F.n(m.lots) + ' lots'), tile('Land / lot', F.usd(m.landPerLot), m.landPctOfLot <= 0.2 ? 'good' : m.landPctOfLot <= 0.3 ? 'warn' : 'bad'), tile('Margin at ask', F.pct(m.margin), m.margin >= 0.18 ? 'good' : m.margin >= 0.1 ? 'warn' : 'bad'), tile('Project IRR', F.pct(m.irr), (m.irr || 0) >= 0.2 ? 'good' : (m.irr || 0) >= 0.12 ? 'warn' : 'bad')],
      { eyebrow: 'Land residual analysis' }));
    if (opts.branding) out.push(brandStrip(opts.branding));
    out.push(sec('01', 'Executive summary', 'Scored on land basis per lot, developer margin and project IRR at the asking price.', '<div class="cards2"><div>' + factorTable(r.factors) + '</div><div>' + insights(r.insights) + '</div></div>'));
    locked.push(sec('02', 'Residual land value', 'What the land is worth to a lot developer after every cost and a ' + F.pct(a.marginPct, 0) + ' margin.',
      '<div class="cards2"><div>' + table(['Line item', 'Total', 'Per lot'], [['Finished lot revenue (escalated)', F.usd(run.revenue), F.usd(run.revenue / Math.max(1, run.lots))], ['Hard costs: site, utilities, roads', F.usd(-run.hard), F.usd(-run.hard / Math.max(1, run.lots))], ['Impact fees / proffers', F.usd(-run.fees), F.usd(-run.fees / Math.max(1, run.lots))], ['Soft costs (' + F.pct(a.softCostPct, 0) + ' of hard)' + (a.entitlementCost ? ' + entitlement' : ''), F.usd(-run.soft), F.usd(-run.soft / Math.max(1, run.lots))], ['Contingency (' + F.pct(a.contingencyPct, 0) + ')', F.usd(-run.contingency), F.usd(-run.contingency / Math.max(1, run.lots))], ['Carry taxes', F.usd(-run.carry), F.usd(-run.carry / Math.max(1, run.lots))], ['Land + closing at ask', F.usd(-a.price * (1 + a.closingPct)), F.usd(-a.price * (1 + a.closingPct) / Math.max(1, run.lots))], { _cls: 'total', _cells: ['Profit at ask', signed(run.profit), F.usd(run.profit / Math.max(1, run.lots))] }], { num: [1, 2] }) + '</div>' +
      '<div class="stack">' + kv([['Static residual (max land price)', '<strong>' + F.usd(m.staticResidual) + '</strong>'], ['DCF residual @ ' + F.pct(a.discountRate, 0), '<strong>' + F.usd(m.dcfResidual) + '</strong>'], ['Asking price', F.usd(a.price)], ['Headroom vs. static residual', signed(m.staticResidual - a.price)], ['Residual per lot', F.usd(m.staticResidual / Math.max(1, m.lots))], ['Land as % of finished lot', F.pct(m.landPctOfLot)]]) +
      '<p class="xs muted">Lot yield: ' + F.n(a.acres, 1) + ' acres x ' + F.pct(a.netDevelopablePct, 0) + ' net developable x ' + a.density + ' lots/acre' + (a.lotsOverride ? ' (overridden to ' + a.lotsOverride + ')' : '') + '. Verify against a concept plan, wetlands delineation and RPA buffers.</p></div></div>'));
    locked.push(sec('03', 'Takedown schedule', a.entitlementMonths + ' months entitlement + ' + a.devMonths + ' months site work, then ' + a.takedownPerYear + ' lots per year. Lot prices escalate ' + F.pct(a.lotEscalation) + '/yr; costs ' + F.pct(a.costEscalation) + '/yr.',
      table(['Phase', 'Lots', 'Delivery (yr)', 'Revenue', 'Hard cost', 'Fees'], run.phases.map(function (q) { return [q.phase, q.lots, q.year.toFixed(1), F.usd(q.revenue), F.usd(q.hardCost), F.usd(q.impactFees)]; }), { num: [1, 2, 3, 4, 5] })));
    var S = r.sensitivity;
    locked.push(sec('04', 'Sensitivity: lot value vs. development cost', 'Project IRR at the asking price.',
      '<div class="table-wrap"><table class="t heat"><thead><tr><th>Dev cost \\ Lot value</th>' + S.lotValues.map(function (l) { return '<th class="n">' + (l.step === 0 ? 'Base' : (l.step > 0 ? '+' : '') + F.pct(l.step, 0)) + '<br><span class="muted">' + F.usd(l.value, { compact: true }) + '</span></th>'; }).join('') + '</tr></thead><tbody>' +
      S.grid.map(function (row, i) { return '<tr><th>' + F.usd(S.devCosts[i].value, { compact: true }) + '</th>' + row.map(function (v, j) { var cur = S.devCosts[i].step === 0 && S.lotValues[j].step === 0; var bg = v === null ? 'var(--line-2)' : v >= 0.2 ? 'var(--good-wash)' : v >= 0.1 ? 'var(--warn-wash)' : 'var(--bad-wash)'; return '<td class="' + (cur ? 'cur' : '') + '" style="background:' + bg + '">' + F.pct(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<h4>Price needed for each rating</h4>' + targetsTable(r.priceTargets, a.price)));
    locked.push(sec('05', 'Data sources & assumptions', '', sourcesTable(a)));
    locked.push(disclaimer());
    return { free: out.join(''), locked: locked.join('') };
  }

  // =========================== DESKTOP VALUATION REVIEW ===========================
  function valuation(r, opts) {
    var a = r.assumptions, S = a.subject, A = a.assignment, R = r.reconciliation, SL = r.sales, I = r.income, C = r.cost, AX = r.assessment, EQ = r.equity;
    var res = S.type === 'residential', typeLabel = res ? S.propertyType : S.assetClass.replace(/(^|-)\w/g, function (c) { return c.toUpperCase(); });
    var unitLabel = SL.unit === 'unit' ? 'unit' : 'SF', out = [], locked = [], n = 1;
    function no() { n++; return (n < 10 ? '0' : '') + n; }
    var cond = { 1: 'Poor', 2: 'Fair', 3: 'Average', 4: 'Good', 5: 'Excellent' };
    var purpose = (r.purposes || {})[A.purpose] || A.purpose;
    out.push(cover(r, a.address || 'Subject property', [['Effective date', esc(A.effectiveDate)], ['Interest valued', esc(A.interest)], ['Intended use', esc(purpose)], ['Confidence', R.confidenceLabel + ' (' + R.confidence + '/100)']],
      [tile('Indicated range', R.final ? F.usd(R.low, { compact: true }) + ' - ' + F.usd(R.high, { compact: true }) : '—'), tile(res ? 'Per SF of living area' : 'Per SF of building', R.perSf ? '$' + R.perSf.toFixed(2) : '—'),
        tile('Assessed value', AX ? F.usd(AX.total) : '—'), tile('Assessment vs. indicated', AX ? (AX.variancePct >= 0 ? '+' : '') + F.pct(AX.variancePct) : '—', AX ? (AX.variancePct >= 0.05 ? 'bad' : AX.variancePct > -0.05 ? 'good' : 'warn') : '')],
      { eyebrow: 'Desktop valuation review · ' + typeLabel, price: R.final || 0 }));
    out.push('<div class="notice warn"><div><strong>This is a desktop valuation review, not an appraisal.</strong> No inspection was made. It is an analysis of market data for the intended use stated above and is not a substitute for an appraisal by a licensed appraiser where one is required by law, a lender or a court.</div></div>');
    var b = opts.branding;
    if (b && (b.name || b.brokerage)) out.push(brandStrip(b));
    out.push(sec('01', 'Summary of conclusions', '', '<div class="cards2"><div>' + table(['Approach', 'Indication', 'Weight'], R.rows.map(function (x) { return [esc(x.label), x.developed ? F.usd(x.value) : '<span class="muted small">' + esc(x.reason || 'Not developed') + '</span>', x.developed ? F.pct(x.weight, 0) : '—']; }).concat([{ _cls: 'total', _cells: ['<strong>Reconciled market value</strong>', '<strong>' + F.usd(R.final) + '</strong>', ''] }]), { num: [1, 2] }) + '</div><div>' + insights(r.insights) + '</div></div>'));

    // --- assignment + subject
    locked.push(sec(no(), 'Assignment and subject', 'Scope of work: desktop review of public records, comparable sales and income data supplied by the client or drawn from the sources listed. No interior or exterior inspection; the subject is assumed to be in the condition stated.',
      '<div class="cards2"><div>' + kv([['Client', esc(A.client || '—')], ['Intended use', esc(purpose)], ['Effective date of value', esc(A.effectiveDate)], ['Interest valued', esc(A.interest)], ['Type of value', 'Market value'], ['File', esc(A.fileNo || '—')], ['Prepared by', esc([A.preparedBy, A.firm].filter(Boolean).join(', ') || '—')]]) + '</div><div>' +
      kv([['Address', esc([a.address, a.city, a.state, a.zip].filter(Boolean).join(', '))], ['Locality / market', esc([a.localityName, a.marketName].filter(Boolean).join(' · ') || 'Outside covered markets')], ['Parcel ID', esc(S.parcelId || '—')], ['Property type', esc(typeLabel)], ['Building area', S.sf ? F.n(S.sf) + ' SF' : '—'], S.units > 1 ? ['Units', F.n(S.units)] : null, ['Site', S.lotAcres ? S.lotAcres + ' acres' : '—'], ['Year built', S.yearBuilt || '—'], res ? ['Beds / baths / garage', (S.beds || '—') + ' / ' + (S.baths || '—') + ' / ' + (S.garage || 0)] : ['Occupancy', S.occupancyPct !== null ? F.pct(S.occupancyPct, 0) : (I.occupancy !== undefined && I.occupancy !== null ? F.pct(I.occupancy, 0) : '—')], ['Condition / quality', cond[S.condition] + ' / ' + cond[S.quality]], ['Zoning', esc(S.zoning || '—')]].filter(Boolean)) + '</div></div>' + (A.notes ? '<p class="small">' + esc(A.notes) + '</p>' : '')));

    // --- sales grid
    if (SL.comps && SL.comps.length) {
      var cs = SL.comps, keys = [], labels = {};
      cs.forEach(function (c) { c.lines.forEach(function (l) { if (keys.indexOf(l.key) === -1) keys.push(l.key); labels[l.key] = l.label.replace(/\s*\(.*\)$/, ''); }); });
      var order = ['rights', 'financing', 'conditions', 'expend', 'time', 'location', 'gla', 'size', 'lot', 'age', 'condition', 'quality', 'occupancy', 'beds', 'baths', 'garage', 'other'];
      keys.sort(function (x, y) { return order.indexOf(x) - order.indexOf(y); });
      function row(label, subj, fn, cls) { return { _cls: cls || '', _cells: [label, subj].concat(cs.map(fn)) }; }
      function adjCell(c, k) { var l = c.lines.filter(function (x) { return x.key === k; })[0]; return l ? '<span class="' + (l.amount >= 0 ? 'tone-good' : 'tone-bad') + '">' + (l.amount >= 0 ? '+' : '') + F.usd(l.amount) + '</span>' : '<span class="muted">—</span>'; }
      var rows = [
        row('Sale date', '<span class="muted">' + esc(A.effectiveDate) + '</span>', function (c) { return esc(c.saleDate || '—'); }),
        row('Sale price', '', function (c) { return F.usd(c.salePrice); }),
        row(SL.unit === 'unit' ? 'Units' : 'Building SF', F.n(SL.unit === 'unit' ? S.units : S.sf), function (c) { return F.n(SL.unit === 'unit' ? c.units : c.sf); }),
        row('Price / ' + unitLabel, '', function (c) { return c.unitPriceRaw ? '$' + c.unitPriceRaw.toFixed(2) : '—'; }),
        row('Year built', S.yearBuilt || '—', function (c) { return c.yearBuilt || '—'; }),
        row('Site (acres)', S.lotAcres || '—', function (c) { return c.lotAcres || '—'; })
      ];
      if (res) rows.push(row('Beds / baths', (S.beds || '—') + ' / ' + (S.baths || '—'), function (c) { return (c.beds || '—') + ' / ' + (c.baths || '—'); }));
      else rows.push(row('Occupancy', S.occupancyPct !== null ? F.pct(S.occupancyPct, 0) : '—', function (c) { return c.occupancyPct !== null ? F.pct(c.occupancyPct, 0) : '—'; }), row('Cap rate at sale', '', function (c) { return c.capRateDerived ? F.pct(c.capRateDerived, 2) : '—'; }));
      rows.push(row('Condition', cond[S.condition], function (c) { return c.condition ? cond[c.condition] : '—'; }), row('Distance', '', function (c) { return c.distanceMi !== null ? c.distanceMi + ' mi' : '—'; }));
      keys.forEach(function (k) { rows.push(row('<em>Adj: ' + esc(labels[k]) + '</em>', '', function (c) { return adjCell(c, k); })); });
      rows.push(row('Net adjustment', '', function (c) { return F.pct(c.netPct); }), row('Gross adjustment', '', function (c) { return '<span class="' + (c.grossPct > 0.25 ? 'tone-bad' : '') + '">' + F.pct(c.grossPct) + '</span>'; }),
        row('<strong>Adjusted value for subject</strong>', '', function (c) { return c.adjusted === null ? '—' : '<strong>' + F.usd(c.adjusted) + '</strong>'; }, 'total'),
        row('Adjusted / ' + unitLabel, '', function (c) { return c.adjusted && SL.subjectSize ? '$' + (c.adjusted / SL.subjectSize).toFixed(2) : '—'; }), row('Weight', '', function (c) { return F.pct(c.weight, 0); }));
      var flags = cs.filter(function (c) { return c.flags.length; }).map(function (c) { return '<li>' + esc(c.address) + ': ' + esc(c.flags.join('; ')) + '</li>'; }).join('');
      var RT = a.sales.rates, rateRows = res ? [['Market conditions', F.pct(RT.timePctPerYear) + ' / yr'], ['Living area', '$' + RT.glaPerSf + ' / SF'], ['Site', F.usd(RT.lotPerAcre) + ' / acre'], ['Age', F.pct(RT.agePctPerYear, 2) + ' / yr'], ['Condition', F.pct(RT.conditionPctPerStep, 0) + ' / step'], ['Quality', F.pct(RT.qualityPctPerStep, 0) + ' / step'], ['Bedroom', F.usd(RT.perBed)], ['Bathroom', F.usd(RT.perBath)], ['Garage bay', F.usd(RT.perGarage)]]
        : [['Market conditions', F.pct(RT.timePctPerYear) + ' / yr'], ['Size', F.pct(RT.sizePctPerDoubling, 0) + ' per doubling'], ['Age', F.pct(RT.agePctPerYear, 2) + ' / yr'], ['Condition', F.pct(RT.conditionPctPerStep, 0) + ' / step'], ['Quality / class', F.pct(RT.qualityPctPerStep, 0) + ' / step'], ['Occupancy', F.pct(RT.occupancyFactor, 0) + ' of the occupancy gap']];
      locked.push(sec(no(), 'Sales comparison approach', 'Each sale is adjusted to the subject: transactional adjustments first and in sequence (rights, financing, conditions of sale, market conditions), then property differences. A positive adjustment means the comparable is inferior to the subject.',
        table(['', 'Subject'].concat(cs.map(function (c, i) { return 'Comp ' + (i + 1) + '<br><span style="text-transform:none;letter-spacing:0;font-weight:500">' + esc(c.address) + '</span>'; })), rows, { num: cs.map(function (c, i) { return i + 2; }).concat([1]) }) +
        (SL.developed ? '<div class="tiles">' + tile('Indicated by sales comparison', F.usd(SL.indicated)) + tile('Adjusted range', F.usd(SL.low, { compact: true }) + ' - ' + F.usd(SL.high, { compact: true })) + tile('Average gross adjustment', F.pct(SL.avgGross, 0), SL.avgGross <= 0.15 ? 'good' : SL.avgGross <= 0.25 ? 'warn' : 'bad') + tile('Dispersion (COV)', F.pct(SL.cov), SL.cov <= 0.05 ? 'good' : SL.cov <= 0.10 ? 'warn' : 'bad') + '</div>' : '<div class="notice warn"><div>' + esc(SL.reason) + '</div></div>') +
        '<div class="cards2"><div><h4 style="margin-bottom:8px">Adjustment rates applied</h4>' + kv(rateRows) + '</div><div><h4 style="margin-bottom:8px">Weighting and flags</h4><p class="small muted">Comparables are weighted toward the fewest gross adjustments, the most recent sale dates and the shortest distance. Guideline thresholds: 15% net and 25% gross adjustment.</p>' + (flags ? '<ul class="small" style="padding-left:18px;margin:8px 0 0">' + flags + '</ul>' : '<p class="small tone-good" style="margin-top:8px">No comparable exceeds the guideline thresholds.</p>') + '</div></div>', { pb: true }));
    } else locked.push(sec(no(), 'Sales comparison approach', '', '<div class="notice warn"><div>' + esc(SL.reason || 'Not developed') + '</div></div>'));

    // --- income
    if (I.developed && I.noi !== undefined) {
      var L = I.expenseLines, sfd = S.sf || 1, ld = I.loaded;
      locked.push(sec(no(), 'Income capitalization approach', 'Stabilized direct capitalization on ' + (I.rentBasis === 'market' ? 'market rent (fee simple)' : 'contract rent (leased fee)') + '. Vacant space is taken at market rent and then charged its lease-up cost below the line.',
        table(['Tenant / space', 'SF', 'Contract rent', 'Market rent', 'Lease', 'Used'], I.rentRoll.map(function (q) { return [esc(q.label) + (q.vacant ? ' <span class="chip bad">Vacant</span>' : ''), F.n(q.sf), q.vacant ? '—' : F.usd(q.annualRent), F.usd(q.marketRent), q.leaseType, F.usd(q.usedRent)]; }), { num: [1, 2, 3, 5] }) +
        '<div class="cards2"><div>' + table(['Stabilized statement', 'Annual', '$/SF'], [['Potential gross rent', I.pgi], ['Expense recoveries', I.recoveries], ['Other income', I.otherIncome], ['Vacancy and credit loss (' + F.pct(a.income.vacancyPct + a.income.creditLossPct) + ')', -I.vacancyLoss]].map(function (q) { return [q[0], F.usd(q[1]), (q[1] / sfd).toFixed(2)]; }).concat([{ _cls: 'total', _cells: ['Effective gross income', F.usd(I.egi), (I.egi / sfd).toFixed(2)] }]).concat([['Real estate taxes', L.taxes], ['Insurance', L.insurance], ['Common area maintenance', L.cam], ['Utilities', L.utilities], ['Repairs and maintenance', L.repairs], ['Payroll', L.payroll], ['Other', L.other], ['Management (' + F.pct(a.income.mgmtPct, 0) + ')', L.management], ['Replacement reserves', L.reserves]].filter(function (q) { return q[1] > 0; }).map(function (q) { return [q[0], F.usd(-q[1]), (q[1] / sfd).toFixed(2)]; })).concat([{ _cls: 'total', _cells: ['<strong>Net operating income</strong>', '<strong>' + F.usd(I.noi) + '</strong>', (I.noi / sfd).toFixed(2)] }]), { num: [1, 2] }) + '</div>' +
        '<div class="stack"><h4>Capitalization rate support</h4>' + table(['Method', 'Rate', 'Basis'], I.capSupport.rows.map(function (q) { return [esc(q.label), F.pct(q.rate, 2), '<span class="muted small">' + esc(q.note) + '</span>']; }).concat([{ _cls: 'hl', _cells: ['Selected', F.pct(I.cap, 2), esc(I.capSupport.basis)] }]), { num: [1] }) +
        (ld ? '<div class="notice"><div><strong>Tax-loaded rate.</strong> Because the tax bill depends on the value being tested, real estate taxes are removed from expenses and the owner\'s share of the tax rate is added to the cap rate: ' + F.pct(I.cap, 2) + ' + ' + F.pct(ld.taxRate, 3) + ' x ' + F.pct(1 - ld.recoveredShare, 0) + ' unrecovered = <strong>' + F.pct(ld.loadedCap, 3) + '</strong>. NOI before the owner\'s tax burden is ' + F.usd(ld.noiBeforeTax) + '.</div></div>' : '') + '</div></div>' +
        table(['Value by direct capitalization', ''], [[ld ? 'NOI before owner\'s taxes / loaded rate' : 'NOI / cap rate', F.usd(I.valueBeforeDeductions)], I.leaseUp ? ['Less lease-up of ' + F.n(I.excessVacantSf) + ' SF above stabilized vacancy (downtime, TI, commissions)', F.usd(-I.leaseUp)] : null, I.deferredMaintenance ? ['Less deferred maintenance', F.usd(-I.deferredMaintenance)] : null, { _cls: 'total', _cells: ['<strong>Indicated by income approach</strong>', '<strong>' + F.usd(I.value) + '</strong>'] }].filter(Boolean), { num: [1] }) +
        (I.dcf ? '<div class="tiles">' + tile('DCF cross-check (in-place leases)', F.usd(I.dcf.value)) + tile('Discount rate', F.pct(I.dcf.discountRate, 2)) + tile('Terminal cap, year ' + I.dcf.holdYears, F.pct(I.dcf.exitCap, 2)) + tile('Reversion share of value', F.pct(I.dcf.reversionShare, 0)) + '</div><p class="xs muted">The DCF models contract rents, rollover, downtime and leasing costs year by year. It is a check on the direct capitalization and is not separately weighted.</p>' : ''), { pb: true }));
    } else if (I.developed) {
      locked.push(sec(no(), 'Income approach (gross rent multiplier)', 'For 1-4 unit residential property the income approach is a multiplier applied to market rent.', kv([['Market rent', F.usd(I.monthlyRent) + ' / month'], ['Gross annual rent', F.usd(I.monthlyRent * 12)], ['Gross rent multiplier', I.grm.toFixed(2) + 'x'], ['Basis', esc(I.grmBasis)], ['<strong>Indicated by income approach</strong>', '<strong>' + F.usd(I.value) + '</strong>']])));
    } else locked.push(sec(no(), 'Income approach', '', '<p class="small muted">' + esc(I.reason || 'Not developed') + (res ? '. Single-family homes are bought for occupancy, so this approach carries little weight.' : '') + '</p>'));

    // --- cost
    if (C.developed) {
      var CC = a.cost;
      locked.push(sec(no(), 'Cost approach', 'Replacement cost new of the improvements, less depreciation, plus land. Cost figures are reference values and should be confirmed with a cost service for contested matters.',
        '<div class="cards2"><div>' + table(['Component', 'Amount'], [['Building: ' + F.n(S.sf) + ' SF x $' + CC.baseCostPsf + ' x ' + CC.localMultiplier.toFixed(2) + ' local multiplier', F.usd(C.buildingCost)], ['Site improvements', F.usd(C.siteImprovements)], ['Soft costs (' + F.pct(CC.softPct, 0) + ')', F.usd(C.soft)], ['Entrepreneurial incentive (' + F.pct(CC.incentivePct, 0) + ')', F.usd(C.incentive)], { _cls: 'total', _cells: ['Replacement cost new ($' + C.rcnPsf.toFixed(0) + '/SF)', F.usd(C.rcn)] }, ['Physical depreciation: effective age ' + CC.effectiveAge + ' / ' + CC.economicLife + '-yr life (' + F.pct(C.physicalPct, 0) + ')', F.usd(-C.physical)], ['Functional obsolescence (' + F.pct(CC.functionalPct, 0) + ')', F.usd(-C.functional)], ['External obsolescence (' + F.pct(CC.externalPct, 0) + ')', F.usd(-C.external)], { _cls: 'total', _cells: ['Depreciated value of improvements', F.usd(C.improvements)] }, ['Land value', F.usd(C.land)], { _cls: 'total', _cells: ['<strong>Indicated by cost approach</strong>', '<strong>' + F.usd(C.value) + '</strong>'] }], { num: [1] }) + '</div>' +
        '<div class="stack">' + kv([['Land value basis', esc(C.landBasis)], ['Total depreciation', F.pct(C.depreciationPct, 0)], ['Remaining economic life', C.remainingLife + ' years'], ['Cost source', esc(a.sources.baseCostPsf)]]) + (AX && AX.total ? '<p class="small muted">Assessors usually build values on a cost model. Compare this result with the assessed improvement value' + (a.assessment.improvements ? ' of ' + F.usd(a.assessment.improvements) : '') + ' to see where the assessment may overstate cost or understate depreciation.</p>' : '') + '</div></div>'));
    } else locked.push(sec(no(), 'Cost approach', '', '<p class="small muted">' + esc(C.reason || 'Not developed') + '</p>'));

    // --- reconciliation
    locked.push(sec(no(), 'Reconciliation and confidence', 'Weights reflect how buyers of this property type decide and how much evidence each approach had.',
      '<div class="cards2"><div class="stack">' + hbars(R.rows.filter(function (x) { return x.developed; }).map(function (x) { return { label: x.label + ' (' + F.pct(x.weight, 0) + ')', value: x.value, color: 'var(--plat)' }; }).concat(AX ? [{ label: 'Assessed value', value: AX.total, color: 'var(--blaze)' }] : []).concat([{ label: 'Reconciled value', value: R.final, color: 'var(--good)' }])) +
      kv([['Weighted value before rounding', F.usd(R.unrounded)], ['<strong>Reconciled market value</strong>', '<strong>' + F.usd(R.final) + '</strong>'], ['Reasonable range (+/- ' + F.pct(R.band, 0) + ')', F.usd(R.low) + ' to ' + F.usd(R.high)]]) + '</div>' +
      '<div class="stack"><h4>Confidence: ' + R.confidenceLabel + ' (' + R.confidence + '/100)</h4>' + table(['Factor', 'Points'], R.factors.map(function (f) { return [esc(f.text), f.points]; }), { num: [1] }) + '<p class="xs muted">Starts at 100. The range widens as confidence falls.</p></div></div>'));

    // --- assessment
    if (AX) {
      var rec = AX.recommendation;
      locked.push(sec(no(), 'Assessment analysis', 'Tax year ' + esc(AX.taxYear) + '. Tested at an assessment ratio of ' + F.pct(AX.ratio, 0) + ' of market value and a tax rate of ' + F.pct(AX.taxRate, 3) + ' (' + esc(a.sources.taxRate) + ').',
        '<div class="notice ' + (rec.tone === 'good' ? '' : rec.tone === 'bad' ? 'blaze' : 'warn') + '"><div><strong>' + esc(rec.label) + '.</strong> ' + esc(rec.text) + '</div></div>' +
        '<div class="cards2"><div>' + kv([['Current assessment', F.usd(AX.total)], a.assessment.land ? ['Land / improvements', F.usd(a.assessment.land) + ' / ' + F.usd(a.assessment.improvements || AX.total - a.assessment.land)] : null, ['Indicated market value', F.usd(R.final)], ['Supported assessment', F.usd(AX.indicatedAtRatio)], ['<strong>Over (under) assessment</strong>', '<strong>' + F.usd(AX.variance) + ' (' + F.pct(AX.variancePct) + ')</strong>', AX.variance > 0 ? 'tone-bad' : 'tone-good'], AX.assessedPerSf ? ['Assessed per SF vs. indicated per SF', '$' + AX.assessedPerSf.toFixed(2) + ' vs. $' + (R.perSf || 0).toFixed(2)] : null].filter(Boolean)) + '</div>' +
        '<div>' + kv([['Current annual tax', F.usd(AX.currentTax)], ['Tax at supported value', F.usd(AX.supportedTax)], ['<strong>Potential annual reduction</strong>', '<strong>' + F.usd(AX.annualSavings) + '</strong>'], [AX.horizonYears + '-year reduction if the value holds', F.usd(AX.horizonSavings)], AX.feePct ? ['Contingency fee (' + F.pct(AX.feePct, 0) + ' of first-year savings)', F.usd(AX.fee)] : null, AX.feePct ? ['Net to owner, first year', F.usd(AX.clientNetFirstYear)] : null].filter(Boolean)) + '</div></div>' +
        '<p class="xs muted">A review board can raise as well as lower an assessment. Filing deadlines, burden of proof and who may represent an owner differ by locality; confirm them before filing.</p>'));
      if (EQ) locked.push(sec(no(), 'Uniformity (equity) analysis', 'Compares how the assessor valued the comparable properties relative to their sale prices with how the subject is assessed relative to its indicated value.',
        '<div class="cards2"><div>' + table(['Comparable', 'Sale price', 'Assessed', 'Ratio', 'Assessed/SF'], EQ.rows.map(function (q) { return [esc(q.address), F.usd(q.salePrice), F.usd(q.assessed), F.pct(q.ratio, 1), q.assessedPerSf ? '$' + q.assessedPerSf.toFixed(2) : '—']; }).concat([{ _cls: 'hl', _cells: ['Subject (vs. indicated value)', F.usd(R.final), F.usd(AX.total), F.pct(EQ.subjectRatio, 1), EQ.subjectAssessedPerSf ? '$' + EQ.subjectAssessedPerSf.toFixed(2) : '—'] }]), { num: [1, 2, 3, 4] }) + '</div>' +
        '<div class="stack">' + kv([['Median assessment-to-sale ratio', F.pct(EQ.medianRatio, 1)], ['Coefficient of dispersion', EQ.cod.toFixed(1)], ['Subject ratio', F.pct(EQ.subjectRatio, 1)], ['Subject assessment at the median ratio', F.usd(EQ.equalizedAssessment)], ['Excess over uniform treatment', F.usd(EQ.equalizedVariance)], EQ.medianAssessedPerSf ? ['Median assessed per SF', '$' + EQ.medianAssessedPerSf.toFixed(2)] : null].filter(Boolean)) +
        '<p class="small">' + (EQ.uniformityArgument ? 'The subject is assessed at a higher share of value than its peers. That supports a lack-of-uniformity argument alongside overvaluation.' : 'The subject is treated consistently with its peers. Rely on the overvaluation evidence.') + '</p><p class="xs muted">Based on ' + EQ.count + ' sales, which is a small sample. IAAO standards look for a COD of 15 or less for residential and 20 or less for income property.</p></div></div>'));
    }

    // --- sources, conditions, signatures
    var srcRows = (SL.comps || []).map(function (c, i) { return ['Comparable ' + (i + 1) + ': ' + esc(c.address), '<span class="src-cell">' + esc(c.source || 'Entered by reviewer') + (c.note ? '. ' + esc(c.note) : '') + '</span>']; });
    srcRows.unshift(['Tax rate', '<span class="src-cell">' + esc(a.sources.taxRate) + '</span>'], ['Market conditions trend', '<span class="src-cell">' + esc(a.sources.timePctPerYear) + '</span>'], ['Replacement cost', '<span class="src-cell">' + esc(a.sources.baseCostPsf) + '</span>']);
    locked.push(sec(no(), 'Data sources', '', table(['Item', 'Source'], srcRows)));
    locked.push(sec(no(), 'Assumptions and limiting conditions', '', '<ol class="small" style="margin:0;padding-left:18px;display:grid;gap:6px;color:var(--ink-2)"><li>This is a desktop valuation review prepared for the client and intended use named above. It is not an appraisal, and no one else may rely on it.</li><li>The property was not inspected. Size, condition, quality and occupancy are as reported by the client or public records and are assumed to be accurate.</li><li>Comparable sales, rents, expenses and assessments were taken from the sources listed and were not independently verified with the parties.</li><li>Title is assumed to be marketable and free of unusual easements, encroachments or environmental conditions. No survey, title or engineering work was reviewed.</li><li>Adjustment rates and replacement costs are market-derived reference values chosen by the reviewer. Different reasonable choices produce different results within the stated range.</li><li>The value applies only as of the effective date. Later market changes are not reflected.</li><li>Nothing here is legal or tax advice. Appeal deadlines and procedures should be confirmed with the locality.</li></ol>' +
      '<div class="cards2" style="margin-top:8px"><div class="sig"><div class="sig-line"></div><strong>' + esc(A.preparedBy || 'Prepared by') + '</strong><div class="small muted">' + esc([A.credentials, A.firm].filter(Boolean).join(' · ') || 'Reviewer') + '</div><div class="xs muted">Date: ' + new Date().toLocaleDateString('en-US') + '</div></div>' +
      '<div class="sig"><div class="sig-line"></div><strong>' + esc(A.reviewer || 'Reviewing appraiser (optional)') + '</strong><div class="small muted">' + (A.reviewerLicense ? 'License ' + esc(A.reviewerLicense) : 'Sign here only if a licensed appraiser adopts this analysis') + '</div></div></div>'));
    return { free: out.join(''), locked: locked.join('') };
  }

  function render(el, result, opts) {
    opts = opts || {};
    var parts = result.kind === 'valuation' ? valuation(result, opts) : result.kind === 'commercial' ? commercial(result, opts) : result.kind === 'land' ? land(result, opts) : residential(result, opts);
    var lockedHtml = opts.locked
      ? '<div class="lock-wrap"><div class="lock-over no-print"><div class="lock-card"><span class="eyebrow">Full report</span><h3>Unlock the full ' + (result.kind === 'valuation' ? 'valuation review' : result.kind === 'land' ? 'land residual' : 'investment') + ' report</h3><p class="small muted">' + (result.kind === 'valuation' ? 'Adjustment grid, income and cost approaches, reconciliation, assessment and uniformity analysis, limiting conditions and signature block. Then: ' : '') + 'Operating statement, financing, projections, bidding and sensitivity tables, ' + (result.kind === 'residential' ? 'flip MAO, strategy fit, tax analysis, ' : result.kind === 'commercial' ? 'rent roll, debt sizing, cash flows, cost segregation, ' : 'takedown schedule, ') + 'sources, PDF and a shareable link.</p><div class="row" id="unlock-actions">' + (opts.unlockHtml || '') + '</div></div></div><div class="locked-content">' + parts.locked + '</div></div>'
      : parts.locked;
    el.innerHTML = '<div class="report">' + parts.free + lockedHtml + '</div>';
    el.querySelectorAll('.tax-ref').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); taxReferral(result); }); });
  }

  function taxReferral(result) {
    U.modal('<span class="eyebrow">Tax review</span><h3>Get the depreciation and cost-seg numbers checked</h3><p class="small muted">We will pass this property and your contact details to a CPA partner who works with real estate investors. No obligation.</p>' +
      '<form id="taxf" class="stack"><div class="grid g2"><div class="field"><label for="tx-name">Name</label><input class="input" id="tx-name" required></div><div class="field"><label for="tx-phone">Phone</label><input class="input" id="tx-phone"></div></div><div class="field"><label for="tx-email">Email</label><input class="input" id="tx-email" type="email" required></div>' +
      '<div class="row"><button class="btn btn-primary" type="submit">Request review</button><button class="btn btn-line" type="button" data-close>Cancel</button></div></form>', function (body, close) {
      U.me().then(function (u) { if (u) { body.querySelector('#tx-email').value = u.email; body.querySelector('#tx-name').value = u.name || ''; } });
      body.querySelector('#taxf').addEventListener('submit', function (e) {
        e.preventDefault();
        U.api('POST', '/api/leads', { kind: 'tax-referral', name: body.querySelector('#tx-name').value, email: body.querySelector('#tx-email').value, phone: body.querySelector('#tx-phone').value, message: 'Tax review for ' + (result.assumptions.address || 'property'), meta: { kind: result.kind, price: result.assumptions.price, extraYear1: result.tax && result.tax.costSeg.extraYear1 } })
          .then(function () { close(); U.toast('Request sent. A tax advisor will reach out.'); }).catch(U.errorHandler);
      });
    });
  }

  window.PReport = { render: render, gauge: gauge, lineChart: lineChart, hbars: hbars, table: table, kv: kv };
})();
