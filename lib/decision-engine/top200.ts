// ── Decision Engine · Runtime Top200 盘中重排（P15-01D）───────────────────────
// 纯排序，非重新评分：adaptiveScore(StockScore SSOT) 保持不变，仅在其上叠加「实时价/量、
// 买点距离、市场状态、新闻风险、持仓状态、流动性」的运行时调整分 → 运行时排序 → Top10-12。
// 状态（previousRank/enterTime/换手）由调用方以内存持有并回传（不落库）。相对 import。

export interface StockScoreCandidate {
  symbol: string;
  name: string | null;
  sector: string | null;
  adaptiveScore: number | null;
  marketRank: number | null;
  latestClose: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  target1: number | null;
  target2: number | null;
  stopLoss: number | null;
  tradingAction: string | null;
  actionRiskLevel: string | null;
  newsSentimentScore: number | null;
}

export interface RuntimeQuote {
  price: number | null;
  changePct: number | null;
  volumeRatio: number | null;
  time: number | null;
  realtime: boolean;
}

export interface RuntimeContext {
  regime: string | null;
  heldSet: Set<string>;      // 当前持仓 symbol
  negNewsSet: Set<string>;   // 近期高影响利空 symbol
}

// ── 运行时调整权重（集中常量；调排序不改评分）──
const W = {
  zoneIn: 6, chase: -6,
  volHi: 4, vol: 2, volLow: -1.5,
  momCap: 2, overext: -3,
  bear: -5, bull: 1,
  news: -8,
  extreme: -8, high: -2,
  held: -2,
  illiq: -1.5,
};
// 防抖：现任加权（挑战者需超出现任 > STICKY 才替换）+ 硬退出绕过（破位/利空）。
const STICKY = 2.5;
const TOPK = 12;

export interface RuntimeCand {
  symbol: string; name: string; sector: string | null;
  price: number | null; changePct: number | null; volumeRatio: number | null;
  aiScore: number | null;             // = adaptiveScore（原样透传，不改）
  runtimeScore: number;               // 运行时排序分（临时，不落库、不写回 StockScore）
  entryLow: number | null; entryHigh: number | null; target1: number | null; target2: number | null; stopLoss: number | null;
  action: string | null; riskLevel: string | null; newsSentiment: number | null;
  inBuyZone: boolean; breakout: boolean; hardExit: boolean; negNews: boolean;
  baseRank: number;
}

/** 由 StockScore + 实时行情构建运行时候选（含运行时排序分与信号旗标）。 */
export function buildRuntimeCandidate(row: StockScoreCandidate, q: RuntimeQuote | undefined, ctx: RuntimeContext, idx: number): RuntimeCand {
  const price = q?.price ?? row.latestClose ?? null;
  const changePct = q?.changePct ?? null;
  const volumeRatio = q?.volumeRatio ?? null;
  const inBuyZone = price != null && row.entryLow != null && row.entryHigh != null && price >= row.entryLow && price <= row.entryHigh;
  const breakout = price != null && row.entryHigh != null && price > row.entryHigh;
  const negNews = ctx.negNewsSet.has(row.symbol);
  const risk = row.actionRiskLevel;

  let s = row.adaptiveScore ?? 50;
  if (inBuyZone) s += W.zoneIn; else if (breakout) s += W.chase;
  if (volumeRatio != null) { if (volumeRatio >= 2) s += W.volHi; else if (volumeRatio >= 1.5) s += W.vol; else if (volumeRatio < 0.3) s += W.volLow; }
  if (changePct != null) { if (changePct > 7) s += W.overext; else if (changePct > 0) s += Math.min(changePct * 0.3, W.momCap); }
  if (ctx.regime === "BEAR") s += W.bear; else if (ctx.regime === "BULL") s += W.bull;
  if (negNews) s += W.news;
  if (risk === "EXTREME") s += W.extreme; else if (risk === "HIGH") s += W.high;
  if (ctx.heldSet.has(row.symbol)) s += W.held;
  if (volumeRatio != null && volumeRatio < 0.2) s += W.illiq;

  const hardExit = (price != null && row.stopLoss != null && price <= row.stopLoss) || negNews;

  return {
    symbol: row.symbol, name: row.name ?? row.symbol, sector: row.sector,
    price, changePct, volumeRatio,
    aiScore: row.adaptiveScore,
    runtimeScore: Math.round(s * 100) / 100,
    entryLow: row.entryLow, entryHigh: row.entryHigh, target1: row.target1, target2: row.target2, stopLoss: row.stopLoss,
    action: row.tradingAction, riskLevel: risk, newsSentiment: row.newsSentimentScore,
    inBuyZone, breakout, hardExit, negNews, baseRank: row.marketRank ?? idx + 1,
  };
}

// ── 运行时排名状态（内存）──
export interface RuntimeState {
  dateKey: string;
  rankMap: Map<string, { rank: number; enterTime: number }>; // 上轮展示集
  top10Ever: Set<string>;   // 今日曾进入 Top10 的 symbol
  replaceCount: number;     // 今日 Top10 累计替换事件数
}
export function emptyRuntimeState(dateKey: string): RuntimeState {
  return { dateKey, rankMap: new Map(), top10Ever: new Set(), replaceCount: 0 };
}

