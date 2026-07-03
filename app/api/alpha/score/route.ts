import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/alpha/score?limit=&q= — shadow AlphaScore ranking joined with the current
// AI Score (StockScore) and today's DailyRecommendation for side-by-side comparison.
// Read-only shadow layer; never affects production scoring.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(5000, parseInt(searchParams.get("limit") ?? "500") || 500);

  const latest = await prisma.alphaScore.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, computedAt: true },
  });
  if (!latest) {
    return NextResponse.json({ date: null, computedAt: null, total: 0, rows: [] });
  }

  const scores = await prisma.alphaScore.findMany({
    where: { date: latest.date },
    orderBy: { rank: "asc" },
    take: limit,
  });
  const symbols = scores.map((s) => s.symbol);

  // JST today for DailyRecommendation comparison.
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  const today = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));

  const [stocks, aiScores, drRows] = await Promise.all([
    prisma.stock.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, name: true, nameZh: true, sector: true } }),
    prisma.stockScore.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, adaptiveScore: true, percentileRank: true, recommendationV2: true } }),
    prisma.dailyRecommendation.findMany({ where: { date: today, symbol: { in: symbols } }, select: { symbol: true, gptRank: true, recommendation: true } }),
  ]);
  const nameMap = new Map(stocks.map((s) => [s.symbol, s]));
  const aiMap = new Map(aiScores.map((s) => [s.symbol, s]));
  const drMap = new Map(drRows.map((s) => [s.symbol, s]));

  let rows = scores.map((s) => {
    const st = nameMap.get(s.symbol);
    const ai = aiMap.get(s.symbol);
    const dr = drMap.get(s.symbol);
    return {
      symbol: s.symbol,
      name: st?.name ?? s.symbol,
      nameZh: st?.nameZh ?? null,
      sector: st?.sector ?? null,
      alphaScore: s.alphaScore,
      composite: s.composite,
      rank: s.rank,
      percentile: s.percentile,
      factorBreakdown: s.factorBreakdown,
      aiAdaptiveScore: ai?.adaptiveScore ?? null,
      aiPercentile: ai?.percentileRank ?? null,
      aiRecommendationV2: ai?.recommendationV2 ?? null,
      drGptRank: dr?.gptRank ?? null,
      drRecommendation: dr?.recommendation ?? null,
    };
  });

  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter((r) => r.symbol.toLowerCase().includes(ql) || (r.name ?? "").toLowerCase().includes(ql) || (r.nameZh ?? "").includes(q));
  }

  // Weights meta (from any row's breakdown, else recompute-free derivation is skipped).
  const weights = (scores[0]?.factorBreakdown as Array<{ factor: string; direction: number; weight: number }> | null)?.map((b) => ({
    factor: b.factor, direction: b.direction, weight: b.weight,
  })) ?? [];

  return NextResponse.json({
    date: latest.date.toISOString().slice(0, 10),
    computedAt: latest.computedAt.toISOString(),
    total: rows.length,
    weights,
    rows,
  });
}
