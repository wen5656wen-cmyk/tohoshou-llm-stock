/**
 * fetch-dividend-history.ts — Sync 5-year dividend history from J-Quants fins/summary
 *
 * Since /v2/fins/dividend requires Premium plan, this script uses
 * DivAnn / PayoutRatioAnn fields embedded in /fins/summary (Standard plan).
 *
 * Run conditions:
 *   - Processes only symbols in StockScore (scored stocks, ~3700)
 *   - Skips symbols with Dividend data synced within the last 7 days
 *   - Rate-limited: 5 concurrent, 200ms delay between batches
 *
 * Usage:
 *   npx tsx scripts/fetch-dividend-history.ts
 *   DRY_RUN=1 npx tsx scripts/fetch-dividend-history.ts
 *   FORCE=1 npx tsx scripts/fetch-dividend-history.ts   # ignore 7-day skip
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getFinSummary, parseFinSummary } from "../lib/jquants";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1";
const FORCE   = process.env.FORCE   === "1";
const CONCURRENCY = 5;
const BATCH_DELAY_MS = 200;

async function processSymbol(symbol: string, latestClose: number | null): Promise<{ synced: number; skipped: boolean }> {
  let rows;
  try {
    rows = await getFinSummary(symbol);
  } catch (e) {
    throw new Error(`J-Quants fins/summary failed: ${(e as Error).message}`);
  }

  // Only FY (full-year) records carry reliable DivAnn
  const fyRows = rows.filter((r) => r.CurPerType === "FY");
  let synced = 0;

  for (const raw of fyRows) {
    const parsed = parseFinSummary(raw);
    if (parsed.divAnn === null) continue;

    const yieldRate = latestClose && latestClose > 0
      ? (parsed.divAnn / latestClose) * 100
      : null;

    const divData = {
      dividend:    parsed.divAnn,
      yieldRate,
      payoutRatio: parsed.payoutRatio,
      source:      "jquants",
    };

    if (!DRY_RUN) {
      const existing = await prisma.dividend.findFirst({
        where: { symbol, year: parsed.fiscalYear, quarter: null },
        select: { id: true },
      });
      if (existing) {
        await prisma.dividend.update({ where: { id: existing.id }, data: divData });
      } else {
        await prisma.dividend.create({ data: { symbol, year: parsed.fiscalYear, quarter: null, ...divData } });
      }
    }
    synced++;
  }

  return { synced, skipped: false };
}

async function main() {
  const startMs = Date.now();
  console.log("\n=== 配当历史同步 (J-Quants fins/summary) ===");
  if (DRY_RUN) console.log("DRY_RUN=1 — 不写入数据库");
  if (FORCE)   console.log("FORCE=1  — 强制重新同步所有");
  console.log();

  // Get all scored symbols with their latest close prices
  const scored = await prisma.stockScore.findMany({
    select: { symbol: true, latestClose: true },
    orderBy: { symbol: "asc" },
  });

  // Get recently-synced symbols (within 7 days) — skip unless FORCE
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const recentSymbols = FORCE ? new Set<string>() : new Set(
    (await prisma.dividend.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { symbol: true },
      distinct: ["symbol"],
    })).map((d) => d.symbol)
  );

  const targets = scored.filter((s) => !recentSymbols.has(s.symbol));
  console.log(`対象: ${targets.length} 只 / ${scored.length} 只 (スキップ: ${scored.length - targets.length} 只, 7日以内同期済み)`);

  let totalSynced = 0, totalErrors = 0, processed = 0;

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((s) => processSymbol(s.symbol, s.latestClose))
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        totalSynced += r.value.synced;
      } else {
        totalErrors++;
        if (totalErrors <= 10) {
          console.warn(`  ✗ ${batch[j].symbol}: ${r.reason?.message ?? r.reason}`);
        }
      }
      processed++;
    }

    if ((i + CONCURRENCY) % 500 === 0 || i + CONCURRENCY >= targets.length) {
      process.stdout.write(`\r  進捗: [${processed}/${targets.length}] ✓${totalSynced} ✗${totalErrors}`);
    }

    if (i + CONCURRENCY < targets.length) {
      await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
    }
  }

  const durationMs = Date.now() - startMs;
  const elapsed = (durationMs / 1000).toFixed(1);
  console.log(`\n\n=== 完成: ${totalSynced}件同期 ${totalErrors}件エラー (${elapsed}s) ===`);

  if (!DRY_RUN) {
    const status = totalErrors === 0 ? "SUCCESS" : totalSynced > 0 ? "PARTIAL" : "ERROR";
    await prisma.syncLog.create({
      data: {
        source: "dividend_history",
        status,
        message: `${processed}只処理 ${totalSynced}件配当記録 ${totalErrors}件エラー (${elapsed}s)`,
        itemCount: totalSynced,
        durationMs,
      },
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
