import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_PERIODS = new Set([30, 90, 180]);

// GET /api/alpha/backtest?period=90 — shadow backtest: Production vs Alpha across
// Top10/20/50 × hold 5/10/20. Read-only validation layer.
export async function GET(req: NextRequest) {
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
