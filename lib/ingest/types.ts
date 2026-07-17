/**
 * lib/ingest/types.ts — Ingestion Core 类型与 Profile（P12-INFRA-02）
 * ════════════════════════════════════════════════════════════════════════════
 * 🚧 **本 Core 尚未接线（Zero Wiring）**
 *    app/api/sync/{news,tdnet}、scripts/{sync-news,fetch-tdnet}、cron、Admin Sync UI
 *    全部**仍在使用各自的原实现**，一行未改。本目录只是「提取出来、离线测过、
 *    等待 INFRA-03/04 切换」的候选实现。
 *
 * 设计约束（P12-INFRA-02 规定）：
 *   · Core 不依赖 Next.js Request/Response
 *   · Core 不调用 process.exit —— 一律返回结构化结果，由入口决定退出码
 *   · Core 不读 process.argv
 *   · 外部依赖全部注入：fetcher / prisma / logger / clock
 *   · 同一输入 → 确定性输出（时间经 clock 注入，故可复现）
 *
 * ⚠️ 相对导入：`lib/ingest/` 内不得使用 `@/` 别名 —— scripts 经 tsx 运行不支持路径别名
 *    （见 CLAUDE.md「scripts/ Path Rule」）。
 */

import type { PrismaClient } from "@prisma/client";

// ── 注入依赖 ────────────────────────────────────────────────────────────────

/** 时钟注入 —— 让 Core 输出可复现（旧实现直接调 Date.now()/new Date()）。 */
export type Clock = { now(): number; date(): Date };
export const SYSTEM_CLOCK: Clock = { now: () => Date.now(), date: () => new Date() };

/** 日志注入 —— Core 不直接 console，便于测试捕获与入口定制前缀。 */
export type Logger = {
  log(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
};
export const CONSOLE_LOGGER: Logger = {
  log: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m, e) => (e === undefined ? console.error(m) : console.error(m, e)),
};

/**
 * 数据库注入。
 * scripts 侧：自建 `new PrismaClient({ adapter: new PrismaPg(...) })`（子进程运行，
 *   `pm2 restart tohoshou-web` 不会杀掉同步任务）；
 * api 侧：`lib/prisma` 单例（Next 请求生命周期）。
 * 两者语义不可互换 → 只能注入。
 */
export type Db = PrismaClient;

export type IngestDeps = {
  prisma: Db;
  logger: Logger;
  clock: Clock;
};

// ── 抓取器注入 ──────────────────────────────────────────────────────────────

export type YahooNewsItem = {
  url: string; title: string; source: string; publishedAt: Date;
};
export type KabutanNewsItem = {
  url: string; title: string; source: string; publishedAt: Date;
  sentiment: string; category: string; importance: number; relatedSymbolConfidence: number;
};
export type TDnetDisclosureItem = {
  symbol: string; code4: string; companyName: string; title: string;
  publishedAt: Date; category: string; sentiment: string; url: string; importance: number;
};

export type NewsFetchers = {
  fetchNews(symbol: string): Promise<YahooNewsItem[]>;
  fetchKabutanNews(symbol: string): Promise<KabutanNewsItem[]>;
};
export type TDnetFetchers = {
  fetchTDnetForDate(day: Date): Promise<TDnetDisclosureItem[]>;
};

// ── Profile：承载 API 与 scripts 的**既有**行为差异 ─────────────────────────
//
// 🔴 Profile 存在的意义是「如实保留两种旧行为」，**不是认可它们**。
//    每个带 ⚠️ 的字段都是一处已确认的漂移，修复归属 P12-INFRA-06（先裁决、后统一）。
//    在此之前，任何一侧都不得被"顺手对齐"，否则就不再是零行为重构。

/**
 * News 侧差异（scripts vs api）。实测来源：重构前两份实现逐行比对。
 *
 * | 字段              | scripts/sync-news.ts | app/api/sync/news/route.ts |
 * |-------------------|----------------------|----------------------------|
 * | logPrefix         | "[sync-news]"        | "[news]"                   |
 * | fatalLabel        | "fatal error:"       | "background sync fatal error:" |
 * | recordDurationMs  | true（真实耗时）      | ⚠️ false → SyncLog.durationMs = null |
 * | logStarted        | true                 | false                      |
 * | logDone           | true                 | false                      |
 */
