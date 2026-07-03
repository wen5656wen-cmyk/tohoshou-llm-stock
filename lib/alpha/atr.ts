/**
 * Alpha factor — Average True Range (14) + ATR% of price.
 * Independent: consumes a price-bar array only.
 */
import type { Bar } from "./index";

export type ATRFactors = {
  atr14: number | null;
  atrPct: number | null;
};

const PERIOD = 14;

export function computeATR(barsDesc: Bar[]): ATRFactors {
  if (barsDesc.length < PERIOD + 1) return { atr14: null, atrPct: null };

  let sum = 0;
  for (let i = 0; i < PERIOD; i++) {
    const cur = barsDesc[i];
    const prev = barsDesc[i + 1];
    const high = cur.high ?? cur.close;
    const low = cur.low ?? cur.close;
    const prevClose = prev.close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    sum += tr;
  }
  const atr14 = sum / PERIOD;
  const latestClose = barsDesc[0].close;
  const atrPct = latestClose > 0 ? Math.round((atr14 / latestClose) * 10000) / 100 : null;

  return { atr14: Math.round(atr14 * 100) / 100, atrPct };
}
