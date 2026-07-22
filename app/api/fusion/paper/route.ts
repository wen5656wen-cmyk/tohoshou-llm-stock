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

const HORIZONS: ("ret1d" | "ret3d" | "ret5d" | "ret10d" | "ret20d")[] = ["ret1d", "ret3d", "ret5d", "ret10d", "ret20d"];
const STRATS = ["PRODUCTION", "ALPHA", "FUSION"];

// GET /api/fusion/paper?topN=20 — forward paper-trading comparison of the three strategies.
// Read-only; the official recommendation is never modified.
export async function GET(req: NextRequest) {
  const denied = await guardBetaOrAdmin(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const topN = searchParams.get("topN") === "10" ? 10 : 20;

  const picks = await prisma.fusionPaperPick.findMany({
    where: { topN },
    orderBy: [{ entryDate: "desc" }, { strategy: "asc" }, { rank: "asc" }],
  });

  const entryDates = [...new Set(picks.map((p) => p.entryDate.toISOString().slice(0, 10)))].sort();

  // aggregate avg forward return + win rate per strategy per horizon
  const agg: Record<string, Record<string, { avg: number | null; win: number | null; n: number }>> = {};
  for (const s of STRATS) {
    agg[s] = {};
    for (const h of HORIZONS) {
      const vals = picks.filter((p) => p.strategy === s && p[h] != null).map((p) => p[h] as number);
      agg[s][h] = {
        avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null,
        win: vals.length ? Math.round((vals.filter((v) => v > 0).length / vals.length) * 1000) / 10 : null,
        n: vals.length,
      };
    }
  }

  // recent picks (latest entry date) per strategy
  const latest = entryDates[entryDates.length - 1] ?? null;
  const recent = latest
    ? picks.filter((p) => p.entryDate.toISOString().slice(0, 10) === latest).map((p) => ({
        strategy: p.strategy, rank: p.rank, symbol: p.symbol,
        ret1d: p.ret1d, ret3d: p.ret3d, ret5d: p.ret5d, ret10d: p.ret10d, ret20d: p.ret20d, regime: p.regime,
      }))
    : [];

  return NextResponse.json({
    topN,
    entryDates,
    daysRunning: entryDates.length,
    latestEntry: latest,
    computedAt: picks[0]?.computedAt?.toISOString() ?? null,
    horizons: HORIZONS,
    aggregate: agg,
    recent,
    note: "Forward paper trading. PRODUCTION = real official DailyRecommendation; ALPHA = AlphaScore composite; FUSION = regime-adaptive w·Alpha+(1-w)·Production (searched w). Longer horizons fill in as future prices arrive. Official recommendation is NOT modified.",
  });
}
