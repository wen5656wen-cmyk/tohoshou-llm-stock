#!/usr/bin/env npx tsx
/**
 * backtest-score-v3.ts — Adaptive Score V3 回测（P3-T1，Shadow-only）
 *
 * 在每个历史 as-of 日从 DailyPrice 重建 4 套排名并比较：
 *   PRODUCTION  = 动量核心 z(ret20)+z(ret60)（V2 可重建代理）
 *   ALPHA       = 分析加权 6 因子 z-复合
 *   FUSION      = 按当前市场状态最优比例混合 Production/Alpha（读 RegimeFusionResult）
 *   V3          = V3 动态权重下 技术/Alpha/资金流 的价格核心（基本面/新闻无历史，故重归一到这三维）
 * 组合 Top10/20/50 × 持有 5/10/20 日 × 30/90/180 日窗口。指标含换手率。
 * 结果写 reports/score-v3-backtest.json。READ-ONLY：不碰 StockScore/DailyRecommendation/Portfolio/GPT。
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeAllAlphaFactors, type Bar } from "../lib/alpha";
import { deriveWeights, FACTOR_FIELD } from "../lib/alpha/score";
import { ANALYSIS_FACTORS } from "../lib/alpha/analytics/report";
import { forwardReturnPct } from "../lib/alpha/analytics/forward-return";
import { summarizeStrategy, BACKTEST_PERIODS, BACKTEST_TOPN, BACKTEST_HOLD } from "../lib/alpha/backtest";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const WEIGHT_PERIOD = 30, FWD_BUFFER = 20, MAX_ASOF = Math.round((180 * 5) / 7), MIN_LOOKBACK = 60, BATCH = 60;
const STRATS = ["PRODUCTION", "ALPHA", "FUSION", "V3"] as const;
type Strat = typeof STRATS[number];

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function nAsOf(p: number) { return Math.round((p * 5) / 7); }
function meanStd(v: number[]) { const n = v.length; const m = v.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1)); return { mean: m, std: sd }; }
function mean(a: number[]) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
type Obs = { symbol: string; raw: Record<string, number | null>; fwd5: number | null; fwd10: number | null; fwd20: number | null };

async function main() {
  const t0 = Date.now();
  console.log("=== Adaptive Score V3 Backtest (P3-T1) ===");
  const reports = await prisma.alphaFactorReport.findMany({ where: { period: WEIGHT_PERIOD }, select: { factor: true, rankIc: true, sharpe: true } });
  if (!reports.length) { console.error("缺 AlphaFactorReport period=30"); process.exitCode = 1; return; }
  const weights = deriveWeights(reports);
  const wMap = new Map(weights.map((w) => [w.factor, w]));

  // V3 当前动态权重（technical/alpha/flow 重归一，弃 fundamental/news——历史不可重建）
  const v3row = await prisma.adaptiveScoreV3Shadow.findFirst({ orderBy: { date: "desc" }, select: { weightsJson: true } });
  const vw = (v3row?.weightsJson as any) ?? { technical: 0.4, alpha: 0.25, flow: 0.1 };
  const vSum = (vw.technical ?? 0) + (vw.alpha ?? 0) + (vw.flow ?? 0) || 1;
  const V3W = { technical: (vw.technical ?? 0) / vSum, alpha: (vw.alpha ?? 0) / vSum, flow: (vw.flow ?? 0) / vSum };

  // FUSION 比例（当前 regime 最优 alpha 权重）
  const regRow = await prisma.marketRegime.findFirst({ orderBy: { date: "desc" }, select: { regime: true } });
  const fus = regRow ? await prisma.regimeFusionResult.findFirst({ where: { regime: regRow.regime }, select: { bestAlphaWeight: true } }) : null;
  const fusAlphaW = fus?.bestAlphaWeight ?? 0.5;
  console.log(`   V3权重(技术/Alpha/资金)=${(V3W.technical*100).toFixed(0)}/${(V3W.alpha*100).toFixed(0)}/${(V3W.flow*100).toFixed(0)} · Fusion alphaW=${fusAlphaW.toFixed(2)} (${regRow?.regime})`);

  const gm = await prisma.globalMarket.findMany({ where: { topix: { not: null } }, select: { date: true, topix: true }, orderBy: { date: "desc" }, take: 400 });
  const topixByDate = new Map<string, number>();
  for (const g of gm) if (g.topix != null) topixByDate.set(ymd(g.date), g.topix);
  const asOfDates = gm.map((g) => ymd(g.date)).slice(FWD_BUFFER, FWD_BUFFER + MAX_ASOF);
  const asOfIdx = new Map<string, number>(); asOfDates.forEach((d, i) => asOfIdx.set(d, i));
  console.log(`   as-of: ${asOfDates.length} 日 (${asOfDates.at(-1)} … ${asOfDates[0]})`);

  const stocks = await prisma.stock.findMany({ where: { aiEnabled: true }, select: { symbol: true }, orderBy: { symbol: "asc" } });
  const perDate: Obs[][] = Array.from({ length: asOfDates.length }, () => []);
  const FETCH = MAX_ASOF + 250 + FWD_BUFFER + 10;

  for (let i = 0; i < stocks.length; i += BATCH) {
    await Promise.all(stocks.slice(i, i + BATCH).map(async (st) => {
      const rows = await prisma.dailyPrice.findMany({ where: { symbol: st.symbol }, orderBy: { date: "desc" }, take: FETCH, select: { date: true, open: true, high: true, low: true, close: true, adjClose: true, volume: true } });
      if (rows.length < MIN_LOOKBACK + FWD_BUFFER) return;
      const bars: Bar[] = rows.map((r) => ({ date: ymd(r.date), open: r.open ?? null, high: r.high ?? null, low: r.low ?? null, close: r.close, adjClose: r.adjClose ?? null, volume: r.volume ?? null }));
      const px = (b: Bar) => b.adjClose ?? b.close;
      const d2i = new Map<string, number>(); bars.forEach((b, idx) => d2i.set(b.date, idx));
      for (const asOf of asOfDates) {
        const k = d2i.get(asOf);
        if (k == null || k + MIN_LOOKBACK >= bars.length || k < FWD_BUFFER) continue;
        const f = computeAllAlphaFactors(bars.slice(k), topixByDate, st.symbol);
        const ret20 = k + 20 < bars.length && px(bars[k]) > 0 && px(bars[k + 20]) > 0 ? (px(bars[k]) / px(bars[k + 20]) - 1) * 100 : null;
        const ret60 = k + 60 < bars.length && px(bars[k]) > 0 && px(bars[k + 60]) > 0 ? (px(bars[k]) / px(bars[k + 60]) - 1) * 100 : null;
        perDate[asOfIdx.get(asOf)!].push({
          symbol: st.symbol,
          raw: { RelativeStrength: f.rs20, ATR: f.atrPct, VolumeRatio: f.volumeRatio20, AverageTurnover: f.averageTurnover20, Distance52WeekHigh: f.distanceTo52WeekHigh, VolumeExpansion: f.volumeExpansionDays, _ret20: ret20, _ret60: ret60, _flow: f.volumeRatio20 == null ? null : f.volumeRatio20 + 0.15 * (f.volumeExpansionDays ?? 0) },
          fwd5: forwardReturnPct(bars, k, 5), fwd10: forwardReturnPct(bars, k, 10), fwd20: forwardReturnPct(bars, k, 20),
        });
      }
    }));
    if ((i / BATCH) % 10 === 0) process.stdout.write(`\r  scanned ${Math.min(i + BATCH, stocks.length)}/${stocks.length}`);
  }
  console.log(`\n  观测: ${perDate.reduce((s, a) => s + a.length, 0)}`);

  const HOLDS = { 5: "fwd5", 10: "fwd10", 20: "fwd20" } as const;
  const transform = (factor: string, v: number | null) => v == null ? null : (FACTOR_FIELD[factor]?.log ? Math.log10(Math.max(1, v)) : v);
  const port: Record<Strat, Record<number, Record<number, (number | null)[]>>> = {} as any;
  for (const s of STRATS) { port[s] = {}; for (const tn of BACKTEST_TOPN) { port[s][tn] = {}; for (const h of BACKTEST_HOLD) port[s][tn][h] = []; } }
  const bench: Record<number, (number | null)[]> = { 5: [], 10: [], 20: [] };
  const topSets: Record<Strat, (Set<string> | null)[]> = { PRODUCTION: [], ALPHA: [], FUSION: [], V3: [] }; // topN=20 for turnover

  for (let idx = 0; idx < perDate.length; idx++) {
    const day = perDate[idx];
    if (day.length < 50) { for (const h of BACKTEST_HOLD) bench[h][idx] = null; for (const s of STRATS) topSets[s][idx] = null; continue; }
    const stats = new Map<string, { mean: number; std: number }>();
    for (const factor of ANALYSIS_FACTORS) { const vals = day.map((o) => transform(factor, o.raw[factor])).filter((v): v is number => v != null && isFinite(v)); stats.set(factor, vals.length >= 2 ? meanStd(vals) : { mean: 0, std: 0 }); }
    for (const key of ["_ret20", "_ret60", "_flow"]) { const vals = day.map((o) => o.raw[key]).filter((v): v is number => v != null && isFinite(v)); stats.set(key, vals.length >= 2 ? meanStd(vals) : { mean: 0, std: 0 }); }
    const z = (o: Obs, key: string) => { const st = stats.get(key)!; const v = o.raw[key]; return v == null || st.std === 0 ? 0 : (v - st.mean) / st.std; };

    const scored = day.map((o) => {
      let alpha = 0;
      for (const factor of ANALYSIS_FACTORS) { const w = wMap.get(factor); if (!w || w.weight === 0) continue; const t = transform(factor, o.raw[factor]); const st = stats.get(factor)!; if (t == null || st.std === 0) continue; alpha += w.direction * ((t - st.mean) / st.std) * w.weight; }
      const prod = z(o, "_ret20") + z(o, "_ret60");
      const flow = z(o, "_flow");
      return { o, prod, alpha, flow };
    });
    // 二次标准化 prod/alpha/flow 便于混合
    const pS = meanStd(scored.map((s) => s.prod)), aS = meanStd(scored.map((s) => s.alpha)), fS = meanStd(scored.map((s) => s.flow));
    const zn = (v: number, s: { mean: number; std: number }) => s.std === 0 ? 0 : (v - s.mean) / s.std;
    const keyFns: Record<Strat, (s: typeof scored[0]) => number> = {
      PRODUCTION: (s) => s.prod,
      ALPHA: (s) => s.alpha,
      FUSION: (s) => (1 - fusAlphaW) * zn(s.prod, pS) + fusAlphaW * zn(s.alpha, aS),
      V3: (s) => V3W.technical * zn(s.prod, pS) + V3W.alpha * zn(s.alpha, aS) + V3W.flow * zn(s.flow, fS),
    };
    for (const h of BACKTEST_HOLD) { const key = HOLDS[h as 5 | 10 | 20]; const rets = scored.map((s) => s.o[key]).filter((v): v is number => v != null); bench[h][idx] = rets.length ? mean(rets) : null; }
    for (const s of STRATS) {
      const ranked = [...scored].sort((a, b) => keyFns[s](b) - keyFns[s](a));
      topSets[s][idx] = new Set(ranked.slice(0, 20).map((x) => x.o.symbol));
      for (const tn of BACKTEST_TOPN) { const top = ranked.slice(0, tn); for (const h of BACKTEST_HOLD) { const key = HOLDS[h as 5 | 10 | 20]; const rets = top.map((x) => x.o[key]).filter((v): v is number => v != null); port[s][tn][h][idx] = rets.length ? mean(rets) : null; } }
    }
  }

  // 换手率（topN=20 相邻 as-of 日名单变化比例均值）
  const turnover: Record<Strat, number | null> = {} as any;
  for (const s of STRATS) {
    const chg: number[] = [];
    for (let idx = perDate.length - 1; idx > 0; idx--) { const cur = topSets[s][idx - 1], prev = topSets[s][idx]; if (!cur || !prev) continue; let inter = 0; for (const x of cur) if (prev.has(x)) inter++; chg.push(1 - inter / 20); }
    turnover[s] = chg.length ? Math.round(mean(chg) * 1000) / 10 : null;
  }

  const asOfLatest = asOfDates[0] ?? null;
  const summaryRows: any[] = [];
  for (const period of BACKTEST_PERIODS) {
    const cutoff = nAsOf(period); const idxChrono: number[] = []; for (let idx = cutoff - 1; idx >= 0; idx--) idxChrono.push(idx);
    for (const s of STRATS) for (const tn of BACKTEST_TOPN) for (const h of BACKTEST_HOLD) {
      const rets = idxChrono.map((idx) => port[s][tn][h][idx]).filter((v): v is number => v != null);
      const benchR = idxChrono.map((idx) => bench[h][idx]).filter((v): v is number => v != null);
      const sum = summarizeStrategy(rets, benchR, h);
      summaryRows.push({ period, strategy: s, topN: tn, holdDays: h, ...sum, turnover: turnover[s] });
    }
  }

  const report = { asOfLatest, computedAt: new Date().toISOString(), regime: regRow?.regime ?? null, v3Weights: V3W, fusionAlphaWeight: fusAlphaW, turnover, rows: summaryRows };
  const dir = path.join(process.cwd(), "reports"); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "score-v3-backtest.json"), JSON.stringify(report, null, 2));

  console.log("── Headline (Top20, hold 20d) 累计收益 ──");
  for (const period of BACKTEST_PERIODS) {
    const g = (s: string) => summaryRows.find((r) => r.period === period && r.strategy === s && r.topN === 20 && r.holdDays === 20)?.cumReturn;
    console.log(`  [${period}d] V2 ${g("PRODUCTION")?.toFixed(2) ?? "—"}% | Alpha ${g("ALPHA")?.toFixed(2) ?? "—"}% | Fusion ${g("FUSION")?.toFixed(2) ?? "—"}% | V3 ${g("V3")?.toFixed(2) ?? "—"}%`);
  }
  console.log(`   换手率(top20日均):`, STRATS.map((s) => `${s}:${turnover[s]}%`).join(" "));
  console.log(`✅ 写 reports/score-v3-backtest.json (${summaryRows.length} 行) ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
