#!/usr/bin/env npx tsx
/**
 * Alpha Analytics — Phase 1.5 compute worker.
 *
 * Measures each Alpha factor's historical effectiveness by reconstructing factor values
 * at past as-of dates (from DailyPrice) and correlating them with realised forward returns.
 * Writes AlphaFactorReport (period × factor). READ-ONLY analytics — never reads or writes
 * StockScore / AdaptiveScore / DailyRecommendation / Portfolio / GPTScore.
 *
 * Usage:  npm run compute-alpha-analytics
 *         DRY_RUN=1 npm run compute-alpha-analytics
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeAllAlphaFactors, type Bar } from "../lib/alpha";
import { buildFactorReport, ANALYSIS_FACTORS, type Observation } from "../lib/alpha/analytics/report";
import { forwardReturnPct, pctChange, excess } from "../lib/alpha/analytics/forward-return";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const PERIODS = [7, 30, 90, 180];
const FWD_BUFFER = 20;   // trading days of forward data required
const MAX_ASOF = Math.round((180 * 5) / 7); // longest period as-of count (~129)
const MIN_LOOKBACK = 60; // need ≥60 prior bars (RS60)
const BATCH = 60;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function nAsOf(period: number): number {
  return Math.round((period * 5) / 7);
}

type BaseObs = {
  asOfIdx: number;
  rs20: number | null;
  atrPct: number | null;
  volR20: number | null;
  turnover: number | null;
  dist52wH: number | null;
  volExp: number | null;
  fwd5: number | null;
  fwd10: number | null;
  fwd20: number | null;
  excess20: number | null;
};

// representative scalar per analysis factor
function factorScalar(f: BaseObs, key: string): number | null {
  switch (key) {
    case "RelativeStrength": return f.rs20;
    case "ATR": return f.atrPct;
    case "VolumeRatio": return f.volR20;
    case "AverageTurnover": return f.turnover;
    case "Distance52WeekHigh": return f.dist52wH;
    case "VolumeExpansion": return f.volExp;
    default: return null;
  }
}

async function main() {
  const t0 = Date.now();
  console.log(`=== Alpha Analytics (Phase 1.5) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);

  // TOPIX calendar + level map.
  const gm = await prisma.globalMarket.findMany({
    where: { topix: { not: null } },
    select: { date: true, topix: true },
    orderBy: { date: "desc" },
    take: 400,
  });
  const topixByDate = new Map<string, number>();
  const topixDatesDesc: string[] = [];
  for (const g of gm) {
    if (g.topix != null) {
      const d = ymd(g.date);
      topixByDate.set(d, g.topix);
      topixDatesDesc.push(d);
    }
  }
  // As-of date set: skip the most-recent FWD_BUFFER (no forward data yet), take next MAX_ASOF.
  const asOfDates = topixDatesDesc.slice(FWD_BUFFER, FWD_BUFFER + MAX_ASOF);
  const asOfIdxByDate = new Map<string, number>();
  asOfDates.forEach((d, i) => asOfIdxByDate.set(d, i)); // 0 = most recent evaluable
  console.log(`TOPIX days: ${topixDatesDesc.length} · as-of dates: ${asOfDates.length} (${asOfDates.at(-1)} … ${asOfDates[0]})`);

  const stocks = await prisma.stock.findMany({
    where: { aiEnabled: true },
    select: { symbol: true },
    orderBy: { symbol: "asc" },
  });
  console.log(`Universe: ${stocks.length} stocks\n`);

  const FETCH_BARS = MAX_ASOF + 250 + FWD_BUFFER + 10; // ~409
  const base: BaseObs[] = [];

  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH);
    const perStock = await Promise.all(
      batch.map(async (st) => {
        const rows = await prisma.dailyPrice.findMany({
          where: { symbol: st.symbol },
          orderBy: { date: "desc" },
          take: FETCH_BARS,
          select: { date: true, open: true, high: true, low: true, close: true, adjClose: true, volume: true },
        });
        if (rows.length < MIN_LOOKBACK + FWD_BUFFER) return [];
        const bars: Bar[] = rows.map((r) => ({
          date: ymd(r.date),
          open: r.open ?? null, high: r.high ?? null, low: r.low ?? null,
          close: r.close, adjClose: r.adjClose ?? null, volume: r.volume ?? null,
        }));
        const dateToIdx = new Map<string, number>();
        bars.forEach((b, idx) => dateToIdx.set(b.date, idx));

        const obs: BaseObs[] = [];
        for (const asOf of asOfDates) {
          const k = dateToIdx.get(asOf);
          if (k == null) continue;
          if (k + MIN_LOOKBACK >= bars.length) continue; // not enough lookback
          if (k < FWD_BUFFER) continue;                  // not enough forward
          const f = computeAllAlphaFactors(bars.slice(k), topixByDate, st.symbol);
          const fwd5 = forwardReturnPct(bars, k, 5);
          const fwd10 = forwardReturnPct(bars, k, 10);
          const fwd20 = forwardReturnPct(bars, k, 20);
          const fwd20Date = bars[k - 20]?.date;
          const topixFwd20 = fwd20Date != null
            ? pctChange(topixByDate.get(asOf), topixByDate.get(fwd20Date))
            : null;
          obs.push({
            asOfIdx: asOfIdxByDate.get(asOf)!,
            rs20: f.rs20, atrPct: f.atrPct, volR20: f.volumeRatio20,
            turnover: f.averageTurnover20, dist52wH: f.distanceTo52WeekHigh,
            volExp: f.volumeExpansionDays,
            fwd5, fwd10, fwd20, excess20: excess(fwd20, topixFwd20),
          });
        }
        return obs;
      })
    );
    for (const arr of perStock) for (const o of arr) base.push(o);
    if ((i / BATCH) % 10 === 0) process.stdout.write(`\r  scanned ${Math.min(i + BATCH, stocks.length)}/${stocks.length} · obs ${base.length}`);
  }
  console.log(`\n  total observations: ${base.length}\n`);

  const computedAt = new Date();
  const asOfLatest = asOfDates[0] ? new Date(`${asOfDates[0]}T00:00:00.000Z`) : null;
  const results: { period: number; factor: string; rating: number; rankIc: number | null; n: number }[] = [];

  for (const period of PERIODS) {
    const cutoff = nAsOf(period);
    const windowObs = base.filter((o) => o.asOfIdx < cutoff);
    for (const factor of ANALYSIS_FACTORS) {
      const obs: Observation[] = windowObs.map((o) => ({
        asOfIdx: o.asOfIdx,
        factor: factorScalar(o, factor),
        fwd5: o.fwd5, fwd10: o.fwd10, fwd20: o.fwd20, excess20: o.excess20,
      }));
      const rep = buildFactorReport(obs);
      results.push({ period, factor, rating: rep.rating, rankIc: rep.rankIc, n: rep.sampleCount });

      if (!DRY_RUN) {
        await prisma.alphaFactorReport.upsert({
          where: { period_factor: { period, factor } },
          create: { period, factor, asOfLatest, computedAt, ...rep },
          update: { asOfLatest, computedAt, ...rep },
        });
      }
    }
  }

  console.log("── Summary (rating / rankIC / n) ──");
  for (const p of PERIODS) {
    const line = results.filter((r) => r.period === p)
      .map((r) => `${r.factor}:${"★".repeat(r.rating)}(${r.rankIc == null ? "—" : r.rankIc.toFixed(3)},n${r.n})`)
      .join("  ");
    console.log(`  [${p}d] ${line}`);
  }
  console.log(`\n=== Done (${((Date.now() - t0) / 1000).toFixed(1)}s) ===`);
  if (DRY_RUN) console.log("(DRY RUN — no writes)");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
