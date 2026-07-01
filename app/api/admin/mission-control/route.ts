import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════════
// Mission Control V2 — Trading Architecture V1 operations dashboard.
// Read-only monitoring. Does not touch trading logic, schema, strategy engines,
// or cron timing — it only reads DB / pipeline-runs.jsonl / reports/ / pm2.
// ═══════════════════════════════════════════════════════════════════════════════

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

type StepStatus = "SUCCESS" | "WAITING" | "FAILED" | "SKIPPED";
type Severity = "NORMAL" | "WARNING" | "CRITICAL";

// ── JST helpers ───────────────────────────────────────────────────────────────
function nowJst(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}
function todayJst(): Date {
  const n = nowJst();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
function isSameJstDay(d: Date | null | undefined, ref: Date): boolean {
  if (!d) return false;
  const dj = new Date(d.getTime() + 9 * 3600 * 1000);
  return dj.getUTCFullYear() === ref.getUTCFullYear()
    && dj.getUTCMonth() === ref.getUTCMonth()
    && dj.getUTCDate() === ref.getUTCDate();
}
function fmtDuration(ms: number | null): string | null {
  if (ms == null) return null;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
function toJstClock(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return d.toISOString().slice(0, 16).replace("T", " ") + " JST";
}

// ── Pipeline log reader (same source as old dashboard) ────────────────────────
function readPipelineRuns(): PipelineRunEntry[] {
  try {
    const logPath = path.join(process.cwd(), "logs", "pipeline-runs.jsonl");
    if (!fs.existsSync(logPath)) return [];
    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.slice(-3000).map(l => JSON.parse(l) as PipelineRunEntry).reverse();
  } catch { return []; }
}
function getLatestPerStage(runs: PipelineRunEntry[]): Map<string, PipelineRunEntry> {
  const map = new Map<string, PipelineRunEntry>();
  for (const run of runs) {
    if (!map.has(run.stage)) map.set(run.stage, run);
  }
  return map;
}

// ── Strategy backtest maturity (same thresholds as scripts/strategy-backtest.ts) ─
function maturity(fillRate: number | null): "READY" | "PARTIAL" | "LIMITED" | "INSUFFICIENT" {
  if (fillRate == null) return "INSUFFICIENT";
  if (fillRate >= 0.80) return "READY";
  if (fillRate >= 0.50) return "PARTIAL";
  if (fillRate >= 0.30) return "LIMITED";
  return "INSUFFICIENT";
}

// ── PM2 status (reads local pm2 daemon — API runs on the same host in prod) ───
type Pm2ProcInfo = {
  name: string;
  status: string;
  restarts: number;
  uptimeMs: number | null;
  startedAt: string | null;
};
function readPm2Status(): { processes: Pm2ProcInfo[]; available: boolean } {
  try {
    const out = execSync("pm2 jlist", { timeout: 5000, encoding: "utf-8" });
    const list = JSON.parse(out) as Array<{
      name: string;
      pm2_env: { status: string; restart_time: number; pm_uptime: number };
    }>;
    return {
      available: true,
      processes: list
        .filter(p => p.name === "tohoshou-web" || p.name === "tohoshou-cron")
        .map(p => ({
          name: p.name,
          status: p.pm2_env.status,
          restarts: p.pm2_env.restart_time,
          uptimeMs: p.pm2_env.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : null,
          startedAt: p.pm2_env.pm_uptime ? new Date(p.pm2_env.pm_uptime).toISOString() : null,
        })),
    };
  } catch {
    return { available: false, processes: [] };
  }
}

// ── Step schedule definitions (display only — does NOT change actual cron) ────
// scheduledLabel reflects the REAL configured time in scripts/cron-scheduler.ts.
// Forbidden by this task's scope: changing cron timing / strategy logic.
type StepDef = {
  key: string;
  name: string;
  scheduledLabel: string;
  stage: string;                    // pipeline-runs.jsonl stage id
  scheduledHour: number;            // JST hour, for WAITING vs FAILED(missed) judgement
  scheduledMinute: number;
  appliesToday: (today: Date) => boolean;
};
const WORKDAY = (d: Date) => { const dow = d.getUTCDay(); return dow >= 1 && dow <= 5; };
const EVERY_DAY = () => true;
const SATURDAY_ONLY = (d: Date) => d.getUTCDay() === 6;
const MONTH_END_ONLY = (d: Date) => {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return next.getUTCDate() === 1; // tomorrow rolls into next month → today is month-end
};

const STEP_DEFS: StepDef[] = [
  { key: "global_market", name: "同步全球指数",     scheduledLabel: "05:30 JST",       stage: "fetch-global-market",              scheduledHour: 5,  scheduledMinute: 30, appliesToday: EVERY_DAY },
  { key: "sync_prices",   name: "同步股票行情",     scheduledLabel: "06:00 JST",       stage: "sync-all-prices",                  scheduledHour: 6,  scheduledMinute: 0,  appliesToday: EVERY_DAY },
  { key: "sync_news",     name: "同步新闻资讯",     scheduledLabel: "07:00 JST",       stage: "sync-news",                        scheduledHour: 7,  scheduledMinute: 0,  appliesToday: EVERY_DAY },
  { key: "compute_scores",name: "计算综合评分",     scheduledLabel: "07:30 JST",       stage: "compute-scores",                   scheduledHour: 7,  scheduledMinute: 30, appliesToday: EVERY_DAY },
  { key: "gen_recs",      name: "生成三策略推荐",   scheduledLabel: "07:30 JST",       stage: "generate-strategy-recommendations",scheduledHour: 7,  scheduledMinute: 30, appliesToday: EVERY_DAY },
  { key: "day_settle",    name: "结算日内策略",     scheduledLabel: "07:30+ JST (T+1)",stage: "day-strategy",                     scheduledHour: 7,  scheduledMinute: 30, appliesToday: EVERY_DAY },
  { key: "swing_update",  name: "更新波段策略",     scheduledLabel: "16:35 JST",       stage: "swing-strategy",                   scheduledHour: 16, scheduledMinute: 35, appliesToday: WORKDAY },
  { key: "long_update",   name: "更新长线策略",     scheduledLabel: "16:40 JST",       stage: "long-strategy",                    scheduledHour: 16, scheduledMinute: 40, appliesToday: WORKDAY },
  { key: "backtest",      name: "策略回测",         scheduledLabel: "16:45 JST",       stage: "strategy-backtest",                scheduledHour: 16, scheduledMinute: 45, appliesToday: WORKDAY },
  { key: "learning",      name: "策略学习",         scheduledLabel: "17:00 JST",       stage: "strategy-learning",                scheduledHour: 17, scheduledMinute: 0,  appliesToday: WORKDAY },
  { key: "validation",    name: "每日验证",         scheduledLabel: "17:15 JST",       stage: "strategy-daily-validation",        scheduledHour: 17, scheduledMinute: 15, appliesToday: WORKDAY },
  { key: "weekly_report", name: "周报",             scheduledLabel: "周六 17:30 JST",  stage: "generate-weekly-report",           scheduledHour: 17, scheduledMinute: 30, appliesToday: SATURDAY_ONLY },
  { key: "monthly_report",name: "月报",             scheduledLabel: "月末 18:00 JST",  stage: "generate-monthly-report",          scheduledHour: 18, scheduledMinute: 0,  appliesToday: MONTH_END_ONLY },
];

// A step counts as "missed" (FAILED) once this many minutes have passed the
// scheduled time with no run recorded today — generous to allow for chained
// steps (e.g. day-strategy runs after the price sync, which can itself take
// up to ~90min).
const MISS_GRACE_MINUTES = 150;

export async function GET() {
  try {
    const today = todayJst();
    const now = nowJst();
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

    // ── Pipeline log ──────────────────────────────────────────────────────────
    const allRuns = readPipelineRuns().filter(r => !r.runType || r.runType === "production");
    const latestPerStage = getLatestPerStage(allRuns);

    // ── Health guard latest report ────────────────────────────────────────────
    let healthGuard: { status: string; critical: number; warning: number; pass: number; auditAt: string | null; topIssues: string[]; warningIssues: string[] } = {
      status: "UNKNOWN", critical: 0, warning: 0, pass: 0, auditAt: null, topIssues: [], warningIssues: [],
    };
    try {
      const reportDir = path.join(process.cwd(), "reports");
      if (fs.existsSync(reportDir)) {
        const files = fs.readdirSync(reportDir)
          .filter(f => f.startsWith("data-health-guard-") && f.endsWith(".json"))
          .sort().reverse();
        if (files.length) {
          const report = JSON.parse(fs.readFileSync(path.join(reportDir, files[0]), "utf-8"));
          healthGuard = {
            status: report.status ?? "UNKNOWN",
            critical: report.criticalCount ?? 0,
            warning: report.warningCount ?? 0,
            pass: report.passCount ?? 0,
            auditAt: report.auditAt ?? null,
            topIssues: report.topIssues ?? [],
            warningIssues: report.warningIssues ?? [],
          };
        }
      }
    } catch {}

    // ── Parallel DB queries ───────────────────────────────────────────────────
    const db = prisma as any;

    // One lookup of "latest tradeDate" per strategy, reused for both total and
    // top10 counts — avoids re-querying "latest" three separate times.
    async function recSummary(strategyType: string) {
      const latest = await db.strategyRecommendation.findFirst({
        where: { strategyType }, orderBy: { tradeDate: "desc" }, select: { tradeDate: true },
      });
      if (!latest) return { total: 0, top10: 0, latestTradeDate: null as Date | null };
      const [total, top10] = await Promise.all([
        db.strategyRecommendation.count({ where: { strategyType, tradeDate: latest.tradeDate } }),
        db.strategyRecommendation.count({ where: { strategyType, tradeDate: latest.tradeDate, isTop10: true } }),
      ]);
      return { total, top10, latestTradeDate: latest.tradeDate as Date };
    }

    const [
      stockTotal,
      latestPriceRow,
      lastCompletedPriceRow,
      latestNews,
      todayNewsCount,
      latestGm,
      latestScoreRow,
      todayScoreCount,
      dayRec, swingRec, longRec,
      latestDayTradeDate,
      latestDueDayTradeDate,
      dayLearning, swingLearning, longLearning, unifiedLearning,
      latestValidation,
      recentValidations,
      recentDeployments,
      latestDrVersion,
      activeVersionSnapshot,
    ] = await Promise.all([
      prisma.stock.count(),
      prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.dailyPrice.findFirst({ where: { date: { lt: today } }, orderBy: { date: "desc" }, select: { date: true } }),
      prisma.news.findFirst({ orderBy: { publishedAt: "desc" }, select: { publishedAt: true } }),
      prisma.news.count({ where: { createdAt: { gte: new Date(today.getTime() - 9 * 3600_000) } } }),
      prisma.globalMarket.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.stockScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
      prisma.stockScore.count({ where: { computedAt: { gte: new Date(today.getTime() - 9 * 3600_000) } } }),
      recSummary("DAY_TRADE"),
      recSummary("SWING_TRADE"),
      recSummary("LONG_TRADE"),
      db.strategyTradeResult.findFirst({ where: { strategyType: "DAY_TRADE" }, orderBy: { tradeDate: "desc" }, select: { tradeDate: true } }),
      db.strategyRecommendation.findFirst({ where: { strategyType: "DAY_TRADE", tradeDate: { lt: today } }, orderBy: { tradeDate: "desc" }, select: { tradeDate: true } }),
      db.strategyLearningReport.findFirst({ where: { strategyType: "DAY_TRADE" }, orderBy: { reportDate: "desc" }, select: { reportDate: true, grade: true, recommendation: true } }),
      db.strategyLearningReport.findFirst({ where: { strategyType: "SWING_TRADE" }, orderBy: { reportDate: "desc" }, select: { reportDate: true, grade: true, recommendation: true } }),
      db.strategyLearningReport.findFirst({ where: { strategyType: "LONG_TRADE" }, orderBy: { reportDate: "desc" }, select: { reportDate: true, grade: true, recommendation: true } }),
      db.strategyLearningSummary.findFirst({ orderBy: { reportDate: "desc" }, select: { reportDate: true, integrityScore: true, grade: true, recommendation: true } }),
      db.strategyDailyValidation.findFirst({ orderBy: { validationDate: "desc" } }),
      db.strategyDailyValidation.findMany({ orderBy: { validationDate: "desc" }, take: 30, select: { healthOk: true } }),
      prisma.deploymentLog.findMany({ orderBy: { deployedAt: "desc" }, take: 15, select: { modifiedFiles: true, deployedAt: true } }),
      prisma.dailyRecommendation.findFirst({ orderBy: { date: "desc" }, select: { schemaVersion: true, modelVersion: true, scoreVersion: true, versionSnapshotId: true } }),
      prisma.versionSnapshot.findFirst({ where: { endDate: null }, orderBy: { startDate: "desc" }, select: { id: true, modelVersion: true, scoreVersion: true, schemaVersion: true } }),
    ]);

    // ── DailyPrice coverage on the last COMPLETED trading day (not "today",
    //    which is always partial until next morning's sync) ───────────────────
    let priceCoverageRows = 0;
    let priceCoveragePct = 100;
    const lastCompletedDateStr = lastCompletedPriceRow?.date?.toISOString().slice(0, 10) ?? null;
    if (lastCompletedPriceRow) {
      priceCoverageRows = await prisma.dailyPrice.count({ where: { date: lastCompletedPriceRow.date } });
      priceCoveragePct = stockTotal > 0 ? Math.round((priceCoverageRows / stockTotal) * 1000) / 10 : 0;
    }
    let priceFailedCount = 0;
    try {
      const failFile = path.join(process.cwd(), "logs", `sync-prices-failed-${lastCompletedDateStr}.json`);
      if (lastCompletedDateStr && fs.existsSync(failFile)) {
        priceFailedCount = (JSON.parse(fs.readFileSync(failFile, "utf-8")) as unknown[]).length;
      }
    } catch {}
    const priceCoverageStatus: Severity = priceCoveragePct < 80 ? "CRITICAL" : priceCoveragePct < 95 ? "WARNING" : "NORMAL";

    // ── Day Trade execution (T-1 settlement, most recent settled date) ────────
    let dayExec = {
      lastSettledDate: null as string | null,
      tradeResultCount: 0, closedCount: 0, skippedCount: 0,
      snapshotExists: false, pnl: null as number | null, alpha: null as number | null,
    };
    if (latestDayTradeDate) {
      const d = latestDayTradeDate.tradeDate;
      const [rows, snap] = await Promise.all([
        db.strategyTradeResult.findMany({ where: { strategyType: "DAY_TRADE", tradeDate: d }, select: { status: true, returnAmount: true, alpha: true } }),
        db.strategySnapshot.findFirst({ where: { strategyType: "DAY_TRADE", snapshotDate: d }, select: { id: true } }),
      ]);
      const closed = rows.filter((r: any) => r.status === "CLOSED");
      const skipped = rows.filter((r: any) => String(r.status).startsWith("SKIPPED"));
      const alphas = closed.filter((r: any) => r.alpha != null);
      dayExec = {
        lastSettledDate: d.toISOString().slice(0, 10),
        tradeResultCount: rows.length,
        closedCount: closed.length,
        skippedCount: skipped.length,
        snapshotExists: !!snap,
        pnl: closed.length ? Math.round(closed.reduce((s: number, r: any) => s + (r.returnAmount ?? 0), 0)) : null,
        alpha: alphas.length ? Math.round((alphas.reduce((s: number, r: any) => s + r.alpha, 0) / alphas.length) * 100) / 100 : null,
      };
    }

    // ── Swing / Long execution (today, JST) ───────────────────────────────────
    async function execSummary(strategyType: string) {
      const [openPositions, newOpensToday, closedToday, snap] = await Promise.all([
        db.strategyPosition.findMany({ where: { strategyType, status: "OPEN" }, select: { symbol: true } }),
        db.strategyPosition.count({ where: { strategyType, entryDate: today } }),
        db.strategyPosition.count({ where: { strategyType, status: "CLOSED", exitDate: today } }),
        db.strategySnapshot.findFirst({ where: { strategyType, snapshotDate: today }, select: { id: true } }),
      ]);
      const symbols = openPositions.map((p: any) => p.symbol);
      const hasDuplicates = new Set(symbols).size !== symbols.length;
      return {
        openPositions: openPositions.length,
        newOpensToday, closedToday,
        snapshotExists: !!snap,
        over10: openPositions.length > 10,
        hasDuplicates,
      };
    }
    const [swingExec, longExec] = await Promise.all([execSummary("SWING_TRADE"), execSummary("LONG_TRADE")]);

    // ── Backtest (latest asOfDate per strategy) ───────────────────────────────
    async function backtestSummary(strategyType: string) {
      const latest = await db.strategyBacktestSummary.findFirst({ where: { strategyType }, orderBy: { asOfDate: "desc" }, select: { asOfDate: true } });
      if (!latest) return { asOfDate: null, horizonCount: 0, horizons: [] as Array<{ horizon: string; maturity: string; fillRate: number | null }> };
      const rows = await db.strategyBacktestSummary.findMany({ where: { strategyType, asOfDate: latest.asOfDate }, orderBy: { horizon: "asc" }, select: { horizon: true, fillRate: true } });
      return {
        asOfDate: latest.asOfDate.toISOString().slice(0, 10),
        horizonCount: rows.length,
        horizons: rows.map((r: any) => ({ horizon: r.horizon, maturity: maturity(r.fillRate), fillRate: r.fillRate })),
      };
    }
    const [dayBacktest, swingBacktest, longBacktest] = await Promise.all([
      backtestSummary("DAY_TRADE"), backtestSummary("SWING_TRADE"), backtestSummary("LONG_TRADE"),
    ]);

    // ── Reports (weekly / monthly files) ──────────────────────────────────────
    function reportStatus(dir: string, pattern: RegExp, isDueFn: (today: Date) => boolean) {
      try {
        const full = path.join(process.cwd(), "reports", dir);
        const files = fs.existsSync(full) ? fs.readdirSync(full).filter(f => pattern.test(f)).sort() : [];
        const latest = files[files.length - 1] ?? null;
        let generatedThisPeriod = false;
        let updatedAt: string | null = null;
        if (latest) {
          const stat = fs.statSync(path.join(full, latest));
          updatedAt = stat.mtime.toISOString();
          generatedThisPeriod = isSameJstDay(stat.mtime, today) || (Date.now() - stat.mtime.getTime()) < 8 * 86400_000;
        }
        const due = isDueFn(today);
        const status: Severity = !latest && due ? "WARNING" : "NORMAL";
        return { latestFile: latest, generatedThisPeriod, updatedAt, status };
      } catch {
        return { latestFile: null, generatedThisPeriod: false, updatedAt: null, status: "WARNING" as Severity };
      }
    }
    const weeklyReport  = reportStatus("weekly",  /^\d{4}-W\d{2}\.md$/,   SATURDAY_ONLY);
    const monthlyReport = reportStatus("monthly", /^\d{4}-\d{2}\.md$/,    MONTH_END_ONLY);

    // ── PM2 / Cron ─────────────────────────────────────────────────────────────
    const pm2 = readPm2Status();
    const webProc  = pm2.processes.find(p => p.name === "tohoshou-web");
    const cronProc = pm2.processes.find(p => p.name === "tohoshou-cron");

    // Was cron-scheduler.ts deployed AFTER the running cron process started?
    // (rsync alone does not reload node-cron's in-memory schedule — see v17.24.0.)
    let cronStaleAfterDeploy = false;
    let cronStaleDeployAt: string | null = null;
    if (cronProc?.startedAt) {
      const cronStart = new Date(cronProc.startedAt).getTime();
      for (const dep of recentDeployments as Array<{ modifiedFiles: unknown; deployedAt: Date }>) {
        const files = Array.isArray(dep.modifiedFiles) ? dep.modifiedFiles as string[] : [];
        if (files.some(f => f.includes("cron-scheduler.ts")) && dep.deployedAt.getTime() > cronStart) {
          cronStaleAfterDeploy = true;
          cronStaleDeployAt = dep.deployedAt.toISOString();
          break;
        }
      }
    }

    const pm2Severity: Severity =
      !pm2.available ? "WARNING" :
      (cronProc?.status !== "online") ? "CRITICAL" :
      cronStaleAfterDeploy ? "WARNING" :
      (webProc?.status !== "online") ? "WARNING" :
      "NORMAL";

    // ── Today Pipeline steps ───────────────────────────────────────────────────
    // NOTE: compute-scores.ts runs nested inside sync-all-prices.ts's own
    // downstream chain (plain execSync, not cron-scheduler.ts's runAsync), so
    // it never gets a pipeline-runs.jsonl entry — the log for that stage is
    // permanently empty/stale. Use the actual StockScore freshness as the
    // ground-truth success signal for that one step instead of the log.
    // day_settle has the same blind spot whenever it's invoked outside the
    // cron wrapper (e.g. a manual catch-up run during an incident) — the
    // real question that matters operationally is "is there an unsettled
    // backlog", not "did today's specific invocation get logged".
    const dayCaughtUp = !latestDueDayTradeDate
      || (dayExec.lastSettledDate === latestDueDayTradeDate.tradeDate.toISOString().slice(0, 10));

    const groundTruthRanToday: Partial<Record<string, boolean>> = {
      compute_scores: todayScoreCount > 0,
      day_settle: dayCaughtUp,
    };

    const stepResults = STEP_DEFS.map(def => {
      const applies = def.appliesToday(today);
      const run = latestPerStage.get(def.stage) ?? null;
      const logRanToday = run ? isSameJstDay(new Date(run.finishedAt), today) : false;
      const ranToday = groundTruthRanToday[def.key] ?? logRanToday;
      const scheduledMinutes = def.scheduledHour * 60 + def.scheduledMinute;

      let status: StepStatus;
      if (!applies) {
        status = "SKIPPED";
      } else if (ranToday) {
        status = (def.key in groundTruthRanToday) ? "SUCCESS" : (run!.status === "SUCCESS" ? "SUCCESS" : "FAILED");
      } else if (nowMinutes < scheduledMinutes) {
        status = "WAITING";
      } else if (nowMinutes - scheduledMinutes > MISS_GRACE_MINUTES) {
        status = "FAILED";
      } else {
        status = "WAITING";
      }

      // Result summary — opportunistically reuse data already computed above.
      let resultSummary: string | null = null;
      if (status === "SUCCESS" || status === "FAILED") {
        switch (def.key) {
          case "sync_prices":
            resultSummary = `覆盖率 ${priceCoveragePct}% (${priceCoverageRows}/${stockTotal})${priceFailedCount ? `，失败 ${priceFailedCount}` : ""}`;
            break;
          case "compute_scores":
            resultSummary = `${todayScoreCount} 只股票已评分`;
            break;
          case "gen_recs":
            resultSummary = `DAY:${dayRec.total} SWING:${swingRec.total} LONG:${longRec.total}`;
            break;
          case "day_settle":
            resultSummary = dayExec.lastSettledDate === today.toISOString().slice(0, 10) || isSameJstDay(new Date(dayExec.lastSettledDate ?? 0), today)
              ? `结算 ${dayExec.lastSettledDate}：${dayExec.closedCount}笔成交，P&L ${dayExec.pnl != null ? (dayExec.pnl >= 0 ? "+" : "") + "¥" + dayExec.pnl.toLocaleString() : "—"}`
              : `最近结算：${dayExec.lastSettledDate ?? "无"}`;
            break;
          case "swing_update":
            resultSummary = `持仓${swingExec.openPositions}只，新开${swingExec.newOpensToday}，平仓${swingExec.closedToday}`;
            break;
          case "long_update":
            resultSummary = `持仓${longExec.openPositions}只，新开${longExec.newOpensToday}，平仓${longExec.closedToday}`;
            break;
          case "backtest":
            resultSummary = `DAY:${dayBacktest.horizonCount} SWING:${swingBacktest.horizonCount} LONG:${longBacktest.horizonCount} horizon`;
            break;
          case "learning":
            resultSummary = `DAY:${dayLearning?.grade ?? "—"} SWING:${swingLearning?.grade ?? "—"} LONG:${longLearning?.grade ?? "—"}`;
            break;
          case "validation":
            resultSummary = latestValidation ? `${9 - (latestValidation.failCount ?? 0)}/9 通过` : null;
            break;
          case "weekly_report":
            resultSummary = weeklyReport.latestFile;
            break;
          case "monthly_report":
            resultSummary = monthlyReport.latestFile;
            break;
          default:
            resultSummary = run?.errorMessage ? null : "完成";
        }
      }

      return {
        key: def.key,
        name: def.name,
        scheduledLabel: def.scheduledLabel,
        status,
        lastRunAt: run?.finishedAt ?? null,
        lastRunJst: run ? toJstClock(run.finishedAt) : null,
        durationMs: run?.durationMs ?? null,
        duration: fmtDuration(run?.durationMs ?? null),
        resultSummary,
        errorMessage: status === "FAILED" ? (run?.errorMessage ?? "逾期未执行") : null,
      };
    });

    const applicableSteps = stepResults.filter(s => s.status !== "SKIPPED");
    const completedSteps = applicableSteps.filter(s => s.status === "SUCCESS").length;

    // ── Strategy recommendations block ────────────────────────────────────────
    const strategyRecommendations = {
      DAY_TRADE: {
        total: dayRec.total, top10Count: dayRec.top10, latestTradeDate: dayRec.latestTradeDate?.toISOString().slice(0, 10) ?? null,
        status: (dayRec.total >= 100 ? "NORMAL" : "WARNING") as Severity,
      },
      SWING_TRADE: {
        total: swingRec.total, top10Count: swingRec.top10, latestTradeDate: swingRec.latestTradeDate?.toISOString().slice(0, 10) ?? null,
        status: (swingRec.total >= 100 ? "NORMAL" : "WARNING") as Severity,
      },
      LONG_TRADE: {
        total: longRec.total, top10Count: longRec.top10, latestTradeDate: longRec.latestTradeDate?.toISOString().slice(0, 10) ?? null,
        status: (longRec.top10 > 0 ? "NORMAL" : "WARNING") as Severity,
      },
    };

    // ── Validation block ───────────────────────────────────────────────────────
    const consecutiveHealthDays = (() => {
      let n = 0;
      for (const v of recentValidations as Array<{ healthOk: boolean }>) {
        if (!v.healthOk) break;
        n++;
      }
      return n;
    })();

    // ── Production status (top-level severity) ───────────────────────────────
    const severityRank: Record<Severity, number> = { NORMAL: 0, WARNING: 1, CRITICAL: 2 };
    let productionStatus: Severity = "NORMAL";
    const reasons: string[] = [];
    if (healthGuard.status === "CRITICAL" || healthGuard.critical > 0) { productionStatus = "CRITICAL"; reasons.push(`health:data CRITICAL=${healthGuard.critical}`); }
    else if (healthGuard.status === "WARNING" || healthGuard.warning > 0) { productionStatus = "WARNING"; reasons.push(`health:data WARNING=${healthGuard.warning}`); }
    if (severityRank[priceCoverageStatus] > severityRank[productionStatus]) { productionStatus = priceCoverageStatus; reasons.push(`DailyPrice coverage ${priceCoveragePct}%`); }
    if (severityRank[pm2Severity] > severityRank[productionStatus]) { productionStatus = pm2Severity; reasons.push(cronProc?.status !== "online" ? "tohoshou-cron not online" : "cron stale after deploy"); }

    return NextResponse.json({
      productionStatus: {
        status: productionStatus,
        healthCriticalCount: healthGuard.critical,
        healthWarningCount: healthGuard.warning,
        reasons,
        lastUpdated: healthGuard.auditAt,
      },
      todayPipeline: {
        completedSteps,
        totalSteps: applicableSteps.length,
        steps: stepResults,
      },
      dataFreshness: {
        dailyPrice: {
          latestDate: latestPriceRow?.date?.toISOString().slice(0, 10) ?? null,
          lastCompletedDate: lastCompletedDateStr,
          coveragePct: priceCoveragePct,
          stockCount: stockTotal,
          coveredCount: priceCoverageRows,
          failedCount: priceFailedCount,
          status: priceCoverageStatus,
        },
        news: {
          latestAt: latestNews?.publishedAt?.toISOString() ?? null,
          todayNewCount: todayNewsCount,
        },
        globalMarket: {
          latestDate: latestGm?.date?.toISOString().slice(0, 10) ?? null,
        },
        stockScore: {
          latestDate: latestScoreRow?.computedAt?.toISOString().slice(0, 10) ?? null,
          scoredTodayCount: todayScoreCount,
        },
      },
      strategyRecommendations,
      strategyExecutions: {
        DAY_TRADE: dayExec,
        SWING_TRADE: swingExec,
        LONG_TRADE: longExec,
      },
      backtest: {
        DAY_TRADE: dayBacktest,
        SWING_TRADE: swingBacktest,
        LONG_TRADE: longBacktest,
      },
      learning: {
        DAY_TRADE: dayLearning ? { reportDate: dayLearning.reportDate?.toISOString().slice(0, 10), grade: dayLearning.grade, recommendation: dayLearning.recommendation } : null,
        SWING_TRADE: swingLearning ? { reportDate: swingLearning.reportDate?.toISOString().slice(0, 10), grade: swingLearning.grade, recommendation: swingLearning.recommendation } : null,
        LONG_TRADE: longLearning ? { reportDate: longLearning.reportDate?.toISOString().slice(0, 10), grade: longLearning.grade, recommendation: longLearning.recommendation } : null,
        unified: unifiedLearning ? { reportDate: unifiedLearning.reportDate?.toISOString().slice(0, 10), integrityScore: unifiedLearning.integrityScore, grade: unifiedLearning.grade, recommendation: unifiedLearning.recommendation } : null,
      },
      validation: latestValidation ? {
        validationDate: latestValidation.validationDate?.toISOString().slice(0, 10),
        allPass: latestValidation.allPass,
        failCount: latestValidation.failCount,
        incidentCount: latestValidation.incidentReport ? latestValidation.incidentReport.split("\n").filter((l: string) => /^\d+\./.test(l)).length : 0,
        consecutiveHealthDays,
        phase7Ready: latestValidation.phase7Ready,
        phase7Detail: latestValidation.phase7Detail,
      } : null,
      reports: {
        weekly: weeklyReport,
        monthly: monthlyReport,
      },
      pm2: {
        available: pm2.available,
        web: webProc ?? null,
        cron: cronProc ?? null,
        cronStaleAfterDeploy,
        cronStaleDeployAt,
        severity: pm2Severity,
      },
      health: {
        status: healthGuard.status,
        criticalCount: healthGuard.critical,
        warningCount: healthGuard.warning,
        passCount: healthGuard.pass,
        auditAt: healthGuard.auditAt,
        topIssues: healthGuard.topIssues,
        warningIssues: healthGuard.warningIssues,
      },
      version: {
        schemaVersion: latestDrVersion?.schemaVersion ?? activeVersionSnapshot?.schemaVersion ?? null,
        modelVersion:  latestDrVersion?.modelVersion  ?? activeVersionSnapshot?.modelVersion  ?? null,
        scoreVersion:  latestDrVersion?.scoreVersion  ?? activeVersionSnapshot?.scoreVersion  ?? null,
        versionSnapshotId: latestDrVersion?.versionSnapshotId ?? activeVersionSnapshot?.id ?? null,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[mission-control-v2]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
