#!/usr/bin/env npx tsx
/**
 * Generate Monthly Strategy Report (T2 P1)
 *
 * Runs on the last trading day of each month at 18:00 JST.
 * Cron pattern: "0 18 28-31 * *" → check inside if tomorrow is a new month.
 * Saves Markdown to reports/monthly/YYYY-MM.md.
 * Prunes files older than 12 months.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg }    from "@prisma/adapter-pg";
import { writeFileSync, readdirSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter } as any);
const db      = prisma as any;

const REPORTS_DIR = join(process.cwd(), "reports", "monthly");

// ── Env guard — allow forcing generation for testing ─────────────────────────
const FORCE = process.env.FORCE === "1";

// ── JST helpers ───────────────────────────────────────────────────────────────

function jstNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
}

/** Returns true if "tomorrow JST" is in a different month than "today JST" */
function isLastDayOfMonth(): boolean {
  const today = jstNow();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return today.getMonth() !== tomorrow.getMonth();
}

/** Returns { monthStart, monthEnd (UTC), monthLabel "YYYY-MM" } for current JST month */
function currentMonthRange(): { monthStart: Date; monthEnd: Date; monthLabel: string } {
  const jst  = jstNow();
  const year = jst.getFullYear();
  const mon  = jst.getMonth(); // 0-indexed

  // JST month boundaries → UTC (JST = UTC+9)
  const monthStart = new Date(Date.UTC(year, mon, 1, 0, 0, 0) - 9 * 3600 * 1000);
  const monthEnd   = new Date(Date.UTC(year, mon + 1, 0, 23, 59, 59, 999) - 9 * 3600 * 1000);
  const monthLabel = `${year}-${String(mon + 1).padStart(2, "0")}`;

  return { monthStart, monthEnd, monthLabel };
}

// ── Stats helpers ─────────────────────────────────────────────────────────────

type TradeRow = {
  returnPct:    number | null;
  alpha:        number | null;
  win:          boolean | null;
  holdingDays:  number | null;
  investedAmount: number | null;
  exitValue:    number | null;
};

function computeStats(trades: TradeRow[]) {
  const closed = trades.filter((t) => t.win !== null);
  if (closed.length === 0) return null;

  const wins     = closed.filter((t) => t.win).length;
  const returns  = closed.map((t) => t.returnPct ?? 0);
  const alphas   = closed.filter((t) => t.alpha != null).map((t) => t.alpha!);
  const holdings = closed.filter((t) => t.holdingDays != null).map((t) => t.holdingDays!);

  const avgReturn  = returns.reduce((s, v) => s + v, 0) / returns.length;
  const maxDD      = Math.min(...returns);
  const avgAlpha   = alphas.length > 0 ? alphas.reduce((s, v) => s + v, 0) / alphas.length : null;
  const avgHolding = holdings.length > 0 ? holdings.reduce((s, v) => s + v, 0) / holdings.length : null;

  // Sharpe approximation: avgReturn / stdDev (annualized if we had daily; use monthly proxy)
  const variance = returns.map((r) => (r - avgReturn) ** 2).reduce((s, v) => s + v, 0) / returns.length;
  const stdDev   = Math.sqrt(variance);
  const sharpe   = stdDev > 0 ? avgReturn / stdDev : null;

  // Sortino: downside deviation only
  const downReturns   = returns.filter((r) => r < 0);
  const downVariance  = downReturns.map((r) => r ** 2).reduce((s, v) => s + v, 0) / (returns.length || 1);
  const downsideDev   = Math.sqrt(downVariance);
  const sortino       = downsideDev > 0 ? avgReturn / downsideDev : null;

  return {
    count: closed.length,
    winCount: wins,
    winRate:  wins / closed.length,
    avgReturn,
    maxDD,
    avgAlpha,
    avgHolding,
    sharpe,
    sortino,
  };
}

function fmtPct(v: number | null, dec = 2): string {
  if (v == null) return "N/A";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}
