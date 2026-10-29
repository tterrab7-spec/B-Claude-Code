/* Serve dist-demo statically and click through the whole product with Playwright. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium; try { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }

const ROOT = path.join(__dirname, '..', 'dist-demo');
const OUT = path.join(__dirname, '..', 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(4555, r));
  const BASE = 'http://localhost:4555/';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; const external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Public GIS services the parcel resolver calls from the browser in demo mode (CORS failures degrade to warnings in the UI).
  const GIS = /geocoding\.geo\.census\.gov|vginmaps\.vdem\.virginia\.gov|hazards\.fema\.gov|fwspublicservices\.wim\.usgs\.gov|epqs\.nationalmap\.gov|sdmdataaccess\.sc\.egov\.usda\.gov|arcgis\.com/i;
  const gisNoise = [];
  page.on('console', (m) => { if (m.type() !== 'error') return; const t = m.text(); if (/CORS|net::ERR_FAILED|Failed to load resource/.test(t)) gisNoise.push(t.slice(0, 120)); else errors.push(t); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !/fonts\.(googleapis|gstatic)\.com/.test(u) && !GIS.test(u)) external.push(u); });
  const must = async (label, fn) => { try { await fn(); console.log('ok  ', label); } catch (e) { console.log('FAIL', label, '-', e.message.split('\n')[0]); errors.push(`${label}: ${e.message}`); } };

  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
  await must('home renders with DEMO pill and banner', async () => { await page.waitForSelector('text=Demo data. Nothing here is a real project.'); await page.waitForSelector('text=The operating system between'); });
  await page.click('text=Got it');
  await must('dashboard loads with 4 projects and reconciled KPIs', async () => {
    await page.goto(BASE + 'index.html#/app', { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Cascade Ridge Phase 2');
    const text = await page.innerText('main');
    if (!/active projects\s*4/i.test(text)) throw new Error('active projects != 4: ' + text.slice(0, 200));
    await page.screenshot({ path: path.join(OUT, 'demo-dashboard-1440.png'), fullPage: true });
  });
  await must('open project budget tab', async () => {
    await page.click('text=Cascade Ridge Phase 2');
    await page.waitForSelector('text=Milestones');
    await page.click('a:has-text("Budget")');
    await page.waitForSelector('text=Rough carpentry & framing');
    await page.screenshot({ path: path.join(OUT, 'demo-project-budget-1440.png'), fullPage: true });
  });
  let approved = 0;
  await must('approve an invoice', async () => {
    await page.click('a:has-text("Invoices")');
    await page.waitForSelector('table');
    const btn = page.locator('button:has-text("Approve")').first();
    await btn.waitFor();
    const before = await page.locator('button:has-text("Approve")').count();
    await btn.click();
    await page.waitForFunction((n) => document.querySelectorAll('button').length && Array.from(document.querySelectorAll('button')).filter((b) => b.textContent === 'Approve').length < n, before);
    approved = 1;
  });
  await must('create, submit and fund a draw (invoices paid, loan drawn bumps)', async () => {
    await page.click('a:has-text("Draws")');
    await page.waitForSelector('button:has-text("Assemble draw")');
    const loanBefore = await page.locator('select option').first().innerText();
    const rowsBefore = await page.locator('table tbody tr').count();
    await page.click('button:has-text("Assemble draw")');
    await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length > n, rowsBefore);
    const row = page.locator('table tbody tr', { hasText: 'Draft' }).last();
    await row.locator('button:has-text("Submit")').click();
    await page.locator('table tbody tr', { hasText: 'Submitted' }).last().locator('button:has-text("Mark funded")').waitFor();
    await page.locator('table tbody tr', { hasText: 'Submitted' }).last().locator('button:has-text("Mark funded")').click();
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: 'networkidle' });
    const loanAfter = await page.locator('select option').first().innerText();
    if (loanAfter === loanBefore) throw new Error(`loan drawn did not change: ${loanBefore}`);
    await page.click('a:has-text("Invoices")');
    await page.waitForSelector('text=Paid');
  });
  await must('cash flow tab renders', async () => { await page.click('a:has-text("Cash flow")'); await page.waitForSelector('text=Cumulative'); });
  await must('generate and send investor report', async () => { await page.click('a:has-text("Investors & reports")'); await page.click('button:has-text("Generate")'); await page.waitForSelector('button:has-text("Send to investors")'); await page.click('button:has-text("Send to investors")'); await page.waitForSelector('text=Sent'); });
  await must('post an update', async () => { await page.click('a:has-text("Updates")'); await page.fill('textarea', 'Demo update from the click-through.'); await page.click('button:has-text("Post update")'); await page.waitForSelector('text=Demo update from the click-through.'); });
  await must('assistant answers the six canonical questions', async () => {
    await page.goto(BASE + 'index.html#/app/assistant', { waitUntil: 'networkidle' });
    for (const q of ['Which projects are trending over budget?', 'How much cash will we need over the next 30 days?', 'Which subcontractor invoices are still missing?', 'What lender draws are ready to submit?']) { await page.click(`button:has-text("${q}")`); await page.waitForTimeout(250); }
    await page.waitForSelector('text=forecast at completion');
    await page.waitForSelector('text=Net cash need');
    await page.screenshot({ path: path.join(OUT, 'demo-assistant-1440.png'), fullPage: true });
  });
  await must('leads board: change status and convert', async () => {
    await page.goto(BASE + 'index.html#/app/leads', { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Denise Carver');
    await page.click('text=Denise Carver');
    await page.selectOption('aside select', 'qualified');
    await page.click('button:has-text("Convert to project")');
    await page.waitForSelector('text=Milestones');
  });
  await must('saved feasibility run renders', async () => { await page.goto(BASE + 'index.html#/app/feasibility/run_va_bigbethel', { waitUntil: 'networkidle' }); await page.waitForSelector('text=Approval probability'); await page.waitForSelector('text=Analyst notes'); });
  await must('calculator computes', async () => {
    await page.goto(BASE + 'index.html#/calculator', { waitUntil: 'networkidle' });
    await page.fill('#zoning', 'R-10'); await page.fill('#lotSize', '12000'); await page.fill('#arvPerSf', '290');
    await page.click('button:has-text("Calculate offers")'); await page.waitForSelector('text=Scenarios');
    await page.click('button:has-text("Save & email my full report")');
    await page.fill('input[name="fullName"]', 'Demo Tester'); await page.fill('input[name="email"]', 'demo.tester@example.com'); await page.check('input[type="checkbox"][name="consent"]');
    await page.click('button:has-text("Save run")'); await page.waitForSelector('text=Saved ·');
  });
  await must('create a lead from /feasibility with instant report', async () => {
    await page.goto(BASE + 'index.html#/feasibility', { waitUntil: 'networkidle' });
    await page.fill('input[name="fullName"]', 'Pat Landowner'); await page.fill('input[name="email"]', 'pat.landowner@example.com'); await page.fill('input[name="address"]', '77 Todds Ln, Hampton, VA 23666'); await page.fill('input[name="zip"]', '23666'); await page.fill('input[name="lotSize"]', '15000'); await page.fill('input[name="zoningCode"]', 'R-10'); await page.check('input[name="consent"]');
    await page.click('button:has-text("Get my free report")'); await page.waitForSelector('text=Request received'); await page.waitForSelector('text=Approval probability');
    await page.goto(BASE + 'index.html#/app/leads', { waitUntil: 'networkidle' }); await page.waitForSelector('text=Pat Landowner');
  });
  await must('login page shows demo persona buttons and switches to builder', async () => { await page.goto(BASE + 'index.html#/login', { waitUntil: 'networkidle' }); await page.click('button:has-text("Enter demo as builder")'); await page.waitForSelector('text=Kevin Marsh'); });
  await must('reset demo data', async () => {
    await page.locator('button:has-text("Reset demo data")').locator('visible=true').first().click();
    await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('dirtbid_demo_state')).leads.length === 5; } catch { return false; } }, null, { timeout: 5000 });
    await page.goto(BASE + 'index.html#/app/leads', { waitUntil: 'networkidle' }); await page.waitForSelector('text=Denise Carver');
    await page.waitForFunction(() => !document.body.innerText.includes('Pat Landowner'), null, { timeout: 5000 });
  });
  await browser.close(); server.close();
  console.log('external requests (non-GIS):', external.length ? external : 'none');
  console.log('GIS CORS degradations (expected in a browser-only demo):', gisNoise.length);
  console.log('page errors:', errors.length ? errors : 'none');
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
