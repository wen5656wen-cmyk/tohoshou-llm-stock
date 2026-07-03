/**
 * Market Regime — combine trend + breadth + volatility into Bull / Sideways / Bear. Pure.
 * Independent: consumes the per-day metrics only. Classification thresholds are fixed rules
 * (NOT fusion ratios — those are searched from data in the fusion research).
 */
export type Regime = "BULL" | "SIDEWAYS" | "BEAR";

export type RegimeInput = {
  trendScore: number | null;   // -1..1 (from trend.ts)
  breadth: number | null;      // % above MA20 (from breadth.ts)
  volatility: number | null;   // annualized % (from volatility.ts)
};

export const BULL_THRESHOLD = 0.25;
export const BEAR_THRESHOLD = -0.25;
export const HIGH_VOL_THRESHOLD = 25; // annualized % — nudges toward risk-off
export const TREND_WEIGHT = 0.55;
export const BREADTH_WEIGHT = 0.45;

export function classifyRegime(inp: RegimeInput): { regime: Regime; regimeScore: number } {
  const t = inp.trendScore ?? 0;
  const b = inp.breadth == null ? 0 : (inp.breadth - 50) / 50; // -1..1
  let score = TREND_WEIGHT * t + BREADTH_WEIGHT * b;
  if (inp.volatility != null && inp.volatility > HIGH_VOL_THRESHOLD) score -= 0.15; // risk-off nudge
  const regime: Regime = score >= BULL_THRESHOLD ? "BULL" : score <= BEAR_THRESHOLD ? "BEAR" : "SIDEWAYS";
  return { regime, regimeScore: Math.round(score * 1000) / 1000 };
}

export const REGIMES: Regime[] = ["BULL", "SIDEWAYS", "BEAR"];
