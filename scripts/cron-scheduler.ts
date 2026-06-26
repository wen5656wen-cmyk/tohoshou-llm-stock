#!/usr/bin/env npx tsx
/**
 * TOHOSHOU AI 定时任务调度器
 *
 * 东京时间（Asia/Tokyo）：
 *   05:30  グローバル市場データ取得
 *   06:00  株価同期
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
 */

import "dotenv/config";
import cron from "node-cron";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

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
}) {
  try {
    appendFileSync(PIPELINE_LOG, JSON.stringify({
      stage:        entry.stage,
      startedAt:    entry.startedAt.toISOString(),
      finishedAt:   entry.finishedAt.toISOString(),
      durationMs:   entry.durationMs,
      status:       entry.status,
      exitCode:     entry.exitCode,
      errorMessage: entry.errorMessage,
    }) + "\n", "utf-8");
  } catch {}
}

function run(script: string, label: string, timeoutMs: number = 10 * 60 * 1000) {
  log("INFO", `▶ 开始 ${label}`);
  const startedAt = new Date();
  const stage = script.replace(/\.ts$/, "");
  let exitCode = 0;
  let errorMessage: string | null = null;
  try {
    execSync(`npx tsx ${join(process.cwd(), "scripts", script)}`, {
      stdio: "inherit",
      env: { ...process.env, TZ: "Asia/Tokyo" },
      timeout: timeoutMs,
    });
    log("INFO", `✅ 完成 ${label}`);
  } catch (err) {
    exitCode = 1;
    errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    log("ERROR", `❌ 失败 ${label}：${errorMessage}`);
  }
  const finishedAt = new Date();
  writePipelineLog({
    stage, startedAt, finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status: exitCode === 0 ? "SUCCESS" : "FAILED",
    exitCode, errorMessage,
  });
}

log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
log("INFO", "TOHOSHOU AI 調度器启动");
log("INFO", `AI Key：${(process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY) ? "✅ 已配置" : "⚠️  未配置"}`);
log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// ── 毎週金曜 16:30 JST — J-Quants 機構資金流向 週次同期 ─────────────────────
cron.schedule("30 16 * * 5", () => {
  log("INFO", "⏰ 金曜 16:30 触发：J-Quants 機構資金流向同期");
  run("fetch-jquants-investor-types.ts", "J-Quants 機構資金流向");
}, { timezone: "Asia/Tokyo" });

// ── 月曜 07:15 JST — 週初バックアップ取得 ───────────────────────────────────
cron.schedule("15 7 * * 1", () => {
  log("INFO", "⏰ 月曜 07:15 触发：J-Quants 機構資金流向（週初バックアップ）");
  run("fetch-jquants-investor-types.ts", "J-Quants 機構資金流向（バックアップ）");
}, { timezone: "Asia/Tokyo" });

// ── 05:30 JST — グローバル市場データ取得 ────────────────────────────────────
cron.schedule("30 5 * * *", () => {
  log("INFO", "⏰ 05:30 触发：グローバル市場取得");
  run("fetch-global-market.ts", "グローバル市場取得");
}, { timezone: "Asia/Tokyo" });

// ── 06:00 JST — 株価同期 ──────────────────────────────────────────────────────
cron.schedule("0 6 * * *", () => {
  log("INFO", "⏰ 06:00 触发：株価同期");
  run("sync-all-prices.ts", "株価同期", 2 * 60 * 60 * 1000); // 2h: 3700 stocks × 250ms ≈ 15min, safe margin
}, { timezone: "Asia/Tokyo" });

// ── 07:00 / 12:00 / 18:00 / 22:00 JST — ニュース取得 ────────────────────────
// P1 fix: call scripts/sync-news.ts directly as a child process instead of HTTP POST.
// This means pm2 restart of tohoshou-web cannot kill the sync — it runs in its own process.
function runNewsSync(label: string) {
  log("INFO", `⏰ ${label} 触发：ニュース取得 (worker mode)`);
  const startedAt = new Date();
  let exitCode = 0;
  let errorMessage: string | null = null;
  try {
    execSync(
      `npx tsx ${join(process.cwd(), "scripts", "sync-news.ts")}`,
      {
        stdio: "inherit",
        env: { ...process.env, TZ: "Asia/Tokyo" },
        timeout: 30 * 60 * 1000, // 30 min — 200 stocks × 800ms ≈ 2.7 min, generous margin
      }
    );
    log("INFO", `✅ 完成 ${label} ニュース取得`);
  } catch (err) {
    exitCode = 1;
    errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    log("ERROR", `❌ 失败 ${label} ニュース取得：${errorMessage}`);
  }
  const finishedAt = new Date();
  writePipelineLog({
    stage: "sync-news", startedAt, finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status: exitCode === 0 ? "SUCCESS" : "FAILED",
    exitCode, errorMessage,
  });
}

