# Parcelyst

Investment analysis, off-market deal finding, listing prospecting and land residual analysis for
residential, commercial and land. It started from zarnest.com's pay-per-report analyzer and goes further:
commercial rent-roll underwriting, lot-yield land residuals, scored lead finders for investors, agents and
developers, county-list import, a pipeline, branded reports, teams and subscription billing.

Live markets: Hampton Roads and Richmond, VA. Beta: Austin, TX and Jackson County, MO. To add a market,
add one object to `public/js/shared/markets.js`.

## Run it

```bash
cd parcelyst
npm install
cp .env.example .env          # optional; it runs without any keys
BILLING_MODE=dev npm start    # http://localhost:3000
npm test                      # 11 tests: engine math + API, paywalls, imports, webhooks
```

With no keys the app runs end to end: accounts, analyses, reports, finders on a synthetic demo dataset
(labeled "Demo" everywhere), CSV imports, pipeline, and instant "dev" purchases.

`npm run build:static` copies `public/` to `dist/` so you can host it on S3, Netlify or Pages with no server.
In that mode the site uses an in-browser backend: accounts live in the visitor's browser and purchases are
simulated. Use it for demos only.

## Go-live checklist

1. **Host**: Node 22.13+ (it uses the built-in `node:sqlite`). Docker image included. Put `/data` on a
   persistent volume (EBS/EFS on AWS). For multiple instances, port `server/store.js` to Postgres/RDS;
   it is a single module behind a small interface.
2. **Stripe**: create the products and prices listed in `.env.example`, set `STRIPE_SECRET_KEY`,
   then add a webhook to `https://<host>/api/billing/webhook` for `checkout.session.completed`,
   `customer.subscription.updated` and `customer.subscription.deleted`. Turn on the customer portal.
3. **Data**: set `FRED_API_KEY` (free) for live rates and `RENTCAST_API_KEY` for property records and AVMs.
   Add `REGRID_TOKEN` for land and commercial parcels and `ATTOM_API_KEY` for distress data when budget allows.
   Responses are cached in SQLite (30 days for records, 14 for AVMs) to control per-call cost.
4. **Bulk finder data**: the finders score whatever is in the `properties` table. Load county assessor
   extracts or provider bulk pulls with `store.insertProperties(records, null)` (shared) or let users import
   their own lists in the app (private to their account). `providers.rentcastArea()` pulls a city by page.
5. **Legal**: have counsel review `terms.html` and `privacy.html`. Owner outreach must follow TCPA, DNC and
   Fair Housing rules.
6. **Reference data**: re-check the tax rates in `markets.js` every July (Virginia FY start) and the
   appreciation, rent and cap-rate benchmarks quarterly.

## Layout

```
public/js/shared/   runs in browser AND server
  engine.js         underwriting: residential, commercial rent roll, land residual (pure functions)
  markets.js        market reference data (tax rates by locality, FMR, HPI, cap rates, lot costs)
  plans.js          plans, limits, credit packs, add-ons (single source for paywall + pricing page)
  scoring.js        Deal Finder / Listing Prospector / Land Finder signal scoring
  defaults.js       property record + market data -> complete engine inputs with cited sources
  csv.js            county / list-provider CSV import with header auto-mapping
  service.js        every API endpoint, written once over a storage interface
  seed.js           deterministic synthetic demo dataset
server/             Express app, SQLite store, Stripe billing, data provider adapters
public/             site + app (no build step, no framework)
test/               node:test suites
```

## Engine checks

On the Rochester, NY property in Zarnest's own 25-page sample report, the engine reproduces its NOI ($12,414),
monthly cash flow (-$943), 5-year profit ($49,081), IRR (7.63%) and equity multiple (1.55x) exactly
(`test/engine.test.js`).

## Known gaps (next sprint)

- MLS/IDX listings need a broker data agreement per MLS. Until then, list status comes from provider sale
  listings or agent-imported expired lists.
- Email: saved-search alerts show "new since last run" in-app. Wire SES/Postmark to email them.
- Skip tracing is priced on the pricing page but not yet integrated (BatchData or similar).
- Map view for the finders (Leaflet + Regrid parcel tiles).
- Password reset email flow (needs the email provider).
