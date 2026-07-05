// ── TOHOSHOU AI · Feature Registry 统一入口（P6-T1）─────────────────────────
// import { getAllFeatures, getSummary, FEATURE_CATALOG } from "@/lib/features";
//
// Registry 是「因子管理中心」：仅登记与查询 Feature 元数据，
// **不参与任何计算、不影响任何评分/推荐/权重**。

export * from "./types";
export * from "./catalog";
export * from "./registry";
export * from "./statistics";
