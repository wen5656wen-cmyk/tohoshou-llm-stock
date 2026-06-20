import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "";
  const sentiment = searchParams.get("sentiment") || "";
  const category = searchParams.get("category") || "";
  const limit = Math.min(Number(searchParams.get("limit") || "20"), 50);
  const minConfidence = Number(searchParams.get("minConfidence") || "0");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (symbol) {
    const stock = await prisma.stock.findUnique({
      where: { symbol },
      select: { id: true },
    });
    if (stock) {
      // Include: news linked to this stock OR high-confidence news about this symbol
      where.OR = [
        { stockId: stock.id },
      ];
      // Apply minConfidence to stockId-linked news when requested
      if (minConfidence > 0) {
        where.OR = [
          { stockId: stock.id, relatedSymbolConfidence: { gte: minConfidence } },
        ];
      }
    }
  } else {
    if (minConfidence > 0) {
      where.relatedSymbolConfidence = { gte: minConfidence };
    }
  }

  if (sentiment) where.sentiment = sentiment;
  if (category) where.category = category;

  const news = await prisma.news.findMany({
    where,
    orderBy: [
      { relatedSymbolConfidence: "desc" },
      { importance: "desc" },
      { publishedAt: "desc" },
    ],
    take: limit,
    select: {
      id: true,
      title: true,
      url: true,
      source: true,
      publishedAt: true,
      sentiment: true,
      summary: true,
      category: true,
      importance: true,
      relatedSymbolConfidence: true,
      stock: { select: { symbol: true, name: true } },
    },
  });

  return NextResponse.json(news);
}
