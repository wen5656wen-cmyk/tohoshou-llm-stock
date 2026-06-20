import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);

  const target = await prisma.stockScore.findUnique({
    where: { symbol: decoded },
    select: { stockStyle: true, industry: true, adaptiveScore: true, highRiskFlag: true },
  });

  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Find stocks of the same style, prefer same industry, higher adaptiveScore, not high-risk if target isn't
  const candidates = await prisma.stockScore.findMany({
    where: {
      symbol: { not: decoded },
      stockStyle: target.stockStyle ?? undefined,
      priceCount: { gte: 20 },
      adaptiveScore: { gt: target.adaptiveScore ?? 0 },
      ...(target.highRiskFlag ? {} : { highRiskFlag: false }),
    },
    orderBy: [
      { adaptiveScore: "desc" },
    ],
    take: 20,
    select: {
      symbol: true, name: true, nameZh: true,
      totalScore: true, adaptiveScore: true, stockStyle: true,
      recommendation: true, return5d: true, latestClose: true,
      sector: true, industry: true, fxSensitivity: true, highRiskFlag: true,
    },
  });

  // Prefer same industry first, then other same-style stocks
  const sameIndustry = candidates.filter((s) => s.industry === target.industry);
  const others = candidates.filter((s) => s.industry !== target.industry);
  const ranked = [...sameIndustry, ...others].slice(0, 5);

  return NextResponse.json({ symbol: decoded, stockStyle: target.stockStyle, alternatives: ranked });
}
