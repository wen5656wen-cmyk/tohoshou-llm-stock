// ── TOHOSHOU AI · Feature Promotion Engine 统一入口（P6-T8）─────────────────
// import { buildFeaturePromotions, evaluatePromotion } from "@/lib/features/promotion";
//
// Feature Promotion Engine V1：对 SHADOW 因子统一量化评估，给出
// Promote / Keep Shadow / Disable 建议 + 1-5 星 rating。
// 流程：Registry → Shadow → Backtest → Learning → **Promotion** → Production。
// **只读派生 · 不落库 · 不自动改任何状态 · 不影响任何正式评分。** 本阶段仅给「建议」。

export * from "./types";
export * from "./engine";
export * from "./factor-map";
export * from "./registry";
