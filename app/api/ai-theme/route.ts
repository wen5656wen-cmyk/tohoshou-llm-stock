import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export const dynamic = "force-dynamic";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export const THEME_META: Record<string, { label: string; desc: string; color: string }> = {
  CHIP_DESIGN:       { label: "AI芯片设计",       desc: "日本SoC/MCU/光学半导体设计",           color: "indigo" },
  SEMI_EQUIPMENT:    { label: "AI半导体设备",      desc: "CVD/刻蚀/清洗/EUV检查装置",           color: "blue" },
  TEST_EQUIPMENT:    { label: "AI测试设备",        desc: "ATE测试仪/电子显微镜/测量装置",        color: "cyan" },
  CHIP_MATERIAL:     { label: "AI芯片材料",        desc: "硅晶圆/EUV光刻胶/封装材料",           color: "teal" },
  HBM_PACKAGING:     { label: "HBM・先进封装",     desc: "FC-BGA基板/ABF基板/封装材料",          color: "violet" },
  SENSOR_PRECISION:  { label: "AI传感器・精密",    desc: "CMOS传感器/MLCC/连接器",              color: "purple" },
  SERVER_DC:         { label: "AI服务器・DC",      desc: "AI服务器/国产云/DC运营/光纤",          color: "amber" },
  NETWORK:           { label: "AI网络通信",        desc: "光纤电缆/5G/IOWN全光网络",            color: "orange" },
  ROBOT_AUTO:        { label: "AI机器人・自动化",  desc: "工业机器人/机器视觉/FA控制",           color: "emerald" },
  SOFTWARE_CLOUD:    { label: "AI软件・云・SaaS",  desc: "AI开发平台/云会计/HR SaaS",           color: "sky" },
  INTERNET_PLATFORM: { label: "AI互联网・平台",    desc: "LINE AI/HR平台/流媒体内容",            color: "pink" },
  MEDICAL_LIFE:      { label: "AI医疗・生命科学",  desc: "AI药物发现/诊断设备/医疗平台",         color: "rose" },
  SECURITY_VISION:   { label: "AI安防・图像识别",  desc: "人脸识别/机器视觉/AI安防系统",         color: "red" },
  POWER_INFRA:       { label: "AI电力・能源",      desc: "AI DC供电/パワー电子/输电电缆",        color: "yellow" },
};

export const THEME_ORDER = [
  "CHIP_DESIGN", "SEMI_EQUIPMENT", "TEST_EQUIPMENT", "CHIP_MATERIAL",
  "HBM_PACKAGING", "SENSOR_PRECISION", "SERVER_DC", "NETWORK",
  "ROBOT_AUTO", "SOFTWARE_CLOUD", "INTERNET_PLATFORM", "MEDICAL_LIFE",
  "SECURITY_VISION", "POWER_INFRA",
];

const SCORE_SELECT = {
  symbol: true, name: true, nameZh: true, market: true, sector: true,
  // nameEn not in StockScore — enriched separately from Stock table
  latestClose: true, latestDate: true,
  return5d: true, return20d: true, return60d: true,
  adaptiveScore: true, rawScore: true, totalScore: true,
  recommendationV2: true, recommendation: true,
  starsLabel: true, summaryReason: true,
  percentileRank: true, marketRank: true,
  opportunityScore: true, opportunityRank: true, opportunityLabel: true,
  technicalScore: true, fundamentalScore: true, moneyFlowScore: true,
  newsSentimentScore: true, globalTrendScore: true,
  dividendScore: true, catalystScore: true,
  stockStyle: true, highRiskFlag: true, fxSensitivity: true,
  scoreSource: true, shortSellingSource: true,
  computedAt: true,
} as const;

export type AiThemeStock = {
  symbol: string;
  name: string;
  nameZh: string | null;
  nameEn: string | null;
  market: string | null;
  sector: string | null;
  latestClose: number | null;
  latestDate: string | null;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  adaptiveScore: number | null;
  finalScore: number | null;
  ruleScore: number | null;
  gptScore: number | null;
  totalScore: number | null;
  recommendationV2: string | null;
  starsLabel: string | null;
  summaryReason: string | null;
  percentileRank: number | null;
  marketRank: number | null;
  opportunityScore: number | null;
  opportunityLabel: string | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  moneyFlowScore: number | null;
  newsSentimentScore: number | null;
  globalTrendScore: number | null;
  dividendScore: number | null;
  catalystScore: number | null;
  stockStyle: string | null;
  highRiskFlag: boolean;
  scoreSource: string | null;
  // theme metadata from AITheme
  theme: string;
  subTheme: string | null;
  role: string | null;
  supplyChainLayer: string | null;
  importanceScore: number;
  isCore: boolean;
  reason: string | null;
  riskNote: string | null;
  scored: boolean;
};

