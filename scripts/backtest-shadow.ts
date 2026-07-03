#!/usr/bin/env npx tsx
/**
 * Alpha Shadow Backtest (P2-T2) — validate AlphaScore vs Production Score.
 *
 * Both rankings are reconstructed from DailyPrice at each historical as-of date (the real
 * production adaptiveScore is not versioned by date, and its non-technical inputs are not
 * historically reconstructable, so "Production" here is the reconstructable momentum core:
 * z(return20d)+z(return60d) — labelled transparently). AlphaScore = analytics-weighted
 * 6-factor z-composite. Portfolios: Top10/20/50 equal-weight, hold 5/10/20 days, over
 * 30/90/180-day windows. Writes AlphaBacktestResult. READ-ONLY: never reads/writes
 * StockScore / AdaptiveScore / DailyRecommendation / Portfolio / GPTScore.
 *
 * Usage:  npm run backtest-shadow   |   DRY_RUN=1 npm run backtest-shadow
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeAllAlphaFactors, type Bar } from "../lib/alpha";
import { deriveWeights, FACTOR_FIELD } from "../lib/alpha/score";
import { ANALYSIS_FACTORS } from "../lib/alpha/analytics/report";
import { forwardReturnPct } from "../lib/alpha/analytics/forward-return";
import { summarizeStrategy, BACKTEST_PERIODS, BACKTEST_TOPN, BACKTEST_HOLD } from "../lib/alpha/backtest";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const WEIGHT_PERIOD = Number(process.env.ALPHA_SCORE_WEIGHT_PERIOD ?? 30);
const FWD_BUFFER = 20;
const MAX_ASOF = Math.round((180 * 5) / 7);
const MIN_LOOKBACK = 60;
const BATCH = 60;

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function nAsOf(period: number): number { return Math.round((period * 5) / 7); }
function meanStd(vals: number[]) {
  const n = vals.length;
  const mean = vals.reduce((s, x) => s + x, 0) / n;
  const std = Math.sqrt(vals.reduce((s, x) => s + (x - mean) * (x - mean), 0) / Math.max(1, n - 1));
  return { mean, std };
}
function mean(a: number[]) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }

type Obs = {
  symbol: string;
  raw: Record<string, number | null>; // factor → raw value (+ ret20/ret60)
  fwd5: number | null; fwd10: number | null; fwd20: number | null;
};

async function main() {
  const t0 = Date.now();
  console.log(`=== Alpha Shadow Backtest (P2-T2) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);

  const reports = await prisma.alphaFactorReport.findMany({ where: { period: WEIGHT_PERIOD }, select: { factor: true, rankIc: true, sharpe: true } });
  if (!reports.length) { console.error(`No AlphaFactorReport period=${WEIGHT_PERIOD}. Run compute-alpha-analytics.`); process.exitCode = 1; return; }
  const weights = deriveWeights(reports);
  const wMap = new Map(weights.map((w) => [w.factor, w]));

  const gm = await prisma.globalMarket.findMany({ where: { topix: { not: null } }, select: { date: true, topix: true }, orderBy: { date: "desc" }, take: 400 });
  const topixByDate = new Map<string, number>();
  for (const g of gm) if (g.topix != null) topixByDate.set(ymd(g.date), g.topix);
  const topixDatesDesc = gm.map((g) => ymd(g.date));
  const asOfDates = topixDatesDesc.slice(FWD_BUFFER, FWD_BUFFER + MAX_ASOF); // idx 0 = most recent evaluable
  const asOfIdxByDate = new Map<string, number>();
  asOfDates.forEach((d, i) => asOfIdxByDate.set(d, i));
  console.log(`as-of dates: ${asOfDates.length} (${asOfDates.at(-1)} … ${asOfDates[0]})`);

  const stocks = await prisma.stock.findMany({ where: { aiEnabled: true }, select: { symbol: true }, orderBy: { symbol: "asc" } });
  console.log(`Universe: ${stocks.length} stocks\n`);

  // perDate[asOfIdx] = Obs[]
  const perDate: Obs[][] = Array.from({ length: asOfDates.length }, () => []);
  const FETCH_BARS = MAX_ASOF + 250 + FWD_BUFFER + 10;

  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH);
    await Promise.all(batch.map(async (st) => {
      const rows = await prisma.dailyPrice.findMany({
        where: { symbol: st.symbol }, orderBy: { date: "desc" }, take: FETCH_BARS,
        select: { date: true, open: true, high: true, low: true, close: true, adjClose: true, volume: true },
      });
      if (rows.length < MIN_LOOKBACK + FWD_BUFFER) return;
      const bars: Bar[] = rows.map((r) => ({ date: ymd(r.date), open: r.open ?? null, high: r.high ?? null, low: r.low ?? null, close: r.close, adjClose: r.adjClose ?? null, volume: r.volume ?? null }));
      const px = (b: Bar) => b.adjClose ?? b.close;
      const dateToIdx = new Map<string, number>();
      bars.forEach((b, idx) => dateToIdx.set(b.date, idx));
      for (const asOf of asOfDates) {
        const k = dateToIdx.get(asOf);
        if (k == null || k + MIN_LOOKBACK >= bars.length || k < FWD_BUFFER) continue;
        const f = computeAllAlphaFactors(bars.slice(k), topixByDate, st.symbol); // faithful Alpha reconstruction (RS vs TOPIX)
        // Production momentum core: raw trailing returns (reconstructable proxy of the production technical ranking)
        const ret20 = k + 20 < bars.length && px(bars[k]) > 0 && px(bars[k + 20]) > 0 ? (px(bars[k]) / px(bars[k + 20]) - 1) * 100 : null;
        const ret60 = k + 60 < bars.length && px(bars[k]) > 0 && px(bars[k + 60]) > 0 ? (px(bars[k]) / px(bars[k + 60]) - 1) * 100 : null;
        perDate[asOfIdxByDate.get(asOf)!].push({
          symbol: st.symbol,
          raw: {
            RelativeStrength: f.rs20,
            ATR: f.atrPct, VolumeRatio: f.volumeRatio20, AverageTurnover: f.averageTurnover20,
            Distance52WeekHigh: f.distanceTo52WeekHigh, VolumeExpansion: f.volumeExpansionDays,
            _ret20: ret20, _ret60: ret60,
          },
          fwd5: forwardReturnPct(bars, k, 5), fwd10: forwardReturnPct(bars, k, 10), fwd20: forwardReturnPct(bars, k, 20),
        });
      }
    }));
    if ((i / BATCH) % 10 === 0) process.stdout.write(`\r  scanned ${Math.min(i + BATCH, stocks.length)}/${stocks.length}`);
  }
  const totalObs = perDate.reduce((s, a) => s + a.length, 0);
  console.log(`\n  observations: ${totalObs}\n`);

  // portfolioRet[strategy][topN][holdDays] = number[] indexed by asOfIdx (may be undefined if date empty)
  const HOLDS = { 5: "fwd5", 10: "fwd10", 20: "fwd20" } as const;
  const port: Record<string, Record<number, Record<number, (number | null)[]>>> = {
    PRODUCTION: {}, ALPHA: {},
  };
  const bench: Record<number, (number | null)[]> = { 5: [], 10: [], 20: [] };
  for (const strat of ["PRODUCTION", "ALPHA"]) for (const tn of BACKTEST_TOPN) { port[strat][tn] = {}; for (const h of BACKTEST_HOLD) port[strat][tn][h] = []; }

  function transform(factor: string, v: number | null): number | null {
    if (v == null) return null;
    return FACTOR_FIELD[factor]?.log ? Math.log10(Math.max(1, v)) : v;
  }

  for (let idx = 0; idx < perDate.length; idx++) {
    const day = perDate[idx];
    if (day.length < 50) { for (const h of BACKTEST_HOLD) bench[h][idx] = null; continue; }

    // cross-sectional stats per factor (+ ret20/ret60)
    const stats = new Map<string, { mean: number; std: number }>();
    for (const factor of ANALYSIS_FACTORS) {
      const vals = day.map((o) => transform(factor, o.raw[factor])).filter((v): v is number => v != null && isFinite(v));
      stats.set(factor, vals.length >= 2 ? meanStd(vals) : { mean: 0, std: 0 });
    }
    for (const key of ["_ret20", "_ret60"]) {
      const vals = day.map((o) => o.raw[key]).filter((v): v is number => v != null && isFinite(v));
      stats.set(key, vals.length >= 2 ? meanStd(vals) : { mean: 0, std: 0 });
    }

    // composites
    const scored = day.map((o) => {
      let alpha = 0;
      for (const factor of ANALYSIS_FACTORS) {
        const w = wMap.get(factor);
        if (!w || w.weight === 0) continue;
        const t = transform(factor, o.raw[factor]);
        const st = stats.get(factor)!;
        if (t == null || st.std === 0) continue;
        alpha += w.direction * ((t - st.mean) / st.std) * w.weight;
      }
      const z = (key: string) => { const st = stats.get(key)!; const v = o.raw[key]; return v == null || st.std === 0 ? 0 : (v - st.mean) / st.std; };
      const prod = z("_ret20") + z("_ret60");
      return { o, alpha, prod };
    });

    // benchmark = equal-weight market forward return
    for (const h of BACKTEST_HOLD) {
      const key = HOLDS[h as 5 | 10 | 20];
      const rets = scored.map((s) => s.o[key]).filter((v): v is number => v != null);
      bench[h][idx] = rets.length ? mean(rets) : null;
    }

    // TopN portfolios per strategy
    for (const [strat, keyFn] of [["PRODUCTION", (s: typeof scored[0]) => s.prod], ["ALPHA", (s: typeof scored[0]) => s.alpha]] as const) {
      const ranked = [...scored].sort((a, b) => keyFn(b) - keyFn(a));
      for (const tn of BACKTEST_TOPN) {
        const top = ranked.slice(0, tn);
        for (const h of BACKTEST_HOLD) {
          const key = HOLDS[h as 5 | 10 | 20];
          const rets = top.map((s) => s.o[key]).filter((v): v is number => v != null);
          port[strat][tn][h][idx] = rets.length ? mean(rets) : null;
        }
      }
    }
  }

  // Summarize per period. Chronological order = oldest→newest = asOfIdx high→low.
  const asOfLatest = asOfDates[0] ? new Date(`${asOfDates[0]}T00:00:00.000Z`) : null;
  const computedAt = new Date();
  const summaryRows: { period: number; strategy: string; topN: number; holdDays: number; cumReturn: number | null; alpha: number | null; sharpe: number | null; maxDrawdown: number | null; winRate: number | null; annualizedReturn: number | null; nObs: number }[] = [];

  for (const period of BACKTEST_PERIODS) {
    const cutoff = nAsOf(period);
    const idxChrono = []; for (let idx = cutoff - 1; idx >= 0; idx--) idxChrono.push(idx); // oldest→newest
    for (const strat of ["PRODUCTION", "ALPHA"]) for (const tn of BACKTEST_TOPN) for (const h of BACKTEST_HOLD) {
      const rets = idxChrono.map((idx) => port[strat][tn][h][idx]).filter((v): v is number => v != null);
      const benchR = idxChrono.map((idx) => bench[h][idx]).filter((v): v is number => v != null);
      const sum = summarizeStrategy(rets, benchR, h);
      summaryRows.push({ period, strategy: strat, topN: tn, holdDays: h, ...sum });
      if (!DRY_RUN) {
        await prisma.alphaBacktestResult.upsert({
          where: { period_strategy_topN_holdDays: { period, strategy: strat, topN: tn, holdDays: h } },
          create: { period, strategy: strat, topN: tn, holdDays: h, asOfLatest, computedAt, ...sum },
          update: { asOfLatest, computedAt, ...sum },
        });
      }
    }
  }

  console.log("── Headline (Top20, hold 20d) cumulative return ──");
  for (const period of BACKTEST_PERIODS) {
    const prod = summaryRows.find((r) => r.period === period && r.strategy === "PRODUCTION" && r.topN === 20 && r.holdDays === 20);
    const alp = summaryRows.find((r) => r.period === period && r.strategy === "ALPHA" && r.topN === 20 && r.holdDays === 20);
    const spread = prod?.cumReturn != null && alp?.cumReturn != null ? (alp.cumReturn - prod.cumReturn).toFixed(2) : "—";
    console.log(`  [${period}d] Production ${prod?.cumReturn?.toFixed(2) ?? "—"}%  |  Shadow(Alpha) ${alp?.cumReturn?.toFixed(2) ?? "—"}%  |  Alpha(Δ) ${spread}%  (n=${alp?.nObs})`);
  }
  console.log(`\n=== Done (${((Date.now() - t0) / 1000).toFixed(1)}s) — ${summaryRows.length} rows ===`);
  if (DRY_RUN) console.log("(DRY RUN — no writes)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
