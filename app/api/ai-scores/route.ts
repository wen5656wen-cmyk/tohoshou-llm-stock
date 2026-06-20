import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function starsFromRec(rec: string | null): number {
  switch (rec) {
    case "STRONG_BUY": return 5;
    case "BUY":        return 4;
    case "WATCH":      return 3;
    case "HOLD":       return 2;
    default:           return 1;
  }
}

// Read from pre-computed StockScore — no real-time 3716-stock recomputation
export async function GET() {
  const scores = await prisma.stockScore.findMany({
    where: { priceCount: { gte: 20 }, totalScore: { not: null } },
    orderBy: { totalScore: "desc" },
    take: 50,
    select: {
      symbol: true,
      name: true,
      nameZh: true,
      latestClose: true,
      latestDate: true,
      technicalScore: true,
      fundamentalScore: true,
      moneyFlowScore: true,
      newsSentimentScore: true,
      globalTrendScore: true,
      riskScore: true,
      totalScore: true,
      recommendation: true,
      starsLabel: true,
      summaryReason: true,
      newsSummary: true,
      // V7.5
      rawScore: true,
      adaptiveScore: true,
      stockStyle: true,
      highRiskFlag: true,
      fxSensitivity: true,
      catalystScore: true,
    },
  });

  const result = scores.map((s) => ({
    symbol: s.symbol,
    name: s.nameZh || s.name,
    nameZh: s.nameZh ?? null,
    latestClose: s.latestClose ?? 0,
    latestDate: s.latestDate ?? "",
    technicalScore: s.technicalScore ?? 0,
    fundamentalScore: s.fundamentalScore ?? 0,
    moneyFlowScore: s.moneyFlowScore ?? s.riskScore ?? 0,
    newsSentimentScore: s.newsSentimentScore ?? 0,
    globalTrendScore: s.globalTrendScore ?? 0,
    riskScore: s.riskScore ?? 0,
    totalScore: s.totalScore ?? 0,
    stars: starsFromRec(s.recommendation),
    starsLabel: s.starsLabel ?? "★☆☆☆☆",
    recommendation: (s.recommendation ?? "HOLD") as "STRONG_BUY" | "BUY" | "WATCH" | "HOLD" | "AVOID",
    summaryReason: s.summaryReason ?? "",
    newsSummary: s.newsSummary ?? "",
    // V7.5
    rawScore: s.rawScore ?? s.totalScore ?? 0,
    adaptiveScore: s.adaptiveScore ?? s.totalScore ?? 0,
    stockStyle: s.stockStyle ?? "DOMESTIC_DEFENSIVE",
    highRiskFlag: s.highRiskFlag ?? false,
    fxSensitivity: s.fxSensitivity ?? "DOMESTIC_NEUTRAL",
    catalystScore: s.catalystScore ?? 5,
  }));

  return NextResponse.json({ scores: result, updatedAt: new Date().toISOString() });
}
