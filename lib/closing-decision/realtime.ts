// ── TOHOSHOU AI · Closing Decision · 实时行情 + 实时指标（P6-T12）────────────
// 候选池实时覆盖：单批次 Yahoo quote 取 现价/前收/成交量/均量/流通股 →
// 派生 今日涨跌 / 量比 / 换手率；并把「今日实时价」作为当日 bar 追加到 DailyPrice
// 历史，重算 RSI14 / MACD / MA5 / MA10 / MA20（禁止直接用上午 EOD 指标）。
// **只读派生**：复用现有 yahooFinance 实例与 lib/indicators，不修改任何现有逻辑。

import { yahooFinance } from "../yahooFinance";
import { calcIndicators, type PriceRow } from "../indicators";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawQuote = any;
function num(v: unknown): number | null {
  return typeof v === "number" && !isNaN(v) ? v : null;
}

export interface RichQuote {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
  volume: number | null;
  avgVolume: number | null;
  volumeRatio: number | null; // 今日量 / 均量
  sharesOutstanding: number | null;
  turnoverRate: number | null; // 换手率 %（量 / 流通股 × 100）
  time: number | null;
  realtime: boolean;
}

/** 分块单批 Yahoo quote（默认每批 50 只），提取完整交易字段。 */
export async function fetchRichQuotes(symbols: string[], chunkSize = 50): Promise<Map<string, RichQuote>> {
  const out = new Map<string, RichQuote>();
  if (!symbols.length) return out;
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    try {
      const res = (await yahooFinance.quote(chunk)) as RawQuote;
      const arr: RawQuote[] = Array.isArray(res) ? res : [res];
      for (const q of arr) {
        const price = num(q.regularMarketPrice);
        const prev = num(q.regularMarketPreviousClose) ?? price;
        const volume = num(q.regularMarketVolume);
        const avgVolume = num(q.averageDailyVolume3Month) ?? num(q.averageDailyVolume10Day);
        const shares = num(q.sharesOutstanding);
        const raw = q.regularMarketTime;
        let time: number | null = null;
        if (raw instanceof Date) time = raw.getTime();
        else if (typeof raw === "number") time = raw < 1e12 ? raw * 1000 : raw;
        else if (typeof raw === "string") { const t = Date.parse(raw); time = isNaN(t) ? null : t; }
        out.set(String(q.symbol), {
          symbol: String(q.symbol),
          price,
          previousClose: prev,
          changePct: price != null && prev ? ((price - prev) / prev) * 100 : null,
          volume,
          avgVolume,
          volumeRatio: volume != null && avgVolume ? volume / avgVolume : null,
          sharesOutstanding: shares,
          turnoverRate: volume != null && shares ? (volume / shares) * 100 : null,
          time,
          realtime: price != null,
        });
      }
    } catch (e) {
      console.error(`fetchRichQuotes chunk ${i} failed:`, (e as Error)?.message);
    }
  }
  return out;
}

export interface RealtimeIndicators {
  rsi14: number | null;
  macdHist: number | null;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  return20d: number | null;
}

/**
 * 把今日实时价作为当日 bar 追加到历史收盘序列，重算技术指标。
 * @param history DailyPrice 历史（升序或乱序皆可），至少含 close
 * @param todayPrice 今日实时价（null → 仅用历史，等同 EOD）
 * @param todayDate 今日日期字符串 YYYY-MM-DD（用于判断是否已含当日 bar）
 */
export function recomputeRealtimeIndicators(
  symbol: string,
  history: PriceRow[],
  todayPrice: number | null,
  todayDate: string,
): RealtimeIndicators {
  const rows: PriceRow[] = [...history];
  if (todayPrice != null) {
    // 去掉历史里可能已存在的当日 bar（避免重复），再追加实时 bar
    const filtered = rows.filter((r) => String(r.date).slice(0, 10) !== todayDate);
    filtered.push({ date: todayDate, close: todayPrice, adjClose: todayPrice });
    rows.length = 0;
    rows.push(...filtered);
  }
  if (rows.length < 5) {
    return { rsi14: null, macdHist: null, ma5: null, ma10: null, ma20: null, return20d: null };
  }
  const ind = calcIndicators(symbol, rows);
  // MA10 未在 calcIndicators 中提供 → 就地计算（用 effectiveClose 序列末 10）
  const closes = [...rows]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((r) => (r.adjClose ?? r.close));
  const ma10 = closes.length >= 10 ? closes.slice(-10).reduce((a, b) => a + b, 0) / 10 : null;
  return {
    rsi14: ind.rsi14,
    macdHist: ind.macdHist,
    ma5: ind.ma5,
    ma10,
    ma20: ind.ma20,
    return20d: ind.return20d,
  };
}
