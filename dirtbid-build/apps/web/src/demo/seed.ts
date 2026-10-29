/**
 * Deterministic seed for demo mode. Every number on the dashboard is derived
 * from these rows, so the portfolio reconciles with the project tabs.
 */
import { underwrite, type UnderwritingInput, type UnderwritingResult } from '@dirtbid/underwriting';

export type Id = string;
export interface DUser { id: Id; email: string; fullName: string; phone?: string; roles: string[]; organizationIds: Id[] }
export interface DOrg { id: Id; name: string }
export interface DLead { id: Id; kind: string; status: string; grade: 'A' | 'B' | 'C' | 'D'; score: number; contact: { fullName: string; email: string; phone?: string }; property?: Record<string, unknown>; answers?: Record<string, unknown>; consent: boolean; utm?: Record<string, string>; assigneeUserId?: Id | null; notes?: string | null; createdAt: string; updatedAt: string; events: { at: string; type: string; note?: string }[] }
export interface DRun { id: Id; status: 'draft' | 'reviewed' | 'delivered'; version: number; input: UnderwritingInput; result: UnderwritingResult; leadId?: Id | null; projectId?: Id | null; userId?: Id | null; analystNotes?: string | null; createdAt: string }
export interface DProject { id: Id; organizationId: Id; name: string; programType: string; address: string; marketCode: string; lotSizeSf?: number; stage: string; scheduleStatus: 'on_track' | 'at_risk' | 'delayed'; scheduleNote?: string; riskLevel: 'low' | 'moderate' | 'high'; status: 'active' | 'closed'; createdAt: string }
export interface DMilestone { id: Id; projectId: Id; phase: string; name: string; plannedStart: string; plannedEnd: string; actualStart?: string | null; actualEnd?: string | null; status: 'pending' | 'in_progress' | 'complete' | 'blocked'; owner?: string | null }
export interface DBudgetLine { id: Id; projectId: Id; csiDivision: string; code: string; description: string; originalCents: number; approvedChangesCents: number; forecastToCompleteCents: number }
export interface DCommitment { id: Id; projectId: Id; vendorId: Id; budgetLineId: Id; description: string; amountCents: number; status: 'draft' | 'issued' | 'closed' }
export interface DInvoice { id: Id; projectId: Id; vendorId: Id; commitmentId?: Id | null; budgetLineId: Id; invoiceNumber: string; amountCents: number; retainageCents: number; invoiceDate: string; dueDate: string; status: 'pending_approval' | 'approved' | 'rejected' | 'paid'; drawId?: Id | null; paidAt?: string | null }
export interface DLoan { id: Id; projectId: Id; lender: string; commitmentCents: number; rateBps: number; maturity: string; retainagePct: number; drawnCents: number }
export interface DDraw { id: Id; projectId: Id; loanId: Id; periodEnd: string; status: 'draft' | 'submitted' | 'funded'; items: { id: Id; invoiceId: Id; amountCents: number; description: string }[]; totalCents: number; fundedCents?: number | null; fundedAt?: string | null; submittedAt?: string | null; createdAt: string }
export interface DScheduleItem { id: Id; projectId: Id; name: string; start: string; end: string; percentComplete: number; milestoneId?: Id | null; budgetLineIds: Id[] }
export interface DInvestor { id: Id; projectId: Id; userId?: Id; email: string; name: string; commitmentCents: number; ownershipPct: number; prefReturnBps?: number }
export interface DReport { id: Id; projectId: Id; period: string; status: 'draft' | 'sent'; html: string; data: unknown; createdAt: string; sentAt?: string | null }
export interface DDocument { id: Id; projectId: Id; fileName: string; category: string; contentType: string; createdAt: string; status: 'pending' | 'complete' }
export interface DUpdate { id: Id; projectId: Id; body: string; visibility: string; createdAt: string; authorName: string; photoDocumentIds: string[] }
export interface DVendor { id: Id; organizationId: Id; name: string; trades: string[]; contactName: string; email: string; phone: string; licenseNo: string; licenseExpiry: string; insuranceExpiry: string; w9OnFile: boolean; rating: number }
export interface DEvent { id: Id; type: string; occurredAt: string; data: unknown }
export interface DemoState {
  version: number; seededAt: string; currentToken: string | null;
  users: DUser[]; orgs: DOrg[]; leads: DLead[]; runs: DRun[]; projects: DProject[]; milestones: DMilestone[]; budgetLines: DBudgetLine[]; commitments: DCommitment[]; invoices: DInvoice[]; loans: DLoan[]; draws: DDraw[]; scheduleItems: DScheduleItem[]; investors: DInvestor[]; reports: DReport[]; documents: DDocument[]; updates: DUpdate[]; vendors: DVendor[]; events: DEvent[];
}

