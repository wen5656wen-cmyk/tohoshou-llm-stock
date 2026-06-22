import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type BacktestHealthData = {
  latestRecommendationDate: string | null;
  totalRecommendations: number;
  filled7d: number;
  filled30d: number;
  filled90d: number;
  fillRate7d: number;
  fillRate30d: number;
  fillRate90d: number;
  latestPriceDate: string | null;
  recentErrors: number;
  status: "HEALTHY" | "WAITING_PRICE" | "PARTIAL" | "FAILED";
};

export async function GET() {
  try {
    // Latest cohort date
    const latestRec = await prisma.dailyRecommendation.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    });

    if (!latestRec) {
      return NextResponse.json<BacktestHealthData>({
        latestRecommendationDate: null,
        totalRecommendations: 0,
        filled7d: 0, filled30d: 0, filled90d: 0,
        fillRate7d: 0, fillRate30d: 0, fillRate90d: 0,
        latestPriceDate: null,
        recentErrors: 0,
        status: "FAILED",
      });
    }

    const latestDate = latestRec.date;

    // Counts for the latest cohort
    const [total, filled7d, filled30d, filled90d, latestPrice, recentErrors] = await Promise.all([
      prisma.dailyRecommendation.count({ where: { date: latestDate } }),
      prisma.dailyRecommendation.count({ where: { date: latestDate, return7d: { not: null } } }),
      prisma.dailyRecommendation.count({ where: { date: latestDate, return30d: { not: null } } }),
      prisma.dailyRecommendation.count({ where: { date: latestDate, return90d: { not: null } } }),
      prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.backtestError.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    const fillRate7d  = total > 0 ? Math.round((filled7d  / total) * 1000) / 10 : 0;
    const fillRate30d = total > 0 ? Math.round((filled30d / total) * 1000) / 10 : 0;
    const fillRate90d = total > 0 ? Math.round((filled90d / total) * 1000) / 10 : 0;

    let status: BacktestHealthData["status"];
    if (total === 0) {
      status = "FAILED";
    } else if (filled7d === 0) {
      status = "WAITING_PRICE";
    } else if (fillRate7d >= 80) {
      status = "HEALTHY";
    } else {
      status = "PARTIAL";
    }

    return NextResponse.json<BacktestHealthData>({
      latestRecommendationDate: latestDate.toISOString().slice(0, 10),
      totalRecommendations: total,
      filled7d,
      filled30d,
      filled90d,
      fillRate7d,
      fillRate30d,
      fillRate90d,
      latestPriceDate: latestPrice?.date.toISOString().slice(0, 10) ?? null,
      recentErrors,
      status,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
