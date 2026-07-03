import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/alpha/[symbol] — latest Alpha factor row for a symbol (Phase 1 data layer).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);

  const row = await prisma.alphaFactor.findFirst({
    where: { symbol },
    orderBy: { date: "desc" },
  });
  if (!row) {
    return NextResponse.json({ error: "No alpha factors for symbol", symbol }, { status: 404 });
  }

  const stock = await prisma.stock.findUnique({
    where: { symbol },
    select: { name: true, nameZh: true, nameEn: true, sector: true, market: true },
  });

  return NextResponse.json({
    symbol,
    name: stock?.name ?? symbol,
    nameZh: stock?.nameZh ?? null,
    nameEn: stock?.nameEn ?? null,
    sector: stock?.sector ?? null,
    market: stock?.market ?? null,
    date: row.date.toISOString().slice(0, 10),
    computedAt: row.computedAt.toISOString(),
    factors: {
      rs5: row.rs5, rs20: row.rs20, rs60: row.rs60,
      atr14: row.atr14, atrPct: row.atrPct,
      distanceTo52WeekHigh: row.distanceTo52WeekHigh,
      distanceTo52WeekLow: row.distanceTo52WeekLow,
      averageTurnover20: row.averageTurnover20,
      volumeRatio5: row.volumeRatio5, volumeRatio20: row.volumeRatio20,
      volumeExpansionDays: row.volumeExpansionDays,
      buyback: row.buyback, dividendRaise: row.dividendRaise,
      guidanceRaise: row.guidanceRaise, tdnetEvent: row.tdnetEvent,
    },
  });
}
