/**
 * update-ai-signal-stats.ts
 * Compute daily AI signal win-rate statistics for STRONG_BUY / BUY / ALL_BUY.
 *
 * Usage:
 *   npx tsx scripts/update-ai-signal-stats.ts              # today JST
 *   npx tsx scripts/update-ai-signal-stats.ts --date=2026-06-25
 *   npx tsx scripts/update-ai-signal-stats.ts --all        # all dates in DB
 *   npx tsx scripts/update-ai-signal-stats.ts --dry-run
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayJST(): string {
  return new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })
    .replace(/\//g, "-").replace(/(\d{4})-(\d{1,2})-(\d{1,2})/, (_, y, m, d) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

type ActionType = "STRONG_BUY" | "BUY" | "ALL_BUY";

interface RecRow {
  symbol: string;
  recommendation: string | null;
  buyPrice: number | null;
  return7d: number | null;
}

interface PriceMap {
  [symbol: string]: number | null;
}

// ── Core compute for one date ────────────────────────────────────────────────

async function computeForDate(dateStr: string, dryRun: boolean): Promise<void> {
  const dateObj = new Date(`${dateStr}T00:00:00.000Z`);

  // 1. Fetch all BUY/STRONG_BUY recommendations for this date
  const recs = await prisma.dailyRecommendation.findMany({
    where: {
      date: dateObj,
      recommendation: { in: ["STRONG_BUY", "BUY"] },
    },
    select: {
      symbol: true,
      recommendation: true,
      buyPrice: true,
      return7d: true,
    },
  });

  if (recs.length === 0) {
    console.log(`[${dateStr}] No STRONG_BUY/BUY recommendations — skipping`);
    return;
  }

  const symbols = [...new Set(recs.map((r) => r.symbol))];

  // 2. Get "today" prices for each symbol
  //    - If dateStr == todayJST: use StockScore.latestClose
  //    - Otherwise: use DailyPrice.close for that date
  const priceMap: PriceMap = {};

  const isToday = dateStr === todayJST();
  if (isToday) {
    const scores = await prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, latestClose: true },
    });
    for (const s of scores) priceMap[s.symbol] = s.latestClose ?? null;
  } else {
    const prices = await prisma.dailyPrice.findMany({
      where: {
        symbol: { in: symbols },
        date: dateObj,
      },
      select: { symbol: true, adjClose: true, close: true },
    });
    for (const p of prices) priceMap[p.symbol] = p.adjClose ?? p.close ?? null;
  }

  // 3. Compute stats per action type
  const now = new Date();

  for (const actionType of ["STRONG_BUY", "BUY", "ALL_BUY"] as ActionType[]) {
    const filtered: RecRow[] =
      actionType === "ALL_BUY"
        ? recs
        : recs.filter((r) => r.recommendation === actionType);

    if (filtered.length === 0) continue;

    // Today win rate
    const todayReturns: number[] = [];
    let validTodayCount = 0;
    let todayWinCount = 0;

    for (const rec of filtered) {
      const currentPx = priceMap[rec.symbol] ?? null;
      const entryPx = rec.buyPrice;
      if (currentPx == null || entryPx == null || entryPx === 0) continue;
      validTodayCount++;
      const ret = ((currentPx - entryPx) / entryPx) * 100;
      todayReturns.push(ret);
      if (ret > 0) todayWinCount++;
    }

    const todayWinRate =
      validTodayCount > 0 ? (todayWinCount / validTodayCount) * 100 : null;
    const avgTodayReturnPct = avg(todayReturns);

    // 7-day win rate (use pre-computed return7d)
    const returns7d: number[] = [];
    let valid7dCount = 0;
    let win7dCount = 0;

    for (const rec of filtered) {
      if (rec.return7d == null) continue;
      valid7dCount++;
      returns7d.push(rec.return7d);
      if (rec.return7d > 0) win7dCount++;
    }

    const win7dRate =
      valid7dCount > 0 ? (win7dCount / valid7dCount) * 100 : null;
    const avg7dReturnPct = avg(returns7d);

    const payload = {
      tradeDate: dateObj,
      actionType,
      recommendationCount: filtered.length,
      validTodayCount,
      todayWinCount,
      todayWinRate,
      avgTodayReturnPct,
      valid7dCount,
      win7dCount,
      win7dRate,
      avg7dReturnPct,
      calculatedAt: now,
    };

    if (dryRun) {
      console.log(`[DRY] ${dateStr} | ${actionType} | recs=${filtered.length} | todayWin=${todayWinCount}/${validTodayCount}=${todayWinRate?.toFixed(1) ?? "—"}% | 7d=${win7dCount}/${valid7dCount}=${win7dRate?.toFixed(1) ?? "积累中"}%`);
    } else {
      await prisma.aISignalDailyStat.upsert({
        where: {
          tradeDate_actionType: { tradeDate: dateObj, actionType },
        },
        create: payload,
        update: {
          recommendationCount: payload.recommendationCount,
          validTodayCount: payload.validTodayCount,
          todayWinCount: payload.todayWinCount,
          todayWinRate: payload.todayWinRate,
          avgTodayReturnPct: payload.avgTodayReturnPct,
          valid7dCount: payload.valid7dCount,
          win7dCount: payload.win7dCount,
          win7dRate: payload.win7dRate,
          avg7dReturnPct: payload.avg7dReturnPct,
          calculatedAt: now,
        },
      });
      console.log(`[${dateStr}] ${actionType}: recs=${filtered.length} today=${todayWinCount}/${validTodayCount}(${todayWinRate?.toFixed(1) ?? "—"}%) 7d=${win7dCount}/${valid7dCount}(${win7dRate?.toFixed(1) ?? "积累中"}%)`);
    }
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const allDates = args.includes("--all");
  const dateFlagRaw = args.find((a) => a.startsWith("--date="));
  const dateFlag = dateFlagRaw ? dateFlagRaw.replace("--date=", "") : null;

  if (dryRun) console.log("=== DRY RUN MODE ===");

  if (allDates) {
    // Find all distinct dates in daily_recommendations with BUY/STRONG_BUY
    const rows = await prisma.dailyRecommendation.findMany({
      where: { recommendation: { in: ["STRONG_BUY", "BUY"] } },
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "asc" },
    });
    const dates = rows.map((r) =>
      r.date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
    );
    console.log(`Processing ${dates.length} dates...`);
    for (const d of dates) {
      await computeForDate(d, dryRun);
    }
  } else {
    const targetDate = dateFlag ?? todayJST();
    await computeForDate(targetDate, dryRun);
  }

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
