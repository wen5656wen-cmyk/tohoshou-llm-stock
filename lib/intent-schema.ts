/**
 * lib/intent-schema.ts — Unified Intent Types V7.9.1
 *
 * Shared by intent-engine.ts, query-engine.ts, answer-builder.ts,
 * /api/chat, and LINE webhook — single source of truth.
 */

// ── 12 intent types ─────────────────────────────────────────────────────────

export type IntentType =
  | "top_picks"       // 今天买什么 / 推荐五只
  | "recommend_more"  // 还有其他的吗 / 再推荐几只
  | "stock_analysis"  // 7203 / 丰田怎么样
  | "stock_compare"   // 丰田和伊藤忠比
  | "theme_rank"      // 科技股谁最强
  | "sector_outlook"  // 半导体还能买吗
  | "market_overview" // 今天市场怎么样
  | "risk_analysis"   // 风险呢 (followUp) / 分析7203风险
  | "reason_explain"  // 为什么 (followUp) / 为什么推荐这只
  | "data_source"     // 数据哪里来的
  | "help"            // 帮助 / 菜单
  | "unknown";        // fallback → always returns HELP

// ── Structured intent output from intent-engine ─────────────────────────────

export type StructuredIntent = {
  intent: IntentType;
  /** Resolved TSE symbols ("7203.T" format) */
  symbols?: string[];
  /** Raw stock names that query-engine must resolve from DB */
  stockNames?: string[];
  /** Theme keyword for theme_rank */
  theme?: string;
  /** Sector keyword for sector_outlook */
  sector?: string;
  /** Prisma sector values for sector_outlook */
  sectors?: string[];
  /** Style filter: "VALUE_DEFENSIVE" | "GROWTH_MOMENTUM" | etc. */
  style?: string;
  /** Risk preference filter */
  riskPreference?: "LOW" | "MEDIUM" | "HIGH";
  /** High-dividend preference */
  dividendPreference?: boolean;
  /** Symbols to exclude for recommend_more */
  excludeSymbols?: string[];
  /** How many stocks to return */
  limit?: number;
  /** True if this is a follow-up to a previous query */
  followUp?: boolean;
  rawText: string;
};

// ── Per-user conversation context (30-min TTL) ──────────────────────────────

export type ConversationContext = {
  userId: string;
  channel: "LINE" | "WEB";
  lastIntent?: IntentType;
  lastSymbols?: string[];
  lastTheme?: string;
  lastSector?: string;
  lastSectorLabel?: string;
  lastFilters?: Partial<Pick<StructuredIntent, "riskPreference" | "dividendPreference" | "style">>;
  /** Symbols returned in last response — used as excludeSymbols for recommend_more */
  lastResults?: string[];
  expiresAt: number;
};

// ── Stock data (superset of StockCardV79Data) ────────────────────────────────

export type StockSummary = {
  symbol: string;
  name: string;
  nameZh: string | null;
  adaptiveScore: number | null;
  totalScore: number | null;
  recommendation: string | null;
  recommendationV2: string | null;
  recommendationReason: string | null;
  percentileRank: number | null;
  marketRank: number | null;
  opportunityScore: number | null;
  opportunityLabel: string | null;
  dividendScore: number | null;
  catalystScore: number | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  moneyFlowScore: number | null;
  newsSentimentScore: number | null;
  globalTrendScore: number | null;
  shortSellingRatio: number | null;
  shortSellingSource: string | null;
  shortSellingDate: string | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  dividendAnn: number | null;
  latestClose: number | null;
  return5d: number | null;
  return20d: number | null;
  return60d?: number | null;
  rsi14: number | null;
  maTrend: string | null;
  macdSignalLabel: string | null;
  highRiskFlag: boolean;
  stockStyle: string | null;
  scoreSource: string | null;
  latestDate: string | null;
  sector: string | null;
};

export type MarketSnapshot = {
  date: Date | null;
  nasdaq: number | null;
  nasdaqChange: number | null;
  nikkei: number | null;
  nikkeiChange: number | null;
  vix: number | null;
  usdjpy: number | null;
  score: number | null;
};

export type InstFlowData = {
  date: Date;
  netAmount: number | null;
  source: string;
};

// ── DB query result (passed to answer-builder) ───────────────────────────────

export type DbQueryResult = {
  intent: IntentType;
  dateStr: string;
  stocks?: StockSummary[];
  compareStocks?: [StockSummary, StockSummary] | null;
  marketData?: MarketSnapshot | null;
  instFlow?: InstFlowData | null;
  shortSellRatio?: number | null;
  shortSellSource?: string | null;
  shortSellDate?: string | null;
  marketTemperature?: string;
  distribution?: { strongBuy: number; buy: number; hold: number; watch: number; avoid: number; total: number };
  top1?: { symbol: string; name: string; nameZh: string | null; adaptiveScore: number | null } | null;
  sectorLabel?: string;
  resolvedSymbols?: string[];
  unresolvedNames?: string[];
  /** Always "DB" — GPT never generates stock data */
  answerSource: "DB";
  /** Always false — GPT only outputs intent JSON */
  hallucination: false;
  error?: string;
};
