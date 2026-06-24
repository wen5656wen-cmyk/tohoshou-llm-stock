import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Types ──────────────────────────────────────────────────────────────────────

export type HistoryCohort = {
  date: string;
  count: number;
  avgReturn7d: number | null;
  winRate7d: number | null;
  avgReturn30d: number | null;
  winRate30d: number | null;
  topixReturn7d: number | null;
  topixReturn30d: number | null;
  alpha7d: number | null;
  alpha30d: number | null;
};

export type HistoryData = {
  cohorts: HistoryCohort[];
};

// ── GET handler ────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Query BacktestResult WHERE portfolioSize="TOP10" ORDER BY date DESC
    const backtestRows = await prisma.backtestResult.findMany({
      where: { portfolioSize: "TOP10" },
      orderBy: { date: "desc" },
      take: 50,
    });

    // 2. Query DailyRecommendation groupBy date WHERE gptRank<=10 for counts
    const recCounts = await prisma.dailyRecommendation.groupBy({
      by: ["date"],
      where: { gptRank: { lte: 10 } },
      _count: { symbol: true },
      orderBy: { date: "desc" },
      take: 50,
    });

    // Build count map
    const countMap = new Map<string, number>();
    for (const row of recCounts) {
      countMap.set(row.date.toISOString().slice(0, 10), row._count.symbol);
    }

    // 3. Build cohorts map by date (merge backtest rows for 7d and 30d)
    type CohortAcc = {
      date: string;
      count: number;
      avgReturn7d: number | null;
      winRate7d: number | null;
      avgReturn30d: number | null;
      winRate30d: number | null;
      topixReturn7d: number | null;
      topixReturn30d: number | null;
    };

    const cohortMap = new Map<string, CohortAcc>();

    for (const row of backtestRows) {
      const dateStr = row.date.toISOString().slice(0, 10);
      if (!cohortMap.has(dateStr)) {
        cohortMap.set(dateStr, {
          date: dateStr,
          count: countMap.get(dateStr) ?? 0,
          avgReturn7d: null,
          winRate7d: null,
          avgReturn30d: null,
          winRate30d: null,
          topixReturn7d: null,
          topixReturn30d: null,
        });
      }
      const acc = cohortMap.get(dateStr)!;

      if (row.horizon === "7d") {
        acc.avgReturn7d = row.avgReturn ?? null;
        acc.winRate7d = row.winRate ?? null;
        acc.topixReturn7d = row.benchmarkTopixReturn ?? null;
      } else if (row.horizon === "30d") {
        acc.avgReturn30d = row.avgReturn ?? null;
        acc.winRate30d = row.winRate ?? null;
        acc.topixReturn30d = row.benchmarkTopixReturn ?? null;
      }
    }

    // Also add dates that have recs but no backtest yet
    for (const row of recCounts) {
      const dateStr = row.date.toISOString().slice(0, 10);
      if (!cohortMap.has(dateStr)) {
        cohortMap.set(dateStr, {
          date: dateStr,
          count: row._count.symbol,
          avgReturn7d: null,
          winRate7d: null,
          avgReturn30d: null,
          winRate30d: null,
          topixReturn7d: null,
          topixReturn30d: null,
        });
      }
    }

    // 4. Build final cohorts array sorted by date desc
    const cohorts: HistoryCohort[] = Array.from(cohortMap.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30)
      .map((acc) => ({
        ...acc,
        alpha7d:
          acc.avgReturn7d != null && acc.topixReturn7d != null
            ? Math.round((acc.avgReturn7d - acc.topixReturn7d) * 100) / 100
            : null,
        alpha30d:
          acc.avgReturn30d != null && acc.topixReturn30d != null
            ? Math.round((acc.avgReturn30d - acc.topixReturn30d) * 100) / 100
            : null,
      }));

    return NextResponse.json({ cohorts } as HistoryData);
  } catch (err) {
    console.error("[portfolio/history] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