export const SEED_VERSION = 3;
export const ORG_ID = 'org_cascade';
export const STAFF_TOKEN = 'demo:staff';
export const BUILDER_TOKEN = 'demo:builder';

let seq = 0;
const id = (p: string) => `${p}_${(++seq).toString(36).padStart(4, '0')}`;
const day = (offset: number, base = new Date()) => { const d = new Date(base); d.setUTCHours(12, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString(); };
const M = (n: number) => Math.round(n * 1_000_000 * 100); // $ millions → cents
const K = (n: number) => Math.round(n * 1_000 * 100);

/** CSI mix used to split a project budget into lines (weights sum to 1). */
const CSI_MIX: [string, string, string, number][] = [
  ['01', '01-000', 'General requirements & supervision', 0.06],
  ['02', '02-400', 'Demolition & site clearing', 0.02],
  ['03', '03-300', 'Concrete: footings, slabs, flatwork', 0.09],
  ['06', '06-100', 'Rough carpentry & framing', 0.17],
  ['07', '07-300', 'Roofing, siding & waterproofing', 0.07],
  ['08', '08-500', 'Windows & exterior doors', 0.04],
  ['09', '09-200', 'Drywall, paint & finishes', 0.08],
  ['22', '22-000', 'Plumbing', 0.07],
  ['23', '23-000', 'HVAC', 0.06],
  ['26', '26-000', 'Electrical', 0.07],
  ['31', '31-200', 'Earthwork, grading & erosion control', 0.09],
  ['32', '32-100', 'Paving, curb & landscaping', 0.05],
  ['33', '33-000', 'Site utilities: water, sewer, storm', 0.08],
  ['00', '00-900', 'Contingency', 0.05],
];

interface ProjectSpec {
  key: string; name: string; address: string; stage: string; budget: number; committed: number; fac: number; invoicedPct: number; paidPctOfInvoiced: number;
  scheduleStatus: DProject['scheduleStatus']; scheduleNote?: string; riskLevel: DProject['riskLevel']; drawState: 'ready' | 'submitted' | 'final' | 'none'; loan: { lender: string; commitment: number; drawnPct: number; rateBps: number };
  startOffset: number; durationDays: number; percentComplete: number; programType: string; lotSizeSf: number; zoning: string;
}

const SPECS: ProjectSpec[] = [
  { key: 'cascade', name: 'Cascade Ridge Phase 2', address: '4401 Cascade Ridge Dr, Chesapeake, VA 23322', stage: 'framing', budget: 6.4, committed: 4.1, fac: 6.35, invoicedPct: 0.46, paidPctOfInvoiced: 0.78, scheduleStatus: 'on_track', riskLevel: 'low', drawState: 'ready', loan: { lender: 'TowneBank', commitment: 4.8, drawnPct: 0.42, rateBps: 850 }, startOffset: -150, durationDays: 420, percentComplete: 0.44, programType: 'builder_ops', lotSizeSf: 261360, zoning: 'R-10' },
  { key: 'alderwood', name: 'Alderwood Townhomes', address: '1200 Alderwood Way, Suffolk, VA 23435', stage: 'sitework', budget: 9.8, committed: 5.9, fac: 9.7, invoicedPct: 0.31, paidPctOfInvoiced: 0.72, scheduleStatus: 'at_risk', scheduleNote: '+3 days', riskLevel: 'moderate', drawState: 'submitted', loan: { lender: 'Atlantic Union Bank', commitment: 7.35, drawnPct: 0.27, rateBps: 875 }, startOffset: -95, durationDays: 540, percentComplete: 0.3, programType: 'builder_ops', lotSizeSf: 348480, zoning: 'R-2F' },
  { key: 'sunset', name: 'Sunset 4-plex', address: '812 Sunset Ave, Norfolk, VA 23518', stage: 'punch', budget: 1.9, committed: 1.85, fac: 1.92, invoicedPct: 0.95, paidPctOfInvoiced: 0.9, scheduleStatus: 'on_track', riskLevel: 'low', drawState: 'final', loan: { lender: 'Old Point National Bank', commitment: 1.45, drawnPct: 0.86, rateBps: 900 }, startOffset: -300, durationDays: 320, percentComplete: 0.96, programType: 'builder_ops', lotSizeSf: 9600, zoning: 'R-M' },
  { key: 'harbor', name: 'Harbor Infill', address: '23 Harbor View Ct, Hampton, VA 23669', stage: 'permit', budget: 3.2, committed: 0.4, fac: 3.2, invoicedPct: 0.09, paidPctOfInvoiced: 0.85, scheduleStatus: 'delayed', scheduleNote: 'Permit delay', riskLevel: 'high', drawState: 'none', loan: { lender: 'TowneBank', commitment: 2.4, drawnPct: 0.0, rateBps: 850 }, startOffset: -40, durationDays: 400, percentComplete: 0.08, programType: 'builder_ops', lotSizeSf: 14500, zoning: 'R-10' },
];

const VENDORS: Omit<DVendor, 'id' | 'organizationId'>[] = [
  { name: 'Tidewater Framing LLC', trades: ['06 Framing'], contactName: 'Marcus Reed', email: 'marcus@tidewaterframing.example', phone: '(757) 555-0141', licenseNo: 'VA-2705-118822', licenseExpiry: day(300), insuranceExpiry: day(210), w9OnFile: true, rating: 4.6 },
  { name: 'Bay Electric Co.', trades: ['26 Electrical'], contactName: 'Dana Whitfield', email: 'dana@bayelectric.example', phone: '(757) 555-0162', licenseNo: 'VA-2705-094410', licenseExpiry: day(140), insuranceExpiry: day(20), w9OnFile: true, rating: 4.2 },
  { name: 'Peninsula Plumbing & Mechanical', trades: ['22 Plumbing', '23 HVAC'], contactName: 'Luis Ortega', email: 'luis@peninsulapm.example', phone: '(757) 555-0177', licenseNo: 'VA-2705-130021', licenseExpiry: day(400), insuranceExpiry: day(260), w9OnFile: true, rating: 4.8 },
  { name: 'Coastal Roofing & Exteriors', trades: ['07 Roofing', '08 Windows'], contactName: 'Priya Natarajan', email: 'priya@coastalroofing.example', phone: '(757) 555-0188', licenseNo: 'VA-2705-102244', licenseExpiry: day(90), insuranceExpiry: day(120), w9OnFile: false, rating: 4.1 },
  { name: 'Hampton Roads Sitework Inc.', trades: ['31 Earthwork', '32 Paving', '33 Site utilities'], contactName: 'Gerald Moss', email: 'gerald@hrsitework.example', phone: '(757) 555-0199', licenseNo: 'VA-2705-088100', licenseExpiry: day(500), insuranceExpiry: day(340), w9OnFile: true, rating: 4.4 },
  { name: 'Commonwealth Concrete', trades: ['03 Concrete'], contactName: 'Aisha Bell', email: 'aisha@cwconcrete.example', phone: '(757) 555-0122', licenseNo: 'VA-2705-141900', licenseExpiry: day(220), insuranceExpiry: day(180), w9OnFile: true, rating: 4.5 },
];
const vendorForDivision = (vendors: DVendor[], div: string): DVendor => {
  const map: Record<string, number> = { '06': 0, '26': 1, '22': 2, '23': 2, '07': 3, '08': 3, '31': 4, '32': 4, '33': 4, '02': 4, '03': 5 };
  return vendors[map[div] ?? 0]!;
};

function buildProject(spec: ProjectSpec, state: DemoState): void {
  const now = new Date();
  const p: DProject = { id: `proj_${spec.key}`, organizationId: ORG_ID, name: spec.name, address: spec.address, marketCode: 'HAMPTON_ROADS_VA', lotSizeSf: spec.lotSizeSf, stage: spec.stage, scheduleStatus: spec.scheduleStatus, scheduleNote: spec.scheduleNote, riskLevel: spec.riskLevel, status: 'active', programType: spec.programType, createdAt: day(spec.startOffset - 30) };
  state.projects.push(p);
  const budgetC = M(spec.budget), committedC = M(spec.committed), facC = M(spec.fac);
  const invoicedTarget = Math.round(committedC * spec.invoicedPct);
  const paidTarget = Math.round(invoicedTarget * spec.paidPctOfInvoiced);
  const start = new Date(day(spec.startOffset)); const end = new Date(start); end.setUTCDate(end.getUTCDate() + spec.durationDays);

  // Phases / milestones
  const phases: [string, string, number, number][] = [['feasibility', 'Feasibility & underwriting', 0, 0.06], ['design', 'Design & pre-development', 0.05, 0.2], ['entitlement', 'Entitlement & permits', 0.15, 0.32], ['construction', 'Construction', 0.3, 0.95], ['handoff', 'Closeout & handoff', 0.93, 1]];
  const at = (f: number) => new Date(start.getTime() + (end.getTime() - start.getTime()) * f).toISOString();
  for (const [phase, name, s, e] of phases) {
    const status: DMilestone['status'] = spec.percentComplete >= e ? 'complete' : spec.percentComplete >= s ? (spec.scheduleStatus === 'delayed' && phase === 'entitlement' ? 'blocked' : 'in_progress') : 'pending';
    state.milestones.push({ id: id('ms'), projectId: p.id, phase, name, plannedStart: at(s), plannedEnd: at(e), actualStart: status !== 'pending' ? at(s) : null, actualEnd: status === 'complete' ? at(e) : null, status, owner: phase === 'construction' ? 'Site super' : 'PM' });
  }
  // Schedule items (construction trades) mapped to lines
  const sched: [string, number, number][] = [['Sitework & utilities', 0.3, 0.45], ['Foundations', 0.42, 0.52], ['Framing & dry-in', 0.5, 0.66], ['MEP rough-in', 0.6, 0.74], ['Exterior & roofing', 0.64, 0.78], ['Interior finishes', 0.74, 0.92], ['Paving & landscaping', 0.85, 0.95], ['Punch & CO', 0.92, 1]];
  const schedIds: Record<string, Id> = {};
  for (const [name, s, e] of sched) {
    const pc = spec.percentComplete <= s ? 0 : spec.percentComplete >= e ? 100 : Math.round(((spec.percentComplete - s) / (e - s)) * 100);
    const sid = id('sch'); schedIds[name] = sid;
    state.scheduleItems.push({ id: sid, projectId: p.id, name, start: at(s), end: at(e), percentComplete: pc, milestoneId: null, budgetLineIds: [] });
  }
  const schedForDiv: Record<string, string> = { '31': 'Sitework & utilities', '33': 'Sitework & utilities', '02': 'Sitework & utilities', '03': 'Foundations', '06': 'Framing & dry-in', '22': 'MEP rough-in', '23': 'MEP rough-in', '26': 'MEP rough-in', '07': 'Exterior & roofing', '08': 'Exterior & roofing', '09': 'Interior finishes', '32': 'Paving & landscaping', '01': 'Punch & CO', '00': 'Punch & CO' };

  // Budget lines: allocate budget by CSI mix; FAC distributed so Σ = facC; committed front-loaded to trades already in progress.
  const lines: DBudgetLine[] = [];
  let budgetLeft = budgetC, facLeft = facC;
  const facDelta = facC - budgetC; // spread variance onto framing/sitework
  CSI_MIX.forEach(([div, code, desc, w], i) => {
    const last = i === CSI_MIX.length - 1;
    const original = last ? budgetLeft : Math.round(budgetC * w); budgetLeft -= original;
    const varianceShare = div === '06' ? 0.6 : div === '31' ? 0.3 : div === '00' ? 0.1 : 0;
    const facLine = last ? facLeft : original + Math.round(facDelta * varianceShare); facLeft -= facLine;
    const approvedChanges = div === '06' && facDelta > 0 ? Math.round(facDelta * 0.4) : 0;
    const line: DBudgetLine = { id: id('bl'), projectId: p.id, csiDivision: div, code, description: desc, originalCents: original - approvedChanges, approvedChangesCents: approvedChanges, forecastToCompleteCents: facLine }; // FTC adjusted below once invoices exist
    lines.push(line); state.budgetLines.push(line);
    const sid = schedIds[schedForDiv[div] ?? 'Punch & CO']; const si = state.scheduleItems.find((s) => s.id === sid); if (si) si.budgetLineIds.push(line.id);
  });
  // Commitments: weight toward lines whose schedule items have started; water-fill so no line exceeds its revised budget.
  const vendors = state.vendors;
  const progressOf = (line: DBudgetLine) => { const si = state.scheduleItems.find((s) => s.budgetLineIds.includes(line.id)); return si ? si.percentComplete / 100 : 0; };
  const eligible = lines; // contingency carries a tiny weight so it only fills once trades are capped
  const cap = new Map(eligible.map((l) => [l.id, l.originalCents + l.approvedChangesCents] as const));
  const alloc = new Map<string, number>(eligible.map((l) => [l.id, 0]));
  let remaining = committedC;
  for (let round = 0; round < 10 && remaining > 0; round++) {
    const open = eligible.filter((l) => alloc.get(l.id)! < cap.get(l.id)!);
    if (!open.length) break;
    const w = open.map((l) => (l.csiDivision === '00' ? l.originalCents * 0.02 : l.originalCents * (0.35 + progressOf(l))));
    const wsum = w.reduce((a, b) => a + b, 0);
    let used = 0;
    open.forEach((l, i) => { const want = Math.round((remaining * w[i]!) / wsum); const room = cap.get(l.id)! - alloc.get(l.id)!; const give = Math.min(want, room); alloc.set(l.id, alloc.get(l.id)! + give); used += give; });
    remaining -= used;
    if (used === 0) break;
  }
  const comms: DCommitment[] = [];
  for (const l of eligible) {
    const amt = alloc.get(l.id)!; if (amt < K(1)) continue;
    const v = vendorForDivision(vendors, l.csiDivision);
    const c: DCommitment = { id: id('po'), projectId: p.id, vendorId: v.id, budgetLineId: l.id, description: `${l.description} — ${v.name}`, amountCents: amt, status: 'issued' };
    comms.push(c); state.commitments.push(c);
  }
  // Invoices: progress billing against commitments; statuses by age.
  let invLeft = invoicedTarget, paidLeft = paidTarget; let n = 0;
  const openApproved: DInvoice[] = [];
  const sortedComms = [...comms].sort((a, b) => progressOf(lines.find((l) => l.id === b.budgetLineId)!) - progressOf(lines.find((l) => l.id === a.budgetLineId)!));
  for (const c of sortedComms) {
    if (invLeft <= 0) break;
    const line = lines.find((l) => l.id === c.budgetLineId)!; const prog = progressOf(line);
    const billable = Math.min(invLeft, Math.round(c.amountCents * Math.min(1, prog * 0.9 + 0.1)));
    if (billable < K(5)) continue;
    const parts = billable > K(250) ? 3 : billable > K(60) ? 2 : 1;
    for (let k = 0; k < parts; k++) {
      const amt = k === parts - 1 ? billable - Math.round((billable / parts) * (parts - 1)) : Math.round(billable / parts);
      n++;
      const age = [55, 24, 7][k]! - (n % 5); // oldest first: paid → approved → pending
      let status: DInvoice['status'] = 'pending_approval';
      if (paidLeft >= amt && age > 30) { status = 'paid'; paidLeft -= amt; } else if (age > 12) status = 'approved';
      const inv: DInvoice = { id: id('inv'), projectId: p.id, vendorId: c.vendorId, commitmentId: c.id, budgetLineId: line.id, invoiceNumber: `${spec.key.slice(0, 3).toUpperCase()}-${String(1000 + n)}`, amountCents: amt, retainageCents: Math.round(amt * 0.1), invoiceDate: day(-age), dueDate: day(-age + 30), status, drawId: null, paidAt: status === 'paid' ? day(-age + 20) : null };
      state.invoices.push(inv); invLeft -= amt;
      if (status === 'approved') openApproved.push(inv);
    }
  }
  // One rejected invoice for texture on Alderwood
  if (spec.key === 'alderwood') { const c = comms[2]!; state.invoices.push({ id: id('inv'), projectId: p.id, vendorId: c.vendorId, commitmentId: c.id, budgetLineId: c.budgetLineId, invoiceNumber: 'ALD-0999', amountCents: K(18.4), retainageCents: 0, invoiceDate: day(-9), dueDate: day(21), status: 'rejected', drawId: null }); }
  // FTC so that invoiced + FTC = FAC per line; contingency absorbs rounding so Σ FAC = target exactly
  const invoicedOf = (l: DBudgetLine) => state.invoices.filter((i) => i.budgetLineId === l.id && i.status !== 'rejected').reduce((s, i) => s + i.amountCents, 0);
  for (const l of lines) l.forecastToCompleteCents = Math.max(0, l.forecastToCompleteCents - invoicedOf(l));
  const cont = lines.find((l) => l.csiDivision === '00')!;
  const facOthers = lines.filter((l) => l !== cont).reduce((a, l) => a + invoicedOf(l) + l.forecastToCompleteCents, 0);
  cont.forecastToCompleteCents = Math.max(0, facC - facOthers - invoicedOf(cont));
  // Loan
  const loan: DLoan = { id: id('loan'), projectId: p.id, lender: spec.loan.lender, commitmentCents: M(spec.loan.commitment), rateBps: spec.loan.rateBps, maturity: day(spec.durationDays + 90), retainagePct: 10, drawnCents: Math.round(M(spec.loan.commitment) * spec.loan.drawnPct) };
  state.loans.push(loan);
  // Draws: funded history + current state
  const paidInv = state.invoices.filter((i) => i.projectId === p.id && i.status === 'paid');
  if (paidInv.length && spec.drawState !== 'none') {
    const half = Math.ceil(paidInv.length / 2);
    [paidInv.slice(0, half), paidInv.slice(half)].filter((g) => g.length).forEach((g, k) => {
      const d: DDraw = { id: id('drw'), projectId: p.id, loanId: loan.id, periodEnd: day(-60 + k * 30), status: 'funded', items: g.map((i) => ({ id: id('di'), invoiceId: i.id, amountCents: i.amountCents, description: i.invoiceNumber })), totalCents: g.reduce((s, i) => s + i.amountCents, 0), fundedCents: g.reduce((s, i) => s + i.amountCents, 0), fundedAt: day(-50 + k * 30), submittedAt: day(-58 + k * 30), createdAt: day(-62 + k * 30) };
      g.forEach((i) => { i.drawId = d.id; }); state.draws.push(d);
    });
  }
  if (spec.drawState === 'ready' || spec.drawState === 'submitted') {
    // Put roughly half of the approved invoices into the current draw; leave the rest for "create draw".
    const take = openApproved.slice(0, Math.max(1, Math.ceil(openApproved.length / 2)));
    const d: DDraw = { id: id('drw'), projectId: p.id, loanId: loan.id, periodEnd: day(-2), status: spec.drawState === 'ready' ? 'draft' : 'submitted', items: take.map((i) => ({ id: id('di'), invoiceId: i.id, amountCents: i.amountCents, description: i.invoiceNumber })), totalCents: take.reduce((s, i) => s + i.amountCents, 0), fundedCents: null, submittedAt: spec.drawState === 'submitted' ? day(-1) : null, createdAt: day(-3) };
    take.forEach((i) => { i.drawId = d.id; }); state.draws.push(d);
  }
  // Investors
  const inv1 = state.users.find((u) => u.email === 'r.okafor@harborlight.example')!; const inv2 = state.users.find((u) => u.email === 'j.lindqvist@tidewatercap.example')!;
  const equity = Math.round((budgetC - loan.commitmentCents) * 1.05);
  state.investors.push({ id: id('ivr'), projectId: p.id, userId: inv1.id, email: inv1.email, name: 'Harborlight Partners (R. Okafor)', commitmentCents: Math.round(equity * 0.6), ownershipPct: 60, prefReturnBps: 800 });
  state.investors.push({ id: id('ivr'), projectId: p.id, userId: inv2.id, email: inv2.email, name: 'Tidewater Capital (J. Lindqvist)', commitmentCents: equity - Math.round(equity * 0.6), ownershipPct: 40, prefReturnBps: 800 });
  // Past report, documents, updates
  const lastMonth = new Date(now); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1); const period = lastMonth.toISOString().slice(0, 7);
  state.reports.push({ id: id('rpt'), projectId: p.id, period, status: 'sent', html: `<h1>${spec.name} — ${period}</h1><p>Budget vs actual, schedule, draws, photos.</p>`, data: { period }, createdAt: day(-20), sentAt: day(-18) });
  for (const [f, cat] of [['Site plan rev C.pdf', 'plans'], ['Building permit application.pdf', 'permits'], ['Framing subcontract — Tidewater.pdf', 'contracts'], ['Progress photos 10-14.zip', 'photos']] as const) state.documents.push({ id: id('doc'), projectId: p.id, fileName: f, category: cat, contentType: 'application/pdf', createdAt: day(-30), status: 'complete' });
  state.updates.push({ id: id('upd'), projectId: p.id, body: spec.key === 'harbor' ? 'Plan check comments received from the city (round 2). Civil resubmittal due Friday; VDOT entrance permit still pending sight-distance exhibit.' : spec.key === 'alderwood' ? 'Sitework is 3 days behind after the storm week. Utility crew added a second shift; still targeting slab pours before Thanksgiving.' : spec.key === 'sunset' ? 'Final inspections scheduled. Punch list down to 14 items; CO expected within two weeks.' : 'Framing on buildings 3 and 4 complete; roof trusses for building 5 deliver Thursday. Draw 7 package assembled for review.', visibility: 'investor', createdAt: day(-3), authorName: 'DirtBid Ops', photoDocumentIds: [] });
}

