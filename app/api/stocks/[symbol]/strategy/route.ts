import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyStrategy } from "@/lib/strategy/strategy-classifier";
import { aggregateStrategyStats, MIN_SAMPLE } from "@/lib/strategy/strategy-performance";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);

  const [scoreRow, stratRows] = await Promise.all([
    prisma.stockScore.findUnique({
      where: { symbol: decoded },
      select: {
        tradingAction: true, technicalScore: true, fundamentalScore: true,
        moneyFlowScore: true, adaptiveScore: true, rsi14: true,
        maTrend: true, stockStyle: true, highRiskFlag: true, overallConfidence: true,
        recommendation: true,
      },
    }),
    prisma.strategyBacktestResult.findMany({
      where: { symbol: decoded },
      select: {
        strategyType: true, exitReason: true, returnPct: true,
        alphaPct: true, holdingDays: true, isWin: true,
      },
    }),
  ]);

  const classification = scoreRow ? classifyStrategy(scoreRow) : null;

  let strategyStats: ReturnType<typeof aggregateStrategyStats> | null = null;
  if (stratRows.length >= MIN_SAMPLE) {
    strategyStats = aggregateStrategyStats(stratRows);
  }

  const classifiedType = classification?.strategyType ?? null;

  return NextResponse.json({
    symbol: decoded,
    classification,
    backtestStats: strategyStats
      ? (classifiedType ? strategyStats.byStrategy[classifiedType as "DAY" | "SWING" | "POSITION"] : strategyStats.overall)
      : null,
    sampleCount: stratRows.filter((r) => r.exitReason && r.exitReason !== "OPEN" && r.exitReason !== "INSUFFICIENT_DATA").length,
  });
}
