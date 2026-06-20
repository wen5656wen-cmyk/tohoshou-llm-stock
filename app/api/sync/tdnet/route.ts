import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchTDnetDisclosures, classifySentiment } from "@/lib/tdnet";

export async function POST() {
  const startMs = Date.now();

  const stocks = await prisma.stock.findMany({
    select: { id: true, symbol: true, name: true },
  });

  const disclosures = await fetchTDnetDisclosures(stocks.map((s) => s.symbol));
  const stockMap = Object.fromEntries(stocks.map((s) => [s.symbol, s.id]));

  let synced = 0;
  const log: string[] = [];

  for (const d of disclosures) {
    const sentiment = classifySentiment(d.title);
    try {
      await prisma.disclosure.upsert({
        where: { url: d.url },
        create: {
          stockId: stockMap[d.symbol] ?? null,
          symbol: d.symbol,
          title: d.title,
          publishedAt: d.publishedAt,
          category: d.category,
          sentiment,
          url: d.url,
          importance: d.importance,
        },
        update: { sentiment },
      });
      synced++;
      log.push(`✓ ${d.symbol}: ${d.title.slice(0, 40)}...`);
    } catch (e) {
      log.push(`✗ ${d.symbol}: ${(e as Error).message}`);
    }
  }

  const durationMs = Date.now() - startMs;
  await prisma.syncLog.create({
    data: {
      source: "tdnet",
      status: "SUCCESS",
      message: log.join("\n"),
      itemCount: synced,
      durationMs,
    },
  });

  return NextResponse.json({ status: "SUCCESS", synced, durationMs, log });
}
