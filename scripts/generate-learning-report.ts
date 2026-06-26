#!/usr/bin/env npx tsx
/**
 * Learning Engine v1.0 — TOHOSHOU AI
 *
 * Generates deterministic versioned learning reports from immutable backtest data.
 *
 * Usage:
 *   npx tsx scripts/generate-learning-report.ts [--date=YYYY-MM-DD] [--dry-run]
 *
 * Reads from (immutable sources only):
 *   BacktestPositionResult, BacktestResult, VersionSnapshot, ExperimentRegistry,
 *   DailyRecommendation (feat_* coverage only — never for scoring),
 *   logs/pipeline-runs.jsonl (Step 3), reports/data-health-guard-*.json
 *
 * Never reads: StockScore (mutable)
 *
 * Outputs:
 *   reports/learning-report-YYYYMMDD.json  — dated immutable report
 *   reports/latest-learning.json           — overwritten each run (full)
 *   reports/learning-summary.json          — lightweight summary
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Constants ─────────────────────────────────────────────────────────────────

const REPORT_VERSION = "v1.0";
const ENGINE_VERSION = "learning-engine-v1.0";

const ALL_HORIZONS = ["1d", "3d", "5d", "7d", "10d", "20d", "30d", "60d", "90d"] as const;
type Horizon = typeof ALL_HORIZONS[number];

// Calendar days to wait before a horizon position can be filled (conservative, includes weekends/holidays)
const HORIZON_CAL_DAYS: Record<Horizon, number> = {
  "1d": 4, "3d": 6, "5d": 9, "7d": 12, "10d": 17,
  "20d": 32, "30d": 46, "60d": 92, "90d": 132,
};

const PIPELINE_STAGES = [
  "fetch-global-market", "sync-all-prices", "sync-news",
  "compute-scores", "rerank-top500", "create-portfolio-snapshot",
  "update-ai-signal-stats", "update-backtest", "generate-learning-report", "data-health-guard",
] as const;

// Regression thresholds (percentage-point drop in 7d win rate)
const REGRESSION_WARNING_THRESHOLD  = -5;
const REGRESSION_CRITICAL_THRESHOLD = -15;

const FEAT_FIELDS = [
  "feat_sector","feat_industry","feat_marketCap","feat_per","feat_pbr","feat_roe","feat_dividendYield",
  "feat_adaptiveScore","feat_technicalScore","feat_fundamentalScore","feat_moneyFlowScore",
  "feat_newsSentimentScore","feat_globalTrendScore","feat_percentileRank","feat_marketRank",
  "feat_stockStyle","feat_highRiskFlag","feat_rsi14","feat_maTrend",
  "feat_ma20","feat_ma60","feat_return5d_pre","feat_return20d_pre","feat_return60d_pre","feat_volatility20d",
  "feat_vix","feat_usdjpy","feat_topixReturn5d","feat_topixReturn20d","feat_marketTemperature",
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function r4(n: number | null | undefined): number | null {
  if (n === null || n === undefined || isNaN(Number(n))) return null;
  return Math.round(Number(n) * 10000) / 10000;
}

function r2(n: number | null | undefined): number | null {
  if (n === null || n === undefined || isNaN(Number(n))) return null;
  return Math.round(Number(n) * 100) / 100;
}

function addCalendarDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type PipelineEntry = {
  stage: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "SUCCESS" | "FAILED";
  exitCode: number;
  errorMessage: string | null;
};

function readPipelineLogs(): PipelineEntry[] {
  try {
    const p = path.join(process.cwd(), "logs", "pipeline-runs.jsonl");
    if (!fs.existsSync(p)) return [];
    return fs.readFileSync(p, "utf-8")
      .trim().split("\n").filter(Boolean)
      .map(l => JSON.parse(l) as PipelineEntry)
      .reverse(); // newest first
  } catch { return []; }
}

function getLatestHealthReport(): Record<string, unknown> | null {
  try {
    const dir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith("data-health-guard-") && f.endsWith(".json"))
      .sort().reverse();
    if (!files.length) return null;
    return JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf-8"));
  } catch { return null; }
}

// ── Section 1: Data Integrity ─────────────────────────────────────────────────

async function buildDataIntegrity(reportDateObj: Date) {
  const allRuns = readPipelineLogs();
  const latestPerStage = new Map<string, PipelineEntry>();
  for (const r of allRuns) {
    if (!latestPerStage.has(r.stage)) latestPerStage.set(r.stage, r);
  }

  const reportDateMs = reportDateObj.getTime();
  const staleness48h = 48 * 3600_000;

  const staleStages: string[]   = [];
  const neverRunStages: string[] = [];
  let pipelineOk = 0;
  for (const stage of PIPELINE_STAGES) {
    const run = latestPerStage.get(stage);
    if (!run) { neverRunStages.push(stage); continue; }
    const ageMs = reportDateMs - new Date(run.finishedAt).getTime();
    if (run.status === "SUCCESS" && ageMs <= staleness48h) {
      pipelineOk++;
    } else if (ageMs > staleness48h) {
      staleStages.push(stage);
    } else {
      staleStages.push(stage); // FAILED
    }
  }
  const pipelineScore = Math.round(pipelineOk / PIPELINE_STAGES.length * 25);

  // Look-ahead validation: entry before recDate, exit before entry
  const [entryBeforeRec, exitBeforeEntry, futureExit] = await Promise.all([
    prisma.backtestPositionResult.count({
      where: { entryDate: { not: null }, AND: [{ entryDate: { not: null } }] },
    }).then(async () => {
      const rows = await prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*) as cnt FROM backtest_position_results
        WHERE "entryDate" IS NOT NULL AND "entryDate" < "recDate"
      `;
      return Number(rows[0].cnt);
    }),
    prisma.$queryRaw<[{ cnt: bigint }]>`
      SELECT COUNT(*) as cnt FROM backtest_position_results
      WHERE "exitDate" IS NOT NULL AND "entryDate" IS NOT NULL AND "exitDate" < "entryDate"
    `.then(r => Number(r[0].cnt)),
    prisma.$queryRaw<[{ cnt: bigint }]>`
      SELECT COUNT(*) as cnt FROM backtest_position_results
      WHERE "exitDate" IS NOT NULL AND "exitDate" > ${reportDateObj}::date
    `.then(r => Number(r[0].cnt)),
  ]);

  const totalPositions = await prisma.backtestPositionResult.count();
  const violationCount = entryBeforeRec + exitBeforeEntry + futureExit;
  const violationPct = totalPositions > 0 ? violationCount / totalPositions : 0;
  const lookAheadScore = violationPct === 0 ? 25
    : violationPct < 0.001 ? 20
    : violationPct < 0.01  ? 10
    : 0;
  const lookAheadViolations: string[] = [];
  if (entryBeforeRec > 0)  lookAheadViolations.push(`${entryBeforeRec} positions: entryDate < recDate`);
  if (exitBeforeEntry > 0) lookAheadViolations.push(`${exitBeforeEntry} positions: exitDate < entryDate`);
  if (futureExit > 0)      lookAheadViolations.push(`${futureExit} positions: exitDate > reportDate (${reportDateObj.toISOString().slice(0,10)})`);

  // Missing data: fill rate for "fillable" positions (enough time has passed)
  const missingRows = await prisma.$queryRaw<Array<{
    horizon: string;
    total: bigint;
    filled: bigint;
    fillable: bigint;
  }>>`
    SELECT
      horizon,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE "returnPct" IS NOT NULL) AS filled,
      COUNT(*) FILTER (WHERE
        "recDate" <= ${reportDateObj}::date - INTERVAL '1 day' * (
          CASE horizon
            WHEN '1d'  THEN 4  WHEN '3d'  THEN 6  WHEN '5d'  THEN 9
            WHEN '7d'  THEN 12 WHEN '10d' THEN 17 WHEN '20d' THEN 32
            WHEN '30d' THEN 46 WHEN '60d' THEN 92 WHEN '90d' THEN 132
            ELSE 999
          END
        )
      ) AS fillable
    FROM backtest_position_results
    GROUP BY horizon
    ORDER BY CASE horizon
      WHEN '1d' THEN 1 WHEN '3d' THEN 2 WHEN '5d' THEN 3 WHEN '7d' THEN 4
      WHEN '10d' THEN 5 WHEN '20d' THEN 6 WHEN '30d' THEN 7 WHEN '60d' THEN 8
      WHEN '90d' THEN 9 ELSE 10 END
  `;

  const missingByHorizon: Record<string, { total: number; filled: number; fillable: number; fillRate: number }> = {};
  let totalFillable = 0, totalFilled = 0;
  for (const row of missingRows) {
    const total    = Number(row.total);
    const filled   = Number(row.filled);
    const fillable = Number(row.fillable);
    const fillRate = total > 0 ? r2(filled / total * 100) ?? 0 : 0;
    missingByHorizon[row.horizon] = { total, filled, fillable, fillRate };
    totalFillable += fillable;
    totalFilled   += Math.min(filled, fillable);
  }
  const overallFillRate = totalFillable > 0 ? totalFilled / totalFillable : 0;
  const missingScore = overallFillRate >= 0.95 ? 25
    : overallFillRate >= 0.80 ? 20
    : overallFillRate >= 0.50 ? 10
    : overallFillRate > 0     ? 5
    : totalFillable === 0     ? 20 // no fillable positions yet → not a failure
    : 0;

  // Freshness (same logic as Mission Control)
  const [latestPrice, latestGm, latestBpr] = await Promise.all([
    prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.globalMarket.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.backtestPositionResult.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
  ]);
  function freshnessScore(dateStr: string | null): number {
    if (!dateStr) return 0;
    const days = Math.floor((reportDateMs - new Date(dateStr).getTime()) / 86400_000);
    return days <= 1 ? 4 : days <= 4 ? 2 : days <= 7 ? 1 : 0;
  }
  const latestPriceStr  = latestPrice?.date ? latestPrice.date.toISOString().slice(0,10) : null;
  const latestGmStr     = latestGm?.date ? latestGm.date.toISOString().slice(0,10) : null;
  const latestBprStr    = latestBpr?.computedAt ? latestBpr.computedAt.toISOString().slice(0,10) : null;
  const freshnessPts = freshnessScore(latestPriceStr) + freshnessScore(latestPriceStr) + // DailyPrice counted twice for weight
    freshnessScore(latestGmStr) + freshnessScore(latestBprStr);
  const freshnessScoreVal = Math.round(Math.min(freshnessPts, 24) / 24 * 25);

  const totalScore = Math.min(100, pipelineScore + lookAheadScore + missingScore + freshnessScoreVal);
  const grade: "PASS" | "WARNING" | "CRITICAL" = totalScore >= 75 ? "PASS" : totalScore >= 50 ? "WARNING" : "CRITICAL";

  const health = getLatestHealthReport();

  return {
    score: totalScore,
    grade,
    components: {
      pipelineValidation: {
        score: pipelineScore,
        stagesChecked: PIPELINE_STAGES.length,
        stagesOk: pipelineOk,
        staleStages,
        neverRunStages,
        healthGuardStatus: String(health?.status ?? "UNKNOWN"),
        healthGuardCritical: health?.criticalCount != null ? Number(health.criticalCount) : null,
      },
      lookAheadValidation: {
        score: lookAheadScore,
        totalPositionsChecked: totalPositions,
        violations: violationCount,
        violationPct: r4(violationPct * 100),
        violationDetails: lookAheadViolations,
      },
      missingDataSummary: {
        score: missingScore,
        totalFillable,
        totalFilled,
        overallFillRate: r2(overallFillRate * 100),
        byHorizon: missingByHorizon,
      },
      dataFreshness: {
        score: freshnessScoreVal,
        sources: {
          DailyPrice:            { latestDate: latestPriceStr, daysStale: latestPriceStr ? Math.floor((reportDateMs - new Date(latestPriceStr).getTime()) / 86400_000) : null },
          GlobalMarket:          { latestDate: latestGmStr,    daysStale: latestGmStr    ? Math.floor((reportDateMs - new Date(latestGmStr).getTime()) / 86400_000)    : null },
          BacktestPositionResult:{ latestDate: latestBprStr,   daysStale: latestBprStr   ? Math.floor((reportDateMs - new Date(latestBprStr).getTime()) / 86400_000)   : null },
        },
      },
    },
  };
}

// ── Section 2: Data Readiness ─────────────────────────────────────────────────

async function buildDataReadiness(reportDateObj: Date) {
  const [cohortStats, featCoverage] = await Promise.all([
    prisma.$queryRaw<Array<{
      horizon: string;
      sampleCount: bigint;
      filledCount: bigint;
      recDateMin: Date;
      recDateMax: Date;
    }>>`
      SELECT
        horizon,
        COUNT(*) AS "sampleCount",
        COUNT(*) FILTER (WHERE "returnPct" IS NOT NULL) AS "filledCount",
        MIN("recDate") AS "recDateMin",
        MAX("recDate") AS "recDateMax"
      FROM backtest_position_results
      GROUP BY horizon
    `,
    // Feature coverage from DailyRecommendation (read-only snapshot — not mutable scoring)
    prisma.$queryRaw<Array<{ latestDate: Date; total: bigint } & Record<string, bigint>>>`
      SELECT
        MAX(date) AS "latestDate",
        COUNT(*) AS total,
        COUNT("feat_sector") AS "feat_sector",
        COUNT("feat_vix") AS "feat_vix",
        COUNT("feat_adaptiveScore") AS "feat_adaptiveScore",
        COUNT("feat_ma20") AS "feat_ma20",
        COUNT("feat_marketTemperature") AS "feat_marketTemperature"
      FROM daily_recommendations
      WHERE date = (SELECT MAX(date) FROM daily_recommendations)
    `,
  ]);

  // Distinct trading days
  const tradingDaysResult = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(DISTINCT "recDate") AS cnt FROM backtest_position_results
  `;
  const tradingDays = Number(tradingDaysResult[0]?.cnt ?? 0);

  // Latest cohort date (for expected fill dates)
  const latestCohortDate = cohortStats.reduce((acc, r) => {
    const d = r.recDateMax?.toISOString().slice(0,10) ?? "";
    return d > acc ? d : acc;
  }, "");
  const oldestCohortDate = cohortStats.reduce((acc, r) => {
    const d = r.recDateMin?.toISOString().slice(0,10) ?? "9999-99-99";
    return d < acc ? d : acc;
  }, "9999-99-99");

  const sampleCounts: Record<string, number> = {};
  const filledCounts: Record<string, number> = {};
  const availableHorizons: string[] = [];
  for (const row of cohortStats) {
    sampleCounts[row.horizon] = Number(row.sampleCount);
    filledCounts[row.horizon] = Number(row.filledCount);
    if (Number(row.filledCount) > 0) availableHorizons.push(row.horizon);
  }
  availableHorizons.sort((a, b) => ALL_HORIZONS.indexOf(a as Horizon) - ALL_HORIZONS.indexOf(b as Horizon));

  const featRow = featCoverage[0];
  const featTotal = Number(featRow?.total ?? 0);
  const sampleFields = ["feat_sector","feat_vix","feat_adaptiveScore","feat_ma20","feat_marketTemperature"];
  const featNonNull = featRow
    ? sampleFields.reduce((s, f) => s + Number((featRow as Record<string,bigint>)[f] ?? 0), 0)
    : 0;
  const featOverallPct = featTotal > 0 ? r2(featNonNull / (featTotal * sampleFields.length) * 100) ?? 0 : 0;

  return {
    tradingDays,
    latestCohortDate: latestCohortDate || null,
    oldestCohortDate: oldestCohortDate === "9999-99-99" ? null : oldestCohortDate,
    availableHorizons,
    sampleCounts,
    filledCounts,
    featureCoverage: {
      latestDate: featRow?.latestDate ? featRow.latestDate.toISOString().slice(0,10) : null,
      totalRows: featTotal,
      overallPct: featOverallPct,
      note: featOverallPct === 0 && featTotal > 0
        ? "feat_* columns exist but all NULL — rows created before Step 2 deployment"
        : null,
    },
    expectedFillDates: {
      "30d": latestCohortDate ? addCalendarDays(latestCohortDate, HORIZON_CAL_DAYS["30d"]) : null,
      "90d": latestCohortDate ? addCalendarDays(latestCohortDate, HORIZON_CAL_DAYS["90d"]) : null,
    },
  };
}

// ── Section 3: Backtest Summary ───────────────────────────────────────────────

async function buildBacktestSummary(reportDateObj: Date) {
  const reportDateMs = reportDateObj.getTime();

  const rows = await prisma.$queryRaw<Array<{
    horizon: string;
    sampleCount: bigint;
    filledCount: bigint;
    winCount: bigint;
    avgReturn: number | null;
    medianReturn: number | null;
    avgAlpha: number | null;
    bestReturn: number | null;
    worstReturn: number | null;
  }>>`
    SELECT
      horizon,
      COUNT(*) AS "sampleCount",
      COUNT(*) FILTER (WHERE "returnPct" IS NOT NULL) AS "filledCount",
      COUNT(*) FILTER (WHERE "winFlag" = true) AS "winCount",
      AVG("returnPct") AS "avgReturn",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "returnPct") AS "medianReturn",
      AVG("alphaVsTopix") AS "avgAlpha",
      MAX("returnPct") AS "bestReturn",
      MIN("returnPct") AS "worstReturn"
    FROM backtest_position_results
    GROUP BY horizon
    ORDER BY CASE horizon
      WHEN '1d'  THEN 1 WHEN '3d'  THEN 2 WHEN '5d'  THEN 3 WHEN '7d'  THEN 4
      WHEN '10d' THEN 5 WHEN '20d' THEN 6 WHEN '30d' THEN 7 WHEN '60d' THEN 8
      WHEN '90d' THEN 9 ELSE 10 END
  `;

  return ALL_HORIZONS.map(horizon => {
    const row = rows.find(r => r.horizon === horizon);
    const sampleCount = row ? Number(row.sampleCount) : 0;
    const filledCount = row ? Number(row.filledCount) : 0;
    const winCount    = row ? Number(row.winCount)    : 0;

    // Status determination
    const calDays = HORIZON_CAL_DAYS[horizon];
    const daysElapsed = Math.floor(reportDateMs / 86400_000) - /* epoch offset in days */ 0;
    void daysElapsed; // unused — use fillCount instead
    const status: "READY" | "PARTIAL" | "PENDING" | "INSUFFICIENT" =
      filledCount >= 30  ? "READY"
      : filledCount >= 5  ? "PARTIAL"
      : filledCount > 0   ? "INSUFFICIENT"
      : "PENDING";
    void calDays;

    return {
      horizon,
      sampleCount,
      filledCount,
      fillRate: sampleCount > 0 ? r2(filledCount / sampleCount * 100) : 0,
      winRate:     filledCount > 0 ? r2(winCount / filledCount * 100) : null,
      avgReturn:   r2(row?.avgReturn),
      medianReturn:r2(row?.medianReturn),
      alpha:       r2(row?.avgAlpha),
      bestReturn:  r2(row?.bestReturn),
      worstReturn: r2(row?.worstReturn),
      status,
    };
  });
}

