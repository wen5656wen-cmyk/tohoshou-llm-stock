#!/usr/bin/env npx tsx
/**
 * scripts/update-backtest.ts v10.1.1 — Accurate backtest fill + error tracking
 *
 * Entry : raw open on the first trading day AFTER the rec date (prices[0].open)
 * Exit  : adjClose ?? close on the N-th trading day after entryDate
 *         prices[7]  = 7th  trading day after entry  (exit7d)
 *         prices[30] = 30th trading day after entry  (exit30d)
 *         prices[90] = 90th trading day after entry  (exit90d)
 * Return: (exitPrice - entryPrice) / entryPrice × 100
 *
 * Portfolio: equal-weight TOP5 / TOP10 / TOP20 / ALL
 * Benchmark: Nikkei225 / TOPIX from GlobalMarket table (nearest trading day)
 * Errors: BacktestError rows for NO_DAILY_PRICE / NO_ENTRY_PRICE / NO_EXIT_PRICE
 *
 * Known limitations (by design):
 *   - entryPrice = raw open (no adjOpen in schema); exitPrice = adjClose → slight inconsistency on split stocks
 *   - maxDrawdown = worstReturn (simplified, no intraday curve)
 *   - benchmark = GlobalMarket calendar-day lookup (not exact same trading day)
 *   - no fees / slippage / tax
 *
 * Usage:
 *   npm run update-backtest          # fill unfilled cohorts (normal mode)
 *   npm run update-backtest:force    # re-fill ALL cohorts (--all)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const FORCE = process.argv.includes("--all");

// ── Helpers ───────────────────────────────────────────────────────────────────

function addCalendarDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function pct(exit: number | null, entry: number | null): number | null {
  if (exit == null || entry == null || entry === 0) return null;
  return Math.round(((exit - entry) / entry) * 10000) / 100;
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
}

function daysSince(recDate: Date, now: Date): number {
  return (now.getTime() - recDate.getTime()) / (1000 * 60 * 60 * 24);
}

type PriceRow = { symbol: string; date: Date; open: number; close: number; adjClose: number | null };

type FilledStock = {
  id: number;
  symbol: string;
  gptRank: number;
  entryDate: Date | null;
  entryPrice: number | null;
  entryPriceType: string | null;
  exitDate7d: Date | null;
  exitDate30d: Date | null;
  exitDate90d: Date | null;
  price7d: number | null;
  price30d: number | null;
  price90d: number | null;
  return7d: number | null;
  return30d: number | null;
  return90d: number | null;
  priceSource: string;
};

type ErrorEntry = { symbol: string; recommendDate: Date; horizon: string | null; reason: string };

// Fetch closest GlobalMarket row on-or-after a date (within +7 calendar days)
const gmCache = new Map<string, { nikkei: number | null; topix: number | null }>();
async function getGlobalMarket(d: Date): Promise<{ nikkei: number | null; topix: number | null }> {
  const key = d.toISOString().slice(0, 10);
  if (gmCache.has(key)) return gmCache.get(key)!;
  const row = await prisma.globalMarket.findFirst({
    where: { date: { gte: d, lte: addCalendarDays(d, 7) } },
    orderBy: { date: "asc" },
    select: { nikkei: true, topix: true },
  });
  const val = { nikkei: row?.nikkei ?? null, topix: row?.topix ?? null };
  gmCache.set(key, val);
  return val;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date();

  // ── 1. Determine cohort dates to process ─────────────────────────────────
  let cohortDates: { date: Date }[];

  if (FORCE) {
    cohortDates = await prisma.$queryRaw<{ date: Date }[]>`
      SELECT DISTINCT date FROM daily_recommendations ORDER BY date ASC
    `;
    console.log(`📊 update-backtest v10.1.1 — ALL ${cohortDates.length} cohort dates [--all]`);
  } else {
    cohortDates = await prisma.$queryRaw<{ date: Date }[]>`
      SELECT DISTINCT date FROM daily_recommendations
      WHERE "entryDate" IS NULL
         OR (
           "entryDate" IS NOT NULL
           AND COALESCE("entryPrice", 0) != 0
           AND ("return7d" IS NULL OR "return30d" IS NULL OR "return90d" IS NULL)
         )
      ORDER BY date ASC
    `;
    console.log(`📊 update-backtest v10.1.1 — ${cohortDates.length} cohort dates need fill`);
  }

  if (cohortDates.length === 0) {
    console.log("  ✅ Nothing to process.");
    await prisma.$disconnect();
    return;
  }

  let updatedRecs = 0;
  let upsertedResults = 0;
  let totalErrors = 0;

  for (const { date: recDate } of cohortDates) {
    const recDateStr = new Date(recDate).toISOString().slice(0, 10);
    console.log(`\n  ▶ cohort ${recDateStr}`);

    // Load all recs for this cohort sorted by gptRank
    const recs = await prisma.dailyRecommendation.findMany({
      where: { date: recDate },
      orderBy: { gptRank: "asc" },
      select: { id: true, symbol: true, gptRank: true },
    });
    if (recs.length === 0) continue;

    const symbols = recs.map((r) => r.symbol);
    const age = daysSince(new Date(recDate), now);

    // Batch-fetch prices: first 135 calendar days after recDate (covers 90td ≈ 126cd + buffer)
    const priceUntil = addCalendarDays(recDate, 135);
    const effectiveUntil = priceUntil < now ? priceUntil : now;

    const allPriceRows = await prisma.dailyPrice.findMany({
      where: {
        symbol: { in: symbols },
        date: { gt: recDate, lte: effectiveUntil },
      },
      orderBy: [{ symbol: "asc" }, { date: "asc" }],
      select: { symbol: true, date: true, open: true, close: true, adjClose: true },
    });

    // Group by symbol → Map<symbol, PriceRow[]>
    const priceMap = new Map<string, PriceRow[]>();
    for (const p of allPriceRows) {
      if (!priceMap.has(p.symbol)) priceMap.set(p.symbol, []);
      priceMap.get(p.symbol)!.push(p as PriceRow);
    }

    // ── Process each stock ─────────────────────────────────────────────────
    const filled: FilledStock[] = [];
    const cohortErrors: ErrorEntry[] = [];

    for (const rec of recs) {
      const prices = priceMap.get(rec.symbol) ?? [];

      if (prices.length === 0) {
        // Only flag NO_DAILY_PRICE for cohorts old enough that prices should exist
        if (age > 5) {
          cohortErrors.push({ symbol: rec.symbol, recommendDate: new Date(recDate), horizon: null, reason: "NO_DAILY_PRICE" });
        }
        filled.push({
          id: rec.id, symbol: rec.symbol, gptRank: rec.gptRank,
          entryDate: null, entryPrice: null, entryPriceType: null,
          exitDate7d: null, exitDate30d: null, exitDate90d: null,
          price7d: null, price30d: null, price90d: null,
          return7d: null, return30d: null, return90d: null,
          priceSource: "RAW",
        });
        continue;
      }

      // prices[0] = entryDate (first trading day after recDate)
      // prices[N] = Nth trading day after entryDate
      const p0  = prices[0];
      const p7  = prices[7]  ?? null;
      const p30 = prices[30] ?? null;
      const p90 = prices[90] ?? null;

      const entryPrice = p0.open;

      // Flag NO_ENTRY_PRICE if open is zero (data quality issue)
      if (entryPrice === 0) {
        cohortErrors.push({ symbol: rec.symbol, recommendDate: new Date(recDate), horizon: null, reason: "NO_ENTRY_PRICE" });
      }

      const price7d  = p7  ? (p7.adjClose  ?? p7.close)  : null;
      const price30d = p30 ? (p30.adjClose ?? p30.close) : null;
      const price90d = p90 ? (p90.adjClose ?? p90.close) : null;

      // Flag NO_EXIT_PRICE only when the cohort is old enough that exit data should be available
      if (!p7  && age > 15)  cohortErrors.push({ symbol: rec.symbol, recommendDate: new Date(recDate), horizon: "7d",  reason: "NO_EXIT_PRICE" });
      if (!p30 && age > 50)  cohortErrors.push({ symbol: rec.symbol, recommendDate: new Date(recDate), horizon: "30d", reason: "NO_EXIT_PRICE" });
      if (!p90 && age > 135) cohortErrors.push({ symbol: rec.symbol, recommendDate: new Date(recDate), horizon: "90d", reason: "NO_EXIT_PRICE" });

      const anyAdj = [p7, p30, p90].some((p) => p?.adjClose != null);
      const priceSource = anyAdj ? "ADJUSTED" : "RAW";

      filled.push({
        id: rec.id, symbol: rec.symbol, gptRank: rec.gptRank,
        entryDate: new Date(p0.date),
        entryPrice,
        entryPriceType: "NEXT_OPEN",
        exitDate7d:  p7  ? new Date(p7.date)  : null,
        exitDate30d: p30 ? new Date(p30.date) : null,
        exitDate90d: p90 ? new Date(p90.date) : null,
        price7d, price30d, price90d,
        return7d:  pct(price7d,  entryPrice),
        return30d: pct(price30d, entryPrice),
        return90d: pct(price90d, entryPrice),
        priceSource,
      });
    }

    // Batch-update DailyRecommendation rows
    for (const row of filled) {
      if (row.entryDate == null) continue; // no entry price — skip to avoid overwriting valid data
      await prisma.dailyRecommendation.update({
        where: { id: row.id },
        data: {
          entryDate:      row.entryDate,
          entryPrice:     row.entryPrice,
          entryPriceType: row.entryPriceType,
          exitDate7d:     row.exitDate7d,
          exitDate30d:    row.exitDate30d,
          exitDate90d:    row.exitDate90d,
          price7d:        row.price7d,
          price30d:       row.price30d,
          price90d:       row.price90d,
          return7d:       row.return7d,
          return30d:      row.return30d,
          return90d:      row.return90d,
          priceSource:    row.priceSource,
          filledAt:       now,
        },
      });
      updatedRecs++;
    }

    // ── Persist BacktestError records ─────────────────────────────────────
    if (cohortErrors.length > 0) {
      if (FORCE) {
        // Clear stale errors for this cohort before re-recording
        await prisma.backtestError.deleteMany({ where: { recommendDate: new Date(recDate) } });
      }
      await prisma.backtestError.createMany({
        data: cohortErrors,
        skipDuplicates: true,
      });
      totalErrors += cohortErrors.length;
    }

    // ── Compute portfolio stats ────────────────────────────────────────────
    const cohortEntryDate = filled.find((r) => r.entryDate != null)?.entryDate ?? null;

    // Pre-fetch GlobalMarket for benchmark (3 horizons × 2 dates = 6 queries max, cached)
    type HorizonKey = "7d" | "30d" | "90d";
    const benchmarks: Record<HorizonKey, { nikkei: number | null; topix: number | null }> = {
      "7d":  { nikkei: null, topix: null },
      "30d": { nikkei: null, topix: null },
      "90d": { nikkei: null, topix: null },
    };

    if (cohortEntryDate) {
      const bmEntry = await getGlobalMarket(cohortEntryDate);

      for (const h of ["7d", "30d", "90d"] as HorizonKey[]) {
        const exitKey = `exitDate${h}` as "exitDate7d" | "exitDate30d" | "exitDate90d";
        const repDate = filled.slice(0, 20).find((r) => r[exitKey] != null)?.[exitKey] ?? null;
        if (!repDate) continue;
        const bmExit = await getGlobalMarket(new Date(repDate));
        benchmarks[h] = {
          nikkei: bmEntry.nikkei && bmExit.nikkei ? pct(bmExit.nikkei, bmEntry.nikkei) : null,
          topix:  bmEntry.topix  && bmExit.topix  ? pct(bmExit.topix,  bmEntry.topix)  : null,
        };
      }
    }

    // Upsert BacktestResult for each portfolioSize × horizon
    const portfolioSizes: Array<{ key: "TOP5" | "TOP10" | "TOP20" | "ALL"; limit: number }> = [
      { key: "TOP5",  limit: 5   },
      { key: "TOP10", limit: 10  },
      { key: "TOP20", limit: 20  },
      { key: "ALL",   limit: 9999 },
    ];

    for (const { key: ps, limit } of portfolioSizes) {
      const pool = filled.filter((r) => r.gptRank <= limit);

      for (const h of ["7d", "30d", "90d"] as HorizonKey[]) {
        const retKey  = `return${h}` as "return7d" | "return30d" | "return90d";
        const filledPool = pool.filter((r) => r[retKey] != null);
        if (filledPool.length === 0) continue;

        const returns  = filledPool.map((r) => r[retKey] as number);
        const winners  = returns.filter((r) => r > 0);
        const sorted   = [...filledPool].sort((a, b) => (b[retKey] as number) - (a[retKey] as number));
        const avgRet   = mean(returns)!;
        const bm       = benchmarks[h];

        const excessNikkei = bm.nikkei != null ? Math.round((avgRet - bm.nikkei) * 100) / 100 : null;
        const excessTopix  = bm.topix  != null ? Math.round((avgRet - bm.topix)  * 100) / 100 : null;

        const payload = {
          totalRecommendations: pool.length,
          filled: filledPool.length,
          winners: winners.length,
          losers:  returns.filter((r) => r <= 0).length,
          winRate: Math.round((winners.length / filledPool.length) * 10000) / 100,
          avgReturn:    avgRet,
          medianReturn: median(returns),
          bestReturn:   (sorted[0]?.[retKey] as number) ?? null,
          worstReturn:  (sorted[sorted.length - 1]?.[retKey] as number) ?? null,
          bestSymbol:   sorted[0]?.symbol ?? null,
          worstSymbol:  sorted[sorted.length - 1]?.symbol ?? null,
          maxDrawdown:  (sorted[sorted.length - 1]?.[retKey] as number) ?? null,
          benchmarkNikkeiReturn: bm.nikkei,
          benchmarkTopixReturn:  bm.topix,
          excessVsNikkei: excessNikkei,
          excessVsTopix:  excessTopix,
        };

        await prisma.backtestResult.upsert({
          where: { date_horizon_portfolioSize: { date: recDate, horizon: h, portfolioSize: ps } },
          create: { date: recDate, horizon: h, portfolioSize: ps, ...payload },
          update: { ...payload, computedAt: now },
        });
        upsertedResults++;
      }
    }

    const filledCount = filled.filter((r) => r.entryDate != null).length;
    const errSuffix = cohortErrors.length > 0 ? ` · ${cohortErrors.length} errors` : "";
    console.log(`     ✅ ${filledCount}/${recs.length} stocks filled${errSuffix}`);
  }

  console.log(`\n✅ Done — ${updatedRecs} DailyRecommendation rows updated, ${upsertedResults} BacktestResults upserted, ${totalErrors} errors recorded`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
