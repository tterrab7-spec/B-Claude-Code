import { describe, expect, it } from 'vitest';
import { assembleParcels, resolveAddress } from '../src/index.js';
import { fetchFromFixture, loadFixture } from './helpers.js';

const now = () => new Date('2026-10-29T21:00:00Z');

describe('assembleParcels', () => {
  it('adds distinct parcels, dedupes repeated tax parcels and takes the worst flood zone', async () => {
    const h = loadFixture('hampton-22-lincoln'), v = loadFixture('vb-courthouse');
    const a = await resolveAddress(h.address, { fetch: fetchFromFixture(h), now });
    const b = await resolveAddress(v.address, { fetch: fetchFromFixture(v), now });
    const site = assembleParcels([a, b, a]);
    expect(site.distinctParcelIds).toHaveLength(2);
    expect(site.duplicateAddresses).toEqual([h.address]);
    expect(site.lotSizeSf).toBe((a.parcel.lotSizeSf ?? 0) + (b.parcel.lotSizeSf ?? 0));
    expect(site.floodZone).toBe('AE');
    expect(site.underwritingInput.lotSizeSf).toBe(site.lotSizeSf);
    expect(site.underwritingInput.address).toContain('+');
    expect(site.warnings[0]).toMatch(/already counted/);
  });
});
