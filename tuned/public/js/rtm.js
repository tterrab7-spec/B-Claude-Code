// Remote Therapeutic Monitoring (RTM) eligibility. Shared by the browser and the server.
// Code set reflects the CY2026 Medicare Physician Fee Schedule, including the new
// 2-15 day supply code (98985) and the 10-minute management code (98979).
// Billing rules vary by payer. Have your billing lead confirm before submitting claims.

export const RTM_CODES = {
  '98975': 'RTM initial setup and patient education (once per episode)',
  '98977': 'RTM device supply, musculoskeletal, 16-30 days in a 30-day period',
  '98985': 'RTM device supply, musculoskeletal, 2-15 days in a 30-day period',
  '98979': 'RTM treatment management, first 10-19 minutes in a calendar month',
  '98980': 'RTM treatment management, first 20 minutes in a calendar month',
  '98981': 'RTM treatment management, each additional 20 minutes',
};

const day = iso => (iso || '').slice(0, 10);

export function dataDays(u) {
  const d = new Set();
  (u.sprint?.sessions || []).forEach(s => d.add(day(s.at)));
  (u.checkins || []).forEach(c => d.add(day(c.at)));
  (u.scores || []).forEach(s => d.add(day(s.at)));
  (u.pads || []).forEach(p => d.add(p.date));
  (u.formChecks || []).forEach(f => d.add(day(f.at)));
  d.delete('');
  return [...d].sort();
}

// 30-day periods run from the episode start (Sprint start).
export function currentPeriod(u, now = new Date()) {
  const start = new Date(u.sprint?.startedAt || u.created || now);
  const n = Math.max(0, Math.floor((now - start) / (30 * 86400000)));
  const from = new Date(start.getTime() + n * 30 * 86400000);
  const to = new Date(from.getTime() + 30 * 86400000);
  return { from, to, index: n };
}

export function rtmStatus(u, minutesLog = [], now = new Date()) {
  const { from, to, index } = currentPeriod(u, now);
  const f = from.toISOString().slice(0, 10), t = to.toISOString().slice(0, 10);
  const days = dataDays(u).filter(x => x >= f && x < t).length;
  const month = now.toISOString().slice(0, 7);
  const mins = minutesLog.filter(m => (m.at || '').slice(0, 7) === month);
  const minutes = mins.reduce((a, m) => a + (+m.minutes || 0), 0);
  const interactive = mins.some(m => m.interactive);
  const codes = [];
  if (index === 0 && (u.sprint?.sessions?.length || 0) > 0) codes.push('98975');
  if (days >= 16) codes.push('98977'); else if (days >= 2) codes.push('98985');
  if (interactive) {
    if (minutes >= 20) { codes.push('98980'); for (let k = 0; k < Math.floor((minutes - 20) / 20); k++) codes.push('98981'); }
    else if (minutes >= 10) codes.push('98979');
  }
  return {
    periodStart: from.toISOString().slice(0, 10), periodEnd: to.toISOString().slice(0, 10), days, minutes, interactive, codes,
    toSupply16: Math.max(0, 16 - days), toMgmt20: Math.max(0, 20 - minutes),
  };
}
