// v16.0 — AI Stock Intelligence: unified endpoint for the stock detail page
// Combines score, indicators, GPT, news, strategy, risk, historical perf, sector comparison

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcIndicators } from "@/lib/indicators";
import { classifyStrategy } from "@/lib/strategy/strategy-classifier";

export const dynamic = "force-dynamic";

const MIN_SAMPLE = 10;

type PerfStats = {
  total: number; wins: number; losses: number;
  winRate: number;
  avgReturnPct: number | null;
  avgAlphaPct: number | null;
};

function calcPerf(
  rows: { isWin: boolean | null; returnPct: number | null; alphaPct: number | null }[]
): PerfStats | null {
  if (rows.length < MIN_SAMPLE) return null;
  const wins = rows.filter(r => r.isWin === true).length;
  const withReturn = rows.filter(r => r.returnPct != null);
  const withAlpha  = rows.filter(r => r.alphaPct  != null);
  return {
    total: rows.length,
    wins,
    losses: rows.length - wins,
    winRate: Math.round((wins / rows.length) * 1000) / 10,
    avgReturnPct: withReturn.length
      ? Math.round(withReturn.reduce((s, r) => s + r.returnPct!, 0) / withReturn.length * 100) / 100
      : null,
    avgAlphaPct: withAlpha.length
      ? Math.round(withAlpha.reduce((s, r) => s + r.alphaPct!, 0)  / withAlpha.length  * 100) / 100
      : null,
  };
}

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

