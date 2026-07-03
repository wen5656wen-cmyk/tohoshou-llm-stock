/**
 * Alpha Analytics — basic performance statistics (mean / win-rate / std / sharpe). Pure.
 * Independent: operates on numeric arrays only.
 */

export function mean(a: number[]): number | null {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}

/** Win rate (%) = share of strictly-positive returns. */
export function winRate(returns: number[]): number | null {
  if (!returns.length) return null;
  return (returns.filter((r) => r > 0).length / returns.length) * 100;
}

/** Sample standard deviation. */
export function std(a: number[]): number | null {
  if (a.length < 2) return null;
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
  return Math.sqrt(v);
}

/** Simplified Sharpe = mean / std (no risk-free, no annualization). */
export function sharpe(returns: number[]): number | null {
  const m = mean(returns);
  const s = std(returns);
  if (m == null || s == null || s === 0) return null;
  return m / s;
}
