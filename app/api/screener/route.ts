import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMarketTemperature } from "@/lib/market-temperature";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const market     = searchParams.get("market") ?? "";
  const sector     = searchParams.get("sector") ?? "";
  const rec        = searchParams.get("recommendation") ?? "";
  const recV2      = searchParams.get("recommendationV2") ?? "";
  const style      = searchParams.get("style") ?? "";
  const minScore   = parseInt(searchParams.get("minScore") ?? "0") || 0;
  const q          = (searchParams.get("q") ?? "").trim();
  const rawLimit   = parseInt(searchParams.get("limit") ?? "50") || 50;
  const limit      = q ? Math.min(500, rawLimit > 50 ? rawLimit : 500) : Math.min(200, rawLimit);
  const sortBy     = searchParams.get("sort") ?? "adaptiveScore";
  const highRisk   = searchParams.get("highRisk");

  const where: Record<string, unknown> = {
    priceCount: { gte: 20 },
    adaptiveScore: { not: null },
  };
  if (market) where.market = { contains: market };
  if (sector) where.sector = { contains: sector };
  if (rec)    where.recommendation = rec;
  if (recV2)  where.recommendationV2 = recV2;
  if (style)  where.stockStyle = style;
  if (highRisk === "true")  where.highRiskFlag = true;
  if (highRisk === "false") where.highRiskFlag = false;
  if (minScore > 0) where.adaptiveScore = { gte: minScore };

  // Server-side full-text search across symbol / Japanese name / Chinese name / sector / English name
  if (q) {
    // Pre-fetch Stock.nameEn matches (English company name, e.g. "SoftBank")
    const nameEnMatches = await prisma.stock.findMany({
      where: { nameEn: { contains: q, mode: "insensitive" } },
      select: { symbol: true },
    });
    const nameEnSymbols = nameEnMatches.map((s) => s.symbol);

    const orConditions: Record<string, unknown>[] = [
      { symbol:  { contains: q, mode: "insensitive" } },  // "8001" matches "8001.T"
      { name:    { contains: q, mode: "insensitive" } },  // Japanese name
      { nameZh:  { contains: q } },                        // Chinese name
      { sector:  { contains: q, mode: "insensitive" } },
      { industry:{ contains: q, mode: "insensitive" } },
    ];
    if (nameEnSymbols.length > 0) {
      orConditions.push({ symbol: { in: nameEnSymbols } }); // English name → symbol
    }
    where.OR = orConditions;
  }

  const orderBy: Record<string, string> =
    sortBy === "opportunityScore" ? { opportunityScore: "desc" } :
    sortBy === "totalScore"       ? { totalScore: "desc" } :
    sortBy === "percentileRank"   ? { percentileRank: "asc" } :
                                    { adaptiveScore: "desc" };

  const [countSB, countB, countH, countW, countAv, totalScored, scores, lastScore] = await Promise.all([
    prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "HOLD", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "WATCH", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "AVOID", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } } }),
    prisma.stockScore.findMany({
      where,
      orderBy,
      take: limit,
      select: {
        symbol: true, name: true, nameZh: true, market: true, sector: true, industry: true,
        latestDate: true, latestClose: true, return5d: true, return20d: true,
        rsi14: true, maTrend: true, macdSignalLabel: true,
        technicalScore: true, fundamentalScore: true, moneyFlowScore: true,
        newsSentimentScore: true, globalTrendScore: true,
        totalScore: true, recommendation: true, summaryReason: true,
        scoreSource: true,
        // V7.5
        rawScore: true, adaptiveScore: true, stockStyle: true,
        highRiskFlag: true, fxSensitivity: true, catalystScore: true,
        // V7.7
        percentileRank: true, marketRank: true,
        recommendationV2: true, recommendationReason: true,
        opportunityScore: true, opportunityRank: true, opportunityLabel: true,
      },
    }),
    prisma.stockScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
  ]);

  const marketTemperature = computeMarketTemperature(countSB, countB, totalScored);

  return NextResponse.json({
    stats: {
      total: totalScored,
      strongBuy: countSB, buy: countB, hold: countH, watch: countW, avoid: countAv,
      bullCount: countSB + countB,
      bullRate: totalScored > 0 ? Math.round((countSB + countB) / totalScored * 1000) / 10 : 0,
      marketTemperature,
      lastComputedAt: lastScore?.computedAt ?? null,
    },
    scores,
    meta: { limit, sortBy, filters: { market, sector, rec, recV2, style, minScore, highRisk } },
  });
}
