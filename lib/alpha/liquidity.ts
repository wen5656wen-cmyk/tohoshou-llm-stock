/**
 * Alpha factor — 20-day average turnover (JPY = close × volume, averaged).
 * Independent: consumes a price-bar array only.
 */
import type { Bar } from "./index";

export type LiquidityFactors = {
  averageTurnover20: number | null;
};

const WINDOW = 20;

export function computeLiquidity(barsDesc: Bar[]): LiquidityFactors {
  if (barsDesc.length < 1) return { averageTurnover20: null };

  const window = barsDesc.slice(0, Math.min(WINDOW, barsDesc.length));
  let sum = 0;
  let count = 0;
  for (const b of window) {
    if (b.volume != null && b.volume >= 0 && b.close > 0) {
      sum += b.close * b.volume;
      count++;
    }
  }
  return { averageTurnover20: count > 0 ? Math.round(sum / count) : null };
}
