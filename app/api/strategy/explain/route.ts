// 🔒 P21-P0-API-G2 · 访问级别：ADMIN_ONLY（内部研究 / 实验 / 回测 / 系统状态）
//
// 不属于公开市场数据，也不属于 Boss 决策读取 —— 是内部评分实验、Shadow/Freeze/
// Calibration、融合模型、Alpha 分析与回测、研究资料与 Review、系统健康与内部业绩。
// 封闭前状态：未登录公网可读（P21-P0-API 审计实测 200）。
//
// 凭证与 AUTHENTICATED 本轮相同（单租户，尚无用户体系），但**逻辑等级更高**：
// 后续拆权限时本文件应保持管理员级，不随 AUTHENTICATED 一起下放。
import { guardAdminRoute } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── T2 P3/P4 AI Explain ──────────────────────────────────────────────────────
// Read-only explanation layer over EXISTING strategy data. No LLM calls, no
// rescoring, no schema changes, no writes. Every value is traceable to a stored
// row: StrategyRecommendation / StockScore / StrategyPosition / StrategyTradeResult.
// All queries are single symbol + tradeDate — no full-table scans.
//
// P4 adds "Why Not Recommended": distinguishes four explanationType outcomes —
//   RECOMMENDED       in Top10
//   NOT_TOP10         in the recommendation pool but rank > 10
//   NOT_CANDIDATE     has a StockScore but is NOT in the strategy's pool
//   DATA_INSUFFICIENT no StockScore at all (unknown/sparse symbol)
// plus shortfalls (weak dimensions) and improvementFactors (max 5).
// ------------------------------------------------------------------------------

const VALID_STRATEGY: Record<string, boolean> = {
  DAY_TRADE: true,
  SWING_TRADE: true,
  LONG_TRADE: true,
};

// Dimension emphasis per strategy (drives reason & shortfall ordering) — spec §3/§4/§5.
const EMPHASIS: Record<string, ReasonCode[]> = {
  DAY_TRADE: ["TECH", "NEWS", "AI"],
  SWING_TRADE: ["AI", "TECH", "FLOW"],
  LONG_TRADE: ["FUND", "AI", "RISK"],
};

type ReasonCode = "TECH" | "NEWS" | "FUND" | "AI" | "FLOW" | "RISK";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Normalize a StockScore sub-score to 0-100 (its own max), so weak dimensions are
// comparable across the different native scales (tech 30 / fund 25 / flow 20 / news 15).
function normScoreDim(code: ReasonCode, s: any): number | null {
  if (!s) return null;
  switch (code) {
    case "TECH": return s.technicalScore != null ? (s.technicalScore / 30) * 100 : null;
    case "FUND": return s.fundamentalScore != null ? (s.fundamentalScore / 25) * 100 : null;
    case "FLOW": return s.moneyFlowScore != null ? (s.moneyFlowScore / 20) * 100 : null;
    case "NEWS": return s.newsSentimentScore != null ? (s.newsSentimentScore / 15) * 100 : null;
    case "AI":   return num(s.adaptiveScore);
    case "RISK": return s.riskScore != null ? (s.riskScore / 20) * 100 : null;
    default:     return null;
  }
}

