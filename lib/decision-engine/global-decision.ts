// ── Decision Engine · 全局决策 + 冲突消解（P15-01B）───────────────────────────
// 产出唯一 MarketDecision。冲突规则（P15-01A Freeze 第五部分）：
// 持仓需卖出 → 全局禁扩仓；BEAR/STAY_CASH → 不建仓；HIGH 风险 → 封顶禁 ADD；stale/休市 → 不可执行。
import { actionLabelKey } from "../decision/verdict";
import { isExecutablePhase } from "./phase";
import type { MarketDecision, MarketPhase, RiskLevel, HoldingAction, DecisionAction } from "./types";

const REGIME_TARGET: Record<string, number> = { BULL: 60, SIDEWAYS: 40, BEAR: 15 };

export interface GlobalDecisionInput {
  verdict: string | null;         // BUY_TODAY | WATCH_ONLY | STAY_CASH
  regime: string | null;          // BULL | SIDEWAYS | BEAR
  riskLevel: RiskLevel | null;
  phase: MarketPhase;
  tradingDay: boolean;
  stale: boolean;
  executableCount: number;        // 立即执行候选数
  holdingActions: HoldingAction[];
  portfolioLegWeights: number[];  // 收盘组合腿权重（%），空=无组合
  confidence: number | null;
}

export function deriveGlobalDecision(i: GlobalDecisionInput): MarketDecision {
  const hasHoldings = i.holdingActions.length > 0;
  const mustSell = i.holdingActions.some((h) => h.action === "STOP_LOSS" || h.action === "REDUCE");

  let action: DecisionAction;
  let blockedReasonKey: string | null = null;

  if (!i.tradingDay || i.phase === "NON_TRADING") {
    action = "NO_TRADE";
    blockedReasonKey = "dv.ov2.closed";
  } else if (mustSell) {
    // 持仓触发止损/风险减仓 → 全局优先降仓，禁新建仓
    action = "REDUCE";
  } else {
    const base: DecisionAction =
      i.verdict === "BUY_TODAY" ? "BUY" :
      i.verdict === "STAY_CASH" ? "CASH" :
      i.verdict === "WATCH_ONLY" ? "WAIT" : "HOLD";
    if (base === "BUY") {
      if (i.regime === "BEAR") action = "WAIT";
      else if (i.stale) action = "WAIT";
      else action = hasHoldings ? "ADD" : "BUY";
    } else {
      action = base;
    }
  }

  const executable = i.tradingDay && !i.stale && isExecutablePhase(i.phase);
  if (i.stale && !blockedReasonKey) blockedReasonKey = "dv.ov2.stale";

  // 仓位建议：总仓位取 regime 基准（收盘组合腿权重是组合内归一分配，非账户总敞口，故不采用）。
  // mustSell 只禁「新增」敞口（additionalPositionPct=0），不清零总目标（清仓由逐持仓动作承担）。
  const targetTotalPositionPct = i.regime && REGIME_TARGET[i.regime] != null ? REGIME_TARGET[i.regime] : 40;
  const canAdd = (action === "BUY" || action === "ADD") && executable && i.riskLevel !== "HIGH";
  const additionalPositionPct = canAdd ? Math.min(20, Math.max(0, i.executableCount) * 5) : 0;
  const maxSingleStockPct = 8;

  return {
    action,
    phase: i.phase,
    headlineKey: actionLabelKey(action),
    instructionKey: `dv.instr.${action}`,
    targetTotalPositionPct,
    additionalPositionPct,
    maxSingleStockPct,
    marketRegime: i.regime,
    riskLevel: i.riskLevel,
    confidence: i.confidence,
    isExecutable: executable && action !== "NO_TRADE",
    blockedReasonKey,
  };
}
