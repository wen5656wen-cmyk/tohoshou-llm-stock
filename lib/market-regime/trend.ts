/**
 * Market Regime — trend classification from the TOPIX moving-average stack. Pure.
 * Independent: consumes a TOPIX close series (newest-first) only.
 */
export type TrendResult = {
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  trendScore: number | null; // -1 (down) .. +1 (up)
};

function sma(closesDesc: number[], n: number): number | null {
  if (closesDesc.length < n) return null;
  return closesDesc.slice(0, n).reduce((a, b) => a + b, 0) / n;
}

/** @param closesDesc TOPIX closes newest-first (index 0 = the as-of date). */
export function classifyTrend(closesDesc: number[]): TrendResult {
  const px = closesDesc[0] ?? null;
  const ma20 = sma(closesDesc, 20);
  const ma60 = sma(closesDesc, 60);
  const ma120 = sma(closesDesc, 120);
  if (px == null || ma20 == null || ma60 == null || ma120 == null) {
    return { ma20, ma60, ma120, trendScore: null };
  }
  // 5-condition MA stack alignment → score in [-1, 1].
  const conds = [px > ma20, px > ma60, px > ma120, ma20 > ma60, ma60 > ma120];
  const t = conds.filter(Boolean).length;
  const trendScore = Math.round(((2 * t) / conds.length - 1) * 1000) / 1000;
  return { ma20, ma60, ma120, trendScore };
}
