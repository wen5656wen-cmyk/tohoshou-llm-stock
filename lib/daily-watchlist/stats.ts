/**
 * Daily AI Watchlist — statistics (P6-T7)
 * ────────────────────────────────────────────────────────────────────────────
 * Pure aggregation over the day's watchlist rows. No DB, no scoring logic.
 * Performance metrics are based on `returnPct` (推荐后涨跌 = current vs entry),
 * which is the pool's "表现"; today's move is exposed separately via changePct.
 */
export type StatRow = {
  symbol: string;
  name?: string | null;
  recommendation: string; // STRONG_BUY | BUY
  returnPct: number | null;
  changePct: number | null;
};

export type PerfLeader = { symbol: string; name: string | null; returnPct: number } | null;

export type WatchlistStats = {
  total: number;
  up: number;
  down: number;
  flat: number;
  avgReturnPct: number | null;
  avgChangePct: number | null;
  topWinner: PerfLeader;
  topLoser: PerfLeader;
  strongBuy: { count: number; avgReturnPct: number | null };
  buy: { count: number; avgReturnPct: number | null };
};

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function perfOf(rows: StatRow[], rec: string) {
  const g = rows.filter((r) => r.recommendation === rec);
  const rets = g.map((r) => r.returnPct).filter((v): v is number => v != null);
  return { count: g.length, avgReturnPct: avg(rets) };
}

export function computeWatchlistStats(rows: StatRow[]): WatchlistStats {
  const withRet = rows.filter((r) => r.returnPct != null) as (StatRow & { returnPct: number })[];
  // 上涨/下跌 = 今日涨跌方向（currentPrice vs previousClose）— realtime board semantics
  const withChg = rows.filter((r) => r.changePct != null) as (StatRow & { changePct: number })[];
  const up = withChg.filter((r) => r.changePct > 0).length;
  const down = withChg.filter((r) => r.changePct < 0).length;
  const sorted = [...withRet].sort((a, b) => b.returnPct - a.returnPct);
  const lead = (r?: StatRow & { returnPct: number }): PerfLeader =>
    r ? { symbol: r.symbol, name: r.name ?? null, returnPct: r.returnPct } : null;

  return {
    total: rows.length,
    up,
    down,
    flat: withChg.length - up - down,
    avgReturnPct: avg(withRet.map((r) => r.returnPct)),
    avgChangePct: avg(rows.map((r) => r.changePct).filter((v): v is number => v != null)),
    topWinner: lead(sorted[0]),
    topLoser: lead(sorted[sorted.length - 1]),
    strongBuy: perfOf(rows, "STRONG_BUY"),
    buy: perfOf(rows, "BUY"),
  };
}
