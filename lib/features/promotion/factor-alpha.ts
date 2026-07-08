// ── TOHOSHOU AI · Factor Alpha + Promotion Engine V2（P6-T9）────────────────
// 消费 FactorAlphaResult（真实回测：因子级 per-horizon alpha vs 等权宇宙）+ 覆盖率，
// 派生 Factor Alpha Bundle / Contribution / Confidence / Stability / Trend，并重算
// Promotion Score V2 与 Promote / Keep Shadow / Disable 建议。
// **纯函数 · 只读 · 不落库 · 不自动改任何 Feature 状态 · 不影响任何评分/推荐。**
//
// 基准说明：alpha = top-quintile cohort − 等权宇宙均值（日度再平衡），非 TOPIX——
// GlobalMarket.topix 点位序列在 2026-03-30 有量纲断裂（3827→376.4，指数→ETF代理），
// 跨期 TOPIX 超额被污染；宇宙相对 alpha 与 cohort 同源同量纲，是正确的因子选择基准。
//
// 评分理念：绝对 hitRate 受市场方向混淆（本样本全 <50%），故晋升由 **alpha + rankIc
// (方向预测质量) + 符号稳定性** 驱动，hitRate 仅作展示上下文，不参与打分。

import { RATING_LABEL, type PromotionRecommendation, type PromotionStars } from "./types";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const FACTOR_ALPHA_HORIZONS = [1, 3, 5, 10, 20] as const;
export const PRIMARY_HORIZON = 10; // 代表性持仓周期（比 20d 稳、比 1d 有信号）

export type LearningTrend = "IMPROVING" | "FLAT" | "DECAYING";

/** 一个 (featureId, horizon) 的真实回测行（来自 FactorAlphaResult）。 */
export interface FactorAlphaRow {
  featureId: string;
  horizon: number;
  alpha: number | null;
  avgReturn: number | null;
  benchReturn: number | null;
  hitRate: number | null;
  rankIc: number | null;
  cohortSize: number;
  sampleCount: number;
  asOfCount: number;
  asOfLatest: string | null;
}

export interface FactorAlphaHorizon {
  horizon: number;
  alpha: number | null;
  avgReturn: number | null;
  benchReturn: number | null;
  hitRate: number | null;
  rankIc: number | null;
}

/** 一个 Feature 的因子 alpha 汇总（跨 horizon）。 */
export interface FactorAlphaBundle {
  featureId: string;
  horizons: FactorAlphaHorizon[];
  primary: FactorAlphaHorizon | null;  // PRIMARY_HORIZON
  meanRankIc: number | null;           // 跨 horizon 平均 rankIc（方向预测质量）
  alphaPosShare: number;               // alpha>0 的 horizon 占比 0-1
  icPosShare: number;                  // rankIc>0 的 horizon 占比 0-1
  stability: number | null;            // 符号稳定性 %（alpha+ic 一致度）
  trend: LearningTrend | null;         // alpha 随 horizon 的斜率
  sampleCount: number;
  asOfCount: number;
  cohortSize: number;
  asOfLatest: string | null;
  contribution: number | null;         // 归因占比 %（跨因子归一，registry 回填）
}

/** V2 评估结果（Promotion Engine V2）。 */
export interface PromotionEvalV2 {
  factorAlpha: FactorAlphaBundle | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  stability: number | null;
  trend: LearningTrend | null;
  contribution: number | null;
  promotionScore: number | null;
  learningScore: number | null;
  rating: PromotionStars;
  ratingLabel: string;
  recommendation: PromotionRecommendation | null;
  pending: boolean;
  pendingReason: string | null;
  pendingReasonCode: string | null;
  reason: string;
  reasons: string[];
}

/** V2 阈值。 */
export const PROMOTION_V2_RULES = {
  confHighAsOf: 120,   // ≥120 个再平衡日（~6 月）→ HIGH
  confMedAsOf: 45,     // ≥45 → MEDIUM
  antiIc: -0.01,       // 平均 rankIc < −0.01 → 反向预测 → Disable
  promoteScore: 65,    // ≥65 且 HIGH 置信 …→ Promote
  keepScore: 62,       // ≥62 → 4★ Need More Samples（Keep Shadow）
  observeScore: 48,    // ≥48 → 3★ Observe；否则 2★ Weak
  promoteIc: 0.02,     // Promote 需平均 rankIc > 0.02
  weights: { alpha: 0.38, ic: 0.32, stability: 0.12, coverage: 0.06, maturity: 0.12 },
} as const;

