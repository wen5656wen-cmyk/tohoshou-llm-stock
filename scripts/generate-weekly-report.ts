#!/usr/bin/env npx tsx
/**
 * Generate Weekly Strategy Report (T2 P1)
 *
 * Runs Saturday 17:30 JST (after all weekday pipelines complete).
 * Computes per-strategy stats for the ISO week (Mon–Fri trades closed in JST).
 * Saves Markdown to reports/weekly/YYYY-Www.md.
 * Prunes files older than 13 weeks.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg }    from "@prisma/adapter-pg";
import { writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter } as any);
const db      = prisma as any;

const REPORTS_DIR = join(process.cwd(), "reports", "weekly");

// ── JST helpers ───────────────────────────────────────────────────────────────

function jstNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
}

/** Returns { weekStart (Mon 00:00 UTC), weekEnd (Sun 23:59:59.999 UTC), isoLabel e.g. "2026-W27" } */
function currentIsoWeekRange(): { weekStart: Date; weekEnd: Date; isoLabel: string } {
  const jst = jstNow();
  const dow  = jst.getDay(); // 0=Sun … 6=Sat
  const diffToMon = dow === 0 ? -6 : 1 - dow;

  const mon = new Date(jst);
  mon.setDate(jst.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);

  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);

  // Convert JST → UTC for DB queries (JST = UTC+9)
  const weekStart = new Date(mon.getTime() - 9 * 3600 * 1000);
  const weekEnd   = new Date(sun.getTime() - 9 * 3600 * 1000);

  // ISO week number
  const jan4 = new Date(Date.UTC(mon.getFullYear(), 0, 4));
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1));
  const weekNo = Math.ceil(
    ((weekStart.getTime() - startOfWeek1.getTime()) / 86400000 + 1) / 7,
  );
  const isoLabel = `${mon.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;

  return { weekStart, weekEnd, isoLabel };
}

// ── Strategy stats ─────────────────────────────────────────────────────────────

type TradeRow = {
  returnPct: number | null;
  alpha: number | null;
  win: boolean | null;
  holdingDays: number | null;
};

function computeStats(trades: TradeRow[]) {
  const closed = trades.filter((t) => t.win !== null);
  if (closed.length === 0) return null;

  const wins     = closed.filter((t) => t.win).length;
  const returns  = closed.map((t) => t.returnPct ?? 0);
  const alphas   = closed.filter((t) => t.alpha != null).map((t) => t.alpha!);
  const holdings = closed.filter((t) => t.holdingDays != null).map((t) => t.holdingDays!);

  const avgReturn = returns.reduce((s, v) => s + v, 0) / returns.length;
  const maxDD     = Math.min(...returns);
  const avgAlpha  = alphas.length > 0 ? alphas.reduce((s, v) => s + v, 0) / alphas.length : null;
  const avgHolding = holdings.length > 0 ? holdings.reduce((s, v) => s + v, 0) / holdings.length : null;

  return {
    count:       closed.length,
    winCount:    wins,
    winRate:     wins / closed.length,
    avgReturn,
    maxDD,
    avgAlpha,
    avgHolding,
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
  mkdirSync(REPORTS_DIR, { recursive: true });

  const { weekStart, weekEnd, isoLabel } = currentIsoWeekRange();
  console.log(`[weekly-report] Generating ${isoLabel}  (${weekStart.toISOString().slice(0, 10)} → ${weekEnd.toISOString().slice(0, 10)} UTC)`);

  const STRAT_TYPES = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const;
  const stratLabels = { DAY_TRADE: "Day Trade", SWING_TRADE: "Swing Trade", LONG_TRADE: "Long Trade" };

  const sections: string[] = [];

  let totalClosed = 0;
  let totalWins   = 0;

  for (const sType of STRAT_TYPES) {
    // Closed trades this week
    const trades = await db.strategyTradeResult.findMany({
      where: {
        strategyType: sType,
        status: "CLOSED",
        exitDate: { gte: weekStart, lte: weekEnd },
      },
      select: { returnPct: true, alpha: true, win: true, holdingDays: true },
    }) as TradeRow[];

    // All-time trade count
    const totalFilled = await db.strategyTradeResult.count({ where: { strategyType: sType } }) as number;

    // Latest learning report
    const lr = await db.strategyLearningReport.findFirst({
      where: { strategyType: sType },
      orderBy: { reportDate: "desc" },
      select: { grade: true, recommendation: true, integrityScore: true, reportDate: true },
    });

    const stats = computeStats(trades);
    totalClosed += stats?.count ?? 0;
    totalWins   += stats?.winCount ?? 0;

    const label = stratLabels[sType];
    let section = `### ${label}\n\n`;
    section += `| 指标 | 本周 |\n|------|------|\n`;
    section += `| 本周成交笔数 | ${stats?.count ?? 0} |\n`;
    section += `| 本周胜率 | ${stats ? fmtPct(stats.winRate * 100, 1) : "N/A"} |\n`;
    section += `| 本周平均收益 | ${stats ? fmtPct(stats.avgReturn) : "N/A"} |\n`;
    section += `| 本周平均超额 | ${stats ? fmtPct(stats.avgAlpha) : "N/A"} |\n`;
    section += `| 本周最大回撤 | ${stats ? fmtPct(stats.maxDD) : "N/A"} |\n`;
    section += `| 平均持仓天数 | ${stats?.avgHolding != null ? fmtNum(stats.avgHolding, 1) + "天" : "N/A"} |\n`;
    section += `| 累计总成交 | ${totalFilled} |\n`;
    section += `| 最新学习评级 | ${lr?.grade ?? "N/A"} |\n`;
    section += `| 推荐状态 | ${lr?.recommendation ?? "N/A"} |\n`;
    section += `| 学习完整性分 | ${lr?.integrityScore?.toFixed(1) ?? "N/A"} |\n`;

    sections.push(section);
  }

  // Health summary for the week
  const validations = await db.strategyDailyValidation.findMany({
    where: { validationDate: { gte: weekStart, lte: weekEnd } },
    orderBy: { validationDate: "asc" },
    select: { validationDate: true, allPass: true, failCount: true, healthOk: true, incidentReport: true },
  }) as Array<{ validationDate: Date; allPass: boolean; failCount: number; healthOk: boolean; incidentReport: string | null }>;

  const healthDays   = validations.filter((v) => v.healthOk).length;
  const incidentDays = validations.filter((v) => v.incidentReport).length;

  const overallWinRate = totalClosed > 0 ? `${((totalWins / totalClosed) * 100).toFixed(1)}%` : "N/A";

  const now     = new Date();
  const jstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const dateStr = jstDate.toISOString().slice(0, 10);

  const md = [
    `# Weekly Strategy Report — ${isoLabel}`,
    ``,
    `**生成时间：** ${dateStr} JST  `,
    `**报告周期：** ${weekStart.toISOString().slice(0, 10)} → ${weekEnd.toISOString().slice(0, 10)}  `,
    `**系统状态：** Trading Architecture V1 稳定化阶段`,
    ``,
    `---`,
    ``,
    `## 本周汇总`,
    ``,
    `| 指标 | 数值 |`,
    `|------|------|`,
    `| 本周已结算总笔数 | ${totalClosed} |`,
    `| 本周综合胜率 | ${overallWinRate} |`,
    `| 健康检查通过天数 | ${healthDays} / ${validations.length} |`,
    `| 异常事件天数 | ${incidentDays} |`,
    ``,
    `---`,
    ``,
    `## 分策略表现`,
    ``,
    ...sections,
    `---`,
    ``,
    `## 本周健康日志`,
    ``,
    validations.length === 0
      ? `本周无健康检查记录。`
      : validations
          .map((v) => {
            const dateLabel = new Date(v.validationDate).toISOString().slice(0, 10);
            const status    = v.allPass ? "✅ ALL PASS" : `❌ FAIL (${v.failCount}/9)`;
            return `- **${dateLabel}**: ${status}${v.incidentReport ? " — 有异常报告" : ""}`;
          })
          .join("\n"),
    ``,
    `---`,
    ``,
    `*本报告由系统自动生成 (generate-weekly-report.ts)。如有数据问题请检查对应日期的 StrategyDailyValidation 记录。*`,
  ].join("\n");

  const outPath = join(REPORTS_DIR, `${isoLabel}.md`);
  writeFileSync(outPath, md, "utf-8");
  console.log(`[weekly-report] Saved: ${outPath}`);

  // Prune files older than 13 weeks (91 days)
  const cutoffMs = Date.now() - 91 * 24 * 3600 * 1000;
  const files = readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".md") && f !== ".gitkeep");
  for (const f of files) {
    // filename: YYYY-Www.md → parse year + week
    const m = f.match(/^(\d{4})-W(\d{2})\.md$/);
    if (!m) continue;
    const [, yr, wk] = m;
    // Approximate: week 1 of year = Jan 4
    const jan4 = new Date(Date.UTC(Number(yr), 0, 4));
    const startOfWeek1 = new Date(jan4);
    startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1));
    const approxMs = startOfWeek1.getTime() + (Number(wk) - 1) * 7 * 24 * 3600 * 1000;
    if (approxMs < cutoffMs) {
      unlinkSync(join(REPORTS_DIR, f));
      console.log(`[weekly-report] Pruned: ${f}`);
    }
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("[weekly-report] FATAL:", e);
  process.exit(1);
});
