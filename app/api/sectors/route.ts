import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const scores = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 }, sector: { not: null } },
    select: {
      symbol: true, name: true, nameZh: true, sector: true, market: true,
      totalScore: true, technicalScore: true, fundamentalScore: true, riskScore: true,
      recommendation: true, return5d: true, return20d: true, return60d: true,
      rsi14: true, latestClose: true,
    },
  });

  // Enrich top-3 stocks with nameEn from Stock table
  const allSymbols = scores.map((s) => s.symbol);
  const stocksWithNameEn = await prisma.stock.findMany({
    where: { symbol: { in: allSymbols } },
    select: { symbol: true, nameEn: true },
  });
  const sectorNameEnMap = new Map(stocksWithNameEn.map((s) => [s.symbol, s.nameEn ?? null]));

  // Group by sector
  const sectorMap = new Map<string, typeof scores>();
  for (const s of scores) {
    const sec = s.sector ?? "その他";
    if (!sectorMap.has(sec)) sectorMap.set(sec, []);
    sectorMap.get(sec)!.push(s);
  }

  const sectorStats = Array.from(sectorMap.entries()).map(([sector, stocks]) => {
    const n = stocks.length;
    const avg = (arr: (number | null)[]) => {
      const valid = arr.filter((v): v is number => v != null);
      return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
    };
    const avgF = (arr: (number | null)[], dp = 2) => {
      const valid = arr.filter((v): v is number => v != null);
      return valid.length
        ? parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(dp))
        : null;
    };

    const buyCount    = stocks.filter((s) => s.recommendation === "STRONG_BUY" || s.recommendation === "BUY").length;
    const watchCount  = stocks.filter((s) => s.recommendation === "WATCH").length;
    const avoidCount  = stocks.filter((s) => s.recommendation === "AVOID" || s.recommendation === "HOLD").length;

    const top3 = [...stocks]
      .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
      .slice(0, 3)
      .map((s) => ({ symbol: s.symbol, name: s.name, nameZh: s.nameZh ?? null, nameEn: sectorNameEnMap.get(s.symbol) ?? null, totalScore: s.totalScore, recommendation: s.recommendation }));

    return {
      sector,
      count: n,
      avgTotalScore:      avg(stocks.map((s) => s.totalScore)),
      avgTechnicalScore:  avg(stocks.map((s) => s.technicalScore)),
      avgFundamentalScore: avg(stocks.map((s) => s.fundamentalScore)),
      avgRiskScore:       avg(stocks.map((s) => s.riskScore)),
      avgReturn5d:        avgF(stocks.map((s) => s.return5d)),
      avgReturn20d:       avgF(stocks.map((s) => s.return20d)),
      avgReturn60d:       avgF(stocks.map((s) => s.return60d)),
      buyCount,
      watchCount,
      avoidCount,
      buyRate: Math.round((buyCount / n) * 100),
      top3,
    };
  });

  // Sort by avgTotalScore descending
  sectorStats.sort((a, b) => (b.avgTotalScore ?? 0) - (a.avgTotalScore ?? 0));

  return NextResponse.json({
    totalScored: scores.length,
    sectors: sectorStats,
    computedAt: new Date().toISOString(),
  });
}