function deriveRisk(scoreRow: {
  actionRiskLevel: string | null; highRiskFlag: boolean;
  newsSentimentScore: number | null; fundamentalScore: number | null;
  rsi14: number | null; maTrend: string | null;
}, indicatorMaTrend: string | null, indicatorRsi: number | null): {
  overall: RiskLevel; technical: RiskLevel; news: RiskLevel; fundamental: RiskLevel; volatility: RiskLevel;
} {
  const maTrend = indicatorMaTrend ?? scoreRow.maTrend ?? "NEUTRAL";
  const rsi     = indicatorRsi ?? scoreRow.rsi14 ?? 50;

  const overall: RiskLevel = (scoreRow.actionRiskLevel as RiskLevel | null) ?? (scoreRow.highRiskFlag ? "HIGH" : "MEDIUM");

  const technical: RiskLevel = maTrend === "DEAD" ? "HIGH"
    : maTrend === "BEARISH"  ? "HIGH"
    : maTrend === "NEUTRAL"  ? "MEDIUM"
    : "LOW";

  const newsScore = scoreRow.newsSentimentScore ?? 0;
  const news: RiskLevel = newsScore < 4 ? "HIGH" : newsScore < 8 ? "MEDIUM" : "LOW";

  const fundScore = scoreRow.fundamentalScore ?? 0;
  const fundamental: RiskLevel = fundScore < 10 ? "HIGH" : fundScore < 17 ? "MEDIUM" : "LOW";

  const volatility: RiskLevel = rsi >= 75 ? "HIGH" : rsi >= 65 ? "MEDIUM" : "LOW";

  return { overall, technical, news, fundamental, volatility };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);

  // ── P1: Core parallel queries ─────────────────────────────────────────────
  const [stock, scoreRow, gptRow, dailyRec, pricesDesc] = await Promise.all([
    prisma.stock.findUnique({
      where: { symbol: decoded },
      select: {
        id: true, symbol: true, name: true, nameZh: true, nameEn: true,
        sector: true, industry: true, market: true, high52w: true, low52w: true,
      },
    }),
    prisma.stockScore.findUnique({
      where: { symbol: decoded },
      select: {
        computedAt: true, latestDate: true, latestClose: true,
        adaptiveScore: true, totalScore: true, stockStyle: true, highRiskFlag: true,
        technicalScore: true, fundamentalScore: true, moneyFlowScore: true,
        newsSentimentScore: true, globalTrendScore: true,
        recommendation: true, recommendationV2: true, recommendationReason: true,
        summaryReason: true, newsSummary: true, scoreSource: true,
        percentileRank: true, marketRank: true,
        opportunityScore: true, opportunityLabel: true,
        tradingAction: true, positionSizePct: true,
        entryLow: true, entryHigh: true, stopLoss: true, target1: true, target2: true,
        actionRiskLevel: true, actionReasons: true, actionWarnings: true,
        rsi14: true, maTrend: true, return5d: true, return20d: true, return60d: true,
        overallConfidence: true, riskOverride: true,
      },
    }),
    prisma.gPTScore.findUnique({
      where: { symbol: decoded },
      select: {
        strengths: true, risks: true, timeHorizon: true,
        summaryZh: true, summaryJa: true, summaryEn: true,
        action: true, confidence: true, finalScore: true, gptScore: true, updatedAt: true,
      },
    }),
    prisma.dailyRecommendation.findFirst({
      where: { symbol: decoded },
      orderBy: { date: "desc" },
      select: { gptRank: true, finalScore: true, summaryZh: true, recommendation: true, date: true },
    }),
    prisma.dailyPrice.findMany({
      where: { symbol: decoded },
      orderBy: { date: "desc" },
      select: { date: true, close: true, open: true, high: true, low: true, volume: true },
      take: 65,
    }),
  ]);

  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── Compute indicators ────────────────────────────────────────────────────
  let indicators = null;
  let latestVolume: number | null = null;
  let avgVolume20d: number | null = null;

  if (pricesDesc.length > 0) {
    const rows = pricesDesc.reverse().map(p => ({
      date: p.date.toISOString().split("T")[0],
      close: Number(p.close),
      open: p.open  ? Number(p.open)  : undefined,
      high: p.high  ? Number(p.high)  : undefined,
      low:  p.low   ? Number(p.low)   : undefined,
      volume: p.volume ? Number(p.volume) : undefined,
    }));
    indicators = calcIndicators(decoded, rows);
    const vols = rows.map(r => r.volume).filter((v): v is number => v != null);
    if (vols.length > 0) {
      latestVolume = vols[vols.length - 1];
      const recent20 = vols.slice(-20);
      avgVolume20d = recent20.reduce((a, b) => a + b, 0) / recent20.length;
    }
  }

  // ── P2: Dependent parallel queries ────────────────────────────────────────
  const [news, backtestRows, sectorData] = await Promise.all([
    prisma.news.findMany({
      where: { stockId: stock.id, relatedSymbolConfidence: { gte: 50 } },
      orderBy: { publishedAt: "desc" },
      take: 5,
      select: {
        id: true, title: true, url: true, source: true,
        publishedAt: true, sentiment: true, summary: true, category: true,
      },
    }),
    prisma.strategyBacktestResult.findMany({
      where: { symbol: decoded },
      select: { strategyType: true, exitReason: true, returnPct: true, alphaPct: true, isWin: true },
    }),
    stock.sector ? (async () => {
      const symbols = await prisma.stock.findMany({
        where: { sector: stock.sector },
        select: { symbol: true, name: true, nameZh: true },
        take: 200,
      });
      if (!symbols.length) return { symbols: [], scores: [] };
      const scores = await prisma.stockScore.findMany({
        where: { symbol: { in: symbols.map(s => s.symbol) }, adaptiveScore: { not: null } },
        orderBy: { adaptiveScore: "desc" },
        select: { symbol: true, adaptiveScore: true, recommendationV2: true },
        take: 50,
      });
      return { symbols, scores };
    })() : Promise.resolve({ symbols: [] as { symbol: string; name: string; nameZh: string | null }[], scores: [] as { symbol: string; adaptiveScore: number | null; recommendationV2: string | null }[] }),
  ]);

  // ── Strategy classification ────────────────────────────────────────────────
  const stratResult = scoreRow ? classifyStrategy({
    tradingAction:    scoreRow.tradingAction,
    technicalScore:   scoreRow.technicalScore,
    fundamentalScore: scoreRow.fundamentalScore,
    moneyFlowScore:   scoreRow.moneyFlowScore,
    adaptiveScore:    scoreRow.adaptiveScore,
    rsi14:            scoreRow.rsi14,
    maTrend:          scoreRow.maTrend,
    stockStyle:       scoreRow.stockStyle,
    highRiskFlag:     scoreRow.highRiskFlag ?? false,
    overallConfidence:scoreRow.overallConfidence,
    recommendation:   scoreRow.recommendationV2,
  }) : null;

  // ── Historical performance ────────────────────────────────────────────────
  const completedRows = backtestRows.filter(
    r => r.exitReason !== "OPEN" && r.exitReason !== "INSUFFICIENT_DATA"
  );
  const historicalPerf = {
    sampleCount: completedRows.length,
    overall:  calcPerf(completedRows),
    byStrategy: {
      DAY:      calcPerf(completedRows.filter(r => r.strategyType === "DAY")),
      SWING:    calcPerf(completedRows.filter(r => r.strategyType === "SWING")),
      POSITION: calcPerf(completedRows.filter(r => r.strategyType === "POSITION")),
    },
  };

  // ── Risk analysis ─────────────────────────────────────────────────────────
  const riskAnalysis = scoreRow
    ? deriveRisk(scoreRow, indicators?.maTrend ?? null, indicators?.rsi14 ?? null)
    : null;

  // ── Sector comparison ─────────────────────────────────────────────────────
  let sectorComparison = null;
  if (sectorData.scores.length > 0 && scoreRow?.adaptiveScore != null) {
    const sorted = [...sectorData.scores].sort((a, b) => (b.adaptiveScore ?? 0) - (a.adaptiveScore ?? 0));
    const myRank = sorted.findIndex(s => s.symbol === decoded) + 1;
    const sectorAvg = Math.round(
      sorted.reduce((s, r) => s + (r.adaptiveScore ?? 0), 0) / sorted.length * 10
    ) / 10;
    const nameMap = new Map(sectorData.symbols.map(s => [s.symbol, { name: s.name, nameZh: s.nameZh }]));
    sectorComparison = {
      sectorAvg,
      sectorRank: myRank > 0 ? myRank : null,
      sectorTotal: sorted.length,
      myScore: scoreRow.adaptiveScore,
      topStocks: sorted.slice(0, 5).map(s => ({
        symbol: s.symbol,
        name: nameMap.get(s.symbol)?.name ?? s.symbol,
        nameZh: nameMap.get(s.symbol)?.nameZh ?? null,
        adaptiveScore: s.adaptiveScore,
        recommendation: s.recommendationV2,
        isCurrent: s.symbol === decoded,
      })),
    };
  }

  const latestClose = indicators?.latestClose ?? scoreRow?.latestClose ?? null;
  const latestDate  = indicators?.latestDate  ?? scoreRow?.latestDate  ?? null;

  return NextResponse.json({
    stock: {
      symbol: stock.symbol, name: stock.name, nameZh: stock.nameZh, nameEn: stock.nameEn,
      sector: stock.sector, industry: stock.industry, market: stock.market,
      high52w: stock.high52w, low52w: stock.low52w,
    },
    score: scoreRow ? {
      computedAt: scoreRow.computedAt?.toISOString() ?? null,
      latestClose, latestDate,
      adaptiveScore: scoreRow.adaptiveScore,
      totalScore: scoreRow.totalScore,
      technicalScore: scoreRow.technicalScore,
      fundamentalScore: scoreRow.fundamentalScore,
      moneyFlowScore: scoreRow.moneyFlowScore,
      newsSentimentScore: scoreRow.newsSentimentScore,
      globalTrendScore: scoreRow.globalTrendScore,
      recommendation: scoreRow.recommendation,
      recommendationV2: scoreRow.recommendationV2,
      recommendationReason: scoreRow.recommendationReason,
      summaryReason: scoreRow.summaryReason,
      newsSummary: scoreRow.newsSummary,
      scoreSource: scoreRow.scoreSource,
      stockStyle: scoreRow.stockStyle,
      highRiskFlag: scoreRow.highRiskFlag,
      percentileRank: scoreRow.percentileRank,
      marketRank: scoreRow.marketRank,
      opportunityScore: scoreRow.opportunityScore,
      opportunityLabel: scoreRow.opportunityLabel,
      riskLevel: scoreRow.actionRiskLevel ?? (scoreRow.highRiskFlag ? "HIGH" : "MEDIUM"),
      tradingAction: scoreRow.tradingAction,
      positionSizePct: scoreRow.positionSizePct,
      entryLow: scoreRow.entryLow,
      entryHigh: scoreRow.entryHigh,
      stopLoss: scoreRow.stopLoss,
      target1: scoreRow.target1,
      target2: scoreRow.target2,
      actionRiskLevel: scoreRow.actionRiskLevel,
      actionReasons:   (scoreRow.actionReasons  as string[]) ?? [],
      actionWarnings:  (scoreRow.actionWarnings as string[]) ?? [],
      overallConfidence: scoreRow.overallConfidence,
      riskOverride: scoreRow.riskOverride,
    } : null,
    indicators: indicators ? {
      latestDate: indicators.latestDate,
      latestClose: indicators.latestClose,
      ma5: indicators.ma5, ma20: indicators.ma20, ma60: indicators.ma60,
      rsi14: indicators.rsi14, maTrend: indicators.maTrend,
      rsiSignal: indicators.rsiSignal, macdSignalLabel: indicators.macdSignalLabel,
      return5d: indicators.return5d, return20d: indicators.return20d, return60d: indicators.return60d,
      latestVolume, avgVolume20d,
    } : null,
    gpt: gptRow ? {
      strengths: (gptRow.strengths as string[]) ?? [],
      risks:     (gptRow.risks     as string[]) ?? [],
      timeHorizon: gptRow.timeHorizon,
      summaryZh: gptRow.summaryZh, summaryJa: gptRow.summaryJa, summaryEn: gptRow.summaryEn,
      action: gptRow.action, confidence: gptRow.confidence,
      finalScore: gptRow.finalScore, gptScore: gptRow.gptScore,
      updatedAt: gptRow.updatedAt?.toISOString() ?? null,
    } : null,
    dailyRec: dailyRec ? {
      date: dailyRec.date?.toISOString().split("T")[0] ?? null,
      gptRank: dailyRec.gptRank, finalScore: dailyRec.finalScore,
      summaryZh: dailyRec.summaryZh, recommendation: dailyRec.recommendation,
    } : null,
    news: news.map(n => ({
      id: n.id, title: n.title, url: n.url, source: n.source,
      publishedAt: n.publishedAt?.toISOString() ?? null,
      sentiment: n.sentiment, summary: n.summary, category: n.category,
    })),
    strategy: { classification: stratResult ?? null },
    riskAnalysis,
    historicalPerf,
    sectorComparison,
  });
}
