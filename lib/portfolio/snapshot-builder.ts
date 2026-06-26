// Shared 3:4:3 portfolio allocation builder for snapshot creation
import { classifyStrategy, type StrategyType, type StrategyParams } from "@/lib/strategy/strategy-classifier";

export const STRATEGY_SLOTS: Record<StrategyType, number> = { DAY: 3, SWING: 4, POSITION: 3 };
export const STRATEGY_ALLOC: Record<StrategyType, number> = { DAY: 0.30, SWING: 0.40, POSITION: 0.30 };
export const STRATEGY_TYPES: StrategyType[] = ["DAY", "SWING", "POSITION"];

export type RecInput = {
  symbol: string;
  gptRank: number;
  gptRating?: string | null;
  recommendation?: string | null;
  buyPrice?: number | null;
  strategyType?: string | null;
  strategyConfidence?: number | null;
  targetReturnPct?: number | null;
  stopLossPct?: number | null;
  maxHoldingDays?: number | null;
  feat_technicalScore?: number | null;
  feat_fundamentalScore?: number | null;
  feat_moneyFlowScore?: number | null;
  feat_adaptiveScore?: number | null;
  feat_rsi14?: number | null;
  feat_maTrend?: string | null;
  feat_stockStyle?: string | null;
  feat_highRiskFlag?: boolean | null;
  overallConfidence?: number | null;
};

export type PositionAllocation = {
  symbol: string;
  gptRank: number;
  strategyType: StrategyType;
  strategyConfidence: number;
  targetReturnPct: number;
  stopLossPct: number;
  maxHoldingDays: number;
  allocationWeight: number;
  strategyAllocationPct: number;
  budgetAmount: number;
};

export type AllocationResult = {
  allocations: PositionAllocation[];
  warnings: string[];
};

function defaultParams(s: StrategyType): Omit<StrategyParams, "confidence" | "strategyType"> {
  if (s === "DAY")      return { targetReturnPct: 3.0,  stopLossPct: -2.0, maxHoldingDays: 1  };
  if (s === "POSITION") return { targetReturnPct: 20.0, stopLossPct: -8.0, maxHoldingDays: 60 };
  return { targetReturnPct: 8.0, stopLossPct: -4.0, maxHoldingDays: 10 };
}

export function buildStrategyAllocations(recs: RecInput[], initialCapital: number): AllocationResult {
  const VALID = new Set(["BUY", "STRONG_BUY"]);
  const eligible = recs.filter(
    (r) => (r.gptRating && VALID.has(r.gptRating)) || (r.recommendation && VALID.has(r.recommendation))
  );

  const warnings: string[] = [];

  // Classify each rec using stored strategyType or fallback classifier
  const classified = eligible.map((rec) => {
    if (rec.strategyType && STRATEGY_TYPES.includes(rec.strategyType as StrategyType)) {
      const s = rec.strategyType as StrategyType;
      const def = defaultParams(s);
      return {
        rec,
        strategyType: s,
        confidence: rec.strategyConfidence ?? 50,
        targetReturnPct: rec.targetReturnPct ?? def.targetReturnPct,
        stopLossPct: rec.stopLossPct ?? def.stopLossPct,
        maxHoldingDays: rec.maxHoldingDays ?? def.maxHoldingDays,
      };
    }
    // Fallback: classify from feat_* (tradingAction not available → DAY unlikely)
    const r = classifyStrategy({
      technicalScore: rec.feat_technicalScore,
      fundamentalScore: rec.feat_fundamentalScore,
      moneyFlowScore: rec.feat_moneyFlowScore,
      adaptiveScore: rec.feat_adaptiveScore,
      rsi14: rec.feat_rsi14,
      maTrend: rec.feat_maTrend,
      stockStyle: rec.feat_stockStyle,
      highRiskFlag: rec.feat_highRiskFlag ?? undefined,
      overallConfidence: rec.overallConfidence,
    });
    warnings.push(`fallback_classify:${rec.symbol} (no stored strategyType)`);
    return {
      rec,
      strategyType: r.strategyType,
      confidence: r.confidence,
      targetReturnPct: r.targetReturnPct,
      stopLossPct: r.stopLossPct,
      maxHoldingDays: r.maxHoldingDays,
    };
  });

  // Group by strategy, sort by gptRank
  const byStrategy = new Map<StrategyType, typeof classified>(
    STRATEGY_TYPES.map((s) => [s, []])
  );
  for (const item of classified) byStrategy.get(item.strategyType)!.push(item);
  for (const [, group] of byStrategy) group.sort((a, b) => a.rec.gptRank - b.rec.gptRank);

  const allocations: PositionAllocation[] = [];
  for (const strategyType of STRATEGY_TYPES) {
    const slots = STRATEGY_SLOTS[strategyType];
    const allocPct = STRATEGY_ALLOC[strategyType];
    const group = byStrategy.get(strategyType)!.slice(0, slots);
    if (group.length === 0) {
      warnings.push(`insufficient_candidates:${strategyType} (0 eligible)`);
      continue;
    }
    if (group.length < slots) {
      warnings.push(`under_allocated:${strategyType} (${group.length}/${slots} slots filled)`);
    }
    const budgetPerPos = (initialCapital * allocPct) / group.length;
    const allocationWeight = allocPct / group.length;
    for (const item of group) {
      allocations.push({
        symbol: item.rec.symbol,
        gptRank: item.rec.gptRank,
        strategyType,
        strategyConfidence: item.confidence,
        targetReturnPct: item.targetReturnPct,
        stopLossPct: item.stopLossPct,
        maxHoldingDays: item.maxHoldingDays,
        allocationWeight,
        strategyAllocationPct: allocPct,
        budgetAmount: budgetPerPos,
      });
    }
  }

  return { allocations, warnings };
}
