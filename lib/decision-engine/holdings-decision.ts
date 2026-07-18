// ── Decision Engine · 持仓动作（P15-01B）─────────────────────────────────────
// 6 档动作 + 固定优先级：止损 → 风险减仓 → 止盈 → 持有。止损/止盈基准 = 建仓策略级 %
// （基于 entryPrice），非全市场筛选价（修正 P0-4 基准错位）。只读 PaperPosition，绝不写。
import type { HoldingAction, Quote, RiskLevel } from "./types";

/** 三策略止盈/止损阈值（%），基于建仓价。 */
const STRAT_TH: Record<string, { tp: number; sl: number }> = {
  DAY_TRADE: { tp: 1.5, sl: -1.0 },
  SWING_TRADE: { tp: 8.0, sl: -5.0 },
  LONG_TRADE: { tp: 20.0, sl: -10.0 },
};
const DEFAULT_TH = { tp: 8.0, sl: -5.0 };

export interface PaperPositionInput {
  symbol: string;
  name: string | null;
  strategyType: string | null;
  entryPrice: number | null;
  currentPrice: number | null;
  returnPct: number | null;
  actionRiskLevel: string | null;
  target1: number | null;
  stopLoss: number | null;
  updatedAt: string | null; // ISO
}

function normRisk(r: string | null): RiskLevel | null {
  if (r === "HIGH" || r === "EXTREME") return "HIGH";
  if (r === "MEDIUM" || r === "MED") return "MEDIUM";
  if (r === "LOW") return "LOW";
  return null;
}

/** 单个持仓的动作决策。price 优先实时。 */
export function deriveHoldingAction(pos: PaperPositionInput, quote: Quote | undefined): HoldingAction {
  const price = quote?.price ?? pos.currentPrice ?? null;
  const th = (pos.strategyType && STRAT_TH[pos.strategyType]) || DEFAULT_TH;
  const ret = price != null && pos.entryPrice != null && pos.entryPrice > 0
    ? (price / pos.entryPrice - 1) * 100
    : (pos.returnPct ?? null);
  const risk = normRisk(pos.actionRiskLevel);

  let action: HoldingAction["action"] = "HOLD";
  let sellPct = 0;
  let priority = 4;
  let reasonKey = "dv.hold.rk.hold";

  if (ret != null && ret <= th.sl) {
    action = "STOP_LOSS"; sellPct = 100; priority = 1; reasonKey = "dv.hold.rk.stop";
  } else if (risk === "HIGH") {
    action = "REDUCE"; sellPct = 50; priority = 2; reasonKey = "dv.hold.rk.reduce";
  } else if (ret != null && ret >= th.tp) {
    action = "TAKE_PROFIT"; sellPct = 100; priority = 3; reasonKey = "dv.hold.rk.tp";
  }

  const entryStop = pos.entryPrice != null ? Math.round(pos.entryPrice * (1 + th.sl / 100)) : pos.stopLoss;
  const entryTarget = pos.entryPrice != null ? Math.round(pos.entryPrice * (1 + th.tp / 100)) : pos.target1;

  return {
    symbol: pos.symbol,
    name: pos.name ?? pos.symbol,
    strategyType: pos.strategyType,
    entryPrice: pos.entryPrice,
    currentPrice: price,
    returnPct: ret != null ? Math.round(ret * 100) / 100 : null,
    action,
    sellPct,
    reasonKey,
    targetPrice: entryTarget,
    stopLossPrice: entryStop,
    priority,
    quoteUpdatedAt: quote?.time ? new Date(quote.time).toISOString() : null,
  };
}

/** 全部持仓动作，按优先级排序（止损在最前）。 */
export function deriveHoldingActions(positions: PaperPositionInput[], quoteMap: Map<string, Quote>): HoldingAction[] {
  return positions
    .map((p) => deriveHoldingAction(p, quoteMap.get(p.symbol)))
    .sort((a, b) => a.priority - b.priority);
}
