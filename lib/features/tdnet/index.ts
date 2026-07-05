// ── TOHOSHOU AI · TDnet Event Feature Engine 统一入口（P6-T2）───────────────
// import { classifyTdnetEvent, extractSymbolFeatures } from "@/lib/features/tdnet";
//
// 全站唯一 TDnet 事件解析/提取入口。**纯派生只读、SHADOW-only，不进入 Production 评分、
// 不影响 Adaptive/Recommendation/Explain/Learning，不落库、不改任何生产逻辑。**

export * from "./types";
export * from "./parser";
export * from "./extractor";
