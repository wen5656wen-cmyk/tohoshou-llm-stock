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

  await prisma.stock.update({
    where: { id: stock.id },
    data: { aiScore: result.score },
  });

  return NextResponse.json(result);
}
