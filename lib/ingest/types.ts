/**
 * lib/ingest/types.ts — Ingestion Core 共享类型（P12-INFRA-02）
 * ────────────────────────────────────────────────────────────────────────────
 * 纯重构（Refactor）：消除 scripts 与 app/api 之间的编排层复制，**零行为变更**。
 *
 * 为什么必须依赖注入 prisma：
 *   · scripts/ 以子进程运行，自建 `new PrismaClient({ adapter: new PrismaPg(...) })`
 *     —— cron-scheduler 用 execSync 调它，`pm2 restart tohoshou-web` 不会杀掉同步任务；
 *   · app/api/ 走 Next 请求生命周期，必须用 `lib/prisma` 单例。
 *   两者不可互换，硬编码任一方都会破坏另一方 → 只能注入。
 *
 * ⚠️ `lib/ingest/` 内部**只能用相对导入**（`../yahoo`），不得用 `@/` 别名 ——
 *    scripts/ 经 tsx 运行时不支持路径别名（见 CLAUDE.md「scripts/ Path Rule」）。
 */

import type { PrismaClient } from "@prisma/client";

/** 两个入口注入的运行期依赖。 */
export type IngestDeps = {
  /** scripts：自建 PrismaPg adapter 实例；api：lib/prisma 单例。 */
  prisma: PrismaClient;
};

/**
 * News 同步的入口差异（**全部为既有行为，本次重构原样保留，不做"顺手修复"**）：
 *
 * | 项            | scripts/sync-news.ts        | app/api/sync/news/route.ts |
 * |---------------|-----------------------------|----------------------------|
 * | logPrefix     | "[sync-news]"               | "[news]"                   |
 * | fatalLabel    | "fatal error:"              | "background sync fatal error:" |
 * | startMs       | main() 起点（含 stale guard）| null → SyncLog.durationMs = null |
 * | logDone       | true（打印 DONE 行）         | false                      |
 *
 * 其中 `durationMs: null` 是 API 侧的既有缺陷（scripts 写真实耗时）。
 * 修它属于**行为变更**，不在 P12-INFRA-02 范围 —— 已记入遗留项。
 * fatalLabel 文案两侧本就不同，为保证 stdout 逐字一致而参数化。
 */
export type NewsSyncOptions = {
  /** console 前缀。scripts="[sync-news]"，api="[news]"。 */
  logPrefix: string;
  /** 致命错误文案。scripts="fatal error:"，api="background sync fatal error:"。 */
  fatalLabel: string;
  /**
   * 计时起点。传 number → SyncLog.durationMs = Date.now()-startMs（scripts 行为）；
   * 传 null → SyncLog.durationMs = null（api 既有行为，原样保留）。
   */
  startMs: number | null;
  /** 是否打印 `DONE jobId=... elapsed=...min` 结束行。scripts=true，api=false。 */
  logDone: boolean;
  /** 致命错误时的收尾动作。scripts 传 () => process.exit(1)；api 不传（仅记录）。 */
  onFatal?: (message: string) => void;
};

export type SyncJobRow = {
  id: string;
  status: string;
  total: number;
  processed: number;
  createdAt: Date;
};
