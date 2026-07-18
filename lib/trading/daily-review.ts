// ── Daily Holding Review Engine（P17-02A）─────────────────────────────────────
// 每日收盘后扫描全部真实持仓，逐只重算 AI Action，动作变化则追加 Decision Timeline。
// 批量读取（避免 N+1）；单只失败不影响其它（§10）；支持 reviewAll / reviewSymbol / dryRun（§12）。
// 复盘动作单一来源 = reviewHolding → deriveHoldingAction，与 GET /api/holdings 完全一致。
import { prisma } from "../prisma";
import { fetchQuotesBatch } from "../yahoo";
import { reviewHolding, nextReviewStr, type ReviewOutcome } from "./decision-log";
import type { Quote } from "../decision-engine";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ReviewSummary {
  ok: boolean; dryRun: boolean;
  reviewed: number; changed: number; skipped: number; failed: number;
  nextReview: string; results: ReviewOutcome[];
}

function withTimeout<T>(pr: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([pr, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}

export async function runDailyReview(opts: { reviewAll?: boolean; reviewSymbol?: string; dryRun?: boolean } = {}): Promise<ReviewSummary> {
  const p = prisma as any;
  const dryRun = !!opts.dryRun;
  const nextReview = nextReviewStr();

  const where = opts.reviewSymbol ? { symbol: opts.reviewSymbol } : {};
  const holdings = await p.userHolding.findMany({ where, orderBy: { openDate: "asc" } });
  if (!holdings.length) return { ok: true, dryRun, reviewed: 0, changed: 0, skipped: 0, failed: 0, nextReview, results: [] };

  const symbols: string[] = holdings.map((h: any) => h.symbol);
  // 批量读取行情 + 评分（单次查询，避免 N+1）。100 持仓一次 Yahoo 批量 + 一次 StockScore in。
  const [quotes, scores] = await Promise.all([
    withTimeout(fetchQuotesBatch(symbols), 20_000, [] as any[]),
    p.stockScore.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, adaptiveScore: true, actionRiskLevel: true, target1: true, stopLoss: true, rsi14: true, maTrend: true } }),
  ]);
  const qMap = new Map<string, Quote>((quotes as Quote[]).map((q) => [q.symbol, q]));
  const sMap = new Map<string, any>(scores.map((s: any) => [s.symbol, s]));

  const results: ReviewOutcome[] = [];
  let changed = 0, skipped = 0, failed = 0;
  for (const h of holdings) {
    // reviewHolding 内部已 try/catch 隔离；此处再兜底，确保单只异常不中断整批（§10）。
    let r: ReviewOutcome;
    try {
      r = await reviewHolding({ symbol: h.symbol, name: h.name, avgCost: h.avgCost, openDate: h.openDate, quote: qMap.get(h.symbol), score: sMap.get(h.symbol) ?? null }, dryRun);
    } catch (e) {
      r = { symbol: h.symbol, status: "failed", prevAction: null, newAction: null, reasonKey: null, aiScore: null, returnPct: null, error: (e as Error).message };
    }
    if (r.status === "changed") changed++; else if (r.status === "skipped") skipped++; else failed++;
    results.push(r);
  }
  return { ok: true, dryRun, reviewed: holdings.length, changed, skipped, failed, nextReview, results };
}
