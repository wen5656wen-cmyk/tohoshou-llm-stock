import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeStock } from "@/lib/ai";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);

  const stock = await prisma.stock.findUnique({
    where: { symbol: decoded },
    include: {
      financials: { orderBy: [{ fiscalYear: "desc" }, { quarter: "desc" }], take: 2 },
      news: { orderBy: { publishedAt: "desc" }, take: 10 },
      disclosures: { orderBy: { publishedAt: "desc" }, take: 10 },
    },
  });

  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentFin = stock.financials[0] ?? null;
  const prevFin = stock.financials[1] ?? null;

  const result = await analyzeStock(
    stock,
    currentFin,
    prevFin,
    stock.news,
    stock.disclosures
  );

  const analysis = await prisma.aIAnalysis.create({
    data: {
      stockId: stock.id,
      model: result.model,
      analysisType: "COMPREHENSIVE",
      score: result.score,
      scoreGrowth: result.scoreGrowth,
      scoreValuation: result.scoreValuation,
      scoreProfitability: result.scoreProfitability,
      scoreCapitalFlow: result.scoreCapitalFlow,
      scoreSentiment: result.scoreSentiment,
      stars: result.stars,
      recommendation: result.recommendation,
      grade: result.grade,
      summary: result.summary,
      bullPoints: result.bullPoints,
      bearPoints: result.bearPoints,
      targetPrice: result.targetPrice,
      upsideRate: result.upsideRate,
      riskLevel: result.riskLevel,
      riskWarnings: result.riskWarnings,
      investReason: result.investReason,
    },
  });

  await prisma.stock.update({
    where: { id: stock.id },
    data: { aiScore: result.score },
  });

  return NextResponse.json(analysis);
}
