/**
 * Alpha Score — Phase 2A (Shadow Mode) weight derivation + composite scoring. Pure.
 *
 * Weights come from the Phase 1.5 AlphaFactorReport (Rank IC primary, Sharpe secondary).
 * Factor direction is auto-detected from sign(Rank IC): a negatively-predictive factor
 * (e.g. ATR → low-volatility anomaly) contributes with an inverted sign automatically.
 *
 * SHADOW ONLY — the resulting AlphaScore is NEVER fed into AdaptiveScore / GPT rank /
 * DailyRecommendation / Portfolio in this phase.
 */

/** Report row shape needed for weighting (subset of AlphaFactorReport). */
export type FactorStat = {
  factor: string;
  rankIc: number | null;
  sharpe: number | null;
};

export type FactorWeight = {
  factor: string;
  direction: 1 | -1;   // sign(rankIC): +1 higher-is-better, -1 lower-is-better
  weight: number;      // normalized, Σ included = 1
  rankIc: number | null;
  sharpe: number | null;
  included: boolean;
};

/** Representative AlphaFactor field per analysis factor (+ skew transform flag). */
export const FACTOR_FIELD: Record<string, { field: string; log?: boolean }> = {
  RelativeStrength: { field: "rs20" },
  ATR: { field: "atrPct" },
  VolumeRatio: { field: "volumeRatio20" },
  AverageTurnover: { field: "averageTurnover20", log: true },
  Distance52WeekHigh: { field: "distanceTo52WeekHigh" },
  VolumeExpansion: { field: "volumeExpansionDays" },
};

// Factors weaker than this |Rank IC| are treated as noise (weight 0).
export const MIN_ABS_IC = 0.01;

// Rank IC vs Sharpe blend (Rank IC primary).
export const IC_WEIGHT = 0.7;
export const SHARPE_WEIGHT = 0.3;

/**
 * Derive normalized factor weights from report stats.
 * weight_i = IC_WEIGHT · (|IC_i|/Σ|IC|) + SHARPE_WEIGHT · (|Sharpe_i|/Σ|Sharpe|), included only.
 * Included weights sum to ~1.
 */
export function deriveWeights(reports: FactorStat[]): FactorWeight[] {
  const included = reports.filter((r) => r.rankIc != null && Math.abs(r.rankIc) >= MIN_ABS_IC);
  const sumIc = included.reduce((s, r) => s + Math.abs(r.rankIc as number), 0);
  const sumSharpe = included.reduce((s, r) => s + Math.abs(r.sharpe ?? 0), 0);

  return reports.map((r) => {
    const absIc = r.rankIc == null ? 0 : Math.abs(r.rankIc);
    const isIncluded = r.rankIc != null && absIc >= MIN_ABS_IC && sumIc > 0;
    let weight = 0;
    if (isIncluded) {
      const icShare = absIc / sumIc;
      const shShare = sumSharpe > 0 ? Math.abs(r.sharpe ?? 0) / sumSharpe : icShare;
      weight = IC_WEIGHT * icShare + SHARPE_WEIGHT * shShare;
    }
    const direction: 1 | -1 = (r.rankIc ?? 0) >= 0 ? 1 : -1;
    return { factor: r.factor, direction, weight, rankIc: r.rankIc, sharpe: r.sharpe, included: isIncluded };
  });
}

export type FactorContribution = {
  factor: string;
  value: number | null;   // raw factor value
  z: number | null;       // cross-sectional z-score of the (possibly log) value
  direction: number;
  weight: number;
  contribution: number;   // direction · z · weight
};

/** Composite from per-factor directed z-scores + weights. Returns raw composite + breakdown. */
export function scoreComposite(
  perFactor: { factor: string; value: number | null; z: number | null }[],
  weights: FactorWeight[]
): { composite: number; breakdown: FactorContribution[] } {
  const wMap = new Map(weights.map((w) => [w.factor, w]));
  let composite = 0;
  const breakdown: FactorContribution[] = [];
  for (const pf of perFactor) {
    const w = wMap.get(pf.factor);
    const weight = w?.weight ?? 0;
    const direction = w?.direction ?? 1;
    const contribution = pf.z == null || weight === 0 ? 0 : direction * pf.z * weight;
    composite += contribution;
    breakdown.push({ factor: pf.factor, value: pf.value, z: pf.z, direction, weight, contribution });
  }
  return { composite, breakdown };
}

/** Map a composite z-blend to a 0–100 shadow score (50 = universe average). */
export function scaleAlphaScore(composite: number): number {
  return Math.max(0, Math.min(100, Math.round((50 + 10 * composite) * 100) / 100));
}
