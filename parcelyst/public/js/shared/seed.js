/*
 * Deterministic DEMO dataset so every screen works before a data provider is connected.
 * Records are synthetic (made-up owners and street numbers on generic street names) and are
 * always tagged source:'demo'. The UI labels them as demo data. Replace with RentCast/ATTOM/
 * Regrid pulls or county CSV imports for production use.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./markets.js'));
  else root.PSeed = factory(root.PMarkets);
})(typeof self !== 'undefined' ? self : this, function (PMarkets) {
  'use strict';

  function rng(seed) {
    var t = seed >>> 0;
    return function () { t += 0x6D2B79F5; var r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  var FIRST = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Karen', 'Charles', 'Sarah', 'Darnell', 'Keisha', 'Andre', 'Tamika', 'Luis', 'Maria', 'Wei', 'Priya', 'Kwame', 'Aaliyah', 'Gregory', 'Denise', 'Harold', 'Gloria', 'Marcus', 'Renee'];
  var LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards'];
  var LLC_A = ['Tidewater', 'Cardinal', 'Bayside', 'Riverbend', 'Keystone', 'Summit', 'Harbor', 'Oakmont', 'Pinecrest', 'Liberty', 'Heritage', 'Meridian', 'Northstar', 'Ironwood', 'Bluestone', 'Crescent'];
  var LLC_B = ['Holdings', 'Properties', 'Capital', 'Investments', 'Realty', 'Ventures', 'Partners', 'Equities'];
  var STREETS = ['Oak', 'Maple', 'Cedar', 'Pine', 'Elm', 'Willow', 'Birch', 'Magnolia', 'Dogwood', 'Holly', 'Laurel', 'Chestnut', 'Hickory', 'Sycamore', 'Poplar', 'Cypress', 'Ash', 'Spruce', 'Juniper', 'Aspen', 'Ridge', 'Creek', 'Meadow', 'Brook', 'Harbor', 'Shore', 'Hill', 'Forest', 'Park', 'Lake', 'Spring', 'Mill', 'Church', 'Washington', 'Jefferson', 'Madison', 'Monroe', 'Franklin', 'Lincoln', 'Liberty'];
  var SUFFIX = ['St', 'Ave', 'Dr', 'Ln', 'Rd', 'Ct', 'Way', 'Pl', 'Blvd', 'Cir'];
  var OOS = [['Raleigh', 'NC'], ['Charlotte', 'NC'], ['Atlanta', 'GA'], ['Brooklyn', 'NY'], ['Silver Spring', 'MD'], ['Jacksonville', 'FL'], ['San Diego', 'CA'], ['Dallas', 'TX'], ['Chicago', 'IL'], ['Philadelphia', 'PA'], ['Denver', 'CO'], ['Omaha', 'NE']];
  var ZONING_RES = ['R-1', 'R-2', 'R-5', 'R-7.5', 'R-10', 'R-15', 'RPUD', 'R-40'];
  var ZONING_AG = ['A-1', 'AG-1', 'AR', 'RR'];
  var ZONING_COM = { Retail: ['B-1', 'B-2', 'C-2'], Office: ['O-1', 'B-1', 'O-2'], Industrial: ['I-1', 'M-1', 'I-2'], 'Mixed-Use': ['MU', 'B-3', 'UMU'], 'Self-Storage': ['B-3', 'I-1'], 'Multifamily 5+': ['R-MF', 'A-12', 'R-24', 'MF-3'] };

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function between(r, lo, hi) { return lo + (hi - lo) * r(); }
  function isoDate(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }

  function generateMarket(market, count, refDate) {
    var now = refDate || new Date('2026-10-01');
    var r = rng(hash(market.id));
    var out = [];
    var res = market.residential;
    for (var i = 0; i < count; i++) {
      var loc = pick(r, market.localities);
      var zip = pick(r, loc.zips);
      var roll = r();
      var type = roll < 0.50 ? 'SFR' : roll < 0.60 ? 'Townhouse' : roll < 0.66 ? 'Condo' : roll < 0.73 ? '2-4 Unit'
        : roll < 0.78 ? 'Multifamily 5+' : roll < 0.82 ? 'Retail' : roll < 0.85 ? 'Office' : roll < 0.89 ? 'Industrial' : roll < 0.91 ? 'Mixed-Use' : roll < 0.92 ? 'Self-Storage' : 'Land';
      var comm = ['Multifamily 5+', 'Retail', 'Office', 'Industrial', 'Mixed-Use', 'Self-Storage'].indexOf(type) !== -1;
      var rec = {
        id: market.id.slice(0, 3) + '-' + String(i + 1).padStart(5, '0'),
        source: 'demo', market: market.id, locality: loc.id, localityName: loc.name,
        address: (100 + Math.floor(r() * 9800)) + ' ' + pick(r, STREETS) + ' ' + pick(r, SUFFIX),
        city: loc.name.split(' (')[0].split(' / ')[0].replace(' County', ''), state: market.state, zip: zip,
        assetType: type
      };
      var med = loc.medianValue;
      if (type === 'Land') {
        var acres = r() < 0.6 ? between(r, 5, 40) : r() < 0.85 ? between(r, 40, 160) : between(r, 1, 5);
        var perAcre = between(r, 12000, 65000) * (med / 350000);
        rec.lotAcres = Math.round(acres * 10) / 10;
        rec.estValue = Math.round(acres * perAcre / 1000) * 1000;
        rec.zoning = r() < 0.55 ? pick(r, ZONING_AG) : pick(r, ZONING_RES);
        rec.utilities = r() < 0.4 ? 'public' : r() < 0.7 ? 'nearby' : 'well/septic';
        rec.address = 'Parcel off ' + pick(r, STREETS) + ' ' + pick(r, ['Rd', 'Hwy', 'Ln', 'Pkwy']);
      } else if (comm) {
        var sf = type === 'Industrial' ? between(r, 8000, 120000) : type === 'Multifamily 5+' ? between(r, 6000, 90000) : type === 'Self-Storage' ? between(r, 30000, 90000) : between(r, 3000, 45000);
        var mk = market.commercial[type === 'Multifamily 5+' ? 'multifamily' : type.toLowerCase()] || { cap: 0.07, rentPsf: 15 };
        rec.buildingSf = Math.round(sf / 100) * 100;
        rec.units = type === 'Multifamily 5+' ? Math.max(5, Math.round(sf / 900)) : null;
        var noiPsf = type === 'Multifamily 5+' ? between(r, 7, 13) * (med / 350000) : (mk.rentPsf || 12) * between(r, 0.65, 1.0);
        rec.estValue = Math.round(rec.buildingSf * noiPsf / (mk.cap * between(r, 0.9, 1.15)) / 1000) * 1000;
        rec.occupancyPct = Math.round(Math.min(1, between(r, 0.55, 1.05)) * 100) / 100;
        rec.zoning = pick(r, ZONING_COM[type]);
        rec.lotAcres = Math.round(between(r, 0.4, 6) * 10) / 10;
        if (r() < 0.5) { var lm = Math.floor(between(r, 1, 48)); var ld = new Date(now); ld.setMonth(ld.getMonth() + lm); rec.leaseExpiry = ld.toISOString().slice(0, 10); }
        if (r() < 0.45) { var mm = Math.floor(between(r, 1, 60)); var md = new Date(now); md.setMonth(md.getMonth() + mm); rec.loanMaturity = md.toISOString().slice(0, 10); }
      } else {
        var beds = type === 'Condo' ? Math.ceil(between(r, 1, 3)) : type === '2-4 Unit' ? Math.ceil(between(r, 4, 8)) : Math.ceil(between(r, 2, 5));
        rec.beds = beds;
        rec.baths = Math.max(1, Math.round((beds * 0.6 + between(r, 0, 1)) * 2) / 2);
        rec.sqft = Math.round((type === 'Condo' ? between(r, 650, 1500) : type === '2-4 Unit' ? between(r, 1800, 4200) : between(r, 1000, 3400)) / 10) * 10;
        rec.units = type === '2-4 Unit' ? Math.ceil(between(r, 2, 4)) : 1;
        var mult = type === 'Condo' ? 0.6 : type === 'Townhouse' ? 0.8 : type === '2-4 Unit' ? 1.1 : 1;
        rec.estValue = Math.round(med * mult * between(r, 0.55, 1.6) * (rec.sqft / 1900) ** 0.6 / 1000) * 1000;
        rec.estRent = Math.round(PMarkets.fmr(market, type === '2-4 Unit' ? 2 : beds) * (type === '2-4 Unit' ? rec.units : 1) * between(r, 0.9, 1.25) / 5) * 5;
        rec.lotAcres = type === 'Condo' ? null : Math.round(between(r, 0.08, 0.6) * 100) / 100;
        rec.zoning = type === '2-4 Unit' ? 'R-MF' : pick(r, ZONING_RES);
      }
      rec.yearBuilt = type === 'Land' ? null : Math.floor(between(r, 1925, 2023));
      rec.assessedValue = Math.round(rec.estValue * between(r, 0.62, 1.02) / 100) * 100;

      // Ownership
      var yearsOwned = Math.pow(r(), 1.3) * 38 + 0.3;
      var sold = new Date(now.getTime() - yearsOwned * 365.25 * 864e5);
      rec.lastSaleDate = sold.toISOString().slice(0, 10);
      var appr = Math.pow(1 + Math.max(0.01, res.appreciation5y * 0.75), yearsOwned);
      rec.lastSalePrice = Math.round(rec.estValue / appr / 1000) * 1000;
      var ot = r();
      rec.ownerType = comm ? (ot < 0.8 ? 'LLC' : ot < 0.9 ? 'Corporate' : 'Individual') : type === 'Land' ? (ot < 0.45 ? 'Individual' : ot < 0.7 ? 'Trust' : ot < 0.85 ? 'Estate' : 'LLC') : (ot < 0.78 ? 'Individual' : ot < 0.88 ? 'LLC' : ot < 0.96 ? 'Trust' : 'Estate');
      var fn = pick(r, FIRST), ln = pick(r, LAST);
      rec.ownerName = rec.ownerType === 'LLC' || rec.ownerType === 'Corporate' ? pick(r, LLC_A) + ' ' + pick(r, LLC_B) + (rec.ownerType === 'LLC' ? ' LLC' : ' Inc') : rec.ownerType === 'Trust' ? ln + ' Family Trust' : rec.ownerType === 'Estate' ? 'Estate of ' + fn + ' ' + ln : fn + ' ' + ln + (r() < 0.4 ? ' & ' + pick(r, FIRST) + ' ' + ln : '');
      rec.absentee = comm || rec.ownerType !== 'Individual' ? r() < 0.75 : r() < 0.24;
      rec.outOfState = rec.absentee && r() < 0.35;
      rec.ownerOccupied = !rec.absentee && !comm && type !== 'Land';
      if (rec.outOfState) { var o = pick(r, OOS); rec.mailingAddress = (100 + Math.floor(r() * 9800)) + ' ' + pick(r, STREETS) + ' ' + pick(r, SUFFIX) + ', ' + o[0] + ', ' + o[1]; }
      else if (rec.absentee) rec.mailingAddress = (100 + Math.floor(r() * 9800)) + ' ' + pick(r, STREETS) + ' ' + pick(r, SUFFIX) + ', ' + pick(r, market.localities).name.split(' (')[0] + ', ' + market.state;
      else rec.mailingAddress = rec.address + ', ' + rec.city + ', ' + rec.state;

      // Debt + equity
      var freeClear = yearsOwned > 25 ? r() < 0.75 : yearsOwned > 12 ? r() < 0.35 : r() < 0.12;
      if (freeClear) rec.loanBalanceEst = 0;
      else {
        var orig = rec.lastSalePrice * between(r, 0.65, 0.95);
        var rate = yearsOwned > 15 ? 0.065 : yearsOwned > 4 ? 0.035 : 0.068;
        var rr = rate / 12, n = 360, k = Math.min(n, Math.round(yearsOwned * 12));
        var pmt = orig * rr / (1 - Math.pow(1 + rr, -n));
        rec.loanBalanceEst = Math.max(0, Math.round((orig * Math.pow(1 + rr, k) - pmt * (Math.pow(1 + rr, k) - 1) / rr) / 1000) * 1000);
      }
      rec.equityPct = rec.estValue > 0 ? Math.round((1 - rec.loanBalanceEst / rec.estValue) * 100) / 100 : null;

      // Distress + market activity (rare, correlated)
      var stress = r();
      rec.taxDelinquent = stress < 0.045 || (rec.absentee && stress < 0.07);
      if (rec.taxDelinquent) rec.taxDelinquentAmount = Math.round(rec.assessedValue * 0.011 * between(r, 0.5, 3) / 10) * 10;
      rec.preforeclosure = !freeClear && r() < 0.025;
      rec.probate = rec.ownerType === 'Estate' || r() < 0.012;
      rec.vacant = r() < (rec.absentee ? 0.09 : 0.025);
      rec.codeViolation = r() < (rec.vacant ? 0.3 : 0.02);
      var ls = r();
      rec.listingStatus = ls < 0.035 ? 'active' : ls < 0.065 ? 'expired' : ls < 0.08 ? 'withdrawn' : 'none';
      if (rec.listingStatus !== 'none') { rec.listPrice = Math.round(rec.estValue * between(r, 0.97, 1.12) / 1000) * 1000; rec.daysOnMarket = Math.floor(between(r, 12, 190)); }
      rec.updatedAt = isoDate(now.getFullYear(), now.getMonth() + 1, 1);
      out.push(rec);
    }
    return out;
  }

  var COUNTS = { 'hampton-roads': 900, richmond: 700, austin: 600, 'jackson-county-mo': 500 };

  function generateAll(refDate) {
    var all = [];
    PMarkets.MARKETS.forEach(function (m) { all = all.concat(generateMarket(m, COUNTS[m.id] || 400, refDate)); });
    return all;
  }

  return { generateMarket: generateMarket, generateAll: generateAll, rng: rng, hash: hash };
});
