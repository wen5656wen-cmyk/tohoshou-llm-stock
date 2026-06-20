/**
 * lib/query-engine.ts — DB Query Engine V7.9.1
 *
 * Single source of truth for all stock data queries.
 * Used by /api/chat and LINE webhook — identical data for both.
 *
 * Rules:
 *   • No GPT calls — pure DB queries
 *   • answerSource always "DB", hallucination always false
 *   • scoreSource="REAL" enforced for ranked queries
 */

import { prisma } from "@/lib/prisma";
import { computeMarketTemperature } from "@/lib/market-temperature";
import { resolveCompanyToSymbol } from "@/lib/line-intent";
import type { StructuredIntent, DbQueryResult, StockSummary, MarketSnapshot, InstFlowData } from "@/lib/intent-schema";

// ── Shared select objects ──────────────────────────────────────────────────────

const SCORE_FULL_SELECT = {
  symbol: true, name: true, nameZh: true,
  totalScore: true, adaptiveScore: true,
  recommendation: true, recommendationV2: true, recommendationReason: true,
  percentileRank: true, marketRank: true,
  opportunityScore: true, opportunityLabel: true,
  technicalScore: true, fundamentalScore: true,
  moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true,
  catalystScore: true, stockStyle: true, highRiskFlag: true,
  latestClose: true, return5d: true, return20d: true, return60d: true,
  rsi14: true, maTrend: true, macdSignalLabel: true,
  scoreSource: true, latestDate: true,
  dividendScore: true, shortSellingSource: true,
  sector: true,
} as const;

const SCORE_LIST_SELECT = {
  symbol: true, name: true, nameZh: true,
  totalScore: true, adaptiveScore: true,
  recommendation: true, recommendationV2: true,
  percentileRank: true, marketRank: true,
  opportunityScore: true, opportunityLabel: true,
  latestClose: true, return5d: true, return20d: true,
  rsi14: true, technicalScore: true, fundamentalScore: true,
  moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true,
  catalystScore: true, stockStyle: true, highRiskFlag: true,
  dividendScore: true, shortSellingSource: true,
  scoreSource: true, latestDate: true,
  sector: true,
} as const;

// ── JST date string ───────────────────────────────────────────────────────────

function jstDateStr(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().split("T")[0];
}

// ── Short sell ratio ──────────────────────────────────────────────────────────

async function fetchShortSell() {
  return prisma.shortSellingRatio.findFirst({
    where: { market: "ALL" },
    orderBy: { date: "desc" },
    select: { shortSellRatio: true, source: true, date: true },
  });
}

// ── Full single-stock data (includes dividend + short sell) ──────────────────

async function fetchOneStock(symbol: string): Promise<StockSummary | null> {
  const [score, div, shortSell] = await Promise.all([
    prisma.stockScore.findUnique({ where: { symbol }, select: SCORE_FULL_SELECT }),
    prisma.dividend.findFirst({
      where: { symbol },
      orderBy: { year: "desc" },
      select: { yieldRate: true, payoutRatio: true, dividend: true },
    }),
    fetchShortSell(),
  ]);
  if (!score) return null;
  return {
    ...score,
    return60d: score.return60d ?? null,
    recommendationReason: score.recommendationReason ?? null,
    opportunityLabel: score.opportunityLabel ?? null,
    highRiskFlag: score.highRiskFlag ?? false,
    dividendYield: div?.yieldRate ?? null,
    payoutRatio: div?.payoutRatio ?? null,
    dividendAnn: div?.dividend ?? null,
    shortSellingRatio: shortSell?.shortSellRatio ?? null,
    shortSellingSource: score.shortSellingSource ?? shortSell?.source ?? null,
    shortSellingDate: shortSell?.date
      ? new Date(shortSell.date).toISOString().split("T")[0]
      : null,
  };
}

// ── Name resolution: stockNames → symbols ────────────────────────────────────

