/*
 * Lead scoring for the Deal Finder (investors), Listing Prospector (agents) and Land Finder.
 * Each score is a transparent sum of named signals so users see WHY a record ranks high.
 * Shared by the server and the static demo backend.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PScoring = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RESIDENTIAL = ['SFR', 'Townhouse', 'Condo', '2-4 Unit'];
  var COMMERCIAL = ['Multifamily 5+', 'Retail', 'Office', 'Industrial', 'Mixed-Use', 'Self-Storage'];
  var ASSET_TYPES = RESIDENTIAL.concat(COMMERCIAL, ['Land']);

  function yearsSince(dateStr, now) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d)) return null;
    return ((now || new Date()) - d) / (365.25 * 864e5);
  }
  function monthsUntil(dateStr, now) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d)) return null;
    return (d - (now || new Date())) / (30.44 * 864e5);
  }
  function isCommercial(r) { return COMMERCIAL.indexOf(r.assetType) !== -1; }
  function isLand(r) { return r.assetType === 'Land'; }

  function derive(r, now) {
    var yo = yearsSince(r.lastSaleDate, now);
    var val = r.estValue || r.assessedValue || 0;
    var eq = r.equityPct !== undefined && r.equityPct !== null ? r.equityPct
      : (val > 0 && r.loanBalanceEst !== undefined && r.loanBalanceEst !== null ? (val - r.loanBalanceEst) / val : null);
    return { yearsOwned: yo, equityPct: eq, leaseMonths: monthsUntil(r.leaseExpiry, now), loanMonths: monthsUntil(r.loanMaturity, now) };
  }

  function add(list, key, label, pts) { list.push({ key: key, label: label, points: pts }); return pts; }
  function finish(list) {
    var s = 0; list.forEach(function (x) { s += x.points; });
    list.sort(function (a, b) { return b.points - a.points; });
    return { score: Math.max(0, Math.min(100, Math.round(s))), signals: list };
  }

  // Motivated-seller / off-market opportunity score.
  function investorScore(r, now) {
    var d = derive(r, now), s = [];
    if (r.preforeclosure) add(s, 'preforeclosure', 'Pre-foreclosure / notice of default', 24);
    if (r.taxDelinquent) add(s, 'taxDelinquent', 'Delinquent property taxes' + (r.taxDelinquentAmount ? ' ($' + Math.round(r.taxDelinquentAmount).toLocaleString() + ')' : ''), 20);
    if (r.probate || r.ownerType === 'Estate') add(s, 'probate', 'Probate / estate owner', 16);
    if (r.vacant) add(s, 'vacant', 'Likely vacant (USPS / utility)', 12);
    if (r.codeViolation) add(s, 'code', 'Open code violation', 8);
    if (r.absentee) add(s, 'absentee', r.outOfState ? 'Out-of-state absentee owner' : 'Absentee owner', r.outOfState ? 12 : 8);
    if (d.yearsOwned !== null) {
      if (d.yearsOwned >= 20) add(s, 'longHold', 'Owned ' + Math.floor(d.yearsOwned) + ' years', 10);
      else if (d.yearsOwned >= 12) add(s, 'longHold', 'Owned ' + Math.floor(d.yearsOwned) + ' years', 6);
    }
    if (d.equityPct !== null) {
      if (d.equityPct >= 0.6) add(s, 'equity', 'High equity (~' + Math.round(d.equityPct * 100) + '%)', 12);
      else if (d.equityPct >= 0.35) add(s, 'equity', 'Solid equity (~' + Math.round(d.equityPct * 100) + '%)', 6);
    }
    if (r.listingStatus === 'expired' || r.listingStatus === 'withdrawn') add(s, 'expired', 'Listing ' + r.listingStatus + (r.daysOnMarket ? ' after ' + r.daysOnMarket + ' DOM' : ''), 10);
    if (r.absentee && d.yearsOwned !== null && d.yearsOwned >= 10 && !isLand(r)) add(s, 'tiredLandlord', 'Tired-landlord profile', 6);
    if (r.estValue && r.assessedValue && r.assessedValue / r.estValue < 0.75) add(s, 'assessGap', 'Assessed well below market', 4);
    if (isCommercial(r)) {
      if (r.occupancyPct !== undefined && r.occupancyPct !== null && r.occupancyPct < 0.8) add(s, 'occupancy', 'Occupancy ' + Math.round(r.occupancyPct * 100) + '%', 10);
      if (d.loanMonths !== null && d.loanMonths >= 0 && d.loanMonths <= 24) add(s, 'loanMaturity', 'Loan matures in ' + Math.max(0, Math.round(d.loanMonths)) + ' mo', 12);
    }
    if (isLand(r) && r.lotAcres >= 5 && d.yearsOwned !== null && d.yearsOwned >= 15) add(s, 'landHold', 'Long-held acreage', 8);
    if (r.listingStatus === 'active') add(s, 'listed', 'Currently listed (on-market)', -15);
    return finish(s);
  }

  // Likely-to-list in the next 6-12 months (agent prospecting).
  function agentScore(r, now) {
    var d = derive(r, now), s = [];
    if (r.listingStatus === 'active' || r.listingStatus === 'pending') return { score: 0, signals: [{ key: 'listed', label: 'Already ' + r.listingStatus, points: 0 }] };
    if (r.listingStatus === 'expired' || r.listingStatus === 'withdrawn') add(s, 'expired', 'Recently ' + r.listingStatus + ' listing', 24);
    if (r.probate || r.ownerType === 'Estate') add(s, 'probate', 'Probate / inherited', 20);
    if (r.preforeclosure) add(s, 'preforeclosure', 'Pre-foreclosure (short sale / quick sale)', 12);
    if (d.yearsOwned !== null) {
      if (d.yearsOwned >= 7 && d.yearsOwned < 13) add(s, 'tenure', 'Owned ' + Math.floor(d.yearsOwned) + ' yrs (peak move window)', 18);
      else if (d.yearsOwned >= 13 && d.yearsOwned < 22) add(s, 'tenure', 'Owned ' + Math.floor(d.yearsOwned) + ' yrs', 12);
      else if (d.yearsOwned >= 22) add(s, 'tenure', 'Owned ' + Math.floor(d.yearsOwned) + ' yrs (downsizing age)', 14);
      else if (d.yearsOwned >= 4) add(s, 'tenure', 'Owned ' + Math.floor(d.yearsOwned) + ' yrs', 5);
    }
    if (d.equityPct !== null && d.equityPct >= 0.4) add(s, 'equity', 'Equity to move (~' + Math.round(d.equityPct * 100) + '%)', 12);
    if (r.absentee && d.yearsOwned !== null && d.yearsOwned >= 8) add(s, 'landlord', 'Long-term landlord, may cash out', 10);
    if (r.ownerType === 'Trust') add(s, 'trust', 'Trust-owned (estate planning event)', 6);
    if (r.vacant) add(s, 'vacant', 'Vacant property', 8);
    if (r.taxDelinquent) add(s, 'taxDelinquent', 'Tax delinquent', 6);
    if (isCommercial(r)) {
      if (d.leaseMonths !== null && d.leaseMonths >= 0 && d.leaseMonths <= 18) add(s, 'lease', 'Major lease expires in ' + Math.round(d.leaseMonths) + ' mo', 12);
      if (d.loanMonths !== null && d.loanMonths >= 0 && d.loanMonths <= 24) add(s, 'loanMaturity', 'Loan maturity in ' + Math.round(d.loanMonths) + ' mo (refi or sell)', 16);
      if (d.yearsOwned !== null && d.yearsOwned >= 7) add(s, 'holdPeriod', 'Past typical 5-7 yr hold', 10);
      if (r.occupancyPct !== undefined && r.occupancyPct !== null && r.occupancyPct < 0.8) add(s, 'occupancy', 'Occupancy ' + Math.round(r.occupancyPct * 100) + '%', 6);
    }
    return finish(s);
  }

  // Raw land suitable for subdivision / builder lots.
  function landScore(r, now) {
    var d = derive(r, now), s = [];
    if (!isLand(r) && !(r.lotAcres >= 5)) return { score: 0, signals: [] };
    var ac = r.lotAcres || 0;
    if (ac >= 20 && ac <= 300) add(s, 'acreage', ac.toFixed(1) + ' acres (subdivision scale)', 22);
    else if (ac >= 5) add(s, 'acreage', ac.toFixed(1) + ' acres', 10);
    var z = String(r.zoning || '').toUpperCase();
    if (/^R|PUD|RPUD|SF|RS|RE|RT/.test(z)) add(s, 'zoning', 'Residential zoning (' + r.zoning + ')', 18);
    else if (/^A|AG|RA|RR/.test(z)) add(s, 'zoning', 'Agricultural / rural (' + r.zoning + '), rezoning upside', 10);
    if (d.yearsOwned !== null && d.yearsOwned >= 15) add(s, 'hold', 'Owned ' + Math.floor(d.yearsOwned) + ' years', 12);
    if (r.probate || r.ownerType === 'Estate') add(s, 'estate', 'Estate / heirs', 14);
    if (r.absentee) add(s, 'absentee', 'Absentee owner', 8);
    if (r.taxDelinquent) add(s, 'taxDelinquent', 'Tax delinquent', 10);
    if (r.utilities === 'public') add(s, 'utilities', 'Public water/sewer available', 12);
    if (r.listingStatus === 'active') add(s, 'listed', 'Currently listed', -5);
    return finish(s);
  }

  var MODES = { investor: investorScore, agent: agentScore, land: landScore };

  function score(r, mode, now) { return (MODES[mode] || investorScore)(r, now); }

  // filters: { market, assetGroup:'residential'|'commercial'|'land'|'all', assetTypes:[], zips:[], minScore, minEquity, minYearsOwned,
  //            absentee, outOfState, taxDelinquent, preforeclosure, probate, vacant, minValue, maxValue, minAcres, q, sort }
  function matches(r, f, now) {
    if (f.market && r.market !== f.market) return false;
    if (f.assetGroup === 'residential' && RESIDENTIAL.indexOf(r.assetType) === -1) return false;
    if (f.assetGroup === 'commercial' && COMMERCIAL.indexOf(r.assetType) === -1) return false;
    if (f.assetGroup === 'land' && !isLand(r)) return false;
    if (f.assetTypes && f.assetTypes.length && f.assetTypes.indexOf(r.assetType) === -1) return false;
    if (f.locality && r.locality !== f.locality) return false;
    if (f.zips && f.zips.length && f.zips.indexOf(String(r.zip)) === -1) return false;
    var d = derive(r, now);
    if (f.minEquity && !(d.equityPct !== null && d.equityPct >= f.minEquity)) return false;
    if (f.minYearsOwned && !(d.yearsOwned !== null && d.yearsOwned >= f.minYearsOwned)) return false;
    if (f.absentee && !r.absentee) return false;
    if (f.outOfState && !r.outOfState) return false;
    if (f.taxDelinquent && !r.taxDelinquent) return false;
    if (f.preforeclosure && !r.preforeclosure) return false;
    if (f.probate && !(r.probate || r.ownerType === 'Estate')) return false;
    if (f.vacant && !r.vacant) return false;
    if (f.expired && !(r.listingStatus === 'expired' || r.listingStatus === 'withdrawn')) return false;
    var v = r.estValue || r.assessedValue || 0;
    if (f.minValue && v < f.minValue) return false;
    if (f.maxValue && v > f.maxValue) return false;
    if (f.minAcres && !((r.lotAcres || 0) >= f.minAcres)) return false;
    if (f.q) {
      var q = String(f.q).toLowerCase();
      var hay = [r.address, r.city, r.zip, r.ownerName, r.locality].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function search(records, mode, filters, now) {
    filters = filters || {};
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!matches(r, filters, now)) continue;
      var sc = score(r, mode, now);
      if (filters.minScore && sc.score < filters.minScore) continue;
      if (mode === 'land' && sc.score === 0) continue;
      out.push({ record: r, score: sc.score, signals: sc.signals });
    }
    var sort = filters.sort || 'score';
    out.sort(function (a, b) {
      if (sort === 'value') return (b.record.estValue || 0) - (a.record.estValue || 0);
      if (sort === 'equity') return (derive(b.record, now).equityPct || 0) - (derive(a.record, now).equityPct || 0);
      if (sort === 'acres') return (b.record.lotAcres || 0) - (a.record.lotAcres || 0);
      return b.score - a.score;
    });
    return out;
  }

  return {
    RESIDENTIAL: RESIDENTIAL, COMMERCIAL: COMMERCIAL, ASSET_TYPES: ASSET_TYPES,
    investorScore: investorScore, agentScore: agentScore, landScore: landScore, score: score,
    derive: derive, matches: matches, search: search, isCommercial: isCommercial, isLand: isLand
  };
});
