import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildFeaturePromotions, summarizePromotions,
  FEATURE_TO_ALPHA_FACTOR, FEATURE_TO_ALPHA_COLUMN, ALPHA_COVERAGE_COLUMNS,
  type PromotionRawInput, type FeaturePromotion,
} from "@/lib/features/promotion";

export const dynamic = "force-dynamic";

// GET /api/admin/feature-promotion — Feature Promotion Engine V1（P6-T8）
// 对 SHADOW 因子做统一量化评估 → Promote / Keep Shadow / Disable 建议 + 1-5 星。
// READ-ONLY：只读 AlphaFactorReport / AlphaFactor / AlphaBacktestResult 派生建议，
// **不落库 · 不自动改任何 Feature 状态 · 不影响任何评分/推荐/组合/watchlist。**

const PERIOD_PRIORITY = [90, 30, 180, 7];

type ReportRow = {
  period: number; factor: string; sampleCount: number;
  winRate: number | null; meanExcess: number | null; sharpe: number | null;
  meanFwdRet20: number | null; asOfLatest: Date | null;
};

/** 选主报告：优先 90d，其次 30/180/7d。 */
function pickPrimary(rows: ReportRow[]): ReportRow | null {
  for (const p of PERIOD_PRIORITY) {
    const r = rows.find((x) => x.period === p);
    if (r) return r;
  }
  return rows[0] ?? null;
}

/** 跨周期一致性 %：meanExcess>0 且 winRate≥50 的周期占比（周期数据齐全者）。 */
function consistencyPct(rows: ReportRow[]): number | null {
  const usable = rows.filter((r) => r.meanExcess != null && r.winRate != null);
  if (!usable.length) return null;
  const pass = usable.filter((r) => (r.meanExcess as number) > 0 && (r.winRate as number) >= 50).length;
  return Math.round((pass / usable.length) * 1000) / 10;
}

export async function GET() {
  // 1) Alpha 因子有效性报告（所有周期，仅取有映射的因子族）
  const reportRows = (await prisma.alphaFactorReport.findMany({
    select: {
      period: true, factor: true, sampleCount: true,
      winRate: true, meanExcess: true, sharpe: true, meanFwdRet20: true, asOfLatest: true,
    },
  })) as ReportRow[];

  const byFactor = new Map<string, ReportRow[]>();
  for (const r of reportRows) {
    const arr = byFactor.get(r.factor) ?? [];
    arr.push(r);
    byFactor.set(r.factor, arr);
  }

  // 2) 覆盖率：latest AlphaFactor 日各列非空占比
  const latest = await prisma.alphaFactor.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const coverageByColumn = new Map<string, number>();
  let coverageAsOf: string | null = null;
  if (latest) {
    coverageAsOf = latest.date.toISOString().slice(0, 10);
    const total = await prisma.alphaFactor.count({ where: { date: latest.date } });
    if (total > 0) {
      const counts = await Promise.all(
        ALPHA_COVERAGE_COLUMNS.map((col) =>
          prisma.alphaFactor.count({
            where: { date: latest.date, [col]: { not: null } } as Record<string, unknown>,
          }),
        ),
      );
      ALPHA_COVERAGE_COLUMNS.forEach((col, i) => {
        coverageByColumn.set(col, Math.round((counts[i] / total) * 1000) / 10);
      });
    }
  }

  // 3) 组合级最大回撤（AlphaBacktestResult ALPHA 代表配置 90d/top20/hold10）
  const alphaBt = await prisma.alphaBacktestResult.findFirst({
    where: { strategy: "ALPHA", period: 90, topN: 20, holdDays: 10 },
    select: { maxDrawdown: true, asOfLatest: true },
  });
  const portfolioMaxDrawdown = alphaBt?.maxDrawdown ?? null;

  // 4) 组装每因子真实统计输入（仅有 Alpha 报告映射的 SHADOW/PRODUCTION 技术因子）
  const inputs = new Map<string, PromotionRawInput>();
  for (const [fid, factorName] of Object.entries(FEATURE_TO_ALPHA_FACTOR)) {
    const rows = byFactor.get(factorName);
    if (!rows || !rows.length) continue;
    const primary = pickPrimary(rows);
    if (!primary) continue;
    const col = FEATURE_TO_ALPHA_COLUMN[fid];
    const coverage = col != null ? coverageByColumn.get(col) ?? null : null;
    inputs.set(fid, {
      hitRate: primary.winRate,
      winRate: primary.winRate,
      alpha: primary.meanExcess,
      sharpeRatio: primary.sharpe,
      maxDrawdown: null, // 因子级无逐笔回撤，组合级见 summary.portfolioMaxDrawdown
      coverage,
      consistency: consistencyPct(rows),
      sampleCount: primary.sampleCount,
    });
  }

  // 5) 派生晋升视图 + 汇总
  const asOf = coverageAsOf ?? (alphaBt?.asOfLatest ? alphaBt.asOfLatest.toISOString().slice(0, 10) : null);
  const rows = buildFeaturePromotions(inputs);
  const summary = summarizePromotions(rows, portfolioMaxDrawdown, asOf);

  // 6) 分组（页面分区）
  const shadow = rows.filter((r) => r.status === "SHADOW");
  const disabled = rows.filter((r) => r.status === "DISABLED");
  const productionFeatures = rows.filter((r) => r.status === "PRODUCTION");

  const isRec = (r: FeaturePromotion, rec: string) => r.eval.recommendation === rec;
  const promotionCandidates = shadow.filter((r) => isRec(r, "PROMOTE"))
    .sort((a, b) => (b.eval.metrics.promotionScore ?? 0) - (a.eval.metrics.promotionScore ?? 0));
  const keepShadow = [...shadow, ...disabled].filter((r) => isRec(r, "KEEP_SHADOW"))
    .sort((a, b) => (b.eval.metrics.promotionScore ?? -1) - (a.eval.metrics.promotionScore ?? -1));
  const disabledCandidates = [...shadow, ...disabled].filter((r) => isRec(r, "DISABLE"))
    .sort((a, b) => (a.eval.metrics.promotionScore ?? 999) - (b.eval.metrics.promotionScore ?? 999));

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    note: "Feature Promotion Engine V1 · 只读建议 · 不自动改状态 · 不影响评分",
    summary,
    productionFeatures,
    shadowFeatures: shadow,
    promotionCandidates,
    keepShadow,
    disabledCandidates,
    features: rows,
  });
}