async function resolveStockNames(names: string[]): Promise<{
  resolved: string[];
  unresolved: string[];
}> {
  const resolved: string[] = [];
  const unresolved: string[] = [];

  for (const name of names) {
    // 1. Alias map (fast)
    const fromAlias = resolveCompanyToSymbol(name);
    if (fromAlias) {
      resolved.push(fromAlias + ".T");
      continue;
    }
    // 2. DB nameZh / name fuzzy search
    const found = await prisma.stock.findFirst({
      where: {
        OR: [
          { nameZh: { contains: name } },
          { name: { contains: name } },
        ],
      },
      select: { symbol: true },
    });
    if (found) {
      resolved.push(found.symbol);
    } else {
      unresolved.push(name);
    }
  }
  return { resolved, unresolved };
}

// ── Market overview data ──────────────────────────────────────────────────────

async function fetchMarketData() {
  const [countSB, countB, countH, countW, countAv, total, top1, gm, instFlow, shortSell] = await Promise.all([
    prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "HOLD", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "WATCH", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "AVOID", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } } }),
    prisma.stockScore.findFirst({
      where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } },
      orderBy: { adaptiveScore: "desc" },
      select: { symbol: true, name: true, nameZh: true, adaptiveScore: true },
    }),
    prisma.globalMarket.findFirst({
      orderBy: { date: "desc" },
      select: { date: true, nasdaq: true, nasdaqChange: true, nikkei: true, nikkeiChange: true, vix: true, usdjpy: true, score: true },
    }),
    prisma.institutionalFlow.findFirst({
      where: { source: { in: ["jquants_investor_types", "jpx"] }, investorType: "foreigners" },
      orderBy: { date: "desc" },
      select: { date: true, netAmount: true, source: true },
    }),
    fetchShortSell(),
  ]);

  return {
    dateStr: jstDateStr(),
    distribution: { strongBuy: countSB, buy: countB, hold: countH, watch: countW, avoid: countAv, total },
    top1: top1 ? { symbol: top1.symbol, name: top1.nameZh ?? top1.name, nameZh: top1.nameZh, adaptiveScore: top1.adaptiveScore } : null,
    marketTemperature: computeMarketTemperature(countSB, countB, total),
    marketData: gm ? {
      date: gm.date, nasdaq: gm.nasdaq, nasdaqChange: gm.nasdaqChange,
      nikkei: gm.nikkei, nikkeiChange: gm.nikkeiChange,
      vix: gm.vix, usdjpy: gm.usdjpy, score: gm.score,
    } as MarketSnapshot : null,
    instFlow: instFlow ? { date: instFlow.date, netAmount: instFlow.netAmount, source: instFlow.source } as InstFlowData : null,
    shortSellRatio: shortSell?.shortSellRatio ?? null,
    shortSellSource: shortSell?.source ?? null,
    shortSellDate: shortSell?.date ? new Date(shortSell.date).toISOString().split("T")[0] : null,
  };
}

// ── Enrich list with dividendYield (batch) ───────────────────────────────────

async function enrichWithDividend<T extends { symbol: string }>(
  stocks: T[]
): Promise<(T & { dividendYield: number | null })[]> {
  const divRows = await prisma.dividend.findMany({
    where: { symbol: { in: stocks.map((s) => s.symbol) } },
    orderBy: { year: "desc" },
    distinct: ["symbol"],
    select: { symbol: true, yieldRate: true },
  });
  const divMap = new Map(divRows.map((r) => [r.symbol, r.yieldRate ?? null]));
  return stocks.map((s) => ({ ...s, dividendYield: divMap.get(s.symbol) ?? null }));
}

// ── Intent-specific query handlers ────────────────────────────────────────────

