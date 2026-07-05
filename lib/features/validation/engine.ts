// ── TOHOSHOU AI · Feature Validation Engine（P6-T5）─────────────────────────
// 统一验证入口：ValidationInput（统计） + 当前 stage → ValidationResult（含
// confidence / recommendation / validationScore）。**纯函数、只读、不接评分。**
// 规则默认值见 VALIDATION_RULES；本阶段仅给「建议」，不实际淘汰/提升。

import { deriveConfidence, deriveValidationScore } from "./statistics";
import {
  VALIDATION_RULES, type ValidationInput, type ValidationResult,
  type ValidationRecommendation, type ValidationStage,
} from "./types";

/**
 * 对单个 Feature 做验证评估。
 * @param input 统计输入（缺失字段为 null → pending）
 * @param stage 当前所处 pipeline 阶段（由 registry 依 status 映射）
 */
export function evaluateFeature(input: ValidationInput, stage: ValidationStage): ValidationResult {
  const R = VALIDATION_RULES;
  const confidence = deriveConfidence(input.sampleSize);
  const validationScore = deriveValidationScore(input);
  const reasons: string[] = [];

  const hasCore = input.hitRate != null && input.alpha != null && input.sampleSize != null && input.coverage != null;
  let recommendation: ValidationRecommendation;
  let pending = false;

  if (!hasCore) {
    // 数据不足 → 不判定，WATCH（pending）
    pending = true;
    recommendation = "WATCH";
    reasons.push("验证样本/统计缺失（等待 Backtest 数据）→ 不判定");
  } else {
    const hit = input.hitRate as number;
    const alpha = input.alpha as number;
    const cov = input.coverage as number;
    const n = input.sampleSize as number;

    if (n < R.minSample) {
      recommendation = "WATCH";
      reasons.push(`样本 ${n} < ${R.minSample} → 样本不足，暂不判定（LOW 置信）`);
    } else if (cov < R.minCoveragePct) {
      recommendation = "WATCH";
      reasons.push(`覆盖率 ${cov.toFixed(1)}% < ${R.minCoveragePct}% → 覆盖不足`);
    } else if (hit > R.promoteHitRate && alpha > R.promoteAlpha) {
      recommendation = "PROMOTE";
      reasons.push(`命中率 ${hit.toFixed(1)}% > ${R.promoteHitRate}% 且 Alpha ${alpha.toFixed(1)}% > ${R.promoteAlpha}% → 建议提升`);
    } else if (hit < R.removeHitRate && alpha < 0) {
      recommendation = "REMOVE";
      reasons.push(`命中率 ${hit.toFixed(1)}% < ${R.removeHitRate}% 且 Alpha ${alpha.toFixed(1)}% < 0 → 建议移除`);
    } else if (hit > R.keepHitRate && alpha > 0) {
      recommendation = "KEEP";
      reasons.push(`命中率 ${hit.toFixed(1)}% > ${R.keepHitRate}% 且 Alpha ${alpha.toFixed(1)}% > 0 → 保留`);
    } else {
      recommendation = "WATCH";
      reasons.push("未达 KEEP/PROMOTE/REMOVE 阈值 → 继续观察");
    }
  }

  return {
    coverage: input.coverage,
    sampleSize: input.sampleSize,
    hitRate: input.hitRate,
    avgReturn: input.avgReturn,
    alpha: input.alpha,
    winRate: input.winRate,
    informationGain: input.informationGain ?? null,
    confidence,
    stage,
    recommendation,
    validationScore,
    validationUpdatedAt: null, // 只读派生，无持久化
    pending,
    reasons,
  };
}

/** 空输入（未验证 Feature 的默认 pending 状态）。 */
export function emptyInput(): ValidationInput {
  return { coverage: null, sampleSize: null, hitRate: null, avgReturn: null, alpha: null, winRate: null, informationGain: null };
}
