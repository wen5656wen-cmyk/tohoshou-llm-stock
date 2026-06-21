import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMarketTemperature } from "@/lib/market-temperature";

export const dynamic = "force-dynamic";

function starsFromRec(rec: string | null): number {
  switch (rec) {
    case "STRONG_BUY": return 5;
    case "BUY":        return 4;
    case "HOLD":       return 3;
    case "WATCH":      return 2;
    default:           return 1;
  }
}

// Read from pre-computed StockScore — no real-time recomputation
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "top"; // top | opportunity | high_risk
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const style = searchParams.get("style"); // optional stockStyle filter

  const where = {
    priceCount: { gte: 20 },
    adaptiveScore: { not: null },
    ...(style ? { stockStyle: style } : {}),
  };

  // Determine sort order and filter by mode
  let orderBy: Record<string, string>;
  let modeFilter: Record<string, unknown> = {};

  if (mode === "opportunity") {
    orderBy = { opportunityScore: "desc" };
    modeFilter = { highRiskFlag: false };
  } else if (mode === "high_risk") {
    orderBy = { opportunityScore: "desc" };
    modeFilter = { highRiskFlag: true };
  } else if (mode === "tech") {
    orderBy = { adaptiveScore: "desc" };
    modeFilter = { stockStyle: { in: ["GROWTH_MOMENTUM", "SPECULATIVE_MOMENTUM", "QUALITY_COMPOUNDER"] } };
  } else if (mode === "value") {
    orderBy = { adaptiveScore: "desc" };
    modeFilter = { stockStyle: { in: ["VALUE_DEFENSIVE", "DOMESTIC_DEFENSIVE", "CYCLICAL_EXPORTER"] } };
  } else {
    // default: top by adaptiveScore
    orderBy = { adaptiveScore: "desc" };
  }

  const [scores, countSB, countB, countH, countW, countAv, totalCount] = await Promise.all([
    prisma.stockScore.findMany({
      where: { ...where, ...modeFilter },
      orderBy,
      take: limit,
      select: {
        symbol: true, name: true, nameZh: true,
        latestClose: true, latestDate: true,
        technicalScore: true, fundamentalScore: true,
        moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true,
        riskScore: true,
        recommendation: true, starsLabel: true, summaryReason: true,
        return5d: true, return20d: true, scoreSource: true,
        // V7.5
        rawScore: true, adaptiveScore: true, stockStyle: true,
        highRiskFlag: true, fxSensitivity: true, catalystScore: true,
        // V7.7
        percentileRank: true, marketRank: true,
        recommendationV2: true, recommendationReason: true,
        opportunityScore: true, opportunityRank: true, opportunityLabel: true,
        // V8.3 P2: AI Action
        tradingAction: true, positionSizePct: true, actionRiskLevel: true,
      },
    }),
    prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "HOLD", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "WATCH", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "AVOID", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } } }),
  ]);

  const marketTemperature = computeMarketTemperature(countSB, countB, totalCount);

  // Enrich with nameEn from Stock table (StockScore doesn't have it)
  const symbols = scores.map((s) => s.symbol);
  const stockNameEn = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, nameEn: true },
  });
  const nameEnMap = new Map(stockNameEn.map((s) => [s.symbol, s.nameEn ?? null]));

  const result = scores.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    nameZh: s.nameZh ?? null,
    nameEn: nameEnMap.get(s.symbol) ?? null,
    latestClose: s.latestClose ?? 0,
    latestDate: s.latestDate ?? "",
    technicalScore: s.technicalScore ?? 0,
    fundamentalScore: s.fundamentalScore ?? 0,
    moneyFlowScore: s.moneyFlowScore ?? s.riskScore ?? 0,
    newsSentimentScore: s.newsSentimentScore ?? 0,
    globalTrendScore: s.globalTrendScore ?? 0,
    riskScore: s.riskScore ?? 0,
    stars: starsFromRec(s.recommendationV2 ?? s.recommendation),
    starsLabel: s.starsLabel ?? "★☆☆☆☆",
    recommendation: (s.recommendationV2 ?? s.recommendation ?? "HOLD") as string,
    summaryReason: s.summaryReason ?? "",
    return5d: s.return5d ?? null,
    return20d: s.return20d ?? null,
    scoreSource: s.scoreSource ?? "FALLBACK",
    // V7.5
    rawScore: s.rawScore ?? 0,
    adaptiveScore: s.adaptiveScore ?? 0,
    stockStyle: s.stockStyle ?? "DOMESTIC_DEFENSIVE",
    highRiskFlag: s.highRiskFlag ?? false,
    fxSensitivity: s.fxSensitivity ?? "DOMESTIC_NEUTRAL",
    catalystScore: s.catalystScore ?? 5,
    // V7.7
    percentileRank: s.percentileRank ?? null,
    marketRank: s.marketRank ?? null,
    recommendationV2: s.recommendationV2 ?? s.recommendation ?? "HOLD",
    recommendationReason: s.recommendationReason ?? null,
    opportunityScore: s.opportunityScore ?? null,
    opportunityRank: s.opportunityRank ?? null,
    opportunityLabel: s.opportunityLabel ?? null,
    // V8.3 P2: AI Action
    tradingAction: s.tradingAction ?? null,
    positionSizePct: s.positionSizePct ?? null,
    actionRiskLevel: s.actionRiskLevel ?? null,
  }));

  return NextResponse.json({
    scores: result,
    marketStats: {
      total: totalCount,
      strongBuy: countSB,
      buy: countB,
      hold: countH,
      watch: countW,
      avoid: countAv,
      bullCount: countSB + countB,
      bullRate: totalCount > 0 ? Math.round((countSB + countB) / totalCount * 1000) / 10 : 0,
      marketTemperature,
    },
    updatedAt: new Date().toISOString(),
  });
}
