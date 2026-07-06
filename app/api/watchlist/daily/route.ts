import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveQuotes } from "@/lib/daily-watchlist/pricing";
import { fetchQuotesBatch } from "@/lib/yahoo";
import { computeWatchlistStats, type StatRow } from "@/lib/daily-watchlist/stats";

export const dynamic = "force-dynamic";

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
}

/**
 * GET /api/watchlist/daily?date=YYYY-MM-DD
 *
 * P6-T7.1 realtime board: current price / today's change / return-from-entry are
 * recomputed LIVE from a near-realtime Yahoo Finance batch quote (existing
 * capability, no new/paid API), with an EOD (StockScore + DailyPrice) fallback.
 * entryPrice stays frozen from generation. The quote provider is abstracted:
 * swapping it later requires NO page change (page reads quoteSource + the fields).
 *
 * Per item adds: intradayChangePct, returnPctFromEntry, quoteUpdatedAt,
 * quoteSource — old fields (currentPrice/changePct/returnPct) are preserved.
 */
export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get("date");

  const dateRows = await prisma.dailyAIWatchlist.findMany({
    distinct: ["date"], select: { date: true },
    orderBy: { date: "desc" }, take: 90,
  });
  const availableDates = dateRows.map((r) => r.date.toISOString().slice(0, 10));

  let date: Date;
  if (dateParam) date = new Date(dateParam + "T00:00:00.000Z");
  else if (dateRows.length > 0) date = dateRows[0].date;
  else {
    const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
    date = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));
  }
  const iso = date.toISOString().slice(0, 10);

  const rows = await prisma.dailyAIWatchlist.findMany({
    where: { date },
    orderBy: [{ rank: "asc" }, { score: "desc" }],
  });

  const nowIso = new Date().toISOString();
  if (rows.length === 0) {
    return NextResponse.json({
      date: iso, availableDates, items: [], stats: computeWatchlistStats([]),
      quoteSource: "Yahoo Finance", quoteUpdatedAt: nowIso, realtime: false, generatedAt: nowIso,
    });
  }

  const symbols = rows.map((r) => r.symbol);
  // near-realtime Yahoo batch (6s cap) + EOD fallback, in parallel
  const [rtList, eod] = await Promise.all([
    withTimeout(fetchQuotesBatch(symbols), 6000, []),
    getLiveQuotes(prisma, symbols),
  ]);
  const rtMap = new Map(rtList.map((q) => [q.symbol, q]));

  let anyRealtime = false;
  let latestQuoteMs = 0;

  const items = rows.map((r) => {
    const rt = rtMap.get(r.symbol);
    let currentPrice: number | null;
    let intradayChangePct: number | null;
    let quoteUpdatedAt: string | null;
    let quoteSource: string;

    if (rt && rt.price != null) {
      currentPrice = rt.price;
      intradayChangePct =
        rt.previousClose != null && rt.previousClose > 0
          ? ((rt.price - rt.previousClose) / rt.previousClose) * 100
          : null;
      quoteUpdatedAt = rt.time ? new Date(rt.time).toISOString() : nowIso;
      quoteSource = "Yahoo Finance";
      anyRealtime = true;
      if (rt.time && rt.time > latestQuoteMs) latestQuoteMs = rt.time;
    } else {
      const e = eod.get(r.symbol);
      currentPrice = e?.currentPrice ?? r.currentPrice ?? null;
      intradayChangePct = e?.changePct ?? r.changePct ?? null;
      quoteUpdatedAt = null;
      quoteSource = "EOD";
    }

    const returnPctFromEntry =
      r.entryPrice != null && r.entryPrice > 0 && currentPrice != null
        ? ((currentPrice - r.entryPrice) / r.entryPrice) * 100
        : null;

    return {
      id: r.id, symbol: r.symbol, name: r.name, recommendation: r.recommendation,
      rank: r.rank, score: r.score,
      entryPrice: r.entryPrice, // frozen — never overwritten by refresh
      currentPrice,
      intradayChangePct,
      returnPctFromEntry,
      quoteUpdatedAt,
      quoteSource,
      // backward-compatible aliases (do not break older consumers)
      changePct: intradayChangePct,
      returnPct: returnPctFromEntry,
      status: r.status, isStarred: r.isStarred, isMuted: r.isMuted, isFocus: r.isFocus, note: r.note,
    };
  });

  const statRows: StatRow[] = items.map((i) => ({
    symbol: i.symbol, name: i.name, recommendation: i.recommendation,
    returnPct: i.returnPctFromEntry, changePct: i.intradayChangePct,
  }));

  return NextResponse.json({
    date: iso,
    availableDates,
    items,
    stats: computeWatchlistStats(statRows),
    quoteSource: anyRealtime ? "Yahoo Finance" : "EOD",
    quoteUpdatedAt: latestQuoteMs > 0 ? new Date(latestQuoteMs).toISOString() : nowIso,
    realtime: anyRealtime,
    generatedAt: nowIso,
  });
}