function fmtNum(v: number | null, dec = 2): string {
  if (v == null) return "N/A";
  return v.toFixed(dec);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Guard: only run on the last day of the month (unless forced)
  if (!FORCE && !isLastDayOfMonth()) {
    const jst = jstNow();
    console.log(`[monthly-report] Skipped — today (${jst.toISOString().slice(0, 10)} JST) is not the last day of the month. Use FORCE=1 to override.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  mkdirSync(REPORTS_DIR, { recursive: true });

  const { monthStart, monthEnd, monthLabel } = currentMonthRange();
  console.log(`[monthly-report] Generating ${monthLabel}  (${monthStart.toISOString().slice(0, 10)} → ${monthEnd.toISOString().slice(0, 10)} UTC)`);

  const STRAT_TYPES = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const;
  const stratLabels = { DAY_TRADE: "Day Trade", SWING_TRADE: "Swing Trade", LONG_TRADE: "Long Trade" };

  const sections: string[] = [];
  let totalClosed = 0;
  let totalWins   = 0;

  for (const sType of STRAT_TYPES) {
    const trades = await db.strategyTradeResult.findMany({
      where: {
        strategyType: sType,
        status: "CLOSED",
        exitDate: { gte: monthStart, lte: monthEnd },
      },
      select: { returnPct: true, alpha: true, win: true, holdingDays: true, investedAmount: true, exitValue: true },
    }) as TradeRow[];

    const totalFilled = await db.strategyTradeResult.count({ where: { strategyType: sType } }) as number;

    // All grades for this month from learning reports
    const lrRecords = await db.strategyLearningReport.findMany({
      where: {
        strategyType: sType,
        reportDate: { gte: monthStart, lte: monthEnd },
      },
      orderBy: { reportDate: "asc" },
      select: { grade: true, recommendation: true, integrityScore: true, reportDate: true },
    }) as Array<{ grade: string | null; recommendation: string | null; integrityScore: number | null; reportDate: Date }>;

    const latestLr  = lrRecords[lrRecords.length - 1] ?? null;
    const firstLr   = lrRecords[0] ?? null;
    const gradeChange = (firstLr && latestLr && firstLr.grade !== latestLr.grade)
      ? `${firstLr.grade ?? "N/A"} → ${latestLr.grade ?? "N/A"}`
      : "无变化";

    const stats = computeStats(trades);
    totalClosed += stats?.count ?? 0;
    totalWins   += stats?.winCount ?? 0;

    const label = stratLabels[sType];
    let section = `### ${label}\n\n`;
    section += `| 指标 | 本月 |\n|------|------|\n`;
    section += `| 本月成交笔数 | ${stats?.count ?? 0} |\n`;
    section += `| 本月胜率 | ${stats ? fmtPct(stats.winRate * 100, 1) : "N/A"} |\n`;
    section += `| 本月平均收益 | ${stats ? fmtPct(stats.avgReturn) : "N/A"} |\n`;
    section += `| 本月平均超额 | ${stats ? fmtPct(stats.avgAlpha) : "N/A"} |\n`;
    section += `| 本月最大回撤 | ${stats ? fmtPct(stats.maxDD) : "N/A"} |\n`;
    section += `| 平均持仓天数 | ${stats?.avgHolding != null ? fmtNum(stats.avgHolding, 1) + "天" : "N/A"} |\n`;
    section += `| Sharpe（样本内） | ${stats?.sharpe != null ? fmtNum(stats.sharpe, 3) : "N/A"} |\n`;
    section += `| Sortino（样本内） | ${stats?.sortino != null ? fmtNum(stats.sortino, 3) : "N/A"} |\n`;
    section += `| 累计总成交 | ${totalFilled} |\n`;
    section += `| 本月评级变化 | ${gradeChange} |\n`;
    section += `| 月末评级 | ${latestLr?.grade ?? "N/A"} |\n`;
    section += `| 月末推荐状态 | ${latestLr?.recommendation ?? "N/A"} |\n`;
    section += `| 月末学习完整性 | ${latestLr?.integrityScore?.toFixed(1) ?? "N/A"} |\n`;

    sections.push(section);
  }

  // Daily validations for this month
  const validations = await db.strategyDailyValidation.findMany({
    where: { validationDate: { gte: monthStart, lte: monthEnd } },
    orderBy: { validationDate: "asc" },
    select: { validationDate: true, allPass: true, failCount: true, healthOk: true, phase7Ready: true, incidentReport: true },
  }) as Array<{ validationDate: Date; allPass: boolean; failCount: number; healthOk: boolean; phase7Ready: boolean; incidentReport: string | null }>;

  const healthDays    = validations.filter((v) => v.healthOk).length;
  const incidentDays  = validations.filter((v) => v.incidentReport).length;
  const phase7DaysOk  = validations.filter((v) => v.phase7Ready).length;
  const overallWinRate = totalClosed > 0
    ? `${((totalWins / totalClosed) * 100).toFixed(1)}%`
    : "N/A";

  const now     = new Date();
  const jstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const dateStr = jstDate.toISOString().slice(0, 10);

  // Incident summary
  const incidents = validations
    .filter((v) => v.incidentReport)
    .map((v) => {
      const d = new Date(v.validationDate).toISOString().slice(0, 10);
      return `- **${d}**: ${v.incidentReport!.split("\n")[0]}`;
    });

  const md = [
    `# Monthly Strategy Report — ${monthLabel}`,
    ``,
    `**生成时间：** ${dateStr} JST  `,
    `**报告周期：** ${monthStart.toISOString().slice(0, 10)} → ${monthEnd.toISOString().slice(0, 10)}  `,
    `**系统状态：** Trading Architecture V1 稳定化阶段`,
    ``,
    `---`,
    ``,
    `## 月度汇总`,
    ``,
    `| 指标 | 数值 |`,
    `|------|------|`,
    `| 月度已结算总笔数 | ${totalClosed} |`,
    `| 月度综合胜率 | ${overallWinRate} |`,
    `| 健康检查通过天数 | ${healthDays} / ${validations.length} |`,
    `| 异常事件天数 | ${incidentDays} |`,
    `| Phase 7 就绪天数 | ${phase7DaysOk} / ${validations.length} |`,
    ``,
    `---`,
    ``,
    `## 分策略表现`,
    ``,
    ...sections,
    `---`,
    ``,
    `## 月度异常事件`,
    ``,
    incidents.length === 0 ? `本月无异常事件 ✅` : incidents.join("\n"),
    ``,
    `---`,
    ``,
    `## 月度健康趋势`,
    ``,
    validations.length === 0
      ? `本月无健康检查记录。`
      : validations
          .map((v) => {
            const dateLabel = new Date(v.validationDate).toISOString().slice(0, 10);
            const status    = v.allPass ? "✅" : `❌(${v.failCount})`;
            const p7        = v.phase7Ready ? "🚀" : "";
            return `| ${dateLabel} | ${status} ${p7} |`;
          })
          .join("\n"),
    ``,
    `---`,
    ``,
    `*本报告由系统自动生成 (generate-monthly-report.ts)。*`,
  ].join("\n");

  const outPath = join(REPORTS_DIR, `${monthLabel}.md`);
  writeFileSync(outPath, md, "utf-8");
  console.log(`[monthly-report] Saved: ${outPath}`);

  // Prune files older than 12 months
  const cutoffMs = Date.now() - 366 * 24 * 3600 * 1000;
  const files = readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".md") && f !== ".gitkeep");
  for (const f of files) {
    const m = f.match(/^(\d{4})-(\d{2})\.md$/);
    if (!m) continue;
    const approxMs = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).getTime();
    if (approxMs < cutoffMs) {
      unlinkSync(join(REPORTS_DIR, f));
      console.log(`[monthly-report] Pruned: ${f}`);
    }
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("[monthly-report] FATAL:", e);
  process.exit(1);
});
