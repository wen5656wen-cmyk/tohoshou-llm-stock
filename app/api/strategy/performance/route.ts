import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aggregateStrategyStats } from "@/lib/strategy/strategy-performance";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.strategyBacktestResult.findMany({
    select: {
      strategyType: true,
      exitReason: true,
      returnPct: true,
      alphaPct: true,
      holdingDays: true,
      isWin: true,
    },
  });

  if (rows.length === 0) {
    return NextResponse.json({
      overall: null,
      byStrategy: { DAY: null, SWING: null, POSITION: null },
      totalRows: 0,
    });
  }

  const stats = aggregateStrategyStats(
    rows.map((r) => ({
      strategyType: r.strategyType,
      exitReason:   r.exitReason,
      returnPct:    r.returnPct,
      alphaPct:     r.alphaPct,
      holdingDays:  r.holdingDays,
      isWin:        r.isWin,
    })),
  );

  return NextResponse.json({
    overall:    stats.overall,
    byStrategy: stats.byStrategy,
    totalRows:  rows.length,
  });
}
