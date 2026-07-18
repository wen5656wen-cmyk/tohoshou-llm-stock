// ── Decision Engine · 出口（P15-01B）─────────────────────────────────────────
// L5 决策引擎单一入口。纯函数集合：消费已取数据 → 产 MarketDecision / RealtimeStockDecision /
// HoldingAction / Freshness。绝不重算评分、绝不重生成 ClosingDecision、绝不调 GPT。
// 盘中 cron（P15-01C）与聚合 API（P15-01B）共用本模块 → 决策逻辑单点。
export * from "./types";
export { marketPhase8, isExecutablePhase, nextTradingDayStr, nextDecisionLabel, jstDateStr, jstMinutes } from "./phase";
export { deriveStockDecision, groupPicks } from "./stock-decision";
export { deriveHoldingAction, deriveHoldingActions, type PaperPositionInput } from "./holdings-decision";
export { deriveGlobalDecision, type GlobalDecisionInput } from "./global-decision";
export { computeFreshness, type FreshnessInput } from "./freshness";
