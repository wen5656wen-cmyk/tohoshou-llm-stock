/**
 * GET /api/market-stats
 * Returns market temperature, rating distribution, and top opportunity stocks.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMarketTemperature } from "@/lib/market-temperature";

export const dynamic = "force-dynamic";

export async function GET() {
  const MIN_PRICE = 20;

  const [countSB, countB, countH, countW, countAv, totalCount, topAdaptiveCandidates, topOpp, topOppRisky] = await Promise.all([
    prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY", priceCount: { gte: MIN_PRICE } } }),
    prisma.stockScore.count({ where: { recommendationV2: "BUY", priceCount: { gte: MIN_PRICE } } }),
    prisma.stockScore.count({ where: { recommendationV2: "HOLD", priceCount: { gte: MIN_PRICE } } }),
    prisma.stockScore.count({ where: { recommendationV2: "WATCH", priceCount: { gte: MIN_PRICE } } }),
    prisma.stockScore.count({ where: { recommendationV2: "AVOID", priceCount: { gte: MIN_PRICE } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: MIN_PRICE }, adaptiveScore: { not: null } } }),
    // Fetch top 100 by adaptiveScore, then merge finalScore and re-rank
    prisma.stockScore.findMany({
      where: { priceCount: { gte: MIN_PRICE }, adaptiveScore: { not: null } },
      orderBy: { adaptiveScore: "desc" },
      take: 100,
      select: { symbol: true, name: true, nameZh: true, adaptiveScore: true, recommendationV2: true, percentileRank: true },
    }),
    // TOP5 stable opportunity
    prisma.stockScore.findMany({
      where: { priceCount: { gte: MIN_PRICE }, highRiskFlag: false, opportunityScore: { not: null } },
      orderBy: { opportunityScore: "desc" },
      take: 5,
      select: { symbol: true, name: true, nameZh: true, opportunityScore: true, adaptiveScore: true, recommendationV2: true, stockStyle: true },
    }),
    // TOP5 high-risk movers
    prisma.stockScore.findMany({
      where: { priceCount: { gte: MIN_PRICE }, highRiskFlag: true, opportunityScore: { not: null } },
      orderBy: { opportunityScore: "desc" },
      take: 5,
      select: { symbol: true, name: true, nameZh: true, opportunityScore: true, adaptiveScore: true, recommendationV2: true, stockStyle: true },
    }),
  ]);

  // Merge finalScore from GPTScore, sort by finalScore ?? adaptiveScore, take TOP3
  const gptRows = await prisma.gPTScore.findMany({
    where: { symbol: { in: topAdaptiveCandidates.map((s) => s.symbol) } },
    select: { symbol: true, finalScore: true, ruleScore: true, gptScore: true },
  });
  const gptMap = new Map(gptRows.map((g) => [g.symbol, g]));
  const topAdaptive = [...topAdaptiveCandidates]
    .sort((a, b) => {
      const av = gptMap.get(a.symbol)?.finalScore ?? a.adaptiveScore ?? 0;
      const bv = gptMap.get(b.symbol)?.finalScore ?? b.adaptiveScore ?? 0;
      return bv - av;
    })
    .slice(0, 3);

  const marketTemperature = computeMarketTemperature(countSB, countB, totalCount);
  const bullRate = totalCount > 0 ? Math.round((countSB + countB) / totalCount * 1000) / 10 : 0;

  return NextResponse.json({
    marketTemperature,
    bullRate,
    distribution: { strongBuy: countSB, buy: countB, hold: countH, watch: countW, avoid: countAv, total: totalCount },
    topAdaptive: topAdaptive.map((s) => {
      const gpt = gptMap.get(s.symbol);
      return {
        symbol: s.symbol, name: s.nameZh ?? s.name,
        adaptiveScore: s.adaptiveScore,
        finalScore: gpt?.finalScore ?? null,
        ruleScore: gpt?.ruleScore ?? null,
        gptScore: gpt?.gptScore ?? null,
        recommendationV2: s.recommendationV2, percentileRank: s.percentileRank,
      };
    }),
    topOpportunity: topOpp.map((s) => ({
      symbol: s.symbol, name: s.nameZh ?? s.name,
      opportunityScore: s.opportunityScore, adaptiveScore: s.adaptiveScore,
      recommendationV2: s.recommendationV2, stockStyle: s.stockStyle,
    })),
    topHighRisk: topOppRisky.map((s) => ({
      symbol: s.symbol, name: s.nameZh ?? s.name,
      opportunityScore: s.opportunityScore, adaptiveScore: s.adaptiveScore,
      recommendationV2: s.recommendationV2, stockStyle: s.stockStyle,
    })),
    updatedAt: new Date().toISOString(),
  });
}
