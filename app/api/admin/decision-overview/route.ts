import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchRichQuotes, type RichQuote } from "@/lib/closing-decision/realtime";
import { isJPXTradingDay } from "@/lib/trading-calendar/jpx";
import {
  marketPhase8, jstDateStr, computeFreshness, deriveStockDecision, groupPicks,
  deriveHoldingActions, deriveGlobalDecision,
  buildRuntimeCandidate, runtimeRerank, emptyRuntimeState,
  type Quote, type PaperPositionInput, type RuntimeState, type StockScoreCandidate,
} from "@/lib/decision-engine";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */ // prisma-as-any + JSON 只读聚合

// ── GET /api/admin/decision-overview（P15-01B + P15-01D Runtime Top200）──────────
// 组合层：Top200 候选母池 = StockScore(SSOT，按 adaptiveScore) → 盘中运行时重排(仅对池头
// RUNTIME_POOL 只补实时价/量，非全市场扫描) → Top10-12 实时变化 → lib/decision-engine 派生决策。
// **纯排序**：adaptiveScore/StockScore 只读不改；不重算评分、不调 GPT、不写库、不改 ClosingDecision。
// 运行时排名状态(previousRank/enterTime/换手) 内存持有；15s payload 缓存保 API<500ms、页面<2s。

const RUNTIME_POOL = 50;   // 仅对 Top50 头部补实时并重排（Top10-12 由此产生）——最小实时
const RT_TTL_MS = 15000;   // payload 缓存 TTL

// 模块级内存状态（单进程 pm2 fork 内跨请求持久；重启即重置，符合「内存即可、不落库」）
let RT_STATE: RuntimeState = emptyRuntimeState("");
let RT_CACHE: { at: number; body: any } | null = null;

