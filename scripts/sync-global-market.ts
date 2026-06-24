#!/usr/bin/env npx tsx
/**
 * Historical GlobalMarket sync — backfills TOPIX and Nikkei225 for the past N days.
 * Prerequisite for BacktestResult.benchmarkTopixReturn / excessVsTopix (Alpha engine).
 *
 * Only writes topix / topixChange / nikkei / nikkeiChange.
 * Preserves existing nasdaq / vix / usdjpy / score on update.
 *
 * Usage: npm run sync-global-market
 *        DAYS=730 npm run sync-global-market   (custom range)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["ripHistorical", "yahooSurvey"] });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const DAYS = parseInt(process.env.DAYS ?? "400", 10);
  const period2 = new Date();
  const period1 = new Date(Date.now() - DAYS * 86_400_000);

  console.log("=== Historical GlobalMarket Sync (TOPIX + Nikkei225) ===");
  console.log(`Range: ${period1.toISOString().slice(0, 10)} → ${period2.toISOString().slice(0, 10)}`);
  console.log(`DAYS=${DAYS}\n`);

  // 1306.T = Nomura TOPIX ETF — historical available where ^TOPIX is not.
  // Returns are representative of TOPIX index returns.
  console.log("Fetching 1306.T (TOPIX ETF proxy) ...");
  let topixHist: Array<{ date: Date; close: number }> = [];
  try {
    topixHist = (await yf.historical("1306.T", { period1, period2, interval: "1d" })) as typeof topixHist;
    console.log(`  Got ${topixHist.length} rows`);
  } catch (e) {
    console.error("  1306.T fetch failed:", e);
  }

  console.log("Fetching ^N225 ...");
  let nikkeiHist: Array<{ date: Date; close: number }> = [];
  try {
    nikkeiHist = (await yf.historical("^N225", { period1, period2, interval: "1d" })) as typeof nikkeiHist;
    console.log(`  Got ${nikkeiHist.length} rows`);
  } catch (e) {
    console.error("  ^N225 fetch failed:", e);
  }

  const topixByDate = new Map<string, number>();
  for (const row of topixHist) {
    const d = new Date(row.date).toISOString().slice(0, 10);
    if (row.close != null) topixByDate.set(d, row.close);
  }

  const nikkeiByDate = new Map<string, number>();
  for (const row of nikkeiHist) {
    const d = new Date(row.date).toISOString().slice(0, 10);
    if (row.close != null) nikkeiByDate.set(d, row.close);
  }

  const allDates = Array.from(new Set([...topixByDate.keys(), ...nikkeiByDate.keys()])).sort();
  console.log(`\nTrading days to process: ${allDates.length}`);

  let prevTopix: number | null = null;
  let prevNikkei: number | null = null;
  let upserted = 0;
  let errors = 0;

  for (const dateStr of allDates) {
    const topixLevel = topixByDate.get(dateStr) ?? null;
    const nikkeiLevel = nikkeiByDate.get(dateStr) ?? null;

    const topixChange =
      prevTopix != null && topixLevel != null
        ? ((topixLevel - prevTopix) / prevTopix) * 100
        : null;
    const nikkeiChange =
      prevNikkei != null && nikkeiLevel != null
        ? ((nikkeiLevel - prevNikkei) / prevNikkei) * 100
        : null;

    if (topixLevel != null) prevTopix = topixLevel;
    if (nikkeiLevel != null) prevNikkei = nikkeiLevel;

    try {
      await prisma.globalMarket.upsert({
        where: { date: new Date(dateStr) },
        create: {
          date: new Date(dateStr),
          topix: topixLevel,
          topixChange,
          nikkei: nikkeiLevel,
          nikkeiChange,
          source: "yahoo",
        },
        update: {
          topix: topixLevel,
          topixChange,
          nikkei: nikkeiLevel,
          nikkeiChange,
        },
      });
      upserted++;
    } catch (e) {
      console.error(`  Error on ${dateStr}:`, e);
      errors++;
    }
  }

  console.log(`\n✓ Upserted ${upserted}, errors ${errors}`);

  // Sample verification
  const sample = await prisma.globalMarket.findMany({
    where: { topix: { not: null } },
    orderBy: { date: "desc" },
    take: 5,
    select: { date: true, topix: true, topixChange: true },
  });
  console.log("\nLatest 5 rows with TOPIX:");
  for (const r of sample) {
    const chg = r.topixChange != null ? ` (${r.topixChange >= 0 ? "+" : ""}${r.topixChange.toFixed(2)}%)` : "";
    console.log(`  ${r.date.toISOString().slice(0, 10)}: TOPIX=${r.topix?.toFixed(2)}${chg}`);
  }

  const totalWithTopix = await prisma.globalMarket.count({ where: { topix: { not: null } } });
  const totalRows = await prisma.globalMarket.count();
  console.log(`\nGlobalMarket total=${totalRows}, with TOPIX=${totalWithTopix}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