export function buildSeed(now: Date = new Date()): DemoState {
  seq = 0;
  const state: DemoState = { version: SEED_VERSION, seededAt: now.toISOString(), currentToken: STAFF_TOKEN, users: [], orgs: [], leads: [], runs: [], projects: [], milestones: [], budgetLines: [], commitments: [], invoices: [], loans: [], draws: [], scheduleItems: [], investors: [], reports: [], documents: [], updates: [], vendors: [], events: [] };
  state.orgs.push({ id: ORG_ID, name: 'Cascade Homes' });
  state.users.push(
    { id: 'usr_staff', email: 'ops@dirtbid.example', fullName: 'DirtBid Ops (demo staff)', roles: ['staff', 'admin'], organizationIds: [ORG_ID] },
    { id: 'usr_builder', email: 'kevin@cascadehomes.example', fullName: 'Kevin Marsh', phone: '(757) 555-0100', roles: ['builder'], organizationIds: [ORG_ID] },
    { id: 'usr_inv1', email: 'r.okafor@harborlight.example', fullName: 'Rosalind Okafor', roles: ['investor'], organizationIds: [] },
    { id: 'usr_inv2', email: 'j.lindqvist@tidewatercap.example', fullName: 'Jonas Lindqvist', roles: ['investor'], organizationIds: [] },
  );
  for (const v of VENDORS) state.vendors.push({ id: id('ven'), organizationId: ORG_ID, ...v });
  for (const spec of SPECS) buildProject(spec, state);

  // Leads
  const L = (kind: string, status: string, fullName: string, email: string, property: Record<string, unknown>, answers: Record<string, unknown>, score: number, ago: number, phone?: string): DLead => ({ id: id('lead'), kind, status, grade: score >= 70 ? 'A' : score >= 50 ? 'B' : score >= 30 ? 'C' : 'D', score, contact: { fullName, email, phone }, property, answers, consent: true, assigneeUserId: 'usr_staff', notes: null, createdAt: day(-ago), updatedAt: day(-ago), events: [{ at: day(-ago), type: 'lead.created' }] });
  state.leads.push(
    L('feasibility_snapshot', 'new', 'Denise Carver', 'denise.carver@example.com', { address: '318 Big Bethel Rd, Hampton, VA 23666', propertyType: 'vacant_land', lotSize: 18200, lotSizeUnit: 'sf', zoningCode: 'R-10', ownsLand: true }, { goals: 'Inherited the lot; deciding between selling and building a rental.' }, 75, 1, '(757) 555-0133'),
    L('homeowner_rebuild', 'contacted', 'Miguel & Ana Serrano', 'serranos@example.com', { address: '2140 N Lake Ave, Altadena, CA 91001', homeSizeSf: 1850, lotSize: 7400, lotSizeUnit: 'sf', ownsLand: true }, { disasterAffected: 'yes', situation: 'rebuild' }, 68, 6, '(626) 555-0150'),
    L('builder_audit', 'qualified', 'Tasha Greene', 'tasha@greenebuilt.example', {}, { companyName: 'Greene Built Homes', activeProjects: 5, annualVolume: '5-15m', tools: 'QuickBooks, Buildertrend, Excel', pain: 'Draws take a week and investors ask for numbers we have to rebuild.' }, 82, 12, '(757) 555-0190'),
    L('calculator_unlock', 'proposal', 'Owen Pryce', 'owen.pryce@example.com', { address: '7 Shore Dr, Virginia Beach, VA 23456', lotSize: 21780, lotSizeUnit: 'sf', zoningCode: 'R-7.5' }, { marketCode: 'HAMPTON_ROADS_VA', projectType: 'vacant_land', recommended: 'single_home', maxOffer: 118000 }, 58, 20),
    L('builder_qualification', 'nurture', 'Brianna Holt', 'brianna.holt@example.com', { address: 'TBD — looking in York County', ownsLand: false, homeSizeSf: 2400 }, { budget: '400-600k', targetTimeline: '12-24mo', goal: 'Build instead of buy for our family of five.' }, 34, 33),
  );

  // Saved feasibility runs computed with the real engine
  const vaInput: UnderwritingInput = { marketCode: 'HAMPTON_ROADS_VA', address: '318 Big Bethel Rd, Hampton, VA 23666', zip: '23666', lotSizeSf: 18200, existingStructureSf: 0, zoningCode: 'R-10', projectType: 'vacant_land', arvPerSf: 285, targetHomeSf: 2400, site: { floodZone: 'X', rpaBuffer: 'no', soils: 'stable', utilities: { water: 'yes', sewer: 'yes', power: 'yes' }, stateRouteFrontage: 'yes' } };
  const caInput: UnderwritingInput = { marketCode: 'ALTADENA_CA', address: '2140 N Lake Ave, Altadena, CA 91001', zip: '91001', lotSizeSf: 7400, existingStructureSf: 1850, zoningCode: 'R-1', projectType: 'fire_rebuild', arvPerSf: 880, site: { fireHazardZone: 'yes', historic: 'no', tenantOccupiedLast3Years: 'no', utilities: { water: 'yes', sewer: 'yes', power: 'yes' } } };
  state.runs.push(
    { id: 'run_va_bigbethel', status: 'reviewed', version: 2, input: vaInput, result: underwrite(vaInput, now), leadId: state.leads[0]!.id, analystNotes: 'Comps pulled from 3 closings on Big Bethel / Todds Lane within 6 months; VDOT entrance will need a sight-distance exhibit. Recommend the single-home base case; ADU upside only if the city confirms by-right accessory units.', createdAt: day(-1) },
    { id: 'run_ca_lakeave', status: 'draft', version: 1, input: caInput, result: underwrite(caInput, now), leadId: state.leads[1]!.id, analystNotes: null, createdAt: day(-5) },
  );
  state.events.push({ id: id('evt'), type: 'demo.seeded', occurredAt: now.toISOString(), data: { version: SEED_VERSION } });
  return state;
}
