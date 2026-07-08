#!/usr/bin/env npx tsx
/**
 * Factor Alpha Engine — P6-T9 (T9.1).
 *
 * Computes REAL factor-level, per-horizon excess alpha for each evaluable Feature.
 * Method (no estimation — every number comes from realised prices):
 *   1. Reconstruct each factor scalar from DailyPrice at N past as-of dates.
 *   2. For each factor × horizon h∈{1,3,5,10,20}, at EVERY as-of date rank the universe and
 *      take the TOP QUINTILE cohort (the "go long the strongest-factor stocks" book).
 *   3. Per as-of date:  cohortMean = mean cohort forward h-day return;
 *      universeMean     = mean forward h-day return of the WHOLE valid universe that date;
 *      dateAlpha        = cohortMean − universeMean (daily-rebalanced factor selection edge).
 *      alpha            = mean(dateAlpha) across dates;  avgReturn = mean(cohortMean);
 *      benchReturn      = mean(universeMean)  — equal-weight universe benchmark.
 *      hitRate          = % cohort obs with forward return > 0;
 *      rankIc           = Spearman(factor, forward return) — directional predictive power.
 *   4. Upsert FactorAlphaResult (featureId × horizon). READ-ONLY analytics; never touches
 *      StockScore / AdaptiveScore / DailyRecommendation / Portfolio / GPTScore.
 *
 * Benchmark note: the equal-weight universe (same DailyPrice source as the cohort) is used
 * — NOT GlobalMarket.topix, whose level series has a scale break on 2026-03-30 (3827 → 376.4,
 * an index→ETF-proxy switch) that corrupts any cross-period TOPIX excess. Universe-relative
 * alpha is the correct apples-to-apples factor-selection benchmark and is immune to that break.
 *
 * Usage:  npm run compute-factor-alpha
 *         DRY_RUN=1 npm run compute-factor-alpha
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeAllAlphaFactors, type Bar } from "../lib/alpha";
import { forwardReturnPct } from "../lib/alpha/analytics/forward-return";
import { spearman } from "../lib/alpha/analytics/information-coefficient";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const HORIZONS = [1, 3, 5, 10, 20];
const FWD_BUFFER = 20;      // trading days of forward data required (max horizon)
const MAX_ASOF = 90;        // number of as-of (rebalance) dates to evaluate
const MIN_LOOKBACK = 65;    // need ≥60 prior bars (RS60) + margin
const BATCH = 60;
const TOP_QUANTILE = 0.2;   // top 20% cohort

// Feature Registry id → reconstructed scalar key on AlphaFactors.
const FEATURE_SCALARS: { id: string; key: string }[] = [
  { id: "rs5", key: "rs5" },
  { id: "rs20", key: "rs20" },
  { id: "rs60", key: "rs60" },
  { id: "atrPct", key: "atrPct" },
  { id: "averageTurnover20", key: "averageTurnover20" },
  { id: "volumeExpansionDays", key: "volumeExpansionDays" },
  { id: "volumeRatio20", key: "volumeRatio20" },
  { id: "distance52wHigh", key: "distanceTo52WeekHigh" },
];

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function mean(xs: number[]): number | null { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

// One observation carries every factor scalar + forward returns at all horizons + TOPIX fwd.
type Obs = {
  asOfIdx: number;
  scalars: Record<string, number | null>;
  fwd: Record<number, number | null>;     // horizon → stock forward return %
};

async function main() {
  const t0 = Date.now();
  console.log(`=== Factor Alpha Engine (P6-T9) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);

  // TOPIX calendar + level map (from GlobalMarket.topix).
  const gm = await prisma.globalMarket.findMany({
    where: { topix: { not: null } },
    select: { date: true, topix: true },
    orderBy: { date: "desc" },
    take: 400,
  });
  const topixByDate = new Map<string, number>();
  const topixDatesDesc: string[] = [];
  for (const g of gm) {
    if (g.topix != null) { const d = ymd(g.date); topixByDate.set(d, g.topix); topixDatesDesc.push(d); }
  }
  const asOfDates = topixDatesDesc.slice(FWD_BUFFER, FWD_BUFFER + MAX_ASOF);
  const asOfIdxByDate = new Map<string, number>();
  asOfDates.forEach((d, i) => asOfIdxByDate.set(d, i));
  console.log(`TOPIX days: ${topixDatesDesc.length} · as-of dates: ${asOfDates.length} (${asOfDates.at(-1)} … ${asOfDates[0]})`);
  if (asOfDates.length < 10) {
    console.error("Not enough TOPIX history for a backtest — abort.");
    return;
  }

  const stocks = await prisma.stock.findMany({ where: { aiEnabled: true }, select: { symbol: true }, orderBy: { symbol: "asc" } });
  console.log(`Universe: ${stocks.length} stocks\n`);

  const FETCH_BARS = MAX_ASOF + 260 + FWD_BUFFER + 10;
  const all: Obs[] = [];

  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH);
    const perStock = await Promise.all(batch.map(async (st) => {
      const rows = await prisma.dailyPrice.findMany({
        where: { symbol: st.symbol },
        orderBy: { date: "desc" },
        take: FETCH_BARS,
        select: { date: true, open: true, high: true, low: true, close: true, adjClose: true, volume: true },
      });
      if (rows.length < MIN_LOOKBACK + FWD_BUFFER) return [];
      const bars: Bar[] = rows.map((r) => ({
        date: ymd(r.date), open: r.open ?? null, high: r.high ?? null, low: r.low ?? null,
        close: r.close, adjClose: r.adjClose ?? null, volume: r.volume ?? null,
      }));
      const dateToIdx = new Map<string, number>();
      bars.forEach((b, idx) => dateToIdx.set(b.date, idx));

      const obs: Obs[] = [];
      for (const asOf of asOfDates) {
        const k = dateToIdx.get(asOf);
        if (k == null) continue;
        if (k + MIN_LOOKBACK >= bars.length) continue; // not enough lookback
        if (k < FWD_BUFFER) continue;                  // not enough forward
        const f = computeAllAlphaFactors(bars.slice(k), topixByDate, st.symbol) as Record<string, number | null>;
        const scalars: Record<string, number | null> = {};
        for (const { key } of FEATURE_SCALARS) scalars[key] = f[key] ?? null;
        const fwd: Record<number, number | null> = {};
        for (const h of HORIZONS) fwd[h] = forwardReturnPct(bars, k, h);
        obs.push({ asOfIdx: asOfIdxByDate.get(asOf)!, scalars, fwd });
      }
      return obs;
    }));
    for (const arr of perStock) for (const o of arr) all.push(o);
    if ((i / BATCH) % 10 === 0) process.stdout.write(`\r  scanned ${Math.min(i + BATCH, stocks.length)}/${stocks.length} · obs ${all.length}`);
  }
  console.log(`\n  total observations: ${all.length}\n`);

  const computedAt = new Date();
  const asOfLatest = asOfDates[0] ? new Date(`${asOfDates[0]}T00:00:00.000Z`) : null;
  const asOfCount = new Set(all.map((o) => o.asOfIdx)).size;

  console.log("── Factor Alpha (per feature × horizon: alpha% = cohort − equal-weight universe) ──");
  for (const { id, key } of FEATURE_SCALARS) {
    const line: string[] = [];
    for (const h of HORIZONS) {
      // per as-of date: rank by factor, top quintile = cohort, whole valid set = universe.
      const cohortMeans: number[] = [];   // per-date cohort mean forward return
      const universeMeans: number[] = []; // per-date universe mean forward return
      const dateAlphas: number[] = [];    // per-date (cohort − universe)
      const hits: number[] = [];          // pooled cohort hit flags
      let cohortSizeSum = 0, dateCount = 0;
      const icF: number[] = [];
      const icR: number[] = [];

      const byDate = new Map<number, { f: number; r: number }[]>();
      for (const o of all) {
        const fv = o.scalars[key], rv = o.fwd[h];
        if (fv == null || rv == null) continue;
        const arr = byDate.get(o.asOfIdx) ?? [];
        arr.push({ f: fv, r: rv });
        byDate.set(o.asOfIdx, arr);
        icF.push(fv); icR.push(rv);
      }
      for (const arr of byDate.values()) {
        if (arr.length < 10) continue;
        const sorted = [...arr].sort((a, b) => a.f - b.f);
        const kk = Math.max(1, Math.floor(arr.length * TOP_QUANTILE));
        const top = sorted.slice(arr.length - kk);
        const cMean = mean(top.map((x) => x.r));
        const uMean = mean(arr.map((x) => x.r));
        if (cMean == null || uMean == null) continue;
        cohortMeans.push(cMean);
        universeMeans.push(uMean);
        dateAlphas.push(cMean - uMean);
        cohortSizeSum += top.length; dateCount++;
        for (const x of top) hits.push(x.r > 0 ? 1 : 0);
      }
      const avgReturn = mean(cohortMeans);
      const benchReturn = mean(universeMeans);
      const alpha = mean(dateAlphas);
      const hitRate = hits.length ? (hits.reduce((a, b) => a + b, 0) / hits.length) * 100 : null;
      const rankIc = spearman(icF, icR);
      const cohortSize = dateCount ? Math.round(cohortSizeSum / dateCount) : 0;
      const sampleCount = hits.length;

      line.push(`${h}d:${alpha == null ? "—" : (alpha >= 0 ? "+" : "") + alpha.toFixed(2)}%`);

      if (!DRY_RUN) {
        await prisma.factorAlphaResult.upsert({
          where: { featureId_horizon: { featureId: id, horizon: h } },
          create: { featureId: id, horizon: h, alpha, avgReturn, benchReturn, hitRate, rankIc, cohortSize, sampleCount, asOfCount: dateCount, asOfLatest, computedAt },
          update: { alpha, avgReturn, benchReturn, hitRate, rankIc, cohortSize, sampleCount, asOfCount: dateCount, asOfLatest, computedAt },
        });
      }
    }
    console.log(`  ${id.padEnd(20)} ${line.join("  ")}`);
  }

  console.log(`\n=== Done (${((Date.now() - t0) / 1000).toFixed(1)}s · asOfCount=${asOfCount}) ===`);
  if (DRY_RUN) console.log("(DRY RUN — no writes)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