/** 置信度：由独立再平衡日数决定（统计可靠性来自 # rebalance dates）。 */
export function deriveConfidenceV2(asOfCount: number | null): "LOW" | "MEDIUM" | "HIGH" {
  if (asOfCount == null || asOfCount < PROMOTION_V2_RULES.confMedAsOf) return "LOW";
  if (asOfCount < PROMOTION_V2_RULES.confHighAsOf) return "MEDIUM";
  return "HIGH";
}

function maturityScore(c: "LOW" | "MEDIUM" | "HIGH"): number {
  return c === "HIGH" ? 100 : c === "MEDIUM" ? 65 : 30;
}

/** 从真实回测行构建 Factor Alpha Bundle（contribution 由 registry 后填）。 */
export function buildBundle(rows: FactorAlphaRow[]): FactorAlphaBundle | null {
  if (!rows.length) return null;
  const byH = new Map<number, FactorAlphaRow>();
  for (const r of rows) byH.set(r.horizon, r);
  const horizons: FactorAlphaHorizon[] = FACTOR_ALPHA_HORIZONS
    .filter((h) => byH.has(h))
    .map((h) => {
      const r = byH.get(h)!;
      return { horizon: h, alpha: r.alpha, avgReturn: r.avgReturn, benchReturn: r.benchReturn, hitRate: r.hitRate, rankIc: r.rankIc };
    });
  const alphas = horizons.map((h) => h.alpha).filter((x): x is number => x != null);
  const ics = horizons.map((h) => h.rankIc).filter((x): x is number => x != null);
  const alphaPosShare = alphas.length ? alphas.filter((a) => a > 0).length / alphas.length : 0;
  const icPosShare = ics.length ? ics.filter((a) => a > 0).length / ics.length : 0;
  const meanRankIc = mean(ics);
  const stability = alphas.length && ics.length ? r1((alphaPosShare * 0.5 + icPosShare * 0.5) * 100) : null;

  // trend：alpha20d vs alpha5d（需两者>0）
  const a5 = byH.get(5)?.alpha ?? null;
  const a20 = byH.get(20)?.alpha ?? null;
  let trend: LearningTrend | null = null;
  if (a5 != null && a20 != null && a5 > 0) {
    const ratio = a20 / a5;
    trend = ratio > 1.2 ? "IMPROVING" : ratio < 0.8 ? "DECAYING" : "FLAT";
  } else if (a5 != null && a20 != null) {
    trend = a20 >= a5 ? "IMPROVING" : "DECAYING";
  }

  const anyRow = rows[0];
  const primary = horizons.find((h) => h.horizon === PRIMARY_HORIZON) ?? horizons.at(-1) ?? null;
  return {
    featureId: anyRow.featureId,
    horizons, primary, meanRankIc: meanRankIc == null ? null : r4(meanRankIc),
    alphaPosShare: r2(alphaPosShare), icPosShare: r2(icPosShare), stability, trend,
    sampleCount: Math.max(...rows.map((r) => r.sampleCount)),
    asOfCount: Math.max(...rows.map((r) => r.asOfCount)),
    cohortSize: Math.max(...rows.map((r) => r.cohortSize)),
    asOfLatest: anyRow.asOfLatest,
    contribution: null,
  };
}

/**
 * V2 评估：由 bundle + 覆盖率派生 promotionScore/rating/recommendation。
 * @param bundle 因子 alpha 汇总（null → 无回测，交给 shadow diagnostics 处理 pending）
 * @param coverage 覆盖率 %（latest AlphaFactor 该列非空占比，可空）
 * @param status Feature 状态（PRODUCTION 作参考基线，recommendation=null）
 */
