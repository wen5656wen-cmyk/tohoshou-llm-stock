import * as fs from "fs";
import * as path from "path";
import { prisma } from "@/lib/prisma";
import { DashboardView, type DashboardData } from "@/components/dashboard/DashboardView";

export const dynamic = "force-dynamic";

// ── JST helpers ───────────────────────────────────────────────────────────────
function todayJst(): Date {
  const n = new Date(Date.now() + 9 * 3600_000);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
function jstHour(): number {
  return new Date(Date.now() + 9 * 3600_000).getUTCHours();
}
/** Format a Date/timestamp to a JST calendar date "YYYY-MM-DD" — never throws, never "Invalid Date". */
function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
}
/** Format a timestamp to "HH:mm" JST — null-safe. */
function jstClock(d: Date | null | undefined): string | null {
  if (!d) return null;
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + 9 * 3600_000).toISOString().slice(11, 16);
}
/** Whole JST days between a date and today (0 = today). */
function daysAgo(d: Date | null | undefined, today: Date): number | null {
  if (!d) return null;
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  const dj = new Date(t + 9 * 3600_000);
  const dDay = Date.UTC(dj.getUTCFullYear(), dj.getUTCMonth(), dj.getUTCDate());
  return Math.round((today.getTime() - dDay) / 86400_000);
}
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type Sev = "NORMAL" | "WARNING" | "CRITICAL";

// ── Health-guard report (read-only, best-effort) ──────────────────────────────
function readHealthGuard(): { status: string; critical: number; warning: number; pass: number; auditAt: Date | null } {
  try {
    const reportDir = path.join(process.cwd(), "reports");
    if (fs.existsSync(reportDir)) {
      const files = fs.readdirSync(reportDir)
        .filter((f) => f.startsWith("data-health-guard-") && f.endsWith(".json"))
        .sort()
        .reverse();
      if (files.length) {
        const r = JSON.parse(fs.readFileSync(path.join(reportDir, files[0]), "utf-8"));
        return {
          status: r.status ?? "UNKNOWN",
          critical: r.criticalCount ?? 0,
          warning: r.warningCount ?? 0,
          pass: r.passCount ?? 0,
          auditAt: r.auditAt ? new Date(r.auditAt) : null,
        };
      }
    }
  } catch { /* ignore */ }
  return { status: "UNKNOWN", critical: 0, warning: 0, pass: 0, auditAt: null };
}

