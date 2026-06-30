#!/usr/bin/env npx tsx
/**
 * TOHOSHOU AI 定时任务调度器
 *
 * 东京时间（Asia/Tokyo）：
 *   05:30  グローバル市場データ取得
 *   06:00  株価同期（子进程，不阻塞事件循环）
 *   07:00 / 12:00 / 18:00 / 22:00  新聞取得
 *   07:00  TDnet 開示同期（工作日）
 *   07:30  AI 評分計算 + データ健全性チェック
 *   18:30  JPX 空売り比率取得（工作日）
 *   22:00  日終メタ同期
 *   22:30  配当历史同步
 *   金曜 16:30  J-Quants 機構資金流向
 *   月曜 07:15  J-Quants 機構資金流向（バックアップ）
 *
 * 启动：npm run cron
 * 生产：pm2 start ecosystem.config.js --only tohoshou-cron
 *
 * P1-Cron 修复（v17.2.0）：
 *   sync-all-prices 改用 spawn() 在子进程执行，不再阻塞主进程事件循环。
 *   07:30 pipeline 先 await syncPricesPromise，确保价格同步完成后再计算评分。
 *   所有 cron callback 改为 async + await runAsync()，事件循环永远不被占用。
 */

import "dotenv/config";
import cron from "node-cron";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "cron-scheduler.log");
const PIPELINE_LOG = join(LOG_DIR, "pipeline-runs.jsonl");
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function log(level: "INFO" | "ERROR" | "WARN", msg: string) {
  const ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" });
  const line = `[${ts} JST] [${level}] ${msg}`;
  appendFileSync(LOG_FILE, line + "\n", "utf-8");
  console.log(line);
}

type PipelineStatus = "SUCCESS" | "FAILED";

function writePipelineLog(entry: {
  stage: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  status: PipelineStatus;
  exitCode: number;
  errorMessage: string | null;
  runType?: "production" | "dry-run";
  pipelineRunId?: string;
}) {
  try {
    const obj: Record<string, unknown> = {
      stage:        entry.stage,
      startedAt:    entry.startedAt.toISOString(),
      finishedAt:   entry.finishedAt.toISOString(),
      durationMs:   entry.durationMs,
      status:       entry.status,
      exitCode:     entry.exitCode,
      errorMessage: entry.errorMessage,
    };
    if (entry.runType)       obj.runType       = entry.runType;
    if (entry.pipelineRunId) obj.pipelineRunId = entry.pipelineRunId;
    appendFileSync(PIPELINE_LOG, JSON.stringify(obj) + "\n", "utf-8");
  } catch {}
}

/**
 * 以子进程运行脚本，不阻塞事件循环。
 * 返回 Promise，resolve 时脚本已退出（成功或失败均 resolve，不 reject）。
 */
function runAsync(script: string, label: string, timeoutMs = 10 * 60 * 1000): Promise<void> {
  return new Promise<void>((resolve) => {
    log("INFO", `▶ 开始 ${label}`);
    const startedAt = new Date();
    const stage = script.replace(/\.ts$/, "");

    const child = spawn(
      "npx",
      ["tsx", join(process.cwd(), "scripts", script)],
      { stdio: "inherit", env: { ...process.env, TZ: "Asia/Tokyo" } },
    );

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      log("ERROR", `⏱ 超时 ${label}（${Math.round(timeoutMs / 60000)}min）`);
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      const errorMessage = err.message;
      log("ERROR", `❌ spawn 错误 ${label}：${errorMessage}`);
      const finishedAt = new Date();
      writePipelineLog({
        stage, startedAt, finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        status: "FAILED", exitCode: 1, errorMessage,
      });
      resolve();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const exitCode = code ?? 1;
      const success = exitCode === 0 && !timedOut;
      const errorMessage = timedOut
        ? `Timeout after ${timeoutMs}ms`
        : exitCode !== 0 ? `Exit code ${exitCode}` : null;

      if (success) {
        log("INFO", `✅ 完成 ${label}`);
      } else {
        log("ERROR", `❌ 失败 ${label}：${errorMessage}`);
      }
      const finishedAt = new Date();
      writePipelineLog({
        stage, startedAt, finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        status: success ? "SUCCESS" : "FAILED",
        exitCode, errorMessage,
      });
      resolve();
    });
  });
}

