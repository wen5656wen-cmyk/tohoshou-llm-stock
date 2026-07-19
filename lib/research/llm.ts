// ── Deep Research · LLM 抽象层（P17 Phase 3）─────────────────────────────────
// 多 provider 抽象（OpenAI 现有 / Anthropic 预留），结构化输出 + 用量/成本/时长追踪。
// 不改现有 lib/openai.ts；深研可用更强模型（OPENAI_MODEL / RESEARCH_MODEL）。
// ⚠️ LLM 产出为 DRAFT/AI_RESEARCHED，必须经证据绑定 + 人审才能 PUBLISHED（防幻觉）。
import { openaiClient, GPT_MODEL } from "../openai";
import type { IndustryResearch, ResearchProvider, ResearchResult } from "./types";

// 粗略成本表（USD / 1K tokens，可按实际模型调整）
const COST: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "gpt-4o": { in: 0.0025, out: 0.01 },
  "gpt-4.1": { in: 0.002, out: 0.008 },
  default: { in: 0.002, out: 0.008 },
};
function estimateCost(model: string, pt: number, ct: number): number {
  const c = COST[model] ?? COST.default;
  return +((pt / 1000) * c.in + (ct / 1000) * c.out).toFixed(4);
}

// 深研 system prompt——强约束：只输出结构化 JSON、事实须可核验、不确定标 LOW、绑证据
const SYSTEM = `You are a senior equity research analyst specializing in AI industry supply chains and Japanese listed companies.
Output STRICT JSON only, matching the requested schema. Rules:
- Focus on AI-related industries and identify which JAPANESE LISTED companies benefit and why.
- Map upstream/midstream/downstream, technology chokepoints, hidden champions.
- Every material claim (market share, monopoly, moat) MUST include evidence with a real source type; if you cannot ground a claim, set its confidence to "LOW".
- Never fabricate precise figures without a source. Prefer ranges + LOW confidence over false precision.
- Use Japanese company legal names; include stock symbol (e.g. 6920.T) only for listed JP companies.`;

export class OpenAiResearchProvider implements ResearchProvider {
  name = "openai";
  private model: string;
  constructor(model?: string) {
    this.model = model ?? process.env.RESEARCH_MODEL ?? GPT_MODEL;
  }
  async research(industryKey: string): Promise<ResearchResult> {
    const t0 = Date.now();
    const client = openaiClient();
    const user = `Produce a deep research payload for the AI industry line "${industryKey}" as JSON with keys: industry, segments[], technologies[], companies[], bottlenecks[], edges[]. Follow the IndustryResearch schema. Emphasize Japanese listed beneficiaries, chokepoints, and evidence-bound claims.`;
    const resp = await client.chat.completions.create({
      model: this.model,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const durationMs = Date.now() - t0;
    const raw = resp.choices[0]?.message?.content ?? "{}";
    const data = JSON.parse(raw) as IndustryResearch;
    const pt = resp.usage?.prompt_tokens ?? 0;
    const ct = resp.usage?.completion_tokens ?? 0;
    return {
      data,
      sourceKind: "LLM",
      usage: { provider: this.name, model: this.model, promptTokens: pt, completionTokens: ct, totalTokens: pt + ct, estimatedCost: estimateCost(this.model, pt, ct), durationMs },
    };
  }
}

// 预留：AnthropicResearchProvider（需 ANTHROPIC_API_KEY；接口一致，Phase 后续接入 Claude Opus）
