import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllFeatures } from "@/lib/features";
import { FEATURE_TO_ALPHA_COLUMN, ALPHA_COVERAGE_COLUMNS } from "@/lib/features/promotion";
import {
  buildBundle, evaluatePromotionV2, computeContributions,
  FACTOR_ALPHA_HORIZONS, PRIMARY_HORIZON,
  type FactorAlphaRow, type FactorAlphaBundle,
} from "@/lib/features/promotion/factor-alpha";
import {
  diagnoseShadow, PENDING_REASON_LABEL, type ShadowDiagInputs, type PendingReasonCode,
} from "@/lib/features/promotion/shadow-diagnostics";

export const dynamic = "force-dynamic";

// GET /api/admin/feature-promotion — Feature Promotion Engine V2（P6-T9）
// 因子级 Alpha（真实回测 FactorAlphaResult）+ Attribution + Confidence + Stability + Trend
// → Promotion Score V2 → Promote / Keep Shadow / Disable。对无回测的影子因子输出真实
// Pending Reason（Shadow Sample Completion）。**只读派生 · 不落库 · 不自动改任何 Feature
// 状态 · 不影响任何评分/推荐/组合/watchlist。**

export async function GET() {
  const features = getAllFeatures();
  const cutoff90 = new Date(Date.now() - 90 * 86400 * 1000);

  // 1) 因子级 alpha 真实回测（FactorAlphaResult）
  const rawRows = await prisma.factorAlphaResult.findMany();
  const byFeature = new Map<string, FactorAlphaRow[]>();
  for (const r of rawRows) {
    const arr = byFeature.get(r.featureId) ?? [];
    arr.push({
      featureId: r.featureId, horizon: r.horizon, alpha: r.alpha, avgReturn: r.avgReturn,
      benchReturn: r.benchReturn, hitRate: r.hitRate, rankIc: r.rankIc, cohortSize: r.cohortSize,
      sampleCount: r.sampleCount, asOfCount: r.asOfCount,
      asOfLatest: r.asOfLatest ? r.asOfLatest.toISOString().slice(0, 10) : null,
    });
    byFeature.set(r.featureId, arr);
  }
  const bundles = new Map<string, FactorAlphaBundle>();
  for (const [fid, rows] of byFeature) {
    const b = buildBundle(rows);
    if (b) bundles.set(fid, b);
  }
  // Attribution：跨已评估因子按正 10d alpha 归一
  const contrib = computeContributions([...bundles.values()]);
  for (const [fid, b] of bundles) b.contribution = contrib.get(fid) ?? null;

  // 2) 覆盖率（latest AlphaFactor 各列非空占比）
  const latest = await prisma.alphaFactor.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const coverageByColumn = new Map<string, number>();
  let coverageAsOf: string | null = null;
  if (latest) {
    coverageAsOf = latest.date.toISOString().slice(0, 10);
    const total = await prisma.alphaFactor.count({ where: { date: latest.date } });
    if (total > 0) {
      const counts = await Promise.all(ALPHA_COVERAGE_COLUMNS.map((col) =>
        prisma.alphaFactor.count({ where: { date: latest.date, [col]: { not: null } } as Record<string, unknown> })));
      ALPHA_COVERAGE_COLUMNS.forEach((col, i) => coverageByColumn.set(col, Math.round((counts[i] / total) * 1000) / 10));
    }
  }

  // 3) Shadow 诊断的上游实测覆盖率
  const [aiEnabled, finStocks, instDates, tdnetN] = await Promise.all([
    prisma.stock.count({ where: { aiEnabled: true } }),
    prisma.financial.findMany({ distinct: ["stockId"], select: { stockId: true } }),
    prisma.institutionalFlow.findMany({ distinct: ["date"], select: { date: true } }),
    prisma.disclosure.count({ where: { publishedAt: { gte: cutoff90 } } }),
  ]);
  const diagInputs: ShadowDiagInputs = {
    financialCoverage: aiEnabled > 0 ? Math.min(100, Math.round((finStocks.length / aiEnabled) * 1000) / 10) : null,
    instWeeks: instDates.length,
    tdnetTriggerCount: tdnetN,
    shortSellCoverage: null, // ShortSellingRatio 为市场级（无 per-symbol）
  };

  // 4) 组装每因子 V2 视图
  const rows = features.map((f) => {
    const bundle = bundles.get(f.id) ?? null;
    const cov = FEATURE_TO_ALPHA_COLUMN[f.id] != null ? coverageByColumn.get(FEATURE_TO_ALPHA_COLUMN[f.id]) ?? null : null;

    if (bundle) {
      const ev = evaluatePromotionV2(bundle, cov, f.status);
      const primary = bundle.primary;
      return {
        id: f.id, name: f.name, category: f.category, source: f.source, status: f.status, version: f.version,
        promotionScore: ev.promotionScore, learningScore: ev.learningScore, rating: ev.rating, ratingLabel: ev.ratingLabel,
        recommendation: ev.recommendation, confidence: ev.confidence, contribution: bundle.contribution,
        stability: ev.stability, trend: ev.trend, coverage: cov,
        pending: false, pendingReason: null, pendingReasonCode: null,
        reason: ev.reason, factorAlpha: bundle,
        primaryAlpha: primary?.alpha ?? null, primaryHitRate: primary?.hitRate ?? null, meanRankIc: bundle.meanRankIc,
      };
    }

    // 无因子回测
    if (f.status === "PRODUCTION") {
      return {
        id: f.id, name: f.name, category: f.category, source: f.source, status: f.status, version: f.version,
        promotionScore: null, learningScore: null, rating: 5 as const, ratingLabel: "Ready for Production",
        recommendation: null, confidence: "HIGH" as const, contribution: null, stability: null, trend: null, coverage: cov,
        pending: false, pendingReason: null, pendingReasonCode: null,
        reason: "已在生产 · 参考基线（无因子 alpha 回测）", factorAlpha: null,
        primaryAlpha: null, primaryHitRate: null, meanRankIc: null,
      };
    }

    // SHADOW / DISABLED 无回测 → Shadow Sample Completion 诊断
    const diag = diagnoseShadow(f, diagInputs);
    return {
      id: f.id, name: f.name, category: f.category, source: f.source, status: f.status, version: f.version,
      promotionScore: null, learningScore: null, rating: 3 as const, ratingLabel: "Observe",
      recommendation: "KEEP_SHADOW" as const, confidence: "LOW" as const, contribution: null, stability: null, trend: null,
      coverage: diag.coverage, pending: true, pendingReason: diag.pendingReason, pendingReasonCode: diag.pendingReasonCode,
      reason: diag.pendingReason, factorAlpha: null,
      primaryAlpha: null, primaryHitRate: null, meanRankIc: null,
    };
  });

  // 5) 分组 + 汇总
  const shadow = rows.filter((r) => r.status === "SHADOW");
  const disabled = rows.filter((r) => r.status === "DISABLED");
  const productionFeatures = rows.filter((r) => r.status === "PRODUCTION");
  const cand = [...shadow, ...disabled];

  const promotionCandidates = cand.filter((r) => r.recommendation === "PROMOTE")
    .sort((a, b) => (b.promotionScore ?? 0) - (a.promotionScore ?? 0));
  const keepShadow = cand.filter((r) => r.recommendation === "KEEP_SHADOW" && !r.pending)
    .sort((a, b) => (b.promotionScore ?? 0) - (a.promotionScore ?? 0));
  const disabledCandidates = cand.filter((r) => r.recommendation === "DISABLE")
    .sort((a, b) => (a.promotionScore ?? 999) - (b.promotionScore ?? 999));
  const pendingFeatures = cand.filter((r) => r.pending);

  const evalShadowScores = shadow.filter((r) => !r.pending && r.promotionScore != null).map((r) => r.promotionScore as number);
  const pendingByReason: Record<string, number> = {};
  for (const r of pendingFeatures) {
    const code = (r.pendingReasonCode ?? "BACKTEST_DISABLED") as PendingReasonCode;
    pendingByReason[code] = (pendingByReason[code] ?? 0) + 1;
  }
  const topContributor = [...bundles.values()]
    .filter((b) => b.contribution != null && b.contribution > 0)
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
    asOf: coverageAsOf ?? [...bundles.values()][0]?.asOfLatest ?? null,
    asOfCount: [...bundles.values()][0]?.asOfCount ?? null,
    horizons: FACTOR_ALPHA_HORIZONS,
    primaryHorizon: PRIMARY_HORIZON,
    diagInputs,
  };

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
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
