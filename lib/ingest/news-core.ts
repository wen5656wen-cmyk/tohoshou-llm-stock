/**
 * lib/ingest/news-core.ts — News 摄入编排（P12-INFRA-02 · **Zero Wiring**）
 * ════════════════════════════════════════════════════════════════════════════
 * 🚧 **尚未接线**：scripts/sync-news.ts 与 app/api/sync/news/route.ts 仍各自使用原实现。
 *    本文件是候选共享实现，只经离线等价测试验证，等待 INFRA-03（先切 API）/
 *    INFRA-04（后切 scripts —— 生产 cron 关键链，必须最后）。
 *
 * 契约：
 *   · 不 import Next.js，不碰 Request/Response
 *   · 不调用 process.exit —— 致命错误经 result.fatalError 返回，由入口决定退出码
 *   · 不读 process.argv
 *   · prisma / logger / clock / fetchers 全部注入 → 同一输入产生确定性输出
 *   · 两入口的既有差异由 NewsProfile 承载，**如实保留，不擅自合并**
 */

import {
  CONFIDENCE_DISCLOSURE, KABUTAN_DELAY_MS, LOG_LINES_LIMIT, NEWS_SOURCE, NEWS_TOP_N,
  STALE_JOB_THRESHOLD_MS, TDNET_PROMOTE_LOOKBACK_DAYS, TDNET_PROMOTE_TAKE, YAHOO_DELAY_MS, YAHOO_SLICE,
} from "./config";
import {
  buildKabutanNewsUpsert, buildNewsSyncLog, buildTdnetPromotionUpsert, buildYahooNewsUpsert, newsDedupeKey,
} from "./normalize";
import { fetchNews as realFetchNews } from "../yahoo";
import { fetchKabutanNews as realFetchKabutanNews } from "../kabutan";
import type { IngestDeps, NewsFetchers, NewsProfile, NewsSyncResult, SyncJobRow } from "./types";

void CONFIDENCE_DISCLOSURE; // 载荷常量在 normalize.ts 内使用；此处仅作显式依赖声明

/**
 * 生产抓取器（P12-INFRA-03 接线所需）。
 * 与重构前 app/api/sync/news/route.ts 所 import 的是**同一对函数**
 * （`lib/yahoo.fetchNews` / `lib/kabutan.fetchKabutanNews`），行为不变。
 * 测试注入桩以获得确定性输入。
 */
export const DEFAULT_NEWS_FETCHERS: NewsFetchers = {
  fetchNews: realFetchNews,
  fetchKabutanNews: realFetchKabutanNews,
};

/** 查找进行中的任务（两入口 stale guard 的第一步，DB 查询完全一致）。 */
export async function findRunningJob({ prisma }: Pick<IngestDeps, "prisma">): Promise<SyncJobRow | null> {
  return prisma.syncJob.findFirst({
    where: { source: NEWS_SOURCE, status: { in: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  }) as unknown as Promise<SyncJobRow | null>;
}

/** 任务是否已超过僵尸阈值（>2h）。now 由 clock 注入 → 可复现。 */
export function isStale(job: SyncJobRow, now: number): boolean {
  return now - job.createdAt.getTime() > STALE_JOB_THRESHOLD_MS;
}

/** 僵尸任务自动置失败。errorMessage 文案逐字取自原实现（两侧一致）。 */
export async function autoFailStaleJob(
  { prisma, clock }: Pick<IngestDeps, "prisma" | "clock">,
  job: SyncJobRow,
): Promise<void> {
  await prisma.syncJob.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      finishedAt: clock.date(),
      errorMessage: "Auto failed by stale job guard (>2h without completion)",
    },
  });
}

/**
 * 抓取标的：按 adaptiveScore 取前 200。
 * 🔒 Top200 是 Baseline P12-DATA-02 的目标，本任务禁止改动。
 */
export async function selectNewsSymbols({ prisma }: Pick<IngestDeps, "prisma">): Promise<string[]> {
  const scored = await prisma.stockScore.findMany({
    select: { symbol: true },
    orderBy: { adaptiveScore: "desc" },
    take: NEWS_TOP_N,
  });
  return scored.map((s) => s.symbol);
}

/** 创建 PENDING 任务。 */
export async function createNewsJob(
  { prisma }: Pick<IngestDeps, "prisma">,
  total: number,
): Promise<SyncJobRow> {
  return prisma.syncJob.create({
    data: { source: NEWS_SOURCE, status: "PENDING", total },
  }) as unknown as Promise<SyncJobRow>;
}

/**
 * News 同步主体。DB 操作顺序逐字对齐原实现：
 *   1. syncJob.update → RUNNING + startedAt
 *   2. stock.findMany（symbol → id）
 *   3. Yahoo：前 50 只 × news.upsert(conf=20)，每只后 sleep 100ms
 *   4. Kabutan：全部 200 只 × news.upsert（**upsert 先于进度更新**），每只后 sleep 800ms
 *   5. TDnet→News：disclosure.findMany(30日 · symbol IN · take 500) × news.upsert(conf=95)
 *   6. syncJob.update → 终态
 *   7. syncLog.create
 */
