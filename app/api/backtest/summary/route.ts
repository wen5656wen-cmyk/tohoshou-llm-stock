import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type HorizonStat = {
  winRate: number | null;
  avgReturn: number | null;
  medianReturn: number | null;
  filled: number;
  benchmarkNikkeiReturn: number | null;
  benchmarkTopixReturn: number | null;
  excessVsNikkei: number | null;
  excessVsTopix: number | null;
  maxDrawdown: number | null;
  date: Date;
} | null;

type PortfolioRow = { "7d": HorizonStat; "30d": HorizonStat; "90d": HorizonStat };

export async function GET() {
  try {
    // ── Portfolio stats: latest row per (portfolioSize × horizon) ──────────
    const PORTFOLIO_SIZES = ["TOP5", "TOP10", "TOP20", "ALL"] as const;
    const HORIZONS = ["7d", "30d", "90d"] as const;

    // Fetch all recent BacktestResult rows (last 90 dates, all portfolio sizes)
    const allResults = await prisma.backtestResult.findMany({
      orderBy: { date: "desc" },
      take: 90 * 4 * 3, // 90 dates × 4 portfolioSizes × 3 horizons
      select: {
        date: true, horizon: true, portfolioSize: true,
        winRate: true, avgReturn: true, medianReturn: true, filled: true,
        benchmarkNikkeiReturn: true, benchmarkTopixReturn: true,
        excessVsNikkei: true, excessVsTopix: true, maxDrawdown: true,
        bestReturn: true, worstReturn: true, bestSymbol: true, worstSymbol: true,
      },
    });

    // Build portfolios map: pick latest row per (portfolioSize, horizon)
    const portfolios: Record<string, PortfolioRow> = {};
    for (const ps of PORTFOLIO_SIZES) {
      const row: PortfolioRow = { "7d": null, "30d": null, "90d": null };
      for (const h of HORIZONS) {
        const match = allResults.find((r) => r.portfolioSize === ps && r.horizon === h);
        if (match) {
          row[h] = {
            winRate: match.winRate,
            avgReturn: match.avgReturn,
            medianReturn: match.medianReturn,
            filled: match.filled,
            benchmarkNikkeiReturn: match.benchmarkNikkeiReturn,
            benchmarkTopixReturn: match.benchmarkTopixReturn,
            excessVsNikkei: match.excessVsNikkei,
            excessVsTopix: match.excessVsTopix,
            maxDrawdown: match.maxDrawdown,
            date: match.date,
          };
        }
      }
      portfolios[ps] = row;
    }

    // ── Cohort count ────────────────────────────────────────────────────────
    const cohortDates = await prisma.dailyRecommendation.groupBy({
      by: ["date"],
      _count: { date: true },
    });

    // ── Latest cohort top-20 (include entryPrice) ───────────────────────────
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
            buyPrice: true, entryPrice: true,
            return7d: true, return30d: true, return90d: true, summaryZh: true,
          },
        })
      : [];

    // ── All-time top/bottom 10 by 30d return ───────────────────────────────
    const [top30d, bottom30d] = await Promise.all([
      prisma.dailyRecommendation.findMany({
        where: { return30d: { not: null } },
        orderBy: { return30d: "desc" },
        take: 10,
        select: { symbol: true, date: true, return30d: true, gptRank: true, entryPrice: true },
      }),
      prisma.dailyRecommendation.findMany({
        where: { return30d: { not: null } },
        orderBy: { return30d: "asc" },
        take: 10,
        select: { symbol: true, date: true, return30d: true, gptRank: true, entryPrice: true },
      }),
    ]);

    return NextResponse.json({
      cohortCount: cohortDates.length,
      latestDate: latestDate?.date ?? null,
      portfolios,
      latestCohort,
      topWinners: top30d,
      topLosers: bottom30d,
    });
  } catch (e) {
    console.error("/api/backtest/summary error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
