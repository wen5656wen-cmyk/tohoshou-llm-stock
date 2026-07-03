/**
 * Alpha factor — Relative Strength vs TOPIX (excess return over N trading days).
 * Independent: consumes a price-bar array + a TOPIX-by-date map only.
 */
import type { Bar } from "./index";

export type RelativeStrength = {
  rs5: number | null;
  rs20: number | null;
  rs60: number | null;
};

function px(b: Bar): number {
  return b.adjClose ?? b.close;
}

/**
 * @param barsDesc price bars, newest first
 * @param topixByDate map of "YYYY-MM-DD" → TOPIX index level
 */
export function computeRelativeStrength(
  barsDesc: Bar[],
  topixByDate: Map<string, number>
): RelativeStrength {
  const out: RelativeStrength = { rs5: null, rs20: null, rs60: null };
  if (barsDesc.length < 2) return out;

  const latest = barsDesc[0];
  const tLatest = topixByDate.get(latest.date);

  const excess = (n: number): number | null => {
    if (barsDesc.length <= n) return null;
    const past = barsDesc[n];
    const p0 = px(latest);
    const pn = px(past);
    if (!(p0 > 0) || !(pn > 0)) return null;
    const tPast = topixByDate.get(past.date);
    if (tLatest == null || tPast == null || !(tPast > 0) || !(tLatest > 0)) return null;
    const stockRet = p0 / pn - 1;
    const topixRet = tLatest / tPast - 1;
    return Math.round((stockRet - topixRet) * 10000) / 100; // percent, 2dp
  };

  out.rs5 = excess(5);
  out.rs20 = excess(20);
  out.rs60 = excess(60);
  return out;
}
