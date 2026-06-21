import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);

  try {
    const row = await prisma.gPTScore.findUnique({
      where: { symbol: decoded },
    });

    if (!row) {
      return NextResponse.json({ notFound: true }, { status: 404 });
    }

    return NextResponse.json({
      symbol: row.symbol,
      model: row.model,
      ruleScore: row.ruleScore,
      gptScore: row.gptScore,
      finalScore: row.finalScore,
      confidence: row.confidence,
      action: row.action,
      summaryZh: row.summaryZh,
      summaryJa: row.summaryJa,
      summaryEn: row.summaryEn,
      thesisZh: row.thesisZh,
      thesisJa: row.thesisJa,
      thesisEn: row.thesisEn,
      strengths: row.strengths,
      risks: row.risks,
      catalysts: row.catalysts,
      timeHorizon: row.timeHorizon,
      updatedAt: row.updatedAt,
    });
  } catch (e) {
    console.error("[gpt-score/symbol]", e);
    return NextResponse.json({ error: "Failed to fetch GPT score" }, { status: 500 });
  }
}
