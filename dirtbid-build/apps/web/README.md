# @dirtbid/web

React 18 + Vite SPA for DirtBid Build: marketing pages, the native land-underwriting calculator (runs `@dirtbid/underwriting` in the browser) and the operations portal that talks to `@dirtbid/api`.

## Run

```bash
pnpm install                       # from the workspace root
pnpm --filter @dirtbid/underwriting build
VITE_API_URL=http://localhost:4000/v1 pnpm --filter @dirtbid/web dev
```

`VITE_API_URL` defaults to `http://localhost:4000/v1`. In production set it to the API origin plus `/v1`.

## Scripts

- `dev`, `build`, `preview`
- `typecheck`, `test` (vitest + testing-library)
- `screenshots` — Playwright pass over every public route at 1440 and 390 px, plus a computed calculator result and the portal empty state. Output in `screenshots/`.

## Routes

Public: `/`, `/feasibility`, `/pricing`, `/calculator`, `/homebuilder`, `/builders`, `/get-started`, `/ai`, `/login`, `/auth/verify`.
Portal (JWT in `localStorage.dirtbid_token`): `/app`, `/app/projects/:id/{budget,invoices,draws,schedule,cashflow,investors,documents,updates}`, `/app/assistant`, `/app/leads`, `/app/feasibility/:runId`.

## Docker

Build from the workspace root so the underwriting package is in context:

```bash
docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.example.com/v1 -t dirtbid-web .
```

## Demo mode

`VITE_DEMO=1` swaps `src/lib/api.ts` for an in-memory implementation of the API contract (`src/demo/server.ts`, seeded by `src/demo/seed.ts`). Staff is signed in by default; `/login` offers staff and builder (Cascade Homes) personas. State persists in `localStorage.dirtbid_demo_state`; "Reset demo data" in the portal re-seeds. Routing switches to a hash router so the bundle works from any static host or `file://`.

```bash
pnpm --filter @dirtbid/web build:demo     # → dist-demo/ (index.html + assets/app.js + assets/index.css, relative URLs)
pnpm --filter @dirtbid/web verify:demo    # serves dist-demo and clicks through the product with Playwright
```

Address resolution in demo mode calls the public GIS services directly from the browser via `@dirtbid/parcel-data`; services that block CORS degrade to "unknown" with a warning, which is expected.