// 跨 cron slot 的价格同步 Promise（06:00 写入，07:30 await）
let syncPricesPromise: Promise<void> | null = null;

log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
log("INFO", "TOHOSHOU AI 調度器启动（v17.3.0 — 並行価格同期 + 自動後続流水線）");
log("INFO", `AI Key：${(process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY) ? "✅ 已配置" : "⚠️  未配置"}`);
log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// ── 00:00 JST — 日次リセット ─────────────────────────────────────────────────
// 每天重置 syncPricesPromise，确保 07:30 等待的是当日的同步任务。
cron.schedule("0 0 * * *", () => {
  syncPricesPromise = null;
  log("INFO", "🔄 00:00 日次リセット：syncPricesPromise cleared");
}, { timezone: "Asia/Tokyo" });

// ── 毎週金曜 16:30 JST — J-Quants 機構資金流向 週次同期 ─────────────────────
cron.schedule("30 16 * * 5", async () => {
  log("INFO", "⏰ 金曜 16:30 触发：J-Quants 機構資金流向同期");
  await runAsync("fetch-jquants-investor-types.ts", "J-Quants 機構資金流向");
}, { timezone: "Asia/Tokyo" });

// ── 月曜 07:15 JST — 週初バックアップ取得 ───────────────────────────────────
cron.schedule("15 7 * * 1", async () => {
  log("INFO", "⏰ 月曜 07:15 触发：J-Quants 機構資金流向（週初バックアップ）");
  await runAsync("fetch-jquants-investor-types.ts", "J-Quants 機構資金流向（バックアップ）");
}, { timezone: "Asia/Tokyo" });

// ── 05:30 JST — グローバル市場データ取得 ────────────────────────────────────
cron.schedule("30 5 * * *", async () => {
  log("INFO", "⏰ 05:30 触发：グローバル市場取得");
  await runAsync("fetch-global-market.ts", "グローバル市場取得");
}, { timezone: "Asia/Tokyo" });

// ── 06:00 JST — 株価同期（fire-and-forget，子进程，不阻塞事件循环）──────────
//
// 关键修复（P1-Cron）：
//   旧实现用 execSync，会独占 Node.js 事件循环约 1.5h，导致 07:00/07:30 cron slot
//   无法触发（node-cron 内部 setInterval 被阻塞，打印 "missed execution"）。
//   新实现用 spawn()：子进程独立运行，主进程事件循环始终保持响应。
//   Promise 存入 syncPricesPromise，07:30 slot await 它后再启动评分流水线。
//
cron.schedule("0 6 * * *", () => {
  log("INFO", "⏰ 06:00 触发：株価同期（子进程，不阻塞事件循环）");
  syncPricesPromise = runAsync(
    "sync-all-prices.ts",
    "株価同期",
    2 * 60 * 60 * 1000, // 2h — 3700 stocks × 250ms ≈ 15min, 含充裕余量
  );
  // 不 await — 立即返回，事件循环保持空闲
}, { timezone: "Asia/Tokyo" });

