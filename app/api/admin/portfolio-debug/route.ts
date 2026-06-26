import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveSnapshotPrices,
  type PriceSource,
  type ValuationStatus,
} from "@/lib/snapshot-valuation";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

type PositionDebug = {
  symbol: string;
  name: string;
  entryPrice: number;
  currentPrice: number | null;
  priceSource: PriceSource;
  returnPct: number | null;
  shares: number;
  entryAmount: number;
  marketValue: number | null;
  warnings: string[];
};

type SnapshotDebug = {
  id: number;
  snapshotDate: string;
  valuationStatus: ValuationStatus;
  positionsTotal: number;
  positionsWithRealPrice: number;
  positionsStale: number;
  positionsFallback: number;
  portfolioReturnPct: number;
  alphaVsTopix: number | null;
  winRateWithPrice: number | null;
  benchmarkTopixEntry: number | null;
  benchmarkTopixCurrent: number | null;
  warnings: string[];
  positions: PositionDebug[];
};

type PortfolioDebugResponse = {
  generatedAt: string;
  snapshotCount: number;
  dataSourceNotes: string[];
  snapshots: SnapshotDebug[];
};

// ── GET handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 30);

  const [snapshots, topixRow] = await Promise.all([
    prisma.portfolioSnapshot.findMany({
      orderBy: { snapshotDate: "desc" },
      take: limit,
      include: {
        positions: {
          orderBy: [{ gptRank: "asc" }, { symbol: "asc" }],
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
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      snapshotCount: 0,
      dataSourceNotes: [],
      snapshots: [],
    } satisfies PortfolioDebugResponse);
  }

  const benchmarkTopixCurrent = topixRow?.topix ?? null;

  // Collect all unique symbols across snapshots for one-shot price resolution
  const allPositionInputs = snapshots.flatMap((s) =>
    s.positions.map((p) => ({ symbol: p.symbol, entryPrice: p.entryPrice }))
  );
  const uniqueInputs = [...new Map(allPositionInputs.map((p) => [p.symbol, p])).values()];

  const { prices: priceMap, valuationStatus: globalStatus } =
    await resolveSnapshotPrices(uniqueInputs);

  const result: SnapshotDebug[] = snapshots.map((snap) => {
    const snapWarnings: string[] = [];
    const positions: PositionDebug[] = [];

    let currentMarketValue = 0;
    let positionsWithRealPrice = 0;
    let positionsStale = 0;
    let positionsFallback = 0;
    let winCount = 0;
    let priceCount = 0;
    const sourceCounts = new Map<PriceSource, number>();

    for (const pos of snap.positions) {
      const resolved = priceMap.get(pos.symbol);
      const currentPrice = resolved?.currentPrice ?? null;
      const priceSource: PriceSource = resolved?.priceSource ?? "ENTRY_PRICE";
      sourceCounts.set(priceSource, (sourceCounts.get(priceSource) ?? 0) + 1);

      const marketValue = currentPrice != null ? currentPrice * pos.shares : null;
      const unrealizedPnl = marketValue != null ? marketValue - pos.entryAmount : null;
      const returnPct =
        pos.entryAmount > 0 && unrealizedPnl != null
          ? (unrealizedPnl / pos.entryAmount) * 100
          : null;

      if (marketValue != null) currentMarketValue += marketValue;
      else currentMarketValue += pos.entryAmount;

      const posWarnings: string[] = [];
      if (priceSource === "ENTRY_PRICE") {
        positionsFallback++;
        posWarnings.push("price_unavailable: using entry price as fallback, return = 0%");
      } else if (priceSource === "STOCK_SCORE") {
        positionsStale++;
        posWarnings.push("price_stale: using StockScore.latestClose (may be T-1 or older)");
      } else {
        positionsWithRealPrice++;
        if (returnPct != null) {
          priceCount++;
          if (returnPct > 0) winCount++;
        }
      }

      if (pos.entryPrice <= 0) posWarnings.push("entry_price_invalid: entryPrice <= 0");
      if (Math.abs(pos.entryAmount - pos.entryPrice * pos.shares) > 1) {
        posWarnings.push("entry_amount_mismatch: entryAmount != entryPrice × shares");
      }

      positions.push({
        symbol: pos.symbol,
        name: pos.name,
        entryPrice: pos.entryPrice,
        currentPrice,
        priceSource,
        returnPct,
        shares: pos.shares,
        entryAmount: pos.entryAmount,
        marketValue,
        warnings: posWarnings,
      });
    }

    const totalAssets = snap.cash + currentMarketValue;
    const unrealizedPnl = totalAssets - snap.initialCapital;
    const portfolioReturnPct =
      snap.initialCapital > 0 ? (unrealizedPnl / snap.initialCapital) * 100 : 0;

    const benchmarkTopixEntry = snap.benchmarkTopixEntry ?? null;
    const benchmarkTopixReturnPct =
      benchmarkTopixEntry != null && benchmarkTopixCurrent != null && benchmarkTopixEntry > 0
        ? ((benchmarkTopixCurrent - benchmarkTopixEntry) / benchmarkTopixEntry) * 100
        : null;
    const alphaVsTopix = benchmarkTopixReturnPct != null ? portfolioReturnPct - benchmarkTopixReturnPct : null;
    const winRateWithPrice = priceCount > 0 ? (winCount / priceCount) * 100 : null;

    // Snapshot-level warnings
    if (benchmarkTopixEntry == null) {
      snapWarnings.push("topix_missing: benchmarkTopixEntry is null — alpha cannot be computed. (Fix: cron uses script which records TOPIX; API POST endpoint now also records it)");
    }
    if (positionsFallback > 0) {
      snapWarnings.push(`price_fallback: ${positionsFallback} position(s) using entry price (0% return assumed)`);
    }
    if (positionsStale > 0) {
      snapWarnings.push(`price_stale: ${positionsStale} position(s) using StockScore.latestClose`);
    }
    if (snap.positionCount !== snap.positions.length) {
      snapWarnings.push(`position_count_mismatch: positionCount=${snap.positionCount} but actual positions=${snap.positions.length}`);
    }

    // Determine per-snapshot valuation status
    const sources = [...sourceCounts.keys()];
    const valuationStatus: ValuationStatus = sources.includes("YAHOO_REALTIME")
      ? "INTRADAY"
      : sources.includes("DAILY_PRICE")
      ? "CLOSED"
      : sources.includes("STOCK_SCORE")
      ? "STALE"
      : "FALLBACK";

    return {
      id: snap.id,
      snapshotDate: snap.snapshotDate.toISOString().slice(0, 10),
      valuationStatus,
      positionsTotal: snap.positions.length,
      positionsWithRealPrice,
      positionsStale,
      positionsFallback,
      portfolioReturnPct,
      alphaVsTopix,
      winRateWithPrice,
      benchmarkTopixEntry,
      benchmarkTopixCurrent,
      warnings: snapWarnings,
      positions,
    };
  });

  const dataSourceNotes = [
    "entryPrice source: DailyRecommendation.buyPrice (StockScore.latestClose at rec creation time)",
    "currentPrice priority: Yahoo Realtime (JST 09:00-15:30) → DailyPrice.adjClose (latest ≤5d) → StockScore.latestClose → entryPrice fallback",
    "returnPct = (currentPrice - entryPrice) / entryPrice * 100 per position",
    "portfolioReturnPct = (sum(currentPrice×shares) + cash - initialCapital) / initialCapital (positions without price contribute 0% PnL)",
    "winRateWithPrice: only counts positions with YAHOO_REALTIME or DAILY_PRICE source",
    "alpha = portfolioReturnPct - TOPIXReturnPct; requires benchmarkTopixEntry to be set at snapshot creation",
    "3:4:3 strategy allocation NOT tracked in PortfolioSnapshotPosition — snapshot uses equal-weight top10",
    `globalValuationStatus: ${globalStatus}`,
  ];

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    snapshotCount: result.length,
    dataSourceNotes,
    snapshots: result,
  } satisfies PortfolioDebugResponse);
}
