export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMarketTemperature } from "@/lib/market-temperature";

export type SourceStatus =
  | "REAL"
  | "PARTIAL"
  | "FALLBACK"
  | "STALE"
  | "FAILED"
  | "NEVER_SYNCED";

export type SourceInfo = {
  id: string;
  taskName: string;
  icon: string;
  description: string;
  status: SourceStatus;
  source: string;
  lastSyncedAt: string | null;
  latestDate: string | null;
  ageDays: number | null;
  rowsInserted: number | null;
  totalCount: number | null;
  coveredSymbols: number | null;
  nextCron: string;
  errorMessage: string | null;
  apiEndpoint: string | null;
  isAsync: boolean;
  extra: Record<string, unknown>;
};

export type StatusResponse = {
  sources: SourceInfo[];
  summary: {
    realCount: number;
    partialCount: number;
    fallbackCount: number;
    failedCount: number;
    lastScoreComputedAt: string | null;
    stockScoreTotal: number;
    stockScoreCovered: number;
    buyCount: number;
    strongBuyCount: number;
    holdCount: number;
    watchCount: number;
    avoidCount: number;
    marketTemperature: string;
    bullRate: number;
    disclosureTotal: number;
    disclosureCoveredSymbols: number;
  };
  recentLogs: {
    id: number;
    source: string;
    status: string;
    message: string | null;
    itemCount: number;
    durationMs: number | null;
    createdAt: string;
  }[];
};

function ageDays(date: Date | string | null): number | null {
  if (!date) return null;
  return Math.round((Date.now() - new Date(date).getTime()) / 86400000);
}

function isoDate(date: Date | string | null): string | null {
  if (!date) return null;
  return new Date(date).toISOString().split("T")[0];
}

