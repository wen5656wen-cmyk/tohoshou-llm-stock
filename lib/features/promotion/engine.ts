// ── TOHOSHOU AI · Feature Promotion Engine（P6-T8）─────────────────────────
// 核心纯函数：PromotionRawInput（真实统计） + status → PromotionEval
// （promotionScore / learningScore / rating / recommendation）。
// **纯函数 · 只读 · 不接评分 · 不落库 · 不自动改状态。** 本阶段仅给「建议」。

import {
  PROMOTION_RULES, RATING_LABEL,
  type PromotionRawInput, type PromotionMetrics, type PromotionEval,
  type PromotionRecommendation, type PromotionStars,
} from "./types";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** 置信度：样本量决定（<30→LOW / <100→MEDIUM / ≥100→HIGH；无样本→LOW）。 */
export function deriveConfidence(sampleCount: number | null): "LOW" | "MEDIUM" | "HIGH" {
  if (sampleCount == null || sampleCount < 30) return "LOW";
  if (sampleCount < PROMOTION_RULES.readySample) return "MEDIUM";
  return "HIGH";
}

/** 置信度 → 成熟度分（0-100）。 */
function maturityScore(conf: "LOW" | "MEDIUM" | "HIGH"): number {
  return conf === "HIGH" ? 100 : conf === "MEDIUM" ? 65 : 30;
}

/** Alpha% → 0-100（0%→50，+5%→100，-5%→0）。 */
function alphaToScore(alpha: number): number { return clamp(50 + alpha * 10); }
/** Sharpe → 0-100（0→50，+2→100，-2→0）。 */
function sharpeToScore(sharpe: number): number { return clamp(50 + sharpe * 25); }

/**
 * 统一晋升分（0-100）。核心指标（hitRate、alpha）缺失 → null。
 * 加权：命中率 35% + Alpha 25% + Sharpe 15% + 覆盖率 10% + 一致性 10% + 成熟度 5%。
 * 缺失的辅助项（sharpe/coverage/consistency）取中性 50，避免惩罚无该维度数据的因子。
 */
export function computePromotionScore(raw: PromotionRawInput): number | null {
  if (raw.hitRate == null || raw.alpha == null) return null;
  const w = PROMOTION_RULES.weights;
  const conf = deriveConfidence(raw.sampleCount);
  const parts =
    clamp(raw.hitRate) * w.hitRate +
    alphaToScore(raw.alpha) * w.alpha +
    sharpeToScore(raw.sharpeRatio ?? 0) * w.sharpe +
    clamp(raw.coverage ?? 50) * w.coverage +
    clamp(raw.consistency ?? 50) * w.consistency +
    maturityScore(conf) * w.maturity;
  return round1(clamp(parts));
}

/**
 * 学习成熟度/质量分（0-100）：成熟度 50% + 一致性 30% + 覆盖率 20%。
 * 表示学习流水线对该因子的「可信/成熟」程度，独立于晋升分（无 hitRate/alpha 也可算）。
 */
export function computeLearningScore(raw: PromotionRawInput): number | null {
  const conf = deriveConfidence(raw.sampleCount);
  const cov = raw.coverage, cons = raw.consistency;
  if (cov == null && cons == null && (raw.sampleCount == null || raw.sampleCount === 0)) return null;
  return round1(clamp(maturityScore(conf) * 0.5 + clamp(cons ?? 50) * 0.3 + clamp(cov ?? 50) * 0.2));
}

function recFromRating(rating: PromotionStars): PromotionRecommendation {
  if (rating >= 5) return "PROMOTE";
  if (rating <= 2) return "DISABLE";
  return "KEEP_SHADOW";
}

/**
 * 对单个 Feature 做晋升评估。
 * @param raw  真实统计（缺失/undefined → pending，不判定）
 * @param status  Feature 生命周期状态（PRODUCTION 视为参考基线，不产出候选建议）
 */
export function evaluatePromotion(raw: PromotionRawInput | undefined, status: string): PromotionEval {
  const R = PROMOTION_RULES;
  const input: PromotionRawInput = raw ?? {
    hitRate: null, winRate: null, alpha: null, sharpeRatio: null,
    maxDrawdown: null, coverage: null, consistency: null, sampleCount: null,
  };
  const confidence = deriveConfidence(input.sampleCount);
  const promotionScore = computePromotionScore(input);
  const learningScore = computeLearningScore(input);
  const metrics: PromotionMetrics = { ...input, learningScore, promotionScore };

  // PRODUCTION：已在生产，作为对照基线，不重新评估晋升（recommendation=null）。
  if (status === "PRODUCTION") {
    return {
      metrics, confidence: "HIGH",
      rating: 5, ratingLabel: RATING_LABEL[5],
      recommendation: null, pending: false,
      reason: "已在生产 · 参考基线（本引擎 V1 不重评生产因子）",
      reasons: ["Feature 已进入正式评分，作为晋升对照基线；不产出晋升/停用建议"],
    };
  }

  const reasons: string[] = [];
  let rating: PromotionStars;
  let pending = false;

  const hasCore = input.hitRate != null && input.alpha != null && input.sampleCount != null;

  if (!hasCore) {
    pending = true;
    rating = 3;
    reasons.push("缺少 Backtest 有效性样本（hitRate/Alpha/样本）→ 暂不判定，继续影子观察");
  } else {
    const hit = input.hitRate as number;
    const alpha = input.alpha as number;
    const score = promotionScore as number;

    if (hit < R.disableHitRate && alpha < 0) {
      rating = 1;
      reasons.push(`命中率 ${round1(hit)}% < ${R.disableHitRate}% 且 Alpha ${round1(alpha)}% < 0 → 建议停用`);
    } else if (score < R.observeScore) {
      rating = 2;
      reasons.push(`综合晋升分 ${score} < ${R.observeScore} → 表现偏弱，建议停用`);
    } else if (score >= R.strongScore && confidence === "HIGH" && alpha > 0 && hit >= R.readyHitRate) {
      rating = 5;
      reasons.push(`综合分 ${score} ≥ ${R.strongScore} · 命中率 ${round1(hit)}% ≥ ${R.readyHitRate}% · 样本 ${input.sampleCount} 充足 · Alpha>0 → 可进入 Production`);
    } else if (score >= R.strongScore && alpha > 0 && hit >= R.promisingHitRate && confidence !== "HIGH") {
      rating = 4;
      reasons.push(`综合分 ${score} ≥ ${R.strongScore} 且命中率 ${round1(hit)}% ≥ ${R.promisingHitRate}%，但样本不足(${input.sampleCount} < ${R.readySample}) → 需更多样本`);
    } else {
      rating = 3;
      const why = hit < R.readyHitRate ? `命中率 ${round1(hit)}% 未达 ${R.readyHitRate}% 晋升门槛` : `综合分 ${score} 处观察区`;
      reasons.push(`${why} → 继续观察`);
    }
  }

  const recommendation = recFromRating(rating);
  return {
    metrics, confidence, rating, ratingLabel: RATING_LABEL[rating],
    recommendation, pending,
    reason: reasons[0] ?? "",
    reasons,
  };
}
