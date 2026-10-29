# DirtBid Build — API contract (v1)

Base URL: `/v1`. JSON everywhere. Auth: `Authorization: Bearer <jwt>` (issued by magic link) or the `db_session` httpOnly cookie. Public routes are marked **public**. All money is **integer cents**. All ids are UUIDs. Timestamps ISO-8601 UTC.

Errors: `{ "error": { "code": "validation|not_found|unauthorized|forbidden|conflict|rate_limited|internal", "message": string, "fields"?: Record<string,string> } }`.

Roles: `landowner | homeowner | builder | investor | staff | admin`. A user may belong to one or more organizations (builder companies). `staff`/`admin` are platform-level.

## Auth
- `POST /auth/magic-link` **public** `{ email, redirectTo? }` → `202 { ok: true }` (always 202; never reveals whether the email exists). Sends a one-time link `${WEB_URL}/auth/verify?token=…` valid 15 min.
- `GET /auth/verify?token=` **public** → `200 { token, user }` and sets cookie. Creates the user on first use with role from the originating lead (default `landowner`).
- `GET /auth/me` → `{ user: { id, email, fullName, phone, roles[], organizations[] } }`
- `POST /auth/logout` → `204`
- Dev helper when `NODE_ENV!=production`: magic links are also logged and returned from `POST /auth/magic-link` as `{ ok, devLink }`.

## Markets & services
- `GET /markets` **public** → `[{ code, name, state, jurisdiction, zoningCodes[], defaultArvPerSf, assumptions, calibrationNote }]`
- `GET /services` **public** → catalog `[{ code, name, priceCents | priceFromCents | null, billing: 'one_time'|'monthly'|'quote', creditBack?: { toService, windowDays }, description, includes[] }]`
  Seeded: `feasibility_snapshot` (0), `feasibility_enhanced` (75000, credit-back → `design_predev` within 90 days), `design_predev` (500000), `entitlement` (from 1000000, quote), `construction` (quote), `ai_readiness_audit` (99700), `ai_implementation` (from 500000), `ai_ops_monthly` (100000 monthly), `oversight` / `owners_rep` / `full_delivery` (quote).

## Leads (unified intake — replaces Jotform, homeowner-signup, qualification, calculator unlock, builder audit)
- `POST /leads` **public** (rate-limited 10/min/IP, honeypot field `website` must be empty, disposable-email domains rejected)
  ```json
  { "kind": "feasibility_snapshot|feasibility_enhanced|homeowner_rebuild|builder_qualification|builder_audit|calculator_unlock|strategy_call|codev_partner",
    "contact": { "fullName", "email", "phone"? },
    "property": { "address"?, "city"?, "state"?, "zip"?, "apn"?, "propertyType"?: "vacant_land|residential_house|commercial", "lotSize"?, "lotSizeUnit"?: "sf|acres", "homeSizeSf"?, "ownsLand"?: boolean, "zoningCode"? },
    "answers": { ...free-form per kind, e.g. budget, targetTimeline, situation, eatonFireAffected, concern, companyName, activeProjects, annualVolume },
    "consent": true, "utm": { "source","medium","campaign","content","term" }?, "website": "" }
  ```
  → `201 { leadId, score, grade: "A|B|C|D", nextStep: { type: "magic_link_sent|book_call|checkout|report_queued", url? } }`
  Side effects: upsert contact by email; dedupe open lead with same email+kind+address within 30 days (returns existing `leadId`, `200`); score; emit `lead.created` (and `lead.qualified` when grade A/B); for `homeowner_rebuild` and `builder_*` kinds send the magic link; for `feasibility_enhanced` create an order and return checkout url.
- Staff: `GET /leads?status=&kind=&grade=&q=&page=&limit=` → `{ items[], total }`; `GET /leads/:id` (includes events, runs, orders); `PATCH /leads/:id { status: "new|contacted|qualified|proposal|won|lost|nurture", assigneeUserId?, notes?, lostReason? }`; `POST /leads/:id/convert { projectName?, programType: "boyl|codev|rebuild|builder_ops" }` → `{ projectId, userId }`.
- Lead score (0–100): ownsLand +25, budget ≥ $400k +15, timeline ≤ 12 mo +10, in active market zip +15, lot ≥ 5,000 sf +10, consent +5, phone +5, strategy_call/enhanced kinds +15, builder kinds: activeProjects ≥ 3 +20, annualVolume ≥ $5M +15. A ≥ 70, B ≥ 50, C ≥ 30, else D.

