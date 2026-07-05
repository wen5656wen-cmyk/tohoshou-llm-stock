// ── TOHOSHOU AI · Institution Flow Feature Engine 统一入口（P6-T4）──────────
// import { extractInstitutionFeatures } from "@/lib/features/institution";
//
// 全站唯一机构资金因子派生入口。**纯派生只读、SHADOW-only、市场级信号（非逐股），
// 不进入 Production 评分、不影响 Adaptive/Recommendation/Explain/Learning/moneyFlowScore，
// 不落库、不改任何数据。** 序列为空返回 N/A，不伪造。

export * from "./types";
export * from "./parser";
export * from "./extractor";
