/**
 * AI Action Trading Decision — v8.3 P2
 *
 * Rules-based signal layer on top of existing AI scores.
 * Does NOT modify adaptiveScore / opportunityScore / recommendationV2.
 */
import type { Lang } from "./i18n/types";

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
    warnings.push("目标价超过52周高点，请确认突破力度。");
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
    if (stale) reasons.push("价格数据陈旧，信号不可靠。");
    if (suspicious) reasons.push("价格数据异常，请谨慎。");
    if (recommendationV2 === "AVOID" || (adaptiveScore != null && adaptiveScore < 45))
      reasons.push(`AI评分过低（综合评分=${adaptiveScore?.toFixed(1) ?? "n/a"}）。`);
    if (price <= 0) reasons.push("无有效最新价格。");
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
      reasons.push(`评分偏低（${adaptiveScore.toFixed(1)}），股价跌破MA60。`);
    if (ma20 != null && ma60 != null && ma20 < ma60 && return20d != null && return20d < -10)
      reasons.push(`死亡交叉：MA20 < MA60，20日涨幅 ${return20d.toFixed(1)}%。`);
    if (rsi14 != null && rsi14 < 35 && return20d != null && return20d < -15)
      reasons.push(`RSI超卖（${rsi14.toFixed(0)}），强势下跌趋势。`);
    return { action: "SELL", label: "Sell", positionSizePct: 0, entryLow: null, entryHigh: null, stopLoss: null, target1: null, target2: null, riskLevel, reasons, warnings };
  }

  // ── 2.5 RSI OVERHEATING GUARD (blocks BUY_NOW, redirects to TP/WP) ────────
  // These fire before TAKE_PROFIT so extreme RSI always gets a safe action.

  if (rsi14 != null && rsi14 >= 95) {
    reasons.push(`RSI=${rsi14.toFixed(0)}，极度超买，此时追高风险极大。`);
    warnings.push("RSI处于极度超买区域，建议考虑止盈。");
    warnings.push("短期价格涨幅过大。");
    const prices = buildPrices("TAKE_PROFIT", price, ma20, ma60, high52w);
    return { action: "TAKE_PROFIT", label: "Take Profit", positionSizePct: 20, ...prices, riskLevel: "HIGH", reasons, warnings: [...warnings, ...prices.warnings] };
  }

  if (rsi14 != null && rsi14 >= 90) {
    const hasBigGain = (return20d != null && return20d > 20) || (return60d != null && return60d > 60);
    const guardAction = hasBigGain ? "TAKE_PROFIT" : "WAIT_PULLBACK";
    reasons.push(`RSI=${rsi14.toFixed(0)}，超买，不适合新建仓。`);
    warnings.push("RSI处于超买区域，此价位追高风险较大。");
    if (hasBigGain)
      reasons.push(`涨幅可观（20日 ${return20d?.toFixed(1) ?? "?"}%），建议分批减仓。`);
    else
      reasons.push("等待RSI回调后再考虑入场。");
    const prices = buildPrices(guardAction, price, ma20, ma60, high52w);
    return { action: guardAction, label: guardAction === "TAKE_PROFIT" ? "Take Profit" : "Wait Pullback", positionSizePct: 20, ...prices, riskLevel, reasons, warnings: [...warnings, ...prices.warnings] };
  }

  if (rsi14 != null && rsi14 >= 85 && return20d != null && return20d > 30) {
    reasons.push(`RSI=${rsi14.toFixed(0)}，20日涨幅+${return20d.toFixed(1)}%，已延伸过高，建议减仓。`);
    warnings.push("股价急速拉升，建议止盈而非追高。");
    const prices = buildPrices("TAKE_PROFIT", price, ma20, ma60, high52w);
    return { action: "TAKE_PROFIT", label: "Take Profit", positionSizePct: 30, ...prices, riskLevel, reasons, warnings: [...warnings, ...prices.warnings] };
  }

  if (rsi14 != null && rsi14 >= 80 && return5d != null && return5d > 20) {
    reasons.push(`RSI=${rsi14.toFixed(0)}，5日暴涨+${return5d.toFixed(1)}%，等待回调。`);
    warnings.push("短期涨幅过高，请勿追高。");
    const prices = buildPrices("WAIT_PULLBACK", price, ma20, ma60, high52w);
    return { action: "WAIT_PULLBACK", label: "Wait Pullback", positionSizePct: 20, ...prices, riskLevel, reasons, warnings: [...warnings, ...prices.warnings] };
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
      reasons.push(`60日极端涨幅+${return60d.toFixed(1)}%，RSI=${rsi14.toFixed(0)}。`);
    if (return20d != null && return20d > 60 && rsi14 != null && rsi14 > 75)
      reasons.push(`20日急涨+${return20d.toFixed(1)}%，RSI=${rsi14.toFixed(0)}。`);
    if (high52w != null && price >= high52w * 0.98 && rsi14 != null && rsi14 > 78)
      reasons.push(`接近52周高点（${fmtPrice(high52w)}），RSI超买。`);
    if (return5d != null && return5d > 30)
      reasons.push(`5日暴涨+${return5d.toFixed(1)}%，建议锁定收益。`);
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
    reasons.push(`${isStrongBuy ? "强烈买入" : "买入"}评级，AI综合评分=${adaptiveScore!.toFixed(1)}。`);
    reasons.push(`市场前${percentileRank!.toFixed(1)}%，机会评分=${opportunityScore!.toFixed(0)}。`);
    if (rsi14 != null) reasons.push(`RSI=${rsi14.toFixed(0)}，尚未超买，动量健康。`);
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
    if (return5d != null && return5d > 20) reasons.push(`5日暴涨+${return5d.toFixed(1)}%，等待回调。`);
    if (rsi14 != null && rsi14 > 75) reasons.push(`RSI超买（${rsi14.toFixed(0)}）。`);
    if (ma20 != null && price > ma20 * 1.12) reasons.push(`股价高于MA20 ${((price / ma20 - 1) * 100).toFixed(1)}%。`);
    if (return60d != null && return60d > 100) reasons.push(`60日强势上涨+${return60d.toFixed(1)}%。`);
    if (return5d != null && return5d <= 20 && reasons.length === 0) reasons.push("接近52周高点，回调有限。");
    const prices = buildPrices("WAIT_PULLBACK", price, ma20, ma60, high52w);
    return { action: "WAIT_PULLBACK", label: "Wait Pullback", positionSizePct: 20, ...prices, riskLevel, reasons, warnings: [...warnings, ...prices.warnings] };
  }

  // ── 6. HOLD ───────────────────────────────────────────────────────────────
  if (adaptiveScore != null && adaptiveScore >= 55) reasons.push(`评分${adaptiveScore.toFixed(1)}，趋势完好。`);
  if (rsi14 != null) reasons.push(`RSI=${rsi14.toFixed(0)}，无极端信号。`);
  const prices = buildPrices("HOLD", price, ma20, ma60, high52w);
  return { action: "HOLD", label: "Hold", positionSizePct: 30, ...prices, riskLevel, reasons, warnings: [...warnings, ...prices.warnings] };
}

