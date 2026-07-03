import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_PERIODS = new Set([7, 30, 90, 180]);

// GET /api/alpha/report?period=30 — Alpha factor effectiveness report for a period.
export async function GET(req: NextRequest) {
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
