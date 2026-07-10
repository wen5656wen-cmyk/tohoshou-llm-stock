import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/closing-decision — Closing Decision（P6-T12 收盘决策）
// 只读返回最新（或 ?date=）持久化决策：结论 / 第一推荐 / 建仓组合 / Top10 / 总结。
// **纯读**：不重算、不调用 GPT/Yahoo（页面加载速度优先，展示 15:15 决策快照）；不写任何表。
export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateArg = url.searchParams.get("date");

  const row = dateArg
    ? await prisma.closingDecision.findUnique({ where: { date: new Date(`${dateArg}T00:00:00.000Z`) } })
    : await prisma.closingDecision.findFirst({ orderBy: { date: "desc" } });

  const available = await prisma.closingDecision.findMany({
    orderBy: { date: "desc" }, take: 30, select: { date: true },
  });
  const availableDates = available.map((r) => r.date.toISOString().slice(0, 10));

  if (!row) {
    return NextResponse.json({
      ok: true, empty: true, note: "尚无收盘决策（等待 15:15 JST cron 生成，或手动 npm run closing-decision）",
      availableDates,
    });
  }

  return NextResponse.json({
    ok: true, empty: false,
    date: row.date.toISOString().slice(0, 10),
    computedAt: row.computedAt.toISOString(),
    decidedAtJst: row.decidedAtJst,
    verdict: row.verdict,
    verdictReason: row.verdictReason,
    market: {
      regime: row.regime, regimeScore: row.regimeScore, trend: row.marketTrend, volatility: row.volatility,
      avgAiScore: row.avgAiScore, avgRiskScore: row.avgRiskScore,
      buyZoneHitRate: row.buyZoneHitRate, breakoutRatio: row.breakoutRatio,
      newsRiskCount: row.newsRiskCount, qualifiedCount: row.qualifiedCount, opportunity: row.opportunity,
    },
    top1: row.top1Symbol ? {
      symbol: row.top1Symbol, name: row.top1Name, aiScore: row.top1AiScore, gptScore: row.top1GptScore,
      price: row.top1Price, changePct: row.top1ChangePct,
      entryLow: row.top1EntryLow, entryHigh: row.top1EntryHigh,
      target1: row.top1Target1, target2: row.top1Target2, stopLoss: row.top1StopLoss,
      holdPeriod: row.top1HoldPeriod, confidence: row.top1Confidence,
    } : null,
    portfolio: (row.portfolio as unknown[]) ?? [],
    portfolioNote: row.portfolioNote,
    top10: (row.top10 as unknown[]) ?? [],
    summary: row.summary,
    pushText: row.pushText,
    meta: {
      gptModel: row.gptModel, universeCount: row.universeCount, shortlistCount: row.shortlistCount,
      gptAnalyzed: row.gptAnalyzed, elapsedMs: row.elapsedMs,
    },
    availableDates,
  });
}