## Feasibility
- `POST /feasibility/runs` **public** (rate-limited 20/hr/IP for anon) `{ input: UnderwritingInput, leadId?, tier?: "lite|enhanced" }` → `201 { runId, result: UnderwritingResult, report: FeasibilityReport }`. Anonymous runs store `leadId` if given; authenticated runs attach to the user. Engine errors → `400 validation` with `fields`.
- `GET /feasibility/runs/:id` → `{ run: { id, status: "draft|reviewed|delivered", version, input, result, analystNotes, createdAt }, report }` (owner, lead email match via signed link, or staff)
- `GET /feasibility/runs/:id/report?tier=lite|enhanced` → `FeasibilityReport` (enhanced only if an enhanced order is paid or caller is staff)
- `GET /feasibility/runs?projectId=|leadId=` (auth)
- Staff: `POST /feasibility/runs/:id/review { input?: overrides, analystNotes }` → re-runs engine, bumps `version`, status `reviewed`; `POST /feasibility/runs/:id/deliver { tier }` → emails the report link, status `delivered`, emits `feasibility.delivered`.

## Orders, payments, credits
- `POST /orders { serviceCode, runId?, leadId?, projectId?, email? }` (public allowed for `feasibility_enhanced`) → `201 { orderId, amountCents, checkoutUrl? }` (Stripe Checkout when `STRIPE_SECRET_KEY` set; otherwise `status: "awaiting_payment"` and a dev `POST /orders/:id/mark-paid` exists outside production).
- `GET /orders/:id`; `GET /orders?projectId=` ; `POST /webhooks/stripe` **public** (signature verified) handles `checkout.session.completed` → order `paid`, emits `order.paid`, creates a `credit` for `feasibility_enhanced` (`amountCents: 75000`, `appliesTo: design_predev`, `expiresAt: +90d`).
- `GET /credits` → user's credits; credits auto-apply when a `design_predev` order is created (order shows `creditAppliedCents`).

## Projects (BOYL, co-dev, rebuild and builder portfolios share one model)
- `POST /projects { name, programType: "boyl|codev|rebuild|builder_ops", organizationId?, address, marketCode, lotSizeSf?, runId? }` → `201 { project }`. Creates default phases/milestones: Feasibility → Design & Pre-Dev → Entitlement & Permits → Construction → Handoff.
- `GET /projects?organizationId=` → list with summary numbers; `GET /projects/:id` → `{ project, summary: { budgetCents, committedCents, invoicedCents, paidCents, forecastAtCompletionCents, varianceCents, percentComplete, scheduleStatus: "on_track|at_risk|delayed", nextMilestone, openInvoices, drawStatus, riskLevel } }`; `PATCH /projects/:id`.
- Members: `GET/POST /projects/:id/members { userId|email, role: "owner|investor|gc|architect|lender|viewer" }`.
- Milestones: `GET /projects/:id/milestones`; `POST` `{ phase, name, plannedStart, plannedEnd, owner? }`; `PATCH /milestones/:id { status: "pending|in_progress|complete|blocked", actualStart?, actualEnd?, note? }`.
- Budget: `GET /projects/:id/budget` → `{ lines: [{ id, csiDivision: "01".."48", code, description, originalCents, approvedChangesCents, revisedCents, committedCents, invoicedCents, paidCents, forecastToCompleteCents, forecastAtCompletionCents, varianceCents }], totals }`; `POST /projects/:id/budget` (single or `{ lines: [] }` bulk); `PATCH /budget-lines/:id`.
- Commitments (POs / subcontracts): `GET/POST /projects/:id/commitments { vendorId, budgetLineId, description, amountCents, status: "draft|issued|closed" }`.
- Invoices: `GET /projects/:id/invoices?status=`; `POST { vendorId, commitmentId?, budgetLineId, invoiceNumber, amountCents, retainageCents?, invoiceDate, dueDate, documentId? }` → status `pending_approval`, emits `invoice.pending_approval`; `POST /invoices/:id/approve|reject|mark-paid { note? }`.
- Change orders: `GET/POST /projects/:id/change-orders { budgetLineId, description, amountCents, daysImpact, reason }` status `proposed → approved|rejected` via `POST /change-orders/:id/approve|reject`; approval updates `approvedChangesCents` and emits `change_order.approved`.
- Schedule: `GET/POST /projects/:id/schedule { name, start, end, percentComplete, dependsOn?, milestoneId? }`; `PATCH /schedule/:id`.
- Loans: `GET/POST /projects/:id/loans { lender, commitmentCents, rateBps, maturity, retainagePct, drawnCents }`.
- Draws: `GET /projects/:id/draws`; `POST /projects/:id/draws { loanId, periodEnd }` → auto-assembles approved-unpaid invoices into draw items, status `draft`, emits `draw.ready`; `GET /draws/:id` (items, totals, documents); `POST /draws/:id/submit|fund { fundedCents?, fundedAt? }` → `funded` reconciles items and marks invoices paid; emits `draw.submitted` / `draw.funded`.
- Cash flow: `GET /projects/:id/cashflow?weeks=12` → `{ weeks: [{ weekStart, outflowsCents, inflowsCents, netCents, cumulativeCents }], shortfall: { weekStart, amountCents } | null }` from schedule-weighted forecast-to-complete, open invoices and expected draw fundings. Emits `cash.shortfall_alert` when first computed negative.
- Documents: `POST /documents/presign { projectId, fileName, contentType, category }` → `{ uploadUrl, documentId, key }` (S3 when configured; local disk in dev); `POST /documents/:id/complete`; `GET /projects/:id/documents?category=`.
- Updates: `GET/POST /projects/:id/updates { body, photoDocumentIds[], visibility: "owner|investor|internal" }`.

