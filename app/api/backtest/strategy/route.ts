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
import { aggregateStrategyStats } from "@/lib/strategy/strategy-performance";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const [rows, latest] = await Promise.all([
    prisma.strategyBacktestResult.findMany({
      select: {
        strategyType: true, exitReason: true, returnPct: true,
        alphaPct: true, holdingDays: true, isWin: true,
        recDate: true,
      },
    }),
    prisma.strategyBacktestResult.findFirst({
      orderBy: { computedAt: "desc" },
      select: { computedAt: true },
    }),
  ]);

  if (rows.length === 0) {
    return NextResponse.json({ stats: null, totalRows: 0, lastComputedAt: null });
  }

  const stats = aggregateStrategyStats(
    rows.map((r) => ({
      strategyType: r.strategyType,
      exitReason:   r.exitReason,
      returnPct:    r.returnPct,
      alphaPct:     r.alphaPct,
      holdingDays:  r.holdingDays,
      isWin:        r.isWin,
    })),
  );

  // Exit reason breakdown by strategy
  const exitBreakdown: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!exitBreakdown[r.strategyType]) exitBreakdown[r.strategyType] = {};
    const reason = r.exitReason ?? "UNKNOWN";
    exitBreakdown[r.strategyType][reason] = (exitBreakdown[r.strategyType][reason] ?? 0) + 1;
  }

  // Latest cohort date
  const dates = rows.map((r) => r.recDate.getTime());
  const latestRecDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null;

  return NextResponse.json({
    stats,
    exitBreakdown,
    totalRows: rows.length,
    latestRecDate,
    lastComputedAt: latest?.computedAt?.toISOString() ?? null,
  });
}