cron.schedule("0 7  * * *", () => runNewsSync("07:00"), { timezone: "Asia/Tokyo" });
cron.schedule("0 12 * * *", () => runNewsSync("12:00"), { timezone: "Asia/Tokyo" });
cron.schedule("0 18 * * *", () => runNewsSync("18:00"), { timezone: "Asia/Tokyo" });
cron.schedule("0 22 * * *", () => runNewsSync("22:00"), { timezone: "Asia/Tokyo" });

// ── 07:00 JST — TDnet 当日开示数据同步（工作日）────────────────────────────
cron.schedule("0 7 * * 1-5", () => {
  log("INFO", "⏰ 07:00 触发：TDnet 真実開示同期");
  run("fetch-tdnet.ts", "TDnet 開示同步");
}, { timezone: "Asia/Tokyo" });

// ── 07:30 JST — AI 評分計算 → rerank Top500 → snapshot → signal stats → 健全性チェック ──
cron.schedule("30 7 * * *", () => {
  log("INFO", "⏰ 07:30 触发：AI 評分計算");
  run("compute-scores.ts", "AI 評分計算", 90 * 60 * 1000);         // 90min
  log("INFO", "▶ 評分後 rerank Top500 → DailyRecommendation snapshot");
  run("rerank-top500.ts", "GPT Rerank Top500", 5 * 60 * 60 * 1000); // 5h: ~2.5h actual
  log("INFO", "▶ rerank 後 AI 組合スナップショット生成");
  run("create-portfolio-snapshot.ts", "AI 組合スナップショット生成");
  log("INFO", "▶ スナップショット後 AI シグナル統計更新");
  run("update-ai-signal-stats.ts", "AI シグナル統計更新");
  log("INFO", "▶ シグナル統計後バックテスト更新 (v2.3: 9 horizons → BacktestPositionResult)");
  run("update-backtest.ts", "バックテスト更新", 20 * 60 * 1000);   // 20min max
  log("INFO", "▶ バックテスト後 Learning Engine レポート生成");
  run("generate-learning-report.ts", "Learning Engine レポート生成");
  log("INFO", "▶ Learning レポート後データ健全性チェック");
  run("data-health-guard.ts", "データ健全性チェック");
}, { timezone: "Asia/Tokyo" });

// ── 18:30 JST — JPX 空売り比率取得（工作日）────────────────────────────────
cron.schedule("30 18 * * 1-5", () => {
  log("INFO", "⏰ 18:30 触发：JPX 空売り比率取得");
  run("fetch-short-selling-ratio.ts", "JPX 空売り比率取得");
}, { timezone: "Asia/Tokyo" });

// ── 22:00 JST — 日終メタ同期 ─────────────────────────────────────────────────
cron.schedule("0 22 * * *", () => {
  log("INFO", "⏰ 22:00 触发：日終メタ同期");
  run("sync-stock-meta.ts", "日終メタ同期");
}, { timezone: "Asia/Tokyo" });

// ── 22:30 JST — 配当历史同步 ─────────────────────────────────────────────────
cron.schedule("30 22 * * *", () => {
  log("INFO", "⏰ 22:30 触发：配当历史同步");
  run("fetch-dividend-history.ts", "配当历史同步");
}, { timezone: "Asia/Tokyo" });

log("INFO", "調度器起動完了");
log("INFO", "スケジュール：金曜16:30 機構資金(J-Quants) / 月曜07:15 バックアップ");
log("INFO", "           05:30 市場 / 06:00 価格 / 07:00·12·18·22 ニュース");
log("INFO", "           07:30 AI評分+rerank+健全性 / 18:30 空売り比率 / 22:00 複盤 / 22:30 配当");
