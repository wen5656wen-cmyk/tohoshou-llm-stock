import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await prisma.watchList.findMany({
    orderBy: { addedAt: "desc" },
  });

  if (items.length === 0) return NextResponse.json([]);

  const symbols = items.map((i) => i.symbol);

  // Batch fetch — avoids N+1 queries
  const [scoreRows, stockRows, gptRows, rtRows] = await Promise.all([
    prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true,
        latestClose: true, latestDate: true,
        return5d: true, return20d: true, return60d: true,
        rsi14: true, maTrend: true, macdSignalLabel: true,
        technicalScore: true, fundamentalScore: true,
        moneyFlowScore: true, newsSentimentScore: true, globalTrendScore: true,
        riskScore: true, adaptiveScore: true, percentileRank: true,
        recommendationV2: true, starsLabel: true, summaryReason: true,
      },
    }),
    prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, nameZh: true, nameEn: true, high52w: true, low52w: true },
    }),
    prisma.gPTScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, gptScore: true, finalScore: true, gptRating: true, gptRank: true },
    }),
    prisma.realtimeMarket.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, volumeRatio: true, turnoverRate: true },
    }),
  ]);

  const scoreMap = new Map(scoreRows.map((s) => [s.symbol, s]));
  const stockMap = new Map(stockRows.map((s) => [s.symbol, s]));
  const gptMap   = new Map(gptRows.map((g) => [g.symbol, g]));
  const rtMap    = new Map(rtRows.map((r) => [r.symbol, r]));

  const enriched = items.map((w) => {
    const base  = scoreMap.get(w.symbol) ?? null;
    const stock = stockMap.get(w.symbol) ?? null;
    const gpt   = gptMap.get(w.symbol) ?? null;
    const rt    = rtMap.get(w.symbol) ?? null;

    const adaptiveScore   = base?.adaptiveScore ?? null;
    const finalScore      = gpt?.finalScore ?? adaptiveScore ?? 0;
    const gptScore        = gpt?.gptScore ?? null;
    const gptRank         = gpt?.gptRank ?? null;
    const gptRating       = gpt?.gptRating ?? null;
    const effectiveRating = gptRating ?? base?.recommendationV2 ?? null;

    // 52W position: (close - low52w) / (high52w - low52w) * 100
    const h52 = stock?.high52w ?? null;
    const l52 = stock?.low52w ?? null;
    const close = base?.latestClose ?? null;
    const week52Pct =
      h52 != null && l52 != null && close != null && h52 > l52
        ? Math.min(100, Math.max(0, Math.round(((close - l52) / (h52 - l52)) * 100)))
        : null;

    return {
      ...w,
      nameZh: stock?.nameZh ?? null,
      nameEn: stock?.nameEn ?? null,
      score: base
        ? {
            latestClose: base.latestClose,
            latestDate: base.latestDate,
            return5d: base.return5d,
            return20d: base.return20d,
            return60d: base.return60d,
            rsi14: base.rsi14,
            maTrend: base.maTrend,
            macdSignalLabel: base.macdSignalLabel,
            technicalScore: base.technicalScore,
            fundamentalScore: base.fundamentalScore,
            moneyFlowScore: base.moneyFlowScore,
            newsSentimentScore: base.newsSentimentScore,
            globalTrendScore: base.globalTrendScore,
            riskScore: base.riskScore,
            adaptiveScore,
            percentileRank: base.percentileRank,
            recommendationV2: base.recommendationV2,
            starsLabel: base.starsLabel,
            summaryReason: base.summaryReason,
            finalScore,
            gptScore,
            gptRank,
            gptRating,
            effectiveRating,
            volumeRatio: rt?.volumeRatio ?? null,
            turnoverRate: rt?.turnoverRate ?? null,
            week52Pct,
          }
        : null,
    };
  });

  // Sort: finalScore DESC → gptRank ASC (null gptRank sorted last)
  enriched.sort((a, b) => {
    const fa = a.score?.finalScore ?? 0;
    const fb = b.score?.finalScore ?? 0;
    if (Math.abs(fb - fa) > 0.01) return fb - fa;
    const ra = a.score?.gptRank ?? 9999;
    const rb = b.score?.gptRank ?? 9999;
    return ra - rb;
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, name, sector, market, note, targetPrice } = body;

  if (!symbol || !name) {
    return NextResponse.json({ error: "symbol and name required" }, { status: 400 });
  }

  const item = await prisma.watchList.upsert({
    where: { symbol },
    update: { note, targetPrice: targetPrice ?? null },
    create: { symbol, name, sector, market, note, targetPrice: targetPrice ?? null },
  });

  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  await prisma.watchList.deleteMany({ where: { symbol } });
  return NextResponse.json({ ok: true });
}
