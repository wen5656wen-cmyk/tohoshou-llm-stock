import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

// ── Auth ──────────────────────────────────────────────────────────────────────
function checkAuth(req: NextRequest): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return true;
  const header = req.headers.get("x-admin-token") ?? "";
  const query  = new URL(req.url).searchParams.get("token") ?? "";
  return header === token || query === token;
}

// ── File helpers ──────────────────────────────────────────────────────────────
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
    return fs.statSync(p).mtime.toISOString();
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

// ── Module status types ───────────────────────────────────────────────────────
type ModuleStatus = "PASS" | "WARNING" | "FAIL";
interface VerifyModule {
  key: string;
  name: string;
  status: ModuleStatus;
  current: string | number | boolean | null;
  expected: string;
  message: string;
  fixHint: string;
}

// ── JST helpers ───────────────────────────────────────────────────────────────
function nowJst() {
  const n = new Date(Date.now() + 9 * 3600 * 1000);
  return n;
}
function todayJst() {
  const n = nowJst();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

// ── Build standardized status ─────────────────────────────────────────────────
async function buildStatus() {
  const health = getLatestHealthReport();
  const today  = todayJst();
  const jst    = nowJst();
  const jstHour = jst.getUTCHours();

  // Run all DB queries in parallel
  const [
    stockCount,
    latestPrice,
    gptRanked,
    gptNullRank,
    todayRecCount,
    latestRecGroup,
    backtestResultCount,
    backtestErrorCount,
    latestGptUpdated,
  ] = await Promise.all([
    prisma.stock.count(),
    prisma.dailyPrice.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.gPTScore.count({ where: { gptRank: { not: null } } }),
    prisma.gPTScore.count({ where: { gptRank: null } }),
    prisma.dailyRecommendation.count({ where: { date: today } }),
    prisma.dailyRecommendation.groupBy({
      by: ["date"], _count: { id: true }, orderBy: { date: "desc" }, take: 1,
    }),
    prisma.backtestResult.count(),
    prisma.backtestError.count(),
    prisma.gPTScore.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);

  const latestRecDate = latestRecGroup[0]?.date ?? null;
  const latestRecCount = latestRecGroup[0]?._count.id ?? 0;
  const latestRecDateStr = latestRecDate ? latestRecDate.toISOString().slice(0, 10) : "none";
  const daysSinceLatestRec = latestRecDate
    ? Math.floor((today.getTime() - latestRecDate.getTime()) / 86400000)
    : 99;

  const latestPriceDateStr = latestPrice?.date.toISOString().slice(0, 10) ?? null;
  const daysSincePrice = latestPrice
    ? Math.floor((today.getTime() - latestPrice.date.getTime()) / 86400000)
    : 99;

  const modules: VerifyModule[] = [];

  // ── Module: system ──────────────────────────────────────────────────────────
  const buildAgeMs = getBuildTime() !== "unknown"
    ? Date.now() - new Date(getBuildTime()).getTime()
    : null;
  const buildAgeDays = buildAgeMs ? Math.floor(buildAgeMs / 86400000) : null;
  const env = process.env.NODE_ENV ?? "unknown";
  modules.push({
    key: "system",
    name: "System",
    status: env === "production" ? "PASS" : "WARNING",
    current: `${env} · Node ${process.version} · build ${buildAgeDays != null ? buildAgeDays + "d ago" : "unknown"}`,
    expected: "production environment, build < 7 days",
    message: env !== "production" ? `NODE_ENV=${env} (not production)` : "Running in production",
    fixHint: env !== "production" ? "Ensure NODE_ENV=production in server environment" : "",
  });

  // ── Module: data_sync ───────────────────────────────────────────────────────
  const priceSyncOk = daysSincePrice <= 4; // weekends / holidays
  modules.push({
    key: "data_sync",
    name: "Data Sync",
    status: daysSincePrice === 0 ? "PASS" : daysSincePrice <= 4 ? "WARNING" : "FAIL",
    current: latestPriceDateStr ?? "none",
    expected: "today or ≤4 trading days ago",
    message: daysSincePrice === 0
      ? "Price data is current"
      : priceSyncOk
      ? `Last price: ${latestPriceDateStr} (${daysSincePrice}d ago — may be weekend/holiday)`
      : `Price data stale: ${daysSincePrice} days old`,
    fixHint: priceSyncOk ? "" : "Run npm run sync-prices-recent on production",
  });

  // ── Module: daily_rec ───────────────────────────────────────────────────────
  const DAILY_REC_TARGET = 300;
  let recStatus: ModuleStatus;
  let recMessage: string;
  let recFix: string;
  if (todayRecCount >= DAILY_REC_TARGET) {
    recStatus = "PASS";
    recMessage = `Today (JST) has ${todayRecCount} recommendations`;
    recFix = "";
  } else if (latestRecCount >= DAILY_REC_TARGET && daysSinceLatestRec <= 4) {
    recStatus = jstHour >= 7 ? "WARNING" : "PASS";
    recMessage = jstHour >= 7
      ? `Today=0 (pipeline due); latest=${latestRecDateStr} (${latestRecCount} rows, ${daysSinceLatestRec}d ago)`
      : `Pre-pipeline (${jstHour}:xx JST); latest=${latestRecDateStr} has ${latestRecCount} rows`;
    recFix = jstHour >= 7 ? "Run npm run rerank:top500 on production" : "Pipeline runs at 07:30 JST";
  } else {
    recStatus = "FAIL";
    recMessage = `Today=0, latest=${latestRecDateStr} (${latestRecCount} rows) — stale or empty`;
    recFix = "Run npm run rerank:top500 on production, then verify count ≥300";
  }
  modules.push({
    key: "daily_rec",
    name: "DailyRecommendation",
    status: recStatus,
    current: todayRecCount > 0
      ? `${todayRecCount} (today JST)`
      : `0 today · latest=${latestRecDateStr}: ${latestRecCount}`,
    expected: `≥${DAILY_REC_TARGET} for today (JST)`,
    message: recMessage,
    fixHint: recFix,
  });

  // ── Module: ai_scores ───────────────────────────────────────────────────────
  const gptLastStr = latestGptUpdated?.updatedAt
    ? latestGptUpdated.updatedAt.toISOString().slice(0, 16) + " UTC"
    : "never";
  const gptAgeHours = latestGptUpdated?.updatedAt
    ? (Date.now() - latestGptUpdated.updatedAt.getTime()) / 3600000
    : 999;
  modules.push({
    key: "ai_scores",
    name: "AI Scores (GPT)",
    status: gptRanked >= 300 && gptNullRank === 0 ? "PASS"
          : gptRanked >= 100 ? "WARNING"
          : "FAIL",
    current: `ranked=${gptRanked}, nullRank=${gptNullRank}, lastUpdate=${gptLastStr}`,
    expected: "gptRank filled ≥300, nullRank=0",
    message: gptNullRank > 0
      ? `${gptNullRank} stocks have gptRank=null — rerank needed`
      : gptRanked < 300
      ? `Only ${gptRanked} stocks ranked (need ≥300)`
      : `${gptRanked} stocks ranked, nullRank=${gptNullRank} ✓, updated ${Math.round(gptAgeHours)}h ago`,
    fixHint: gptNullRank > 0 || gptRanked < 300
      ? "Run npm run rerank:top500 on production"
      : "",
  });

  // ── Module: backtest ────────────────────────────────────────────────────────
  modules.push({
    key: "backtest",
    name: "Backtest",
    status: backtestResultCount > 0 ? "PASS" : backtestErrorCount > 10 ? "FAIL" : "WARNING",
    current: `results=${backtestResultCount}, errors=${backtestErrorCount}`,
    expected: "backtestResult > 0",
    message: backtestResultCount > 0
      ? `${backtestResultCount} cohort results available, ${backtestErrorCount} errors`
      : `No backtest results yet (${backtestErrorCount} errors)`,
    fixHint: backtestResultCount === 0
      ? "Backtest fills automatically when price data covers entry+7d window"
      : "",
  });

  // ── Module: cron ────────────────────────────────────────────────────────────
  // We can't read pm2 from inside Next.js; check health report cron markers
  const healthAge = health?.auditAt
    ? Math.floor((Date.now() - new Date(health.auditAt).getTime()) / 3600000)
    : null;
  const cronOk = healthAge != null && healthAge < 24;
  modules.push({
    key: "cron",
    name: "Cron / Health",
    status: cronOk ? "PASS" : health == null ? "FAIL" : "WARNING",
    current: health?.auditAt
      ? `last health: ${new Date(health.auditAt).toISOString().slice(0, 16)} UTC (${healthAge}h ago)`
      : "no health report found",
    expected: "health:data run within 24h",
    message: cronOk
      ? `Health guard ran ${healthAge}h ago — cron appears healthy`
      : health == null
      ? "No health report found — cron may not be running"
      : `Health report is ${healthAge}h old — check tohoshou-cron pm2 process`,
    fixHint: cronOk ? "" : "SSH to server: pm2 status tohoshou-cron; check logs",
  });

  // ── Module: health ──────────────────────────────────────────────────────────
  const hStatus = health?.status ?? "NEVER_RUN";
  const hCrit   = health?.criticalCount ?? null;
  const hWarn   = health?.warningCount  ?? null;
  modules.push({
    key: "health",
    name: "Data Health Guard",
    status: hStatus === "PASS" ? "PASS"
          : hStatus === "WARNING" ? "WARNING"
          : "FAIL",
    current: hStatus === "NEVER_RUN" ? "never run" : `${hStatus} · CRITICAL=${hCrit} · WARNING=${hWarn}`,
    expected: "PASS or WARNING with CRITICAL=0",
    message: hStatus === "NEVER_RUN"
      ? "Health guard has never been run"
      : hCrit === 0
      ? `All checks pass (WARNING=${hWarn} — non-blocking)`
      : `${hCrit} CRITICAL issue(s): ${(health?.topIssues ?? []).slice(0,2).join("; ")}`,
    fixHint: hCrit ? "Run npm run health:data and fix CRITICAL items" : "",
  });

  // ── Module: api_routes ──────────────────────────────────────────────────────
  // Self-check: if we're responding, API is up
  modules.push({
    key: "api_routes",
    name: "API Routes",
    status: "PASS",
    current: "responding",
    expected: "HTTP 200 from /api/admin/verify",
    message: "API server is responding normally",
    fixHint: "",
  });

  // ── Aggregate ───────────────────────────────────────────────────────────────
  const blockingIssues = modules.filter(m => m.status === "FAIL").map(m => m.message);
  const warnings       = modules.filter(m => m.status === "WARNING").map(m => m.message);
  const ready          = blockingIssues.length === 0
    && (hCrit === 0 || hCrit == null)
    && (recStatus === "PASS" || recStatus === "WARNING");

  return {
    ready,
    blockingIssues,
    warnings,
    modules,
    checkedAt: new Date().toISOString(),
    meta: {
      stockCount,
      priceSyncOk,
      healthCritical: hCrit,
      healthAllowRec: health?.allowRecommendation ?? null,
    },
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const module = searchParams.get("module") ?? "status";
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const date   = searchParams.get("date") ?? "";
  const limit  = Math.min(200, parseInt(searchParams.get("limit") ?? "100") || 100);

  try {
    // ── Default / status ────────────────────────────────────────────────────
    if (module === "status" || module === "all") {
      return NextResponse.json(await buildStatus());
    }

    // ── Module: dailyrec ────────────────────────────────────────────────────
    if (module === "dailyrec") {
      const where: Record<string, unknown> = {};
      if (date) where.date = new Date(date + "T00:00:00.000Z");
      if (symbol) where.symbol = { contains: symbol };

      const [availDates, rows] = await Promise.all([
        prisma.dailyRecommendation.groupBy({
          by: ["date"], _count: { id: true }, orderBy: { date: "desc" }, take: 30,
        }),
        prisma.dailyRecommendation.findMany({
          where,
          orderBy: [{ date: "desc" }, { gptRank: "asc" }],
          take: limit,
          select: {
            date: true, symbol: true, gptRank: true, finalScore: true,
            adaptiveScore: true, gptScore: true, gptRating: true,
            buyPrice: true, recommendation: true, summaryZh: true,
            entryPrice: true, return7d: true, return30d: true, return90d: true,
          },
        }),
      ]);

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
          gptRank: r.gptRank, finalScore: r.finalScore,
          adaptiveScore: r.adaptiveScore, gptScore: r.gptScore,
          gptRating: r.gptRating, buyPrice: r.buyPrice,
          recommendation: r.recommendation, summaryZh: r.summaryZh,
          entryPrice: r.entryPrice,
          return7d: r.return7d, return30d: r.return30d, return90d: r.return90d,
        })),
      });
    }

    // ── Module: history ─────────────────────────────────────────────────────
    if (module === "history") {
      if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
      const [rows, stock] = await Promise.all([
        prisma.dailyRecommendation.findMany({
          where: { symbol },
          orderBy: { date: "asc" },
          select: {
            date: true, gptRank: true, finalScore: true, adaptiveScore: true,
            gptScore: true, gptRating: true, buyPrice: true, recommendation: true,
            entryPrice: true, return7d: true, return30d: true, return90d: true,
          },
        }),
        prisma.stockScore.findUnique({ where: { symbol }, select: { name: true, nameZh: true } }),
      ]);
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
          where: { symbol }, orderBy: { date: "desc" }, take: 65,
          select: { date: true, close: true, adjClose: true, volume: true },
        }),
        prisma.realtimeMarket.findUnique({ where: { symbol } }),
        prisma.stock.findUnique({ where: { symbol }, select: { name: true, nameZh: true, high52w: true, low52w: true } }),
        prisma.stockScore.findUnique({
          where: { symbol },
          select: { rsi14: true, maTrend: true, return5d: true, return20d: true, return60d: true, latestClose: true },
        }),
      ]);

      if (!prices.length) return NextResponse.json({ error: "No price data" }, { status: 404 });

      const latestBar  = prices[0];
      const todayVol   = rt?.volume ?? latestBar.volume ?? null;
      const vol10Slice = prices.slice(0, 10).map(p => p.volume).filter((v): v is number => v != null);
      const avg10dVol  = vol10Slice.length > 0 ? vol10Slice.reduce((a, b) => a + b, 0) / vol10Slice.length : null;
      const volumeRatio  = (todayVol != null && avg10dVol != null && avg10dVol > 0) ? todayVol / avg10dVol : rt?.volumeRatio ?? null;
      const latestClose  = latestBar.adjClose ?? latestBar.close;
      const high52w = stock?.high52w ?? null;
      const low52w  = stock?.low52w  ?? null;
      const pos52w  = (high52w && low52w && high52w !== low52w)
        ? ((latestClose - low52w) / (high52w - low52w) * 100) : null;

      return NextResponse.json({
        symbol, name: stock?.name ?? symbol, nameZh: stock?.nameZh ?? null,
        latestDate: latestBar.date, latestClose, high52w, low52w, pos52w,
        rsi14: score?.rsi14 ?? rt?.rsi14 ?? null,
        ma5: rt?.ma5 ?? null, ma20: rt?.ma20 ?? null, ma60: rt?.ma60 ?? null,
        maTrend: score?.maTrend ?? null,
        return5d: score?.return5d ?? null, return20d: score?.return20d ?? null, return60d: score?.return60d ?? null,
        volume: { today: todayVol, avg10d: avg10dVol, ratio: volumeRatio, realtimeSource: !!rt },
        turnover: { rate: rt?.turnoverRate ?? null, realtimeSource: !!rt },
        priceHistory: prices.slice(0, 11).map(p => ({
          date: p.date, close: p.close, adjClose: p.adjClose, volume: p.volume,
        })),
      });
    }

    // ── Module: gpt ─────────────────────────────────────────────────────────
    if (module === "gpt") {
      const where = symbol ? { symbol } : {};
      const [rows, nullRankCount] = await Promise.all([
        prisma.gPTScore.findMany({
          where,
          orderBy: symbol ? undefined : [{ gptRank: "asc" }],
          take: symbol ? 1 : limit,
          select: {
            symbol: true, model: true, gptRank: true, ruleScore: true,
            gptScore: true, finalScore: true, gptRating: true,
            confidence: true, action: true, summaryZh: true,
            risks: true, updatedAt: true, inputHash: true,
          },
        }),
        prisma.gPTScore.count({ where: { gptRank: null } }),
      ]);
      return NextResponse.json({ rows, nullRankCount });
    }

    // ── Module: backtest ────────────────────────────────────────────────────
    if (module === "backtest") {
      const where = symbol ? { symbol } : {};
      const [picks, results] = await Promise.all([
        prisma.dailyRecommendation.findMany({
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
        }),
        prisma.backtestResult.findMany({
          orderBy: { date: "desc" }, take: 12,
          select: {
            date: true, horizon: true, portfolioSize: true,
            winRate: true, avgReturn: true, medianReturn: true,
            filled: true, totalRecommendations: true,
            bestReturn: true, worstReturn: true, bestSymbol: true, worstSymbol: true,
          },
        }),
      ]);

      const syms = [...new Set(picks.map(r => r.symbol))];
      const names = await prisma.stockScore.findMany({
        where: { symbol: { in: syms } }, select: { symbol: true, name: true },
      });
      const nm = new Map(names.map(n => [n.symbol, n.name]));
      const fmtDate = (d: Date | string | null) =>
        d instanceof Date ? d.toISOString().slice(0, 10) : d;

      return NextResponse.json({
        picks: picks.map(p => ({
          ...p, name: nm.get(p.symbol) ?? p.symbol,
          date: fmtDate(p.date), entryDate: fmtDate(p.entryDate),
          exitDate7d: fmtDate(p.exitDate7d), exitDate30d: fmtDate(p.exitDate30d),
        })),
        results: results.map(r => ({ ...r, date: fmtDate(r.date) })),
      });
    }

    // ── Module: errors ──────────────────────────────────────────────────────
    if (module === "errors") {
      const errors = await prisma.backtestError.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
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

    return NextResponse.json({ error: `Unknown module: ${module}` }, { status: 400 });

  } catch (e) {
    console.error("[admin/verify]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
