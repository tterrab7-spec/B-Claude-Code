# TUNED

Performance maintenance for men. Licensed physical therapy built like a training program.
One clinical engine, five front doors (Pain, Sport, Life stage, Work, Service).

## Run it

```bash
cd tuned
npm install
CLINICIAN_KEY=pick-a-secret ANTHROPIC_API_KEY=sk-ant-... npm start
# open http://localhost:8080
```

- No `ANTHROPIC_API_KEY`: everything still works. The coach runs on built-in clinical rules instead of Claude.
- `npm test` runs the engine, scoring and RTM checks.
- The `public/` folder also runs as plain static files (GitHub Pages, S3, Netlify). In that mode data stays on the device; Squads by code, the PT dashboard and partner stats need the server.
- Camera and microphone require HTTPS (or localhost).

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | 8080 | HTTP port |
| `CLINICIAN_KEY` | `tuned-demo` | Key PTs enter at `#/pt`. Change it. |
| `ADMIN_KEY` | same as clinician key | Partner admin at `#/partners` |
| `ANTHROPIC_API_KEY` | none | Turns on the Claude-powered coach |
| `COACH_MODEL` | `claude-opus-5-5` | Coach model |
| `DATA_FILE` | `data/db.json` | Storage file |

## What's in it

| Feature | Where | How it works |
| --- | --- | --- |
| Body Score | `js/screen.js`, `js/pose.js` | 5 camera tests (overhead squat, toe touch, overhead reach, single-leg balance, head turn). MediaPipe pose runs on the phone; video is never uploaded. Scores mobility, stability, control and symmetry, mapped to 300-850. Self-test fallback with no camera. |
| 6-week Sprints | `js/data.js`, `js/engine.js` | 19 programs covering every front door, 75 exercises. 3 two-week phases, 4 sessions a week, A/B rotation. Re-score is prompted at week 2 (the drop-off window) and week 6. |
| Progression engine | `js/engine.js` | After every session: pain flare (7+ or 2 over baseline) eases the plan; two easy, low-pain sessions level it up. Every change lands in the PT review queue. |
| AI coach | `js/coach.js`, `server.js` | Chat and voice check-ins (browser speech). Claude on the server with a PT-supervised system prompt and hard red-flag rules; rules coach offline. Urgent symptoms short-circuit to "get care now" before any model call. |
| Form checks | `#/form/<exercise>` | Live camera or uploaded video. Counts reps and calls out knee cave, depth and hinge faults by voice. |
| Squads | `#/squad` | Create or join by code, weekly challenge, leaderboard on Tune Points. |
| Quiet Mode | Settings or the pelvic door | Neutral light theme, "Daily" in place of the brand and tab title, neutral exercise names, optional PIN lock, bladder pad log for post-prostatectomy rehab. |
| Safety | Intake | Red-flag screen. Urgent answers stop the flow and route to a physician. Post-op requires surgeon clearance. Out-of-license states are flagged. |
| PT dashboard | `#/pt`, `js/pt.js`, `js/clinic.js` | Caseload triaged by alert level (urgent symptoms, intake flags, drop-off risk, pain flares, unread messages, low compliance, visit requests, out-of-license state). Patient chart: program assignment, compliance % with a 6-week calendar, pain / Body Score / weight trends, two-way messages, plan editor (swap, sets, reps, note to patient), coach change review, clinical notes with a SOAP draft, RTM time, video visits, session log. |
| Program builder | `#/pt/programs` | Build programs from scratch or duplicate a TUNED one: 3 phases, Session A and B, each exercise with its own sets, reps or time, and a note to the patient. Assign from any chart. |
| Exercise library | `#/pt/exercises` | All 75 exercises plus your own. Attach a demo video (YouTube, Vimeo or .mp4) to any exercise; it plays inside the patient's session and is linked in the daily email. |
| Billing | `#/pt/billing` | RTM status per patient this period, estimated revenue (rates in `config.js`), next action to reach the next code, CSV export. |
| System | `#/pt/system` | The backend, visible: connection and storage, architecture, record counts, live activity (patient events plus the PT audit log), the raw stored record for any patient, full JSON export, daily email preview, and the API endpoint list. |
| Daily email | `js/email.js`, `GET /api/daily`, `n8n/daily-session-email.json` | Each morning n8n pulls one "today's session" email per opted-in patient and sends it through your email provider. |
| Demo clinic | `js/demo.js` | With no server, the PT dashboard runs on-device with six sample patients built by replaying sessions through the real engine, plus the device's own patient. With the server, a toggle mixes the demo patients in. |
| RTM billing | `js/rtm.js` | Tracks data days per 30-day period and management minutes per month against 98975, 98977, 98985, 98979, 98980, 98981 (CY2026 code set). |
| Partners | `#/partners` | Channel playbooks, printable QR chair cards per partner code and front door, attribution (scans, signups, scored, active, paid). |
| Plans | `#/plans`, `js/config.js` | Free Body Score, $39/mo membership, $249 Sprint + PT, $79 kit. Paste Stripe Payment Links into `config.js`. |

Launch partner: The Dad Back (`?ref=DADBACK`) lands on the Dad Sprint with a co-brand strip. Partner codes, pricing and PT license states are all in `public/js/config.js`.

## Deploy (shared data across devices)

The Netlify / static version keeps data on each device. For a PT and patients on different phones, run the server:

1. **Render (simplest).** render.com > New > Blueprint > pick this repo. `render.yaml` at the repo root sets everything up, including a 1 GB disk for the data file and generated `CLINICIAN_KEY` / `ADMIN_KEY`. Set `APP_URL` to the site address and, optionally, `ANTHROPIC_API_KEY` for the Claude coach. Starter plan, about $7/month.
2. **Anywhere with Node 20+.** `cd tuned && npm ci --omit=dev && CLINICIAN_KEY=... ADMIN_KEY=... APP_URL=https://... node server.js`, behind HTTPS.
3. **Daily email.** In n8n, import `n8n/daily-session-email.json`, set the server URL and admin key in the HTTP Request node and your email credentials in the Send Email node.

## Before real patients (pilot to production)

This build is ready for demos, a closed beta and investor walkthroughs. It is **not** HIPAA-ready yet:

1. **Hosting under a BAA.** AWS (sign the BAA) with RDS Postgres replacing `data/db.json`, encryption at rest, backups.
2. **Real auth.** Patient accounts (email or SMS login) instead of device IDs; per-PT accounts and audit logs instead of a shared clinician key.
3. **Video vendor with a BAA.** Swap the Jitsi links in `server.js` for Doxy.me, Zoom for Healthcare or similar.
4. **Anthropic** for PHI in the coach: use a BAA-covered arrangement with Anthropic or a BAA cloud provider before sending real patient context.
5. **Payments.** Stripe Payment Links in `config.js`, then a webhook to set `plan` server-side.
6. **Clinical sign-off.** Your supervising PT should review every Sprint in `data.js` and the progression thresholds in `engine.js`. RTM rules vary by payer; confirm with your biller.
7. **Native shells.** The app is a PWA (installable now). Wrap with Capacitor for App Store distribution when needed.
