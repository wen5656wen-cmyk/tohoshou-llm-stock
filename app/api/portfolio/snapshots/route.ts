// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
import { guardAdminRoute } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveSnapshotPrices,
  type ValuationStatus,
  type PriceSource,
} from "@/lib/snapshot-valuation";
import {
  buildStrategyAllocations,
} from "@/lib/portfolio/snapshot-builder";

// ── Types ──────────────────────────────────────────────────────────────────────

export type StrategyStats = {
  strategyType: "DAY" | "SWING" | "POSITION";
  targetAllocationPct: number;
  positionCount: number;
  actualEntryPct: number;
  currentReturnPct: number | null;
  winRate: number | null;
  openCount: number;
};

export type SnapshotSummary = {
  id: number;
  snapshotDate: string;
  name: string;
  initialCapital: number;
  cash: number;
  investedAmount: number;
  positionCount: number;
  status: string;
  completedAt: string | null;
  // real-time computed
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
  // dominant price source (most common among positions, for display)
  dominantPriceSource: PriceSource;
  // v17.1: strategy allocation
  isLegacy: boolean;
  strategyStats: StrategyStats[];
  unallocatedCashPct: number;
};

// ── GET — list all snapshots with real-time metrics ────────────────────────────

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const [snapshots, topixRow] = await Promise.all([
    prisma.portfolioSnapshot.findMany({
      orderBy: { snapshotDate: "desc" },
      include: {
        positions: {
          select: {
            symbol: true,
            shares: true,
            entryAmount: true,
            entryPrice: true,
            strategyType: true,
            allocationWeight: true,
            strategyAllocationPct: true,
          },
        },
      },
    }),
    prisma.globalMarket.findFirst({
      where: { topix: { not: null } },
      orderBy: { date: "desc" },
      select: { topix: true },
    }),
  ]);

  if (snapshots.length === 0) {
    return NextResponse.json([]);
  }

  const benchmarkTopixCurrent = topixRow?.topix ?? null;

  // Collect all unique symbols across all snapshots for one-shot price resolution
  const allPositionInputs = snapshots.flatMap((s) =>
    s.positions.map((p) => ({ symbol: p.symbol, entryPrice: p.entryPrice }))
  );
  const uniqueSymbolInputs = [
    ...new Map(allPositionInputs.map((p) => [p.symbol, p])).values(),
  ];

  const { prices: priceMap, valuationStatus: globalValuationStatus } =
    await resolveSnapshotPrices(uniqueSymbolInputs);

  const now = Date.now();

  const result: SnapshotSummary[] = snapshots.map((snap) => {
    let currentMarketValue = 0;
    const sourceCounts = new Map<PriceSource, number>();

    for (const pos of snap.positions) {
      const resolved = priceMap.get(pos.symbol);
      const px = resolved?.currentPrice ?? pos.entryPrice;
      currentMarketValue += px * pos.shares;

      const src = resolved?.priceSource ?? "ENTRY_PRICE";
      sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
    }

    const totalAssets = snap.cash + currentMarketValue;
    const unrealizedPnl = totalAssets - snap.initialCapital;
    const returnPct =
      snap.initialCapital > 0 ? (unrealizedPnl / snap.initialCapital) * 100 : 0;
    const holdingDays = Math.floor(
      (now - snap.snapshotDate.getTime()) / 86_400_000
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
    const isOutperformingTopix = alphaVsTopix != null ? alphaVsTopix > 0 : null;

    // Per-snapshot valuation status based on its own positions' sources
    const snapSources = [...sourceCounts.keys()];
    const snapValuationStatus: ValuationStatus = snapSources.includes("YAHOO_REALTIME")
      ? "INTRADAY"
      : snapSources.includes("DAILY_PRICE")
      ? "CLOSED"
      : snapSources.includes("STOCK_SCORE")
      ? "STALE"
      : "FALLBACK";

    // Dominant price source = the source with the most positions
    const dominantPriceSource: PriceSource =
      [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "ENTRY_PRICE";

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

    return {
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
      valuationStatus: snapValuationStatus,
      dominantPriceSource,
      isLegacy,
      strategyStats,
      unallocatedCashPct,
    };
  });

  // Suppress unused warning — globalValuationStatus available for monitoring
  void globalValuationStatus;

  return NextResponse.json(result);
}

// ── POST — trigger snapshot creation for today (idempotent) ───────────────────

export async function POST(req: NextRequest) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";

  const todayJST = new Date()
    .toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "-");

  const targetDate = new Date(todayJST + "T00:00:00.000Z");
  const INITIAL_CAPITAL = 100_000_000;
  const LOT_SIZE = 100;

  const existing = await prisma.portfolioSnapshot.findUnique({
    where: { snapshotDate: targetDate },
    select: { id: true },
  });

  if (existing && !force) {
    return NextResponse.json({
      skipped: true,
      message: "today snapshot already exists",
      id: existing.id,
    });
  }

  if (existing && force) {
    await prisma.portfolioSnapshot.delete({ where: { id: existing.id } });
  }

  const recs = await prisma.dailyRecommendation.findMany({
    where: { date: targetDate },
    orderBy: { gptRank: "asc" },
  });

  if (recs.length === 0) {
    return NextResponse.json({ error: "no_daily_recommendation" }, { status: 422 });
  }

  // 3:4:3 allocation
  const { allocations, warnings: allocationWarnings } = buildStrategyAllocations(recs, INITIAL_CAPITAL);

  if (allocations.length === 0) {
    return NextResponse.json({ error: "no_buy_candidates" }, { status: 422 });
  }

  const symbols = allocations.map((a) => a.symbol);

  const [scoreRows, stockRows, topixRow] = await Promise.all([
    prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, latestClose: true },
    }),
    prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, name: true, nameZh: true },
    }),
    prisma.globalMarket.findFirst({
      where: { topix: { not: null } },
      orderBy: { date: "desc" },
      select: { topix: true },
    }),
  ]);

  const scoreMap = new Map(scoreRows.map((s) => [s.symbol, s.latestClose]));
  const stockNameMap = new Map(stockRows.map((s) => [s.symbol, s]));
  const benchmarkTopixEntry = topixRow?.topix ?? null;
  const recMap = new Map(recs.map((r) => [r.symbol, r]));

  type Pos = {
    symbol: string;
    name: string;
    nameZh: string | null;
    entryPrice: number;
    shares: number;
    entryAmount: number;
    gptRank: number;
    aiScore: number | null;
    action: string | null;
    recommendation: string | null;
    strategyType: string;
    allocationWeight: number;
    strategyAllocationPct: number;
    strategyConfidence: number;
    targetReturnPct: number;
    stopLossPct: number;
    maxHoldingDays: number;
  };

  const positions: Pos[] = [];
  for (const alloc of allocations) {
    const rec = recMap.get(alloc.symbol);
    const entryPrice = rec?.buyPrice ?? scoreMap.get(alloc.symbol) ?? null;
    if (!entryPrice || entryPrice <= 0) continue;
    const shares = Math.floor(alloc.budgetAmount / entryPrice / LOT_SIZE) * LOT_SIZE;
    if (shares < LOT_SIZE) continue;
    const info = stockNameMap.get(alloc.symbol);
    positions.push({
      symbol: alloc.symbol,
      name: info?.name ?? alloc.symbol,
      nameZh: info?.nameZh ?? null,
      entryPrice,
      shares,
      entryAmount: entryPrice * shares,
      gptRank: alloc.gptRank,
      aiScore: rec?.finalScore ?? null,
      action: rec?.gptRating ?? null,
      recommendation: rec?.recommendation ?? null,
      strategyType: alloc.strategyType,
      allocationWeight: alloc.allocationWeight,
      strategyAllocationPct: alloc.strategyAllocationPct,
      strategyConfidence: alloc.strategyConfidence,
      targetReturnPct: alloc.targetReturnPct,
      stopLossPct: alloc.stopLossPct,
      maxHoldingDays: alloc.maxHoldingDays,
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
      benchmarkTopixEntry,
      positions: { create: positions },
    },
    include: { positions: { select: { id: true } } },
  });

  return NextResponse.json(
    {
      created: true,
      id: snapshot.id,
      date: todayJST,
      positionCount: snapshot.positions.length,
      investedAmount,
      cash,
      allocationWarnings,
    },
    { status: 201 }
  );
}
