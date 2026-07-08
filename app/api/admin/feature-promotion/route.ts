import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FACTOR_ALPHA_HORIZONS, PRIMARY_HORIZON } from "@/lib/features/promotion/factor-alpha";
import { PENDING_REASON_LABEL, type PendingReasonCode } from "@/lib/features/promotion/shadow-diagnostics";
import { loadEvaluateDeps, evaluateFeatures, type EvaluatedFeature } from "@/lib/features/platform";

export const dynamic = "force-dynamic";

// GET /api/admin/feature-promotion — Feature Promotion Engine V2（P6-T9 · P6-T10 统一评估）
// 因子级 Alpha（真实回测）+ Attribution + Confidence + Trend → Promote / Keep Shadow /
// Disable；无回测影子输出真实 Pending Reason。**只读派生 · 不落库 · 不自动改任何状态 ·
// 不影响任何评分/推荐。** 评估逻辑与 Platform Report 共用 lib/features/platform（单一来源）。

export async function GET() {
  const now = Date.now();
  const { deps, meta } = await loadEvaluateDeps(prisma, now);
  const { rows, bundles } = evaluateFeatures(deps);

  const shadow = rows.filter((r) => r.status === "SHADOW");
  const disabled = rows.filter((r) => r.status === "DISABLED");
  const productionFeatures = rows.filter((r) => r.status === "PRODUCTION");
  const cand = [...shadow, ...disabled];
  const isRec = (r: EvaluatedFeature, rec: string) => r.recommendation === rec;

  const promotionCandidates = cand.filter((r) => isRec(r, "PROMOTE")).sort((a, b) => (b.promotionScore ?? 0) - (a.promotionScore ?? 0));
  const keepShadow = cand.filter((r) => isRec(r, "KEEP_SHADOW") && !r.pending).sort((a, b) => (b.promotionScore ?? 0) - (a.promotionScore ?? 0));
  const disabledCandidates = cand.filter((r) => isRec(r, "DISABLE")).sort((a, b) => (a.promotionScore ?? 999) - (b.promotionScore ?? 999));
  const pendingFeatures = cand.filter((r) => r.pending);

  const evalShadowScores = shadow.filter((r) => !r.pending && r.promotionScore != null).map((r) => r.promotionScore as number);
  const pendingByReason: Record<string, number> = {};
  for (const r of pendingFeatures) {
    const code = (r.pendingReasonCode ?? "BACKTEST_DISABLED") as PendingReasonCode;
    pendingByReason[code] = (pendingByReason[code] ?? 0) + 1;
  }
  const topContributor = [...bundles.values()].filter((b) => b.contribution != null && b.contribution > 0)
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0))[0];

  const summary = {
    totalFeatures: rows.length,
    production: productionFeatures.length,
    shadow: shadow.length,
    disabled: disabled.length,
    evaluated: rows.filter((r) => r.factorAlpha != null).length,
    evaluatedShadow: shadow.filter((r) => !r.pending).length,
    pending: pendingFeatures.length,
    promoteCandidates: promotionCandidates.length,
    keepShadow: keepShadow.length,
    disableCandidates: disabledCandidates.length,
    avgPromotionScore: evalShadowScores.length ? Math.round((evalShadowScores.reduce((a, b) => a + b, 0) / evalShadowScores.length) * 10) / 10 : null,
    topContributor: topContributor ? { id: topContributor.featureId, contribution: topContributor.contribution } : null,
    pendingByReason,
    asOf: meta.coverageAsOf ?? [...bundles.values()][0]?.asOfLatest ?? null,
    asOfCount: [...bundles.values()][0]?.asOfCount ?? null,
    horizons: FACTOR_ALPHA_HORIZONS,
    primaryHorizon: PRIMARY_HORIZON,
    diagInputs: deps.diagInputs,
    factorAlphaComputedAt: meta.factorAlphaComputedAt,
    factorAlphaAgeDays: meta.factorAlphaAgeDays,
  };

  return NextResponse.json({
    ok: true,
    generatedAt: new Date(now).toISOString(),
    engine: "Promotion Engine V2 · Factor Alpha (vs equal-weight universe)",
    note: "只读建议 · 不自动改状态 · 不影响评分。benchmark=等权宇宙（TOPIX 点位序列 2026-03-30 有量纲断裂，不用作跨期基准）",
    reasonLabels: PENDING_REASON_LABEL,
    summary,
    productionFeatures,
    shadowFeatures: shadow,
    promotionCandidates,
    keepShadow,
    disabledCandidates,
    pendingFeatures,
    features: rows,
  });
}
