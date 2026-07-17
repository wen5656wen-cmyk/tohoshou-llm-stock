/**
 * Standalone news sync worker — replaces the HTTP POST to /api/sync/news.
 * Called directly by cron-scheduler.ts via execSync("npx tsx scripts/sync-news.ts").
 * Running as a child process means pm2 restart of tohoshou-web does NOT kill this job.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { fetchNews } from "../lib/yahoo";
import { fetchKabutanNews } from "../lib/kabutan";
import {
  classifySentiment,
  classifyCategory,
  calcImportance,
} from "../lib/news-utils";
import { calcTradeEffectiveDate } from "../lib/safety-rules";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const STALE_JOB_THRESHOLD_MS = 2 * 60 * 60 * 1000;

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

async function main() {
  const startMs = Date.now();

  // ── Stale job guard ────────────────────────────────────────────────────────
  const existingJob = await prisma.syncJob.findFirst({
    where: { source: "news", status: { in: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });

  if (existingJob) {
    const ageMs = Date.now() - existingJob.createdAt.getTime();
    if (ageMs <= STALE_JOB_THRESHOLD_MS) {
      console.log(
        `[sync-news] SKIPPED — job ${existingJob.id} already running (${Math.round(ageMs / 60000)}min)`
      );
      process.exit(0);
    }
    await prisma.syncJob.update({
      where: { id: existingJob.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: "Auto failed by stale job guard (>2h without completion)",
      },
    });
    console.warn(
      `[sync-news] stale job ${existingJob.id} auto-failed (age: ${Math.round(ageMs / 60000)}min)`
    );
  }

  // ── Target symbols: top 200 by adaptiveScore ─────────────────────────────
  const scored = await prisma.stockScore.findMany({
    select: { symbol: true },
    orderBy: { adaptiveScore: "desc" },
    take: 200,
  });
  const symbols = scored.map((s) => s.symbol);

  const job = await prisma.syncJob.create({
    data: {
      source: "news",
      status: "PENDING",
      total: symbols.length,
    },
  });

  await prisma.syncJob.update({
    where: { id: job.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  console.log(`[sync-news] started jobId=${job.id}, symbols=${symbols.length}`);

  const stockRows = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
    select: { id: true, symbol: true },
  });
  const idMap = new Map(stockRows.map((s) => [s.symbol, s.id]));

  const logLines: string[] = [];
  let totalUpserted = 0;
  let errors = 0;

  try {
    // ── Source 1: Yahoo Finance (market news, confidence=20) ────────────────
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
          const tradeEffDate = calcTradeEffectiveDate(item.publishedAt);

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
                tradeEffectiveDate: tradeEffDate,
              },
              update: {
                sentiment,
                category,
                importance,
                tradeEffectiveDate: tradeEffDate,
              },
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

    // ── Source 2: Kabutan (stock-specific news) — tracks progress ───────────
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
            const tradeEffDate = calcTradeEffectiveDate(item.publishedAt);
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
                  tradeEffectiveDate: tradeEffDate,
                },
                update: {
                  sentiment: item.sentiment,
                  category: item.category,
                  importance: item.importance,
                  relatedSymbolConfidence: item.relatedSymbolConfidence,
                  stockId,
                  tradeEffectiveDate: tradeEffDate,
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

      await prisma.syncJob.update({
        where: { id: job.id },
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
        const tradeEffDate = calcTradeEffectiveDate(d.publishedAt);

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
              tradeEffectiveDate: tradeEffDate,
            },
            update: {
              sentiment,
              category,
              importance: d.importance,
              stockId: stockId ?? undefined,
              tradeEffectiveDate: tradeEffDate,
            },
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
    const kabutanErrors2 = errors;
    const finalStatus =
      kabutanErrors === 0 && errors === 0 ? "SUCCESS" : kabutanCount > 0 ? "SUCCESS" : "FAILED";

    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: finalStatus,
        processed: symbols.length,
        successCount: kabutanCount,
        failedCount: kabutanErrors,
        finishedAt: new Date(),
        errorMessage: kabutanErrors > 0 ? `${kabutanErrors} 只股票失败` : null,
      },
    });

    const syncLogStatus =
      errors === 0 ? "SUCCESS" : totalUpserted > 0 ? "PARTIAL" : "ERROR";
    await prisma.syncLog.create({
      data: {
        source: "news",
        status: syncLogStatus,
        message: logLines.slice(0, 50).join("\n"),
        itemCount: totalUpserted,
        durationMs: Date.now() - startMs,
      },
    });

    const elapsedMin = ((Date.now() - startMs) / 60000).toFixed(1);
    console.log(
      `[sync-news] DONE jobId=${job.id} status=${finalStatus} ` +
        `total=${totalUpserted} elapsed=${elapsedMin}min`
    );
    void kabutanErrors2; // suppress unused-var warning
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[sync-news] fatal error:", msg);
    await prisma.syncJob
      .update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: msg.slice(0, 500),
        },
      })
      .catch(() => {});
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
