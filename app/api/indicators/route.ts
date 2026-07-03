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
    where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } },
    orderBy: { adaptiveScore: "desc" },
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

  const symbols = scores.map((s) => s.symbol);
  const stockNameEn = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, nameEn: true },
  });
  const nameEnMap = new Map(stockNameEn.map((s) => [s.symbol, s.nameEn ?? null]));

  // Scored rows are, by definition, part of the AI universe (compute-scores gates
  // on aiEnabled=true and purges excluded rows), so tag them aiEnabled:true.
  const scoredRows = scores.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    nameZh: s.nameZh ?? null,
    nameEn: nameEnMap.get(s.symbol) ?? null,
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
    aiEnabled: true,
    excludeReason: null as string | null,
    aiExcludeSource: null as string | null,
  }));

  // Excluded stocks carry no StockScore — surface them (with null indicators) so the
  // list "已排除股票 / Excluded" filter has data to show.
  const excluded = await prisma.stock.findMany({
    where: { aiEnabled: false },
    select: {
      symbol: true, name: true, nameZh: true, nameEn: true, sector: true, market: true,
      price: true, excludeReason: true, aiExcludeSource: true,
    },
    orderBy: { symbol: "asc" },
  });
  const excludedRows = excluded.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    nameZh: s.nameZh ?? null,
    nameEn: s.nameEn ?? null,
    sector: s.sector ?? null,
    market: s.market ?? null,
    latestDate: "",
    latestClose: s.price ?? 0,
    return5d: null,
    return20d: null,
    return60d: null,
    ma5: null,
    ma20: null,
    ma60: null,
    rsi14: null,
    macd: null,
    macdSignal: null,
    macdHist: null,
    maTrend: "NEUTRAL",
    macdSignalLabel: "NEUTRAL",
    rsiSignal: "—",
    tradingAction: null,
    positionSizePct: null,
    actionRiskLevel: null,
    finCount: 0,
    aiEnabled: false,
    excludeReason: s.excludeReason ?? "OTHER",
    aiExcludeSource: s.aiExcludeSource ?? null,
  }));

  return NextResponse.json([...scoredRows, ...excludedRows]);
}
