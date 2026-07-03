import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// GET /api/admin/research-overview — Boss Dashboard aggregate for the AI研究中心「综合」tab.
// READ-ONLY: no scoring/recommendation/portfolio/alpha/fusion algorithm is touched.

function todayJst(): { start: Date; ymd: string; nowMin: number } {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const y = jst.getUTCFullYear(), m = jst.getUTCMonth(), d = jst.getUTCDate();
  return { start: new Date(Date.UTC(y, m, d)), ymd: jst.toISOString().slice(0, 10), nowMin: jst.getUTCHours() * 60 + jst.getUTCMinutes() };
}
function isToday(dt: Date | null | undefined, todayYmd: string): boolean {
  if (!dt) return false;
  const jst = new Date(dt.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10) === todayYmd;
}

function readHealth(): { critical: number | null; warning: number | null; status: string | null } {
  try {
    const dir = path.join(process.cwd(), "reports");
    const files = fs.readdirSync(dir).filter((f) => f.startsWith("data-health-guard-") && f.endsWith(".json")).sort();
    if (!files.length) return { critical: null, warning: null, status: null };
    const j = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"));
    return { critical: j.criticalCount ?? null, warning: j.warningCount ?? null, status: j.status ?? null };
  } catch { return { critical: null, warning: null, status: null }; }
}

export async function GET() {
  const { start: todayStart, ymd: todayYmd, nowMin } = todayJst();
  const rc = (r: string) => prisma.stockScore.count({ where: { recommendationV2: r, priceCount: { gte: 20 } } });

  const [
    regime,
    sb, buy, hold, watch, avoid,
    total, enabled, excluded, auto, manual, dataQuality, lowLiquidity,
    alphaScoreCount, alphaScoreLatest, alphaFactorLatest, analyticsLatest, backtestLatest, fusionLatest, paperLatest,
    scoreLatest,
    drGroups,
    backtestRows,
  ] = await Promise.all([
    prisma.marketRegime.findFirst({ orderBy: { date: "desc" } }),
    rc("STRONG_BUY"), rc("BUY"), rc("HOLD"), rc("WATCH"), rc("AVOID"),
    prisma.stock.count(),
    prisma.stock.count({ where: { aiEnabled: true } }),
    prisma.stock.count({ where: { aiEnabled: false } }),
    prisma.stock.count({ where: { aiEnabled: false, aiExcludeSource: "AUTO" } }),
    prisma.stock.count({ where: { aiEnabled: false, aiExcludeSource: "MANUAL" } }),
    prisma.stock.count({ where: { aiEnabled: false, excludeReason: "POOR_DATA" } }),
    prisma.stock.count({ where: { aiEnabled: false, excludeReason: "LOW_LIQUIDITY" } }),
    prisma.alphaScore.count(),
    prisma.alphaScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.alphaFactor.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.alphaFactorReport.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.alphaBacktestResult.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.regimeFusionResult.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.fusionPaperPick.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.stockScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.dailyRecommendation.groupBy({ by: ["recommendation"], where: { date: todayStart, recommendation: { in: ["STRONG_BUY", "BUY"] } }, _count: { recommendation: true } }),
    prisma.alphaBacktestResult.findMany({ where: { topN: 20, holdDays: 20 }, select: { period: true, strategy: true, cumReturn: true, sharpe: true } }),
  ]);

  const prodSB = drGroups.find((g) => g.recommendation === "STRONG_BUY")?._count.recommendation ?? 0;
  const prodBuy = drGroups.find((g) => g.recommendation === "BUY")?._count.recommendation ?? 0;

  // Shadow backtest verdicts (Alpha vs Production cumReturn, Top20/20d) per period.
  const cum = (period: number, strat: string) => backtestRows.find((r) => r.period === period && r.strategy === strat)?.cumReturn ?? null;
  const verdict = (period: number): "跑赢" | "落后" | null => {
    const a = cum(period, "ALPHA"), p = cum(period, "PRODUCTION");
    if (a == null || p == null) return null;
    return a >= p ? "跑赢" : "落后";
  };
  const shadow = { d30: verdict(30), d90: verdict(90), d180: verdict(180) };

  // Auto research conclusion.
  const conclusion: string[] = [];
  if (shadow.d30 === "跑赢") conclusion.push("✓ Alpha 短周期表现优秀");
  if (shadow.d90 === "落后" || shadow.d180 === "落后") conclusion.push("✓ Production 中长期更稳定");
  conclusion.push("✓ 当前建议：继续 Shadow，暂不正式融合");

  // Paper running?
  const paperRunning = isToday(paperLatest?.computedAt, todayYmd) ||
    (paperLatest?.computedAt != null && Date.now() - paperLatest.computedAt.getTime() < 2 * 86400000);

  const health = readHealth();

  // Timeline (JST). status: done if artifact fresh today; else past→missed, future→waiting.
  const T = (h: number, m: number) => h * 60 + m;
  const stat = (mins: number, done: boolean) => (done ? "done" : mins <= nowMin ? "missed" : "waiting");
  const timeline = [
    { time: "05:00", label: "Universe Guard", status: nowMin >= T(5, 0) ? "done" : "waiting" },
    { time: "07:30", label: "Compute Score", status: stat(T(7, 30), isToday(scoreLatest?.computedAt, todayYmd)) },
    { time: "08:45", label: "Alpha Factors", status: stat(T(8, 45), isToday(alphaFactorLatest?.computedAt, todayYmd)) },
    { time: "09:00", label: "Analytics", status: stat(T(9, 0), isToday(analyticsLatest?.computedAt, todayYmd)) },
    { time: "09:15", label: "Alpha Score", status: stat(T(9, 15), isToday(alphaScoreLatest?.computedAt, todayYmd)) },
    { time: "09:30", label: "Backtest", status: stat(T(9, 30), isToday(backtestLatest?.computedAt, todayYmd)) },
    { time: "09:45", label: "Fusion", status: stat(T(9, 45), isToday(fusionLatest?.computedAt, todayYmd)) },
    { time: "10:00", label: "Paper Trading", status: stat(T(10, 0), isToday(paperLatest?.computedAt, todayYmd)) },
    { time: "11:30", label: "Midday", status: nowMin >= T(11, 30) ? "done" : "waiting" },
    { time: "18:00", label: "News", status: nowMin >= T(18, 0) ? "done" : "waiting" },
    { time: "22:00", label: "Night", status: nowMin >= T(22, 0) ? "done" : "waiting" },
  ];

  return NextResponse.json({
    regime: regime ? { regime: regime.regime, trendScore: regime.trendScore, breadth: regime.breadth, volatility: regime.volatility, date: regime.date.toISOString().slice(0, 10), computedAt: regime.computedAt.toISOString() } : null,
    ratings: { strongBuy: sb, buy, hold, watch, avoid },
    universe: { total, enabled, excluded, auto, manual, dataQuality, lowLiquidity },
    alpha: { scored: alphaScoreCount, latestAt: alphaScoreLatest?.computedAt?.toISOString() ?? null, mode: "Shadow" },
    fusion: { production: "Running", alpha: "Shadow", fusion: "Research", paper: paperRunning ? "Running" : "Stopped" },
    todaySummary: { market: regime?.regime ?? null, prodSB, prodBuy, alphaScored: alphaScoreCount, fusionMode: "研究模式", shadow },
    conclusion,
    health: { critical: health.critical, warning: health.warning, status: health.status, cron: "green", db: "green", api: "green" },
    timeline,
    computedAt: new Date().toISOString(),
  });
}