async function getDashboardData(): Promise<DashboardData> {
  const today = todayJst();
  const jstMidnightUtc = new Date(today.getTime() - 9 * 3600_000); // JST-00:00 expressed in UTC
  const db = prisma as unknown as {
    strategyRecommendation: { count: (a: unknown) => Promise<number>; findFirst: (a: unknown) => Promise<{ tradeDate: Date } | null> };
  };

  const [
    stockTotal,
    scoredCount,
    scoresToday,
    recGroups,
    todayRecTotal,
    heroRec,
    newsToday,
    latestPriceRow,
    lastCompletedPriceRow,
    latestScoreRow,
    latestNewsSync,
    latestPriceSync,
    latestGm,
    latestStrategyRec,
  ] = await Promise.all([
    prisma.stock.count(),
    prisma.stockScore.count({ where: { adaptiveScore: { not: null } } }),
    prisma.stockScore.count({ where: { computedAt: { gte: jstMidnightUtc } } }),
    prisma.dailyRecommendation.groupBy({
      by: ["recommendation"],
      where: { date: today, recommendation: { in: ["STRONG_BUY", "BUY"] } },
      _count: { recommendation: true },
    }),
    prisma.dailyRecommendation.count({ where: { date: today } }),
    prisma.dailyRecommendation.findFirst({
      where: { date: today },
      orderBy: { gptRank: "asc" },
      select: { symbol: true, gptRank: true, adaptiveScore: true, recommendation: true, summaryZh: true, buyPrice: true },
    }),
    prisma.news.count({ where: { createdAt: { gte: jstMidnightUtc } } }),
    prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.dailyPrice.findFirst({ where: { date: { lt: today } }, orderBy: { date: "desc" }, select: { date: true } }),
    prisma.stockScore.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.syncJob.findFirst({ where: { source: "news", status: "SUCCESS" }, orderBy: { startedAt: "desc" }, select: { finishedAt: true, startedAt: true } }),
    prisma.syncJob.findFirst({ where: { source: "jquants", status: "SUCCESS" }, orderBy: { startedAt: "desc" }, select: { finishedAt: true, startedAt: true } }),
    prisma.globalMarket.findFirst({
      orderBy: { date: "desc" },
      select: { date: true, createdAt: true, nikkei: true, nikkeiChange: true, topix: true, topixChange: true, usdjpy: true, vix: true, nasdaq: true, nasdaqChange: true },
    }),
    db.strategyRecommendation.findFirst({ orderBy: { tradeDate: "desc" }, select: { tradeDate: true } }).catch(() => null),
  ]);

  // Price coverage on the last completed trading day.
  let coveredCount = 0;
  let coveragePct = 100;
  if (lastCompletedPriceRow) {
    coveredCount = await prisma.dailyPrice.count({ where: { date: lastCompletedPriceRow.date } });
    coveragePct = stockTotal > 0 ? Math.round((coveredCount / stockTotal) * 1000) / 10 : 0;
  }

  // Strategy recs on the latest strategy trade date.
  let recsToday = 0;
  if (latestStrategyRec?.tradeDate) {
    recsToday = await db.strategyRecommendation.count({ where: { tradeDate: latestStrategyRec.tradeDate } }).catch(() => 0);
  }

  // Hero stock display name.
  let heroName: string | null = null;
  if (heroRec?.symbol) {
    const s = await prisma.stock.findUnique({ where: { symbol: heroRec.symbol }, select: { nameZh: true, name: true } });
    heroName = s?.nameZh ?? s?.name ?? heroRec.symbol;
  }

  const strongBuy = recGroups.find((r) => r.recommendation === "STRONG_BUY")?._count?.recommendation ?? 0;
  const buy = recGroups.find((r) => r.recommendation === "BUY")?._count?.recommendation ?? 0;

  const health = readHealthGuard();
  const healthScore = Math.max(0, Math.min(100, 100 - health.critical * 25 - health.warning * 3));
  const healthGrade: "GREEN" | "YELLOW" | "RED" =
    health.critical > 0 ? "RED" : healthScore < 80 ? "YELLOW" : "GREEN";

  // ── System status (6 items, derived cheaply — no pm2 exec) ──────────────────
  // Global market date naturally trails ~1 day (tracks US close), so ≤2 days = fresh.
  const globalFresh = daysAgo(latestGm?.date ?? null, today);
  const globalOk = globalFresh != null && globalFresh <= 2;
  const dataSyncSev: Sev = coveragePct >= 95 ? "NORMAL" : coveragePct >= 80 ? "WARNING" : "CRITICAL";
  const aiModelSev: Sev = scoresToday > 0 ? "NORMAL" : scoredCount > 0 ? "WARNING" : "CRITICAL";
  const strategySev: Sev = recsToday > 0 ? "NORMAL" : "WARNING";
  const cronSev: Sev = scoresToday > 0 && globalOk ? "NORMAL" : "WARNING";

  const systemStatus = [
    { key: "datasync", label: "数据同步", status: dataSyncSev, detail: `覆盖率 ${coveragePct}%` },
    { key: "aimodel", label: "AI模型", status: aiModelSev, detail: `今日评分 ${scoresToday.toLocaleString()}` },
    { key: "strategy", label: "策略引擎", status: strategySev, detail: `推荐 ${recsToday.toLocaleString()}` },
    { key: "cron", label: "Cron 调度", status: cronSev, detail: globalOk ? "按时运行" : "等待更新" },
    { key: "database", label: "数据库", status: "NORMAL" as Sev, detail: "PostgreSQL" },
    { key: "api", label: "API 服务", status: "NORMAL" as Sev, detail: "在线" },
  ];

  // ── Pipeline (5 key daily steps) ────────────────────────────────────────────
  const pipelineChecks = [
    globalOk,
    coveragePct >= 95,
    (daysAgo(latestNewsSync?.finishedAt ?? null, today) ?? 9) <= 1,
    scoresToday > 0,
    recsToday > 0,
  ];
  const pipelineDone = pipelineChecks.filter(Boolean).length;

  // ── Data freshness ──────────────────────────────────────────────────────────
  const freshness = [
    { label: "行情", date: fmtDate(latestPriceRow?.date), days: daysAgo(latestPriceRow?.date, today) },
    { label: "评分", date: fmtDate(latestScoreRow?.computedAt), days: daysAgo(latestScoreRow?.computedAt, today) },
    { label: "新闻", date: fmtDate(latestNewsSync?.finishedAt), days: daysAgo(latestNewsSync?.finishedAt, today) },
    { label: "全球指数", date: fmtDate(latestGm?.date), days: daysAgo(latestGm?.date, today) },
  ];

  // ── Timeline (real timestamps → JST clock) ──────────────────────────────────
  const timelineRaw = [
    { at: latestScoreRow?.computedAt ?? null, label: "完成综合评分", detail: `${scoresToday.toLocaleString()} 只股票` },
    { at: latestNewsSync?.finishedAt ?? null, label: "同步新闻资讯", detail: `${newsToday.toLocaleString()} 条` },
    { at: latestPriceSync?.finishedAt ?? null, label: "同步股票行情", detail: `覆盖率 ${coveragePct}%` },
    { at: latestGm?.createdAt ?? null, label: "同步全球指数", detail: "Nikkei · TOPIX · VIX" },
  ];
  const timeline = timelineRaw
    .map((e) => ({ time: jstClock(e.at), label: e.label, detail: e.detail, ts: e.at ? e.at.getTime() : 0 }))
    .filter((e) => e.time !== null)
    .sort((a, b) => b.ts - a.ts)
    .map(({ time, label, detail }) => ({ time: time as string, label, detail }));

  // ── Market cards (only surface indices that actually have data) ─────────────
  const market = [
    { key: "nikkei", label: "日经225", value: num(latestGm?.nikkei), change: num(latestGm?.nikkeiChange), decimals: 2 },
    { key: "topix", label: "TOPIX", value: num(latestGm?.topix), change: num(latestGm?.topixChange), decimals: 2 },
    { key: "usdjpy", label: "美元/日元", value: num(latestGm?.usdjpy), change: null, decimals: 2 },
    { key: "vix", label: "VIX 恐慌指数", value: num(latestGm?.vix), change: null, decimals: 2 },
    { key: "nasdaq", label: "纳斯达克", value: num(latestGm?.nasdaq), change: num(latestGm?.nasdaqChange), decimals: 2 },
  ].filter((m) => m.value != null);

  const greeting = (() => {
    const h = jstHour();
    if (h < 5) return "夜深了";
    if (h < 11) return "早上好";
    if (h < 14) return "中午好";
    if (h < 18) return "下午好";
    return "晚上好";
  })();

  return {
    greeting,
    hero: heroRec
      ? {
          symbol: heroRec.symbol,
          name: heroName ?? heroRec.symbol,
          rank: heroRec.gptRank,
          score: num(heroRec.adaptiveScore),
          rating: heroRec.recommendation,
          summary: heroRec.summaryZh?.trim() || null,
          price: num(heroRec.buyPrice),
        }
      : null,
    market,
    marketDate: fmtDate(latestGm?.date),
    systemStatus,
    health: { score: healthScore, grade: healthGrade, critical: health.critical, warning: health.warning, pass: health.pass, auditAt: fmtDate(health.auditAt) },
    pipeline: { done: pipelineDone, total: pipelineChecks.length },
    stats: {
      totalStocks: stockTotal,
      scoredCount,
      todayRec: strongBuy + buy,
      todayRecTotal,
      aiAnalysis: scoresToday,
      news: newsToday,
    },
    freshness,
    timeline,
    lastTradingDate: fmtDate(latestPriceRow?.date),
    generatedAt: jstClock(new Date()) ?? "",
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  return <DashboardView data={data} />;
}
