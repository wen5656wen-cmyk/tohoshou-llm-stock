import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);

  const stock = await prisma.stock.findUnique({
    where: { symbol: decoded },
    include: {
      financials: {
        orderBy: [{ fiscalYear: "desc" }, { quarter: "desc" }],
        take: 8,
      },
      news: {
        orderBy: { publishedAt: "desc" },
        take: 10,
      },
      analyses: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(stock);
}
