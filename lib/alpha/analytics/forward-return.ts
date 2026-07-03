/**
 * Alpha Analytics — forward-return helpers (pure).
 * Independent: operates on a price-bar array + indices only.
 */
import type { Bar } from "../index";

function px(b: Bar): number {
  return b.adjClose ?? b.close;
}

/**
 * Forward return (%) from an as-of bar index over `h` trading days.
 * Bars are newest-first (index 0 = latest). The as-of date sits at index `k`; the
 * forward date T+h is at the newer index `k - h`.
 */
export function forwardReturnPct(barsDesc: Bar[], k: number, h: number): number | null {
  if (k - h < 0 || k >= barsDesc.length) return null;
  const p0 = px(barsDesc[k]);
  const pH = px(barsDesc[k - h]);
  if (!(p0 > 0) || !(pH > 0)) return null;
  return (pH / p0 - 1) * 100;
}

/** Percentage change between two levels (e.g. TOPIX), null-safe. */
export function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || !(from > 0)) return null;
  return (to / from - 1) * 100;
}

/** Excess return = asset return − benchmark return (both %). */
export function excess(assetRet: number | null, benchRet: number | null): number | null {
  if (assetRet == null || benchRet == null) return null;
  return assetRet - benchRet;
}
