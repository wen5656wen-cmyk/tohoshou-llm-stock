// ── P18-M1.1 · AI Mission Lab · 实时行情只读聚合（展示层）────────────────────
// 交易时段前端每 30 秒轮询本路由，用于刷新「行情/NAV/KPI/持仓」的展示值。
//
// ⚠️ 边界（严格只读，零写入）：
//   · 只 SELECT ai_mission_*（mission/position/nav）+ GlobalMarket（基准基线），绝不 INSERT/UPDATE。
//   · 不改 Mission Engine / Decision Engine / Strategy / Trade / Position / Cash / NAV 计算逻辑；
//     本路由返回的 equity/returnPct/alpha 为「按实时价重算的展示投影」，永不落库（落库仍由
//     lib/mission-lab/engine.ts 的 markAndSnapshot 在收盘链路完成）。
//   · 成本价 / 成交价 / 成交时间 / signalTime / Explain / 建议成交区间 一律不在此路由返回，
//     历史数据只由 /api/mission-lab 提供，永不被行情刷新覆盖。
//   · 数据源仅 Yahoo Finance（复用既有 lib/yahoo.ts fetchQuotesBatch，单次批量请求，不新增数据源）。
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuotesBatch } from "@/lib/yahoo";
import { getJPXTradingDayStatus } from "@/lib/trading-calendar/jpx";

export const dynamic = "force-dynamic";

// 基准 symbol 与 scripts/fetch-global-market.ts 完全一致（量纲可比）：
// GlobalMarket.topix = 1306.T（野村 TOPIX ETF）· GlobalMarket.nikkei = ^N225
const TOPIX_SYMBOL = "1306.T";
const NIKKEI_SYMBOL = "^N225";
const POLL_MS = 30_000;
// ⚠️ Yahoo 免费源对日股报价固有约 15–20 分钟延迟（M1 引擎把 Phase2 成交定在 09:30 即因此）。
// 故「90 秒未更新告警」按真实语义落在**我方刷新时效**（前端记录上次成功刷新时间），
// 而 quoteAgeSec 如实回传 Yahoo 报价戳年龄，由前端标注「延迟 N 分」，绝不伪装成 tick 级实时。

type Session = "PRE" | "MORNING" | "LUNCH" | "AFTERNOON" | "CLOSED" | "HOLIDAY";
type Quote = { price: number | null; previousClose: number | null; time: number | null };

// 进程内 15 秒缓存：多个页面/标签同时 30 秒轮询时不重复打 Yahoo（TTL < 轮询间隔，不影响新鲜度）。
const QUOTE_TTL_MS = 15_000;
let quoteCache: { key: string; at: number; data: Map<string, Quote> } | null = null;

async function getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const key = symbols.join(",");
  const now = Date.now();
  if (quoteCache && quoteCache.key === key && now - quoteCache.at < QUOTE_TTL_MS) return quoteCache.data;
  const data = new Map<string, Quote>();
  for (const q of await fetchQuotesBatch(symbols)) data.set(q.symbol, { price: q.price, previousClose: q.previousClose, time: q.time });
  if (data.size) quoteCache = { key, at: now, data }; // 空结果不缓存，下一轮立即重试
  return data;
}

/** JST 当日分钟数（00:00 起）——不依赖服务器时区。 */
function jstMinutes(now: Date): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const [h, m] = p.split(":").map(Number);
  return h * 60 + m;
}

/** JPX 交易时段：09:00–11:30 / 12:30–15:30 JST。 */
function sessionOf(now: Date): { session: Session; marketOpen: boolean; tradingDay: boolean; dateIso: string } {
  const st = getJPXTradingDayStatus(now);
  if (!st.isTradingDay) return { session: "HOLIDAY", marketOpen: false, tradingDay: false, dateIso: st.date };
  const t = jstMinutes(now);
  if (t < 9 * 60) return { session: "PRE", marketOpen: false, tradingDay: true, dateIso: st.date };
  if (t < 11 * 60 + 30) return { session: "MORNING", marketOpen: true, tradingDay: true, dateIso: st.date };
  if (t < 12 * 60 + 30) return { session: "LUNCH", marketOpen: false, tradingDay: true, dateIso: st.date };
  if (t <= 15 * 60 + 30) return { session: "AFTERNOON", marketOpen: true, tradingDay: true, dateIso: st.date };
  return { session: "CLOSED", marketOpen: false, tradingDay: true, dateIso: st.date };
}

