# DeLeon Barber & Beauty Academy — website

Single-file marketing and enrollment site for DeLeon Barber & Beauty Academy
(5316 Menchaca Rd, Austin, TX 78745), including the working shop floor the school
is attached to.

`index.html` is fully self-contained: styles, scripts and the shield mark are inline.
No build step, no dependencies. Only external request is Google Fonts.

## Deploy

Drop `index.html` on any static host. GitHub Pages: Settings → Pages → deploy from
this branch, root. Netlify/Vercel/S3/Cloudflare Pages all work with zero config.

## What's live on the page

- **Campus status** — computes America/Chicago time against posted hours and shows
  Open Now / Closed with time remaining for tours. Refreshes every 60s. Same logic
  drives the Open/Closed pills on both location cards.
- **Tuition planner** — pay-in-full / 12 / 9 / 6-month plans with down payment,
  weekly payment, term and the full fee breakdown.
- **Off-hours price clock** — slider on The Floor reprices haircut services to the
  flat $60 before-hours / after-hours rate outside 9 AM – 7 PM.
- Theme follows the visitor's system setting; manual toggle in the footer persists.

## Brand

DeLeon is the primary identity throughout: title, nav, wordmark, hero, footer.
The wordmark is Bodoni Moda with a chrome gradient, matching the engraved serif in
the existing logo. Type is Bodoni Moda (display), Big Shoulders Display (signage
labels), Archivo (body and figures). Dark-first chrome-on-black palette with oxblood
and brass accents; The Floor section inverts to bone so the shop reads as a distinct
space from the school.

The barbershops are named as Country Cutz in exactly one place — the note explaining
where post-graduation placement comes from — because that relationship is the reason
the placement claim holds. Say the word and it comes out entirely.

## Source of the content

| Item | Source |
| --- | --- |
| Programs, tuition, payment plans, admissions, scholarship, hotline, "Why Choose" points, Educate/Elevate/Empower | DeLeon Academy enrollment flyer |
| Campus address, service area, bilingual, deleonacademy.com, Instagram | Facebook page details |
| Shop hours, service prices, off-hours rate | Squire listing for the South Austin shop |
| Bastrop address, hours, phone, email | Bastrop shop listings |

No testimonials, ratings, instructor names, graduation rates, job-placement
statistics or accreditation claims were invented. Anything not verifiable was left off.

## Before this goes to production

1. **Logo.** The shield is an original SVG stand-in — a lion crest over the Austin
   skyline. Hand over the real DeLeon chrome lion artwork (SVG preferred, PNG fine)
   and it drops straight in.
2. **Contact form.** Posts via `mailto:` to countrycutz512@gmail.com. Wire it to a
   real endpoint (n8n webhook, Formspree, Lambda) so enrollment leads are trackable.
3. **A dedicated academy email.** Everything currently routes to the shop's Gmail.
   An admissions@ address would separate enrollment leads from haircut questions.
4. **Photos.** The design is typographic on purpose. Classroom floor, students at the
   chair, and graduation shots will lift it considerably.
5. **Compliance review.** A licensed Texas school site usually needs TDLR license
   number, refund policy, and any required disclosures. Nothing here claims
   accreditation or outcomes, but have whoever handles compliance read it before launch.
6. **Verify tuition, plan terms, hours and prices** with the school before launch.
