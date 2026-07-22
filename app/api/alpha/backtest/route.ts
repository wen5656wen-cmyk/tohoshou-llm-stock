// 🔒 P21-P0-API-G2 · 访问级别：ADMIN_ONLY（内部研究 / 实验 / 回测 / 系统状态）
//
// 不属于公开市场数据，也不属于 Boss 决策读取 —— 是内部评分实验、Shadow/Freeze/
// Calibration、融合模型、Alpha 分析与回测、研究资料与 Review、系统健康与内部业绩。
// 封闭前状态：未登录公网可读（P21-P0-API 审计实测 200）。
//
// 凭证与 AUTHENTICATED 本轮相同（单租户，尚无用户体系），但**逻辑等级更高**：
// 后续拆权限时本文件应保持管理员级，不随 AUTHENTICATED 一起下放。
import { guardBetaOrAdmin } from "@/lib/beta-auth"; // P22-S3：白名单只读 → Beta 或 Admin
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_PERIODS = new Set([30, 90, 180]);

// GET /api/alpha/backtest?period=90 — shadow backtest: Production vs Alpha across
// Top10/20/50 × hold 5/10/20. Read-only validation layer.
export async function GET(req: NextRequest) {
  const denied = await guardBetaOrAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const raw = parseInt(searchParams.get("period") ?? "90");
  const period = VALID_PERIODS.has(raw) ? raw : 90;

  const rows = await prisma.alphaBacktestResult.findMany({
    where: { period },
    orderBy: [{ topN: "asc" }, { holdDays: "asc" }, { strategy: "asc" }],
  });

  const cells = rows.map((r) => ({
    strategy: r.strategy,
    topN: r.topN,
    holdDays: r.holdDays,
    cumReturn: r.cumReturn,
    alpha: r.alpha,
    sharpe: r.sharpe,
    maxDrawdown: r.maxDrawdown,
    winRate: r.winRate,
    annualizedReturn: r.annualizedReturn,
    nObs: r.nObs,
  }));

  // Headline comparison (Top20, hold 20d).
  const prod = cells.find((c) => c.strategy === "PRODUCTION" && c.topN === 20 && c.holdDays === 20);
  const alp = cells.find((c) => c.strategy === "ALPHA" && c.topN === 20 && c.holdDays === 20);
  const headline = {
    production: prod?.cumReturn ?? null,
    shadow: alp?.cumReturn ?? null,
    alpha: prod?.cumReturn != null && alp?.cumReturn != null ? Math.round((alp.cumReturn - prod.cumReturn) * 100) / 100 : null,
  };

  return NextResponse.json({
    period,
    availablePeriods: [30, 90, 180],
    computedAt: rows[0]?.computedAt?.toISOString() ?? null,
    asOfLatest: rows[0]?.asOfLatest?.toISOString().slice(0, 10) ?? null,
    note: "Both scores reconstructed from DailyPrice. PRODUCTION = momentum core (z(ret20)+z(ret60)); ALPHA = analytics-weighted 6-factor composite. Overlapping daily sampling; cumReturn/drawdown from non-overlapping H-day rebalances.",
    headline,
    cells,
  });
}