export type NewsProfile = {
  logPrefix: string;
  fatalLabel: string;
  /** ⚠️ 漂移：api 侧 SyncLog.durationMs 恒为 null。归属 INFRA-06。 */
  recordDurationMs: boolean;
  logStarted: boolean;
  logDone: boolean;
};

export const NEWS_PROFILE_SCRIPTS: NewsProfile = {
  logPrefix: "[sync-news]",
  fatalLabel: "fatal error:",
  recordDurationMs: true,
  logStarted: true,
  logDone: true,
};

export const NEWS_PROFILE_API: NewsProfile = {
  logPrefix: "[news]",
  fatalLabel: "background sync fatal error:",
  recordDurationMs: false, // ⚠️ 既有缺陷，如实保留
  logStarted: false,
  logDone: false,
};

/**
 * TDnet 侧差异 —— 两套**不是复制品，是两个不同的程序**。
 *
 * | 字段                  | scripts/fetch-tdnet.ts        | app/api/sync/tdnet/route.ts |
 * |-----------------------|-------------------------------|------------------------------|
 * | days                  | 5（--days 可配）               | ⚠️ 3（硬编码）               |
 * | supportsDryRun        | true（DRY_RUN=1）              | false                        |
 * | rawDataIncludesCode4  | true                          | ⚠️ **false → code4 永久丢失** |
 * | updateIncludesTitle   | true                          | ⚠️ **false → 标题订正不生效** |
 * | updateCatalystScore   | true（写 StockScore）          | ⚠️ **false → 完全跳过**       |
 * | perBatchStockLookup   | true（每批再查一次 stock）      | false（仅全局 map）           |
 * | dateStringMode        | "local"                       | ⚠️ "utc"（toISOString）       |
 * | syncLogVariant        | "scripts"                     | "api"                        |
 */
export type TDnetProfile = {
  days: number;
  supportsDryRun: boolean;
  /** ⚠️ 漂移：api 侧 rawData 不含 code4 → 走 API 写入的 Disclosure 永久丢失 code4。 */
  rawDataIncludesCode4: boolean;
  /** ⚠️ 漂移：api 侧 update 不含 title → TDnet 订正标题不会生效。 */
  updateIncludesTitle: boolean;
  /**
   * ⚠️ 漂移（P12-INFRA-02 新发现，不在 INFRA-01 清单内）：
   * scripts 会 `stockScore.updateMany({ data:{ catalystScore } })`，api **完全跳过**。
   * → Admin 点「同步」TDnet 不更新 catalystScore，cron 才更新，是**评分输入的静默分裂**。
   */
  updateCatalystScore: boolean;
  perBatchStockLookup: boolean;
  dateStringMode: "local" | "utc";
  syncLogVariant: "scripts" | "api";
};

export const TDNET_PROFILE_SCRIPTS: TDnetProfile = {
  days: 5,
  supportsDryRun: true,
  rawDataIncludesCode4: true,
  updateIncludesTitle: true,
  updateCatalystScore: true,
  perBatchStockLookup: true,
  dateStringMode: "local",
  syncLogVariant: "scripts",
};

export const TDNET_PROFILE_API: TDnetProfile = {
  days: 3,
  supportsDryRun: false,
  rawDataIncludesCode4: false, // ⚠️ 既有漂移，如实保留
  updateIncludesTitle: false,  // ⚠️ 既有漂移，如实保留
  updateCatalystScore: false,  // ⚠️ 既有漂移，如实保留
  perBatchStockLookup: false,
  dateStringMode: "utc",
  syncLogVariant: "api",
};

// ── 结构化结果（Core 不 exit、不返回 HTTP Response）─────────────────────────

export type SyncStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "ERROR";

export type NewsSyncResult = {
  jobStatus: "SUCCESS" | "FAILED";
  syncLogStatus: SyncStatus;
  totalUpserted: number;
  yahooCount: number;
  kabutanCount: number;
  kabutanErrors: number;
  tdnetCount: number;
  errors: number;
  logLines: string[];
  durationMs: number | null;
  /** 非 null 表示发生致命错误；入口据此决定是否 exit(1)（Core 自己不 exit）。 */
  fatalError: string | null;
};

export type TDnetSyncResult = {
  status: SyncStatus;
  totalFetched: number;
  totalUpserted: number;
  catStats: Record<string, number>;
  catalystUpdated: number;
  errors: number;
  logLines: string[];
  durationMs: number;
  dryRun: boolean;
};

export type SyncJobRow = {
  id: string;
  status: string;
  total: number;
  processed: number;
  createdAt: Date;
};
