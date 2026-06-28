// Centralized Chinese label maps for status enums and pipeline stages.
// Import getStatusLabel / getPipelineLabel instead of hardcoding in components.

export const STATUS_LABELS: Record<string, string> = {
  // Health / data guard
  PASS:              "正常",
  FAIL:              "异常",
  // Pipeline stage outcomes
  SUCCESS:           "成功",
  FAILED:            "失败",
  NEVER_RUN:         "尚未执行",
  SKIPPED:           "已跳过",
  // Experiment / task lifecycle
  RUNNING:           "进行中",
  PLANNED:           "计划中",
  COMPLETED:         "已完成",
  ADOPTED:           "已采纳",
  ABANDONED:         "已废弃",
  // Severity
  WARNING:           "警告",
  CRITICAL:          "严重",
  INFO:              "提示",
  ERROR:             "错误",
  // Horizon readiness
  READY:             "就绪",
  PARTIAL:           "部分就绪",
  PENDING:           "等待中",
  INSUFFICIENT:      "数据不足",
  NOT_READY:         "未就绪",
  // Grade
  GREEN:             "良好",
  YELLOW:            "注意",
  RED:               "异常",
  // Data freshness
  FRESH:             "新鲜",
  STALE:             "过期",
  // Misc
  INSUFFICIENT_DATA: "数据不足",
  OK:                "正常",
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

// Pipeline stage name → Chinese display name
export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  "fetch-global-market":  "同步全球指数",
  "sync-all-prices":      "同步股票行情",
  "sync-news":            "同步新闻资讯",
  "compute-scores":       "计算综合评分",
  "rerank-top500":        "生成推荐排名",
  "portfolio-snapshot":          "更新投资组合",
  "create-portfolio-snapshot":   "更新投资组合",
  "ai-signal-stats":             "AI信号统计",
  "update-ai-signal-stats":      "AI信号统计",
  "update-backtest":             "更新历史回测",
  "learning-report":             "生成学习报告",
  "generate-learning-report":    "生成学习报告",
  "health-check":         "系统健康检查",
  "data-health-guard":    "数据健康检查",
};

export function getPipelineLabel(stage: string): string {
  return PIPELINE_STAGE_LABELS[stage] ?? stage;
}

// Deployment card mini-badge labels
export const DEPLOY_STATUS_LABELS: Record<string, string> = {
  Build:    "构建",
  Health:   "健康",
  API:      "API",
  Page:     "页面",
  PM2:      "PM2",
  Database: "数据库",
};
