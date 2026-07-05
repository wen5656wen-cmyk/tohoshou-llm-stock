// ── TOHOSHOU AI · Institution Flow Feature 类型（P6-T4）─────────────────────
// 机构资金流向因子（第一批）。**全部 SHADOW，禁止进入 Production 评分；只读派生现有
// InstitutionalFlow 数据，不落库、不改任何数据/评分。** 缺失字段返回 N/A，不伪造。
//
// ⚠️ 数据粒度诚实说明：InstitutionalFlow = JPX 投资部门别「**市场级**」周度买卖
// （非逐股）。故本批因子均为 **市场级流向信号**（whole-market），适用于市场环境/情绪，
// 不是个股信号。历史仅约 10 周（周度，滞后 1-2 周），streak/stability 深度受限。

/** 第一批 10 个机构资金因子（市场级）。 */
export type InstitutionFeatureType =
  | "FOREIGN_BUY"          // 外资净买入（本周 foreigners 净额 > 0 的强度）
  | "FOREIGN_SELL"         // 外资净卖出（净额 < 0 的抛压）
  | "FOREIGN_BUY_STREAK"   // 外资连续买入周数
  | "TRUST_BANK_FLOW"      // 信托银行资金流（trust_bank，多为养老金/长线）
  | "DEALER_FLOW"          // 券商自营资金流
  | "RETAIL_FLOW"          // 个人投资者资金流（individual，常为反向指标）
  | "NET_FLOW_MOMENTUM"    // 机构（smart money）资金趋势/动量
  | "FLOW_REVERSAL"        // 资金反转信号（净流向符号翻转）
  | "SMART_MONEY_SCORE"    // 机构资金综合评分（外资+信托+保险）
  | "FLOW_STABILITY";      // 资金流向稳定性（同向一致度）

export const INSTITUTION_FEATURE_TYPES: InstitutionFeatureType[] = [
  "FOREIGN_BUY", "FOREIGN_SELL", "FOREIGN_BUY_STREAK", "TRUST_BANK_FLOW",
  "DEALER_FLOW", "RETAIL_FLOW", "NET_FLOW_MOMENTUM", "FLOW_REVERSAL",
  "SMART_MONEY_SCORE", "FLOW_STABILITY",
];

export const INSTITUTION_FEATURE_ID: Record<InstitutionFeatureType, string> = {
  FOREIGN_BUY: "inst_foreign_buy",
  FOREIGN_SELL: "inst_foreign_sell",
  FOREIGN_BUY_STREAK: "inst_foreign_buy_streak",
  TRUST_BANK_FLOW: "inst_trust_bank_flow",
  DEALER_FLOW: "inst_dealer_flow",
  RETAIL_FLOW: "inst_retail_flow",
  NET_FLOW_MOMENTUM: "inst_net_flow_momentum",
  FLOW_REVERSAL: "inst_flow_reversal",
  SMART_MONEY_SCORE: "inst_smart_money_score",
  FLOW_STABILITY: "inst_flow_stability",
};

export const INSTITUTION_FEATURE_LABEL: Record<InstitutionFeatureType, string> = {
  FOREIGN_BUY: "外资净买入",
  FOREIGN_SELL: "外资净卖出",
  FOREIGN_BUY_STREAK: "外资连续买入周数",
  TRUST_BANK_FLOW: "信托银行资金流",
  DEALER_FLOW: "券商自营资金流",
  RETAIL_FLOW: "个人投资者资金流",
  NET_FLOW_MOMENTUM: "机构资金趋势",
  FLOW_REVERSAL: "资金反转信号",
  SMART_MONEY_SCORE: "机构资金综合评分",
  FLOW_STABILITY: "资金稳定性",
};

/** 投资部门 key（对齐 InstitutionalFlow.investorType 实际取值）。 */
export const INVESTOR = {
  FOREIGN: "foreigners",
  TRUST_BANK: "trust_bank",
  DEALER: "dealer",
  INDIVIDUAL: "individual",
  INSURANCE: "insurance",
} as const;

export type FlowDirection = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "NA";

/** 解析输入的最小 InstitutionalFlow 形状（与 Prisma 解耦）。 */
export interface InstitutionalFlowLike {
  date: Date | string;
  investorType: string;
  market?: string | null;
  buyAmount?: number | null;
  sellAmount?: number | null;
  netAmount?: number | null;
}

export interface InstitutionFeatureResult {
  type: InstitutionFeatureType;
  available: boolean;        // false → 数据缺失，值 null（N/A，不伪造）
  value: number | null;      // 主数值（净额億円 / 周数 / 动量 / 稳定度 / 综合分）
  direction: FlowDirection;
  score: number | null;      // 0-100 影子评分
  note?: string;
}

/** 市场级机构资金因子集合（影子，不落库；scope 恒为 MARKET）。 */
export interface InstitutionFeatureSet {
  scope: "MARKET";
  market: string;            // "ALL"（跨市场汇总）或具体 market
  weeks: number;             // 使用的周数
  latestWeek: string | null;
  asOf: string;
  features: Record<InstitutionFeatureType, InstitutionFeatureResult>;
}
