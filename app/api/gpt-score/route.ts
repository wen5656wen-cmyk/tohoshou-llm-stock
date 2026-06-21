import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");

  try {
    const where = symbolsParam
      ? { symbol: { in: symbolsParam.split(",").map((s) => s.trim()).filter(Boolean) } }
      : {};

    const rows = await prisma.gPTScore.findMany({
      where,
      select: {
        symbol: true,
        model: true,
        ruleScore: true,
        gptScore: true,
        finalScore: true,
        confidence: true,
        action: true,
        summaryZh: true,
        summaryJa: true,
        summaryEn: true,
        timeHorizon: true,
        updatedAt: true,
      },
      orderBy: { finalScore: "desc" },
      take: symbolsParam ? undefined : 500,
    });

    return NextResponse.json(rows);
  } catch (e) {
    console.error("[gpt-score]", e);
    return NextResponse.json({ error: "Failed to fetch GPT scores" }, { status: 500 });
  }
}
