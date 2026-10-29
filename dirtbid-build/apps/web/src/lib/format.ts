export const usd = (n: number | null | undefined, opts: { compact?: boolean } = {}): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (opts.compact) {
    const abs = Math.abs(n);
    if (abs >= 1e6) return `${n < 0 ? '-' : ''}$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
    if (abs >= 1e3) return `${n < 0 ? '-' : ''}$${Math.round(abs / 1e3)}K`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};
export const cents = (c: number | null | undefined, opts: { compact?: boolean } = {}): string => usd(c === null || c === undefined ? c : c / 100, opts);
export const pct = (n: number | null | undefined, digits = 0): string => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(digits)}%`);
export const num = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('en-US').format(n));
export const dateShort = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const titleCase = (s: string): string => s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
