/**
 * AI Action Trading Decision — v8.3 P2
 *
 * Rules-based signal layer on top of existing AI scores.
 * Does NOT modify adaptiveScore / opportunityScore / recommendationV2.
 */

export type TradingAction = {
  action: "BUY_NOW" | "WAIT_PULLBACK" | "HOLD" | "TAKE_PROFIT" | "SELL" | "AVOID";
  label: string;
  positionSizePct: number;
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  reasons: string[];
  warnings: string[];
};

export type TradingActionInput = {
  latestPrice: number | null;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  high52w: number | null;
  low52w: number | null;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  rsi14: number | null;
  volatility: number | null;
  adaptiveScore: number | null;
  opportunityScore: number | null;
  percentileRank: number | null;
  recommendationV2: string | null;
  suspicious: boolean;
  stale: boolean;
};

const r1 = (v: number) => Math.round(v * 10) / 10;

function calcRiskLevel(input: TradingActionInput): TradingAction["riskLevel"] {
  const { return60d, rsi14, volatility, suspicious } = input;
  if (
    suspicious ||
    (return60d != null && return60d > 200) ||
    (rsi14 != null && rsi14 > 85) ||
    (volatility != null && volatility > 80)
  ) return "EXTREME";
  if (
    (return60d != null && return60d > 100) ||
    (rsi14 != null && rsi14 > 75) ||
    (volatility != null && volatility > 50)
  ) return "HIGH";
  if (
    (return60d != null && return60d > 50) ||
    (rsi14 != null && rsi14 > 65) ||
    (volatility != null && volatility > 30)
  ) return "MEDIUM";
  return "LOW";
}

function buildPrices(action: TradingAction["action"], price: number, ma20: number | null, ma60: number | null, high52w: number | null): {
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  warnings: string[];
} {
  const warnings: string[] = [];

  let entryLow: number | null = null;
  let entryHigh: number | null = null;
  let stopLoss: number | null = null;
  let target1: number | null = null;
  let target2: number | null = null;

  if (action === "BUY_NOW") {
    entryLow = r1(price * 0.97);
    entryHigh = r1(price * 1.02);
    stopLoss = r1(Math.min(ma60 ?? price * 0.92, price * 0.92));
    target1 = r1(price * 1.15);
    target2 = r1(price * 1.30);
  } else if (action === "WAIT_PULLBACK") {
    entryLow = r1(Math.max(ma20 ?? price * 0.90, price * 0.90));
    entryHigh = r1(price * 0.96);
    stopLoss = r1(ma60 ?? price * 0.88);
    target1 = r1(price * 1.15);
    target2 = r1(price * 1.30);
  } else if (action === "HOLD") {
    stopLoss = ma60 != null ? r1(ma60) : null;
    target1 = r1(price * 1.15);
    target2 = r1(price * 1.30);
  } else if (action === "TAKE_PROFIT") {
    stopLoss = r1(price * 0.90);
    target1 = r1(price * 1.15);
    target2 = r1(price * 1.30);
  }

  if (target2 != null && high52w != null && target2 > high52w * 1.20) {
    warnings.push("Target above 52W high; confirm breakout strength.");
  }

  return { entryLow, entryHigh, stopLoss, target1, target2, warnings };
}

