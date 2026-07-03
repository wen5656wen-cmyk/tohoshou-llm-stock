#!/usr/bin/env npx tsx
/**
 * replay-score-v3.ts — V3 历史回放（P3-T3.1，只读）
 *
 * 对最近 N 个交易日，逐日按 as-of date 严格用「当日及以前」的价格重建：
 *   PRODUCTION(V2代理=动量核心) / ALPHA / FUSION / V3(价格核心=技术+Alpha+资金,V3动态权重)
 * 计算 Top10/20/50 的 T+1/T+3/T+5/T+10 前向收益，聚合并判断 V3 是否优于 V2。
 * 说明：V3 的基本面/新闻维度无历史快照，故回放为「V3 价格核心」（与 P3-T1 回测同口径，透明标注）。
 * READ-ONLY：不读/写 StockScore / DailyRecommendation / Portfolio / GPTScore；只输出 JSON。
 *
 * Usage: npx tsx scripts/replay-score-v3.ts [--days=20]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeAllAlphaFactors, type Bar } from "../lib/alpha";
import { deriveWeights, FACTOR_FIELD } from "../lib/alpha/score";
import { ANALYSIS_FACTORS } from "../lib/alpha/analytics/report";
import { forwardReturnPct } from "../lib/alpha/analytics/forward-return";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const N_DAYS = Number((process.argv.find((a) => a.startsWith("--days=")) ?? "--days=20").split("=")[1]);
const FWD_BUFFER = 11, MIN_LOOKBACK = 60, BATCH = 60;
const HORIZONS = [1, 3, 5, 10] as const;
const TOPN = [10, 20, 50] as const;
const STRATS = ["PRODUCTION", "ALPHA", "FUSION", "V3"] as const;
type Strat = typeof STRATS[number];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const meanStd = (v: number[]) => { const n = v.length; const m = v.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1)); return { mean: m, std: sd }; };
const mean = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
type Obs = { symbol: string; raw: Record<string, number | null>; fwd: Record<number, number | null> };

async function main() {
  const t0 = Date.now();
  console.error(`=== V3 Historical Replay (最近 ${N_DAYS} 交易日) ===`);
  const reports = await prisma.alphaFactorReport.findMany({ where: { period: 30 }, select: { factor: true, rankIc: true, sharpe: true } });
  if (!reports.length) { console.error("缺 AlphaFactorReport period=30"); process.exitCode = 1; return; }
  const wMap = new Map(deriveWeights(reports).map((w) => [w.factor, w]));

  const v3row = await prisma.adaptiveScoreV3Shadow.findFirst({ orderBy: { date: "desc" }, select: { weightsJson: true } });
  const vw = (v3row?.weightsJson as any) ?? { technical: 0.41, alpha: 0.23, flow: 0.10 };
  const vSum = (vw.technical ?? 0) + (vw.alpha ?? 0) + (vw.flow ?? 0) || 1;
  const V3W = { technical: (vw.technical ?? 0) / vSum, alpha: (vw.alpha ?? 0) / vSum, flow: (vw.flow ?? 0) / vSum };
  const regRow = await prisma.marketRegime.findFirst({ orderBy: { date: "desc" }, select: { regime: true } });
  const fus = regRow ? await prisma.regimeFusionResult.findFirst({ where: { regime: regRow.regime }, select: { bestAlphaWeight: true } }) : null;
  const fusAlphaW = fus?.bestAlphaWeight ?? 0.5;

  const gm = await prisma.globalMarket.findMany({ where: { topix: { not: null } }, select: { date: true, topix: true }, orderBy: { date: "desc" }, take: 120 });
  const topixByDate = new Map<string, number>();
  for (const g of gm) if (g.topix != null) topixByDate.set(ymd(g.date), g.topix);
  const asOfDates = gm.map((g) => ymd(g.date)).slice(FWD_BUFFER, FWD_BUFFER + N_DAYS); // idx0=最近可评估
  const asOfIdx = new Map<string, number>(); asOfDates.forEach((d, i) => asOfIdx.set(d, i));
  console.error(`as-of: ${asOfDates.length} 日 (${asOfDates.at(-1)} … ${asOfDates[0]})`);

  const stocks = await prisma.stock.findMany({ where: { aiEnabled: true }, select: { symbol: true }, orderBy: { symbol: "asc" } });
  const perDate: Obs[][] = Array.from({ length: asOfDates.length }, () => []);
  const FETCH = N_DAYS + 250 + FWD_BUFFER + 15;

  for (let i = 0; i < stocks.length; i += BATCH) {
    await Promise.all(stocks.slice(i, i + BATCH).map(async (st) => {
      const rows = await prisma.dailyPrice.findMany({ where: { symbol: st.symbol }, orderBy: { date: "desc" }, take: FETCH, select: { date: true, open: true, high: true, low: true, close: true, adjClose: true, volume: true } });
      if (rows.length < MIN_LOOKBACK + FWD_BUFFER) return;
      const bars: Bar[] = rows.map((r) => ({ date: ymd(r.date), open: r.open ?? null, high: r.high ?? null, low: r.low ?? null, close: r.close, adjClose: r.adjClose ?? null, volume: r.volume ?? null }));
      const px = (b: Bar) => b.adjClose ?? b.close;
      const d2i = new Map<string, number>(); bars.forEach((b, idx) => d2i.set(b.date, idx));
      for (const asOf of asOfDates) {
        const k = d2i.get(asOf);
        if (k == null || k + MIN_LOOKBACK >= bars.length || k < 1) continue;
        const f = computeAllAlphaFactors(bars.slice(k), topixByDate, st.symbol);
        const ret20 = k + 20 < bars.length && px(bars[k]) > 0 && px(bars[k + 20]) > 0 ? (px(bars[k]) / px(bars[k + 20]) - 1) * 100 : null;
        const ret60 = k + 60 < bars.length && px(bars[k]) > 0 && px(bars[k + 60]) > 0 ? (px(bars[k]) / px(bars[k + 60]) - 1) * 100 : null;
        const fwd: Record<number, number | null> = {};
        for (const h of HORIZONS) fwd[h] = forwardReturnPct(bars, k, h);
        perDate[asOfIdx.get(asOf)!].push({ symbol: st.symbol, raw: { RelativeStrength: f.rs20, ATR: f.atrPct, VolumeRatio: f.volumeRatio20, AverageTurnover: f.averageTurnover20, Distance52WeekHigh: f.distanceTo52WeekHigh, VolumeExpansion: f.volumeExpansionDays, _ret20: ret20, _ret60: ret60, _flow: f.volumeRatio20 == null ? null : f.volumeRatio20 + 0.15 * (f.volumeExpansionDays ?? 0) }, fwd });
      }
    }));
  }
  const totalObs = perDate.reduce((s, a) => s + a.length, 0);
  console.error(`观测: ${totalObs}`);

  const transform = (factor: string, v: number | null) => v == null ? null : (FACTOR_FIELD[factor]?.log ? Math.log10(Math.max(1, v)) : v);
  // daily[strat][topN][h] = number|null  per as-of idx（时间序）
  const daily: { date: string; ret: Record<Strat, Record<number, Record<number, number | null>>> }[] = [];

  for (let idx = 0; idx < perDate.length; idx++) {
    const day = perDate[idx];
    const rec = { date: asOfDates[idx], ret: {} as any };
    for (const s of STRATS) { rec.ret[s] = {}; for (const tn of TOPN) { rec.ret[s][tn] = {}; for (const h of HORIZONS) rec.ret[s][tn][h] = null; } }
    if (day.length >= 50) {
      const stats = new Map<string, { mean: number; std: number }>();
      for (const factor of ANALYSIS_FACTORS) { const vals = day.map((o) => transform(factor, o.raw[factor])).filter((v): v is number => v != null && isFinite(v)); stats.set(factor, vals.length >= 2 ? meanStd(vals) : { mean: 0, std: 0 }); }
      for (const key of ["_ret20", "_ret60", "_flow"]) { const vals = day.map((o) => o.raw[key]).filter((v): v is number => v != null && isFinite(v)); stats.set(key, vals.length >= 2 ? meanStd(vals) : { mean: 0, std: 0 }); }
      const z = (o: Obs, key: string) => { const st = stats.get(key)!; const v = o.raw[key]; return v == null || st.std === 0 ? 0 : (v - st.mean) / st.std; };
      const scored = day.map((o) => {
        let alpha = 0;
        for (const factor of ANALYSIS_FACTORS) { const w = wMap.get(factor); if (!w || w.weight === 0) continue; const t = transform(factor, o.raw[factor]); const st = stats.get(factor)!; if (t == null || st.std === 0) continue; alpha += w.direction * ((t - st.mean) / st.std) * w.weight; }
        return { o, prod: z(o, "_ret20") + z(o, "_ret60"), alpha, flow: z(o, "_flow") };
      });
      const pS = meanStd(scored.map((s) => s.prod)), aS = meanStd(scored.map((s) => s.alpha)), fS = meanStd(scored.map((s) => s.flow));
      const zn = (v: number, s: { mean: number; std: number }) => s.std === 0 ? 0 : (v - s.mean) / s.std;
      const keyFns: Record<Strat, (s: typeof scored[0]) => number> = {
        PRODUCTION: (s) => s.prod, ALPHA: (s) => s.alpha,
        FUSION: (s) => (1 - fusAlphaW) * zn(s.prod, pS) + fusAlphaW * zn(s.alpha, aS),
        V3: (s) => V3W.technical * zn(s.prod, pS) + V3W.alpha * zn(s.alpha, aS) + V3W.flow * zn(s.flow, fS),
      };
      for (const s of STRATS) {
        const ranked = [...scored].sort((a, b) => keyFns[s](b) - keyFns[s](a));
        for (const tn of TOPN) { const top = ranked.slice(0, tn); for (const h of HORIZONS) { const r = top.map((x) => x.o.fwd[h]).filter((v): v is number => v != null); rec.ret[s][tn][h] = r.length ? Math.round(mean(r) * 100) / 100 : null; } }
      }
    }
    daily.push(rec);
  }

  // 聚合：每 strat/topN/horizon 的平均前向收益 + 胜率（日度为正比例）
  const agg: any = {};
  for (const s of STRATS) { agg[s] = {}; for (const tn of TOPN) { agg[s][tn] = {}; for (const h of HORIZONS) {
    const vals = daily.map((d) => d.ret[s][tn][h]).filter((v): v is number => v != null);
    agg[s][tn][h] = { avg: vals.length ? Math.round(mean(vals) * 100) / 100 : null, win: vals.length ? Math.round(vals.filter((v) => v > 0).length / vals.length * 1000) / 10 : null, n: vals.length };
  } } }

  // V3 vs V2 判定
  let v3Win = 0, v3Lose = 0, cells = 0;
  const spread: any = {};
  for (const tn of TOPN) { spread[tn] = {}; for (const h of HORIZONS) {
    const v3 = agg.V3[tn][h].avg, v2 = agg.PRODUCTION[tn][h].avg;
    if (v3 != null && v2 != null) { cells++; const d = Math.round((v3 - v2) * 100) / 100; spread[tn][h] = d; if (d > 0) v3Win++; else if (d < 0) v3Lose++; }
    else spread[tn][h] = null;
  } }

  const report = {
    generatedAt: new Date().toISOString(), days: asOfDates.length, asOfRange: [asOfDates.at(-1), asOfDates[0]],
    regime: regRow?.regime ?? null, v3Weights: V3W, fusionAlphaWeight: fusAlphaW, horizons: HORIZONS, topN: TOPN,
    agg, spread, verdict: { v3Win, v3Lose, cells, v3Better: v3Win > v3Lose },
    daily: daily.map((d) => ({ date: d.date, top20: Object.fromEntries(STRATS.map((s) => [s, Object.fromEntries(HORIZONS.map((h) => [h, d.ret[s][20][h]]))])) })),
  };
  console.log(JSON.stringify(report));
  console.error(`✅ 完成 ${((Date.now() - t0) / 1000).toFixed(1)}s — V3 vs V2: 胜 ${v3Win}/${cells}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
