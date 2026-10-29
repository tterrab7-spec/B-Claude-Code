/* Screenshot every public route plus calculator result and portal empty state. Run `pnpm preview` first or let this script start it. */
// Prefer the system-installed Playwright (matches the preinstalled browser); fall back to the local one with an explicit executable.
let chromium;
try { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }
const EXEC = process.env.CHROME_PATH || (fsExists('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
function fsExists(p) { try { return require('node:fs').existsSync(p); } catch { return false; } }
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const OUT = path.join(__dirname, '..', 'screenshots');
const ROUTES = ['/', '/feasibility', '/pricing', '/calculator', '/homebuilder', '/builders', '/get-started', '/ai', '/login', '/nope'];
const WIDTHS = [1440, 390];

async function waitFor(url, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.ok) return true; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('preview server did not start');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let server = null;
  try { await fetch(BASE); } catch { server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' }); await waitFor(BASE); }
  const browser = await chromium.launch(EXEC && !require.resolve('playwright').startsWith('/opt/node-tools') ? { executablePath: EXEC } : {});
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 844 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    for (const r of ROUTES) {
      await page.goto(BASE + r, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const name = r === '/' ? 'home' : r.slice(1).replace(/\//g, '_');
      await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
      const sw = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      console.log(`${r} @${width}${sw ? '  !! horizontal overflow' : ''}`);
    }
    // calculator with a computed result
    await page.goto(BASE + '/calculator', { waitUntil: 'networkidle' });
    await page.fill('#address', '12 Example Ln, Hampton, VA 23666');
    await page.fill('#zip', '23666');
    await page.fill('#zoning', 'R-10');
    await page.fill('#lotSize', '12000');
    await page.fill('#arvPerSf', '290');
    const selects = await page.$$('select');
    for (const s of selects) { const opts = await s.$$eval('option', (o) => o.map((x) => x.value)); if (opts.includes('X')) await s.selectOption('X'); }
    const tri = await page.$$('select');
    for (const s of tri) { const lbl = await s.evaluate((el) => el.closest('label')?.textContent || ''); if (/^(Water|Sewer|Power|Chesapeake)/.test(lbl.trim())) await s.selectOption(/Chesapeake/.test(lbl) ? 'no' : 'yes'); }
    await page.click('button:has-text("Calculate offers")');
    await page.waitForSelector('text=Scenarios');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `calculator-result-${width}.png`), fullPage: true });
    console.log(`/calculator (result) @${width}`);
    // calculator address-first flow with a mocked /parcels/resolve (the live API is not running under vite preview)
    if (width === 1440) {
      const fixture = require('./fixtures/parcel.json');
      await page.route('**/v1/parcels/resolve', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ parcel: fixture }) }));
      await page.goto(BASE + '/calculator', { waitUntil: 'networkidle' });
      await page.fill('#resolve-address', fixture.query);
      await page.click('button:has-text("Resolve parcel")');
      await page.waitForSelector('text=We confirm zoning', { timeout: 1000 }).catch(() => {});
      await page.waitForSelector('text=VGIN parcels');
      await page.fill('#zoning', 'R-10');
      await page.click('button:has-text("Calculate offers")');
      await page.waitForSelector('text=Site Work');
      await page.screenshot({ path: path.join(OUT, 'calculator-address-1440.png'), fullPage: true });
      await page.unroute('**/v1/parcels/resolve');
      console.log('/calculator (address) @1440');
    }
    // portal empty state with a fake token (API offline)
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('dirtbid_token', 'screenshot-token'));
    await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `app-dashboard-${width}.png`), fullPage: true });
    await page.goto(BASE + '/app/assistant', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT, `app-assistant-${width}.png`), fullPage: true });
    console.log(`/app @${width}`);
    await ctx.close();
  }
  await browser.close();
  if (server) server.kill();
  console.log('done →', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
