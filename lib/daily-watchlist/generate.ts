/**
 * Daily AI Watchlist — generation (P6-T7)
 * ────────────────────────────────────────────────────────────────────────────
 * Snapshots the day's STRONG_BUY / BUY names from DailyRecommendation into an
 * independent, date-scoped DailyAIWatchlist. Idempotent upsert by (date, symbol):
 *   - entryPrice / user flags (status/isStarred/isMuted/isFocus/note) are NEVER
 *     overwritten on update — history is preserved.
 *   - score / rank / recommendation / current price snapshot ARE refreshed.
 *
 * Pure derived layer over existing data (DailyRecommendation / StockScore /
 * DailyPrice / Stock). Does NOT compute or modify any score / recommendation.
 * `prisma` is injected (works in API route singleton AND standalone scripts).
 */
import type { PrismaClient } from "@prisma/client";
import { getLiveQuotes } from "./pricing";

export type GenerateResult = {
  date: string; // YYYY-MM-DD (JST)
  count: number;
  strongBuy: number;
  buy: number;
  skipped?: boolean;
};

/** JST calendar-day midnight (UTC Date matching @db.Date semantics). */
export function jstDate(dateISO?: string): Date {
  if (dateISO) return new Date(dateISO + "T00:00:00.000Z");
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));
}

export async function generateDailyWatchlist(
  prisma: PrismaClient,
  dateISO?: string,
): Promise<GenerateResult> {
  const date = jstDate(dateISO);
  const iso = date.toISOString().slice(0, 10);

  const recs = await prisma.dailyRecommendation.findMany({
    where: { date, recommendation: { in: ["STRONG_BUY", "BUY"] } },
    select: { symbol: true, recommendation: true, gptRank: true, adaptiveScore: true, buyPrice: true },
    orderBy: { gptRank: "asc" },
  });
  if (recs.length === 0) return { date: iso, count: 0, strongBuy: 0, buy: 0 };

  const symbols = recs.map((r) => r.symbol);
  const [stocks, quotes] = await Promise.all([
    prisma.stock.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, name: true, nameZh: true } }),
    getLiveQuotes(prisma, symbols),
  ]);
  const nameMap = new Map(stocks.map((s) => [s.symbol, s.nameZh ?? s.name]));

  let strongBuy = 0;
  let buy = 0;
  for (const r of recs) {
    const q = quotes.get(r.symbol) ?? { currentPrice: null, changePct: null };
    const entry = r.buyPrice ?? null;
    const returnPct =
      entry != null && entry > 0 && q.currentPrice != null
        ? ((q.currentPrice - entry) / entry) * 100
        : null;
    if (r.recommendation === "STRONG_BUY") strongBuy++;
    else buy++;

    await prisma.dailyAIWatchlist.upsert({
      where: { date_symbol: { date, symbol: r.symbol } },
      create: {
        date, symbol: r.symbol,
        name: nameMap.get(r.symbol) ?? null,
        recommendation: r.recommendation!,
        rank: r.gptRank ?? null,
        score: r.adaptiveScore ?? null,
        entryPrice: entry,
        currentPrice: q.currentPrice,
        changePct: q.changePct,
        returnPct,
      },
      // update: refresh snapshot only — entryPrice + user flags stay untouched
      update: {
        name: nameMap.get(r.symbol) ?? undefined,
        recommendation: r.recommendation!,
        rank: r.gptRank ?? null,
        score: r.adaptiveScore ?? null,
        currentPrice: q.currentPrice,
        changePct: q.changePct,
        returnPct,
      },
    });
  }
  return { date: iso, count: recs.length, strongBuy, buy };
}
