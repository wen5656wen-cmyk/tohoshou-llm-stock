#!/usr/bin/env npx tsx
/**
 * Adaptive Fusion Research (P2-T3) — Market Regime classification + data-searched fusion.
 *
 * (1) Classifies every historical day Bull/Sideways/Bear from the TOPIX MA stack + breadth
 *     (% above MA20) + realized volatility → MarketRegime.
 * (2) Groups the reconstructed Production vs Alpha portfolios by regime and grid-searches
 *     the optimal fusion weight w (fused = w·alpha + (1-w)·production) per regime by Sharpe
 *     — NO manually specified ratios. → RegimeFusionResult.
 *
 * READ-ONLY research: never reads/writes StockScore / AdaptiveScore / DailyRecommendation /
 * Portfolio / GPTScore.
 *
 * Usage:  npm run research-fusion   |   DRY_RUN=1 npm run research-fusion
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeAllAlphaFactors, type Bar } from "../lib/alpha";
import { deriveWeights, FACTOR_FIELD } from "../lib/alpha/score";
import { ANALYSIS_FACTORS } from "../lib/alpha/analytics/report";
import { forwardReturnPct } from "../lib/alpha/analytics/forward-return";
import { summarizeStrategy } from "../lib/alpha/backtest";
import { classifyTrend } from "../lib/market-regime/trend";
import { computeVolatility } from "../lib/market-regime/volatility";
import { computeBreadth } from "../lib/market-regime/breadth";
import { classifyRegime, REGIMES } from "../lib/market-regime/regime";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const WEIGHT_PERIOD = Number(process.env.ALPHA_SCORE_WEIGHT_PERIOD ?? 30);
const FWD_BUFFER = 20;
const MAX_ASOF = Math.round((180 * 5) / 7);
const MIN_LOOKBACK = 60;
const TOPN = 20;
const HOLD = 20;
const BATCH = 60;
const W_GRID = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
function meanStd(v: number[]) { const n = v.length; const m = v.reduce((a, b) => a + b, 0) / n; return { mean: m, std: Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, n - 1)) }; }
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function transform(f: string, v: number | null) { return v == null ? null : FACTOR_FIELD[f]?.log ? Math.log10(Math.max(1, v)) : v; }

type FObs = { symbol: string; raw: Record<string, number | null>; ret20: number | null; ret60: number | null; fwd20: number | null };

async function main() {
  const t0 = Date.now();
  console.log(`=== Adaptive Fusion Research (P2-T3) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);

  const reports = await prisma.alphaFactorReport.findMany({ where: { period: WEIGHT_PERIOD }, select: { factor: true, rankIc: true, sharpe: true } });
  if (!reports.length) { console.error("No AlphaFactorReport. Run compute-alpha-analytics."); process.exitCode = 1; return; }
  const weights = deriveWeights(reports);
  const wMap = new Map(weights.map((w) => [w.factor, w]));

  const gm = await prisma.globalMarket.findMany({ where: { topix: { not: null } }, select: { date: true, topix: true }, orderBy: { date: "desc" }, take: 500 });
  const topixDatesDesc = gm.map((g) => ymd(g.date));
  const topixCloseDesc = gm.map((g) => g.topix as number);
  const topixIdx = new Map<string, number>(); topixDatesDesc.forEach((d, i) => topixIdx.set(d, i));

  // regimeDates = recent range incl. the not-yet-evaluable last FWD_BUFFER (for current regime).
  const regimeDates = topixDatesDesc.slice(0, FWD_BUFFER + MAX_ASOF);
  const breadthAbove = new Map<string, number>();
  const breadthTotal = new Map<string, number>();
  // fusion as-of dates = evaluable subset (topixIdx >= FWD_BUFFER)
  const asOfDates = regimeDates.filter((d) => (topixIdx.get(d) ?? 0) >= FWD_BUFFER); // idx 0 = topixDatesDesc[FWD_BUFFER]
  const asOfIdxByDate = new Map<string, number>(); asOfDates.forEach((d, i) => asOfIdxByDate.set(d, i));

  const stocks = await prisma.stock.findMany({ where: { aiEnabled: true }, select: { symbol: true }, orderBy: { symbol: "asc" } });
  console.log(`regime days: ${regimeDates.length} · fusion as-of: ${asOfDates.length} · stocks: ${stocks.length}\n`);

  const perDate: FObs[][] = Array.from({ length: asOfDates.length }, () => []);
  const FETCH_BARS = MAX_ASOF + 250 + FWD_BUFFER + 10;

  for (let i = 0; i < stocks.length; i += BATCH) {
    await Promise.all(stocks.slice(i, i + BATCH).map(async (st) => {
      const rows = await prisma.dailyPrice.findMany({ where: { symbol: st.symbol }, orderBy: { date: "desc" }, take: FETCH_BARS, select: { date: true, high: true, low: true, close: true, adjClose: true, volume: true } });
      if (rows.length < MIN_LOOKBACK + FWD_BUFFER) return;
      const bars: Bar[] = rows.map((r) => ({ date: ymd(r.date), open: null, high: r.high ?? null, low: r.low ?? null, close: r.close, adjClose: r.adjClose ?? null, volume: r.volume ?? null }));
      const px = (b: Bar) => b.adjClose ?? b.close;
      const dateToIdx = new Map<string, number>(); bars.forEach((b, idx) => dateToIdx.set(b.date, idx));
      for (const D of regimeDates) {
        const j = dateToIdx.get(D);
        if (j == null || j + 20 >= bars.length) continue;
        // breadth: close vs MA20
        let s20 = 0; for (let q = j; q < j + 20; q++) s20 += px(bars[q]);
        const ma20 = s20 / 20;
        breadthTotal.set(D, (breadthTotal.get(D) ?? 0) + 1);
        if (px(bars[j]) > ma20) breadthAbove.set(D, (breadthAbove.get(D) ?? 0) + 1);
        // fusion factors (evaluable dates only)
        const aIdx = asOfIdxByDate.get(D);
        if (aIdx != null && j + MIN_LOOKBACK < bars.length && j >= FWD_BUFFER) {
          const f = computeAllAlphaFactors(bars.slice(j), new Map(), st.symbol); // topix not needed for RS here; rs20 null → excluded (prod momentum captured via ret20/60)
          const ret20 = j + 20 < bars.length && px(bars[j]) > 0 && px(bars[j + 20]) > 0 ? (px(bars[j]) / px(bars[j + 20]) - 1) * 100 : null;
          const ret60 = j + 60 < bars.length && px(bars[j]) > 0 && px(bars[j + 60]) > 0 ? (px(bars[j]) / px(bars[j + 60]) - 1) * 100 : null;
          perDate[aIdx].push({ symbol: st.symbol, raw: { ATR: f.atrPct, VolumeRatio: f.volumeRatio20, AverageTurnover: f.averageTurnover20, Distance52WeekHigh: f.distanceTo52WeekHigh, VolumeExpansion: f.volumeExpansionDays, RelativeStrength: ret20 }, ret20, ret60, fwd20: forwardReturnPct(bars, j, HOLD) });
        }
      }
    }));
    if ((i / BATCH) % 10 === 0) process.stdout.write(`\r  scanned ${Math.min(i + BATCH, stocks.length)}/${stocks.length}`);
  }
  console.log();

  // ── Regime classification per regime day ──
  const regimeOf = new Map<string, string>();
  const computedAt = new Date();
  let bull = 0, side = 0, bear = 0;
  for (const D of regimeDates) {
    const di = topixIdx.get(D)!;
    const closesDesc = topixCloseDesc.slice(di); // newest-first from D
    const trend = classifyTrend(closesDesc);
    const vol = computeVolatility(closesDesc);
    const breadth = computeBreadth(breadthAbove.get(D) ?? 0, breadthTotal.get(D) ?? 0);
    const { regime, regimeScore } = classifyRegime({ trendScore: trend.trendScore, breadth, volatility: vol });
    regimeOf.set(D, regime);
    if (regime === "BULL") bull++; else if (regime === "BEAR") bear++; else side++;
    if (!DRY_RUN) {
      const dt = new Date(`${D}T00:00:00.000Z`);
      await prisma.marketRegime.upsert({
        where: { date: dt },
        create: { date: dt, regime, regimeScore, trendScore: trend.trendScore, ma20: trend.ma20, ma60: trend.ma60, ma120: trend.ma120, topixClose: topixCloseDesc[di], breadth, volatility: vol, computedAt },
        update: { regime, regimeScore, trendScore: trend.trendScore, ma20: trend.ma20, ma60: trend.ma60, ma120: trend.ma120, topixClose: topixCloseDesc[di], breadth, volatility: vol, computedAt },
      });
    }
  }
  console.log(`Regime distribution: BULL ${bull} · SIDEWAYS ${side} · BEAR ${bear}  (current ${regimeOf.get(regimeDates[0])})\n`);

  // ── Fusion grid search per regime (Top20, hold 20d, objective = Sharpe) ──
  console.log("── Fusion grid search per regime (Top20, hold 20d, objective=Sharpe) ──");
  const asOfLatest = asOfDates[0] ? new Date(`${asOfDates[0]}T00:00:00.000Z`) : null;

  for (const regime of REGIMES) {
    // Gather the as-of dates belonging to this regime, then per-date fused TopN return.
    const dateIdxs = asOfDates.map((D, i) => ({ D, i })).filter(({ D }) => (regimeOf.get(D) ?? "SIDEWAYS") === regime).map(({ i }) => i);
    const perW: Record<number, number[]> = {}; for (const w of W_GRID) perW[w] = [];
    const bench: number[] = [];

    for (const aIdx of dateIdxs) {
      const day = perDate[aIdx];
      if (day.length < 50) continue;
      // recompute composites for this date (cheap; reuse stats)
      const stats = new Map<string, { mean: number; std: number }>();
      for (const f of ANALYSIS_FACTORS) { const v = day.map((o) => transform(f, o.raw[f])).filter((x): x is number => x != null && isFinite(x)); stats.set(f, v.length >= 2 ? meanStd(v) : { mean: 0, std: 0 }); }
      for (const key of ["ret20", "ret60"]) { const v = day.map((o) => (o as FObs)[key as "ret20"]).filter((x): x is number => x != null && isFinite(x)); stats.set(key, v.length >= 2 ? meanStd(v) : { mean: 0, std: 0 }); }
      const comps = day.map((o) => {
        let alpha = 0;
        for (const f of ANALYSIS_FACTORS) { const w = wMap.get(f); if (!w || w.weight === 0) continue; const t = transform(f, o.raw[f]); const s = stats.get(f)!; if (t == null || s.std === 0) continue; alpha += w.direction * ((t - s.mean) / s.std) * w.weight; }
        const z = (k: string, val: number | null) => { const s = stats.get(k)!; return val == null || s.std === 0 ? 0 : (val - s.mean) / s.std; };
        return { alpha, prod: z("ret20", o.ret20) + z("ret60", o.ret60), fwd20: o.fwd20 };
      });
      const aStat = meanStd(comps.map((c) => c.alpha)); const pStat = meanStd(comps.map((c) => c.prod));
      const zc = comps.map((c) => ({ zA: aStat.std ? (c.alpha - aStat.mean) / aStat.std : 0, zP: pStat.std ? (c.prod - pStat.mean) / pStat.std : 0, fwd20: c.fwd20 }));
      const rets = zc.map((c) => c.fwd20).filter((v): v is number => v != null);
      if (rets.length) bench.push(mean(rets));
      for (const w of W_GRID) {
        const ranked = [...zc].sort((a, b) => (w * b.zA + (1 - w) * b.zP) - (w * a.zA + (1 - w) * a.zP));
        const top = ranked.slice(0, TOPN).map((x) => x.fwd20).filter((v): v is number => v != null);
        if (top.length) perW[w].push(mean(top));
      }
    }

    const summW = W_GRID.map((w) => ({ w, ...summarizeStrategy(perW[w], bench, HOLD) }));
    const prod = summW.find((s) => s.w === 0)!;
    const alpha = summW.find((s) => s.w === 1)!;
    // best by Sharpe (fallback cumReturn)
    const ranked = [...summW].filter((s) => s.nObs > 0).sort((a, b) => (b.sharpe ?? -1e9) - (a.sharpe ?? -1e9) || (b.cumReturn ?? -1e9) - (a.cumReturn ?? -1e9));
    const best = ranked[0] ?? prod;

    console.log(`  [${regime}] n=${prod.nObs}  Prod(Sharpe ${prod.sharpe?.toFixed(2)}, cum ${prod.cumReturn?.toFixed(1)}%)  Alpha(${alpha.sharpe?.toFixed(2)}, ${alpha.cumReturn?.toFixed(1)}%)  BEST w=${best.w} (prod${((1 - best.w) * 100).toFixed(0)}/alpha${(best.w * 100).toFixed(0)}, Sharpe ${best.sharpe?.toFixed(2)}, cum ${best.cumReturn?.toFixed(1)}%)`);

    if (!DRY_RUN) {
      await prisma.regimeFusionResult.upsert({
        where: { regime },
        create: {
          regime, nDays: dateIdxs.length, topN: TOPN, holdDays: HOLD, objective: "SHARPE", asOfLatest, computedAt,
          prodCumReturn: prod.cumReturn, prodSharpe: prod.sharpe, prodWinRate: prod.winRate, prodMaxDrawdown: prod.maxDrawdown,
          alphaCumReturn: alpha.cumReturn, alphaSharpe: alpha.sharpe, alphaWinRate: alpha.winRate, alphaMaxDrawdown: alpha.maxDrawdown,
          bestAlphaWeight: best.w, fusedCumReturn: best.cumReturn, fusedSharpe: best.sharpe, fusedWinRate: best.winRate, fusedMaxDrawdown: best.maxDrawdown,
          gridJson: summW.map((s) => ({ w: s.w, sharpe: s.sharpe, cumReturn: s.cumReturn })),
        },
        update: {
          nDays: dateIdxs.length, objective: "SHARPE", asOfLatest, computedAt,
          prodCumReturn: prod.cumReturn, prodSharpe: prod.sharpe, prodWinRate: prod.winRate, prodMaxDrawdown: prod.maxDrawdown,
          alphaCumReturn: alpha.cumReturn, alphaSharpe: alpha.sharpe, alphaWinRate: alpha.winRate, alphaMaxDrawdown: alpha.maxDrawdown,
          bestAlphaWeight: best.w, fusedCumReturn: best.cumReturn, fusedSharpe: best.sharpe, fusedWinRate: best.winRate, fusedMaxDrawdown: best.maxDrawdown,
          gridJson: summW.map((s) => ({ w: s.w, sharpe: s.sharpe, cumReturn: s.cumReturn })),
        },
      });
    }
  }

  console.log(`\n=== Done (${((Date.now() - t0) / 1000).toFixed(1)}s) ===`);
  if (DRY_RUN) console.log("(DRY RUN — no writes)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
