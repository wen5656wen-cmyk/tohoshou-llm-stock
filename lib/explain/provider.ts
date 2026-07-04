// ── Explain AI Engine · Provider 抽象（P5-T1）───────────────────────────────
// 支持 RuleEngine（当前默认）/ GPT / Hybrid（预留）。默认永不调用 GPT。
// 未来仅需切换 provider 即可完成 Rule → GPT → Hybrid 升级，页面/API 无需改动。

import type { ExplainInput, ExplainResult, ExplainProvider, ExplainProviderKind } from "./types";
import { ruleExplain } from "./engine";

// 规则引擎 Provider（当前唯一实现）
class RuleEngineProvider implements ExplainProvider {
  kind: ExplainProviderKind = "rule";
  explain(input: ExplainInput): ExplainResult { return ruleExplain(input); }
}

// GPT Provider（预留）——尚未实现，安全回退到规则引擎，绝不默认调用 GPT。
class GptExplainProvider implements ExplainProvider {
  kind: ExplainProviderKind = "gpt";
  explain(input: ExplainInput): ExplainResult {
    // TODO(P5-Tx): 接入 OpenAI，仅在显式 provider=gpt 且未来实现后启用。
    // 当前回退规则引擎，保证行为稳定、无外部依赖。
    return { ...ruleExplain(input), provider: "rule" };
  }
}

// Hybrid Provider（预留）——规则骨架 + 未来 GPT 润色；当前等价规则引擎。
class HybridExplainProvider implements ExplainProvider {
  kind: ExplainProviderKind = "hybrid";
  explain(input: ExplainInput): ExplainResult {
    return { ...ruleExplain(input), provider: "rule" };
  }
}

const PROVIDERS: Record<ExplainProviderKind, ExplainProvider> = {
  rule: new RuleEngineProvider(),
  gpt: new GptExplainProvider(),
  hybrid: new HybridExplainProvider(),
};

// 默认 provider：env EXPLAIN_PROVIDER 覆盖，否则 rule（第七部分：默认不调 GPT）
export const DEFAULT_EXPLAIN_PROVIDER: ExplainProviderKind =
  (["rule", "gpt", "hybrid"] as const).includes(process.env.EXPLAIN_PROVIDER as ExplainProviderKind)
    ? (process.env.EXPLAIN_PROVIDER as ExplainProviderKind)
    : "rule";

export function getExplainProvider(kind: ExplainProviderKind = DEFAULT_EXPLAIN_PROVIDER): ExplainProvider {
  return PROVIDERS[kind] ?? PROVIDERS.rule;
}