// ── Section 4: Version Comparison ────────────────────────────────────────────

async function buildVersionComparison() {
  const [versions, versionSnaps] = await Promise.all([
    prisma.$queryRaw<Array<{
      versionSnapshotId: string | null;
      horizon: string;
      sampleCount: bigint;
      filledCount: bigint;
      winCount: bigint;
      avgReturn: number | null;
      avgAlpha: number | null;
    }>>`
      SELECT
        "versionSnapshotId",
        horizon,
        COUNT(*) AS "sampleCount",
        COUNT(*) FILTER (WHERE "returnPct" IS NOT NULL) AS "filledCount",
        COUNT(*) FILTER (WHERE "winFlag" = true) AS "winCount",
        AVG("returnPct") AS "avgReturn",
        AVG("alphaVsTopix") AS "avgAlpha"
      FROM backtest_position_results
      GROUP BY "versionSnapshotId", horizon
    `,
    prisma.versionSnapshot.findMany({
      orderBy: { startDate: "asc" },
      select: { id: true, schemaVersion: true, modelVersion: true, scoreVersion: true, isBaseline: true, startDate: true, endDate: true, changeLog: true },
    }),
  ]);

  // Group by versionSnapshotId
  const versionMap = new Map<string, {
    schemaVersion: string | null;
    modelVersion: string | null;
    horizons: Record<string, { samples: number; filled: number; wins: number; avgReturn: number | null; avgAlpha: number | null }>;
  }>();

  for (const row of versions) {
    const vid = row.versionSnapshotId ?? "UNKNOWN";
    const snap = versionSnaps.find(v => v.id === vid);
    if (!versionMap.has(vid)) {
      versionMap.set(vid, {
        schemaVersion: snap?.schemaVersion ?? null,
        modelVersion:  snap?.modelVersion  ?? null,
        horizons: {},
      });
    }
    const v = versionMap.get(vid)!;
    v.horizons[row.horizon] = {
      samples:   Number(row.sampleCount),
      filled:    Number(row.filledCount),
      wins:      Number(row.winCount),
      avgReturn: r2(row.avgReturn),
      avgAlpha:  r2(row.avgAlpha),
    };
  }

  const versionList = Array.from(versionMap.entries()).map(([vid, data]) => {
    const snap = versionSnaps.find(v => v.id === vid);
    const horizonStats: Record<string, { samples: number; filled: number; winRate: number | null; avgReturn: number | null; alpha: number | null }> = {};
    for (const [h, hd] of Object.entries(data.horizons)) {
      horizonStats[h] = {
        samples:   hd.samples,
        filled:    hd.filled,
        winRate:   hd.filled > 0 ? r2(hd.wins / hd.filled * 100) : null,
        avgReturn: hd.avgReturn,
        alpha:     hd.avgAlpha,
      };
    }
    return {
      versionSnapshotId: vid,
      schemaVersion:  data.schemaVersion,
      modelVersion:   data.modelVersion,
      isBaseline:     snap?.isBaseline ?? false,
      startDate:      snap?.startDate?.toISOString().slice(0,10) ?? null,
      endDate:        snap?.endDate?.toISOString().slice(0,10) ?? null,
      changeLog:      snap?.changeLog ?? null,
      totalSamples:   Object.values(data.horizons).reduce((s, h) => s + h.samples, 0),
      horizons: horizonStats,
    };
  }).sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  // Pairwise comparisons (only adjacent versions)
  const comparisons: Array<{
    versionA: string;
    versionB: string;
    comparable: boolean;
    reason: string | null;
    delta: { winRate7d: number | null; avgReturn7d: number | null; alpha7d: number | null } | null;
  }> = [];

  for (let i = 0; i < versionList.length - 1; i++) {
    const a = versionList[i];
    const b = versionList[i + 1];
    const schemaMatch = a.schemaVersion === b.schemaVersion && a.schemaVersion !== null;
    if (!schemaMatch) {
      comparisons.push({
        versionA: a.versionSnapshotId,
        versionB: b.versionSnapshotId,
        comparable: false,
        reason: `NOT_COMPARABLE: schema mismatch (${a.schemaVersion ?? "null"} vs ${b.schemaVersion ?? "null"})`,
        delta: null,
      });
    } else {
      const aWin7d = a.horizons["7d"]?.winRate ?? null;
      const bWin7d = b.horizons["7d"]?.winRate ?? null;
      const aRet7d = a.horizons["7d"]?.avgReturn ?? null;
      const bRet7d = b.horizons["7d"]?.avgReturn ?? null;
      const aAlp7d = a.horizons["7d"]?.alpha ?? null;
      const bAlp7d = b.horizons["7d"]?.alpha ?? null;
      comparisons.push({
        versionA: a.versionSnapshotId,
        versionB: b.versionSnapshotId,
        comparable: true,
        reason: null,
        delta: {
          winRate7d:   (aWin7d !== null && bWin7d !== null) ? r2(bWin7d - aWin7d) : null,
          avgReturn7d: (aRet7d !== null && bRet7d !== null) ? r2(bRet7d - aRet7d) : null,
          alpha7d:     (aAlp7d !== null && bAlp7d !== null) ? r2(bAlp7d - aAlp7d) : null,
        },
      });
    }
  }

  return { versions: versionList, comparisons };
}

