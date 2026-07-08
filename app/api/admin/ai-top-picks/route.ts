import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuotesBatch } from "@/lib/yahoo";
import { TOP_PICK_WEIGHTS } from "@/lib/ai-top-picks";

export const dynamic = "force-dynamic";

// GET /api/admin/ai-top-picks — AI Top Picks V1（P7 Preview · Experimental）
// 每日 Top5 + 实时行情 + 组合收益 vs TOPIX + Alpha + 历史表现。**只读派生 · 不写任何
// 表 · 不修改 StrongBuy/DailyRecommendation/Promotion/Strategy/Watchlist/评分。**

const TOPIX_BREAK = "2026-03-30"; // P2-020：此前 TOPIX 点位序列量纲断裂，跨断点窗口不可用

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export async function GET() {
  const now = Date.now();

  // 1) 最新一期 Top5
  const latest = await prisma.aiTopPick.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  if (!latest) {
    return NextResponse.json({ ok: true, generatedAt: new Date(now).toISOString(), experimental: true, empty: true, note: "尚无 Top Picks（等待 cron 生成）", picks: [], portfolio: null, history: [] });
  }
  const picks = await prisma.aiTopPick.findMany({ where: { date: latest.date }, orderBy: { rank: "asc" } });

  // 2) 实时行情（Yahoo 批量，6s 超时；失败回退 entryPrice）
  const symbols = picks.map((p) => p.symbol);
  const quotes = await withTimeout(fetchQuotesBatch(symbols), 6000, []);
  const qMap = new Map(quotes.map((q) => [q.symbol, q]));
  let quoteSource = quotes.length ? "Yahoo Finance" : "EOD (entryPrice)";
  let quoteUpdatedAt: number | null = quotes.reduce((m, q) => Math.max(m, q.time ?? 0), 0) || null;

  // 3) TOPIX benchmark（GlobalMarket，仅取断点后连续区间）
  const gmLatest = await prisma.globalMarket.findFirst({ where: { topix: { not: null } }, orderBy: { date: "desc" }, select: { date: true, topix: true } });
  const topixDates = await prisma.globalMarket.findMany({ where: { topix: { not: null } }, select: { date: true, topix: true }, orderBy: { date: "asc" } });
  const topixByDate = new Map(topixDates.map((g) => [g.date.toISOString().slice(0, 10), g.topix as number]));
  const topixLatest = gmLatest?.topix ?? null;

  function benchmarkReturn(entryDate: string): number | null {
    if (entryDate < TOPIX_BREAK) return null; // 跨断点不可用（P2-020）
    const t0 = topixByDate.get(entryDate) ?? nearestTopixOnOrBefore(entryDate);
    if (t0 == null || topixLatest == null || t0 <= 0) return null;
    return Math.round(((topixLatest / t0 - 1) * 100) * 100) / 100;
  }
  function nearestTopixOnOrBefore(d: string): number | null {
    let found: number | null = null;
    for (const g of topixDates) { const gd = g.date.toISOString().slice(0, 10); if (gd <= d) found = g.topix as number; else break; }
    return found;
  }

  // 4) 当期 Top5 实时收益
  const enriched = picks.map((p) => {
    const q = qMap.get(p.symbol);
    const cur = q?.price ?? p.currentPrice ?? p.entryPrice ?? null;
    const entry = p.entryPrice;
    const returnPct = cur != null && entry != null && entry > 0 ? Math.round(((cur / entry - 1) * 100) * 100) / 100 : null;
    const prev = q?.previousClose ?? null;
    const intradayPct = cur != null && prev != null && prev > 0 ? Math.round(((cur / prev - 1) * 100) * 100) / 100 : null;
    return {
      rank: p.rank, symbol: p.symbol, name: p.name, sourceRating: p.sourceRating,
      entryPrice: entry, currentPrice: cur, returnPct, intradayPct,
      aiScore: p.aiScore, alphaScore: p.alphaScore, contribution: p.contribution,
      confidence: p.confidence, riskScore: p.riskScore, compositeScore: p.compositeScore, reason: p.reason,
      momentumPenalty: p.momentumPenalty, turnover: p.turnover, momentum20d: p.momentum20d,
    };
  });

  // V1.1 Quality Gates：过滤统计 + 被拒候选
  const filter = await prisma.aiTopPickFilter.findUnique({ where: { date: latest.date } });
  const filterStats = filter ? {
    candidates: filter.candidates, newsReject: filter.newsReject, liquidityReject: filter.liquidityReject,
    momentumPenalty: filter.momentumPenalty, finalPicks: filter.finalPicks,
    rejected: (filter.rejected as unknown[]) ?? [], config: filter.config ?? null,
  } : null;

  // 5) 组合收益（等权）+ TOPIX + Alpha
  const rets = enriched.map((e) => e.returnPct).filter((x): x is number => x != null);
  const portfolioReturn = rets.length ? Math.round((rets.reduce((a, b) => a + b, 0) / rets.length) * 100) / 100 : null;
  const entryDateStr = latest.date.toISOString().slice(0, 10);
  const benchReturn = benchmarkReturn(entryDateStr);
  const alpha = portfolioReturn != null && benchReturn != null ? Math.round((portfolioReturn - benchReturn) * 100) / 100 : null;

  // 6) 历史表现（各期 cohort：EOD 收盘 vs entry + TOPIX + Alpha）
  const cohortDates = await prisma.aiTopPick.findMany({ distinct: ["date"], select: { date: true }, orderBy: { date: "desc" }, take: 30 });
  const history: { date: string; pickCount: number; portfolioReturn: number | null; benchmarkReturn: number | null; alpha: number | null }[] = [];
  for (const cd of cohortDates) {
    const ds = cd.date.toISOString().slice(0, 10);
    const rows = await prisma.aiTopPick.findMany({ where: { date: cd.date }, select: { symbol: true, entryPrice: true } });
    const syms = rows.map((r) => r.symbol);
    const closes = await prisma.stockScore.findMany({ where: { symbol: { in: syms } }, select: { symbol: true, latestClose: true } });
    const closeMap = new Map(closes.map((c) => [c.symbol, c.latestClose]));
    const rr = rows.map((r) => { const c = closeMap.get(r.symbol); return c != null && r.entryPrice != null && r.entryPrice > 0 ? (c / r.entryPrice - 1) * 100 : null; }).filter((x): x is number => x != null);
    const pRet = rr.length ? Math.round((rr.reduce((a, b) => a + b, 0) / rr.length) * 100) / 100 : null;
    const bRet = benchmarkReturn(ds);
    history.push({ date: ds, pickCount: rows.length, portfolioReturn: pRet, benchmarkReturn: bRet, alpha: pRet != null && bRet != null ? Math.round((pRet - bRet) * 100) / 100 : null });
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date(now).toISOString(),
    experimental: true,
    note: "P7 Preview · Experimental V1 · 只读派生 · 不修改任何现有功能（StrongBuy/DR/Promotion/Strategy/Watchlist）",
    date: entryDateStr,
    weights: TOP_PICK_WEIGHTS,
    quoteSource, quoteUpdatedAt: quoteUpdatedAt ? new Date(quoteUpdatedAt).toISOString() : null,
    picks: enriched,
    portfolio: {
      portfolioReturn, benchmarkReturn: benchReturn, alpha,
      benchmarkMode: benchReturn != null ? "TOPIX" : "N/A (窗口跨 TOPIX 断点或数据缺失)",
      pickCount: enriched.length,
    },
    filter: filterStats,
    history: history.reverse(),
  });
}
