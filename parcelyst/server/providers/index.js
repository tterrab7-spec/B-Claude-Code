'use strict';
/*
 * Data provider adapters. Each one is optional and turns on when its API key is present.
 * Every adapter returns records in Parcelyst's normalized property shape (see public/js/shared/seed.js).
 *
 *   RENTCAST_API_KEY  property records, owner, tax history, value + rent AVMs, sale listings (residential, nationwide)
 *   ATTOM_API_KEY     expanded profile incl. absentee status, assessed/market value (residential + commercial)
 *   REGRID_TOKEN      parcel geometry fields: acreage, zoning, land use, owner + mailing (land + commercial)
 *   FRED_API_KEY      Freddie Mac PMMS, Treasury yields, FHFA HPI
 *   (no key)          U.S. Census geocoder for address normalization
 *
 * Responses are cached in SQLite to control per-call data costs.
 */
const { one, run } = require('../db');

const TIMEOUT = 12000;

function cacheGet(key) {
  const row = one('SELECT value, expires_at FROM cache WHERE key = ?', key);
  if (!row) return null;
  if (row.expires_at < Date.now()) { run('DELETE FROM cache WHERE key = ?', key); return null; }
  return JSON.parse(row.value);
}
function cacheSet(key, value, ttlSec) {
  run('INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)', key, JSON.stringify(value), Date.now() + ttlSec * 1000);
}
async function getJson(url, headers, cacheKey, ttlSec) {
  if (cacheKey) { const c = cacheGet(cacheKey); if (c) return c; }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: Object.assign({ Accept: 'application/json' }, headers || {}), signal: ctl.signal });
    if (!res.ok) { const body = await res.text().catch(() => ''); const e = new Error(`HTTP ${res.status} from ${new URL(url).host}: ${body.slice(0, 200)}`); e.status = res.status; throw e; }
    const json = await res.json();
    if (cacheKey) cacheSet(cacheKey, json, ttlSec || 86400);
    return json;
  } finally { clearTimeout(t); }
}

const enabled = () => ({
  rentcast: !!process.env.RENTCAST_API_KEY,
  attom: !!process.env.ATTOM_API_KEY,
  regrid: !!process.env.REGRID_TOKEN,
  fred: !!process.env.FRED_API_KEY
});

// ---------------- Census geocoder ----------------
async function geocode(address) {
  const url = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(address);
  const j = await getJson(url, null, 'geo:' + address.toLowerCase(), 30 * 86400);
  const m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
  if (!m) return null;
  const c = m.addressComponents || {};
  return {
    matchedAddress: m.matchedAddress,
    address: [c.fromAddress, c.preDirection, c.streetName, c.suffixType, c.suffixDirection].filter(Boolean).join(' '),
    city: c.city, state: c.state, zip: c.zip, lat: m.coordinates && m.coordinates.y, lng: m.coordinates && m.coordinates.x
  };
}