// ── Section 5: Regression Detection ──────────────────────────────────────────

async function buildRegressionDetection(versionComparison: Awaited<ReturnType<typeof buildVersionComparison>>) {
  const { versions, comparisons } = versionComparison;

  // Current = latest non-baseline version with no endDate (active)
  const current = versions.find(v => !v.isBaseline && v.endDate === null)
    ?? versions[versions.length - 1]
    ?? null;

  // Baseline = isBaseline=true with same schemaVersion as current
  const baseline = current
    ? versions.find(v => v.isBaseline && v.schemaVersion === current.schemaVersion && v.versionSnapshotId !== current.versionSnapshotId)
    ?? null
    : null;

  const evidence: string[] = [];

  if (!current || versions.length < 2) {
    evidence.push("Only one version snapshot exists — cannot perform regression detection.");
    return {
      status: "INSUFFICIENT_DATA" as const,
      currentVersion: current?.versionSnapshotId ?? null,
      baselineVersion: null,
      primaryMetric: "7d_win_rate",
      currentWinRate: current?.horizons["7d"]?.winRate ?? null,
      baselineWinRate: null,
      delta: null,
      thresholds: { warning: REGRESSION_WARNING_THRESHOLD, critical: REGRESSION_CRITICAL_THRESHOLD },
      evidence,
    };
  }

  if (!baseline) {
    // Try to find the most recent comparable version
    const comparable = versions.filter(v =>
      v.versionSnapshotId !== current.versionSnapshotId &&
      v.schemaVersion === current.schemaVersion
    );
    if (comparable.length === 0) {
      evidence.push(`No comparable baseline with schemaVersion=${current.schemaVersion ?? "null"}.`);
      evidence.push("All other versions have different schemaVersion — NOT_COMPARABLE.");
      // Report any schema mismatch comparisons
      for (const c of comparisons.filter(c => !c.comparable)) {
        evidence.push(`  ${c.versionA} ↔ ${c.versionB}: ${c.reason}`);
      }
      return {
        status: "INSUFFICIENT_DATA" as const,
        currentVersion: current.versionSnapshotId,
        baselineVersion: null,
        primaryMetric: "7d_win_rate",
        currentWinRate: current.horizons["7d"]?.winRate ?? null,
        baselineWinRate: null,
        delta: null,
        thresholds: { warning: REGRESSION_WARNING_THRESHOLD, critical: REGRESSION_CRITICAL_THRESHOLD },
        evidence,
      };
    }
  }

  const ref = baseline ?? versions[versions.length - 2];
  const currentWinRate  = current.horizons["7d"]?.winRate ?? null;
  const baselineWinRate = ref.horizons["7d"]?.winRate ?? null;

  if (currentWinRate === null || baselineWinRate === null) {
    evidence.push("7d win rate not available for one or both versions — cannot compare.");
    return {
      status: "INSUFFICIENT_DATA" as const,
      currentVersion: current.versionSnapshotId,
      baselineVersion: ref.versionSnapshotId,
      primaryMetric: "7d_win_rate",
      currentWinRate,
      baselineWinRate,
      delta: null,
      thresholds: { warning: REGRESSION_WARNING_THRESHOLD, critical: REGRESSION_CRITICAL_THRESHOLD },
      evidence,
    };
  }

  const delta = r2(currentWinRate - baselineWinRate)!;
  let status: "PASS" | "WARNING" | "CRITICAL";
  if (delta <= REGRESSION_CRITICAL_THRESHOLD) {
    status = "CRITICAL";
    evidence.push(`CRITICAL: 7d win rate dropped ${Math.abs(delta)}pp vs baseline (threshold: ${Math.abs(REGRESSION_CRITICAL_THRESHOLD)}pp).`);
  } else if (delta <= REGRESSION_WARNING_THRESHOLD) {
    status = "WARNING";
    evidence.push(`WARNING: 7d win rate dropped ${Math.abs(delta)}pp vs baseline (threshold: ${Math.abs(REGRESSION_WARNING_THRESHOLD)}pp).`);
  } else {
    status = "PASS";
    evidence.push(`7d win rate: current=${currentWinRate}% baseline=${baselineWinRate}% delta=${delta >= 0 ? "+" : ""}${delta}pp — within acceptable range.`);
  }

  return {
    status,
    currentVersion: current.versionSnapshotId,
    baselineVersion: ref.versionSnapshotId,
    primaryMetric: "7d_win_rate",
    currentWinRate,
    baselineWinRate,
    delta,
    thresholds: { warning: REGRESSION_WARNING_THRESHOLD, critical: REGRESSION_CRITICAL_THRESHOLD },
    evidence,
  };
}

