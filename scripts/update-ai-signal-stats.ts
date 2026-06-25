/**
 * update-ai-signal-stats.ts — v13.0 Final
 *
 * Today win rate:
 *   todayClose = DailyPrice.close where date = tradeDate (exact match, NOT latestClose)
 *   If DailyPrice not synced for tradeDate → validTodayCount=0, todayWinRate=null → PENDING
 *
 * Return rules: ret = (todayClose - entryPrice) / entryPrice × 100
 *   ret > 0  → win;  ret < 0  → loss;  ret = 0  → flat (in validTodayCount, not win/loss)
 *
 * Distribution thresholds:
 *   Today: ±3%  (bigUp>=+3%, smallUp 0~3%, flat=0, smallDown -3~0%, bigDown<=-3%)
 *   7-day: ±5%  (bigUp>=+5%, smallUp 0~5%, flat=0, smallDown -5~0%, bigDown<=-5%)
 *
 * Cohort (P2): per-day unique symbol stats = regular stats (each symbol unique/day).
 *   Cross-day lifecycle cohort is a future enhancement.
 *
 * Usage:
 *   npx tsx scripts/update-ai-signal-stats.ts              # today JST
 *   npx tsx scripts/update-ai-signal-stats.ts --date=YYYY-MM-DD
 *   npx tsx scripts/update-ai-signal-stats.ts --all
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

function avgOf(arr: number[]): number | null {
  return arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function maxOf(arr: number[]): number | null {
  return arr.length === 0 ? null : Math.max(...arr);
}

function minOf(arr: number[]): number | null {
  return arr.length === 0 ? null : Math.min(...arr);
}

type ActionType = "STRONG_BUY" | "BUY" | "ALL_BUY";

interface RecRow {
  symbol: string;
  recommendation: string | null;
  buyPrice: number | null;
  return7d: number | null;
}

// ── Core compute for one date ─────────────────────────────────────────────────

async function computeForDate(dateStr: string, dryRun: boolean): Promise<void> {
  const dateObj = new Date(`${dateStr}T00:00:00.000Z`);

  // 1. Fetch all BUY/STRONG_BUY recommendations for this date
  const recs = await prisma.dailyRecommendation.findMany({
    where: { date: dateObj, recommendation: { in: ["STRONG_BUY", "BUY"] } },
    select: { symbol: true, recommendation: true, buyPrice: true, return7d: true },
  });

  if (recs.length === 0) {
    console.log(`[${dateStr}] No BUY/STRONG_BUY — skipping`);
    return;
  }

  const symbols = [...new Set(recs.map((r) => r.symbol))];

  // 2. Check DailyPrice availability (global latest date)
  const latestPriceRow = await prisma.dailyPrice.findFirst({
    orderBy: { date: "desc" }, select: { date: true },
  });
  const latestPriceDateStr = latestPriceRow?.date.toISOString().slice(0, 10) ?? null;
  const pricesReady = latestPriceDateStr != null && latestPriceDateStr >= dateStr;

  // 3. Load DailyPrice.close for exact tradeDate
  const priceMap: Record<string, number | null> = {};
  if (pricesReady) {
    const prices = await prisma.dailyPrice.findMany({
      where: { symbol: { in: symbols }, date: dateObj },
      select: { symbol: true, close: true },
    });
    for (const p of prices) priceMap[p.symbol] = p.close ?? null;
  }

  const now = new Date();

  for (const actionType of ["STRONG_BUY", "BUY", "ALL_BUY"] as ActionType[]) {
    const filtered: RecRow[] =
      actionType === "ALL_BUY" ? recs : recs.filter((r) => r.recommendation === actionType);
    if (filtered.length === 0) continue;

    // ── Today stats ──────────────────────────────────────────────────────────
    const todayRets: number[] = [];
    let validTodayCount = 0, todayWinCount = 0, todayLossCount = 0, todayFlatCount = 0;
    let bigUpToday = 0, smallUpToday = 0, smallDownToday = 0, bigDownToday = 0;

    if (pricesReady) {
      for (const rec of filtered) {
        const close = priceMap[rec.symbol] ?? null;
        const entry = rec.buyPrice;
        if (close == null || entry == null || entry === 0) continue;
        validTodayCount++;
        const ret = ((close - entry) / entry) * 100;
        todayRets.push(ret);

        if (ret > 0) { todayWinCount++; if (ret >= 3) bigUpToday++; else smallUpToday++; }
        else if (ret < 0) { todayLossCount++; if (ret <= -3) bigDownToday++; else smallDownToday++; }
        else todayFlatCount++;
      }
    }

    const todayWinRate = validTodayCount > 0 ? (todayWinCount / validTodayCount) * 100 : null;
    const avgTodayReturnPct = avgOf(todayRets);
    const bestTodayReturnPct = maxOf(todayRets);
    const worstTodayReturnPct = minOf(todayRets);

    // ── 7-day stats ──────────────────────────────────────────────────────────
    const rets7d: number[] = [];
    let valid7dCount = 0, win7dCount = 0, loss7dCount = 0, flat7dCount = 0;
    let bigUp7d = 0, smallUp7d = 0, smallDown7d = 0, bigDown7d = 0;

    for (const rec of filtered) {
      if (rec.return7d == null) continue;
      valid7dCount++;
      const r = rec.return7d;
      rets7d.push(r);
      if (r > 0) { win7dCount++; if (r >= 5) bigUp7d++; else smallUp7d++; }
      else if (r < 0) { loss7dCount++; if (r <= -5) bigDown7d++; else smallDown7d++; }
      else flat7dCount++;
    }

    const win7dRate = valid7dCount > 0 ? (win7dCount / valid7dCount) * 100 : null;
    const avg7dReturnPct = avgOf(rets7d);
    const best7dReturnPct = maxOf(rets7d);
    const worst7dReturnPct = minOf(rets7d);

    // ── Cohort / unique symbol (per-day = regular; cross-day future) ─────────
    const uniqueSymbolCount = filtered.length;
    const uniqueWinCount = todayWinCount;
    const uniqueWinRate = todayWinRate;

    // ── Log ──────────────────────────────────────────────────────────────────
    const todayLabel = pricesReady
      ? `W${todayWinCount}L${todayLossCount}F${todayFlatCount}/${validTodayCount}(${todayWinRate?.toFixed(1) ?? "—"}% avg${avgTodayReturnPct?.toFixed(2) ?? "—"}% best${bestTodayReturnPct?.toFixed(2) ?? "—"}%)`
      : `PENDING[latest=${latestPriceDateStr ?? "none"}]`;

    const payload = {
      tradeDate: dateObj, actionType,
      recommendationCount: filtered.length,
      validTodayCount, todayWinCount, todayLossCount, todayFlatCount,
      todayWinRate, avgTodayReturnPct, bestTodayReturnPct, worstTodayReturnPct,
      bigUpTodayCount: bigUpToday, smallUpTodayCount: smallUpToday,
      smallDownTodayCount: smallDownToday, bigDownTodayCount: bigDownToday,
      valid7dCount, win7dCount, loss7dCount, flat7dCount,
      win7dRate, avg7dReturnPct, best7dReturnPct, worst7dReturnPct,
      bigUp7dCount: bigUp7d, smallUp7dCount: smallUp7d,
      smallDown7dCount: smallDown7d, bigDown7dCount: bigDown7d,
      uniqueSymbolCount, uniqueWinCount, uniqueWinRate,
      calculatedAt: now,
    };

    if (dryRun) {
      console.log(`[DRY] ${dateStr} | ${actionType} | recs=${filtered.length} | today=${todayLabel} | 7d=W${win7dCount}L${loss7dCount}/${valid7dCount}(${win7dRate?.toFixed(1) ?? "积累中"}%)`);
    } else {
      await prisma.aISignalDailyStat.upsert({
        where: { tradeDate_actionType: { tradeDate: dateObj, actionType } },
        create: payload,
        update: {
          recommendationCount: payload.recommendationCount,
          validTodayCount, todayWinCount, todayLossCount, todayFlatCount,
          todayWinRate, avgTodayReturnPct, bestTodayReturnPct, worstTodayReturnPct,
          bigUpTodayCount: bigUpToday, smallUpTodayCount: smallUpToday,
          smallDownTodayCount: smallDownToday, bigDownTodayCount: bigDownToday,
          valid7dCount, win7dCount, loss7dCount, flat7dCount,
          win7dRate, avg7dReturnPct, best7dReturnPct, worst7dReturnPct,
          bigUp7dCount: bigUp7d, smallUp7dCount: smallUp7d,
          smallDown7dCount: smallDown7d, bigDown7dCount: bigDown7d,
          uniqueSymbolCount, uniqueWinCount, uniqueWinRate,
          calculatedAt: now,
        },
      });
      console.log(`[${dateStr}] ${actionType}: recs=${filtered.length} | ${todayLabel} | 7d=${win7dRate?.toFixed(1) ?? "积累中"}%`);
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

  if (dryRun) console.log("=== DRY RUN ===");

  if (allDates) {
    const rows = await prisma.dailyRecommendation.findMany({
      where: { recommendation: { in: ["STRONG_BUY", "BUY"] } },
      select: { date: true }, distinct: ["date"], orderBy: { date: "asc" },
    });
    const dates = rows.map((r) =>
      r.date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
    );
    console.log(`Processing ${dates.length} dates...`);
    for (const d of dates) await computeForDate(d, dryRun);
  } else {
    await computeForDate(dateFlag ?? todayJST(), dryRun);
  }

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
