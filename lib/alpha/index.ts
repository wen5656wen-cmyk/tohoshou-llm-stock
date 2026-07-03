/**
 * Alpha Engine 2.0 — Phase 1 factor layer (data only).
 *
 * Pure, side-effect-free factor computation. Each factor lives in its own module and is
 * independent (no cross-factor coupling); this orchestrator only merges their outputs.
 * NOTHING here reads or writes StockScore / AdaptiveScore / GPT rank / DailyRecommendation
 * / Portfolio — Alpha is a strictly additive parallel data layer.
 */
import { computeRelativeStrength, type RelativeStrength } from "./relative-strength";
import { computeATR, type ATRFactors } from "./atr";
import { compute52WeekDistance, type NewHighDistance } from "./new-high";
import { computeLiquidity, type LiquidityFactors } from "./liquidity";
import { computeVolume, type VolumeFactors } from "./volume-ratio";
import { computeEventFactors, type EventFactors } from "./event-factor";

export type Bar = {
  date: string; // "YYYY-MM-DD"
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjClose: number | null;
  volume: number | null;
};

export type AlphaFactors = RelativeStrength &
  ATRFactors &
  NewHighDistance &
  LiquidityFactors &
  VolumeFactors &
  EventFactors;

/**
 * Compute all Phase-1 Alpha factors for one symbol.
 * @param barsDesc price bars newest-first (≥ ~60 recommended, more for 52w)
 * @param topixByDate "YYYY-MM-DD" → TOPIX level (for relative strength)
 * @param symbol used by event factors (Phase 1: interface only)
 */
export function computeAllAlphaFactors(
  barsDesc: Bar[],
  topixByDate: Map<string, number>,
  symbol: string
): AlphaFactors {
  return {
    ...computeRelativeStrength(barsDesc, topixByDate),
    ...computeATR(barsDesc),
    ...compute52WeekDistance(barsDesc),
    ...computeLiquidity(barsDesc),
    ...computeVolume(barsDesc),
    ...computeEventFactors(symbol),
  };
}

export {
  computeRelativeStrength,
  computeATR,
  compute52WeekDistance,
  computeLiquidity,
  computeVolume,
  computeEventFactors,
};
export type {
  RelativeStrength,
  ATRFactors,
  NewHighDistance,
  LiquidityFactors,
  VolumeFactors,
  EventFactors,
};
