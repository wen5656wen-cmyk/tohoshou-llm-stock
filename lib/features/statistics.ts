// ── TOHOSHOU AI · Feature Statistics（P6-T1 · 预留层）───────────────────────
// **V1 绝不计算任何统计**——本层仅提供「空统计」结构，字段全部允许为空。
// 未来（P6 后续）由 Shadow → Backtest → Learning 链路回填 hitRate/avgReturn/coverage
// 等，用于评估 Feature 有效性，再决定能否升入 Production。此处不接任何评分/DB/计算。

import type { Feature, FeatureStatistics, FeatureWithStats } from "./types";

/** 空统计（所有字段为空）。V1 唯一产出。 */
export function emptyStatistics(): FeatureStatistics {
  return {
    enabled: null,
    weight: null,
    hitRate30d: null,
    hitRate90d: null,
    avgReturn30d: null,
    avgReturn90d: null,
    coverage: null,
    lastValidated: null,
    version: null,
  };
}

/**
 * 给 Feature 附上（预留）统计。V1 默认全空；可传 partial 覆盖（供未来回填，
 * 但 V1 调用方不应传入真实计算值——保持 Registry 不参与计算的铁律）。
 */
export function attachStatistics(feature: Feature, stats?: Partial<FeatureStatistics>): FeatureWithStats {
  return { ...feature, statistics: { ...emptyStatistics(), ...(stats ?? {}) } };
}
