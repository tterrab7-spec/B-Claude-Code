# @dirtbid/api

Fastify 5 + Drizzle/Postgres backend for DirtBid Build: unified lead intake, the feasibility engine (`@dirtbid/underwriting`), paid reports with credit-back, projects with CSI budgets, invoices, change orders, draws, 12-week cash flow, investor reporting, vendors and bids, an operations assistant, and an HMAC-signed event outbox for n8n. The full route contract is in [`../../docs/API_CONTRACT.md`](../../docs/API_CONTRACT.md); the live OpenAPI is served at `/docs`.

## Run locally

```bash
# from the repo root (pnpm 10, Node 22, Postgres 16)
pnpm install
createdb dirtbid && createdb dirtbid_test            # or: docker compose up -d postgres
cp apps/api/.env.example apps/api/.env               # edit as needed
pnpm --filter @dirtbid/underwriting build
pnpm --filter @dirtbid/api db:migrate                # applies drizzle/ migrations
pnpm --filter @dirtbid/api db:seed                   # demo org "Cascade Homes", 4 projects, leads, runs
pnpm --filter @dirtbid/api dev                       # http://localhost:4000/docs
```

Sign in without an email provider: `POST /v1/auth/magic-link {"email":"kevin@cascadehomes.local"}` returns `devLink` outside production. Open that link's `token` against `GET /v1/auth/verify?token=…` to get a JWT. Seeded accounts: `staff@dirtbid.local` (staff/admin), `kevin@cascadehomes.local` (builder, org owner), `pm@cascadehomes.local`, `lp1@investors.local`, `lp2@investors.local`.

## Address-first feasibility

`POST /v1/parcels/resolve { address }` runs `@dirtbid/parcel-data`: Census geocoder → VGIN parcel polygon (lot size, FIPS) → FEMA NFHL flood zone → FWS NWI wetlands → USGS 3DEP slope → USDA SSURGO soils, plus a Chesapeake Bay RPA heuristic and the DirtBid sitework region multiplier. Results are cached in `parcel_lookups` for `PARCEL_CACHE_TTL_HOURS` (default 24) keyed by the normalized address, and every fresh resolve emits `parcel.resolved`. `POST /v1/feasibility/from-address { address, overrides?, leadId? }` resolves (cached), deep-merges `overrides` onto the prefilled `underwritingInput` (overrides win; `site` and `sitework` merge per key), runs the engine and stores the run with `source: 'address'` and the full parcel snapshot in `resolved_parcel`. Both routes are public and limited to 10 requests per hour per IP for anonymous callers.

Honest limits:
- **Zoning** only resolves where a locality publishes a queryable ArcGIS layer (the single built-in Chesapeake entry is unverified) or `REGRID_API_KEY` is set. Everywhere else the parcel comes back with `zoning.code` empty and `from-address` answers `422` with `fields.zoningCode` and the parcel, so the client must ask for the district and resend it in `overrides.zoningCode`.
- **Utilities** always come back `unknown`; no public layer is reliable enough. Ask the user (or request an availability letter) and pass `overrides.site.utilities`.
- Lot size comes from the VGIN polygon; when no polygon is found the run is refused with `fields.lotSizeSf` until the client supplies it.
- Soils, slope and wetlands are screening-level and carry per-field provenance and confidence; a survey, delineation or DirtBid Soil Report governs.
- Geocode failure is the only hard error (`422`, `fields.address`); any other upstream miss lands in `parcel.warnings`.

## Scripts

| script | what it does |
| --- | --- |
| `dev` | tsx watch on `src/server.ts` |
| `build` / `start` | compile to `dist/` and run |
| `typecheck` | `tsc --noEmit` |
| `test` | vitest against `DATABASE_URL_TEST` (schema is dropped and re-migrated once per run) |
| `db:generate` | drizzle-kit: diff `src/db/schema.ts` into a new SQL migration under `drizzle/` |
| `db:migrate` | apply migrations (used by the Docker entrypoint too) |
| `db:push` | push schema directly (dev only) |
| `db:seed` | idempotent demo data |

## Environment

See `.env.example`; every variable is documented there. Nothing external is required to boot: with no Stripe key orders can be marked paid through `POST /v1/orders/:id/mark-paid` (non-production only), with no `ANTHROPIC_API_KEY` the assistant answers from deterministic rules, with no `N8N_WEBHOOK_URL` events are stored but not delivered, with no `S3_BUCKET` uploads go to `LOCAL_UPLOAD_DIR`, and with `EMAIL_DRIVER=console` emails are logged and recorded in the `notifications` table.

## Project layout