async function queryTopPicks(intent: StructuredIntent): Promise<DbQueryResult> {
  const limit = intent.limit ?? 10;
  const excludeSymbols = intent.excludeSymbols ?? [];

  // Build dividend filter: high-yield stocks ordered by dividendScore desc
  const baseWhere = {
    scoreSource: "REAL",
    priceCount: { gte: 20 },
    adaptiveScore: { not: null as null },
    ...(excludeSymbols.length ? { symbol: { notIn: excludeSymbols } } : {}),
    ...(intent.riskPreference === "LOW" ? { highRiskFlag: false } : {}),
    ...(intent.riskPreference === "HIGH" ? { highRiskFlag: true } : {}),
  };

  const orderBy = intent.dividendPreference
    ? [{ dividendScore: "desc" as const }, { adaptiveScore: "desc" as const }]
    : [{ adaptiveScore: "desc" as const }];

  const raw = await prisma.stockScore.findMany({
    where: baseWhere,
    orderBy,
    take: limit,
    select: SCORE_LIST_SELECT,
  });

  const enriched = await enrichWithDividend(raw);
  const shortSell = await fetchShortSell();

  const stocks: StockSummary[] = enriched.map((s) => ({
    ...s,
    return60d: null,
    recommendationReason: null,
    maTrend: null,
    macdSignalLabel: null,
    highRiskFlag: s.highRiskFlag ?? false,
    opportunityLabel: s.opportunityLabel ?? null,
    shortSellingRatio: shortSell?.shortSellRatio ?? null,
    shortSellingSource: s.shortSellingSource ?? shortSell?.source ?? null,
    shortSellingDate: shortSell?.date ? new Date(shortSell.date).toISOString().split("T")[0] : null,
    payoutRatio: null,
    dividendAnn: null,
    latestDate: null,
  }));

  return {
    intent: intent.intent,
    dateStr: jstDateStr(),
    stocks,
    answerSource: "DB",
    hallucination: false,
  };
}

async function queryStockAnalysis(intent: StructuredIntent): Promise<DbQueryResult> {
  // Resolve stockNames if needed
  let symbols = intent.symbols ?? [];
  const unresolvedNames: string[] = [];

  if (intent.stockNames?.length && !symbols.length) {
    const { resolved, unresolved } = await resolveStockNames(intent.stockNames);
    symbols = resolved;
    unresolvedNames.push(...unresolved);
  }

  if (!symbols.length) {
    return {
      intent: intent.intent,
      dateStr: jstDateStr(),
      stocks: [],
      unresolvedNames: intent.stockNames ?? [],
      answerSource: "DB",
      hallucination: false,
      error: "SYMBOL_NOT_FOUND",
    };
  }

  const stocks = (await Promise.all(symbols.map(fetchOneStock))).filter(Boolean) as StockSummary[];

  return {
    intent: intent.intent,
    dateStr: jstDateStr(),
    stocks,
    resolvedSymbols: symbols,
    unresolvedNames,
    answerSource: "DB",
    hallucination: false,
  };
}

async function queryStockCompare(intent: StructuredIntent): Promise<DbQueryResult> {
  let symbols = intent.symbols ?? [];

  // Resolve any stockNames
  if (intent.stockNames?.length) {
    const { resolved, unresolved } = await resolveStockNames(intent.stockNames);
    symbols = [...symbols, ...resolved];
    if (unresolved.length) {
      return {
        intent: intent.intent,
        dateStr: jstDateStr(),
        unresolvedNames: unresolved,
        answerSource: "DB",
        hallucination: false,
        error: "SYMBOL_NOT_FOUND",
      };
    }
  }

  if (symbols.length < 2) {
    return {
      intent: intent.intent,
      dateStr: jstDateStr(),
      answerSource: "DB",
      hallucination: false,
      error: "NEED_TWO_SYMBOLS",
    };
  }

  const [s1, s2] = await Promise.all([fetchOneStock(symbols[0]), fetchOneStock(symbols[1])]);

  return {
    intent: intent.intent,
    dateStr: jstDateStr(),
    compareStocks: s1 && s2 ? [s1, s2] : null,
    resolvedSymbols: symbols.slice(0, 2),
    answerSource: "DB",
    hallucination: false,
  };
}

