#!/usr/bin/env npx tsx
/**
 * scripts/daily-ai-pipeline.ts — Daily AI Scoring Pipeline V9 P2
 *
 * Runs at 06:00 JST daily via PM2 cron (tohoshou-ai-daily-pipeline).
 * Lock file prevents concurrent runs.
 *
 * Pipeline order:
 *   1. fetch-global-market   NASDAQ / VIX / USDJPY fresh data
 *   2. sync-all-prices       J-Quants daily OHLCV sync
 *   3. news-sync             Kabutan + TDnet via /api/sync/news
 *   4. fetch-tdnet           TDnet disclosure sync
 *   5. compute-scores        Full-market rule scoring (3700+ stocks)
 *   6. rerank-top500         GPT score Top500 only — 禁止全市场GPT
 *
 * Flags:
 *   --dry-run   Skip all heavy steps; rerank-top500 runs with --dry-run to print Top500
 *
 * Lock: /tmp/daily-ai-pipeline.lock (PID-based, stale lock auto-cleaned)
 */

import "dotenv/config";
import { execSync } from "child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  appendFileSync,
  mkdirSync,
} from "fs";
import { join } from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const LOCK_FILE = "/tmp/daily-ai-pipeline.lock";
const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "daily-ai-pipeline.log");

try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

// ── Lock ──────────────────────────────────────────────────────────────────────

function acquireLock(): boolean {
  if (existsSync(LOCK_FILE)) {
    const raw = readFileSync(LOCK_FILE, "utf-8").trim();
    const pid = parseInt(raw, 10);
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 0); // throws if process doesn't exist
        return false;         // still running
      } catch {
        // stale lock — clean up
      }
    }
    unlinkSync(LOCK_FILE);
  }
  writeFileSync(LOCK_FILE, String(process.pid), "utf-8");
  return true;
}

function releaseLock(): void {
  try {
    if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
  } catch {}
}

// ── Logging ───────────────────────────────────────────────────────────────────

function jst(): string {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" });
}

function log(level: "INFO" | "WARN" | "ERROR", msg: string): void {
  const line = `[${jst()} JST] [${level}] ${msg}`;
  appendFileSync(LOG_FILE, line + "\n", "utf-8");
  console.log(line);
}

// ── Step runner ────────────────────────────────────────────────────────────────

interface StepResult {
  name: string;
  durationMs: number;
  success: boolean;
  skipped?: boolean;
}

function runScript(
  name: string,
  scriptFile: string,
  extraArgs: string[] = [],
  timeoutMs = 15 * 60 * 1000,
): StepResult {
  const scriptPath = join(process.cwd(), "scripts", scriptFile);
  const argStr = extraArgs.length ? " " + extraArgs.join(" ") : "";
  // Use shell `timeout` to kill the entire process group on timeout.
  // -k 15: send SIGKILL if process is still alive 15s after SIGTERM.
  // This prevents orphaned grandchild processes (npx/tsx/node chains).
  const timeoutSec = Math.floor(timeoutMs / 1000);
  const cmd = `timeout -k 15 ${timeoutSec} npx tsx ${scriptPath}${argStr}`;
  const t0 = Date.now();
  log("INFO", `▶  [step:${name}] start`);
  try {
    execSync(cmd, {
      stdio: "inherit",
      env: { ...process.env, TZ: "Asia/Tokyo" },
    });
    const ms = Date.now() - t0;
    log("INFO", `✅ [step:${name}] done (${(ms / 1000).toFixed(1)}s)`);
    return { name, durationMs: ms, success: true };
  } catch (err) {
    const ms = Date.now() - t0;
    log(
      "ERROR",
      `❌ [step:${name}] failed (${(ms / 1000).toFixed(1)}s): ${
        err instanceof Error ? err.message.slice(0, 300) : String(err)
      }`,
    );
    return { name, durationMs: ms, success: false };
  }
}

function runNewsSync(): StepResult {
  const name = "news-sync";
  const APP_URL =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://aitohoshou.com";
  const t0 = Date.now();
  log("INFO", `▶  [step:${name}] start — POST ${APP_URL}/api/sync/news`);
  try {
    execSync(
      // P21-S1：/api/sync/* 已受保护。token 经 header 传入（不进 URL/日志）。
      `curl -sf -X POST "${APP_URL}/api/sync/news" -H "Content-Type: application/json"` +
        (process.env.ADMIN_TOKEN ? ` -H "x-admin-token: ${process.env.ADMIN_TOKEN}"` : ""),
      { stdio: "inherit", timeout: 10 * 60 * 1000 },
    );
    const ms = Date.now() - t0;
    log("INFO", `✅ [step:${name}] done (${(ms / 1000).toFixed(1)}s)`);
    return { name, durationMs: ms, success: true };
  } catch (err) {
    const ms = Date.now() - t0;
    log(
      "ERROR",
      `❌ [step:${name}] failed (${(ms / 1000).toFixed(1)}s): ${
        err instanceof Error ? err.message.slice(0, 300) : String(err)
      }`,
    );
    return { name, durationMs: ms, success: false };
  }
}

