import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { yahooFinance } from "@/lib/yahooFinance";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: unknown): number | null {
  if (typeof v === "number" && !isNaN(v) && isFinite(v)) return v;
  return null;
}

function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(prices.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRsi14(prices: number[]): number | null {
  const period = 14;
  if (prices.length < period + 1) return null;
  const tail = prices.slice(prices.length - period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < tail.length; i++) {
    const diff = tail[i] - tail[i - 1];
    if (diff > 0) gains += diff; else losses += -diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("symbols") ?? "";
  const symbols = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);

  if (symbols.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch Yahoo Finance quotes + DailyPrice in parallel per symbol
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      // Yahoo Finance quote
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = null;
      try {
        q = await yahooFinance.quote(symbol);
      } catch {
        // symbol not found or network error — return partial data from DB
      }

      const price       = q ? (num(q.regularMarketPrice) ?? null)          : null;
      const changePct   = q ? (num(q.regularMarketChangePercent) ?? null)   : null;
      const volume      = q ? (num(q.regularMarketVolume) ?? null)          : null;
      const sharesOut   = q ? (num(q.sharesOutstanding) ?? null)            : null;
      const mktCap      = q ? (num(q.marketCap) != null ? num(q.marketCap)! / 1e8 : null) : null;
      const week52High  = q ? (num(q.fiftyTwoWeekHigh) ?? null)             : null;
      const week52Low   = q ? (num(q.fiftyTwoWeekLow) ?? null)              : null;
      const avgVol3m    = q ? (num(q.averageDailyVolume3Month) ?? null)     : null;

      // DailyPrice — last 65 rows for MA60 + RSI14 + avg10d volume
      const rows = await prisma.dailyPrice.findMany({
        where: { symbol },
        orderBy: { date: "desc" },
        take: 65,
        select: { close: true, adjClose: true, volume: true },
      });

      const prices = rows.map((r) => r.adjClose ?? r.close).reverse();
      const volumes = rows.map((r) => r.volume).reverse();

      const ma5  = sma(prices, 5);
      const ma20 = sma(prices, 20);
      const ma60 = sma(prices, 60);
      const rsi14 = calcRsi14(prices);

      // Avg10d volume from DailyPrice (more accurate than 3M avg for 量比)
      const vol10Slice = volumes.slice(Math.max(0, volumes.length - 10));
      const avg10dVol = vol10Slice.length > 0
        ? vol10Slice.reduce((a, b) => a + b, 0) / vol10Slice.length
        : avgVol3m;

      const volumeRatio = (volume != null && avg10dVol != null && avg10dVol > 0)
        ? volume / avg10dVol
        : null;

      const turnoverRate = (volume != null && sharesOut != null && sharesOut > 0)
        ? (volume / sharesOut) * 100
        : null;

      // Upsert to RealtimeMarket
      const data = {
        price,
        changePct,
        volume,
        volumeRatio,
        turnoverRate,
        marketCap: mktCap,
        rsi14,
        ma5,
        ma20,
        ma60,
        week52High,
        week52Low,
      };

      await prisma.realtimeMarket.upsert({
        where: { symbol },
        update: data,
        create: { symbol, ...data },
      });

      return { symbol, ...data, updatedAt: new Date().toISOString() };
    })
  );

  const output = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { symbol: symbols[i], error: String(r.reason) };
  });

  return NextResponse.json(output);
}
