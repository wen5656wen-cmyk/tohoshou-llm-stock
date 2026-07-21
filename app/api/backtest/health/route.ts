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

export type BacktestHealthData = {
  latestRecommendationDate: string | null;
  totalRecommendations: number;
  filled7d: number;
  filled30d: number;
  filled90d: number;
  fillRate7d: number;
  fillRate30d: number;
  fillRate90d: number;
  latestPriceDate: string | null;
  recentErrors: number;
  status: "HEALTHY" | "WAITING_PRICE" | "PARTIAL" | "FAILED";
  // v10.2: Alpha engine fields (from BacktestResult ALL portfolio, latest date with data)
  avgReturn7d: number | null;
  avgReturn30d: number | null;
  avgAlpha7d: number | null;
  avgAlpha30d: number | null;
  winRate7d: number | null;
  winRate30d: number | null;
  topixReturn7d: number | null;
  topixReturn30d: number | null;
  // v10.2: Latest GlobalMarket TOPIX (confirms sync ran)
  latestTopix: number | null;
  latestTopixDate: string | null;
};

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  try {
    // Latest cohort date
    const latestRec = await prisma.dailyRecommendation.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    });

    if (!latestRec) {
      return NextResponse.json<BacktestHealthData>({
        latestRecommendationDate: null,
        totalRecommendations: 0,
        filled7d: 0, filled30d: 0, filled90d: 0,
        fillRate7d: 0, fillRate30d: 0, fillRate90d: 0,
        latestPriceDate: null,
        recentErrors: 0,
        status: "FAILED",
        avgReturn7d: null, avgReturn30d: null,
        avgAlpha7d: null, avgAlpha30d: null,
        winRate7d: null, winRate30d: null,
        topixReturn7d: null, topixReturn30d: null,
        latestTopix: null, latestTopixDate: null,
      });
    }

    const latestDate = latestRec.date;

    const [
      total, filled7d, filled30d, filled90d, latestPrice, recentErrors,
      result7d, result30d, latestGm,
    ] = await Promise.all([
      prisma.dailyRecommendation.count({ where: { date: latestDate } }),
      prisma.dailyRecommendation.count({ where: { date: latestDate, return7d: { not: null } } }),
      prisma.dailyRecommendation.count({ where: { date: latestDate, return30d: { not: null } } }),
      prisma.dailyRecommendation.count({ where: { date: latestDate, return90d: { not: null } } }),
      prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.backtestError.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      // Latest BacktestResult for ALL portfolio, 7d horizon
      prisma.backtestResult.findFirst({
        where: { portfolioSize: "ALL", horizon: "7d" },
        orderBy: { date: "desc" },
        select: { avgReturn: true, winRate: true, benchmarkTopixReturn: true, excessVsTopix: true },
      }),
      // Latest BacktestResult for ALL portfolio, 30d horizon
      prisma.backtestResult.findFirst({
        where: { portfolioSize: "ALL", horizon: "30d" },
        orderBy: { date: "desc" },
        select: { avgReturn: true, winRate: true, benchmarkTopixReturn: true, excessVsTopix: true },
      }),
      // Latest GlobalMarket row with TOPIX data
      prisma.globalMarket.findFirst({
        where: { topix: { not: null } },
        orderBy: { date: "desc" },
        select: { date: true, topix: true },
      }),
    ]);

    const fillRate7d  = total > 0 ? Math.round((filled7d  / total) * 1000) / 10 : 0;
    const fillRate30d = total > 0 ? Math.round((filled30d / total) * 1000) / 10 : 0;
    const fillRate90d = total > 0 ? Math.round((filled90d / total) * 1000) / 10 : 0;

    let status: BacktestHealthData["status"];
    if (total === 0) {
      status = "FAILED";
    } else if (filled7d === 0) {
      status = "WAITING_PRICE";
    } else if (fillRate7d >= 80) {
      status = "HEALTHY";
    } else {
      status = "PARTIAL";
    }

    return NextResponse.json<BacktestHealthData>({
      latestRecommendationDate: latestDate.toISOString().slice(0, 10),
      totalRecommendations: total,
      filled7d, filled30d, filled90d,
      fillRate7d, fillRate30d, fillRate90d,
      latestPriceDate: latestPrice?.date.toISOString().slice(0, 10) ?? null,
      recentErrors,
      status,
      avgReturn7d:   result7d?.avgReturn  ?? null,
      avgReturn30d:  result30d?.avgReturn ?? null,
      avgAlpha7d:    result7d?.excessVsTopix  ?? null,
      avgAlpha30d:   result30d?.excessVsTopix ?? null,
      winRate7d:     result7d?.winRate  ?? null,
      winRate30d:    result30d?.winRate ?? null,
      topixReturn7d:  result7d?.benchmarkTopixReturn  ?? null,
      topixReturn30d: result30d?.benchmarkTopixReturn ?? null,
      latestTopix:     latestGm?.topix ?? null,
      latestTopixDate: latestGm?.date.toISOString().slice(0, 10) ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
