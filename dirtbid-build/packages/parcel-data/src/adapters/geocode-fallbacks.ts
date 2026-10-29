import type { GeocodeResult } from '../types.js';
import { qs } from '../http.js';

const STATE_FIPS: Record<string, string> = { AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56' };
const STATE_NAMES: Record<string, string> = { virginia: 'VA', california: 'CA', 'north carolina': 'NC', maryland: 'MD', texas: 'TX', florida: 'FL', washington: 'WA', georgia: 'GA', tennessee: 'TN', 'south carolina': 'SC', pennsylvania: 'PA', 'new york': 'NY', 'new jersey': 'NJ', ohio: 'OH', 'district of columbia': 'DC', 'west virginia': 'WV', kentucky: 'KY', delaware: 'DE' };
export const stateFipsFrom = (s: string | undefined): string | undefined => {
  if (!s) return undefined;
  const up = s.trim().toUpperCase();
  if (STATE_FIPS[up]) return STATE_FIPS[up];
  const ab = STATE_NAMES[s.trim().toLowerCase()];
  return ab ? STATE_FIPS[ab] : undefined;
};

/** Esri World Geocoder: answers browser requests, no key needed for non-stored lookups. */
export const ARCGIS_GEOCODE_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';
interface ArcResp { candidates?: { address: string; location: { x: number; y: number }; score: number; attributes?: { Region?: string; RegionAbbr?: string; Subregion?: string; City?: string; Postal?: string; Addr_type?: string } }[] }

export async function geocodeArcgis(address: string, getJson: <T>(s: string, u: string) => Promise<T>, now: Date): Promise<GeocodeResult | null> {
  const url = `${ARCGIS_GEOCODE_URL}?${qs({ f: 'json', singleLine: address, maxLocations: 1, countryCode: 'USA', outFields: 'Region,RegionAbbr,Subregion,City,Postal,Addr_type' })}`;
  const d = await getJson<ArcResp>('arcgis_geocoder', url);
  const c = d.candidates?.[0];
  if (!c || c.score < 80) return null;
  const a = c.attributes ?? {};
  return {
    matchedAddress: c.address,
    location: { lon: c.location.x, lat: c.location.y },
    stateFips: stateFipsFrom(a.RegionAbbr ?? a.Region),
    countyName: a.Subregion,
    placeName: a.City,
    zip: a.Postal ?? address.match(/\b(\d{5})\b(?!.*\b\d{5}\b)/)?.[1],
    provenance: { source: 'arcgis_geocoder', confidence: a.Addr_type === 'PointAddress' || a.Addr_type === 'Subaddress' ? 'high' : 'medium', fetchedAt: now.toISOString(), url, note: `Esri match score ${c.score} (${a.Addr_type ?? 'unknown type'}); county FIPS comes from the parcel layer` },
  };
}

/** OpenStreetMap Nominatim: last resort, low volume only (their usage policy). */
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
interface NomResp { lat: string; lon: string; display_name: string; address?: { county?: string; city?: string; town?: string; state?: string; postcode?: string; 'ISO3166-2-lvl4'?: string } }

export async function geocodeNominatim(address: string, getJson: <T>(s: string, u: string) => Promise<T>, now: Date): Promise<GeocodeResult | null> {
  const url = `${NOMINATIM_URL}?${qs({ q: address, format: 'jsonv2', addressdetails: 1, countrycodes: 'us', limit: 1 })}`;
  const d = await getJson<NomResp[]>('nominatim', url);
  const r = d[0];
  if (!r) return null;
  const a = r.address ?? {};
  return {
    matchedAddress: r.display_name,
    location: { lon: Number(r.lon), lat: Number(r.lat) },
    stateFips: stateFipsFrom(a['ISO3166-2-lvl4']?.split('-')[1] ?? a.state),
    countyName: a.county ?? a.city,
    placeName: a.city ?? a.town,
    zip: a.postcode,
    provenance: { source: 'nominatim', confidence: 'medium', fetchedAt: now.toISOString(), url, note: 'OpenStreetMap match; county FIPS comes from the parcel layer' },
  };
}
