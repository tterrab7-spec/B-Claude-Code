# buildosdev.com teardown (crawled 2026-10-29)

**What it is.** A Lovable-built React SPA behind Cloudflare marketing a vertically integrated development services firm (feasibility → design → permitting → construction → owner's rep) for landowners, fire-rebuild homeowners in LA County, first-time builders and residential builders. Active in WA and FL per the copy, launching CA.

**Backend as shipped.**
- One Supabase project, one edge function (`homeowner-signup`) called from `/get-started`.
- Jotform for the Feasibility Lite intake (name, email, phone, address, APN, property type, goals).
- Calendly for every "book a call" CTA; Intuit payment link for the $750 report.
- A second Lovable app (`altadena-offer-builder.lovable.app`) iframed at `/altadena-calculator`; all math client-side.
- Resend for email. No portal, no auth'd routes, no project data model. Dashboard visuals are static mockups.

**Routes.** `/`, `/feasibility`, `/pricing`, `/homebuilder`, `/california` (`/ca`), `/altadena-calculator`, `/get-started` (`/rebuild`), `/firerebuilds` (`/rebuildca`), `/forbuilders`, `/ai`. Full page text is in `buildosdev-crawl/`.

**Pricing ladder.** Feasibility $750 flat (vs $3,500+ typical) → Design & Pre-Development $5,000 flat → Entitlement & Permitting from $10,000 scope-based → Construction quoted. $750 credited to Step 2 within 90 days. Builder service levels: Oversight, Owner's Rep, Full Delivery (quoted). AI sprint: $997 audit, from $5,000 implementation, from $1,000/mo ops.

**Calculator model (constants from the bundle).** Hard $350/sf on living×1.30, ADU $200/sf capped 1,100 sf, soft 10%, demo $35k, sale costs 5%+3%, target ROI 40%, ADU premium +$300/sf on primary sf only, VHFHSZ haircut −5% offer/+3% cost (−3%/+2% boundary/unknown). `maxOffer = (ARV − saleCosts − 1.4×costs)/1.4`. Scenarios: accelerated rebuild (+10%), rebuild+ADU, SB 9 density at 45% FAR. Zoning table: R-1, R-1-7500/10000/20000, R-A, R-2, R-3 under the Altadena CSD. Overlays: SB 9 two-unit and lot split, ADU/JADU counts (SB 1211), Eaton Fire like-for-like +10%/200 sf, expedited permit lane, 20 ft front setback override, VHFHSZ ADU parking check.

**Gaps we closed.** Real data model and portal, instant lite reports, versioned analyst review, Stripe + automatic credit-back, draws and cash flow, investor reporting, vendor compliance, assistant over live data, signed event stream to n8n, Virginia market with Chesapeake Bay / FEMA / VDOT / HRSD overlays and a finished-lots exit scenario, financing and contingency in the pro forma.