## Portfolio (builder dashboard)
- `GET /portfolio/summary?organizationId=` → `{ activeProjects, constructionBudgetCents, committedCents, forecastAtCompletionCents, remainingLoanProceedsCents, cashNeeded30dCents, projectsAtRisk, reportsDue, projects: [{ id, name, stage, budgetCents, committedCents, facCents, scheduleStatus, drawStatus, riskLevel }] }`.

## Investors & reporting
- `GET/POST /projects/:id/investors { userId|email, commitmentCents, ownershipPct, prefReturnBps? }`
- `POST /projects/:id/capital-calls { amountCents, dueDate, memo }` → notifies investors.
- `GET /projects/:id/reports`; `POST /projects/:id/reports { period: "YYYY-MM" }` → generates `{ id, status: "draft", html, data: { budget, schedule, draws, photos, updatedReturns } }`; `POST /reports/:id/send` → emails investors, status `sent`, emits `report.sent`.

## Vendors & bids
- `GET/POST/PATCH /vendors { name, trades[], contactName, email, phone, licenseNo, licenseExpiry, insuranceExpiry, w9OnFile, rating }`; `GET /vendors?trade=&expiringWithinDays=`.
- `GET/POST /projects/:id/bids { scopeCode, vendorId, amountCents, leadTimeDays, notes }`; `GET /projects/:id/bids/compare?scopeCode=` → ranked with spread vs budget line.

## Assistant
- `POST /assistant/ask { question, projectId?, organizationId? }` → `{ answer, data?, actions: [{ type: "open_project|create_draw|generate_report|approve_invoice", label, payload }], model: "claude|rules" }`. Tools available to the model: `portfolio_summary`, `project_variance`, `cash_needs(days)`, `missing_invoices`, `draws_ready`, `generate_investor_report(projectId, period)`. Works without `ANTHROPIC_API_KEY` using deterministic rule answers for the six canonical questions.

## Events (outbox → n8n)
Every domain event is written to `events` and POSTed to `N8N_WEBHOOK_URL` with header `X-DirtBid-Signature: sha256=<hmac(body, WEBHOOK_SECRET)>`, retried with backoff (5 attempts). Payload `{ id, type, occurredAt, data }`. Types: `lead.created, lead.qualified, lead.status_changed, feasibility.run.completed, feasibility.delivered, order.created, order.paid, credit.issued, credit.applied, project.created, milestone.completed, invoice.pending_approval, invoice.approved, change_order.approved, draw.ready, draw.submitted, draw.funded, cash.shortfall_alert, budget.variance_alert, report.generated, report.sent, vendor.compliance_expiring`.
- `GET /events?type=&since=` (staff) for replay.

## Admin
- `GET /admin/pipeline` → leads grouped by status with counts and value; `GET /admin/metrics` → `{ leads7d, leads30d, runs30d, ordersPaid30d, revenue30dCents, conversionRate }`.
- `GET /health` **public** → `{ ok, db, version }`. `GET /docs` → Swagger UI; `GET /docs/json` → OpenAPI 3.1.

## Non-functional
- Zod-validated bodies/queries; OpenAPI generated from the same schemas.
- Rate limit public routes; helmet; CORS from `WEB_URL`.
- Audit log on every mutating staff action.
- Multi-tenant: every project/vendor/invoice row carries `organizationId`; row access enforced in a central policy helper, never ad hoc.
- Tests run against a real Postgres (`DATABASE_URL_TEST`), schema pushed fresh per run.
