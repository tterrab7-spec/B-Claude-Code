/**
 * Demo seed: one staff user, the "Cascade Homes" builder org with four projects
 * matching the portfolio dashboard, budgets across CSI divisions, commitments,
 * invoices in every state, a loan per project, one draft draw, schedules, two
 * investors, six vendors (one with insurance expiring in 20 days), three leads
 * and two feasibility runs. Idempotent: re-running wipes and recreates the demo org.
 */
import { eq, inArray } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { schema } from './client.js';
import { ensureCatalog } from '../modules/catalog/routes.js';
import { createProject } from '../modules/projects/service.js';
import { createRun } from '../modules/feasibility/service.js';
import { createLead } from '../modules/leads/service.js';

const d = (offsetDays: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + offsetDays); return x.toISOString().slice(0, 10); };
const M = (n: number) => Math.round(n * 1_000_000 * 100); // $M → cents
const K = (n: number) => Math.round(n * 1_000 * 100);

async function main() {
  const app = await buildApp({ logger: false });
  const db = app.db;
  await ensureCatalog(db);

  // wipe previous demo org
  const old = await db.select().from(schema.organizations).where(eq(schema.organizations.name, 'Cascade Homes'));
  if (old.length) {
    const ids = old.map((o) => o.id);
    const projs = await db.select({ id: schema.projects.id }).from(schema.projects).where(inArray(schema.projects.organizationId, ids));
    if (projs.length) await db.delete(schema.projects).where(inArray(schema.projects.id, projs.map((p) => p.id)));
    await db.delete(schema.vendors).where(inArray(schema.vendors.organizationId, ids));
    await db.delete(schema.organizations).where(inArray(schema.organizations.id, ids));
  }

  const upsertUser = async (email: string, fullName: string, roles: string[]) => {
    const [u] = await db.insert(schema.users).values({ email, fullName, roles }).onConflictDoUpdate({ target: schema.users.email, set: { fullName, roles } }).returning();
    return u!;
  };
  const staff = await upsertUser('staff@dirtbid.local', 'DirtBid Staff', ['staff', 'admin']);
  const kevin = await upsertUser('kevin@cascadehomes.local', 'Kevin Mercer', ['builder']);
  const pm = await upsertUser('pm@cascadehomes.local', 'Dana Ortiz', ['builder']);
  const lp1 = await upsertUser('lp1@investors.local', 'Harbor Capital LLC', ['investor']);
  const lp2 = await upsertUser('lp2@investors.local', 'M. Chen Family Trust', ['investor']);

  const [org] = await db.insert(schema.organizations).values({ name: 'Cascade Homes', kind: 'builder' }).returning();
  await db.insert(schema.orgMembers).values([{ organizationId: org!.id, userId: kevin.id, role: 'owner' }, { organizationId: org!.id, userId: pm.id, role: 'member' }]);

  const vendorRows = await db.insert(schema.vendors).values([
    { organizationId: org!.id, name: 'Tidewater Concrete', trades: ['concrete', 'flatwork'], contactName: 'R. Alvarez', email: 'rfa@tidewaterconcrete.local', licenseNo: 'VA-2705-1001', licenseExpiry: d(400), insuranceExpiry: d(20), w9OnFile: true, rating: 4 },
    { organizationId: org!.id, name: 'Peninsula Framing Co.', trades: ['framing', 'carpentry'], contactName: 'T. Nguyen', email: 'tn@peninsulaframing.local', licenseNo: 'VA-2705-1002', licenseExpiry: d(300), insuranceExpiry: d(250), w9OnFile: true, rating: 5 },
    { organizationId: org!.id, name: 'Bayside Electric', trades: ['electrical'], contactName: 'J. Brooks', licenseNo: 'VA-2705-1003', licenseExpiry: d(500), insuranceExpiry: d(180), w9OnFile: true, rating: 4 },
    { organizationId: org!.id, name: 'Hampton Roads Plumbing & Mechanical', trades: ['plumbing', 'hvac'], licenseNo: 'VA-2705-1004', licenseExpiry: d(220), insuranceExpiry: d(300), w9OnFile: false, rating: 3 },
    { organizationId: org!.id, name: 'Atlantic Sitework', trades: ['earthwork', 'utilities', 'paving'], licenseNo: 'VA-2705-1005', licenseExpiry: d(600), insuranceExpiry: d(90), w9OnFile: true, rating: 4 },
    { organizationId: org!.id, name: 'Coastal Roofing & Exteriors', trades: ['roofing', 'siding'], licenseNo: 'VA-2705-1006', licenseExpiry: d(365), insuranceExpiry: d(365), w9OnFile: true, rating: 5 },
  ]).returning();
  const V = Object.fromEntries(vendorRows.map((v) => [v.trades[0]!, v.id]));

  interface Spec { name: string; stage: string; address: string; budgetM: number; lender: string; loanM: number; drawnM: number; lines: [string, string, string, number][]; commitPct: number; schedule: [string, number, number, number][]; invoices: { line: number; vendor: string; amountK: number; status: 'pending_approval' | 'approved' | 'paid'; due: number }[]; ftc?: Record<number, number>; co?: { line: number; amountK: number; days: number; status: 'proposed' | 'approved' }; investors?: { user: string; commitM: number; pct: number }[] }
  const specs: Spec[] = [
    { name: 'Cascade Ridge — Phase 2', stage: 'Construction', address: '3200 Cascade Ridge Dr, Chesapeake, VA 23322', budgetM: 6.4, lender: 'TowneBank', loanM: 4.8, drawnM: 2.9, commitPct: 0.64,
      lines: [['01', '01-00-00', 'General conditions', 0.42], ['02', '02-41-00', 'Demolition & clearing', 0.12], ['03', '03-30-00', 'Concrete foundations & slabs', 0.58], ['06', '06-10-00', 'Framing', 1.35], ['07', '07-00-00', 'Roofing, siding & insulation', 0.61], ['08', '08-00-00', 'Windows & doors', 0.38], ['09', '09-00-00', 'Finishes', 0.92], ['22', '22-00-00', 'Plumbing', 0.36], ['23', '23-00-00', 'HVAC', 0.34], ['26', '26-00-00', 'Electrical', 0.41], ['31', '31-00-00', 'Earthwork', 0.33], ['32', '32-00-00', 'Exterior improvements', 0.28], ['33', '33-00-00', 'Site utilities', 0.30]],
      schedule: [['Foundations', -90, -30, 100], ['Framing', -35, 20, 65], ['Roof dry-in', 5, 35, 10], ['MEP rough-in', 20, 60, 0], ['Insulation & drywall', 55, 90, 0], ['Finishes', 85, 150, 0]],
      invoices: [{ line: 2, vendor: 'concrete', amountK: 310, status: 'paid', due: -40 }, { line: 3, vendor: 'framing', amountK: 420, status: 'approved', due: 10 }, { line: 3, vendor: 'framing', amountK: 180, status: 'approved', due: 14 }, { line: 10, vendor: 'earthwork', amountK: 260, status: 'paid', due: -60 }, { line: 9, vendor: 'electrical', amountK: 48, status: 'pending_approval', due: 20 }],
      investors: [{ user: lp1.id, commitM: 1.2, pct: 35 }, { user: lp2.id, commitM: 0.6, pct: 15 }] },
    { name: 'Alderwood Townhomes', stage: 'Construction', address: '118 Alderwood Ln, Virginia Beach, VA 23456', budgetM: 9.8, lender: 'Atlantic Union Bank', loanM: 7.35, drawnM: 1.45, commitPct: 0.6,
      lines: [['01', '01-00-00', 'General conditions', 0.6], ['03', '03-30-00', 'Concrete', 0.95], ['06', '06-10-00', 'Framing', 2.1], ['07', '07-00-00', 'Envelope', 0.9], ['08', '08-00-00', 'Openings', 0.55], ['09', '09-00-00', 'Finishes', 1.6], ['22', '22-00-00', 'Plumbing', 0.55], ['23', '23-00-00', 'HVAC', 0.5], ['26', '26-00-00', 'Electrical', 0.6], ['31', '31-00-00', 'Earthwork & stormwater', 0.85], ['33', '33-00-00', 'Utilities', 0.6]],
      schedule: [['Sitework & stormwater', -60, 3, 85], ['Utilities', -20, 25, 40], ['Foundations', 10, 50, 0], ['Framing', 45, 120, 0]],
      invoices: [{ line: 9, vendor: 'earthwork', amountK: 540, status: 'paid', due: -30 }, { line: 9, vendor: 'earthwork', amountK: 210, status: 'approved', due: 7 }, { line: 10, vendor: 'earthwork', amountK: 160, status: 'pending_approval', due: 15 }],
      co: { line: 9, amountK: 95, days: 3, status: 'approved' }, ftc: { 9: 260 },
      investors: [{ user: lp1.id, commitM: 2.0, pct: 40 }] },
    { name: 'Sunset Infill 4-plex', stage: 'Handoff', address: '77 Sunset Ave, Norfolk, VA 23518', budgetM: 1.9, lender: 'TowneBank', loanM: 1.4, drawnM: 1.31, commitPct: 0.97,
      lines: [['01', '01-00-00', 'General conditions', 0.14], ['03', '03-30-00', 'Concrete', 0.17], ['06', '06-10-00', 'Framing', 0.42], ['07', '07-00-00', 'Envelope', 0.2], ['08', '08-00-00', 'Openings', 0.11], ['09', '09-00-00', 'Finishes', 0.38], ['22', '22-00-00', 'Plumbing', 0.12], ['23', '23-00-00', 'HVAC', 0.1], ['26', '26-00-00', 'Electrical', 0.13], ['32', '32-00-00', 'Exterior improvements', 0.13]],
      schedule: [['Finishes', -60, -5, 100], ['Punch list', -7, 14, 60], ['CO & closeout', 10, 30, 0]],
      invoices: [{ line: 5, vendor: 'framing', amountK: 36, status: 'approved', due: 5 }, { line: 9, vendor: 'earthwork', amountK: 22, status: 'pending_approval', due: 12 }],
      investors: [{ user: lp2.id, commitM: 0.45, pct: 45 }] },
    { name: 'Harbor Infill', stage: 'Entitlement & Permits', address: '9 Harbor View Ct, Hampton, VA 23669', budgetM: 3.2, lender: 'Old Point National Bank', loanM: 2.4, drawnM: 0.3, commitPct: 0.12,
      lines: [['01', '01-00-00', 'General conditions', 0.22], ['03', '03-30-00', 'Concrete', 0.3], ['06', '06-10-00', 'Framing', 0.7], ['07', '07-00-00', 'Envelope', 0.32], ['09', '09-00-00', 'Finishes', 0.55], ['22', '22-00-00', 'Plumbing', 0.18], ['23', '23-00-00', 'HVAC', 0.17], ['26', '26-00-00', 'Electrical', 0.2], ['31', '31-00-00', 'Earthwork & RPA mitigation', 0.36], ['33', '33-00-00', 'Utilities', 0.2]],
      schedule: [['Site plan review', -45, -10, 100], ['Permit issuance', -10, 5, 70], ['Mobilization', 20, 35, 0]],
      invoices: [{ line: 0, vendor: 'earthwork', amountK: 18, status: 'paid', due: -20 }] },
  ];

  const projectIds: string[] = [];
  for (const s of specs) {
    const project = await createProject(app, { name: s.name, programType: 'builder_ops', organizationId: org!.id, address: s.address, marketCode: 'HAMPTON_ROADS_VA', serviceLevel: 'owners_rep' }, staff.id);
    projectIds.push(project.id);
    await db.update(schema.projects).set({ stage: s.stage }).where(eq(schema.projects.id, project.id));
    await db.insert(schema.projectMembers).values([{ projectId: project.id, userId: kevin.id, role: 'owner' }, { projectId: project.id, userId: pm.id, role: 'gc' }]).onConflictDoNothing();
    // milestones progress by stage
    const ms = await db.select().from(schema.milestones).where(eq(schema.milestones.projectId, project.id));
    const phaseIdx = ['Feasibility', 'Design & Pre-Dev', 'Entitlement & Permits', 'Construction', 'Handoff'].indexOf(s.stage);
    for (const m of ms) {
      const mi = ['Feasibility', 'Design & Pre-Dev', 'Entitlement & Permits', 'Construction', 'Handoff'].indexOf(m.phase);
      if (mi < phaseIdx) await db.update(schema.milestones).set({ status: 'complete', actualEnd: d(-30 * (phaseIdx - mi)) }).where(eq(schema.milestones.id, m.id));
      else if (mi === phaseIdx && m.sortOrder % 3 === 0) await db.update(schema.milestones).set({ status: 'in_progress', plannedEnd: d(14) }).where(eq(schema.milestones.id, m.id));
    }
    const lines = await db.insert(schema.budgetLines).values(s.lines.map(([div, code, desc, m], i) => ({ projectId: project.id, organizationId: org!.id, csiDivision: div, code, description: desc, originalCents: M(m), sortOrder: i, forecastToCompleteCents: s.ftc?.[i] !== undefined ? K(s.ftc[i]!) : null }))).returning();
    // commitments on the first N lines
    const nCommit = Math.max(1, Math.round(lines.length * s.commitPct));
    const trades = ['concrete', 'framing', 'electrical', 'plumbing', 'earthwork', 'roofing'];
    await db.insert(schema.commitments).values(lines.slice(0, nCommit).map((l, i) => ({ projectId: project.id, organizationId: org!.id, budgetLineId: l.id, vendorId: V[trades[i % trades.length]!] ?? null, description: `${l.description} subcontract`, amountCents: Math.round(l.originalCents * 0.97), status: 'issued' as const })));
    const [loan] = await db.insert(schema.loans).values({ projectId: project.id, organizationId: org!.id, lender: s.lender, commitmentCents: M(s.loanM), drawnCents: M(s.drawnM), rateBps: 825, maturity: d(540), retainagePct: 10 }).returning();
    await db.insert(schema.scheduleItems).values(s.schedule.map(([name, st, en, pct]) => ({ projectId: project.id, organizationId: org!.id, name, start: d(st), end: d(en), percentComplete: pct })));
    const invRows = await db.insert(schema.invoices).values(s.invoices.map((inv, i) => ({ projectId: project.id, organizationId: org!.id, vendorId: V[inv.vendor] ?? null, budgetLineId: lines[inv.line]!.id, invoiceNumber: `${s.name.split(' ')[0]!.toUpperCase().slice(0, 3)}-${1001 + i}`, amountCents: K(inv.amountK), retainageCents: K(inv.amountK * 0.1), invoiceDate: d(inv.due - 30), dueDate: d(inv.due), status: inv.status, approvedAt: inv.status !== 'pending_approval' ? new Date() : null, paidAt: inv.status === 'paid' ? new Date() : null }))).returning();
    if (s.co) await db.insert(schema.changeOrders).values({ projectId: project.id, organizationId: org!.id, budgetLineId: lines[s.co.line]!.id, number: 1, description: 'Unsuitable soils: additional undercut and stone', amountCents: K(s.co.amountK), daysImpact: s.co.days, reason: 'Geotech found marine clay below design grade', status: s.co.status, decidedAt: new Date() });
    if (s.co?.status === 'approved') await db.update(schema.budgetLines).set({ approvedChangesCents: K(s.co.amountK) }).where(eq(schema.budgetLines.id, lines[s.co.line]!.id));
    for (const inv of s.investors ?? []) {
      await db.insert(schema.projectInvestors).values({ projectId: project.id, organizationId: org!.id, userId: inv.user, commitmentCents: M(inv.commitM), fundedCents: M(inv.commitM * 0.8), ownershipPct: inv.pct, prefReturnBps: 800 });
      await db.insert(schema.projectMembers).values({ projectId: project.id, userId: inv.user, role: 'investor' }).onConflictDoNothing();
    }
    // one draft draw on Cascade Ridge from its approved invoices
    if (s.name.startsWith('Cascade')) {
      const approved = invRows.filter((i) => i.status === 'approved');
      const requested = approved.reduce((a, i) => a + i.amountCents, 0); const held = approved.reduce((a, i) => a + i.retainageCents, 0);
      const [draw] = await db.insert(schema.draws).values({ projectId: project.id, organizationId: org!.id, loanId: loan!.id, number: 4, periodEnd: d(0), status: 'draft', requestedCents: requested, retainageHeldCents: held, expectedFundingDate: d(21) }).returning();
      await db.insert(schema.drawItems).values(approved.map((i) => ({ drawId: draw!.id, invoiceId: i.id, budgetLineId: i.budgetLineId, description: `Invoice ${i.invoiceNumber}`, amountCents: i.amountCents, retainageCents: i.retainageCents })));
      await db.update(schema.invoices).set({ status: 'in_draw', drawId: draw!.id }).where(inArray(schema.invoices.id, approved.map((i) => i.id)));
      await db.insert(schema.projectUpdates).values([{ projectId: project.id, organizationId: org!.id, authorUserId: pm.id, body: 'Framing crew at 65%. Roof trusses delivered; dry-in targeted in three weeks.', visibility: 'investor' }, { projectId: project.id, organizationId: org!.id, authorUserId: pm.id, body: 'Electrician asking for a 2-week push on rough-in; negotiating.', visibility: 'internal' }]);
    }
  }

  // Leads + feasibility runs
  const leadA = await createLead(app, { kind: 'feasibility_snapshot', contact: { fullName: 'Marcus Reed', email: 'marcus.reed@example.com', phone: '757-555-0142' }, property: { address: '2210 Shell Rd', city: 'Hampton', state: 'VA', zip: '23661', lotSize: 0.42, lotSizeUnit: 'acres', ownsLand: true, zoningCode: 'R-11', propertyType: 'vacant_land' }, answers: { budget: 520000, targetTimeline: '6-12 months', goals: 'Build a primary home, maybe an ADU for my mother.' }, consent: true, website: '' } as any);
  const leadB = await createLead(app, { kind: 'homeowner_rebuild', contact: { fullName: 'Angela Torres', email: 'angela.torres@example.com', phone: '626-555-0199' }, property: { address: '1650 Mendocino St', city: 'Altadena', state: 'CA', zip: '91001', homeSizeSf: 1800, lotSize: 7500, lotSizeUnit: 'sf', ownsLand: true, zoningCode: 'R-1-7500' }, answers: { eatonFireAffected: 'yes', situation: 'I want to rebuild' }, consent: true, website: '' } as any);
  await createLead(app, { kind: 'builder_audit', contact: { fullName: 'Priya Natarajan', email: 'priya@ridgelinebuilders.example.com', phone: '804-555-0177' }, property: {}, answers: { companyName: 'Ridgeline Builders', activeProjects: 6, annualVolume: 14000000, painPoint: 'Draws take two weeks to assemble and investor updates slip.' }, consent: true, website: '' } as any);

  await createRun(app, { leadId: leadA.lead.id, input: { address: '2210 Shell Rd, Hampton, VA 23661', marketCode: 'HAMPTON_ROADS_VA', zip: '23666', lotSizeSf: Math.round(0.42 * 43560), zoningCode: 'R-11', projectType: 'vacant_land', targetHomeSf: 2400, arvPerSf: 285, site: { floodZone: 'X', rpaBuffer: 'unknown', utilities: { water: 'yes', sewer: 'yes', power: 'yes' } } } });
  await createRun(app, { leadId: leadB.lead.id, input: { address: '1650 Mendocino St, Altadena, CA 91001', marketCode: 'ALTADENA_CA', zip: '91001', lotSizeSf: 7500, existingStructureSf: 1800, zoningCode: 'R-1-7500', projectType: 'fire_rebuild', arvPerSf: 850, site: { fireHazardZone: 'unknown', historic: 'no', tenantOccupiedLast3Years: 'no', utilities: { water: 'yes', sewer: 'yes', power: 'yes' } } } });

  console.log(`Seeded org "Cascade Homes" (${org!.id}) with ${projectIds.length} projects, ${vendorRows.length} vendors, 3 leads, 2 feasibility runs.`);
  console.log('Sign in: POST /v1/auth/magic-link with staff@dirtbid.local, kevin@cascadehomes.local, lp1@investors.local (dev link is returned in the response).');
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
