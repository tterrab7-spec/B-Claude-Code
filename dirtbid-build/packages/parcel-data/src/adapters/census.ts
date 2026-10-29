import type { GeocodeResult, Provenance } from '../types.js';
import { qs } from '../http.js';

export const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

interface CensusResp { result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number }; addressComponents?: { zip?: string }; geographies?: Record<string, { NAME?: string; GEOID?: string; STATE?: string; COUNTY?: string }[]> }[] } }

export async function geocode(address: string, getJson: <T>(s: string, u: string) => Promise<T>, now: Date): Promise<GeocodeResult | null> {
  const url = `${CENSUS_URL}?${qs({ address, benchmark: 'Public_AR_Current', vintage: 'Current_Current', format: 'json' })}`;
  const d = await getJson<CensusResp>('census_geocoder', url);
  const m = d.result?.addressMatches?.[0];
  if (!m) return null;
  const g = m.geographies ?? {};
  const county = g['Counties']?.[0];
  const place = g['Incorporated Places']?.[0];
  const tract = g['Census Tracts']?.[0];
  const prov: Provenance = { source: 'census_geocoder', confidence: 'high', fetchedAt: now.toISOString(), url };
  return {
    matchedAddress: m.matchedAddress,
    location: { lon: m.coordinates.x, lat: m.coordinates.y },
    stateFips: county?.STATE,
    countyFips: county?.GEOID,
    countyName: county?.NAME,
    placeName: place?.NAME,
    tract: tract?.GEOID,
    zip: m.addressComponents?.zip ?? m.matchedAddress.match(/\b(\d{5})\b(?!.*\b\d{5}\b)/)?.[1],
    provenance: prov,
  };
}
