/**
 * lib/ingest/normalize.ts — 摄入层纯函数（P12-INFRA-02 · Zero Wiring）
 * ════════════════════════════════════════════════════════════════════════════
 * 全部为**纯函数**：无 IO / DB / 网络 / 随机 / 时钟（时间一律由参数传入）。
 * 这里集中了「数据形状」——即 upsert 的 where/create/update 载荷、去重键、
 * category 映射、catalystScore 公式 —— 因此也是等价性测试的主要断言面。
 *
 * 每个函数的载荷都逐字取自**重构前的原实现**：
 *   · scripts/sync-news.ts / app/api/sync/news/route.ts
 *   · scripts/fetch-tdnet.ts / app/api/sync/tdnet/route.ts
 * Profile 中带 ⚠️ 的字段用于**如实保留**两侧的既有差异（见 types.ts），
 * **不得在本任务中对齐或修复** —— 归属 P12-INFRA-06。
 */

import { classifySentiment, classifyCategory, calcImportance } from "../news-utils";
import { calcTradeEffectiveDate } from "../safety-rules";
import { CONFIDENCE_DISCLOSURE, CONFIDENCE_MARKET } from "./config";
import type { KabutanNewsItem, TDnetDisclosureItem, TDnetProfile, YahooNewsItem } from "./types";

// ── 去重键 ──────────────────────────────────────────────────────────────────
// 三条 News 来源与 Disclosure 的唯一键。与原实现完全一致。

/** Yahoo / Kabutan 新闻：以原始 url 为唯一键。 */
export const newsDedupeKey = (item: { url: string }): string => item.url;

/** TDnet 披露提升为 News 时：加 `tdnet:` 前缀，避免与 Disclosure.url 冲突。 */
export const tdnetNewsDedupeKey = (d: { url: string }): string => `tdnet:${d.url}`;

/** Disclosure 表：以原始 url 为唯一键。 */
export const disclosureDedupeKey = (d: { url: string }): string => d.url;

// ── category 映射 ───────────────────────────────────────────────────────────

/**
 * TDnet DisclosureCategory → News.category。
 * ⚠️ 注意两套 category 词表并不通用（P12-DATA-01 实测）：
 *    TDnet: EARNINGS/FORECAST_REVISION/BUYBACK/DIVIDEND/EQUITY/MATERIAL/OTHER
 *    News : IR/MARKET/OTHER/EARNINGS/DIVIDEND/GUIDANCE/BUYBACK
 * 本映射逐字取自原实现（两侧各有一份，内容相同）。
 */
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

// ── News upsert 载荷 ────────────────────────────────────────────────────────

export type UpsertPayload = { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> };

/**
 * Source 1 · Yahoo（市场通用新闻，confidence=20）。
 * 原实现：stockId 恒为 null；category/importance/sentiment 由标题即时分类。
 */
export function buildYahooNewsUpsert(item: YahooNewsItem): UpsertPayload {
  const category = classifyCategory(item.title);
  const importance = calcImportance(item.title, category);
  const sentiment = classifySentiment(item.title);
  const tradeEffectiveDate = calcTradeEffectiveDate(item.publishedAt);
  return {
    where: { url: newsDedupeKey(item) },
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
      tradeEffectiveDate,
    },
    update: { sentiment, category, importance, tradeEffectiveDate },
  };
}

/**
 * Source 2 · Kabutan（个股新闻）。
 * 原实现：sentiment/category/importance/relatedSymbolConfidence **取 item 自带值**
 * （由 lib/kabutan.ts 产出），不在此重新分类；update 额外写回 stockId。
 */
export function buildKabutanNewsUpsert(item: KabutanNewsItem, stockId: number): UpsertPayload {
  const tradeEffectiveDate = calcTradeEffectiveDate(item.publishedAt);
  return {
    where: { url: newsDedupeKey(item) },
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
      tradeEffectiveDate,
    },
    update: {
      sentiment: item.sentiment,
      category: item.category,
      importance: item.importance,
      relatedSymbolConfidence: item.relatedSymbolConfidence,
      stockId,
      tradeEffectiveDate,
    },
  };
}

/**
 * Source 3 · Disclosure → News 提升（confidence=95）。
 * ⚠️ 原实现在此处**重新按标题跑一次 classifySentiment**，丢弃 Disclosure.sentiment
 *    （P11-DATA-03 记录的「二次覆盖」）。本任务**如实保留**，修复归属 Baseline P12 系列。
 * 注意 update.stockId 用 `?? undefined` —— null 时不覆盖既有值，与原实现一致。
 */
export function buildTdnetPromotionUpsert(
  d: { symbol: string | null; title: string; category: string; url: string; importance: number; publishedAt: Date },
  stockId: number | null,
): UpsertPayload {
  const category = tdnetCategoryToNews(d.category);
  const sentiment = classifySentiment(d.title);
  const tradeEffectiveDate = calcTradeEffectiveDate(d.publishedAt);
  return {
    where: { url: tdnetNewsDedupeKey(d) },
    create: {
      stockId: stockId ?? null,
      title: d.title,
      source: "TDnet",
      url: tdnetNewsDedupeKey(d),
      publishedAt: d.publishedAt,
      sentiment,
      category,
      importance: d.importance,
      relatedSymbolConfidence: CONFIDENCE_DISCLOSURE,
      tradeEffectiveDate,
    },
    update: {
      sentiment,
      category,
      importance: d.importance,
      stockId: stockId ?? undefined,
      tradeEffectiveDate,
    },
  };
}

// ── Disclosure upsert 载荷（漂移全部由 profile 承载）──────────────────────────

