// ── TOHOSHOU AI · TDnet Event Feature Extractor（P6-T2）─────────────────────
// 从（现有）Disclosure 数据派生 TDnet 事件因子。**纯函数、只读、不落库、不接入任何评分**
// ——输入为 DisclosureLike[]（调用方读取，本 extractor 不访问 DB/不改 schema）。
// 影子特征值仅用于未来 Backtest/Learning 验证，未经验证禁止进入正式评分。

import { classifyTdnetEvent } from "./parser";
import {
  type DisclosureLike, type TdnetEventMatch, type TdnetEventType,
  type TdnetEventStat, type TdnetSymbolFeatures, TDNET_EVENT_TYPES,
} from "./types";

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/** 逐条公告 → 命中的事件（展开多事件）。 */
export function extractEventMatches(disclosures: DisclosureLike[]): TdnetEventMatch[] {
  const out: TdnetEventMatch[] = [];
  for (const d of disclosures) {
    for (const type of classifyTdnetEvent(d.title, d.summary)) {
      out.push({ symbol: d.symbol, type, title: d.title, publishedAt: toDate(d.publishedAt).toISOString() });
    }
  }
  return out;
}

export interface ExtractOptions {
  asOf?: Date;
  windowDays?: number;  // 统计窗口（默认 90 天）
  recentDays?: number;  // hasRecent 阈值（默认 30 天）
}

/**
 * 聚合某标的在窗口内的 TDnet 事件因子（影子）。
 * 只统计 [asOf-windowDays, asOf] 内、且 symbol 匹配的公告。
 */
export function extractSymbolFeatures(
  symbol: string,
  disclosures: DisclosureLike[],
  opts: ExtractOptions = {},
): TdnetSymbolFeatures {
  const asOf = opts.asOf ?? new Date();
  const windowDays = opts.windowDays ?? 90;
  const recentDays = opts.recentDays ?? 30;
  const winMs = windowDays * 86400_000;
  const asOfMs = asOf.getTime();

  // 初始化每个事件类型的统计 + 记录最新时间戳
  const events = {} as Record<TdnetEventType, TdnetEventStat>;
  const newestMs: Record<TdnetEventType, number | null> = {} as Record<TdnetEventType, number | null>;
  for (const t of TDNET_EVENT_TYPES) {
    events[t] = { type: t, count: 0, lastEventAt: null, daysSinceLast: null, hasRecent: false };
    newestMs[t] = null;
  }

  let total = 0;
  for (const d of disclosures) {
    if (d.symbol !== symbol) continue;
    const pubMs = toDate(d.publishedAt).getTime();
    const age = asOfMs - pubMs;
    if (age < 0 || age > winMs) continue; // 窗口外
    for (const type of classifyTdnetEvent(d.title, d.summary)) {
      events[type].count++;
      total++;
      if (newestMs[type] == null || pubMs > (newestMs[type] as number)) {
        newestMs[type] = pubMs;
      }
    }
  }

  // 定稿最近时间/距今天数/是否近期
  for (const t of TDNET_EVENT_TYPES) {
    const nm = newestMs[t];
    if (nm != null) {
      const daysSince = Math.floor((asOfMs - nm) / 86400_000);
      events[t].lastEventAt = new Date(nm).toISOString();
      events[t].daysSinceLast = daysSince;
      events[t].hasRecent = daysSince <= recentDays;
    }
  }

  return { symbol, windowDays, recentDays, asOf: asOf.toISOString(), events, totalEvents: total };
}

/** 批量：对多标的分别聚合（便于未来影子批处理）。 */
export function extractAllSymbolFeatures(
  disclosures: DisclosureLike[],
  opts: ExtractOptions = {},
): TdnetSymbolFeatures[] {
  const symbols = Array.from(new Set(disclosures.map((d) => d.symbol)));
  return symbols.map((s) => extractSymbolFeatures(s, disclosures, opts));
}
