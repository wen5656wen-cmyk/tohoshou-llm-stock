#!/usr/bin/env npx tsx
/**
 * TOHOSHOU AI 定时任务调度器
 *
 * 东京时间（Asia/Tokyo）：
 *   06:00  股票价格同步
 *   07:00  新闻抓取
 *   07:30  AI 评分计算
 *   08:30  LINE AI 日报推送
 *   16:35  LINE 风险预警（工作日）
 *   22:00  日终复盘
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
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function log(level: "INFO" | "ERROR" | "WARN", msg: string) {
  const ts = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" });
  const line = `[${ts} JST] [${level}] ${msg}`;
  appendFileSync(LOG_FILE, line + "\n", "utf-8");
  console.log(line);
}

function run(script: string, label: string) {
  log("INFO", `▶ 开始 ${label}`);
  try {
    execSync(`npx tsx ${join(process.cwd(), "scripts", script)}`, {
      stdio: "inherit",
      env: { ...process.env, TZ: "Asia/Tokyo" },
      timeout: 10 * 60 * 1000, // 10min max
    });
    log("INFO", `✅ 完成 ${label}`);
  } catch (err) {
    log("ERROR", `❌ 失败 ${label}：${err instanceof Error ? err.message : err}`);
  }
}

log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
log("INFO", "TOHOSHOU AI 调度器启动");
log("INFO", `LINE：${process.env.LINE_CHANNEL_ACCESS_TOKEN ? "✅ 已配置" : "❌ 未配置"}`);
log("INFO", `AI Key：${(process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY) ? "✅ 已配置" : "⚠️  未配置（模板回复模式）"}`);
log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

function hasLine(): boolean {
  return !!process.env.LINE_CHANNEL_ACCESS_TOKEN;
}

// ── 05:30 JST — グローバル市場データ取得（AI評分前に必要）────────────────────
cron.schedule("30 5 * * *", () => {
  log("INFO", "⏰ 05:30 触发：グローバル市場取得");
  run("fetch-global-market.ts", "グローバル市場取得");
}, { timezone: "Asia/Tokyo" });

// ── 06:00 JST — 株価同期 ──────────────────────────────────────────────────────
cron.schedule("0 6 * * *", () => {
  log("INFO", "⏰ 06:00 触发：株価同期");
  run("sync-all-prices.ts", "株価同期");
}, { timezone: "Asia/Tokyo" });

// ── 07:00 / 12:00 / 18:00 / 22:00 JST — ニュース取得 ────────────────────────
function runNewsSync(label: string) {
  log("INFO", `⏰ ${label} 触发：ニュース取得`);
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    execSync(`curl -s -X POST "${APP_URL}/api/sync/news" -H "Content-Type: application/json"`, {
      stdio: "inherit",
      timeout: 10 * 60 * 1000,
    });
    log("INFO", `✅ 完成 ${label} ニュース取得`);
  } catch (err) {
    log("ERROR", `❌ 失败 ${label} ニュース取得：${err instanceof Error ? err.message : err}`);
  }
}

cron.schedule("0 7  * * *", () => runNewsSync("07:00"), { timezone: "Asia/Tokyo" });
cron.schedule("0 12 * * *", () => runNewsSync("12:00"), { timezone: "Asia/Tokyo" });
cron.schedule("0 18 * * *", () => runNewsSync("18:00"), { timezone: "Asia/Tokyo" });
cron.schedule("0 22 * * *", () => runNewsSync("22:00"), { timezone: "Asia/Tokyo" });

// ── 07:30 JST — AI 評分計算 ───────────────────────────────────────────────────
cron.schedule("30 7 * * *", () => {
  log("INFO", "⏰ 07:30 触发：AI 評分計算");
  run("compute-scores.ts", "AI 評分計算");
}, { timezone: "Asia/Tokyo" });

// ── 08:00 JST — LINE 朝報（開場前・工作日）────────────────────────────────────
cron.schedule("0 8 * * 1-5", () => {
  log("INFO", "⏰ 08:00 触发：LINE 朝報");
  if (!hasLine()) { log("WARN", "LINE 未配置，スキップ"); return; }
  run("send-morning-brief.ts", "LINE 朝報");
}, { timezone: "Asia/Tokyo" });

// ── 08:30 JST — LINE AI 日報（詳細・毎日）────────────────────────────────────
cron.schedule("30 8 * * *", () => {
  log("INFO", "⏰ 08:30 触发：LINE AI 日報");
  if (!hasLine()) { log("WARN", "LINE 未配置，スキップ"); return; }
  run("send-daily-line.ts", "LINE AI 日報");
}, { timezone: "Asia/Tokyo" });

// ── 12:30 JST — LINE 午間速報（工作日）───────────────────────────────────────
cron.schedule("30 12 * * 1-5", () => {
  log("INFO", "⏰ 12:30 触发：LINE 午間速報");
  if (!hasLine()) { log("WARN", "LINE 未配置，スキップ"); return; }
  run("send-midday-flash.ts", "LINE 午間速報");
}, { timezone: "Asia/Tokyo" });

// ── 15:45 JST — LINE 大引けまとめ（工作日）───────────────────────────────────
cron.schedule("45 15 * * 1-5", () => {
  log("INFO", "⏰ 15:45 触发：LINE 大引けまとめ");
  if (!hasLine()) { log("WARN", "LINE 未配置，スキップ"); return; }
  run("send-closing-summary.ts", "LINE 大引けまとめ");
}, { timezone: "Asia/Tokyo" });

// ── 16:35 JST — LINE リスク警告（工作日）─────────────────────────────────────
cron.schedule("35 16 * * 1-5", () => {
  log("INFO", "⏰ 16:35 触发：LINE リスク警告");
  if (!hasLine()) { log("WARN", "LINE 未配置，スキップ"); return; }
  run("send-line-risk-alert.ts", "LINE リスク警告");
}, { timezone: "Asia/Tokyo" });

// ── 22:00 JST — 日終メタ同期 ─────────────────────────────────────────────────
cron.schedule("0 22 * * *", () => {
  log("INFO", "⏰ 22:00 触发：日終メタ同期");
  run("sync-stock-meta.ts", "日終メタ同期");
}, { timezone: "Asia/Tokyo" });

log("INFO", "調度器起動完了");
log("INFO", "スケジュール：05:30 市場 / 06:00 価格 / 07:00·12·18·22 ニュース / 07:30 AI評分");
log("INFO", "           08:00 朝報 / 08:30 日報 / 12:30 午間 / 15:45 大引 / 16:35 リスク / 22:00 複盤");
