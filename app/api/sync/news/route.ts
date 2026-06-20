export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchNews } from "@/lib/yahoo";
import { fetchKabutanNews } from "@/lib/kabutan";
import {
  classifySentiment,
  classifyCategory,
  calcImportance,
  importanceLevel,
} from "@/lib/news-utils";

// Map TDnet disclosure category → News category
function tdnetCategoryToNews(tdnetCat: string): string {
  const map: Record<string, string> = {
    EARNINGS: "EARNINGS",
    FORECAST_REVISION: "GUIDANCE",
    BUYBACK: "BUYBACK",
    DIVIDEND: "DIVIDEND",
    EQUITY: "IR",
    MATERIAL: "IR",
    OTHER: "OTHER",
  };
  return map[tdnetCat] ?? "OTHER";
}

export async function GET() {
  const [lastSync, newsCount, stockSpecific, highImportance] = await Promise.all([
    prisma.syncLog.findFirst({
      where: { source: "news" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.news.count(),
    prisma.news.count({ where: { relatedSymbolConfidence: { gte: 70 } } }),
    prisma.news.count({ where: { importance: { gte: 7 } } }),
  ]);

  return NextResponse.json({
    configured: true,
    lastSync,
    newsCount,
    stockSpecificCount: stockSpecific,
    marketCount: newsCount - stockSpecific,
    highImportanceCount: highImportance,
  });
}

export async function POST() {
  const startMs = Date.now();
  const syncedAt = new Date().toISOString();
  let totalUpserted = 0;
  let errors = 0;
  const log: string[] = [];

  // Top 200 stocks by score
  const scored = await prisma.stockScore.findMany({
    select: { symbol: true, name: true },
    orderBy: { totalScore: "desc" },
    take: 200,
  });

  const stockRows = await prisma.stock.findMany({
    where: { symbol: { in: scored.map((s) => s.symbol) } },
    select: { id: true, symbol: true },
  });
  const idMap = new Map(stockRows.map((s) => [s.symbol, s.id]));

  // ── Source 1: Yahoo Finance (market news, confidence=20) ──────────────────
  // Only pull once per unique URL globally — Yahoo returns same articles across symbols
  const yahooSeen = new Set<string>();
  let yahooCount = 0;

  for (const { symbol } of scored.slice(0, 50)) {
    const stockId = idMap.get(symbol);
    if (!stockId) continue;

    try {
      const items = await fetchNews(symbol);
      for (const item of items) {
        if (!item.url || !item.title || yahooSeen.has(item.url)) continue;
        yahooSeen.add(item.url);

        const category = classifyCategory(item.title);
        const importance = calcImportance(item.title, category);
        const sentiment = classifySentiment(item.title);

        await prisma.news
          .upsert({
            where: { url: item.url },
            create: {
              stockId: null,         // market-level, not stock-specific
              title: item.title,
              source: item.source,
              url: item.url,
              publishedAt: item.publishedAt,
              sentiment,
              category,
              importance,
              relatedSymbolConfidence: 20, // Yahoo returns general market news
            },
            update: { sentiment, category, importance },
          })
          .catch(() => null);
        yahooCount++;
        totalUpserted++;
      }
    } catch {
      // Yahoo failures are non-fatal
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  log.push(`Yahoo Finance: ${yahooCount}条 (市场通用, confidence=20)`);

  // ── Source 2: Kabutan (stock-specific news, confidence=90) ────────────────
  let kabutanCount = 0;
  let kabutanErrors = 0;

  for (const { symbol } of scored) {
    const stockId = idMap.get(symbol);
    if (!stockId) continue;

    try {
      const items = await fetchKabutanNews(symbol);
      for (const item of items) {
        if (!item.url || !item.title) continue;
        await prisma.news
          .upsert({
            where: { url: item.url },
            create: {
              stockId,
              title: item.title,
              source: item.source,
              url: item.url,
              publishedAt: item.publishedAt,
              sentiment: item.sentiment,
              category: item.category,
              importance: item.importance,
              relatedSymbolConfidence: item.relatedSymbolConfidence,
            },
            update: {
              sentiment: item.sentiment,
              category: item.category,
              importance: item.importance,
              relatedSymbolConfidence: item.relatedSymbolConfidence,
              stockId,  // claim ownership if previously unlinked
            },
          })
          .catch(() => null);
        kabutanCount++;
        totalUpserted++;
      }

      if (items.length > 0) log.push(`✓ Kabutan ${symbol}: ${items.length}件`);
    } catch (e) {
      kabutanErrors++;
      errors++;
      log.push(`✗ Kabutan ${symbol}: ${(e as Error).message.slice(0, 60)}`);
    }

    // Polite crawl delay
    await new Promise((r) => setTimeout(r, 800));
  }

  log.push(`Kabutan: ${kabutanCount}条 (个股专属, confidence=90), 失败${kabutanErrors}只`);

  // ── Source 3: TDnet disclosures → News table (confidence=95) ─────────────
  let tdnetCount = 0;
  try {
    const recentDisclosures = await prisma.disclosure.findMany({
      where: {
        publishedAt: { gte: new Date(Date.now() - 30 * 86400000) },
        symbol: { in: scored.map((s) => s.symbol) },
      },
      orderBy: { publishedAt: "desc" },
      take: 500,
    });

    for (const d of recentDisclosures) {
      const stockId = d.symbol ? idMap.get(d.symbol) : null;
      const category = tdnetCategoryToNews(d.category);
      const importance = d.importance;
      const sentiment = classifySentiment(d.title);

      // Build a News-table URL (TDnet disclosure URL as-is)
      const newsUrl = `tdnet:${d.url}`;

      await prisma.news
        .upsert({
          where: { url: newsUrl },
          create: {
            stockId: stockId ?? null,
            title: d.title,
            source: "TDnet",
            url: newsUrl,
            publishedAt: d.publishedAt,
            sentiment,
            category,
            importance,
            relatedSymbolConfidence: 95,
          },
          update: { sentiment, category, importance, stockId: stockId ?? undefined },
        })
        .catch(() => null);

      tdnetCount++;
      totalUpserted++;
    }

    log.push(`TDnet適時開示: ${tdnetCount}条 (confidence=95)`);
  } catch (e) {
    errors++;
    log.push(`✗ TDnet→News: ${(e as Error).message.slice(0, 80)}`);
  }

  // ── Final stats ───────────────────────────────────────────────────────────
  const [totalNews, stockSpecific, highImp] = await Promise.all([
    prisma.news.count(),
    prisma.news.count({ where: { relatedSymbolConfidence: { gte: 70 } } }),
    prisma.news.count({ where: { importance: { gte: 7 } } }),
  ]);

  const durationMs = Date.now() - startMs;
  const status = errors === 0 ? "SUCCESS" : totalUpserted > 0 ? "PARTIAL" : "ERROR";
  const count = totalUpserted;

  await prisma.syncLog.create({
    data: {
      source: "news",
      status,
      message: log.slice(0, 50).join("\n"),
      itemCount: count,
      durationMs,
    },
  });

  return NextResponse.json({
    success: status !== "ERROR",
    source: "news",
    status,
    count,
    synced: count,
    errors,
    durationMs,
    syncedAt,
    stats: {
      total: totalNews,
      stockSpecific,
      market: totalNews - stockSpecific,
      highImportance: highImp,
      highImportanceLabel: importanceLevel(7),
      bySource: {
        yahoo: yahooCount,
        kabutan: kabutanCount,
        tdnet: tdnetCount,
      },
    },
    log: log.slice(0, 40),
  });
}
