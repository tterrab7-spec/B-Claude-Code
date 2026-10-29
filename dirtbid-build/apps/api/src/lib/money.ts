export const usd = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
export const pct = (n: number): string => `${Math.round(n * 100)}%`;
export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