export async function GET() {
  try {
    const themeRows = await prisma.aITheme.findMany({
      select: {
        symbol: true, theme: true, subTheme: true, role: true,
        supplyChainLayer: true, importanceScore: true,
        isCore: true, reason: true, riskNote: true,
      },
    });

    if (themeRows.length === 0) {
      return NextResponse.json({ stocks: [], themes: [], summary: { totalStocks: 0 } });
    }

    const allSymbols = [...new Set(themeRows.map((r) => r.symbol))];

    // Fetch scores for all symbols
    const scores = await prisma.stockScore.findMany({
      where: { symbol: { in: allSymbols } },
      select: SCORE_SELECT,
      orderBy: { adaptiveScore: "desc" },
    });
    const scoreMap = new Map(scores.map((s) => [s.symbol, s]));

    // GPTScore join for finalScore
    const gptRows = await prisma.gPTScore.findMany({
      where: { symbol: { in: allSymbols } },
      select: { symbol: true, finalScore: true, ruleScore: true, gptScore: true },
    });
    const gptScoreMap = new Map(gptRows.map((g) => [g.symbol, g]));

    // Fetch unscored basic info
    const unscoredSyms = allSymbols.filter((s) => !scoreMap.has(s));
    const basicRows = unscoredSyms.length
      ? await prisma.stock.findMany({
          where: { symbol: { in: unscoredSyms } },
          select: { symbol: true, name: true, nameZh: true, nameEn: true, market: true, sector: true },
        })
      : [];
    const basicMap = new Map(basicRows.map((r) => [r.symbol, r]));

    // Enrich all stocks with nameEn from Stock table
    const themeNameEnRows = await prisma.stock.findMany({
      where: { symbol: { in: allSymbols } },
      select: { symbol: true, nameEn: true },
    });
    const themeNameEnMap = new Map(themeNameEnRows.map((s) => [s.symbol, s.nameEn ?? null]));

    // Build expanded stock list (one row per AITheme entry)
    const stocks: AiThemeStock[] = themeRows.map((tr) => {
      const sc = scoreMap.get(tr.symbol);
      const ba = basicMap.get(tr.symbol);
      const scored = !!sc;
      return {
        symbol: tr.symbol,
        name: sc?.name ?? ba?.name ?? tr.symbol,
        nameZh: sc?.nameZh ?? ba?.nameZh ?? null,
        nameEn: themeNameEnMap.get(tr.symbol) ?? null,
        market: sc?.market ?? ba?.market ?? null,
        sector: sc?.sector ?? ba?.sector ?? null,
        latestClose: sc?.latestClose ?? null,
        latestDate: sc?.latestDate ?? null,
        return5d: sc?.return5d ?? null,
        return20d: sc?.return20d ?? null,
        return60d: sc?.return60d ?? null,
        adaptiveScore: sc?.adaptiveScore ?? null,
        finalScore: gptScoreMap.get(tr.symbol)?.finalScore ?? null,
        ruleScore: gptScoreMap.get(tr.symbol)?.ruleScore ?? null,
        gptScore: gptScoreMap.get(tr.symbol)?.gptScore ?? null,
        totalScore: sc?.totalScore ?? null,
        recommendationV2: sc?.recommendationV2 ?? null,
        starsLabel: sc?.starsLabel ?? null,
        summaryReason: sc?.summaryReason ?? null,
        percentileRank: sc?.percentileRank ?? null,
        marketRank: sc?.marketRank ?? null,
        opportunityScore: sc?.opportunityScore ?? null,
        opportunityLabel: sc?.opportunityLabel ?? null,
        technicalScore: sc?.technicalScore ?? null,
        fundamentalScore: sc?.fundamentalScore ?? null,
        moneyFlowScore: sc?.moneyFlowScore ?? null,
        newsSentimentScore: sc?.newsSentimentScore ?? null,
        globalTrendScore: sc?.globalTrendScore ?? null,
        dividendScore: sc?.dividendScore ?? null,
        catalystScore: sc?.catalystScore ?? null,
        stockStyle: sc?.stockStyle ?? null,
        highRiskFlag: sc?.highRiskFlag ?? false,
        scoreSource: sc?.scoreSource ?? null,
        theme: tr.theme,
        subTheme: tr.subTheme,
        role: tr.role,
        supplyChainLayer: tr.supplyChainLayer,
        importanceScore: tr.importanceScore,
        isCore: tr.isCore,
        reason: tr.reason,
        riskNote: tr.riskNote,
        scored,
      };
    });

    // Theme summaries
    const themes = THEME_ORDER.map((themeKey) => {
      const meta = THEME_META[themeKey];
      const group = stocks.filter((s) => s.theme === themeKey);
      const scoredG = group.filter((s) => s.scored);
      const avgScore = scoredG.length
        ? Math.round(scoredG.reduce((a, s) => a + (s.finalScore ?? s.adaptiveScore ?? 0), 0) / scoredG.length)
        : 0;
      const buyCount = scoredG.filter((s) =>
        s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY"
      ).length;
      const coreCount = group.filter((s) => s.isCore).length;
      const top3 = [...scoredG]
        .sort((a, b) => (b.finalScore ?? b.adaptiveScore ?? 0) - (a.finalScore ?? a.adaptiveScore ?? 0))
        .slice(0, 3)
        .map((s) => ({ symbol: s.symbol, name: s.name, nameZh: s.nameZh, nameEn: s.nameEn, score: s.finalScore ?? s.adaptiveScore }));
      const layers = [...new Set(group.map((s) => s.supplyChainLayer).filter(Boolean))];
      return {
        theme: themeKey,
        label: meta?.label ?? themeKey,
        desc: meta?.desc ?? "",
        color: meta?.color ?? "slate",
        count: group.length,
        scoredCount: scoredG.length,
        coreCount,
        avgScore,
        buyCount,
        top3,
        layers,
      };
    });

    // Layer summaries
    const layerKeys = ["UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "INFRASTRUCTURE", "APPLICATION"];
    const layerLabels: Record<string, string> = {
      UPSTREAM: "上游",
      MIDSTREAM: "中游",
      DOWNSTREAM: "下游",
      INFRASTRUCTURE: "基础设施",
      APPLICATION: "应用层",
    };
    const layers = layerKeys.map((lk) => {
      const g = stocks.filter((s) => s.supplyChainLayer === lk);
      const scoredG = g.filter((s) => s.scored);
      const uniqSyms = [...new Set(g.map((s) => s.symbol))];
      const avgScore = scoredG.length
        ? Math.round(scoredG.reduce((a, s) => a + (s.finalScore ?? s.adaptiveScore ?? 0), 0) / scoredG.length)
        : 0;
      return {
        layer: lk,
        label: layerLabels[lk],
        symbolCount: uniqSyms.length,
        avgScore,
        buyCount: scoredG.filter(
          (s) => s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY"
        ).length,
      };
    });

    // Overall summary
    const uniqueSyms = [...new Set(stocks.map((s) => s.symbol))];
    const scoredAll = stocks.filter((s) => s.scored);
    const uniqScored = [...new Map(scoredAll.map((s) => [s.symbol, s])).values()];
    const buyAll = uniqScored.filter(
      (s) => s.recommendationV2 === "STRONG_BUY" || s.recommendationV2 === "BUY"
    ).length;
    const avgAll = uniqScored.length
      ? Math.round(uniqScored.reduce((a, s) => a + (s.finalScore ?? s.adaptiveScore ?? 0), 0) / uniqScored.length)
      : 0;
    const topStock = uniqScored.sort((a, b) => (b.finalScore ?? b.adaptiveScore ?? 0) - (a.finalScore ?? a.adaptiveScore ?? 0))[0] ?? null;
    const coreAll = stocks.filter((s) => s.isCore).length;
    const latestAt = scores.reduce<Date | null>((acc, s) => {
      if (!acc || s.computedAt > acc) return s.computedAt;
      return acc;
    }, null);

    const summary = {
      totalStocks: themeRows.length,
      uniqueSymbols: uniqueSyms.length,
      scoredCount: [...new Set(scoredAll.map((s) => s.symbol))].length,
      coreStocks: coreAll,
      buyCount: buyAll,
      avgScore: avgAll,
      topStock: topStock
        ? { symbol: topStock.symbol, name: topStock.name, nameZh: topStock.nameZh, nameEn: topStock.nameEn, score: topStock.finalScore ?? topStock.adaptiveScore }
        : null,
      updatedAt: latestAt?.toISOString() ?? null,
    };

    return NextResponse.json({ stocks, themes, layers, summary });
  } catch (e) {
    console.error("[/api/ai-theme]", e);
    return NextResponse.json({ error: "Failed to load AI theme data" }, { status: 500 });
  }
}
