// Unified label maps for all system entities.
// All pages must import from here — never hardcode English keys in UI.

export {
  getStatusLabel,
  STATUS_LABELS,
  getPipelineLabel,
  PIPELINE_STAGE_LABELS,
} from "./status-labels";

// Standardized alias — prefer getPipelineStageLabel in new code
export { getPipelineLabel as getPipelineStageLabel } from "./status-labels";

// ── Data source (freshness) labels ───────────────────────────────────────────

export const DATA_SOURCE_LABELS: Record<string, string> = {
  DailyPrice:          "每日行情",
  StockScore:          "综合评分",
  DailyRecommendation: "每日推荐",
  GlobalMarket:        "全球市场",
  News:                "新闻资讯",
  Backtest:            "历史回测",
};

export function getDataSourceLabel(key: string): string {
  return DATA_SOURCE_LABELS[key] ?? key;
}

// ── Backtest horizon labels ───────────────────────────────────────────────────

export const HORIZON_LABELS: Record<string, string> = {
  "1d":  "1天",
  "3d":  "3天",
  "5d":  "5天",
  "7d":  "7天",
  "10d": "10天",
  "20d": "20天",
  "30d": "30天",
  "60d": "60天",
  "90d": "90天",
};

export function getHorizonLabel(horizon: string): string {
  return HORIZON_LABELS[horizon] ?? horizon;
}
