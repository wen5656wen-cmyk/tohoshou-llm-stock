/**
 * lib/ingest/tdnet-core.ts — TDnet 摄入编排（P12-INFRA-02 · **Zero Wiring**）
 * ════════════════════════════════════════════════════════════════════════════
 * 🚧 **尚未接线**：scripts/fetch-tdnet.ts 与 app/api/sync/tdnet/route.ts 仍各自使用原实现。
 *
 * 🔴 重要背景：TDnet 两套**不是复制品，是两个不同的程序**（见 types.ts TDnetProfile 表）。
 *    本 Core 用 profile **如实保留两种旧行为**，这是**保存现状，不是认可现状**：
 *      · api 丢失 code4
 *      · api 不更新 title
 *      · api 完全跳过 catalystScore（评分输入的静默分裂）
 *      · 天数 5 vs 3 / SyncLog 公式各异 / 日期字符串本地 vs UTC
 *    这些差异**必须**在 P12-INFRA-06 先做行为裁决，再统一。
 *    在此之前任何一侧都不得被"顺手对齐" —— 否则就不再是零行为重构。
 *
 * 契约同 news-core：无 Next.js / 无 process.exit / 无 CLI / 全注入 / 确定性输出。
 */

import { CATALYST_LOOKBACK_DAYS } from "./config";
import {
  aggregateCatalyst, buildDisclosureUpsert, buildTdnetSyncLog, calcCatalystScore,
  formatDateStr, lastTradingDays,
} from "./normalize";
import type { IngestDeps, TDnetFetchers, TDnetProfile, TDnetSyncResult } from "./types";

export type TDnetSyncOptions = {
  /** 覆盖 profile.days（scripts 的 `--days` 由入口解析后传入 —— Core 不读 argv）。 */
  days?: number;
  /** 仅当 profile.supportsDryRun 为真时生效（scripts 的 DRY_RUN=1 由入口读取后传入）。 */
  dryRun?: boolean;
};

export async function runTDnetSync(
  deps: IngestDeps,
  fetchers: TDnetFetchers,
  profile: TDnetProfile,
  opts: TDnetSyncOptions = {},
): Promise<TDnetSyncResult> {
  const { prisma, logger, clock } = deps;
  const startMs = clock.now();
  const days = opts.days ?? profile.days;
  const dryRun = profile.supportsDryRun ? opts.dryRun === true : false;

  const logLines: string[] = [];
  const catStats: Record<string, number> = {};
  let totalFetched = 0;
  let totalUpserted = 0;
  let errors = 0;
  let catalystUpdated = 0;

  // 全局 symbol → id 映射（scripts 原实现预加载；api 原实现也只用全局 map）
  const stocks = await prisma.stock.findMany({ select: { id: true, symbol: true } });
  const symbolToId = new Map(stocks.map((s) => [s.symbol, s.id]));

  for (const day of lastTradingDays(clock.date(), days)) {
    const dateStr = formatDateStr(day, profile.dateStringMode);
    try {
      const disclosures = await fetchers.fetchTDnetForDate(day);
      totalFetched += disclosures.length;
      logLines.push(
        profile.syncLogVariant === "scripts"
          ? `${dateStr} ... ${disclosures.length} 件`
          : `${dateStr}: ${disclosures.length} disclosures`,
      );

      for (const d of disclosures) catStats[d.category] = (catStats[d.category] ?? 0) + 1;

      if (dryRun || disclosures.length === 0) continue;

      // ⚠️ 漂移：scripts 会按当批 symbol 再查一次 stock 表；api 只用全局 map。
      let localMap: Map<string, number> | null = null;
      if (profile.perBatchStockLookup) {
        const symbolSet = new Set(disclosures.map((x) => x.symbol));
        const stockRows = await prisma.stock.findMany({
          where: { symbol: { in: [...symbolSet] } },
          select: { id: true, symbol: true },
        });
        localMap = new Map(stockRows.map((s) => [s.symbol, s.id]));
      }

      for (const disc of disclosures) {
        const stockId = profile.perBatchStockLookup
          ? localMap?.get(disc.symbol) ?? symbolToId.get(disc.symbol) ?? null
          : symbolToId.get(disc.symbol) ?? null;
        try {
          await prisma.disclosure.upsert(buildDisclosureUpsert(disc, stockId, profile) as never);
          totalUpserted++;
        } catch {
          // skip duplicate url（原实现两侧均静默吞掉）
        }
      }
    } catch (e) {
      errors++;
      logLines.push(
        profile.syncLogVariant === "scripts"
          ? `ERROR: ${(e as Error).message}`
          : `${dateStr}: ERROR ${(e as Error).message}`,
      );
    }
  }

  // ── catalystScore ────────────────────────────────────────────────────────
  // ⚠️ 漂移：**仅 scripts 路径会执行**；api 原实现完全跳过（评分输入静默分裂）。
  if (profile.updateCatalystScore && !dryRun && totalUpserted > 0) {
    const cutoff = new Date(clock.now() - CATALYST_LOOKBACK_DAYS * 86400_000);
    const recentDiscs = await prisma.disclosure.findMany({
      where: { publishedAt: { gte: cutoff } },
      select: { symbol: true, category: true, importance: true },
    });
    for (const [symbol, info] of aggregateCatalyst(recentDiscs)) {
      await prisma.stockScore.updateMany({
        where: { symbol },
        data: { catalystScore: calcCatalystScore(info) },
      });
      catalystUpdated++;
    }
    logger.log(`  catalystScore updated: ${catalystUpdated} 只`);
  }

  const durationMs = clock.now() - startMs;

  if (!dryRun) {
    const syncLog = buildTdnetSyncLog(profile.syncLogVariant, {
      totalFetched, totalUpserted, errors, days, logLines, durationMs,
    });
    await prisma.syncLog.create({ data: syncLog as never });
  }

  const status: TDnetSyncResult["status"] =
    profile.syncLogVariant === "scripts"
      ? totalUpserted > 0 ? "SUCCESS" : totalFetched > 0 ? "PARTIAL" : "ERROR"
      : errors > 0 && totalUpserted === 0 ? "ERROR" : errors > 0 ? "PARTIAL" : "SUCCESS";

  return { status, totalFetched, totalUpserted, catStats, catalystUpdated, errors, logLines, durationMs, dryRun };
}
