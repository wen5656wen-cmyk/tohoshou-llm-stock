#!/usr/bin/env npx tsx
/**
 * Strategy Daily Validation — Trading Architecture V1 Stabilization (T1)
 *
 * Runs at 17:15 JST (weekdays) after Strategy Learning Engine (17:00).
 * Performs 9 checks, writes to StrategyDailyValidation, emits Incident Report on failure.
 * Prunes records older than 45 calendar days (≈30 trading days).
 * Phase 7 readiness is evaluated on each run.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg }    from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);
const db = prisma as any;

// ── JST today ─────────────────────────────────────────────────────────────────

function jstToday(): Date {
  const now = new Date();
  const j = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  return new Date(Date.UTC(j.getFullYear(), j.getMonth(), j.getDate()));
}

// ── Grade helpers ─────────────────────────────────────────────────────────────

const GRADE_ORDER = ["A+", "A", "B", "C", "D"];

function gradeGe(grade: string | null, min: string): boolean {
  if (!grade) return false;
  return GRADE_ORDER.indexOf(grade) <= GRADE_ORDER.indexOf(min);
}

// ── Cumulative stats per strategy ─────────────────────────────────────────────

async function getCumStats(strategyType: string) {
  const [filledTotal, closedTotal, wins] = await Promise.all([
    db.strategyTradeResult.count({ where: { strategyType } }),
    db.strategyTradeResult.count({ where: { strategyType, status: "CLOSED" } }),
    db.strategyTradeResult.count({ where: { strategyType, status: "CLOSED", win: true } }),
  ]);
  return {
    filledTotal: filledTotal as number,
    closedTotal: closedTotal as number,
    winRate: closedTotal > 0 ? (wins as number) / (closedTotal as number) : null,
  };
}

async function getLatestGrade(strategyType: string): Promise<string | null> {
  const r = await db.strategyLearningReport.findFirst({
    where: { strategyType },
    orderBy: { reportDate: "desc" },
    select: { grade: true },
  });
  return r?.grade ?? null;
}

// ── Phase 7 readiness check ───────────────────────────────────────────────────

async function checkPhase7(
  dayFilled: number,
  swingClosed: number,
  longClosed: number,
  dayGrade: string | null,
  swingGrade: string | null,
  longGrade: string | null,
  today: Date,
): Promise<{ ready: boolean; detail: string; conditions: Array<{ key: string; met: boolean; current: string; target: string }> }> {

  // Check 30 consecutive trading days of healthOk
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 45);
  const recentRecords = await db.strategyDailyValidation.findMany({
    where: { validationDate: { gte: cutoff, lt: today } },
    orderBy: { validationDate: "desc" },
    take: 30,
    select: { healthOk: true },
  }) as Array<{ healthOk: boolean }>;

  const health30 = recentRecords.length >= 30 && recentRecords.every((r) => r.healthOk);

  const conditions = [
    { key: "day100",   met: dayFilled   >= 100, current: String(dayFilled),   target: "100" },
    { key: "swing30",  met: swingClosed >= 30,  current: String(swingClosed), target: "30"  },
    { key: "long20",   met: longClosed  >= 20,  current: String(longClosed),  target: "20"  },
    { key: "dayB",     met: gradeGe(dayGrade,   "B"), current: dayGrade   ?? "N/A", target: "B" },
    { key: "swingC",   met: gradeGe(swingGrade, "C"), current: swingGrade ?? "N/A", target: "C" },
    { key: "longC",    met: gradeGe(longGrade,  "C"), current: longGrade  ?? "N/A", target: "C" },
    { key: "health30", met: health30, current: `${recentRecords.filter((r) => r.healthOk).length}/${recentRecords.length}`, target: "30" },
  ];

  const ready = conditions.every((c) => c.met);
  const notMet = conditions.filter((c) => !c.met).map((c) => `${c.key}(${c.current}/${c.target})`);
  const detail = ready ? "ALL CONDITIONS MET" : `Pending: ${notMet.join(", ")}`;

  return { ready, detail, conditions };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const today = jstToday();
  const todayStr = today.toISOString().split("T")[0];
  console.log(`[strategy-daily-validation] Date: ${todayStr} JST`);

  const incidents: string[] = [];

  // ── Check 1-3: Recommendations ────────────────────────────────────────────
  const [dayRecCount, swingRecCount, longRecCount] = await Promise.all([
    db.strategyRecommendation.count({ where: { strategyType: "DAY_TRADE",   tradeDate: today } }),
    db.strategyRecommendation.count({ where: { strategyType: "SWING_TRADE", tradeDate: today } }),
    db.strategyRecommendation.count({ where: { strategyType: "LONG_TRADE",  tradeDate: today } }),
  ]) as [number, number, number];

  const dayRecOk   = dayRecCount   > 0;
  const swingRecOk = swingRecCount > 0;
  const longRecOk  = longRecCount  > 0;

  if (!dayRecOk)   incidents.push(`DAY_TRADE Recommendation: 0 rows for ${todayStr}`);
  if (!swingRecOk) incidents.push(`SWING_TRADE Recommendation: 0 rows for ${todayStr}`);
  if (!longRecOk)  incidents.push(`LONG_TRADE Recommendation: 0 rows for ${todayStr}`);

  // ── Check 4: Strategy execution (positions exist / capital tracked today) ──
  const [posTotal, capTodayTotal] = await Promise.all([
    db.strategyPosition.count(),
    db.strategyCapitalLog.count({ where: { logDate: today } }),
  ]) as [number, number];

  const strategyOk = posTotal > 0 || capTodayTotal > 0;
  if (!strategyOk) incidents.push(`Strategy: no StrategyPosition records and no StrategyCapitalLog for ${todayStr}`);

  // ── Check 5: Capital pool snapshot exists ─────────────────────────────────
  const capTotal = await db.strategyCapitalLog.count() as number;
  const snapshotOk = capTotal > 0;
  if (!snapshotOk) incidents.push(`Snapshot: no StrategyCapitalLog records found`);

  // ── Check 6: At least one TradeResult recorded ────────────────────────────
  const tradeTotal = await db.strategyTradeResult.count() as number;
  const tradeResultOk = tradeTotal > 0;
  if (!tradeResultOk) incidents.push(`TradeResult: no StrategyTradeResult records found`);

  // ── Check 7: Backtest updated today ──────────────────────────────────────
  const btTodayCount = await db.strategyBacktestSummary.count({ where: { asOfDate: today } }) as number;
  const backtestOk = btTodayCount > 0;
  if (!backtestOk) incidents.push(`Backtest: no StrategyBacktestSummary rows for ${todayStr}`);

  // ── Check 8: Learning updated today ──────────────────────────────────────
  const lrTodayCount = await db.strategyLearningReport.count({ where: { reportDate: today } }) as number;
  const learningOk = lrTodayCount > 0;
  if (!learningOk) incidents.push(`Learning: no StrategyLearningReport rows for ${todayStr}`);

  // ── Check 9: Health (derived — all time-critical checks must pass) ────────
  const healthOk = dayRecOk && swingRecOk && longRecOk && backtestOk && learningOk;
  if (!healthOk) incidents.push(`Health: ${[
    !dayRecOk && "dayRec", !swingRecOk && "swingRec", !longRecOk && "longRec",
    !backtestOk && "backtest", !learningOk && "learning",
  ].filter(Boolean).join(", ")} failed`);

  const allPass   = dayRecOk && swingRecOk && longRecOk && strategyOk && snapshotOk && tradeResultOk && backtestOk && learningOk && healthOk;
  const failCount = [dayRecOk, swingRecOk, longRecOk, strategyOk, snapshotOk, tradeResultOk, backtestOk, learningOk, healthOk].filter((v) => !v).length;

  // ── Incident report ───────────────────────────────────────────────────────
  let incidentReport: string | null = null;
  if (incidents.length > 0) {
    incidentReport = `[INCIDENT ${todayStr}]\n` + incidents.map((s, i) => `${i + 1}. ${s}`).join("\n");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error(incidentReport);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  // ── Cumulative stats ──────────────────────────────────────────────────────
  const [dayStats, swingStats, longStats] = await Promise.all([
    getCumStats("DAY_TRADE"),
    getCumStats("SWING_TRADE"),
    getCumStats("LONG_TRADE"),
  ]);

  const [dayGrade, swingGrade, longGrade] = await Promise.all([
    getLatestGrade("DAY_TRADE"),
    getLatestGrade("SWING_TRADE"),
    getLatestGrade("LONG_TRADE"),
  ]);

  // ── Phase 7 readiness ─────────────────────────────────────────────────────
  const phase7 = await checkPhase7(
    dayStats.filledTotal, swingStats.closedTotal, longStats.closedTotal,
    dayGrade, swingGrade, longGrade, today,
  );

  // ── Upsert to DB ──────────────────────────────────────────────────────────
  const data = {
    dayRecOk, swingRecOk, longRecOk,
    strategyOk, snapshotOk, tradeResultOk, backtestOk, learningOk, healthOk,
    allPass, failCount, incidentReport,
    dayFilledTotal:   dayStats.filledTotal,
    swingClosedTotal: swingStats.closedTotal,
    longClosedTotal:  longStats.closedTotal,
    dayWinRate:   dayStats.winRate,
    swingWinRate: swingStats.winRate,
    longWinRate:  longStats.winRate,
    dayGrade, swingGrade, longGrade,
    phase7Ready:  phase7.ready,
    phase7Detail: phase7.detail,
  };

  await db.strategyDailyValidation.upsert({
    where:  { validationDate: today },
    create: { validationDate: today, ...data },
    update: data,
  });

  // ── Prune (keep 45 days) ──────────────────────────────────────────────────
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 45);
  const pruned = await db.strategyDailyValidation.deleteMany({
    where: { validationDate: { lt: cutoff } },
  });
  if (pruned.count > 0) {
    console.log(`[strategy-daily-validation] Pruned ${pruned.count} old records`);
  }

  // ── Summary log ──────────────────────────────────────────────────────────
  const statusLine = allPass ? "ALL PASS ✅" : `FAIL (${failCount}/9) ❌`;
  console.log(`[strategy-daily-validation] ${todayStr}: ${statusLine}`);
  console.log(`  dayRec:${dayRecOk?1:0} swingRec:${swingRecOk?1:0} longRec:${longRecOk?1:0} strat:${strategyOk?1:0} snap:${snapshotOk?1:0} trade:${tradeResultOk?1:0} bt:${backtestOk?1:0} lr:${learningOk?1:0} health:${healthOk?1:0}`);
  console.log(`  Day:${dayGrade??"—"}(${dayStats.filledTotal}) Swing:${swingGrade??"—"}(${swingStats.closedTotal}) Long:${longGrade??"—"}(${longStats.closedTotal})`);
  console.log(`  Phase7: ${phase7.ready ? "READY 🚀" : "NOT READY"} — ${phase7.detail}`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("[strategy-daily-validation] FATAL:", e);
  process.exit(1);
});
