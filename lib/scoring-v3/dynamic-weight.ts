// dynamic-weight.ts — 动态权重引擎（P3-T1）
// 用今日因子质量 + 市场状态基准，产出「今日权重」，替代固定权重。
// 约束：min/max 上下限、归一化为 100%、单日变化 ≤ ±5%。

import type { DimWeights } from "./regime-gate";
import type { DimKey, FactorQuality } from "./factor-quality";

// 每维度 min/max（分数形式）
export const WEIGHT_BOUNDS: Record<DimKey, { min: number; max: number }> = {
  technical:   { min: 0.20, max: 0.45 },
  fundamental: { min: 0.10, max: 0.35 },
  alpha:       { min: 0.10, max: 0.35 },
  news:        { min: 0.00, max: 0.15 },
  flow:        { min: 0.00, max: 0.15 },
};

const DIMS: DimKey[] = ["technical", "fundamental", "alpha", "news", "flow"];
const MAX_DAILY_CHANGE = 0.05; // 单日单维度权重变化上限 ±5%

function clampBounds(w: Record<DimKey, number>): Record<DimKey, number> {
  const out = {} as Record<DimKey, number>;
  for (const d of DIMS) out[d] = Math.max(WEIGHT_BOUNDS[d].min, Math.min(WEIGHT_BOUNDS[d].max, w[d]));
  return out;
}

function normalize(w: Record<DimKey, number>): Record<DimKey, number> {
  const sum = DIMS.reduce((a, d) => a + w[d], 0) || 1;
  const out = {} as Record<DimKey, number>;
  for (const d of DIMS) out[d] = w[d] / sum;
  return out;
}

// 主函数：base（regime 基准）× quality（因子质量）→ clamp → normalize → 限幅（vs 昨日）→ normalize
export function computeDynamicWeights(
  base: DimWeights,
  quality: Record<DimKey, FactorQuality>,
  prev?: DimWeights | null
): { weights: DimWeights; adjustedRaw: Record<DimKey, number> } {
  // 1. 质量调制：低质量维度自动降权
  const adjusted = {} as Record<DimKey, number>;
  for (const d of DIMS) adjusted[d] = base[d] * (0.25 + 0.75 * quality[d].quality); // 质量 0 时保留 25% 基准，避免直接归零

  // 2. 上下限
  let w = clampBounds(adjusted);
  // 3. 归一化
  w = normalize(w);

  // 4. 单日变化限幅（±5%），再归一化
  if (prev) {
    for (const d of DIMS) {
      const lo = prev[d] - MAX_DAILY_CHANGE, hi = prev[d] + MAX_DAILY_CHANGE;
      w[d] = Math.max(lo, Math.min(hi, w[d]));
    }
    w = clampBounds(w);
    w = normalize(w);
  }

  return {
    weights: { technical: w.technical, fundamental: w.fundamental, alpha: w.alpha, news: w.news, flow: w.flow },
    adjustedRaw: adjusted,
  };
}
