# DirtBid Build

Feasibility, build-on-your-lot programs and builder operations for the DirtBid land platform. A ground-up rebuild of the buildosdev.com offering with a real backend.

```
dirtbid-build/
├── packages/underwriting   # deterministic land underwriting engine (TypeScript, zero deps)
├── apps/api                # Fastify + Postgres API: leads, feasibility, orders, projects, draws, investors, assistant, n8n events
├── apps/web                # React + Vite: public funnel, native calculator, portal
└── docs/                   # API_CONTRACT.md (source of truth), TEARDOWN.md
```

## Quick start

Requires Node 22, pnpm 10, Postgres 16.

```bash
pnpm install
pnpm --filter @dirtbid/underwriting test     # engine + Altadena parity tests
cp apps/api/.env.example apps/api/.env       # set DATABASE_URL
pnpm db:migrate && pnpm db:seed
pnpm dev:api                                  # http://localhost:4000/docs
pnpm dev:web                                  # http://localhost:5173
```

Or `docker compose up` for postgres + api + web.

## The engine in 20 lines

```ts
import { underwrite, buildReport } from '@dirtbid/underwriting';

const result = underwrite({
  marketCode: 'HAMPTON_ROADS_VA',
  address: '123 Example St, Hampton, VA 23666',
  zip: '23666',
  lotSizeSf: 12000,
  zoningCode: 'R-10',
  projectType: 'vacant_land',
  arvPerSf: 290,
  site: { floodZone: 'X', rpaBuffer: 'no', utilities: { water: 'yes', sewer: 'yes', power: 'yes' } },
});

result.scenarios[0].maxOffer;          // 76056  — residual land value at the market's target ROI
result.scores.approvalProbability;     // 85
const report = buildReport(result, 'lite');   // gauges, callouts, four sections, checklist
```

Markets are data (`packages/underwriting/src/markets/*.ts`): zoning table, overlays (SB 9, ADU, Chesapeake Bay RPA, FEMA, VDOT, utilities, soils, rezoning), cost assumptions, hazard screen, permit timelines. Add a locality by adding a config and calling `registerMarket()`.

**Calibration:** the Hampton Roads constants are starting points. Fit them to closed lot deliveries and current builder bids before quoting a landowner. Every report prints its calibration note.

## Integrating with DirtBid

- Score every listing: import the engine into the listing service and store `scores.approvalProbability` and `scenarios[recommended].maxOffer` as ranking fields.
- Mount the API under `/v1` next to the existing DirtBid API, or run it as its own service; it has no Supabase dependency.
- Point `N8N_WEBHOOK_URL` at an n8n webhook node; every domain event arrives HMAC-signed (`X-DirtBid-Signature`).

See `docs/API_CONTRACT.md` for every route and `docs/TEARDOWN.md` for what buildosdev.com does and how this compares.
