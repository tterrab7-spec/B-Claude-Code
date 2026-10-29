/* Generate a finished HTML feasibility report for an assembled site.
   usage: tsx scripts/site-report.ts <config.json> <out.html>
   config: { title, addresses[], resolvedFile (json map from resolve-many), overrides: Partial<UnderwritingInput>, facts: {label,value,source}[], narrative: {headline, context[], notes[]}, comps?: [{address, price, sf, date}] } */
import { readFileSync, writeFileSync } from 'node:fs';
import { assembleParcels, type ResolvedParcel } from '../src/index.js';
import { underwrite, buildReport, type UnderwritingInput, type UnderwritingResult } from '@dirtbid/underwriting';

const [cfgPath, outPath] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(cfgPath!, 'utf8'));
const resolvedMap = JSON.parse(readFileSync(cfg.resolvedFile, 'utf8')) as Record<string, ResolvedParcel>;
const resolved = (cfg.addresses as string[]).map((a) => { const r = resolvedMap[a]; if (!r) throw new Error('missing resolve for ' + a); return r; });
const site = assembleParcels(resolved);
const ov = cfg.overrides ?? {};
const input: UnderwritingInput = { ...site.underwritingInput, ...ov, site: { ...site.underwritingInput.site, ...(ov.site ?? {}), utilities: { ...(site.underwritingInput.site?.utilities ?? {}), ...(ov.site?.utilities ?? {}) } }, sitework: { ...site.underwritingInput.sitework, ...(ov.sitework ?? {}) }, assumptions: { ...(site.underwritingInput.assumptions ?? {}), ...(ov.assumptions ?? {}) } };
if (cfg.lotSizeOverrideSf) input.lotSizeSf = cfg.lotSizeOverrideSf;
const r: UnderwritingResult = underwrite(input);
const rep = buildReport(r, 'enhanced');
const rec = r.scenarios.find((s) => s.id === r.recommended.scenarioId)!;
const usd = (n: number) => '$' + Math.round(n).toLocaleString();
const pct = (n: number) => Math.round(n * 100) + '%';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const sw = r.sitework!;
const cls = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'info' } as const;
const gauge = (v: number) => { const c = Math.PI * 44, off = c * (1 - v / 100); return `<svg viewBox="0 0 110 62" class="dial"><path d="M11 56 A44 44 0 0 1 99 56" fill="none" stroke="var(--line)" stroke-width="10" stroke-linecap="round"/><path d="M11 56 A44 44 0 0 1 99 56" fill="none" stroke="var(--data)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/><text x="55" y="54" text-anchor="middle" class="dialv">${v}%</text></svg>`; };
const provRows = cfg.parcelRows ? (cfg.parcelRows as string[][]).map((c) => `<tr>${c.map((v, i) => `<td class="${i === 2 || i === 5 ? 'n' : i === 1 ? 'mono' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('') : resolved.map((x) => `<tr><td>${esc(x.geocode?.matchedAddress ?? x.query)}</td><td class="mono">${esc(x.parcel.parcelId ?? '—')}${x.parcel.taxMapId ? `<br><small>${esc(x.parcel.taxMapId)}</small>` : ''}</td><td class="n">${x.parcel.lotSizeSf ? x.parcel.lotSizeSf.toLocaleString() : '—'}</td><td>${esc(x.flood.zone ?? '—')}</td><td>${esc(x.soils.mapUnit ?? '—')}</td><td class="n">${x.elevation.centerFt ?? '—'} ft · ${x.elevation.slopePct ?? '—'}%</td></tr>`).join('');
const sources = [...new Set(resolved.flatMap((x) => [x.geocode?.provenance, x.parcel.provenance, x.flood.provenance, x.wetlands.provenance, x.elevation.provenance, x.soils.provenance, x.zoning.provenance].filter(Boolean).map((p) => p!.source)))].filter((s) => s !== 'unavailable' && s !== 'heuristic');
const srcNames: Record<string, string> = { census_geocoder: 'U.S. Census Geocoder', vgin_parcels: 'Virginia VGIN statewide parcels', fema_nfhl: 'FEMA National Flood Hazard Layer', fws_nwi: 'USFWS National Wetlands Inventory', usgs_3dep: 'USGS 3DEP elevation', usda_ssurgo: 'USDA SSURGO soils', arcgis_zoning: 'Locality zoning layer', arcgis_geocoder: 'Esri World Geocoder', nominatim: 'OpenStreetMap' };
const html = `<title>${esc(cfg.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Source+Sans+3:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#f6f1e7;--bg-2:#ece5d6;--card:#fffdf8;--fg:#1d1a16;--fg-2:#5a5247;--line:#d6cbb6;--accent:#d1581a;--data:#1f6f78;--data-soft:#d8eaec;--good:#2f7a3d;--warn:#b26a00;--bad:#b3261e;--display:"Archivo",system-ui,sans-serif;--body:"Source Sans 3",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--bg-2:#201d16;--card:#1d1a13;--fg:#efe8da;--fg-2:#b2a894;--line:#3a3428;--accent:#f07a3a;--data:#6fc3cc;--data-soft:#17333a;--good:#6fc48a;--warn:#e3a640;--bad:#ef6f66;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#17150f;--bg-2:#201d16;--card:#1d1a13;--fg:#efe8da;--fg-2:#b2a894;--line:#3a3428;--accent:#f07a3a;--data:#6fc3cc;--data-soft:#17333a;--good:#6fc48a;--warn:#e3a640;--bad:#ef6f66;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--body);font-size:16px;line-height:1.5;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 56px}
.wrap{max-width:1040px;margin:0 auto}.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:28px 0 6px}
h1{font-family:var(--display);font-size:clamp(26px,4vw,40px);line-height:1.08;letter-spacing:-.02em;margin:0 0 8px;text-wrap:balance}h2{font-family:var(--display);font-size:22px;margin:40px 0 10px;padding-top:16px;border-top:3px solid var(--fg)}h3{font-family:var(--display);font-size:16px;margin:0 0 6px}
p{margin:8px 0;max-width:72ch}.lede{font-size:19px;color:var(--fg-2);max-width:66ch}.muted{color:var(--fg-2);font-size:14px}
.pill{display:inline-block;font-family:var(--mono);font-size:11px;padding:2px 8px;border-radius:3px;border:1px solid var(--line);white-space:nowrap;color:var(--fg-2)}.pill.good{color:var(--good);border-color:var(--good)}.pill.warn{color:var(--warn);border-color:var(--warn)}.pill.bad{color:var(--bad);border-color:var(--bad)}.pill.data{color:var(--data);border-color:var(--data);background:var(--data-soft)}
.gauges{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:18px 0}.g{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px;text-align:center;display:grid;gap:4px;justify-items:center;min-width:0}.g b{font-family:var(--display);font-size:14px}.g small{color:var(--fg-2);font-size:12.5px}
.dial{width:130px;max-width:100%}.dialv{font:800 19px var(--display);fill:var(--fg)}.bars{display:flex;align-items:flex-end;gap:5px;height:58px}.bars i{display:block;width:16px;background:var(--line);border-radius:2px 2px 0 0}.bars i.on{background:var(--data)}
.light{display:flex;gap:8px;background:#1d1a16;padding:8px 12px;border-radius:30px}.light i{width:18px;height:18px;border-radius:50%;background:#3a3428;display:block}.light i.on.good{background:#4ade80;box-shadow:0 0 10px #4ade80}.light i.on.warn{background:#fbbf24;box-shadow:0 0 10px #fbbf24}.light i.on.bad{background:#f87171;box-shadow:0 0 10px #f87171}
.good{color:var(--good)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.callouts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin:14px 0}.callouts div{background:var(--card);padding:12px 14px;min-width:0;overflow-wrap:anywhere}.callouts b{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--fg-2);font-weight:500}.callouts span{font-family:var(--mono);font-size:18px;font-weight:500}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin:14px 0}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;min-width:0;overflow-wrap:anywhere}.card.wide{grid-column:1/-1}.card h3{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.card h3 i{width:10px;height:10px;border-radius:50%;background:var(--line);display:inline-block}.card.ok h3 i{background:var(--good)}.card.warn h3 i{background:var(--warn)}.card.bad h3 i{background:var(--bad)}.card.info h3 i{background:var(--data)}.card>b{display:block;margin-bottom:4px}.card p{margin:3px 0;color:var(--fg-2);font-size:14.5px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin:14px 0}.facts div{background:var(--card);padding:10px 14px;min-width:0;overflow-wrap:anywhere}.facts b{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--fg-2);font-weight:500}.facts span{font-size:16px;font-weight:600}.facts small{display:block;color:var(--fg-2);font-size:11.5px;font-family:var(--mono)}
.tbl{overflow-x:auto;margin:10px 0}table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--fg-2);font-weight:500;background:var(--bg-2)}.n{text-align:right;font-family:var(--mono)}.mono{font-family:var(--mono);font-size:13px}td small{color:var(--fg-2)}
.swhead{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;margin:4px 0 8px}.swhead b{font-family:var(--display);font-size:28px}.swhead span{color:var(--fg-2);font-size:13.5px}
.divbar{display:flex;height:24px;border-radius:4px;overflow:hidden;gap:2px;margin:6px 0}.divbar i{background:var(--data);display:flex;align-items:center;justify-content:center;min-width:0;color:#fff;font:500 11px var(--mono)}.divbar i:nth-child(2){opacity:.8}.divbar i:nth-child(3){opacity:.65}.divbar i:nth-child(4){opacity:.5}.divbar i:nth-child(5){opacity:.35}.divleg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--fg-2)}.divleg b{font-family:var(--mono);color:var(--data)}
.wf{display:flex;flex-wrap:wrap;gap:10px 20px;margin:10px 0 4px}.wf span{display:grid}.wf small{font-size:11px;color:var(--fg-2)}.wf b{font-family:var(--mono);font-weight:500}
.scen{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin:12px 0}.scen article{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px;min-width:0}.scen article.rec{border:2px solid var(--accent)}.scen article.dead{opacity:.72}.tag{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;color:var(--accent);margin:0}.scen h4{font-family:var(--display);font-size:16px;margin:2px 0 6px}.pills{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
dl{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin:10px 0 0}dt{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--fg-2)}dd{margin:0;font-family:var(--mono);font-size:15px;font-weight:500}
.ov,.chk{list-style:none;margin:0;padding:0;display:grid;gap:8px}.ov li,.chk li{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:start}.ov li p,.chk li p{grid-column:2;margin:0;font-size:13.5px;color:var(--fg-2)}.ov li small{grid-column:2;font-family:var(--mono);font-size:11.5px;color:var(--warn)}
.callout{border-left:4px solid var(--accent);background:var(--bg-2);padding:12px 16px;margin:16px 0;max-width:76ch}.callout p{margin:6px 0}
ul.plain{padding-left:20px;max-width:72ch}ul.plain li{margin:5px 0}.disc{font-size:12.5px;color:var(--fg-2);padding-left:18px}
details{border-top:1px solid var(--line);padding-top:8px;margin-top:8px}summary{cursor:pointer;font-family:var(--display);font-weight:600;font-size:14px}
footer{margin-top:40px;border-top:1px solid var(--line);padding-top:12px;color:var(--fg-2);font-size:13px}
</style>
<div class="wrap">
  <p class="eyebrow">DirtBid Build · Feasibility report · ${esc(r.market.name)} · ${new Date(r.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <h1>${esc(cfg.title)}</h1>
  <p class="lede">${esc(cfg.narrative.headline)}</p>
  <div class="gauges">
    <div class="g">${gauge(r.scores.approvalProbability)}<b>Approval probability: ${r.scores.approvalLabel}</b><small>${esc(rep.gauges.approvalProbability.caption)}</small></div>
    <div class="g"><div class="bars">${[2, 4, 6, 8, 10].map((t) => `<i style="height:${t * 9}%" class="${r.scores.valueMaximization >= t ? 'on' : ''}"></i>`).join('')}</div><b>Value maximization: ${r.scores.valueMaximization}/10</b><small>${esc(rep.gauges.valueMaximization.caption)}</small></div>
    <div class="g"><div class="light"><i class="${r.scores.riskLevel === 'high' ? 'on bad' : ''}"></i><i class="${r.scores.riskLevel === 'moderate' ? 'on warn' : ''}"></i><i class="${r.scores.riskLevel === 'low' ? 'on good' : ''}"></i></div><b class="${r.scores.riskLevel === 'low' ? 'good' : r.scores.riskLevel === 'moderate' ? 'warn' : 'bad'}">Risk: ${r.scores.riskLevel}</b><small>${esc(rep.gauges.risk.caption)}</small></div>
  </div>
  <div class="callouts">${rep.callouts.map((c) => `<div><b>${esc(c.label)}</b><span>${esc(c.value)}</span></div>`).join('')}</div>

  <h2>1. The site</h2>
  ${cfg.narrative.context.map((p: string) => `<p>${esc(p)}</p>`).join('')}
  <div class="facts">${(cfg.facts as { label: string; value: string; source: string }[]).map((f) => `<div><b>${esc(f.label)}</b><span>${esc(f.value)}</span><small>${esc(f.source)}</small></div>`).join('')}</div>
  <div class="tbl"><table><tr><th>Address</th><th>Parcel</th><th class="n">Lot sf</th><th>Flood</th><th>Soil map unit</th><th class="n">Elev · slope</th></tr>${provRows}</table></div>
  ${site.warnings.length ? `<ul class="plain muted">${site.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}

  <h2>2. What the land can become</h2>
  <div class="cards">${rep.sections.filter((s) => ['zoning', 'utilities', 'environmental', 'comps'].includes(s.key)).map((s) => `<section class="card ${cls[s.status]}"><h3><i></i>${esc(s.title)}</h3><b>${esc(s.headline)}</b>${s.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</section>`).join('')}</div>
  <section class="card wide"><h3>Entitlement overlays <span class="pill">${r.overlays.length} rules evaluated</span></h3>${r.overlays.length ? `<ul class="ov">${r.overlays.map((f) => `<li><span class="pill ${f.status === 'yes' ? (f.treatment === 'blocker' || f.treatment === 'constraint' ? 'bad' : f.treatment === 'cost_adder' ? 'warn' : 'good') : f.status === 'no' ? '' : 'warn'}">${f.status}</span><b>${esc(f.name)}</b><p>${esc(f.reason)} ${esc(f.effect)}</p>${f.costAdder ? `<small>+${usd(f.costAdder)}</small>` : ''}${f.monthsAdded ? `<small>${f.monthsAdded > 0 ? '+' : ''}${f.monthsAdded} mo</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted">No overlays triggered.</p>'}</section>

  <h2>3. What the dirt costs</h2>
  <section class="card wide ${sw.riskLabel === 'High' ? 'bad' : sw.riskLabel === 'Moderate' ? 'warn' : 'ok'}"><h3><i></i>Site work <span class="pill">Feasibility grade · DirtBid Build model · region ×${sw.regionMultiplier}</span></h3>
    <div class="swhead"><b>${usd(sw.total)}</b><span>${sw.lines.length} CSI line items · ${sw.riskLabel} sitework risk (${sw.riskScore}/100)${rec.units > 1 ? ` · ${usd(sw.total / rec.units)} per unit at ${rec.units} units` : ''}</span></div>
    <div class="divbar">${sw.byDivision.map((d) => `<i style="flex:${d.total}"><span>${d.division}</span></i>`).join('')}</div><div class="divleg">${sw.byDivision.map((d) => `<span><b>${d.division}</b> ${esc(d.name)} · ${usd(d.total)} · ${d.pct}%</span>`).join('')}</div>
    <div class="tbl"><table><tr><th>CSI</th><th>Item</th><th class="n">Qty</th><th>Unit</th><th class="n">Unit cost</th><th class="n">Total</th></tr>${sw.lines.map((l) => `<tr><td class="mono">${l.csi}</td><td>${esc(l.item)}${l.note ? `<br><small>${esc(l.note)}</small>` : ''}</td><td class="n">${l.qty.toLocaleString()}</td><td>${l.unit}</td><td class="n">${usd(l.unitCost)}</td><td class="n">${usd(l.total)}</td></tr>`).join('')}</table></div>
    <div class="wf">${sw.waterfall.map((w) => `<span><small>${esc(w.label)}</small><b>${usd(w.amount)}</b></span>`).join('')}</div>
    ${sw.flags.length ? `<ul class="plain muted">${sw.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    <p class="muted">A DirtBid Land Screening ($950) replaces this model with a bid-grade number against the parcel's soil survey.</p>
  </section>

  <h2>4. What it's worth</h2>
  <p>${esc(r.recommended.rationale)}</p>
  <div class="scen">${r.scenarios.map((s) => `<article class="${s.id === rec.id ? 'rec' : ''} ${s.viable ? '' : 'dead'}"><p class="tag">${esc(s.tag)}</p><h4>${esc(s.name)}</h4><div class="pills">${s.id === rec.id ? '<span class="pill data">Recommended</span>' : ''}<span class="pill">${s.confidence} confidence</span><span class="pill">${esc(s.permitTier.replace(/_/g, ' '))} · ${s.permitMonths} mo</span></div><p class="muted">${esc(s.description)}</p>
    <dl><dt>Max offer</dt><dd>${usd(s.maxOffer)}</dd><dt>ARV</dt><dd>${usd(s.arv)}</dd><dt>Total costs</dt><dd>${usd(s.costs.total)}</dd><dt>Profit</dt><dd class="${s.profit >= 0 ? 'good' : 'bad'}">${usd(s.profit)}</dd><dt>ROI</dt><dd>${pct(s.roi)}</dd><dt>Units / sf</dt><dd>${s.units} / ${s.totalBuildableSf.toLocaleString()}</dd></dl>
    <details><summary>Cost stack</summary><dl><dt>Hard</dt><dd>${usd(s.costs.hard + s.costs.adu)}</dd><dt>Soft</dt><dd>${usd(s.costs.soft)}</dd><dt>Sitework</dt><dd>${usd(s.costs.sitePrep)}</dd><dt>Demo</dt><dd>${usd(s.costs.demo)}</dd><dt>Fees</dt><dd>${usd(s.costs.fees)}</dd><dt>Contingency</dt><dd>${usd(s.costs.contingency)}</dd><dt>Financing</dt><dd>${usd(s.costs.financing)}</dd><dt>Sale costs</dt><dd>${usd(s.saleCosts.total)}</dd></dl><ul class="plain muted">${s.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details></article>`).join('')}</div>
  ${cfg.narrative.valuation ? `<div class="callout">${(cfg.narrative.valuation as string[]).map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
  <section class="card wide"><h3>Sensitivity <span class="pill">max offer · recommended scenario</span></h3><div class="tbl"><table><tr><th>ARV \\ cost</th>${[-10, 0, 10].map((c) => `<th class="n">${c > 0 ? '+' : ''}${c}%</th>`).join('')}</tr>${[-10, 0, 10].map((a) => `<tr><td>${a > 0 ? '+' : ''}${a}%</td>${[-10, 0, 10].map((c) => { const cell = r.sensitivity.find((x) => x.arvDeltaPct === a && x.costDeltaPct === c)!; return `<td class="n ${cell.maxOffer <= 0 ? 'bad' : ''}">${usd(cell.maxOffer)}</td>`; }).join('')}</tr>`).join('')}</table></div></section>

  <h2>5. What to verify before you spend real money</h2>
  <section class="card wide"><ul class="chk">${r.checklist.map((c) => `<li><span class="pill ${c.priority === 'high' ? 'bad' : c.priority === 'medium' ? 'warn' : ''}">${c.priority}</span><b>${esc(c.item)}</b><p>${esc(c.why)} <small>(${esc(c.owner)})</small></p></li>`).join('')}</ul></section>
  ${cfg.narrative.notes?.length ? `<h2>6. Analyst notes</h2><ul class="plain">${(cfg.narrative.notes as string[]).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}

  <h2>Sources and method</h2>
  <p>Parcel geometry, flood, soils and elevation were pulled live from ${sources.map((s) => srcNames[s] ?? s).join(', ')}. ${esc(cfg.narrative.sources ?? '')}</p>
  <ul class="disc">${r.disclaimers.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
  <details><summary>Engine input and output (JSON)</summary><pre style="font:12px var(--mono);max-height:420px;overflow:auto;background:var(--bg-2);padding:10px;border-radius:6px">${esc(JSON.stringify({ input, result: r }, null, 2))}</pre></details>
  <footer>Prepared by DirtBid Build, feasibility engine v${r.version}. Screening-level analysis: not a survey, appraisal, title opinion or engineering report.</footer>
</div>`;
writeFileSync(outPath!, html);
console.log(JSON.stringify({ out: outPath, lotSizeSf: input.lotSizeSf, zoning: input.zoningCode, recommended: rec.name, units: rec.units, maxOffer: rec.maxOffer, arv: rec.arv, profit: rec.profit, roi: rec.roi, sitework: sw.total, scores: r.scores, scenarios: r.scenarios.map((s) => [s.name, s.units, s.maxOffer, s.roi]) }, null, 1));
