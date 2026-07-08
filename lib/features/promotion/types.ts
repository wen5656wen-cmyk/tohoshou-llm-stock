// ── TOHOSHOU AI · Feature Promotion Engine 类型（P6-T8）─────────────────────
// Feature Promotion Engine V1：对 SHADOW 因子做统一量化评估，给出
// Promote / Keep Shadow / Disable 建议 + 1-5 星 rating。
// **只读派生 · 不落库 · 不自动改任何 Feature 状态 · 不影响任何正式评分/推荐。**
// 本轮只产出「建议」，绝不自动写 Production、不自动启用/禁用任何因子。

/** 晋升建议（仅 3 值；PRODUCTION 参考基线 recommendation=null，不作为候选）。 */
export type PromotionRecommendation = "PROMOTE" | "KEEP_SHADOW" | "DISABLE";

/** 星级评分 1-5。 */
export type PromotionStars = 1 | 2 | 3 | 4 | 5;

/** 星级语义标签（英文，展示层做多语言）。 */
export const RATING_LABEL: Record<PromotionStars, string> = {
  5: "Ready for Production",
  4: "Need More Samples",
  3: "Observe",
  2: "Weak",
  1: "Disable",
};

/**
 * 单位约定：hitRate/winRate/coverage/consistency 均为百分数 0-100；
 * alpha 为超额收益 %（vs TOPIX，可负）；sharpeRatio 无量纲；maxDrawdown 为 %（负或 0）。
 */
export interface PromotionRawInput {
  hitRate: number | null;      // 方向命中率 %（前向收益 > 0 占比）
  winRate: number | null;      // 胜率 %（因子报告粒度与 hitRate 同源）
  alpha: number | null;        // 超额收益 %（meanExcess vs TOPIX）
  sharpeRatio: number | null;  // 夏普比率
  maxDrawdown: number | null;  // 最大回撤 %（因子级通常无 → null；组合级见 summary）
  coverage: number | null;     // 覆盖率 %（有该因子有效值的股票占比）
  consistency: number | null;  // 跨周期一致性 %（多周期同向达标占比）
  sampleCount: number | null;  // 样本数
}

/** 派生后的完整指标（含 learningScore / promotionScore）。 */
export interface PromotionMetrics extends PromotionRawInput {
  learningScore: number | null;   // 0-100 学习成熟度/质量派生分
  promotionScore: number | null;  // 0-100 统一晋升分（核心指标缺失 → null）
}

/** 单个 Feature 的晋升评估结果。 */
export interface PromotionEval {
  metrics: PromotionMetrics;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  rating: PromotionStars;
  ratingLabel: string;
  recommendation: PromotionRecommendation | null; // PRODUCTION 参考基线 → null
  pending: boolean;               // true = 数据不足，未做实质判定
  reason: string;                 // 一句话结论（展示用）
  reasons: string[];              // 完整理由列表
}

/** Feature 元数据 + 晋升评估。 */
export interface FeaturePromotion {
  id: string;
  name: string;
  category: string;
  source: string;
  status: string;   // PRODUCTION | SHADOW | DISABLED
  version: string;
  eval: PromotionEval;
}

/** 晋升汇总（供 KPI）。 */
export interface PromotionSummary {
  totalFeatures: number;
  production: number;
  shadow: number;
  disabled: number;
  promoteCandidates: number;   // 建议 PROMOTE 的 shadow 数
  keepShadow: number;          // 建议 KEEP_SHADOW 的 shadow 数
  disableCandidates: number;   // 建议 DISABLE 的 shadow 数
  evaluatedShadow: number;     // 有真实统计的 shadow 数
  pendingShadow: number;       // 数据不足待观察的 shadow 数
  avgPromotionScore: number | null;    // 已评估 shadow 的均值
  portfolioMaxDrawdown: number | null; // 组合级最大回撤（AlphaBacktestResult ALPHA）
  asOf: string | null;                 // 数据锚点日期（ISO YYYY-MM-DD）
}

/** 晋升规则阈值（默认，可调；纯建议不落库）。 */
export const PROMOTION_RULES = {
  readySample: 100,     // 5 星（Ready）要求样本 ≥ 100（HIGH 置信）
  strongScore: 60,      // 综合分 ≥ 60 → 进入晋升轨道（4/5 星）
  observeScore: 40,     // 综合分 ≥ 40 → Observe（3 星）；否则 Weak（2 星）
  disableHitRate: 45,   // 命中率 < 45 且 Alpha < 0 → Disable（1 星）
  readyHitRate: 55,     // 5 星必须方向命中率 ≥ 55%（防止 period 级 Alpha 常数误推弱因子）
  promisingHitRate: 50, // 4 星（需更多样本）要求命中率 ≥ 50%
  weights: { hitRate: 0.35, alpha: 0.25, sharpe: 0.15, coverage: 0.10, consistency: 0.10, maturity: 0.05 },
} as const;
