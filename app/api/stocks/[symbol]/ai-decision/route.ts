import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcIndicators } from "@/lib/indicators";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);

  const [stock, scoreRow, gptRow, dailyRec] = await Promise.all([
    prisma.stock.findUnique({
      where: { symbol: decoded },
      select: {
        symbol: true, name: true, nameZh: true, nameEn: true,
        sector: true, industry: true, market: true,
        high52w: true, low52w: true,
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
        action: true, confidence: true, finalScore: true, gptScore: true,
        updatedAt: true,
      },
    }),
    prisma.dailyRecommendation.findFirst({
      where: { symbol: decoded },
      orderBy: { date: "desc" },
      select: { gptRank: true, finalScore: true, summaryZh: true, recommendation: true, date: true },
    }),
  ]);

  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch recent prices for fresh indicators + volume ratio
  const pricesDesc = await prisma.dailyPrice.findMany({
    where: { symbol: decoded },
    orderBy: { date: "desc" },
    select: { date: true, close: true, open: true, high: true, low: true, volume: true },
    take: 65,
  });

  let indicators = null;
  let latestVolume: number | null = null;
  let avgVolume20d: number | null = null;

  if (pricesDesc.length > 0) {
    const rows = pricesDesc.reverse().map((p) => ({
      date: p.date.toISOString().split("T")[0],
      close: Number(p.close),
      open: p.open ? Number(p.open) : undefined,
      high: p.high ? Number(p.high) : undefined,
      low: p.low ? Number(p.low) : undefined,
      volume: p.volume ? Number(p.volume) : undefined,
    }));

    const ind = calcIndicators(decoded, rows);
    indicators = ind;

    // Volume ratio from last 20 days
    const vols = rows.map((r) => r.volume).filter((v): v is number => v != null);
    if (vols.length > 0) {
      latestVolume = vols[vols.length - 1];
      const recent20 = vols.slice(-20);
      avgVolume20d = recent20.reduce((a, b) => a + b, 0) / recent20.length;
    }
  }

  // Latest 5 news
  const stockRow = await prisma.stock.findUnique({
    where: { symbol: decoded },
    select: { id: true },
  });
  const news = stockRow
    ? await prisma.news.findMany({
        where: {
          stockId: stockRow.id,
          relatedSymbolConfidence: { gte: 50 },
        },
        orderBy: { publishedAt: "desc" },
        take: 5,
        select: {
          id: true, title: true, url: true, source: true,
          publishedAt: true, sentiment: true, summary: true, category: true,
        },
      })
    : [];

  // Determine current price (prefer fresh indicator, fallback to StockScore)
  const latestClose =
    indicators?.latestClose ?? scoreRow?.latestClose ?? null;
  const latestDate =
    indicators?.latestDate ?? scoreRow?.latestDate ?? null;

  return NextResponse.json({
    stock: {
      symbol: stock.symbol,
      name: stock.name,
      nameZh: stock.nameZh,
      nameEn: stock.nameEn,
      sector: stock.sector,
      industry: stock.industry,
      market: stock.market,
      high52w: stock.high52w,
      low52w: stock.low52w,
    },
    score: scoreRow
      ? {
          computedAt: scoreRow.computedAt?.toISOString() ?? null,
          latestClose,
          latestDate,
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
          // riskLevel is not stored in StockScore; derive from actionRiskLevel or highRiskFlag
          riskLevel: scoreRow.actionRiskLevel ?? (scoreRow.highRiskFlag ? "HIGH" : "MEDIUM"),
          tradingAction: scoreRow.tradingAction,
          positionSizePct: scoreRow.positionSizePct,
          entryLow: scoreRow.entryLow,
          entryHigh: scoreRow.entryHigh,
          stopLoss: scoreRow.stopLoss,
          target1: scoreRow.target1,
          target2: scoreRow.target2,
          actionRiskLevel: scoreRow.actionRiskLevel,
          actionReasons: (scoreRow.actionReasons as string[]) ?? [],
          actionWarnings: (scoreRow.actionWarnings as string[]) ?? [],
          overallConfidence: scoreRow.overallConfidence,
          riskOverride: scoreRow.riskOverride,
        }
      : null,
    indicators: indicators
      ? {
          latestDate: indicators.latestDate,
          latestClose: indicators.latestClose,
          ma5: indicators.ma5,
          ma20: indicators.ma20,
          ma60: indicators.ma60,
          rsi14: indicators.rsi14,
          maTrend: indicators.maTrend,
          rsiSignal: indicators.rsiSignal,
          macdSignalLabel: indicators.macdSignalLabel,
          return5d: indicators.return5d,
          return20d: indicators.return20d,
          return60d: indicators.return60d,
          latestVolume,
          avgVolume20d,
        }
      : null,
    gpt: gptRow
      ? {
          strengths: (gptRow.strengths as string[]) ?? [],
          risks: (gptRow.risks as string[]) ?? [],
          timeHorizon: gptRow.timeHorizon,
          summaryZh: gptRow.summaryZh,
          summaryJa: gptRow.summaryJa,
          summaryEn: gptRow.summaryEn,
          action: gptRow.action,
          confidence: gptRow.confidence,
          finalScore: gptRow.finalScore,
          gptScore: gptRow.gptScore,
          updatedAt: gptRow.updatedAt?.toISOString() ?? null,
        }
      : null,
    dailyRec: dailyRec
      ? {
          date: dailyRec.date?.toISOString().split("T")[0] ?? null,
          gptRank: dailyRec.gptRank,
          finalScore: dailyRec.finalScore,
          summaryZh: dailyRec.summaryZh,
          recommendation: dailyRec.recommendation,
        }
      : null,
    news: news.map((n) => ({
      id: n.id,
      title: n.title,
      url: n.url,
      source: n.source,
      publishedAt: n.publishedAt?.toISOString() ?? null,
      sentiment: n.sentiment,
      summary: n.summary,
      category: n.category,
    })),
  });
}
