import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/alpha?limit=&q= — latest-date Alpha factor rows for the debug page.
// Data-layer only; independent of StockScore / DailyRecommendation / Portfolio.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(5000, parseInt(searchParams.get("limit") ?? "3000") || 3000);

  const latest = await prisma.alphaFactor.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, computedAt: true },
  });
  if (!latest) {
    return NextResponse.json({ date: null, computedAt: null, total: 0, rows: [] });
  }

  const rows = await prisma.alphaFactor.findMany({
    where: { date: latest.date },
    orderBy: { averageTurnover20: "desc" },
    take: limit,
  });

  // Enrich with names from Stock (AlphaFactor stores only symbol).
  const symbols = rows.map((r) => r.symbol);
  const stocks = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, name: true, nameZh: true, nameEn: true, sector: true, market: true },
  });
  const nameMap = new Map(stocks.map((s) => [s.symbol, s]));

  let out = rows.map((r) => {
    const s = nameMap.get(r.symbol);
    return {
      symbol: r.symbol,
      name: s?.name ?? r.symbol,
      nameZh: s?.nameZh ?? null,
      nameEn: s?.nameEn ?? null,
      sector: s?.sector ?? null,
      market: s?.market ?? null,
      rs5: r.rs5, rs20: r.rs20, rs60: r.rs60,
      atr14: r.atr14, atrPct: r.atrPct,
      distanceTo52WeekHigh: r.distanceTo52WeekHigh,
      distanceTo52WeekLow: r.distanceTo52WeekLow,
      averageTurnover20: r.averageTurnover20,
      volumeRatio5: r.volumeRatio5, volumeRatio20: r.volumeRatio20,
      volumeExpansionDays: r.volumeExpansionDays,
      buyback: r.buyback, dividendRaise: r.dividendRaise,
      guidanceRaise: r.guidanceRaise, tdnetEvent: r.tdnetEvent,
    };
  });

  if (q) {
    const ql = q.toLowerCase();
    out = out.filter(
      (r) =>
        r.symbol.toLowerCase().includes(ql) ||
        (r.name ?? "").toLowerCase().includes(ql) ||
        (r.nameZh ?? "").includes(q) ||
        (r.nameEn ?? "").toLowerCase().includes(ql)
    );
  }

  return NextResponse.json({
    date: latest.date.toISOString().slice(0, 10),
    computedAt: latest.computedAt.toISOString(),
    total: out.length,
    rows: out,
  });
}
