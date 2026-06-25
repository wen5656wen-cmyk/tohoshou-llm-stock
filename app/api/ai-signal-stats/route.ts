import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Status machine (P5):
//   PENDING      — DailyPrice not yet synced for tradeDate → show "待収盘"
//   READY        — prices synced, today stats computed
//   ACCUMULATING — 7-day window still building (valid7dCount = 0)

export type TodayStatus = "PENDING" | "READY";
export type WeekStatus = "ACCUMULATING" | "READY";

export type SignalStatEntry = {
  recommendationCount: number;
  // Today
  validTodayCount: number;
  todayWinCount: number;
  todayLossCount: number;
  todayFlatCount: number;
  todayWinRate: number | null;
  avgTodayReturnPct: number | null;
  bestTodayReturnPct: number | null;
  worstTodayReturnPct: number | null;
  bigUpTodayCount: number;
  smallUpTodayCount: number;
  smallDownTodayCount: number;
  bigDownTodayCount: number;
  todayStatus: TodayStatus;
  // 7-day
  valid7dCount: number;
  win7dCount: number;
  loss7dCount: number;
  flat7dCount: number;
  win7dRate: number | null;
  avg7dReturnPct: number | null;
  best7dReturnPct: number | null;
  worst7dReturnPct: number | null;
  bigUp7dCount: number;
  smallUp7dCount: number;
  smallDown7dCount: number;
  bigDown7dCount: number;
  weekStatus: WeekStatus;
  // Cohort
  uniqueSymbolCount: number;
  uniqueWinCount: number;
  uniqueWinRate: number | null;
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
  bestTodayReturnPct: number | null;
  worstTodayReturnPct: number | null;
  bigUpTodayCount: number;
  smallUpTodayCount: number;
  smallDownTodayCount: number;
  bigDownTodayCount: number;
  valid7dCount: number;
  win7dCount: number;
  loss7dCount: number;
  flat7dCount: number;
  win7dRate: number | null;
  avg7dReturnPct: number | null;
  best7dReturnPct: number | null;
  worst7dReturnPct: number | null;
  bigUp7dCount: number;
  smallUp7dCount: number;
  smallDown7dCount: number;
  bigDown7dCount: number;
  uniqueSymbolCount: number;
  uniqueWinCount: number;
  uniqueWinRate: number | null;
}): SignalStatEntry {
  const todayStatus: TodayStatus =
    row.recommendationCount > 0 && row.validTodayCount === 0 && row.todayWinRate === null
      ? "PENDING"
      : "READY";

  const weekStatus: WeekStatus = row.valid7dCount === 0 ? "ACCUMULATING" : "READY";

  return {
    recommendationCount: row.recommendationCount,
    validTodayCount: row.validTodayCount,
    todayWinCount: row.todayWinCount,
    todayLossCount: row.todayLossCount,
    todayFlatCount: row.todayFlatCount,
    todayWinRate: row.todayWinRate,
    avgTodayReturnPct: row.avgTodayReturnPct,
    bestTodayReturnPct: row.bestTodayReturnPct,
    worstTodayReturnPct: row.worstTodayReturnPct,
    bigUpTodayCount: row.bigUpTodayCount,
    smallUpTodayCount: row.smallUpTodayCount,
    smallDownTodayCount: row.smallDownTodayCount,
    bigDownTodayCount: row.bigDownTodayCount,
    todayStatus,
    valid7dCount: row.valid7dCount,
    win7dCount: row.win7dCount,
    loss7dCount: row.loss7dCount,
    flat7dCount: row.flat7dCount,
    win7dRate: row.win7dRate,
    avg7dReturnPct: row.avg7dReturnPct,
    best7dReturnPct: row.best7dReturnPct,
    worst7dReturnPct: row.worst7dReturnPct,
    bigUp7dCount: row.bigUp7dCount,
    smallUp7dCount: row.smallUp7dCount,
    smallDown7dCount: row.smallDown7dCount,
    bigDown7dCount: row.bigDown7dCount,
    weekStatus,
    uniqueSymbolCount: row.uniqueSymbolCount,
    uniqueWinCount: row.uniqueWinCount,
    uniqueWinRate: row.uniqueWinRate,
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
      bestTodayReturnPct: true,
      worstTodayReturnPct: true,
      bigUpTodayCount: true,
      smallUpTodayCount: true,
      smallDownTodayCount: true,
      bigDownTodayCount: true,
      valid7dCount: true,
      win7dCount: true,
      loss7dCount: true,
      flat7dCount: true,
      win7dRate: true,
      avg7dReturnPct: true,
      best7dReturnPct: true,
      worst7dReturnPct: true,
      bigUp7dCount: true,
      smallUp7dCount: true,
      smallDown7dCount: true,
      bigDown7dCount: true,
      uniqueSymbolCount: true,
      uniqueWinCount: true,
      uniqueWinRate: true,
    },
  });

  const byDate = new Map<string, AISignalDayStats>();
  for (const row of rows) {
    const d = row.tradeDate.toISOString().slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, { tradeDate: d, STRONG_BUY: null, BUY: null, ALL_BUY: null });
    const day = byDate.get(d)!;
    if (row.actionType === "STRONG_BUY") day.STRONG_BUY = toEntry(row);
    else if (row.actionType === "BUY") day.BUY = toEntry(row);
    else if (row.actionType === "ALL_BUY") day.ALL_BUY = toEntry(row);
  }

  return NextResponse.json(Array.from(byDate.values()));
}