export async function GET(req: NextRequest) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const strategyType = (sp.get("strategyType") ?? "").toUpperCase();
  const symbol = (sp.get("symbol") ?? "").trim();
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

    // StockScore is always fetched (single-row lookup) — it decides NOT_CANDIDATE
    // vs DATA_INSUFFICIENT when there is no recommendation row.
    const score = await (prisma as any).stockScore.findUnique({
      where: { symbol },
      select: {
        name: true, nameZh: true,
        recommendationV2: true, adaptiveScore: true,
        technicalScore: true, fundamentalScore: true, moneyFlowScore: true,
        newsSentimentScore: true, riskScore: true,
        highRiskFlag: true, return60d: true, priceCount: true, latestClose: true,
        scoreSource: true,
      },
    });

    // No recommendation data exists at all for this strategy → best we can do is
    // NOT_CANDIDATE (if the stock is scored) or DATA_INSUFFICIENT.
    if (!tradeDate) {
      return buildResponse({
        strategyType, symbol, tradeDate: null, score,
        rec: null, cutoffRec: null, totalCount: 0, position: null, tradeResult: null,
      });
    }

    const [rec, cutoffRec, totalCount, position, tradeResult] = await Promise.all([
      (prisma as any).strategyRecommendation.findUnique({
        where: { strategyType_tradeDate_symbol: { strategyType, tradeDate, symbol } },
        select: {
          rank: true, isTop10: true,
          aiScore: true, technicalScore: true, fundamentalScore: true,
          newsScore: true, moneyFlowScore: true, riskScore: true, finalScore: true,
          recommendationReason: true, sourceScoreDate: true,
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

    return buildResponse({
      strategyType, symbol, tradeDate, score, rec, cutoffRec, totalCount, position, tradeResult,
    });
  } catch (e: any) {
    console.error("[strategy/explain]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}

// ── Response builder (pure) ────────────────────────────────────────────────────
function buildResponse(ctx: {
  strategyType: string;
  symbol: string;
  tradeDate: Date | null;
  score: any;
  rec: any;
  cutoffRec: any;
  totalCount: number;
  position: any;
  tradeResult: any;
}) {
  const { strategyType, symbol, tradeDate, score, rec, cutoffRec, totalCount, position, tradeResult } = ctx;
  const found = !!rec;
  const emphasis = EMPHASIS[strategyType];

  // explanationType — the P4 authoritative outcome.
  let explanationType: "RECOMMENDED" | "NOT_TOP10" | "NOT_CANDIDATE" | "DATA_INSUFFICIENT";
  if (found) explanationType = rec.isTop10 ? "RECOMMENDED" : "NOT_TOP10";
  else if (score) explanationType = "NOT_CANDIDATE";
  else explanationType = "DATA_INSUFFICIENT";

  // ── Score breakdown (only when in the pool; from StrategyRecommendation) ──────
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

  // ── Data quality (derived purely from StockScore — no extra queries) ─────────
  const hasPrice = !!score && (score.priceCount ?? 0) > 0 && num(score.latestClose) != null;
  const hasNews = !!score && score.newsSentimentScore != null;
  const hasFundamental = !!score && score.fundamentalScore != null && (score.fundamentalScore ?? 0) > 0;
  const dataQuality = {
    hasNews,
    hasFundamental,
    hasPrice,
    scoreSource: score?.scoreSource ?? null,
  };

  // ── Normalized dimension values (0-100), source depends on pool membership ──
  const dimNorm: Record<ReasonCode, number | null> = {
    TECH: scoreBreakdown ? scoreBreakdown.technicalScore : normScoreDim("TECH", score),
    NEWS: scoreBreakdown ? scoreBreakdown.newsScore : normScoreDim("NEWS", score),
    FUND: scoreBreakdown ? scoreBreakdown.fundamentalScore : normScoreDim("FUND", score),
    AI: scoreBreakdown ? scoreBreakdown.aiScore : normScoreDim("AI", score),
    FLOW: scoreBreakdown ? scoreBreakdown.moneyFlowScore : normScoreDim("FLOW", score),
    RISK: scoreBreakdown ? scoreBreakdown.riskScore : normScoreDim("RISK", score),
  };

  // ── Reasons: positive dimension contributions, strategy-emphasis first ─────
  const reasonOrder: ReasonCode[] = [...emphasis, "AI", "TECH", "NEWS", "FUND", "FLOW"];
  const reasonSeen = new Set<ReasonCode>();
  const reasons: { code: ReasonCode; value: number }[] = [];
  if (scoreBreakdown) {
    for (const code of reasonOrder) {
      if (reasonSeen.has(code)) continue;
      reasonSeen.add(code);
      const v = dimNorm[code];
      if (v != null && v > 0) reasons.push({ code, value: v });
      if (reasons.length >= 5) break;
    }
  }

  // ── Shortfalls: weakest emphasized dimensions (normalized) ─────────────────
  let shortfalls: { code: string; value: number | null }[] = [];
  if (explanationType === "NOT_TOP10" || explanationType === "NOT_CANDIDATE") {
    const emphasized = emphasis.map((code) => ({ code, value: dimNorm[code] }));
    const weak = emphasized.filter((d) => d.value != null && (d.value as number) < 60);
    shortfalls = (weak.length > 0 ? weak : emphasized)
      .slice()
      .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
      .slice(0, 3);
    // Structural shortfalls beyond raw dimensions.
    if (strategyType === "LONG_TRADE" && explanationType === "NOT_CANDIDATE") {
      shortfalls.push({ code: "LONG_FILTER", value: null });
    }
    if (
      explanationType === "NOT_CANDIDATE" &&
      (score?.recommendationV2 === "AVOID" || score?.recommendationV2 === "WATCH")
    ) {
      shortfalls.push({ code: "WATCH", value: null });
    }
    shortfalls = shortfalls.slice(0, 5);
  }

  // ── Not-recommended metrics ─────────────────────────────────────────────
  const top10CutoffScore = num(cutoffRec?.finalScore);
  const myFinal = scoreBreakdown?.finalScore ?? null;
  const scoreGap =
    explanationType === "NOT_TOP10" && top10CutoffScore != null && myFinal != null
      ? Math.round((top10CutoffScore - myFinal) * 100) / 100
      : null;

  // ── Improvement factors (max 5, deterministic, code-based) ────────────────
  const improvementFactors: string[] = [];
  if (explanationType === "NOT_TOP10" || explanationType === "NOT_CANDIDATE") {
    const pushUnique = (c: string) => {
      if (!improvementFactors.includes(c) && improvementFactors.length < 5) improvementFactors.push(c);
    };
    // Weak dims first (mapped 1:1 to imp codes of the same suffix).
    for (const s of shortfalls) {
      if (["TECH", "NEWS", "FUND", "AI", "FLOW", "RISK"].includes(s.code)) pushUnique(s.code);
    }
    if (explanationType === "NOT_TOP10" && scoreGap != null && scoreGap > 0) pushUnique("GAP");
    if (strategyType === "LONG_TRADE" && score?.recommendationV2 !== "STRONG_BUY") pushUnique("STRONG_BUY");
    // Strategy-generic tail.
    if (strategyType === "DAY_TRADE") pushUnique("TREND");
    else if (strategyType === "SWING_TRADE") pushUnique("NOT_SWING");
    else pushUnique("WATCH");
  }

  // ── Risks: only conditions actually present in the data ────────────────────
  const risks: { code: string; value?: number }[] = [];
  if (explanationType === "DATA_INSUFFICIENT") risks.push({ code: "INSUFFICIENT" });
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
  if (score && !hasNews) risks.push({ code: "NO_NEWS" });
  if (score && !hasFundamental) risks.push({ code: "NO_FUNDAMENTAL" });
  if (score && !hasPrice) risks.push({ code: "NO_PRICE" });
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

  // ── Conclusion (badge label; aligned to explanationType) ──────────────────
  let conclusion: string;
  if (explanationType === "DATA_INSUFFICIENT") conclusion = "INSUFFICIENT";
  else if (explanationType === "NOT_CANDIDATE") conclusion = "NOT_CANDIDATE";
  else if (explanationType === "NOT_TOP10") conclusion = "NOT_TOP10";
  else if (rec.rank <= 3 || score?.recommendationV2 === "STRONG_BUY") conclusion = "STRONG";
  else conclusion = "RECOMMEND";

  const notRecommendedReason =
    explanationType === "NOT_TOP10" || explanationType === "NOT_CANDIDATE"
      ? {
          explanationType,
          rank: found ? rec.rank : null,
          totalCandidates: totalCount,
          top10CutoffScore,
          scoreGap,
          shortfalls,
          improvementFactors,
        }
      : null;

  return NextResponse.json({
    strategyType,
    symbol,
    name: score?.name ?? null,
    nameZh: score?.nameZh ?? null,
    tradeDate: tradeDate ? tradeDate.toISOString().slice(0, 10) : null,
    found,
    explanationType,
    conclusion,
    rank: found ? rec.rank : null,
    isTop10: found ? rec.isTop10 : false,
    totalCount,
    totalCandidates: totalCount,
    top10CutoffScore,
    scoreGap,
    shortfalls,
    missingReasons: shortfalls, // backward-compat alias (v17.27.0 frontend)
    improvementFactors,
    scoreBreakdown,
    adaptiveScore: num(score?.adaptiveScore),
    reasons,
    risks,
    status,
    recommendation: score?.recommendationV2 ?? null,
    recommendationReason: found ? rec.recommendationReason ?? null : null,
    notRecommendedReason,
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
}
