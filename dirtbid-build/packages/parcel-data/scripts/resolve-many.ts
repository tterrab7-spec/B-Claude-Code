import { writeFileSync } from 'node:fs';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
if (process.env.HTTPS_PROXY || process.env.https_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());
import { resolveAddress } from '../src/index.js';
const out: Record<string, unknown> = {};
for (const a of process.argv.slice(2)) {
  try {
    const r = await resolveAddress(a, { timeoutMs: 25000 });
    out[a] = r;
    console.log(JSON.stringify({ a, matched: r.geocode?.matchedAddress, pt: r.geocode?.location, fips: r.parcel.fips ?? r.geocode?.countyFips, county: r.geocode?.countyName, parcel: { found: r.parcel.found, id: r.parcel.parcelId, taxMap: r.parcel.taxMapId, sf: r.parcel.lotSizeSf, ac: r.parcel.acres, conf: r.parcel.provenance.confidence, note: r.parcel.provenance.note }, flood: [r.flood.zone, r.flood.staticBfeFt], wet: [r.wetlands.onParcel, r.wetlands.features.length], elev: [r.elevation.centerFt, r.elevation.slopePct], soils: [r.soils.mapUnit, r.soils.classification, r.soils.hydricLikely], region: r.region, warnings: r.warnings.length }));
  } catch (e) { console.log(JSON.stringify({ a, error: (e as Error).message })); }
}
writeFileSync(process.env.OUT ?? '/tmp/resolved.json', JSON.stringify(out, null, 1));
