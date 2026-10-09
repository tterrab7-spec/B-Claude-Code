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
| PT dashboard | `#/pt` | Caseload triage by alert level, drop-off risk, pain and score trends, AI change approve/revert (reverts sync back to the patient), messaging, video visit scheduling, time logging. |
| RTM billing | `js/rtm.js` | Tracks data days per 30-day period and management minutes per month against 98975, 98977, 98985, 98979, 98980, 98981 (CY2026 code set). |
| Partners | `#/partners` | Channel playbooks, printable QR chair cards per partner code and front door, attribution (scans, signups, scored, active, paid). |
| Plans | `#/plans`, `js/config.js` | Free Body Score, $39/mo membership, $249 Sprint + PT, $79 kit. Paste Stripe Payment Links into `config.js`. |

Launch partner: The Dad Back (`?ref=DADBACK`) lands on the Dad Sprint with a co-brand strip. Partner codes, pricing and PT license states are all in `public/js/config.js`.

## Before real patients (pilot to production)

This build is ready for demos, a closed beta and investor walkthroughs. It is **not** HIPAA-ready yet:

1. **Hosting under a BAA.** AWS (sign the BAA) with RDS Postgres replacing `data/db.json`, encryption at rest, backups.
2. **Real auth.** Patient accounts (email or SMS login) instead of device IDs; per-PT accounts and audit logs instead of a shared clinician key.
3. **Video vendor with a BAA.** Swap the Jitsi links in `server.js` for Doxy.me, Zoom for Healthcare or similar.
4. **Anthropic** for PHI in the coach: use a BAA-covered arrangement with Anthropic or a BAA cloud provider before sending real patient context.
5. **Payments.** Stripe Payment Links in `config.js`, then a webhook to set `plan` server-side.
6. **Clinical sign-off.** Your supervising PT should review every Sprint in `data.js` and the progression thresholds in `engine.js`. RTM rules vary by payer; confirm with your biller.
7. **Native shells.** The app is a PWA (installable now). Wrap with Capacitor for App Store distribution when needed.
