// scoring-engine.ts — 评分引擎 Feature Flag（P3-T1）
//
// SCORING_ENGINE=v2（默认）| v3
// 默认永远 v2。V3 当前为 Shadow-only，不参与正式 AI 推荐/DailyRecommendation/Portfolio。
// 只有在 V3 Shadow 连续验证 + 回测优于/风险收益更优 + Health CRITICAL=0 后，
// 人工设置 SCORING_ENGINE=v3 才切换；改回 v2 即一键回滚。
//
// 注意：本阶段（P3-T1）生产链路（compute-scores / rerank-top500）不读取此标志，
// 故 v2/v3 切换目前仅作为「就绪开关」存在，真正接管生产需后续显式改造并经 /review payment。

export type ScoringEngine = "v2" | "v3";

export function getScoringEngine(): ScoringEngine {
  return process.env.SCORING_ENGINE === "v3" ? "v3" : "v2";
}

export function isV3Active(): boolean {
  return getScoringEngine() === "v3";
}

// V3_CALIBRATION（默认 ON）：是否对 V3 Shadow 应用动态标定（阈值/Confidence/Quality）。
// 关闭（V3_CALIBRATION=off）则回退到 V3 固定阈值评级。仅影响 Shadow，不影响生产。
export function isV3CalibrationOn(): boolean {
  const v = (process.env.V3_CALIBRATION ?? "on").toLowerCase();
  return !(v === "off" || v === "0" || v === "false");
}
