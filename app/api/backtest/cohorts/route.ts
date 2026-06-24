import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type CohortStat = {
  avgReturn: number | null;
  winRate: number | null;
  topix: number | null;
  alpha: number | null;
  filled: number;
};

export type CohortRow = {
  date: string;
  count: number;
  "7d": CohortStat | null;
  "30d": CohortStat | null;
};

export type CohortsData = {
  rows: CohortRow[];
};

export async function GET() {
  try {
    const [backtestRows, cohortCounts] = await Promise.all([
      prisma.backtestResult.findMany({
        where: {
          portfolioSize: "ALL",
          horizon: { in: ["7d", "30d"] },
        },
        orderBy: { date: "desc" },
        take: 100,
        select: {
          date: true, horizon: true,
          avgReturn: true, winRate: true,
          benchmarkTopixReturn: true, excessVsTopix: true,
          filled: true,
        },
      }),
      prisma.dailyRecommendation.groupBy({
        by: ["date"],
        _count: { date: true },
        orderBy: { date: "desc" },
        take: 50,
      }),
    ]);

    const countByDate = new Map<string, number>();
    for (const row of cohortCounts) {
      const d = row.date.toISOString().slice(0, 10);
      countByDate.set(d, row._count.date);
    }

    type PartialRow = { "7d"?: CohortStat; "30d"?: CohortStat };
    const statsByDate = new Map<string, PartialRow>();
    for (const row of backtestRows) {
      const d = row.date.toISOString().slice(0, 10);
      if (!statsByDate.has(d)) statsByDate.set(d, {});
      const entry = statsByDate.get(d)!;
      const h = row.horizon as "7d" | "30d";
      entry[h] = {
        avgReturn: row.avgReturn,
        winRate: row.winRate,
        topix: row.benchmarkTopixReturn,
        alpha: row.excessVsTopix,
        filled: row.filled,
      };
    }

    const allDates = Array.from(
      new Set([...countByDate.keys(), ...statsByDate.keys()])
    )
      .sort()
      .reverse()
      .slice(0, 50);

    const rows: CohortRow[] = allDates.map((date) => ({
      date,
      count: countByDate.get(date) ?? 0,
      "7d":  statsByDate.get(date)?.["7d"]  ?? null,
      "30d": statsByDate.get(date)?.["30d"] ?? null,
    }));

    return NextResponse.json<CohortsData>({ rows });
  } catch (e) {
    console.error("/api/backtest/cohorts error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
