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

type HorizonStat = {
  winRate: number | null;
  avgReturn: number | null;
  medianReturn: number | null;
  filled: number;
  benchmarkNikkeiReturn: number | null;
  benchmarkTopixReturn: number | null;
  excessVsNikkei: number | null;
  excessVsTopix: number | null;
  maxDrawdown: number | null;
  date: Date;
} | null;

type PortfolioRow = { "7d": HorizonStat; "30d": HorizonStat; "90d": HorizonStat };

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  try {
    // ── Portfolio stats: latest row per (portfolioSize × horizon) ──────────
    const PORTFOLIO_SIZES = ["TOP5", "TOP10", "TOP20", "ALL"] as const;
    const HORIZONS = ["7d", "30d", "90d"] as const;

    // Fetch all recent BacktestResult rows (last 90 dates, all portfolio sizes)
    const allResults = await prisma.backtestResult.findMany({
      orderBy: { date: "desc" },
      take: 90 * 4 * 3, // 90 dates × 4 portfolioSizes × 3 horizons
      select: {
        date: true, horizon: true, portfolioSize: true,
        winRate: true, avgReturn: true, medianReturn: true, filled: true,
        benchmarkNikkeiReturn: true, benchmarkTopixReturn: true,
        excessVsNikkei: true, excessVsTopix: true, maxDrawdown: true,
        bestReturn: true, worstReturn: true, bestSymbol: true, worstSymbol: true,
      },
    });

    // Build portfolios map: pick latest row per (portfolioSize, horizon)
    const portfolios: Record<string, PortfolioRow> = {};
    for (const ps of PORTFOLIO_SIZES) {
      const row: PortfolioRow = { "7d": null, "30d": null, "90d": null };
      for (const h of HORIZONS) {
        const match = allResults.find((r) => r.portfolioSize === ps && r.horizon === h);
        if (match) {
          row[h] = {
            winRate: match.winRate,
            avgReturn: match.avgReturn,
            medianReturn: match.medianReturn,
            filled: match.filled,
            benchmarkNikkeiReturn: match.benchmarkNikkeiReturn,
            benchmarkTopixReturn: match.benchmarkTopixReturn,
            excessVsNikkei: match.excessVsNikkei,
            excessVsTopix: match.excessVsTopix,
            maxDrawdown: match.maxDrawdown,
            date: match.date,
          };
        }
      }
      portfolios[ps] = row;
    }

    // ── Cohort count ────────────────────────────────────────────────────────
    const cohortDates = await prisma.dailyRecommendation.groupBy({
      by: ["date"],
      _count: { date: true },
    });

    // ── Latest cohort top-20 (include entryPrice) ───────────────────────────
    const latestDate = await prisma.dailyRecommendation.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    });

    const latestCohortRaw = latestDate
      ? await prisma.dailyRecommendation.findMany({
          where: { date: latestDate.date },
          orderBy: { gptRank: "asc" },
          take: 20,
          select: {
            symbol: true, gptRank: true, finalScore: true, gptRating: true,
            buyPrice: true, entryPrice: true,
            return7d: true, return30d: true, return90d: true, summaryZh: true,
            createdAt: true,
          },
        })
      : [];

    const latestUpdatedAt = latestCohortRaw[0]?.createdAt?.toISOString() ?? null;
    const top1Symbol = latestCohortRaw[0]?.symbol ?? null;
    const latestCohort = latestCohortRaw.map(({ createdAt: _c, ...rest }) => rest);

    // Stock name for rank-1
    const top1Stock = top1Symbol
      ? await prisma.stock.findUnique({
          where: { symbol: top1Symbol },
          select: { nameZh: true, name: true },
        })
      : null;

    // Latest date rec count
    const latestDateCount = latestDate
      ? (cohortDates.find((r) => r.date.getTime() === latestDate.date.getTime())?._count.date ?? null)
      : null;

    // ── All-time top/bottom 10 by 30d return ───────────────────────────────
    const [top30d, bottom30d] = await Promise.all([
      prisma.dailyRecommendation.findMany({
        where: { return30d: { not: null } },
        orderBy: { return30d: "desc" },
        take: 10,
        select: { symbol: true, date: true, return30d: true, gptRank: true, entryPrice: true },
      }),
      prisma.dailyRecommendation.findMany({
        where: { return30d: { not: null } },
        orderBy: { return30d: "asc" },
        take: 10,
        select: { symbol: true, date: true, return30d: true, gptRank: true, entryPrice: true },
      }),
    ]);

    return NextResponse.json({
      cohortCount: cohortDates.length,
      latestDate: latestDate?.date ?? null,
      latestDateCount,
      top1Symbol,
      top1Name: top1Stock ? (top1Stock.nameZh ?? top1Stock.name ?? null) : null,
      latestUpdatedAt,
      portfolios,
      latestCohort,
      topWinners: top30d,
      topLosers: bottom30d,
    });
  } catch (e) {
    console.error("/api/backtest/summary error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
