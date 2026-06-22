import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type TrendPoint = {
  date: string;
  TOP10: number | null;
  TOP50: number | null;
  TOP100: number | null;
  ALL: number | null;
};

export type TrendData = {
  horizon: string;
  series: TrendPoint[];
};

const TREND_SIZES = ["TOP10", "TOP50", "TOP100", "ALL"] as const;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const horizon = searchParams.get("horizon") ?? "30d";

    if (!["7d", "30d", "90d"].includes(horizon)) {
      return NextResponse.json({ error: "invalid horizon" }, { status: 400 });
    }

    const rows = await prisma.backtestResult.findMany({
      where: { horizon, portfolioSize: { in: [...TREND_SIZES] } },
      orderBy: { date: "asc" },
      select: { date: true, portfolioSize: true, avgReturn: true },
    });

    const dateMap = new Map<string, TrendPoint>();
    for (const row of rows) {
      const dateStr = row.date.toISOString().slice(0, 10);
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { date: dateStr, TOP10: null, TOP50: null, TOP100: null, ALL: null });
      }
      const pt = dateMap.get(dateStr)!;
      if (row.portfolioSize === "TOP10")  pt.TOP10  = row.avgReturn;
      if (row.portfolioSize === "TOP50")  pt.TOP50  = row.avgReturn;
      if (row.portfolioSize === "TOP100") pt.TOP100 = row.avgReturn;
      if (row.portfolioSize === "ALL")    pt.ALL    = row.avgReturn;
    }

    return NextResponse.json<TrendData>({ horizon, series: Array.from(dateMap.values()) });
  } catch (e) {
    console.error("/api/backtest/trend error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
