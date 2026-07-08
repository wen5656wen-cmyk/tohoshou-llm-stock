// ── TOHOSHOU AI · AI Top Picks Quality Gates（V1.1 · Experimental）──────────
// Top5 最终输出前的质量过滤：Gate1 News（重大利空 Reject）/ Gate2 Liquidity（低流动性
// Reject）/ Gate3 Momentum（20日涨幅过大 → 扣分 penalty，非 Reject）。
// **纯函数 · 只读 · 配置化门槛 · 不影响任何生产推荐逻辑。**

/** 门槛配置（可调）。 */
export const TOP_PICK_GATES = {
  liquidityMinYen: 5e8,       // Gate2：20日均成交额 ≥ 5 亿日元
  momentumThresholdPct: 40,   // Gate3：20日涨幅 > 40% → 惩罚
  momentumPenalty: 10,        // Gate3：composite 扣 10 分
  newsLookbackDays: 5,        // Gate1：覆盖最近 ~3 交易日的自然日窗口
} as const;

export type RejectReason = "NEWS_NEGATIVE" | "LOW_LIQUIDITY";

/** 高影响利空信号（由 Disclosure 结构化事件派生，仅高影响，普通新闻不计）。 */
export interface NegativeNews {
  category: string; // FORECAST_REVISION | EQUITY | MATERIAL | …
  title: string;
  publishedAt: string;
}

/** 单只候选的门控输入（从 DB 只读注入）。 */
export interface GateSignals {
  turnover: number | null;        // AlphaFactor.averageTurnover20（日元）
  momentum20d: number | null;     // StockScore.return20d（%）
  negativeNews: NegativeNews | null; // 高影响利空（无 → null）
}

/** 门控结论。 */
export interface GateOutcome {
  rejected: boolean;
  reason: RejectReason | null;
  detail: string | null;
  momentumPenalty: number;   // 0 或配置惩罚
  momentumFlag: boolean;
  turnover: number | null;
  momentum20d: number | null;
  negativeNews: NegativeNews | null;
}

/**
 * 评估三道门。顺序：News Reject → Liquidity Reject →（存活）Momentum Penalty。
 * @param sig 门控输入信号
 * @param cfg 门槛配置（默认 TOP_PICK_GATES）
 */
export function evaluateGates(sig: GateSignals, cfg: typeof TOP_PICK_GATES = TOP_PICK_GATES): GateOutcome {
  const base = { turnover: sig.turnover, momentum20d: sig.momentum20d, negativeNews: sig.negativeNews };

  // Gate1 News：重大利空 → Reject
  if (sig.negativeNews) {
    return { ...base, rejected: true, reason: "NEWS_NEGATIVE", detail: `${sig.negativeNews.category}：${sig.negativeNews.title}`, momentumPenalty: 0, momentumFlag: false };
  }
  // Gate2 Liquidity：20日均成交额 < 门槛 → Reject（仅当有该数据）
  if (sig.turnover != null && sig.turnover < cfg.liquidityMinYen) {
    return { ...base, rejected: true, reason: "LOW_LIQUIDITY", detail: `20日均成交额 ${(sig.turnover / 1e8).toFixed(2)}亿 < ${(cfg.liquidityMinYen / 1e8).toFixed(0)}亿`, momentumPenalty: 0, momentumFlag: false };
  }
  // Gate3 Momentum：20日涨幅 > 门槛 → 惩罚（非 Reject）
  const momentumFlag = sig.momentum20d != null && sig.momentum20d > cfg.momentumThresholdPct;
  return { ...base, rejected: false, reason: null, detail: null, momentumPenalty: momentumFlag ? cfg.momentumPenalty : 0, momentumFlag };
}
