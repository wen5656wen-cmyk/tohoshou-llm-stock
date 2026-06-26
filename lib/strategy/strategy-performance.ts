// Strategy performance aggregation — reads from StrategyBacktestResult
// v15.0 — Three-Strategy System

import type { StrategyType } from "./strategy-classifier";

export type StrategyStats = {
  strategyType: StrategyType | "OVERALL";
  totalRows: number;         // all rows (including OPEN)
  completedRows: number;     // TAKE_PROFIT + STOP_LOSS + TIME_EXIT
  openRows: number;          // OPEN — still holding
  insufficientRows: number;  // INSUFFICIENT_DATA — no price data
  winCount: number;          // returnPct > 0 among completed
  loseCount: number;         // returnPct <= 0 among completed
  winRate: number | null;    // winCount / (winCount + loseCount) * 100; null if < MIN_SAMPLE
  avgReturnPct: number | null;
  avgAlphaPct: number | null;
  avgHoldingDays: number | null;
  takeProfit: number;        // TAKE_PROFIT exit count
  stopLoss: number;          // STOP_LOSS exit count
  timeExit: number;          // TIME_EXIT exit count
  sampleCount: number;       // completedRows (used for min sample check)
};

export const MIN_SAMPLE = 10; // minimum completed rows to show meaningful win rate

type RawRow = {
  strategyType: string;
  exitReason: string | null;
  returnPct: number | null;
  alphaPct: number | null;
  holdingDays: number | null;
  isWin: boolean | null;
};

export function aggregateStrategyStats(rows: RawRow[]): {
  overall: StrategyStats;
  byStrategy: Record<StrategyType, StrategyStats>;
} {
  const strategies: StrategyType[] = ["DAY", "SWING", "POSITION"];
  const empty = (): Omit<StrategyStats, "strategyType"> => ({
    totalRows: 0, completedRows: 0, openRows: 0, insufficientRows: 0,
    winCount: 0, loseCount: 0, winRate: null, avgReturnPct: null,
    avgAlphaPct: null, avgHoldingDays: null,
    takeProfit: 0, stopLoss: 0, timeExit: 0, sampleCount: 0,
  });

  const buckets: Record<string, ReturnType<typeof empty>> = {
    OVERALL: empty(), DAY: empty(), SWING: empty(), POSITION: empty(),
  };

  for (const row of rows) {
    const stype = row.strategyType;
    if (!buckets[stype]) continue;

    const targets = [buckets.OVERALL, buckets[stype]];
    for (const b of targets) {
      b.totalRows++;
      if (row.exitReason === "OPEN") { b.openRows++; continue; }
      if (row.exitReason === "INSUFFICIENT_DATA") { b.insufficientRows++; continue; }
      // completed
      b.completedRows++;
      if (row.exitReason === "TAKE_PROFIT") b.takeProfit++;
      else if (row.exitReason === "STOP_LOSS") b.stopLoss++;
      else if (row.exitReason === "TIME_EXIT") b.timeExit++;

      if (row.isWin === true) b.winCount++;
      else if (row.isWin === false) b.loseCount++;
    }
  }

  // Compute averages from completed rows only
  const returnsByStrategy: Record<string, number[]> = { OVERALL: [], DAY: [], SWING: [], POSITION: [] };
  const alphasByStrategy:  Record<string, number[]> = { OVERALL: [], DAY: [], SWING: [], POSITION: [] };
  const holdingsByStrategy: Record<string, number[]> = { OVERALL: [], DAY: [], SWING: [], POSITION: [] };

  for (const row of rows) {
    const stype = row.strategyType;
    if (!buckets[stype]) continue;
    if (!row.exitReason || row.exitReason === "OPEN" || row.exitReason === "INSUFFICIENT_DATA") continue;
    if (row.returnPct != null) { returnsByStrategy.OVERALL.push(row.returnPct); returnsByStrategy[stype]?.push(row.returnPct); }
    if (row.alphaPct  != null) { alphasByStrategy.OVERALL.push(row.alphaPct);   alphasByStrategy[stype]?.push(row.alphaPct);   }
    if (row.holdingDays != null) { holdingsByStrategy.OVERALL.push(row.holdingDays); holdingsByStrategy[stype]?.push(row.holdingDays); }
  }

  const avg = (arr: number[]): number | null =>
    arr.length === 0 ? null : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;

  const finalise = (key: string, stype: StrategyType | "OVERALL"): StrategyStats => {
    const b = buckets[key];
    b.sampleCount = b.completedRows;
    b.winRate = b.sampleCount >= MIN_SAMPLE
      ? Math.round((b.winCount / (b.winCount + b.loseCount || 1)) * 1000) / 10
      : null;
    b.avgReturnPct  = avg(returnsByStrategy[key] ?? []);
    b.avgAlphaPct   = avg(alphasByStrategy[key]  ?? []);
    b.avgHoldingDays = avg(holdingsByStrategy[key] ?? []);
    return { strategyType: stype, ...b };
  };

  return {
    overall:    finalise("OVERALL", "OVERALL"),
    byStrategy: {
      DAY:      finalise("DAY",      "DAY"),
      SWING:    finalise("SWING",    "SWING"),
      POSITION: finalise("POSITION", "POSITION"),
    },
  };
}
