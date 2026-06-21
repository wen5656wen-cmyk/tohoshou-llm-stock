#!/usr/bin/env npx tsx
/**
 * scripts/update-backtest.ts — Fill price7d/30d/90d for DailyRecommendation rows
 * and upsert BacktestResult aggregates.
 *
 * Usage:
 *   npm run update-backtest          # fill all pending rows
 *   npm run update-backtest --all    # re-fill even already-filled rows
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const FORCE = process.argv.includes("--all");

// Trading days in a rolling window.
// Look for the nearest DailyPrice on-or-after target date, within +5 days tolerance.
async function fetchPriceAfter(symbol: string, targetDate: Date): Promise<number | null> {
  const from = new Date(targetDate);
  const to   = new Date(targetDate);
  to.setDate(to.getDate() + 7); // +7 days to find a trading day

  const row = await prisma.dailyPrice.findFirst({
    where: {
      symbol,
      date: { gte: from, lte: to },
    },
    orderBy: { date: "asc" },
    select: { close: true },
  });
  return row?.close ?? null;
}

function addCalendarDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// Calendar day approximation: 7td ≈ 10cd, 30td ≈ 42cd, 90td ≈ 126cd
function tradingDaysToCalendar(td: number): number {
  if (td <= 7)  return 10;
  if (td <= 30) return 42;
  return 126;
}

function pct(future: number | null, base: number | null): number | null {
  if (future == null || base == null || base === 0) return null;
  return Math.round(((future - base) / base) * 10000) / 100; // round to 2dp
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  const now = new Date();

  // ── 1. Find DailyRecommendation rows to fill ──────────────────────────────
  const where = FORCE
    ? {} // all rows
    : { filledAt: null }; // only unfilled

  const all = await prisma.dailyRecommendation.findMany({
    where,
    orderBy: { date: "asc" },
    select: {
      id: true, date: true, symbol: true, buyPrice: true,
      price7d: true, price30d: true, price90d: true,
    },
  });

  console.log(`📊 update-backtest — ${all.length} rows to process${FORCE ? " [--all]" : ""}`);

  let updated = 0;
  for (const row of all) {
    const base = row.buyPrice;
    const rowDate = new Date(row.date);

    const target7d  = addCalendarDays(rowDate, tradingDaysToCalendar(7));
    const target30d = addCalendarDays(rowDate, tradingDaysToCalendar(30));
    const target90d = addCalendarDays(rowDate, tradingDaysToCalendar(90));

    const needFill7d  = (FORCE || row.price7d  == null) && target7d  <= now;
    const needFill30d = (FORCE || row.price30d == null) && target30d <= now;
    const needFill90d = (FORCE || row.price90d == null) && target90d <= now;

    if (!needFill7d && !needFill30d && !needFill90d) continue;

    const price7d  = needFill7d  ? await fetchPriceAfter(row.symbol, target7d)  : row.price7d;
    const price30d = needFill30d ? await fetchPriceAfter(row.symbol, target30d) : row.price30d;
    const price90d = needFill90d ? await fetchPriceAfter(row.symbol, target90d) : row.price90d;

    await prisma.dailyRecommendation.update({
      where: { id: row.id },
      data: {
        price7d:   price7d,
        price30d:  price30d,
        price90d:  price90d,
        return7d:  pct(price7d, base),
        return30d: pct(price30d, base),
        return90d: pct(price90d, base),
        filledAt:  now,
      },
    });
    updated++;
  }
  console.log(`  ✅ updated ${updated} DailyRecommendation rows`);

  // ── 2. Recompute BacktestResult aggregates ────────────────────────────────
  // Find all distinct dates that have at least some fills
  const dates = await prisma.$queryRaw<{ date: Date }[]>`
    SELECT DISTINCT date FROM daily_recommendations
    WHERE return7d IS NOT NULL OR return30d IS NOT NULL OR return90d IS NOT NULL
    ORDER BY date DESC
  `;

  console.log(`\n📈 recomputing BacktestResult for ${dates.length} dates …`);

  for (const { date } of dates) {
    const recs = await prisma.dailyRecommendation.findMany({
      where: { date },
      select: { return7d: true, return30d: true, return90d: true, symbol: true },
    });

    for (const horizon of ["7d", "30d", "90d"] as const) {
      const key = `return${horizon}` as "return7d" | "return30d" | "return90d";
      const filled = recs.filter((r) => r[key] != null);
      if (filled.length === 0) continue;

      const returns = filled.map((r) => r[key] as number);
      const winners = returns.filter((r) => r > 0);
      const losers  = returns.filter((r) => r <= 0);
      const sorted  = [...filled].sort((a, b) => (b[key] as number) - (a[key] as number));
      const best    = sorted[0];
      const worst   = sorted[sorted.length - 1];
      const avgRet  = returns.reduce((s, r) => s + r, 0) / returns.length;

      await prisma.backtestResult.upsert({
        where: { date_horizon: { date, horizon } },
        create: {
          date,
          horizon,
          totalRecommendations: recs.length,
          filled: filled.length,
          winners: winners.length,
          losers: losers.length,
          winRate: Math.round((winners.length / filled.length) * 10000) / 100,
          avgReturn: Math.round(avgRet * 100) / 100,
          medianReturn: median(returns),
          bestReturn: best[key] as number,
          worstReturn: worst[key] as number,
          bestSymbol: best.symbol,
          worstSymbol: worst.symbol,
        },
        update: {
          totalRecommendations: recs.length,
          filled: filled.length,
          winners: winners.length,
          losers: losers.length,
          winRate: Math.round((winners.length / filled.length) * 10000) / 100,
          avgReturn: Math.round(avgRet * 100) / 100,
          medianReturn: median(returns),
          bestReturn: best[key] as number,
          worstReturn: worst[key] as number,
          bestSymbol: best.symbol,
          worstSymbol: worst.symbol,
          computedAt: now,
        },
      });
    }
  }
  console.log(`  ✅ BacktestResult updated for ${dates.length} dates`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
