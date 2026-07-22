// 🔒 P22-S1 · 访问级别：ADMIN_ONLY（生产可观测聚合）
//
// 统一巡检中心的**唯一只读聚合入口**。middleware 已覆盖 /api/admin/*，
// route 内再显式 guardAdminRoute（纵深防御，与全站一致）。
//
// 本 API **只读**：DB 仅 count / findFirst / SELECT 1，文件仅 read。
// 不写 DB、不改任何业务数据、不触发任何流水线 —— 纯观测。
// 复用已有可观测痕迹（health 快照 / pipeline jsonl / 429 summary / DeploymentLog），
// 不重复 mission-control 已实现的能力，只补它没有的：429 聚合、30 天趋势、统一告警分级。

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { guardAdminRoute } from "@/lib/admin-auth";
import {
  jstDay, latestHealth, healthTrend, pipelineTrend, rateLimitTrend,
  readPhases, rateLimit429Today, todaySyncAlert, buildId,
} from "@/lib/monitor/aggregate";

export const dynamic = "force-dynamic";

const COVERAGE_P0 = 80; // 与 data-health-guard / P21-R1 同口径
const COVERAGE_P1 = 95;
const RATE_LIMIT_P1 = 100; // 429 超阈值 → P1

type AlertLevel = "P0" | "P1" | "P2";
// ⚠️ API 禁返展示文案（本项目红线）：alert 只带机器码 + 结构化参数，
//    展示语言由前端 i18n 渲染 —— 否则日文页面会混入中文，破坏「整页同语言」。
interface Alert { level: AlertLevel; code: string; params?: Record<string, string | number>; }