```
src/
  app.ts                  Fastify factory: plugins, auth hook, error envelope, /docs
  server.ts               entrypoint
  config.ts               env → Config
  db/schema.ts            Drizzle schema (33 tables, money in integer cents)
  db/migrate.ts, seed.ts
  lib/                    errors, jwt, policy (single authz chokepoint), email drivers, outbox, audit
  modules/<name>/         routes.ts (+ service.ts, schema.ts) per domain
test/                     vitest suites (real Postgres via app.inject)
drizzle/                  generated SQL migrations
```

Authorization lives in `src/lib/policy.ts`. Every project-scoped route calls `canAccessProject(db, principal, projectId, 'read'|'write')`; org-scoped routes call `requireOrgMember`; staff routes call `requireStaff`. Add new tenant tables with an `organization_id` column and route them through the same helpers.

## n8n webhook setup

1. In n8n create a **Webhook** node (POST, path `dirtbid-events`, respond immediately). Copy its production URL into `N8N_WEBHOOK_URL`.
2. Set the same random string in `WEBHOOK_SECRET` and in n8n.
3. Add a **Crypto** node (HMAC, SHA256, key = secret, value = raw body) followed by an **IF** node that compares `"sha256=" + hash` to header `x-dirtbid-signature`; drop anything that does not match.
4. Route on `$json.type`. Event types: `lead.created, lead.qualified, lead.status_changed, feasibility.run.completed, feasibility.delivered, order.created, order.paid, credit.issued, credit.applied, project.created, milestone.completed, invoice.pending_approval, invoice.approved, change_order.approved, draw.ready, draw.submitted, draw.funded, cash.shortfall_alert, budget.variance_alert, report.generated, report.sent, vendor.compliance_expiring`.
5. Delivery retries 5 times with exponential backoff; undelivered events stay in the `events` table and can be replayed from `GET /v1/events` or pushed with `POST /v1/events/drain` (staff).

Typical flows: `lead.qualified` → Slack + CRM; `draw.ready` → notify lender contact; `cash.shortfall_alert` → owner SMS; `report.sent` → log to Drive.

## Stripe setup

1. Set `STRIPE_SECRET_KEY`. `POST /v1/orders` then returns a Checkout `checkoutUrl` (one-time or monthly for `ai_ops_monthly`).
2. Create a webhook endpoint for `checkout.session.completed` pointing at `https://api.yourdomain.com/v1/webhooks/stripe` and set `STRIPE_WEBHOOK_SECRET`. Locally: `stripe listen --forward-to localhost:4000/v1/webhooks/stripe`.
3. Payment marks the order paid, records a `payments` row, emits `order.paid`, and for `feasibility_enhanced` issues a 90-day `credits` row that auto-applies to the next `design_predev` order.

## Deploying on AWS (ECS Fargate + RDS)

- **Database**: RDS PostgreSQL 16, `rds.force_ssl=1`; append `?sslmode=require` to `DATABASE_URL`. Run `db:migrate` as a one-off ECS task (or let the container entrypoint do it; it is idempotent).
- **Container**: build with the root as context: `docker build -f apps/api/Dockerfile -t dirtbid-api .`; push to ECR. Task: 0.5 vCPU / 1 GB is plenty to start; set all env vars from Secrets Manager / SSM.
- **Service**: ALB → target group on port 4000, health check path `/v1/health`. Set `WEB_URL` to the web app origin for CORS and links.
- **Email**: `EMAIL_DRIVER=ses` with a verified domain and `pnpm add @aws-sdk/client-sesv2` in this package.
- **Documents**: set `S3_BUCKET` and `AWS_REGION`, add `@aws-sdk/client-s3 @aws-sdk/s3-request-presigner`; presigned PUTs expire in 15 minutes. Task role needs `s3:PutObject`/`GetObject` on the bucket prefix `projects/*`.
- **Outbox**: the drainer runs inside the API process every 5 s. For multi-task deployments that is safe (delivery is at-least-once; n8n flows should be idempotent on `id`).
- **Observability**: pino JSON logs → CloudWatch; `/v1/admin/metrics` and `/v1/events` give a quick operational view.

## Testing

```bash
NODE_ENV=test DATABASE_URL_TEST=postgres://postgres@127.0.0.1:5432/dirtbid_test pnpm --filter @dirtbid/api test
```

Thirteen suites cover the address-first flow (recorded public-service fixtures in `test/fixtures`, no network), auth, leads (scoring, dedupe, honeypot), feasibility (engine errors, tier gating, review versioning, delivery), orders and credits, projects and policy, budget math, invoices, change orders, draws and loan reconciliation, cash flow and shortfall alerts, portfolio, investor reports, capital calls, vendors, bid comparison, the assistant's six canonical questions, the signed outbox with retry, documents, and admin.
