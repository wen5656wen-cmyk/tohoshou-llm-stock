import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  // real-time
  currentMarketValue: number;
  totalAssets: number;
  unrealizedPnl: number;
  returnPct: number;
  updatedAt: string;
  positions: SnapshotPosition[];
};

// ── GET /api/portfolio/snapshots/[date] ────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;

  // Accept YYYY-MM-DD format
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

  const symbols = snap.positions.map((p) => p.symbol);

  // Real-time prices from StockScore.latestClose
  const scoreRows = await prisma.stockScore.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, latestClose: true },
  });
  const priceMap = new Map(scoreRows.map((r) => [r.symbol, r.latestClose]));

  let currentMarketValue = 0;
  const positions: SnapshotPosition[] = snap.positions.map((pos) => {
    const currentPrice = priceMap.get(pos.symbol) ?? null;
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
    };
  });

  const totalAssets = snap.cash + currentMarketValue;
  const unrealizedPnl = totalAssets - snap.initialCapital;
  const returnPct = snap.initialCapital > 0 ? (unrealizedPnl / snap.initialCapital) * 100 : 0;

  const result: SnapshotDetail = {
    id: snap.id,
    snapshotDate: snap.snapshotDate.toISOString().slice(0, 10),
    name: snap.name,
    initialCapital: snap.initialCapital,
    cash: snap.cash,
    investedAmount: snap.investedAmount,
    positionCount: snap.positionCount,
    status: snap.status,
    currentMarketValue,
    totalAssets,
    unrealizedPnl,
    returnPct,
    updatedAt: snap.updatedAt.toISOString(),
    positions,
  };

  return NextResponse.json(result);
}
