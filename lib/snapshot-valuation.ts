/**
 * snapshot-valuation.ts — Real-time price resolution for portfolio snapshots
 *
 * Priority per symbol:
 *   1. Yahoo Finance regularMarketPrice (cached 5 min, only during JST trading hours) → YAHOO_REALTIME
 *   2. DailyPrice.adjClose / .close for today's JST date                              → DAILY_PRICE
 *   3. StockScore.latestClose                                                          → STOCK_SCORE
 *   4. entryPrice fallback                                                             → ENTRY_PRICE
 *
 * ValuationStatus (snapshot-level, derived from best source used):
 *   INTRADAY  — at least one position uses Yahoo realtime
 *   CLOSED    — best source is today's DailyPrice (no Yahoo)
 *   STALE     — best source is StockScore.latestClose (no Yahoo or DailyPrice today)
 *   FALLBACK  — all positions use entryPrice
 */

import { yahooFinance } from "@/lib/yahooFinance";
import { prisma } from "@/lib/prisma";

// ── Public types ────────────────────────────────────────────────────────────────

export type PriceSource = "YAHOO_REALTIME" | "DAILY_PRICE" | "STOCK_SCORE" | "ENTRY_PRICE";
export type ValuationStatus = "INTRADAY" | "CLOSED" | "STALE" | "FALLBACK";

export type PositionPrice = {
  symbol: string;
  currentPrice: number;
  priceSource: PriceSource;
};

export type ValuationResult = {
  prices: Map<string, PositionPrice>;
  valuationStatus: ValuationStatus;
};

// ── 5-minute Yahoo realtime cache (process-level) ───────────────────────────────

type CacheEntry = { price: number; fetchedAt: number };
const yahooCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(symbol: string): number | null {
  const entry = yahooCache.get(symbol);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    yahooCache.delete(symbol);
    return null;
  }
  return entry.price;
}

function setCached(symbol: string, price: number): void {
  yahooCache.set(symbol, { price, fetchedAt: Date.now() });
}

// ── JST trading hours ───────────────────────────────────────────────────────────

export function isJSTTradingHours(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const total = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
  // 09:00–11:30 and 12:30–15:30 JST
  return (total >= 540 && total <= 690) || (total >= 750 && total <= 930);
}

function todayJSTString(): string {
  return new Date()
    .toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "-");
}

// ── Yahoo Finance parallel batch fetch ─────────────────────────────────────────

async function fetchYahooPrices(symbols: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const toFetch: string[] = [];

  for (const sym of symbols) {
    const cached = getCached(sym);
    if (cached != null) {
      result.set(sym, cached);
    } else {
      toFetch.push(sym);
    }
  }

  if (toFetch.length === 0) return result;

  // Parallel fetch; failures are isolated via allSettled
  const settled = await Promise.allSettled(
    toFetch.map(async (sym) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (await yahooFinance.quote(sym)) as any;
      const price =
        typeof q?.regularMarketPrice === "number" && q.regularMarketPrice > 0
          ? q.regularMarketPrice
          : null;
      if (price == null) throw new Error(`no valid price`);
      return { sym, price };
    })
  );

  for (let i = 0; i < settled.length; i++) {
    const item = settled[i];
    if (item.status === "fulfilled") {
      setCached(item.value.sym, item.value.price);
      result.set(item.value.sym, item.value.price);
    } else {
      console.error(
        `[snapshot-valuation] Yahoo quote failed for ${toFetch[i]}: ${item.reason?.message ?? item.reason}`
      );
    }
  }

  return result;
}

// ── Main entry point ────────────────────────────────────────────────────────────

export type SnapshotPositionInput = {
  symbol: string;
  entryPrice: number;
};

export async function resolveSnapshotPrices(
  positions: SnapshotPositionInput[]
): Promise<ValuationResult> {
  if (positions.length === 0) {
    return { prices: new Map(), valuationStatus: "FALLBACK" };
  }

  const symbols = [...new Set(positions.map((p) => p.symbol))];
  const tryYahoo = isJSTTradingHours();

  // Step 1: Yahoo (only during JST trading hours)
  const yahooMap = tryYahoo
    ? await fetchYahooPrices(symbols)
    : new Map<string, number>();

  // Step 2: DB — StockScore + latest available DailyPrice within 5 trading days (parallel)
  // J-Quants syncs T-1 data at 06:00 JST, so "today" has no DailyPrice until next morning.
  // Query the last 5 calendar days to get the most recent closing price available.
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000);

  const [scoreRows, dailyRows] = await Promise.all([
    prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, latestClose: true },
    }),
    prisma.dailyPrice.findMany({
      where: { symbol: { in: symbols }, date: { gte: fiveDaysAgo } },
      orderBy: { date: "desc" },
      select: { symbol: true, close: true, adjClose: true },
    }),
  ]);

  const scoreMap = new Map<string, number>(
    scoreRows
      .filter((r) => r.latestClose != null && r.latestClose > 0)
      .map((r) => [r.symbol, r.latestClose as number])
  );
  // Take the most recent row per symbol (already ordered date desc)
  const dailyMap = new Map<string, number>();
  for (const row of dailyRows) {
    if (dailyMap.has(row.symbol)) continue;
    const px = row.adjClose ?? row.close;
    if (px != null && px > 0) dailyMap.set(row.symbol, px);
  }

  // Step 3: Resolve each unique symbol, then build position map
  const symbolPrices = new Map<string, PositionPrice>();
  for (const sym of symbols) {
    const yahoo = yahooMap.get(sym);
    const daily = dailyMap.get(sym);
    const score = scoreMap.get(sym);
    const entryPrice = positions.find((p) => p.symbol === sym)?.entryPrice ?? 0;

    if (yahoo != null) {
      symbolPrices.set(sym, { symbol: sym, currentPrice: yahoo, priceSource: "YAHOO_REALTIME" });
    } else if (daily != null) {
      symbolPrices.set(sym, { symbol: sym, currentPrice: daily, priceSource: "DAILY_PRICE" });
    } else if (score != null) {
      symbolPrices.set(sym, { symbol: sym, currentPrice: score, priceSource: "STOCK_SCORE" });
    } else {
      symbolPrices.set(sym, { symbol: sym, currentPrice: entryPrice, priceSource: "ENTRY_PRICE" });
    }
  }

  // Step 4: Derive ValuationStatus from the best source used
  const sources = [...symbolPrices.values()].map((p) => p.priceSource);
  const valuationStatus: ValuationStatus = sources.includes("YAHOO_REALTIME")
    ? "INTRADAY"
    : sources.includes("DAILY_PRICE")
    ? "CLOSED"
    : sources.includes("STOCK_SCORE")
    ? "STALE"
    : "FALLBACK";

  return { prices: symbolPrices, valuationStatus };
}
