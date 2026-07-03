/**
 * Alpha Analytics — per-factor report builder + star rating. Pure.
 * Orchestrates the independent analytics modules over a collected observation set.
 */
import { pearson, spearman } from "./information-coefficient";
import { quantileReturns } from "./rank-analysis";
import { mean, winRate, std } from "./factor-performance";

/** One (stock, as-of date) observation for a single factor. */
export type Observation = {
  asOfIdx: number;          // 0 = most-recent evaluable as-of date
  factor: number | null;    // representative factor scalar
  fwd5: number | null;      // forward 5d return %
  fwd10: number | null;
  fwd20: number | null;     // primary horizon (used for IC / win / quantiles / sharpe)
  excess20: number | null;  // fwd20 − TOPIX fwd20
};

export type FactorReport = {
  sampleCount: number;
  meanFwdRet5: number | null;
  meanFwdRet10: number | null;
  meanFwdRet20: number | null;
  winRate: number | null;
  meanExcess: number | null;
  ic: number | null;
  rankIc: number | null;
  top20Ret: number | null;
  bottom20Ret: number | null;
  sharpe: number | null;
  rating: number;        // 1–5 stars
  ratingLabel: string;   // Effective | Moderate | Weak
};

/** Star rating from |Rank IC| (rank-robust). */
export function starRating(rankIc: number | null): { rating: number; label: string } {
  const a = rankIc == null ? 0 : Math.abs(rankIc);
  let rating: number;
  if (a >= 0.05) rating = 5;
  else if (a >= 0.035) rating = 4;
  else if (a >= 0.02) rating = 3;
  else if (a >= 0.01) rating = 2;
  else rating = 1;
  const label = rating >= 4 ? "Effective" : rating === 3 ? "Moderate" : "Weak";
  return { rating, label };
}

const notNull = (x: number | null): x is number => x != null;

export function buildFactorReport(obs: Observation[]): FactorReport {
  const valid = obs.filter((o) => o.factor != null && o.fwd20 != null);
  const fs = valid.map((o) => o.factor as number);
  const r20 = valid.map((o) => o.fwd20 as number);

  const ic = pearson(fs, r20);
  const rankIc = spearman(fs, r20);

  const pairs = valid.map((o) => ({ f: o.factor as number, r: o.fwd20 as number }));
  const quint = quantileReturns(pairs);

  // Win rate = share of positive forward returns in the factor's TOP quintile (the
  // "go long the strongest-factor stocks" hit rate) — factor-specific, unlike the
  // undifferentiated base rate.
  let winRateVal: number | null = null;
  if (pairs.length >= 10) {
    const sorted = [...pairs].sort((a, b) => a.f - b.f);
    const k = Math.max(1, Math.floor(pairs.length * 0.2));
    const top = sorted.slice(pairs.length - k);
    winRateVal = winRate(top.map((x) => x.r));
  }

  // Simplified factor Sharpe: per as-of date long-short spread, then mean/std across dates.
  const byDate = new Map<number, { f: number; r: number }[]>();
  for (const o of valid) {
    const a = byDate.get(o.asOfIdx) ?? [];
    a.push({ f: o.factor as number, r: o.fwd20 as number });
    byDate.set(o.asOfIdx, a);
  }
  const spreads: number[] = [];
  for (const arr of byDate.values()) {
    const q = quantileReturns(arr);
    if (q.spread != null) spreads.push(q.spread);
  }
  const spMean = mean(spreads);
  const spStd = std(spreads);
  const sharpe = spMean != null && spStd != null && spStd !== 0 ? spMean / spStd : null;

  const { rating, label } = starRating(rankIc);

  return {
    sampleCount: valid.length,
    meanFwdRet5: mean(obs.map((o) => o.fwd5).filter(notNull)),
    meanFwdRet10: mean(obs.map((o) => o.fwd10).filter(notNull)),
    meanFwdRet20: mean(r20),
    winRate: winRateVal,
    meanExcess: mean(valid.map((o) => o.excess20).filter(notNull)),
    ic,
    rankIc,
    top20Ret: quint.topMean,
    bottom20Ret: quint.bottomMean,
    sharpe,
    rating,
    ratingLabel: label,
  };
}

/** Factor keys analysed (map to representative Alpha scalars). */
export const ANALYSIS_FACTORS = [
  "RelativeStrength",
  "ATR",
  "VolumeRatio",
  "AverageTurnover",
  "Distance52WeekHigh",
  "VolumeExpansion",
] as const;
export type AnalysisFactor = (typeof ANALYSIS_FACTORS)[number];