function withTimeout<T>(pr: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([pr, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}
function riskFromVol(vol: number | null): "LOW" | "MEDIUM" | "HIGH" | null {
  if (vol == null) return null;
  return vol < 20 ? "LOW" : vol <= 25 ? "MEDIUM" : "HIGH";
}
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
function richToQuote(r: RichQuote | undefined): Quote | undefined {
  return r ? { symbol: r.symbol, price: r.price, previousClose: r.previousClose, time: r.time } : undefined;
}

export async function GET(req: Request) {
  const p = prisma as any;
  const now = new Date();
  const nowMs = now.getTime();
  const phase = marketPhase8(now);
  const tradingDay = isJPXTradingDay(now);
  const url = new URL(req.url);
  const dateArg = url.searchParams.get("date");
  const debug = url.searchParams.get("debug") === "1"; // 只读观测(P15-01D-V)：附加 runtimeScore 等,零决策行为改变
  const runtimeMode = !dateArg;

  // payload 缓存（仅 runtime 最新态；debug 强制重算以取实时快照，不读也不写缓存）
  if (runtimeMode && !debug && RT_CACHE && nowMs - RT_CACHE.at < RT_TTL_MS) {
    const res = NextResponse.json({ ...RT_CACHE.body, cached: true });
    res.headers.set("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
    return res;
  }

  try {
    const [closing, regime, gm, scoreMeta, account] = await Promise.all([
      dateArg
        ? p.closingDecision.findUnique({ where: { date: new Date(`${dateArg}T00:00:00.000Z`) } })
        : p.closingDecision.findFirst({ orderBy: { date: "desc" } }),
      p.marketRegime.findFirst({ orderBy: { date: "desc" } }),
      p.globalMarket.findFirst({ orderBy: { date: "desc" } }),
      p.stockScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
      p.paperAccount.findFirst({ orderBy: { id: "asc" } }),
    ]);
    const regimeName: string | null = regime?.regime ?? closing?.regime ?? null;
    const volatility: number | null = regime?.volatility ?? closing?.volatility ?? null;
    const riskLevel = riskFromVol(volatility);

    // ── 持仓（PaperBroker OPEN）──
    const openPositions: any[] = account
      ? await p.paperPosition.findMany({ where: { accountId: account.id, status: "OPEN" }, orderBy: { entryDate: "desc" } })
      : [];
    const holdSyms = [...new Set<string>(openPositions.map((x) => x.symbol))];

    // ── 候选母池 ──
    let poolRows: any[] = [];
    if (runtimeMode) {
      // Top200 母池 = StockScore adaptiveScore 序；仅取头部 RUNTIME_POOL 做实时重排。
      poolRows = await p.stockScore.findMany({
        where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } },
        orderBy: { adaptiveScore: "desc" }, take: RUNTIME_POOL,
        select: { symbol: true, name: true, nameZh: true, sector: true, adaptiveScore: true, marketRank: true, latestClose: true, entryLow: true, entryHigh: true, target1: true, target2: true, stopLoss: true, tradingAction: true, actionRiskLevel: true, newsSentimentScore: true },
      });
    }
    const poolSyms = poolRows.map((r) => r.symbol);

    // ── 实时补价（仅候选池头 + 持仓；分批单请求；1.3s 超时回退 EOD）──
    const rtSyms = [...new Set<string>([...poolSyms, ...holdSyms])];
    const richMap: Map<string, RichQuote> = rtSyms.length
      ? await withTimeout(fetchRichQuotes(rtSyms), 1000, new Map())
      : new Map();

    // ── 近期利空集合（News Risk 输入；单查询）──
    const negNewsSet = new Set<string>();
    if (poolSyms.length) {
      const negs: any[] = await p.disclosure.findMany({
        where: { symbol: { in: poolSyms }, sentiment: "NEGATIVE", publishedAt: { gte: new Date(nowMs - 3 * 86_400_000) } },
        select: { symbol: true },
      });
      negs.forEach((d) => negNewsSet.add(d.symbol));
    }

    // ── 运行时重排 ──
    const heldSet = new Set(holdSyms);
    const dateKey = jstDateStr(now);
    let ranked: any[] = [];
    let turnover = { replacedToday: 0, distinctToday: 0, churnPct: 0 };
    let leavers: any[] = [];
    let debugStats: any = null;
    if (runtimeMode) {
      const cands = poolRows.map((row: any, i: number) =>
        buildRuntimeCandidate(
          { symbol: row.symbol, name: row.nameZh ?? row.name, sector: row.sector, adaptiveScore: row.adaptiveScore, marketRank: row.marketRank, latestClose: row.latestClose, entryLow: row.entryLow, entryHigh: row.entryHigh, target1: row.target1, target2: row.target2, stopLoss: row.stopLoss, tradingAction: row.tradingAction, actionRiskLevel: row.actionRiskLevel, newsSentimentScore: row.newsSentimentScore } as StockScoreCandidate,
          (() => { const q = richMap.get(row.symbol); return q ? { price: q.price, changePct: q.changePct, volumeRatio: q.volumeRatio, time: q.time, realtime: q.realtime } : undefined; })(),
          { regime: regimeName, heldSet, negNewsSet }, i,
        ),
      );
      const rr = runtimeRerank(cands, RT_STATE, nowMs, dateKey);
      RT_STATE = rr.state; // 推进内存状态
      ranked = rr.ranked; turnover = rr.turnover; leavers = rr.leavers;
      if (debug) {
        // 只读：候选池(50)各运行时调整项触发计数（不改逻辑，仅统计已算出的旗标）
        const vr = (c: any) => c.volumeRatio;
        debugStats = {
          poolSize: cands.length, regime: regimeName,
          inBuyZone: cands.filter((c: any) => c.inBuyZone).length,
          breakout: cands.filter((c: any) => c.breakout).length,
          volGte2: cands.filter((c: any) => vr(c) != null && vr(c) >= 2).length,
          volGte15: cands.filter((c: any) => vr(c) != null && vr(c) >= 1.5 && vr(c) < 2).length,
          volLt03: cands.filter((c: any) => vr(c) != null && vr(c) < 0.3).length,
          volMissing: cands.filter((c: any) => vr(c) == null).length,
          overext7: cands.filter((c: any) => (c.changePct ?? 0) > 7).length,
          negNews: cands.filter((c: any) => c.negNews).length,
          held: cands.filter((c: any) => heldSet.has(c.symbol)).length,
          riskExtreme: cands.filter((c: any) => c.riskLevel === "EXTREME").length,
          riskHigh: cands.filter((c: any) => c.riskLevel === "HIGH").length,
          hardExit: cands.filter((c: any) => c.hardExit).length,
          // 注：BEAR/BULL 为全池统一加分 → 对相对排序无影响（仅移动绝对 runtimeScore）
          regimeUniformShift: regimeName === "BEAR" ? -5 : regimeName === "BULL" ? 1 : 0,
        };
      }
    } else {
      // 历史日期：回退收盘 top10 快照（无运行时重排）
      ranked = (Array.isArray(closing?.top10) ? (closing!.top10 as any[]) : []).map((r) => ({ ...r, runtimeRank: r.rank ?? null, previousRank: null, rankChange: null, replaceReasonKey: null, enterTime: null, isNew: false }));
    }

    // ── 逐股决策（复用 lib/decision-engine）+ 合并运行时元数据 ──
    const decisions = ranked.map((r) => {
      const sd = deriveStockDecision(r, richToQuote(richMap.get(r.symbol)), regimeName);
      sd.runtimeRank = r.runtimeRank ?? r.rank ?? null;
      sd.previousRank = r.previousRank ?? null;
      sd.rankChange = r.rankChange ?? null;
      sd.replaceReasonKey = r.replaceReasonKey ?? null;
      sd.enterTime = r.enterTime ?? null;
      sd.isNew = r.isNew ?? false;
      if (debug) {
        (sd as any)._debug = {
          runtimeScore: r.runtimeScore ?? null,
          runtimeAdjustment: r.runtimeScore != null && r.aiScore != null ? Math.round((r.runtimeScore - r.aiScore) * 100) / 100 : null,
          adaptiveScore: r.aiScore ?? null, baseRank: r.baseRank ?? null,
          volumeRatio: r.volumeRatio ?? null, inBuyZone: r.inBuyZone ?? null, breakout: r.breakout ?? null,
          negNews: r.negNews ?? null, hardExit: r.hardExit ?? null,
        };
      }
      return sd;
    });
    const groups = groupPicks(decisions);

    // ── 新鲜度 + stale ──
    const quotesArr: Quote[] = [...richMap.values()].map((r) => ({ symbol: r.symbol, price: r.price, previousClose: r.previousClose, time: r.time }));
    const holdingsUpdatedAt = openPositions.length
      ? iso(openPositions.reduce((m: Date, x: any) => (x.updatedAt && new Date(x.updatedAt) > m ? new Date(x.updatedAt) : m), new Date(0)))
      : null;
    const freshness = computeFreshness({
      quotes: quotesArr, rankingComputedAt: iso(scoreMeta?.computedAt),
      decisionComputedAt: iso(closing?.computedAt), decidedAtJst: closing?.decidedAtJst ?? null,
      holdingsUpdatedAt, phase, now,
    });

    // ── 持仓动作 ──
    const scoreRows: any[] = holdSyms.length
      ? await p.stockScore.findMany({ where: { symbol: { in: holdSyms } }, select: { symbol: true, name: true, nameZh: true, target1: true, stopLoss: true, actionRiskLevel: true } })
      : [];
    const sMap = new Map<string, any>(scoreRows.map((r) => [r.symbol, r]));
    const paperInputs: PaperPositionInput[] = openPositions.map((pos) => {
      const sc = sMap.get(pos.symbol);
      return { symbol: pos.symbol, name: sc?.nameZh ?? sc?.name ?? pos.symbol, strategyType: pos.strategyType ?? null, entryPrice: pos.entryPrice ?? null, currentPrice: pos.currentPrice ?? null, returnPct: pos.returnPct ?? null, actionRiskLevel: sc?.actionRiskLevel ?? null, target1: sc?.target1 ?? null, stopLoss: sc?.stopLoss ?? null, updatedAt: iso(pos.updatedAt) };
    });
    const quoteMap = new Map<string, Quote>(quotesArr.map((q) => [q.symbol, q]));
    const holdingsActions = deriveHoldingActions(paperInputs, quoteMap);

    // ── 全局决策 ──
    const globalDecision = deriveGlobalDecision({
      verdict: closing?.verdict ?? null, regime: regimeName, riskLevel, phase, tradingDay,
      stale: freshness.stale, executableCount: groups.executeNow.length,
      holdingActions: holdingsActions, portfolioLegWeights: [], confidence: closing?.avgAiScore ?? null,
    });

    // ── 市场依据 + 风险 + 新闻 ──
    const marketContext = {
      regime: regimeName, riskLevel, volatility, trendScore: regime?.trendScore ?? null, breadth: regime?.breadth ?? null,
      nikkei: gm?.nikkei ?? null, nikkeiChange: gm?.nikkeiChange ?? null, topix: gm?.topix ?? null, topixChange: gm?.topixChange ?? null,
      usdjpy: gm?.usdjpy ?? null, vix: gm?.vix ?? null, nasdaq: gm?.nasdaq ?? null, nasdaqChange: gm?.nasdaqChange ?? null,
      asOf: gm?.date ? new Date(gm.date).toISOString().slice(0, 10) : null,
    };
    const negNewsCount = decisions.filter((d) => negNewsSet.has(d.symbol)).length;
    const idxLevel = regimeName === "BEAR" || (gm?.topixChange ?? 0) < -1 ? "HIGH" : (gm?.topixChange ?? 0) < 0 ? "MEDIUM" : "LOW";
    const risks = [
      { key: "dv.ov.rk.index", level: idxLevel },
      { key: "dv.ov.rk.vol", level: riskLevel ?? "—" },
      { key: "dv.ov.rk.news", level: negNewsCount >= 3 ? "HIGH" : negNewsCount > 0 ? "MEDIUM" : "LOW", note: negNewsCount ? String(negNewsCount) : null },
      { key: "dv.ov.rk.data", level: freshness.stale ? "HIGH" : "LOW" },
    ];
    const [newsRows, discRows] = await Promise.all([
      p.news.findMany({ take: 8, orderBy: { publishedAt: "desc" }, select: { id: true, title: true, source: true, publishedAt: true, sentiment: true, stock: { select: { symbol: true } } } }),
      p.disclosure.findMany({ take: 20, orderBy: { publishedAt: "desc" }, select: { id: true, symbol: true, title: true, category: true, sentiment: true, publishedAt: true, stock: { select: { name: true } } } }),
    ]);
    const seen = new Set<string>();
    const news = newsRows.filter((n: any) => { const k = n.title.trim(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 6).map((n: any) => ({ id: String(n.id), title: n.title, publishedAt: iso(n.publishedAt), symbol: n.stock?.symbol ?? null, sentiment: n.sentiment, source: n.source }));
    const catalysts = discRows.filter((d: any) => nowMs - new Date(d.publishedAt).getTime() < 2 * 86_400_000)
      .slice(0, 6).map((d: any) => ({ id: String(d.id), category: d.category ?? "OTHER", target: d.stock?.name ?? d.symbol, publishedAt: iso(d.publishedAt), sentiment: d.sentiment }));

    const universe = await p.stockScore.count({ where: { priceCount: { gte: 20 } } });
    const shown = groups.executeNow.length + groups.waitList.length + groups.backups.length;

    // names 映射（symbol → 日文原名 name + 中文 nameZh），供前端按 locale 解析候选名称（避免日文用户看到中译名）。
    const shownSyms = Array.from(new Set([...groups.executeNow, ...groups.waitList, ...groups.backups].map((c: any) => c.symbol)));
    const nameRows = shownSyms.length
      ? await p.stockScore.findMany({ where: { symbol: { in: shownSyms } }, select: { symbol: true, name: true, nameZh: true } })
      : [];
    const names: Record<string, { name: string | null; nameZh: string | null }> = {};
    for (const r of nameRows) names[r.symbol] = { name: r.name ?? null, nameZh: r.nameZh ?? null };

    const body: any = {
      ok: true, empty: !closing || closing.empty === true,
      asOfDate: closing?.date ? new Date(closing.date).toISOString().slice(0, 10) : null,
      marketPhase: phase, tradingDay, nextTradingDay: tradingDay ? null : freshness.nextDecisionAt,
      globalDecision, holdingsActions, executeNow: groups.executeNow, waitList: groups.waitList, backups: groups.backups, names,
      marketContext, risks, freshness, news, catalysts, timeline: [],
      runtime: { poolSize: poolRows.length, turnover, leavers },
      top200Summary: { universe, tradable: null, top200: 200, candidates: runtimeMode ? poolRows.length : ranked.length, shown, turnover },
      isExecutable: globalDecision.isExecutable, blockedReasonKey: globalDecision.blockedReasonKey,
    };
    if (debug) { body._debugStats = debugStats; body.apiLatencyMs = Date.now() - nowMs; }
    if (runtimeMode && !debug) RT_CACHE = { at: nowMs, body };

    const res = NextResponse.json(body);
    res.headers.set("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
    return res;
  } catch (e: any) {
    console.error("[decision-overview]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
