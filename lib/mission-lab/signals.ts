// ── P18 · AI Mission Lab · 只读信号源（M1）─────────────────────────────────
// 严格只读复用：StockScore（评分/建议/交易动作/进出场价/风险）· DailyPrice（成交/标记价）
// · GlobalMarket（TOPIX/Nikkei 基准）· 新闻影响取 StockScore.newsSentimentScore。
// 绝不修改评分/Decision Engine/Research。
import { prisma } from "../prisma";

export interface SignalSnapshot {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  aiScore: number | null; // adaptiveScore
  recommendation: string | null; // recommendationV2
  percentileRank: number | null;
  tradingAction: string | null; // BUY_NOW|WAIT_PULLBACK|HOLD|TAKE_PROFIT|SELL|AVOID
  actionRiskLevel: string | null; // LOW|MEDIUM|HIGH|EXTREME
  riskOverride: string | null; // NONE|SOFT_BLOCK|HARD_BLOCK
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  latestClose: number | null;
  newsScore: number | null; // 0-15
  catalystScore: number | null;
  overallConfidence: number | null;
  actionReasons: string[];
  actionWarnings: string[];
  computedAt: Date | null;
}

const asStrArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function toSnapshot(r: {
  symbol: string; name: string | null; sector: string | null; industry: string | null;
  adaptiveScore: number | null; recommendationV2: string | null; percentileRank: number | null;
  tradingAction: string | null; actionRiskLevel: string | null; riskOverride: string | null;
  entryLow: number | null; entryHigh: number | null; stopLoss: number | null; target1: number | null; target2: number | null;
  latestClose: number | null; newsSentimentScore: number | null; catalystScore: number | null;
  overallConfidence: number | null; actionReasons: unknown; actionWarnings: unknown; computedAt: Date;
}): SignalSnapshot {
  return {
    symbol: r.symbol, name: r.name, sector: r.sector, industry: r.industry,
    aiScore: r.adaptiveScore, recommendation: r.recommendationV2, percentileRank: r.percentileRank,
    tradingAction: r.tradingAction, actionRiskLevel: r.actionRiskLevel, riskOverride: r.riskOverride,
    entryLow: r.entryLow, entryHigh: r.entryHigh, stopLoss: r.stopLoss, target1: r.target1, target2: r.target2,
    latestClose: r.latestClose, newsScore: r.newsSentimentScore, catalystScore: r.catalystScore,
    overallConfidence: r.overallConfidence, actionReasons: asStrArr(r.actionReasons), actionWarnings: asStrArr(r.actionWarnings),
    computedAt: r.computedAt,
  };
}

const SELECT = {
  symbol: true, name: true, sector: true, industry: true, adaptiveScore: true, recommendationV2: true,
  percentileRank: true, tradingAction: true, actionRiskLevel: true, riskOverride: true, entryLow: true,
  entryHigh: true, stopLoss: true, target1: true, target2: true, latestClose: true, newsSentimentScore: true,
  catalystScore: true, overallConfidence: true, actionReasons: true, actionWarnings: true, computedAt: true,
} as const;

/** 指定 symbols 的信号快照。 */
export async function fetchSignals(symbols: string[]): Promise<Map<string, SignalSnapshot>> {
  if (!symbols.length) return new Map();
  const rows = await prisma.stockScore.findMany({ where: { symbol: { in: symbols } }, select: SELECT });
  return new Map(rows.map((r) => [r.symbol, toSnapshot(r)]));
}

/** 入场候选池：按 recommendationV2 白名单 + 最低分 + 非硬阻断，按 adaptiveScore 降序。 */
export async function fetchCandidates(opts: { recommendations: string[]; minAiScore: number; limit: number }): Promise<SignalSnapshot[]> {
  const rows = await prisma.stockScore.findMany({
    where: {
      recommendationV2: { in: opts.recommendations },
      adaptiveScore: { gte: opts.minAiScore },
      riskOverride: { not: "HARD_BLOCK" },
      latestClose: { gt: 0 },
    },
    orderBy: [{ adaptiveScore: "desc" }, { percentileRank: "asc" }],
    take: opts.limit,
    select: SELECT,
  });
  return rows.map(toSnapshot);
}

const dateAt = (dateStr: string) => new Date(`${dateStr}T00:00:00.000Z`);

// ⚠️ 无未来函数：绝不读取「事后回填」的当日 DailyPrice.open/close 用于成交。
// Phase1(开盘前) 仅用「最近已知收盘价」(上一交易日)做标记；Phase2(开盘后) 用实时行情成交。

/** 最近已知收盘价（上一交易日，开盘前已知）——仅用于 Phase1 标记/参考，不用于成交。 */
export async function fetchLatestCloses(symbols: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!symbols.length) return m;
  for (const symbol of symbols) {
    const row = await prisma.dailyPrice.findFirst({ where: { symbol }, orderBy: { date: "desc" }, select: { close: true, adjClose: true } });
    if (row) m.set(symbol, row.adjClose ?? row.close);
  }
  return m;
}

export interface RealtimeQuote { price: number | null; time: number | null; previousClose: number | null }

/** Phase2 实时行情（Yahoo `regularMarketPrice` + `regularMarketTime` 时间戳）。
 *  time 用于校验报价是否为「开盘后新鲜价」——防陈旧/未来泄漏。若源不可用返回空。 */
export async function fetchRealtimeQuotes(symbols: string[]): Promise<Map<string, RealtimeQuote>> {
  const m = new Map<string, RealtimeQuote>();
  if (!symbols.length) return m;
  const { fetchQuotesBatch } = await import("../yahoo");
  const rows = await fetchQuotesBatch(symbols);
  for (const r of rows) m.set(r.symbol, { price: r.price, time: r.time, previousClose: r.previousClose });
  return m;
}

/** 同期基准累计收益%（TOPIX / Nikkei225），取 ≤ 日期的最近一条。 */
export async function fetchBenchmarkReturn(startDateStr: string, runDateStr: string): Promise<{ topixReturn: number | null; nikkeiReturn: number | null }> {
  const atOrBefore = async (dateStr: string) =>
    prisma.globalMarket.findFirst({ where: { date: { lte: dateAt(dateStr) } }, orderBy: { date: "desc" }, select: { topix: true, nikkei: true } });
  const [s, r] = await Promise.all([atOrBefore(startDateStr), atOrBefore(runDateStr)]);
  const pct = (a: number | null | undefined, b: number | null | undefined) => (a && b && a > 0 ? +(((b / a) - 1) * 100).toFixed(3) : null);
  return { topixReturn: pct(s?.topix, r?.topix), nikkeiReturn: pct(s?.nikkei, r?.nikkei) };
}

/** 行业热度：各 sector 平均 adaptiveScore（0-100，缺失回 null）。 */
export async function fetchSectorHeat(): Promise<Map<string, number>> {
  const rows = await prisma.stockScore.groupBy({ by: ["sector"], _avg: { adaptiveScore: true }, where: { sector: { not: null }, adaptiveScore: { not: null } } });
  const m = new Map<string, number>();
  for (const r of rows) if (r.sector && r._avg.adaptiveScore != null) m.set(r.sector, +r._avg.adaptiveScore.toFixed(1));
  return m;
}
