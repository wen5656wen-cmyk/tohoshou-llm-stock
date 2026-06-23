import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

// ── Simple admin auth (ADMIN_TOKEN env var) ───────────────────────────────────
function checkAuth(req: NextRequest): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return true; // no token configured → open in dev
  const header = req.headers.get("x-admin-token") ?? "";
  const query  = new URL(req.url).searchParams.get("token") ?? "";
  return header === token || query === token;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCommit(): string {
  try {
    const p = path.join(process.cwd(), ".git", "HEAD");
    if (!fs.existsSync(p)) return "unknown";
    const ref = fs.readFileSync(p, "utf8").trim();
    if (ref.startsWith("ref:")) {
      const refPath = path.join(process.cwd(), ".git", ref.slice(5).trim());
      if (fs.existsSync(refPath)) return fs.readFileSync(refPath, "utf8").trim().slice(0, 7);
    }
    return ref.slice(0, 7);
  } catch { return "unknown"; }
}

function getBuildTime(): string {
  try {
    const p = path.join(process.cwd(), ".next", "BUILD_ID");
    if (!fs.existsSync(p)) return "unknown";
    const stat = fs.statSync(p);
    return stat.mtime.toISOString();
  } catch { return "unknown"; }
}

function getLatestHealthReport() {
  try {
    const dir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith("data-health-guard-") && f.endsWith(".json"))
      .sort().reverse();
    if (!files.length) return null;
    return JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"));
  } catch { return null; }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const module = searchParams.get("module") ?? "all";
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const date   = searchParams.get("date") ?? "";
  const limit  = Math.min(200, parseInt(searchParams.get("limit") ?? "100") || 100);

  try {
    // ── Module: system ──────────────────────────────────────────────────────
    if (module === "all" || module === "system") {
      const health = getLatestHealthReport();
      const system = {
        commit:      getCommit(),
        buildTime:   getBuildTime(),
        environment: process.env.NODE_ENV ?? "unknown",
        nodeVersion: process.version,
        platform:    os.platform(),
        healthStatus:   health?.status ?? "NEVER_RUN",
        criticalCount:  health?.criticalCount ?? null,
        warningCount:   health?.warningCount  ?? null,
        allowRecommendation: health?.allowRecommendation ?? null,
        healthRunAt:    health?.auditAt ?? null,
        topIssues:      health?.topIssues ?? [],
      };
      if (module === "system") return NextResponse.json({ system });
    }

    // ── Module: sync ────────────────────────────────────────────────────────
    if (module === "all" || module === "sync") {
      const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
      const todayJst = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));

      const [
        stockCount, financialCount, newsCount, gptTotal, gptRanked,
        latestPrice, dailyRecByDate, backtestResultCount, backtestErrorCount,
        todayRecCount,
      ] = await Promise.all([
        prisma.stock.count(),
        prisma.financial.count(),
        prisma.news.count({ where: { publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }),
        prisma.gPTScore.count(),
        prisma.gPTScore.count({ where: { gptRank: { not: null } } }),
        prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
        prisma.dailyRecommendation.groupBy({ by: ["date"], _count: { id: true }, orderBy: { date: "desc" }, take: 5 }),
        prisma.backtestResult.count(),
        prisma.backtestError.count(),
        prisma.dailyRecommendation.count({ where: { date: todayJst } }),
      ]);

      const sync = {
        latestPriceDate: latestPrice?.date.toISOString().slice(0, 10) ?? null,
        stockCount, financialCount,
        newsCount7d: newsCount,
        gptScoreTotal: gptTotal, gptScoreRanked: gptRanked,
        dailyRecToday: todayRecCount,
        dailyRecByDate: dailyRecByDate.map(r => ({
          date: r.date.toISOString().slice(0, 10),
          count: r._count.id,
        })),
        backtestResultCount, backtestErrorCount,
      };
      if (module === "sync") return NextResponse.json({ sync });
    }

    // ── Module: dailyrec ────────────────────────────────────────────────────
    if (module === "dailyrec") {
      const where: Record<string, unknown> = {};
      if (date) where.date = new Date(date + "T00:00:00.000Z");
      if (symbol) where.symbol = { contains: symbol };

      // Get available dates for filter dropdown
      const availDates = await prisma.dailyRecommendation.groupBy({
        by: ["date"], _count: { id: true }, orderBy: { date: "desc" }, take: 30,
      });

      const rows = await prisma.dailyRecommendation.findMany({
        where,
        orderBy: [{ date: "desc" }, { gptRank: "asc" }],
        take: limit,
        select: {
          date: true, symbol: true, gptRank: true, finalScore: true,
          adaptiveScore: true, gptScore: true, gptRating: true,
          buyPrice: true, recommendation: true, summaryZh: true,
          entryPrice: true, return7d: true, return30d: true, return90d: true,
        },
      });

      // Enrich with name
      const symbols = [...new Set(rows.map(r => r.symbol))];
      const names = await prisma.stockScore.findMany({
        where: { symbol: { in: symbols } },
        select: { symbol: true, name: true, nameZh: true },
      });
      const nameMap = new Map(names.map(n => [n.symbol, { name: n.name, nameZh: n.nameZh }]));

      return NextResponse.json({
        availDates: availDates.map(d => ({ date: d.date.toISOString().slice(0, 10), count: d._count.id })),
        rows: rows.map(r => ({
          date: r.date.toISOString().slice(0, 10),
          symbol: r.symbol,
          name: nameMap.get(r.symbol)?.name ?? r.symbol,
          nameZh: nameMap.get(r.symbol)?.nameZh ?? null,
          gptRank: r.gptRank,
          finalScore: r.finalScore,
          adaptiveScore: r.adaptiveScore,
          gptScore: r.gptScore,
          gptRating: r.gptRating,
          buyPrice: r.buyPrice,
          recommendation: r.recommendation,
          summaryZh: r.summaryZh,
          entryPrice: r.entryPrice,
          return7d: r.return7d,
          return30d: r.return30d,
          return90d: r.return90d,
        })),
      });
    }

    // ── Module: history ─────────────────────────────────────────────────────
    if (module === "history") {
      if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
      const rows = await prisma.dailyRecommendation.findMany({
        where: { symbol },
        orderBy: { date: "asc" },
        select: {
          date: true, gptRank: true, finalScore: true, adaptiveScore: true,
          gptScore: true, gptRating: true, buyPrice: true, recommendation: true,
          entryPrice: true, return7d: true, return30d: true, return90d: true,
        },
      });
      const stock = await prisma.stockScore.findUnique({
        where: { symbol },
        select: { name: true, nameZh: true },
      });
      return NextResponse.json({
        symbol,
        name: stock?.name ?? symbol,
        nameZh: stock?.nameZh ?? null,
        rows: rows.map(r => ({ ...r, date: r.date.toISOString().slice(0, 10) })),
      });
    }

    // ── Module: indicators ──────────────────────────────────────────────────
    if (module === "indicators") {
      if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

      const [prices, rt, stock, score] = await Promise.all([
        prisma.dailyPrice.findMany({
          where: { symbol },
          orderBy: { date: "desc" },
          take: 65,
          select: { date: true, close: true, adjClose: true, volume: true },
        }),
        prisma.realtimeMarket.findUnique({ where: { symbol } }),
        prisma.stock.findUnique({ where: { symbol }, select: { name: true, nameZh: true, high52w: true, low52w: true } }),
        prisma.stockScore.findUnique({
          where: { symbol },
          select: { rsi14: true, maTrend: true,
                    return5d: true, return20d: true, return60d: true, latestClose: true },
        }),
      ]);

      if (!prices.length) return NextResponse.json({ error: "No price data" }, { status: 404 });

      const latestBar  = prices[0];
      const todayVol   = rt?.volume ?? latestBar.volume ?? null;
      const sharesOut  = rt ? null : null; // not stored in Stock model
      const vol10Slice = prices.slice(0, 10).map(p => p.volume).filter((v): v is number => v != null);
      const avg10dVol  = vol10Slice.length > 0 ? vol10Slice.reduce((a,b) => a+b, 0) / vol10Slice.length : null;

      const volumeRatio    = (todayVol != null && avg10dVol != null && avg10dVol > 0) ? todayVol / avg10dVol : rt?.volumeRatio ?? null;
      const turnoverRate   = rt?.turnoverRate ?? null;

      const latestClose    = latestBar.adjClose ?? latestBar.close;
      const high52w        = stock?.high52w ?? null;
      const low52w         = stock?.low52w  ?? null;
      const pos52w         = (high52w && low52w && high52w !== low52w)
        ? ((latestClose - low52w) / (high52w - low52w) * 100)
        : null;

      return NextResponse.json({
        symbol,
        name:     stock?.name   ?? symbol,
        nameZh:   stock?.nameZh ?? null,
        latestDate:   latestBar.date,
        latestClose,
        high52w, low52w, pos52w,
        rsi14:    score?.rsi14   ?? rt?.rsi14   ?? null,
        ma5:      rt?.ma5       ?? null,
        ma20:     rt?.ma20      ?? null,
        ma60:     rt?.ma60      ?? null,
        maTrend:  score?.maTrend ?? null,
        return5d:  score?.return5d  ?? null,
        return20d: score?.return20d ?? null,
        return60d: score?.return60d ?? null,
        volume:    { today: todayVol, avg10d: avg10dVol, ratio: volumeRatio },
        turnover:  { rate: turnoverRate, realtimeSource: !!rt },
        priceHistory: prices.slice(0, 11).map(p => ({
          date: p.date,
          close: p.close,
          adjClose: p.adjClose,
          volume: p.volume,
        })),
      });
    }

    // ── Module: gpt ─────────────────────────────────────────────────────────
    if (module === "gpt") {
      const where = symbol ? { symbol } : {};
      const rows = await prisma.gPTScore.findMany({
        where,
        orderBy: symbol ? undefined : [{ gptRank: "asc" }],
        take: symbol ? 1 : limit,
        select: {
          symbol: true, model: true, gptRank: true, ruleScore: true,
          gptScore: true, finalScore: true, gptRating: true,
          confidence: true, action: true, summaryZh: true,
          risks: true, updatedAt: true, inputHash: true,
        },
      });
      const nullRankCount = await prisma.gPTScore.count({ where: { gptRank: null } });
      return NextResponse.json({ rows, nullRankCount });
    }

    // ── Module: backtest ────────────────────────────────────────────────────
    if (module === "backtest") {
      const where = symbol ? { symbol } : {};
      const picks = await prisma.dailyRecommendation.findMany({
        where: { ...where, entryPrice: { not: null } },
        orderBy: [{ date: "desc" }, { gptRank: "asc" }],
        take: limit,
        select: {
          date: true, symbol: true, gptRank: true, gptRating: true,
          buyPrice: true, entryPrice: true, entryDate: true,
          return7d: true, return30d: true, return90d: true,
          price7d: true, price30d: true, price90d: true,
          exitDate7d: true, exitDate30d: true,
        },
      });

      // Latest cohort backtest results
      const results = await prisma.backtestResult.findMany({
        orderBy: { date: "desc" },
        take: 12,
        select: {
          date: true, horizon: true, portfolioSize: true,
          winRate: true, avgReturn: true, medianReturn: true,
          filled: true, totalRecommendations: true,
          bestReturn: true, worstReturn: true,
          bestSymbol: true, worstSymbol: true,
        },
      });

      const symbols2 = [...new Set(picks.map(r => r.symbol))];
      const names2 = await prisma.stockScore.findMany({
        where: { symbol: { in: symbols2 } },
        select: { symbol: true, name: true },
      });
      const nameMap2 = new Map(names2.map(n => [n.symbol, n.name]));

      return NextResponse.json({
        picks: picks.map(p => ({
          ...p,
          name: nameMap2.get(p.symbol) ?? p.symbol,
          date: p.date instanceof Date ? p.date.toISOString().slice(0, 10) : p.date,
          entryDate: p.entryDate instanceof Date ? p.entryDate.toISOString().slice(0, 10) : p.entryDate,
          exitDate7d: p.exitDate7d instanceof Date ? p.exitDate7d.toISOString().slice(0, 10) : p.exitDate7d,
          exitDate30d: p.exitDate30d instanceof Date ? p.exitDate30d.toISOString().slice(0, 10) : p.exitDate30d,
        })),
        results: results.map(r => ({
          ...r,
          date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
        })),
      });
    }

    // ── Module: errors ──────────────────────────────────────────────────────
    if (module === "errors") {
      const errors = await prisma.backtestError.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { symbol: true, recommendDate: true, horizon: true, reason: true, createdAt: true },
      });
      return NextResponse.json({
        errors: errors.map(e => ({
          ...e,
          recommendDate: e.recommendDate.toISOString().slice(0, 10),
          createdAt: e.createdAt.toISOString(),
        })),
      });
    }

    // ── Module: all ─────────────────────────────────────────────────────────
    // Return summary data for initial page load
    const health = getLatestHealthReport();
    const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
    const todayJst = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));

    const [
      stockCount, gptTotal, gptRanked, latestPrice,
      dailyRecByDate, todayRecCount, backtestResultCount, backtestErrorCount,
    ] = await Promise.all([
      prisma.stock.count(),
      prisma.gPTScore.count(),
      prisma.gPTScore.count({ where: { gptRank: { not: null } } }),
      prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.dailyRecommendation.groupBy({ by: ["date"], _count: { id: true }, orderBy: { date: "desc" }, take: 5 }),
      prisma.dailyRecommendation.count({ where: { date: todayJst } }),
      prisma.backtestResult.count(),
      prisma.backtestError.count(),
    ]);

    return NextResponse.json({
      system: {
        commit:      getCommit(),
        buildTime:   getBuildTime(),
        environment: process.env.NODE_ENV ?? "unknown",
        nodeVersion: process.version,
        healthStatus:   health?.status ?? "NEVER_RUN",
        criticalCount:  health?.criticalCount ?? null,
        warningCount:   health?.warningCount  ?? null,
        allowRecommendation: health?.allowRecommendation ?? null,
        healthRunAt:    health?.auditAt ?? null,
        topIssues:      health?.topIssues ?? [],
      },
      sync: {
        latestPriceDate: latestPrice?.date.toISOString().slice(0, 10) ?? null,
        stockCount,
        gptScoreTotal: gptTotal, gptScoreRanked: gptRanked,
        dailyRecToday: todayRecCount,
        dailyRecByDate: dailyRecByDate.map(r => ({
          date: r.date.toISOString().slice(0, 10),
          count: r._count.id,
        })),
        backtestResultCount, backtestErrorCount,
      },
    });
  } catch (e) {
    console.error("[admin/verify]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
