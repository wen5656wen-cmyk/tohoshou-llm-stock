// ── TOHOSHOU AI · Feature Validation Engine 类型（P6-T5）────────────────────
// Feature Validation Engine V1：Registry → Shadow → Validation → Learning → Production
// 全流程验证框架。**只读派生、不落库、不影响任何正式评分。** 本阶段仅建框架，
// 不根据当前数据实际淘汰/提升任何 Feature（PROMOTE/REMOVE 仅为建议状态，待样本成熟）。

export type ValidationStage = "Registry" | "Shadow" | "Validation" | "Learning" | "Production";
export type ValidationConfidence = "LOW" | "MEDIUM" | "HIGH";
export type ValidationRecommendation = "KEEP" | "WATCH" | "REMOVE" | "PROMOTE";

/** 单位约定（避免歧义）：coverage/hitRate/winRate 均为百分数 0-100；alpha/avgReturn 为 %（可负）。 */
export interface ValidationInput {
  coverage: number | null;          // 覆盖率 %（0-100）
  sampleSize: number | null;        // 样本数
  hitRate: number | null;           // 命中率 %（0-100）
  avgReturn: number | null;         // 平均收益 %
  alpha: number | null;             // 超额收益 %（vs 基准）
  winRate: number | null;           // 胜率 %（0-100）
  informationGain?: number | null;  // 信息增益（预留，可空）
}

/** 验证结果（含派生的 stage/score/recommendation）。 */
export interface ValidationResult {
  coverage: number | null;
  sampleSize: number | null;
  hitRate: number | null;
  avgReturn: number | null;
  alpha: number | null;
  winRate: number | null;
  informationGain: number | null;
  confidence: ValidationConfidence;
  stage: ValidationStage;
  recommendation: ValidationRecommendation;
  validationScore: number | null;   // 0-100 派生分（pending=null）
  validationUpdatedAt: string | null; // 只读派生，无持久化 → null（pending）
  pending: boolean;                  // true = 数据不足，未做实质判定（不淘汰/不提升）
  reasons: string[];
}

/** 验证规则阈值（默认，可调）。 */
export const VALIDATION_RULES = {
  minCoveragePct: 20,   // Coverage < 20% → WATCH
  minSample: 30,        // Sample < 30 → LOW + WATCH（样本不足不判定）
  keepHitRate: 60,      // HitRate > 60 且 Alpha > 0 → KEEP
  promoteHitRate: 70,   // HitRate > 70 且 Alpha > 5 → PROMOTE
  promoteAlpha: 5,
  removeHitRate: 45,    // HitRate < 45 且 Alpha < 0 → REMOVE
  confMediumSample: 30, // ≥30 → MEDIUM
  confHighSample: 100,  // ≥100 → HIGH
} as const;

/** Feature（登记元数据）+ 其验证结果。 */
export interface FeatureValidation {
  id: string;
  name: string;
  category: string;
  source: string;
  status: string;        // PRODUCTION | SHADOW | DISABLED
  version: string;
  validation: ValidationResult;
}

/** 验证汇总（供 KPI）。 */
export interface ValidationSummary {
  total: number;
  keep: number;
  watch: number;
  remove: number;
  promote: number;
  pending: number;      // 数据不足（多数 shadow 因子当前状态）
  byStage: Record<ValidationStage, number>;
}
