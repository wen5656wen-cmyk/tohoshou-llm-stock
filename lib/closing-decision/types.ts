// ── TOHOSHOU AI · Closing Decision 类型（P6-T12）─────────────────────────────
// 收盘决策模块共享类型。**独立模块 · 只读派生 · 不影响任何现有功能。**

export type Verdict = "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH";
export type Confidence = "A+" | "A" | "B";

/** 单只候选的实时 + 评分快照（Top10/Top20 行）。 */
export interface DecisionRow {
  rank: number;
  symbol: string;
  name: string | null;
  sector: string | null;
  // 实时行情
  price: number | null; // Yahoo 实时价（回退 latestClose）
  previousClose: number | null;
  changePct: number | null; // 今日涨跌 %（现价 vs 前收）
  volume: number | null;
  volumeRatio: number | null; // 量比 = 今日量 / 平均量
  turnoverRate: number | null; // 换手率 %（量 / 流通股，缺流通股→null）
  quoteRealtime: boolean; // 是否为实时价（false=EOD 回退）
  // 实时重算技术指标
  rsi14: number | null;
  macdHist: number | null;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  return20d: number | null;
  // 评分
  aiScore: number | null; // StockScore.adaptiveScore
  gptScore: number | null; // GPT Top20 分析（0-100）
  gptNote: string | null;
  closingScore: number; // 收盘综合分（ai×0.6 + gpt×0.4，无 gpt 用 ai）
  // 风控 / 交易层（来自 StockScore AI Action）
  recommendationV2: string | null;
  action: string | null; // BUY_NOW | WAIT_PULLBACK | HOLD | ...
  riskLevel: string | null; // LOW | MEDIUM | HIGH | EXTREME
  highRiskFlag: boolean;
  newsSentiment: number | null; // StockScore.newsSentimentScore 0-15
  // 买卖区间
  entryLow: number | null;
  entryHigh: number | null;
  target1: number | null;
  target2: number | null;
  stopLoss: number | null;
  // 派生标记
  inBuyZone: boolean; // 现价 ∈ [entryLow, entryHigh]
  breakout: boolean; // 现价 > entryHigh（已突破/追高）
  negativeNews: boolean; // 高影响利空
  lowLiquidity: boolean; // 流动性不足
  qualified: boolean; // 可建仓合格（BUY_NOW/近买区 + 无利空 + 非追高 + 风险可控）
  reason: string | null;
}

/** Decision Engine 输入上下文。 */
export interface DecisionContext {
  regime: string | null; // BULL | SIDEWAYS | BEAR
  regimeScore: number | null;
  marketTrend: number | null;
  volatility: number | null;
  avgAiScore: number | null;
  avgRiskScore: number | null;
  buyZoneHitRate: number | null; // %
  breakoutRatio: number | null; // %
  newsRiskCount: number;
  qualifiedCount: number;
  top1AiScore: number | null;
}

export interface DecisionOutcome {
  verdict: Verdict;
  reason: string;
  opportunity: number; // 机会分（审计）
}

/** 组合腿。 */
export interface PortfolioLeg {
  symbol: string;
  name: string | null;
  sector: string | null;
  weight: number; // %
  price: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  target1: number | null;
  stopLoss: number | null;
  aiScore: number | null;
  gptScore: number | null;
  reason: string | null;
}

export interface PortfolioResult {
  legs: PortfolioLeg[];
  note: string; // 组合说明 / "今日建议空仓"
}
