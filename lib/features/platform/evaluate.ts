// ── TOHOSHOU AI · Feature 统一评估（P6-T10）─────────────────────────────────
// 把 Feature Registry + 注入的真实数据（FactorAlphaResult / 覆盖率 / 上游诊断）评估为
// 每因子完整行（含 Promotion V2 结果或 Pending 诊断）。**纯函数 · 只读 · 不落库 · 不
// 改任何评分/推荐。** Feature Promotion API 与 Platform Report 共用同一逻辑（单一来源）。

import type { Feature } from "../types";
import { FEATURE_TO_ALPHA_COLUMN } from "../promotion/factor-map";
import {
  buildBundle, evaluatePromotionV2, computeContributions,
  type FactorAlphaRow, type FactorAlphaBundle, type LearningTrend,
} from "../promotion/factor-alpha";
import { diagnoseShadow, type ShadowDiagInputs, type PendingReasonCode } from "../promotion/shadow-diagnostics";

/** 单因子评估行（Feature Promotion API 与 Platform Report 共用）。 */
export interface EvaluatedFeature {
  id: string; name: string; category: string; source: string; status: string; version: string;
  promotionScore: number | null; learningScore: number | null; rating: number; ratingLabel: string;
  recommendation: string | null; confidence: string; contribution: number | null;
  stability: number | null; trend: LearningTrend | null; coverage: number | null;
  pending: boolean; pendingReason: string | null; pendingReasonCode: PendingReasonCode | null;
  reason: string; factorAlpha: FactorAlphaBundle | null;
  primaryAlpha: number | null; primaryHitRate: number | null; meanRankIc: number | null;
}

export interface EvaluateDeps {
  features: Feature[];
  factorRowsByFeature: Map<string, FactorAlphaRow[]>;
  coverageByColumn: Map<string, number>;
  diagInputs: ShadowDiagInputs;
}

/** 全量评估 → 每因子行 + bundles（供归因/汇总复用）。 */
export function evaluateFeatures(deps: EvaluateDeps): { rows: EvaluatedFeature[]; bundles: Map<string, FactorAlphaBundle> } {
  const { features, factorRowsByFeature, coverageByColumn, diagInputs } = deps;

  const bundles = new Map<string, FactorAlphaBundle>();
  for (const [fid, rows] of factorRowsByFeature) {
    const b = buildBundle(rows);
    if (b) bundles.set(fid, b);
  }
  const contrib = computeContributions([...bundles.values()]);
  for (const [fid, b] of bundles) b.contribution = contrib.get(fid) ?? null;

  const rows = features.map<EvaluatedFeature>((f) => {
    const bundle = bundles.get(f.id) ?? null;
    const cov = FEATURE_TO_ALPHA_COLUMN[f.id] != null ? coverageByColumn.get(FEATURE_TO_ALPHA_COLUMN[f.id]) ?? null : null;

    if (bundle) {
      const ev = evaluatePromotionV2(bundle, cov, f.status);
      const p = bundle.primary;
      return {
        id: f.id, name: f.name, category: f.category, source: f.source, status: f.status, version: f.version,
        promotionScore: ev.promotionScore, learningScore: ev.learningScore, rating: ev.rating, ratingLabel: ev.ratingLabel,
        recommendation: ev.recommendation, confidence: ev.confidence, contribution: bundle.contribution,
        stability: ev.stability, trend: ev.trend, coverage: cov,
        pending: false, pendingReason: null, pendingReasonCode: null,
        reason: ev.reason, factorAlpha: bundle,
        primaryAlpha: p?.alpha ?? null, primaryHitRate: p?.hitRate ?? null, meanRankIc: bundle.meanRankIc,
      };
    }

    if (f.status === "PRODUCTION") {
      return {
        id: f.id, name: f.name, category: f.category, source: f.source, status: f.status, version: f.version,
        promotionScore: null, learningScore: null, rating: 5, ratingLabel: "Ready for Production",
        recommendation: null, confidence: "HIGH", contribution: null, stability: null, trend: null, coverage: cov,
        pending: false, pendingReason: null, pendingReasonCode: null,
        reason: "已在生产 · 参考基线（无因子 alpha 回测）", factorAlpha: null,
        primaryAlpha: null, primaryHitRate: null, meanRankIc: null,
      };
    }

    const diag = diagnoseShadow(f, diagInputs);
    return {
      id: f.id, name: f.name, category: f.category, source: f.source, status: f.status, version: f.version,
      promotionScore: null, learningScore: null, rating: 3, ratingLabel: "Observe",
      recommendation: "KEEP_SHADOW", confidence: "LOW", contribution: null, stability: null, trend: null,
      coverage: diag.coverage, pending: true, pendingReason: diag.pendingReason, pendingReasonCode: diag.pendingReasonCode,
      reason: diag.pendingReason, factorAlpha: null,
      primaryAlpha: null, primaryHitRate: null, meanRankIc: null,
    };
  });

  return { rows, bundles };
}
