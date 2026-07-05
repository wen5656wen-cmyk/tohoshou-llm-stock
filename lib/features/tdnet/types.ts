// ── TOHOSHOU AI · TDnet Event Feature 类型（P6-T2）──────────────────────────
// TDnet 公告事件因子的类型定义。**全部为 SHADOW，不进入 Production 评分、不影响
// Adaptive/Recommendation/Explain/Learning；纯派生只读，本阶段不持久化、不接入任何评分。**

/** 第一批 6 个 TDnet 事件类型。 */
export type TdnetEventType =
  | "BUYBACK"                     // 自己株式取得（股票回购）
  | "DIVIDEND_INCREASE"          // 増配・復配（提高/恢复分红）
  | "EARNINGS_UP_REVISION"       // 業績予想上方修正（业绩预期上修）
  | "EARNINGS_DOWN_REVISION"     // 業績予想下方修正（业绩预期下修）
  | "STOCK_SPLIT"                // 株式分割（股票拆分）
  | "TREASURY_SHARE_CANCELLATION"; // 自己株式消却（注销库存股）

export const TDNET_EVENT_TYPES: TdnetEventType[] = [
  "BUYBACK", "DIVIDEND_INCREASE", "EARNINGS_UP_REVISION",
  "EARNINGS_DOWN_REVISION", "STOCK_SPLIT", "TREASURY_SHARE_CANCELLATION",
];

/** 事件类型 → Feature Registry 中的 feature id（一一对应，便于追溯）。 */
export const TDNET_EVENT_FEATURE_ID: Record<TdnetEventType, string> = {
  BUYBACK: "tdnet_buyback",
  DIVIDEND_INCREASE: "tdnet_dividend_increase",
  EARNINGS_UP_REVISION: "tdnet_earnings_up_revision",
  EARNINGS_DOWN_REVISION: "tdnet_earnings_down_revision",
  STOCK_SPLIT: "tdnet_stock_split",
  TREASURY_SHARE_CANCELLATION: "tdnet_treasury_cancellation",
};

/** 事件类型中文标签（展示用）。 */
export const TDNET_EVENT_LABEL: Record<TdnetEventType, string> = {
  BUYBACK: "股票回购",
  DIVIDEND_INCREASE: "提高分红",
  EARNINGS_UP_REVISION: "业绩上修",
  EARNINGS_DOWN_REVISION: "业绩下修",
  STOCK_SPLIT: "股票拆分",
  TREASURY_SHARE_CANCELLATION: "注销库存股",
};

/** 解析输入的最小 Disclosure 形状（与 Prisma 解耦，便于纯函数/测试）。 */
export interface DisclosureLike {
  symbol: string;
  title: string;
  publishedAt: Date | string;
  summary?: string | null;
}

/** 单条公告命中的一个事件。 */
export interface TdnetEventMatch {
  symbol: string;
  type: TdnetEventType;
  title: string;
  publishedAt: string; // ISO
}

/** 某标的某事件类型在窗口内的聚合（影子特征值，本阶段不落库）。 */
export interface TdnetEventStat {
  type: TdnetEventType;
  count: number;                // 窗口内出现次数
  lastEventAt: string | null;   // 最近一次 ISO
  daysSinceLast: number | null; // 距今天数
  hasRecent: boolean;           // 是否在 recentDays 内
}

/** 某标的的 TDnet 事件因子集合（影子）。 */
export interface TdnetSymbolFeatures {
  symbol: string;
  windowDays: number;
  recentDays: number;
  asOf: string;
  events: Record<TdnetEventType, TdnetEventStat>;
  totalEvents: number;
}