async function queryThemeRank(intent: StructuredIntent): Promise<DbQueryResult> {
  const TECH_SECTORS = ["情報通信・サービスその他", "電機・精密"];

  // Check AITheme table first
  const themes = await prisma.aITheme.findMany({ select: { symbol: true, theme: true } });
  let stocks: StockSummary[] = [];

  if (themes.length > 0) {
    const symbolSet = new Set(themes.map((t) => t.symbol));
    const scores = await prisma.stockScore.findMany({
      where: { symbol: { in: [...symbolSet] }, adaptiveScore: { not: null } },
      orderBy: { adaptiveScore: "desc" },
      take: 10,
      select: SCORE_LIST_SELECT,
    });
    const enriched = await enrichWithDividend(scores);
    const shortSell = await fetchShortSell();
    stocks = enriched.map((s) => ({
      ...s, return60d: null, recommendationReason: null, maTrend: null, macdSignalLabel: null,
      highRiskFlag: s.highRiskFlag ?? false, opportunityLabel: s.opportunityLabel ?? null,
      shortSellingRatio: shortSell?.shortSellRatio ?? null,
      shortSellingSource: s.shortSellingSource ?? shortSell?.source ?? null,
      shortSellingDate: null, payoutRatio: null, dividendAnn: null, latestDate: null,
    }));
  } else {
    // Fallback to sector query
    const raw = await prisma.stockScore.findMany({
      where: { scoreSource: "REAL", priceCount: { gte: 20 }, adaptiveScore: { not: null }, sector: { in: TECH_SECTORS } },
      orderBy: { adaptiveScore: "desc" },
      take: 10,
      select: SCORE_LIST_SELECT,
    });
    const enriched = await enrichWithDividend(raw);
    const shortSell = await fetchShortSell();
    stocks = enriched.map((s) => ({
      ...s, return60d: null, recommendationReason: null, maTrend: null, macdSignalLabel: null,
      highRiskFlag: s.highRiskFlag ?? false, opportunityLabel: s.opportunityLabel ?? null,
      shortSellingRatio: shortSell?.shortSellRatio ?? null,
      shortSellingSource: s.shortSellingSource ?? shortSell?.source ?? null,
      shortSellingDate: null, payoutRatio: null, dividendAnn: null, latestDate: null,
    }));
  }

  const gm = await prisma.globalMarket.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, nasdaqChange: true, nikkeiChange: true, vix: true, usdjpy: true, score: true },
  });

  return {
    intent: intent.intent,
    dateStr: jstDateStr(),
    stocks,
    marketData: gm ? { date: gm.date, nasdaq: null, nasdaqChange: gm.nasdaqChange, nikkei: null, nikkeiChange: gm.nikkeiChange, vix: gm.vix, usdjpy: gm.usdjpy, score: gm.score } : null,
    answerSource: "DB",
    hallucination: false,
  };
}

