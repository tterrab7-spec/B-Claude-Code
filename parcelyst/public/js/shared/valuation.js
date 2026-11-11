/*
 * Desktop valuation review engine.
 * Develops the three approaches to value from data the reviewer supplies or confirms:
 *   - Sales comparison: adjustment grid (transactional, then property adjustments), weighted by
 *     gross adjustment, recency and proximity
 *   - Income: stabilized direct capitalization with cap-rate support (market, comp-extracted, band of
 *     investment, debt-coverage), optional tax-loaded cap rate for assessment work, DCF cross-check;
 *     gross rent multiplier for 1-4 unit residential
 *   - Cost: replacement cost new less physical, functional and external depreciation, plus land
 * then reconciles them, scores confidence, and tests the conclusion against the tax assessment
 * (overvaluation and uniformity).
 *
 * This is an analysis tool. Its output is NOT an appraisal and does not comply with USPAP unless a
 * licensed appraiser adopts it as their own work. Cost and adjustment defaults are reference values.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./markets.js'));
  else root.PValuation = factory(root.PEngine, root.PMarkets);
})(typeof self !== 'undefined' ? self : this, function (PEngine, PMarkets) {
  'use strict';

  function num(v, d) { var n = typeof v === 'string' ? parseFloat(v.replace(/[$,%\s]/g, '')) : v; return (n === null || n === undefined || n === '' || isNaN(n)) ? d : n; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function median(xs) { var a = xs.filter(function (x) { return x !== null && isFinite(x); }).sort(function (p, q) { return p - q; }); if (!a.length) return null; var m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function mean(xs) { return xs.length ? xs.reduce(function (s, x) { return s + x; }, 0) / xs.length : null; }
  function roundTo(v, step) { return Math.round(v / step) * step; }
  function roundValue(v) { var a = Math.abs(v); return roundTo(v, a < 500000 ? 1000 : a < 2000000 ? 5000 : a < 10000000 ? 10000 : 50000); }
  function yearsBetween(a, b) { var d1 = new Date(a), d2 = new Date(b); if (isNaN(d1) || isNaN(d2)) return 0; return (d2 - d1) / (365.25 * 864e5); }
  function usd(v) { return PEngine.fmt.usd(v); }
  function pct(v, d) { return PEngine.fmt.pct(v, d); }

  var CLASSES = ['industrial', 'retail', 'office', 'multifamily', 'self-storage', 'mixed-use'];
  var RES_TYPES = ['SFR', 'Townhouse', 'Condo', '2-4 Unit'];

  // Reference replacement cost new, $/SF of building, average quality, before local multiplier.
  // Verify against a cost service (Marshall & Swift, RSMeans) before relying on the cost approach.
  var COST_REF = {
    SFR: { psf: 185, life: 60 }, Townhouse: { psf: 170, life: 60 }, Condo: { psf: 195, life: 60 }, '2-4 Unit': { psf: 165, life: 55 },
    industrial: { psf: 105, life: 50 }, retail: { psf: 175, life: 45 }, office: { psf: 225, life: 50 }, multifamily: { psf: 180, life: 55 }, 'self-storage': { psf: 80, life: 40 }, 'mixed-use': { psf: 215, life: 50 }
  };
  var QUALITY_MULT = { 1: 0.80, 2: 0.90, 3: 1.00, 4: 1.20, 5: 1.45 };
  var LOCAL_MULT = { 'hampton-roads': 0.89, richmond: 0.89, austin: 0.86, 'jackson-county-mo': 1.00 };
  var PURPOSES = {
    assessment: 'Real estate tax assessment review', estate: 'Estate, gift or basis planning', internal: 'Internal decision support',
    listing: 'Pricing guidance for a listing or offer', lending: 'Loan pre-screen (not for credit decisions)'
  };
  var CONDITION = { 1: 'Poor', 2: 'Fair', 3: 'Average', 4: 'Good', 5: 'Excellent' };

  // ---------------------------------------------------------------- normalize
  function normalize(i) {
    i = i || {};
    var s = i.subject || {}, as = i.assignment || {}, ax = i.assessment || {}, sl = i.sales || {}, inc = i.income || {}, co = i.cost || {};
    var type = s.type === 'commercial' ? 'commercial' : 'residential';
    var cls = type === 'commercial' ? (CLASSES.indexOf(s.assetClass) !== -1 ? s.assetClass : 'industrial') : null;
    var ptype = type === 'residential' ? (RES_TYPES.indexOf(s.propertyType) !== -1 ? s.propertyType : 'SFR') : null;
    var loc = (i.marketId && PMarkets.byId(i.marketId)) ? { market: PMarkets.byId(i.marketId) } : (PMarkets.findByZip(i.zip) || PMarkets.findByCity(i.city, i.state) || {});
    var market = loc.market || null;
    var locality = loc.locality || (market && i.localityId ? market.localities.filter(function (l) { return l.id === i.localityId; })[0] : null) || (market ? (PMarkets.findByZip(i.zip) || {}).locality : null) || null;
    var etrDefault = market ? PMarkets.effectiveTaxRate(market, locality, type === 'commercial') : 0.011;
    var eff = as.effectiveDate || new Date().toISOString().slice(0, 10);
    var effYear = new Date(eff).getFullYear() || new Date().getFullYear();
    var mref = market && cls ? market.commercial[cls] : null;
    var sf = num(s.sf, 0), units = Math.round(num(s.units, type === 'residential' ? (ptype === '2-4 Unit' ? 2 : 1) : 0));
    var key = type === 'commercial' ? cls : ptype;
    var condition = clamp(Math.round(num(s.condition, 3)), 1, 5), quality = clamp(Math.round(num(s.quality, 3)), 1, 5);
    var yearBuilt = num(s.yearBuilt, null);
    var actualAge = yearBuilt ? Math.max(0, effYear - yearBuilt) : null;

    var a = {
      kind: 'valuation', address: i.address || '', city: i.city || '', state: i.state || '', zip: i.zip || '',
      marketId: market ? market.id : null, localityId: locality ? locality.id : null, marketName: market ? market.name : null, localityName: locality ? locality.name : null,
      assignment: {
        client: as.client || '', purpose: PURPOSES[as.purpose] ? as.purpose : 'assessment', effectiveDate: eff, interest: as.interest || 'Fee simple',
        preparedBy: as.preparedBy || '', firm: as.firm || '', credentials: as.credentials || '', reviewer: as.reviewer || '', reviewerLicense: as.reviewerLicense || '',
        fileNo: as.fileNo || '', notes: as.notes || ''
      },
      subject: {
        type: type, assetClass: cls, propertyType: ptype, typeKey: key, sf: sf, units: units, lotAcres: num(s.lotAcres, null), yearBuilt: yearBuilt, actualAge: actualAge,
        beds: num(s.beds, null), baths: num(s.baths, null), garage: num(s.garage, 0), condition: condition, quality: quality,
        occupancyPct: num(s.occupancyPct, null), zoning: s.zoning || '', parcelId: s.parcelId || '', description: s.description || ''
      },
      assessment: {
        total: num(ax.total, null), land: num(ax.land, null), improvements: num(ax.improvements, null), taxYear: ax.taxYear || String(effYear),
        taxRate: num(ax.taxRate, etrDefault), ratio: num(ax.ratio, 1), feePct: num(ax.feePct, 0.30), horizonYears: Math.max(1, Math.round(num(ax.horizonYears, 3)))
      },
      weights: i.weights || {},
      sources: {}
    };
    a.sources.taxRate = ax.taxRate !== undefined && ax.taxRate !== '' && ax.taxRate !== null ? 'Entered by reviewer' : (locality ? locality.name + ' adopted rate (' + market.asOf + ' reference)' : 'National average');

    // ----- sales
    var comps = (sl.comps || []).filter(function (c) { return c && num(c.salePrice, 0) > 0 && c.exclude !== true; }).map(function (c, idx) {
      return {
        idx: idx, address: c.address || ('Comparable ' + (idx + 1)), saleDate: c.saleDate || null, salePrice: num(c.salePrice, 0), sf: num(c.sf, null), units: num(c.units, null),
        lotAcres: num(c.lotAcres, null), yearBuilt: num(c.yearBuilt, null), beds: num(c.beds, null), baths: num(c.baths, null), garage: num(c.garage, null),
        condition: c.condition === undefined || c.condition === '' || c.condition === null ? null : clamp(Math.round(num(c.condition, 3)), 1, 5),
        quality: c.quality === undefined || c.quality === '' || c.quality === null ? null : clamp(Math.round(num(c.quality, 3)), 1, 5),
        distanceMi: num(c.distanceMi, null), occupancyPct: num(c.occupancyPct, null), noi: num(c.noi, null), capRate: num(c.capRate, null), rent: num(c.rent, null),
        assessed: num(c.assessed, null), rightsAdjPct: num(c.rightsAdjPct, 0), financingAdjPct: num(c.financingAdjPct, 0), conditionsAdjPct: num(c.conditionsAdjPct, 0),
        expendAfterSale: num(c.expendAfterSale, 0), locationAdjPct: num(c.locationAdjPct, 0), otherAdjPct: num(c.otherAdjPct, 0), otherAdj: num(c.otherAdj, 0),
        source: c.source || '', note: c.note || '', weightOverride: num(c.weight, null)
      };
    });
    var r = sl.rates || {}, ppsf = median(comps.map(function (c) { return c.sf ? c.salePrice / c.sf : null; })), medPrice = median(comps.map(function (c) { return c.salePrice; }));
    var trend = market ? (type === 'residential' ? market.residential.appreciation1y : 0.02) : 0.03;
    a.sales = {
      comps: comps,
      unit: type === 'commercial' && cls === 'multifamily' && units > 0 && comps.every(function (c) { return c.units > 0; }) && comps.length ? 'unit' : 'sf',
      rates: type === 'residential' ? {
        timePctPerYear: num(r.timePctPerYear, trend), glaPerSf: num(r.glaPerSf, ppsf ? roundTo(ppsf * 0.40, 5) : 60), lotPerAcre: num(r.lotPerAcre, market ? roundTo(market.land.finishedLotSfd * 0.5, 5000) : 50000),
        agePctPerYear: num(r.agePctPerYear, 0.003), conditionPctPerStep: num(r.conditionPctPerStep, 0.05), qualityPctPerStep: num(r.qualityPctPerStep, 0.05),
        perBed: num(r.perBed, 0), perBath: num(r.perBath, medPrice ? roundTo(medPrice * 0.015, 500) : 5000), perGarage: num(r.perGarage, medPrice ? roundTo(medPrice * 0.015, 500) : 5000)
      } : {
        timePctPerYear: num(r.timePctPerYear, trend), sizePctPerDoubling: num(r.sizePctPerDoubling, 0.05), agePctPerYear: num(r.agePctPerYear, 0.005),
        conditionPctPerStep: num(r.conditionPctPerStep, 0.05), qualityPctPerStep: num(r.qualityPctPerStep, 0.05), occupancyFactor: num(r.occupancyFactor, 0.30)
      }
    };
    a.sources.timePctPerYear = r.timePctPerYear !== undefined && r.timePctPerYear !== '' ? 'Entered by reviewer' : (market ? market.name + (type === 'residential' ? ' FHFA HPI 1-yr reference' : ' commercial trend reference') : 'Default');

    // ----- income
    var ex = inc.expenses || {}, mf = cls === 'multifamily';
    var roll = (inc.rentRoll || []).map(function (q, idx) {
      var qsf = num(q.sf, 0), count = Math.max(1, Math.round(num(q.count, 1)));
      var annual = q.rentAnnual !== undefined && q.rentAnnual !== '' ? num(q.rentAnnual, 0) : (q.rentPsfYr !== undefined && q.rentPsfYr !== '' ? num(q.rentPsfYr, 0) * qsf : num(q.rentMonthly, 0) * 12 * count);
      return { label: q.label || ('Space ' + (idx + 1)), sf: qsf, count: count, annualRent: annual, leaseType: String(q.leaseType || (mf || cls === 'self-storage' ? 'GROSS' : 'NNN')).toUpperCase(), leaseEndYears: num(q.leaseEndYears, null), escalation: num(q.escalation, 0.03), vacant: !!q.vacant || annual === 0, marketRentMonthly: num(q.marketRentMonthly, null) };
    });
    var bandLtv = num(inc.ltv, 0.65), loanRate = num(inc.loanRate, PMarkets.RATES_FALLBACK.treasury10y + PMarkets.RATES_FALLBACK.commercialSpread), amort = num(inc.amortYears, 25);
    a.income = {
      enabled: inc.enabled === undefined ? (type === 'commercial' || ptype === '2-4 Unit') : !!inc.enabled,
      rentBasis: inc.rentBasis === 'contract' ? 'contract' : 'market',
      rentRoll: roll, marketRentPsf: num(inc.marketRentPsf, mref && mref.rentPsf ? mref.rentPsf : 0), otherIncomeAnnual: num(inc.otherIncomeAnnual, 0),
      vacancyPct: num(inc.vacancyPct, mref ? mref.vacancy : 0.07), creditLossPct: num(inc.creditLossPct, 0.01),
      expenses: {
        taxes: num(ex.taxes, a.assessment.total ? Math.round(a.assessment.total * a.assessment.taxRate) : 0), insurance: num(ex.insurance, Math.round(mf ? units * 500 : sf * 0.30)),
        cam: num(ex.cam, Math.round(mf ? 0 : sf * 1.0)), utilities: num(ex.utilities, mf ? units * 850 : 0), repairs: num(ex.repairs, Math.round(mf ? units * 1100 : sf * 0.35)),
        payroll: num(ex.payroll, mf && units >= 24 ? units * 800 : 0), other: num(ex.other, mf ? units * 300 : 0)
      },
      mgmtPct: num(inc.mgmtPct, mf ? 0.04 : 0.03), reservesPsf: num(inc.reservesPsf, mf ? 0 : 0.20), reservesPerUnit: num(inc.reservesPerUnit, mf ? 300 : 0),
      capRate: num(inc.capRate, null), marketCap: mref ? mref.cap : null,
      loadedCap: inc.loadedCap === undefined ? a.assignment.purpose === 'assessment' : !!inc.loadedCap,
      ltv: bandLtv, loanRate: loanRate, amortYears: amort, equityDividend: num(inc.equityDividend, 0.09), dscr: num(inc.dscr, 1.25),
      deductLeaseUp: inc.deductLeaseUp !== false, downtimeMonths: num(inc.downtimeMonths, 6), tiNewPsf: num(inc.tiNewPsf, cls === 'office' ? 40 : cls === 'retail' ? 20 : 5), lcPct: num(inc.lcPct, 0.05), leaseTermYears: num(inc.leaseTermYears, 5),
      deferredMaintenance: num(inc.deferredMaintenance, 0),
      discountRate: num(inc.discountRate, null), exitCap: num(inc.exitCap, null), holdYears: Math.round(num(inc.holdYears, 10)), rentGrowth: num(inc.rentGrowth, 0.03), expenseGrowth: num(inc.expenseGrowth, 0.03),
      monthlyRent: num(inc.monthlyRent, null), grm: num(inc.grm, null)
    };

    // ----- cost
    // Maintained buildings age slower than the calendar: average condition is treated as 65% of actual age.
    var ref = COST_REF[key] || COST_REF.SFR;
    var effAgeDefault = actualAge === null ? null : Math.round(clamp(actualAge * (0.65 - (condition - 3) * 0.15), 0, ref.life));
    a.cost = {
      enabled: co.enabled === undefined ? true : !!co.enabled,
      landValue: num(co.landValue, null), landPerAcre: num(co.landPerAcre, null),
      baseCostPsf: num(co.baseCostPsf, Math.round(ref.psf * QUALITY_MULT[quality])), localMultiplier: num(co.localMultiplier, market && LOCAL_MULT[market.id] ? LOCAL_MULT[market.id] : 1),
      siteImprovements: num(co.siteImprovements, Math.round(sf * (type === 'commercial' ? 6 : 4))), softPct: num(co.softPct, 0.08), incentivePct: num(co.incentivePct, type === 'commercial' ? 0.10 : 0.05),
      economicLife: num(co.economicLife, ref.life), effectiveAge: num(co.effectiveAge, effAgeDefault), functionalPct: num(co.functionalPct, 0), externalPct: num(co.externalPct, 0)
    };
    a.sources.baseCostPsf = co.baseCostPsf !== undefined && co.baseCostPsf !== '' ? 'Entered by reviewer' : 'Parcelyst reference cost for ' + key + ', quality ' + quality + '. Verify with a cost service.';
    return a;
  }

  // ---------------------------------------------------------------- sales comparison
  function salesApproach(a) {
    var S = a.subject, R = a.sales.rates, res = S.type === 'residential', unit = a.sales.unit;
    var subjSize = unit === 'unit' ? S.units : S.sf;
    var out = a.sales.comps.map(function (c) {
      var lines = [], flags = [];
      function add(group, key, label, amount, basis) { if (amount && isFinite(amount)) lines.push({ group: group, key: key, label: label, amount: amount, pct: basis ? amount / basis : null }); }
      var p = c.salePrice, p0 = p;
      // Transactional adjustments, applied in sequence.
      if (c.rightsAdjPct) { add('transaction', 'rights', 'Property rights conveyed', p * c.rightsAdjPct, p0); p *= 1 + c.rightsAdjPct; }
      if (c.financingAdjPct) { add('transaction', 'financing', 'Financing terms', p * c.financingAdjPct, p0); p *= 1 + c.financingAdjPct; }
      if (c.conditionsAdjPct) { add('transaction', 'conditions', 'Conditions of sale', p * c.conditionsAdjPct, p0); p *= 1 + c.conditionsAdjPct; }
      if (c.expendAfterSale) { add('transaction', 'expend', 'Expenditures after sale', c.expendAfterSale, p0); p += c.expendAfterSale; }
      var yrs = c.saleDate ? yearsBetween(c.saleDate, a.assignment.effectiveDate) : 0;
      if (c.saleDate && Math.abs(yrs) > 0.02 && R.timePctPerYear) { var t = p * (Math.pow(1 + R.timePctPerYear, yrs) - 1); add('transaction', 'time', 'Market conditions (' + (yrs * 12).toFixed(0) + ' mo)', t, p0); p += t; }
      var base = p; // price after transactional adjustments
      var adjusted, unitPrice = null;
      if (res) {
        add('property', 'location', 'Location', base * c.locationAdjPct, p0);
        if (S.sf && c.sf) add('property', 'gla', 'Living area (' + (S.sf - c.sf > 0 ? '+' : '') + Math.round(S.sf - c.sf) + ' sf)', (S.sf - c.sf) * R.glaPerSf, p0);
        if (S.lotAcres !== null && c.lotAcres !== null) add('property', 'lot', 'Site size', (S.lotAcres - c.lotAcres) * R.lotPerAcre, p0);
        if (S.yearBuilt && c.yearBuilt) add('property', 'age', 'Age (' + c.yearBuilt + ')', base * clamp((S.yearBuilt - c.yearBuilt) * R.agePctPerYear, -0.15, 0.15), p0);
        if (c.condition !== null) add('property', 'condition', 'Condition (' + CONDITION[c.condition] + ')', base * (S.condition - c.condition) * R.conditionPctPerStep, p0);
        if (c.quality !== null) add('property', 'quality', 'Quality', base * (S.quality - c.quality) * R.qualityPctPerStep, p0);
        if (S.beds !== null && c.beds !== null) add('property', 'beds', 'Bedrooms', (S.beds - c.beds) * R.perBed, p0);
        if (S.baths !== null && c.baths !== null) add('property', 'baths', 'Bathrooms', (S.baths - c.baths) * R.perBath, p0);
        if (c.garage !== null) add('property', 'garage', 'Garage', (S.garage - c.garage) * R.perGarage, p0);
        add('property', 'other', 'Other', c.otherAdj + base * c.otherAdjPct, p0);
        adjusted = base + lines.filter(function (l) { return l.group === 'property'; }).reduce(function (s, l) { return s + l.amount; }, 0);
      } else {
        var cSize = unit === 'unit' ? c.units : c.sf;
        if (!cSize || !subjSize) { flags.push('Missing size; cannot compute a unit price'); adjusted = null; }
        else {
          var up = base / cSize, pctSum = 0;
          function addPct(key, label, f) { if (f && isFinite(f)) { pctSum += f; lines.push({ group: 'property', key: key, label: label, amount: f * base, pct: f * base / p0 }); } }
          addPct('location', 'Location', c.locationAdjPct);
          addPct('size', 'Size (economies of scale)', clamp(-R.sizePctPerDoubling * Math.log(subjSize / cSize) / Math.LN2, -0.20, 0.20));
          if (S.yearBuilt && c.yearBuilt) addPct('age', 'Age (' + c.yearBuilt + ')', clamp((S.yearBuilt - c.yearBuilt) * R.agePctPerYear, -0.20, 0.20));
          if (c.condition !== null) addPct('condition', 'Condition (' + CONDITION[c.condition] + ')', (S.condition - c.condition) * R.conditionPctPerStep);
          if (c.quality !== null) addPct('quality', 'Quality / class', (S.quality - c.quality) * R.qualityPctPerStep);
          if (S.occupancyPct !== null && c.occupancyPct !== null) addPct('occupancy', 'Occupancy at sale', (S.occupancyPct - c.occupancyPct) * R.occupancyFactor);
          addPct('other', 'Other', c.otherAdjPct + (c.otherAdj ? c.otherAdj / base : 0));
          unitPrice = up * (1 + pctSum);
          adjusted = unitPrice * subjSize;
        }
      }
      var net = lines.reduce(function (s, l) { return s + l.amount; }, 0), gross = lines.reduce(function (s, l) { return s + Math.abs(l.amount); }, 0);
      var netPct = net / p0, grossPct = gross / p0;
      if (grossPct > 0.25) flags.push('Gross adjustments ' + pct(grossPct, 0) + ' exceed 25%');
      if (Math.abs(netPct) > 0.15) flags.push('Net adjustment ' + pct(netPct, 0) + ' exceeds 15%');
      if (c.saleDate && yrs > (res ? 1 : 2)) flags.push('Sale is ' + Math.round(yrs * 12) + ' months old');
      if (!c.saleDate) flags.push('No sale date');
      if (c.distanceMi !== null && c.distanceMi > (res ? 1 : 5)) flags.push(c.distanceMi + ' mi from subject');
      var w = c.weightOverride !== null ? Math.max(0, c.weightOverride) : (1 / (0.10 + grossPct)) * (1 / (1 + 0.25 * Math.max(0, yrs))) * (1 / (1 + 0.1 * (c.distanceMi || 0)));
      if (adjusted === null) w = 0;
      var cap = c.capRate !== null ? c.capRate : (c.noi ? c.noi / c.salePrice : null);
      return Object.assign({}, c, { lines: lines, afterTransaction: base, adjusted: adjusted, adjustedUnit: unitPrice !== null ? unitPrice : (c.sf && adjusted ? adjusted / (S.sf || c.sf) : null), unitPriceRaw: (unit === 'unit' ? c.units : c.sf) ? c.salePrice / (unit === 'unit' ? c.units : c.sf) : null,
        netPct: netPct, grossPct: grossPct, yearsOld: yrs, rawWeight: w, flags: flags, capRateDerived: cap });
    });
    var used = out.filter(function (c) { return c.adjusted !== null && c.rawWeight > 0; });
    var wsum = used.reduce(function (s, c) { return s + c.rawWeight; }, 0);
    out.forEach(function (c) { c.weight = wsum > 0 && c.adjusted !== null ? c.rawWeight / wsum : 0; });
    if (!used.length) return { developed: false, comps: out, reason: out.length ? 'No comparable could be adjusted' : 'No comparable sales entered', unit: unit };
    var vals = used.map(function (c) { return c.adjusted; });
    var indicated = used.reduce(function (s, c) { return s + c.adjusted * c.weight; }, 0);
    var mu = mean(vals), sd = Math.sqrt(mean(vals.map(function (v) { return (v - mu) * (v - mu); })));
    return {
      developed: true, comps: out, unit: unit, count: used.length, indicated: indicated, low: Math.min.apply(null, vals), high: Math.max.apply(null, vals), median: median(vals), mean: mu,
      cov: mu ? sd / mu : 0, avgGross: mean(used.map(function (c) { return c.grossPct; })), maxAgeYears: Math.max.apply(null, used.map(function (c) { return c.yearsOld || 0; })),
      indicatedUnit: subjSize ? indicated / subjSize : null, unadjustedUnitMedian: median(out.map(function (c) { return c.unitPriceRaw; })), subjectSize: subjSize
    };
  }

  // ---------------------------------------------------------------- income
  function capSupport(a, sales) {
    var I = a.income, rows = [];
    var mc = PEngine.pmt(I.loanRate, I.amortYears, 1) * 12;
    if (I.marketCap) rows.push({ key: 'market', label: (a.marketName || 'Market') + ' ' + a.subject.assetClass + ' benchmark', rate: I.marketCap, note: 'Reference benchmark' });
    var caps = sales && sales.comps ? sales.comps.map(function (c) { return c.capRateDerived; }).filter(function (x) { return x !== null && x > 0.02 && x < 0.2; }) : [];
    if (caps.length) rows.push({ key: 'comps', label: 'Extracted from ' + caps.length + ' comparable sale' + (caps.length > 1 ? 's' : ''), rate: median(caps), note: 'Median of NOI / price; range ' + pct(Math.min.apply(null, caps), 2) + ' to ' + pct(Math.max.apply(null, caps), 2) });
    rows.push({ key: 'band', label: 'Band of investment', rate: I.ltv * mc + (1 - I.ltv) * I.equityDividend, note: pct(I.ltv, 0) + ' debt at a ' + pct(mc, 2) + ' constant (' + pct(I.loanRate, 2) + ', ' + I.amortYears + '-yr), ' + pct(I.equityDividend, 1) + ' equity dividend' });
    rows.push({ key: 'dcr', label: 'Debt coverage formula', rate: I.dscr * mc * I.ltv, note: I.dscr.toFixed(2) + 'x DSCR x ' + pct(mc, 2) + ' constant x ' + pct(I.ltv, 0) + ' LTV' });
    var sel = I.capRate, basis = 'Entered by reviewer';
    if (sel === null) {
      if (caps.length >= 3) { sel = median(caps); basis = 'Median of comparable-sale cap rates'; }
      else if (I.marketCap) { sel = I.marketCap; basis = 'Market benchmark'; }
      else { sel = rows[rows.length - 2].rate; basis = 'Band of investment'; }
    }
    return { rows: rows, selected: sel, basis: basis, mortgageConstant: mc };
  }

  function incomeCommercial(a, sales) {
    var I = a.income, S = a.subject, sf = S.sf || I.rentRoll.reduce(function (s, q) { return s + q.sf; }, 0);
    if (!I.rentRoll.length) return { developed: false, reason: 'No rent roll entered' };
    var totalSf = I.rentRoll.reduce(function (s, q) { return s + q.sf; }, 0) || sf;
    var pgi = 0, nnnSf = 0, vacantSf = 0, vacantRent = 0, contract = 0, market = 0;
    var rollOut = I.rentRoll.map(function (q) {
      var mkt = q.sf > 0 && I.marketRentPsf > 0 ? I.marketRentPsf * q.sf : (q.marketRentMonthly ? q.marketRentMonthly * 12 * q.count : q.annualRent);
      var used = q.vacant ? mkt : (I.rentBasis === 'market' ? mkt : q.annualRent);
      pgi += used; contract += q.vacant ? 0 : q.annualRent; market += mkt;
      if (q.leaseType === 'NNN') nnnSf += q.sf;
      if (q.vacant) { vacantSf += q.sf; vacantRent += mkt; }
      return Object.assign({}, q, { marketRent: mkt, usedRent: used });
    });
    var nnnShare = totalSf > 0 ? nnnSf / totalSf : 0, E = I.expenses;
    var recoveries = (E.taxes + E.insurance + E.cam) * nnnShare;
    var vc = I.vacancyPct + I.creditLossPct;
    var vacancyLoss = (pgi + recoveries) * vc;
    var egi = pgi + recoveries + I.otherIncomeAnnual - vacancyLoss;
    var lines = { taxes: E.taxes, insurance: E.insurance, cam: E.cam, utilities: E.utilities, repairs: E.repairs, payroll: E.payroll, other: E.other, management: egi * I.mgmtPct, reserves: I.reservesPsf * sf + I.reservesPerUnit * S.units };
    var opex = 0; Object.keys(lines).forEach(function (k) { opex += lines[k]; });
    var noi = egi - opex;
    var cs = capSupport(a, sales), cap = cs.selected;
    var loaded = null, before;
    if (I.loadedCap) {
      var taxRecov = E.taxes * nnnShare * (1 - vc), recShare = E.taxes > 0 ? taxRecov / E.taxes : nnnShare * (1 - vc);
      var netTax = E.taxes - taxRecov, noiX = noi + netTax, lc = cap + a.assessment.taxRate * (1 - recShare);
      loaded = { noiBeforeTax: noiX, netTaxExpense: netTax, recoveredShare: recShare, taxRate: a.assessment.taxRate, loadedCap: lc, value: noiX / lc, unloadedValue: noi / cap };
      before = loaded.value;
    } else before = noi / cap;
    var stabilizedVacSf = I.vacancyPct * totalSf, excessSf = Math.max(0, vacantSf - stabilizedVacSf);
    var leaseUp = I.deductLeaseUp && excessSf > 0 ? excessSf * (I.marketRentPsf * I.downtimeMonths / 12 + I.tiNewPsf + I.lcPct * I.marketRentPsf * I.leaseTermYears) : 0;
    var value = before - leaseUp - I.deferredMaintenance;
    // DCF cross-check on contract leases (leased fee), unlevered.
    var dcf = null;
    try {
      var dr = I.discountRate !== null ? I.discountRate : cap + 0.02, xc = I.exitCap !== null ? I.exitCap : cap + 0.005, H = clamp(I.holdYears, 3, 15);
      var pr = PEngine.projectCommercial({ assetClass: S.assetClass, price: Math.max(1, value), buildingSf: sf, units: S.units, rentRoll: I.rentRoll.map(function (q) { return { label: q.label, sf: q.sf, count: q.count, rentAnnual: q.annualRent, leaseType: q.leaseType, leaseEndYears: q.leaseEndYears, escalation: q.escalation, vacant: q.vacant }; }),
        marketRentPsf: I.marketRentPsf, otherIncomeAnnual: I.otherIncomeAnnual, vacancyPct: I.vacancyPct, creditLossPct: I.creditLossPct, expenses: E, mgmtPct: I.mgmtPct, reservesPsf: I.reservesPsf, reservesPerUnit: I.reservesPerUnit,
        downtimeMonths: I.downtimeMonths, tiNewPsf: I.tiNewPsf, lcPct: I.lcPct, rentGrowth: I.rentGrowth, expenseGrowth: I.expenseGrowth, holdYears: H }, H);
      var pv = 0; pr.rows.forEach(function (q) { pv += (q.noi - q.tilc) / Math.pow(1 + dr, q.year); });
      var rev = pr.fwdNoi / xc * 0.98, pvRev = rev / Math.pow(1 + dr, H);
      dcf = { value: pv + pvRev - I.deferredMaintenance, discountRate: dr, exitCap: xc, holdYears: H, pvCashFlows: pv, pvReversion: pvRev, reversionShare: pvRev / (pv + pvRev), rows: pr.rows };
    } catch (e) { dcf = null; }
    return {
      developed: noi > 0 && cap > 0, reason: noi > 0 ? null : 'Net operating income is not positive', method: 'Direct capitalization', rentBasis: I.rentBasis,
      rentRoll: rollOut, pgi: pgi, contractRent: contract, marketRentTotal: market, recoveries: recoveries, otherIncome: I.otherIncomeAnnual, vacancyLoss: vacancyLoss, egi: egi, expenseLines: lines, opex: opex, noi: noi,
      expenseRatio: egi > 0 ? opex / egi : null, noiPerSf: sf ? noi / sf : null, cap: cap, capSupport: cs, loaded: loaded, valueBeforeDeductions: before,
      leaseUp: leaseUp, excessVacantSf: excessSf, vacantSf: vacantSf, deferredMaintenance: I.deferredMaintenance, value: value, dcf: dcf, occupancy: totalSf ? 1 - vacantSf / totalSf : null
    };
  }

  function incomeResidential(a, sales) {
    var I = a.income;
    if (!I.monthlyRent) return { developed: false, reason: 'No market rent entered' };
    var grms = sales && sales.comps ? sales.comps.filter(function (c) { return c.rent > 0; }).map(function (c) { return c.salePrice / (c.rent * 12); }) : [];
    var grm = I.grm !== null ? I.grm : (grms.length ? median(grms) : null);
    if (!grm) return { developed: false, reason: 'Enter a gross rent multiplier or add rents to the comparables' };
    return { developed: true, method: 'Gross rent multiplier', monthlyRent: I.monthlyRent, grm: grm, grmBasis: I.grm !== null ? 'Entered by reviewer' : 'Median of ' + grms.length + ' comparable' + (grms.length > 1 ? 's' : '') + ' with rents', grmCount: grms.length, value: I.monthlyRent * 12 * grm };
  }

  // ---------------------------------------------------------------- cost
  function costApproach(a) {
    var C = a.cost, S = a.subject;
    if (!S.sf) return { developed: false, reason: 'Building area is required' };
    var land = C.landValue, landBasis = 'Entered by reviewer';
    if (land === null && C.landPerAcre !== null && S.lotAcres) { land = C.landPerAcre * S.lotAcres; landBasis = usd(C.landPerAcre) + ' per acre x ' + S.lotAcres + ' acres'; }
    if (land === null && a.assessment.land) { land = a.assessment.land; landBasis = 'Assessor\'s land value (not independently supported)'; }
    if (land === null) return { developed: false, reason: 'Land value is required (enter it, a $/acre rate, or the assessed land value)' };
    if (C.effectiveAge === null) return { developed: false, reason: 'Year built or effective age is required' };
    var hard = S.sf * C.baseCostPsf * C.localMultiplier + C.siteImprovements;
    var soft = hard * C.softPct, incentive = (hard + soft) * C.incentivePct, rcn = hard + soft + incentive;
    var physPct = clamp(C.effectiveAge / C.economicLife, 0, 0.85);
    var phys = rcn * physPct, func = (rcn - phys) * C.functionalPct, ext = (rcn - phys - func) * C.externalPct;
    var dep = phys + func + ext, improvements = rcn - dep;
    return { developed: true, land: land, landBasis: landBasis, buildingCost: S.sf * C.baseCostPsf * C.localMultiplier, siteImprovements: C.siteImprovements, soft: soft, incentive: incentive, rcn: rcn, rcnPsf: rcn / S.sf,
      physicalPct: physPct, physical: phys, functional: func, external: ext, depreciation: dep, depreciationPct: dep / rcn, improvements: improvements, value: land + improvements, remainingLife: Math.max(0, C.economicLife - C.effectiveAge) };
  }

  // ---------------------------------------------------------------- reconcile
  function defaultWeights(a, dev) {
    var w;
    if (a.subject.type === 'residential') w = a.subject.propertyType === '2-4 Unit' ? { sales: 0.60, income: 0.30, cost: 0.10 } : { sales: 0.85, income: 0.05, cost: 0.10 };
    else w = { sales: 0.35, income: 0.55, cost: 0.10 };
    // An old improvement makes the cost approach weak evidence.
    if (dev.cost && a.cost.effectiveAge !== null && a.cost.effectiveAge / a.cost.economicLife > 0.5) w.cost = w.cost / 2;
    return w;
  }

  function analyze(input) {
    var a = normalize(input), S = a.subject;
    var sales = salesApproach(a);
    var income = a.income.enabled ? (S.type === 'commercial' ? incomeCommercial(a, sales) : incomeResidential(a, sales)) : { developed: false, reason: 'Not developed (turned off)' };
    var cost = a.cost.enabled ? costApproach(a) : { developed: false, reason: 'Not developed (turned off)' };
    var dev = { sales: sales.developed, income: income.developed, cost: cost.developed };
    var dw = defaultWeights(a, dev), rows = [], wsum = 0;
    [['sales', 'Sales comparison', sales], ['income', 'Income capitalization', income], ['cost', 'Cost', cost]].forEach(function (r) {
      var given = a.weights[r[0]], w = dev[r[0]] ? (given !== undefined && given !== null && given !== '' ? Math.max(0, num(given, 0)) : dw[r[0]]) : 0;
      wsum += w; rows.push({ key: r[0], label: r[1], developed: dev[r[0]], value: dev[r[0]] ? (r[0] === 'sales' ? sales.indicated : r[2].value) : null, rawWeight: w, reason: r[2].reason || null });
    });
    rows.forEach(function (r) { r.weight = wsum > 0 ? r.rawWeight / wsum : 0; });
    var developed = rows.filter(function (r) { return r.developed && r.weight > 0; });
    var unrounded = developed.reduce(function (s, r) { return s + r.value * r.weight; }, 0);
    var final = developed.length ? roundValue(unrounded) : null;

    // Confidence: how much a reader should lean on the number.
    var factors = [], conf = 100;
    function hit(points, text) { conf -= points; factors.push({ points: -points, text: text }); }
    hit(10, 'Desktop scope: no interior or exterior inspection');
    if (!developed.length) hit(60, 'No approach could be developed');
    if (!S.sf) hit(15, 'Subject building area missing');
    var salesRow = rows[0];
    if (salesRow.weight > 0) {
      if (sales.count < 3) hit(20, 'Only ' + sales.count + ' comparable sale' + (sales.count === 1 ? '' : 's'));
      else if (sales.count === 3) hit(8, 'Three comparable sales (minimum)');
      if (sales.avgGross > 0.25) hit(15, 'Average gross adjustment ' + pct(sales.avgGross, 0));
      else if (sales.avgGross > 0.15) hit(7, 'Average gross adjustment ' + pct(sales.avgGross, 0));
      if (sales.cov > 0.10) hit(10, 'Adjusted sales vary widely (COV ' + pct(sales.cov) + ')');
      else if (sales.cov > 0.05) hit(4, 'Moderate spread in adjusted sales (COV ' + pct(sales.cov) + ')');
      if (sales.maxAgeYears > (S.type === 'residential' ? 1 : 2)) hit(5, 'Oldest comparable is ' + Math.round(sales.maxAgeYears * 12) + ' months old');
    } else if (S.type === 'residential') hit(25, 'No sales comparison for a residential property');
    if (S.type === 'commercial' && !income.developed) hit(20, 'Income approach not developed for an income property');
    if (developed.length === 1) hit(8, 'Single approach to value');
    if (developed.length > 1 && final) {
      var vs = developed.map(function (r) { return r.value; }), spread = (Math.max.apply(null, vs) - Math.min.apply(null, vs)) / final;
      if (spread > 0.20) hit(15, 'Approaches differ by ' + pct(spread, 0));
      else if (spread > 0.10) hit(7, 'Approaches differ by ' + pct(spread, 0));
    }
    conf = Math.round(clamp(conf, 0, 100));
    var confLabel = conf >= 80 ? 'High' : conf >= 60 ? 'Moderate' : 'Low';
    var band = 0.05 + (100 - conf) / 100 * 0.10;
    var recon = { rows: rows, unrounded: unrounded, final: final, low: final ? roundValue(final * (1 - band)) : null, high: final ? roundValue(final * (1 + band)) : null, band: band, confidence: conf, confidenceLabel: confLabel, factors: factors,
      perSf: final && S.sf ? final / S.sf : null, perUnit: final && S.units > 1 ? final / S.units : null };

    // Assessment test: overvaluation and uniformity.
    var assessment = null, equity = null, AX = a.assessment;
    if (AX.total && final) {
      var fmvAtRatio = final * AX.ratio, variance = AX.total - fmvAtRatio, vp = variance / AX.total;
      var savings = Math.max(0, variance) * AX.taxRate, rec;
      if (vp >= 0.10 && conf >= 70) rec = { label: 'Appeal supported', tone: 'good', text: 'The assessment exceeds the indicated value by ' + pct(vp) + ' with ' + confLabel.toLowerCase() + ' confidence. The evidence supports filing.' };
      else if (vp >= 0.10) rec = { label: 'Appeal possible, strengthen evidence', tone: 'warn', text: 'The assessment looks high by ' + pct(vp) + ', but the evidence is thin. Add comparables or income data, or commission an appraisal before filing.' };
      else if (vp >= 0.05) rec = { label: 'Marginal', tone: 'warn', text: 'The assessment exceeds the indicated value by ' + pct(vp) + ', inside the range most review boards treat as tolerance. File only if the savings justify the effort.' };
      else if (vp > -0.05) rec = { label: 'Assessment in line', tone: 'info', text: 'The assessment is within 5% of the indicated value. An overvaluation appeal is not supported.' };
      else rec = { label: 'Do not appeal on value', tone: 'bad', text: 'The indicated value is ' + pct(-vp) + ' above the assessment. An appeal could invite an increase.' };
      assessment = { total: AX.total, ratio: AX.ratio, indicatedAtRatio: fmvAtRatio, variance: variance, variancePct: vp, taxRate: AX.taxRate, currentTax: AX.total * AX.taxRate, supportedTax: fmvAtRatio * AX.taxRate,
        annualSavings: savings, horizonYears: AX.horizonYears, horizonSavings: savings * AX.horizonYears, feePct: AX.feePct, fee: savings * AX.feePct, clientNetFirstYear: savings * (1 - AX.feePct),
        assessedPerSf: S.sf ? AX.total / S.sf : null, recommendation: rec, taxYear: AX.taxYear, landShare: AX.land && AX.total ? AX.land / AX.total : null };
      var eq = sales.comps ? sales.comps.filter(function (c) { return c.assessed > 0; }) : [];
      if (eq.length >= 3) {
        var ratios = eq.map(function (c) { return c.assessed / c.salePrice; }), med = median(ratios);
        var cod = mean(ratios.map(function (x) { return Math.abs(x - med); })) / med * 100;
        var apsf = eq.filter(function (c) { return c.sf > 0; }).map(function (c) { return c.assessed / c.sf; }), medPsf = median(apsf);
        var subjRatio = AX.total / final, uniformValue = medPsf && S.sf ? medPsf * S.sf : null;
        equity = { count: eq.length, medianRatio: med, cod: cod, subjectRatio: subjRatio, ratioGap: subjRatio - med, medianAssessedPerSf: medPsf, subjectAssessedPerSf: S.sf ? AX.total / S.sf : null, uniformValue: uniformValue,
          uniformityArgument: subjRatio > med * 1.05 && (!medPsf || !S.sf || AX.total / S.sf > medPsf * 1.03), rows: eq.map(function (c) { return { address: c.address, salePrice: c.salePrice, assessed: c.assessed, ratio: c.assessed / c.salePrice, assessedPerSf: c.sf ? c.assessed / c.sf : null }; }),
          equalizedAssessment: final * med, equalizedVariance: AX.total - final * med };
      }
    }

    var verdict = assessment ? { label: assessment.recommendation.label, tone: assessment.recommendation.tone === 'info' ? 'good' : assessment.recommendation.tone } : { label: confLabel + ' confidence', tone: conf >= 80 ? 'good' : conf >= 60 ? 'warn' : 'bad' };
    a.price = final || 0;
    var res = {
      kind: 'valuation', assumptions: a, score: conf, verdict: verdict, sales: sales, income: income, cost: cost, reconciliation: recon, assessment: assessment, equity: equity,
      headline: final ? (assessment ? (assessment.variancePct >= 0 ? 'Assessed ' + pct(assessment.variancePct) + ' over' : 'Assessed ' + pct(-assessment.variancePct) + ' under') : confLabel + ' confidence') : 'Incomplete',
      metrics: { value: final, low: recon.low, high: recon.high, perSf: recon.perSf, perUnit: recon.perUnit, cap: income.developed && income.cap ? income.cap : null, noi: income.developed && income.noi ? income.noi : null, cfMonthly: null, irr: null, confidence: conf },
      purposes: PURPOSES
    };
    res.insights = insights(res);
    return res;
  }

  function insights(r) {
    var a = r.assumptions, R = r.reconciliation, out = [];
    if (!R.final) { out.push({ tone: 'bad', title: 'Incomplete', text: 'Enter comparable sales, income data or cost inputs to develop at least one approach.' }); return out; }
    out.push({ tone: R.confidence >= 80 ? 'good' : R.confidence >= 60 ? 'warn' : 'bad', title: 'Value conclusion', text: 'Indicated market value of ' + usd(R.final) + ' (' + usd(R.low) + ' to ' + usd(R.high) + ') as of ' + a.assignment.effectiveDate + (R.perSf ? ', or ' + usd(R.perSf) + ' per square foot' : '') + '. Confidence is ' + R.confidenceLabel.toLowerCase() + ' (' + R.confidence + '/100).' });
    if (r.sales.developed) out.push({ tone: r.sales.avgGross <= 0.15 ? 'good' : 'warn', title: 'Sales comparison', text: r.sales.count + ' comparable sales adjust to a range of ' + usd(r.sales.low) + ' to ' + usd(r.sales.high) + '. Average gross adjustment is ' + pct(r.sales.avgGross, 0) + '; the weighted indication is ' + usd(r.sales.indicated) + '.' });
    if (r.income.developed && r.income.noi) out.push({ tone: 'info', title: 'Income', text: 'Stabilized NOI of ' + usd(r.income.noi) + ' capitalized at ' + pct(r.income.cap, 2) + (r.income.loaded ? ' (tax-loaded rate ' + pct(r.income.loaded.loadedCap, 2) + ')' : '') + ' indicates ' + usd(r.income.value) + '.' + (r.income.dcf ? ' A ' + r.income.dcf.holdYears + '-year DCF of the in-place leases at ' + pct(r.income.dcf.discountRate, 2) + ' cross-checks at ' + usd(r.income.dcf.value) + '.' : '') });
    if (r.assessment) out.push({ tone: r.assessment.recommendation.tone, title: 'Assessment: ' + r.assessment.recommendation.label, text: r.assessment.recommendation.text + (r.assessment.annualSavings > 0 ? ' Potential tax reduction is about ' + usd(r.assessment.annualSavings) + ' per year at the current rate.' : '') });
    if (r.equity) out.push({ tone: r.equity.uniformityArgument ? 'good' : 'info', title: 'Uniformity', text: 'Comparable properties are assessed at a median ' + pct(r.equity.medianRatio, 0) + ' of sale price (COD ' + r.equity.cod.toFixed(1) + '). The subject is assessed at ' + pct(r.equity.subjectRatio, 0) + ' of its indicated value.' + (r.equity.uniformityArgument ? ' That gap supports a lack-of-uniformity argument in addition to overvaluation.' : '') });
    return out;
  }

  // Build a starting set of inputs from a property record (lookup, finder, import).
  function fromRecord(rec, opts) {
    rec = rec || {}; opts = opts || {};
    var CLASS_MAP = { 'Multifamily 5+': 'multifamily', Retail: 'retail', Office: 'office', Industrial: 'industrial', 'Mixed-Use': 'mixed-use', 'Self-Storage': 'self-storage' };
    var commercial = !!CLASS_MAP[rec.assetType] || opts.type === 'commercial';
    return {
      kind: 'valuation', address: rec.address || '', city: rec.city || '', state: rec.state || '', zip: rec.zip || '', marketId: rec.market || null, localityId: rec.locality || null,
      assignment: { purpose: 'assessment', effectiveDate: new Date().toISOString().slice(0, 10), interest: 'Fee simple', firm: opts.firm || '', preparedBy: opts.preparedBy || '' },
      subject: { type: commercial ? 'commercial' : 'residential', assetClass: CLASS_MAP[rec.assetType] || (commercial ? 'industrial' : undefined), propertyType: commercial ? undefined : (RES_TYPES.indexOf(rec.assetType) !== -1 ? rec.assetType : 'SFR'),
        sf: rec.buildingSf || rec.sqft || '', units: rec.units || '', lotAcres: rec.lotAcres || '', yearBuilt: rec.yearBuilt || '', beds: rec.beds || '', baths: rec.baths || '', condition: 3, quality: 3, occupancyPct: rec.occupancyPct === undefined ? '' : rec.occupancyPct, zoning: rec.zoning || '', parcelId: rec.parcelId || '' },
      assessment: { total: rec.assessedValue || '', taxYear: String(new Date().getFullYear()) },
      sales: { comps: [] }, income: { rentRoll: [], monthlyRent: rec.estRent || '' }, cost: {}
    };
  }

  // Rank sold records as candidate comparables for a subject.
  function suggestComps(records, subject, opts) {
    opts = opts || {};
    var now = opts.now ? new Date(opts.now) : new Date(), maxYears = opts.maxYears || 3, sf = num(subject.sf, 0);
    var out = [];
    records.forEach(function (r) {
      if (!r.lastSalePrice || !r.lastSaleDate || r.assetType !== subject.assetType) return;
      if (r.address === subject.address && r.zip === subject.zip) return;
      var yrs = (now - new Date(r.lastSaleDate)) / (365.25 * 864e5);
      if (!(yrs >= 0 && yrs <= maxYears)) return;
      var rsf = r.buildingSf || r.sqft || 0;
      if (sf && rsf && (rsf < sf * 0.6 || rsf > sf * 1.6)) return;
      var d = (sf && rsf ? Math.abs(Math.log(rsf / sf)) * 2 : 0.5) + yrs * 0.35 + (r.zip === subject.zip ? 0 : r.locality === subject.locality ? 0.4 : 1.2) + (subject.yearBuilt && r.yearBuilt ? Math.abs(r.yearBuilt - subject.yearBuilt) / 40 : 0.2);
      out.push({ d: d, comp: { address: r.address + (r.city ? ', ' + r.city : ''), saleDate: r.lastSaleDate, salePrice: r.lastSalePrice, sf: rsf || '', units: r.units || '', lotAcres: r.lotAcres || '', yearBuilt: r.yearBuilt || '', beds: r.beds || '', baths: r.baths || '', occupancyPct: r.occupancyPct === undefined ? '' : r.occupancyPct, assessed: r.assessedValue || '', condition: 3, quality: 3, source: r.source === 'demo' ? 'Demo record' : (r.source || 'Parcelyst database') } });
    });
    out.sort(function (p, q) { return p.d - q.d; });
    return out.slice(0, opts.limit || 8).map(function (x) { return x.comp; });
  }

  if (PEngine.registerKind) PEngine.registerKind('valuation', analyze);

  return { analyze: analyze, normalize: normalize, fromRecord: fromRecord, suggestComps: suggestComps, roundValue: roundValue, PURPOSES: PURPOSES, CLASSES: CLASSES, RES_TYPES: RES_TYPES, CONDITION: CONDITION, COST_REF: COST_REF };
});
