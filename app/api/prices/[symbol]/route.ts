import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);
  const { searchParams } = new URL(req.url);
  const days = Math.min(Number(searchParams.get("days") || "90"), 365);

  const from = new Date(Date.now() - days * 86400000);

  const prices = await prisma.dailyPrice.findMany({
    where: {
      symbol: decoded,
      date: { gte: from },
    },
    orderBy: { date: "asc" },
    select: { date: true, open: true, high: true, low: true, close: true, volume: true },
  });

  return NextResponse.json(prices);
}
