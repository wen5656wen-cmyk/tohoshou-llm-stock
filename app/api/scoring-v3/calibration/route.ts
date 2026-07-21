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

// GET /api/scoring-v3/calibration — 今日标定报告（阈值/分布/Confidence/Quality/SB统计/Readiness/历史）。只读。
export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const latest = await prisma.adaptiveScoreV3Calibration.findFirst({ orderBy: { date: "desc" } });
  if (!latest) return NextResponse.json({ date: null, note: "尚无标定数据，请运行 compute-score-v3-shadow" });

  const history = await prisma.adaptiveScoreV3Calibration.findMany({
    orderBy: { date: "desc" }, take: 30,
    select: { date: true, regime: true, ratingDistJson: true, readiness: true, readinessGrade: true, sbStatsJson: true },
  });

  return NextResponse.json({
    date: latest.date.toISOString().slice(0, 10),
    regime: latest.regime,
    computedAt: latest.computedAt.toISOString(),
    thresholds: latest.thresholdsJson,
    ratingDist: latest.ratingDistJson,
    confidenceStats: latest.confidenceStatsJson,
    quality: latest.qualityJson,
    sbSector: latest.sectorJson,
    sbMarketCap: latest.marketCapJson,
    sbStats: latest.sbStatsJson,
    readiness: latest.readiness,
    readinessGrade: latest.readinessGrade,
    history: history.map((h) => ({
      date: h.date.toISOString().slice(0, 10), regime: h.regime,
      ratingDist: h.ratingDistJson, readiness: h.readiness, grade: h.readinessGrade, sbStats: h.sbStatsJson,
    })),
  });
}