function appVersion(): string | null {
  try { return (JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")) as { version?: string }).version ?? null; }
  catch { return null; }
}

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const today = jstDay();

  // ── System：DB 真实探测（SELECT 1 + 延迟）───────────────────────────────────
  const dbT0 = Date.now();
  let dbOk = false; let dbLatencyMs: number | null = null; let dbError: string | null = null;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; dbLatencyMs = Date.now() - dbT0; }
  catch (e) { dbError = String((e as Error)?.message ?? e).slice(0, 120); dbLatencyMs = Date.now() - dbT0; }

  // ── Data：覆盖率（health-guard 同口径）+ StockScore + 429 ────────────────────
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayJstMidnight = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));
  const [lastCompletedRow, stockTotal, scoreTotal, scoreNullCount, latestScoreRow] = await Promise.all([
    prisma.dailyPrice.findFirst({ where: { date: { lt: todayJstMidnight } }, orderBy: { date: "desc" }, select: { date: true } }),
    prisma.stock.count(),
    prisma.stockScore.count(),
    prisma.stockScore.count({ where: { adaptiveScore: null } }),
    prisma.stockScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
  ]);
  const coveredCount = lastCompletedRow ? await prisma.dailyPrice.count({ where: { date: lastCompletedRow.date } }) : 0;
  const coveragePct = stockTotal > 0 && lastCompletedRow ? (coveredCount / stockTotal) * 100 : 100;
  const rl429Today = rateLimit429Today();
  const syncAlert = todaySyncAlert();

  // ── Pipeline（当日各阶段）───────────────────────────────────────────────────
  const phases = readPhases(today);
  const findPhase = (needle: string) => {
    const rows = phases.filter(p => p.phase.includes(needle) || p.label.includes(needle));
    if (rows.length === 0) return null;
    const last = rows[rows.length - 1];
    return { status: last.status, at: last.finishedAt, durationMs: last.durationMs, error: last.error };
  };
  const pipeline = {
    phase1: findPhase("sync-all-prices") ?? findPhase("株価") ?? findPhase("price"),
    retry: findPhase("price-sync-resilience"),
    phase2: findPhase("compute-scores"),
    health: findPhase("data-health-guard") ?? findPhase("健全性"),
    total: phases.length,
    failed: phases.filter(p => p.status === "FAILED").length,
    allPhases: phases.map(p => ({ phase: p.phase, label: p.label, status: p.status, durationMs: p.durationMs, finishedAt: p.finishedAt, error: p.error })),
  };

  // ── Cron（最近执行 + 7 天成功率）────────────────────────────────────────────
  const pTrend = pipelineTrend(30);
  const last7 = pTrend.slice(-7);
  const cronSuccessRate7d = last7.length > 0 ? Math.round(last7.reduce((a, b) => a + b.successRate, 0) / last7.length) : null;
  const lastPhase = phases.length > 0 ? phases[phases.length - 1] : null;

  // ── Deployment ──────────────────────────────────────────────────────────────
  const latestDeploy = await prisma.deploymentLog.findFirst({ orderBy: { deployedAt: "desc" } });

  // ── Health（最新巡检快照）──────────────────────────────────────────────────
  const health = latestHealth();

  // ── 统一告警分级（P0 / P1 / P2）────────────────────────────────────────────
  const alerts: Alert[] = [];
  // P0
  if (coveragePct < COVERAGE_P0) alerts.push({ level: "P0", code: "COVERAGE_CRITICAL", params: { pct: coveragePct.toFixed(1), threshold: COVERAGE_P0 } });
  if ((health?.critical ?? 0) > 0) alerts.push({ level: "P0", code: "HEALTH_CRITICAL", params: { n: health!.critical } });
  if (phases.length === 0) alerts.push({ level: "P0", code: "CRON_NOT_RUN", params: { date: today } });
  if (syncAlert) alerts.push({ level: "P0", code: "RETRY_EXHAUSTED", params: { pct: syncAlert.coveragePct, rounds: syncAlert.retryRounds } });
  if (pipeline.failed > 0) alerts.push({ level: "P0", code: "PIPELINE_FAILED", params: { n: pipeline.failed } });
  if (!dbOk) alerts.push({ level: "P0", code: "DB_DOWN", params: {} });
  // P1
  if (rl429Today > RATE_LIMIT_P1) alerts.push({ level: "P1", code: "RATE_LIMIT_HIGH", params: { n: rl429Today, threshold: RATE_LIMIT_P1 } });
  if (coveragePct >= COVERAGE_P0 && coveragePct < COVERAGE_P1) alerts.push({ level: "P1", code: "COVERAGE_LOW", params: { pct: coveragePct.toFixed(1), threshold: COVERAGE_P1 } });
  if (scoreNullCount > 0) alerts.push({ level: "P1", code: "SCORE_NULL", params: { n: scoreNullCount } });
  if ((health?.warning ?? 0) > 0) alerts.push({ level: "P1", code: "HEALTH_WARNING", params: { n: health!.warning } });
  // P2
  if (latestDeploy) alerts.push({ level: "P2", code: "LAST_DEPLOY", params: { commit: latestDeploy.commitHash, at: latestDeploy.deployedAt.toISOString().slice(0, 16).replace("T", " ") } });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    jstDate: today,
    system: {
      database: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError },
      buildId: buildId(),
      appVersion: appVersion(),
      // Prisma 用 db push（无 migration history 表）—— 如实标注，不编造 migration version
      schema: { strategy: "prisma db push", migrationTable: false },
    },
    data: {
      coverage: { pct: Number(coveragePct.toFixed(1)), covered: coveredCount, total: stockTotal, date: lastCompletedRow?.date?.toISOString().slice(0, 10) ?? null },
      stockScore: { total: scoreTotal, nullCount: scoreNullCount, latestComputedAt: latestScoreRow?.computedAt?.toISOString() ?? null },
      rateLimit429: { today: rl429Today, trend7d: rateLimitTrend(7) },
    },
    pipeline,
    cron: {
      lastRunAt: lastPhase?.finishedAt ?? null,
      lastLabel: lastPhase?.label ?? null,
      lastDurationMs: lastPhase?.durationMs ?? null,
      successRate7d: cronSuccessRate7d,
    },
    deployment: latestDeploy ? {
      buildId: buildId(), commitHash: latestDeploy.commitHash, appVersion: appVersion(),
      summary: latestDeploy.summary, deployedAt: latestDeploy.deployedAt.toISOString(),
      buildStatus: latestDeploy.buildStatus, healthStatus: latestDeploy.healthStatus, productionReady: latestDeploy.productionReady,
    } : null,
    health,
    alerts,
    history: {
      coverage: await coverageTrend30(stockTotal),
      health: healthTrend(30),
      rateLimit: rateLimitTrend(30),
      pipeline: pipelineTrend(30),
    },
  });
}

// 30 天覆盖率趋势：DailyPrice 各交易日实际行数 / 当前 stockTotal（真实历史覆盖）。
async function coverageTrend30(stockTotal: number): Promise<{ date: string; pct: number; covered: number }[]> {
  const since = new Date(Date.now() - 32 * 86400_000);
  const rows = await prisma.dailyPrice.groupBy({
    by: ["date"], where: { date: { gte: since } }, _count: { _all: true }, orderBy: { date: "asc" },
  });
  return rows.map(r => ({
    date: r.date.toISOString().slice(0, 10),
    covered: r._count._all,
    pct: stockTotal > 0 ? Number(((r._count._all / stockTotal) * 100).toFixed(1)) : 0,
  }));
}