export interface RuntimeRankedRow extends RuntimeCand {
  rank: number;                    // = runtimeRank（供 deriveStockDecision 用）
  runtimeRank: number;
  previousRank: number | null;
  rankChange: number | null;       // + = 上升
  replaceReasonKey: string | null;
  enterTime: string;               // ISO
  isNew: boolean;
  reason: string | null;
}
export interface RuntimeLeaver { symbol: string; leaveTime: string; reasonKey: string; }
export interface RuntimeRerankResult {
  ranked: RuntimeRankedRow[];
  leavers: RuntimeLeaver[];
  state: RuntimeState;
  turnover: { replacedToday: number; distinctToday: number; churnPct: number };
}

function enterReasonKey(c: RuntimeCand): string {
  if (c.inBuyZone) return "dv.rt.enter.inZone";
  if (c.volumeRatio != null && c.volumeRatio >= 1.5) return "dv.rt.enter.volume";
  if ((c.changePct ?? 0) > 0) return "dv.rt.enter.momentum";
  return "dv.rt.enter.rank";
}
function leaveReasonKey(c: RuntimeCand | undefined): string {
  if (!c) return "dv.rt.leave.displaced";
  if (c.price != null && c.stopLoss != null && c.price <= c.stopLoss) return "dv.rt.leave.stop";
  if (c.negNews) return "dv.rt.leave.news";
  if (c.breakout) return "dv.rt.leave.chase";
  return "dv.rt.leave.displaced";
}

/**
 * 运行时重排：现任加权(STICKY)防抖 + 硬退出绕过；产出 Top-K 行（含 previousRank/rankChange/
 * replaceReason/enterTime）与 leavers、换手统计。纯函数：prev 传入、新 state 返回。
 */
export function runtimeRerank(cands: RuntimeCand[], prev: RuntimeState, now: number, dateKey: string): RuntimeRerankResult {
  const state = prev.dateKey === dateKey ? prev : emptyRuntimeState(dateKey);
  const prevMap = state.rankMap;
  const candMap = new Map(cands.map((c) => [c.symbol, c]));

  // 有效排序分 = 运行时分 + 现任加权（硬退出者剔除加权并重罚，确保被替换）
  const scored = cands.map((c) => {
    const incumbent = prevMap.has(c.symbol);
    const eff = c.runtimeScore + (incumbent && !c.hardExit ? STICKY : 0) + (c.hardExit ? -999 : 0);
    return { c, eff };
  });
  scored.sort((a, b) => b.eff - a.eff || a.c.baseRank - b.c.baseRank);
  const top = scored.slice(0, TOPK).map((x) => x.c);

  const newMap = new Map<string, { rank: number; enterTime: number }>();
  const ranked: RuntimeRankedRow[] = top.map((c, i) => {
    const rr = i + 1;
    const prevEntry = prevMap.get(c.symbol);
    const previousRank = prevEntry?.rank ?? null;
    const rankChange = previousRank != null ? previousRank - rr : null;
    const enterTime = prevEntry?.enterTime ?? now;
    const isNew = previousRank == null;
    const reason = isNew ? enterReasonKey(c) : (rankChange != null && rankChange >= 2 ? enterReasonKey(c) : null);
    newMap.set(c.symbol, { rank: rr, enterTime });
    return {
      ...c, rank: rr, runtimeRank: rr, previousRank, rankChange,
      replaceReasonKey: reason, enterTime: new Date(enterTime).toISOString(), isNew, reason,
    };
  });

  // 离开 Top10 的（上轮 rank≤10 且本轮不在 Top10）
  const newTop10 = new Set(ranked.filter((r) => r.runtimeRank <= 10).map((r) => r.symbol));
  const prevTop10 = [...prevMap.entries()].filter(([, v]) => v.rank <= 10).map(([s]) => s);
  const leavers: RuntimeLeaver[] = prevTop10.filter((s) => !newTop10.has(s))
    .map((s) => ({ symbol: s, leaveTime: new Date(now).toISOString(), reasonKey: leaveReasonKey(candMap.get(s)) }));

  // 换手统计：本轮进入 Top10 但上轮不在 Top10 的数量累加。
  // 首次填充（上轮 Top10 为空）= 初始建仓，不计入换手。
  const prevTop10Set = new Set(prevTop10);
  const entrants = prevTop10Set.size === 0 ? [] : [...newTop10].filter((s) => !prevTop10Set.has(s));
  const replaceCount = state.replaceCount + entrants.length;
  const top10Ever = new Set(state.top10Ever);
  newTop10.forEach((s) => top10Ever.add(s));

  return {
    ranked, leavers,
    state: { dateKey, rankMap: newMap, top10Ever, replaceCount },
    turnover: { replacedToday: replaceCount, distinctToday: top10Ever.size, churnPct: Math.round((replaceCount / 10) * 1000) / 10 },
  };
}
