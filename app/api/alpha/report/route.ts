// 🔒 P21-P0-API-G2 · 访问级别：ADMIN_ONLY（内部研究 / 实验 / 回测 / 系统状态）
//
// 不属于公开市场数据，也不属于 Boss 决策读取 —— 是内部评分实验、Shadow/Freeze/
// Calibration、融合模型、Alpha 分析与回测、研究资料与 Review、系统健康与内部业绩。
// 封闭前状态：未登录公网可读（P21-P0-API 审计实测 200）。
//
// 凭证与 AUTHENTICATED 本轮相同（单租户，尚无用户体系），但**逻辑等级更高**：
// 后续拆权限时本文件应保持管理员级，不随 AUTHENTICATED 一起下放。
import { guardAdminRoute } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_PERIODS = new Set([7, 30, 90, 180]);

// GET /api/alpha/report?period=30 — Alpha factor effectiveness report for a period.
export async function GET(req: NextRequest) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const raw = parseInt(searchParams.get("period") ?? "30");
  const period = VALID_PERIODS.has(raw) ? raw : 30;

  const rows = await prisma.alphaFactorReport.findMany({
    where: { period },
    orderBy: { rating: "desc" },
  });

  return NextResponse.json({
    period,
    availablePeriods: [7, 30, 90, 180],
    computedAt: rows[0]?.computedAt?.toISOString() ?? null,
    asOfLatest: rows[0]?.asOfLatest?.toISOString().slice(0, 10) ?? null,
    factors: rows.map((r) => ({
      factor: r.factor,
      sampleCount: r.sampleCount,
      meanFwdRet5: r.meanFwdRet5,
      meanFwdRet10: r.meanFwdRet10,
      meanFwdRet20: r.meanFwdRet20,
      winRate: r.winRate,
      meanExcess: r.meanExcess,
      ic: r.ic,
      rankIc: r.rankIc,
      top20Ret: r.top20Ret,
      bottom20Ret: r.bottom20Ret,
      sharpe: r.sharpe,
      rating: r.rating,
      ratingLabel: r.ratingLabel,
    })),
  });
}
