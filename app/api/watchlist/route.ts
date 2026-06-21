import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await prisma.watchList.findMany({
    orderBy: { addedAt: "desc" },
  });

  // Enrich with StockScore + nameZh from Stock table
  const enriched = await Promise.all(
    items.map(async (w) => {
      const [score, stock] = await Promise.all([
        prisma.stockScore.findUnique({
          where: { symbol: w.symbol },
          select: {
            latestClose: true, latestDate: true,
            return5d: true, return20d: true, return60d: true,
            rsi14: true, maTrend: true, macdSignalLabel: true,
            technicalScore: true, fundamentalScore: true,
            moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true,
            riskScore: true,
            totalScore: true, recommendation: true, starsLabel: true, summaryReason: true,
          },
        }),
        prisma.stock.findUnique({
          where: { symbol: w.symbol },
          select: { nameZh: true, nameEn: true },
        }),
      ]);
      return { ...w, nameZh: stock?.nameZh ?? null, nameEn: stock?.nameEn ?? null, score };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, name, sector, market, note, targetPrice } = body;

  if (!symbol || !name) {
    return NextResponse.json({ error: "symbol and name required" }, { status: 400 });
  }

  const item = await prisma.watchList.upsert({
    where: { symbol },
    update: { note, targetPrice: targetPrice ?? null },
    create: { symbol, name, sector, market, note, targetPrice: targetPrice ?? null },
  });

  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  await prisma.watchList.deleteMany({ where: { symbol } });
  return NextResponse.json({ ok: true });
}
