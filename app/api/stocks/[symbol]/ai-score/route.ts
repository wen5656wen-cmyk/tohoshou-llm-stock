import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcIndicators } from "@/lib/indicators";
import { calcAiScore, type ScoreInput } from "@/lib/ai-score";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  const stock = await prisma.stock.findUnique({
    where: { symbol },
    select: { id: true, symbol: true, name: true, nameZh: true },
  });
  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const pricesDesc = await prisma.dailyPrice.findMany({
    where: { symbol },
    orderBy: { date: "desc" },
    select: { date: true, close: true },
    take: 300,
  });
  if (pricesDesc.length === 0) {
    return NextResponse.json({ error: "No price data" }, { status: 404 });
  }

  const prices = pricesDesc.reverse().map((p) => ({
    date: p.date.toISOString().split("T")[0],
    close: Number(p.close),
  }));
  const ind = calcIndicators(symbol, prices);

  const [fins, div, recentNews] = await Promise.all([
    prisma.financial.findMany({
      where: { stockId: stock.id },
      orderBy: [{ fiscalYear: "desc" }, { quarter: "asc" }],
      take: 8,
      select: {
        revenue: true, operatingProfit: true, netProfit: true,
        totalAssets: true, equity: true, eps: true, equityRatio: true,
      },
    }),
    prisma.dividend.findFirst({
      where: { symbol },
      orderBy: { year: "desc" },
      select: { dividend: true, yieldRate: true },
    }),
    prisma.news.findMany({
      where: {
        stockId: stock.id,
        relatedSymbolConfidence: { gte: 70 },
        publishedAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      select: { sentiment: true },
    }),
  ]);

  const best = fins.find((f) => f.revenue !== null && f.netProfit !== null) ?? fins[0] ?? null;
  const positiveNewsCount = recentNews.filter((n) => n.sentiment === "POSITIVE").length;
  const negativeNewsCount = recentNews.filter((n) => n.sentiment === "NEGATIVE").length;
  const totalNewsCount = recentNews.length;

  const input: ScoreInput = {
    symbol: stock.symbol,
    name: stock.name,
    latestClose: ind.latestClose,
    latestDate: ind.latestDate,
    ma5: ind.ma5, ma20: ind.ma20, ma60: ind.ma60,
    rsi14: ind.rsi14,
    macd: ind.macd, macdSignal: ind.macdSignal, macdHist: ind.macdHist,
    return5d: ind.return5d, return20d: ind.return20d, return60d: ind.return60d,
    maTrend: ind.maTrend,
    macdSignalLabel: ind.macdSignalLabel,
    revenue: best ? Number(best.revenue ?? 0) || null : null,
    operatingProfit: best ? Number(best.operatingProfit ?? 0) || null : null,
    netProfit: best ? Number(best.netProfit ?? 0) || null : null,
    totalAssets: best ? Number(best.totalAssets ?? 0) || null : null,
    equity: best ? Number(best.equity ?? 0) || null : null,
    eps: best ? Number(best.eps ?? 0) || null : null,
    equityRatio: best ? Number(best.equityRatio ?? 0) || null : null,
    financialCount: fins.length,
    divAnn: div ? Number(div.dividend) : null,
    divYieldRate: div?.yieldRate ? Number(div.yieldRate) : null,
    positiveNewsCount,
    negativeNewsCount,
    totalNewsCount,
  };

  const score = calcAiScore(input);
  return NextResponse.json({ ...score, nameZh: stock.nameZh ?? null });
}
