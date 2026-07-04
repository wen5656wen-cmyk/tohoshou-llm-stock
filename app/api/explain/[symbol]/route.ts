import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildExplain, type ScoreSnapshot, type RegimeSnapshot, type ExplainProviderKind } from "@/lib/explain";

export const dynamic = "force-dynamic";

// GET /api/explain/[symbol] — 统一 AI 决策解释（只读 StockScore + MarketRegime，绝不重算）。
// 全站唯一 Explain 入口（P5-T1）。?provider=rule|gpt|hybrid（默认 rule，不调 GPT）。
export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);
  const { searchParams } = new URL(req.url);
  const providerParam = searchParams.get("provider");
  const provider = (["rule", "gpt", "hybrid"] as const).includes(providerParam as ExplainProviderKind)
    ? (providerParam as ExplainProviderKind)
    : undefined;

  // ── 只读评分快照 ──
  const row = await prisma.stockScore.findUnique({ where: { symbol } });
  const regimeRow = await prisma.marketRegime.findFirst({ orderBy: { date: "desc" } });

  const score: ScoreSnapshot | null = row
    ? {
        symbol: row.symbol, name: row.name, nameZh: row.nameZh, sector: row.sector,
        latestDate: row.latestDate, latestClose: row.latestClose,
        technicalScore: row.technicalScore, fundamentalScore: row.fundamentalScore,
        moneyFlowScore: row.moneyFlowScore, newsSentimentScore: row.newsSentimentScore,
        globalTrendScore: row.globalTrendScore, riskScore: row.riskScore,
        adaptiveScore: row.adaptiveScore, percentileRank: row.percentileRank,
        recommendationV2: row.recommendationV2, recommendationReason: row.recommendationReason,
        stockStyle: row.stockStyle, highRiskFlag: row.highRiskFlag,
        opportunityScore: row.opportunityScore, opportunityLabel: row.opportunityLabel,
        catalystScore: row.catalystScore, ruleConfidence: row.ruleConfidence,
        tradingAction: row.tradingAction, positionSizePct: row.positionSizePct,
        actionRiskLevel: row.actionRiskLevel, actionReasons: row.actionReasons, actionWarnings: row.actionWarnings,
        fxSensitivity: row.fxSensitivity, summaryReason: row.summaryReason, newsSummary: row.newsSummary,
        return5d: row.return5d, return20d: row.return20d, return60d: row.return60d,
        rsi14: row.rsi14, maTrend: row.maTrend,
      }
    : null;

  const regime: RegimeSnapshot | null = regimeRow
    ? { regime: regimeRow.regime, regimeScore: regimeRow.regimeScore, breadth: regimeRow.breadth, volatility: regimeRow.volatility, date: regimeRow.date.toISOString().slice(0, 10) }
    : null;

  const result = buildExplain({ symbol, score, regime }, { provider });
  return NextResponse.json(result);
}