function fmtPrice(v: number): string {
  return "¥" + v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

type ActionKey = TradingAction["action"];
type RiskKey = TradingAction["riskLevel"];

const ACTION_LABELS: Record<Lang, Record<ActionKey, string>> = {
  "zh-CN": { BUY_NOW: "立即买入", WAIT_PULLBACK: "等待回调", HOLD: "持有", TAKE_PROFIT: "止盈", SELL: "卖出", AVOID: "回避" },
  "ja-JP": { BUY_NOW: "今すぐ買い", WAIT_PULLBACK: "押し目待ち", HOLD: "保持", TAKE_PROFIT: "利益確定", SELL: "売り", AVOID: "回避" },
  "en-US": { BUY_NOW: "BUY NOW", WAIT_PULLBACK: "WAIT PULLBACK", HOLD: "HOLD", TAKE_PROFIT: "TAKE PROFIT", SELL: "SELL", AVOID: "AVOID" },
};

const RISK_LABELS: Record<Lang, Record<RiskKey, string>> = {
  "zh-CN": { LOW: "低风险", MEDIUM: "中风险", HIGH: "高风险", EXTREME: "极高风险" },
  "ja-JP": { LOW: "低リスク", MEDIUM: "中リスク", HIGH: "高リスク", EXTREME: "超高リスク" },
  "en-US": { LOW: "Low Risk", MEDIUM: "Medium Risk", HIGH: "High Risk", EXTREME: "Extreme Risk" },
};

export function getTradingActionLabel(action: string | null | undefined, lang: Lang = "zh-CN"): string {
  if (!action) return "—";
  return ACTION_LABELS[lang]?.[action as ActionKey] ?? action;
}

export function getRiskLabel(risk: string | null | undefined, lang: Lang = "zh-CN"): string {
  if (!risk) return "—";
  return RISK_LABELS[lang]?.[risk as RiskKey] ?? risk;
}
