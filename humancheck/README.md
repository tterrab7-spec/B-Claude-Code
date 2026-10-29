# HumanCheck

Pre-send screen for anything you wrote with AI help. Four steps on one page:

1. **Scan.** Finds hidden characters that act as watermarks or tracers (zero-width spaces and joiners, byte-order marks, soft hyphens, odd Unicode spaces, direction controls, variation selectors, tag characters, and Cyrillic or Greek look-alike letters). Also flags typographic fingerprints (curly quotes, em dashes, ellipsis characters) and scores the writing on the signals detectors key on: sentence rhythm, model vocabulary, signpost openers, lists of three, "not X but Y" framing, uniform paragraphs, markdown scaffolding, stock closers, and the absence of contractions or specifics.
2. **Clean hidden marks.** Strips every hidden character and converts typographic marks to plain keyboard characters.
3. **Humanize.** Claude rewrites the draft in your tone, optionally matching a sample of your own writing. Facts, names, numbers and commitments are kept verbatim.
4. **Verify.** Re-scans the rewrite and asks Claude for a second, calibrated opinion with the sentences it would flag. The verdict blends both.

Scanning and cleaning run entirely in the browser. Only Humanize and Deep check call Claude.

## Run it

```bash
cd humancheck
npm install
cp .env.example .env    # add your ANTHROPIC_API_KEY
export $(cat .env | xargs)
npm start               # http://localhost:3000
```

Without an API key the app still runs in scan-only mode.

## Deploy

Any Node host works (Railway, Render, Fly, an EC2 box behind nginx). Set `ANTHROPIC_API_KEY` in the host's environment, run `npm start`. The key stays on the server. `public/index.html` is generated from `app.html` at build time.

## Files

- `app.html` – the whole front end (page body). Shared with the hosted Claude artifact.
- `build.js` – wraps `app.html` into `public/index.html`.
- `server.js` – Express server: static files plus `/api/humanize`, `/api/judge`, `/api/health`.

## Honest limits

No AI detector is reliable, including the paid ones. This tool removes the mechanical tells and the hidden characters, and gives you a calibrated read. It does not guarantee a pass on any specific detector, and nothing should.
