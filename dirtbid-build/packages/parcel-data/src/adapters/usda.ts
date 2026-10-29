import type { LonLat, SoilsResult } from '../types.js';
import { wktPoint } from '../geo.js';

/** USDA NRCS Soil Data Access (SSURGO). */
export const SDA_URL = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';

interface Resp { Table?: (string | null)[][] }

export async function soilsAt(pt: LonLat, getJson: <T>(s: string, u: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<T>, now: Date): Promise<SoilsResult> {
  const query = `SELECT TOP 6 mu.mukey, mu.muname, c.compname, c.comppct_r, c.drainagecl, c.hydricrating, c.slope_r FROM mapunit mu INNER JOIN component c ON c.mukey = mu.mukey WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wktPoint(pt)}')) ORDER BY c.comppct_r DESC`;
  const d = await getJson<Resp>('usda_ssurgo', SDA_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'JSON+COLUMNNAME', query }) });
  const rows = (d.Table ?? []).slice(1);
  if (rows.length === 0) return { components: [], classification: 'unknown', hydricLikely: false, provenance: { source: 'usda_ssurgo', confidence: 'low', fetchedAt: now.toISOString(), url: SDA_URL, note: 'No SSURGO map unit at this point' } };
  const components = rows.map((r) => ({ name: r[2] ?? '', pct: Number(r[3] ?? 0), drainageClass: r[4] ?? null, hydric: r[5] ?? null, slopePct: r[6] == null ? null : Number(r[6]) }));
  const mapUnit = rows[0]![1] ?? undefined;
  // Classify from the dominant non-urban component; "Urban land" tells you nothing about the dirt.
  // Only a component that covers a meaningful share of the map unit says anything about the dirt.
  const informative = components.filter((c) => !/urban land/i.test(c.name) && c.drainageClass && c.pct >= 10);
  const dom = informative[0];
  const dc = (dom?.drainageClass ?? '').toLowerCase();
  const hydricLikely = components.some((c) => c.hydric === 'Yes' && c.pct >= 15) || /very poorly|^poorly/.test(dc);
  let classification: SoilsResult['classification'] = 'unknown';
  if (dom) {
    if (/very poorly|^poorly/.test(dc) || dom.hydric === 'Yes') classification = 'poor';
    else if (/somewhat poorly/.test(dc)) classification = 'marginal';
    else if (/well|excessively/.test(dc)) classification = 'stable';
  }
  const urbanDominant = /urban land/i.test(components[0]!.name) && components[0]!.pct >= 50;
  return {
    mapUnit, components, classification, hydricLikely,
    provenance: { source: 'usda_ssurgo', confidence: urbanDominant ? 'low' : 'medium', fetchedAt: now.toISOString(), url: SDA_URL, note: urbanDominant ? `Map unit is ${Math.round(components[0]!.pct)}% Urban land; natural soils are masked. A DirtBid Soil Report or geotech governs.` : 'Screening-level; a DirtBid Soil Report or geotech borings govern' },
  };
}
