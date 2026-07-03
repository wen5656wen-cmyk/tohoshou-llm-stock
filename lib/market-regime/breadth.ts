/**
 * Market Regime — market breadth (% of stocks above their MA20). Pure.
 * Independent: the caller supplies the above/total counts for a date.
 */

/** Breadth (%) = stocks above MA20 / total. */
export function computeBreadth(aboveMa20: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((aboveMa20 / total) * 10000) / 100;
}
