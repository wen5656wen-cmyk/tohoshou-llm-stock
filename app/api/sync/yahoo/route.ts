export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuote } from "@/lib/yahoo";

export async function GET() {
  const lastSync = await prisma.syncLog.findFirst({
    where: { source: "yahoo" },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ configured: true, lastSync });
}

export async function POST() {
  const startMs = Date.now();
  let synced = 0;
  let errors = 0;
  const log: string[] = [];

  // Sync top 300 stocks with recent price data (from StockScore)
  // Only update current quote — historical prices are handled by J-Quants sync
  const scored = await prisma.stockScore.findMany({
    select: { symbol: true },
    orderBy: { totalScore: "desc" },
    take: 300,
  });

  const symbols = scored.map((s) => s.symbol);

  const stockMap = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { id: true, symbol: true },
  });
  const idMap = new Map(stockMap.map((s) => [s.symbol, s.id]));

  for (const { symbol } of scored) {
    const stockId = idMap.get(symbol);
    if (!stockId) continue;

    try {
      const quote = await fetchQuote(symbol);

      if (!quote.price || quote.price === 0) {
        log.push(`⚠ ${symbol}: price=0, skipped`);
        continue;
      }

      await prisma.stock.update({
        where: { id: stockId },
        data: {
          price: quote.price,
          change: quote.change,
          changeRate: quote.changeRate,
          marketCap: quote.marketCap,
          per: quote.per,
          pbr: quote.pbr,
          eps: quote.eps,
          bps: quote.bps,
          high52w: quote.high52w,
          low52w: quote.low52w,
          volume: quote.volume,
          avgVolume: quote.avgVolume,
          beta: quote.beta,
          dividend: quote.dividend,
          lastSyncAt: new Date(),
        },
      });

      synced++;
      log.push(`✓ ${symbol}: ¥${quote.price}`);
    } catch (e) {
      errors++;
      log.push(`✗ ${symbol}: ${(e as Error).message.slice(0, 120)}`);
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  const durationMs = Date.now() - startMs;
  const status = errors === 0 ? "SUCCESS" : synced > 0 ? "PARTIAL" : "ERROR";
  const syncedAt = new Date().toISOString();

  await prisma.syncLog.create({
    data: {
      source: "yahoo",
      status,
      message: log.slice(0, 100).join("\n"),
      itemCount: synced,
      durationMs,
    },
  });

  if (status === "ERROR") {
    return NextResponse.json(
      {
        success: false,
        source: "yahoo-finance",
        error: `全部 ${errors} 只股票同步失败`,
        detail: log.slice(0, 10).join("\n"),
        syncedAt,
        durationMs,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    source: "yahoo-finance",
    status,
    count: synced,
    synced,
    errors,
    durationMs,
    syncedAt,
    log: log.slice(0, 30),
  });
}
