import type { UnderwritingInput, SiteworkInput, Tri } from '@dirtbid/underwriting';

export type Confidence = 'high' | 'medium' | 'low';

export interface Provenance {
  source: string;          // 'census_geocoder' | 'vgin_parcels' | 'fema_nfhl' | 'fws_nwi' | 'usgs_3dep' | 'usda_ssurgo' | 'arcgis_zoning' | 'regrid' | 'heuristic' | 'unavailable'
  confidence: Confidence;
  fetchedAt: string;
  url?: string;
  note?: string;
}

export interface LonLat { lon: number; lat: number }

export interface GeocodeResult {
  matchedAddress: string;
  location: LonLat;
  stateFips?: string;
  countyFips?: string;      // 5-digit
  countyName?: string;
  placeName?: string;
  tract?: string;
  zip?: string;
  provenance: Provenance;
}

export interface ParcelResult {
  found: boolean;
  parcelId?: string;
  taxMapId?: string;
  locality?: string;
  fips?: string;
  lotSizeSf?: number;
  acres?: number;
  polygon?: LonLat[];       // outer ring, lon/lat
  centroid?: LonLat;
  provenance: Provenance;
}

export interface FloodResult {
  zone?: string;            // X, AE, VE, A, AO, ...
  subtype?: string;
  sfha?: boolean;
  staticBfeFt?: number | null;
  provenance: Provenance;
}

export interface WetlandsResult {
  onParcel: boolean | 'unknown';
  nearbyWithinFt: number;
  features: { type: string; code: string; acres: number }[];
  estimatedAcresOnParcel: number;
  tidalOrEstuarine: boolean;
  provenance: Provenance;
}

export interface ElevationResult {
  centerFt?: number;
  slopePct?: number;
  samples: { lon: number; lat: number; ft: number }[];
  provenance: Provenance;
}

export interface SoilsResult {
  mapUnit?: string;
  components: { name: string; pct: number; drainageClass: string | null; hydric: string | null; slopePct: number | null }[];
  classification: 'stable' | 'marginal' | 'poor' | 'unknown';
  hydricLikely: boolean;
  provenance: Provenance;
}

export interface ZoningResult {
  code?: string;
  description?: string;
  provenance: Provenance;
}

export interface ResolvedParcel {
  query: string;
  geocode: GeocodeResult | null;
  parcel: ParcelResult;
  zoning: ZoningResult;
  flood: FloodResult;
  wetlands: WetlandsResult;
  elevation: ElevationResult;
  soils: SoilsResult;
  region: { dirtbidRegion: string | null; multiplier: number; marketCode: string };
  utilities: { water: Tri; sewer: Tri; power: Tri; provenance: Provenance };
  rpa: { likely: Tri; provenance: Provenance };
  underwritingInput: UnderwritingInput;
  siteworkInput: Partial<SiteworkInput>;
  warnings: string[];
  durationMs: number;
}

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;

export interface ResolveOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
  regridApiKey?: string;
  /** FIPS → ArcGIS layer with a zoning code field, for localities that publish one */
  zoningLayers?: Record<string, { url: string; codeField: string; descField?: string }>;
  now?: () => Date;
}
