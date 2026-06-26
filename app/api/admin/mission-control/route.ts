import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

type PipelineRunEntry = {
  stage: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "SUCCESS" | "FAILED";
  exitCode: number;
  errorMessage: string | null;
  runType?: "production" | "dry-run";
  pipelineRunId?: string;
};

type StageStatus = "SUCCESS" | "FAILED" | "NEVER_RUN";

const PIPELINE_STAGES: { stage: string; displayName: string; schedule: string }[] = [
  { stage: "fetch-global-market",       displayName: "Fetch Global Market",    schedule: "05:30 JST" },
  { stage: "sync-all-prices",           displayName: "Sync All Prices",        schedule: "06:00 JST" },
  { stage: "sync-news",                 displayName: "Sync News",              schedule: "07:00 JST" },
  { stage: "compute-scores",            displayName: "Compute Scores",         schedule: "07:30 JST" },
  { stage: "rerank-top500",             displayName: "Rerank Top500",          schedule: "07:30 JST" },
  { stage: "create-portfolio-snapshot", displayName: "Portfolio Snapshot",     schedule: "07:30 JST" },
  { stage: "update-ai-signal-stats",   displayName: "AI Signal Stats",        schedule: "07:30 JST" },
  { stage: "update-backtest",          displayName: "Update Backtest",        schedule: "07:30 JST" },
  { stage: "generate-learning-report", displayName: "Learning Report",        schedule: "07:30 JST" },
  { stage: "data-health-guard",        displayName: "Health Check",           schedule: "07:30 JST" },
];

const FEAT_FIELDS = [
  "feat_sector","feat_industry","feat_marketCap","feat_per","feat_pbr","feat_roe","feat_dividendYield",
  "feat_adaptiveScore","feat_technicalScore","feat_fundamentalScore","feat_moneyFlowScore",
  "feat_newsSentimentScore","feat_globalTrendScore","feat_percentileRank","feat_marketRank",
  "feat_stockStyle","feat_highRiskFlag","feat_rsi14","feat_maTrend",
  "feat_ma20","feat_ma60","feat_return5d_pre","feat_return20d_pre","feat_return60d_pre","feat_volatility20d",
  "feat_vix","feat_usdjpy","feat_topixReturn5d","feat_topixReturn20d","feat_marketTemperature",
] as const;

// ── Pipeline Log Reader ───────────────────────────────────────────────────────

function readPipelineRuns(): PipelineRunEntry[] {
  try {
    const logPath = path.join(process.cwd(), "logs", "pipeline-runs.jsonl");
    if (!fs.existsSync(logPath)) return [];
    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    // Parse last 2000 lines to cover ~250 days of history
    return lines.slice(-2000).map(l => JSON.parse(l) as PipelineRunEntry).reverse();
  } catch { return []; }
}

function getLatestPerStage(runs: PipelineRunEntry[]): Map<string, PipelineRunEntry> {
  const map = new Map<string, PipelineRunEntry>();
  for (const run of runs) {
    if (!map.has(run.stage)) map.set(run.stage, run);
  }
  return map;
}

// ── JST helpers ───────────────────────────────────────────────────────────────

