import type { Provenance } from '@dirtbid/parcel-data';

const SOURCE_LABEL: Record<string, string> = { census_geocoder: 'Census geocoder', vgin_parcels: 'VGIN parcels', fema_nfhl: 'FEMA NFHL', fws_nwi: 'USFWS NWI', usgs_3dep: 'USGS 3DEP', usda_ssurgo: 'USDA SSURGO', arcgis_zoning: 'Locality GIS', regrid: 'Regrid', heuristic: 'Heuristic', unavailable: 'Unavailable', dirtbid: 'DirtBid' };
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s.replace(/_/g, ' ');

/** Small chip showing where a prefilled value came from and how much to trust it. */
export function ProvenanceChip({ p, needsInput, label }: { p?: Provenance | null; needsInput?: boolean; label?: string }) {
  if (needsInput) return <span className="ml-1 inline-flex items-center rounded-md bg-warn/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn" title={label ?? 'The resolver could not determine this. Enter it to improve the result.'}>needs your input</span>;
  if (!p) return null;
  const tone = p.confidence === 'high' ? 'bg-ok/15 text-ok' : p.confidence === 'medium' ? 'bg-blueprint/15 text-blueprint' : 'bg-warn/15 text-warn';
  return <span className={`ml-1 inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`} title={p.note ? `${sourceLabel(p.source)} · ${p.confidence}\n${p.note}` : `${sourceLabel(p.source)} · ${p.confidence}`}>{sourceLabel(p.source)} · {p.confidence}</span>;
}
