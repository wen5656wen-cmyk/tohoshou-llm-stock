/**
 * Daily AI Watchlist — live pricing helper (P6-T7)
 * ────────────────────────────────────────────────────────────────────────────
 * Reads ONLY existing data sources (StockScore.latestClose + DailyPrice) — no
 * external market API. Returns current price + today's EOD change % per symbol.
 * Pure read; never writes; never touches scoring / recommendation.
 *
 * `prisma` is injected so this works both in Next API routes (singleton) and in
 * standalone scripts (own PrismaClient) without the `@/` alias.
 */
import type { PrismaClient } from "@prisma/client";

export type LiveQuote = { currentPrice: number | null; changePct: number | null };

export async function getLiveQuotes(
  prisma: PrismaClient,
  symbols: string[],
): Promise<Map<string, LiveQuote>> {
  const out = new Map<string, LiveQuote>();
  if (!symbols.length) return out;

  const since = new Date(Date.now() - 25 * 86400 * 1000); // bound DailyPrice scan
  const [scores, prices] = await Promise.all([
    prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, latestClose: true },
    }),
    prisma.dailyPrice.findMany({
      where: { symbol: { in: symbols }, date: { gte: since } },
      select: { symbol: true, close: true },
      orderBy: [{ symbol: "asc" }, { date: "desc" }],
    }),
  ]);

  const closeMap = new Map(scores.map((s) => [s.symbol, s.latestClose]));
  // last two closes per symbol (prices are date-desc within each symbol)
  const last2 = new Map<string, number[]>();
  for (const p of prices) {
    const arr = last2.get(p.symbol) ?? [];
    if (arr.length < 2) { arr.push(p.close); last2.set(p.symbol, arr); }
  }

  for (const sym of symbols) {
    const pair = last2.get(sym);
    const cur = closeMap.get(sym) ?? pair?.[0] ?? null;
    let changePct: number | null = null;
    if (pair && pair.length === 2 && pair[1] > 0) {
      changePct = ((pair[0] - pair[1]) / pair[1]) * 100;
    }
    out.set(sym, { currentPrice: cur, changePct });
  }
  return out;
}