function todayJst(): Date {
  const n = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

function daysAgo(dateStr: string | null, refDate: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Math.floor((refDate.getTime() - d.getTime()) / 86400000);
}

function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeDryRun = searchParams.get("includeDryRun") === "true";
    const today = todayJst();

    // ── Parallel DB queries ─────────────────────────────────────────────────
    const [
      latestPrice,
      latestScore,
      latestRecGroup,
      latestGm,
      latestNews,
      latestBacktest,
      latestDR,
      activeExperiment,
      activeVersion,
      backtestRows,
    ] = await Promise.all([
      prisma.dailyPrice.findFirst({
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      prisma.stockScore.findFirst({
        orderBy: { computedAt: "desc" },
        select: { computedAt: true },
      }),
      prisma.dailyRecommendation.groupBy({
        by: ["date"],
        _count: { id: true },
        orderBy: { date: "desc" },
        take: 1,
      }),
      prisma.globalMarket.findFirst({
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      prisma.news.findFirst({
        orderBy: { publishedAt: "desc" },
        select: { publishedAt: true },
      }),
      prisma.backtestPositionResult.findFirst({
        orderBy: { computedAt: "desc" },
        select: { computedAt: true },
      }),
      // Latest DR row for version info
      prisma.dailyRecommendation.findFirst({
        orderBy: { date: "desc" },
        select: {
          schemaVersion: true, modelVersion: true, scoreVersion: true,
          versionSnapshotId: true, pipelineRunId: true,
        },
      }),
      // Active experiment
      prisma.experimentRegistry.findFirst({
        where: { status: "RUNNING" },
        select: { id: true, hypothesis: true },
      }),
      // Latest active version snapshot
      prisma.versionSnapshot.findFirst({
        where: { endDate: null },
        orderBy: { startDate: "desc" },
        select: { id: true, modelVersion: true, scoreVersion: true, schemaVersion: true },
      }),
      // Backtest summary: 5 horizons from BacktestPositionResult
      prisma.$queryRaw<Array<{
        horizon: string;
        sampleCount: bigint;
        filledCount: bigint;
        winCount: bigint;
        avgReturn: number | null;
        avgAlpha: number | null;
      }>>`
        SELECT
          horizon,
          COUNT(*) AS "sampleCount",
          COUNT(*) FILTER (WHERE "returnPct" IS NOT NULL) AS "filledCount",
          COUNT(*) FILTER (WHERE "winFlag" = true) AS "winCount",
          AVG("returnPct") AS "avgReturn",
          AVG("alphaVsTopix") AS "avgAlpha"
        FROM backtest_position_results
        WHERE horizon IN ('1d','3d','7d','30d','90d')
        GROUP BY horizon
        ORDER BY CASE horizon
          WHEN '1d'  THEN 1 WHEN '3d'  THEN 2 WHEN '7d'  THEN 3
          WHEN '30d' THEN 4 WHEN '90d' THEN 5 ELSE 9 END
      `,
    ]);

    // ── Feature Coverage ────────────────────────────────────────────────────
    const latestRecDate = latestRecGroup[0]?.date ?? null;
    const latestRecCount = latestRecGroup[0]?._count.id ?? 0;

    let featureFieldStats: { field: string; nonNullCount: number; coveragePct: number }[] = [];
    let featureTotalRows = 0;
    let overallCoveragePct = 0;

    if (latestRecDate) {
      const coverageResult = await prisma.$queryRaw<Array<Record<string, bigint>>>`
        SELECT
          COUNT(*) as "total",
          COUNT("feat_sector")            as "feat_sector",
          COUNT("feat_industry")          as "feat_industry",
          COUNT("feat_marketCap")         as "feat_marketCap",
          COUNT("feat_per")               as "feat_per",
          COUNT("feat_pbr")               as "feat_pbr",
          COUNT("feat_roe")               as "feat_roe",
          COUNT("feat_dividendYield")     as "feat_dividendYield",
          COUNT("feat_adaptiveScore")     as "feat_adaptiveScore",
          COUNT("feat_technicalScore")    as "feat_technicalScore",
          COUNT("feat_fundamentalScore")  as "feat_fundamentalScore",
          COUNT("feat_moneyFlowScore")    as "feat_moneyFlowScore",
          COUNT("feat_newsSentimentScore") as "feat_newsSentimentScore",
          COUNT("feat_globalTrendScore")  as "feat_globalTrendScore",
          COUNT("feat_percentileRank")    as "feat_percentileRank",
          COUNT("feat_marketRank")        as "feat_marketRank",
          COUNT("feat_stockStyle")        as "feat_stockStyle",
          COUNT("feat_highRiskFlag")      as "feat_highRiskFlag",
          COUNT("feat_rsi14")             as "feat_rsi14",
          COUNT("feat_maTrend")           as "feat_maTrend",
          COUNT("feat_ma20")              as "feat_ma20",
          COUNT("feat_ma60")              as "feat_ma60",
          COUNT("feat_return5d_pre")      as "feat_return5d_pre",
          COUNT("feat_return20d_pre")     as "feat_return20d_pre",
          COUNT("feat_return60d_pre")     as "feat_return60d_pre",
          COUNT("feat_volatility20d")     as "feat_volatility20d",
          COUNT("feat_vix")               as "feat_vix",
          COUNT("feat_usdjpy")            as "feat_usdjpy",
          COUNT("feat_topixReturn5d")     as "feat_topixReturn5d",
          COUNT("feat_topixReturn20d")    as "feat_topixReturn20d",
          COUNT("feat_marketTemperature") as "feat_marketTemperature"
        FROM daily_recommendations
        WHERE date = ${latestRecDate}
      `;
      const row = coverageResult[0];
      if (row) {
        featureTotalRows = Number(row["total"]);
        featureFieldStats = FEAT_FIELDS.map(f => {
          const nn = Number(row[f] ?? 0);
          return {
            field: f,
            nonNullCount: nn,
            coveragePct: featureTotalRows > 0 ? Math.round(nn / featureTotalRows * 100) : 0,
          };
        });
        const totalNonNull = featureFieldStats.reduce((s, f) => s + f.nonNullCount, 0);
        overallCoveragePct = featureTotalRows > 0
          ? Math.round(totalNonNull / (featureTotalRows * FEAT_FIELDS.length) * 100)
          : 0;
      }
    }

    const topMissing = featureFieldStats
      .filter(f => f.coveragePct < 100)
      .sort((a, b) => a.coveragePct - b.coveragePct)
      .slice(0, 5)
      .map(f => `${f.field} (${f.coveragePct}%)`);

    // ── Health guard report ─────────────────────────────────────────────────
    let healthGuardStatus = "NEVER_RUN";
    let healthGuardCritical: number | null = null;
    let healthGuardWarning: number | null = null;
    let healthGuardAge: number | null = null;
    try {
      const reportDir = path.join(process.cwd(), "reports");
      if (fs.existsSync(reportDir)) {
        const files = fs.readdirSync(reportDir)
          .filter(f => f.startsWith("data-health-guard-") && f.endsWith(".json"))
          .sort().reverse();
        if (files.length) {
          const report = JSON.parse(fs.readFileSync(path.join(reportDir, files[0]), "utf-8"));
          healthGuardStatus = report.status ?? "UNKNOWN";
          healthGuardCritical = report.criticalCount ?? null;
          healthGuardWarning = report.warningCount ?? null;
          healthGuardAge = Math.round((Date.now() - new Date(report.auditAt).getTime()) / 3_600_000);
        }
      }
    } catch {}

    // ── Pipeline log ────────────────────────────────────────────────────────
    const allRuns = readPipelineRuns();
    const dryRunCount = allRuns.filter(r => r.runType === "dry-run").length;
    const productionRuns = allRuns.filter(r => !r.runType || r.runType === "production");

    // Health score only counts production runs; display respects includeDryRun param
    const runsForDisplay = includeDryRun ? allRuns : productionRuns;
    const latestPerStage = getLatestPerStage(runsForDisplay);
    const latestProdPerStage = getLatestPerStage(productionRuns);

    const pipelineStages = PIPELINE_STAGES.map(({ stage, displayName, schedule }) => {
      const latest = latestPerStage.get(stage) ?? null;
      const latestProd = latestProdPerStage.get(stage) ?? null;
      const status: StageStatus = latest ? latest.status : "NEVER_RUN";
      return {
        stage,
        displayName,
        schedule,
        status,
        isDryRun: latest ? (latest.runType === "dry-run") : false,
        duration: latest ? fmtDuration(latest.durationMs) : null,
        durationMs: latest?.durationMs ?? null,
        lastRunAt: latest?.finishedAt ?? null,
        lastRunJst: latest
          ? new Date(new Date(latest.finishedAt).getTime() + 9 * 3600_000)
              .toISOString().slice(0, 16).replace("T", " ") + " JST"
          : null,
        errorMessage: latest?.errorMessage ?? null,
        // production-only fields for health scoring
        prodStatus: latestProd ? latestProd.status : "NEVER_RUN" as StageStatus,
        prodLastRunAt: latestProd?.finishedAt ?? null,
      };
    });

    // ── Data Freshness ──────────────────────────────────────────────────────
    function freshnessStatus(days: number | null): "FRESH" | "STALE" | "CRITICAL" {
      if (days === null) return "CRITICAL";
      if (days <= 1) return "FRESH";
      if (days <= 4) return "STALE";
      return "CRITICAL";
    }

    const latestRecDateStr = latestRecDate ? latestRecDate.toISOString().slice(0, 10) : null;
    const latestGmDateStr  = latestGm?.date ? latestGm.date.toISOString().slice(0, 10) : null;
    const latestPriceDateStr  = latestPrice?.date ? latestPrice.date.toISOString().slice(0, 10) : null;
    const latestScoreDateStr  = latestScore?.computedAt ? latestScore.computedAt.toISOString().slice(0, 10) : null;
    const latestNewsDateStr   = latestNews?.publishedAt ? latestNews.publishedAt.toISOString().slice(0, 10) : null;
    const latestBacktestDateStr = latestBacktest?.computedAt ? latestBacktest.computedAt.toISOString().slice(0, 10) : null;

    const freshnessData = [
      { name: "DailyPrice",         latestDate: latestPriceDateStr,   days: daysAgo(latestPriceDateStr, today) },
      { name: "StockScore",         latestDate: latestScoreDateStr,   days: daysAgo(latestScoreDateStr, today) },
      { name: "DailyRecommendation",latestDate: latestRecDateStr,     days: daysAgo(latestRecDateStr, today) },
      { name: "GlobalMarket",       latestDate: latestGmDateStr,      days: daysAgo(latestGmDateStr, today) },
      { name: "News",               latestDate: latestNewsDateStr,    days: daysAgo(latestNewsDateStr, today) },
      { name: "Backtest",           latestDate: latestBacktestDateStr,days: daysAgo(latestBacktestDateStr, today) },
    ].map(s => ({ ...s, status: freshnessStatus(s.days) }));

    // ── Version Status ──────────────────────────────────────────────────────
    const versionStatus = {
      schemaVersion:     latestDR?.schemaVersion     ?? activeVersion?.schemaVersion ?? null,
      modelVersion:      latestDR?.modelVersion      ?? activeVersion?.modelVersion  ?? null,
      scoreVersion:      latestDR?.scoreVersion      ?? activeVersion?.scoreVersion  ?? null,
      versionSnapshotId: latestDR?.versionSnapshotId ?? activeVersion?.id           ?? null,
      pipelineRunId:     latestDR?.pipelineRunId     ?? null,
      activeExperiment:  activeExperiment
        ? `${activeExperiment.id}: ${activeExperiment.hypothesis.slice(0, 60)}`
        : null,
    };

    // ── Backtest Summary ────────────────────────────────────────────────────
    const HORIZON_ORDER = ["1d", "3d", "7d", "30d", "90d"];
    const backtestSummary = HORIZON_ORDER.map(h => {
      const row = backtestRows.find(r => r.horizon === h);
      if (!row) return { horizon: h, winRate: null, avgReturn: null, alpha: null, sampleCount: 0, filledCount: 0 };
      const filled = Number(row.filledCount);
      const wins   = Number(row.winCount);
      return {
        horizon: h,
        sampleCount: Number(row.sampleCount),
        filledCount: filled,
        winRate:     filled > 0 ? Math.round(wins / filled * 1000) / 10 : null,
        avgReturn:   row.avgReturn != null ? Math.round(Number(row.avgReturn) * 100) / 100 : null,
        alpha:       row.avgAlpha  != null ? Math.round(Number(row.avgAlpha)  * 100) / 100 : null,
      };
    });

    // ── Health Score (0–100) ────────────────────────────────────────────────
    // Data Freshness: 0–25 pts (each source 0–4 pts, 6 sources → 0–24; + 1 bonus if all fresh)
    const freshnessScore = (() => {
      let pts = 0;
      for (const s of freshnessData) {
        if (s.days === 0 || s.days === 1) pts += 4;
        else if (s.days !== null && s.days <= 4) pts += 2;
        else if (s.days !== null && s.days <= 7) pts += 1;
      }
      const max = 6 * 4;
      return Math.round(pts / max * 25);
    })();

    // Pipeline: 0–25 pts — counts ONLY production runs (dry-run excluded from health score)
    const pipelineScore = (() => {
      let pts = 0;
      const now = Date.now();
      for (const s of pipelineStages) {
        if (s.prodStatus === "SUCCESS" && s.prodLastRunAt) {
          const ageH = (now - new Date(s.prodLastRunAt).getTime()) / 3_600_000;
          pts += ageH <= 36 ? 3 : 1;
        }
      }
      const max = 8 * 3;
      return Math.round(pts / max * 25);
    })();

    // Feature Coverage: 0–25 pts
    const featureScore = Math.round(overallCoveragePct / 100 * 25);

    // Health Guard: 0–25 pts
    const healthGuardScore = (() => {
      if (healthGuardStatus === "NEVER_RUN") return 0;
      if (healthGuardCritical === null) return 5;
      if (healthGuardCritical > 0) return 0;
      if (healthGuardWarning === 0) return 25;
      return 20;
    })();

    const totalScore = Math.min(100, freshnessScore + pipelineScore + featureScore + healthGuardScore);
    const grade: "GREEN" | "YELLOW" | "RED" = totalScore >= 75 ? "GREEN" : totalScore >= 50 ? "YELLOW" : "RED";

    // ── Response ────────────────────────────────────────────────────────────
    return NextResponse.json({
      pipeline: {
        stages: pipelineStages,
        totalRuns: allRuns.length,
        productionRuns: productionRuns.length,
        dryRunCount,
        includeDryRun,
      },
      freshness: {
        sources: freshnessData,
        latestRecCount,
      },
      featureCoverage: {
        totalRows: featureTotalRows,
        latestDate: latestRecDateStr,
        overallCoveragePct,
        fields: featureFieldStats,
        topMissing,
      },
      version: versionStatus,
      backtest: {
        horizons: backtestSummary,
        lastComputedAt: latestBacktestDateStr,
      },
      healthScore: {
        score: totalScore,
        grade,
        components: {
          dataFreshness:   freshnessScore,
          pipelineStatus:  pipelineScore,
          featureCoverage: featureScore,
          healthGuard:     healthGuardScore,
        },
        detail: {
          healthGuardStatus,
          healthGuardCritical,
          healthGuardWarning,
          healthGuardAgeHours: healthGuardAge,
        },
      },
      computedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[mission-control]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
