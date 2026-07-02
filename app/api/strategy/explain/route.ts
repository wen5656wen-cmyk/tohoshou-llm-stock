import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── T2 P3 AI Explain ─────────────────────────────────────────────────────────
// Read-only explanation layer over EXISTING strategy data. No LLM calls, no
// rescoring, no schema changes, no writes. Every value is traceable to a stored
// row: StrategyRecommendation / StockScore / StrategyPosition / StrategyTradeResult.
// All queries are single symbol + tradeDate — no full-table scans.
// ------------------------------------------------------------------------------

const VALID_STRATEGY: Record<string, boolean> = {
  DAY_TRADE: true,
  SWING_TRADE: true,
  LONG_TRADE: true,
};

// Dimension emphasis per strategy (drives reason ordering) — see spec §3/§4/§5/§10
const EMPHASIS: Record<string, string[]> = {
  DAY_TRADE: ["TECH", "NEWS", "AI"],
  SWING_TRADE: ["AI", "TECH", "FLOW"],
  LONG_TRADE: ["FUND", "AI", "RISK"],
};

type ReasonCode = "TECH" | "NEWS" | "FUND" | "AI" | "FLOW";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const strategyType = (sp.get("strategyType") ?? "").toUpperCase();
  const symbol = sp.get("symbol") ?? "";
  const tradeDateParam = sp.get("tradeDate");

  if (!VALID_STRATEGY[strategyType]) {
    return NextResponse.json(
      { error: `Unknown strategyType: ${sp.get("strategyType")}` },
      { status: 400 },
    );
  }
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  try {
    // Resolve the trade date: use param if given, else the latest recommendation
    // date for this strategy (single indexed lookup).
    let tradeDate: Date | null = null;
    if (tradeDateParam) {
      const d = new Date(tradeDateParam);
      if (!Number.isNaN(d.getTime())) tradeDate = d;
    }
    if (!tradeDate) {
      const latest = await (prisma as any).strategyRecommendation.findFirst({
        where: { strategyType },
        orderBy: { tradeDate: "desc" },
        select: { tradeDate: true },
      });
      tradeDate = latest?.tradeDate ?? null;
    }

    if (!tradeDate) {
      // No recommendation data exists at all for this strategy.
      return NextResponse.json({
        strategyType,
        symbol,
        tradeDate: null,
        found: false,
        conclusion: "INSUFFICIENT",
        rank: null,
        isTop10: false,
        totalCount: 0,
        top10CutoffScore: null,
        scoreGap: null,
        scoreBreakdown: null,
        reasons: [],
        risks: [{ code: "INSUFFICIENT" }],
        status: "NOT_TOP10",
        recommendation: null,
        position: null,
        tradeResult: null,
        dataQuality: { hasNews: false, hasFundamental: false, hasPrice: false, scoreSource: null },
        generatedAt: new Date().toISOString(),
      });
    }

    // All lookups scoped to this single symbol + tradeDate.
    const [rec, score, cutoffRec, totalCount, position, tradeResult] = await Promise.all([
      (prisma as any).strategyRecommendation.findUnique({
        where: { strategyType_tradeDate_symbol: { strategyType, tradeDate, symbol } },
        select: {
          rank: true, isTop10: true,
          aiScore: true, technicalScore: true, fundamentalScore: true,
          newsScore: true, moneyFlowScore: true, riskScore: true, finalScore: true,
          recommendationReason: true, sourceScoreDate: true,
        },
      }),
      (prisma as any).stockScore.findUnique({
        where: { symbol },
        select: {
          name: true, nameZh: true,
          recommendationV2: true, adaptiveScore: true,
          technicalScore: true, fundamentalScore: true, moneyFlowScore: true,
          newsSentimentScore: true, riskScore: true,
          highRiskFlag: true, return60d: true, priceCount: true, latestClose: true,
          scoreSource: true,
        },
      }),
      // Top10 cutoff = lowest finalScore among the Top10 rows for this date.
      (prisma as any).strategyRecommendation.findFirst({
        where: { strategyType, tradeDate, isTop10: true },
        orderBy: { finalScore: "asc" },
        select: { finalScore: true, rank: true },
      }),
      (prisma as any).strategyRecommendation.count({
        where: { strategyType, tradeDate },
      }),
      // Latest position for this symbol/strategy (may be OPEN or CLOSED).
      (prisma as any).strategyPosition.findFirst({
        where: { strategyType, symbol },
        orderBy: { entryDate: "desc" },
        select: {
          status: true, holdingDays: true, returnPct: true, returnAmount: true,
          entryPrice: true, currentPrice: true, entryDate: true, exitReason: true,
        },
      }),
      (prisma as any).strategyTradeResult.findUnique({
        where: { strategyType_tradeDate_symbol: { strategyType, tradeDate, symbol } },
        select: { status: true, exitReason: true, returnPct: true, win: true },
      }),
    ]);

    const found = !!rec;

    // ── Score breakdown (from StrategyRecommendation — the ranking scores) ──────
    const scoreBreakdown = found
      ? {
          aiScore: num(rec.aiScore),
          technicalScore: num(rec.technicalScore),
          fundamentalScore: num(rec.fundamentalScore),
          newsScore: num(rec.newsScore),
          moneyFlowScore: num(rec.moneyFlowScore),
          riskScore: num(rec.riskScore),
          finalScore: num(rec.finalScore),
        }
      : null;

    // ── Data quality (derived purely from StockScore — no extra queries) ───────
    const hasPrice = !!score && (score.priceCount ?? 0) > 0 && num(score.latestClose) != null;
    const hasNews = !!score && score.newsSentimentScore != null;
    const hasFundamental = !!score && score.fundamentalScore != null && (score.fundamentalScore ?? 0) > 0;
    const dataQuality = {
      hasNews,
      hasFundamental,
      hasPrice,
      scoreSource: score?.scoreSource ?? null,
    };

    // ── Reasons: positive dimension contributions, strategy-emphasis first ─────
    const dimValue: Record<ReasonCode, number | null> = {
      TECH: scoreBreakdown ? scoreBreakdown.technicalScore : null,
      NEWS: scoreBreakdown ? scoreBreakdown.newsScore : null,
      FUND: scoreBreakdown ? scoreBreakdown.fundamentalScore : null,
      AI: scoreBreakdown ? scoreBreakdown.aiScore : null,
      FLOW: scoreBreakdown ? scoreBreakdown.moneyFlowScore : null,
    };
    const emphasis = EMPHASIS[strategyType];
    const ordered: ReasonCode[] = [
      ...emphasis.filter((c): c is ReasonCode => c in dimValue),
      ...(["AI", "TECH", "NEWS", "FUND", "FLOW"] as ReasonCode[]),
    ];
    const seen = new Set<ReasonCode>();
    const reasons: { code: ReasonCode; value: number }[] = [];
    for (const code of ordered) {
      if (seen.has(code)) continue;
      seen.add(code);
      const v = dimValue[code];
      if (v != null && v > 0) reasons.push({ code, value: v });
      if (reasons.length >= 5) break;
    }

    // ── Risks: only conditions actually present in the data ────────────────────
    const risks: { code: string; value?: number }[] = [];
    if (!found) risks.push({ code: "INSUFFICIENT" });
    const trStatus: string | null = tradeResult?.status ?? null;
    const isSkipped = typeof trStatus === "string" && trStatus.startsWith("SKIPPED");
    const isLotTooSmall =
      trStatus === "SKIPPED_LOT_SIZE" || tradeResult?.exitReason === "LOT_SIZE_TOO_SMALL";
    if (isLotTooSmall) risks.push({ code: "PRICE_TOO_HIGH" });
    else if (isSkipped) risks.push({ code: "SKIPPED" });
    if (score?.highRiskFlag) risks.push({ code: "HIGH_VOLATILITY" });
    const r60 = num(score?.return60d);
    if (r60 != null && Math.abs(r60) > 50) risks.push({ code: "LARGE_MOVE", value: r60 });
    if (scoreBreakdown && scoreBreakdown.riskScore != null && scoreBreakdown.riskScore < 0) {
      risks.push({ code: "RISK_PENALTY", value: scoreBreakdown.riskScore });
    }
    if (!hasNews) risks.push({ code: "NO_NEWS" });
    if (!hasFundamental) risks.push({ code: "NO_FUNDAMENTAL" });
    if (!hasPrice) risks.push({ code: "NO_PRICE" });
    const isOpen = position?.status === "OPEN";
    if (isOpen) risks.push({ code: "HOLDING" });
    else if (found && !isSkipped) risks.push({ code: "NOT_HOLDING" });
    if (found && !rec.isTop10) risks.push({ code: "NOT_TOP10" });

    // ── Operation status ───────────────────────────────────────────────────────
    let status: string;
    if (trStatus === "CLOSED" || position?.status === "CLOSED") status = "SOLD";
    else if (isOpen) status = "BOUGHT";
    else if (isSkipped) status = "SKIPPED";
    else if (trStatus === "WAITING_DATA" || trStatus === "WAITING_OPEN" || trStatus === "WAITING_CLOSE")
      status = "WAITING_DATA";
    else if (found && rec.isTop10) status = "RECOMMENDING";
    else status = "NOT_TOP10";

    // ── Conclusion ───────────────────────────────────────────────────────────
    let conclusion: string;
    if (!found) conclusion = "INSUFFICIENT";
    else if (rec.isTop10 && (rec.rank <= 3 || score?.recommendationV2 === "STRONG_BUY"))
      conclusion = "STRONG";
    else if (rec.isTop10) conclusion = "RECOMMEND";
    else conclusion = "NOT_TOP10";

    // ── Not-recommended fields ──────────────────────────────────────────────
    const top10CutoffScore = num(cutoffRec?.finalScore);
    const myFinal = scoreBreakdown?.finalScore ?? null;
    const scoreGap =
      found && !rec.isTop10 && top10CutoffScore != null && myFinal != null
        ? Math.round((top10CutoffScore - myFinal) * 100) / 100
        : null;

    // Missing factors = dimensions where this stock is weakest vs. its own profile
    // (lowest non-null emphasized dims). Only reported when NOT in Top10.
    let missingReasons: { code: ReasonCode; value: number | null }[] = [];
    if (found && !rec.isTop10) {
      const emphasisDims = EMPHASIS[strategyType].filter((c): c is ReasonCode => c in dimValue);
      missingReasons = emphasisDims
        .map((code) => ({ code, value: dimValue[code] }))
        .filter((d) => d.value == null || d.value <= 0)
        .slice(0, 3);
      // If every emphasized dim is positive, surface the lowest-scoring ones.
      if (missingReasons.length === 0) {
        missingReasons = emphasisDims
          .map((code) => ({ code, value: dimValue[code] }))
          .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
          .slice(0, 2);
      }
    }

    return NextResponse.json({
      strategyType,
      symbol,
      name: score?.name ?? null,
      nameZh: score?.nameZh ?? null,
      tradeDate: tradeDate.toISOString().slice(0, 10),
      found,
      conclusion,
      rank: found ? rec.rank : null,
      isTop10: found ? rec.isTop10 : false,
      totalCount,
      top10CutoffScore,
      scoreGap,
      missingReasons,
      scoreBreakdown,
      reasons,
      risks,
      status,
      recommendation: score?.recommendationV2 ?? null,
      recommendationReason: found ? rec.recommendationReason ?? null : null,
      position: position
        ? {
            status: position.status,
            holdingDays: num(position.holdingDays),
            returnPct: num(position.returnPct),
            entryPrice: num(position.entryPrice),
            currentPrice: num(position.currentPrice),
            exitReason: position.exitReason ?? null,
          }
        : null,
      tradeResult: tradeResult
        ? {
            status: tradeResult.status,
            exitReason: tradeResult.exitReason ?? null,
            returnPct: num(tradeResult.returnPct),
            win: tradeResult.win ?? null,
          }
        : null,
      dataQuality,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[strategy/explain]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
