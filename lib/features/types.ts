// ── TOHOSHOU AI · Feature Registry / 类型定义（P6-T1）─────────────────────────
// Feature Registry 是「因子管理中心」——纯元数据登记，**不参与任何计算、不影响任何
// 评分/推荐/权重**。此文件仅定义类型，供 catalog / registry / statistics 使用。
//
// 设计目标：支撑未来管理 200+ Feature（不按当前 ~40 个设计）。新增因子必须先登记到
// Registry，再走 Shadow → Backtest → Learning → Production，未经验证禁止进入正式评分。

/** Feature 分类（10 类）。 */
export type FeatureCategory =
  | "PRICE"        // 价格
  | "TECHNICAL"    // 技术指标
  | "FUNDAMENTAL"  // 基本面
  | "NEWS"         // 新闻情绪
  | "MARKET"       // 市场状态
  | "MONEY_FLOW"   // 资金流
  | "TDNET"        // 开示（TDnet）
  | "GLOBAL"       // 全球市场
  | "AI"           // AI 派生分
  | "OTHER";       // 其他

/** Feature 数据来源（原始上游）。 */
export type FeatureSource =
  | "DailyPrice"
  | "Financial"
  | "JQuants"
  | "TDnet"
  | "Kabutan"
  | "Yahoo"
  | "GlobalMarket"
  | "InstitutionalFlow"
  | "OpenAI"
  | "System"; // 系统内派生（如 adaptiveScore）

/** Feature 生命周期状态。 */
export type FeatureStatus =
  | "PRODUCTION" // 已进入正式评分
  | "SHADOW"     // 影子模式（仅观测，不接入正式评分）
  | "DISABLED";  // 已停用/未启用

/** 一个 Feature 的登记元数据。 */
export interface Feature {
  id: string;                 // 唯一稳定 id（kebab/camel，永不复用）
  name: string;               // 显示名
  category: FeatureCategory;
  source: FeatureSource;
  description: string;
  status: FeatureStatus;
  version: string;            // 该 Feature 的版本标记（如 v7.7 / shadow-v3 / alpha-2.0）
  createdAt: string;          // 登记/引入日期（ISO，YYYY-MM-DD）
  weight?: number | null;     // 预留：正式评分权重（V1 一律 null，Registry 不使用它计算）
}

/**
 * 预留统计层（P6 未来）。全部字段允许为空——**V1 绝不计算，恒为空**。
 * 未来由 Shadow/Backtest/Learning 回填，用于 Feature 有效性评估。
 */
export interface FeatureStatistics {
  enabled: boolean | null;
  weight: number | null;
  hitRate30d: number | null;
  hitRate90d: number | null;
  avgReturn30d: number | null;
  avgReturn90d: number | null;
  coverage: number | null;
  lastValidated: string | null; // ISO
  version: string | null;
}

/** Feature + 其（预留）统计。 */
export interface FeatureWithStats extends Feature {
  statistics: FeatureStatistics;
}

/** 枚举全集（用于 UI 分布、校验、遍历）。 */
export const FEATURE_CATEGORIES: FeatureCategory[] = [
  "PRICE", "TECHNICAL", "FUNDAMENTAL", "NEWS", "MARKET",
  "MONEY_FLOW", "TDNET", "GLOBAL", "AI", "OTHER",
];

export const FEATURE_SOURCES: FeatureSource[] = [
  "DailyPrice", "Financial", "JQuants", "TDnet", "Kabutan",
  "Yahoo", "GlobalMarket", "InstitutionalFlow", "OpenAI", "System",
];

export const FEATURE_STATUSES: FeatureStatus[] = ["PRODUCTION", "SHADOW", "DISABLED"];

/** 分类中文标签（仅展示用）。 */
export const CATEGORY_LABEL: Record<FeatureCategory, string> = {
  PRICE: "价格", TECHNICAL: "技术指标", FUNDAMENTAL: "基本面", NEWS: "新闻情绪",
  MARKET: "市场状态", MONEY_FLOW: "资金流", TDNET: "开示 TDnet", GLOBAL: "全球市场",
  AI: "AI 派生", OTHER: "其他",
};

/** 状态中文标签（仅展示用）。 */
export const STATUS_LABEL: Record<FeatureStatus, string> = {
  PRODUCTION: "正式", SHADOW: "影子", DISABLED: "停用",
};
