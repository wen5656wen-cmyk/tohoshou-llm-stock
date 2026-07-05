// ── TOHOSHOU AI · Feature Validation Statistics（P6-T5）─────────────────────
// 从「因子信号 + 前向收益」观测计算验证统计（供未来 Backtest 喂给 engine）。
// **纯函数、只读、不落库、不接评分。** 无观测时返回 pending（null），不伪造。

import { VALIDATION_RULES, type ValidationConfidence, type ValidationInput } from "./types";

/** 一条观测：因子是否触发（signal）+ 该样本的前向收益% + 基准收益%。 */
export interface FeatureObservation {
  signal: boolean;             // 因子是否给出正向信号
  forwardReturn: number;       // 前向收益 %
  benchmarkReturn?: number;    // 同期基准收益 %（用于 alpha）
  covered?: boolean;           // 该样本是否有该因子的有效值（覆盖率）
}

/** 从观测集计算 ValidationInput（覆盖率/样本/命中率/平均收益/alpha/胜率）。 */
export function computeStats(observations: FeatureObservation[], universeSize?: number): ValidationInput {
  if (!observations || observations.length === 0) {
    return { coverage: null, sampleSize: null, hitRate: null, avgReturn: null, alpha: null, winRate: null, informationGain: null };
  }
  const covered = observations.filter((o) => o.covered !== false);
  const signals = covered.filter((o) => o.signal);          // 触发信号的样本
  const n = signals.length;
  const denom = universeSize && universeSize > 0 ? universeSize : covered.length;
  const coverage = denom > 0 ? (covered.length / denom) * 100 : null;

  if (n === 0) {
    return { coverage, sampleSize: 0, hitRate: null, avgReturn: null, alpha: null, winRate: null, informationGain: null };
  }
  const rets = signals.map((o) => o.forwardReturn);
  const hits = signals.filter((o) => o.forwardReturn > 0).length;
  const wins = signals.filter((o) => (o.benchmarkReturn == null ? o.forwardReturn > 0 : o.forwardReturn > o.benchmarkReturn)).length;
  const avgReturn = mean(rets);
  const benchRets = signals.map((o) => o.benchmarkReturn ?? 0);
  const alpha = mean(rets) - mean(benchRets);
  return {
    coverage,
    sampleSize: n,
    hitRate: (hits / n) * 100,
    avgReturn,
    alpha,
    winRate: (wins / n) * 100,
    informationGain: null, // 预留
  };
}

/** 置信度：样本量决定（Sample<30→LOW / <100→MEDIUM / ≥100→HIGH；无样本→LOW）。 */
export function deriveConfidence(sampleSize: number | null): ValidationConfidence {
  if (sampleSize == null || sampleSize < VALIDATION_RULES.confMediumSample) return "LOW";
  if (sampleSize < VALIDATION_RULES.confHighSample) return "MEDIUM";
  return "HIGH";
}

/** 验证分 0-100（hitRate 主 + alpha 辅）；核心指标缺失→null。 */
export function deriveValidationScore(input: ValidationInput): number | null {
  if (input.hitRate == null || input.alpha == null) return null;
  const raw = input.hitRate * 0.7 + input.alpha * 2;
  return Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
