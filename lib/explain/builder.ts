// ── Explain AI Engine · 统一入口 Builder（P5-T1）─────────────────────────────
// 全站所有 Explain 都从这里生成（第四部分：不要多个 Explain 版本）。
// 输入只读评分快照；选择 provider（默认 rule）；输出统一 ExplainResult。

import type { ExplainInput, ExplainResult, ExplainProviderKind } from "./types";
import { getExplainProvider, DEFAULT_EXPLAIN_PROVIDER } from "./provider";

export function buildExplain(input: ExplainInput, opts?: { provider?: ExplainProviderKind }): ExplainResult {
  const provider = getExplainProvider(opts?.provider ?? DEFAULT_EXPLAIN_PROVIDER);
  return provider.explain(input);
}
