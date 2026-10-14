/*
 * CSV import for county lists (delinquent tax, probate, code violations, assessor exports)
 * and list-provider exports (PropStream, DealMachine, BatchLeads, PropertyRadar, Regrid).
 * Headers are auto-mapped by synonym; the list type stamps a signal onto every row.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./markets.js'));
  else root.PCsv = factory(root.PMarkets);
})(typeof self !== 'undefined' ? self : this, function (PMarkets) {
  'use strict';

  function parse(text) {
    var rows = [], row = [], f = '', q = false, i = 0, c;
    text = String(text || '').replace(/^﻿/, '');
    while (i < text.length) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
      i++;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  var SYN = {
    address: ['property address', 'site address', 'situs address', 'address', 'street address', 'property street', 'location', 'prop address', 'situs'],
    city: ['property city', 'site city', 'situs city', 'city'],
    state: ['property state', 'site state', 'situs state', 'state'],
    zip: ['property zip', 'site zip', 'situs zip', 'zip', 'zip code', 'zipcode', 'postal code'],
    ownerName: ['owner name', 'owner', 'owner 1 full name', 'owner1', 'owner full name', 'taxpayer', 'taxpayer name', 'name'],
    ownerFirst: ['owner 1 first name', 'owner first name', 'first name'],
    ownerLast: ['owner 1 last name', 'owner last name', 'last name'],
    mailingAddress: ['mailing address', 'mail address', 'owner mailing address', 'mailadd', 'mailing street'],
    mailingCity: ['mailing city', 'mail city'],
    mailingState: ['mailing state', 'mail state', 'mail_state2'],
    parcelId: ['parcel id', 'parcel', 'parcel number', 'gpin', 'pin', 'apn', 'account', 'account number', 'tax id', 'map number'],
    assetType: ['property type', 'land use', 'use description', 'usedesc', 'class', 'property class', 'type'],
    beds: ['bedrooms', 'beds', 'bed'],
    baths: ['bathrooms', 'baths', 'total bathrooms', 'bath'],
    sqft: ['building sqft', 'living sqft', 'square feet', 'sqft', 'living area', 'finished sq ft', 'gla'],
    buildingSf: ['building sf', 'gross building area', 'rentable sf', 'rba'],
    units: ['units', 'number of units', 'unit count'],
    lotAcres: ['lot size acres', 'acres', 'acreage', 'gis acres', 'll_gisacre', 'lot acres'],
    yearBuilt: ['year built', 'effective year built', 'yr built', 'yearbuilt'],
    zoning: ['zoning', 'zone', 'zoning code'],
    assessedValue: ['assessed value', 'total assessed value', 'assessment', 'total value', 'parval', 'appraised value'],
    estValue: ['est. value', 'estimated value', 'market value', 'avm', 'est value', 'value'],
    equityPct: ['est. equity %', 'equity %', 'equity percent', 'estimated equity %'],
    loanBalanceEst: ['est. loan balance', 'open mortgage balance', 'loan balance', 'mortgage balance', 'total loan balance'],
    lastSaleDate: ['last sale date', 'sale date', 'deed date', 'recording date', 'saledate', 'transfer date'],
    lastSalePrice: ['last sale amount', 'last sale price', 'sale price', 'sale amount', 'saleprice', 'consideration'],
    taxDelinquentAmount: ['amount due', 'delinquent amount', 'total due', 'tax due', 'balance due', 'taxes owed'],
    estRent: ['est. rent', 'estimated rent', 'rent', 'market rent'],
    occupancyPct: ['occupancy', 'occupancy %', 'leased %'],
    leaseExpiry: ['lease expiration', 'lease expiry', 'lease end'],
    loanMaturity: ['loan maturity', 'maturity date'],
    phone: ['phone', 'phone 1', 'mobile', 'owner phone'],
    email: ['email', 'email 1', 'owner email'],
    vacant: ['vacant', 'vacancy', 'usps vacant'],
    ownerOccupied: ['owner occupied', 'owner occ'],
    listingStatus: ['mls status', 'listing status', 'status']
  };

  function norm(h) { return String(h || '').toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  function mapHeaders(headers) {
    var map = {}, used = {};
    var hs = headers.map(norm);
    Object.keys(SYN).forEach(function (field) {
      var best = -1;
      for (var s = 0; s < SYN[field].length && best === -1; s++) {
        for (var i = 0; i < hs.length; i++) if (!used[i] && hs[i] === SYN[field][s]) { best = i; break; }
      }
      if (best === -1) {
        for (var s2 = 0; s2 < SYN[field].length && best === -1; s2++) {
          for (var j = 0; j < hs.length; j++) if (!used[j] && SYN[field][s2].length > 3 && hs[j].indexOf(SYN[field][s2]) !== -1) { best = j; break; }
        }
      }
      if (best !== -1) { map[field] = best; used[best] = true; }
    });
    return map;
  }

  function money(v) { var n = parseFloat(String(v || '').replace(/[$,\s]/g, '')); return isNaN(n) ? null : n; }
  function yes(v) { return /^(y|yes|true|1|x|vacant)$/i.test(String(v || '').trim()); }
  function dateOf(v) {
    if (!v) return null;
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) { var y = m[3].length === 2 ? (parseInt(m[3], 10) > 40 ? '19' : '20') + m[3] : m[3]; return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); }
    var d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  function typeOf(v, row) {
    var s = String(v || '').toLowerCase();
    if (/vacant|land|agric|farm|timber|acre/.test(s)) return 'Land';
    if (/condo/.test(s)) return 'Condo';
    if (/town/.test(s)) return 'Townhouse';
    if (/duplex|triplex|quad|2-4|multi.?family \(2|2 family|3 family|4 family/.test(s)) return '2-4 Unit';
    if (/apartment|multi.?family|5\+/.test(s)) return 'Multifamily 5+';
    if (/retail|shopping|store|restaurant/.test(s)) return 'Retail';
    if (/office|medical/.test(s)) return 'Office';
    if (/industrial|warehouse|flex|manufact|distribution/.test(s)) return 'Industrial';
    if (/storage/.test(s)) return 'Self-Storage';
    if (/mixed/.test(s)) return 'Mixed-Use';
    if (/commercial/.test(s)) return 'Retail';
    if (row && row.lotAcres >= 3 && !row.sqft) return 'Land';
    return 'SFR';
  }

  var LIST_TYPES = {
    general: { label: 'General / assessor export', apply: {} },
    taxDelinquent: { label: 'Delinquent tax list', apply: { taxDelinquent: true } },
    probate: { label: 'Probate / estate list', apply: { probate: true } },
    preforeclosure: { label: 'Pre-foreclosure / trustee sale list', apply: { preforeclosure: true } },
    code: { label: 'Code violation list', apply: { codeViolation: true } },
    vacant: { label: 'Vacant property list', apply: { vacant: true } },
    expired: { label: 'Expired / withdrawn listings', apply: { listingStatus: 'expired' } },
    land: { label: 'Land / acreage parcels', apply: { assetType: 'Land' } }
  };

  function toRecords(text, opts) {
    opts = opts || {};
    var rows = parse(text);
    if (rows.length < 2) return { records: [], mapping: {}, headers: rows[0] || [], skipped: 0 };
    var headers = rows[0], map = opts.mapping || mapHeaders(headers);
    var list = LIST_TYPES[opts.listType] || LIST_TYPES.general;
    var market = opts.market ? PMarkets.byId(opts.market) : null;
    var out = [], skipped = 0, stamp = Date.now().toString(36);
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      function g(k) { return map[k] !== undefined ? String(row[map[k]] || '').trim() : ''; }
      var addr = g('address');
      if (!addr) { skipped++; continue; }
      var rec = {
        id: 'imp-' + stamp + '-' + i, source: 'import' + (opts.filename ? ':' + opts.filename : ''), parcelId: g('parcelId') || null,
        address: addr, city: g('city') || null, state: (g('state') || (market ? market.state : '')).toUpperCase().slice(0, 2), zip: (g('zip') || '').slice(0, 5),
        ownerName: g('ownerName') || [g('ownerFirst'), g('ownerLast')].filter(Boolean).join(' ') || null,
        mailingAddress: [g('mailingAddress'), g('mailingCity'), g('mailingState')].filter(Boolean).join(', ') || null,
        beds: money(g('beds')), baths: money(g('baths')), sqft: money(g('sqft')), buildingSf: money(g('buildingSf')), units: money(g('units')),
        lotAcres: money(g('lotAcres')), yearBuilt: money(g('yearBuilt')), zoning: g('zoning') || null,
        assessedValue: money(g('assessedValue')), estValue: money(g('estValue')), loanBalanceEst: money(g('loanBalanceEst')),
        lastSaleDate: dateOf(g('lastSaleDate')), lastSalePrice: money(g('lastSalePrice')), estRent: money(g('estRent')),
        taxDelinquentAmount: money(g('taxDelinquentAmount')), leaseExpiry: dateOf(g('leaseExpiry')), loanMaturity: dateOf(g('loanMaturity')),
        phone: g('phone') || null, email: g('email') || null
      };
      var eq = g('equityPct'); if (eq) { var e = money(eq); rec.equityPct = e === null ? null : e > 1 ? e / 100 : e; }
      var oc = g('occupancyPct'); if (oc) { var o = money(oc); rec.occupancyPct = o === null ? null : o > 1 ? o / 100 : o; }
      rec.assetType = typeOf(g('assetType'), rec);
      if (!rec.estValue && rec.assessedValue) rec.estValue = rec.assessedValue;
      if (rec.taxDelinquentAmount) rec.taxDelinquent = true;
      if (g('vacant')) rec.vacant = yes(g('vacant'));
      if (g('ownerOccupied')) rec.ownerOccupied = yes(g('ownerOccupied'));
      var st = g('listingStatus').toLowerCase();
      if (/expired/.test(st)) rec.listingStatus = 'expired'; else if (/withdrawn|cancel/.test(st)) rec.listingStatus = 'withdrawn'; else if (/active/.test(st)) rec.listingStatus = 'active'; else if (/pending|contract/.test(st)) rec.listingStatus = 'pending';
      if (rec.mailingAddress && rec.ownerOccupied === undefined) {
        var a1 = rec.address.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10), m1 = rec.mailingAddress.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
        rec.absentee = a1 !== m1;
        var ms = (g('mailingState') || (rec.mailingAddress.match(/,\s*([A-Z]{2})\b/) || [])[1] || '').toUpperCase();
        rec.outOfState = rec.absentee && !!ms && !!rec.state && ms !== rec.state;
      } else if (rec.ownerOccupied !== undefined) rec.absentee = !rec.ownerOccupied;
      if (/estate of|heirs|deceased|\bdec\b|\best\b/i.test(rec.ownerName || '')) { rec.ownerType = 'Estate'; rec.probate = true; }
      else if (/llc|inc|corp|lp\b|ltd|company|holdings|properties/i.test(rec.ownerName || '')) rec.ownerType = 'LLC';
      else if (/trust|trustee|\btr\b/i.test(rec.ownerName || '')) rec.ownerType = 'Trust';
      else rec.ownerType = 'Individual';
      Object.keys(list.apply).forEach(function (k) { rec[k] = list.apply[k]; });
      var loc = PMarkets.findByZip(rec.zip) || PMarkets.findByCity(rec.city, rec.state);
      if (loc) { rec.market = loc.market.id; rec.locality = loc.locality.id; rec.localityName = loc.locality.name; if (!rec.city) rec.city = loc.locality.name.split(' (')[0]; }
      else if (market) rec.market = market.id;
      out.push(rec);
    }
    return { records: out, mapping: map, headers: headers, skipped: skipped };
  }

  function toCsv(rows, cols) {
    function esc(v) { v = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    return [cols.map(function (c) { return esc(c.label); }).join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return esc(c.get(r)); }).join(','); })).join('\n');
  }

  return { parse: parse, mapHeaders: mapHeaders, toRecords: toRecords, toCsv: toCsv, LIST_TYPES: LIST_TYPES, SYN: SYN };
});
