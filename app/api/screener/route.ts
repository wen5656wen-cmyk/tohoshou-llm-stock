import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get("market") ?? "";
  const sector = searchParams.get("sector") ?? "";
  const rec    = searchParams.get("recommendation") ?? "";
  const minScore = parseInt(searchParams.get("minScore") ?? "0") || 0;
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "50") || 50);

  // Build where clause for scores
  const where: Record<string, unknown> = {
    totalScore: { not: null },
    priceCount: { gte: 20 },
  };
  if (market) where.market = { contains: market };
  if (sector) where.sector = { contains: sector };
  if (rec)    where.recommendation = rec;
  if (minScore > 0) where.totalScore = { gte: minScore };

  const [
    totalStocks,
    scoredStocks,
    buyRecommended,
    watchCount,
    scores,
    lastScore,
    primeCount,
    stdCount,
    growthCount,
  ] = await Promise.all([
    prisma.stock.count(),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 } } }),
    prisma.stockScore.count({
      where: { recommendation: { in: ["STRONG_BUY", "BUY"] }, priceCount: { gte: 20 } },
    }),
    prisma.stockScore.count({
      where: { recommendation: "WATCH", priceCount: { gte: 20 } },
    }),
    prisma.stockScore.findMany({
      where,
      orderBy: { totalScore: "desc" },
      take: limit,
      select: {
        symbol: true, name: true, market: true, sector: true, industry: true, scaleCategory: true,
        computedAt: true, priceCount: true, latestDate: true, latestClose: true,
        return5d: true, return20d: true, return60d: true,
        rsi14: true, macd: true, macdHist: true, maTrend: true, macdSignalLabel: true,
        technicalScore: true, fundamentalScore: true, riskScore: true, totalScore: true,
        recommendation: true, starsLabel: true, summaryReason: true,
      },
    }),
    prisma.stockScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.stockScore.count({ where: { market: { contains: "プライム" }, priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { market: { contains: "スタンダード" }, priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { market: { contains: "グロース" }, priceCount: { gte: 20 } } }),
  ]);

  return NextResponse.json({
    stats: {
      totalStocks,
      scoredStocks,
      buyRecommended,
      watchCount,
      lastComputedAt: lastScore?.computedAt ?? null,
      byMarket: {
        prime:    primeCount,
        standard: stdCount,
        growth:   growthCount,
      },
    },
    scores,
    meta: { limit, filters: { market, sector, rec, minScore } },
  });
}
