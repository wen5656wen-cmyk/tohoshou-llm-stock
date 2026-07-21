// 🔒 P21-P0-API-G2 · 访问级别：ADMIN_ONLY（内部研究 / 实验 / 回测 / 系统状态）
//
// 不属于公开市场数据，也不属于 Boss 决策读取 —— 是内部评分实验、Shadow/Freeze/
// Calibration、融合模型、Alpha 分析与回测、研究资料与 Review、系统健康与内部业绩。
// 封闭前状态：未登录公网可读（P21-P0-API 审计实测 200）。
//
// 凭证与 AUTHENTICATED 本轮相同（单租户，尚无用户体系），但**逻辑等级更高**：
// 后续拆权限时本文件应保持管理员级，不随 AUTHENTICATED 一起下放。
import { guardAdminRoute } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type StratType = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";
const ALL: StratType[] = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"];

function jstToday(): Date {
  const now = new Date();
  const j = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  return new Date(Date.UTC(j.getFullYear(), j.getMonth(), j.getDate()));
}

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  try {
    const today = jstToday();

    const [
      openPositionCounts,
      closedTradeCounts,
      latestLearning,
      latestBacktests,
      latestSnapshots,
      latestRecs,
      unifiedSummary,
      latestValidation,
      recentValidations,
      totalValidations,
    ] = await Promise.all([
      // Open position count per strategy
      (prisma as any).strategyPosition.groupBy({
        by: ["strategyType"],
        where: { status: "OPEN" },
        _count: { id: true },
      }),
      // Closed trade count per strategy
      (prisma as any).strategyTradeResult.groupBy({
        by: ["strategyType"],
        where: { status: "CLOSED" },
        _count: { id: true },
      }),
      // Latest learning report per strategy
      Promise.all(
        ALL.map((s) =>
          (prisma as any).strategyLearningReport.findFirst({
            where: { strategyType: s },
            orderBy: { reportDate: "desc" },
            select: {
              strategyType:    true,
              reportDate:      true,
              grade:           true,
              recommendation:  true,
              integrityScore:  true,
              predictionScore: true,
              stabilityScore:  true,
              confidenceScore: true,
              winRate:         true,
              alpha:           true,
              summary:         true,
            },
          }),
        ),
      ),
      // Best backtest per strategy (highest filledCount)
      Promise.all(
        ALL.map((s) =>
          (prisma as any).strategyBacktestSummary.findFirst({
            where: { strategyType: s, filledCount: { gt: 0 } },
            orderBy: [{ filledCount: "desc" }, { asOfDate: "desc" }],
            select: {
              horizon:      true,
              winRate:      true,
              alpha:        true,
              fillRate:     true,
              avgReturnPct: true,
              maxDrawdown:  true,
              asOfDate:     true,
            },
          }),
        ),
      ),
      // Latest snapshot per strategy
      Promise.all(
        ALL.map((s) =>
          (prisma as any).strategySnapshot.findFirst({
            where: { strategyType: s },
            orderBy: { snapshotDate: "desc" },
            select: {
              snapshotDate:        true,
              cumulativeReturnPct: true,
              alpha:               true,
              winRate:             true,
              openPositions:       true,
              closedTrades:        true,
              cash:                true,
              investedValue:       true,
              totalValue:          true,
            },
          }),
        ),
      ),
      // Latest recommendation counts per strategy
      Promise.all(
        ALL.map(async (s) => {
          const latest = await (prisma as any).strategyRecommendation.findFirst({
            where: { strategyType: s },
            orderBy: { tradeDate: "desc" },
            select: { tradeDate: true },
          });
          if (!latest) return { strategyType: s, tradeDate: null, top10Count: 0, top100Count: 0 };
          const [top10Count, top100Count] = await Promise.all([
            (prisma as any).strategyRecommendation.count({
              where: { strategyType: s, tradeDate: latest.tradeDate, isTop10: true },
            }),
            (prisma as any).strategyRecommendation.count({
              where: { strategyType: s, tradeDate: latest.tradeDate },
            }),
          ]);
          return { strategyType: s, tradeDate: latest.tradeDate, top10Count, top100Count };
        }),
      ),
      // Unified learning summary
      (prisma as any).strategyLearningSummary.findFirst({
        orderBy: { reportDate: "desc" },
        select: {
          reportDate:     true,
          integrityScore: true,
          grade:          true,
          recommendation: true,
          dayIntegrity:   true,
          swingIntegrity: true,
          longIntegrity:  true,
        },
      }),
      // Latest daily validation (most recent)
      (prisma as any).strategyDailyValidation.findFirst({
        orderBy: { validationDate: "desc" },
        select: {
          validationDate: true,
          dayRecOk:       true,
          swingRecOk:     true,
          longRecOk:      true,
          backtestOk:     true,
          learningOk:     true,
          healthOk:       true,
          allPass:        true,
          failCount:      true,
          phase7Ready:    true,
          phase7Detail:   true,
        },
      }),
      // Recent validations (last 30 days)
      (prisma as any).strategyDailyValidation.findMany({
        orderBy: { validationDate: "desc" },
        take: 30,
        select: { healthOk: true },
      }),
      // Total validation count (for stableDays)
      (prisma as any).strategyDailyValidation.count(),
    ]);

    // ── Day Trade settlement check (P0 fix, 2026-07-01) ─────────────────────
    // StrategyDailyValidation.dayRecOk only checks that a StrategyRecommendation
    // was generated for today — it says nothing about whether the previous
    // trading day's Day Trade was actually SETTLED (StrategyTradeResult /
    // StrategySnapshot written). That gap is exactly how Strategy Center kept
    // showing "healthy" for days while Day Trade's cron silently produced zero
    // trades from 2026-06-26 onward. Check the most recent DAY_TRADE
    // recommendation date strictly before today (the day that should already
    // be settled under T+1 timing) directly against TradeResult/Snapshot.
    const latestPastDayRec = await (prisma as any).strategyRecommendation.findFirst({
      where: { strategyType: "DAY_TRADE", tradeDate: { lt: today } },
      orderBy: { tradeDate: "desc" },
      select: { tradeDate: true },
    });
    let dayTradeSettlement: {
      settledDate: string | null;
      tradeResultOk: boolean;
      snapshotOk: boolean;
    } = { settledDate: null, tradeResultOk: true, snapshotOk: true };
    if (latestPastDayRec) {
      const [trCount, snapCount] = await Promise.all([
        (prisma as any).strategyTradeResult.count({
          where: { strategyType: "DAY_TRADE", tradeDate: latestPastDayRec.tradeDate },
        }),
        (prisma as any).strategySnapshot.count({
          where: { strategyType: "DAY_TRADE", snapshotDate: latestPastDayRec.tradeDate },
        }),
      ]);
      dayTradeSettlement = {
        settledDate: new Date(latestPastDayRec.tradeDate).toISOString().slice(0, 10),
        tradeResultOk: trCount > 0,
        snapshotOk: snapCount > 0,
      };
    }

    const openMap   = new Map(openPositionCounts.map((r: any) => [r.strategyType, r._count.id]));
    const closedMap = new Map(closedTradeCounts.map((r: any) => [r.strategyType, r._count.id]));

    const strategies: Record<string, object> = {};
    for (let i = 0; i < ALL.length; i++) {
      const s = ALL[i];
      strategies[s] = {
        openPositions:   openMap.get(s)  ?? 0,
        closedTrades:    closedMap.get(s) ?? 0,
        learning:        latestLearning[i],
        bestBacktest:    latestBacktests[i],
        latestSnapshot:  latestSnapshots[i],
        recommendations: latestRecs[i],
      };
    }

    // Today's execution status (use latest validation, compare date to today)
    let todayExecution = null;
    if (latestValidation) {
      const valDate = new Date(latestValidation.validationDate).toISOString().slice(0, 10);
      const todayStr = today.toISOString().slice(0, 10);
      todayExecution = {
        dayRecOk:    latestValidation.dayRecOk,
        swingRecOk:  latestValidation.swingRecOk,
        longRecOk:   latestValidation.longRecOk,
        backtestOk:  latestValidation.backtestOk,
        learningOk:  latestValidation.learningOk,
        healthOk:    latestValidation.healthOk,
        validDate:   valDate,
        isToday:     valDate === todayStr,
        // Day Trade settlement — independent of dayRecOk (recommendation ≠ settlement)
        dayTradeSettledDate:   dayTradeSettlement.settledDate,
        dayTradeResultOk:      dayTradeSettlement.tradeResultOk,
        dayTradeSnapshotOk:    dayTradeSettlement.snapshotOk,
      };
    }

    // Recent validation summary
    const healthDays = (recentValidations as any[]).filter((v: any) => v.healthOk).length;
    const totalDays  = (recentValidations as any[]).length;

    const recentValidation = latestValidation ? {
      healthDays,
      totalDays,
      phase7Ready:  latestValidation.phase7Ready,
      phase7Detail: latestValidation.phase7Detail,
      stableDays:   totalValidations as number,
    } : null;

    return NextResponse.json({
      strategies,
      unified: unifiedSummary,
      todayExecution,
      recentValidation,
    });
  } catch (e: any) {
    console.error("[strategy/overview]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
