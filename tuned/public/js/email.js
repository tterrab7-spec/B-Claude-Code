// Daily "today's session" email. Built once here: the server serves it to n8n for
// sending, and the PT dashboard previews exactly the same message.
import { SPRINTS, exName, doseText } from './data.js';
import { sessionPlan, startSprint, TOTAL_SESSIONS } from './engine.js';
import { effectiveMods, compliance } from './clinic.js';

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function dailyEmail(u, c, appUrl = '') {
  let sp = u.sprint;
  // A program the PT assigned since the patient last synced: send its first session.
  const a = c?.assignment;
  let mods = effectiveMods(u, c);
  if (a && SPRINTS[a.programId] && a.at > (u.assignedAt || '')) { sp = { ...startSprint(a.programId), startedAt: a.at }; mods = {}; }
  if (!sp || !SPRINTS[sp.id] || sp.sessions.length >= TOTAL_SESSIONS) return null;
  const q = !!u.quiet;
  const plan = sessionPlan({ ...sp, mods });
  const first = (u.profile?.name || '').split(' ')[0] || 'there';
  const brand = q ? 'Daily' : 'TUNED';
  const title = q ? 'Your program' : SPRINTS[sp.id].title;
  const comp = compliance({ ...u, sprint: sp });
  const ptMsg = (c?.messages || []).filter(m => m.role === 'pt').at(-1);
  const link = appUrl ? appUrl.replace(/\/?$/, '/') + '#/session' : '';
  const subject = q ? `Today's session (${plan.items.length} items)` : `Session ${plan.idx + 1} of ${TOTAL_SESSIONS}: week ${plan.week}, ${plan.phase}`;
  const rows = plan.items.map((i, k) => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #e6e6e6;vertical-align:top;width:28px;font:700 14px Arial;color:#ff6a13">${k + 1}</td>
    <td style="padding:12px 0;border-bottom:1px solid #e6e6e6"><div style="font:700 16px Arial;color:#111">${h(exName(i.id, q))}</div>
      <div style="font:13px Menlo,monospace;color:#555;margin:2px 0 6px">${h(doseText(i.ex, i.mod))}</div>
      <div style="font:14px/1.45 Arial;color:#444">${h(i.ex.cues?.[0] || '')}</div>
      ${i.note ? `<div style="font:14px/1.45 Arial;color:#111;background:#fff4ec;border-left:3px solid #ff6a13;padding:6px 10px;margin-top:6px"><b>From your PT:</b> ${h(i.note)}</div>` : ''}
      ${i.ex.video ? `<div style="margin-top:6px"><a href="${h(i.ex.video)}" style="font:600 14px Arial;color:#ff6a13">Watch the demo</a></div>` : ''}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f2;padding:24px 12px">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;font-family:Arial,sans-serif">
    <tr><td><div style="font:800 20px Arial;letter-spacing:.12em;color:#111">${brand}</div>
      <h1 style="font:700 24px/1.2 Arial;color:#111;margin:18px 0 6px">Morning, ${h(first)}. Today is session ${plan.idx + 1}.</h1>
      <p style="font:15px/1.5 Arial;color:#555;margin:0 0 4px">${h(title)} · Week ${plan.week} of 6 · ${h(plan.phase)} · about 25 minutes</p>
      <p style="font:13px Arial;color:#888;margin:0 0 16px">${comp.done} session${comp.done === 1 ? '' : 's'} done so far · ${comp.pct}% on schedule</p>
      ${ptMsg ? `<p style="font:14px/1.5 Arial;color:#111;background:#f0f6ff;padding:10px 12px;border-radius:8px"><b>${h(ptMsg.from)}:</b> ${h(ptMsg.text)}</p>` : ''}
      <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
      ${link ? `<p style="text-align:center;margin:22px 0 8px"><a href="${h(link)}" style="display:inline-block;background:#ff6a13;color:#160800;font:700 16px Arial;text-decoration:none;padding:14px 28px;border-radius:999px">Start today's session</a></p>` : ''}
      <p style="font:12px/1.5 Arial;color:#999;margin-top:18px">Pain up to 5/10 during exercise is fine if it settles by the next morning. Sharp, spreading or numb: stop that move and tell your PT. Emergency: call 911.</p>
    </td></tr></table></body></html>`;
  const text = [`Morning, ${first}. Today is session ${plan.idx + 1} (${title}, week ${plan.week}, ${plan.phase}).`, '',
    ...plan.items.map((i, k) => `${k + 1}. ${exName(i.id, q)}: ${doseText(i.ex, i.mod)}${i.note ? `\n   From your PT: ${i.note}` : ''}${i.ex.video ? `\n   Demo: ${i.ex.video}` : ''}`),
    '', link ? `Start: ${link}` : '', ptMsg ? `\n${ptMsg.from}: ${ptMsg.text}` : ''].join('\n');
  return { to: u.profile?.email || '', name: u.profile?.name || '', subject, html, text, patientId: u.id };
}
