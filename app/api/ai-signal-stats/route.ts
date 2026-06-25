import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type TodayStatus = "WAITING_DAILY_PRICE" | "OK";

export type SignalStatEntry = {
  recommendationCount: number;
  validTodayCount: number;
  todayWinCount: number;
  todayLossCount: number;
  todayFlatCount: number;
  todayWinRate: number | null;
  avgTodayReturnPct: number | null;
  todayStatus: TodayStatus;
  valid7dCount: number;
  win7dCount: number;
  win7dRate: number | null;
  avg7dReturnPct: number | null;
};

export type AISignalDayStats = {
  tradeDate: string;
  STRONG_BUY: SignalStatEntry | null;
  BUY: SignalStatEntry | null;
  ALL_BUY: SignalStatEntry | null;
};

function toEntry(row: {
  recommendationCount: number;
  validTodayCount: number;
  todayWinCount: number;
  todayLossCount: number;
  todayFlatCount: number;
  todayWinRate: number | null;
  avgTodayReturnPct: number | null;
  valid7dCount: number;
  win7dCount: number;
  win7dRate: number | null;
  avg7dReturnPct: number | null;
}): SignalStatEntry {
  // WAITING_DAILY_PRICE: recommendations exist but no valid price comparisons → prices not yet synced
  const todayStatus: TodayStatus =
    row.recommendationCount > 0 && row.validTodayCount === 0 && row.todayWinRate === null
      ? "WAITING_DAILY_PRICE"
      : "OK";

  return {
    recommendationCount: row.recommendationCount,
    validTodayCount: row.validTodayCount,
    todayWinCount: row.todayWinCount,
    todayLossCount: row.todayLossCount,
    todayFlatCount: row.todayFlatCount,
    todayWinRate: row.todayWinRate,
    avgTodayReturnPct: row.avgTodayReturnPct,
    todayStatus,
    valid7dCount: row.valid7dCount,
    win7dCount: row.win7dCount,
    win7dRate: row.win7dRate,
    avg7dReturnPct: row.avg7dReturnPct,
  };
}

export async function GET() {
  const rows = await prisma.aISignalDailyStat.findMany({
    orderBy: { tradeDate: "desc" },
    take: 90,
    select: {
      tradeDate: true,
      actionType: true,
      recommendationCount: true,
      validTodayCount: true,
      todayWinCount: true,
      todayLossCount: true,
      todayFlatCount: true,
      todayWinRate: true,
      avgTodayReturnPct: true,
      valid7dCount: true,
      win7dCount: true,
      win7dRate: true,
      avg7dReturnPct: true,
    },
  });

  // Group by date
  const byDate = new Map<string, AISignalDayStats>();
  for (const row of rows) {
    const d = row.tradeDate.toISOString().slice(0, 10);
    if (!byDate.has(d)) {
      byDate.set(d, { tradeDate: d, STRONG_BUY: null, BUY: null, ALL_BUY: null });
    }
    const day = byDate.get(d)!;
    if (row.actionType === "STRONG_BUY") day.STRONG_BUY = toEntry(row);
    else if (row.actionType === "BUY") day.BUY = toEntry(row);
    else if (row.actionType === "ALL_BUY") day.ALL_BUY = toEntry(row);
  }

  const result = Array.from(byDate.values());
  return NextResponse.json(result);
}
