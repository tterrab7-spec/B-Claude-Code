import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '../src/db/client.js';
import { normalizeAddress } from '../src/modules/parcels/service.js';
import { mergeUnderwritingInput } from '../src/modules/feasibility/routes.js';
import { auth, makeApp, uniq, userWithToken, type TestCtx } from './helpers.js';
import { fixtureFetch, loadFixture } from './parcel-fetch.js';

const fixture = loadFixture('hampton-23666');
let ctx: TestCtx;
let calls: string[];
beforeAll(async () => {
  const ff = fixtureFetch(fixture);
  calls = ff.calls;
  ctx = await makeApp({ parcelFetch: ff.fetch });
});
afterAll(async () => { await ctx.app.close(); });

describe('address-first flow', () => {
  it('resolves the Hampton fixture to a parcel with lot size, flood zone, market and provenance', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/parcels/resolve', payload: { address: fixture.address } });
    expect(r.statusCode).toBe(200);
    const { parcel, cached } = r.json();
    expect(cached).toBe(false);
    expect(parcel.geocode.countyFips).toBe('51650');
    expect(parcel.parcel.found).toBe(true);
    expect(parcel.parcel.lotSizeSf).toBeGreaterThan(10000);
    expect(parcel.parcel.lotSizeSf).toBeLessThan(14000);
    expect(parcel.flood.zone).toBe('X');
    expect(parcel.flood.provenance.source).toBe('fema_nfhl');
    expect(parcel.soils.classification).toBe('stable');
    expect(parcel.region.marketCode).toBe('HAMPTON_ROADS_VA');
    expect(parcel.utilities.water).toBe('unknown');
    expect(parcel.zoning.code).toBeUndefined();
    expect(parcel.warnings.some((w: string) => /zoning/i.test(w))).toBe(true);
    expect(parcel.underwritingInput).toMatchObject({ marketCode: 'HAMPTON_ROADS_VA', zip: '23666', projectType: 'vacant_land', zoningCode: '' });
    expect(parcel.underwritingInput.site.floodZone).toBe('X');
    const staff = await userWithToken(ctx.app, `${uniq('staff')}@dirtbid.local`, ['staff']);
    const ev = (await ctx.app.inject({ method: 'GET', url: '/v1/events?type=parcel.resolved', headers: auth(staff.token) })).json().items;
    expect(ev.length).toBe(1);
    expect(ev[0].data).toMatchObject({ fips: '51650', warningsCount: parcel.warnings.length });
    expect(ev[0].data.lotSizeSf).toBe(parcel.parcel.lotSizeSf);
  });

  it('serves the second call from the 24h cache without touching upstream services', async () => {
    const before = calls.length;
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/parcels/resolve', payload: { address: '  100 example ln,  hampton, va 23666 ' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().cached).toBe(true);
    expect(calls.length).toBe(before);
    const rows = await ctx.app.db.select().from(schema.parcelLookups).where(eq(schema.parcelLookups.normalizedAddress, normalizeAddress(fixture.address)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lon).toBeCloseTo(-76.39, 3);
    expect(rows[0]!.fips).toBe('51650');
  });

  it('returns 422 with the parcel when zoning is missing and no override is given', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/feasibility/from-address', payload: { address: fixture.address } });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.fields.zoningCode).toBe('Zoning not found for this locality; supply it');
    expect(r.json().parcel.parcel.lotSizeSf).toBeGreaterThan(0);
  });

  it('runs the engine from an address with a zoning override and stores the parcel on the run', async () => {
    const before = calls.length;
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/feasibility/from-address', payload: { address: fixture.address, overrides: { zoningCode: 'R-11', arvPerSf: 290, site: { utilities: { water: 'yes', sewer: 'yes', power: 'yes' } }, sitework: { treeCoverPct: 0.5 } } } });
    expect(r.statusCode).toBe(201);
    expect(calls.length).toBe(before); // cached parcel
    const body = r.json();
    expect(body.cached).toBe(true);
    expect(body.result.zoning.rule.code).toBe('R-10'); // R-11 alias
    expect(body.result.sitework).toBeTruthy();
    expect(body.result.sitework.total).toBeGreaterThan(0);
    expect(body.result.sitework.lines.some((l: any) => l.division === '31')).toBe(true);
    expect(Array.isArray(body.result.sitework.waterfall)).toBe(true);
    expect(body.result.sitework.riskScore).toBeGreaterThanOrEqual(0);
    expect(body.result.input.site.floodZone).toBe('X');          // from parcel
    expect(body.result.input.site.utilities.sewer).toBe('yes');  // merged override
    expect(body.result.input.site.soils).toBe('stable');          // parcel field survives the merge
    expect(body.result.input.sitework.treeCoverPct).toBe(0.5);
    expect(body.result.input.sitework.regionMultiplier).toBe(body.parcel.region.multiplier);
    expect(body.report.tier).toBe('lite');
    const get = await ctx.app.inject({ method: 'GET', url: `/v1/feasibility/runs/${body.runId}?access=${body.accessToken}` });
    expect(get.statusCode).toBe(200);
    expect(get.json().run.source).toBe('address');
    expect(get.json().run.resolvedParcel.parcel.parcelId).toBe('13001234');
    expect(get.json().run.sitework.total).toBe(body.result.sitework.total);
    const manual = await ctx.app.inject({ method: 'POST', url: '/v1/feasibility/runs', payload: { input: body.result.input } });
    expect(manual.statusCode).toBe(201);
    expect(manual.json().source).toBe('manual');
    expect(manual.json().result.sitework).toBeTruthy();
  });

  it('returns 422 on the address when geocoding finds nothing', async () => {
    const ff = fixtureFetch(fixture, { 'GET https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress': { status: 200, body: { result: { addressMatches: [] } } } });
    const other = await makeApp({ parcelFetch: ff.fetch });
    try {
      const r = await other.app.inject({ method: 'POST', url: '/v1/parcels/resolve', payload: { address: '1 Nowhere Rd, Atlantis, VA 00000' } });
      expect(r.statusCode).toBe(422);
      expect(r.json().error.code).toBe('validation');
      expect(r.json().error.fields.address).toMatch(/could not locate/i);
      const fa = await other.app.inject({ method: 'POST', url: '/v1/feasibility/from-address', payload: { address: '1 Nowhere Rd, Atlantis, VA 00000', overrides: { zoningCode: 'R-10' } } });
      expect(fa.statusCode).toBe(422);
      expect(fa.json().error.fields.address).toBeTruthy();
    } finally { await other.app.close(); }
  });

  it('validates input shape', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/parcels/resolve', payload: { address: '12' } });
    expect(r.statusCode).toBe(400);
  });
});

describe('mergeUnderwritingInput', () => {
  it('lets overrides win and merges site / sitework per key', () => {
    const base = { marketCode: 'X', zoningCode: '', site: { floodZone: 'AE', soils: 'poor', utilities: { water: 'unknown', sewer: 'unknown' } }, sitework: { regionMultiplier: 0.98, hydric: true } };
    const out = mergeUnderwritingInput(base, { zoningCode: 'R-5', site: { floodZone: 'X', utilities: { sewer: 'yes' } }, sitework: { treeCoverPct: 0.3 }, comps: [{ salePrice: 1, livingSf: 1 }] });
    expect(out).toEqual({ marketCode: 'X', zoningCode: 'R-5', site: { floodZone: 'X', soils: 'poor', utilities: { water: 'unknown', sewer: 'yes' } }, sitework: { regionMultiplier: 0.98, hydric: true, treeCoverPct: 0.3 }, comps: [{ salePrice: 1, livingSf: 1 }] });
    expect(mergeUnderwritingInput(base, undefined)).toEqual(base);
  });
});
