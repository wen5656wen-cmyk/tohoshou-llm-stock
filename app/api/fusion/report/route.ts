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

// GET /api/fusion/report — per-regime Production vs Alpha stats + data-searched optimal
// fusion ratio. Research-only; production recommendations are NOT affected.
export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const rows = await prisma.regimeFusionResult.findMany();
  const order = { BULL: 0, SIDEWAYS: 1, BEAR: 2 } as Record<string, number>;
  rows.sort((a, b) => (order[a.regime] ?? 9) - (order[b.regime] ?? 9));

  return NextResponse.json({
    computedAt: rows[0]?.computedAt?.toISOString() ?? null,
    asOfLatest: rows[0]?.asOfLatest?.toISOString().slice(0, 10) ?? null,
    objective: rows[0]?.objective ?? "SHARPE",
    note: "Fusion = w·Alpha + (1-w)·Production (both cross-sectionally standardized). Optimal w searched per regime from history (Top20 · hold 20d, maximize Sharpe). Reconstructed from DailyPrice; production recommendations unaffected.",
    regimes: rows.map((r) => ({
      regime: r.regime,
      nDays: r.nDays,
      production: { cumReturn: r.prodCumReturn, sharpe: r.prodSharpe, winRate: r.prodWinRate, maxDrawdown: r.prodMaxDrawdown },
      alpha: { cumReturn: r.alphaCumReturn, sharpe: r.alphaSharpe, winRate: r.alphaWinRate, maxDrawdown: r.alphaMaxDrawdown },
      bestAlphaWeight: r.bestAlphaWeight,
      // human-readable production/alpha split
      ratio: r.bestAlphaWeight == null ? null : `${Math.round((1 - r.bestAlphaWeight) * 100)}/${Math.round(r.bestAlphaWeight * 100)}`,
      fused: { cumReturn: r.fusedCumReturn, sharpe: r.fusedSharpe, winRate: r.fusedWinRate, maxDrawdown: r.fusedMaxDrawdown },
      grid: r.gridJson,
    })),
  });
}
