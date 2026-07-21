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

export type CohortStat = {
  avgReturn: number | null;
  winRate: number | null;
  topix: number | null;
  alpha: number | null;
  filled: number;
};

export type CohortRow = {
  date: string;
  count: number;
  "7d": CohortStat | null;
  "30d": CohortStat | null;
};

export type CohortsData = {
  rows: CohortRow[];
};

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  try {
    const [backtestRows, cohortCounts] = await Promise.all([
      prisma.backtestResult.findMany({
        where: {
          portfolioSize: "ALL",
          horizon: { in: ["7d", "30d"] },
        },
        orderBy: { date: "desc" },
        take: 100,
        select: {
          date: true, horizon: true,
          avgReturn: true, winRate: true,
          benchmarkTopixReturn: true, excessVsTopix: true,
          filled: true,
        },
      }),
      prisma.dailyRecommendation.groupBy({
        by: ["date"],
        _count: { date: true },
        orderBy: { date: "desc" },
        take: 50,
      }),
    ]);

    const countByDate = new Map<string, number>();
    for (const row of cohortCounts) {
      const d = row.date.toISOString().slice(0, 10);
      countByDate.set(d, row._count.date);
    }

    type PartialRow = { "7d"?: CohortStat; "30d"?: CohortStat };
    const statsByDate = new Map<string, PartialRow>();
    for (const row of backtestRows) {
      const d = row.date.toISOString().slice(0, 10);
      if (!statsByDate.has(d)) statsByDate.set(d, {});
      const entry = statsByDate.get(d)!;
      const h = row.horizon as "7d" | "30d";
      entry[h] = {
        avgReturn: row.avgReturn,
        winRate: row.winRate,
        topix: row.benchmarkTopixReturn,
        alpha: row.excessVsTopix,
        filled: row.filled,
      };
    }

    const allDates = Array.from(
      new Set([...countByDate.keys(), ...statsByDate.keys()])
    )
      .sort()
      .reverse()
      .slice(0, 50);

    const rows: CohortRow[] = allDates.map((date) => ({
      date,
      count: countByDate.get(date) ?? 0,
      "7d":  statsByDate.get(date)?.["7d"]  ?? null,
      "30d": statsByDate.get(date)?.["30d"] ?? null,
    }));

    return NextResponse.json<CohortsData>({ rows });
  } catch (e) {
    console.error("/api/backtest/cohorts error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
