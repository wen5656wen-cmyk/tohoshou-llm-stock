import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Types ──────────────────────────────────────────────────────────────────────

export type SnapshotSummary = {
  id: number;
  snapshotDate: string;
  name: string;
  initialCapital: number;
  cash: number;
  investedAmount: number;
  positionCount: number;
  status: string;
  // real-time computed
  currentMarketValue: number;
  totalAssets: number;
  unrealizedPnl: number;
  returnPct: number;
  updatedAt: string;
};

// ── GET — list all snapshots with real-time metrics ────────────────────────────

export async function GET() {
  const snapshots = await prisma.portfolioSnapshot.findMany({
    orderBy: { snapshotDate: "desc" },
    include: {
      positions: {
        select: { symbol: true, shares: true, entryAmount: true },
      },
    },
  });

  if (snapshots.length === 0) {
    return NextResponse.json([]);
  }

  // Collect all symbols across all snapshots for batch price fetch
  const allSymbols = [...new Set(snapshots.flatMap((s) => s.positions.map((p) => p.symbol)))];

  const scoreRows = await prisma.stockScore.findMany({
    where: { symbol: { in: allSymbols } },
    select: { symbol: true, latestClose: true },
  });
  const priceMap = new Map(scoreRows.map((r) => [r.symbol, r.latestClose ?? 0]));

  const result: SnapshotSummary[] = snapshots.map((snap) => {
    let currentMarketValue = 0;
    for (const pos of snap.positions) {
      const px = priceMap.get(pos.symbol) ?? 0;
      currentMarketValue += px * pos.shares;
    }
    const totalAssets = snap.cash + currentMarketValue;
    const unrealizedPnl = totalAssets - snap.initialCapital;
    const returnPct = snap.initialCapital > 0 ? (unrealizedPnl / snap.initialCapital) * 100 : 0;

    return {
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
    };
  });

  return NextResponse.json(result);
}

// ── POST — trigger snapshot creation for today (idempotent) ───────────────────

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";

  const todayJST = new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replace(/\//g, "-");

  const targetDate = new Date(todayJST + "T00:00:00.000Z");
  const INITIAL_CAPITAL = 100_000_000;
  const LOT_SIZE = 100;
  const VALID_RATINGS = new Set(["BUY", "STRONG_BUY"]);

  // Check existing
  const existing = await prisma.portfolioSnapshot.findUnique({
    where: { snapshotDate: targetDate },
    select: { id: true },
  });

  if (existing && !force) {
    return NextResponse.json({ skipped: true, message: "today snapshot already exists", id: existing.id });
  }

  if (existing && force) {
    await prisma.portfolioSnapshot.delete({ where: { id: existing.id } });
  }

  // Query today's DailyRecommendation
  const recs = await prisma.dailyRecommendation.findMany({
    where: { date: targetDate },
    orderBy: { gptRank: "asc" },
  });

  if (recs.length === 0) {
    return NextResponse.json({ error: "no_daily_recommendation" }, { status: 422 });
  }

  const eligible = recs
    .filter(
      (r) =>
        (r.gptRating != null && VALID_RATINGS.has(r.gptRating)) ||
        (r.recommendation != null && VALID_RATINGS.has(r.recommendation))
    )
    .slice(0, 10);

  if (eligible.length === 0) {
    return NextResponse.json({ error: "no_buy_candidates" }, { status: 422 });
  }

  const symbols = eligible.map((r) => r.symbol);
  const budgetPerStock = INITIAL_CAPITAL / eligible.length;

  const [scoreRows, stockRows] = await Promise.all([
    prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, latestClose: true },
    }),
    prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, name: true, nameZh: true },
    }),
  ]);

  const scoreMap = new Map(scoreRows.map((s) => [s.symbol, s.latestClose]));
  const stockNameMap = new Map(stockRows.map((s) => [s.symbol, s]));

  type Pos = {
    symbol: string; name: string; nameZh: string | null;
    entryPrice: number; shares: number; entryAmount: number;
    gptRank: number; aiScore: number | null; action: string | null; recommendation: string | null;
  };

  const positions: Pos[] = [];
  for (const rec of eligible) {
    const entryPrice = rec.buyPrice ?? scoreMap.get(rec.symbol) ?? null;
    if (!entryPrice || entryPrice <= 0) continue;
    const shares = Math.floor(budgetPerStock / entryPrice / LOT_SIZE) * LOT_SIZE;
    if (shares < LOT_SIZE) continue;
    const info = stockNameMap.get(rec.symbol);
    positions.push({
      symbol: rec.symbol,
      name: info?.name ?? rec.symbol,
      nameZh: info?.nameZh ?? null,
      entryPrice,
      shares,
      entryAmount: entryPrice * shares,
      gptRank: rec.gptRank,
      aiScore: rec.finalScore ?? null,
      action: rec.gptRating ?? null,
      recommendation: rec.recommendation ?? null,
    });
  }

  if (positions.length === 0) {
    return NextResponse.json({ error: "no_valid_positions" }, { status: 422 });
  }

  const investedAmount = positions.reduce((s, p) => s + p.entryAmount, 0);
  const cash = INITIAL_CAPITAL - investedAmount;

  const snapshot = await prisma.portfolioSnapshot.create({
    data: {
      snapshotDate: targetDate,
      name: `${todayJST} AI組合`,
      initialCapital: INITIAL_CAPITAL,
      cash,
      investedAmount,
      positionCount: positions.length,
      sourceRecommendationDate: targetDate,
      status: "LIVE",
      positions: { create: positions },
    },
    include: { positions: { select: { id: true } } },
  });

  return NextResponse.json({
    created: true,
    id: snapshot.id,
    date: todayJST,
    positionCount: snapshot.positions.length,
    investedAmount,
    cash,
  }, { status: 201 });
}
