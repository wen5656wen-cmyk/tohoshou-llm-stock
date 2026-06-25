import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Types ──────────────────────────────────────────────────────────────────────

export type TrendPoint = {
  date: string;
  portfolioReturn: number;
  topixReturn: number | null;
  alpha: number | null;
};

export type TrendData = {
  cohortDate: string;
  points: TrendPoint[];
  maxDrawdown: number; // negative value e.g. -3.25 means 3.25% drawdown; 0 when insufficient data
};

// ── GET handler ────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Find latest cohort date and Top10
    const latestRec = await prisma.dailyRecommendation.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    });

    if (!latestRec) {
      return NextResponse.json({ error: "no_data" }, { status: 404 });
    }

    const cohortDate = latestRec.date;
    const cohortDateStr = cohortDate.toISOString().slice(0, 10);

    const top10 = await prisma.dailyRecommendation.findMany({
      where: { date: cohortDate, gptRank: { lte: 10 } },
      orderBy: { gptRank: "asc" },
      take: 10,
      select: {
        symbol: true,
        entryPrice: true,
        buyPrice: true,
        entryDate: true,
        gptRank: true,
      },
    });

    if (top10.length === 0) {
      return NextResponse.json({ error: "no_top10" }, { status: 404 });
    }

    const symbols = top10.map((r) => r.symbol);
    const ALLOC_PER_STOCK = 1_000_000;
    const INITIAL_CAPITAL = 10_000_000;

    // Pre-compute shares per position
    const sharesMap = new Map<string, number>();
    for (const rec of top10) {
      const entryPx = rec.entryPrice ?? rec.buyPrice ?? null;
      const shares = entryPx != null && entryPx > 0 ? Math.floor(ALLOC_PER_STOCK / entryPx) : 0;
      sharesMap.set(rec.symbol, shares);
    }

    // 2. Determine start date (earliest entryDate - 1 or cohortDate - 1)
    const entryDates = top10
      .map((r) => r.entryDate)
      .filter((d): d is Date => d != null);

    const earliestEntry = entryDates.length > 0
      ? entryDates.reduce((a, b) => (a < b ? a : b))
      : cohortDate;

    const startBase = earliestEntry < cohortDate ? earliestEntry : cohortDate;
    const startDate = new Date(startBase.getTime() - 86400000); // subtract 1 day

    // 3. Get DailyPrice for all symbols from startDate to today
    const prices = await prisma.dailyPrice.findMany({
      where: { symbol: { in: symbols }, date: { gte: startDate } },
      orderBy: [{ date: "asc" }, { symbol: "asc" }],
      select: { symbol: true, date: true, close: true, adjClose: true },
    });

    // 4. Get GlobalMarket.topix from same start date
    const topixRows = await prisma.globalMarket.findMany({
      where: { date: { gte: startDate }, topix: { not: null } },
      orderBy: { date: "asc" },
      select: { date: true, topix: true },
    });

    // Build topix map by date string
    const topixMap = new Map<string, number>();
    for (const row of topixRows) {
      topixMap.set(row.date.toISOString().slice(0, 10), row.topix!);
    }

    // Find TOPIX baseline (on/near cohortDate)
    let topixBaseline: number | null = null;
    // Nearest TOPIX on or before cohortDate
    for (const row of topixRows) {
      const d = row.date.toISOString().slice(0, 10);
      if (d <= cohortDateStr) {
        topixBaseline = row.topix!;
      }
    }

    // 5. Build price map per date per symbol
    const pricesByDate = new Map<string, Map<string, number>>();
    for (const p of prices) {
      const dateStr = p.date.toISOString().slice(0, 10);
      if (!pricesByDate.has(dateStr)) pricesByDate.set(dateStr, new Map());
      pricesByDate.get(dateStr)!.set(p.symbol, p.adjClose ?? p.close);
    }

    // 6. For each trading day, compute portfolio value
    const allDates = Array.from(pricesByDate.keys()).sort();

    const dailyValues: { date: string; value: number }[] = [];

    for (const dateStr of allDates) {
      const dayPrices = pricesByDate.get(dateStr)!;
      let portfolioValue = 0;

      for (const rec of top10) {
        const shares = sharesMap.get(rec.symbol) ?? 0;
        const px = dayPrices.get(rec.symbol);
        if (shares > 0 && px != null) {
          portfolioValue += shares * px;
        } else {
          // Use initial allocation as fallback
          portfolioValue += ALLOC_PER_STOCK;
        }
      }

      dailyValues.push({ date: dateStr, value: portfolioValue });
    }

    // 7. Build trend points as cumulative return %
    const points: TrendPoint[] = dailyValues.map(({ date, value }) => {
      const portfolioReturn = ((value - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;

      const topixCurrent = topixMap.get(date) ?? null;
      const topixReturn =
        topixBaseline != null && topixCurrent != null && topixBaseline > 0
          ? ((topixCurrent - topixBaseline) / topixBaseline) * 100
          : null;

      const alpha =
        topixReturn != null
          ? portfolioReturn - topixReturn
          : null;

      return {
        date,
        portfolioReturn: Math.round(portfolioReturn * 100) / 100,
        topixReturn: topixReturn != null ? Math.round(topixReturn * 100) / 100 : null,
        alpha: alpha != null ? Math.round(alpha * 100) / 100 : null,
      };
    });

    // 8. Compute maxDrawdown from daily values
    // Returns negative value (e.g. -3.25 = 3.25% peak-to-trough drawdown), 0 if insufficient data.
    let maxDrawdown = 0;
    if (dailyValues.length > 1) {
      let peak = dailyValues[0].value;
      let maxDD = 0;
      for (const { value } of dailyValues) {
        if (value > peak) peak = value;
        const dd = peak > 0 ? ((peak - value) / peak) * 100 : 0;
        if (dd > maxDD) maxDD = dd;
      }
      maxDrawdown = -(Math.round(maxDD * 100) / 100);
    }

    const trendData: TrendData = {
      cohortDate: cohortDateStr,
      points,
      maxDrawdown,
    };

    return NextResponse.json(trendData);
  } catch (err) {
    console.error("[portfolio/trend] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