// ---------------- RentCast ----------------
const RC = 'https://api.rentcast.io/v1';
const RC_TYPE = { 'Single Family': 'SFR', Condo: 'Condo', Townhouse: 'Townhouse', 'Multi-Family': '2-4 Unit', Apartment: 'Multifamily 5+', Land: 'Land', Manufactured: 'SFR' };
const RC_TYPE_REV = { SFR: 'Single Family', Condo: 'Condo', Townhouse: 'Townhouse', '2-4 Unit': 'Multi-Family', 'Multifamily 5+': 'Apartment', Land: 'Land' };
function rcHeaders() { return { 'X-Api-Key': process.env.RENTCAST_API_KEY }; }
function latest(obj) { if (!obj) return null; const ks = Object.keys(obj).sort(); return ks.length ? obj[ks[ks.length - 1]] : null; }
function fromRentcast(p) {
  const ta = latest(p.taxAssessments), pt = latest(p.propertyTaxes);
  const owner = p.owner || {};
  const mail = owner.mailingAddress || {};
  const absentee = p.ownerOccupied === false;
  return {
    id: 'rc-' + (p.id || p.formattedAddress).toString().replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    source: 'rentcast', address: p.addressLine1 || p.formattedAddress, city: p.city, state: p.state, zip: p.zipCode,
    lat: p.latitude, lng: p.longitude, county: p.county,
    assetType: RC_TYPE[p.propertyType] || 'SFR', beds: p.bedrooms, baths: p.bathrooms, sqft: p.squareFootage,
    lotAcres: p.lotSize ? Math.round(p.lotSize / 43560 * 100) / 100 : null, yearBuilt: p.yearBuilt,
    assessedValue: ta ? ta.value : null, taxAnnual: pt ? pt.total : null,
    lastSaleDate: p.lastSaleDate ? p.lastSaleDate.slice(0, 10) : null, lastSalePrice: p.lastSalePrice || null,
    ownerName: (owner.names || []).join(' & ') || null, ownerType: owner.type === 'Organization' ? 'LLC' : 'Individual',
    absentee: absentee, outOfState: absentee && mail.state && p.state ? mail.state !== p.state : false,
    ownerOccupied: p.ownerOccupied === true, mailingAddress: mail.formattedAddress || null,
    hoaMonthly: p.hoa && p.hoa.fee ? p.hoa.fee : 0, zoning: p.zoning || null
  };
}
async function rentcastLookup(address) {
  const q = encodeURIComponent(address);
  const props = await getJson(`${RC}/properties?address=${q}`, rcHeaders(), 'rc:p:' + address.toLowerCase(), 30 * 86400);
  const p = Array.isArray(props) ? props[0] : props;
  if (!p) return null;
  const rec = fromRentcast(p);
  const typeQ = RC_TYPE_REV[rec.assetType] ? '&propertyType=' + encodeURIComponent(RC_TYPE_REV[rec.assetType]) : '';
  const extra = (rec.beds ? '&bedrooms=' + rec.beds : '') + (rec.baths ? '&bathrooms=' + rec.baths : '') + (rec.sqft ? '&squareFootage=' + rec.sqft : '');
  const [val, rent] = await Promise.allSettled([
    getJson(`${RC}/avm/value?address=${q}${typeQ}${extra}`, rcHeaders(), 'rc:v:' + address.toLowerCase(), 14 * 86400),
    getJson(`${RC}/avm/rent/long-term?address=${q}${typeQ}${extra}`, rcHeaders(), 'rc:r:' + address.toLowerCase(), 14 * 86400)
  ]);
  if (val.status === 'fulfilled' && val.value) { rec.estValue = val.value.price; rec.valueRange = [val.value.priceRangeLow, val.value.priceRangeHigh]; rec.valueComps = (val.value.comparables || []).slice(0, 8).map(compOf); }
  if (rent.status === 'fulfilled' && rent.value) { rec.estRent = rent.value.rent; rec.rentRange = [rent.value.rentRangeLow, rent.value.rentRangeHigh]; rec.rentComps = (rent.value.comparables || []).slice(0, 8).map(compOf); rec.rentSource = 'RentCast rent AVM'; }
  return rec;
}
function compOf(c) { return { address: c.formattedAddress, price: c.price, beds: c.bedrooms, baths: c.bathrooms, sqft: c.squareFootage, distance: c.distance, daysOld: c.daysOld, correlation: c.correlation }; }
async function rentcastArea(city, state, opts) {
  opts = opts || {};
  const limit = Math.min(500, opts.limit || 500);
  const url = `${RC}/properties?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&limit=${limit}&offset=${opts.offset || 0}` + (opts.propertyType ? '&propertyType=' + encodeURIComponent(opts.propertyType) : '');
  const rows = await getJson(url, rcHeaders(), 'rc:area:' + url, 7 * 86400);
  return (rows || []).map(fromRentcast);
}
async function rentcastListings(city, state, status) {
  const url = `${RC}/listings/sale?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&status=${status || 'Active'}&limit=500`;
  const rows = await getJson(url, rcHeaders(), 'rc:list:' + url, 86400);
  return (rows || []).map((l) => ({ address: l.addressLine1, zip: l.zipCode, listPrice: l.price, listingStatus: String(l.status || '').toLowerCase() === 'active' ? 'active' : 'withdrawn', daysOnMarket: l.daysOnMarket, listedDate: l.listedDate, removedDate: l.removedDate }));
}

// ---------------- ATTOM ----------------
async function attomLookup(address) {
  const parts = address.split(',');
  const a1 = parts.shift().trim(), a2 = parts.join(',').trim();
  const url = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/expandedprofile?address1=' + encodeURIComponent(a1) + '&address2=' + encodeURIComponent(a2);
  const j = await getJson(url, { apikey: process.env.ATTOM_API_KEY }, 'attom:' + address.toLowerCase(), 30 * 86400);
  const p = j && j.property && j.property[0];
  if (!p) return null;
  const as = p.assessment || {}, ow = as.owner || {}, b = p.building || {}, s = p.sale || {};
  return {
    id: 'at-' + (p.identifier && p.identifier.attomId || a1).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-'), source: 'attom',
    address: p.address && p.address.line1, city: p.address && p.address.locality, state: p.address && p.address.countrySubd, zip: p.address && p.address.postal1,
    assetType: /COMMERCIAL|RETAIL|OFFICE/i.test(p.summary && p.summary.propclass || '') ? 'Retail' : /INDUSTRIAL|WAREHOUSE/i.test(p.summary && p.summary.propclass || '') ? 'Industrial' : /APARTMENT/i.test(p.summary && p.summary.proptype || '') ? 'Multifamily 5+' : /VACANT|LAND/i.test(p.summary && p.summary.propclass || '') ? 'Land' : 'SFR',
    beds: b.rooms && b.rooms.beds, baths: b.rooms && b.rooms.bathstotal, sqft: b.size && (b.size.livingsize || b.size.universalsize), buildingSf: b.size && b.size.bldgsize,
    yearBuilt: p.summary && p.summary.yearbuilt, lotAcres: p.lot && p.lot.lotsize1,
    assessedValue: as.assessed && as.assessed.assdttlvalue, estValue: as.market && as.market.mktttlvalue, taxAnnual: as.tax && as.tax.taxamt,
    ownerName: ow.owner1 && ow.owner1.fullname, absentee: /ABSENTEE/i.test(ow.absenteeownerstatus || ''), mailingAddress: ow.mailingaddressoneline,
    lastSaleDate: s.saleTransDate || (s.amount && s.amount.salerecdate), lastSalePrice: s.amount && s.amount.saleamt, zoning: p.lot && p.lot.zoningType
  };
}

