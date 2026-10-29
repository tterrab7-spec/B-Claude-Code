import type { App } from '../../app.js';
import { usd } from '../../lib/money.js';
import { runTool, TOOL_DEFINITIONS, type ToolScope } from './tools.js';

export interface AssistantAction { type: 'open_project' | 'create_draw' | 'generate_report' | 'approve_invoice'; label: string; payload: Record<string, unknown> }
export interface AssistantAnswer { answer: string; data?: Record<string, unknown>; actions: AssistantAction[]; model: 'claude' | 'rules' }

const SYSTEM = `You are the DirtBid Build operations assistant for a residential builder / developer. Answer concisely in plain language with dollar figures rounded to the nearest thousand. Use the tools to read live project data before answering; never invent numbers. Money from tools is in integer cents. When something needs action (submit a draw, approve invoices, generate a report), say so in one sentence.`;

/** Deterministic answers for the six canonical questions; also the fallback when no model key is configured. */
export async function rulesAnswer(app: App, scope: ToolScope, question: string, projectId?: string): Promise<AssistantAnswer> {
  const q = question.toLowerCase();
  const actions: AssistantAction[] = [];
  if (/over budget|variance|trending/.test(q)) {
    const d = await runTool(app, scope, 'project_variance', { projectId }) as any;
    const over = d.overBudget as any[];
    if (!over.length) return { answer: 'No project is forecasting over budget. Every forecast at completion is at or under its revised budget.', data: d, actions, model: 'rules' };
    for (const p of over) actions.push({ type: 'open_project', label: `Open ${p.name}`, payload: { projectId: p.projectId } });
    return { answer: `${over.length} project${over.length > 1 ? 's are' : ' is'} trending over budget: ` + over.map((p) => `${p.name} is forecasting a ${usd(-p.varianceCents)} overrun (${Math.abs(Math.round(p.variancePct * 100))}%)${p.worstLines[0] ? `, driven by ${p.worstLines[0].description}` : ''}`).join('; ') + '.', data: d, actions, model: 'rules' };
  }
  if (/cash|need.*(30|sixty|60|90) days|next \d+ days|shortfall/.test(q)) {
    const days = Number(q.match(/(\d+)\s*days/)?.[1] ?? 30);
    const d = await runTool(app, scope, 'cash_needs', { days, projectId }) as any;
    const top = (d.projects as any[]).filter((p) => p.needCents > 0);
    return { answer: top.length ? `You need about ${usd(d.totalNeedCents)} over the next ${days} days. ${top.map((p) => `${p.name} needs ${usd(p.needCents)}${p.shortfallWeek ? ` starting the week of ${p.shortfallWeek}` : ''}`).join('; ')}. Submitting ready draws reduces this.` : `No cash shortfall is forecast over the next ${days} days; expected draw fundings cover scheduled spend.`, data: d, actions, model: 'rules' };
  }
  if (/invoice/.test(q) && /missing|still|outstanding|waiting|approv/.test(q)) {
    const d = await runTool(app, scope, 'missing_invoices', { projectId }) as any;
    for (const i of (d.pendingApproval as any[]).slice(0, 5)) actions.push({ type: 'approve_invoice', label: `Approve ${i.vendor} ${i.invoiceNumber}`, payload: { invoiceId: i.invoiceId } });
    const pend = d.pendingApproval.length; const un = d.uninvoicedCommitments.length;
    return { answer: `${pend} invoice${pend === 1 ? '' : 's'} awaiting approval${pend ? ` (${(d.pendingApproval as any[]).slice(0, 4).map((i) => `${i.vendor} ${usd(i.amountCents)}`).join(', ')})` : ''}. ${un} issued commitment${un === 1 ? '' : 's'} with no invoice yet${un ? `: ${(d.uninvoicedCommitments as any[]).slice(0, 4).map((c) => `${c.vendor} for ${c.description}`).join(', ')}` : ''}.`, data: d, actions, model: 'rules' };
  }
  if (/draw/.test(q)) {
    const d = await runTool(app, scope, 'draws_ready', { projectId }) as any;
    for (const dr of d.draftDraws as any[]) actions.push({ type: 'create_draw', label: `Submit draw #${dr.number} for ${dr.project}`, payload: { drawId: dr.drawId } });
    for (const p of d.drawable as any[]) actions.push({ type: 'create_draw', label: `Assemble a draw for ${p.project}`, payload: { projectId: p.projectId } });
    return { answer: `${d.draftDraws.length} draw${d.draftDraws.length === 1 ? ' is' : 's are'} ready to submit${d.draftDraws.length ? ` (${(d.draftDraws as any[]).map((x) => `${x.project} #${x.number} for ${usd(x.netCents)} net`).join(', ')})` : ''}. ${d.drawable.length ? `${d.drawable.length} project${d.drawable.length === 1 ? ' has' : 's have'} approved invoices not yet in a draw: ${(d.drawable as any[]).map((x) => `${x.project} ${usd(x.approvedUnpaidCents)}`).join(', ')}.` : 'No approved invoices are waiting outside a draw.'}`, data: d, actions, model: 'rules' };
  }
  if (/investor report|monthly report|generate.*report/.test(q)) {
    const period = q.match(/(20\d{2}-\d{2})/)?.[1] ?? new Date().toISOString().slice(0, 7);
    if (projectId) {
      const d = await runTool(app, scope, 'generate_investor_report', { projectId, period }) as any;
      actions.push({ type: 'generate_report', label: `Open ${period} report`, payload: { reportId: d.reportId } });
      return { answer: `Generated the ${period} investor report for ${d.project}. It is in draft; review it and send when ready.`, data: d, actions, model: 'rules' };
    }
    const s = await runTool(app, scope, 'portfolio_summary', {}) as any;
    for (const p of s.projects as any[]) actions.push({ type: 'generate_report', label: `Generate ${period} report for ${p.name}`, payload: { projectId: p.id, period } });
    return { answer: `Pick a project to generate the ${period} investor report for. ${s.reportsDue} project${s.reportsDue === 1 ? ' has' : 's have'} a report due.`, data: s, actions, model: 'rules' };
  }
  const s = await runTool(app, scope, 'portfolio_summary', {}) as any;
  return { answer: `${s.activeProjects} active project${s.activeProjects === 1 ? '' : 's'}, ${usd(s.constructionBudgetCents)} construction budget, ${usd(s.committedCents)} committed, forecast at completion ${usd(s.forecastAtCompletionCents)}. ${usd(s.remainingLoanProceedsCents)} of loan proceeds remain and about ${usd(s.cashNeeded30dCents)} of cash is needed in the next 30 days. ${s.projectsAtRisk} project${s.projectsAtRisk === 1 ? '' : 's'} at risk and ${s.reportsDue} report${s.reportsDue === 1 ? '' : 's'} due. Ask about budget variance, cash needs, missing invoices, draws, or investor reports.`, data: s, actions, model: 'rules' };
}

export async function claudeAnswer(app: App, scope: ToolScope, question: string, projectId?: string): Promise<AssistantAnswer> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: app.cfg.anthropicApiKey });
  const messages: any[] = [{ role: 'user', content: projectId ? `[projectId=${projectId}] ${question}` : question }];
  const collected: Record<string, unknown> = {};
  for (let turn = 0; turn < 6; turn++) {
    const res: any = await client.messages.create({ model: app.cfg.anthropicModel, max_tokens: 1200, system: SYSTEM, tools: TOOL_DEFINITIONS as any, messages });
    const toolUses = res.content.filter((c: any) => c.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !toolUses.length) {
      const text = res.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();
      return { answer: text || 'No answer produced.', data: collected, actions: [], model: 'claude' };
    }
    messages.push({ role: 'assistant', content: res.content });
    const results = [];
    for (const tu of toolUses) {
      const out = await runTool(app, scope, tu.name, { ...(tu.input ?? {}), projectId: tu.input?.projectId ?? projectId });
      collected[tu.name] = out;
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 20000) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { answer: 'The assistant hit its tool-call limit before finishing. Try a narrower question.', data: collected, actions: [], model: 'claude' };
}
