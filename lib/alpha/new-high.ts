/**
 * Alpha factor — distance to 52-week high / low (signed %, adjClose-based, split-safe).
 * Independent: consumes a price-bar array only.
 *   distanceTo52WeekHigh: (latest / high52w - 1) * 100  → 0 at high, negative below
 *   distanceTo52WeekLow:  (latest / low52w  - 1) * 100  → 0 at low, positive above
 */
import type { Bar } from "./index";

export type NewHighDistance = {
  distanceTo52WeekHigh: number | null;
  distanceTo52WeekLow: number | null;
};

const WINDOW = 250; // ~52 weeks of trading days

function px(b: Bar): number {
  return b.adjClose ?? b.close;
}

export function compute52WeekDistance(barsDesc: Bar[]): NewHighDistance {
  const out: NewHighDistance = { distanceTo52WeekHigh: null, distanceTo52WeekLow: null };
  if (barsDesc.length < 2) return out;

  const window = barsDesc.slice(0, Math.min(WINDOW, barsDesc.length));
  const prices = window.map(px).filter((p) => p > 0);
  if (!prices.length) return out;

  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const latest = px(barsDesc[0]);
  if (!(latest > 0)) return out;

  if (high > 0) out.distanceTo52WeekHigh = Math.round((latest / high - 1) * 10000) / 100;
  if (low > 0) out.distanceTo52WeekLow = Math.round((latest / low - 1) * 10000) / 100;
  return out;
}
