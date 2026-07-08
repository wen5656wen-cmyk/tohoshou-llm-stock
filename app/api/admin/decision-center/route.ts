import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";
import { fetchQuotesBatch } from "@/lib/yahoo";
import { summarize, type DailyPerf } from "@/lib/ai-top-picks";
import { loadEvaluateDeps, evaluateFeatures, buildPlatformReport, checkIntegrity } from "@/lib/features/platform";

export const dynamic = "force-dynamic";

// GET /api/admin/decision-center — AI Decision Center（P6-T11 · Decision Cockpit）
// 纯展示层聚合：Market / Today's AI Decision / Feature Platform / AI Top Picks / System /
// Tomorrow Outlook。**只读复用已有数据 · 不新增任何 AI 算法 · 不修改任何评分/推荐。**

const ymd = (d: Date) => d.toISOString().slice(0, 10);
function withTimeout<T>(p: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}
function riskLevel(vol: number | null): "LOW" | "MEDIUM" | "HIGH" | null {
  if (vol == null) return null;
  return vol < 20 ? "LOW" : vol <= 25 ? "MEDIUM" : "HIGH";
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
function readCronToday(): { total: number; success: number; failed: string[] } {
  try {
    const jst = new Date(Date.now() + 9 * 3600 * 1000);
    const day = jst.toISOString().slice(0, 10);
    const dir = path.join(process.cwd(), "logs");
    const files = fs.readdirSync(dir).filter((f) => f.startsWith("pipeline-phases-") && f.endsWith(".jsonl")).sort();
    if (!files.length) return { total: 0, success: 0, failed: [] };
    const rows = fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const today = rows.filter((r) => r.date === day);
    return { total: today.length, success: today.filter((r) => r.status === "SUCCESS").length, failed: today.filter((r) => r.status !== "SUCCESS").map((r) => r.phase) };
  } catch { return { total: 0, success: 0, failed: [] }; }
}

export async function GET() {
  const now = Date.now();
  const todayJst = new Date(now + 9 * 3600 * 1000);
  const todayStr = todayJst.toISOString().slice(0, 10);

  // ── Section 1: Market Overview ──
  const [regime, gm] = await Promise.all([
    prisma.marketRegime.findFirst({ orderBy: { date: "desc" } }),
    prisma.globalMarket.findFirst({ orderBy: { date: "desc" } }),
  ]);
  const market = {
    regime: regime?.regime ?? null,
    regimeScore: regime?.regimeScore ?? null,
    trendScore: regime?.trendScore ?? null,
    breadth: regime?.breadth ?? null,
    volatility: regime?.volatility ?? null,
    riskLevel: riskLevel(regime?.volatility ?? null),
    topix: gm?.topix ?? null,
    topixChange: gm?.topixChange ?? null,
    nikkei: gm?.nikkei ?? null,
    nikkeiChange: gm?.nikkeiChange ?? null,
    asOf: gm?.date ? ymd(gm.date) : null,
  };

  // ── Section 2: Today's AI Decision ──
  const rc = (r: string) => prisma.stockScore.count({ where: { recommendationV2: r, priceCount: { gte: 20 } } });
  const wlLatest = await prisma.dailyAIWatchlist.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const atpLatest = await prisma.aiTopPick.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const [sbCount, buyCount, watchlistCount, top5Count] = await Promise.all([
    rc("STRONG_BUY"), rc("BUY"),
    wlLatest ? prisma.dailyAIWatchlist.count({ where: { date: wlLatest.date } }) : Promise.resolve(0),
    atpLatest ? prisma.aiTopPick.count({ where: { date: atpLatest.date } }) : Promise.resolve(0),
  ]);
  const decision = { top5: top5Count, strongBuy: sbCount, buy: buyCount, watchlist: watchlistCount, watchlistDate: wlLatest ? ymd(wlLatest.date) : null };

  // ── Section 3: Feature Platform ──
  const { deps, meta } = await loadEvaluateDeps(prisma, now);
  const { rows: featRows } = evaluateFeatures(deps);
  const platReport = buildPlatformReport(featRows);
  const integrity = checkIntegrity(deps.features, featRows, { factorAlphaAgeDays: meta.factorAlphaAgeDays });
  const platform = {
    production: platReport.production, shadow: platReport.shadow, pending: platReport.pending,
    integrity: integrity.integrityScore, promoteCandidates: platReport.promoteCandidates,
    avgAlpha: platReport.avgAlpha, avgConfidence: platReport.avgConfidence,
    factorAlphaFresh: meta.factorAlphaAgeDays != null && meta.factorAlphaAgeDays <= 2,
  };

  // ── Section 4: AI Top Picks ──
  let topPicks: {
    date: string | null; picks: { rank: number; symbol: string; name: string | null; compositeScore: number; returnPct: number | null }[];
    portfolioReturn: number | null; alpha: number | null; winRate: number | null; cumReturn: number | null; updatedAt: string | null; quoteSource: string;
  } = { date: null, picks: [], portfolioReturn: null, alpha: null, winRate: null, cumReturn: null, updatedAt: null, quoteSource: "—" };
  if (atpLatest) {
    const rows = await prisma.aiTopPick.findMany({ where: { date: atpLatest.date }, orderBy: { rank: "asc" } });
    const quotes = await withTimeout(fetchQuotesBatch(rows.map((r) => r.symbol)), 5000, []);
    const qMap = new Map(quotes.map((q) => [q.symbol, q]));
    const rets: number[] = [];
    const picks = rows.map((p) => {
      const cur = qMap.get(p.symbol)?.price ?? p.currentPrice ?? p.entryPrice ?? null;
      const ret = cur != null && p.entryPrice != null && p.entryPrice > 0 ? Math.round((cur / p.entryPrice - 1) * 10000) / 100 : null;
      if (ret != null) rets.push(ret);
      return { rank: p.rank, symbol: p.symbol, name: p.name, compositeScore: p.compositeScore, returnPct: ret };
    });
    const perfRows = await prisma.aiTopPickPerf.findMany({ orderBy: { date: "asc" } });
    const perfSeries: DailyPerf[] = perfRows.map((r) => ({ date: ymd(r.date), fwdDate: ymd(r.fwdDate), top5Ret: r.top5Ret, top5WinCount: r.top5WinCount, top5PickCount: r.top5PickCount, sbRet: r.sbRet, buyRet: r.buyRet, topixRet: r.topixRet }));
    const perf = summarize(perfSeries);
    const updatedAtMax = rows.reduce((m, r) => Math.max(m, r.updatedAt.getTime()), 0);
    topPicks = {
      date: ymd(atpLatest.date), picks,
      portfolioReturn: rets.length ? Math.round((rets.reduce((a, b) => a + b, 0) / rets.length) * 100) / 100 : null,
      alpha: perf.top5AlphaVsTopix, winRate: perf.top5.winRate, cumReturn: perf.top5.cumReturn,
      updatedAt: updatedAtMax ? new Date(updatedAtMax).toISOString() : null,
      quoteSource: quotes.length ? "Yahoo Finance" : "EOD",
    };
  }

  // ── Section 5: System Status ──
  const health = readHealth();
  const cron = readCronToday();
  const lastDeploy = await prisma.deploymentLog.findFirst({ orderBy: { deployedAt: "desc" } });
  const system = {
    health: { critical: health.critical, warning: health.warning, status: health.status },
    cron: { total: cron.total, success: cron.success, failed: cron.failed, allSuccess: cron.total > 0 && cron.failed.length === 0 },
    web: "ONLINE", // 本 API 正在服务 → web 在线
    database: "ONLINE", // 上方查询成功
    deployment: lastDeploy ? { commitHash: lastDeploy.commitHash, summary: lastDeploy.summary, buildStatus: lastDeploy.buildStatus, healthStatus: lastDeploy.healthStatus, deployedAt: lastDeploy.deployedAt.toISOString() } : null,
    build: lastDeploy?.buildStatus ?? null,
    version: lastDeploy?.commitHash ?? null,
  };

  // ── Section 6: Tomorrow Outlook（纯汇总，无 LLM）──
  // Focus：今日 Top5 + STRONG_BUY + BUY 候选的 sector 聚合 Top3
  const decisionSyms: string[] = [];
  if (atpLatest) (await prisma.aiTopPick.findMany({ where: { date: atpLatest.date }, select: { symbol: true } })).forEach((r) => decisionSyms.push(r.symbol));
  const sbBuy = await prisma.stockScore.findMany({ where: { recommendationV2: { in: ["STRONG_BUY", "BUY"] }, priceCount: { gte: 20 } }, select: { symbol: true } });
  sbBuy.forEach((r) => decisionSyms.push(r.symbol));
  const uniqSyms = [...new Set(decisionSyms)];
  const sectorRows = await prisma.stock.findMany({ where: { symbol: { in: uniqSyms } }, select: { sector: true, industry: true } });
  const sectorCount = new Map<string, number>();
  for (const s of sectorRows) {
    const key = s.sector || s.industry;
    if (key) sectorCount.set(key, (sectorCount.get(key) ?? 0) + 1);
  }
  const focus = [...sectorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sector, count]) => ({ sector, count }));
  const marketLabel = market.regime === "BULL" ? "Bullish" : market.regime === "BEAR" ? "Bearish" : market.regime === "SIDEWAYS" ? "Neutral" : "N/A";
  const tomorrow = {
    market: marketLabel,
    risk: market.riskLevel ?? "N/A",
    focus,
    note: "纯汇总（不调用 LLM）：Market 来自 Market Regime · Risk 来自波动率 · Focus 来自今日 AI 决策候选的行业分布",
  };

  return NextResponse.json({
    ok: true,
    generatedAt: new Date(now).toISOString(),
    dateJst: todayStr,
    experimental: false,
    note: "AI Decision Center · 纯展示层聚合 · 不新增 AI 算法 · 不修改任何评分/推荐",
    market, decision, platform, topPicks, system, tomorrow,
  });
}
