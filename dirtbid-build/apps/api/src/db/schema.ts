import { sql } from 'drizzle-orm';
import {
  bigint, boolean, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const cents = (name: string) => bigint(name, { mode: 'number' }).notNull().default(0);
const centsNullable = (name: string) => bigint(name, { mode: 'number' });

export const users = pgTable('users', {
  id: id(),
  email: varchar('email', { length: 320 }).notNull(),
  fullName: text('full_name'),
  phone: text('phone'),
  roles: jsonb('roles').$type<string[]>().notNull().default(sql`'["landowner"]'::jsonb`),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('users_email_idx').on(t.email)]);

export const magicTokens = pgTable('magic_tokens', {
  id: id(),
  email: varchar('email', { length: 320 }).notNull(),
  tokenHash: text('token_hash').notNull(),
  redirectTo: text('redirect_to'),
  role: text('role'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('magic_tokens_hash_idx').on(t.tokenHash)]);

export const sessions = pgTable('sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
});

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('builder'),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const orgMembers = pgTable('org_members', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('org_members_unique').on(t.organizationId, t.userId)]);

export const leads = pgTable('leads', {
  id: id(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('new'),
  email: varchar('email', { length: 320 }).notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  property: jsonb('property').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  utm: jsonb('utm').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  consent: boolean('consent').notNull().default(false),
  score: integer('score').notNull().default(0),
  grade: varchar('grade', { length: 1 }).notNull().default('D'),
  marketCode: text('market_code'),
  assigneeUserId: uuid('assignee_user_id').references(() => users.id),
  userId: uuid('user_id').references(() => users.id),
  projectId: uuid('project_id'),
  notes: text('notes'),
  lostReason: text('lost_reason'),
  ipAddress: text('ip_address'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('leads_email_idx').on(t.email), index('leads_status_idx').on(t.status)]);

export const leadEvents = pgTable('lead_events', {
  id: id(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  actorUserId: uuid('actor_user_id'),
  createdAt: createdAt(),
});

export const feasibilityRuns = pgTable('feasibility_runs', {
  id: id(),
  leadId: uuid('lead_id').references(() => leads.id),
  userId: uuid('user_id').references(() => users.id),
  projectId: uuid('project_id'),
  organizationId: uuid('organization_id'),
  marketCode: text('market_code').notNull(),
  status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  tier: text('tier').notNull().default('lite'),
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  result: jsonb('result').$type<Record<string, unknown>>().notNull(),
  analystNotes: text('analyst_notes'),
  source: text('source').notNull().default('manual'),
  resolvedParcel: jsonb('resolved_parcel').$type<Record<string, unknown>>(),
  accessToken: text('access_token').notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('runs_lead_idx').on(t.leadId), index('runs_project_idx').on(t.projectId)]);

export const serviceCatalog = pgTable('service_catalog', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  priceCents: centsNullable('price_cents'),
  priceFromCents: centsNullable('price_from_cents'),
  billing: text('billing').notNull().default('one_time'),
  creditBack: jsonb('credit_back').$type<{ toService: string; windowDays: number } | null>(),
  description: text('description').notNull().default(''),
  includes: jsonb('includes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

export const orders = pgTable('orders', {
  id: id(),
  serviceCode: text('service_code').notNull().references(() => serviceCatalog.code),
  status: text('status').notNull().default('awaiting_payment'),
  email: varchar('email', { length: 320 }),
  userId: uuid('user_id').references(() => users.id),
  leadId: uuid('lead_id').references(() => leads.id),
  runId: uuid('run_id').references(() => feasibilityRuns.id),
  projectId: uuid('project_id'),
  organizationId: uuid('organization_id'),
  listPriceCents: cents('list_price_cents'),
  creditAppliedCents: cents('credit_applied_cents'),
  amountCents: cents('amount_cents'),
  stripeSessionId: text('stripe_session_id'),
  checkoutUrl: text('checkout_url'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const payments = pgTable('payments', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('stripe'),
  providerRef: text('provider_ref'),
  amountCents: cents('amount_cents'),
  status: text('status').notNull().default('succeeded'),
  raw: jsonb('raw').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

export const credits = pgTable('credits', {
  id: id(),
  userId: uuid('user_id').references(() => users.id),
  email: varchar('email', { length: 320 }),
  sourceOrderId: uuid('source_order_id').references(() => orders.id),
  appliedOrderId: uuid('applied_order_id').references(() => orders.id),
  appliesTo: text('applies_to').notNull(),
  amountCents: cents('amount_cents'),
  status: text('status').notNull().default('available'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const projects = pgTable('projects', {
  id: id(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  name: text('name').notNull(),
  programType: text('program_type').notNull(),
  stage: text('stage').notNull().default('Feasibility'),
  status: text('status').notNull().default('active'),
  address: text('address'),
  marketCode: text('market_code'),
  lotSizeSf: integer('lot_size_sf'),
  runId: uuid('run_id'),
  serviceLevel: text('service_level'),
  riskLevel: text('risk_level').notNull().default('low'),
  targetStart: date('target_start'),
  targetEnd: date('target_end'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('projects_org_idx').on(t.organizationId)]);

export const projectMembers = pgTable('project_members', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('viewer'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('project_members_unique').on(t.projectId, t.userId)]);

export const milestones = pgTable('milestones', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  phase: text('phase').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  status: text('status').notNull().default('pending'),
  owner: text('owner'),
  plannedStart: date('planned_start'),
  plannedEnd: date('planned_end'),
  actualStart: date('actual_start'),
  actualEnd: date('actual_end'),
  note: text('note'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const budgetLines = pgTable('budget_lines', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  csiDivision: varchar('csi_division', { length: 2 }).notNull(),
  code: text('code').notNull(),
  description: text('description').notNull(),
  originalCents: cents('original_cents'),
  approvedChangesCents: cents('approved_changes_cents'),
  forecastToCompleteCents: centsNullable('forecast_to_complete_cents'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('budget_lines_project_idx').on(t.projectId)]);

export const vendors = pgTable('vendors', {
  id: id(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  name: text('name').notNull(),
  trades: jsonb('trades').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  licenseNo: text('license_no'),
  licenseExpiry: date('license_expiry'),
  insuranceExpiry: date('insurance_expiry'),
  w9OnFile: boolean('w9_on_file').notNull().default(false),
  rating: integer('rating'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const commitments = pgTable('commitments', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  budgetLineId: uuid('budget_line_id').references(() => budgetLines.id),
  description: text('description').notNull(),
  amountCents: cents('amount_cents'),
  status: text('status').notNull().default('draft'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const invoices = pgTable('invoices', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  commitmentId: uuid('commitment_id').references(() => commitments.id),
  budgetLineId: uuid('budget_line_id').references(() => budgetLines.id),
  invoiceNumber: text('invoice_number').notNull(),
  amountCents: cents('amount_cents'),
  retainageCents: cents('retainage_cents'),
  invoiceDate: date('invoice_date'),
  dueDate: date('due_date'),
  status: text('status').notNull().default('pending_approval'),
  documentId: uuid('document_id'),
  drawId: uuid('draw_id'),
  note: text('note'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('invoices_project_status_idx').on(t.projectId, t.status)]);

export const changeOrders = pgTable('change_orders', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  budgetLineId: uuid('budget_line_id').references(() => budgetLines.id),
  number: integer('number').notNull().default(1),
  description: text('description').notNull(),
  amountCents: cents('amount_cents'),
  daysImpact: integer('days_impact').notNull().default(0),
  reason: text('reason'),
  status: text('status').notNull().default('proposed'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const scheduleItems = pgTable('schedule_items', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  milestoneId: uuid('milestone_id').references(() => milestones.id),
  name: text('name').notNull(),
  start: date('start').notNull(),
  end: date('end').notNull(),
  percentComplete: integer('percent_complete').notNull().default(0),
  dependsOn: uuid('depends_on'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const loans = pgTable('loans', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  lender: text('lender').notNull(),
  commitmentCents: cents('commitment_cents'),
  drawnCents: cents('drawn_cents'),
  rateBps: integer('rate_bps').notNull().default(0),
  maturity: date('maturity'),
  retainagePct: integer('retainage_pct').notNull().default(10),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const draws = pgTable('draws', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  loanId: uuid('loan_id').references(() => loans.id),
  number: integer('number').notNull().default(1),
  periodEnd: date('period_end').notNull(),
  status: text('status').notNull().default('draft'),
  requestedCents: cents('requested_cents'),
  retainageHeldCents: cents('retainage_held_cents'),
  fundedCents: cents('funded_cents'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  fundedAt: timestamp('funded_at', { withTimezone: true }),
  expectedFundingDate: date('expected_funding_date'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const drawItems = pgTable('draw_items', {
  id: id(),
  drawId: uuid('draw_id').notNull().references(() => draws.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  budgetLineId: uuid('budget_line_id').references(() => budgetLines.id),
  description: text('description').notNull(),
  amountCents: cents('amount_cents'),
  retainageCents: cents('retainage_cents'),
  createdAt: createdAt(),
});

export const documents = pgTable('documents', {
  id: id(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  uploadedByUserId: uuid('uploaded_by_user_id'),
  category: text('category').notNull().default('general'),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  storageKey: text('storage_key').notNull(),
  sizeBytes: integer('size_bytes'),
  status: text('status').notNull().default('pending'),
  createdAt: createdAt(),
});

export const projectUpdates = pgTable('project_updates', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  authorUserId: uuid('author_user_id'),
  body: text('body').notNull(),
  photoDocumentIds: jsonb('photo_document_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  visibility: text('visibility').notNull().default('owner'),
  createdAt: createdAt(),
});

export const projectInvestors = pgTable('project_investors', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  userId: uuid('user_id').notNull().references(() => users.id),
  commitmentCents: cents('commitment_cents'),
  fundedCents: cents('funded_cents'),
  ownershipPct: integer('ownership_pct').notNull().default(0),
  prefReturnBps: integer('pref_return_bps'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('project_investors_unique').on(t.projectId, t.userId)]);

export const capitalCalls = pgTable('capital_calls', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  amountCents: cents('amount_cents'),
  dueDate: date('due_date').notNull(),
  memo: text('memo'),
  status: text('status').notNull().default('issued'),
  createdAt: createdAt(),
});

export const investorReports = pgTable('investor_reports', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  period: varchar('period', { length: 7 }).notNull(),
  status: text('status').notNull().default('draft'),
  html: text('html').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('investor_reports_unique').on(t.projectId, t.period)]);

export const bids = pgTable('bids', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id'),
  scopeCode: text('scope_code').notNull(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  amountCents: cents('amount_cents'),
  leadTimeDays: integer('lead_time_days'),
  notes: text('notes'),
  status: text('status').notNull().default('received'),
  createdAt: createdAt(),
});

export const assistantThreads = pgTable('assistant_threads', {
  id: id(),
  userId: uuid('user_id').references(() => users.id),
  organizationId: uuid('organization_id'),
  projectId: uuid('project_id'),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  model: text('model').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

export const events = pgTable('events', {
  id: id(),
  type: text('type').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  lastError: text('last_error'),
}, (t) => [index('events_type_idx').on(t.type), index('events_pending_idx').on(t.deliveredAt, t.nextAttemptAt)]);

export const auditLog = pgTable('audit_log', {
  id: id(),
  actorUserId: uuid('actor_user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  data: jsonb('data').$type<Record<string, unknown>>(),
  ipAddress: text('ip_address'),
  createdAt: createdAt(),
});

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id').references(() => users.id),
  email: varchar('email', { length: 320 }),
  channel: text('channel').notNull().default('email'),
  template: text('template').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('sent'),
  createdAt: createdAt(),
});

export const parcelLookups = pgTable('parcel_lookups', {
  id: id(),
  normalizedAddress: text('normalized_address').notNull(),
  address: text('address').notNull(),
  lon: doublePrecision('lon'),
  lat: doublePrecision('lat'),
  fips: text('fips'),
  resolved: jsonb('resolved').$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
}, (t) => [index('parcel_lookups_addr_idx').on(t.normalizedAddress, t.createdAt)]);
