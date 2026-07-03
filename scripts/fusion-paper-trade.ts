#!/usr/bin/env npx tsx
/**
 * Fusion Paper Trading (P2-T4) — forward paper trading of three strategies.
 *
 *   PRODUCTION = the REAL official DailyRecommendation top picks (read-only).
 *   ALPHA      = AlphaScore composite top picks (reconstructed per entry date).
 *   FUSION     = regime-adaptive fusion  w·Alpha + (1-w)·Production, w = the searched
 *                optimal weight for that day's Market Regime (RegimeFusionResult).
 *
 * Generates daily Top10/Top20 picks and records realised forward 1/3/5/10/20-day returns
 * as future prices arrive (idempotent; run daily by cron to accumulate over 2–4 weeks).
 * READ-ONLY: never modifies the official recommendation / StockScore / Portfolio.
 *
 * Usage:  npm run fusion-paper-trade   |   DRY_RUN=1 npm run fusion-paper-trade
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeAllAlphaFactors, type Bar } from "../lib/alpha";
import { deriveWeights, FACTOR_FIELD } from "../lib/alpha/score";
import { ANALYSIS_FACTORS } from "../lib/alpha/analytics/report";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const WEIGHT_PERIOD = Number(process.env.ALPHA_SCORE_WEIGHT_PERIOD ?? 30);
const HORIZONS = [1, 3, 5, 10, 20];
const MIN_LOOKBACK = 60;
const BATCH = 60;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function meanStd(v: number[]) { const n = v.length; const m = v.reduce((a, b) => a + b, 0) / n; return { mean: m, std: Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, n - 1)) }; }
function transform(f: string, v: number | null) { return v == null ? null : FACTOR_FIELD[f]?.log ? Math.log10(Math.max(1, v)) : v; }

type Row = { alphaRaw: Record<string, number | null>; ret20: number | null; ret60: number | null; entryClose: number | null; fwd: Record<number, number | null> };

async function main() {
  const t0 = Date.now();
  console.log(`=== Fusion Paper Trading (P2-T4) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);

  const reports = await prisma.alphaFactorReport.findMany({ where: { period: WEIGHT_PERIOD }, select: { factor: true, rankIc: true, sharpe: true } });
  const weights = deriveWeights(reports);
  const wMap = new Map(weights.map((w) => [w.factor, w]));

  const regimeRows = await prisma.marketRegime.findMany({ select: { date: true, regime: true } });
  const regimeByDate = new Map(regimeRows.map((r) => [ymd(r.date), r.regime]));
  const fusionRows = await prisma.regimeFusionResult.findMany({ select: { regime: true, bestAlphaWeight: true } });
  const fusionW = new Map(fusionRows.map((r) => [r.regime, r.bestAlphaWeight ?? 0.5]));

  const latestPrice = await prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const latestPriceDate = latestPrice ? ymd(latestPrice.date) : null;

  // Entry dates = DailyRecommendation dates that already have an entry close (≤ latest price date).
  const drDates = await prisma.dailyRecommendation.groupBy({ by: ["date"], orderBy: { date: "asc" } });
  const entryDates = drDates.map((g) => ymd(g.date)).filter((d) => latestPriceDate != null && d <= latestPriceDate);
  if (!entryDates.length) { console.error("No usable entry dates."); process.exitCode = 1; return; }
  console.log(`entry dates: ${entryDates.length} (${entryDates[0]} … ${entryDates.at(-1)})`);

  // Production picks per entry date (real official recommendation, Top20 by gptRank).
  const prodByDate = new Map<string, string[]>();
  for (const d of entryDates) {
    const dt = new Date(`${d}T00:00:00.000Z`);
    const recs = await prisma.dailyRecommendation.findMany({ where: { date: dt }, orderBy: { gptRank: "asc" }, take: 20, select: { symbol: true } });
    prodByDate.set(d, recs.map((r) => r.symbol));
  }

  const stocks = await prisma.stock.findMany({ where: { aiEnabled: true }, select: { symbol: true }, orderBy: { symbol: "asc" } });
  console.log(`Universe: ${stocks.length} stocks\n`);

  // perDate[entryDate] = Map<symbol, Row>
  const perDate = new Map<string, Map<string, Row>>();
  for (const d of entryDates) perDate.set(d, new Map());
  const FETCH_BARS = 320;

  for (let i = 0; i < stocks.length; i += BATCH) {
    await Promise.all(stocks.slice(i, i + BATCH).map(async (st) => {
      const rows = await prisma.dailyPrice.findMany({ where: { symbol: st.symbol }, orderBy: { date: "desc" }, take: FETCH_BARS, select: { date: true, high: true, low: true, close: true, adjClose: true, volume: true } });
      if (rows.length < MIN_LOOKBACK) return;
      const bars: Bar[] = rows.map((r) => ({ date: ymd(r.date), open: null, high: r.high ?? null, low: r.low ?? null, close: r.close, adjClose: r.adjClose ?? null, volume: r.volume ?? null }));
      const px = (b: Bar) => b.adjClose ?? b.close;
      const dateToIdx = new Map<string, number>(); bars.forEach((b, idx) => dateToIdx.set(b.date, idx));
      for (const d of entryDates) {
        const k = dateToIdx.get(d);
        if (k == null || k + MIN_LOOKBACK >= bars.length) continue;
        const f = computeAllAlphaFactors(bars.slice(k), new Map(), st.symbol);
        const ret20 = k + 20 < bars.length && px(bars[k]) > 0 && px(bars[k + 20]) > 0 ? (px(bars[k]) / px(bars[k + 20]) - 1) * 100 : null;
        const ret60 = k + 60 < bars.length && px(bars[k]) > 0 && px(bars[k + 60]) > 0 ? (px(bars[k]) / px(bars[k + 60]) - 1) * 100 : null;
        const p0 = px(bars[k]);
        const fwd: Record<number, number | null> = {};
        for (const N of HORIZONS) fwd[N] = k - N >= 0 && p0 > 0 && px(bars[k - N]) > 0 ? (px(bars[k - N]) / p0 - 1) * 100 : null;
        perDate.get(d)!.set(st.symbol, { alphaRaw: { ATR: f.atrPct, VolumeRatio: f.volumeRatio20, AverageTurnover: f.averageTurnover20, Distance52WeekHigh: f.distanceTo52WeekHigh, VolumeExpansion: f.volumeExpansionDays, RelativeStrength: ret20 }, ret20, ret60, entryClose: bars[k].close, fwd });
      }
    }));
    if ((i / BATCH) % 10 === 0) process.stdout.write(`\r  scanned ${Math.min(i + BATCH, stocks.length)}/${stocks.length}`);
  }
  console.log();

  const computedAt = new Date();
  let written = 0;
  const upserts: Promise<unknown>[] = [];

  for (const d of entryDates) {
    const day = perDate.get(d)!;
    if (day.size < 50) continue;
    const regime = regimeByDate.get(d) ?? "SIDEWAYS";
    const w = fusionW.get(regime) ?? 0.5;
    const entries = [...day.entries()];

    // cross-sectional factor stats
    const stats = new Map<string, { mean: number; std: number }>();
    for (const f of ANALYSIS_FACTORS) { const v = entries.map(([, o]) => transform(f, o.alphaRaw[f])).filter((x): x is number => x != null && isFinite(x)); stats.set(f, v.length >= 2 ? meanStd(v) : { mean: 0, std: 0 }); }
    for (const key of ["ret20", "ret60"]) { const v = entries.map(([, o]) => (o as Row)[key as "ret20"]).filter((x): x is number => x != null && isFinite(x)); stats.set(key, v.length >= 2 ? meanStd(v) : { mean: 0, std: 0 }); }

    const comps = entries.map(([sym, o]) => {
      let alpha = 0;
      for (const f of ANALYSIS_FACTORS) { const wf = wMap.get(f); if (!wf || wf.weight === 0) continue; const t = transform(f, o.alphaRaw[f]); const s = stats.get(f)!; if (t == null || s.std === 0) continue; alpha += wf.direction * ((t - s.mean) / s.std) * wf.weight; }
      const z = (k: string, val: number | null) => { const s = stats.get(k)!; return val == null || s.std === 0 ? 0 : (val - s.mean) / s.std; };
      return { sym, alpha, prod: z("ret20", o.ret20) + z("ret60", o.ret60) };
    });
    const aStat = meanStd(comps.map((c) => c.alpha)); const pStat = meanStd(comps.map((c) => c.prod));
    const fused = comps.map((c) => ({ sym: c.sym, zA: aStat.std ? (c.alpha - aStat.mean) / aStat.std : 0, zP: pStat.std ? (c.prod - pStat.mean) / pStat.std : 0, alpha: c.alpha }));

    const alphaTop = [...fused].sort((a, b) => b.alpha - a.alpha).map((x) => x.sym);
    const fusionTop = [...fused].sort((a, b) => (w * b.zA + (1 - w) * b.zP) - (w * a.zA + (1 - w) * a.zP)).map((x) => x.sym);
    const prodTop = prodByDate.get(d) ?? [];

    const strategies: [string, string[]][] = [["PRODUCTION", prodTop], ["ALPHA", alphaTop], ["FUSION", fusionTop]];
    const dt = new Date(`${d}T00:00:00.000Z`);
    for (const [strat, syms] of strategies) {
      for (const topN of [10, 20]) {
        syms.slice(0, topN).forEach((sym, i) => {
          const o = day.get(sym);
          const data = {
            entryClose: o?.entryClose ?? null,
            ret1d: o?.fwd[1] ?? null, ret3d: o?.fwd[3] ?? null, ret5d: o?.fwd[5] ?? null, ret10d: o?.fwd[10] ?? null, ret20d: o?.fwd[20] ?? null,
            regime, rank: i + 1, computedAt,
          };
          written++;
          if (!DRY_RUN) upserts.push(prisma.fusionPaperPick.upsert({
            where: { entryDate_strategy_topN_symbol: { entryDate: dt, strategy: strat, topN, symbol: sym } },
            create: { entryDate: dt, strategy: strat, topN, symbol: sym, ...data },
            update: data,
          }));
        });
      }
    }
  }
  if (!DRY_RUN) { for (let i = 0; i < upserts.length; i += 200) await Promise.all(upserts.slice(i, i + 200)); }

  // Summary: avg forward returns by strategy (Top20) computed in-memory from picks.
  console.log("── Avg forward return by strategy (Top20, filled horizons) ──");
  const collect: Record<string, Record<number, number[]>> = { PRODUCTION: {}, ALPHA: {}, FUSION: {} };
  for (const s of ["PRODUCTION", "ALPHA", "FUSION"]) for (const N of HORIZONS) collect[s][N] = [];
  for (const d of entryDates) {
    const day = perDate.get(d)!;
    if (day.size < 50) continue;
    const regime = regimeByDate.get(d) ?? "SIDEWAYS";
    const w = fusionW.get(regime) ?? 0.5;
    const entries = [...day.entries()];
    const stats = new Map<string, { mean: number; std: number }>();
    for (const f of ANALYSIS_FACTORS) { const v = entries.map(([, o]) => transform(f, o.alphaRaw[f])).filter((x): x is number => x != null && isFinite(x)); stats.set(f, v.length >= 2 ? meanStd(v) : { mean: 0, std: 0 }); }
    for (const key of ["ret20", "ret60"]) { const v = entries.map(([, o]) => (o as Row)[key as "ret20"]).filter((x): x is number => x != null && isFinite(x)); stats.set(key, v.length >= 2 ? meanStd(v) : { mean: 0, std: 0 }); }
    const comps = entries.map(([sym, o]) => { let alpha = 0; for (const f of ANALYSIS_FACTORS) { const wf = wMap.get(f); if (!wf || wf.weight === 0) continue; const t = transform(f, o.alphaRaw[f]); const s = stats.get(f)!; if (t == null || s.std === 0) continue; alpha += wf.direction * ((t - s.mean) / s.std) * wf.weight; } const z = (k: string, val: number | null) => { const s = stats.get(k)!; return val == null || s.std === 0 ? 0 : (val - s.mean) / s.std; }; return { sym, alpha, prod: z("ret20", o.ret20) + z("ret60", o.ret60) }; });
    const aStat = meanStd(comps.map((c) => c.alpha)); const pStat = meanStd(comps.map((c) => c.prod));
    const fused = comps.map((c) => ({ sym: c.sym, zA: aStat.std ? (c.alpha - aStat.mean) / aStat.std : 0, zP: pStat.std ? (c.prod - pStat.mean) / pStat.std : 0, alpha: c.alpha }));
    const picks: Record<string, string[]> = {
      PRODUCTION: (prodByDate.get(d) ?? []).slice(0, 20),
      ALPHA: [...fused].sort((a, b) => b.alpha - a.alpha).slice(0, 20).map((x) => x.sym),
      FUSION: [...fused].sort((a, b) => (w * b.zA + (1 - w) * b.zP) - (w * a.zA + (1 - w) * a.zP)).slice(0, 20).map((x) => x.sym),
    };
    for (const s of ["PRODUCTION", "ALPHA", "FUSION"]) for (const sym of picks[s]) { const o = day.get(sym); if (!o) continue; for (const N of HORIZONS) if (o.fwd[N] != null) collect[s][N].push(o.fwd[N] as number); }
  }
  for (const s of ["PRODUCTION", "ALPHA", "FUSION"]) {
    const parts = HORIZONS.map((N) => { const a = collect[s][N]; const m = a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; return `${N}d:${m == null ? "—" : m.toFixed(2) + "%"}(n${a.length})`; });
    console.log(`  ${s.padEnd(11)} ${parts.join("  ")}`);
  }
  console.log(`  (written ${written} pick-rows across ${entryDates.length} entry dates)`);
  console.log(`\n=== Done (${((Date.now() - t0) / 1000).toFixed(1)}s) ===`);
  if (DRY_RUN) console.log("(DRY RUN — no writes)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
