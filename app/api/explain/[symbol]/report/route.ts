// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
import { guardAdminRoute } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildExplain, buildInvestmentReport,
  type ScoreSnapshot, type RegimeSnapshot, type GptSnapshot, type ClosingLevels,
} from "@/lib/explain";

export const dynamic = "force-dynamic";

// GET /api/explain/[symbol]/report — Explain 2.0 · AI 投资报告（P8-1）
// 只读复用 StockScore + MarketRegime + GPTScore + ClosingDecision(止盈止损)，绝不重算评分。
// 新增接口，不修改既有 /api/explain/[symbol] / Closing Decision / Daily Recommendation API。
export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const denied = await guardAdminRoute(_req);
  if (denied) return denied;

  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);

  const [row, regimeRow, gptRow, closing, alpha] = await Promise.all([
    prisma.stockScore.findUnique({ where: { symbol } }),
    prisma.marketRegime.findFirst({ orderBy: { date: "desc" } }),
    prisma.gPTScore.findUnique({ where: { symbol } }),
    prisma.closingDecision.findFirst({ orderBy: { date: "desc" } }),
    prisma.alphaFactor.findFirst({ where: { symbol }, orderBy: { date: "desc" }, select: { averageTurnover20: true } }),
  ]);

  if (!row) return NextResponse.json({ ok: false, error: "no score" }, { status: 404 });

  const score: ScoreSnapshot = {
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
  };

  const regime: RegimeSnapshot = regimeRow
    ? { regime: regimeRow.regime, regimeScore: regimeRow.regimeScore, breadth: regimeRow.breadth, volatility: regimeRow.volatility, date: regimeRow.date.toISOString().slice(0, 10) }
    : { regime: null, regimeScore: null, breadth: null, volatility: null, date: null };

  const gpt: GptSnapshot | null = gptRow
    ? { gptScore: gptRow.gptScore, gptRating: gptRow.gptRating, gptRank: gptRow.gptRank, confidence: gptRow.confidence }
    : null;

  // Closing Decision 止盈止损：先查 top1，再查组合 legs
  let closingLevels: ClosingLevels | null = null;
  if (closing) {
    if (closing.top1Symbol === symbol) {
      closingLevels = {
        entryLow: closing.top1EntryLow, entryHigh: closing.top1EntryHigh,
        target1: closing.top1Target1, target2: closing.top1Target2, stopLoss: closing.top1StopLoss,
        weight: null, holdPeriod: closing.top1HoldPeriod, confidence: closing.top1Confidence,
      };
    } else {
      const legs = (closing.portfolio as unknown as Array<Record<string, unknown>>) ?? [];
      const leg = Array.isArray(legs) ? legs.find((l) => l?.symbol === symbol) : null;
      if (leg) {
        closingLevels = {
          entryLow: (leg.entryLow as number) ?? null, entryHigh: (leg.entryHigh as number) ?? null,
          target1: (leg.target1 as number) ?? null, target2: null, stopLoss: (leg.stopLoss as number) ?? null,
          weight: (leg.weight as number) ?? null, holdPeriod: null, confidence: null,
        };
      }
    }
  }

  const base = buildExplain({ symbol, score, regime }, { provider: "rule" });
  const report = buildInvestmentReport(base, score, regime, gpt, closingLevels, new Date().toISOString(), {
    board: row.market, turnover: alpha?.averageTurnover20 ?? null,
  });
  return NextResponse.json({ ok: true, report });
}
