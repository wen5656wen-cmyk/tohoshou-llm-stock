import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID: Record<string, boolean> = {
  DAY_TRADE:   true,
  SWING_TRADE: true,
  LONG_TRADE:  true,
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  const strategyType = type.toUpperCase();

  if (!VALID[strategyType]) {
    return NextResponse.json({ error: `Unknown strategy type: ${type}` }, { status: 400 });
  }

  try {
    const [
      capitalLog,
      openPositions,
      recentTrades,
      backtestSummaries,
      learning,
      latestRecDate,
    ] = await Promise.all([
      // Latest capital log entry
      (prisma as any).strategyCapitalLog.findFirst({
        where: { strategyType },
        orderBy: { logDate: "desc" },
        select: {
          logDate:       true,
          cashAfter:     true,
          investedAfter: true,
          totalAfter:    true,
          changeReason:  true,
        },
      }),
      // Open positions
      (prisma as any).strategyPosition.findMany({
        where: { strategyType, status: "OPEN" },
        orderBy: { entryDate: "desc" },
        take: 20,
        select: {
          id:            true,
          symbol:        true,
          entryDate:     true,
          entryPrice:    true,
          currentPrice:  true,
          returnPct:     true,
          returnAmount:  true,
          alpha:         true,
          holdingDays:   true,
          investedAmount: true,
          quantity:      true,
        },
      }),
      // Recent closed trades
      (prisma as any).strategyTradeResult.findMany({
        where: { strategyType, status: "CLOSED" },
        orderBy: { tradeDate: "desc" },
        take: 10,
        select: {
          id:            true,
          symbol:        true,
          tradeDate:     true,
          returnPct:     true,
          returnAmount:  true,
          alpha:         true,
          win:           true,
          holdingDays:   true,
          exitReason:    true,
          entryPrice:    true,
          exitPrice:     true,
        },
      }),
      // All backtest summaries for latest date
      (async () => {
        const latest = await (prisma as any).strategyBacktestSummary.findFirst({
          where: { strategyType },
          orderBy: { asOfDate: "desc" },
          select: { asOfDate: true },
        });
        if (!latest) return [];
        return (prisma as any).strategyBacktestSummary.findMany({
          where: { strategyType, asOfDate: latest.asOfDate },
          orderBy: { horizon: "asc" },
          select: {
            horizon:         true,
            sampleCount:     true,
            filledCount:     true,
            fillRate:        true,
            winRate:         true,
            lossRate:        true,
            avgReturnPct:    true,
            medianReturnPct: true,
            maxReturnPct:    true,
            minReturnPct:    true,
            alpha:           true,
            maxDrawdown:     true,
            sharpeRatio:     true,
            avgHoldingDays:  true,
            asOfDate:        true,
          },
        });
      })(),
      // Latest learning report
      (prisma as any).strategyLearningReport.findFirst({
        where: { strategyType },
        orderBy: { reportDate: "desc" },
        select: {
          reportDate:      true,
          grade:           true,
          recommendation:  true,
          integrityScore:  true,
          predictionScore: true,
          stabilityScore:  true,
          confidenceScore: true,
          sampleCount:     true,
          fillRate:        true,
          winRate:         true,
          avgReturnPct:    true,
          alpha:           true,
          maxDrawdown:     true,
          summary:         true,
        },
      }),
      // Latest recommendation date
      (prisma as any).strategyRecommendation.findFirst({
        where: { strategyType },
        orderBy: { tradeDate: "desc" },
        select: { tradeDate: true },
      }),
    ]);

    // Top 10 recommendations
    let top10: unknown[] = [];
    let top100Count = 0;
    if (latestRecDate) {
      [top10, top100Count] = await Promise.all([
        (prisma as any).strategyRecommendation.findMany({
          where: { strategyType, tradeDate: latestRecDate.tradeDate, isTop10: true },
          orderBy: { rank: "asc" },
          select: {
            rank:        true,
            symbol:      true,
            aiScore:     true,
            finalScore:  true,
            isTop10:     true,
            tradeDate:   true,
          },
        }),
        (prisma as any).strategyRecommendation.count({
          where: { strategyType, tradeDate: latestRecDate.tradeDate },
        }),
      ]);
    }

    return NextResponse.json({
      strategyType,
      capitalLog,
      openPositions,
      recentTrades,
      backtestSummaries,
      learning,
      recommendations: {
        top10,
        top100Count,
        tradeDate: latestRecDate?.tradeDate ?? null,
      },
    });
  } catch (e: any) {
    console.error(`[strategy/${type}]`, e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
