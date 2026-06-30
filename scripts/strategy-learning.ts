#!/usr/bin/env npx tsx
/**
 * scripts/strategy-learning.ts — Strategy Learning Engine (Phase 5)
 *
 * Data flow:
 *   StrategyBacktestSummary
 *     → strategy-learning.ts
 *     → StrategyLearningReport (per strategy)
 *     → StrategyLearningSummary (unified, weighted)
 *
 * Per-strategy scoring (0-100 each):
 *   predictionScore  = winRate quality + alpha quality + return quality
 *   stabilityScore   = horizon coverage × fillRate maturity
 *   confidenceScore  = sample volume + risk quality (maxDrawdown + Sharpe)
 *   integrityScore   = prediction×40% + stability×30% + confidence×30%
 *
 * Learning Grade:
 *   A+ (≥85)  A (≥75)  B (≥60)  C (≥45)  D (<45)
 *
 * Recommendation:
 *   READY (≥75)  PARTIAL (≥60)  NOT_READY (<60)
 *
 * Unified integrityScore weight:
 *   DAY×30% + SWING×40% + LONG×30%
 *
 * Usage:
 *   npx tsx scripts/strategy-learning.ts
 *   npx tsx scripts/strategy-learning.ts --dry-run
 *   npx tsx scripts/strategy-learning.ts --date=2026-06-30
 *   npx tsx scripts/strategy-learning.ts --strategy=DAY
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg }     from "@prisma/adapter-pg";

// ── Prisma ────────────────────────────────────────────────────────────────────
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ── CLI args ──────────────────────────────────────────────────────────────────
const DRY_RUN     = process.argv.includes("--dry-run");
const dateArg     = process.argv.find(a => a.startsWith("--date="))?.split("=")[1];
const strategyArg = process.argv.find(a => a.startsWith("--strategy="))?.split("=")[1]?.toUpperCase();

// ── Types ─────────────────────────────────────────────────────────────────────
type StratType = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";

const ALL_STRATEGIES: StratType[] = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"];

const STRATEGY_MAP: Record<string, StratType> = {
  DAY:   "DAY_TRADE",
  SWING: "SWING_TRADE",
  LONG:  "LONG_TRADE",
};

const HORIZONS: Record<StratType, string[]> = {
  DAY_TRADE:   ["1D", "3D", "5D"],
  SWING_TRADE: ["5D", "7D", "20D", "30D"],
  LONG_TRADE:  ["30D", "60D", "90D", "180D", "365D"],
};

// Unified weights (must sum to 1.0)
const STRATEGY_WEIGHTS: Record<StratType, number> = {
  DAY_TRADE:   0.30,
  SWING_TRADE: 0.40,
  LONG_TRADE:  0.30,
};

type BacktestRow = {
  strategyType:    string;
  horizon:         string;
  asOfDate:        Date;
  sampleCount:     number;
  filledCount:     number;
  fillRate:        number | null;
  winRate:         number | null;
  lossRate:        number | null;
  avgReturnPct:    number | null;
  alpha:           number | null;
  maxDrawdown:     number | null;
  sharpeRatio:     number | null;
};

// ── Math helpers ──────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function wMean(pairs: Array<{ v: number; w: number }>): number {
  const totalW = pairs.reduce((s, p) => s + p.w, 0);
  if (totalW === 0) return 0;
  return pairs.reduce((s, p) => s + p.v * p.w, 0) / totalW;
}

function r2(n: number): number { return Math.round(n * 100) / 100; }

// ── Grade & recommendation ────────────────────────────────────────────────────
function grade(score: number): string {
  if (score >= 85) return "A+";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 45) return "C";
  return "D";
}

function recommendation(score: number): string {
  if (score >= 75) return "READY";
  if (score >= 60) return "PARTIAL";
  return "NOT_READY";
}

// ── Per-strategy scoring ──────────────────────────────────────────────────────
interface StrategyMetrics {
  sampleCount:     number;
  fillRate:        number | null;
  winRate:         number | null;
  avgReturnPct:    number | null;
  alpha:           number | null;
  maxDrawdown:     number | null;
  predictionScore: number;
  stabilityScore:  number;
  confidenceScore: number;
  integrityScore:  number;
  grade:           string;
  recommendation:  string;
  summary:         string;
}

function computeMetrics(rows: BacktestRow[], strategyType: StratType): StrategyMetrics {
  const totalHorizons = HORIZONS[strategyType].length;
  const withData      = rows.filter(r => r.filledCount > 0);
  const withSamples   = rows.filter(r => r.sampleCount > 0);

  // ── Aggregate stats ─────────────────────────────────────────────────────────
  const totalFilled = rows.reduce((s, r) => s + r.filledCount, 0);

  // Weighted by filledCount for return metrics
  const fillRateAvg    = withSamples.length > 0
    ? wMean(withSamples.map(r => ({ v: r.fillRate ?? 0, w: r.sampleCount })))
    : null;
  const winRateAvg     = withData.length > 0
    ? mean(withData.map(r => r.winRate ?? 0))
    : null;
  const avgReturnAvg   = withData.length > 0
    ? wMean(withData.map(r => ({ v: r.avgReturnPct ?? 0, w: r.filledCount })))
    : null;
  const alphaAvg       = withData.length > 0
    ? wMean(withData.map(r => ({ v: r.alpha ?? 0, w: r.filledCount })))
    : null;
  const maxDD          = withData.length > 0
    ? Math.max(...withData.map(r => r.maxDrawdown ?? 0))
    : null;

  // ── predictionScore (Prediction + Performance + Alpha quality) ───────────
  let predictionScore = 0;
  if (withData.length > 0 && winRateAvg != null) {
    // winRate: 40% → 0, 70% → 100
    const wr = clamp((winRateAvg - 0.40) / 0.30 * 100, 0, 100);
    // alpha: -2% → 0, 8% → 100
    const al = alphaAvg != null ? clamp((alphaAvg + 2) / 10 * 100, 0, 100) : 0;
    // avgReturn: -2% → 0, 10% → 100
    const rt = avgReturnAvg != null ? clamp((avgReturnAvg + 2) / 12 * 100, 0, 100) : 0;
    predictionScore = wr * 0.40 + al * 0.35 + rt * 0.25;
  }

  // ── stabilityScore (Horizon coverage × fillRate maturity) ───────────────
  // READY horizon counts 1.0, PARTIAL 0.5, INSUFFICIENT 0
  let readyWeight = 0;
  for (const r of rows) {
    const fr = r.fillRate ?? 0;
    if (fr >= 0.80) readyWeight += 1.0;
    else if (fr >= 0.50) readyWeight += 0.5;
    else if (fr >= 0.30) readyWeight += 0.25;
  }
  const coverageScore = (readyWeight / totalHorizons) * 100;
  // fillRate consistency from horizons with any samples
  const frConsistency = fillRateAvg != null ? fillRateAvg * 100 : 0;
  const stabilityScore = coverageScore * 0.60 + frConsistency * 0.40;

  // ── confidenceScore (Sample volume + Risk quality) ───────────────────────
  // Volume: 20 filled trades → 100
  const volumeScore = clamp(totalFilled / 20 * 100, 0, 100);
  // maxDrawdown risk: 0% DD → 100, 20% DD → 0
  const riskScore = maxDD != null
    ? clamp(100 - maxDD * 5, 0, 100)
    : (withData.length > 0 ? 50 : 0);
  // Sharpe quality: -1 → 0, 2 → 100
  const sharpes    = withData.map(r => r.sharpeRatio).filter((v): v is number => v != null);
  const sharpeAvg  = sharpes.length > 0 ? mean(sharpes) : null;
  const sharpeScore = sharpeAvg != null
    ? clamp((sharpeAvg + 1) / 3 * 100, 0, 100)
    : (withData.length > 0 ? 30 : 0);
  const confidenceScore = volumeScore * 0.50 + riskScore * 0.30 + sharpeScore * 0.20;

  // ── integrityScore ────────────────────────────────────────────────────────
  const integrityScore = predictionScore * 0.40 + stabilityScore * 0.30 + confidenceScore * 0.30;

  // ── Summary string ────────────────────────────────────────────────────────
  const g   = grade(integrityScore);
  const rec = recommendation(integrityScore);

  const summaryParts: string[] = [
    `grade=${g}`,
    `rec=${rec}`,
    `integrity=${r2(integrityScore)}`,
    `fill=${fillRateAvg != null ? (fillRateAvg * 100).toFixed(0) + "%" : "N/A"}`,
    `win=${winRateAvg != null ? (winRateAvg * 100).toFixed(0) + "%" : "N/A"}`,
    `α=${alphaAvg != null ? r2(alphaAvg) + "%" : "N/A"}`,
    `n=${totalFilled}`,
  ];
  const summary = summaryParts.join("  ");

  return {
    sampleCount:     totalFilled,
    fillRate:        fillRateAvg,
    winRate:         winRateAvg,
    avgReturnPct:    avgReturnAvg,
    alpha:           alphaAvg,
    maxDrawdown:     maxDD,
    predictionScore: r2(predictionScore),
    stabilityScore:  r2(stabilityScore),
    confidenceScore: r2(confidenceScore),
    integrityScore:  r2(integrityScore),
    grade:           g,
    recommendation:  rec,
    summary,
  };
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function jstDate(d?: Date): Date {
  const src = d ?? new Date();
  const jst = new Date(src.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

// ── Logging ───────────────────────────────────────────────────────────────────
const startedAt = new Date();
let stepIdx = 0;

function step(msg: string) {
  stepIdx++;
  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`\n[Step ${stepIdx}] ${msg}  (+${elapsed}s)`);
}

function col(label: string, value: string | number) {
  console.log(`  ${label.padEnd(30)} ${value}`);
}

const border = "═".repeat(66);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(border);
  console.log(`  Strategy Learning Engine${DRY_RUN ? "  🔍 DRY RUN" : ""}`);
  console.log(`  Started: ${startedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} JST`);
  console.log(border);

  // ── Step 1: Determine reportDate ─────────────────────────────────────────
  step("Determine reportDate");

  let reportDate: Date;
  if (dateArg) {
    const [y, m, d] = dateArg.split("-").map(Number);
    reportDate = new Date(Date.UTC(y, m - 1, d));
    col("Mode",       "explicit --date");
  } else {
    reportDate = jstDate();
    col("Mode",       "today JST");
  }
  const reportStr = reportDate.toISOString().slice(0, 10);
  col("reportDate",  reportStr);

  // ── Step 2: Determine target strategies ──────────────────────────────────
  step("Determine target strategies");

  let targets: StratType[];
  if (strategyArg) {
    const mapped = STRATEGY_MAP[strategyArg]
      ?? (ALL_STRATEGIES.includes(strategyArg as StratType) ? strategyArg as StratType : null);
    if (!mapped) {
      console.error(`\n❌ Unknown --strategy=${strategyArg}. Use DAY, SWING, or LONG.`);
      await prisma.$disconnect();
      process.exit(1);
    }
    targets = [mapped];
  } else {
    targets = [...ALL_STRATEGIES];
  }
  col("Strategies", targets.join(", "));

  // ── Step 3: Load backtest summaries ──────────────────────────────────────
  step("Load StrategyBacktestSummary");

  // For each strategy, use the most recent asOfDate ≤ reportDate
  const strategyResults: Map<StratType, StrategyMetrics> = new Map();

  for (const strategyType of targets) {
    // Find most recent backtest date for this strategy
    const latestRow = await (prisma as any).strategyBacktestSummary.findFirst({
      where: { strategyType, asOfDate: { lte: reportDate } },
      orderBy: { asOfDate: "desc" },
      select: { asOfDate: true },
    });

    if (!latestRow) {
      col(`  ${strategyType}`, "No backtest data — scoring as D");
      // Return zero-scores metrics
      strategyResults.set(strategyType, computeMetrics([], strategyType));
      continue;
    }

    const latestDate = latestRow.asOfDate;
    const dateStr    = new Date(latestDate).toISOString().slice(0, 10);

    const rows = await (prisma as any).strategyBacktestSummary.findMany({
      where: { strategyType, asOfDate: latestDate },
      select: {
        strategyType: true, horizon: true, asOfDate: true,
        sampleCount:  true, filledCount: true, fillRate: true,
        winRate: true, lossRate: true, avgReturnPct: true,
        alpha: true, maxDrawdown: true, sharpeRatio: true,
      },
    }) as BacktestRow[];

    const metrics = computeMetrics(rows, strategyType);
    strategyResults.set(strategyType, metrics);

    col(
      `  ${strategyType} (asOf=${dateStr})`,
      `grade=${metrics.grade}  score=${metrics.integrityScore}  rec=${metrics.recommendation}`,
    );
  }

  // ── Step 4: Write StrategyLearningReport ─────────────────────────────────
  step("Upsert StrategyLearningReport");

  const reportSummary: string[] = [];

  for (const strategyType of targets) {
    const m = strategyResults.get(strategyType)!;

    console.log(`\n  ── ${strategyType} ──`);
    col("    integrityScore",  m.integrityScore);
    col("    predictionScore", m.predictionScore);
    col("    stabilityScore",  m.stabilityScore);
    col("    confidenceScore", m.confidenceScore);
    col("    grade",           m.grade);
    col("    recommendation",  m.recommendation);
    col("    sampleCount",     m.sampleCount);
    col("    fillRate",        m.fillRate != null ? (m.fillRate * 100).toFixed(1) + "%" : "N/A");
    col("    winRate",         m.winRate  != null ? (m.winRate  * 100).toFixed(1) + "%" : "N/A");
    col("    alpha",           m.alpha    != null ? m.alpha.toFixed(2) + "%" : "N/A");
    col("    maxDrawdown",     m.maxDrawdown != null ? m.maxDrawdown.toFixed(2) + "%" : "N/A");

    reportSummary.push(`${strategyType}: ${m.grade} (${m.integrityScore}) ${m.recommendation}`);

    if (DRY_RUN) continue;

    await (prisma as any).strategyLearningReport.upsert({
      where: {
        strategyType_reportDate: { strategyType, reportDate },
      },
      create: {
        strategyType,
        reportDate,
        sampleCount:     m.sampleCount,
        fillRate:        m.fillRate,
        winRate:         m.winRate,
        avgReturnPct:    m.avgReturnPct,
        alpha:           m.alpha,
        maxDrawdown:     m.maxDrawdown,
        predictionScore: m.predictionScore,
        stabilityScore:  m.stabilityScore,
        confidenceScore: m.confidenceScore,
        integrityScore:  m.integrityScore,
        grade:           m.grade,
        recommendation:  m.recommendation,
        summary:         m.summary,
      },
      update: {
        sampleCount:     m.sampleCount,
        fillRate:        m.fillRate,
        winRate:         m.winRate,
        avgReturnPct:    m.avgReturnPct,
        alpha:           m.alpha,
        maxDrawdown:     m.maxDrawdown,
        predictionScore: m.predictionScore,
        stabilityScore:  m.stabilityScore,
        confidenceScore: m.confidenceScore,
        integrityScore:  m.integrityScore,
        grade:           m.grade,
        recommendation:  m.recommendation,
        summary:         m.summary,
      },
    });
  }

  // ── Step 5: Unified StrategyLearningSummary ───────────────────────────────
  step("Compute & upsert StrategyLearningSummary");

  const dayM   = strategyResults.get("DAY_TRADE");
  const swingM = strategyResults.get("SWING_TRADE");
  const longM  = strategyResults.get("LONG_TRADE");

  // Only compute unified if all three were targeted
  if (targets.length === ALL_STRATEGIES.length) {
    const dayI   = dayM?.integrityScore   ?? 0;
    const swingI = swingM?.integrityScore ?? 0;
    const longI  = longM?.integrityScore  ?? 0;

    // Weighted: DAY×30% + SWING×40% + LONG×30%
    const unified = dayI * STRATEGY_WEIGHTS.DAY_TRADE
                  + swingI * STRATEGY_WEIGHTS.SWING_TRADE
                  + longI * STRATEGY_WEIGHTS.LONG_TRADE;
    const unifiedR = r2(unified);

    const summaryGrade = grade(unifiedR);
    const summaryRec   = recommendation(unifiedR);
    const summaryStr   = [
      `unified=${unifiedR}`,
      `day=${dayI}(×30%)`,
      `swing=${swingI}(×40%)`,
      `long=${longI}(×30%)`,
      `grade=${summaryGrade}`,
      `rec=${summaryRec}`,
    ].join("  ");

    console.log(`\n  Unified Summary:`);
    col("    DAY integrity",   `${dayI}  (weight 30%)`);
    col("    SWING integrity", `${swingI}  (weight 40%)`);
    col("    LONG integrity",  `${longI}  (weight 30%)`);
    col("    integrityScore",  `${unifiedR}  (weighted)`);
    col("    grade",           summaryGrade);
    col("    recommendation",  summaryRec);

    reportSummary.push(`Unified: ${summaryGrade} (${unifiedR}) ${summaryRec}`);

    if (!DRY_RUN) {
      await (prisma as any).strategyLearningSummary.upsert({
        where: { reportDate },
        create: {
          reportDate,
          dayIntegrity:   dayI,
          swingIntegrity: swingI,
          longIntegrity:  longI,
          integrityScore: unifiedR,
          grade:          summaryGrade,
          recommendation: summaryRec,
          summary:        summaryStr,
        },
        update: {
          dayIntegrity:   dayI,
          swingIntegrity: swingI,
          longIntegrity:  longI,
          integrityScore: unifiedR,
          grade:          summaryGrade,
          recommendation: summaryRec,
          summary:        summaryStr,
        },
      });
    }
  } else {
    console.log("  (Skipping unified summary — not all strategies targeted)");
  }

  // ── Step 6: Final output ──────────────────────────────────────────────────
  step("Summary");

  col("reportDate",  reportStr);
  col("Strategies",  targets.join(", "));
  col("DRY RUN",     DRY_RUN ? "yes — no writes" : "no");

  console.log("\n  Results:");
  reportSummary.forEach(l => console.log(`    ${l}`));

  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`\n  Elapsed: ${elapsed}s`);
  console.log(
    `\n${DRY_RUN
      ? "  [DRY RUN] No DB writes performed."
      : `  ✅ Done — ${targets.length} StrategyLearningReport rows upserted` +
        (targets.length === ALL_STRATEGIES.length ? " + 1 StrategyLearningSummary." : ".")
    }`,
  );
  console.log(border);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error("CRASH:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
