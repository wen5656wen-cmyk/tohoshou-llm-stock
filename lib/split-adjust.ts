/**
 * Split-adjustment integrity helpers (pure, DB-free, network-free).
 * ────────────────────────────────────────────────────────────────────────────
 * Single source of truth for detecting and repairing stale `adjClose` caused by
 * stock splits. J-Quants back-adjusts the ENTIRE `AdjC` history on the ex-date
 * of a corporate action, but the incremental price sync historically used
 * `createMany({ skipDuplicates: true })` which never overwrites existing rows —
 * so pre-split rows kept their stale (unadjusted) adjClose and produced a fake
 * cliff in every adjClose-based indicator (MA/RSI/MACD/returns/volatility).
 *
 * These functions are pure so they can be unit-tested offline and reused by
 * both `scripts/fix-split-adjustment.ts` and `scripts/sync-all-prices.ts`.
 */

/** Single-day |return| on the adjusted series that flags a *suspected* unadjusted split.
 *  A clean 1:2 split leaves a -50% cliff; 1:3 → -66.7%; 1:4 → -75%. 0.35 catches
 *  the common splits while staying above ordinary daily moves. Genuine large moves
 *  are filtered out afterwards by cross-checking against fresh J-Quants AdjC. */
export const SPLIT_CLIFF_THRESHOLD = 0.35;

/** A price bar carrying the raw close and (optionally) the adjusted close + daily factor. */
export type AdjBar = {
  date: string;
  close: number;
  adjClose: number | null;
  adjFactor?: number | null;
};

/** Effective adjusted close — mirrors `lib/indicators.ts::effectiveClose`.
 *  All indicator/return math must use this so split events never leak in. */
export function effAdj(b: { close: number; adjClose?: number | null }): number {
  return b.adjClose ?? b.close;
}

/** True if any bar carries a daily adjustment factor that deviates from 1 —
 *  i.e. a corporate action (split / reverse-split) happened in this window. */
export function hasCorporateAction(bars: { adjFactor?: number | null }[]): boolean {
  return bars.some((b) => b.adjFactor != null && Math.abs(b.adjFactor - 1) > 1e-9);
}

export type AdjCliff = { date: string; prev: number; cur: number; ret: number };

/** Scan an ASCENDING-by-date series for single-day cliffs on the adjusted close.
 *  A cliff on adjClose (rather than raw close) is the signature of a stale,
 *  un-back-adjusted split — because a correctly adjusted series is continuous. */
export function findAdjCloseCliffs(rows: AdjBar[], threshold = SPLIT_CLIFF_THRESHOLD): AdjCliff[] {
  const out: AdjCliff[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = effAdj(rows[i - 1]);
    const cur = effAdj(rows[i]);
    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(cur)) {
      const ret = (cur - prev) / prev;
      if (Math.abs(ret) >= threshold) out.push({ date: rows[i].date, prev, cur, ret });
    }
  }
  return out;
}

/**
 * Diff stored adjClose against fresh J-Quants bars → the corrections to apply.
 * Only rows whose stored adjClose actually differs from the fresh (correctly
 * back-adjusted) value are returned. For a GENUINE large move (not a split) the
 * stored value already equals the fresh value → zero updates → self-filtering.
 */
export function computeAdjCloseUpdates(
  stored: { date: string; adjClose: number | null }[],
  fresh: { date: string; adjClose: number | null; close: number }[],
  tolerance = 0.01,
): { date: string; adjClose: number }[] {
  const freshMap = new Map<string, number>();
  for (const f of fresh) freshMap.set(f.date, f.adjClose ?? f.close);

  const updates: { date: string; adjClose: number }[] = [];
  for (const s of stored) {
    const want = freshMap.get(s.date);
    if (want == null || !Number.isFinite(want)) continue;
    const have = s.adjClose;
    if (have == null || Math.abs(have - want) > tolerance) {
      updates.push({ date: s.date, adjClose: want });
    }
  }
  return updates;
}

/** Per-row cumulative back-adjustment ratio = adjClose / close (∈ (0,1] for
 *  forward splits). Applying it uniformly to open/high/low yields a fully
 *  split-adjusted OHLC bar without needing a separate adjusted-OHLC column. */
export function adjRatio(close: number, adjClose: number | null | undefined): number {
  if (adjClose == null || !Number.isFinite(adjClose) || !(close > 0)) return 1;
  return adjClose / close;
}
