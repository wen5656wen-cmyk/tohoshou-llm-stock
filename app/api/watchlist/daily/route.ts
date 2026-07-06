import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveQuotes } from "@/lib/daily-watchlist/pricing";
import { computeWatchlistStats, type StatRow } from "@/lib/daily-watchlist/stats";

export const dynamic = "force-dynamic";

/**
 * GET /api/watchlist/daily?date=YYYY-MM-DD
 * Returns the day's AI watchlist pool with LIVE-recomputed price/return
 * (from existing StockScore + DailyPrice — no external API), plus stats and the
 * list of available dates for the date switcher. Read-only.
 */
export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");

  // available dates (for the switcher)
  const dateRows = await prisma.dailyAIWatchlist.findMany({
    distinct: ["date"],
    select: { date: true },
    orderBy: { date: "desc" },
    take: 90,
  });
  const availableDates = dateRows.map((r) => r.date.toISOString().slice(0, 10));

  // resolve target date: explicit param → else latest available → else today (empty)
  let date: Date;
  if (dateParam) {
    date = new Date(dateParam + "T00:00:00.000Z");
  } else if (dateRows.length > 0) {
    date = dateRows[0].date;
  } else {
    const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
    date = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));
  }
  const iso = date.toISOString().slice(0, 10);

  const rows = await prisma.dailyAIWatchlist.findMany({
    where: { date },
    orderBy: [{ rank: "asc" }, { score: "desc" }],
  });

  if (rows.length === 0) {
    return NextResponse.json({
      date: iso, availableDates, items: [],
      stats: computeWatchlistStats([]), generatedAt: new Date().toISOString(),
    });
  }

  const symbols = rows.map((r) => r.symbol);
  const quotes = await getLiveQuotes(prisma, symbols);

  const items = rows.map((r) => {
    const q = quotes.get(r.symbol);
    const currentPrice = q?.currentPrice ?? r.currentPrice ?? null;
    const changePct = q?.changePct ?? r.changePct ?? null;
    const returnPct =
      r.entryPrice != null && r.entryPrice > 0 && currentPrice != null
        ? ((currentPrice - r.entryPrice) / r.entryPrice) * 100
        : r.returnPct ?? null;
    return {
      id: r.id,
      symbol: r.symbol,
      name: r.name,
      recommendation: r.recommendation,
      rank: r.rank,
      score: r.score,
      entryPrice: r.entryPrice,
      currentPrice,
      changePct,
      returnPct,
      status: r.status,
      isStarred: r.isStarred,
      isMuted: r.isMuted,
      isFocus: r.isFocus,
      note: r.note,
    };
  });

  const statRows: StatRow[] = items.map((i) => ({
    symbol: i.symbol, name: i.name, recommendation: i.recommendation,
    returnPct: i.returnPct, changePct: i.changePct,
  }));

  return NextResponse.json({
    date: iso,
    availableDates,
    items,
    stats: computeWatchlistStats(statRows),
    generatedAt: new Date().toISOString(),
  });
}
