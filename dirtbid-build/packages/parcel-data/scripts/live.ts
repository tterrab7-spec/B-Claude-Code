/* Run the resolver against live public services and underwrite the result.
   usage: pnpm --filter @dirtbid/parcel-data live "123 Main St, Hampton, VA 23669" [--record test/fixtures/name.json] */
import { writeFileSync } from 'node:fs';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
// Node's fetch ignores HTTPS_PROXY; honor it when present (also set NODE_EXTRA_CA_CERTS for a corporate proxy CA).
if (process.env.HTTPS_PROXY || process.env.https_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());
import { resolveAddress } from '../src/index.js';
import { underwrite } from '@dirtbid/underwriting';

const args = process.argv.slice(2);
const address = args.find((a) => !a.startsWith('--')) ?? '22 Lincoln St, Hampton, VA 23669';
const recordIdx = args.indexOf('--record');
const recordPath = recordIdx >= 0 ? args[recordIdx + 1] : undefined;
const recorded: Record<string, unknown> = {};

const recordingFetch = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => {
  const res = await fetch(url, init as RequestInit);
  const text = await res.text();
  if (recordPath) recorded[(init?.method ?? 'GET') + ' ' + url + (init?.body ? ' ' + init.body : '')] = { status: res.status, body: text };
  return { ok: res.ok, status: res.status, text: async () => text, json: async () => JSON.parse(text) };
};

const r = await resolveAddress(address, { fetch: recordingFetch });
console.log(JSON.stringify({
  matched: r.geocode?.matchedAddress, county: r.geocode?.countyName, fips: r.parcel.fips ?? r.geocode?.countyFips,
  parcel: { found: r.parcel.found, id: r.parcel.parcelId, lotSizeSf: r.parcel.lotSizeSf, acres: r.parcel.acres, conf: r.parcel.provenance.confidence },
  zoning: r.zoning.code ?? null, flood: r.flood.zone, bfe: r.flood.staticBfeFt,
  wetlands: { onParcel: r.wetlands.onParcel, n: r.wetlands.features.length, tidal: r.wetlands.tidalOrEstuarine },
  elevationFt: r.elevation.centerFt, slopePct: r.elevation.slopePct,
  soils: { mapUnit: r.soils.mapUnit, class: r.soils.classification, hydric: r.soils.hydricLikely, top: r.soils.components.slice(0, 2) },
  region: r.region, rpa: r.rpa.likely, warnings: r.warnings, ms: r.durationMs,
}, null, 2));
if (r.underwritingInput.lotSizeSf > 0) {
  const u = underwrite({ ...r.underwritingInput, zoningCode: r.underwritingInput.zoningCode || 'R-10', arvPerSf: undefined });
  const s = u.scenarios.find((x) => x.id === u.recommended.scenarioId)!;
  console.log('UNDERWRITE', JSON.stringify({ scenario: s.name, maxOffer: s.maxOffer, arv: s.arv, sitePrep: s.costs.sitePrep, total: s.costs.total, roi: s.roi, scores: u.scores, siteworkRisk: u.sitework?.riskLabel, siteworkTotal: u.sitework?.total }, null, 2));
}
if (recordPath) { writeFileSync(recordPath, JSON.stringify({ address, recorded }, null, 2)); console.log('recorded', Object.keys(recorded).length, 'requests to', recordPath); }
