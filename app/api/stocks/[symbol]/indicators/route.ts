import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcIndicators } from "@/lib/indicators";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  // Fetch latest 300 records desc, then reverse to ascending for indicators
  const pricesDesc = await prisma.dailyPrice.findMany({
    where: { symbol },
    orderBy: { date: "desc" },
    select: { date: true, close: true, open: true, high: true, low: true, volume: true },
    take: 300,
  });
  const prices = pricesDesc.reverse();

  if (prices.length === 0) {
    return NextResponse.json({ error: "No price data" }, { status: 404 });
  }

  const rows = prices.map((p) => ({
    date: p.date.toISOString().split("T")[0],
    close: Number(p.close),
    open: p.open ? Number(p.open) : undefined,
    high: p.high ? Number(p.high) : undefined,
    low: p.low ? Number(p.low) : undefined,
    volume: p.volume ? Number(p.volume) : undefined,
  }));

  const indicators = calcIndicators(symbol, rows);

  // Price series for charts (full OHLCV for candlestick rendering)
  const all = rows.map((r) => ({
    date: r.date,
    open: r.open ?? r.close,
    high: r.high ?? r.close,
    low: r.low ?? r.close,
    close: r.close,
    volume: r.volume,
  }));
  const last30 = all.slice(-30);
  const last250 = all.slice(-250);

  return NextResponse.json({
    indicators,
    series: { all, last30, last250 },
  });
}
