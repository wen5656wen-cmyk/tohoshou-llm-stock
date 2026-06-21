import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Latest BacktestResult rows for each horizon
    const [r7d, r30d, r90d] = await Promise.all([
      prisma.backtestResult.findFirst({ where: { horizon: "7d" },  orderBy: { date: "desc" } }),
      prisma.backtestResult.findFirst({ where: { horizon: "30d" }, orderBy: { date: "desc" } }),
      prisma.backtestResult.findFirst({ where: { horizon: "90d" }, orderBy: { date: "desc" } }),
    ]);

    // Total distinct recommendation dates
    const cohortCount = await prisma.dailyRecommendation.groupBy({
      by: ["date"],
      _count: { date: true },
    });

    // Historical win-rates per horizon (all dates)
    const allResults = await prisma.backtestResult.findMany({
      orderBy: { date: "desc" },
      take: 90,
    });

    // Top 10 best / worst 30d performers (across all dates with fills)
    const top30d = await prisma.dailyRecommendation.findMany({
      where: { return30d: { not: null } },
      orderBy: { return30d: "desc" },
      take: 10,
      select: { symbol: true, date: true, return30d: true, gptRank: true, buyPrice: true },
    });
    const bottom30d = await prisma.dailyRecommendation.findMany({
      where: { return30d: { not: null } },
      orderBy: { return30d: "asc" },
      take: 10,
      select: { symbol: true, date: true, return30d: true, gptRank: true, buyPrice: true },
    });

    // Latest cohort snapshot (top 20 by gptRank)
    const latestDate = await prisma.dailyRecommendation.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    });
    const latestCohort = latestDate
      ? await prisma.dailyRecommendation.findMany({
          where: { date: latestDate.date },
          orderBy: { gptRank: "asc" },
          take: 20,
          select: {
            symbol: true, gptRank: true, finalScore: true, gptRating: true,
            buyPrice: true, return7d: true, return30d: true, return90d: true, summaryZh: true,
          },
        })
      : [];

    return NextResponse.json({
      cohortCount: cohortCount.length,
      horizons: {
        "7d":  r7d  ? { winRate: r7d.winRate,  avgReturn: r7d.avgReturn,  filled: r7d.filled,  date: r7d.date }  : null,
        "30d": r30d ? { winRate: r30d.winRate, avgReturn: r30d.avgReturn, filled: r30d.filled, date: r30d.date } : null,
        "90d": r90d ? { winRate: r90d.winRate, avgReturn: r90d.avgReturn, filled: r90d.filled, date: r90d.date } : null,
      },
      allResults,
      topWinners: top30d,
      topLosers: bottom30d,
      latestCohort,
      latestDate: latestDate?.date ?? null,
    });
  } catch (e) {
    console.error("/api/backtest/summary error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
