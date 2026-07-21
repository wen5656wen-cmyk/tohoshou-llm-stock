export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { fetchTDnetForDate } from "@/lib/tdnet";

export async function GET(req: Request) {
  // P21-S2 纵深防御：middleware 之外的第二道闸门，必须先于任何副作用。
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  const lastSync = await prisma.syncLog.findFirst({
    where: { source: "tdnet" },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ configured: true, source: "tdnet_real", lastSync });
}

export async function POST(req: Request) {
  // P21-S2 纵深防御：middleware 之外的第二道闸门，必须先于任何副作用。
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  const startMs = Date.now();

  // Fetch last 3 trading days
  const tradingDays: Date[] = [];
  const d = new Date();
  while (tradingDays.length < 3) {
    if (d.getDay() !== 0 && d.getDay() !== 6) tradingDays.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }

  const stocks = await prisma.stock.findMany({ select: { id: true, symbol: true } });
  const stockMap = new Map(stocks.map((s) => [s.symbol, s.id]));

  let synced = 0;
  let errors = 0;
  const log: string[] = [];

  for (const day of tradingDays) {
    const dateStr = day.toISOString().split("T")[0];
    try {
      const disclosures = await fetchTDnetForDate(day);
      log.push(`${dateStr}: ${disclosures.length} disclosures`);

      for (const disc of disclosures) {
        try {
          await prisma.disclosure.upsert({
            where: { url: disc.url },
            create: {
              symbol: disc.symbol,
              stockId: stockMap.get(disc.symbol) ?? null,
              title: disc.title,
              publishedAt: disc.publishedAt,
              category: disc.category,
              sentiment: disc.sentiment,
              url: disc.url,
              importance: disc.importance,
              rawData: { companyName: disc.companyName },
            },
            update: { category: disc.category, sentiment: disc.sentiment, importance: disc.importance },
          });
          synced++;
        } catch (_) { /* skip duplicate url */ }
      }
    } catch (e) {
      errors++;
      log.push(`${dateStr}: ERROR ${(e as Error).message}`);
    }
  }

  const durationMs = Date.now() - startMs;
  const status = errors > 0 && synced === 0 ? "ERROR" : errors > 0 ? "PARTIAL" : "SUCCESS";

  // Write SyncLog
  await prisma.syncLog.create({
    data: {
      source: "tdnet",
      status,
      message: log.join(" | ").slice(0, 500),
      itemCount: synced,
      durationMs,
    },
  });

  return NextResponse.json({
    success: status !== "ERROR",
    status,
    synced,
    count: synced,
    errors,
    durationMs,
    syncedAt: new Date().toISOString(),
    log,
  });
}
