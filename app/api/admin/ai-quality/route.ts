// 🔒 P22-S2 · 访问级别：ADMIN_ONLY（AI 质量分析）
//
// AI 模型质量看板的**唯一聚合入口**。前端只调此一个 API（禁止前端并发多接口）。
// 纯只读：仅 count / aggregate / groupBy / findMany，绝不写库、不触发流水线、
// 不改任何评分/推荐/Decision/Alpha/Fusion。
//
// 数据来源全部为已落库的真实历史，无 Mock / 无随机 / 无演示值。
// 某区域无数据时返回 null / 空数组，由前端显示 "No Data" —— 绝不编造。
//
// ⚠️ API 禁返展示文案（本项目红线）：只返回 code / 数字 / 枚举 / 时间戳，
//    展示语言由前端 quality.* i18n 渲染。

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdminRoute } from "@/lib/admin-auth";
import { readPhases, jstDay } from "@/lib/monitor/aggregate";

export const dynamic = "force-dynamic";

/** 样本标准差（波动度量）。<2 点返回 null（不编造）。 */
function stddev(xs: number[]): number | null {
  const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const today = jstDay();
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayMidnight = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));

  // ── ① 今日推荐质量：当前全市场评级分布 + 评分统计 ────────────────────────────
  const [ratingGroups, scoreAgg] = await Promise.all([
    prisma.stockScore.groupBy({ by: ["recommendationV2"], _count: { _all: true }, where: { recommendationV2: { not: null } } }),
    prisma.stockScore.aggregate({ _avg: { adaptiveScore: true }, _max: { adaptiveScore: true }, _min: { adaptiveScore: true }, _count: { adaptiveScore: true }, where: { adaptiveScore: { not: null } } }),
  ]);
  const ratingMap: Record<string, number> = {};
  for (const g of ratingGroups) if (g.recommendationV2) ratingMap[g.recommendationV2] = g._count._all;
  const recQuality = {
    strongBuy: ratingMap.STRONG_BUY ?? 0, buy: ratingMap.BUY ?? 0, hold: ratingMap.HOLD ?? 0,
    watch: ratingMap.WATCH ?? 0, avoid: ratingMap.AVOID ?? 0,
    total: Object.values(ratingMap).reduce((a, b) => a + b, 0),
    avgScore: scoreAgg._avg.adaptiveScore, maxScore: scoreAgg._max.adaptiveScore, minScore: scoreAgg._min.adaptiveScore,
    scoredCount: scoreAgg._count.adaptiveScore,
  };

  // ── ⑤ 评分分布直方图（adaptiveScore 6 桶）───────────────────────────────────
  const buckets = [
    { key: "95+", where: { adaptiveScore: { gte: 95 } } },
    { key: "90-94", where: { adaptiveScore: { gte: 90, lt: 95 } } },
    { key: "85-89", where: { adaptiveScore: { gte: 85, lt: 90 } } },
    { key: "80-84", where: { adaptiveScore: { gte: 80, lt: 85 } } },
    { key: "75-79", where: { adaptiveScore: { gte: 75, lt: 80 } } },
    { key: "<75", where: { adaptiveScore: { lt: 75 } } },
  ];
  const bucketCounts = await Promise.all(buckets.map((b) => prisma.stockScore.count({ where: b.where })));
  const scoreDistribution = buckets.map((b, i) => ({ bucket: b.key, count: bucketCounts[i] }));

  // ── ② 推荐命中率 7/30/90 天：BacktestResult（各 horizon 最新）+ 今日涨跌持平 ──
  const horizons = ["7d", "30d", "90d"];
  const btRows = await Promise.all(
    horizons.map((h) => prisma.backtestResult.findFirst({ where: { horizon: h }, orderBy: { date: "desc" } }))
  );
  const hitRate = horizons.map((h, i) => {
    const r = btRows[i];
    return r ? {
      horizon: h, date: r.date.toISOString().slice(0, 10), winRate: r.winRate, avgReturn: r.avgReturn,
      filled: r.filled, winners: r.winners, losers: r.losers, total: r.totalRecommendations,
    } : { horizon: h, date: null, winRate: null, avgReturn: null, filled: null, winners: null, losers: null, total: null };
  });
  const latestSignal = await prisma.aISignalDailyStat.findFirst({ where: { actionType: "ALL_BUY" }, orderBy: { tradeDate: "desc" } });
  const todayMovement = latestSignal ? {
    date: latestSignal.tradeDate.toISOString().slice(0, 10),
    up: (latestSignal.bigUpTodayCount ?? 0) + (latestSignal.smallUpTodayCount ?? 0),
    down: (latestSignal.bigDownTodayCount ?? 0) + (latestSignal.smallDownTodayCount ?? 0),
    flat: latestSignal.todayFlatCount ?? 0, winRate: latestSignal.todayWinRate,
    valid: latestSignal.validTodayCount ?? 0,
  } : null;

  // ── ③ 策略收益 DAY/SWING/LONG：StrategyBacktestSummary 各 type 最新 ──────────
  const stratTypes = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const;
  const stratRows = await Promise.all(
    stratTypes.map((st) => prisma.strategyBacktestSummary.findFirst({ where: { strategyType: st }, orderBy: { asOfDate: "desc" } }))
  );
  const strategies = stratTypes.map((st, i) => {
    const r = stratRows[i];
    return r ? {
      type: st, asOfDate: r.asOfDate.toISOString().slice(0, 10), horizon: r.horizon,
      // StrategyBacktestSummary.winRate 为 0-1 小数；归一化到 0-100 与 BacktestResult 同口径
      winRate: r.winRate != null ? r.winRate * 100 : null,
      avgReturn: r.avgReturnPct, maxReturn: r.maxReturnPct, minReturn: r.minReturnPct,
      maxDrawdown: r.maxDrawdown, sharpe: r.sharpeRatio, sampleCount: r.sampleCount,
    } : { type: st, asOfDate: null, horizon: null, winRate: null, avgReturn: null, maxReturn: null, minReturn: null, maxDrawdown: null, sharpe: null, sampleCount: 0 };
  });

  // ── ④ Alpha：组合快照收益 vs TOPIX 基准（超额收益）。Beta 无回归数据源 → null ─
  const latestSnap = await prisma.portfolioSnapshot.findFirst({ where: { status: "LIVE" }, orderBy: { snapshotDate: "desc" } });
  const decis30 = await prisma.closingDecision.findMany({
    where: { date: { gte: new Date(Date.now() - 32 * 86400_000) } }, orderBy: { date: "asc" },
    select: { date: true, verdict: true, avgAiScore: true, regime: true },
  });
  // 超额趋势用各 horizon BacktestResult 的 avgReturn 作为方向性代理（真实回测收益）
  const alpha = {
    // Alpha/Beta 需要组合净值回归，当前无逐日净值回归产物 → 诚实标注 null（前端 No Data）
    alpha: null as number | null, beta: null as number | null,
    excessReturnByHorizon: hitRate.map((h) => ({ horizon: h.horizon, avgReturn: h.avgReturn })),
    snapshotDate: latestSnap?.snapshotDate?.toISOString().slice(0, 10) ?? null,
  };

  // ── ⑥ AI 稳定性：评分/Decision/Recommendation 波动（30 天）──────────────────
  const aiScores = decis30.map((d) => d.avgAiScore).filter((x): x is number => typeof x === "number");
  const verdicts = decis30.map((d) => d.verdict);
  const verdictChanges = verdicts.reduce((n, v, i) => (i > 0 && v !== verdicts[i - 1] ? n + 1 : n), 0);
  const signal30 = await prisma.aISignalDailyStat.findMany({
    where: { actionType: "ALL_BUY", tradeDate: { gte: new Date(Date.now() - 32 * 86400_000) } },
    orderBy: { tradeDate: "asc" }, select: { tradeDate: true, todayWinRate: true },
  });
  const winRates = signal30.map((s) => s.todayWinRate).filter((x): x is number => typeof x === "number");
  const stability = {
    scoreStddev: stddev(aiScores), scoreDays: aiScores.length,
    decisionChanges: verdictChanges, decisionDays: verdicts.length,
    recommendationWinRateStddev: stddev(winRates), recommendationDays: winRates.length,
    scoreTrend: decis30.map((d) => ({ date: d.date.toISOString().slice(0, 10), avgAiScore: d.avgAiScore })),
  };

  // ── ⑦ 最近 30 笔推荐表现：StrategyTradeResult（已结算，最新在前）────────────
  const recentTrades = await prisma.strategyTradeResult.findMany({
    where: { returnPct: { not: null } }, orderBy: [{ tradeDate: "desc" }, { id: "desc" }], take: 30,
    select: { strategyType: true, symbol: true, entryPrice: true, exitPrice: true, returnPct: true, entryDate: true, exitDate: true, tradeDate: true },
  });
  const recentPerf = recentTrades.map((t) => ({
    type: t.strategyType, symbol: t.symbol, entryPrice: t.entryPrice, exitPrice: t.exitPrice,
    returnPct: t.returnPct, entryDate: t.entryDate?.toISOString().slice(0, 10) ?? null,
    exitDate: t.exitDate?.toISOString().slice(0, 10) ?? null, tradeDate: t.tradeDate.toISOString().slice(0, 10),
  }));

  // ── ⑧ 数据完整性 ─────────────────────────────────────────────────────────────
  const [lastCompletedRow, stockTotal, scoreNull, todayDecision, todayNews] = await Promise.all([
    prisma.dailyPrice.findFirst({ where: { date: { lt: todayMidnight } }, orderBy: { date: "desc" }, select: { date: true } }),
    prisma.stock.count(),
    prisma.stockScore.count({ where: { adaptiveScore: null } }),
    prisma.closingDecision.findFirst({ where: { date: todayMidnight }, select: { date: true } }),
    prisma.news.count({ where: { publishedAt: { gte: todayMidnight } } }),
  ]);
  const coveredCount = lastCompletedRow ? await prisma.dailyPrice.count({ where: { date: lastCompletedRow.date } }) : 0;
  const phases = readPhases(today);
  const integrity = {
    coveragePct: stockTotal > 0 && lastCompletedRow ? Number(((coveredCount / stockTotal) * 100).toFixed(1)) : null,
    coverageDate: lastCompletedRow?.date?.toISOString().slice(0, 10) ?? null,
    scoreNull, decisionToday: !!todayDecision, newsToday: todayNews,
    pipelinePhases: phases.length, pipelineFailed: phases.filter((p) => p.status === "FAILED").length,
  };

  return NextResponse.json({
    generatedAt: new Date().toISOString(), jstDate: today,
    recQuality, scoreDistribution, hitRate, todayMovement, strategies, alpha, stability, recentPerf, integrity,
  });
}
