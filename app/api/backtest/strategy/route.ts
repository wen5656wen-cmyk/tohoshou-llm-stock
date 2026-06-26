import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aggregateStrategyStats } from "@/lib/strategy/strategy-performance";

export const dynamic = "force-dynamic";

export async function GET() {
  const [rows, latest] = await Promise.all([
    prisma.strategyBacktestResult.findMany({
      select: {
        strategyType: true, exitReason: true, returnPct: true,
        alphaPct: true, holdingDays: true, isWin: true,
        recDate: true,
      },
    }),
    prisma.strategyBacktestResult.findFirst({
      orderBy: { computedAt: "desc" },
      select: { computedAt: true },
    }),
  ]);

  if (rows.length === 0) {
    return NextResponse.json({ stats: null, totalRows: 0, lastComputedAt: null });
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

  // Exit reason breakdown by strategy
  const exitBreakdown: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!exitBreakdown[r.strategyType]) exitBreakdown[r.strategyType] = {};
    const reason = r.exitReason ?? "UNKNOWN";
    exitBreakdown[r.strategyType][reason] = (exitBreakdown[r.strategyType][reason] ?? 0) + 1;
  }

  // Latest cohort date
  const dates = rows.map((r) => r.recDate.getTime());
  const latestRecDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null;

  return NextResponse.json({
    stats,
    exitBreakdown,
    totalRows: rows.length,
    latestRecDate,
    lastComputedAt: latest?.computedAt?.toISOString() ?? null,
  });
}
