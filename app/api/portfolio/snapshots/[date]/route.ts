import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveSnapshotPrices,
  type ValuationStatus,
  type PriceSource,
} from "@/lib/snapshot-valuation";

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
    positions,
  };

  return NextResponse.json(result);
}
