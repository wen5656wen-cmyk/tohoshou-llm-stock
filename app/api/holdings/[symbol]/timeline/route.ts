import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuotesBatch } from "@/lib/yahoo";
import { runReview, shapeTimeline } from "@/lib/trading/decision-log";
import type { Quote } from "@/lib/decision-engine";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/holdings/[symbol]/timeline — 某持仓的 AI 决策/复盘时间线（P17-02）。
// 若该股仍持有且今日动作较上次有变化，懒触发一次 Daily Review（幂等），使时间线自动跟踪。
function withTimeout<T>(pr: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([pr, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const p = prisma as any;
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);
  try {
    const holding = await p.userHolding.findUnique({ where: { symbol: decoded } });
    // 仍持有 → 懒触发复盘（附属，失败不影响读取）
    if (holding) {
      const [quotes, sc] = await Promise.all([
        withTimeout(fetchQuotesBatch([decoded]), 1500, [] as any[]),
        p.stockScore.findUnique({ where: { symbol: decoded }, select: { adaptiveScore: true, actionRiskLevel: true, target1: true, stopLoss: true, rsi14: true, maTrend: true } }).catch(() => null),
      ]);
      const quote = (quotes as Quote[]).find((q) => q.symbol === decoded);
      await runReview({ symbol: decoded, name: holding.name, avgCost: holding.avgCost, quote, score: sc });
    }
    const rows = await p.tradeDecisionHistory.findMany({ where: { symbol: decoded }, orderBy: { decidedAt: "desc" }, take: 60 });
    const tl = shapeTimeline(rows);
    return NextResponse.json({ symbol: decoded, held: !!holding, ...tl });
  } catch (e: any) {
    console.error("[holdings timeline]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