// ── Section 6: Experiment Summary ─────────────────────────────────────────────

async function buildExperimentSummary() {
  const experiments = await prisma.experimentRegistry.findMany({
    orderBy: { startDate: "desc" },
    select: {
      id: true, status: true, hypothesis: true, targetMetric: true,
      targetThreshold: true, startDate: true, endDate: true,
      winRateDelta7d: true, alphaDelta30d: true, decision: true, decisionDate: true,
    },
  });

  const byStatus: Record<string, number> = {};
  for (const e of experiments) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  }

  return {
    total: experiments.length,
    byStatus,
    running:   experiments.filter(e => e.status === "RUNNING"),
    completed: experiments.filter(e => e.status === "COMPLETED").slice(0, 5),
    pending:   experiments.filter(e => e.status === "PENDING"),
    rejected:  experiments.filter(e => e.status === "REJECTED").slice(0, 3),
    adopted:   experiments.filter(e => e.status === "ADOPTED").slice(0, 3),
  };
}

// ── Section 7: Recommendations ────────────────────────────────────────────────

function buildRecommendations(
  dataIntegrity:       Awaited<ReturnType<typeof buildDataIntegrity>>,
  dataReadiness:       Awaited<ReturnType<typeof buildDataReadiness>>,
  backtestSummary:     Awaited<ReturnType<typeof buildBacktestSummary>>,
  regressionDetection: Awaited<ReturnType<typeof buildRegressionDetection>>,
): string[] {
  const recs: string[] = [];

  // Pipeline
  if (dataIntegrity.components.pipelineValidation.neverRunStages.length > 0) {
    recs.push(`Pipeline logging not yet active for: ${dataIntegrity.components.pipelineValidation.neverRunStages.join(", ")}. Pipeline score will improve after next cron run.`);
  } else if (dataIntegrity.components.pipelineValidation.stagesOk === PIPELINE_STAGES.length) {
    recs.push("Pipeline validation clean — all stages completed successfully within 48h.");
  } else {
    recs.push(`Pipeline issues detected: ${dataIntegrity.components.pipelineValidation.staleStages.length} stale/failed stages.`);
  }

  // Feature coverage
  const featPct = dataReadiness.featureCoverage.overallPct;
  if (featPct === 0 && (dataReadiness.featureCoverage.totalRows ?? 0) > 0) {
    recs.push("Feature coverage is 0% — feat_* snapshot columns not yet populated. First population expected after next cron run (Step 2 known limitation for pre-deployment rows).");
  } else if (featPct > 0 && featPct < 95) {
    recs.push(`Feature coverage is ${featPct}% — below 95% threshold. Investigate missing feat_* fields.`);
  } else if (featPct >= 95) {
    recs.push(`Feature coverage is ${featPct}% — meets the ≥95% threshold.`);
  }

  // Backtest readiness by horizon
  for (const h of backtestSummary) {
    if (h.status === "PENDING") {
      const expectedDate = dataReadiness.expectedFillDates[h.horizon as "30d" | "90d"];
      if (expectedDate) {
        recs.push(`${h.horizon} horizon has no filled positions. Expected first fill: ${expectedDate}.`);
      } else {
        recs.push(`${h.horizon} horizon has no filled positions yet.`);
      }
    } else if (h.status === "INSUFFICIENT" && h.filledCount > 0) {
      recs.push(`${h.horizon} horizon has only ${h.filledCount} filled position(s) — insufficient for reliable statistics (need ≥30).`);
    } else if (h.status === "PARTIAL") {
      recs.push(`${h.horizon} horizon is partially filled (${h.filledCount} positions) — statistics are preliminary (need ≥30 for confidence).`);
    }
  }

  // Look-ahead
  if (dataIntegrity.components.lookAheadValidation.violations === 0) {
    recs.push("Look-ahead validation passed — no timeline violations detected.");
  } else {
    recs.push(`Look-ahead violations detected: ${dataIntegrity.components.lookAheadValidation.violationDetails.join("; ")}. Investigate immediately.`);
  }

  // Regression
  if (regressionDetection.status === "CRITICAL") {
    recs.push(`CRITICAL: 7d win rate regression detected (delta=${regressionDetection.delta}pp). Immediate review required before next model update.`);
  } else if (regressionDetection.status === "WARNING") {
    recs.push(`WARNING: 7d win rate regression (delta=${regressionDetection.delta}pp). Monitor over next 5 trading days.`);
  } else if (regressionDetection.status === "INSUFFICIENT_DATA") {
    recs.push("Regression detection requires ≥2 comparable versions (same schemaVersion). Currently INSUFFICIENT_DATA.");
  }

  // Data trading days
  if (dataReadiness.tradingDays < 5) {
    recs.push(`Only ${dataReadiness.tradingDays} cohort date(s) available — statistical results are not yet meaningful. Need ≥20 trading days for reliable analysis.`);
  } else if (dataReadiness.tradingDays < 20) {
    recs.push(`${dataReadiness.tradingDays} cohort dates available — growing dataset. Statistical reliability improves beyond 20 trading days.`);
  }

  // Health guard
  const hgCritical = dataIntegrity.components.pipelineValidation.healthGuardCritical;
  if (hgCritical !== null && hgCritical > 0) {
    recs.push(`Health guard reports ${hgCritical} CRITICAL issue(s). System recommendations may be unreliable.`);
  }

  return recs;
}

