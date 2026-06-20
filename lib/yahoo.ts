/**
 * Yahoo Finance data fetching via yahoo-finance2
 * Works without API key for most data.
 */

import { yahooFinance } from "@/lib/yahooFinance";

// yahoo-finance2 v3 returns typed union results — use loose type + helper to extract numbers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawQuote = any;

function num(v: unknown): number | null {
  if (typeof v === "number" && !isNaN(v)) return v;
  return null;
}

type RawHistorical = {
  date: Date;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjClose?: number;
};

type RawNewsItem = {
  title?: string;
  link?: string;
  providerPublishTime?: Date | number;
  publisher?: string;
};

export type YahooQuote = {
  symbol: string;
  price: number;
  change: number;
  changeRate: number;
  marketCap: number | null;
  per: number | null;
  pbr: number | null;
  eps: number | null;
  bps: number | null;
  high52w: number | null;
  low52w: number | null;
  volume: number | null;
  avgVolume: number | null;
  beta: number | null;
  dividend: number | null;
};

export async function fetchQuote(symbol: string): Promise<YahooQuote> {
  const q = await yahooFinance.quote(symbol) as RawQuote;

  const mktCap = num(q.marketCap);
  const divYield = num(q.trailingAnnualDividendYield);
  return {
    symbol,
    price: num(q.regularMarketPrice) ?? 0,
    change: num(q.regularMarketChange) ?? 0,
    changeRate: num(q.regularMarketChangePercent) ?? 0,
    marketCap: mktCap != null ? mktCap / 1e8 : null, // → 億円
    per: num(q.trailingPE),
    pbr: num(q.priceToBook),
    eps: num(q.epsTrailingTwelveMonths),
    bps: num(q.bookValue),
    high52w: num(q.fiftyTwoWeekHigh),
    low52w: num(q.fiftyTwoWeekLow),
    volume: num(q.regularMarketVolume),
    avgVolume: num(q.averageDailyVolume3Month),
    beta: num(q.beta),
    dividend: divYield != null ? divYield * 100 : null,
  };
}

export type YahooHistorical = {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose: number | null;
};

export async function fetchHistorical(
  symbol: string,
  from: Date,
  to: Date
): Promise<YahooHistorical[]> {
  const results: RawHistorical[] = await yahooFinance.historical(symbol, {
    period1: from,
    period2: to,
    interval: "1d",
  });

  return results.map((r) => ({
    date: r.date,
    open: r.open ?? 0,
    high: r.high ?? 0,
    low: r.low ?? 0,
    close: r.close ?? 0,
    volume: r.volume ?? 0,
    adjClose: r.adjClose ?? null,
  }));
}

export type YahooNews = {
  title: string;
  url: string;
  publishedAt: Date;
  source: string;
};

export async function fetchNews(symbol: string): Promise<YahooNews[]> {
  try {
    const result = await yahooFinance.search(symbol, {
      newsCount: 10,
      quotesCount: 0,
    });

    const newsItems = (result.news || []) as RawNewsItem[];
    return newsItems.map((n) => ({
      title: n.title || "",
      url: n.link || "",
      publishedAt: n.providerPublishTime instanceof Date
        ? n.providerPublishTime
        : n.providerPublishTime
          ? new Date((n.providerPublishTime as number) * 1000)
          : new Date(),
      source: n.publisher || "Yahoo Finance Japan",
    }));
  } catch {
    return [];
  }
}

export async function fetchMultipleQuotes(
  symbols: string[]
): Promise<YahooQuote[]> {
  const results: YahooQuote[] = [];
  for (const symbol of symbols) {
    try {
      const q = await fetchQuote(symbol);
      results.push(q);
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`Yahoo quote failed for ${symbol}:`, e);
    }
  }
  return results;
}
