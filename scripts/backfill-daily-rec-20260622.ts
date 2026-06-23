#!/usr/bin/env npx tsx
/**
 * scripts/backfill-daily-rec-20260622.ts
 *
 * Backfill DailyRecommendation for 2026-06-22 (first historical cohort).
 *
 * Data sources:
 *   - GPTScore (gptRank 1–464, scored at 2026-06-22 23:13 JST by yesterday's pipeline)
 *   - StockScore (computedAt 2026-06-23 07:30 JST, uses 2026-06-22 close prices)
 *   - DailyPrice (2026-06-22 close as entryPrice per user instruction)
 *
 * Selection:
 *   FinalScore Top50 | all STRONG_BUY | all BUY | WATCH Top20 (deduped)
 *
 * Marks all records: summaryZh = "BACKFILLED_FROM_AVAILABLE_DATA|..."
 * entryPrice = 2026-06-22 close, entryPriceType = "BACKFILL_PREV_CLOSE"
 *
 * Usage:
 *   npx tsx scripts/backfill-daily-rec-20260622.ts --dry-run   # preview
 *   npx tsx scripts/backfill-daily-rec-20260622.ts             # write to DB
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BACKFILL_DATE = "2026-06-22";
const BACKFILL_SOURCE = "BACKFILLED_FROM_AVAILABLE_DATA";

// UTC midnight of 2026-06-22 → PostgreSQL stores as date=2026-06-22
const TARGET_DATE = new Date("2026-06-22T00:00:00.000Z");

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  console.log(`\n${"═".repeat(60)}`);
  console.log(`BACKFILL DailyRecommendation — ${BACKFILL_DATE}`);
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log(`${"═".repeat(60)}\n`);

  // ── 1. Existing check ─────────────────────────────────────────────────────
  const existing = await prisma.dailyRecommendation.count({
    where: { date: TARGET_DATE },
  });
  console.log(`[check] Existing DailyRecommendation for ${BACKFILL_DATE}: ${existing}`);
  if (existing > 0 && !DRY_RUN) {
    console.log(`[info] Records already exist — upsert will update them.`);
  }

  // ── 2. Load GPTScore (yesterday's pipeline, gptRank 1–464) ───────────────
  const gptScores = await prisma.gPTScore.findMany({
    where: { gptRank: { not: null } },
    select: {
      symbol: true,
      gptRank: true,
      finalScore: true,
      gptScore: true,
      ruleScore: true,
      gptRating: true,
      summaryZh: true,
    },
    orderBy: { gptRank: "asc" },
  });
  console.log(`[data] GPTScore records with gptRank: ${gptScores.length}`);

  // Sort by finalScore DESC → Top50 by finalScore
  const gptByFinalScore = [...gptScores].sort(
    (a, b) => b.finalScore - a.finalScore
  );
  const top50Set = new Set(gptByFinalScore.slice(0, 50).map((g) => g.symbol));
  console.log(
    `[data] Top50 by finalScore — lowest finalScore in set: ${gptByFinalScore[49]?.finalScore?.toFixed(1)}`
  );

  const gptMap = new Map(gptScores.map((g) => [g.symbol, g]));

  // ── 3. Load StockScore (all SB / BUY / WATCH) ────────────────────────────
  const stockScores = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: 20 },
      adaptiveScore: { not: null },
      recommendationV2: { in: ["STRONG_BUY", "BUY", "WATCH"] },
    },
    orderBy: [{ adaptiveScore: "desc" }, { percentileRank: "asc" }],
    select: {
      symbol: true,
      adaptiveScore: true,
      percentileRank: true,
      recommendationV2: true,
      tradingAction: true,
      latestClose: true,
      opportunityScore: true,
    },
  });
  console.log(`[data] StockScore SB+BUY+WATCH: ${stockScores.length}`);

  const sbBuySymbols = stockScores
    .filter(
      (s) =>
        s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY"
    )
    .map((s) => s.symbol);
  const watchTop20 = stockScores
    .filter((s) => s.recommendationV2 === "WATCH")
    .slice(0, 20)
    .map((s) => s.symbol);

  console.log(`[data] STRONG_BUY: ${sbBuySymbols.filter((s) => stockScores.find((ss) => ss.symbol === s)?.recommendationV2 === "STRONG_BUY").length}`);
  console.log(`[data] BUY: ${sbBuySymbols.filter((s) => stockScores.find((ss) => ss.symbol === s)?.recommendationV2 === "BUY").length}`);
  console.log(`[data] WATCH Top20 selected: ${watchTop20.length}`);

  const ssMap = new Map(stockScores.map((s) => [s.symbol, s]));

  // For top50 stocks not in ssMap, fetch their StockScore
  const top50NotInSS = [...top50Set].filter((sym) => !ssMap.has(sym));
  if (top50NotInSS.length > 0) {
    const extra = await prisma.stockScore.findMany({
      where: { symbol: { in: top50NotInSS } },
      select: {
        symbol: true,
        adaptiveScore: true,
        percentileRank: true,
        recommendationV2: true,
        tradingAction: true,
        latestClose: true,
        opportunityScore: true,
      },
    });
    extra.forEach((s) => ssMap.set(s.symbol, s));
    console.log(`[data] Extra StockScore fetched for top50: ${extra.length}`);
  }

  // ── 4. Union all target symbols ───────────────────────────────────────────
  const allSymbols = new Set([
    ...top50Set,
    ...sbBuySymbols,
    ...watchTop20,
  ]);
  console.log(`\n[select] top50=${top50Set.size} SB+BUY=${sbBuySymbols.length} watchTop20=${watchTop20.length}`);
  console.log(`[select] Total unique symbols: ${allSymbols.size}`);

  // ── 5. Load DailyPrice for 2026-06-22 ────────────────────────────────────
  const dailyPrices = await prisma.dailyPrice.findMany({
    where: {
      symbol: { in: [...allSymbols] },
      date: TARGET_DATE,
      close: { gt: 0 },
    },
    select: { symbol: true, close: true, adjClose: true },
  });
  const dpMap = new Map(dailyPrices.map((r) => [r.symbol, r]));
  console.log(
    `[data] DailyPrice 2026-06-22 found: ${dpMap.size}/${allSymbols.size}`
  );
  const missingPrice = [...allSymbols].filter((sym) => !dpMap.has(sym));
  if (missingPrice.length > 0) {
    console.log(`[warn] Missing DailyPrice: ${missingPrice.join(", ")}`);
  }

  // ── 6. Build records ──────────────────────────────────────────────────────
  const records = [...allSymbols].map((symbol) => {
    const gpt = gptMap.get(symbol);
    const ss = ssMap.get(symbol);
    const dp = dpMap.get(symbol);

    const hasGpt = !!gpt;
    const gptRank = gpt?.gptRank ?? 500;
    const finalScore = gpt
      ? gpt.finalScore
      : (ss?.adaptiveScore ?? 50);
    const adaptiveScore = ss?.adaptiveScore ?? gpt?.ruleScore ?? 50;
    // gptScore NOT NULL in schema — fallback to adaptiveScore when no GPT data
    const gptScore = gpt?.gptScore ?? adaptiveScore;
    const gptRating =
      gpt?.gptRating ??
      (ss?.recommendationV2 === "STRONG_BUY"
        ? "STRONG_BUY"
        : ss?.recommendationV2 === "BUY"
        ? "BUY"
        : null);
    const buyPrice = ss?.latestClose ?? dp?.close ?? null;
    const entryPrice = dp?.close ?? ss?.latestClose ?? null;
    const summaryZh = `${BACKFILL_SOURCE}|gpt=${hasGpt ? "YES(gptRank=" + gpt!.gptRank + ")" : "NO"}|rec=${ss?.recommendationV2 ?? "n/a"}`;

    return {
      symbol,
      gptRank,
      finalScore,
      adaptiveScore,
      gptScore,
      gptRating,
      buyPrice,
      entryPrice,
      summaryZh,
      hasGpt,
      rec: ss?.recommendationV2 ?? "n/a",
      ta: ss?.tradingAction ?? null,
    };
  });

  // Sort by finalScore DESC
  records.sort((a, b) => b.finalScore - a.finalScore);

  // ── 7. Preview ────────────────────────────────────────────────────────────
  console.log("\n[preview] Top 10 records:");
  console.log(
    "  " +
      ["#", "symbol", "gptRank", "finalScore", "adaptiveScore", "gptScore", "entryPrice", "rec", "hasGpt"]
        .join("\t")
  );
  records.slice(0, 10).forEach((r, i) => {
    console.log(
      `  ${i + 1}\t${r.symbol}\t${r.gptRank}\t${r.finalScore.toFixed(1)}\t${r.adaptiveScore}\t${r.gptScore}\t${r.entryPrice ?? "null"}\t${r.rec}\t${r.hasGpt}`
    );
  });

  const noGptCount = records.filter((r) => !r.hasGpt).length;
  const noPriceCount = records.filter((r) => r.entryPrice == null).length;
  console.log(`\n[summary] Total: ${records.length} | No GPT: ${noGptCount} | No entryPrice: ${noPriceCount}`);

  if (DRY_RUN) {
    console.log("\n[DRY_RUN] No DB writes performed.");
    await prisma.$disconnect();
    return;
  }

  // ── 8. Upsert into DailyRecommendation ───────────────────────────────────
  console.log(`\n[write] Upserting ${records.length} records to DailyRecommendation...`);
  let written = 0;
  let errors = 0;

  for (const r of records) {
    try {
      await prisma.dailyRecommendation.upsert({
        where: { date_symbol: { date: TARGET_DATE, symbol: r.symbol } },
        create: {
          date: TARGET_DATE,
          symbol: r.symbol,
          gptRank: r.gptRank,
          finalScore: r.finalScore,
          adaptiveScore: r.adaptiveScore,
          gptScore: r.gptScore,
          gptRating: r.gptRating,
          buyPrice: r.buyPrice,
          entryDate: TARGET_DATE,
          entryPrice: r.entryPrice,
          entryPriceType: "BACKFILL_PREV_CLOSE",
          summaryZh: r.summaryZh,
        },
        update: {
          gptRank: r.gptRank,
          finalScore: r.finalScore,
          adaptiveScore: r.adaptiveScore,
          gptScore: r.gptScore,
          gptRating: r.gptRating,
          buyPrice: r.buyPrice,
          entryDate: TARGET_DATE,
          entryPrice: r.entryPrice,
          entryPriceType: "BACKFILL_PREV_CLOSE",
          summaryZh: r.summaryZh,
        },
      });
      written++;
    } catch (e) {
      errors++;
      console.error(`[error] Failed to upsert ${r.symbol}: ${e}`);
    }
  }

  console.log(`\n[done] Written: ${written} | Errors: ${errors}`);

  // ── 9. Verify ─────────────────────────────────────────────────────────────
  const finalCount = await prisma.dailyRecommendation.count({
    where: { date: TARGET_DATE },
  });
  console.log(`[verify] DailyRecommendation for ${BACKFILL_DATE}: ${finalCount} rows`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