export async function GET() {
  const REAL_FLOW_SOURCES = ["jquants_investor_types", "jpx", "jpx_file", "jpx_manual"];

  const [
    stockTotal,
    stockSyncedCount,
    stockLatest,
    dailyPriceCount,
    dailyPriceLatest,
    financialCount,
    financialLatest,
    institutionalFlowReal,
    institutionalFlowAny,
    institutionalFlowCount,
    globalMarketLatest,
    newsCount,
    newsLatest,
    disclosureCount,
    disclosureLatest,
    disclosureCovResult,
    stockScoreTotal,
    stockScoreLatest,
    buyCount,
    strongBuyCount,
    holdCount,
    watchCount,
    avoidCount,
    shortSellLatest,
    shortSellCount,
    dividendCount,
    dividendLatest,
    recentLogs,
  ] = await Promise.all([
    prisma.stock.count(),
    prisma.stock.count({ where: { lastSyncAt: { not: null } } }),
    prisma.stock.findFirst({ orderBy: { lastSyncAt: "desc" }, select: { lastSyncAt: true } }),
    prisma.dailyPrice.count(),
    prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.financial.count(),
    prisma.financial.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.institutionalFlow.findFirst({
      where: { source: { in: REAL_FLOW_SOURCES } },
      orderBy: { date: "desc" },
      select: { date: true, source: true },
    }),
    prisma.institutionalFlow.findFirst({
      orderBy: { date: "desc" },
      select: { date: true, source: true },
    }),
    prisma.institutionalFlow.count(),
    prisma.globalMarket.findFirst({
      orderBy: { date: "desc" },
      select: { date: true, source: true, score: true, vix: true, nasdaqChange: true },
    }),
    prisma.news.count(),
    prisma.news.findFirst({ orderBy: { publishedAt: "desc" }, select: { publishedAt: true } }),
    prisma.disclosure.count(),
    prisma.disclosure.findFirst({ orderBy: { publishedAt: "desc" }, select: { publishedAt: true } }),
    prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(DISTINCT symbol)::integer as count FROM "Disclosure"`,
    prisma.stockScore.count({ where: { priceCount: { gte: 20 }, adaptiveScore: { not: null } } }),
    prisma.stockScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.stockScore.count({ where: { recommendationV2: "BUY" } }),
    prisma.stockScore.count({ where: { recommendationV2: "STRONG_BUY" } }),
    prisma.stockScore.count({ where: { recommendationV2: "HOLD" } }),
    prisma.stockScore.count({ where: { recommendationV2: "WATCH" } }),
    prisma.stockScore.count({ where: { recommendationV2: "AVOID" } }),
    prisma.shortSellingRatio.findFirst({
      where: { market: "ALL" },
      orderBy: { date: "desc" },
      select: { date: true, shortSellRatio: true, source: true },
    }),
    prisma.shortSellingRatio.count(),
    prisma.dividend.count(),
    prisma.dividend.findFirst({ orderBy: { year: "desc" }, select: { year: true, createdAt: true } }),
    prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  const disclosureCoveredSymbols = Number(disclosureCovResult[0]?.count ?? 0);
  const marketTemperature = computeMarketTemperature(strongBuyCount, buyCount, stockScoreTotal);
  const bullRate = stockScoreTotal > 0
    ? Math.round((strongBuyCount + buyCount) / stockScoreTotal * 1000) / 10
    : 0;

  // Last sync per source
  const lastSync: Record<string, (typeof recentLogs)[0] | null> = {};
  for (const log of recentLogs) {
    if (!lastSync[log.source]) lastSync[log.source] = log;
  }

  const flowData = institutionalFlowReal ?? institutionalFlowAny;
  const isRealFlow = REAL_FLOW_SOURCES.includes(flowData?.source ?? "");
  const flowAge = ageDays(flowData?.date ?? null);

  const globalAge = ageDays(globalMarketLatest?.date ?? null);
  const dailyAge = ageDays(dailyPriceLatest?.date ?? null);
  const scoreAge = ageDays(stockScoreLatest?.computedAt ?? null);

  const shortSellAge = ageDays(shortSellLatest?.date ?? null);
  const dividendAge = ageDays(dividendLatest?.createdAt ?? null);

  const sources: SourceInfo[] = [
    {
      id: "stock_master",
      taskName: "Stock Master",
      icon: "◈",
      description: "TSE全量上市股票元数据（J-Quants ListedInfo API）",
      status: stockTotal > 3000 ? "REAL" : stockTotal > 0 ? "PARTIAL" : "NEVER_SYNCED",
      source: "jquants_meta",
      lastSyncedAt: stockLatest?.lastSyncAt?.toISOString() ?? null,
      latestDate: isoDate(stockLatest?.lastSyncAt ?? null),
      ageDays: ageDays(stockLatest?.lastSyncAt ?? null),
      rowsInserted: null,
      totalCount: stockTotal,
      coveredSymbols: stockSyncedCount,
      nextCron: "22:00 JST 每日",
      errorMessage: null,
      apiEndpoint: "/api/sync/jquants",
      isAsync: true,
      extra: {},
    },
    {
      id: "daily_price",
      taskName: "DailyPrice",
      icon: "◉",
      description: "日线价格历史，近90天（J-Quants DailyBar API）",
      status:
        dailyPriceCount > 5_000_000
          ? "REAL"
          : dailyPriceCount > 0
          ? "PARTIAL"
          : "NEVER_SYNCED",
      source: "jquants",
      lastSyncedAt: lastSync.jquants?.createdAt?.toISOString() ?? null,
      latestDate: isoDate(dailyPriceLatest?.date ?? null),
      ageDays: dailyAge,
      rowsInserted: lastSync.jquants?.itemCount ?? null,
      totalCount: dailyPriceCount,
      coveredSymbols: null,
      nextCron: "06:00 JST 每日",
      errorMessage:
        dailyAge != null && dailyAge > 3
          ? `最新价格已 ${dailyAge} 天（可能为非交易日）`
          : (lastSync.jquants?.status === "ERROR" ? lastSync.jquants.message : null),
      apiEndpoint: "/api/sync/jquants",
      isAsync: true,
      extra: { latestDate: dailyPriceLatest?.date },
    },
    {
      id: "financial",
      taskName: "Financial",
      icon: "◎",
      description: "季报财务数据：ROE / EPS / 营收等（J-Quants FinancialStatement API）",
      status: financialCount > 10000 ? "REAL" : financialCount > 0 ? "PARTIAL" : "NEVER_SYNCED",
      source: "jquants",
      lastSyncedAt: financialLatest?.createdAt?.toISOString() ?? null,
      latestDate: isoDate(financialLatest?.createdAt ?? null),
      ageDays: ageDays(financialLatest?.createdAt ?? null),
      rowsInserted: null,
      totalCount: financialCount,
      coveredSymbols: null,
      nextCron: "06:00 JST 每日（随 DailyPrice 一起）",
      errorMessage: null,
      apiEndpoint: "/api/sync/jquants",
      isAsync: true,
      extra: {},
    },
    {
      id: "institutional_flow",
      taskName: "InstitutionalFlow",
      icon: "◍",
      description: "JPX 投資部門別売買動向（周次，外国人 / 機関 / 個人）",
      status: !flowData
        ? "NEVER_SYNCED"
        : !isRealFlow
        ? "FALLBACK"
        : flowAge != null && flowAge > 14
        ? "STALE"
        : "REAL",
      source: flowData?.source ?? "synthetic",
      lastSyncedAt: flowData ? new Date(flowData.date).toISOString() : null,
      latestDate: isoDate(flowData?.date ?? null),
      ageDays: flowAge,
      rowsInserted: null,
      totalCount: institutionalFlowCount,
      coveredSymbols: null,
      nextCron: "16:30 JST 每周五 + 07:15 每周一（备份）",
      errorMessage:
        !isRealFlow && flowData
          ? "JPX服务器从HK不可访问，使用合成数据；流向分数基于60日收益率代理"
          : flowAge != null && flowAge > 14
          ? `最新数据 ${flowAge} 天前，数据偏旧`
          : null,
      apiEndpoint: null,
      isAsync: false,
      extra: { realSource: isRealFlow, flowSource: flowData?.source },
    },
    {
      id: "global_market",
      taskName: "GlobalMarket",
      icon: "◐",
      description: "NASDAQ / VIX / USDJPY / 日经225（Yahoo Finance globalTrendScore）",
      status: !globalMarketLatest
        ? "NEVER_SYNCED"
        : globalAge != null && globalAge > 7
        ? "STALE"
        : globalMarketLatest.source === "yahoo"
        ? "REAL"
        : "FALLBACK",
      source: globalMarketLatest?.source ?? "—",
      lastSyncedAt: globalMarketLatest ? new Date(globalMarketLatest.date).toISOString() : null,
      latestDate: isoDate(globalMarketLatest?.date ?? null),
      ageDays: globalAge,
      rowsInserted: null,
      totalCount: globalMarketLatest ? 1 : 0,
      coveredSymbols: null,
      nextCron: "05:30 JST 每日",
      errorMessage:
        globalAge != null && globalAge > 7
          ? `全球市场数据已 ${globalAge} 天，评分可能使用默认值`
          : null,
      apiEndpoint: "/api/sync/global-market",
      isAsync: false,
      extra: {
        score: globalMarketLatest?.score,
        vix: globalMarketLatest?.vix,
        nasdaqChange: globalMarketLatest?.nasdaqChange,
      },
    },
    {
      id: "kabutan_news",
      taskName: "Kabutan News",
      icon: "◌",
      description: "Kabutan / TDnet 新闻情绪分析（newsSentimentScore）",
      status:
        newsCount > 1000
          ? "REAL"
          : newsCount > 0
          ? "PARTIAL"
          : "NEVER_SYNCED",
      source: "kabutan",
      lastSyncedAt: lastSync.news?.createdAt?.toISOString() ?? null,
      latestDate: isoDate(newsLatest?.publishedAt ?? null),
      ageDays: ageDays(newsLatest?.publishedAt ?? null),
      rowsInserted: lastSync.news?.itemCount ?? null,
      totalCount: newsCount,
      coveredSymbols: null,
      nextCron: "07:00 / 12:00 / 18:00 / 22:00 JST 每日",
      errorMessage:
        lastSync.news?.status === "ERROR" ? lastSync.news.message : null,
      apiEndpoint: "/api/sync/news",
      isAsync: true,
      extra: {},
    },
    {
      id: "tdnet",
      taskName: "TDnet Disclosure",
      icon: "✦",
      description: "适时披露：财报 / 业绩修正 / 回购 / 股息（TDnet Cookie方案 ✅ REAL）",
      status: disclosureCount > 1000 ? "REAL" : disclosureCount > 0 ? "PARTIAL" : "NEVER_SYNCED",
      source: "tdnet_real",
      lastSyncedAt: lastSync.tdnet?.createdAt?.toISOString() ?? null,
      latestDate: isoDate(disclosureLatest?.publishedAt ?? null),
      ageDays: ageDays(disclosureLatest?.publishedAt ?? null),
      rowsInserted: lastSync.tdnet?.itemCount ?? null,
      totalCount: disclosureCount,
      coveredSymbols: disclosureCoveredSymbols,
      nextCron: "07:00 JST 每工作日",
      errorMessage:
        lastSync.tdnet?.status === "ERROR" ? lastSync.tdnet.message : null,
      apiEndpoint: "/api/sync/tdnet",
      isAsync: false,
      extra: {},
    },
    {
      id: "compute_scores",
      taskName: "ComputeScores + Pass2",
      icon: "★",
      description: "全市场AI评分（Pass1: 5维）+ 双门槛排名（Pass2: percentileRank / recommendationV2）",
      status: stockScoreTotal > 3000 ? "REAL" : stockScoreTotal > 0 ? "PARTIAL" : "NEVER_SYNCED",
      source: "compute_scores",
      lastSyncedAt: stockScoreLatest?.computedAt?.toISOString() ?? null,
      latestDate: isoDate(stockScoreLatest?.computedAt ?? null),
      ageDays: scoreAge,
      rowsInserted: stockScoreTotal,
      totalCount: stockScoreTotal,
      coveredSymbols: stockScoreTotal,
      nextCron: "07:30 JST 每日（TDnet同步后）",
      errorMessage:
        scoreAge != null && scoreAge > 2
          ? `评分已 ${scoreAge} 天未更新`
          : lastSync.compute_scores?.status === "ERROR"
          ? lastSync.compute_scores.message
          : null,
      apiEndpoint: "/api/sync/scores",
      isAsync: false,
      extra: {
        strongBuy: strongBuyCount,
        buy: buyCount,
        hold: holdCount,
        watch: watchCount,
        avoid: avoidCount,
        marketTemperature,
        bullRate,
      },
    },
    {
      id: "short_selling_ratio",
      taskName: "空売り比率",
      icon: "◆",
      description: "JPX 市場全体空売り比率（日次 PDF → pdftotext解析）",
      status: !shortSellLatest
        ? "NEVER_SYNCED"
        : shortSellLatest.source === "jpx_real"
        ? shortSellAge != null && shortSellAge > 5
          ? "STALE"
          : "REAL"
        : "FALLBACK",
      source: shortSellLatest?.source ?? "—",
      lastSyncedAt: lastSync.short_selling_ratio?.createdAt?.toISOString() ?? null,
      latestDate: isoDate(shortSellLatest?.date ?? null),
      ageDays: shortSellAge,
      rowsInserted: lastSync.short_selling_ratio?.itemCount ?? null,
      totalCount: shortSellCount,
      coveredSymbols: null,
      nextCron: "18:30 JST 每工作日",
      errorMessage: !shortSellLatest
        ? "尚未同步 — 运行 fetch-short-selling-ratio.ts"
        : shortSellAge != null && shortSellAge > 5
        ? `数据已 ${shortSellAge} 天，建议重新同步`
        : (lastSync.short_selling_ratio?.status === "ERROR" ? lastSync.short_selling_ratio.message : null),
      apiEndpoint: null,
      isAsync: false,
      extra: { shortSellRatio: shortSellLatest?.shortSellRatio },
    },
    {
      id: "dividend_history",
      taskName: "配当历史",
      icon: "◈",
      description: "J-Quants 5年配当记录（DivAnn / PayoutRatio / YieldRate）→ dividendScore",
      status: dividendCount > 10000 ? "REAL" : dividendCount > 0 ? "PARTIAL" : "NEVER_SYNCED",
      source: "jquants_fins",
      lastSyncedAt: lastSync.dividend_history?.createdAt?.toISOString() ?? null,
      latestDate: dividendLatest ? String(dividendLatest.year) : null,
      ageDays: dividendAge,
      rowsInserted: lastSync.dividend_history?.itemCount ?? null,
      totalCount: dividendCount,
      coveredSymbols: null,
      nextCron: "22:30 JST 每日",
      errorMessage: dividendCount === 0
        ? "无数据 — 运行 fetch-dividend-history.ts"
        : (lastSync.dividend_history?.status === "ERROR" ? lastSync.dividend_history.message : null),
      apiEndpoint: null,
      isAsync: false,
      extra: { latestYear: dividendLatest?.year },
    },
  ];

  const realCount = sources.filter((s) => s.status === "REAL").length;
  const partialCount = sources.filter((s) => s.status === "PARTIAL").length;
  const fallbackCount = sources.filter((s) => s.status === "FALLBACK" || s.status === "STALE").length;
  const failedCount = sources.filter((s) => s.status === "FAILED" || s.status === "NEVER_SYNCED").length;

  return NextResponse.json({
    sources,
    summary: {
      realCount,
      partialCount,
      fallbackCount,
      failedCount,
      lastScoreComputedAt: stockScoreLatest?.computedAt?.toISOString() ?? null,
      stockScoreTotal,
      stockScoreCovered: stockScoreTotal,
      buyCount,
      strongBuyCount,
      holdCount,
      watchCount,
      avoidCount,
      marketTemperature,
      bullRate,
      disclosureTotal: disclosureCount,
      disclosureCoveredSymbols,
    },
    recentLogs: recentLogs.map((l) => ({
      id: l.id,
      source: l.source,
      status: l.status,
      message: l.message,
      itemCount: l.itemCount,
      durationMs: l.durationMs,
      createdAt: l.createdAt.toISOString(),
    })),
  } satisfies StatusResponse);
}
