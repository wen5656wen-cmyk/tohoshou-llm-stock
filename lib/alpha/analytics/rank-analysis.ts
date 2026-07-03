/**
 * Alpha Analytics — quantile (Top/Bottom quintile) return analysis. Pure.
 * Independent: operates on {factor, return} pairs only.
 */
export type Pair = { f: number; r: number };

export type QuantileResult = {
  topMean: number | null;    // mean return of highest-factor quantile
  bottomMean: number | null; // mean return of lowest-factor quantile
  spread: number | null;     // topMean − bottomMean (long-short)
};

/** Top/Bottom quantile mean returns (default 20% each). Needs ≥10 pairs. */
export function quantileReturns(pairs: Pair[], q = 0.2): QuantileResult {
  const n = pairs.length;
  if (n < 10) return { topMean: null, bottomMean: null, spread: null };
  const sorted = [...pairs].sort((a, b) => a.f - b.f);
  const k = Math.max(1, Math.floor(n * q));
  const bottom = sorted.slice(0, k);
  const top = sorted.slice(n - k);
  const mean = (a: Pair[]) => a.reduce((s, x) => s + x.r, 0) / a.length;
  const topMean = mean(top);
  const bottomMean = mean(bottom);
  return { topMean, bottomMean, spread: topMean - bottomMean };
}
