/**
 * lib/ingest/news.ts — News 摄入编排（Core · P12-INFRA-02）
 * ────────────────────────────────────────────────────────────────────────────
 * 重构前，本文件的逻辑在两处**逐字重复**：
 *   · scripts/sync-news.ts        （318 行，219 行与 API 版逐字相同）
 *   · app/api/sync/news/route.ts  （338 行）
 * 两个入口都必须保留（见 types.ts 说明），重复的是它们中间的编排层 —— 现集中于此。
 *
 * 🔒 纯重构契约：**代码搬移，不是重写**。
 *   · DB 操作的种类 / 顺序 / 参数 / 字段，与重构前逐一相同；
 *   · 入口间的既有差异（logPrefix / durationMs / DONE 行）由 NewsSyncOptions 显式承载，
 *     **原样保留，不做"顺手修复"**（含 API 侧 durationMs=null 这一既有缺陷）；
 *   · 未改：抓取范围 / Top200 / TDnet 双重过滤 / sentiment / EventType /
 *           adaptiveScore / Recommendation / Gate / Explain / Top Picks / Schema。
 */

import { fetchNews as realFetchNews } from "../yahoo";
import { fetchKabutanNews as realFetchKabutanNews } from "../kabutan";
import { classifySentiment, classifyCategory, calcImportance } from "../news-utils";
import { calcTradeEffectiveDate } from "../safety-rules";
import {
  CONFIDENCE_DISCLOSURE,
  CONFIDENCE_MARKET,
  KABUTAN_DELAY_MS,
  LOG_LINES_LIMIT,
  NEWS_SOURCE,
  NEWS_TOP_N,
  STALE_JOB_THRESHOLD_MS,
  TDNET_PROMOTE_LOOKBACK_DAYS,
  TDNET_PROMOTE_TAKE,
  YAHOO_DELAY_MS,
  YAHOO_SLICE,
} from "./config";
import type { IngestDeps, NewsSyncOptions, SyncJobRow } from "./types";

/** 抓取器契约。默认绑定真实实现；测试可注入桩以获得确定性输入。 */
export type NewsFetchers = {
  fetchNews: typeof realFetchNews;
  fetchKabutanNews: typeof realFetchKabutanNews;
};

export const DEFAULT_FETCHERS: NewsFetchers = {
  fetchNews: realFetchNews,
  fetchKabutanNews: realFetchKabutanNews,
};

/** TDnet DisclosureCategory → News.category（两套 category 词表的映射）。原样搬移。 */
export function tdnetCategoryToNews(tdnetCat: string): string {
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

/** 查找进行中的任务（两入口的 stale guard 第一步，DB 查询完全一致）。 */
export async function findRunningJob({ prisma }: IngestDeps): Promise<SyncJobRow | null> {
  return prisma.syncJob.findFirst({
    where: { source: NEWS_SOURCE, status: { in: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  }) as unknown as Promise<SyncJobRow | null>;
}

/** 任务是否已超过僵尸阈值（>2h）。 */
export function isStale(job: SyncJobRow, now = Date.now()): boolean {
  return now - job.createdAt.getTime() > STALE_JOB_THRESHOLD_MS;
}

/** 僵尸任务自动置失败。errorMessage 文案原样保留（两入口一致）。 */
export async function autoFailStaleJob({ prisma }: IngestDeps, job: SyncJobRow): Promise<void> {
  await prisma.syncJob.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorMessage: "Auto failed by stale job guard (>2h without completion)",
    },
  });
}

/**
 * 抓取标的：按 adaptiveScore 取前 200。
 * 🔒 Top200 是 Baseline P12-DATA-02 的目标，本任务禁止改动。
 */
export async function selectNewsSymbols({ prisma }: IngestDeps): Promise<string[]> {
  const scored = await prisma.stockScore.findMany({
    select: { symbol: true },
    orderBy: { adaptiveScore: "desc" },
    take: NEWS_TOP_N,
  });
  return scored.map((s) => s.symbol);
}

/** 创建 PENDING 任务。 */
export async function createNewsJob({ prisma }: IngestDeps, total: number): Promise<SyncJobRow> {
  return prisma.syncJob.create({
    data: { source: NEWS_SOURCE, status: "PENDING", total },
  }) as unknown as Promise<SyncJobRow>;
}

