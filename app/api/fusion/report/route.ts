import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/fusion/report — per-regime Production vs Alpha stats + data-searched optimal
// fusion ratio. Research-only; production recommendations are NOT affected.
export async function GET() {
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
