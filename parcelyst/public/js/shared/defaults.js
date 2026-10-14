/*
 * Turns a property record (from any provider, an import, or manual entry) plus market
 * reference data and current rates into a complete engine input, with a `sources` map
 * so the report can cite where every default came from.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./markets.js'), require('./engine.js'));
  else root.PDefaults = factory(root.PMarkets, root.PEngine);
})(typeof self !== 'undefined' ? self : this, function (PMarkets, PEngine) {
  'use strict';

  var CLASS_MAP = { 'Multifamily 5+': 'multifamily', Retail: 'retail', Office: 'office', Industrial: 'industrial', 'Mixed-Use': 'mixed-use', 'Self-Storage': 'self-storage' };

  function locate(p) {
    var hit = (p.market && PMarkets.byId(p.market)) ? { market: PMarkets.byId(p.market), locality: null } : null;
    if (hit && p.locality) hit.locality = hit.market.localities.filter(function (l) { return l.id === p.locality; })[0] || null;
    if (!hit || !hit.locality) hit = PMarkets.findByZip(p.zip) || PMarkets.findByCity(p.city, p.state) || hit;
    return hit;
  }

  function kindOf(p) {
    if (p.kind) return p.kind;
    if (p.assetType === 'Land') return 'land';
    if (CLASS_MAP[p.assetType]) return 'commercial';
    return 'residential';
  }

  function build(p, opts) {
    opts = opts || {};
    var rates = Object.assign({}, PEngine.DEFAULT_RATES, opts.rates || {});
    var rateSrc = opts.rateSources || {};
    var loc = locate(p) || {};
    var m = loc.market, l = loc.locality;
    var kind = opts.kind || kindOf(p);
    var price = p.listPrice || p.price || p.estValue || 0;
    var src = {};
    function cite(k, label) { src[k] = label; }
    var mLabel = m ? m.name + ' reference (' + m.asOf + ')' : 'National default';

    var base = { kind: kind, address: p.address || '', city: p.city || '', state: p.state || '', zip: p.zip || '', marketId: m ? m.id : null, localityId: l ? l.id : null, price: price, rates: rates };
    cite('price', p.listPrice ? 'List price' : p.price ? 'User input' : p.estValue ? 'Estimated value (' + (p.source === 'demo' ? 'demo record' : p.source || 'provider') + ')' : 'User input');

    if (kind === 'land') {
      var lnd = m ? m.land : {};
      var eff = m ? PMarkets.effectiveTaxRate(m, l, false) : 0.01;
      var isTh = /TH|R-?(10|12|15|24)|MF|RT/i.test(p.zoning || '');
      Object.assign(base, {
        acres: p.lotAcres || p.acres || 0, zoning: p.zoning || '', product: isTh ? 'th' : 'sfd',
        finishedLotValue: isTh ? lnd.finishedLotTh : lnd.finishedLotSfd, devCostPerLot: isTh ? Math.round(lnd.devCostPerLot * 0.65) : lnd.devCostPerLot,
        impactFeePerLot: lnd.impactFeePerLot, carryTaxRate: eff
      });
      cite('finishedLotValue', mLabel + ': finished lot comps'); cite('devCostPerLot', mLabel + ': site-work cost per lot'); cite('impactFeePerLot', mLabel + ': proffers / impact fees'); cite('carryTaxRate', l ? l.name + ' tax rate' : mLabel);
      base.sources = src;
      return base;
    }

    var taxRate = m ? PMarkets.effectiveTaxRate(m, l, kind === 'commercial') : 0.011;
    var assessed = p.assessedValue || price;
    var taxAnnual = p.taxAnnual || Math.round(assessed * taxRate);
    cite('taxAnnual', p.taxAnnual ? 'County tax record' : (l ? l.name + ' rate ' + (m.taxBasis === 'per100' ? '$' + l.taxRate.toFixed(2) + '/$100' : (taxRate * 100).toFixed(2) + '% effective') + ' x ' + (p.assessedValue ? 'assessed value' : 'price') : 'National average 1.1%'));
    cite('rate', rateSrc.mortgage30 || 'Freddie Mac PMMS 30-yr (fallback ' + (rates.mortgage30 * 100).toFixed(2) + '%)');

    if (kind === 'residential') {
      var r = m ? m.residential : { appreciation1y: 0.035, appreciation5y: 0.045, vacancy: 0.06, insurancePct: 0.005, rentGrowth: 0.03 };
      var units = p.units || (p.assetType === '2-4 Unit' ? 2 : 1);
      var rent = p.estRent || p.rentMonthly || (m ? PMarkets.fmr(m, p.beds || 3) * (units > 1 ? units : 1) : Math.round(price * 0.008));
      Object.assign(base, {
        propertyType: p.assetType || 'SFR', units: units, beds: p.beds || 3, baths: p.baths || 2, sqft: p.sqft || 1600, yearBuilt: p.yearBuilt || null, lotAcres: p.lotAcres || null,
        estValue: p.estValue || price, rentMonthly: rent, taxAnnual: taxAnnual,
        insuranceAnnual: p.insuranceAnnual || Math.round(price * r.insurancePct), hoaMonthly: p.hoaMonthly || 0,
        vacancyPct: r.vacancy, appreciation: r.appreciation1y, appreciation5y: r.appreciation5y, rentGrowth: r.rentGrowth, rate: rates.mortgage30
      });
      cite('rentMonthly', p.estRent ? (p.rentSource || 'Rent estimate (' + (p.source === 'demo' ? 'demo record' : p.source || 'provider') + ')') : m ? 'HUD Fair Market Rent, ' + m.msa + ' (' + (p.beds || 3) + 'BR)' : '0.8% of price rule of thumb');
      cite('insuranceAnnual', mLabel + ': ' + (r.insurancePct * 100).toFixed(2) + '% of value');
      cite('vacancyPct', mLabel + ': rental vacancy (Census HVS)');
      cite('appreciation', mLabel + ': FHFA HPI 1-yr');
      cite('rentGrowth', mLabel + ': rent growth');
      cite('maintenancePct', 'Industry standard 6% of gross rent');
      cite('capexPct', 'Industry standard 5% of gross rent reserve');
      cite('mgmtPct', 'Typical 8% third-party management');
    } else {
      var cls = CLASS_MAP[p.assetType] || p.assetClass || 'industrial';
      var c = (m && m.commercial[cls]) || { cap: 0.07, rentPsf: 15, vacancy: 0.07 };
      var bsf = p.buildingSf || 0, units2 = p.units || 0;
      var occ = p.occupancyPct !== undefined && p.occupancyPct !== null ? p.occupancyPct : 0.93;
      var roll;
      if (p.rentRoll && p.rentRoll.length) roll = p.rentRoll;
      else if (cls === 'multifamily') {
        var perUnit = m ? Math.round(PMarkets.fmr(m, 2) * 0.95) : 1300;
        roll = [{ label: '1BR', count: Math.round(units2 * 0.45), rentMonthly: Math.round(perUnit * 0.87) }, { label: '2BR', count: units2 - Math.round(units2 * 0.45), rentMonthly: perUnit }];
      } else {
        var mr = c.rentPsf || 15, leased = Math.round(bsf * occ), vac = bsf - leased;
        roll = [
          { label: 'Anchor / Suite A', sf: Math.round(leased * 0.6), rentPsfYr: +(mr * 0.95).toFixed(2), leaseType: cls === 'office' ? 'MG' : 'NNN', leaseEndYears: p.leaseExpiry ? Math.max(0.1, (new Date(p.leaseExpiry) - new Date()) / (365.25 * 864e5)) : 4 },
          { label: 'Suite B', sf: leased - Math.round(leased * 0.6), rentPsfYr: +(mr * 1.02).toFixed(2), leaseType: cls === 'office' ? 'MG' : 'NNN', leaseEndYears: 2.5 }
        ];
        if (vac > 0) roll.push({ label: 'Vacant', sf: vac, rentPsfYr: 0, vacant: true });
      }
      Object.assign(base, {
        assetClass: cls, buildingSf: bsf, units: units2, yearBuilt: p.yearBuilt || null, landAcres: p.lotAcres || null, rentRoll: roll,
        marketRentPsf: c.rentPsf || 0, marketCap: c.cap, exitCap: +(c.cap + 0.0025).toFixed(4), vacancyPct: cls === 'multifamily' || cls === 'self-storage' ? c.vacancy : Math.min(0.05, c.vacancy),
        expenses: { taxes: taxAnnual, insurance: Math.round(price * (m ? m.residential.insurancePct * 0.8 : 0.004)), cam: Math.round(bsf * (cls === 'industrial' ? 0.9 : cls === 'multifamily' ? 0 : 2.5)) },
        rate: +(rates.treasury10y + rates.commercialSpread).toFixed(4)
      });
      cite('marketCap', mLabel + ': ' + cls + ' cap rate benchmark');
      cite('marketRentPsf', mLabel + ': ' + cls + ' market rent');
      cite('rentRoll', p.rentRoll ? 'Provided rent roll' : 'Modeled from market rent x ' + Math.round(occ * 100) + '% occupancy. Replace with the actual rent roll.');
      cite('rate', (rateSrc.treasury10y || '10-yr Treasury') + ' + ' + (rates.commercialSpread * 100).toFixed(2) + '% typical spread');
      cite('expenses', 'Taxes from locality rate; insurance and CAM from market norms');
    }
    base.sources = src;
    return base;
  }

  return { build: build, locate: locate, kindOf: kindOf, CLASS_MAP: CLASS_MAP };
});
