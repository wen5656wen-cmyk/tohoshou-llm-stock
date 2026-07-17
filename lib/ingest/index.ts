/**
 * lib/ingest/index.ts — Ingestion Core 出口（P12-INFRA-02）
 * ════════════════════════════════════════════════════════════════════════════
 * 🚧 **ZERO WIRING — 本 Core 尚未被任何生产入口调用。**
 *
 *    仍在使用各自原实现、一行未改的入口：
 *      · app/api/sync/news/route.ts
 *      · app/api/sync/tdnet/route.ts
 *      · app/api/sync/route.ts
 *      · scripts/sync-news.ts        ← cron 07/12/18/22 JST（生产关键链）
 *      · scripts/fetch-tdnet.ts      ← cron 07:00 JST 週1-5
 *      · scripts/cron-scheduler.ts
 *      · components/system/SyncView.tsx（Admin 手动同步）
 *
 *    切换计划（不得提前）：
 *      · P12-INFRA-03 —— 先切 API（非生产关键链，出错影响面最小）
 *      · P12-INFRA-04 —— 后切 scripts（cron 命脉，必须最后，且需先实跑验证）
 *      · P12-INFRA-05 —— 删除原重复代码 + 处置孤儿 /api/sync/route.ts
 *      · P12-INFRA-06 —— TDnet 行为裁决（code4 / title / catalystScore）后再统一
 */

export * from "./types";
export * from "./config";
export * from "./normalize";
export * from "./news-core";
export * from "./tdnet-core";
