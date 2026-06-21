import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function rsiSignal(rsi: number | null): string {
  if (rsi === null) return "—";
  if (rsi >= 70) return "超买";
  if (rsi <= 30) return "超卖";
  return "正常";
}

// Read from pre-computed StockScore — no real-time 3716-stock recomputation
export async function GET() {
  const scores = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 }, totalScore: { not: null } },
    orderBy: { totalScore: "desc" },
    take: 500,
    select: {
      symbol: true,
      name: true,
      nameZh: true,
      sector: true,
      market: true,
      latestDate: true,
      latestClose: true,
      return5d: true,
      return20d: true,
      return60d: true,
      rsi14: true,
      macd: true,
      macdSignal: true,
      macdHist: true,
      maTrend: true,
      macdSignalLabel: true,
      tradingAction: true,
      positionSizePct: true,
      actionRiskLevel: true,
    },
  });

  return NextResponse.json(
    scores.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      nameZh: s.nameZh ?? null,
      sector: s.sector ?? null,
      market: s.market ?? null,
      latestDate: s.latestDate ?? "",
      latestClose: s.latestClose ?? 0,
      return5d: s.return5d ?? null,
      return20d: s.return20d ?? null,
      return60d: s.return60d ?? null,
      ma5: null,
      ma20: null,
      ma60: null,
      rsi14: s.rsi14 ?? null,
      macd: s.macd ?? null,
      macdSignal: s.macdSignal ?? null,
      macdHist: s.macdHist ?? null,
      maTrend: s.maTrend ?? "NEUTRAL",
      macdSignalLabel: s.macdSignalLabel ?? "NEUTRAL",
      rsiSignal: rsiSignal(s.rsi14 ?? null),
      tradingAction: s.tradingAction ?? null,
      positionSizePct: s.positionSizePct ?? null,
      actionRiskLevel: s.actionRiskLevel ?? null,
      finCount: 0,
    }))
  );
}
