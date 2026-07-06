#!/usr/bin/env npx tsx
/**
 * P6-T7 — Generate Daily AI Watchlist（每日 AI 关注池）
 *
 * Snapshots today's STRONG_BUY / BUY names from DailyRecommendation into an
 * independent date-scoped DailyAIWatchlist. Runs in the 07:30+ cron block AFTER
 * DailyRecommendation is fresh. JPX-calendar aware: non-trading days are skipped
 * (no new pool generated). Idempotent (upsert; history & user flags preserved).
 *
 * Usage:
 *   npm run daily-ai-watchlist            # today (skips non-trading days)
 *   npm run daily-ai-watchlist -- --date=2026-07-06   # explicit date (no guard)
 *   DRY_RUN=1 npm run daily-ai-watchlist  # compute + log, no write
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isJPXTradingDay } from "../lib/trading-calendar/jpx";
import { generateDailyWatchlist, jstDate } from "../lib/daily-watchlist/generate";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
  const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

  // JPX guard only for the implicit "today" run (explicit --date is a manual backfill)
  if (!dateArg) {
    const target = jstDate();
    if (!isJPXTradingDay(target)) {
      console.log(`[JPX_CALENDAR] SKIP_NON_TRADING_DAY task=daily-ai-watchlist date=${target.toISOString().slice(0, 10)} — 非交易日不生成关注池`);
      await prisma.$disconnect();
      return;
    }
  }

  if (dryRun) {
    const date = jstDate(dateArg);
    const recs = await prisma.dailyRecommendation.count({
      where: { date, recommendation: { in: ["STRONG_BUY", "BUY"] } },
    });
    console.log(`[DRY_RUN] date=${date.toISOString().slice(0, 10)} would snapshot ${recs} STRONG_BUY/BUY names`);
    await prisma.$disconnect();
    return;
  }

  const res = await generateDailyWatchlist(prisma, dateArg);
  console.log(
    `✅ Daily AI Watchlist generated — date=${res.date} count=${res.count} (STRONG_BUY=${res.strongBuy} BUY=${res.buy})`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("generate-daily-ai-watchlist CRASH:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