function skipStep(name: string): StepResult {
  log("INFO", `⏭  [step:${name}] skipped [DRY_RUN]`);
  return { name, durationMs: 0, success: true, skipped: true };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const pipelineStart = Date.now();

  if (!acquireLock()) {
    log("WARN", "pipeline already running — exit");
    process.exit(0);
  }

  process.on("exit",    releaseLock);
  process.on("SIGINT",  () => { releaseLock(); process.exit(130); });
  process.on("SIGTERM", () => { releaseLock(); process.exit(143); });

  log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("INFO", `TOHOSHOU Daily AI Pipeline — PID=${process.pid}${DRY_RUN ? " [DRY_RUN]" : ""}`);
  log("INFO", `start time: ${jst()} JST`);
  log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const results: StepResult[] = [];

  if (DRY_RUN) {
    // Dry-run: skip all heavy steps, only run rerank --dry-run to preview Top500
    results.push(skipStep("global-market"));
    results.push(skipStep("price-sync"));
    results.push(skipStep("news-sync"));
    results.push(skipStep("tdnet-sync"));
    results.push(skipStep("compute-scores"));
    log("INFO", "[DRY_RUN] running rerank-top500 --dry-run (prints Top500, no GPT)");
    results.push(
      runScript("rerank-top500", "rerank-top500.ts", ["--dry-run"], 5 * 60 * 1000),
    );
    results.push(skipStep("update-backtest"));
  } else {
    // Step 1: global market (NASDAQ / VIX / USDJPY / Nikkei)
    results.push(
      runScript("global-market", "fetch-global-market.ts", [], 5 * 60 * 1000),
    );

    // Step 2: price sync — daily incremental mode (last 7 days only, ~12 min)
    // Full 400-day sync is manual only: npm run sync-prices-recent
    results.push(
      runScript("price-sync", "sync-all-prices.ts", ["--daily"], 25 * 60 * 1000),
    );

    // Step 3: news sync (Kabutan + TDnet via web app API)
    results.push(runNewsSync());

    // Step 4: TDnet disclosures
    results.push(
      runScript("tdnet-sync", "fetch-tdnet.ts", [], 10 * 60 * 1000),
    );

    // Step 5: full-market rule scoring
    // Outputs: totalStocks / scoredStocks / STRONG_BUY / BUY / etc.
    const computeResult = runScript(
      "compute-scores",
      "compute-scores.ts",
      [],
      15 * 60 * 1000,
    );
    results.push(computeResult);

    // Step 6: GPT rerank Top500 — skipped if compute-scores failed
    // Outputs: ruleSelectedCount / gptRerankCount / gptSuccessCount / gptFailCount / finalSavedCount
    // Step 7 (DailyRecommendation snapshot) is embedded inside rerank-top500.ts Step 8.
    if (computeResult.success) {
      // 90-min budget: 500 stocks × ~6s/GPT call + sort + DB writes.
      // All cache misses on first run of the day (compute-scores changes hashes).
      results.push(
        runScript("rerank-top500", "rerank-top500.ts", [], 90 * 60 * 1000),
      );
    } else {
      log(
        "WARN",
        "⚠️  [step:rerank-top500] skipped — compute-scores failed (GPT rerank requires fresh rule scores)",
      );
      results.push({ name: "rerank-top500", durationMs: 0, success: false, skipped: true });
    }

    // Step 8: Fill ALL backtest cohorts (--all ensures new and historical cohorts are always updated)
    results.push(
      runScript("update-backtest", "update-backtest.ts", ["--all"], 10 * 60 * 1000),
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalMs = Date.now() - pipelineStart;
  const okCount   = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("INFO", `end time:       ${jst()} JST`);
  log("INFO", `total duration: ${(totalMs / 1000).toFixed(1)}s`);
  log("INFO", `steps: ${results.length} total  ${okCount} ok  ${failCount} failed`);
  for (const r of results) {
    const icon = r.skipped ? "⏭ " : r.success ? "✅" : "❌";
    const dur  = r.skipped ? "—" : `${(r.durationMs / 1000).toFixed(1)}s`;
    log("INFO", `  ${icon} ${r.name}: ${dur}`);
  }
  log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  releaseLock();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  log("ERROR", `Pipeline fatal: ${err}`);
  releaseLock();
  process.exit(1);
});
