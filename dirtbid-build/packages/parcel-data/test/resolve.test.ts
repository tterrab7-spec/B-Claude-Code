import { describe, expect, it } from 'vitest';
import { resolveAddress, marketForFips, UpstreamError } from '../src/index.js';
import { fetchFromFixture, loadFixture, failingFetch } from './helpers.js';

const now = () => new Date('2026-10-29T21:00:00Z');

describe('resolveAddress (recorded fixtures)', () => {
  it('Hampton city hall: parcel, AE flood zone with BFE, hydric urban soils, Hampton Roads market', async () => {
    const fx = loadFixture('hampton-22-lincoln');
    const f = fetchFromFixture(fx);
    const r = await resolveAddress(fx.address, { fetch: f, now });
    expect(r.geocode?.matchedAddress).toBe('22 LINCOLN ST, HAMPTON, VA, 23669');
    expect(r.geocode?.countyFips).toBe('51650');
    expect(r.parcel.found).toBe(true);
    expect(r.parcel.lotSizeSf).toBeGreaterThan(25000);
    expect(r.parcel.lotSizeSf).toBeLessThan(40000);
    expect(r.parcel.polygon!.length).toBeGreaterThan(3);
    expect(r.flood.zone).toBe('AE');
    expect(r.flood.sfha).toBe(true);
    expect(r.flood.staticBfeFt).toBe(7);
    expect(r.soils.mapUnit).toBe('Urban land');
    expect(r.soils.provenance.confidence).toBe('low');
    expect(r.region).toEqual({ marketCode: 'HAMPTON_ROADS_VA', dirtbidRegion: 'VA_HR', multiplier: 0.98 });
    expect(r.zoning.code).toBeUndefined();
    expect(r.warnings.some((w) => /Zoning district/.test(w))).toBe(true);
    expect(r.underwritingInput.marketCode).toBe('HAMPTON_ROADS_VA');
    expect(r.underwritingInput.lotSizeSf).toBe(r.parcel.lotSizeSf);
    expect(r.underwritingInput.site?.floodZone).toBe('AE');
    expect(r.underwritingInput.sitework?.regionMultiplier).toBe(0.98);
    expect(r.elevation.centerFt).toBeGreaterThan(5);
    expect(r.elevation.centerFt).toBeLessThan(8);
    expect(f.calls.length).toBeGreaterThanOrEqual(8);
  });

  it('Virginia Beach: zone X, no on-parcel wetlands, soils unknown when Urban land masks them', async () => {
    const fx = loadFixture('vb-courthouse');
    const r = await resolveAddress(fx.address, { fetch: fetchFromFixture(fx), now });
    expect(r.parcel.fips).toBe('51810');
    expect(r.flood.zone).toBe('X');
    expect(r.flood.sfha).toBe(false);
    expect(r.wetlands.onParcel).toBe(false);
    expect(r.wetlands.features.length).toBeGreaterThan(0);
    expect(r.soils.classification).toBe('unknown');
    expect(r.soils.hydricLikely).toBe(false);
    expect(r.rpa.likely).toBe('unknown');
  });

  it('Suffolk: well-drained SSURGO soils classify as stable with medium confidence', async () => {
    const fx = loadFixture('suffolk-godwin');
    const r = await resolveAddress(fx.address, { fetch: fetchFromFixture(fx), now });
    expect(r.soils.classification).toBe('stable');
    expect(r.soils.provenance.confidence).toBe('medium');
    expect(r.soils.components[0]!.name).toBe('Kenansville');
    expect(r.underwritingInput.site?.soils).toBe('stable');
    expect(r.warnings.some((w) => /Soil Report/.test(w))).toBe(false);
  });

  it('degrades to unknowns with warnings when secondary services fail', async () => {
    const fx = loadFixture('hampton-22-lincoln');
    const geocodeKey = Object.keys(fx.recorded).find((k) => k.includes('geocoding.geo.census.gov'))!;
    const onlyGeocode = { address: fx.address, recorded: { [geocodeKey]: fx.recorded[geocodeKey]! } };
    const r = await resolveAddress(fx.address, { fetch: fetchFromFixture(onlyGeocode), now });
    expect(r.geocode).not.toBeNull();
    expect(r.parcel.found).toBe(false);
    expect(r.flood.zone).toBeUndefined();
    expect(r.soils.classification).toBe('unknown');
    expect(r.underwritingInput.lotSizeSf).toBe(0);
    expect(r.warnings.length).toBeGreaterThanOrEqual(4);
  });

  it('throws UpstreamError when the address cannot be geocoded', async () => {
    const fx = loadFixture('hampton-22-lincoln');
    const geocodeKey = Object.keys(fx.recorded).find((k) => k.includes('geocoding.geo.census.gov'))!;
    const miss = fetchFromFixture(fx, { [geocodeKey]: { status: 200, body: JSON.stringify({ result: { addressMatches: [] } }) } });
    await expect(resolveAddress(fx.address, { fetch: miss, now })).rejects.toBeInstanceOf(UpstreamError);
    await expect(resolveAddress('nowhere', { fetch: failingFetch, now })).rejects.toThrow(/could not be geocoded/);
  });
});

