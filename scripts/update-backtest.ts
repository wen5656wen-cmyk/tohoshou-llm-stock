#!/usr/bin/env npx tsx
/**
 * scripts/update-backtest.ts v2.3.0 — Architecture v2.3 backtest engine
 *
 * Architecture v2.3 changes vs v10.1.1:
 *   - BacktestPositionResult is the source of truth for per-symbol results
 *   - DailyRecommendation.return7d/30d/90d/exitDate7d/price7d/filledAt/priceSource DEPRECATED
 *   - Expands from 3 horizons to 9: 1d/3d/5d/7d/10d/20d/30d/60d/90d
 *   - Phase A: entry fill with WHERE entryPrice IS NULL guard (never overwrites)
 *   - Phase B: 9 horizons → BacktestPositionResult (upsert)
 *   - Phase C: aggregate from in-memory results → BacktestResult
 *
 * Usage:
 *   npm run update-backtest          # normal mode
 *   npm run update-backtest:force    # re-process ALL cohorts (--all)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { RULE_ENGINE_VERSION, CURRENT_SCHEMA_VERSION, SCORING_SCHEMA_VERSION } from "../lib/safety-rules";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const FORCE = process.argv.includes("--all");

// ── 9 Horizons (N = trading days after entry) ────────────────────────────────
const HORIZONS = [
  { key: "1d",  n: 1,  ageThreshold: 5   },
  { key: "3d",  n: 3,  ageThreshold: 7   },
  { key: "5d",  n: 5,  ageThreshold: 10  },
  { key: "7d",  n: 7,  ageThreshold: 15  },
  { key: "10d", n: 10, ageThreshold: 20  },
  { key: "20d", n: 20, ageThreshold: 35  },
  { key: "30d", n: 30, ageThreshold: 50  },
  { key: "60d", n: 60, ageThreshold: 95  },
  { key: "90d", n: 90, ageThreshold: 135 },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type PriceRow = { symbol: string; date: Date; open: number; close: number; adjClose: number | null };

interface PosRow {
  recDate: Date;
  symbol: string;
  horizon: string;
  entryDate: Date | null;
  entryPrice: number | null;
  exitDate: Date | null;
  exitPrice: number | null;
  returnPct: number | null;
  winFlag: boolean | null;
  benchmarkReturn: number | null;
  alphaVsTopix: number | null;
  priceSource: string | null;
  errorReason: string | null;
  modelVersion: string;
  scoreVersion: string;
  schemaVersion: string;
  versionSnapshotId: string | null;
  pipelineRunId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addCalendarDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function pct(exit: number | null, entry: number | null): number | null {
  if (exit == null || entry == null || entry === 0) return null;
  return Math.round(((exit - entry) / entry) * 10000) / 100;
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
}

function daysSince(recDate: Date, now: Date): number {
  return (now.getTime() - recDate.getTime()) / (1000 * 60 * 60 * 24);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// GlobalMarket cache: ISO-date → {nikkei, topix}
const gmCache = new Map<string, { nikkei: number | null; topix: number | null }>();
async function getGlobalMarket(d: Date): Promise<{ nikkei: number | null; topix: number | null }> {
  const key = d.toISOString().slice(0, 10);
  if (gmCache.has(key)) return gmCache.get(key)!;
  const row = await prisma.globalMarket.findFirst({
    where: { date: { gte: d, lte: addCalendarDays(d, 7) } },
    orderBy: { date: "asc" },
    select: { nikkei: true, topix: true },
  });
  const val = { nikkei: row?.nikkei ?? null, topix: row?.topix ?? null };
  gmCache.set(key, val);
  return val;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const jstHour = (now.getUTCHours() + 9) % 24;
  const pipelineRunId = FORCE
    ? `${dateStr}-MANUAL`
    : jstHour < 12 ? `${dateStr}-AM` : `${dateStr}-PM`;

  // Resolve active VersionSnapshot (null-safe if table is empty)
  const vsRow = await prisma.versionSnapshot.findFirst({
    where: { endDate: null },
    orderBy: { startDate: "desc" },
    select: { id: true },
  });
  const versionSnapshotId = vsRow?.id ?? null;

  console.log(`📊 update-backtest v2.3.0 [${FORCE ? "--all" : "normal"}] pipelineRunId=${pipelineRunId} vsId=${versionSnapshotId ?? "null"}`);
  console.log(`   model=${RULE_ENGINE_VERSION} schema=${CURRENT_SCHEMA_VERSION}`);

  // ── Cohort date selection ─────────────────────────────────────────────────
  let cohortDates: { date: Date }[];
  if (FORCE) {
    cohortDates = await prisma.$queryRaw<{ date: Date }[]>`
      SELECT DISTINCT date FROM daily_recommendations ORDER BY date ASC
    `;
    console.log(`   ${cohortDates.length} cohort dates [--all]`);
  } else {
    cohortDates = await prisma.$queryRaw<{ date: Date }[]>`
      SELECT DISTINCT dr.date
      FROM daily_recommendations dr
      WHERE dr."entryDate" IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM backtest_position_results bpr
           WHERE bpr."recDate" = dr.date
             AND bpr.symbol = dr.symbol
             AND bpr.horizon = '7d'
         )
      ORDER BY dr.date ASC
    `;
    console.log(`   ${cohortDates.length} cohort dates need update`);
  }

  if (cohortDates.length === 0) {
    console.log("  ✅ Nothing to process.");
    await prisma.$disconnect();
    return;
  }

  let entryFillCount = 0;
  let posUpsertCount = 0;
  let resultUpsertCount = 0;
  let totalErrors = 0;

  for (const { date: recDate } of cohortDates) {
    const recDateStr = new Date(recDate).toISOString().slice(0, 10);
    console.log(`\n  ▶ cohort ${recDateStr}`);

    const recs = await prisma.dailyRecommendation.findMany({
      where: { date: recDate },
      orderBy: { gptRank: "asc" },
      select: { id: true, symbol: true, gptRank: true, entryDate: true, entryPrice: true },
    });
    if (recs.length === 0) continue;

    const symbols = recs.map((r) => r.symbol);
    const age = daysSince(new Date(recDate), now);

    // Fetch up to 135 calendar days of prices (90 trading days ≈ 126 calendar days + buffer)
    const priceUntil = addCalendarDays(recDate, 135);
    const effectiveUntil = priceUntil < now ? priceUntil : now;

    const allPriceRows = await prisma.dailyPrice.findMany({
      where: { symbol: { in: symbols }, date: { gt: recDate, lte: effectiveUntil } },
      orderBy: [{ symbol: "asc" }, { date: "asc" }],
      select: { symbol: true, date: true, open: true, close: true, adjClose: true },
    });

    const priceMap = new Map<string, PriceRow[]>();
    for (const p of allPriceRows) {
      if (!priceMap.has(p.symbol)) priceMap.set(p.symbol, []);
      priceMap.get(p.symbol)!.push(p as PriceRow);
    }

    const recBySymbol = new Map(recs.map((r) => [r.symbol, r]));

    // ── Phase A: fill entryDate/entryPrice (WHERE entryPrice IS NULL guard) ──
    const entryData = new Map<string, { entryDate: Date; entryPrice: number }>();

    for (const rec of recs) {
      if (rec.entryPrice != null && rec.entryDate != null) {
        entryData.set(rec.symbol, { entryDate: new Date(rec.entryDate), entryPrice: rec.entryPrice });
        continue;
      }
      const prices = priceMap.get(rec.symbol) ?? [];
      if (prices.length === 0) continue;
      const p0 = prices[0];
      if (!p0.open || p0.open === 0) continue;

      const entryDate = new Date(p0.date);
      const entryPrice = p0.open;
      entryData.set(rec.symbol, { entryDate, entryPrice });

      // Only update DR if entryPrice was null (never overwrite)
      if (rec.entryPrice == null) {
        await prisma.dailyRecommendation.update({
          where: { id: rec.id },
          data: { entryDate, entryPrice, entryPriceType: "NEXT_OPEN" },
        });
        entryFillCount++;
      }
    }

    // ── Compute TOPIX + Nikkei benchmarks for all 9 horizons ──────────────
    const cohortEntryDate = entryData.size > 0 ? [...entryData.values()][0].entryDate : null;
    const bmEntryGm = cohortEntryDate ? await getGlobalMarket(cohortEntryDate) : null;

    const horizonBm: Record<string, { topix: number | null; nikkei: number | null }> = {};
    for (const { key: h, n } of HORIZONS) {
      if (!bmEntryGm) { horizonBm[h] = { topix: null, nikkei: null }; continue; }
      // Representative exit date: first stock that has prices[n]
      let repExitDate: Date | null = null;
      for (const sym of entryData.keys()) {
        const prices = priceMap.get(sym) ?? [];
        if (prices[n]) { repExitDate = new Date(prices[n].date); break; }
      }
      if (!repExitDate) { horizonBm[h] = { topix: null, nikkei: null }; continue; }
      const bmExit = await getGlobalMarket(repExitDate);
      horizonBm[h] = {
        topix:  bmEntryGm.topix  && bmExit.topix  ? pct(bmExit.topix,  bmEntryGm.topix)  : null,
        nikkei: bmEntryGm.nikkei && bmExit.nikkei ? pct(bmExit.nikkei, bmEntryGm.nikkei) : null,
      };
    }

    // ── Phase B: compute 9 horizons → BacktestPositionResult ─────────────
    const posRows: PosRow[] = [];
    const cohortErrors: { symbol: string; recommendDate: Date; horizon: string | null; reason: string }[] = [];

    for (const rec of recs) {
      const prices = priceMap.get(rec.symbol) ?? [];

      if (prices.length === 0) {
        if (age > 5) cohortErrors.push({ symbol: rec.symbol, recommendDate: new Date(recDate), horizon: null, reason: "NO_DAILY_PRICE" });
        continue;
      }

      const entry = entryData.get(rec.symbol);
      if (!entry) {
        cohortErrors.push({ symbol: rec.symbol, recommendDate: new Date(recDate), horizon: null, reason: "NO_ENTRY_PRICE" });
        continue;
      }

      for (const { key: h, n, ageThreshold } of HORIZONS) {
        const exitRow = prices[n] ?? null;
        const exitPrice = exitRow ? (exitRow.adjClose ?? exitRow.close) : null;
        const returnPct = pct(exitPrice, entry.entryPrice);
        const winFlag = returnPct != null ? returnPct > 0 : null;
        const bm = horizonBm[h];
        const alphaVsTopix =
          returnPct != null && bm.topix != null
            ? Math.round((returnPct - bm.topix) * 100) / 100
            : null;

        if (!exitRow && age > ageThreshold) {
          cohortErrors.push({ symbol: rec.symbol, recommendDate: new Date(recDate), horizon: h, reason: "NO_EXIT_PRICE" });
        }

        posRows.push({
          recDate: new Date(recDate),
          symbol: rec.symbol,
          horizon: h,
          entryDate: entry.entryDate,
          entryPrice: entry.entryPrice,
          exitDate: exitRow ? new Date(exitRow.date) : null,
          exitPrice,
          returnPct,
          winFlag,
          benchmarkReturn: bm.topix,
          alphaVsTopix,
          priceSource: exitRow?.adjClose != null ? "ADJUSTED" : "RAW",
          errorReason: !exitRow && age > ageThreshold ? "NO_EXIT_PRICE" : null,
          modelVersion: RULE_ENGINE_VERSION,
          scoreVersion: SCORING_SCHEMA_VERSION,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          versionSnapshotId,
          pipelineRunId,
        });
      }
    }

    // Batch upsert BacktestPositionResult (50 concurrent)
    for (const batch of chunk(posRows, 50)) {
      await Promise.allSettled(
        batch.map((row) =>
          prisma.backtestPositionResult.upsert({
            where: {
              recDate_symbol_horizon: { recDate: row.recDate, symbol: row.symbol, horizon: row.horizon },
            },
            create: row,
            update: {
              entryDate:        row.entryDate,
              entryPrice:       row.entryPrice,
              exitDate:         row.exitDate,
              exitPrice:        row.exitPrice,
              returnPct:        row.returnPct,
              winFlag:          row.winFlag,
              benchmarkReturn:  row.benchmarkReturn,
              alphaVsTopix:     row.alphaVsTopix,
              priceSource:      row.priceSource,
              errorReason:      row.errorReason,
              modelVersion:     row.modelVersion,
              scoreVersion:     row.scoreVersion,
              schemaVersion:    row.schemaVersion,
              versionSnapshotId: row.versionSnapshotId,
              pipelineRunId:    row.pipelineRunId,
              computedAt:       now,
            },
          })
        )
      );
      posUpsertCount += batch.length;
    }

    // Persist BacktestError records
    if (cohortErrors.length > 0) {
      if (FORCE) await prisma.backtestError.deleteMany({ where: { recommendDate: new Date(recDate) } });
      await prisma.backtestError.createMany({ data: cohortErrors, skipDuplicates: true });
      totalErrors += cohortErrors.length;
    }

    // ── Phase C: aggregate → BacktestResult ──────────────────────────────
    // Build in-memory index: horizon → [{symbol, gptRank, returnPct}]
    const horizonReturns: Record<string, Array<{ symbol: string; gptRank: number; returnPct: number | null }>> = {};
    for (const { key: h } of HORIZONS) horizonReturns[h] = [];
    for (const row of posRows) {
      const rec = recBySymbol.get(row.symbol);
      if (!rec) continue;
      (horizonReturns[row.horizon] ??= []).push({ symbol: row.symbol, gptRank: rec.gptRank, returnPct: row.returnPct });
    }

    const portfolioSizes = [
      { key: "TOP5",   limit: 5    },
      { key: "TOP10",  limit: 10   },
      { key: "TOP20",  limit: 20   },
      { key: "TOP50",  limit: 50   },
      { key: "TOP100", limit: 100  },
      { key: "ALL",    limit: 9999 },
    ] as const;

    for (const { key: ps, limit } of portfolioSizes) {
      for (const { key: h } of HORIZONS) {
        const pool = (horizonReturns[h] ?? []).filter((r) => r.gptRank <= limit && r.returnPct != null);
        if (pool.length === 0) continue;

        const returns = pool.map((r) => r.returnPct as number);
        const winners = returns.filter((r) => r > 0);
        const sorted = [...pool].sort((a, b) => (b.returnPct as number) - (a.returnPct as number));
        const avgRet = mean(returns)!;
        const bm = horizonBm[h];
        const excessTopix  = bm.topix  != null ? Math.round((avgRet - bm.topix)  * 100) / 100 : null;
        const excessNikkei = bm.nikkei != null ? Math.round((avgRet - bm.nikkei) * 100) / 100 : null;

        const payload = {
          totalRecommendations: recs.filter((r) => r.gptRank <= limit).length,
          filled:      pool.length,
          winners:     winners.length,
          losers:      returns.filter((r) => r <= 0).length,
          winRate:     Math.round((winners.length / pool.length) * 10000) / 100,
          avgReturn:   avgRet,
          medianReturn: median(returns),
          bestReturn:  sorted[0]?.returnPct ?? null,
          worstReturn: sorted[sorted.length - 1]?.returnPct ?? null,
          bestSymbol:  sorted[0]?.symbol ?? null,
          worstSymbol: sorted[sorted.length - 1]?.symbol ?? null,
          maxDrawdown: sorted[sorted.length - 1]?.returnPct ?? null,
          benchmarkTopixReturn:  bm.topix,
          benchmarkNikkeiReturn: bm.nikkei,
          excessVsTopix:  excessTopix,
          excessVsNikkei: excessNikkei,
        };

        await prisma.backtestResult.upsert({
          where: { date_horizon_portfolioSize: { date: recDate, horizon: h, portfolioSize: ps } },
          create: { date: recDate, horizon: h, portfolioSize: ps, ...payload },
          update: { ...payload, computedAt: now },
        });
        resultUpsertCount++;
      }
    }

    console.log(`     ✅ entryFilled=${entryData.size}/${recs.length} posRows=${posRows.length} errors=${cohortErrors.length}`);
  }

  console.log(`\n✅ Done — entryFills=${entryFillCount} posUpserted=${posUpsertCount} results=${resultUpsertCount} errors=${totalErrors}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