// ── Summary builder ───────────────────────────────────────────────────────────

function buildSummary(report: Record<string, unknown>, filename: string) {
  const dr = report.dataReadiness as Awaited<ReturnType<typeof buildDataReadiness>>;
  const di = report.dataIntegrity as Awaited<ReturnType<typeof buildDataIntegrity>>;
  const rd = report.regressionDetection as Awaited<ReturnType<typeof buildRegressionDetection>>;
  return {
    reportDate:        report.reportDate,
    generatedAt:       report.generatedAt,
    reportVersion:     report.reportVersion,
    integrityScore:    di.score,
    integrityGrade:    di.grade,
    regressionStatus:  rd.status,
    availableTradingDays: dr.tradingDays,
    availableHorizons: dr.availableHorizons,
    featureCoveragePct: dr.featureCoverage.overallPct,
    recommendations:   (report.recommendations as string[]).slice(0, 5),
    reportFile:        filename,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  const dateArg = args.find(a => a.startsWith("--date="))?.slice(7);
  const dryRun  = args.includes("--dry-run");

  const reportDate    = dateArg ?? new Date().toISOString().slice(0, 10);
  const reportDateObj = new Date(reportDate + "T00:00:00.000Z");

  console.log(`[Learning Engine] ${ENGINE_VERSION}`);
  console.log(`[Learning Engine] Report date: ${reportDate}${dryRun ? " (DRY RUN)" : ""}`);

  // Build all sections in dependency order
  const [dataIntegrity, dataReadiness, backtestSummary] = await Promise.all([
    buildDataIntegrity(reportDateObj),
    buildDataReadiness(reportDateObj),
    buildBacktestSummary(reportDateObj),
  ]);
  const versionComparison = await buildVersionComparison();
  const regressionDetection = await buildRegressionDetection(versionComparison);
  const experimentSummary = await buildExperimentSummary();
  const recommendations = buildRecommendations(dataIntegrity, dataReadiness, backtestSummary, regressionDetection);

  const report = {
    reportDate,
    generatedAt: new Date().toISOString(),
    reportVersion: REPORT_VERSION,
    engineVersion: ENGINE_VERSION,
    dataIntegrity,
    dataReadiness,
    backtestSummary,
    versionComparison,
    regressionDetection,
    experimentSummary,
    recommendations,
  };

  if (dryRun) {
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
    return;
  }

  const reportsDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const filename = `learning-report-${reportDate}.json`;
  const json     = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(reportsDir, filename), json);
  fs.writeFileSync(path.join(reportsDir, "latest-learning.json"), json);
  fs.writeFileSync(
    path.join(reportsDir, "learning-summary.json"),
    JSON.stringify(buildSummary(report as Record<string, unknown>, filename), null, 2)
  );

  console.log(`[Learning Engine] Written: reports/${filename}`);
  console.log(`[Learning Engine] Integrity: ${dataIntegrity.score}/100 (${dataIntegrity.grade})`);
  console.log(`[Learning Engine] Regression: ${regressionDetection.status}`);
  console.log(`[Learning Engine] Horizons with data: ${dataReadiness.availableHorizons.join(", ") || "none"}`);
  console.log(`[Learning Engine] Recommendations: ${recommendations.length}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error("[Learning Engine] FATAL:", e); process.exit(1); });
