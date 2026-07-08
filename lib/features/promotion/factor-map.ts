// ── TOHOSHOU AI · Feature → Alpha 数据源映射（P6-T8）────────────────────────
// 把 Feature Registry 的因子 id 映射到真实统计来源：
//  · AlphaFactorReport.factor（每因子族的有效性报告：winRate/meanExcess/ic/sharpe…）
//  · AlphaFactor 表列名（用于统计覆盖率：latest 日非空占比）
// 未映射的 SHADOW 因子（TDnet/财务/机构事件等）当前无 Backtest 报告 → pending 观察。

// 仅登记「实际计算 FactorAlphaResult 的 8 个注册因子」——与 scripts/compute-factor-alpha.ts
// 的 FEATURE_SCALARS 严格对齐，保证 Integrity Check（BROKEN_LINK / MISSING_ALPHA）为 0。
// （atr14/volumeRatio5 曾在 P6-T8 登记，但因子级回测用 atrPct/volumeRatio20，故 P6-T10 移除。）

/** Feature id → AlphaFactorReport.factor（因子族有效性报告名）。 */
export const FEATURE_TO_ALPHA_FACTOR: Record<string, string> = {
  rs5: "RelativeStrength",
  rs20: "RelativeStrength",
  rs60: "RelativeStrength",
  atrPct: "ATR",
  volumeExpansionDays: "VolumeExpansion",
  averageTurnover20: "AverageTurnover",
  volumeRatio20: "VolumeRatio",
  distance52wHigh: "Distance52WeekHigh",
};

/** Feature id → AlphaFactor 表列名（用于覆盖率统计：该列非空的股票占比）。 */
export const FEATURE_TO_ALPHA_COLUMN: Record<string, string> = {
  rs5: "rs5",
  rs20: "rs20",
  rs60: "rs60",
  atrPct: "atrPct",
  volumeExpansionDays: "volumeExpansionDays",
  averageTurnover20: "averageTurnover20",
  volumeRatio20: "volumeRatio20",
  distance52wHigh: "distanceTo52WeekHigh",
};

/** 覆盖率统计需要的 AlphaFactor 列（去重，供 API 一次性 count）。 */
export const ALPHA_COVERAGE_COLUMNS = Array.from(new Set(Object.values(FEATURE_TO_ALPHA_COLUMN)));
