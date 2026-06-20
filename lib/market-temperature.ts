/**
 * Market temperature — computed from recommendationV2 distribution.
 *
 * HOT           BUY+STRONG_BUY >= 10% of total
 * WARM          >= 5%
 * NEUTRAL       >= 2%
 * COLD          > 0% but < 2%
 * EXTREME_COLD  = 0%
 */

export type MarketTemperature = "HOT" | "WARM" | "NEUTRAL" | "COLD" | "EXTREME_COLD";

export function computeMarketTemperature(
  strongBuy: number,
  buy: number,
  total: number,
): MarketTemperature {
  if (total === 0) return "EXTREME_COLD";
  const bullRate = (strongBuy + buy) / total;
  if (bullRate >= 0.10) return "HOT";
  if (bullRate >= 0.05) return "WARM";
  if (bullRate >= 0.02) return "NEUTRAL";
  if (strongBuy + buy > 0) return "COLD";
  return "EXTREME_COLD";
}

export const TEMPERATURE_LABEL: Record<MarketTemperature, string> = {
  HOT:          "HOT 🔥",
  WARM:         "WARM 🌤",
  NEUTRAL:      "NEUTRAL ⚖️",
  COLD:         "COLD ❄️",
  EXTREME_COLD: "EXTREME_COLD 🧊",
};

export const TEMPERATURE_COLOR: Record<MarketTemperature, string> = {
  HOT:          "#E53E3E",
  WARM:         "#ED8936",
  NEUTRAL:      "#4299E1",
  COLD:         "#63B3ED",
  EXTREME_COLD: "#90CDF4",
};
