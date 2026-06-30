import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type StratType = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";
const ALL: StratType[] = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"];

export async function GET() {
  try {
    const [
      openPositionCounts,
      closedTradeCounts,
      latestLearning,
      latestBacktests,
      latestSnapshots,
      latestRecs,
      unifiedSummary,
    ] = await Promise.all([
      // Open position count per strategy
      (prisma as any).strategyPosition.groupBy({
        by: ["strategyType"],
        where: { status: "OPEN" },
        _count: { id: true },
      }),
      // Closed trade count per strategy
      (prisma as any).strategyTradeResult.groupBy({
        by: ["strategyType"],
        where: { status: "CLOSED" },
        _count: { id: true },
      }),
      // Latest learning report per strategy
      Promise.all(
        ALL.map((s) =>
          (prisma as any).strategyLearningReport.findFirst({
            where: { strategyType: s },
            orderBy: { reportDate: "desc" },
            select: {
              strategyType: true,
              reportDate:   true,
              grade:        true,
              recommendation: true,
              integrityScore: true,
              predictionScore: true,
              stabilityScore: true,
              confidenceScore: true,
              winRate:        true,
              alpha:          true,
              summary:        true,
            },
          }),
        ),
      ),
      // Best backtest per strategy (highest filledCount)
      Promise.all(
        ALL.map((s) =>
          (prisma as any).strategyBacktestSummary.findFirst({
            where: { strategyType: s, filledCount: { gt: 0 } },
            orderBy: [{ filledCount: "desc" }, { asOfDate: "desc" }],
            select: {
              horizon:    true,
              winRate:    true,
              alpha:      true,
              fillRate:   true,
              avgReturnPct: true,
              maxDrawdown:  true,
              asOfDate:   true,
            },
          }),
        ),
      ),
      // Latest snapshot per strategy
      Promise.all(
        ALL.map((s) =>
          (prisma as any).strategySnapshot.findFirst({
            where: { strategyType: s },
            orderBy: { snapshotDate: "desc" },
            select: {
              snapshotDate:        true,
              cumulativeReturnPct: true,
              alpha:               true,
              winRate:             true,
              openPositions:       true,
              closedTrades:        true,
              cash:                true,
              investedValue:       true,
              totalValue:          true,
            },
          }),
        ),
      ),
      // Latest recommendation counts per strategy
      Promise.all(
        ALL.map(async (s) => {
          const latest = await (prisma as any).strategyRecommendation.findFirst({
            where: { strategyType: s },
            orderBy: { tradeDate: "desc" },
            select: { tradeDate: true },
          });
          if (!latest) return { strategyType: s, tradeDate: null, top10Count: 0, top100Count: 0 };
          const [top10Count, top100Count] = await Promise.all([
            (prisma as any).strategyRecommendation.count({
              where: { strategyType: s, tradeDate: latest.tradeDate, isTop10: true },
            }),
            (prisma as any).strategyRecommendation.count({
              where: { strategyType: s, tradeDate: latest.tradeDate },
            }),
          ]);
          return { strategyType: s, tradeDate: latest.tradeDate, top10Count, top100Count };
        }),
      ),
      // Unified learning summary
      (prisma as any).strategyLearningSummary.findFirst({
        orderBy: { reportDate: "desc" },
        select: {
          reportDate:     true,
          integrityScore: true,
          grade:          true,
          recommendation: true,
          dayIntegrity:   true,
          swingIntegrity: true,
          longIntegrity:  true,
        },
      }),
    ]);

    const openMap = new Map(openPositionCounts.map((r: any) => [r.strategyType, r._count.id]));
    const closedMap = new Map(closedTradeCounts.map((r: any) => [r.strategyType, r._count.id]));

    const strategies: Record<string, object> = {};
    for (let i = 0; i < ALL.length; i++) {
      const s = ALL[i];
      strategies[s] = {
        openPositions:  openMap.get(s)  ?? 0,
        closedTrades:   closedMap.get(s) ?? 0,
        learning:       latestLearning[i],
        bestBacktest:   latestBacktests[i],
        latestSnapshot: latestSnapshots[i],
        recommendations: latestRecs[i],
      };
    }

    return NextResponse.json({ strategies, unified: unifiedSummary });
  } catch (e: any) {
    console.error("[strategy/overview]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
