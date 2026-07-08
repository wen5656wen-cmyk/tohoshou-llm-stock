// ── TOHOSHOU AI · Feature Promotion Registry（P6-T8）───────────────────────
// 把 Feature Catalog 与注入的真实统计结合，产出每因子晋升评估 + 汇总。
// **纯派生 · 不落库 · 不改任何 Feature 状态 · 不影响任何评分。**
// 真实统计由 API 从 AlphaFactorReport / AlphaFactor / AlphaBacktestResult 读出后注入。

import { getAllFeatures } from "../registry";
import { evaluatePromotion } from "./engine";
import {
  type FeaturePromotion, type PromotionRawInput, type PromotionSummary,
} from "./types";

/**
 * 全部 Feature 的晋升视图。
 * @param inputs feature id → 真实统计（缺省则 pending）。
 */
export function buildFeaturePromotions(inputs?: Map<string, PromotionRawInput>): FeaturePromotion[] {
  return getAllFeatures().map((f) => {
    const raw = inputs?.get(f.id);
    return {
      id: f.id, name: f.name, category: f.category, source: f.source,
      status: f.status, version: f.version,
      eval: evaluatePromotion(raw, f.status),
    };
  });
}

/** 晋升汇总（KPI）。 */
export function summarizePromotions(
  rows: FeaturePromotion[],
  portfolioMaxDrawdown: number | null,
  asOf: string | null,
): PromotionSummary {
  const s: PromotionSummary = {
    totalFeatures: rows.length,
    production: 0, shadow: 0, disabled: 0,
    promoteCandidates: 0, keepShadow: 0, disableCandidates: 0,
    evaluatedShadow: 0, pendingShadow: 0,
    avgPromotionScore: null,
    portfolioMaxDrawdown, asOf,
  };
  const evaluatedScores: number[] = [];
  for (const r of rows) {
    if (r.status === "PRODUCTION") s.production++;
    else if (r.status === "SHADOW") s.shadow++;
    else if (r.status === "DISABLED") s.disabled++;

    // 候选统计仅针对非 PRODUCTION（有 recommendation 的行）
    if (r.eval.recommendation === "PROMOTE") s.promoteCandidates++;
    else if (r.eval.recommendation === "KEEP_SHADOW") s.keepShadow++;
    else if (r.eval.recommendation === "DISABLE") s.disableCandidates++;

    if (r.status === "SHADOW") {
      if (r.eval.pending) s.pendingShadow++;
      else {
        s.evaluatedShadow++;
        if (r.eval.metrics.promotionScore != null) evaluatedScores.push(r.eval.metrics.promotionScore);
      }
    }
  }
  if (evaluatedScores.length) {
    s.avgPromotionScore = Math.round((evaluatedScores.reduce((a, b) => a + b, 0) / evaluatedScores.length) * 10) / 10;
  }
  return s;
}
