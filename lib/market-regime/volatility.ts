/**
 * Market Regime — realized volatility of TOPIX (annualized %). Pure.
 * Independent: consumes a TOPIX close series (newest-first) only.
 */

/** Annualized realized volatility (%) from the last `n` daily TOPIX returns. */
export function computeVolatility(closesDesc: number[], n = 20): number | null {
  if (closesDesc.length < n + 1) return null;
  const rets: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = closesDesc[i];
    const b = closesDesc[i + 1];
    if (a > 0 && b > 0) rets.push(a / b - 1);
  }
  if (rets.length < 2) return null;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - m) * (b - m), 0) / (rets.length - 1);
  return Math.round(Math.sqrt(v) * Math.sqrt(252) * 100 * 100) / 100;
}
