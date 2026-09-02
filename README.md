# Country Cutz Barbershop — website

Single-file marketing site for Country Cutz Barbershop (South Austin + Bastrop) and
DeLeon Barber & Beauty Academy.

`index.html` is fully self-contained: styles, scripts and the shield mark are inline.
No build step, no dependencies. Only external request is Google Fonts.

## Deploy

Drop `index.html` on any static host. GitHub Pages: Settings → Pages → deploy from
this branch, root. Netlify/Vercel/S3/Cloudflare Pages all work with zero config.

## What's live on the page

- **Shop status** — computes America/Chicago time against each shop's posted hours and
  shows Open Now / Closed with time until open or close. Refreshes every 60s.
- **Off-hours price clock** — slider reprices haircut services to the flat $60
  before-hours / after-hours rate when the selected time falls outside 9 AM – 7 PM.
- **Tuition planner** — pay-in-full / 12 / 9 / 6-month plans with down payment,
  weekly payment and term.
- Theme follows the visitor's system setting; manual toggle in the footer persists.

## Source of the content

| Item | Source |
| --- | --- |
| South Austin address, hours, service prices, 12 barbers | Squire listing for Country Cutz Barbershop South Austin |
| Bastrop address, hours, phone, email | Bastrop shop listings + Facebook |
| Service area (Austin, Buda, Kyle, San Marcos, Bastrop), bilingual, Instagram, deleonacademy.com | Facebook page details |
| Academy programs, tuition, payment plans, admissions, scholarship, hotline | DeLeon Academy enrollment flyer |

No testimonials, ratings, barber names or founding dates were invented. Anything not
verifiable was left off.

## Before this goes to production

1. **Booking links.** "Book a Cut" currently scrolls to the shops section. Swap in the
   real theCut / Squire / Booksy deep links for each shop.
2. **South Austin phone.** Only the Bastrop shop line (512) 409-3211 and the Academy
   enrollment hotline (512) 375-8142 were verifiable. Add the Menchaca Rd line if it differs.
3. **Contact form.** Posts via `mailto:` to countrycutz512@gmail.com. Wire it to a real
   endpoint (n8n webhook, Formspree, Lambda) so leads land somewhere trackable.
4. **Photos.** The design is typographic on purpose — no stock photos. Shop interior,
   fade work and student photos will lift it considerably; the hero and shop cards have
   room for them.
5. **Logo.** The shield in the nav is an original SVG stand-in. Drop in the real DeLeon
   chrome lion shield artwork.
6. **Verify prices and hours** with the shop before launch.
