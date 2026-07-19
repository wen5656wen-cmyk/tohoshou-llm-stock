// ── Deep Research · Seed Provider（P17 Phase 4）──────────────────────────────
// 以人工核验的真实种子数据驱动引擎（与 LLM provider 接口一致）。
// Golden Path（AI 半导体）用 seed 跑通全链路；其余产业可用 LLM provider。
import type { IndustryResearch, ResearchProvider, ResearchResult } from "./types";
import { AI_SEMICONDUCTOR } from "./seed/ai-semiconductor";
import { AI_DATACENTER } from "./seed/ai-datacenter";

export const SEEDS: Record<string, IndustryResearch> = {
  AI_SEMICONDUCTOR,
  AI_DATACENTER,
};

export class SeedResearchProvider implements ResearchProvider {
  name = "seed";
  async research(industryKey: string): Promise<ResearchResult> {
    const data = SEEDS[industryKey];
    if (!data) throw new Error(`No seed dataset for industry: ${industryKey}`);
    return {
      data,
      sourceKind: "SEED",
      usage: { provider: "seed", model: "human-verified", promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, durationMs: 0 },
    };
  }
}
