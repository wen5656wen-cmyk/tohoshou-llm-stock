import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveSnapshotPrices,
  type ValuationStatus,
  type PriceSource,
} from "@/lib/snapshot-valuation";
import type { StrategyStats } from "@/app/api/portfolio/snapshots/route";

// ── Types ──────────────────────────────────────────────────────────────────────

export type SnapshotPosition = {
  id: number;
  symbol: string;
  name: string;
  nameZh: string | null;
  entryPrice: number;
  shares: number;
  entryAmount: number;
  gptRank: number | null;
  aiScore: number | null;
  action: string | null;
  recommendation: string | null;
  // v17.1: strategy fields
  strategyType: string | null;
  allocationWeight: number | null;
  strategyAllocationPct: number | null;
  targetReturnPct: number | null;
  stopLossPct: number | null;
  maxHoldingDays: number | null;
  // real-time
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  returnPct: number | null;
  priceSource: PriceSource;
};

export type SnapshotDetail = {
  id: number;
  snapshotDate: string;
  name: string;
  initialCapital: number;
  cash: number;
  investedAmount: number;
  positionCount: number;
  status: string;
  completedAt: string | null;
  // real-time
  currentMarketValue: number;
  totalAssets: number;
  unrealizedPnl: number;
  returnPct: number;
  updatedAt: string;
  // holding & benchmark
  holdingDays: number;
  benchmarkTopixEntry: number | null;
  benchmarkTopixCurrent: number | null;
  benchmarkTopixReturnPct: number | null;
  alphaVsTopix: number | null;
  isOutperformingTopix: boolean | null;
  // valuation metadata
  valuationStatus: ValuationStatus;
  // v17.1: strategy allocation
  isLegacy: boolean;
  strategyStats: StrategyStats[];
  unallocatedCashPct: number;
  positions: SnapshotPosition[];
};