describe('countyFipsFromName', () => {
  it('normalizes locality spellings', async () => {
    const { countyFipsFromName } = await import('../src/index.js');
    expect(countyFipsFromName('City of Suffolk', '51')).toBe('51800');
    expect(countyFipsFromName('Suffolk City', '51')).toBe('51800');
    expect(countyFipsFromName('York County', '51')).toBe('51199');
    expect(countyFipsFromName('Los Angeles County', '06')).toBe('06037');
    expect(countyFipsFromName('Hampton', '06')).toBeUndefined();
    expect(countyFipsFromName('Nowhere', '51')).toBeUndefined();
  });
});

describe('marketForFips', () => {
  it('maps Hampton Roads, LA County, other Virginia and elsewhere', () => {
    expect(marketForFips('51650', '51').marketCode).toBe('HAMPTON_ROADS_VA');
    expect(marketForFips('51810', '51').dirtbidRegion).toBe('VA_HR');
    expect(marketForFips('06037', '06').marketCode).toBe('ALTADENA_CA');
    expect(marketForFips('51059', '51')).toEqual({ marketCode: 'GENERIC_US', dirtbidRegion: 'VA_NOVA', multiplier: 1.18 });
    expect(marketForFips('51760', '51').dirtbidRegion).toBe('VA_RIC');
    expect(marketForFips('37183', '37')).toEqual({ marketCode: 'GENERIC_US', dirtbidRegion: null, multiplier: 1 });
  });
});

describe('geocoder fallbacks', () => {
  it('falls through to the Esri geocoder when Census is blocked, and still finds the parcel', async () => {
    const fx = loadFixture('suffolk-godwin');
    const fb = loadFixture('geocode-fallbacks');
    const merged = { address: fx.address, recorded: { ...fx.recorded, ...fb.recorded } };
    const censusKey = Object.keys(fx.recorded).find((k) => k.includes('geocoding.geo.census.gov'))!;
    delete merged.recorded[censusKey];
    const f = fetchFromFixture(merged);
    const r = await resolveAddress(fx.address, { fetch: f, now });
    expect(r.geocode?.provenance.source).toBe('arcgis_geocoder');
    expect(r.geocode?.stateFips).toBe('51');
    expect(r.geocode?.countyName).toBe('City of Suffolk');
    // The Esri point differs from the Census point, so the recorded parcel query misses; the county name still lands the market.
    expect(r.region.marketCode).toBe('HAMPTON_ROADS_VA');
    expect(r.warnings.some((w) => /Census geocoder unavailable/.test(w))).toBe(true);
  });

  it('uses Nominatim when both Census and Esri fail', async () => {
    const fx = loadFixture('suffolk-godwin');
    const fb = loadFixture('geocode-fallbacks');
    const nomKey = Object.keys(fb.recorded).find((k) => k.includes('nominatim'))!;
    const merged = { address: fx.address, recorded: { ...fx.recorded, [nomKey]: fb.recorded[nomKey]! } };
    delete merged.recorded[Object.keys(fx.recorded).find((k) => k.includes('geocoding.geo.census.gov'))!];
    const r = await resolveAddress(fx.address, { fetch: fetchFromFixture(merged), now });
    expect(r.geocode?.provenance.source).toBe('nominatim');
    expect(r.geocode?.stateFips).toBe('51');
    expect(r.region.marketCode).toBe('HAMPTON_ROADS_VA');
  });
});
