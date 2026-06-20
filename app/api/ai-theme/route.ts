import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Name fallback for symbols not yet in Stock or StockScore tables
const SYMBOL_NAME_FALLBACK: Record<string, { name: string; nameZh: string }> = {
  "9613.T": { name: "NTTデータグループ",      nameZh: "NTT Data集团" },
  "9719.T": { name: "SCSKホールディングス",    nameZh: "SCSK控股" },
};

const THEME_META: Record<string, { label: string; desc: string }> = {
  SEMICONDUCTOR:   { label: "半导体设备",       desc: "半导体制造装置与晶圆材料" },
  ELECTRONICS:     { label: "电子・传感器・精密", desc: "电子元器件、传感器、精密仪器" },
  SOFTWARE_AI:     { label: "软件・AI・云",      desc: "AI软件、云计算、SaaS平台" },
  INDUSTRIAL_AUTO: { label: "工业自动化・机器人", desc: "FA设备、工业机器人、物流自动化" },
  TELECOM_DC:      { label: "通信・数据中心",    desc: "电信运营商、AI算力基础设施" },
  TECH_SERVICES:   { label: "科技服务・互联网",  desc: "科技服务、电商、SaaS独角兽" },
};

const THEME_ORDER = [
  "SEMICONDUCTOR", "ELECTRONICS", "SOFTWARE_AI",
  "INDUSTRIAL_AUTO", "TELECOM_DC", "TECH_SERVICES",
];

export async function GET() {
  try {
    const themes = await prisma.aITheme.findMany({ select: { symbol: true, theme: true } });
    if (themes.length === 0) {
      return NextResponse.json({ stocks: [], themeSummary: [], updatedAt: null });
    }

    const symbols = themes.map((t) => t.symbol);
    const themeMap = new Map(themes.map((t) => [t.symbol, t.theme]));

    // LEFT JOIN via two queries: scored + unscored
    const scores = await prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true,
        name: true,
        nameZh: true,
        market: true,
        sector: true,
        latestClose: true,
        latestDate: true,
        return5d: true,
        return20d: true,
        totalScore: true,
        recommendation: true,
        starsLabel: true,
        summaryReason: true,
        technicalScore: true,
        fundamentalScore: true,
        moneyFlowScore: true,
        newsSentimentScore: true,
        globalTrendScore: true,
        computedAt: true,
      },
      orderBy: { totalScore: "desc" },
    });

    const scoredSymbols = new Set(scores.map((s) => s.symbol));

    // For unscored stocks, pull basic info from Stock table
    const unscoredSymbols = symbols.filter((s) => !scoredSymbols.has(s));
    const stockRows = unscoredSymbols.length > 0
      ? await prisma.stock.findMany({
          where: { symbol: { in: unscoredSymbols } },
          select: { symbol: true, name: true, nameZh: true, market: true, sector: true },
        })
      : [];
    const stockMap = new Map(stockRows.map((s) => [s.symbol, s]));

    // Build unified stock list (scored first, then unscored)
    type StockEntry = {
      symbol: string;
      name: string;
      nameZh: string | null;
      market: string | null;
      sector: string | null;
      latestClose: number | null;
      latestDate: string | null;
      return5d: number | null;
      return20d: number | null;
      totalScore: number | null;
      recommendation: string | null;
      starsLabel: string | null;
      summaryReason: string | null;
      technicalScore: number | null;
      fundamentalScore: number | null;
      moneyFlowScore: number | null;
      newsSentimentScore: number | null;
      globalTrendScore: number | null;
      theme: string;
      scored: boolean;
    };

    const stocks: StockEntry[] = [
      ...scores.map((s) => ({
        ...s,
        theme: themeMap.get(s.symbol) ?? "SEMICONDUCTOR",
        scored: true,
      })),
      // Include ALL unscored symbols, even if not in Stock table
      ...unscoredSymbols.map((sym) => {
        const info = stockMap.get(sym);
        const fallback = SYMBOL_NAME_FALLBACK[sym];
        return {
          symbol: sym,
          name: info?.name ?? fallback?.name ?? sym,
          nameZh: info?.nameZh ?? fallback?.nameZh ?? null,
          market: info?.market ?? null,
          sector: info?.sector ?? null,
          latestClose: null,
          latestDate: null,
          return5d: null,
          return20d: null,
          totalScore: null,
          recommendation: null,
          starsLabel: null,
          summaryReason: null,
          technicalScore: null,
          fundamentalScore: null,
          moneyFlowScore: null,
          newsSentimentScore: null,
          globalTrendScore: null,
          theme: themeMap.get(sym) ?? "SEMICONDUCTOR",
          scored: false,
        };
      }),
    ];

    // Theme summary
    const themeSummary = THEME_ORDER.map((themeKey) => {
      const meta = THEME_META[themeKey];
      const group = stocks.filter((s) => s.theme === themeKey);
      const scoredGroup = group.filter((s) => s.scored);
      const avgScore =
        scoredGroup.length > 0
          ? Math.round(scoredGroup.reduce((acc, s) => acc + (s.totalScore ?? 0), 0) / scoredGroup.length)
          : 0;
      const buyCount = scoredGroup.filter(
        (s) => s.recommendation === "STRONG_BUY" || s.recommendation === "BUY"
      ).length;
      const topStock = scoredGroup[0] ?? null;
      return {
        theme: themeKey,
        label: meta.label,
        desc: meta.desc,
        count: group.length,
        scoredCount: scoredGroup.length,
        avgScore,
        buyCount,
        topSymbol: topStock?.symbol ?? null,
        topScore: topStock?.totalScore ?? null,
        topName: topStock?.nameZh ?? topStock?.name ?? null,
      };
    });

    const latestUpdated = scores.reduce<Date | null>((acc, s) => {
      if (!acc || s.computedAt > acc) return s.computedAt;
      return acc;
    }, null);

    return NextResponse.json({
      stocks,
      themeSummary,
      totalCount: themes.length,
      scoredCount: scoredSymbols.size,
      updatedAt: latestUpdated?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("[/api/ai-theme]", e);
    return NextResponse.json({ error: "Failed to load AI theme data" }, { status: 500 });
  }
}