// ── GET /api/portfolio/snapshots/[date] ────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const dateObj = new Date(date + "T00:00:00.000Z");

  const snap = await prisma.portfolioSnapshot.findUnique({
    where: { snapshotDate: dateObj },
    include: {
      positions: {
        orderBy: [{ gptRank: "asc" }, { symbol: "asc" }],
        select: {
          id: true,
          symbol: true,
          name: true,
          nameZh: true,
          entryPrice: true,
          shares: true,
          entryAmount: true,
          gptRank: true,
          aiScore: true,
          action: true,
          recommendation: true,
          strategyType: true,
          allocationWeight: true,
          strategyAllocationPct: true,
          targetReturnPct: true,
          stopLossPct: true,
          maxHoldingDays: true,
        },
      },
    },
  });

  if (!snap) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const positionInputs = snap.positions.map((p) => ({
    symbol: p.symbol,
    entryPrice: p.entryPrice,
  }));

  // Real-time prices via resolveSnapshotPrices + latest TOPIX (parallel)
  const [{ prices: priceMap, valuationStatus }, topixRow] = await Promise.all([
    resolveSnapshotPrices(positionInputs),
    prisma.globalMarket.findFirst({
      where: { topix: { not: null } },
      orderBy: { date: "desc" },
      select: { topix: true },
    }),
  ]);

  const benchmarkTopixCurrent = topixRow?.topix ?? null;

  let currentMarketValue = 0;
  const positions: SnapshotPosition[] = snap.positions.map((pos) => {
    const resolved = priceMap.get(pos.symbol);
    const currentPrice = resolved?.currentPrice ?? null;
    const priceSource: PriceSource = resolved?.priceSource ?? "ENTRY_PRICE";

    const marketValue = currentPrice != null ? currentPrice * pos.shares : null;
    const unrealizedPnl = marketValue != null ? marketValue - pos.entryAmount : null;
    const returnPct =
      pos.entryAmount > 0 && unrealizedPnl != null
        ? (unrealizedPnl / pos.entryAmount) * 100
        : null;

    if (marketValue != null) currentMarketValue += marketValue;
    else currentMarketValue += pos.entryAmount; // fallback to cost

    return {
      id: pos.id,
      symbol: pos.symbol,
      name: pos.name,
      nameZh: pos.nameZh,
      entryPrice: pos.entryPrice,
      shares: pos.shares,
      entryAmount: pos.entryAmount,
      gptRank: pos.gptRank,
      aiScore: pos.aiScore,
      action: pos.action,
      recommendation: pos.recommendation,
      strategyType: pos.strategyType,
      allocationWeight: pos.allocationWeight,
      strategyAllocationPct: pos.strategyAllocationPct,
      targetReturnPct: pos.targetReturnPct,
      stopLossPct: pos.stopLossPct,
      maxHoldingDays: pos.maxHoldingDays,
      currentPrice,
      marketValue,
      unrealizedPnl,
      returnPct,
      priceSource,
    };
  });

  const totalAssets = snap.cash + currentMarketValue;
  const unrealizedPnl = totalAssets - snap.initialCapital;
  const returnPct =
    snap.initialCapital > 0 ? (unrealizedPnl / snap.initialCapital) * 100 : 0;
  const holdingDays = Math.floor(
    (Date.now() - snap.snapshotDate.getTime()) / 86_400_000
  );

  const benchmarkTopixEntry = snap.benchmarkTopixEntry ?? null;
  const benchmarkTopixReturnPct =
    benchmarkTopixEntry != null &&
    benchmarkTopixCurrent != null &&
    benchmarkTopixEntry > 0
      ? ((benchmarkTopixCurrent - benchmarkTopixEntry) / benchmarkTopixEntry) * 100
      : null;
  const alphaVsTopix =
    benchmarkTopixReturnPct != null ? returnPct - benchmarkTopixReturnPct : null;
  const isOutperformingTopix =
    alphaVsTopix != null ? alphaVsTopix > 0 : null;

  // v17.1: strategy stats
  const isLegacy = snap.positions.every((p) => !p.strategyType);

  const strategyStats: StrategyStats[] = [];
  if (!isLegacy) {
    for (const st of ["DAY", "SWING", "POSITION"] as const) {
      const stPositions = snap.positions.filter((p) => p.strategyType === st);
      if (stPositions.length === 0) continue;
      const totalStrategyEntry = stPositions.reduce((s, p) => s + p.entryAmount, 0);
      const actualEntryPct = snap.investedAmount > 0 ? totalStrategyEntry / snap.investedAmount : 0;

      let sumPnl = 0, pricedCount = 0, winCount = 0, openCount = 0;
      for (const pos of stPositions) {
        const resolved = priceMap.get(pos.symbol);
        const px = resolved?.currentPrice ?? null;
        if (px != null) {
          const mv = px * pos.shares;
          sumPnl += mv - pos.entryAmount;
          pricedCount++;
          if (mv > pos.entryAmount) winCount++;
        } else {
          openCount++;
        }
      }
      const pricedPositions = stPositions.filter((p) => {
        const r = priceMap.get(p.symbol);
        return r?.currentPrice != null;
      });
      const currentReturnPct = pricedCount > 0
        ? (sumPnl / pricedPositions.reduce((s, p) => s + p.entryAmount, 0)) * 100
        : null;
      const winRate = pricedCount > 0 ? (winCount / pricedCount) * 100 : null;
      const targetAllocationPct = st === "DAY" ? 0.30 : st === "SWING" ? 0.40 : 0.30;

      strategyStats.push({
        strategyType: st,
        targetAllocationPct,
        positionCount: stPositions.length,
        actualEntryPct,
        currentReturnPct,
        winRate,
        openCount,
      });
    }
  }

  const unallocatedCashPct = snap.initialCapital > 0 ? snap.cash / snap.initialCapital : 0;

  const result: SnapshotDetail = {
    id: snap.id,
    snapshotDate: snap.snapshotDate.toISOString().slice(0, 10),
    name: snap.name,
    initialCapital: snap.initialCapital,
    cash: snap.cash,
    investedAmount: snap.investedAmount,
    positionCount: snap.positionCount,
    status: snap.status,
    completedAt: snap.completedAt?.toISOString() ?? null,
    currentMarketValue,
    totalAssets,
    unrealizedPnl,
    returnPct,
    updatedAt: snap.updatedAt.toISOString(),
    holdingDays,
    benchmarkTopixEntry,
    benchmarkTopixCurrent,
    benchmarkTopixReturnPct,
    alphaVsTopix,
    isOutperformingTopix,
    valuationStatus,
    isLegacy,
    strategyStats,
    unallocatedCashPct,
    positions,
  };

  return NextResponse.json(result);
}
