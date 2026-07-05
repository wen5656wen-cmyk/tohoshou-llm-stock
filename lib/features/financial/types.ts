// ── TOHOSHOU AI · Financial Quality Feature 类型（P6-T3）────────────────────
// 财务质量因子（第二批）。**全部 SHADOW，禁止进入 Production 评分；只读派生现有
// Financial 数据，不落库、不改任何财务计算/详情页/fundamental score。**
// 缺失字段一律返回 N/A（available=false + null），禁止伪造。

/** 第二批 10 个财务质量因子。 */
export type FinancialFeatureType =
  | "ROE_TREND"                  // ROE 改善趋势（由 netProfit/equity 派生，Financial.roe 字段为空）
  | "EPS_GROWTH"                 // EPS 增长（YoY）
  | "REVENUE_GROWTH"            // 营收增长（YoY）
  | "OPERATING_MARGIN"          // 营业利润率
  | "PROFIT_MARGIN_IMPROVEMENT" // 利润率改善（净利率 YoY 变化）
  | "EQUITY_RATIO"              // 自己资本比率 / 财务安全性
  | "DIVIDEND_GROWTH"           // 分红增长
  | "CASH_FLOW_QUALITY"         // 现金流质量（**Financial 表无现金流字段 → 恒 N/A**）
  | "DEBT_RISK"                 // 负债风险（由 1-自己资本比率 派生）
  | "QUALITY_COMPOSITE";        // 财务质量综合因子（可用子因子均值）

export const FINANCIAL_FEATURE_TYPES: FinancialFeatureType[] = [
  "ROE_TREND", "EPS_GROWTH", "REVENUE_GROWTH", "OPERATING_MARGIN",
  "PROFIT_MARGIN_IMPROVEMENT", "EQUITY_RATIO", "DIVIDEND_GROWTH",
  "CASH_FLOW_QUALITY", "DEBT_RISK", "QUALITY_COMPOSITE",
];

/** 事件类型 → Feature Registry feature id（一一对应）。 */
export const FINANCIAL_FEATURE_ID: Record<FinancialFeatureType, string> = {
  ROE_TREND: "fin_roe_trend",
  EPS_GROWTH: "fin_eps_growth",
  REVENUE_GROWTH: "fin_revenue_growth",
  OPERATING_MARGIN: "fin_operating_margin",
  PROFIT_MARGIN_IMPROVEMENT: "fin_profit_margin_improvement",
  EQUITY_RATIO: "fin_equity_ratio",
  DIVIDEND_GROWTH: "fin_dividend_growth",
  CASH_FLOW_QUALITY: "fin_cash_flow_quality",
  DEBT_RISK: "fin_debt_risk",
  QUALITY_COMPOSITE: "fin_quality_composite",
};

export const FINANCIAL_FEATURE_LABEL: Record<FinancialFeatureType, string> = {
  ROE_TREND: "ROE 改善趋势",
  EPS_GROWTH: "EPS 增长",
  REVENUE_GROWTH: "营收增长",
  OPERATING_MARGIN: "营业利润率",
  PROFIT_MARGIN_IMPROVEMENT: "利润率改善",
  EQUITY_RATIO: "自己资本比率",
  DIVIDEND_GROWTH: "分红增长",
  CASH_FLOW_QUALITY: "现金流质量",
  DEBT_RISK: "负债风险",
  QUALITY_COMPOSITE: "财务质量综合",
};

/** 方向语义（含 N/A）。 */
export type FinancialDirection = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "NA";

/** 解析输入的最小 Financial 形状（与 Prisma 解耦，便于纯函数/测试）。 */
export interface FinancialLike {
  fiscalYear: number;
  quarter?: number | null;      // null = 通期/年度
  revenue?: number | null;
  operatingProfit?: number | null;
  ordinaryProfit?: number | null;
  netProfit?: number | null;
  totalAssets?: number | null;
  equity?: number | null;
  eps?: number | null;
  bps?: number | null;
  roe?: number | null;          // 实测多为空 → 由 netProfit/equity 派生
  roa?: number | null;
  equityRatio?: number | null;  // 实测为分数(0-1)，内部归一化到 %
  dividendPerShare?: number | null; // 实测多为空 → 缺失返回 N/A
  reportedAt?: Date | string | null;
}

/** 单个财务因子的派生结果。 */
export interface FinancialFeatureResult {
  type: FinancialFeatureType;
  available: boolean;           // false → 数据缺失，值为 null（N/A，不伪造）
  value: number | null;         // 主数值（增长% / 利润率% / 比率% / 改善pp / 综合分）
  latest: number | null;        // 最近一期参考值
  prior: number | null;         // 对比期参考值（YoY 优先）
  direction: FinancialDirection;
  score: number | null;         // 0-100 影子评分（缺失=null）
  note?: string;
}

/** 某标的的财务质量因子集合（影子，不落库）。 */
export interface FinancialFeatureSet {
  symbol: string;
  fiscalYear: number | null;
  quarter: number | null;
  comparedFiscalYear: number | null;
  comparedQuarter: number | null;
  comparisonKind: "YoY" | "SEQUENTIAL" | "NONE";
  asOf: string;
  features: Record<FinancialFeatureType, FinancialFeatureResult>;
}