// ── 07:00 / 12:00 / 18:00 / 22:00 JST — ニュース取得 ────────────────────────
cron.schedule("0 7  * * *", async () => {
  log("INFO", "⏰ 07:00 触发：ニュース取得");
  await runAsync("sync-news.ts", "ニュース取得", 30 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

cron.schedule("0 12 * * *", async () => {
  log("INFO", "⏰ 12:00 触发：ニュース取得");
  await runAsync("sync-news.ts", "ニュース取得", 30 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

cron.schedule("0 18 * * *", async () => {
  log("INFO", "⏰ 18:00 触发：ニュース取得");
  await runAsync("sync-news.ts", "ニュース取得", 30 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

cron.schedule("0 22 * * *", async () => {
  log("INFO", "⏰ 22:00 触发：ニュース取得");
  await runAsync("sync-news.ts", "ニュース取得", 30 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 07:00 JST — TDnet 当日开示数据同步（工作日）────────────────────────────
cron.schedule("0 7 * * 1-5", async () => {
  log("INFO", "⏰ 07:00 触发：TDnet 真実開示同期");
  await runAsync("fetch-tdnet.ts", "TDnet 開示同步");
}, { timezone: "Asia/Tokyo" });

// ── 07:30 JST — watchdog：sync-all-prices（Phase1+Phase2）の完了を確認 ──────
//
// v17.3.0 以降、sync-all-prices.ts は価格同期（Phase1）の後に
// compute-scores → rerank → portfolio → learning → health を自動実行（Phase2）。
// 07:30 slot はその完了を監視するだけ。
//
// fallback：cron が 06:00〜07:30 の間に再起動された場合、
//           syncPricesPromise が null になるので手動で流水線を実行する。
//
cron.schedule("30 7 * * *", async () => {
  if (syncPricesPromise) {
    log("INFO", "⏰ 07:30 watchdog：sync-all-prices 全工程（価格+評分）完了待機中...");
    await syncPricesPromise;
    log("INFO", "✅ 07:30 確認：全日流水線完了（価格同期 → 評分 → 健全性まで）");
  } else {
    // cron が 06:00 以降に再起動された場合の緊急 fallback
    log("WARN", "⚠️ 07:30 fallback：syncPricesPromise 未設置（cron 再起動？）→ 降級流水線起動");
    await runAsync("compute-scores.ts",           "AI 評分計算 [fallback]",               90 * 60 * 1000);
    await runAsync("rerank-top500.ts",            "GPT Rerank Top500 [fallback]",          5 * 60 * 60 * 1000);
    await runAsync("create-portfolio-snapshot.ts","AI 組合スナップショット生成 [fallback]");
    await runAsync("update-ai-signal-stats.ts",   "AI シグナル統計更新 [fallback]");
    await runAsync("update-backtest.ts",          "バックテスト更新 [fallback]",           20 * 60 * 1000);
    await runAsync("generate-learning-report.ts", "Learning Engine レポート生成 [fallback]");
    await runAsync("data-health-guard.ts",        "データ健全性チェック [fallback]");
  }
  // Phase 3: generate StrategyRecommendation after pipeline completes
  // Runs after rerank-top500 so StockScore and DailyRecommendation are both fresh
  await runAsync("generate-strategy-recommendations.ts", "Strategy Recommendation Engine", 15 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 16:30 JST — Day Trade Strategy Engine（工作日，收盘结算后）──────────────
//
// 时间选择：日本市场 15:30 收盘，J-Quants 收盘价通常 16:00 前可用。
// day-strategy.ts 自动处理最新有价格的交易日，失败不影响其他流水线。
//
cron.schedule("30 16 * * 1-5", async () => {
  log("INFO", "⏰ 16:30 触发：Day Trade Strategy Engine");
  await runAsync("day-strategy.ts", "Day Trade Strategy", 10 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 16:35 JST — Swing Trade Strategy Engine（工作日，Day 结束后）────────────
//
// Swing runs 5 minutes after Day to avoid race conditions on shared DB tables.
// Failure is isolated — does not affect Day or other pipeline stages.
//
cron.schedule("35 16 * * 1-5", async () => {
  log("INFO", "⏰ 16:35 触发：Swing Trade Strategy Engine");
  await runAsync("swing-strategy.ts", "Swing Trade Strategy", 10 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 16:40 JST — Long Trade Strategy Engine（工作日，Swing 结束后）────────────
//
// Long runs 5 minutes after Swing. Failure is isolated.
//
cron.schedule("40 16 * * 1-5", async () => {
  log("INFO", "⏰ 16:40 触发：Long Trade Strategy Engine");
  await runAsync("long-strategy.ts", "Long Trade Strategy", 10 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 16:45 JST — Strategy Backtest Engine（工作日，Long 结束后）──────────────
//
// Reads StrategyTradeResult for all three strategies and computes rolling
// performance statistics (win rate, alpha, Sharpe, drawdown) per horizon.
// Writes to StrategyBacktestSummary. Runs after Long so all closed trades
// for today are already settled before the summary is computed.
//
cron.schedule("45 16 * * 1-5", async () => {
  log("INFO", "⏰ 16:45 触发：Strategy Backtest Engine");
  await runAsync("strategy-backtest.ts", "Strategy Backtest Engine", 10 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 17:00 JST — Strategy Learning Engine（工作日，Backtest 结束后）───────────
//
// Reads StrategyBacktestSummary for all three strategies, computes
// predictionScore / stabilityScore / confidenceScore / integrityScore,
// generates Learning Grade (A+/A/B/C/D) and Recommendation (READY/PARTIAL/NOT_READY),
// upserts to StrategyLearningReport + StrategyLearningSummary.
//
cron.schedule("0 17 * * 1-5", async () => {
  log("INFO", "⏰ 17:00 触发：Strategy Learning Engine");
  await runAsync("strategy-learning.ts", "Strategy Learning Engine", 10 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 17:15 JST — Strategy Daily Validation（工作日，Learning 结束后）────────
//
// T1 Stabilization: runs after Learning (17:00) to validate all 9 checks,
// record cumulative stats, emit Incident Report on failure, and evaluate
// Phase 7 readiness conditions. Retains last 30 trading days (~45 calendar days).
//
cron.schedule("15 17 * * 1-5", async () => {
  log("INFO", "⏰ 17:15 触发：Strategy Daily Validation");
  await runAsync("strategy-daily-validation.ts", "Strategy Daily Validation", 5 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 土曜 17:30 JST — Weekly Strategy Report（T2 P1）─────────────────────────
//
// 毎週土曜日に前週の戦略パフォーマンスレポートを生成。
// Strategy Daily Validation の最終実行（金曜 17:15）後に実行する。
// 生成ファイル: reports/weekly/YYYY-Www.md（13週間保持）
//
cron.schedule("30 17 * * 6", async () => {
  log("INFO", "⏰ 土曜 17:30 触发：Weekly Strategy Report");
  await runAsync("generate-weekly-report.ts", "Weekly Strategy Report", 5 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 月末 18:00 JST — Monthly Strategy Report（T2 P1）────────────────────────
//
// 月末（28〜31日）18:00 JST に起動、スクリプト内部で「今日が月の最終日か」を確認してから実行。
// FORCE=1 環境変数で強制実行可能。
// 生成ファイル: reports/monthly/YYYY-MM.md（12ヶ月間保持）
//
cron.schedule("0 18 28-31 * *", async () => {
  log("INFO", "⏰ 月末チェック 18:00 触发：Monthly Strategy Report");
  await runAsync("generate-monthly-report.ts", "Monthly Strategy Report", 5 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 18:30 JST — JPX 空売り比率取得（工作日）────────────────────────────────
cron.schedule("30 18 * * 1-5", async () => {
  log("INFO", "⏰ 18:30 触发：JPX 空売り比率取得");
  await runAsync("fetch-short-selling-ratio.ts", "JPX 空売り比率取得");
}, { timezone: "Asia/Tokyo" });

// ── 22:00 JST — 日終メタ同期 ─────────────────────────────────────────────────
cron.schedule("0 22 * * *", async () => {
  log("INFO", "⏰ 22:00 触发：日終メタ同期");
  await runAsync("sync-stock-meta.ts", "日終メタ同期");
}, { timezone: "Asia/Tokyo" });

// ── 22:30 JST — 配当历史同步 ─────────────────────────────────────────────────
cron.schedule("30 22 * * *", async () => {
  log("INFO", "⏰ 22:30 触发：配当历史同步");
  await runAsync("fetch-dividend-history.ts", "配当历史同步");
}, { timezone: "Asia/Tokyo" });

log("INFO", "調度器起動完了");
log("INFO", "スケジュール：金曜16:30 機構資金(J-Quants) / 月曜07:15 バックアップ");
log("INFO", "           00:00 リセット / 05:30 市場 / 06:00 価格(並行spawn+流水線) / 07:00·12·18·22 ニュース");
log("INFO", "           07:30 AI評分+rerank+健全性 / 16:30 Day / 16:35 Swing / 16:40 Long / 16:45 Backtest / 17:00 Learning / 17:15 DailyValidation(工作日) / 土17:30 WeeklyReport / 月末18:00 MonthlyReport / 18:30 空売り比率 / 22:00 複盤 / 22:30 配当");
