/**
 * update-ai-signal-stats.ts
 * Compute daily AI signal win-rate statistics for STRONG_BUY / BUY / ALL_BUY.
 *
 * Today win rate rule:
 *   - todayClose = DailyPrice.close where date = tradeDate (NOT StockScore.latestClose)
 *   - todayReturnPct = (todayClose - entryPrice) / entryPrice
 *   - > 0 → win  |  < 0 → loss  |  = 0 → flat (counted in validTodayCount, not win/loss)
 *   - If DailyPrice for tradeDate not yet synced: validTodayCount=0, todayWinRate=null
 *     → API marks WAITING_DAILY_PRICE → UI shows "待收盘"
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Core compute for one date ─────────────────────────────────────────────────

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

  // 2. Check whether DailyPrice has been synced for this date.
  //    Use only DailyPrice.close — never StockScore.latestClose.
  const latestPriceRow = await prisma.dailyPrice.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const latestPriceDateStr = latestPriceRow?.date.toISOString().slice(0, 10) ?? null;
  const pricesReady = latestPriceDateStr != null && latestPriceDateStr >= dateStr;

  // 3. Load DailyPrice.close for each symbol on this exact date (if available)
  const priceMap: PriceMap = {};
  if (pricesReady) {
    const prices = await prisma.dailyPrice.findMany({
      where: { symbol: { in: symbols }, date: dateObj },
      select: { symbol: true, close: true },
    });
    for (const p of prices) priceMap[p.symbol] = p.close ?? null;
  }
  // If !pricesReady: priceMap is empty → validTodayCount=0, todayWinRate=null

  // 4. Compute stats per action type
  const now = new Date();

  for (const actionType of ["STRONG_BUY", "BUY", "ALL_BUY"] as ActionType[]) {
    const filtered: RecRow[] =
      actionType === "ALL_BUY"
        ? recs
        : recs.filter((r) => r.recommendation === actionType);

    if (filtered.length === 0) continue;

    // Today win / loss / flat (only valid when pricesReady)
    const todayReturns: number[] = [];
    let validTodayCount = 0;
    let todayWinCount = 0;
    let todayLossCount = 0;
    let todayFlatCount = 0;

    if (pricesReady) {
      for (const rec of filtered) {
        const todayClose = priceMap[rec.symbol] ?? null;
        const entryPx = rec.buyPrice;
        if (todayClose == null || entryPx == null || entryPx === 0) continue;
        validTodayCount++;
        const ret = ((todayClose - entryPx) / entryPx) * 100;
        todayReturns.push(ret);
        if (ret > 0) todayWinCount++;
        else if (ret < 0) todayLossCount++;
        else todayFlatCount++;
      }
    }

    const todayWinRate =
      validTodayCount > 0 ? (todayWinCount / validTodayCount) * 100 : null;
    const avgTodayReturnPct = avg(todayReturns);

    // 7-day win rate (pre-computed return7d — independent of daily price sync)
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

    const todayLabel = pricesReady
      ? `win=${todayWinCount} loss=${todayLossCount} flat=${todayFlatCount} / ${validTodayCount} → ${todayWinRate?.toFixed(1) ?? "—"}%`
      : `WAITING [latestPrice=${latestPriceDateStr ?? "none"}]`;

    const payload = {
      tradeDate: dateObj,
      actionType,
      recommendationCount: filtered.length,
      validTodayCount,
      todayWinCount,
      todayLossCount,
      todayFlatCount,
      todayWinRate,
      avgTodayReturnPct,
      valid7dCount,
      win7dCount,
      win7dRate,
      avg7dReturnPct,
      calculatedAt: now,
    };

    if (dryRun) {
      console.log(`[DRY] ${dateStr} | ${actionType} | recs=${filtered.length} | today=${todayLabel} | 7d=${win7dCount}/${valid7dCount}=${win7dRate?.toFixed(1) ?? "积累中"}%`);
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
          todayLossCount: payload.todayLossCount,
          todayFlatCount: payload.todayFlatCount,
          todayWinRate: payload.todayWinRate,
          avgTodayReturnPct: payload.avgTodayReturnPct,
          valid7dCount: payload.valid7dCount,
          win7dCount: payload.win7dCount,
          win7dRate: payload.win7dRate,
          avg7dReturnPct: payload.avg7dReturnPct,
          calculatedAt: now,
        },
      });
      console.log(`[${dateStr}] ${actionType}: recs=${filtered.length} | ${todayLabel} | 7d=${win7dCount}/${valid7dCount}(${win7dRate?.toFixed(1) ?? "积累中"}%)`);
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const allDates = args.includes("--all");
  const dateFlagRaw = args.find((a) => a.startsWith("--date="));
  const dateFlag = dateFlagRaw ? dateFlagRaw.replace("--date=", "") : null;

  if (dryRun) console.log("=== DRY RUN MODE ===");

  if (allDates) {
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
