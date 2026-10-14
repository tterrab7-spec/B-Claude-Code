/*
 * Parcelyst underwriting engine.
 * Pure functions, no I/O. Runs identically in the browser and on the server.
 *
 *   analyzeResidential(inputs)  1-4 unit rentals, flips, house hacks, STR
 *   analyzeCommercial(inputs)   multifamily 5+, retail, office, industrial, self-storage, mixed-use
 *   analyzeLand(inputs)         lot-yield residual land value for subdivision / builder takedown deals
 *
 * Every result carries `assumptions` (the fully-resolved inputs) so a report can show
 * exactly what drove each number.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- math helpers ----------
  function num(v, d) { var n = typeof v === 'string' ? parseFloat(v.replace(/[$,%\s]/g, '')) : v; return (n === null || n === undefined || isNaN(n)) ? d : n; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round(v, p) { var m = Math.pow(10, p || 0); return Math.round(v * m) / m; }
  function lin(v, lo, hi) { if (hi === lo) return v >= hi ? 1 : 0; return clamp((v - lo) / (hi - lo), 0, 1); }

  // Monthly payment on a fully amortizing loan.
  function pmt(annualRate, years, principal) {
    if (principal <= 0) return 0;
    var r = annualRate / 12, n = years * 12;
    if (r === 0) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }
  // Remaining balance after k monthly payments.
  function balanceAfter(annualRate, years, principal, k) {
    if (principal <= 0) return 0;
    var r = annualRate / 12, n = years * 12;
    k = Math.min(k, n);
    if (r === 0) return principal * (1 - k / n);
    var p = pmt(annualRate, years, principal);
    return principal * Math.pow(1 + r, k) - p * (Math.pow(1 + r, k) - 1) / r;
  }
  function interestInYear(annualRate, years, principal, y) {
    var p = pmt(annualRate, years, principal) * 12;
    var b0 = balanceAfter(annualRate, years, principal, (y - 1) * 12);
    var b1 = balanceAfter(annualRate, years, principal, y * 12);
    return p - (b0 - b1);
  }
  function npv(rate, cfs) { var s = 0; for (var i = 0; i < cfs.length; i++) s += cfs[i] / Math.pow(1 + rate, i); return s; }
  // IRR: Newton-Raphson with bisection fallback. Returns null when no sign change.
  function irr(cfs) {
    var hasPos = false, hasNeg = false;
    for (var i = 0; i < cfs.length; i++) { if (cfs[i] > 0) hasPos = true; if (cfs[i] < 0) hasNeg = true; }
    if (!hasPos || !hasNeg) return null;
    var r = 0.1;
    for (var it = 0; it < 60; it++) {
      var f = 0, df = 0;
      for (var t = 0; t < cfs.length; t++) { var d = Math.pow(1 + r, t); f += cfs[t] / d; df -= t * cfs[t] / (d * (1 + r)); }
      if (Math.abs(f) < 1e-7) return r;
      if (df === 0) break;
      var nr = r - f / df;
      if (!isFinite(nr) || nr <= -0.9999) break;
      if (Math.abs(nr - r) < 1e-10) return nr;
      r = nr;
    }
    var lo = -0.9999, hi = 10, flo = npv(lo, cfs);
    if (flo * npv(hi, cfs) > 0) return null;
    for (var j = 0; j < 200; j++) {
      var mid = (lo + hi) / 2, fm = npv(mid, cfs);
      if (Math.abs(fm) < 1e-7) return mid;
      if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }
  // Find x in [lo,hi] where fn(x) crosses target, fn monotonic. Returns null if no crossing.
  function solve(fn, target, lo, hi, iters) {
    var flo = fn(lo) - target, fhi = fn(hi) - target;
    if (flo * fhi > 0) return null;
    for (var i = 0; i < (iters || 60); i++) {
      var mid = (lo + hi) / 2, fm = fn(mid) - target;
      if (Math.abs(fm) < 1e-6) return mid;
      if (flo * fm < 0) { hi = mid; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }
  function fv(rate, years, pv) { return pv * Math.pow(1 + rate, years); }

  function rate3(frac) { return frac >= 0.66 ? 'Strong' : frac >= 0.33 ? 'Fair' : 'Weak'; }
  function scoreFrom(factors) {
    var total = 0;
    factors.forEach(function (f) { f.earned = round(f.max * f.frac, 1); f.rating = rate3(f.frac); total += f.earned; });
    return Math.round(clamp(total, 0, 100));
  }
  function verdict(score) {
    if (score >= 75) return { label: 'Strong Buy', tone: 'good' };
    if (score >= 60) return { label: 'Buy', tone: 'good' };
    if (score >= 45) return { label: 'Negotiate', tone: 'warn' };
    return { label: 'Pass', tone: 'bad' };
  }

  var DEFAULT_RATES = { mortgage30: 0.0625, treasury5y: 0.0375, savings: 0.0039, cd5y: 0.0134, treasury10y: 0.0415, commercialSpread: 0.0185 };

  // =====================================================================
  // RESIDENTIAL
  // =====================================================================
  function normResidential(i) {
    var rates = Object.assign({}, DEFAULT_RATES, i.rates || {});
    var price = num(i.price, 0);
    var a = {
      kind: 'residential',
      address: i.address || '', city: i.city || '', state: i.state || '', zip: i.zip || '',
      marketId: i.marketId || null, localityId: i.localityId || null,
      propertyType: i.propertyType || 'SFR',
      units: Math.max(1, Math.round(num(i.units, 1))),
      beds: num(i.beds, 3), baths: num(i.baths, 2), sqft: num(i.sqft, 1600), yearBuilt: num(i.yearBuilt, null), lotAcres: num(i.lotAcres, null),
      price: price,
      estValue: num(i.estValue, price),
      rehab: num(i.rehab, 0),
      rentMonthly: num(i.rentMonthly, 0),
      otherIncomeMonthly: num(i.otherIncomeMonthly, 0),
      taxAnnual: num(i.taxAnnual, price * 0.011),
      insuranceAnnual: num(i.insuranceAnnual, price * 0.005),
      hoaMonthly: num(i.hoaMonthly, 0),
      utilitiesMonthly: num(i.utilitiesMonthly, 0),
      maintenancePct: num(i.maintenancePct, 0.06),
      capexPct: num(i.capexPct, 0.05),
      mgmtPct: num(i.mgmtPct, 0.08),
      vacancyPct: num(i.vacancyPct, 0.05),
      cash: !!i.cash,
      downPct: i.cash ? 1 : num(i.downPct, 0.20),
      rate: num(i.rate, rates.mortgage30),
      termYears: num(i.termYears, 30),
      closingPct: num(i.closingPct, 0.03),
      appreciation: num(i.appreciation, 0.035),
      appreciation5y: num(i.appreciation5y, num(i.appreciation, 0.035)),
      rentGrowth: num(i.rentGrowth, 0.03),
      expenseGrowth: num(i.expenseGrowth, 0.03),
      holdYears: Math.max(1, Math.min(30, Math.round(num(i.holdYears, 5)))),
      sellingPct: num(i.sellingPct, 0.06),
      marginalTaxRate: num(i.marginalTaxRate, 0.24),
      capGainsRate: num(i.capGainsRate, 0.15),
      landPct: num(i.landPct, 0.20),
      costSegPct: num(i.costSegPct, 0.22),
      bonusPct: num(i.bonusPct, 1.0),
      flipTargetRoi: num(i.flipTargetRoi, 0.15),
      flipSellingPct: num(i.flipSellingPct, 0.08),
      flipBuyerClosingPct: num(i.flipBuyerClosingPct, 0.03),
      flipUtilitiesMonthly: num(i.flipUtilitiesMonthly, 250),
      strMultLow: num(i.strMultLow, 1.5), strMultHigh: num(i.strMultHigh, 2.0),
      rates: rates,
      sources: i.sources || {}
    };
    if (a.cash) a.downPct = 1;
    return a;
  }

  // Year-1 operating picture at a given price / rate / rent. Shared by every scenario table.
  function resYear1(a, o) {
    o = o || {};
    var price = o.price !== undefined ? o.price : a.price;
    var rate = o.rate !== undefined ? o.rate : a.rate;
    var rent = o.rent !== undefined ? o.rent : a.rentMonthly;
    var vac = o.vacancy !== undefined ? o.vacancy : a.vacancyPct;
    var opexMult = o.opexMult || 1;
    var gross = (rent + a.otherIncomeMonthly) * 12;
    var vacancyLoss = gross * vac;
    var egi = gross - vacancyLoss;
    var exp = {
      tax: a.taxAnnual,
      insurance: a.insuranceAnnual,
      hoa: a.hoaMonthly * 12,
      utilities: a.utilitiesMonthly * 12,
      maintenance: gross * a.maintenancePct,
      capex: gross * a.capexPct,
      management: egi * a.mgmtPct
    };
    var opex = 0; for (var k in exp) { exp[k] *= opexMult; opex += exp[k]; }
    var noi = egi - opex;
    var loan = price * (1 - a.downPct);
    var piMonthly = pmt(rate, a.termYears, loan);
    var debt = piMonthly * 12;
    var cash = price * a.downPct + price * a.closingPct + a.rehab;
    var cf = noi - debt;
    return {
      price: price, rate: rate, gross: gross, vacancyLoss: vacancyLoss, egi: egi, expenses: exp, opex: opex, noi: noi,
      loan: loan, piMonthly: piMonthly, debt: debt, cash: cash, cf: cf, cfMonthly: cf / 12,
      cap: price > 0 ? noi / price : 0,
      coc: cash > 0 ? cf / cash : 0,
      dscr: debt > 0 ? noi / debt : null,
      grm: gross > 0 ? price / gross : null,
      grossYield: price > 0 ? gross / price : 0,
      breakEvenOcc: gross > 0 ? (opex - exp.management + debt) / gross : null,
      pitiMonthly: piMonthly + a.taxAnnual / 12 + a.insuranceAnnual / 12 + a.hoaMonthly
    };
  }

  function resProjection(a, o) {
    o = o || {};
    var price = o.price !== undefined ? o.price : a.price;
    var app = o.appreciation !== undefined ? o.appreciation : a.appreciation;
    var rg = o.rentGrowth !== undefined ? o.rentGrowth : a.rentGrowth;
    var vac = o.vacancy !== undefined ? o.vacancy : a.vacancyPct;
    var rate = o.rate !== undefined ? o.rate : a.rate;
    var y1 = resYear1(a, { price: price, vacancy: vac, rate: rate });
    // The asset is worth what it is worth regardless of what you pay: value starts at estValue (or ARV).
    var value0 = a.estValue || price;
    var rows = [], cfs = [-y1.cash], cumCf = 0, years = a.holdYears;
    for (var y = 1; y <= years; y++) {
      var g = Math.pow(1 + rg, y - 1), e = Math.pow(1 + a.expenseGrowth, y - 1);
      var gross = (a.rentMonthly + a.otherIncomeMonthly) * 12 * g;
      var egi = gross * (1 - vac);
      var opex = (a.taxAnnual + a.insuranceAnnual + a.hoaMonthly * 12 + a.utilitiesMonthly * 12) * e + gross * (a.maintenancePct + a.capexPct) + egi * a.mgmtPct;
      var noi = egi - opex;
      var cf = noi - y1.debt;
      var value = value0 * Math.pow(1 + app, y);
      var bal = balanceAfter(rate, a.termYears, y1.loan, y * 12);
      cumCf += cf;
      rows.push({ year: y, gross: gross, noi: noi, cf: cf, cumCf: cumCf, value: value, balance: bal, equity: value - bal, interest: interestInYear(rate, a.termYears, y1.loan, y) });
      cfs.push(cf);
    }
    var last = rows[rows.length - 1];
    var sellCost = last.value * a.sellingPct;
    var netSale = last.value - sellCost - last.balance;
    cfs[cfs.length - 1] += netSale;
    var totalIn = 0; for (var c = 1; c < cfs.length; c++) totalIn += cfs[c];
    var profit = totalIn - y1.cash;
    return {
      y1: y1, rows: rows, cashflows: cfs, saleValue: last.value, sellCost: sellCost, payoff: last.balance, netSale: netSale,
      appreciationGain: last.value - value0, principalPaydown: y1.loan - last.balance, cumCf: cumCf,
      profit: profit, roi: y1.cash > 0 ? profit / y1.cash : 0, annualizedRoi: y1.cash > 0 ? profit / y1.cash / years : 0,
      irr: irr(cfs), equityMultiple: y1.cash > 0 ? totalIn / y1.cash : 0
    };
  }

  function resScore(a, o) {
    var p = resProjection(a, o), y = p.y1;
    var perUnitCf = y.cfMonthly / a.units;
    var factors = [
      { key: 'cap', label: 'Cap Rate', max: 20, value: y.cap, fmt: 'pct', frac: lin(y.cap, 0.03, 0.08), bench: '>7% strong, 4-7% fair' },
      { key: 'coc', label: 'Cash-on-Cash Return', max: 20, value: y.coc, fmt: 'pct', frac: lin(y.coc, 0, 0.10), bench: '>8% strong, 4-8% fair' },
      { key: 'dscr', label: 'Debt Service Coverage', max: 15, value: y.dscr, fmt: 'x', frac: y.dscr === null ? 1 : lin(y.dscr, 1.0, 1.5), bench: '>1.25x lender minimum' },
      { key: 'cf', label: 'Monthly Cash Flow / Unit', max: 15, value: perUnitCf, fmt: 'usd', frac: lin(perUnitCf, 0, 300), bench: '>$200/door strong' },
      { key: 'grm', label: 'Gross Rent Multiplier', max: 15, value: y.grm, fmt: 'x1', frac: y.grm === null ? 0 : lin(-y.grm, -18, -9), bench: '<12 strong, 12-18 fair' },
      { key: 'irr', label: 'Projected IRR', max: 15, value: p.irr, fmt: 'pct', frac: p.irr === null ? 0 : lin(p.irr, 0.05, 0.16), bench: '>12% strong' }
    ];
    return { score: scoreFrom(factors), factors: factors, projection: p };
  }

  function analyzeResidential(input) {
    var a = normResidential(input);
    var base = resScore(a);
    var p = base.projection, y1 = p.y1;

    // Bidding scenarios
    var steps = [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15];
    var bidding = steps.map(function (s) {
      var price = a.price * (1 + s), y = resYear1(a, { price: price });
      return { premium: s, price: price, down: price * a.downPct, piMonthly: y.piMonthly, opexMonthly: y.opex / 12, cfMonthly: y.cfMonthly, noi: y.noi, cap: y.cap, coc: y.coc, cash: y.cash, status: y.cfMonthly > 100 ? 'positive' : y.cfMonthly >= -50 ? 'breakeven' : 'negative' };
    });
    var breakEvenPrice = solve(function (x) { return resYear1(a, { price: x }).cf; }, 0, a.price * 0.01, a.price * 3);

    // Price targets for each verdict band
    var targets = [75, 60, 45].map(function (t) {
      var px = solve(function (x) { return resScore(a, { price: x }).score; }, t - 0.5, a.price * 0.05, a.price * 2.5, 40);
      if (px !== null && resScore(a, { price: px }).score < t) px = px * 0.995;
      return { score: t, label: verdict(t).label, price: px, discount: px === null ? null : px / a.price - 1, achievable: px !== null };
    });

    // Sensitivity: monthly cash flow by rate x price
    var rateSteps = [-0.02, -0.01, 0, 0.01, 0.02].map(function (d) { return Math.max(0.02, a.rate + d); });
    var priceSteps = [-0.20, -0.10, 0, 0.05, 0.10];
    var sensitivity = {
      rates: rateSteps, prices: priceSteps.map(function (s) { return { step: s, price: a.price * (1 + s) }; }),
      grid: rateSteps.map(function (r) { return priceSteps.map(function (s) { return resYear1(a, { price: a.price * (1 + s), rate: r }).cfMonthly; }); })
    };

    // Scenarios
    var scen = [
      { key: 'conservative', label: 'Conservative', appreciation: Math.min(a.appreciation, 0.02) - 0.005, vacancy: a.vacancyPct + 0.03, rentGrowth: 0 },
      { key: 'base', label: 'Base Case', appreciation: a.appreciation, vacancy: a.vacancyPct, rentGrowth: a.rentGrowth },
      { key: 'optimistic', label: 'Optimistic', appreciation: Math.max(a.appreciation5y, a.appreciation) + 0.01, vacancy: Math.max(0.02, a.vacancyPct - 0.02), rentGrowth: a.rentGrowth + 0.01 }
    ].map(function (s) {
      var pr = resProjection(a, s);
      return { key: s.key, label: s.label, appreciation: s.appreciation, vacancy: s.vacancy, rentGrowth: s.rentGrowth, profit: pr.profit, annualizedRoi: pr.annualizedRoi, irr: pr.irr, coc: pr.y1.coc, equityMultiple: pr.equityMultiple };
    });

    // Fix & flip / maximum allowable offer
    var arvBase = Math.max(a.estValue || a.price, a.price);
    var carryMonthly = a.taxAnnual / 12 + a.insuranceAnnual / 12 + a.flipUtilitiesMonthly;
    var flip = [
      { key: 'cosmetic', label: 'Cosmetic Update', desc: 'Paint, fixtures, flooring touch-up, curb appeal', psf: 15, months: 6, recoup: 0.85 },
      { key: 'midrange', label: 'Midrange Refresh', desc: 'Kitchen + bath refresh, flooring, systems check', psf: 32, months: 9, recoup: 0.70 },
      { key: 'major', label: 'Major Renovation', desc: 'Full kitchen, baths, HVAC/roof/electrical', psf: 55, months: 14, recoup: 0.60 }
    ].map(function (t) {
      var reno = t.psf * a.sqft;
      var arv = arvBase * Math.pow(1 + a.appreciation, t.months / 12) + reno * t.recoup;
      var hold = carryMonthly * t.months;
      var sell = arv * a.flipSellingPct;
      var net = arv - sell;
      var mao = (net / (1 + a.flipTargetRoi) - reno - hold) / (1 + a.flipBuyerClosingPct);
      function profitAt(px) { return net - (px * (1 + a.flipBuyerClosingPct) + reno + hold); }
      function roiAt(px) { var cost = px * (1 + a.flipBuyerClosingPct) + reno + hold; return cost > 0 ? profitAt(px) / cost : 0; }
      return { key: t.key, label: t.label, desc: t.desc, psf: t.psf, months: t.months, recoup: t.recoup, reno: reno, holding: hold, arv: arv, sellCost: sell, netProceeds: net, mao: mao, discount: 1 - mao / a.price, profitAtMao: profitAt(mao), roiAtMao: roiAt(mao), profitAtAsk: profitAt(a.price), roiAtAsk: roiAt(a.price) };
    });
    var bestFlip = flip.slice().sort(function (x, y) { return y.mao - x.mao; })[0];

    // Tax: straight-line depreciation, cost segregation, after-tax IRR
    var basis = a.price * (1 + a.closingPct) + a.rehab;
    var building = a.price * (1 - a.landPct) + a.rehab;
    var dep = building / 27.5;
    var accel = building * a.costSegPct;
    var depCostSegY1 = accel * a.bonusPct + accel * (1 - a.bonusPct) / 7 + (building - accel) / 27.5;
    var taxRows = p.rows.map(function (r) {
      var taxable = r.noi - r.interest - dep;
      return { year: r.year, noi: r.noi, interest: r.interest, depreciation: dep, taxable: taxable, taxEffect: -taxable * a.marginalTaxRate };
    });
    var accumDep = dep * a.holdYears;
    var gain = p.saleValue - p.sellCost - (basis - accumDep);
    var recaptureTax = Math.min(accumDep, Math.max(0, gain)) * 0.25;
    var cgTax = Math.max(0, gain - accumDep) * a.capGainsRate;
    var atCfs = p.cashflows.slice();
    taxRows.forEach(function (t) { atCfs[t.year] += t.taxEffect; });
    atCfs[atCfs.length - 1] -= (recaptureTax + cgTax);
    var y1Taxable = taxRows[0].taxable;
    var tax = {
      basis: basis, building: building, land: a.price * a.landPct, life: 27.5, annualDepreciation: dep,
      depreciationShield: dep * a.marginalTaxRate,
      year1: { noi: y1.noi, interest: taxRows[0].interest, depreciation: dep, taxable: y1Taxable, taxEffect: -y1Taxable * a.marginalTaxRate },
      costSeg: { pct: a.costSegPct, accelerated: accel, year1Deduction: depCostSegY1, extraYear1: depCostSegY1 - dep, extraYear1Value: (depCostSegY1 - dep) * a.marginalTaxRate, bonusPct: a.bonusPct },
      exit: { gain: gain, recaptureTax: recaptureTax, capGainsTax: cgTax },
      afterTaxIrr: irr(atCfs), rows: taxRows,
      marginalTaxRate: a.marginalTaxRate
    };

    // Strategies
    var perRoom = a.beds > 0 ? a.rentMonthly / a.beds : 0;
    var hhIncome = a.units > 1 ? a.rentMonthly * (a.units - 1) / a.units : perRoom * Math.max(0, a.beds - 1);
    var hhOpex = y1.opex * 0.7 / 12;
    var hhCf = hhIncome - hhOpex - y1.piMonthly;
    var strLowGross = a.rentMonthly * a.strMultLow, strHighGross = a.rentMonthly * a.strMultHigh;
    var strOpex = y1.opex * 1.3 / 12 + a.rentMonthly * 0.12;
    var alt = {
      ltr: { label: 'Long-Term Rental', gross: a.rentMonthly + a.otherIncomeMonthly, opex: y1.opex / 12, debt: y1.piMonthly, cf: y1.cfMonthly },
      houseHack: { label: 'House Hack', gross: hhIncome, opex: hhOpex, debt: y1.piMonthly, cf: hhCf, note: a.units > 1 ? 'Owner occupies one unit, rents the rest.' : 'Owner occupies one bedroom, rents ' + Math.max(0, a.beds - 1) + ' rooms at ~$' + Math.round(perRoom) + '/room.' },
      strLow: { label: 'Short-Term Rental (conservative)', gross: strLowGross, opex: strOpex, debt: y1.piMonthly, cf: strLowGross - strOpex - y1.piMonthly },
      strHigh: { label: 'Short-Term Rental (optimistic)', gross: strHighGross, opex: strOpex, debt: y1.piMonthly, cf: strHighGross - strOpex - y1.piMonthly }
    };
    function stars(n) { return clamp(Math.round(n), 1, 5); }
    var strategies = [
      { key: 'buyhold', label: 'Buy & Hold', stars: stars(base.score / 20 + 0.5), points: [
        [y1.cap >= 0.05, 'Cap rate ' + pctS(y1.cap)], [y1.cfMonthly > 0, 'Monthly cash flow ' + usdS(y1.cfMonthly)], [y1.grm !== null && y1.grm < 14, 'GRM ' + round(y1.grm || 0, 1) + 'x'],
        [y1.cap > a.rates.treasury5y + 0.02, 'Yield vs. 5-yr Treasury + 2%'], [a.appreciation >= 0.03, 'Market appreciation ' + pctS(a.appreciation)]] },
      { key: 'flip', label: 'Fix & Flip', stars: stars(3 + (bestFlip.roiAtAsk > 0 ? 2 : bestFlip.discount < 0.15 ? 0 : -1)), points: [
        [bestFlip.discount < 0.15, 'Best MAO is ' + pctS(bestFlip.discount) + ' below ask'], [bestFlip.profitAtAsk > 0, 'Profit at ask ' + usdS(bestFlip.profitAtAsk)],
        [a.sqft >= 1400, a.sqft + ' sqft renovation scale'], [(a.yearBuilt || 2000) < 1990, 'Older housing stock (' + (a.yearBuilt || 'n/a') + ')'], [a.appreciation > 0.02, 'Market supports ARV growth']] },
      { key: 'househack', label: 'House Hacking', stars: stars(hhCf > 500 ? 5 : hhCf > 0 ? 4 : hhCf > -500 ? 3 : 2), points: [
        [a.units > 1 || a.beds >= 3, a.units > 1 ? a.units + ' units' : a.beds + ' bedrooms'], [hhCf > -800, 'Owner housing cost ' + usdS(-hhCf) + '/mo'],
        [a.price < 750000, 'FHA / VA eligible price point'], [perRoom > 450 || a.units > 1, 'Per-room rent ~' + usdS(perRoom)]] },
      { key: 'str', label: 'Short-Term Rental', stars: stars(alt.strLow.cf > 0 ? 4 : alt.strHigh.cf > 0 ? 3 : 2), points: [
        [a.beds >= 3, a.beds + ' bedrooms for groups'], [alt.strLow.cf > 0, 'Conservative STR cash flow ' + usdS(alt.strLow.cf)],
        [a.hoaMonthly === 0, a.hoaMonthly === 0 ? 'No HOA restrictions' : 'HOA may restrict STR'], [true, 'Check local STR ordinance before buying']] }
    ].map(function (s) { s.points = s.points.map(function (pt) { return { good: !!pt[0], text: pt[1] }; }); return s; });
    var bestStrategy = strategies.slice().sort(function (x, y) { return y.stars - x.stars; })[0].key;

    // Alternatives
    var cash = y1.cash, H = a.holdYears;
    var alternatives = [
      { key: 'property', label: 'This Property', rate: p.irr, final: cash + p.profit, profit: p.profit },
      { key: 'treasury', label: H + '-Year Treasury', rate: a.rates.treasury5y, final: fv(a.rates.treasury5y, H, cash), profit: fv(a.rates.treasury5y, H, cash) - cash },
      { key: 'savings', label: 'FDIC Avg Savings', rate: a.rates.savings, final: fv(a.rates.savings, H, cash), profit: fv(a.rates.savings, H, cash) - cash },
      { key: 'cd', label: '5-Year CD', rate: a.rates.cd5y, final: fv(a.rates.cd5y, H, cash), profit: fv(a.rates.cd5y, H, cash) - cash }
    ];
    var appreciationShare = p.profit > 0 ? (p.appreciationGain) / (p.appreciationGain + p.principalPaydown + Math.max(0, p.cumCf)) : null;

    var v = verdict(base.score);
    var result = {
      kind: 'residential', assumptions: a, score: base.score, factors: base.factors, verdict: v,
      year1: y1, projection: p, bidding: bidding, breakEvenPrice: breakEvenPrice, priceTargets: targets,
      sensitivity: sensitivity, scenarios: scen, flip: flip, bestFlip: bestFlip, tax: tax,
      altIncome: alt, strategies: strategies, bestStrategy: bestStrategy, alternatives: alternatives,
      metrics: {
        noi: y1.noi, cap: y1.cap, coc: y1.coc, dscr: y1.dscr, grm: y1.grm, grossYield: y1.grossYield, netYield: y1.cap,
        cfMonthly: y1.cfMonthly, breakEvenOcc: y1.breakEvenOcc, pricePsf: a.sqft ? a.price / a.sqft : null, rentPsf: a.sqft ? a.rentMonthly / a.sqft : null,
        onePct: a.price ? a.rentMonthly / a.price : 0, irr: p.irr, equityMultiple: p.equityMultiple, piti: y1.pitiMonthly
      },
      appreciationShare: appreciationShare
    };
    result.insights = resInsights(result);
    return result;
  }

  function resInsights(r) {
    var a = r.assumptions, y = r.year1, p = r.projection, out = [];
    out.push({ tone: y.cfMonthly >= 0 ? 'good' : 'bad', title: 'Cash flow', text: 'At ' + usdS(a.price) + ' with ' + pctS(a.downPct) + ' down at ' + pctS(a.rate, 2) + ', the property ' + (y.cfMonthly >= 0 ? 'produces ' : 'loses ') + usdS(Math.abs(y.cfMonthly)) + '/month after all operating costs and debt service.' + (r.breakEvenPrice ? ' Cash flow breaks even at ' + usdS(r.breakEvenPrice) + ' (' + pctS(r.breakEvenPrice / a.price - 1) + ' vs. ask).' : '') });
    out.push({ tone: y.cap >= a.rates.treasury5y + 0.015 ? 'good' : 'warn', title: 'Yield vs. risk-free', text: 'Cap rate of ' + pctS(y.cap) + ' compares with a ' + pctS(a.rates.treasury5y) + ' 5-year Treasury. ' + (y.cap >= a.rates.treasury5y + 0.015 ? 'The property earns a real spread for the risk and illiquidity.' : 'The spread over a risk-free bond is thin; returns depend on appreciation.') });
    if (r.appreciationShare !== null) out.push({ tone: r.appreciationShare > 0.7 ? 'warn' : 'good', title: 'Where the return comes from', text: Math.round(r.appreciationShare * 100) + '% of projected profit comes from appreciation (' + pctS(a.appreciation) + '/yr). ' + (r.appreciationShare > 0.7 ? 'That is a market bet, not an income investment.' : 'Income and paydown carry a healthy share of the return.') });
    out.push({ tone: (y.dscr || 2) >= 1.2 ? 'good' : 'bad', title: 'Financing', text: 'DSCR of ' + (y.dscr ? round(y.dscr, 2) + 'x' : 'n/a (cash purchase)') + '. ' + ((y.dscr || 2) >= 1.2 ? 'DSCR lenders will typically finance this.' : 'Below the ~1.2x most DSCR lenders require; expect a larger down payment or a conventional loan.') });
    out.push({ tone: r.bestFlip.roiAtAsk > 0 ? 'good' : 'warn', title: 'Flip math', text: 'Best renovation path is "' + r.bestFlip.label + '": maximum allowable offer ' + usdS(r.bestFlip.mao) + ' for a ' + pctS(a.flipTargetRoi) + ' return, ' + pctS(r.bestFlip.discount) + ' below ask.' });
    out.push({ tone: 'info', title: 'Tax angle', text: 'Straight-line depreciation shelters ' + usdS(r.tax.annualDepreciation) + '/yr. A cost segregation study could move about ' + usdS(r.tax.costSeg.extraYear1) + ' of extra deductions into year 1. Passive-loss rules apply; confirm with a CPA.' });
    return out;
  }

  // =====================================================================
  // COMMERCIAL
  // =====================================================================
  var COST_SEG = { multifamily: 0.28, retail: 0.22, office: 0.15, industrial: 0.15, 'self-storage': 0.35, 'mixed-use': 0.22 };
  var DEFAULT_LEASE = { multifamily: 'GROSS', retail: 'NNN', office: 'MG', industrial: 'NNN', 'self-storage': 'GROSS', 'mixed-use': 'MG' };

  function normCommercial(i) {
    var rates = Object.assign({}, DEFAULT_RATES, i.rates || {});
    var cls = i.assetClass || 'industrial';
    var price = num(i.price, 0);
    var roll = (i.rentRoll && i.rentRoll.length ? i.rentRoll : []).map(function (r, idx) {
      var sf = num(r.sf, 0), count = Math.max(1, Math.round(num(r.count, 1)));
      var annual = r.rentAnnual !== undefined && r.rentAnnual !== '' ? num(r.rentAnnual, 0)
        : (r.rentPsfYr !== undefined && r.rentPsfYr !== '' ? num(r.rentPsfYr, 0) * sf : num(r.rentMonthly, 0) * 12 * count);
      var lt = (r.leaseType || DEFAULT_LEASE[cls] || 'NNN').toUpperCase();
      var end = r.leaseEndYears !== undefined && r.leaseEndYears !== '' ? num(r.leaseEndYears, null) : null;
      if (end === null && r.leaseEnd) { var d = new Date(r.leaseEnd + (String(r.leaseEnd).length <= 7 ? '-01' : '')); if (!isNaN(d)) end = Math.max(0, (d - new Date()) / (365.25 * 864e5)); }
      return { label: r.label || ('Suite ' + (idx + 1)), count: count, sf: sf, annualRent: annual, leaseType: lt, leaseEndYears: end, escalation: num(r.escalation, 0.03), vacant: !!r.vacant || annual === 0 };
    });
    var bsf = num(i.buildingSf, 0) || roll.reduce(function (s, r) { return s + r.sf; }, 0);
    var units = num(i.units, 0) || (cls === 'multifamily' ? roll.reduce(function (s, r) { return s + r.count; }, 0) : 0);
    var mktCap = num(i.marketCap, 0.065);
    var ex = i.expenses || {};
    var a = {
      kind: 'commercial', assetClass: cls,
      address: i.address || '', city: i.city || '', state: i.state || '', zip: i.zip || '', marketId: i.marketId || null, localityId: i.localityId || null,
      price: price, buildingSf: bsf, units: units, yearBuilt: num(i.yearBuilt, null), landAcres: num(i.landAcres, null),
      rentRoll: roll,
      marketRentPsf: num(i.marketRentPsf, roll.length && bsf ? roll.reduce(function (s, r) { return s + r.annualRent; }, 0) / bsf : 0),
      otherIncomeAnnual: num(i.otherIncomeAnnual, 0),
      vacancyPct: num(i.vacancyPct, cls === 'multifamily' ? 0.06 : 0.05),
      creditLossPct: num(i.creditLossPct, 0.01),
      expenses: {
        taxes: num(ex.taxes, price * 0.011), insurance: num(ex.insurance, price * 0.004), cam: num(ex.cam, bsf * 1.5),
        utilities: num(ex.utilities, cls === 'multifamily' ? units * 850 : 0), repairs: num(ex.repairs, cls === 'multifamily' ? units * 1100 : bsf * 0.35),
        payroll: num(ex.payroll, cls === 'multifamily' && units >= 24 ? units * 800 : 0), other: num(ex.other, cls === 'multifamily' ? units * 300 : 0)
      },
      mgmtPct: num(i.mgmtPct, cls === 'multifamily' ? 0.04 : 0.03),
      reservesPsf: num(i.reservesPsf, cls === 'multifamily' ? 0 : 0.20),
      reservesPerUnit: num(i.reservesPerUnit, cls === 'multifamily' ? 300 : 0),
      renewProb: num(i.renewProb, 0.70), downtimeMonths: num(i.downtimeMonths, 6),
      tiNewPsf: num(i.tiNewPsf, cls === 'office' ? 40 : cls === 'retail' ? 20 : 5),
      tiRenewPsf: num(i.tiRenewPsf, cls === 'office' ? 15 : 3), lcPct: num(i.lcPct, 0.05),
      ltv: num(i.ltv, 0.65), rate: num(i.rate, rates.treasury10y + rates.commercialSpread), amortYears: num(i.amortYears, cls === 'multifamily' ? 30 : 25),
      ioYears: num(i.ioYears, 0), minDscr: num(i.minDscr, 1.25), loanFeePct: num(i.loanFeePct, 0.01), closingPct: num(i.closingPct, 0.02),
      loanSizing: i.loanSizing || 'auto',
      marketCap: mktCap, exitCap: num(i.exitCap, mktCap + 0.0025),
      holdYears: Math.max(1, Math.min(20, Math.round(num(i.holdYears, 7)))), sellingPct: num(i.sellingPct, 0.025),
      rentGrowth: num(i.rentGrowth, 0.03), expenseGrowth: num(i.expenseGrowth, 0.03),
      marginalTaxRate: num(i.marginalTaxRate, 0.37), capGainsRate: num(i.capGainsRate, 0.20), landPct: num(i.landPct, 0.25),
      costSegPct: num(i.costSegPct, COST_SEG[cls] || 0.2), bonusPct: num(i.bonusPct, 1.0),
      rates: rates, sources: i.sources || {}
    };
    return a;
  }

  function comYear(a, y, o) {
    o = o || {};
    var rg = o.rentGrowth !== undefined ? o.rentGrowth : a.rentGrowth;
    var vac = o.vacancy !== undefined ? o.vacancy : a.vacancyPct;
    var g = Math.pow(1 + rg, y - 1), e = Math.pow(1 + a.expenseGrowth, y - 1);
    var ex = a.expenses, recoverablePool = (ex.taxes + ex.insurance + ex.cam) * e;
    var totalSf = a.buildingSf || 1;
    var pgr = 0, recov = 0, downtime = 0, tilc = 0;
    a.rentRoll.forEach(function (r) {
      var share = r.sf > 0 ? r.sf / totalSf : 0;
      var mkt = r.sf > 0 && a.marketRentPsf > 0 ? a.marketRentPsf * r.sf * g : r.annualRent * g;
      var contract = r.annualRent * Math.pow(1 + r.escalation, y - 1);
      var rent, rec;
      if (r.vacant) {
        // Vacant space leases up in year 1 after downtime at market.
        var occ = y === 1 ? clamp(1 - a.downtimeMonths / 12, 0, 1) : 1;
        rent = mkt * occ; rec = r.leaseType === 'NNN' ? recoverablePool * share * occ : 0;
        if (y === 1) { downtime += mkt * (1 - occ); tilc += r.sf * a.tiNewPsf + a.lcPct * mkt * 5; }
      } else if (r.leaseEndYears === null || a.assetClass === 'multifamily' || a.assetClass === 'self-storage') {
        rent = r.leaseEndYears === null && (a.assetClass === 'multifamily' || a.assetClass === 'self-storage') ? r.annualRent * g : contract;
        rec = r.leaseType === 'NNN' ? recoverablePool * share : 0;
      } else {
        var before = clamp(r.leaseEndYears - (y - 1), 0, 1), after = 1 - before;
        var rolled = mkt;
        var dtLoss = 0;
        if (after > 0 && r.leaseEndYears > y - 1 - 1e-9 && r.leaseEndYears <= y) {
          dtLoss = Math.min(after, (1 - a.renewProb) * a.downtimeMonths / 12) * rolled;
          tilc += r.sf * (a.renewProb * a.tiRenewPsf + (1 - a.renewProb) * a.tiNewPsf) + a.lcPct * rolled * 5 * (a.renewProb * 0.5 + (1 - a.renewProb));
        }
        rent = before * contract + after * rolled - dtLoss;
        downtime += dtLoss;
        rec = r.leaseType === 'NNN' ? recoverablePool * share * (1 - (rolled > 0 ? dtLoss / rolled : 0)) : 0;
      }
      pgr += rent; recov += rec;
    });
    var other = a.otherIncomeAnnual * g;
    var vacancyLoss = (pgr + recov) * vac;
    var credit = (pgr + recov) * a.creditLossPct;
    var egi = pgr + recov + other - vacancyLoss - credit;
    var opexLines = {
      taxes: ex.taxes * e, insurance: ex.insurance * e, cam: ex.cam * e, utilities: ex.utilities * e, repairs: ex.repairs * e, payroll: ex.payroll * e, other: ex.other * e,
      management: egi * a.mgmtPct, reserves: (a.reservesPsf * a.buildingSf + a.reservesPerUnit * a.units) * e
    };
    var opex = 0; for (var k in opexLines) opex += opexLines[k];
    return { year: y, pgr: pgr, recoveries: recov, other: other, vacancyLoss: vacancyLoss, creditLoss: credit, downtime: downtime, egi: egi, opexLines: opexLines, opex: opex, noi: egi - opex, tilc: tilc };
  }

  function comLoan(a, noi1, price) {
    var amortPmt = pmt(a.rate, a.amortYears, 1) * 12; // annual constant per $1
    var byLtv = a.ltv * price;
    var byDscr = noi1 > 0 ? noi1 / (a.minDscr * (a.ioYears > 0 ? a.rate : amortPmt)) : 0;
    var loan = a.loanSizing === 'ltv' ? byLtv : Math.min(byLtv, byDscr);
    if (a.ltv === 0) loan = 0;
    return { loan: Math.max(0, loan), byLtv: byLtv, byDscr: byDscr, constrainedBy: a.loanSizing === 'ltv' ? 'LTV' : (byDscr < byLtv ? 'DSCR' : 'LTV'), constant: amortPmt };
  }
  function comDebt(a, loan, y) {
    if (loan <= 0) return { payment: 0, interest: 0, balance: 0 };
    if (y <= a.ioYears) return { payment: loan * a.rate, interest: loan * a.rate, balance: loan };
    var k = (y - a.ioYears) * 12, p = pmt(a.rate, a.amortYears, loan) * 12;
    var b0 = balanceAfter(a.rate, a.amortYears, loan, k - 12), b1 = balanceAfter(a.rate, a.amortYears, loan, k);
    return { payment: p, interest: p - (b0 - b1), balance: b1 };
  }

  function comRun(a, o) {
    o = o || {};
    var price = o.price !== undefined ? o.price : a.price;
    var exitCap = o.exitCap !== undefined ? o.exitCap : a.exitCap;
    var years = [], H = a.holdYears;
    for (var y = 1; y <= H + 1; y++) years.push(comYear(a, y, o));
    var L = comLoan(a, years[0].noi, price);
    var closing = price * a.closingPct, fee = L.loan * a.loanFeePct;
    var equity = price + closing + fee - L.loan;
    var lev = [-equity], unlev = [-(price + closing)], cum = 0, rows = [];
    for (var t = 0; t < H; t++) {
      var yr = years[t], d = comDebt(a, L.loan, t + 1);
      var cfbt = yr.noi - d.payment - yr.tilc;
      cum += cfbt;
      rows.push(Object.assign({}, yr, { debt: d.payment, interest: d.interest, balance: d.balance, cfbt: cfbt, cumCf: cum, dscr: d.payment > 0 ? yr.noi / d.payment : null }));
      lev.push(cfbt); unlev.push(yr.noi - yr.tilc);
    }
    var fwdNoi = years[H].noi;
    var sale = exitCap > 0 ? fwdNoi / exitCap : 0;
    var sellCost = sale * a.sellingPct;
    var payoff = rows[H - 1].balance;
    lev[H] += sale - sellCost - payoff;
    unlev[H] += sale - sellCost;
    var totalIn = 0; for (var i = 1; i < lev.length; i++) totalIn += lev[i];
    var y1 = rows[0];
    return {
      price: price, loan: L, equity: equity, closing: closing, loanFee: fee, rows: rows, fwdNoi: fwdNoi, sale: sale, sellCost: sellCost, payoff: payoff,
      leveredCfs: lev, unleveredCfs: unlev, leveredIrr: irr(lev), unleveredIrr: irr(unlev), equityMultiple: equity > 0 ? totalIn / equity : 0, profit: totalIn - equity,
      y1: y1, cap: price > 0 ? y1.noi / price : 0, coc: equity > 0 ? y1.cfbt / equity : 0, dscr: y1.dscr, debtYield: L.loan > 0 ? y1.noi / L.loan : null,
      ltv: price > 0 ? L.loan / price : 0
    };
  }

  function comScore(a, o) {
    var r = comRun(a, o), y1 = r.y1;
    var walt = waltOf(a);
    var rollFrac = a.assetClass === 'multifamily' || a.assetClass === 'self-storage' ? lin(-a.vacancyPct, -0.12, -0.04) : (walt === null ? 0.5 : lin(walt, 1, 6));
    var factors = [
      { key: 'capSpread', label: 'Cap Rate vs. Market', max: 20, value: r.cap - a.marketCap, fmt: 'bps', frac: lin(r.cap - a.marketCap, -0.01, 0.01), bench: 'Going-in ' + pctS(r.cap, 2) + ' vs. market ' + pctS(a.marketCap, 2) },
      { key: 'dscr', label: 'Debt Service Coverage', max: 15, value: r.dscr, fmt: 'x', frac: r.dscr === null ? 1 : lin(r.dscr, 1.0, 1.5), bench: '>1.25x typical lender minimum' },
      { key: 'coc', label: 'Year-1 Cash-on-Cash', max: 15, value: r.coc, fmt: 'pct', frac: lin(r.coc, 0.02, 0.10), bench: '>8% strong' },
      { key: 'debtYield', label: 'Debt Yield', max: 15, value: r.debtYield, fmt: 'pct', frac: r.debtYield === null ? 1 : lin(r.debtYield, 0.07, 0.11), bench: '>9-10% for most lenders' },
      { key: 'irr', label: 'Levered IRR', max: 20, value: r.leveredIrr, fmt: 'pct', frac: r.leveredIrr === null ? 0 : lin(r.leveredIrr, 0.06, 0.16), bench: '>14% strong for value-add' },
      { key: 'rollover', label: a.assetClass === 'multifamily' || a.assetClass === 'self-storage' ? 'Occupancy Stability' : 'Lease Term (WALT)', max: 15, value: a.assetClass === 'multifamily' || a.assetClass === 'self-storage' ? 1 - a.vacancyPct : walt, fmt: a.assetClass === 'multifamily' || a.assetClass === 'self-storage' ? 'pct' : 'yrs', frac: rollFrac, bench: a.assetClass === 'multifamily' ? '>94% occupancy' : 'WALT >5 yrs strong' }
    ];
    return { score: scoreFrom(factors), factors: factors, run: r };
  }

  function waltOf(a) {
    var tot = 0, w = 0;
    a.rentRoll.forEach(function (r) { if (!r.vacant && r.leaseEndYears !== null) { tot += r.annualRent; w += r.annualRent * r.leaseEndYears; } });
    return tot > 0 ? w / tot : null;
  }

  function analyzeCommercial(input) {
    var a = normCommercial(input);
    var base = comScore(a), r = base.run, y1 = r.y1;
    var pgrTotal = y1.pgr + y1.recoveries + y1.other;
    var walt = waltOf(a);
    var rollover = a.rentRoll.filter(function (x) { return x.leaseEndYears !== null && !x.vacant && x.leaseEndYears <= a.holdYears; })
      .map(function (x) { return { label: x.label, sf: x.sf, year: Math.ceil(x.leaseEndYears || 0.01), rent: x.annualRent, pctOfRent: x.annualRent / Math.max(1, a.rentRoll.reduce(function (s, q) { return s + q.annualRent; }, 0)) }; })
      .sort(function (p, q) { return p.year - q.year; });

    var priceSteps = [-0.10, -0.05, 0, 0.05, 0.10];
    var capSteps = [-0.005, -0.0025, 0, 0.0025, 0.005].map(function (d) { return Math.max(0.03, a.exitCap + d); });
    var sensitivity = {
      exitCaps: capSteps, prices: priceSteps.map(function (s) { return { step: s, price: a.price * (1 + s) }; }),
      grid: capSteps.map(function (c) { return priceSteps.map(function (s) { return comRun(a, { price: a.price * (1 + s), exitCap: c }).leveredIrr; }); })
    };
    var scenarios = [
      { key: 'conservative', label: 'Conservative', rentGrowth: Math.max(0, a.rentGrowth - 0.02), vacancy: a.vacancyPct + 0.04, exitCap: a.exitCap + 0.005 },
      { key: 'base', label: 'Base Case', rentGrowth: a.rentGrowth, vacancy: a.vacancyPct, exitCap: a.exitCap },
      { key: 'optimistic', label: 'Optimistic', rentGrowth: a.rentGrowth + 0.01, vacancy: Math.max(0.02, a.vacancyPct - 0.02), exitCap: a.exitCap - 0.0025 }
    ].map(function (s) { var q = comRun(a, s); return { key: s.key, label: s.label, rentGrowth: s.rentGrowth, vacancy: s.vacancy, exitCap: s.exitCap, leveredIrr: q.leveredIrr, unleveredIrr: q.unleveredIrr, equityMultiple: q.equityMultiple, profit: q.profit }; });

    var targets = [75, 60, 45].map(function (t) {
      var px = solve(function (x) { return comScore(a, { price: x }).score; }, t - 0.5, a.price * 0.3, a.price * 2, 40);
      return { score: t, label: verdict(t).label, price: px, discount: px === null ? null : px / a.price - 1, achievable: px !== null };
    });
    var valueAtMarketCap = a.marketCap > 0 ? y1.noi / a.marketCap : null;

    // Tax
    var life = a.assetClass === 'multifamily' ? 27.5 : 39;
    var building = a.price * (1 - a.landPct);
    var dep = building / life, accel = building * a.costSegPct;
    var y1Dep = accel * a.bonusPct + accel * (1 - a.bonusPct) / 7 + (building - accel) / life;
    var tax = {
      life: life, building: building, annualDepreciation: dep, depreciationShield: dep * a.marginalTaxRate,
      year1: { noi: y1.noi, interest: y1.interest, depreciation: dep, taxable: y1.noi - y1.interest - dep },
      costSeg: { pct: a.costSegPct, accelerated: accel, year1Deduction: y1Dep, extraYear1: y1Dep - dep, extraYear1Value: (y1Dep - dep) * a.marginalTaxRate, bonusPct: a.bonusPct },
      marginalTaxRate: a.marginalTaxRate
    };

    var v = verdict(base.score);
    var res = {
      kind: 'commercial', assumptions: a, score: base.score, factors: base.factors, verdict: v,
      run: r, year1: y1, sensitivity: sensitivity, scenarios: scenarios, priceTargets: targets, rollover: rollover, tax: tax,
      metrics: {
        noi: y1.noi, cap: r.cap, marketCap: a.marketCap, valueAtMarketCap: valueAtMarketCap, coc: r.coc, dscr: r.dscr, debtYield: r.debtYield, ltv: r.ltv,
        leveredIrr: r.leveredIrr, unleveredIrr: r.unleveredIrr, equityMultiple: r.equityMultiple,
        pricePsf: a.buildingSf ? a.price / a.buildingSf : null, pricePerUnit: a.units ? a.price / a.units : null,
        noiPsf: a.buildingSf ? y1.noi / a.buildingSf : null, expenseRatio: y1.egi > 0 ? y1.opex / y1.egi : null,
        breakEvenOcc: pgrTotal > 0 ? (y1.opex + y1.debt) / pgrTotal : null, walt: walt, exitValue: r.sale
      }
    };
    res.insights = comInsights(res);
    return res;
  }

  function comInsights(r) {
    var a = r.assumptions, m = r.metrics, out = [];
    out.push({ tone: m.cap >= a.marketCap ? 'good' : 'warn', title: 'Pricing vs. market', text: 'Going-in cap of ' + pctS(m.cap, 2) + ' vs. a ' + pctS(a.marketCap, 2) + ' market benchmark for ' + a.assetClass + '. At market cap the in-place NOI supports ' + usdS(m.valueAtMarketCap) + ' (' + pctS(m.valueAtMarketCap / a.price - 1) + ' vs. price).' });
    out.push({ tone: r.run.loan.constrainedBy === 'DSCR' ? 'warn' : 'good', title: 'Debt sizing', text: 'Loan sized at ' + usdS(r.run.loan.loan) + ' (' + pctS(m.ltv) + ' LTV), constrained by ' + r.run.loan.constrainedBy + ' at ' + pctS(a.rate, 2) + '. Debt yield ' + (m.debtYield ? pctS(m.debtYield) : 'n/a') + ', DSCR ' + (m.dscr ? round(m.dscr, 2) + 'x' : 'n/a') + '.' });
    if (m.walt !== null) out.push({ tone: m.walt >= 4 ? 'good' : 'bad', title: 'Rollover risk', text: 'Rent-weighted average lease term is ' + round(m.walt, 1) + ' years. ' + (r.rollover.length ? Math.round(r.rollover.reduce(function (s, x) { return s + x.pctOfRent; }, 0) * 100) + '% of rent rolls during the ' + a.holdYears + '-year hold.' : 'No leases roll during the hold.') });
    out.push({ tone: (m.leveredIrr || 0) >= 0.12 ? 'good' : 'warn', title: 'Returns', text: 'Levered IRR ' + (m.leveredIrr === null ? 'n/a' : pctS(m.leveredIrr)) + ', unlevered ' + (m.unleveredIrr === null ? 'n/a' : pctS(m.unleveredIrr)) + ', ' + round(m.equityMultiple, 2) + 'x equity multiple, exiting at a ' + pctS(a.exitCap, 2) + ' cap in year ' + a.holdYears + '.' });
    out.push({ tone: 'info', title: 'Tax angle', text: 'A cost segregation study on a ' + a.assetClass + ' asset typically reclassifies ~' + Math.round(a.costSegPct * 100) + '% of basis to 5/7/15-year property. With bonus depreciation that is roughly ' + usdS(r.tax.costSeg.extraYear1) + ' of additional year-1 deductions.' });
    return out;
  }

  // =====================================================================
  // LAND (lot-yield residual)
  // =====================================================================
  function normLand(i) {
    var product = i.product || 'sfd';
    var a = {
      kind: 'land', address: i.address || '', city: i.city || '', state: i.state || '', zip: i.zip || '', marketId: i.marketId || null, localityId: i.localityId || null,
      price: num(i.price, 0), acres: num(i.acres, 0), zoning: i.zoning || '', product: product,
      netDevelopablePct: num(i.netDevelopablePct, 0.70),
      density: num(i.density, product === 'th' ? 10 : 3.0),
      lotsOverride: num(i.lots, 0),
      finishedLotValue: num(i.finishedLotValue, product === 'th' ? 70000 : 110000),
      devCostPerLot: num(i.devCostPerLot, product === 'th' ? 42000 : 65000),
      impactFeePerLot: num(i.impactFeePerLot, 5000),
      softCostPct: num(i.softCostPct, 0.10), contingencyPct: num(i.contingencyPct, 0.05),
      entitlementMonths: num(i.entitlementMonths, 12), devMonths: num(i.devMonths, 12),
      takedownPerYear: num(i.takedownPerYear, 40),
      lotEscalation: num(i.lotEscalation, 0.03), costEscalation: num(i.costEscalation, 0.04),
      marginPct: num(i.marginPct, 0.18), discountRate: num(i.discountRate, 0.18), closingPct: num(i.closingPct, 0.02),
      carryTaxRate: num(i.carryTaxRate, 0.009), entitlementCost: num(i.entitlementCost, 0),
      sources: i.sources || {}
    };
    return a;
  }
  function landRun(a, o) {
    o = o || {};
    var price = o.price !== undefined ? o.price : a.price;
    var lotVal = (o.lotValueMult || 1) * a.finishedLotValue, dev = (o.devCostMult || 1) * a.devCostPerLot;
    var devAcres = a.acres * a.netDevelopablePct;
    var lots = a.lotsOverride > 0 ? a.lotsOverride : Math.floor(devAcres * a.density);
    var startYr = (a.entitlementMonths + a.devMonths) / 12;
    var phases = [], left = lots, t = 0, revenue = 0, hard = 0, fees = 0;
    while (left > 0 && t < 40) {
      var n = Math.min(a.takedownPerYear, left);
      var when = startYr + t;
      var rev = n * lotVal * Math.pow(1 + a.lotEscalation, when);
      var h = n * dev * Math.pow(1 + a.costEscalation, Math.max(0, when - 1));
      var f = n * a.impactFeePerLot;
      phases.push({ phase: t + 1, lots: n, year: when, revenue: rev, hardCost: h, impactFees: f });
      revenue += rev; hard += h; fees += f; left -= n; t++;
    }
    var soft = hard * a.softCostPct + a.entitlementCost, cont = hard * a.contingencyPct;
    var holdYears = startYr + phases.length;
    var carry = price * a.carryTaxRate * holdYears;
    var totalDev = hard + fees + soft + cont + carry;
    var staticResidual = (revenue * (1 - a.marginPct) - (hard + fees + soft + cont)) / (1 + a.closingPct + a.carryTaxRate * holdYears);
    // Annual cash-flow vector for IRR (year 0 = land + closing).
    var horizon = Math.ceil(holdYears) + 1, cfs = []; for (var k = 0; k <= horizon; k++) cfs.push(0);
    cfs[0] -= price * (1 + a.closingPct) + a.entitlementCost;
    for (var y = 1; y <= Math.ceil(startYr); y++) cfs[Math.min(horizon, y)] -= price * a.carryTaxRate;
    phases.forEach(function (p) {
      var spend = Math.max(1, Math.floor(p.year)), sell = Math.max(1, Math.ceil(p.year));
      cfs[Math.min(horizon, spend)] -= p.hardCost * (1 + a.softCostPct + a.contingencyPct);
      cfs[Math.min(horizon, sell)] += p.revenue - p.impactFees;
    });
    var dcfResidual = (function () {
      var pv = 0;
      phases.forEach(function (p) { pv += (p.revenue - p.impactFees) / Math.pow(1 + a.discountRate, Math.ceil(p.year)) - p.hardCost * (1 + a.softCostPct + a.contingencyPct) / Math.pow(1 + a.discountRate, Math.floor(p.year)); });
      return (pv - a.entitlementCost) / (1 + a.closingPct + a.carryTaxRate * startYr);
    })();
    var profit = revenue - totalDev - price * (1 + a.closingPct);
    return {
      price: price, lots: lots, devAcres: devAcres, phases: phases, revenue: revenue, hard: hard, fees: fees, soft: soft, contingency: cont, carry: carry,
      totalDev: totalDev, staticResidual: staticResidual, dcfResidual: dcfResidual, profit: profit, margin: revenue > 0 ? profit / revenue : 0,
      irr: irr(cfs), cashflows: cfs, landPerLot: lots > 0 ? price / lots : null, landPctOfLot: lots > 0 && lotVal > 0 ? price / lots / lotVal : null,
      pricePerAcre: a.acres > 0 ? price / a.acres : null, holdYears: holdYears
    };
  }
  function landScore(a, o) {
    var r = landRun(a, o);
    var factors = [
      { key: 'landPct', label: 'Land Cost / Finished Lot', max: 35, value: r.landPctOfLot, fmt: 'pct', frac: r.landPctOfLot === null ? 0 : lin(-r.landPctOfLot, -0.35, -0.15), bench: '<20% of lot value strong' },
      { key: 'margin', label: 'Margin at Ask', max: 35, value: r.margin, fmt: 'pct', frac: lin(r.margin, 0.05, 0.25), bench: '>18% target' },
      { key: 'irr', label: 'Project IRR', max: 30, value: r.irr, fmt: 'pct', frac: r.irr === null ? 0 : lin(r.irr, 0.08, 0.25), bench: '>20% strong' }
    ];
    return { score: scoreFrom(factors), factors: factors, run: r };
  }
  function analyzeLand(input) {
    var a = normLand(input), base = landScore(a), r = base.run;
    var lv = [-0.10, -0.05, 0, 0.05, 0.10], dc = [-0.10, -0.05, 0, 0.05, 0.10];
    var sensitivity = { lotValues: lv.map(function (s) { return { step: s, value: a.finishedLotValue * (1 + s) }; }), devCosts: dc.map(function (s) { return { step: s, value: a.devCostPerLot * (1 + s) }; }),
      grid: dc.map(function (d) { return lv.map(function (l) { return landRun(a, { lotValueMult: 1 + l, devCostMult: 1 + d }).irr; }); }) };
    var targets = [75, 60, 45].map(function (t) {
      var px = solve(function (x) { return landScore(a, { price: x }).score; }, t - 0.5, Math.max(1, a.price * 0.05), Math.max(a.price * 3, 1e6), 40);
      return { score: t, label: verdict(t).label, price: px, discount: px === null || !a.price ? null : px / a.price - 1, achievable: px !== null };
    });
    var v = verdict(base.score);
    var res = { kind: 'land', assumptions: a, score: base.score, factors: base.factors, verdict: v, run: r, sensitivity: sensitivity, priceTargets: targets,
      metrics: { lots: r.lots, pricePerAcre: r.pricePerAcre, landPerLot: r.landPerLot, landPctOfLot: r.landPctOfLot, staticResidual: r.staticResidual, dcfResidual: r.dcfResidual, margin: r.margin, irr: r.irr, revenue: r.revenue, profit: r.profit } };
    res.insights = [
      { tone: r.landPctOfLot !== null && r.landPctOfLot <= 0.25 ? 'good' : 'warn', title: 'Land basis', text: r.lots + ' lots at ' + usdS(r.landPerLot) + '/lot, or ' + pctS(r.landPctOfLot || 0) + ' of finished lot value. Builders and lot developers usually want raw land under 20-25% of the finished lot.' },
      { tone: a.price <= r.staticResidual ? 'good' : 'bad', title: 'Residual land value', text: 'After hard costs, fees, soft costs and an ' + pctS(a.marginPct) + ' margin, the land supports ' + usdS(r.staticResidual) + ' (static) or ' + usdS(r.dcfResidual) + ' discounted at ' + pctS(a.discountRate) + '. Asking is ' + usdS(a.price) + '.' },
      { tone: 'info', title: 'Absorption', text: 'At ' + a.takedownPerYear + ' lots/yr after ' + (a.entitlementMonths + a.devMonths) + ' months of entitlement and site work, sell-out takes ' + round(r.holdYears, 1) + ' years. A builder takedown contract de-risks this more than any other variable.' }
    ];
    return res;
  }

  // ---------- formatting (used by insights + UI) ----------
  function usdS(v) { if (v === null || v === undefined || !isFinite(v)) return 'n/a'; var neg = v < 0; v = Math.abs(v); var s = '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); return neg ? '-' + s : s; }
  function pctS(v, d) { if (v === null || v === undefined || !isFinite(v)) return 'n/a'; return (v * 100).toFixed(d === undefined ? 1 : d) + '%'; }

  function analyze(input) {
    var k = (input && input.kind) || 'residential';
    if (k === 'commercial') return analyzeCommercial(input);
    if (k === 'land') return analyzeLand(input);
    return analyzeResidential(input);
  }

  return {
    analyze: analyze, analyzeResidential: analyzeResidential, analyzeCommercial: analyzeCommercial, analyzeLand: analyzeLand,
    pmt: pmt, balanceAfter: balanceAfter, irr: irr, npv: npv, solve: solve, verdict: verdict,
    fmt: { usd: usdS, pct: pctS }, COST_SEG: COST_SEG, DEFAULT_RATES: DEFAULT_RATES
  };
});