export function evaluatePromotionV2(
  bundle: FactorAlphaBundle | null,
  coverage: number | null,
  status: string,
): PromotionEvalV2 {
  const R = PROMOTION_V2_RULES;

  if (!bundle || bundle.primary == null || bundle.primary.alpha == null) {
    return {
      factorAlpha: bundle, confidence: "LOW", stability: bundle?.stability ?? null,
      trend: bundle?.trend ?? null, contribution: null,
      promotionScore: null, learningScore: null,
      rating: 3, ratingLabel: RATING_LABEL[3], recommendation: status === "PRODUCTION" ? null : "KEEP_SHADOW",
      pending: true, pendingReason: null, pendingReasonCode: null,
      reason: "无因子回测样本 · 待补齐", reasons: ["无 FactorAlphaResult 回测数据"],
    };
  }

  const confidence = deriveConfidenceV2(bundle.asOfCount);
  const alpha = bundle.primary.alpha;              // 10d alpha
  const ic = bundle.meanRankIc ?? 0;
  const stability = bundle.stability ?? 0;
  const cov = coverage ?? 50;
  const mat = maturityScore(confidence);

  const alphaScore = clamp(50 + alpha * 40);       // 10d alpha +1% → 90
  const icScore = clamp(50 + ic * 700);            // meanRankIc +0.05 → 85
  const w = R.weights;
  const promotionScore = r1(clamp(
    alphaScore * w.alpha + icScore * w.ic + stability * w.stability + cov * w.coverage + mat * w.maturity,
  ));
  const learningScore = r1(clamp(mat * 0.4 + stability * 0.35 + icScore * 0.25));

  // PRODUCTION：参考基线，不重评晋升。
  if (status === "PRODUCTION") {
    return {
      factorAlpha: bundle, confidence, stability: bundle.stability, trend: bundle.trend, contribution: bundle.contribution,
      promotionScore, learningScore, rating: 5, ratingLabel: RATING_LABEL[5],
      recommendation: null, pending: false, pendingReason: null, pendingReasonCode: null,
      reason: "已在生产 · 参考基线（含真实因子 alpha，仅作对照）",
      reasons: [`已进入正式评分；10d alpha ${alpha >= 0 ? "+" : ""}${r2(alpha)}% · meanRankIC ${r2(ic)}`],
    };
  }

  const reasons: string[] = [];
  let rating: PromotionStars;

  if (ic < R.antiIc) {
    rating = 1;
    reasons.push(`平均 rankIC ${r2(ic)} < ${R.antiIc}（因子值与前向收益反向）→ 反向预测，建议停用`);
  } else if (promotionScore < R.observeScore || alpha <= 0) {
    rating = 2;
    reasons.push(`综合分 ${promotionScore} 偏低或 10d alpha ${r2(alpha)}%≤0 → 表现偏弱`);
  } else if (promotionScore >= R.promoteScore && ic > R.promoteIc && confidence === "HIGH" && bundle.alphaPosShare >= 0.8) {
    rating = 5;
    reasons.push(`综合分 ${promotionScore} ≥ ${R.promoteScore} · 平均 rankIC ${r2(ic)} > ${R.promoteIc} · ${bundle.asOfCount} 再平衡日(HIGH) · alpha 全周期正 → 可进入 Production`);
  } else if (promotionScore >= R.keepScore && alpha > 0 && ic > 0) {
    rating = 4;
    reasons.push(`10d alpha +${r2(alpha)}% · 平均 rankIC ${r2(ic)} · 综合分 ${promotionScore}，但仅 ${bundle.asOfCount} 再平衡日(${confidence}) → 需更多样本`);
  } else {
    rating = 3;
    reasons.push(`10d alpha +${r2(alpha)}% · 综合分 ${promotionScore}（观察区）→ 继续观察`);
  }

  const recommendation: PromotionRecommendation = rating >= 5 ? "PROMOTE" : rating <= 2 ? "DISABLE" : "KEEP_SHADOW";

  return {
    factorAlpha: bundle, confidence, stability: bundle.stability, trend: bundle.trend, contribution: bundle.contribution,
    promotionScore, learningScore, rating, ratingLabel: RATING_LABEL[rating],
    recommendation, pending: false, pendingReason: null, pendingReasonCode: null,
    reason: reasons[0] ?? "", reasons,
  };
}

/** 归因：跨已评估因子，按正 alpha(10d) 归一化占比 %。 */
export function computeContributions(bundles: FactorAlphaBundle[]): Map<string, number> {
  const pos = bundles.map((b) => ({ id: b.featureId, a: Math.max(0, b.primary?.alpha ?? 0) }));
  const total = pos.reduce((s, x) => s + x.a, 0);
  const out = new Map<string, number>();
  for (const x of pos) out.set(x.id, total > 0 ? r1((x.a / total) * 100) : 0);
  return out;
}
