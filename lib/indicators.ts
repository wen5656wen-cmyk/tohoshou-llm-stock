/**
 * Technical indicator calculations based on DailyPrice data.
 * All price-based calculations (MA, RSI, MACD, returns) use adjClose (split-adjusted).
 * Fall back to close only when adjClose is absent. close is reserved for display price only.
 */

export type PriceRow = { date: Date | string; close: number; adjClose?: number | null };

/** Returns the split-adjusted effective close price for all calculations. */
export function effectiveClose(row: PriceRow): number {
  return row.adjClose ?? row.close;
}

export type IndicatorResult = {
  symbol: string;
  latestDate: string;
  latestClose: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  maTrend: "GOLDEN" | "DEAD" | "BULLISH" | "NEUTRAL" | "BEARISH";
  rsiSignal: "OVERBOUGHT" | "HIGH" | "NEUTRAL" | "LOW" | "OVERSOLD";
  macdSignalLabel: "BUY" | "NEUTRAL" | "SELL";
};

function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(prices.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcRsi(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const tail = prices.slice(prices.length - period - 1);
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < tail.length; i++) {
    const diff = tail[i] - tail[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMacd(
  prices: number[]
): { macd: number | null; signal: number | null; hist: number | null } {
  if (prices.length < 26) return { macd: null, signal: null, hist: null };
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  if (macdLine.length < 9) return { macd: null, signal: null, hist: null };
  const signalLine = ema(macdLine, 9);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  return {
    macd: lastMacd,
    signal: lastSignal,
    hist: lastMacd - lastSignal,
  };
}

function nDayReturn(prices: number[], n: number): number | null {
  if (prices.length < n + 1) return null;
  const base = prices[prices.length - 1 - n];
  const current = prices[prices.length - 1];
  if (base === 0) return null;
  return ((current - base) / base) * 100;
}

export function calcIndicators(symbol: string, rows: PriceRow[]): IndicatorResult {
  // Sort ascending by date
  const sorted = [...rows].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  // Use adjClose for all indicator calculations — prevents split events from corrupting
  // returns, MA, RSI, MACD. latestClose still returns raw close for display purposes.
  const closes = sorted.map(effectiveClose);
  const latest = sorted[sorted.length - 1];

  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const rsi14 = calcRsi(closes, 14);
  const { macd, signal: macdSignal, hist: macdHist } = calcMacd(closes);
  const return5d = nDayReturn(closes, 5);
  const return20d = nDayReturn(closes, 20);
  const return60d = nDayReturn(closes, 60);

  // MA trend: golden cross (ma5 > ma20 > ma60) vs dead cross
  let maTrend: IndicatorResult["maTrend"] = "NEUTRAL";
  if (ma5 && ma20 && ma60) {
    if (ma5 > ma20 && ma20 > ma60) maTrend = "GOLDEN";
    else if (ma5 < ma20 && ma20 < ma60) maTrend = "DEAD";
    else if (ma5 > ma20) maTrend = "BULLISH";
    else maTrend = "BEARISH";
  }

  // RSI signal
  let rsiSignal: IndicatorResult["rsiSignal"] = "NEUTRAL";
  if (rsi14 !== null) {
    if (rsi14 >= 80) rsiSignal = "OVERBOUGHT";
    else if (rsi14 >= 60) rsiSignal = "HIGH";
    else if (rsi14 <= 20) rsiSignal = "OVERSOLD";
    else if (rsi14 <= 40) rsiSignal = "LOW";
  }

  // MACD signal
  let macdSignalLabel: IndicatorResult["macdSignalLabel"] = "NEUTRAL";
  if (macd !== null && macdSignal !== null) {
    if (macd > macdSignal && macdHist !== null && macdHist > 0) macdSignalLabel = "BUY";
    else if (macd < macdSignal && macdHist !== null && macdHist < 0) macdSignalLabel = "SELL";
  }

  return {
    symbol,
    latestDate: latest ? new Date(latest.date).toISOString().split("T")[0] : "",
    latestClose: latest?.close ?? 0,
    ma5: ma5 !== null ? +ma5.toFixed(2) : null,
    ma20: ma20 !== null ? +ma20.toFixed(2) : null,
    ma60: ma60 !== null ? +ma60.toFixed(2) : null,
    rsi14: rsi14 !== null ? +rsi14.toFixed(2) : null,
    macd: macd !== null ? +macd.toFixed(4) : null,
    macdSignal: macdSignal !== null ? +macdSignal.toFixed(4) : null,
    macdHist: macdHist !== null ? +macdHist.toFixed(4) : null,
    return5d: return5d !== null ? +return5d.toFixed(2) : null,
    return20d: return20d !== null ? +return20d.toFixed(2) : null,
    return60d: return60d !== null ? +return60d.toFixed(2) : null,
    maTrend,
    rsiSignal,
    macdSignalLabel,
  };
}