export async function runNewsSync(
  deps: IngestDeps,
  fetchers: NewsFetchers,
  profile: NewsProfile,
  jobId: string,
  symbols: string[],
  startMs: number,
): Promise<NewsSyncResult> {
  const { prisma, logger, clock } = deps;

  const logLines: string[] = [];
  let totalUpserted = 0;
  let errors = 0;
  let yahooCount = 0;
  let kabutanCount = 0;
  let kabutanErrors = 0;
  let tdnetCount = 0;

  try {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: clock.date() },
    });

    const stockRows = await prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { id: true, symbol: true },
    });
    const idMap = new Map(stockRows.map((s) => [s.symbol, s.id]));

    // ── Source 1: Yahoo Finance (market news, confidence=20) ──────────────────
    const yahooSeen = new Set<string>();

    for (const symbol of symbols.slice(0, YAHOO_SLICE)) {
      try {
        const items = await fetchers.fetchNews(symbol);
        for (const item of items) {
          if (!item.url || !item.title || yahooSeen.has(newsDedupeKey(item))) continue;
          yahooSeen.add(newsDedupeKey(item));
          await prisma.news.upsert(buildYahooNewsUpsert(item) as never).catch(() => null);
          yahooCount++;
          totalUpserted++;
        }
      } catch {
        // Yahoo failures are non-fatal（原实现如此）
      }
      await new Promise((r) => setTimeout(r, YAHOO_DELAY_MS));
    }
    logLines.push(`Yahoo Finance: ${yahooCount}条 (市場通用, confidence=20)`);

    // ── Source 2: Kabutan (stock-specific news) — tracks progress ─────────────
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const stockId = idMap.get(symbol);

      if (stockId) {
        try {
          const items = await fetchers.fetchKabutanNews(symbol);
          for (const item of items) {
            if (!item.url || !item.title) continue;
            await prisma.news.upsert(buildKabutanNewsUpsert(item, stockId) as never).catch(() => null);
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

    // ── Source 3: TDnet disclosures → News (confidence=95) ────────────────────
    // 🔒 `symbol: { in: symbols }` + `take: 500` = Baseline P12-DATA-02 的目标，禁止改动。
    try {
      const recentDisclosures = await prisma.disclosure.findMany({
        where: {
          publishedAt: { gte: new Date(clock.now() - TDNET_PROMOTE_LOOKBACK_DAYS * 86400000) },
          symbol: { in: symbols },
        },
        orderBy: { publishedAt: "desc" },
        take: TDNET_PROMOTE_TAKE,
      });

      for (const d of recentDisclosures) {
        const stockId = d.symbol ? idMap.get(d.symbol) ?? null : null;
        await prisma.news.upsert(buildTdnetPromotionUpsert(d, stockId) as never).catch(() => null);
        tdnetCount++;
        totalUpserted++;
      }
      logLines.push(`TDnet適時開示: ${tdnetCount}条 (confidence=95)`);
    } catch (e) {
      errors++;
      logLines.push(`✗ TDnet→News: ${(e as Error).message.slice(0, 80)}`);
    }

    // ── Finalize ──────────────────────────────────────────────────────────────
    const jobStatus: "SUCCESS" | "FAILED" =
      kabutanErrors === 0 && errors === 0 ? "SUCCESS" : kabutanCount > 0 ? "SUCCESS" : "FAILED";

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: jobStatus,
        processed: symbols.length,
        successCount: kabutanCount,
        failedCount: kabutanErrors,
        finishedAt: clock.date(),
        errorMessage: kabutanErrors > 0 ? `${kabutanErrors} 只股票失败` : null,
      },
    });

    // ⚠️ 漂移保留：scripts 写真实耗时；api 恒为 null（见 types.ts NEWS_PROFILE_API）
    const durationMs = profile.recordDurationMs ? clock.now() - startMs : null;
    const syncLog = buildNewsSyncLog(errors, totalUpserted, logLines, durationMs, LOG_LINES_LIMIT);
    await prisma.syncLog.create({ data: syncLog as never });

    if (profile.logDone) {
      const elapsedMin = ((clock.now() - startMs) / 60000).toFixed(1);
      logger.log(
        `${profile.logPrefix} DONE jobId=${jobId} status=${jobStatus} ` +
          `total=${totalUpserted} elapsed=${elapsedMin}min`,
      );
    }

    return {
      jobStatus,
      syncLogStatus: syncLog.status as NewsSyncResult["syncLogStatus"],
      totalUpserted, yahooCount, kabutanCount, kabutanErrors, tdnetCount, errors,
      logLines, durationMs, fatalError: null,
    };
  } catch (e) {
    const msg = (e as Error).message;
    logger.error(`${profile.logPrefix} ${profile.fatalLabel}`, msg);
    await prisma.syncJob
      .update({
        where: { id: jobId },
        data: { status: "FAILED", finishedAt: clock.date(), errorMessage: msg.slice(0, 500) },
      })
      .catch(() => {});

    // Core 不 exit —— 由入口读取 fatalError 后自行决定（scripts: exit(1)；api: 仅记录）
    return {
      jobStatus: "FAILED",
      syncLogStatus: "ERROR",
      totalUpserted, yahooCount, kabutanCount, kabutanErrors, tdnetCount, errors,
      logLines, durationMs: null, fatalError: msg,
    };
  }
}
