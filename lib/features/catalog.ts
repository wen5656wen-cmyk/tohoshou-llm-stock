// ── TOHOSHOU AI · Feature Catalog（P6-T1）───────────────────────────────────
// 登记当前系统已有的全部 Feature。**只登记，绝不改变任何评分/权重/推荐**。
// createdAt = 该因子被引入系统的近似日期；version = 其所属版本标记。
// 未来新增因子（Buyback / Revision / Macro / Short Selling …）在此追加即可，
// 结构为扁平数组，可无痛扩展到 200+。

import type {
  Feature, FeatureCategory, FeatureSource, FeatureStatus,
} from "./types";

/** 紧凑登记助手（保持 catalog 可读、易扩展）。 */
function f(
  id: string, name: string, category: FeatureCategory, source: FeatureSource,
  status: FeatureStatus, version: string, createdAt: string, description: string,
): Feature {
  return { id, name, category, source, status, version, createdAt, description, weight: null };
}

// 常用日期锚点（仅登记语义，非运行时依赖）
const V77 = "v7.7";                // 生产基线（20260626-v7.7）
const BASE = "2026-06-26";         // 生产基线冻结日
const SHADOW_V3 = "shadow-v3";     // Adaptive V3 影子
const ALPHA = "alpha-2.0";         // Alpha 因子引擎