async function querySectorOutlook(intent: StructuredIntent): Promise<DbQueryResult> {
  const sectors = intent.sectors ?? [];
  if (!sectors.length) {
    return { intent: intent.intent, dateStr: jstDateStr(), stocks: [], answerSource: "DB", hallucination: false, error: "NO_SECTOR" };
  }

  const [raw, countSB, countB, total, gm, instFlow] = await Promise.all([
    prisma.stockScore.findMany({
      where: { priceCount: { gte: 20 }, adaptiveScore: { not: null }, sector: { in: sectors } },
      orderBy: { adaptiveScore: "desc" },
      take: 8,
      select: SCORE_LIST_SELECT,
    }),
    prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { recommendationV2: "BUY", priceCount: { gte: 20 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } } }),
    prisma.globalMarket.findFirst({
      orderBy: { date: "desc" },
      select: { date: true, nasdaqChange: true, nikkeiChange: true, vix: true, usdjpy: true, score: true },
    }),
    prisma.institutionalFlow.findFirst({
      where: { source: { in: ["jquants_investor_types", "jpx"] }, investorType: "foreigners" },
      orderBy: { date: "desc" },
      select: { date: true, netAmount: true, source: true },
    }),
  ]);

  const enriched = await enrichWithDividend(raw);
  const shortSell = await fetchShortSell();
  const stocks: StockSummary[] = enriched.map((s) => ({
    ...s, return60d: null, recommendationReason: null, maTrend: null, macdSignalLabel: null,
    highRiskFlag: s.highRiskFlag ?? false, opportunityLabel: s.opportunityLabel ?? null,
    shortSellingRatio: shortSell?.shortSellRatio ?? null,
    shortSellingSource: s.shortSellingSource ?? shortSell?.source ?? null,
    shortSellingDate: null, payoutRatio: null, dividendAnn: null, latestDate: null,
  }));

  return {
    intent: intent.intent,
    dateStr: jstDateStr(),
    stocks,
    sectorLabel: intent.sector ?? sectors[0],
    distribution: { strongBuy: countSB, buy: countB, hold: 0, watch: 0, avoid: 0, total },
    marketData: gm ? { date: gm.date, nasdaq: null, nasdaqChange: gm.nasdaqChange, nikkei: null, nikkeiChange: gm.nikkeiChange, vix: gm.vix, usdjpy: gm.usdjpy, score: gm.score } : null,
    instFlow: instFlow ? { date: instFlow.date, netAmount: instFlow.netAmount, source: instFlow.source } : null,
    marketTemperature: computeMarketTemperature(countSB, countB, total),
    answerSource: "DB",
    hallucination: false,
  };
}

async function queryMarketOverview(_intent: StructuredIntent): Promise<DbQueryResult> {
  const data = await fetchMarketData();
  return {
    intent: "market_overview",
    dateStr: data.dateStr,
    distribution: data.distribution,
    top1: data.top1,
    marketTemperature: data.marketTemperature,
    marketData: data.marketData,
    instFlow: data.instFlow,
    shortSellRatio: data.shortSellRatio,
    shortSellSource: data.shortSellSource,
    shortSellDate: data.shortSellDate,
    answerSource: "DB",
    hallucination: false,
  };
}

async function queryRiskAnalysis(intent: StructuredIntent): Promise<DbQueryResult> {
  // Same data as stock_analysis but focus on risk fields
  const result = await queryStockAnalysis(intent);
  const gm = await prisma.globalMarket.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, vix: true, nasdaqChange: true, nikkeiChange: true, usdjpy: true, score: true },
  });
  return {
    ...result,
    intent: "risk_analysis",
    marketData: gm ? { date: gm.date, nasdaq: null, nasdaqChange: gm.nasdaqChange, nikkei: null, nikkeiChange: gm.nikkeiChange, vix: gm.vix, usdjpy: gm.usdjpy, score: gm.score } : null,
  };
}

async function queryReasonExplain(intent: StructuredIntent): Promise<DbQueryResult> {
  const result = await queryStockAnalysis(intent);
  return { ...result, intent: "reason_explain" };
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

export async function queryDatabase(intent: StructuredIntent): Promise<DbQueryResult> {
  switch (intent.intent) {
    case "top_picks":
    case "recommend_more":
      return queryTopPicks(intent);
    case "stock_analysis":
      return queryStockAnalysis(intent);
    case "stock_compare":
      return queryStockCompare(intent);
    case "theme_rank":
      return queryThemeRank(intent);
    case "sector_outlook":
      return querySectorOutlook(intent);
    case "market_overview":
      return queryMarketOverview(intent);
    case "risk_analysis":
      return queryRiskAnalysis(intent);
    case "reason_explain":
      return queryReasonExplain(intent);
    case "data_source":
    case "help":
    case "unknown":
    default:
      return {
        intent: intent.intent,
        dateStr: jstDateStr(),
        answerSource: "DB",
        hallucination: false,
      };
  }
}
