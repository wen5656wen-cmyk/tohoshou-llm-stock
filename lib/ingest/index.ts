/**
 * lib/ingest/index.ts — Ingestion Core 公共出口（P12-INFRA-02）
 * ────────────────────────────────────────────────────────────────────────────
 * 覆盖范围：**仅 News**。
 *
 * TDnet 未纳入 —— scripts/fetch-tdnet.ts 与 app/api/sync/tdnet/route.ts 并非复制品，
 * 而是两个行为不同的程序（天数 5 vs 3、rawData 是否含 code4、update 是否含 title、
 * SyncLog status/message/durationMs 公式各异，且 **catalystScore 仅 scripts 会写**）。
 * 在「零行为变更」约束下统一它们会退化成一堆 if/else 开关，并把 API 侧的缺陷固化进 Core。
 * 正确顺序是先做行为裁决，再统一 —— 见 P12-INFRA-06（待立项）。
 */

export * from "./types";
export * from "./config";
export * from "./news";
