import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMarketTemperature } from "@/lib/market-temperature";

export const dynamic = "force-dynamic";

// P21-T4：原本这份 select 在文件里重复了两次（主查询 + watchlist 补位），
// finalScore 分页需要第三处，故抽为共享常量，避免三份各自漂移。
const SCREENER_SELECT = {
  symbol: true, name: true, nameZh: true, market: true, sector: true, industry: true,
  latestDate: true, latestClose: true, return5d: true, return20d: true,
  rsi14: true, maTrend: true, macdSignalLabel: true,
  technicalScore: true, fundamentalScore: true, moneyFlowScore: true,
  newsSentimentScore: true, globalTrendScore: true,
  totalScore: true, recommendation: true, summaryReason: true, scoreSource: true,
  rawScore: true, adaptiveScore: true, stockStyle: true,
  highRiskFlag: true, fxSensitivity: true, catalystScore: true,
  percentileRank: true, marketRank: true,
  recommendationV2: true, recommendationReason: true,
  opportunityScore: true, opportunityRank: true, opportunityLabel: true,
  tradingAction: true, positionSizePct: true, actionRiskLevel: true,
} as const;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const market     = searchParams.get("market") ?? "";
  const sector     = searchParams.get("sector") ?? "";
  const rec        = searchParams.get("recommendation") ?? "";
  const recV2      = searchParams.get("recommendationV2") ?? "";
  const style      = searchParams.get("style") ?? "";
  const minScore   = parseInt(searchParams.get("minScore") ?? "0") || 0;
  const q          = (searchParams.get("q") ?? "").trim();
  const rawLimit   = parseInt(searchParams.get("limit") ?? "50") || 50;
  const limit      = q ? Math.min(500, rawLimit > 50 ? rawLimit : 500) : Math.min(200, rawLimit);
  const sortBy     = searchParams.get("sort") ?? "adaptiveScore";
  // P21-T4：服务端分页。offset 与 total 配套，使「第 N 页」与「共 M 只」都是真实全量口径，
  // 而不是「已加载的前 200 名里的第 N 页」。
  const offset     = Math.max(0, parseInt(searchParams.get("offset") ?? "0") || 0);
  // 调用方是否显式分页 —— 决定要不要走 watchlist 补位（见下方 isDefaultView）。
  const paginated  = searchParams.get("offset") != null;
  const highRisk   = searchParams.get("highRisk");

  const where: Record<string, unknown> = {
    priceCount: { gte: 20 },
    adaptiveScore: { not: null },
  };
  if (market) where.market = { contains: market };
  if (sector) where.sector = { contains: sector };
  if (rec)    where.recommendation = rec;
  if (recV2)  where.recommendationV2 = recV2;
  if (style)  where.stockStyle = style;
  if (highRisk === "true")  where.highRiskFlag = true;
  if (highRisk === "false") where.highRiskFlag = false;
  if (minScore > 0) where.adaptiveScore = { gte: minScore };

  // Server-side full-text search across symbol / Japanese name / Chinese name / sector / English name
  if (q) {
    // Pre-fetch Stock.nameEn matches (English company name, e.g. "SoftBank")
    const nameEnMatches = await prisma.stock.findMany({
      where: { nameEn: { contains: q, mode: "insensitive" } },
      select: { symbol: true },
    });
    const nameEnSymbols = nameEnMatches.map((s) => s.symbol);

    const orConditions: Record<string, unknown>[] = [
      { symbol:  { contains: q, mode: "insensitive" } },  // "8001" matches "8001.T"
      { name:    { contains: q, mode: "insensitive" } },  // Japanese name
      { nameZh:  { contains: q } },                        // Chinese name
      { sector:  { contains: q, mode: "insensitive" } },
      { industry:{ contains: q, mode: "insensitive" } },
    ];
    if (nameEnSymbols.length > 0) {
      orConditions.push({ symbol: { in: nameEnSymbols } }); // English name → symbol
    }
    where.OR = orConditions;
  }

  const orderBy: Record<string, string> =
    sortBy === "opportunityScore" ? { opportunityScore: "desc" } :
    sortBy === "totalScore"       ? { totalScore: "desc" } :
    sortBy === "percentileRank"   ? { percentileRank: "asc" } :
    sortBy === "return20d"        ? { return20d: "desc" } :
    sortBy === "return5d"         ? { return5d: "desc" } :
    sortBy === "rsi14"            ? { rsi14: "desc" } :
    sortBy === "latestDate"       ? { latestDate: "desc" } :
                                    { adaptiveScore: "desc" };

  // ── P21-T4 · sort=finalScore（GPT 综合评分）服务端排序 ────────────────────────
  // 为什么不能在前端 join：前端只拿到当前页，按 finalScore 排序就只是「本页内重排」，
  // 而页面写着「全市场按综合评分排序」——那是假的（P21-T4 设计 §6.4 方案 A 的缺陷）。
  // GPTScore 与 StockScore 无 Prisma 关联，故走两步服务端排序：
  //   ① 按 where 取出全部命中 symbol（窄 select）与 GPTScore 全表（约 500 行）
  //   ② 服务端合并排序后再切片分页，最后只取该页 symbol 的完整行
  // finalScore 缺失时回退 adaptiveScore，与旧前端口径一致。
  let finalScoreOrder: string[] | null = null;
  if (sortBy === "finalScore") {
    const [lite, gpt] = await Promise.all([
      prisma.stockScore.findMany({ where, select: { symbol: true, adaptiveScore: true } }),
      prisma.gPTScore.findMany({ select: { symbol: true, finalScore: true } }),
    ]);
    const gMap = new Map(gpt.map((g) => [g.symbol, g.finalScore]));
    finalScoreOrder = lite
      .map((r) => ({ symbol: r.symbol, v: gMap.get(r.symbol) ?? r.adaptiveScore ?? -999 }))
      .sort((a, b) => b.v - a.v)
      .map((r) => r.symbol);
  }

  const [countSB, countB, countH, countW, countAv, totalScored, filteredTotal, scores, lastScore] = await Promise.all([
    prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "HOLD", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "WATCH", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "AVOID", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } } }),
    // P21-T4：当前筛选条件下的真实总数 —— 分页与「共 N 只」都以它为准。
    prisma.stockScore.count({ where }),
    finalScoreOrder
      ? prisma.stockScore.findMany({
          where: { symbol: { in: finalScoreOrder.slice(offset, offset + limit) } },
          select: SCREENER_SELECT,
        })
      : prisma.stockScore.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      select: SCREENER_SELECT,
    }),
    prisma.stockScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
  ]);

  const marketTemperature = computeMarketTemperature(countSB, countB, totalScored);

  // Enrich with nameEn from Stock table (StockScore doesn't carry it)
  const scoreSymbols = scores.map((s) => s.symbol);
  const stockNamesEn = await prisma.stock.findMany({
    where: { symbol: { in: scoreSymbols } },
    select: { symbol: true, nameEn: true },
  });
  const screenerNameEnMap = new Map(stockNamesEn.map((s) => [s.symbol, s.nameEn ?? null]));
  // ⚠️ finalScore 路径用 `symbol: { in: [...] }` 取本页行，Prisma 不保证返回顺序，
  //    必须按排序数组还原，否则页面显示的顺序与排序口径不符。
  const orderedScores = finalScoreOrder
    ? (() => {
        const pageOrder = finalScoreOrder.slice(offset, offset + limit);
        const idx = new Map(pageOrder.map((sym, i) => [sym, i]));
        return [...scores].sort((a, b) => (idx.get(a.symbol) ?? 0) - (idx.get(b.symbol) ?? 0));
      })()
    : scores;

  const enrichedScores: Array<Record<string, unknown>> =
    orderedScores.map((s) => ({ ...s, nameEn: screenerNameEnMap.get(s.symbol) ?? null, isWatchlist: false }));

  // Pin manual watchlist includes (aiExcludeRule=MANUAL_INCLUDE_WATCHLIST) into the
  // default list so they're always visible even when their score keeps them out of the
  // top-N. On a text search the normal where-clause already surfaces them, so only pad
  // the unfiltered default view.
  // ⚠️ watchlist 补位是**分页前时代**的产物：把 MANUAL_INCLUDE_WATCHLIST 的股票额外
  //    塞进结果，保证它们即使排名靠后也可见。它与真实分页天然冲突 ——
  //    实测 limit=5 会返回 6 条，且被补位的股票会在它自然所在的页**再出现一次**
  //    （4318.T 同时出现在第 1、2 页）。
  //    故：显式分页的调用方一律不补位（页面已提供「仅自选」筛选替代该需求）；
  //    未分页的旧调用方行为完全不变，零回归。
  const isDefaultView = !paginated && !q && !recV2 && !rec && !style && minScore === 0;
  if (isDefaultView) {
    const present = new Set(scoreSymbols);
    const watchStocks = await prisma.stock.findMany({
      where: { aiEnabled: true, aiExcludeSource: "MANUAL", aiExcludeRule: "MANUAL_INCLUDE_WATCHLIST" },
      select: { symbol: true, nameEn: true },
    });
    const watchOutside = watchStocks.filter((w) => !present.has(w.symbol));
    if (watchOutside.length) {
      const wNameEn = new Map(watchOutside.map((w) => [w.symbol, w.nameEn ?? null]));
      const wScores = await prisma.stockScore.findMany({
        where: { symbol: { in: watchOutside.map((w) => w.symbol) }, priceCount: { gte: 20 } },
        select: SCREENER_SELECT,
      });
      for (const s of wScores) {
        enrichedScores.push({ ...s, nameEn: wNameEn.get(s.symbol) ?? null, isWatchlist: true });
      }
    }
  }

  return NextResponse.json({
    stats: {
      total: totalScored,
      strongBuy: countSB, buy: countB, hold: countH, watch: countW, avoid: countAv,
      bullCount: countSB + countB,
      bullRate: totalScored > 0 ? Math.round((countSB + countB) / totalScored * 1000) / 10 : 0,
      marketTemperature,
      lastComputedAt: lastScore?.computedAt ?? null,
    },
    scores: enrichedScores,
    meta: { limit, offset, total: filteredTotal, sortBy, filters: { market, sector, rec, recV2, style, minScore, highRisk } },
  });
}
