import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PortfolioPosition = {
  symbol: string;
  name: string;
  gptRank: number;
  gptRating: string | null;
  entryPrice: number | null;
  currentPrice: number | null;
  shares: number;
  currentValue: number | null;
  returnPct: number | null;
  aiSuggestion: string;
  daysHeld: number | null;
  entryDate: string | null;
};

export type PortfolioSummary = {
  cohortDate: string;
  initialCapital: number;
  currentValue: number;
  returnPct: number;
  topixBaseline: number | null;
  topixCurrent: number | null;
  topixReturnPct: number | null;
  alpha: number | null;
  winRate: number;
  maxDrawdown: null;
  positions: PortfolioPosition[];
};

// ── AI suggestion logic ────────────────────────────────────────────────────────

function getAiSuggestion(returnPct: number | null, gptRating: string | null): string {
  if (returnPct != null && returnPct > 15) return "REDUCE";
  if (returnPct != null && returnPct < -8)  return "SELL";
  if (gptRating === "STRONG_BUY") return "ADD";
  if (gptRating === "BUY")        return "HOLD";
  if (gptRating === "WATCH")      return "REDUCE";
  if (gptRating === "AVOID")      return "SELL";
  return "HOLD";
}

// ── GET handler ────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Find latest cohort date
    const latestRec = await prisma.dailyRecommendation.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    });

    if (!latestRec) {
      return NextResponse.json({ error: "no_data" }, { status: 404 });
    }

    const cohortDate = latestRec.date;

    // 2. Get Top10 by gptRank for that date
    const top10 = await prisma.dailyRecommendation.findMany({
      where: { date: cohortDate, gptRank: { lte: 10 } },
      orderBy: { gptRank: "asc" },
      take: 10,
    });

    if (top10.length === 0) {
      return NextResponse.json({ error: "no_top10" }, { status: 404 });
    }

    const symbols = top10.map((r) => r.symbol);
    const cohortDateStr = cohortDate.toISOString().slice(0, 10);

    // 3. Get stock names
    const stocks = await prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, name: true, nameZh: true },
    });
    const nameMap = new Map(stocks.map((s) => [s.symbol, s.nameZh ?? s.name]));

    // 4. Get latest prices (last 14 days)
    const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const prices = await prisma.dailyPrice.findMany({
      where: { symbol: { in: symbols }, date: { gte: cutoff } },
      orderBy: { date: "desc" },
    });

    // Build latest price map (adjClose ?? close)
    const priceMap = new Map<string, number>();
    for (const p of prices) {
      if (!priceMap.has(p.symbol)) {
        priceMap.set(p.symbol, p.adjClose ?? p.close);
      }
    }

    // 5. Get TOPIX baseline (GlobalMarket.topix on/nearest cohortDate) and latest TOPIX
    const topixBaseRow = await prisma.globalMarket.findFirst({
      where: { date: { lte: cohortDate }, topix: { not: null } },
      orderBy: { date: "desc" },
      select: { topix: true },
    });
    const topixLatestRow = await prisma.globalMarket.findFirst({
      where: { topix: { not: null } },
      orderBy: { date: "desc" },
      select: { topix: true },
    });

    const topixBaseline = topixBaseRow?.topix ?? null;
    const topixCurrent = topixLatestRow?.topix ?? null;
    const topixReturnPct =
      topixBaseline != null && topixCurrent != null && topixBaseline > 0
        ? ((topixCurrent - topixBaseline) / topixBaseline) * 100
        : null;

    // 6. Build positions
    const INITIAL_CAPITAL = 100_000_000;
    const ALLOC_PER_STOCK = 10_000_000;

    const positions: PortfolioPosition[] = top10.map((rec) => {
      const entryPx = rec.entryPrice ?? rec.buyPrice ?? null;
      const currentPx = priceMap.get(rec.symbol) ?? null;
      const shares = entryPx != null && entryPx > 0 ? Math.floor(ALLOC_PER_STOCK / entryPx) : 0;
      const currentValue = shares > 0 && currentPx != null ? shares * currentPx : null;

      const returnPct =
        entryPx != null && entryPx > 0 && currentPx != null
          ? ((currentPx - entryPx) / entryPx) * 100
          : null;

      const entryDate = rec.entryDate
        ? rec.entryDate.toISOString().slice(0, 10)
        : null;
      const daysHeld =
        entryDate != null
          ? Math.floor((Date.now() - new Date(entryDate).getTime()) / 86400000)
          : null;

      return {
        symbol: rec.symbol,
        name: nameMap.get(rec.symbol) ?? rec.symbol,
        gptRank: rec.gptRank,
        gptRating: rec.gptRating ?? null,
        entryPrice: entryPx,
        currentPrice: currentPx,
        shares,
        currentValue,
        returnPct,
        aiSuggestion: getAiSuggestion(returnPct, rec.gptRating ?? null),
        daysHeld,
        entryDate,
      };
    });

    // 7. Compute portfolio summary
    let totalCurrentValue = 0;
    let withPriceCnt = 0;
    let winCnt = 0;

    for (const pos of positions) {
      if (pos.currentValue != null) {
        totalCurrentValue += pos.currentValue;
        withPriceCnt++;
        if ((pos.returnPct ?? 0) > 0) winCnt++;
      } else {
        // Use initial allocation as fallback
        totalCurrentValue += ALLOC_PER_STOCK;
      }
    }

    const returnPct = ((totalCurrentValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
    const winRate = withPriceCnt > 0 ? (winCnt / withPriceCnt) * 100 : 0;
    const alpha = returnPct != null && topixReturnPct != null ? returnPct - topixReturnPct : null;

    const summary: PortfolioSummary = {
      cohortDate: cohortDateStr,
      initialCapital: INITIAL_CAPITAL,
      currentValue: Math.round(totalCurrentValue),
      returnPct,
      topixBaseline,
      topixCurrent,
      topixReturnPct,
      alpha,
      winRate,
      maxDrawdown: null,
      positions,
    };

    return NextResponse.json(summary);
  } catch (err) {
    console.error("[portfolio/summary] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