export function computeTradingAction(input: TradingActionInput): TradingAction {
  const {
    latestPrice, return5d, return20d, return60d,
    high52w, ma20, ma60, rsi14,
    adaptiveScore, opportunityScore, percentileRank,
    recommendationV2, suspicious, stale,
  } = input;

  const price = latestPrice ?? 0;
  const riskLevel = calcRiskLevel(input);
  const reasons: string[] = [];
  const warnings: string[] = [];

  // ── 1. AVOID ──────────────────────────────────────────────────────────────
  if (
    stale ||
    (suspicious && adaptiveScore == null) ||
    recommendationV2 === "AVOID" ||
    (adaptiveScore != null && adaptiveScore < 45) ||
    price <= 0 ||
    (ma20 == null && ma60 == null)
  ) {
    if (stale) reasons.push("Price data is stale — signal unreliable.");
    if (suspicious) reasons.push("Price data appears anomalous.");
    if (recommendationV2 === "AVOID" || (adaptiveScore != null && adaptiveScore < 45))
      reasons.push(`AI score too low (adaptiveScore=${adaptiveScore?.toFixed(1) ?? "n/a"}).`);
    if (price <= 0) reasons.push("No valid latest price.");
    return { action: "AVOID", label: "Avoid", positionSizePct: 0, entryLow: null, entryHigh: null, stopLoss: null, target1: null, target2: null, riskLevel, reasons, warnings };
  }

  // ── 2. SELL ───────────────────────────────────────────────────────────────
  const isSell = (
    (adaptiveScore != null && adaptiveScore < 55 && ma60 != null && price < ma60) ||
    (ma20 != null && ma60 != null && ma20 < ma60 && return20d != null && return20d < -10) ||
    (rsi14 != null && rsi14 < 35 && return20d != null && return20d < -15)
  );
  if (isSell) {
    if (adaptiveScore != null && adaptiveScore < 55 && ma60 != null && price < ma60)
      reasons.push(`Score weak (${adaptiveScore.toFixed(1)}) and price below MA60.`);
    if (ma20 != null && ma60 != null && ma20 < ma60 && return20d != null && return20d < -10)
      reasons.push(`Death cross: MA20 < MA60, 20D return ${return20d.toFixed(1)}%.`);
    if (rsi14 != null && rsi14 < 35 && return20d != null && return20d < -15)
      reasons.push(`RSI oversold (${rsi14.toFixed(0)}) with strong downtrend.`);
    return { action: "SELL", label: "Sell", positionSizePct: 0, entryLow: null, entryHigh: null, stopLoss: null, target1: null, target2: null, riskLevel, reasons, warnings };
  }

  // ── 3. TAKE_PROFIT ────────────────────────────────────────────────────────
  const isTakeProfit = (
    (return60d != null && return60d > 150 && rsi14 != null && rsi14 > 80) ||
    (return20d != null && return20d > 60 && rsi14 != null && rsi14 > 75) ||
    (high52w != null && price >= high52w * 0.98 && rsi14 != null && rsi14 > 78) ||
    (return5d != null && return5d > 30)
  );
  if (isTakeProfit) {
    if (return60d != null && return60d > 150 && rsi14 != null && rsi14 > 80)
      reasons.push(`Extreme 60D gain +${return60d.toFixed(1)}% with RSI=${rsi14.toFixed(0)}.`);
    if (return20d != null && return20d > 60 && rsi14 != null && rsi14 > 75)
      reasons.push(`20D surge +${return20d.toFixed(1)}% with RSI=${rsi14.toFixed(0)}.`);
    if (high52w != null && price >= high52w * 0.98 && rsi14 != null && rsi14 > 78)
      reasons.push(`Near 52W high (${fmtPrice(high52w)}) with RSI overbought.`);
    if (return5d != null && return5d > 30)
      reasons.push(`Spike +${return5d.toFixed(1)}% in 5 days — lock in gains.`);
    const prices = buildPrices("TAKE_PROFIT", price, ma20, ma60, high52w);
    return { action: "TAKE_PROFIT", label: "Take Profit", positionSizePct: 30, ...prices, riskLevel, reasons, warnings: [...warnings, ...prices.warnings] };
  }

  // ── 4. BUY_NOW ────────────────────────────────────────────────────────────
  const rec = recommendationV2 ?? "";
  const isStrongBuy = rec === "STRONG_BUY";
  const isBuy = rec === "BUY";
  const isBuyNow = (
    (isStrongBuy || isBuy) &&
    (adaptiveScore != null && adaptiveScore >= 70) &&
    (opportunityScore != null && opportunityScore >= 65) &&
    (percentileRank != null && percentileRank <= 10) &&
    (ma20 != null && price > ma20) &&
    ((ma20 != null && ma60 != null && ma20 >= ma60) || (return20d != null && return20d > 0)) &&
    (rsi14 != null && rsi14 >= 45 && rsi14 <= 75) &&
    (return5d == null || return5d <= 20) &&
    !suspicious &&
    !stale
  );
  if (isBuyNow) {
    reasons.push(`${isStrongBuy ? "STRONG BUY" : "BUY"} rating, adaptiveScore=${adaptiveScore!.toFixed(1)}.`);
    reasons.push(`Top ${percentileRank!.toFixed(1)}% of market, opportunity=${opportunityScore!.toFixed(0)}.`);
    if (rsi14 != null) reasons.push(`RSI=${rsi14.toFixed(0)} — not overbought, momentum healthy.`);
    const prices = buildPrices("BUY_NOW", price, ma20, ma60, high52w);
    return { action: "BUY_NOW", label: "Buy Now", positionSizePct: isStrongBuy ? 60 : 40, ...prices, riskLevel, reasons, warnings: [...warnings, ...prices.warnings] };
  }

  // ── 5. WAIT_PULLBACK ─────────────────────────────────────────────────────
  const isWaitPullback = (
    ((isStrongBuy || isBuy) && return5d != null && return5d > 20) ||
    (rsi14 != null && rsi14 > 75) ||
    (ma20 != null && price > ma20 * 1.12) ||
    (return60d != null && return60d > 100) ||
    (high52w != null && price >= high52w * 0.97 && return5d != null && return5d > 5)
  );
  if (isWaitPullback) {
    if (return5d != null && return5d > 20) reasons.push(`5D spike +${return5d.toFixed(1)}% — wait for pullback.`);
    if (rsi14 != null && rsi14 > 75) reasons.push(`RSI overbought (${rsi14.toFixed(0)}).`);
    if (ma20 != null && price > ma20 * 1.12) reasons.push(`Price ${((price / ma20 - 1) * 100).toFixed(1)}% above MA20.`);
    if (return60d != null && return60d > 100) reasons.push(`Strong 60D run +${return60d.toFixed(1)}%.`);
    if (return5d != null && return5d <= 20 && reasons.length === 0) reasons.push("Near 52W high with limited pullback.");
    const prices = buildPrices("WAIT_PULLBACK", price, ma20, ma60, high52w);
    return { action: "WAIT_PULLBACK", label: "Wait Pullback", positionSizePct: 20, ...prices, riskLevel, reasons, warnings: [...warnings, ...prices.warnings] };
  }

  // ── 6. HOLD ───────────────────────────────────────────────────────────────
  if (adaptiveScore != null && adaptiveScore >= 55) reasons.push(`Score ${adaptiveScore.toFixed(1)} — trend intact.`);
  if (rsi14 != null) reasons.push(`RSI=${rsi14.toFixed(0)} — no extreme signal.`);
  const prices = buildPrices("HOLD", price, ma20, ma60, high52w);
  return { action: "HOLD", label: "Hold", positionSizePct: 30, ...prices, riskLevel, reasons, warnings: [...warnings, ...prices.warnings] };
}

function fmtPrice(v: number): string {
  return "¥" + v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
