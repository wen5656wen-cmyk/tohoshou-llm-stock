import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { THEME_META, THEME_ORDER } from "@/app/api/ai-theme/route";

export const dynamic = "force-dynamic";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const LAYER_ORDER = ["UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "INFRASTRUCTURE", "APPLICATION"];
const LAYER_LABELS: Record<string, { zh: string; desc: string }> = {
  UPSTREAM:       { zh: "上游", desc: "材料・零部件・芯片设计" },
  MIDSTREAM:      { zh: "中游", desc: "设备・测试・封装" },
  DOWNSTREAM:     { zh: "下游", desc: "系统・解决方案" },
  INFRASTRUCTURE: { zh: "基础设施", desc: "网络・DC・电力" },
  APPLICATION:    { zh: "应用层", desc: "软件・服务・终端" },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ theme: string }> }
) {
  const { theme } = await params;
  const themeKey = theme.toUpperCase();

  if (!THEME_ORDER.includes(themeKey)) {
    return NextResponse.json({ error: "Unknown theme" }, { status: 404 });
  }

  try {
    const themeRows = await prisma.aITheme.findMany({
      where: { theme: themeKey },
      select: {
        symbol: true, theme: true, subTheme: true, role: true,
        supplyChainLayer: true, importanceScore: true,
        isCore: true, reason: true, riskNote: true,
      },
      orderBy: [{ isCore: "desc" }, { importanceScore: "desc" }],
    });

    const symbols = themeRows.map((r) => r.symbol);
    const scores = await prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true, name: true, nameZh: true, market: true, sector: true,
        latestClose: true, latestDate: true,
        return5d: true, return20d: true, return60d: true,
        adaptiveScore: true, totalScore: true,
        recommendationV2: true, recommendation: true,
        percentileRank: true, marketRank: true,
        opportunityScore: true, opportunityLabel: true,
        dividendScore: true, catalystScore: true,
        highRiskFlag: true, scoreSource: true,
        summaryReason: true, starsLabel: true,
        technicalScore: true, fundamentalScore: true,
        moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true,
        computedAt: true,
      },
    });
    const scoreMap = new Map(scores.map((s) => [s.symbol, s]));

    // GPTScore join for finalScore
    const gptRows = await prisma.gPTScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, finalScore: true, ruleScore: true, gptScore: true },
    });
    const gptScoreMap = new Map(gptRows.map((g) => [g.symbol, g]));

    // Unscored fallback
    const unscoredSyms = symbols.filter((s) => !scoreMap.has(s));
    const basicRows = unscoredSyms.length
      ? await prisma.stock.findMany({
          where: { symbol: { in: unscoredSyms } },
          select: { symbol: true, name: true, nameZh: true, market: true },
        })
      : [];
    const basicMap = new Map(basicRows.map((r) => [r.symbol, r]));

    const stocks = themeRows.map((tr) => {
      const sc = scoreMap.get(tr.symbol);
      const ba = basicMap.get(tr.symbol);
      return {
        symbol: tr.symbol,
        name: sc?.name ?? ba?.name ?? tr.symbol,
        nameZh: sc?.nameZh ?? ba?.nameZh ?? null,
        market: sc?.market ?? ba?.market ?? null,
        latestClose: sc?.latestClose ?? null,
        return5d: sc?.return5d ?? null,
        return20d: sc?.return20d ?? null,
        adaptiveScore: sc?.adaptiveScore ?? null,
        finalScore: gptScoreMap.get(tr.symbol)?.finalScore ?? null,
        ruleScore: gptScoreMap.get(tr.symbol)?.ruleScore ?? null,
        gptScore: gptScoreMap.get(tr.symbol)?.gptScore ?? null,
        totalScore: sc?.totalScore ?? null,
        recommendationV2: sc?.recommendationV2 ?? null,
        percentileRank: sc?.percentileRank ?? null,
        marketRank: sc?.marketRank ?? null,
        opportunityScore: sc?.opportunityScore ?? null,
        opportunityLabel: sc?.opportunityLabel ?? null,
        dividendScore: sc?.dividendScore ?? null,
        catalystScore: sc?.catalystScore ?? null,
        highRiskFlag: sc?.highRiskFlag ?? false,
        scoreSource: sc?.scoreSource ?? null,
        summaryReason: sc?.summaryReason ?? null,
        technicalScore: sc?.technicalScore ?? null,
        fundamentalScore: sc?.fundamentalScore ?? null,
        moneyFlowScore: sc?.moneyFlowScore ?? null,
        newsSentimentScore: sc?.newsSentimentScore ?? null,
        globalTrendScore: sc?.globalTrendScore ?? null,
        // theme metadata
        subTheme: tr.subTheme,
        role: tr.role,
        supplyChainLayer: tr.supplyChainLayer,
        importanceScore: tr.importanceScore,
        isCore: tr.isCore,
        reason: tr.reason,
        riskNote: tr.riskNote,
        scored: !!sc,
      };
    });

    // Group by supply chain layer
    const byLayer: Record<string, typeof stocks> = {};
    for (const lk of LAYER_ORDER) {
      byLayer[lk] = stocks.filter((s) => s.supplyChainLayer === lk);
    }

    // Theme stats
    const scored = stocks.filter((s) => s.scored);
    const buyCount = scored.filter(
      (s) => s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY"
    ).length;
    const avgScore = scored.length
      ? Math.round(scored.reduce((a, s) => a + (s.finalScore ?? s.adaptiveScore ?? 0), 0) / scored.length)
      : 0;
    const coreCount = stocks.filter((s) => s.isCore).length;

    const meta = THEME_META[themeKey];
    return NextResponse.json({
      theme: themeKey,
      meta: { ...meta, label: meta?.label ?? themeKey },
      stocks,
      byLayer,
      layerLabels: LAYER_LABELS,
      stats: {
        total: stocks.length,
        scoredCount: scored.length,
        coreCount,
        buyCount,
        avgScore,
      },
    });
  } catch (e) {
    console.error(`[/api/ai-theme/${themeKey}]`, e);
    return NextResponse.json({ error: "Failed to load theme detail" }, { status: 500 });
  }
}
