#!/usr/bin/env npx tsx
/**
 * Alpha Engine 2.0 — Phase 1 compute worker.
 *
 * Computes the parallel Alpha factor layer for the AI universe (aiEnabled=true) and
 * upserts into AlphaFactor. STRICTLY ADDITIVE: reads DailyPrice / GlobalMarket(TOPIX) /
 * Stock only; NEVER reads or writes StockScore / DailyRecommendation / Portfolio / GPTScore.
 *
 * Usage:  npm run compute-alpha-factors
 *         DRY_RUN=1 npm run compute-alpha-factors   (compute + log, no writes)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeAllAlphaFactors, type Bar } from "../lib/alpha";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const MIN_BARS = 20; // need at least ~20 bars for the shorter-window factors
const FETCH_BARS = 260; // ~52 weeks for 52w distance
const BATCH = 50;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const t0 = Date.now();
  console.log(`=== Alpha Factors (Phase 1) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);

  // TOPIX series → date→level map (for relative strength). Additive read only.
  const gm = await prisma.globalMarket.findMany({
    where: { topix: { not: null } },
    select: { date: true, topix: true },
    orderBy: { date: "desc" },
    take: 400,
  });
  const topixByDate = new Map<string, number>();
  for (const g of gm) {
    if (g.topix != null) topixByDate.set(ymd(g.date), g.topix);
  }
  console.log(`TOPIX days loaded: ${topixByDate.size}`);

  const stocks = await prisma.stock.findMany({
    where: { aiEnabled: true },
    select: { symbol: true },
    orderBy: { symbol: "asc" },
  });
  console.log(`Universe (aiEnabled=true): ${stocks.length} stocks\n`);

  const computedAt = new Date();
  let computed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (st) => {
        try {
          const rows = await prisma.dailyPrice.findMany({
            where: { symbol: st.symbol },
            orderBy: { date: "desc" },
            take: FETCH_BARS,
            select: { date: true, open: true, high: true, low: true, close: true, adjClose: true, volume: true },
          });
          if (rows.length < MIN_BARS) {
            skipped++;
            return;
          }
          const bars: Bar[] = rows.map((r) => ({
            date: ymd(r.date),
            open: r.open ?? null,
            high: r.high ?? null,
            low: r.low ?? null,
            close: r.close,
            adjClose: r.adjClose ?? null,
            volume: r.volume ?? null,
          }));
          const latestDate = rows[0].date; // Date @db.Date
          const f = computeAllAlphaFactors(bars, topixByDate, st.symbol);

          if (!DRY_RUN) {
            await prisma.alphaFactor.upsert({
              where: { symbol_date: { symbol: st.symbol, date: latestDate } },
              create: { symbol: st.symbol, date: latestDate, computedAt, ...f },
              update: { computedAt, ...f },
            });
          }
          computed++;
        } catch (e) {
          errors++;
          if (errors <= 5) console.error(`  ✗ ${st.symbol}: ${e instanceof Error ? e.message : String(e)}`);
        }
      })
    );
    if ((i / BATCH) % 10 === 0) {
      process.stdout.write(`\r  progress: ${Math.min(i + BATCH, stocks.length)}/${stocks.length}`);
    }
  }

  console.log(
    `\n\n=== Done (${((Date.now() - t0) / 1000).toFixed(1)}s) — computed ${computed}, skipped ${skipped}, errors ${errors} ===`
  );
  if (DRY_RUN) console.log("(DRY RUN — no writes)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
