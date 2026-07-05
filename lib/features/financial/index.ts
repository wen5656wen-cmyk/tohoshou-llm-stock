// ── TOHOSHOU AI · Financial Quality Feature Engine 统一入口（P6-T3）─────────
// import { extractFinancialFeatures } from "@/lib/features/financial";
//
// 全站唯一财务质量因子派生入口。**纯派生只读、SHADOW-only，不进入 Production 评分、
// 不影响 fundamental score / 股票详情页财务 / Adaptive / Recommendation / Explain / Learning，
// 不落库、不改任何现有财务计算。** 缺失字段返回 N/A，不伪造。

export * from "./types";
export * from "./parser";
export * from "./extractor";
