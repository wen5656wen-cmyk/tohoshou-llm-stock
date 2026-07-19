#!/usr/bin/env npx tsx
/**
 * TOHOSHOU AI 定时任务调度器
 *
 * 东京时间（Asia/Tokyo）：
 *   05:30  グローバル市場データ取得
 *   06:00  株価同期（子进程，不阻塞事件循环）
 *   07:00 / 12:00 / 18:00 / 22:00  新聞取得
 *   07:00  TDnet 開示同期（工作日）
 *   07:30  AI 評分計算 + データ健全性チェック + Day Trade T+1 結算 + 戦略推荐生成
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
 *
 * P0 Day Trade T+1 修复（v17.24.0，2026-07-01）：
 *   旧版 Day Trade 在当天 16:30 JST 结算当天交易，但当天 DailyPrice 要到
 *   次日 06:00 JST 才同步完成 —— 时序上永远等不到收盘价，导致 2026-06-26
 *   之后 Day Trade 自动结算完全停摆（16:30 触发但每次都因无数据而放弃写入）。
 *   修复：删除 16:30 触发，改为在 07:30 价格同步完成（await syncPricesPromise）
 *   之后立即结算前一交易日（T-1），此时价格已入库超过 24 小时。
 *   day-strategy.ts 同时改为自动断点续跑：会补齐所有尚未结算的历史交易日。
 *   部署本文件后必须 `pm2 restart tohoshou-cron`（仅 restart tohoshou-web
 *   不会重新加载新的 cron.schedule() 注册 —— 这正是 06-29 漏跑一整天的根因）。
 */

import "dotenv/config";
import cron from "node-cron";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { getJPXTradingDayStatus } from "../lib/trading-calendar/jpx";
import { recordPhase, recordSkip, isPhaseCompletedToday } from "../lib/pipeline-tracker";

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
 * 返回 Promise<boolean>，resolve 时脚本已退出（成功或失败均 resolve，不 reject）；
 * 值为脚本是否成功（exit 0 且未超时）。P1-4 修复：此前恒 resolve()，调用方无法
 * 区分成功/失败，07:30 watchdog 因此把失败的价格同步误判为成功。
 */
function runAsync(script: string, label: string, timeoutMs = 10 * 60 * 1000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
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
      recordPhase({
        phase: stage, label, source: label.includes("[fallback]") ? "fallback" : "cron",
        startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(), status: "FAILED", error: errorMessage,
      });
      resolve(false);
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
      recordPhase({
        phase: stage, label, source: label.includes("[fallback]") ? "fallback" : "cron",
        startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        status: success ? "SUCCESS" : "FAILED", error: errorMessage,
      });
      resolve(success);
    });
  });
}

/**
 * P5.5 R3 修复：fallback 阶段幂等执行。
 * Phase2（sync-all-prices 内）今日已成功的阶段，07:30 fallback 不再重复执行——
 * 尤其 GPT rerank，避免重复 GPT 调用 / 重复覆盖 / 重复扣费。
 * 保守策略：仅当 pipeline-phases 明确记录该阶段今日 SUCCESS 才跳过（读不到则照常执行）。
 */
async function fallbackStage(script: string, label: string, timeoutMs?: number): Promise<boolean> {
  const phase = script.replace(/\.ts$/, "");
  if (isPhaseCompletedToday(phase)) {
    log("INFO", `[PIPELINE_GUARD] SKIP_ALREADY_DONE phase=${phase} — Phase2 今日已成功，跳过 fallback 重复执行`);
    recordSkip(phase, label, "fallback");
    return true;
  }
  return runAsync(script, label, timeoutMs);
}

/**
 * JPX Trading Day Guard（P5-T3）
 * ────────────────────────────────────────────────────────────────────────────
 * 在高成本任务（评分 / GPT rerank / 策略生成 / Paper Broker 等）执行前调用。
 * 返回 true 表示今天（日本时间）是 JPX 交易日，可以继续；false 表示休市，应跳过。
 * 无论交易与否都输出统一 [JPX_CALENDAR] 日志，便于 grep 审计。
 *
 * 不跳过的任务（新闻 / 全球市场 / 健康检查 / 周报月报 等）不调用本函数。
 */
