import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/regime?limit=180 — historical Bull/Sideways/Bear timeline + current regime.
// Research-only; never affects production.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(500, parseInt(searchParams.get("limit") ?? "180") || 180);

  const rows = await prisma.marketRegime.findMany({
    orderBy: { date: "desc" },
    take: limit,
  });

  const dist = { BULL: 0, SIDEWAYS: 0, BEAR: 0 };
  for (const r of rows) dist[r.regime as "BULL" | "SIDEWAYS" | "BEAR"]++;

  const current = rows[0] ?? null;

  return NextResponse.json({
    current: current ? { date: current.date.toISOString().slice(0, 10), regime: current.regime, regimeScore: current.regimeScore, trendScore: current.trendScore, breadth: current.breadth, volatility: current.volatility } : null,
    distribution: dist,
    computedAt: current?.computedAt?.toISOString() ?? null,
    timeline: rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      regime: r.regime,
      regimeScore: r.regimeScore,
      trendScore: r.trendScore,
      breadth: r.breadth,
      volatility: r.volatility,
      topixClose: r.topixClose,
      ma20: r.ma20, ma60: r.ma60, ma120: r.ma120,
    })),
  });
}