/**
 * TDnet → Disclosure 表。
 *
 * 🔴 两处已确认漂移由 profile 控制，**如实保留，禁止在本任务对齐**：
 *   · `rawDataIncludesCode4`：scripts 写 `{companyName, code4}`；api 只写 `{companyName}`
 *     → 走 API 写入的行**永久丢失 code4**。
 *   · `updateIncludesTitle`：scripts 的 update 含 `title`；api 不含
 *     → 走 API 的路径**不会更新标题**，TDnet 事后订正标题不生效。
 */
export function buildDisclosureUpsert(
  disc: TDnetDisclosureItem,
  stockId: number | null,
  profile: Pick<TDnetProfile, "rawDataIncludesCode4" | "updateIncludesTitle">,
): UpsertPayload {
  const rawData: Record<string, unknown> = profile.rawDataIncludesCode4
    ? { companyName: disc.companyName, code4: disc.code4 }
    : { companyName: disc.companyName };

  const update: Record<string, unknown> = profile.updateIncludesTitle
    ? { title: disc.title, category: disc.category, sentiment: disc.sentiment, importance: disc.importance }
    : { category: disc.category, sentiment: disc.sentiment, importance: disc.importance };

  return {
    where: { url: disclosureDedupeKey(disc) },
    create: {
      symbol: disc.symbol,
      stockId,
      title: disc.title,
      publishedAt: disc.publishedAt,
      category: disc.category,
      sentiment: disc.sentiment,
      url: disc.url,
      importance: disc.importance,
      rawData,
    },
    update,
  };
}

// ── 交易日 / 日期字符串 ─────────────────────────────────────────────────────

/**
 * 取最近 N 个交易日（跳过周六日）。逐字取自原实现（两侧算法相同，只是天数不同）。
 * `from` 由 clock 注入 → 输出确定性可复现。
 */
export function lastTradingDays(from: Date, days: number): Date[] {
  const out: Date[] = [];
  const d = new Date(from);
  while (out.length < days) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

/**
 * ⚠️ 漂移：scripts 用本地时区拼接；api 用 `toISOString()`（UTC）。
 * 两者在 JST 上午会给出**不同的日期字符串**（仅影响日志文案，不影响写库）。
 */
export function formatDateStr(day: Date, mode: "local" | "utc"): string {
  if (mode === "utc") return day.toISOString().split("T")[0];
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

// ── catalystScore（仅 scripts 路径会写；api 完全跳过 —— 见 types.ts ⚠️）────────

export type CatalystInfo = { count: number; maxImp: number; hasEarnings: boolean };

/** 逐字取自 scripts/fetch-tdnet.ts:125-130 的公式。 */
export function calcCatalystScore(info: CatalystInfo): number {
  let score = 5;
  score += Math.min(3, info.count);
  if (info.hasEarnings) score += 2;
  score += Math.round((info.maxImp - 5) / 2);
  return Math.max(1, Math.min(10, score));
}

/** 按 symbol 聚合近 30 日披露，供 calcCatalystScore 使用。逐字取自原实现。 */
export function aggregateCatalyst(
  rows: { symbol: string; category: string; importance: number }[],
): Map<string, CatalystInfo> {
  const bySymbol = new Map<string, CatalystInfo>();
  for (const d of rows) {
    const cur = bySymbol.get(d.symbol) ?? { count: 0, maxImp: 0, hasEarnings: false };
    cur.count++;
    cur.maxImp = Math.max(cur.maxImp, d.importance);
    if (d.category === "EARNINGS" || d.category === "FORECAST_REVISION") cur.hasEarnings = true;
    bySymbol.set(d.symbol, cur);
  }
  return bySymbol;
}

// ── SyncLog 载荷（两侧公式不同 → 由 variant 承载）────────────────────────────

/** News：两侧 status 公式相同；durationMs 由 profile.recordDurationMs 决定。 */
export function buildNewsSyncLog(
  errors: number,
  totalUpserted: number,
  logLines: string[],
  durationMs: number | null,
  logLinesLimit: number,
): Record<string, unknown> {
  return {
    source: "news",
    status: errors === 0 ? "SUCCESS" : totalUpserted > 0 ? "PARTIAL" : "ERROR",
    message: logLines.slice(0, logLinesLimit).join("\n"),
    itemCount: totalUpserted,
    durationMs,
  };
}

/**
 * TDnet：⚠️ 两侧 status 公式 / message 格式 / durationMs 均不同 —— 如实保留。
 *   scripts: status = upserted>0 ? SUCCESS : fetched>0 ? PARTIAL : ERROR
 *            message = `Fetched X件 Upserted Y件 (N天)`；**不写 durationMs**
 *   api    : status = errors>0 && synced===0 ? ERROR : errors>0 ? PARTIAL : SUCCESS
 *            message = log.join(" | ").slice(0,500)；写 durationMs
 */
export function buildTdnetSyncLog(
  variant: "scripts" | "api",
  args: { totalFetched: number; totalUpserted: number; errors: number; days: number; logLines: string[]; durationMs: number },
): Record<string, unknown> {
  if (variant === "scripts") {
    return {
      source: "tdnet",
      status: args.totalUpserted > 0 ? "SUCCESS" : args.totalFetched > 0 ? "PARTIAL" : "ERROR",
      message: `Fetched ${args.totalFetched}件 Upserted ${args.totalUpserted}件 (${args.days}天)`,
      itemCount: args.totalUpserted,
    };
  }
  return {
    source: "tdnet",
    status: args.errors > 0 && args.totalUpserted === 0 ? "ERROR" : args.errors > 0 ? "PARTIAL" : "SUCCESS",
    message: args.logLines.join(" | ").slice(0, 500),
    itemCount: args.totalUpserted,
    durationMs: args.durationMs,
  };
}
