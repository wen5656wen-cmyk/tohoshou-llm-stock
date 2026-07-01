#!/usr/bin/env npx tsx
/**
 * scripts/repair-stale-return60d.ts — P0 Split Contamination targeted data repair
 *
 * Root cause (see docs/CHANGELOG.md P0 entry, verified with exact arithmetic
 * reproduction for all 7 flagged symbols):
 *   StockScore's technical/return fields (return5d/20d/60d, ma5/20/60, rsi14,
 *   macd*) were computed by compute-scores.ts at a single timestamp
 *   (2026-06-30 21:23:04 UTC, this morning's regular run) — BEFORE the
 *   afternoon price backfill (v17.24.0 rate-limit fix validation) inserted
 *   the missing 2026-06-29/06-30 DailyPrice rows for ~3582 stocks that had
 *   failed to sync that morning. Because nDayReturn() looks back by ARRAY
 *   INDEX (not calendar date), computing against a 2-row-shorter series
 *   shifted the "60 days ago" reference point earlier by ~2 trading days,
 *   producing a stale, if arithmetically self-consistent, return60d.
 *
 *   This is NOT a bug in nDayReturn/calcIndicators (verified: recomputing
 *   with the current complete DailyPrice reproduces data-health-guard's
 *   "adj-computed" value exactly; recomputing with the pre-backfill window
 *   reproduces the stale "stored" value exactly, for every flagged symbol).
 *   NOT a real stock split (adjClose === close for every row in the window).
 *   NOT a Health Guard bug (the check correctly detected a real mismatch).
 *   Category: DailyPrice was incomplete at the moment StockScore was computed
 *   (a data-completeness/timing issue, already fixed at the source by the
 *   v17.24.0 sync rate-limit fix — this script repairs the pre-existing
 *   stale rows left over from before that fix took effect).
 *
 * Scope (intentionally narrow — do NOT rerun full compute-scores):
 *   Only refreshes calcIndicators()-derived technical fields:
 *     priceCount, latestDate, latestClose,
 *     return5d, return20d, return60d, rsi14, macd, macdSignal, macdHist,
 *     maTrend, macdSignalLabel
 *   Does NOT touch adaptiveScore / technicalScore / percentileRank /
 *   marketRank / recommendationV2 / opportunityScore / tradingAction / any
 *   AI-scoring or cross-market-ranking field — those are inherently
 *   whole-market computations (Pass 2 percentile ranking compares every
 *   stock against every other stock) and will be refreshed consistently,
 *   all together, by tomorrow's regular 07:30 JST compute-scores run.
 *   Re-running that whole pipeline here for a subset would itself corrupt
 *   percentileRank/marketRank integrity for the untouched majority.
 *
 * Target set: exactly the stocks whose StockScore.computedAt predates the
 * newest DailyPrice row available for that symbol (i.e., provably stale) —
 * not the whole database, not just the 7 CRITICAL-flagged symbols (many
 * more share the same staleness, just with less extreme return60d values
 * that don't happen to cross the health-guard's ±100% sampling threshold).
 *
 * Usage:
 *   npx tsx scripts/repair-stale-return60d.ts --dry-run   # preview only
 *   npx tsx scripts/repair-stale-return60d.ts             # apply
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { calcIndicators } from "../lib/indicators";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes("--dry-run");
const MIN_PRICE_COUNT = 20;

async function main() {
  console.log(`=== Repair stale return60d/technical fields${DRY_RUN ? " (DRY RUN)" : ""} ===\n`);

  // Affected = StockScore computed before the newest DailyPrice row it depends on.
  const affected = await prisma.$queryRaw<Array<{ symbol: string }>>`
    SELECT ss.symbol
    FROM "StockScore" ss
    JOIN (SELECT symbol, MAX("createdAt") AS "maxCreated" FROM "DailyPrice" GROUP BY symbol) dp
      ON dp.symbol = ss.symbol
    WHERE dp."maxCreated" > ss."computedAt"
  `;

  console.log(`Affected (stale) symbols: ${affected.length}`);
  if (affected.length === 0) {
    console.log("Nothing to repair.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0, skipped = 0, errCount = 0;
  const BATCH = 50;
  const symbols = affected.map(a => a.symbol);

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    await Promise.all(batch.map(async (symbol) => {
      try {
        const pricesDesc = await prisma.dailyPrice.findMany({
          where: { symbol },
          orderBy: { date: "desc" },
          select: { date: true, close: true, adjClose: true },
          take: 300,
        });
        if (pricesDesc.length < MIN_PRICE_COUNT) { skipped++; return; }

        const prices = pricesDesc.reverse().map((p) => ({
          date: p.date.toISOString().split("T")[0],
          close: Number(p.close),
          adjClose: p.adjClose !== null ? Number(p.adjClose) : null,
        }));
        const ind = calcIndicators(symbol, prices);

        if (!DRY_RUN) {
          await prisma.stockScore.update({
            where: { symbol },
            data: {
              priceCount: prices.length,
              latestDate: ind.latestDate,
              latestClose: ind.latestClose,
              return5d: ind.return5d,
              return20d: ind.return20d,
              return60d: ind.return60d,
              rsi14: ind.rsi14,
              macd: ind.macd,
              macdSignal: ind.macdSignal,
              macdHist: ind.macdHist,
              maTrend: ind.maTrend,
              macdSignalLabel: ind.macdSignalLabel,
              computedAt: new Date(),
            },
          });
        }
        updated++;
      } catch (e) {
        errCount++;
        console.error(`  ✗ ${symbol}: ${(e as Error).message}`);
      }
    }));
    if ((i + BATCH) % 500 === 0 || i + BATCH >= symbols.length) {
      console.log(`  progress: ${Math.min(i + BATCH, symbols.length)}/${symbols.length}`);
    }
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] Would update" : "Updated"}: ${updated}`);
  console.log(`Skipped (insufficient price history): ${skipped}`);
  console.log(`Errors: ${errCount}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FATAL:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