/**
 * News 同步主体 —— 重构前 scripts/sync-news.ts:82-315 与
 * app/api/sync/news/route.ts:122-338 的逐字合并版本。
 *
 * DB 操作顺序（与重构前完全一致）：
 *   1. syncJob.update → RUNNING + startedAt
 *   2. stock.findMany（symbol → id 映射）
 *   3. Source 1 Yahoo：前 50 只 × news.upsert(conf=20)，每只间隔 100ms
 *   4. Source 2 Kabutan：全部 200 只 × news.upsert(item 自带 conf)，
 *      **每只之后 syncJob.update 进度**，间隔 800ms
 *   5. Source 3 TDnet→News：disclosure.findMany(30日, symbol IN, take 500)
 *      × news.upsert(conf=95)
 *   6. syncJob.update → 终态
 *   7. syncLog.create
 */
export async function runNewsSync(
  deps: IngestDeps,
  jobId: string,
  symbols: string[],
  opts: NewsSyncOptions,
  /**
   * 抓取器注入点。**默认即真实实现** —— 两个生产入口都不传，行为与重构前一致。
   * 仅 scripts/test-ingest-equivalence.ts 注入桩，以便在确定性输入下比对 DB 操作序列。
   */
  fetchers: NewsFetchers = DEFAULT_FETCHERS,
): Promise<void> {
  const { prisma } = deps;
  const { fetchNews, fetchKabutanNews } = fetchers;
  const { logPrefix, fatalLabel, startMs, logDone, onFatal } = opts;

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

    for (const symbol of symbols.slice(0, YAHOO_SLICE)) {
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
                relatedSymbolConfidence: CONFIDENCE_MARKET,
                tradeEffectiveDate: tradeEffDate,
              },
              update: { sentiment, category, importance, tradeEffectiveDate: tradeEffDate },
            })
            .catch(() => null);
          yahooCount++;
          totalUpserted++;
        }
      } catch {
        // Yahoo failures are non-fatal
      }
      await new Promise((r) => setTimeout(r, YAHOO_DELAY_MS));
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
        where: { id: jobId },
        data: { processed: i + 1, successCount: kabutanCount, failedCount: kabutanErrors },
      });

      await new Promise((r) => setTimeout(r, KABUTAN_DELAY_MS));
    }
    logLines.push(`Kabutan: ${kabutanCount}条 (個株専属), 失败${kabutanErrors}只`);

    // ── Source 3: TDnet disclosures → News table (confidence=95) ──────────────
    // 🔒 `symbol: { in: symbols }` + `take: 500` 是 Baseline P12-DATA-02 的目标，本任务禁止改动。
    let tdnetCount = 0;
    try {
      const recentDisclosures = await prisma.disclosure.findMany({
        where: {
          publishedAt: { gte: new Date(Date.now() - TDNET_PROMOTE_LOOKBACK_DAYS * 86400000) },
          symbol: { in: symbols },
        },
        orderBy: { publishedAt: "desc" },
        take: TDNET_PROMOTE_TAKE,
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
              relatedSymbolConfidence: CONFIDENCE_DISCLOSURE,
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
    const finalStatus =
      kabutanErrors === 0 && errors === 0 ? "SUCCESS" : kabutanCount > 0 ? "SUCCESS" : "FAILED";

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
        source: NEWS_SOURCE,
        status: syncLogStatus,
        message: logLines.slice(0, LOG_LINES_LIMIT).join("\n"),
        itemCount: totalUpserted,
        // scripts: 真实耗时；api: null（既有缺陷，原样保留 —— 修它属于行为变更）
        durationMs: startMs === null ? null : Date.now() - startMs,
      },
    });

    if (logDone && startMs !== null) {
      const elapsedMin = ((Date.now() - startMs) / 60000).toFixed(1);
      console.log(
        `${logPrefix} DONE jobId=${jobId} status=${finalStatus} ` +
          `total=${totalUpserted} elapsed=${elapsedMin}min`,
      );
    }
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`${logPrefix} ${fatalLabel}`, msg);
    await prisma.syncJob
      .update({
        where: { id: jobId },
        data: { status: "FAILED", finishedAt: new Date(), errorMessage: msg.slice(0, 500) },
      })
      .catch(() => {});
    onFatal?.(msg);
  }
}
