import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/scoring-v3/shadow?limit=500 — V3 Shadow 评分 + 今日动态权重 + V2 对比。只读。
export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 500), 3000);

  const latest = await prisma.adaptiveScoreV3Shadow.findFirst({ orderBy: { date: "desc" }, select: { date: true, weightsJson: true, regime: true, computedAt: true } });
  if (!latest) return NextResponse.json({ date: null, rows: [], weights: null, note: "尚无 V3 Shadow 数据，请运行 compute-score-v3-shadow" });

  const all = await prisma.adaptiveScoreV3Shadow.findMany({
    where: { date: latest.date },
    orderBy: { rank: "asc" },
    select: { symbol: true, scoreV3: true, rawScore: true, riskAdjustment: true, rank: true, percentile: true, rating: true, confidence: true, qualityScore: true, calibrated: true, factorBreakdownJson: true, explanation: true },
  });

  // 评级分布 + 各维度覆盖率（数据质量）
  const dist: Record<string, number> = {};
  const dims = ["technical", "fundamental", "alpha", "news", "flow"] as const;
  const cov: Record<string, number> = { technical: 0, fundamental: 0, alpha: 0, news: 0, flow: 0 };
  for (const r of all) {
    dist[r.rating] = (dist[r.rating] ?? 0) + 1;
    const sub = (r.factorBreakdownJson as any)?.subScores ?? {};
    for (const d of dims) if (sub[d] != null) cov[d]++;
  }
  const dimCoverage = Object.fromEntries(dims.map((d) => [d, all.length ? Math.round((cov[d] / all.length) * 1000) / 10 : 0]));

  // V2 对比（StockScore）
  const top = all.slice(0, limit);
  const syms = top.map((r) => r.symbol);
  const v2 = await prisma.stockScore.findMany({ where: { symbol: { in: syms } }, select: { symbol: true, name: true, nameZh: true, adaptiveScore: true, percentileRank: true, recommendationV2: true } });
  const v2Map = new Map(v2.map((s) => [s.symbol, s]));

  const rows = top.map((r) => {
    const s = v2Map.get(r.symbol);
    const bd = r.factorBreakdownJson as any;
    return {
      symbol: r.symbol, name: s?.name ?? r.symbol, nameZh: s?.nameZh ?? null,
      scoreV3: r.scoreV3, rawScore: r.rawScore, riskAdjustment: r.riskAdjustment, rank: r.rank, percentile: r.percentile, rating: r.rating,
      confidence: r.confidence, qualityScore: r.qualityScore, calibrated: r.calibrated,
      subScores: bd?.subScores ?? null, contributions: bd?.contributions ?? null, effectiveWeights: bd?.effectiveWeights ?? null,
      explanation: r.explanation,
      v2AdaptiveScore: s?.adaptiveScore ?? null, v2PercentileRank: s?.percentileRank ?? null, v2Rec: s?.recommendationV2 ?? null,
    };
  });

  return NextResponse.json({
    date: latest.date.toISOString().slice(0, 10),
    computedAt: latest.computedAt.toISOString(),
    regime: latest.regime,
    weights: latest.weightsJson,
    total: all.length,
    ratingDist: dist,
    dimCoverage,
    rows,
  });
}
