import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuotesBatch } from "@/lib/yahoo";
import { TOP_PICK_WEIGHTS, summarize, weeklyRollup, type DailyPerf } from "@/lib/ai-top-picks";

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

  // V1.1 Freeze Validation：每日 Performance 序列 → 累计/胜率/回撤/Sharpe/对比/周
  const perfRows = await prisma.aiTopPickPerf.findMany({ orderBy: { date: "asc" } });
  const perfSeries: DailyPerf[] = perfRows.map((r) => ({
    date: r.date.toISOString().slice(0, 10), fwdDate: r.fwdDate.toISOString().slice(0, 10),
    top5Ret: r.top5Ret, top5WinCount: r.top5WinCount, top5PickCount: r.top5PickCount,
    sbRet: r.sbRet, buyRet: r.buyRet, topixRet: r.topixRet,
  }));
  const performance = {
    summary: summarize(perfSeries),
    weekly: weeklyRollup(perfSeries),
    daily: perfSeries.slice(-30),
    note: perfSeries.length === 0 ? "验证 Day 1：首个已实现 1 日收益将在下一交易日收盘后产生（日度再平衡模型）" : null,
  };

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

  // ── P9-DECISION-02：每股历史胜率（只读新增字段 · 不改 schema / 不写库 / 不改评分·推荐·排序）──
  //  口径（务必与 UI 展示一致）：
  //    · 观察周期 horizonDays = 1 个交易日（与既有 AiTopPickPerf「日度再平衡 · 1 日持有」模型一致）
  //    · 基准价格 = 该股「入选 Top Picks 当日 D」的收盘价
  //    · 复权口径 = adjClose（缺失时回退 close；与 P8-DATA-02 拆股复权修复一致）
  //    · 胜 = adjClose_{D+1} > adjClose_D（严格大于；相等记为负）
  //    · 仅统计已存在 D+1 收盘的历史入选日；样本 < MIN_SAMPLE 记 status="insufficient"（UI 显示「样本不足」）
  //  性能：两次批量查询（AiTopPick / DailyPrice），不做 N+1，前端无需逐股请求。
  const MIN_SAMPLE = 5;
  const perSymbolWinRate: Record<string, { picks: number; wins: number; winRate: number | null; status: "ok" | "insufficient" }> = {};
  try {
    const symbols = enriched.map((p) => p.symbol);
    if (symbols.length) {
      const histPicks = await prisma.aiTopPick.findMany({
        where: { symbol: { in: symbols } },
        select: { symbol: true, date: true },
        orderBy: { date: "asc" },
      });
      const minDate = histPicks.length ? histPicks[0].date : latest.date;
      const bars = await prisma.dailyPrice.findMany({
        where: { symbol: { in: symbols }, date: { gte: minDate } },
        select: { symbol: true, date: true, close: true, adjClose: true },
        orderBy: [{ symbol: "asc" }, { date: "asc" }],
      });
      const bySym = new Map<string, { d: string; px: number }[]>();
      for (const b of bars) {
        const arr = bySym.get(b.symbol) ?? [];
        arr.push({ d: b.date.toISOString().slice(0, 10), px: Number(b.adjClose ?? b.close) });
        bySym.set(b.symbol, arr);
      }
      const pickDates = new Map<string, string[]>();
      for (const h of histPicks) {
        const arr = pickDates.get(h.symbol) ?? [];
        arr.push(h.date.toISOString().slice(0, 10));
        pickDates.set(h.symbol, arr);
      }
      for (const sym of symbols) {
        const series = bySym.get(sym) ?? [];
        const idx = new Map(series.map((x, i) => [x.d, i]));
        let n = 0, w = 0;
        for (const d of pickDates.get(sym) ?? []) {
          const i = idx.get(d);
          if (i == null || i + 1 >= series.length) continue; // 无 D+1 收盘 → 尚未可判定，不计入样本
          const a = series[i].px, b = series[i + 1].px;
          if (!(a > 0) || !(b > 0)) continue;
          n++; if (b > a) w++;
        }
        perSymbolWinRate[sym] = n >= MIN_SAMPLE
          ? { picks: n, wins: w, winRate: Math.round((w / n) * 1000) / 10, status: "ok" }
          : { picks: n, wins: w, winRate: null, status: "insufficient" };
      }
    }
  } catch {
    // 失败不影响主返回：UI 侧按「暂无数据」安全空态处理
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date(now).toISOString(),
    experimental: true,
    note: "P7 Preview · Experimental V1 · 只读派生 · 不修改任何现有功能（StrongBuy/DR/Promotion/Strategy/Watchlist）",
    date: entryDateStr,
    perSymbolWinRate,
    perSymbolWinRateSpec: {
      horizonDays: 1,
      basis: "adjClose（复权收盘价，缺失回退 close）",
      benchmarkPrice: "入选当日 D 收盘价",
      winRule: "adjClose_{D+1} > adjClose_D",
      minSample: MIN_SAMPLE,
      note: "每股独立统计，非 cohort 胜率；样本不足显示「样本不足」",
    },
    weights: TOP_PICK_WEIGHTS,
    quoteSource, quoteUpdatedAt: quoteUpdatedAt ? new Date(quoteUpdatedAt).toISOString() : null,
    picks: enriched,
    portfolio: {
      portfolioReturn, benchmarkReturn: benchReturn, alpha,
      benchmarkMode: benchReturn != null ? "TOPIX" : "N/A (窗口跨 TOPIX 断点或数据缺失)",
      pickCount: enriched.length,
    },
    filter: filterStats,
    performance,
    history: history.reverse(),
  });
}
