export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchNews } from "@/lib/yahoo";
import { fetchKabutanNews } from "@/lib/kabutan";
import {
  classifySentiment,
  classifyCategory,
  calcImportance,
} from "@/lib/news-utils";

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
  const runningJob = await prisma.syncJob.findFirst({
    where: { source: "news", status: { in: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });

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
    runningJob: runningJob
      ? { jobId: runningJob.id, processed: runningJob.processed, total: runningJob.total }
      : null,
    lastSync,
    newsCount,
    stockSpecificCount: stockSpecific,
    marketCount: newsCount - stockSpecific,
    highImportanceCount: highImportance,
  });
}

export async function POST() {
  const existingJob = await prisma.syncJob.findFirst({
    where: { source: "news", status: { in: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existingJob) {
    return NextResponse.json({
      success: true,
      jobId: existingJob.id,
      status: existingJob.status,
      message: "已有正在运行的新闻同步任务",
      total: existingJob.total,
      processed: existingJob.processed,
    });
  }

  const scored = await prisma.stockScore.findMany({
    select: { symbol: true },
    orderBy: { totalScore: "desc" },
    take: 200,
  });

  const job = await prisma.syncJob.create({
    data: {
      source: "news",
      status: "PENDING",
      total: scored.length,
    },
  });

  void runNewsSync(job.id, scored.map((s) => s.symbol));

  return NextResponse.json({
    success: true,
    jobId: job.id,
    status: "RUNNING",
    message: `新闻同步任务已开始，共 ${scored.length} 只股票`,
    total: scored.length,
    processed: 0,
    syncedAt: new Date().toISOString(),
  });
}

// ── Background sync function ─────────────────────────────────────────────────
async function runNewsSync(jobId: string, symbols: string[]) {
  try {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const stockRows = await prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { id: true, symbol: true },
    });
    const idMap = new Map(stockRows.map((s) => [s.symbol, s.id]));

    const logLines: string[] = [];
    let totalUpserted = 0;
    let errors = 0;

    // ── Source 1: Yahoo Finance (market news, confidence=20) ──────────────────
    const yahooSeen = new Set<string>();
    let yahooCount = 0;

    for (const symbol of symbols.slice(0, 50)) {
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
                stockId: null,
                title: item.title,
                source: item.source,
                url: item.url,
                publishedAt: item.publishedAt,
                sentiment,
                category,
                importance,
                relatedSymbolConfidence: 20,
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

    logLines.push(`Yahoo Finance: ${yahooCount}条 (市場通用, confidence=20)`);

    // ── Source 2: Kabutan (stock-specific news) — tracks progress ─────────────
    let kabutanCount = 0;
    let kabutanErrors = 0;

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const stockId = idMap.get(symbol);

      if (stockId) {
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
                  stockId,
                },
              })
              .catch(() => null);
            kabutanCount++;
            totalUpserted++;
          }

          if (items.length > 0) logLines.push(`✓ Kabutan ${symbol}: ${items.length}件`);
        } catch (e) {
          kabutanErrors++;
          errors++;
          logLines.push(`✗ Kabutan ${symbol}: ${(e as Error).message.slice(0, 60)}`);
        }
      }

      // Update progress after each stock
      await prisma.syncJob.update({
        where: { id: jobId },
        data: {
          processed: i + 1,
          successCount: kabutanCount,
          failedCount: kabutanErrors,
        },
      });

      await new Promise((r) => setTimeout(r, 800));
    }

    logLines.push(`Kabutan: ${kabutanCount}条 (個株専属), 失败${kabutanErrors}只`);

    // ── Source 3: TDnet disclosures → News table (confidence=95) ─────────────
    let tdnetCount = 0;
    try {
      const recentDisclosures = await prisma.disclosure.findMany({
        where: {
          publishedAt: { gte: new Date(Date.now() - 30 * 86400000) },
          symbol: { in: symbols },
        },
        orderBy: { publishedAt: "desc" },
        take: 500,
      });

      for (const d of recentDisclosures) {
        const stockId = d.symbol ? idMap.get(d.symbol) : null;
        const category = tdnetCategoryToNews(d.category);
        const sentiment = classifySentiment(d.title);
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
              importance: d.importance,
              relatedSymbolConfidence: 95,
            },
            update: { sentiment, category, importance: d.importance, stockId: stockId ?? undefined },
          })
          .catch(() => null);

        tdnetCount++;
        totalUpserted++;
      }

      logLines.push(`TDnet適時開示: ${tdnetCount}条 (confidence=95)`);
    } catch (e) {
      errors++;
      logLines.push(`✗ TDnet→News: ${(e as Error).message.slice(0, 80)}`);
    }

    // ── Finalize ──────────────────────────────────────────────────────────────
    const finalStatus = kabutanErrors === 0 && errors === 0 ? "SUCCESS" : kabutanCount > 0 ? "SUCCESS" : "FAILED";

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        processed: symbols.length,
        successCount: kabutanCount,
        failedCount: kabutanErrors,
        finishedAt: new Date(),
        errorMessage: kabutanErrors > 0 ? `${kabutanErrors} 只股票失败` : null,
      },
    });

    const syncLogStatus = errors === 0 ? "SUCCESS" : totalUpserted > 0 ? "PARTIAL" : "ERROR";
    await prisma.syncLog.create({
      data: {
        source: "news",
        status: syncLogStatus,
        message: logLines.slice(0, 50).join("\n"),
        itemCount: totalUpserted,
        durationMs: null,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[news] background sync fatal error:", msg);
    await prisma.syncJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: msg.slice(0, 500),
        },
      })
      .catch(() => {});
  }
}
