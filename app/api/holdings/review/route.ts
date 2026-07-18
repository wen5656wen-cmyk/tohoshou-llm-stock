import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuotesBatch } from "@/lib/yahoo";
import { runReview } from "@/lib/trading/decision-log";
import type { Quote } from "@/lib/decision-engine";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */

// POST /api/holdings/review — AI 每日跟踪：对所有真实持仓重算动作，动作变化则追加复盘行（幂等）。
// 按需触发（§2 禁改 Cron）；单一来源 = deriveHoldingAction，与 GET /api/holdings 一致。
function withTimeout<T>(pr: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([pr, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}

export async function POST() {
  const p = prisma as any;
  try {
    const holdings = await p.userHolding.findMany({ orderBy: { openDate: "asc" } });
    if (!holdings.length) return NextResponse.json({ ok: true, reviewed: 0, changed: 0, results: [] });

    const symbols: string[] = holdings.map((h: any) => h.symbol);
    const [quotes, scores] = await Promise.all([
      withTimeout(fetchQuotesBatch(symbols), 3000, [] as any[]),
      p.stockScore.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, adaptiveScore: true, actionRiskLevel: true, target1: true, stopLoss: true, rsi14: true, maTrend: true } }),
    ]);
    const qMap = new Map<string, Quote>((quotes as Quote[]).map((q) => [q.symbol, q]));
    const sMap = new Map<string, any>(scores.map((s: any) => [s.symbol, s]));

    const results: any[] = [];
    let changed = 0;
    for (const h of holdings) {
      const row = await runReview({ symbol: h.symbol, name: h.name, avgCost: h.avgCost, quote: qMap.get(h.symbol), score: sMap.get(h.symbol) ?? null });
      if (row) { changed++; results.push({ symbol: h.symbol, action: row.action, reasonKey: row.reasonKey }); }
    }
    return NextResponse.json({ ok: true, reviewed: holdings.length, changed, results });
  } catch (e: any) {
    console.error("[holdings review]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
