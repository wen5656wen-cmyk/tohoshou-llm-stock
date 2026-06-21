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

// Read from pre-computed StockScore, join GPTScore for finalScore
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode  = searchParams.get("mode") ?? "top"; // top | opportunity | high_risk
  const limit = Math.min(500, parseInt(searchParams.get("limit") ?? "200", 10));
  const style = searchParams.get("style"); // optional stockStyle filter

  const where = {
    priceCount: { gte: 20 },
    adaptiveScore: { not: null },
    ...(style ? { stockStyle: style } : {}),
  };

  // For "top" mode, fetch more candidates so we can re-sort by finalScore after GPT join
  const fetchLimit = mode === "top" ? Math.max(limit, 600) : limit;

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
    // default: top by adaptiveScore (will re-sort by finalScore after GPT join)
    orderBy = { adaptiveScore: "desc" };
  }

  const [rawScores, countSB, countB, countH, countW, countAv, totalCount] = await Promise.all([
    prisma.stockScore.findMany({
      where: { ...where, ...modeFilter },
      orderBy,
      take: fetchLimit,
      select: {
        symbol: true, name: true, nameZh: true,
        latestClose: true, latestDate: true,
        technicalScore: true, fundamentalScore: true,
        moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true,
        riskScore: true,
        recommendation: true, starsLabel: true, summaryReason: true,
        return5d: true, return20d: true, scoreSource: true,
        rawScore: true, adaptiveScore: true, stockStyle: true,
        highRiskFlag: true, fxSensitivity: true, catalystScore: true,
        percentileRank: true, marketRank: true,
        recommendationV2: true, recommendationReason: true,
        opportunityScore: true, opportunityRank: true, opportunityLabel: true,
        tradingAction: true, positionSizePct: true, actionRiskLevel: true,
      },
    }),
    prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "BUY",         priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "HOLD",        priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "WATCH",       priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "AVOID",       priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } } }),
  ]);

  const marketTemperature = computeMarketTemperature(countSB, countB, totalCount);

  // Batch-fetch GPTScore and nameEn
  const symbols = rawScores.map((s) => s.symbol);
  const [stockNameEn, gptRows] = await Promise.all([
    prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, nameEn: true },
    }),
    prisma.gPTScore.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true, gptScore: true, finalScore: true, ruleScore: true,
        gptRating: true, gptRank: true,
        summaryZh: true, summaryJa: true, summaryEn: true,
        confidence: true, action: true, timeHorizon: true,
        strengths: true, risks: true, catalysts: true, updatedAt: true,
      },
    }),
  ]);

  const nameEnMap = new Map(stockNameEn.map((s) => [s.symbol, s.nameEn ?? null]));
  const gptMap    = new Map(gptRows.map((g) => [g.symbol, g]));

  // Merge GPT data and compute displayScore
  const merged = rawScores.map((s) => {
    const gpt = gptMap.get(s.symbol) ?? null;
    const adaptiveScore = s.adaptiveScore ?? 0;
    const finalScore    = gpt != null ? gpt.finalScore : adaptiveScore;
    const gptScore      = gpt?.gptScore ?? null;
    const gptRating     = gpt?.gptRating ?? null;
    const gptRank       = gpt?.gptRank ?? null;
    const hasGPT        = gpt != null;
    const effectiveRating = gptRating ?? s.recommendationV2 ?? s.recommendation ?? "HOLD";

    return {
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
      stars: starsFromRec(effectiveRating),
      starsLabel: s.starsLabel ?? "★☆☆☆☆",
      recommendation: (s.recommendationV2 ?? s.recommendation ?? "HOLD") as string,
      summaryReason: s.summaryReason ?? "",
      return5d: s.return5d ?? null,
      return20d: s.return20d ?? null,
      scoreSource: s.scoreSource ?? "FALLBACK",
      rawScore: s.rawScore ?? 0,
      adaptiveScore,
      stockStyle: s.stockStyle ?? "DOMESTIC_DEFENSIVE",
      highRiskFlag: s.highRiskFlag ?? false,
      fxSensitivity: s.fxSensitivity ?? "DOMESTIC_NEUTRAL",
      catalystScore: s.catalystScore ?? 5,
      percentileRank: s.percentileRank ?? null,
      marketRank: s.marketRank ?? null,
      recommendationV2: s.recommendationV2 ?? s.recommendation ?? "HOLD",
      recommendationReason: s.recommendationReason ?? null,
      opportunityScore: s.opportunityScore ?? null,
      opportunityRank: s.opportunityRank ?? null,
      opportunityLabel: s.opportunityLabel ?? null,
      tradingAction: s.tradingAction ?? null,
      positionSizePct: s.positionSizePct ?? null,
      actionRiskLevel: s.actionRiskLevel ?? null,
      // V9 P1: GPT rerank fields
      finalScore,
      gptScore,
      gptRating,
      gptRank,
      hasGPT,
      effectiveRating,
      gptSummaryZh: gpt?.summaryZh ?? null,
      gptSummaryJa: gpt?.summaryJa ?? null,
      gptSummaryEn: gpt?.summaryEn ?? null,
      gptUpdatedAt:  gpt?.updatedAt?.toISOString() ?? null,
    };
  });

  // For "top" mode: re-sort by finalScore DESC → adaptiveScore DESC → percentileRank ASC
  if (mode === "top") {
    merged.sort((a, b) => {
      const fd = b.finalScore - a.finalScore;
      if (Math.abs(fd) > 0.01) return fd;
      const ad = b.adaptiveScore - a.adaptiveScore;
      if (Math.abs(ad) > 0.01) return ad;
      return (a.percentileRank ?? 100) - (b.percentileRank ?? 100);
    });
  }

  const result = merged.slice(0, limit);

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
