import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  const stock = await prisma.stock.findUnique({
    where: { symbol },
    select: { id: true },
  });

  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const financials = await prisma.financial.findMany({
    where: { stockId: stock.id },
    orderBy: [{ fiscalYear: "desc" }, { quarter: "desc" }],
    select: {
      id: true,
      fiscalYear: true,
      quarter: true,
      revenue: true,
      operatingProfit: true,
      ordinaryProfit: true,
      netProfit: true,
      eps: true,
      bps: true,
      roe: true,
      roa: true,
      equityRatio: true,
      dividendPerShare: true,
      reportedAt: true,
      source: true,
    },
  });

  return NextResponse.json(financials);
}