export const FEATURE_CATALOG: Feature[] = [
  // ── PRICE（价格，源 DailyPrice）──────────────────────────────────────────
  f("close", "終値 Close", "PRICE", "DailyPrice", "PRODUCTION", V77, BASE, "日次終値（复权后）"),
  f("return5d", "5日收益率", "PRICE", "DailyPrice", "PRODUCTION", V77, BASE, "近5交易日累计收益率"),
  f("return20d", "20日收益率", "PRICE", "DailyPrice", "PRODUCTION", V77, BASE, "近20交易日累计收益率"),
  f("return60d", "60日收益率", "PRICE", "DailyPrice", "PRODUCTION", V77, BASE, "近60交易日累计收益率"),
  f("distance52wHigh", "距52周高点", "PRICE", "DailyPrice", "PRODUCTION", V77, BASE, "现价相对52周最高价的距离"),

  // ── TECHNICAL（技术指标，源 DailyPrice → lib/indicators）──────────────────
  f("ma5", "MA5", "TECHNICAL", "DailyPrice", "PRODUCTION", V77, BASE, "5日移动平均"),
  f("ma20", "MA20", "TECHNICAL", "DailyPrice", "PRODUCTION", V77, BASE, "20日移动平均"),
  f("ma60", "MA60", "TECHNICAL", "DailyPrice", "PRODUCTION", V77, BASE, "60日移动平均"),
  f("maTrend", "均线趋势", "TECHNICAL", "DailyPrice", "PRODUCTION", V77, BASE, "MA5/20/60 排列趋势方向"),
  f("rsi14", "RSI(14)", "TECHNICAL", "DailyPrice", "PRODUCTION", V77, BASE, "14日相对强弱指标"),
  f("macd", "MACD", "TECHNICAL", "DailyPrice", "PRODUCTION", V77, BASE, "MACD 快慢线/柱"),
  f("momentum", "动量", "TECHNICAL", "DailyPrice", "PRODUCTION", V77, BASE, "价格动量因子"),
  f("volumeRatio20", "量比(20)", "TECHNICAL", "DailyPrice", "PRODUCTION", V77, BASE, "当日量 / 20日均量"),
  f("atr14", "ATR(14)", "TECHNICAL", "DailyPrice", "PRODUCTION", V77, BASE, "14日平均真实波幅"),
  f("technicalScore", "技术面得分(30)", "TECHNICAL", "System", "PRODUCTION", V77, BASE, "AI 评分 5 维之一，满分 30"),
  // — Alpha 影子技术因子（不接入正式评分）—
  f("atrPct", "ATR%", "TECHNICAL", "DailyPrice", "SHADOW", ALPHA, "2026-07-03", "ATR 占价格百分比（低波动因子）"),
  f("rs5", "相对强度 RS5", "TECHNICAL", "DailyPrice", "SHADOW", ALPHA, "2026-07-03", "5日相对市场强度"),
  f("rs20", "相对强度 RS20", "TECHNICAL", "DailyPrice", "SHADOW", ALPHA, "2026-07-03", "20日相对市场强度"),
  f("rs60", "相对强度 RS60", "TECHNICAL", "DailyPrice", "SHADOW", ALPHA, "2026-07-03", "60日相对市场强度"),
  f("volumeExpansionDays", "放量天数", "TECHNICAL", "DailyPrice", "SHADOW", ALPHA, "2026-07-03", "近期放量交易日计数"),
  f("averageTurnover20", "平均成交额(20)", "TECHNICAL", "DailyPrice", "SHADOW", ALPHA, "2026-07-03", "20日平均成交额（流动性）"),

  // ── FUNDAMENTAL（基本面，源 Financial）────────────────────────────────────
  f("roe", "ROE", "FUNDAMENTAL", "Financial", "PRODUCTION", V77, BASE, "净资产收益率"),
  f("roa", "ROA", "FUNDAMENTAL", "Financial", "PRODUCTION", V77, BASE, "总资产收益率"),
  f("eps", "EPS", "FUNDAMENTAL", "Financial", "PRODUCTION", V77, BASE, "每股收益"),
  f("per", "PER", "FUNDAMENTAL", "Financial", "PRODUCTION", V77, BASE, "市盈率"),
  f("pbr", "PBR", "FUNDAMENTAL", "Financial", "PRODUCTION", V77, BASE, "市净率"),
  f("operatingMargin", "营业利润率", "FUNDAMENTAL", "Financial", "PRODUCTION", V77, BASE, "营业利润 / 营收"),
  f("equityRatio", "自有资本比率", "FUNDAMENTAL", "Financial", "PRODUCTION", V77, BASE, "股东权益 / 总资产"),
  f("fundamentalScore", "基本面得分(25)", "FUNDAMENTAL", "System", "PRODUCTION", V77, BASE, "AI 评分 5 维之一，满分 25"),
  f("dividendYield", "股息率", "FUNDAMENTAL", "JQuants", "PRODUCTION", V77, BASE, "年化股息 / 现价"),
  f("payoutRatio", "派息率", "FUNDAMENTAL", "JQuants", "SHADOW", "v1", "2026-06-28", "分红 / 净利润（观测）"),

  // ── NEWS（新闻情绪，源 Kabutan/TDnet → News）──────────────────────────────
  f("newsSentimentScore", "新闻情绪得分(15)", "NEWS", "Kabutan", "PRODUCTION", V77, BASE, "AI 评分 5 维之一，满分 15"),
  f("newsPositiveRatio", "利好占比", "NEWS", "Kabutan", "PRODUCTION", V77, BASE, "近期正面新闻占比"),

  // ── MARKET（市场状态）─────────────────────────────────────────────────────
  f("marketRegime", "市场状态", "MARKET", "System", "PRODUCTION", V77, BASE, "牛市/震荡/熊市（TOPIX 派生）"),
  f("topixTrend", "TOPIX 趋势", "MARKET", "GlobalMarket", "PRODUCTION", V77, BASE, "TOPIX 均线趋势"),

  // ── MONEY_FLOW（资金流）───────────────────────────────────────────────────
  f("moneyFlowScore", "资金流得分(20)", "MONEY_FLOW", "InstitutionalFlow", "PRODUCTION", V77, BASE, "AI 评分 5 维之一，满分 20"),
  f("institutionalFlow", "机构资金流向", "MONEY_FLOW", "InstitutionalFlow", "PRODUCTION", V77, BASE, "JPX 投资主体买卖净额"),
  f("turnover", "成交额", "MONEY_FLOW", "DailyPrice", "PRODUCTION", V77, BASE, "日次成交金额"),
  f("shortSellingRatio", "空売り比率", "MONEY_FLOW", "JQuants", "SHADOW", "v1", "2026-06-28", "JPX 空売り比率（观测）"),

  // ── TDNET（开示，源 TDnet → Disclosure）───────────────────────────────────
  f("catalystScore", "催化剂得分", "TDNET", "TDnet", "PRODUCTION", V77, BASE, "由开示事件派生的催化剂强度"),
  f("disclosureEvents", "开示事件", "TDNET", "TDnet", "SHADOW", "v1", "2026-06-26", "TDnet 开示事件计数/类型（观测）"),
  // ── P6-T2 TDnet Event Feature Engine（第一批 6 事件，全部 SHADOW，禁止进入 Production）──
  f("tdnet_buyback", "回购 BUYBACK", "TDNET", "TDnet", "SHADOW", "P6-T2", "2026-07-05", "自己株式取得（回购）事件因子（影子，待 Backtest/Learning 验证）"),
  f("tdnet_dividend_increase", "提高分红 DIVIDEND_INCREASE", "TDNET", "TDnet", "SHADOW", "P6-T2", "2026-07-05", "増配・復配・配当予想増額 事件因子（影子）"),
  f("tdnet_earnings_up_revision", "业绩上修 EARNINGS_UP_REVISION", "TDNET", "TDnet", "SHADOW", "P6-T2", "2026-07-05", "業績予想上方修正 事件因子（影子）"),
  f("tdnet_earnings_down_revision", "业绩下修 EARNINGS_DOWN_REVISION", "TDNET", "TDnet", "SHADOW", "P6-T2", "2026-07-05", "業績予想下方修正 事件因子（影子）"),
  f("tdnet_stock_split", "拆股 STOCK_SPLIT", "TDNET", "TDnet", "SHADOW", "P6-T2", "2026-07-05", "株式分割 事件因子（影子）"),
  f("tdnet_treasury_cancellation", "注销库存股 TREASURY_SHARE_CANCELLATION", "TDNET", "TDnet", "SHADOW", "P6-T2", "2026-07-05", "自己株式消却 事件因子（影子）"),

  // ── GLOBAL（全球市场，源 Yahoo → GlobalMarket）────────────────────────────
  f("globalTrendScore", "全球趋势得分(10)", "GLOBAL", "GlobalMarket", "PRODUCTION", V77, BASE, "AI 评分 5 维之一，满分 10"),
  f("nasdaq", "NASDAQ", "GLOBAL", "Yahoo", "PRODUCTION", V77, BASE, "纳斯达克指数"),
  f("vix", "VIX", "GLOBAL", "Yahoo", "PRODUCTION", V77, BASE, "恐慌指数"),
  f("usdjpy", "USD/JPY", "GLOBAL", "Yahoo", "PRODUCTION", V77, BASE, "美元兑日元汇率"),
  f("nikkei", "日经225", "GLOBAL", "Yahoo", "PRODUCTION", V77, BASE, "日经平均股价"),

  // ── AI（派生分）───────────────────────────────────────────────────────────
  f("adaptiveScore", "自适应综合评分", "AI", "System", "PRODUCTION", V77, BASE, "5 维按风格再加权的主排序分"),
  f("percentileRank", "市场分位", "AI", "System", "PRODUCTION", V77, BASE, "全市场百分位（1=最优）"),
  f("recommendationV2", "推荐评级", "AI", "System", "PRODUCTION", V77, BASE, "STRONG_BUY/BUY/HOLD/WATCH/AVOID"),
  f("opportunityScore", "机会评分", "AI", "System", "PRODUCTION", V77, BASE, "机会强度评分"),
  f("stockStyle", "股票风格", "AI", "System", "PRODUCTION", V77, BASE, "6 类风格自动分类"),
  f("ruleConfidence", "规则置信度", "AI", "System", "PRODUCTION", V77, BASE, "决策置信度（安全铁律用）"),
  f("highRiskFlag", "高风险标记", "AI", "System", "PRODUCTION", V77, BASE, "极端波动/风险覆盖标记"),
  f("gptScore", "GPT 评分叠加", "AI", "OpenAI", "PRODUCTION", "rerank-v9", "2026-06-21", "Top500 GPT 评分叠加"),
  f("gptRank", "GPT 重排名次", "AI", "OpenAI", "PRODUCTION", "rerank-v9", "2026-06-21", "GPT rerank 后的名次"),
  f("adaptiveScoreV3", "V3 动态评分(影子)", "AI", "System", "SHADOW", SHADOW_V3, "2026-07-02", "动态权重+风险层+市场门控（影子）"),
  f("alphaScore", "Alpha 因子评分(影子)", "AI", "System", "SHADOW", ALPHA, "2026-07-02", "Alpha 因子截面 z-score 合成（影子）"),
];
