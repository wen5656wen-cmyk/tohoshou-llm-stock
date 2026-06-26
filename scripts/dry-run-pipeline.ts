#!/usr/bin/env npx tsx
/**
 * dry-run-pipeline.ts — Pipeline dry-run validator
 *
 * Writes pipeline log entries for all 10 main stages with runType="dry-run".
 * Safe read-only stages are actually executed; write-heavy stages get synthetic
 * SUCCESS entries with realistic durations.
 *
 * Purpose: verify Mission Control pipeline display without waiting for real cron.
 * Safety:  NEVER writes to DailyRecommendation / StockScore / BacktestPositionResult.
 *
 * Usage:
 *   npx tsx scripts/dry-run-pipeline.ts
 *   npm run pipeline:dry-run    (after adding script to package.json)
 */

import "dotenv/config";
import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const LOG_DIR      = join(process.cwd(), "logs");
const PIPELINE_LOG = join(LOG_DIR, "pipeline-runs.jsonl");

try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const RUN_DATE      = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const RUN_TS        = Date.now().toString().slice(-6);
const pipelineRunId = `dry-run-${RUN_DATE}-${RUN_TS}`;

function writeEntry(
  stage: string,
  startedAt: Date,
  finishedAt: Date,
  status: "SUCCESS" | "FAILED",
  errorMessage: string | null,
) {
  appendFileSync(PIPELINE_LOG, JSON.stringify({
    stage,
    startedAt:    startedAt.toISOString(),
    finishedAt:   finishedAt.toISOString(),
    durationMs:   finishedAt.getTime() - startedAt.getTime(),
    status,
    exitCode:     status === "SUCCESS" ? 0 : 1,
    errorMessage,
    runType:      "dry-run",
    pipelineRunId,
  }) + "\n", "utf-8");
}

function syntheticSuccess(stage: string, durationMs: number, note: string): boolean {
  const t = new Date();
  const f = new Date(t.getTime() + durationMs);
  writeEntry(stage, t, f, "SUCCESS", null);
  console.log(`  ✅ [SYNTHETIC] ${stage} — ${note} (+${(durationMs / 1000).toFixed(1)}s sim)`);
  return true;
}

function runReal(stage: string, script: string, args = ""): boolean {
  console.log(`  ▶  [REAL     ] ${stage} — running ${script} ${args}`);
  const startedAt = new Date();
  let status: "SUCCESS" | "FAILED" = "SUCCESS";
  let errorMessage: string | null = null;
  try {
    execSync(`npx tsx ${join(process.cwd(), "scripts", script)} ${args}`, {
      stdio: "inherit",
      env:   { ...process.env, TZ: "Asia/Tokyo" },
      timeout: 5 * 60 * 1000,
    });
  } catch (e) {
    status       = "FAILED";
    errorMessage = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    console.log(`  ❌ ${stage}: ${errorMessage}`);
  }
  const finishedAt = new Date();
  writeEntry(stage, startedAt, finishedAt, status, errorMessage);
  console.log(`  ${status === "SUCCESS" ? "✅" : "❌"} [REAL     ] ${stage} — ${status} (${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)}s)`);
  return status === "SUCCESS";
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("");
console.log("══════════════════════════════════════════════════════════");
console.log("  TOHOSHOU DRY-RUN PIPELINE VALIDATOR");
console.log(`  pipelineRunId : ${pipelineRunId}`);
console.log(`  logFile       : ${PIPELINE_LOG}`);
console.log(`  logExists     : ${existsSync(PIPELINE_LOG)}`);
console.log("══════════════════════════════════════════════════════════");
console.log("");

// Stage 1: fetch-global-market — writes GlobalMarket table → synthetic
syntheticSuccess("fetch-global-market", 1_300, "skip: would write GlobalMarket table");

// Stage 2: sync-all-prices — takes ~90min on production → synthetic
syntheticSuccess("sync-all-prices", 312_000, "skip: ~90min real run, 3700 stocks");

// Stage 3: sync-news — external HTTP scraping → synthetic
syntheticSuccess("sync-news", 45_000, "skip: external HTTP scraping");

// Stage 4: compute-scores — writes StockScore table → synthetic
syntheticSuccess("compute-scores", 47_000, "skip: writes StockScore (3700 stocks)");

// Stage 5: rerank-top500 — writes DailyRecommendation → synthetic (most critical to skip)
syntheticSuccess("rerank-top500", 9_200_000, "skip: writes DailyRecommendation (protected)");

// Stage 6: create-portfolio-snapshot — writes PortfolioSnapshot → synthetic
syntheticSuccess("create-portfolio-snapshot", 3_800, "skip: writes PortfolioSnapshot");

// Stage 7: update-ai-signal-stats — has --dry-run mode → run real
runReal("update-ai-signal-stats", "update-ai-signal-stats.ts", "--dry-run");

// Stage 8: update-backtest — writes BacktestPositionResult → synthetic
syntheticSuccess("update-backtest", 8_400, "skip: writes BacktestPositionResult");

// Stage 9: generate-learning-report — has --dry-run mode (reads DB, outputs JSON, no writes) → run real
runReal("generate-learning-report", "generate-learning-report.ts", "--dry-run");

// Stage 10: data-health-guard — purely read-only → run real
runReal("data-health-guard", "data-health-guard.ts");

console.log("");
console.log("══════════════════════════════════════════════════════════");
console.log("  DRY-RUN COMPLETE");
console.log(`  All 10 stages logged to: ${PIPELINE_LOG}`);
console.log(`  pipelineRunId: ${pipelineRunId}`);
console.log("  Next: check /admin/mission-control → Pipeline Status");
console.log("        Enable 'Show Dry-Run' toggle to see entries");
console.log("══════════════════════════════════════════════════════════");
console.log("");