function isTradingDayGuard(task: string): boolean {
  const status = getJPXTradingDayStatus(new Date());
  if (!status.isTradingDay) {
    log("INFO", `[JPX_CALENDAR] SKIP_NON_TRADING_DAY task=${task} date=${status.date} reason=${status.reason}`);
    return false;
  }
  log("INFO", `[JPX_CALENDAR] TRADING_DAY task=${task} date=${status.date}`);
  return true;
}

// 跨 cron slot 的价格同步 Promise（06:00 写入，07:30 await）；值为同步+评分是否成功
let syncPricesPromise: Promise<boolean> | null = null;

log("INFO", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
log("INFO", "TOHOSHOU AI 調度器启动（v17.24.0 — Day Trade T+1 結算修复）");
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

// ── 05:00 JST — AI Universe Guard（P1-T2）─────────────────────────────────────
// 自動排除規則（ETF/ETN/REIT/優先株/上場廃止/長期停牌/低流動性/データ品質不足）を評価。
// compute-scores（07:30 pipeline）の前に走らせ、除外フラグを確定 → 当日の評分が
// それを反映する。手動（MANUAL）は絶対に触らない（手動優先, LOCKED）。
cron.schedule("0 5 * * *", async () => {
  log("INFO", "⏰ 05:00 触发：AI Universe Guard（自動排除評価）");
  await runAsync("update-ai-universe.ts", "AI Universe Guard");
}, { timezone: "Asia/Tokyo" });

// ── 05:30 JST — グローバル市場データ取得 ────────────────────────────────────
cron.schedule("30 5 * * *", async () => {
  log("INFO", "⏰ 05:30 触发：グローバル市場取得");
  await runAsync("fetch-global-market.ts", "グローバル市場取得");
}, { timezone: "Asia/Tokyo" });

// ── 08:45 JST — Alpha Factors（P2-T1 Phase 1）────────────────────────────────
// 価格同期(06:00)+TOPIX(05:30)+評分流水線(~07:56)完了後に走る、追加のみのデータ層。
// StockScore/推荐/Portfolio には一切触れない（並行 Alpha データを AlphaFactor に upsert）。
cron.schedule("45 8 * * *", async () => {
  log("INFO", "⏰ 08:45 触发：Alpha Factors（Phase 1 データ層）");
  await runAsync("compute-alpha-factors.ts", "Alpha Factors");
}, { timezone: "Asia/Tokyo" });

// ── 09:00 JST — Alpha Analytics（P2-T1 Phase 1.5）────────────────────────────
// Alpha 因子の履歴有効性統計（IC / 勝率 / 前向きリターン / 分位）を AlphaFactorReport へ。
// 読み取り専用分析。StockScore/推荐/Portfolio には一切触れない。約 15min timeout。
cron.schedule("0 9 * * *", async () => {
  log("INFO", "⏰ 09:00 触发：Alpha Analytics（Phase 1.5 統計）");
  await runAsync("compute-alpha-analytics.ts", "Alpha Analytics", 15 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 09:15 JST — Alpha Score（P2-T1 Phase 2A Shadow Mode）─────────────────────
// Analytics(09:00)の重みで AlphaScore を生成（AlphaScore テーブルのみ）。
// SHADOW ONLY：StockScore/AdaptiveScore/推荐/Portfolio には一切接続しない。
cron.schedule("15 9 * * *", async () => {
  log("INFO", "⏰ 09:15 触发：Alpha Score（Phase 2A Shadow）");
  await runAsync("compute-alpha-score.ts", "Alpha Score (Shadow)");
}, { timezone: "Asia/Tokyo" });

// ── 09:20 JST — Factor Alpha Engine（P6-T9 · T10.1 每日自动化）──────────────
// Alpha Analytics(09:00) の後：各 Feature × horizon(1/3/5/10/20d) の実 alpha を
// DailyPrice から回测して FactorAlphaResult へ。READ-ONLY：本番のスコア/推薦/Portfolio
// には一切触れない。约 5min。Promotion Engine V2 はこの結果を on-demand で消費する。
cron.schedule("20 9 * * *", async () => {
  log("INFO", "⏰ 09:20 触发：Factor Alpha Engine（P6-T9 因子级 alpha 回测）");
  await runAsync("compute-factor-alpha.ts", "Factor Alpha Engine", 10 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 09:25 JST — Feature Platform Report（P6-T10 T10.2/T10.4/T10.5）──────────
// Factor Alpha(09:20) の後：统一评估 + Integrity Check + Platform Report + Pending
// Trend を FeaturePlatformSnapshot へ落とす。READ-ONLY 派生：Feature 状态/评分/推荐は不变。
cron.schedule("25 9 * * *", async () => {
  log("INFO", "⏰ 09:25 触发：Feature Platform Report（P6-T10 平台快照）");
  await runAsync("feature-platform-report.ts", "Feature Platform Report", 5 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 09:30 JST — Alpha Shadow Backtest（P2-T2）───────────────────────────────
// Production スコア vs AlphaScore を DailyPrice から再構成して検証（AlphaBacktestResult）。
// READ-ONLY：本番のスコア/推薦/Portfolio には一切影響しない。約 15min timeout。
cron.schedule("30 9 * * *", async () => {
  log("INFO", "⏰ 09:30 触发：Alpha Shadow Backtest（P2-T2 検証）");
  await runAsync("backtest-shadow.ts", "Alpha Shadow Backtest", 15 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 09:45 JST — Adaptive Fusion Research（P2-T3）─────────────────────────────
// Market Regime 分類（Bull/Sideways/Bear）+ レジーム別の最適融合比率を履歴探索。
// READ-ONLY：本番のスコア/推薦/Portfolio には一切影響しない。約 15min timeout。
cron.schedule("45 9 * * *", async () => {
  log("INFO", "⏰ 09:45 触发：Adaptive Fusion Research（P2-T3 レジーム研究）");
  await runAsync("research-fusion.ts", "Adaptive Fusion Research", 15 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 09:35 JST — AI Top Picks（P7 Preview · Experimental V1）─────────────────
// AlphaScore(09:15)/Factor Alpha(09:20) 后：从 STRONG_BUY（不足5补top BUY）综合重排 Top5。
// **独立实验模块 · 纯只读派生**：只读 StockScore+AlphaScore，绝不改 StrongBuy/DR/Promotion/
// Strategy/Watchlist/评分。JPX 守卫非交易日跳过。
cron.schedule("35 9 * * *", async () => {
  log("INFO", "⏰ 09:35 触发：AI Top Picks（P7 Preview 实验 Top5）");
  await runAsync("generate-ai-top-picks.ts", "AI Top Picks (Experimental)", 5 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 09:40 JST — AI Top Picks Daily Performance（V1.1 Freeze Validation）──────
// 晨间价同步后：对已有 Top5 cohort 且下一交易日收盘已入库的日期计已实现 1 日收益
// （Top5/STRONG_BUY/BUY/TOPIX），落 AiTopPickPerf。只读派生，实验期算法固定不改。
cron.schedule("40 9 * * *", async () => {
  log("INFO", "⏰ 09:40 触发：AI Top Picks Daily Performance（V1.1 验证）");
  await runAsync("ai-top-picks-daily-perf.ts", "AI Top Picks Daily Perf", 5 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 金曜 17:00 JST — AI Top Picks Weekly Report（V1.1 Freeze Validation）─────
cron.schedule("0 17 * * 5", async () => {
  log("INFO", "⏰ 金 17:00 触发：AI Top Picks Weekly Report（V1.1 验证）");
  await runAsync("ai-top-picks-weekly-report.ts", "AI Top Picks Weekly Report", 5 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 15:15 JST — Closing Decision（P6-T12 收盘决策）──────────────────────────
// 收盘前最终 AI 决策：全市场 EOD 排名 + 候选池实时行情覆盖 → GPT 分析 Top20 → 最终 Top10
// + Decision Engine（BUY_TODAY/WATCH_ONLY/STAY_CASH）+ Portfolio Builder（3-5 只建仓组合）。
// **独立模块 · 只读派生**：不改 StockScore/DR/Watchlist/AiTopPick/评分/其它 Cron。
// 生成脚本内含 JPX 守卫（非交易日跳过）。目标 2 分钟内完成（15:18 前）。
cron.schedule("15 15 * * *", async () => {
  log("INFO", "⏰ 15:15 触发：Closing Decision（P6-T12 收盘决策）");
  await runAsync("generate-closing-decision.ts", "Closing Decision (P6-T12)", 5 * 60 * 1000);
  // P17-02A：收盘决策后紧接持仓每日复盘（已有收盘链路内的一步，不新增 cron.schedule）。
  await runAsync("daily-holding-review.ts", "Daily Holding Review (P17-02A)", 5 * 60 * 1000);
  // P17-02B：收盘后写组合净值快照（真账户 NAV 序列，供 AI Alpha 实测）。
  await runAsync("portfolio-nav-snapshot.ts", "Portfolio NAV Snapshot (P17-02B)", 3 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── P18 AI Mission Lab · 双阶段 Forward Test（无未来函数）─────────────────────
// ⚠️ 默认关闭：两脚本内 MISSION_LAB_ENABLED!=true 直接跳过（M1 不激活）。JPX 非交易日自动跳过。
// 激活需人工 GO 后：① 生产 .env 置 MISSION_LAB_ENABLED=true ② npx tsx scripts/mission-lab-init.ts 注资
// ③ `pm2 restart tohoshou-cron`（仅 restart web 不会重新加载本 cron.schedule 注册）。
// Phase1 08:20 开盘前：生成/校验今日决策 → READY_FOR_OPEN（不成交/不改持仓/不扣现金）。
cron.schedule("20 8 * * *", async () => {
  log("INFO", "⏰ 08:20 触发：AI Mission Lab Phase1 准备（P18-M1，默认关闭）");
  await runAsync("mission-lab-prepare.ts", "AI Mission Lab Prepare (P18-M1)", 10 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });
// Phase2 09:10 开盘后：读实时行情(regularMarketTime 校验新鲜) → 成交 → Trade/Position/Cash/NAV（幂等）。
cron.schedule("10 9 * * *", async () => {
  log("INFO", "⏰ 09:10 触发：AI Mission Lab Phase2 执行（P18-M1，默认关闭）");
  await runAsync("mission-lab-execute.ts", "AI Mission Lab Execute (P18-M1)", 10 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 10:00 JST — Fusion Paper Trading（P2-T4）────────────────────────────────
// Production(公式推薦) / AlphaScore / Regime Fusion の3戦略で日次 Top10/20 を生成し、
// 未来 1/3/5/10/20 日リターンを蓄積（2–4週）。READ-ONLY：公式推薦は変更しない。
cron.schedule("0 10 * * *", async () => {
  log("INFO", "⏰ 10:00 触发：Fusion Paper Trading（P2-T4 ペーパー）");
  await runAsync("fusion-paper-trade.ts", "Fusion Paper Trading", 15 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 10:15 JST — Adaptive Score V3 Pro Shadow（P3-T1）──────────────────────────
// 动态权重 + 风险层 + 市场状态门控，只写 AdaptiveScoreV3Shadow。
// READ-ONLY：不改 StockScore / DailyRecommendation / GPT Rank / Portfolio。
cron.schedule("15 10 * * *", async () => {
  log("INFO", "⏰ 10:15 触发：Adaptive Score V3 Shadow（P3-T1）");
  await runAsync("compute-score-v3-shadow.ts", "Adaptive Score V3 Shadow", 10 * 60 * 1000);
  await runAsync("backtest-score-v3.ts", "Adaptive Score V3 Backtest", 15 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 10:35 JST — V3 历史回放（P3-T4 Freeze：每日累计前向证据）──────────────────
cron.schedule("35 10 * * *", async () => {
  log("INFO", "⏰ 10:35 触发：V3 历史回放（P3-T4 Freeze 前向累计）");
  await runAsync("replay-score-v3.ts", "V3 Historical Replay", 10 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 金曜 16:45 JST — V3 Freeze 到期最终评审（P3-T4）────────────────────────────
cron.schedule("45 16 * * 5", async () => {
  log("INFO", "⏰ 金曜16:45 触发：V3 Freeze 最终评审生成（P3-T4）");
  await runAsync("gen-v3-final-review.ts", "V3 Final Production Review", 10 * 60 * 1000);
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
  // JPX Trading Day Guard (P5-T3): 非交易日跳过整条评分流水线
  // （sync-all-prices → compute-scores → rerank → portfolio → signal-stats
  //  → update-backtest → learning → data-health-guard 均内嵌在 sync-all-prices Phase2）
  if (!isTradingDayGuard("sync-all-prices")) return;
  log("INFO", "⏰ 06:00 触发：株価同期（子进程，不阻塞事件循环）");
  syncPricesPromise = runAsync(
    "sync-all-prices.ts",
    "株価同期",
    2 * 60 * 60 * 1000, // 2h — 3700 stocks × 500ms(rate-limit gate, v3) ≈ 31min, 含充裕余量
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
  // JPX Trading Day Guard (P5-T3): 非交易日跳过 fallback 流水线 + Day Trade(T+1) + 策略推荐 + Paper Broker
  // （day-strategy 具备断点续跑，会在下一交易日补齐被跳过日的结算）
  if (!isTradingDayGuard("scoring-pipeline")) return;
  // P1-4 fix: act on the real success of the 06:00 sync+scoring, not merely on
  // whether the promise was set. A failed/partial sync-all-prices (non-zero exit
  // or timeout) now triggers the degraded pipeline instead of being logged as
  // "全日流水線完了" while downstream ran on stale StockScore and health never ran.
  let pipelineOk = false;
  if (syncPricesPromise) {
    log("INFO", "⏰ 07:30 watchdog：sync-all-prices 全工程（価格+評分）完了待機中...");
    pipelineOk = await syncPricesPromise;
    if (pipelineOk) {
      log("INFO", "✅ 07:30 確認：全日流水線完了（価格同期 → 評分 → 健全性まで）");
    } else {
      log("ERROR", "❌ 07:30：sync-all-prices が失敗/未完了（非ゼロ終了 or timeout）→ 降級流水線で復旧");
    }
  } else {
    // cron が 06:00 以降に再起動された場合の緊急 fallback
    log("WARN", "⚠️ 07:30 fallback：syncPricesPromise 未設置（cron 再起動？）→ 降級流水線起動");
  }

  if (!pipelineOk) {
    // R3 修复：每个阶段先查「今日 Phase2 是否已成功」，已成功则跳过（不重复跑 rerank 等）。
    await fallbackStage("compute-scores.ts",           "AI 評分計算 [fallback]",               90 * 60 * 1000);
    await fallbackStage("rerank-top500.ts",            "GPT Rerank Top500 [fallback]",          5 * 60 * 60 * 1000);
    await fallbackStage("create-portfolio-snapshot.ts","AI 組合スナップショット生成 [fallback]");
    await fallbackStage("update-ai-signal-stats.ts",   "AI シグナル統計更新 [fallback]");
    await fallbackStage("update-backtest.ts",          "バックテスト更新 [fallback]",           20 * 60 * 1000);
    await fallbackStage("generate-learning-report.ts", "Learning Engine レポート生成 [fallback]");
    await fallbackStage("data-health-guard.ts",        "データ健全性チェック [fallback]");
  }

  // Day Trade Strategy Engine — T+1 settlement (P0 fix, 2026-07-01)
  //
  // 旧实现在当天 16:30 JST 结算当天交易，但 DailyPrice 只在次日 06:00 JST
  // 才同步完成，导致 16:30 时当天收盘价永远不存在，Day Trade 自动结算
  // 自 2026-06-26 起完全失效（见 docs/CHANGELOG.md P0 Day Trade 生产链路修复）。
  //
  // 新时序：DailyPrice 同步完成（上面 await 完毕）之后立即结算 T-1 日交易，
  // 此时 T-1 的收盘价已经在数据库里超过 24 小时，保证数据就绪。
  // day-strategy.ts 自动模式会补齐所有尚未结算的历史交易日（断点续跑）。
  log("INFO", "⏰ 07:30+ 触发：Day Trade Strategy Engine（T+1 结算，价格同步完成后）");
  await runAsync("day-strategy.ts", "Day Trade Strategy (T+1)", 10 * 60 * 1000);

  // Phase 3: generate StrategyRecommendation after pipeline completes
  // Runs after rerank-top500 so StockScore and DailyRecommendation are both fresh
  await runAsync("generate-strategy-recommendations.ts", "Strategy Recommendation Engine", 15 * 60 * 1000);

  // T2 P5: Paper Broker — mirror the strategy engines' executed trades into the
  // ¥10M simulated account. Read-only vs strategy tables; runs after day-strategy
  // (and after Swing/Long once activated in Phase 7) so their trades are settled.
  await runAsync("paper-broker.ts", "Paper Broker (模拟账户同期)", 10 * 60 * 1000);

  // P6-T7: Daily AI Watchlist — snapshot today's STRONG_BUY/BUY names into an
  // independent date-scoped pool. Runs AFTER DailyRecommendation is fresh; the
  // whole 07:30+ block is already JPX-guarded (non-trading days skipped), and
  // the script itself re-checks the JPX calendar. Read-only vs scoring.
  await runAsync("generate-daily-ai-watchlist.ts", "Daily AI Watchlist（每日关注池）", 5 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 16:35 JST — Swing Trade Strategy Engine（工作日，Day 结束后）────────────
//
// Swing runs 5 minutes after Day to avoid race conditions on shared DB tables.
// Failure is isolated — does not affect Day or other pipeline stages.
//
cron.schedule("35 16 * * 1-5", async () => {
  if (!isTradingDayGuard("swing-strategy")) return; // P5-T3: 祝日跳过（周末已由 1-5 排除）
  log("INFO", "⏰ 16:35 触发：Swing Trade Strategy Engine");
  await runAsync("swing-strategy.ts", "Swing Trade Strategy", 10 * 60 * 1000);
}, { timezone: "Asia/Tokyo" });

// ── 16:40 JST — Long Trade Strategy Engine（工作日，Swing 结束后）────────────
//
// Long runs 5 minutes after Swing. Failure is isolated.
//
cron.schedule("40 16 * * 1-5", async () => {
  if (!isTradingDayGuard("long-strategy")) return; // P5-T3: 祝日跳过
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
  if (!isTradingDayGuard("strategy-backtest")) return; // P5-T3: 祝日跳过
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
  if (!isTradingDayGuard("strategy-learning")) return; // P5-T3: 祝日跳过
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
  if (!isTradingDayGuard("strategy-daily-validation")) return; // P5-T3: 祝日跳过
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
log("INFO", "           07:30 AI評分+rerank+健全性+Day(T+1結算)+推荐 / 16:35 Swing / 16:40 Long / 16:45 Backtest / 17:00 Learning / 17:15 DailyValidation(工作日) / 土17:30 WeeklyReport / 月末18:00 MonthlyReport / 18:30 空売り比率 / 22:00 複盤 / 22:30 配当");