const r2 = (v: number) => +v.toFixed(2);
const r3 = (v: number) => +v.toFixed(3);

export async function GET() {
  const now = new Date();
  const ses = sessionOf(now);
  // 当日 09:00 JST = 当日 00:00 UTC（与 engine.openTime 同口径），用于判断报价是否为开盘后新鲜价。
  const todayOpenMs = new Date(`${ses.dateIso}T00:00:00.000Z`).getTime();

  try {
    const rows = await prisma.aiMission.findMany({
      where: { status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: [{ missionType: "asc" }, { startDate: "desc" }],
      select: { id: true, missionType: true, startDate: true, initialCapital: true, cashJpy: true, equityJpy: true, realizedPnl: true },
    });
    const byType = new Map<string, (typeof rows)[number]>();
    for (const m of rows) if (!byType.has(m.missionType)) byType.set(m.missionType, m);
    const missions = [...byType.values()];

    const positionsAll = missions.length
      ? await prisma.aiMissionPosition.findMany({
          where: { missionId: { in: missions.map((m) => m.id) }, status: "OPEN" },
          select: { missionId: true, symbol: true, qty: true, avgCost: true, lastPrice: true, marketValue: true, unrealizedPnl: true, unrealizedPct: true },
        })
      : [];

    // ── Yahoo：持仓 + 两个基准，单次批量请求 ──
    const symbols = [...new Set(positionsAll.map((p) => p.symbol))];
    let quotes = new Map<string, Quote>();
    let quoteError: string | null = null;
    try {
      quotes = await getQuotes([...symbols, TOPIX_SYMBOL, NIKKEI_SYMBOL]);
    } catch (e) {
      quoteError = (e as Error).message; // 容错：保留 DB 上一笔标记值，前端显示重试提示
    }

    const liveOf = (sym: string) => {
      const q = quotes.get(sym);
      if (!q || q.price == null || q.price <= 0) return null;
      // 交易日：报价须为当日开盘后；非交易日/盘前：接受最近一次收盘报价（展示用，不参与成交）
      if (ses.tradingDay && ses.session !== "PRE" && (q.time == null || q.time < todayOpenMs)) return null;
      return q;
    };

    // ── 基准（TOPIX / Nikkei225）实时点位与今日涨跌 ──
    const benchLive = (sym: string) => {
      const q = liveOf(sym) ?? quotes.get(sym) ?? null;
      if (!q || q.price == null) return null;
      const chg = q.previousClose && q.previousClose > 0 ? r3((q.price / q.previousClose - 1) * 100) : null;
      return { level: q.price, changePct: chg, at: q.time ? new Date(q.time).toISOString() : null, live: liveOf(sym) != null };
    };
    const topixQ = benchLive(TOPIX_SYMBOL);
    const nikkeiQ = benchLive(NIKKEI_SYMBOL);

    // 最新报价时间（判断是否 >90s 未更新）
    const times = [...quotes.values()].map((q) => q.time).filter((t): t is number => t != null);
    const marketPriceAtMs = times.length ? Math.max(...times) : null;
    const quoteAgeSec = marketPriceAtMs != null ? Math.max(0, Math.round((now.getTime() - marketPriceAtMs) / 1000)) : null;

    const views = [];
    for (const m of missions) {
      const positions = positionsAll.filter((p) => p.missionId === m.id);

      // 今日基线：上一交易日 NAV（与 engine.dailyReturnPct 同口径）；首日无 NAV → 初始资金
      const prevNav = await prisma.aiMissionNav.findFirst({
        where: { missionId: m.id, date: { lt: new Date(`${ses.dateIso}T00:00:00.000Z`) } },
        orderBy: { date: "desc" },
        select: { equityJpy: true, date: true },
      });
      const lastNav = await prisma.aiMissionNav.findFirst({
        where: { missionId: m.id },
        orderBy: { date: "desc" },
        select: { topixReturn: true, nikkeiReturn: true, drawdownPct: true },
      });

      let quoted = 0;
      const pv = positions.map((p) => {
        const q = liveOf(p.symbol);
        const price = q?.price ?? null;
        if (price != null) quoted++;
        const usePrice = price ?? p.lastPrice ?? p.avgCost; // 容错：无报价保留上一笔标记价
        const prevClose = q?.previousClose ?? null;
        return {
          symbol: p.symbol,
          status: price != null ? ("LIVE" as const) : ("STALE" as const), // STALE = 停牌/无报价 → 前端灰色
          lastPrice: r2(usePrice),
          previousClose: prevClose,
          todayChange: price != null && prevClose ? r2(price - prevClose) : null,
          todayChangePct: price != null && prevClose && prevClose > 0 ? r2((price / prevClose - 1) * 100) : null,
          marketValue: r2(p.qty * usePrice),
          unrealizedPnl: r2((usePrice - p.avgCost) * p.qty),
          unrealizedPct: r2((usePrice / p.avgCost - 1) * 100),
          quoteAt: q?.time ? new Date(q.time).toISOString() : null,
        };
      });

      // ── 展示层 NAV 投影（与 engine.markAndSnapshot 同公式，但绝不落库）──
      const positionsValue = r2(pv.reduce((s, p) => s + p.marketValue, 0));
      const equityJpy = r2(m.cashJpy + positionsValue);
      const returnPct = r3((equityJpy / m.initialCapital - 1) * 100);
      const baseline = prevNav?.equityJpy ?? m.initialCapital;
      const todayPnl = r2(equityJpy - baseline);
      const todayPct = baseline > 0 ? r3((equityJpy / baseline - 1) * 100) : 0;

      // 同期基准累计收益：优先「实时点位 / 起始日 GlobalMarket 点位」，缺实时则回落最近 NAV 快照值
      const startIso = m.startDate.toISOString().slice(0, 10);
      const startRow = await prisma.globalMarket.findFirst({
        where: { date: { lte: new Date(`${startIso}T00:00:00.000Z`) } },
        orderBy: { date: "desc" },
        select: { topix: true, nikkei: true },
      });
      const cum = (base: number | null | undefined, live: number | null | undefined, fallback: number | null) =>
        base && live && base > 0 ? r3((live / base - 1) * 100) : fallback;
      const topixCumPct = cum(startRow?.topix, topixQ?.level, lastNav?.topixReturn ?? null);
      const nikkeiCumPct = cum(startRow?.nikkei, nikkeiQ?.level, lastNav?.nikkeiReturn ?? null);
      const alpha = topixCumPct != null ? r3(returnPct - topixCumPct) : null;

      views.push({
        id: m.id,
        missionType: m.missionType,
        live: {
          equityJpy, positionsValue, cashJpy: r2(m.cashJpy), realizedPnl: r2(m.realizedPnl),
          returnPct, todayPnl, todayPct, todayBaseline: prevNav ? "PREV_NAV" : "INITIAL",
          alpha, topixCumPct, nikkeiCumPct,
          positionCount: positions.length, quotedCount: quoted,
        },
        positions: pv,
      });
    }

    return NextResponse.json({
      asOf: now.toISOString(),
      session: ses.session,
      marketOpen: ses.marketOpen,
      tradingDay: ses.tradingDay,
      dateIso: ses.dateIso,
      pollMs: POLL_MS,
      priceSource: "Yahoo Finance",
      marketPriceAt: marketPriceAtMs != null ? new Date(marketPriceAtMs).toISOString() : null,
      quoteAgeSec,
      noQuote: ses.marketOpen && quoteAgeSec == null, // 交易时段完全取不到报价
      quoteError,
      benchmarks: { topix: topixQ, nikkei: nikkeiQ },
      missions: views,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, missions: [], asOf: now.toISOString(), marketOpen: ses.marketOpen, tradingDay: ses.tradingDay, pollMs: POLL_MS }, { status: 500 });
  }
}
