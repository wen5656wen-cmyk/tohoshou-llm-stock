// ── Decision Engine · 逐股实时决策（P15-01B）─────────────────────────────────
// 复用 lib/decision/live-status 的 deriveLiveStatus（唯一状态判据），把「实时价 vs 买区/
// 目标/止损」映射为候选动作。买区/目标/止损数值只读自收盘决策，绝不重算（Decision 变、Score 不变）。
import { deriveLiveStatus } from "../decision/live-status";
import type { ClosingTop10Row, Quote, RealtimeStockDecision, DecisionGroups, RiskLevel, QuoteSource } from "./types";

function normRisk(r: string | null | undefined): RiskLevel | null {
  if (r === "HIGH" || r === "EXTREME") return "HIGH";
  if (r === "MEDIUM" || r === "MED") return "MEDIUM";
  if (r === "LOW") return "LOW";
  return null;
}

/**
 * 单只候选的实时决策。price 优先实时（quote），回退收盘冻结价并标 EOD。
 * regime=BEAR 时，即便在买区也降级为 WAIT（不逆势建仓）。
 */
export function deriveStockDecision(
  row: ClosingTop10Row,
  quote: Quote | undefined,
  regime: string | null,
): RealtimeStockDecision {
  const hasRt = quote?.price != null;
  const price = hasRt ? (quote!.price as number) : (row.price ?? null);
  const quoteSource: QuoteSource = hasRt ? "realtime" : "EOD";
  const quoteUpdatedAt = hasRt && quote!.time ? new Date(quote!.time).toISOString() : null;
  const prevClose = quote?.previousClose ?? null;
  const changePct = hasRt && price != null && prevClose != null && prevClose > 0
    ? Math.round((price / prevClose - 1) * 10000) / 100
    : (row.changePct ?? null);

  const status = deriveLiveStatus({
    price, entryLow: row.entryLow ?? null, entryHigh: row.entryHigh ?? null,
    target: row.target1 ?? null, stop: row.stopLoss ?? null,
  });

  // 候选（非持仓）动作映射：仅产 BUY / WAIT / HOLD（TP/SL/REDUCE 属持仓）。
  let action: RealtimeStockDecision["action"] = "WAIT";
  let triggerConditionKey: string | null = null;
  let actionReasonKey = "dv.trig.waitQuote";
  switch (status) {
    case "IN_ZONE":
      action = regime === "BEAR" ? "WAIT" : "BUY";
      actionReasonKey = regime === "BEAR" ? "dv.trig.bearHold" : "dv.trig.inZone";
      triggerConditionKey = regime === "BEAR" ? "dv.trig.bearHold" : "dv.trig.inZone";
      break;
    case "BELOW_ZONE":
      action = "WAIT"; actionReasonKey = "dv.trig.belowZone"; triggerConditionKey = "dv.trig.belowZone"; break;
    case "ABOVE_ZONE":
      action = "WAIT"; actionReasonKey = "dv.trig.aboveZone"; triggerConditionKey = "dv.trig.aboveZone"; break;
    case "REACHED_TARGET":
      action = "HOLD"; actionReasonKey = "dv.trig.reachedTarget"; triggerConditionKey = "dv.trig.reachedTarget"; break;
    case "BELOW_STOP":
      action = "WAIT"; actionReasonKey = "dv.trig.belowStop"; triggerConditionKey = "dv.trig.belowStop"; break;
    case "WAIT_QUOTE":
      action = "WAIT"; actionReasonKey = "dv.trig.waitQuote"; triggerConditionKey = null; break;
    case "NO_ZONE":
    default:
      action = "WAIT"; actionReasonKey = "dv.trig.noZone"; triggerConditionKey = "dv.trig.noZone"; break;
  }

  return {
    symbol: row.symbol,
    name: row.name ?? row.symbol,
    universeRank: row.rank ?? null,
    previousRank: null,
    currentPrice: price,
    changePct,
    quoteUpdatedAt,
    quoteSource,
    action,
    actionReasonKey,
    triggerConditionKey,
    buyRangeLow: row.entryLow ?? null,
    buyRangeHigh: row.entryHigh ?? null,
    targetPrice1: row.target1 ?? null,
    targetPrice2: row.target2 ?? null,
    stopLossPrice: row.stopLoss ?? null,
    suggestedPositionPct: null,
    aiScore: row.aiScore ?? null,
    riskLevel: normRisk(row.riskLevel),
    isExecutable: action === "BUY",
  };
}

/** 分三组：立即执行(BUY,≤5) / 等待条件(WAIT,≤4) / 备用替补(其余,≤3)。保持排名序。 */
export function groupPicks(decisions: RealtimeStockDecision[]): DecisionGroups {
  const byRank = [...decisions].sort((a, b) => (a.universeRank ?? 99) - (b.universeRank ?? 99));
  const executeNow = byRank.filter((d) => d.action === "BUY").slice(0, 5);
  const enSet = new Set(executeNow.map((d) => d.symbol));
  const waitList = byRank.filter((d) => d.action === "WAIT" && !enSet.has(d.symbol)).slice(0, 4);
  const wlSet = new Set(waitList.map((d) => d.symbol));
  const backups = byRank.filter((d) => !enSet.has(d.symbol) && !wlSet.has(d.symbol)).slice(0, 3);
  return { executeNow, waitList, backups };
}
