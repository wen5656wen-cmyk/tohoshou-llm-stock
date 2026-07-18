// ── Decision Engine · 新鲜度与失效保护（P15-01B）─────────────────────────────
// 产 6 个分离时间戳 + stale 判定。交易时段内无实时/行情过旧 → stale=true → 全局禁执行。
import { isExecutablePhase, nextDecisionLabel } from "./phase";
import type { Freshness, Quote, MarketPhase, QuoteSource } from "./types";

const STALE_MINUTES = 15;

export interface FreshnessInput {
  quotes: Quote[];
  rankingComputedAt: string | null; // ISO（StockScore.computedAt）
  decisionComputedAt: string | null; // ISO（ClosingDecision.computedAt）
  decidedAtJst: string | null;
  holdingsUpdatedAt: string | null;  // ISO
  phase: MarketPhase;
  now: Date;
}

export function computeFreshness(i: FreshnessInput): Freshness {
  const withTime = i.quotes.filter((q) => q.price != null && q.time != null);
  const anyRealtime = withTime.length > 0;
  const maxTime = anyRealtime ? Math.max(...withTime.map((q) => q.time as number)) : null;
  const quoteUpdatedAt = maxTime != null ? new Date(maxTime).toISOString() : null;
  const quoteSource: QuoteSource = anyRealtime ? "realtime" : "EOD";

  // stale：仅在可执行交易时段判定；无实时或行情过旧 → 失效。
  let stale = false;
  let staleReason: string | null = null;
  if (isExecutablePhase(i.phase)) {
    if (!anyRealtime) {
      stale = true; staleReason = "dv.ov2.stale";
    } else if (maxTime != null) {
      const ageMin = (i.now.getTime() - maxTime) / 60000;
      if (ageMin > STALE_MINUTES) { stale = true; staleReason = "dv.ov2.stale"; }
    }
  }

  const label = nextDecisionLabel(i.now);
  return {
    quoteUpdatedAt,
    quoteSource,
    rankingUpdatedAt: i.rankingComputedAt,
    decisionUpdatedAt: i.decisionComputedAt,
    decidedAtJst: i.decidedAtJst,
    holdingsUpdatedAt: i.holdingsUpdatedAt,
    validUntil: label,
    nextDecisionAt: label,
    stale,
    staleReason,
  };
}
