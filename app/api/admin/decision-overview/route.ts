import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuotesBatch, type RealtimeQuote } from "@/lib/yahoo";
import { isJPXTradingDay } from "@/lib/trading-calendar/jpx";
import {
  marketPhase8, computeFreshness, deriveStockDecision, groupPicks,
  deriveHoldingActions, deriveGlobalDecision,
  type Quote, type PaperPositionInput,
} from "@/lib/decision-engine";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */ // prisma-as-any + JSON(top10/portfolio) 只读聚合

// ── GET /api/admin/decision-overview（P15-01B · 决策总览唯一聚合入口）─────────────
// 组合层：只读 ClosingDecision(15:15 快照) + MarketRegime + PaperBroker 持仓 + News，
// 仅对「当前展示标的（≤top10 + 持仓）」补实时价（1.5s 超时回退 EOD），调 lib/decision-engine
// 派生 9 态实时决策 / 三组 / 持仓动作 / 6 时间戳。**禁重算评分、禁调 GPT、禁引 feature-platform。**
// Decision 随实时价变化，Score 不变（StockScore 只读）。

function withTimeout<T>(pr: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([pr, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}
function riskFromVol(vol: number | null): "LOW" | "MEDIUM" | "HIGH" | null {
  if (vol == null) return null;
  return vol < 20 ? "LOW" : vol <= 25 ? "MEDIUM" : "HIGH";
}
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

export async function GET(req: Request) {
  const p = prisma as any;
  const now = new Date();
  const phase = marketPhase8(now);
  const tradingDay = isJPXTradingDay(now);
  const dateArg = new URL(req.url).searchParams.get("date");

  try {
    // ── 只读拉取（现有表，走索引，小集合）──
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
    const scoreRows: any[] = holdSyms.length
      ? await p.stockScore.findMany({ where: { symbol: { in: holdSyms } }, select: { symbol: true, name: true, nameZh: true, sector: true, target1: true, stopLoss: true, actionRiskLevel: true } })
      : [];
    const sMap = new Map<string, any>(scoreRows.map((r) => [r.symbol, r]));

    // ── Top10（收盘快照 SSOT，只读）──
    const top10: any[] = Array.isArray(closing?.top10) ? (closing!.top10 as any[]) : [];

    // ── 实时补价：仅展示标的（top10 + 持仓），1.5s 超时回退 EOD ──
    const displayed = [...new Set<string>([...top10.map((r) => r.symbol), ...holdSyms])];
    const rawQuotes: RealtimeQuote[] = displayed.length
      ? await withTimeout(fetchQuotesBatch(displayed), 1500, [])
      : [];
    const quoteMap = new Map<string, Quote>(rawQuotes.map((q) => [q.symbol, q]));

    // ── 新鲜度 + stale ──
    const holdingsUpdatedAt = openPositions.length
      ? iso(openPositions.reduce((m: Date, x: any) => (x.updatedAt && new Date(x.updatedAt) > m ? new Date(x.updatedAt) : m), new Date(0)))
      : null;
    const freshness = computeFreshness({
      quotes: rawQuotes,
      rankingComputedAt: iso(scoreMeta?.computedAt),
      decisionComputedAt: iso(closing?.computedAt),
      decidedAtJst: closing?.decidedAtJst ?? null,
      holdingsUpdatedAt,
      phase, now,
    });

    // ── 逐股决策 + 三组 ──
    const stockDecisions = top10.map((row) => deriveStockDecision(row, quoteMap.get(row.symbol), regimeName));
    const groups = groupPicks(stockDecisions);

    // ── 持仓动作（6 档 + 优先级）──
    const paperInputs: PaperPositionInput[] = openPositions.map((pos) => {
      const sc = sMap.get(pos.symbol);
      return {
        symbol: pos.symbol,
        name: sc?.nameZh ?? sc?.name ?? pos.symbol,
        strategyType: pos.strategyType ?? null,
        entryPrice: pos.entryPrice ?? null,
        currentPrice: pos.currentPrice ?? null,
        returnPct: pos.returnPct ?? null,
        actionRiskLevel: sc?.actionRiskLevel ?? null,
        target1: sc?.target1 ?? null,
        stopLoss: sc?.stopLoss ?? null,
        updatedAt: iso(pos.updatedAt),
      };
    });
    const holdingsActions = deriveHoldingActions(paperInputs, quoteMap);

    // ── 全局决策（冲突消解）──
    const legWeights: number[] = Array.isArray(closing?.portfolio)
      ? (closing!.portfolio as any[]).map((l) => Number(l?.weight) || 0).filter((w) => w > 0)
      : [];
    const globalDecision = deriveGlobalDecision({
      verdict: closing?.verdict ?? null,
      regime: regimeName,
      riskLevel,
      phase, tradingDay,
      stale: freshness.stale,
      executableCount: groups.executeNow.length,
      holdingActions: holdingsActions,
      portfolioLegWeights: legWeights,
      confidence: closing?.avgAiScore ?? null,
    });

    // ── 市场依据（第二层）──
    const marketContext = {
      regime: regimeName,
      riskLevel,
      volatility,
      trendScore: regime?.trendScore ?? null,
      breadth: regime?.breadth ?? null,
      nikkei: gm?.nikkei ?? null, nikkeiChange: gm?.nikkeiChange ?? null,
      topix: gm?.topix ?? null, topixChange: gm?.topixChange ?? null,
      usdjpy: gm?.usdjpy ?? null, vix: gm?.vix ?? null,
      nasdaq: gm?.nasdaq ?? null, nasdaqChange: gm?.nasdaqChange ?? null,
      asOf: gm?.date ? new Date(gm.date).toISOString().slice(0, 10) : null,
    };

    // ── 风险面板（真实派生）──
    const negNews = top10.filter((r) => (r.newsSentiment ?? 0) < 0).length;
    const idxLevel = regimeName === "BEAR" || (gm?.topixChange ?? 0) < -1 ? "HIGH" : (gm?.topixChange ?? 0) < 0 ? "MEDIUM" : "LOW";
    const risks = [
      { key: "dv.ov.rk.index", level: idxLevel },
      { key: "dv.ov.rk.vol", level: riskLevel ?? "—" },
      { key: "dv.ov.rk.news", level: negNews >= 3 ? "HIGH" : negNews > 0 ? "MEDIUM" : "LOW", note: negNews ? String(negNews) : null },
      { key: "dv.ov.rk.data", level: freshness.stale ? "HIGH" : "LOW" },
    ];

    // ── 新闻 / 催化剂（真实，第二层）──
    const [newsRows, discRows] = await Promise.all([
      p.news.findMany({ take: 8, orderBy: { publishedAt: "desc" }, select: { id: true, title: true, source: true, publishedAt: true, sentiment: true, stock: { select: { symbol: true } } } }),
      p.disclosure.findMany({ take: 20, orderBy: { publishedAt: "desc" }, select: { id: true, symbol: true, title: true, category: true, sentiment: true, publishedAt: true, stock: { select: { name: true } } } }),
    ]);
    const seen = new Set<string>();
    const news = newsRows.filter((n: any) => { const k = n.title.trim(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 6).map((n: any) => ({ id: String(n.id), title: n.title, publishedAt: iso(n.publishedAt), symbol: n.stock?.symbol ?? null, sentiment: n.sentiment, source: n.source }));
    const nowMs = now.getTime();
    const catalysts = discRows.filter((d: any) => nowMs - new Date(d.publishedAt).getTime() < 2 * 86_400_000)
      .slice(0, 6).map((d: any) => ({ id: String(d.id), category: d.category ?? "OTHER", target: d.stock?.name ?? d.symbol, publishedAt: iso(d.publishedAt), sentiment: d.sentiment }));

    // ── Top200 漏斗摘要 ──
    const universe = await p.stockScore.count({ where: { priceCount: { gte: 20 } } });
    const top200Summary = {
      universe, tradable: null, top200: 200,
      candidates: stockDecisions.length,
      shown: groups.executeNow.length + groups.waitList.length + groups.backups.length,
    };

    const res = NextResponse.json({
      ok: true,
      empty: !closing || closing.empty === true,
      asOfDate: closing?.date ? new Date(closing.date).toISOString().slice(0, 10) : null,
      marketPhase: phase,
      tradingDay,
      nextTradingDay: tradingDay ? null : freshness.nextDecisionAt,
      globalDecision,
      holdingsActions,
      executeNow: groups.executeNow,
      waitList: groups.waitList,
      backups: groups.backups,
      marketContext,
      risks,
      freshness,
      news,
      catalysts,
      timeline: [], // v1 无盘中快照（DecisionSnapshot 属 P15-01H）
      top200Summary,
      isExecutable: globalDecision.isExecutable,
      blockedReasonKey: globalDecision.blockedReasonKey,
    });
    res.headers.set("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return res;
  } catch (e: any) {
    console.error("[decision-overview]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
