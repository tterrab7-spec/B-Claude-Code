/** Typed client for the DirtBid Build API (see docs/API_CONTRACT.md). */
import { IS_DEMO } from './demo';

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/v1';
export const TOKEN_KEY = 'dirtbid_token';

export type ApiErrorCode = 'validation' | 'not_found' | 'unauthorized' | 'forbidden' | 'conflict' | 'rate_limited' | 'internal' | 'network';

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, message: string, public fields: Record<string, string> = {}, public status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t && IS_DEMO) { localStorage.setItem(TOKEN_KEY, 'demo:staff'); return 'demo:staff'; } // demo: staff is signed in by default
    return t;
  } catch { return IS_DEMO ? 'demo:staff' : null; }
}
export function setToken(t: string | null): void {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function request<T>(method: string, path: string, body?: unknown, opts: { signal?: AbortSignal } = {}): Promise<T> {
  if (IS_DEMO) {
    (globalThis as { __dirtbidToken?: string | null }).__dirtbidToken = getToken();
    const { demoRequest } = await import('@/demo/server');
    return demoRequest<T>(method, path, body);
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include', signal: opts.signal });
  } catch (e) {
    throw new ApiError('network', 'Could not reach the DirtBid API. Check your connection or try again shortly.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err = (data as { error?: { code?: ApiErrorCode; message?: string; fields?: Record<string, string> } } | null)?.error;
    if (res.status === 401) setToken(null);
    throw new ApiError(err?.code ?? (res.status === 404 ? 'not_found' : res.status === 401 ? 'unauthorized' : 'internal'), err?.message ?? `Request failed (${res.status})`, err?.fields ?? {}, res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: { signal?: AbortSignal }) => request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

// ---- Contract types (subset used by the web app) ----
export type LeadKind = 'feasibility_snapshot' | 'feasibility_enhanced' | 'homeowner_rebuild' | 'builder_qualification' | 'builder_audit' | 'calculator_unlock' | 'strategy_call' | 'codev_partner';
export interface LeadPayload {
  kind: LeadKind;
  contact: { fullName: string; email: string; phone?: string };
  property?: { address?: string; city?: string; state?: string; zip?: string; apn?: string; propertyType?: 'vacant_land' | 'residential_house' | 'commercial'; lotSize?: number; lotSizeUnit?: 'sf' | 'acres'; homeSizeSf?: number; ownsLand?: boolean; zoningCode?: string };
  answers?: Record<string, unknown>;
  consent: boolean;
  utm?: Record<string, string>;
  website: string;
}
export interface LeadResponse { leadId: string; score: number; grade: 'A' | 'B' | 'C' | 'D'; nextStep: { type: string; url?: string } }
export interface Lead { id: string; kind: LeadKind; status: string; grade: string; score: number; contact: { fullName: string; email: string; phone?: string }; property?: LeadPayload['property']; answers?: Record<string, unknown>; createdAt: string; assigneeUserId?: string | null; notes?: string | null }
export interface Service { code: string; name: string; priceCents: number | null; priceFromCents?: number | null; billing: 'one_time' | 'monthly' | 'quote'; creditBack?: { toService: string; windowDays: number }; description: string; includes: string[] }
export interface User { id: string; email: string; fullName?: string; phone?: string; roles: string[]; organizations: { id: string; name: string }[] }
export interface PortfolioSummary {
  activeProjects: number; constructionBudgetCents: number; committedCents: number; forecastAtCompletionCents: number; remainingLoanProceedsCents: number; cashNeeded30dCents: number; projectsAtRisk: number; reportsDue: number;
  projects: { id: string; name: string; stage: string; budgetCents: number; committedCents: number; facCents: number; scheduleStatus: string; drawStatus: string; riskLevel: string }[];
}
export interface ProjectSummary { budgetCents: number; committedCents: number; invoicedCents: number; paidCents: number; forecastAtCompletionCents: number; varianceCents: number; percentComplete: number; scheduleStatus: string; nextMilestone?: { name: string; plannedEnd?: string } | null; openInvoices: number; drawStatus: string; riskLevel: string }
export interface Project { id: string; name: string; programType: string; address?: string; marketCode?: string; status?: string; organizationId?: string | null; createdAt?: string }
export interface Milestone { id: string; phase: string; name: string; plannedStart?: string | null; plannedEnd?: string | null; actualStart?: string | null; actualEnd?: string | null; status: 'pending' | 'in_progress' | 'complete' | 'blocked'; owner?: string | null }
export interface BudgetLine { id: string; csiDivision: string; code?: string; description: string; originalCents: number; approvedChangesCents: number; revisedCents: number; committedCents: number; invoicedCents: number; paidCents: number; forecastToCompleteCents: number; forecastAtCompletionCents: number; varianceCents: number }
export interface Invoice { id: string; vendorId?: string; vendorName?: string; invoiceNumber: string; amountCents: number; retainageCents?: number; status: string; invoiceDate?: string; dueDate?: string; budgetLineId?: string }
export interface Draw { id: string; loanId: string; periodEnd: string; status: string; totalCents: number; fundedCents?: number | null; items?: { id: string; invoiceId: string; amountCents: number; description?: string }[]; createdAt?: string }
export interface Loan { id: string; lender: string; commitmentCents: number; drawnCents: number; rateBps: number; maturity?: string }
export interface ScheduleItem { id: string; name: string; start: string; end: string; percentComplete: number; milestoneId?: string | null }
export interface CashflowWeek { weekStart: string; outflowsCents: number; inflowsCents: number; netCents: number; cumulativeCents: number }
export interface Cashflow { weeks: CashflowWeek[]; shortfall: { weekStart: string; amountCents: number } | null }
export interface Investor { id: string; userId?: string; email?: string; name?: string; commitmentCents: number; ownershipPct: number }
export interface InvestorReport { id: string; period: string; status: 'draft' | 'sent'; html?: string; createdAt?: string; sentAt?: string | null }
export interface Doc { id: string; fileName: string; category: string; contentType?: string; createdAt?: string; url?: string }
export interface ProjectUpdate { id: string; body: string; visibility: string; createdAt: string; authorName?: string; photoDocumentIds?: string[] }
export interface AssistantResponse { answer: string; data?: unknown; actions: { type: string; label: string; payload?: unknown }[]; model: 'claude' | 'rules' }

export const DISPOSABLE_DOMAINS = new Set(['mailinator.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com', 'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com']);
export const isDisposable = (email: string): boolean => DISPOSABLE_DOMAINS.has((email.split('@')[1] ?? '').toLowerCase());

export function utmFromLocation(): Record<string, string> | undefined {
  try {
    const p = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const k of ['source', 'medium', 'campaign', 'content', 'term']) { const v = p.get(`utm_${k}`); if (v) out[k] = v; }
    return Object.keys(out).length ? out : undefined;
  } catch { return undefined; }
}
