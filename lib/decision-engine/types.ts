// ── Decision Engine · 类型（P15-01B）─────────────────────────────────────────
// L5 决策引擎：纯函数，消费 StockScore/PaperBroker/MarketRegime/Realtime/News/ClosingDecision
// 产出 MarketDecision + RealtimeStockDecision + HoldingAction。
// 绝不重算评分、绝不重生成 ClosingDecision、绝不调 GPT。
import type { DecisionAction } from "../decision/verdict";

export type { DecisionAction };

/** 交易阶段（8 态，扩展自 lib/decision/live-status 的 3 态 marketPhase）。 */
export type MarketPhase =
  | "PRE_OPEN" | "OPEN_CONFIRM" | "MORNING" | "MIDDAY"
  | "AFTERNOON" | "LATE_SESSION" | "POST_CLOSE" | "NON_TRADING";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type QuoteSource = "realtime" | "EOD";

/** 收盘决策 Top10 单行（ClosingDecision.top10 的 JSON 形状，只读消费）。 */
export interface ClosingTop10Row {
  rank?: number | null;
  symbol: string;
  name?: string | null;
  sector?: string | null;
  price?: number | null;
  changePct?: number | null;
  aiScore?: number | null;
  entryLow?: number | null;
  entryHigh?: number | null;
  target1?: number | null;
  target2?: number | null;
  stopLoss?: number | null;
  action?: string | null;
  riskLevel?: string | null;
  newsSentiment?: number | null;
  volumeRatio?: number | null;
  inBuyZone?: boolean | null;
  breakout?: boolean | null;
  reason?: string | null;
}

/** 实时报价（仅当前展示标的，来自 fetchQuotesBatch）。 */
export interface Quote {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  time: number | null; // epoch ms
}

/** 六个分离时间戳 + 失效标记。 */
export interface Freshness {
  quoteUpdatedAt: string | null;    // ISO；null = 无实时（EOD 回退）
  quoteSource: QuoteSource;
  rankingUpdatedAt: string | null;  // ISO（StockScore.computedAt）
  decisionUpdatedAt: string | null; // ISO（ClosingDecision.computedAt）
  decidedAtJst: string | null;      // HH:mm JST 墙钟（展示）
  holdingsUpdatedAt: string | null; // ISO（PaperPosition.updatedAt）
  validUntil: string | null;        // JST 标签（下一次决策=有效截止）
  nextDecisionAt: string | null;    // JST 标签
  stale: boolean;                   // 行情过期 → 禁止执行
  staleReason: string | null;       // i18n key
}

/** 逐股实时决策（基于 ClosingTop10Row 扩展，动作可随实时价变化）。 */
export interface RealtimeStockDecision {
  symbol: string;
  name: string;
  universeRank: number | null;
  previousRank: number | null; // v1 无盘中历史 → null（诚实）
  currentPrice: number | null;
  changePct: number | null;
  quoteUpdatedAt: string | null;
  quoteSource: QuoteSource;
  action: DecisionAction;      // 个股子集
  actionReasonKey: string;     // i18n key（触发条件语义）
  triggerConditionKey: string | null;
  buyRangeLow: number | null;
  buyRangeHigh: number | null;
  targetPrice1: number | null;
  targetPrice2: number | null;
  stopLossPrice: number | null;
  suggestedPositionPct: number | null;
  aiScore: number | null;
  riskLevel: RiskLevel | null;
  isExecutable: boolean;
}

/** 持仓动作（6 档 + 优先级）。 */
export interface HoldingAction {
  symbol: string;
  name: string;
  strategyType: string | null;
  entryPrice: number | null;
  currentPrice: number | null;
  returnPct: number | null;
  action: DecisionAction;   // STOP_LOSS/REDUCE/TAKE_PROFIT/HOLD/ADD
  sellPct: number;          // 建议卖出比例（0=不卖）
  reasonKey: string;
  targetPrice: number | null;
  stopLossPrice: number | null;
  priority: number;         // 1=最高（止损）
  quoteUpdatedAt: string | null;
}

/** 全局唯一决策。 */
export interface MarketDecision {
  action: DecisionAction;   // 全局子集
  phase: MarketPhase;
  headlineKey: string;      // = action 标签 key
  instructionKey: string;   // 一句话执行指令 i18n key
  targetTotalPositionPct: number | null;
  additionalPositionPct: number | null;
  maxSingleStockPct: number | null;
  marketRegime: string | null;
  riskLevel: RiskLevel | null;
  confidence: number | null; // avgAiScore 近似
  isExecutable: boolean;
  blockedReasonKey: string | null;
}

export interface DecisionGroups {
  executeNow: RealtimeStockDecision[];
  waitList: RealtimeStockDecision[];
  backups: RealtimeStockDecision[];
}
