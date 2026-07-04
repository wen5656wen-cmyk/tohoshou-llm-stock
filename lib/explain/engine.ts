// ── Explain AI Engine · 规则引擎（P5-T1）─────────────────────────────────────
// 默认解释提供方。只读评分快照，组合各推导模块产出统一 ExplainResult，绝不重算评分。

import type { ExplainInput, ExplainResult } from "./types";
import { deriveStrengths, deriveOpportunities } from "./strength";
import { deriveWeaknesses, deriveRisks } from "./risk";
import { buildOverallSummary, buildMarketContext, buildStrategy, buildConfidence, buildNextObservation } from "./summary";

export function ruleExplain(input: ExplainInput): ExplainResult {
  const strengths = deriveStrengths(input);
  const weaknesses = deriveWeaknesses(input);
  const risks = deriveRisks(input);
  const opportunities = deriveOpportunities(input);
  const { recommendedStrategy, holdingPeriod } = buildStrategy(input);

  return {
    symbol: input.symbol,
    name: input.score?.nameZh ?? input.score?.name ?? null,
    provider: "rule",
    recommendation: input.score?.recommendationV2 ?? null,
    overallSummary: buildOverallSummary(input, strengths, weaknesses),
    strengths,
    weaknesses,
    risks,
    opportunities,
    marketContext: buildMarketContext(input),
    recommendedStrategy,
    holdingPeriod,
    confidence: buildConfidence(input),
    nextObservation: buildNextObservation(input, weaknesses, risks),
    dataAsOf: input.score?.latestDate ?? input.regime?.date ?? null,
    generatedAt: new Date().toISOString(),
  };
}
