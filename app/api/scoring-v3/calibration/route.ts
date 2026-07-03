import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/scoring-v3/calibration — 今日标定报告（阈值/分布/Confidence/Quality/SB统计/Readiness/历史）。只读。
export async function GET() {
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
