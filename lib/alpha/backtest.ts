/**
 * Alpha Shadow Backtest — pure summary statistics for a strategy's return series.
 * Read-only validation. Never touches production scoring.
 *
 * Returns are per-as-of-date H-day forward portfolio returns (%), overlapping (daily
 * rebalance sampling). cumReturn / drawdown use a NON-overlapping (step = holdDays)
 * equity curve so they represent a tradeable H-day-rebalance strategy; win-rate / Sharpe
 * use the full overlapping sample for robustness. Everything is transparent & bounded.
 */
export type StrategySummary = {
  cumReturn: number | null;        // % over the sampled window (compounded, non-overlap)
  alpha: number | null;            // % annualized excess vs equal-weight market
  sharpe: number | null;           // annualized (× √(252/H))
  maxDrawdown: number | null;      // % (positive number = depth)
  winRate: number | null;          // % of H-day returns > 0
  annualizedReturn: number | null; // %
  nObs: number;
};

function mean(a: number[]): number | null { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
function std(a: number[]): number | null {
  if (a.length < 2) return null;
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}

/** Max drawdown (%) from a non-overlapping (step) equity curve. returnsChrono oldest→newest. */
function maxDrawdown(returnsChrono: number[], step: number): number | null {
  if (returnsChrono.length === 0) return null;
  let equity = 1, peak = 1, mdd = 0, used = 0;
  for (let i = 0; i < returnsChrono.length; i += step) {
    equity *= 1 + returnsChrono[i] / 100;
    used++;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > mdd) mdd = dd;
  }
  return used > 0 ? Math.round(mdd * 10000) / 100 : null;
}

/**
 * @param returnsChrono per-as-of H-day portfolio returns (%), oldest→newest
 * @param benchChrono   equal-weight market H-day returns (%), same dates
 * @param holdDays      holding horizon H
 */
export function summarizeStrategy(
  returnsChrono: number[],
  benchChrono: number[],
  holdDays: number
): StrategySummary {
  const n = returnsChrono.length;
  if (n === 0) {
    return { cumReturn: null, alpha: null, sharpe: null, maxDrawdown: null, winRate: null, annualizedReturn: null, nObs: 0 };
  }
  const m = mean(returnsChrono)!;
  const s = std(returnsChrono);
  const winRate = (returnsChrono.filter((r) => r > 0).length / n) * 100;
  const cyclesPerYear = 252 / holdDays;

  const annualizedReturn = (Math.pow(1 + m / 100, cyclesPerYear) - 1) * 100;
  const cumCycles = n / holdDays;
  const cumReturn = (Math.pow(1 + m / 100, cumCycles) - 1) * 100;
  const sharpe = s != null && s > 0 ? (m / s) * Math.sqrt(cyclesPerYear) : null;

  const benchMean = mean(benchChrono);
  const benchAnn = benchMean != null ? (Math.pow(1 + benchMean / 100, cyclesPerYear) - 1) * 100 : null;
  const alpha = benchAnn != null ? annualizedReturn - benchAnn : null;

  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    cumReturn: r2(cumReturn),
    alpha: alpha == null ? null : r2(alpha),
    sharpe: sharpe == null ? null : r2(sharpe),
    maxDrawdown: maxDrawdown(returnsChrono, holdDays),
    winRate: r2(winRate),
    annualizedReturn: r2(annualizedReturn),
    nObs: n,
  };
}

export const BACKTEST_PERIODS = [30, 90, 180];
export const BACKTEST_TOPN = [10, 20, 50];
export const BACKTEST_HOLD = [5, 10, 20];
export const BACKTEST_STRATEGIES = ["PRODUCTION", "ALPHA"] as const;
export type BacktestStrategy = (typeof BACKTEST_STRATEGIES)[number];
