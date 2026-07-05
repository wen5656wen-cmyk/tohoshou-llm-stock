// ── TOHOSHOU AI · Feature Validation Engine 统一入口（P6-T5）────────────────
// import { getFeatureValidations, getValidationSummary, evaluateFeature } from "@/lib/features/validation";
//
// Feature Validation Engine V1：统一验证入口。**只读派生、不落库、不影响任何正式评分。**
// 任何新增 Feature 必须经 Registry → Shadow → Validation → Learning → Runtime Audit → Production，
// 未经 Validation 禁止进入正式评分。本阶段仅建框架，不实际淘汰/提升任何 Feature。

export * from "./types";
export * from "./statistics";
export * from "./engine";
export * from "./registry";