// ---------------- Regrid ----------------
async function regridLookup(address) {
  const url = 'https://app.regrid.com/api/v2/parcels/address?limit=1&query=' + encodeURIComponent(address) + '&token=' + encodeURIComponent(process.env.REGRID_TOKEN);
  const j = await getJson(url, null, 'regrid:' + address.toLowerCase(), 60 * 86400);
  const feats = (j && j.parcels && j.parcels.features) || (j && j.features) || [];
  const f = feats[0] && feats[0].properties && feats[0].properties.fields;
  if (!f) return null;
  return {
    id: 'rg-' + (f.ll_uuid || f.parcelnumb || address).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-'), source: 'regrid',
    address: f.address, city: f.scity || f.city, state: f.state2, zip: f.szip5 || f.szip,
    lotAcres: f.ll_gisacre || f.gisacre, zoning: f.zoning, landUse: f.usedesc, yearBuilt: f.yearbuilt || null,
    ownerName: f.owner, mailingAddress: [f.mailadd, f.mail_city, f.mail_state2, f.mail_zip].filter(Boolean).join(', '),
    absentee: !!(f.mailadd && f.address && f.mailadd.toLowerCase() !== f.address.toLowerCase()),
    outOfState: !!(f.mail_state2 && f.state2 && f.mail_state2 !== f.state2),
    assessedValue: f.parval || null, landValue: f.landval || null, lastSaleDate: f.saledate || null, lastSalePrice: f.saleprice || null,
    assetType: /VACANT|AGRIC|FARM|TIMBER|LAND/i.test(f.usedesc || '') ? 'Land' : null
  };
}

// ---------------- FRED (rates) ----------------
async function fredLatest(series) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${process.env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=8`;
  const j = await getJson(url, null, 'fred:' + series, 12 * 3600);
  const obs = (j.observations || []).find((o) => o.value !== '.');
  return obs ? { value: parseFloat(obs.value), date: obs.date } : null;
}
async function liveRates(fallback) {
  const out = Object.assign({}, fallback), sources = {};
  if (!enabled().fred) return { rates: out, sources: { mortgage30: 'Freddie Mac PMMS reference ' + (fallback.mortgage30 * 100).toFixed(2) + '% (' + fallback.asOf + ')', treasury10y: '10-yr Treasury reference ' + (fallback.treasury10y * 100).toFixed(2) + '%' }, live: false };
  const map = { mortgage30: 'MORTGAGE30US', treasury5y: 'DGS5', treasury10y: 'DGS10' };
  await Promise.all(Object.keys(map).map(async (k) => {
    try { const o = await fredLatest(map[k]); if (o) { out[k] = o.value / 100; sources[k] = (k === 'mortgage30' ? 'Freddie Mac PMMS' : 'U.S. Treasury ' + (k === 'treasury5y' ? '5' : '10') + '-yr CMT') + ' via FRED, ' + o.date; } } catch (e) { sources[k] = 'reference (FRED error)'; }
  }));
  return { rates: out, sources, live: true };
}

// ---------------- composite lookup ----------------
async function lookup(address) {
  const tried = [], errors = [];
  const merged = {};
  const order = [['rentcast', rentcastLookup], ['attom', attomLookup], ['regrid', regridLookup]];
  for (const [name, fn] of order) {
    if (!enabled()[name]) continue;
    tried.push(name);
    try { const r = await fn(address); if (r) for (const k in r) if (r[k] !== null && r[k] !== undefined && merged[k] === undefined) merged[k] = r[k]; }
    catch (e) { errors.push(name + ': ' + e.message); }
  }
  if (!merged.address) {
    try { const g = await geocode(address); if (g) Object.assign(merged, { address: g.address || address.split(',')[0], city: g.city, state: g.state, zip: g.zip, lat: g.lat, lng: g.lng, source: merged.source || 'geocode' }); }
    catch (e) { errors.push('census: ' + e.message); }
  }
  return { record: merged.address ? merged : null, tried, errors };
}

module.exports = { enabled, lookup, geocode, rentcastLookup, rentcastArea, rentcastListings, attomLookup, regridLookup, liveRates, cacheGet, cacheSet };
