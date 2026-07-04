// ── Explain AI Engine · 类型（P5-T1）─────────────────────────────────────────
// 全站唯一的「AI 决策解释」类型定义。纯展示/派生层，只读现有评分数据，绝不重算。

export type ExplainProviderKind = "rule" | "gpt" | "hybrid";

export type ExplainTone = "strength" | "weakness" | "risk" | "opportunity" | "neutral";

// 单条解释点（为什么/风险/机会的原子单元）
export interface ExplainPoint {
  code: string; // 稳定标识（未来 i18n / GPT 对齐用）
  title: string; // 一句话结论（中文）
  detail?: string; // 补充说明
  tone: ExplainTone;
  weight?: number; // 相对重要度 0-100（仅排序，非评分）
}

export interface ExplainConfidence {
  level: "HIGH" | "MEDIUM" | "LOW";
  score: number | null; // 0-100（读现有 ruleConfidence / 派生），非新评分
  label: string;
}

// 统一解释结果（第三部分规定的结构）
export interface ExplainResult {
  symbol: string;
  name: string | null;
  provider: ExplainProviderKind;
  recommendation: string | null; // 读 recommendationV2，不改
  overallSummary: string; // 总体结论
  strengths: ExplainPoint[]; // 为什么推荐
  weaknesses: ExplainPoint[]; // 为什么不推荐
  risks: ExplainPoint[]; // 主要风险
  opportunities: ExplainPoint[]; // 机会
  marketContext: string; // 市场环境
  recommendedStrategy: string; // 建议策略（日内/波段/长线）
  holdingPeriod: string; // 建议持有周期
  confidence: ExplainConfidence;
  nextObservation: string[]; // 未来关注什么
  dataAsOf: string | null; // 数据快照日期
  generatedAt: string;
}

// ── 只读输入快照（从 StockScore / MarketRegime 读取，不含任何计算）──────────────
export interface ScoreSnapshot {
  symbol: string;
  name: string | null;
  nameZh: string | null;
  sector: string | null;
  latestDate: string | null;
  latestClose: number | null;
  // 5 维分（各自满分：tech30 fund25 flow20 news15 global10）
  technicalScore: number | null;
  fundamentalScore: number | null;
  moneyFlowScore: number | null;
  newsSentimentScore: number | null;
  globalTrendScore: number | null;
  riskScore: number | null;
  // 综合
  adaptiveScore: number | null;
  percentileRank: number | null; // 1-100，越小越好
  recommendationV2: string | null;
  recommendationReason: string | null;
  stockStyle: string | null;
  highRiskFlag: boolean;
  opportunityScore: number | null;
  opportunityLabel: string | null;
  catalystScore: number | null;
  ruleConfidence: number | null;
  tradingAction: string | null;
  positionSizePct: number | null;
  actionRiskLevel: string | null;
  actionReasons: unknown; // Json（已有）
  actionWarnings: unknown; // Json（已有）
  fxSensitivity: string | null;
  summaryReason: string | null;
  newsSummary: string | null;
  // 技术细节
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  rsi14: number | null;
  maTrend: string | null;
}

export interface RegimeSnapshot {
  regime: string | null; // BULL / SIDEWAYS / BEAR
  regimeScore: number | null;
  breadth: number | null;
  volatility: number | null;
  date: string | null;
}

export interface ExplainInput {
  symbol: string;
  score: ScoreSnapshot | null;
  regime: RegimeSnapshot | null;
}

// Provider 抽象（第八部分）
export interface ExplainProvider {
  kind: ExplainProviderKind;
  explain(input: ExplainInput): ExplainResult;
}
