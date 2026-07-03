#!/usr/bin/env npx tsx
/**
 * Alpha Score — Phase 2A (Shadow Mode) compute worker.
 *
 * Builds a composite AlphaScore from analytics-derived factor weights + cross-sectional
 * z-scores of the latest Alpha factors. SHADOW ONLY: writes AlphaScore, and NEVER reads
 * or writes StockScore / AdaptiveScore / DailyRecommendation / Portfolio / GPTScore.
 *
 * Usage:  npm run compute-alpha-score
 *         DRY_RUN=1 npm run compute-alpha-score
 * Env:    ALPHA_SCORE_WEIGHT_PERIOD (default 30) — which AlphaFactorReport period drives weights.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deriveWeights, scoreComposite, scaleAlphaScore, FACTOR_FIELD } from "../lib/alpha/score";
import { ANALYSIS_FACTORS } from "../lib/alpha/analytics/report";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const WEIGHT_PERIOD = Number(process.env.ALPHA_SCORE_WEIGHT_PERIOD ?? 30);

type FactorRow = {
  symbol: string;
  rs20: number | null;
  atrPct: number | null;
  volumeRatio20: number | null;
  averageTurnover20: number | null;
  distanceTo52WeekHigh: number | null;
  volumeExpansionDays: number | null;
};

function rawValue(r: FactorRow, factor: string): number | null {
  const field = FACTOR_FIELD[factor]?.field as keyof FactorRow;
  const v = r[field];
  return typeof v === "number" ? v : null;
}
function transform(factor: string, v: number | null): number | null {
  if (v == null) return null;
  return FACTOR_FIELD[factor]?.log ? Math.log10(Math.max(1, v)) : v;
}

function meanStd(vals: number[]): { mean: number; std: number } {
  const n = vals.length;
  const mean = vals.reduce((s, x) => s + x, 0) / n;
  const std = Math.sqrt(vals.reduce((s, x) => s + (x - mean) * (x - mean), 0) / Math.max(1, n - 1));
  return { mean, std };
}

async function main() {
  const t0 = Date.now();
  console.log(`=== Alpha Score (Phase 2A Shadow) ${DRY_RUN ? "(DRY RUN)" : ""} ===`);

  // 1. Weights from analytics report.
  const reports = await prisma.alphaFactorReport.findMany({
    where: { period: WEIGHT_PERIOD },
    select: { factor: true, rankIc: true, sharpe: true },
  });
  if (reports.length === 0) {
    console.error(`No AlphaFactorReport for period=${WEIGHT_PERIOD}. Run compute-alpha-analytics first.`);
    process.exitCode = 1;
    return;
  }
  const weights = deriveWeights(reports);
  console.log(`Weights (period=${WEIGHT_PERIOD}d, Rank IC primary / Sharpe secondary):`);
  for (const w of weights) {
    console.log(`  ${w.factor.padEnd(20)} dir ${w.direction > 0 ? "+" : "-"}  w=${(w.weight * 100).toFixed(1).padStart(5)}%  rankIC=${w.rankIc == null ? "—" : w.rankIc.toFixed(3)}`);
  }

  // 2. Latest AlphaFactor snapshot (aiEnabled universe only).
  const latest = await prisma.alphaFactor.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  if (!latest) { console.error("No AlphaFactor rows. Run compute-alpha-factors first."); process.exitCode = 1; return; }
  const enabled = new Set((await prisma.stock.findMany({ where: { aiEnabled: true }, select: { symbol: true } })).map((s) => s.symbol));
  const rowsAll = await prisma.alphaFactor.findMany({
    where: { date: latest.date },
    select: { symbol: true, rs20: true, atrPct: true, volumeRatio20: true, averageTurnover20: true, distanceTo52WeekHigh: true, volumeExpansionDays: true },
  });
  const rows = rowsAll.filter((r) => enabled.has(r.symbol));
  console.log(`\nUniverse: ${rows.length} stocks · date ${latest.date.toISOString().slice(0, 10)}`);

  // 3. Cross-sectional mean/std of transformed values per factor.
  const stats = new Map<string, { mean: number; std: number }>();
  for (const factor of ANALYSIS_FACTORS) {
    const vals = rows.map((r) => transform(factor, rawValue(r, factor))).filter((v): v is number => v != null && isFinite(v));
    stats.set(factor, vals.length >= 2 ? meanStd(vals) : { mean: 0, std: 0 });
  }

  // 4. Per-stock composite.
  const computedAt = new Date();
  const scored = rows.map((r) => {
    const perFactor = ANALYSIS_FACTORS.map((factor) => {
      const raw = rawValue(r, factor);
      const t = transform(factor, raw);
      const st = stats.get(factor)!;
      const z = t == null || st.std === 0 ? null : (t - st.mean) / st.std;
      return { factor, value: raw, z };
    });
    const { composite, breakdown } = scoreComposite(perFactor, weights);
    return { symbol: r.symbol, composite, alphaScore: scaleAlphaScore(composite), breakdown };
  });

  // 5. Rank + percentile.
  scored.sort((a, b) => b.composite - a.composite);
  const N = scored.length;
  const ranked = scored.map((s, i) => ({
    ...s,
    rank: i + 1,
    percentile: N > 1 ? Math.round(((N - (i + 1)) / (N - 1)) * 10000) / 100 : 100,
  }));

  // 6. Upsert (shadow table only).
  if (!DRY_RUN) {
    const BATCH = 100;
    for (let i = 0; i < ranked.length; i += BATCH) {
      await Promise.all(ranked.slice(i, i + BATCH).map((s) =>
        prisma.alphaScore.upsert({
          where: { symbol_date: { symbol: s.symbol, date: latest.date } },
          create: { symbol: s.symbol, date: latest.date, alphaScore: s.alphaScore, composite: s.composite, factorBreakdown: s.breakdown, rank: s.rank, percentile: s.percentile, computedAt },
          update: { alphaScore: s.alphaScore, composite: s.composite, factorBreakdown: s.breakdown, rank: s.rank, percentile: s.percentile, computedAt },
        })
      ));
    }
  }

  console.log("\nTop 10 by AlphaScore:");
  for (const s of ranked.slice(0, 10)) {
    console.log(`  #${String(s.rank).padStart(3)}  ${s.symbol.padEnd(8)} score ${s.alphaScore.toFixed(1)}  composite ${s.composite.toFixed(3)}  pct ${s.percentile.toFixed(1)}`);
  }
  console.log(`\n=== Done (${((Date.now() - t0) / 1000).toFixed(1)}s) — scored ${ranked.length} ===`);
  if (DRY_RUN) console.log("(DRY RUN — no writes)");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
