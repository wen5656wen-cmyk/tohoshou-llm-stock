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

export type TrendPoint = {
  date: string;
  TOP10: number | null;
  TOP50: number | null;
  TOP100: number | null;
  ALL: number | null;
  topix: number | null;
};

export type TrendData = {
  horizon: string;
  series: TrendPoint[];
};

const TREND_SIZES = ["TOP10", "TOP50", "TOP100", "ALL"] as const;

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const horizon = searchParams.get("horizon") ?? "30d";

    if (!["7d", "30d", "90d"].includes(horizon)) {
      return NextResponse.json({ error: "invalid horizon" }, { status: 400 });
    }

    const rows = await prisma.backtestResult.findMany({
      where: { horizon, portfolioSize: { in: [...TREND_SIZES] } },
      orderBy: { date: "asc" },
      select: { date: true, portfolioSize: true, avgReturn: true, benchmarkTopixReturn: true },
    });

    const dateMap = new Map<string, TrendPoint>();
    for (const row of rows) {
      const dateStr = row.date.toISOString().slice(0, 10);
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { date: dateStr, TOP10: null, TOP50: null, TOP100: null, ALL: null, topix: null });
      }
      const pt = dateMap.get(dateStr)!;
      if (row.portfolioSize === "TOP10")  pt.TOP10  = row.avgReturn;
      if (row.portfolioSize === "TOP50")  pt.TOP50  = row.avgReturn;
      if (row.portfolioSize === "TOP100") pt.TOP100 = row.avgReturn;
      if (row.portfolioSize === "ALL") {
        pt.ALL   = row.avgReturn;
        pt.topix = row.benchmarkTopixReturn;
      }
    }

    return NextResponse.json<TrendData>({ horizon, series: Array.from(dateMap.values()) });
  } catch (e) {
    console.error("/api/backtest/trend error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
