#!/usr/bin/env npx tsx
/**
 * v8.2.6 — Data Health Guard (daily automated check)
 * Lightweight guard for post-sync / post-score validation.
 * Exit 0 = OK (CRITICAL=0).  Exit 1 = CRITICAL found → block recommendations.
 *
 * Usage: npm run health:data
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const STRONG_BUY_ADAPTIVE   = 75;
const STRONG_BUY_PERCENTILE = 5;
const BUY_ADAPTIVE          = 70;
const BUY_PERCENTILE        = 15;
const MIN_PRICE_COUNT       = 20;
const STALE_DAYS            = 3;

type Level = "CRITICAL" | "WARNING" | "INFO";

interface Check {
  id: string;
  level: Level;
  name: string;
  value: number | string;
  pass: boolean;
  details?: string[];
}

function bigint(v: unknown): number {
  return typeof v === "bigint" ? Number(v) : Number(v ?? 0);
}

function fmt(n: number | null | undefined, dec = 1): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toFixed(dec);
}

async function main() {
  const now = new Date();
  const stamp =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "-" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0");

  const reportDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, `data-health-guard-${stamp}.json`);
  const mdPath   = path.join(reportDir, `data-health-guard-${stamp}.md`);

  console.log("=== Data Health Guard v8.2.6 ===\n");

  const checks: Check[] = [];

  function add(c: Check) {
    const icon = c.pass ? "✅" : c.level === "CRITICAL" ? "❌" : c.level === "WARNING" ? "⚠️ " : "ℹ️ ";
    console.log(`${icon} [${c.level.padEnd(8)}] ${c.name.padEnd(50)} ${String(c.value)}`);
    if (!c.pass && c.details?.length) {
      c.details.slice(0, 5).forEach(d => console.log(`             ${d}`));
    }
    checks.push(c);
  }

  // ── Get basic totals ───────────────────────────────────────────────────────
  const [stockTotal, scoreTotal] = await Promise.all([
    prisma.stock.count(),
    prisma.stockScore.count(),
  ]);

  const latestPriceRow = await prisma.dailyPrice.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const latestPriceDate = latestPriceRow?.date?.toISOString().slice(0, 10) ?? "unknown";
  const priceAgeDays = latestPriceRow
    ? Math.floor((Date.now() - latestPriceRow.date.getTime()) / 86400000)
    : 99;

  console.log(`  Stocks: ${stockTotal}  Scores: ${scoreTotal}  Latest price: ${latestPriceDate}\n`);

  // ── CHECK 1: adjClose coverage ────────────────────────────────────────────
  const priceTotal = await prisma.dailyPrice.count();
  const adjCloseCount = await prisma.dailyPrice.count({ where: { adjClose: { not: null } } });
  const adjCoverage = priceTotal > 0 ? (adjCloseCount / priceTotal * 100) : 0;
  add({
    id: "adjclose_coverage", level: "CRITICAL", name: "adjClose coverage ≥99%",
    value: `${adjCoverage.toFixed(2)}%`, pass: adjCoverage >= 99,
  });

  // ── CHECK 2: Split contamination (fast: top-10 extreme return60d) ─────────
  const extreme60 = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: MIN_PRICE_COUNT },
      OR: [{ return60d: { gt: 100 } }, { return60d: { lt: -100 } }],
    },
    select: { symbol: true, return60d: true },
    orderBy: { return60d: "desc" },
    take: 10,
  });

  let contamCount = 0;
  const contamDetails: string[] = [];
  for (const s of extreme60) {
    const bars = await prisma.dailyPrice.findMany({
      where: { symbol: s.symbol },
      orderBy: { date: "desc" },
      take: 65,
      select: { close: true, adjClose: true },
    });
    if (bars.length < 62) continue;
    const effLatest = bars[0].adjClose  ?? bars[0].close;
    const eff60d    = bars[60].adjClose ?? bars[60].close;
    const adjRet    = eff60d > 0 ? (effLatest - eff60d) / eff60d * 100 : null;
    if (adjRet !== null && Math.abs((s.return60d ?? 0) - adjRet) > 15) {
      contamCount++;
      contamDetails.push(`${s.symbol}: stored=${fmt(s.return60d)}% adj-computed=${fmt(adjRet)}%`);
    }
  }
  add({
    id: "split_contamination", level: "CRITICAL", name: "Split contamination = 0 (sample top-10)",
    value: contamCount, pass: contamCount === 0, details: contamDetails,
  });

  // ── CHECK 3&4: high52w/low52w vs current price ────────────────────────────
  const [h52Res, l52Res] = await Promise.all([
    prisma.$queryRaw<{ cnt: bigint; symbols: string }[]>`
      SELECT COUNT(*) as cnt, STRING_AGG(symbol, ',' ORDER BY (price/high52w) DESC) as symbols
      FROM "Stock" WHERE high52w IS NOT NULL AND price > 0 AND high52w < price * 0.99 LIMIT 1
    `,
    prisma.$queryRaw<{ cnt: bigint; symbols: string }[]>`
      SELECT COUNT(*) as cnt, STRING_AGG(symbol, ',' ORDER BY (low52w/price) DESC) as symbols
      FROM "Stock" WHERE low52w IS NOT NULL AND price > 0 AND low52w > price * 1.01 LIMIT 1
    `,
  ]);
  const h52Count = bigint((h52Res[0] as { cnt: bigint }).cnt);
  const l52Count = bigint((l52Res[0] as { cnt: bigint }).cnt);
  const h52Syms  = (h52Res[0] as { symbols: string }).symbols?.split(",").slice(0, 5) ?? [];
  const l52Syms  = (l52Res[0] as { symbols: string }).symbols?.split(",").slice(0, 5) ?? [];
  add({
    id: "high52w_below_price", level: "CRITICAL", name: "high52w < current price = 0",
    value: h52Count, pass: h52Count === 0, details: h52Syms,
  });
  add({
    id: "low52w_above_price", level: "CRITICAL", name: "low52w > current price = 0",
    value: l52Count, pass: l52Count === 0, details: l52Syms,
  });

  // ── CHECK 5&6: extreme 52w values (likely data error) ────────────────────
  const [h52ExRes, l52ExRes] = await Promise.all([
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) as cnt FROM "Stock"
      WHERE high52w IS NOT NULL AND price > 0 AND high52w > price * 10
    `,
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) as cnt FROM "Stock"
      WHERE low52w IS NOT NULL AND price > 0 AND low52w < price / 20
    `,
  ]);
  const h52ExCount = bigint((h52ExRes[0] as { cnt: bigint }).cnt);
  const l52ExCount = bigint((l52ExRes[0] as { cnt: bigint }).cnt);
  add({
    id: "high52w_10x_price", level: "WARNING", name: "high52w > price×10 (suspect)",
    value: h52ExCount, pass: h52ExCount === 0,
  });
  add({
    id: "low52w_too_low", level: "WARNING", name: "low52w < price÷20 (suspect)",
    value: l52ExCount, pass: l52ExCount === 0,
  });

  // ── CHECKS 7-8: Return anomalies (5d / 20d) ──────────────────────────────
  const [r5H, r5L, r20H, r20L] = await Promise.all([
    prisma.stockScore.count({ where: { priceCount: { gte: MIN_PRICE_COUNT }, return5d:  { gt:  50 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: MIN_PRICE_COUNT }, return5d:  { lt: -50 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: MIN_PRICE_COUNT }, return20d: { gt: 100 } } }),
    prisma.stockScore.count({ where: { priceCount: { gte: MIN_PRICE_COUNT }, return20d: { lt: -70 } } }),
  ]);
  add({
    id: "return5d_extreme", level: "INFO", name: "|return5d| > 50%",
    value: r5H + r5L, pass: (r5H + r5L) < 10,
    details: [`↑${r5H} ↓${r5L}`],
  });
  add({
    id: "return20d_extreme", level: "WARNING", name: "|return20d| > 100% or < -70%",
    value: r20H + r20L, pass: (r20H + r20L) < 5,
    details: [`↑${r20H} ↓${r20L}`],
  });

  // ── CHECK 9: Extreme return60d — genuine move vs split artifact ───────────
  // Genuine = close≈adjClose (no split) AND high52w≥price AND low52w≤price → WARNING
  // Suspect = split signal or impossible 52w → flagged (caught as CRITICAL by CHECK 2 / 3&4)
  const extreme60dRows = await prisma.stockScore.findMany({
    where: {
      priceCount: { gte: MIN_PRICE_COUNT },
      OR: [{ return60d: { gt: 300 } }, { return60d: { lt: -90 } }],
    },
    select: { symbol: true, return60d: true },
  });

  const genuineExtreme: string[] = [];
  const suspectExtreme: string[] = [];

  for (const s of extreme60dRows) {
    const [stockRow, bar] = await Promise.all([
      prisma.stock.findUnique({
        where: { symbol: s.symbol },
        select: { price: true, high52w: true, low52w: true },
      }),
      prisma.dailyPrice.findFirst({
        where: { symbol: s.symbol },
        orderBy: { date: "desc" },
        select: { close: true, adjClose: true },
      }),
    ]);
    const lp     = (stockRow?.price   as number | null) ?? 0;
    const h52    = (stockRow?.high52w as number | null) ?? 0;
    const l52    = (stockRow?.low52w  as number | null) ?? 0;
    const close    = bar?.close    ?? lp;
    const adjClose = bar?.adjClose ?? close;
    const noSplit  = close > 0 && Math.abs(close - adjClose) / close < 0.01;
    const h52ok    = h52 > 0 && h52 >= lp;
    const l52ok    = l52 > 0 && l52 <= lp;

    if (noSplit && h52ok && l52ok) {
      genuineExtreme.push(`${s.symbol}: return60d=${fmt(s.return60d)}%`);
    } else {
      const reasons: string[] = [];
      if (!noSplit) reasons.push(`split? close=${close} adj=${(adjClose ?? 0).toFixed(0)}`);
      if (!h52ok)  reasons.push(`high52w=${h52}<price=${lp}`);
      if (!l52ok)  reasons.push(`low52w=${l52}>price=${lp}`);
      suspectExtreme.push(`${s.symbol}: ${fmt(s.return60d)}% [${reasons.join(", ")}]`);
    }
  }

  const ext60Total = extreme60dRows.length;
  add({
    id: "return60d_extreme",
    level: "WARNING",
    name: "Extreme return60d (>300% or <-90%)",
    value: ext60Total === 0 ? 0 : `${genuineExtreme.length} genuine, ${suspectExtreme.length} suspect`,
    pass: ext60Total === 0,
    details: [
      ...genuineExtreme.map(s => `✓ Extreme real market move, verified by adjClose: ${s}`),
      ...suspectExtreme.map(s => `✗ Suspect (possible split/data issue): ${s}`),
    ],
  });

  // ── CHECKS 10-13: NULL score fields ──────────────────────────────────────
  const [nullAdaptive, nullOpp, nullPctile, nullRec] = await Promise.all([
    prisma.stockScore.count({ where: { priceCount: { gte: MIN_PRICE_COUNT }, adaptiveScore: null } }),
    prisma.stockScore.count({ where: { priceCount: { gte: MIN_PRICE_COUNT }, opportunityScore: null } }),
    prisma.stockScore.count({ where: { priceCount: { gte: MIN_PRICE_COUNT }, percentileRank: null } }),
    prisma.stockScore.count({ where: { priceCount: { gte: MIN_PRICE_COUNT }, recommendationV2: null } }),
  ]);
  // Detect Pass 2 not yet run: adaptive is populated but percentileRank/rec still NULL
  const isPass2NotRun = nullAdaptive === 0 && nullRec > 0 && nullRec === nullPctile;
  const pass2Hint = isPass2NotRun
    ? ["compute-scores Pass 2 has not run yet.", "Fix: npx tsx scripts/compute-scores.ts"]
    : [];

  add({ id: "null_adaptive",    level: "CRITICAL", name: "adaptiveScore NULL = 0 (priceCount≥20)",    value: nullAdaptive, pass: nullAdaptive === 0 });
  add({ id: "null_opportunity", level: "INFO",     name: "opportunityScore NULL = 0 (priceCount≥20)", value: nullOpp,      pass: nullOpp === 0 });
  add({ id: "null_percentile",  level: "CRITICAL", name: "percentileRank NULL = 0 (priceCount≥20)",   value: nullPctile,   pass: nullPctile === 0, details: pass2Hint });
  add({ id: "null_rec",         level: "CRITICAL", name: "recommendationV2 NULL = 0 (priceCount≥20)", value: nullRec,      pass: nullRec === 0,    details: pass2Hint });

  // ── CHECK 14: NaN / Infinity ──────────────────────────────────────────────
  const nanRows = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT SUM(cnt) as cnt FROM (
      SELECT COUNT(*) as cnt FROM "StockScore" WHERE "adaptiveScore"   = 'NaN'::float OR "adaptiveScore"   = 'Infinity'::float OR "adaptiveScore"   = '-Infinity'::float
      UNION ALL
      SELECT COUNT(*) as cnt FROM "StockScore" WHERE "percentileRank"  = 'NaN'::float OR "percentileRank"  = 'Infinity'::float OR "percentileRank"  = '-Infinity'::float
      UNION ALL
      SELECT COUNT(*) as cnt FROM "StockScore" WHERE "return60d"       = 'NaN'::float OR "return60d"       = 'Infinity'::float OR "return60d"       = '-Infinity'::float
      UNION ALL
      SELECT COUNT(*) as cnt FROM "StockScore" WHERE "opportunityScore" = 'NaN'::float OR "opportunityScore" = 'Infinity'::float OR "opportunityScore" = '-Infinity'::float
      UNION ALL
      SELECT COUNT(*) as cnt FROM "StockScore" WHERE "rsi14"            = 'NaN'::float OR "rsi14"            = 'Infinity'::float OR "rsi14"            = '-Infinity'::float
    ) t
  `;
  const totalNan = bigint((nanRows[0] as { cnt: bigint }).cnt);
  add({ id: "nan_infinity", level: "CRITICAL", name: "NaN/Infinity in StockScore = 0", value: totalNan, pass: totalNan === 0 });

  // ── CHECK 15: Stale price data ────────────────────────────────────────────
  const staleDate = new Date(Date.now() - STALE_DAYS * 86400000);
  const [staleCount, nullSyncCount] = await Promise.all([
    prisma.stock.count({ where: { lastSyncAt: { lt: staleDate } } }),
    prisma.stock.count({ where: { lastSyncAt: null } }),
  ]);
  const staleTotal = staleCount + nullSyncCount;
  add({
    id: "stale_prices", level: "WARNING", name: `Stale stocks (>3 days, total)`,
    value: staleTotal, pass: staleTotal < 100,
    details: staleTotal > 0 ? [`stale=${staleCount} null=${nullSyncCount}`] : [],
  });

  // ── CHECK 16: STRONG_BUY criteria compliance ──────────────────────────────
  const sbStocks = await prisma.stockScore.findMany({
    where: { recommendationV2: "STRONG_BUY" },
    select: { symbol: true, adaptiveScore: true, percentileRank: true },
  });
  const sbViolations = sbStocks.filter(
    s => !((s.adaptiveScore ?? 0) >= STRONG_BUY_ADAPTIVE && (s.percentileRank ?? 999) <= STRONG_BUY_PERCENTILE)
  );
  add({
    id: "strongbuy_violations", level: "CRITICAL", name: "STRONG_BUY criteria violations = 0",
    value: sbViolations.length, pass: sbViolations.length === 0,
    details: sbViolations.map(s => `${s.symbol} adp=${fmt(s.adaptiveScore)} pct=${fmt(s.percentileRank)}`),
  });

  // ── CHECK 17: BUY criteria compliance ────────────────────────────────────
  const buyStocks = await prisma.stockScore.findMany({
    where: { recommendationV2: "BUY" },
    select: { symbol: true, adaptiveScore: true, percentileRank: true },
  });
  const buyViolations = buyStocks.filter(
    s => !((s.adaptiveScore ?? 0) >= BUY_ADAPTIVE && (s.percentileRank ?? 999) <= BUY_PERCENTILE)
  );
  add({
    id: "buy_violations", level: "INFO", name: "BUY criteria violations = 0",
    value: buyViolations.length, pass: buyViolations.length === 0,
    details: buyViolations.slice(0, 5).map(s => `${s.symbol} adp=${fmt(s.adaptiveScore)} pct=${fmt(s.percentileRank)}`),
  });

  // ── CHECK 18: Suspicious stocks (extreme return without risk flag) ─────────
  const suspiciousCount = await prisma.stockScore.count({
    where: {
      priceCount: { gte: MIN_PRICE_COUNT },
      highRiskFlag: false,
      OR: [{ return60d: { gt: 300 } }, { return60d: { lt: -80 } }],
    },
  });
  add({
    id: "suspicious_no_flag", level: "WARNING", name: "Extreme return60d without highRiskFlag",
    value: suspiciousCount, pass: suspiciousCount < 20,
    details: suspiciousCount > 0 ? ["Review: may be genuine post-tariff moves"] : [],
  });

  // ── CHECK 19: DailyRecommendation freshness ──────────────────────────────
  // Pipeline runs at 21:00 UTC (06:00 JST); allow 1-hour buffer → due by 07:00 JST.
  // Before 07:00 JST: pipeline not yet due → check latest date (WARNING if stale, not CRITICAL).
  // After 07:00 JST:  pipeline must have run → check today (CRITICAL if missing).
  // Weekend/holiday: latest date may be 1-3 days back; allow up to 4 calendar days.
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayJst = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));
  const jstHour = nowJst.getUTCHours();
  const pipelineDue = jstHour >= 7;
  const DAILY_REC_TARGET = 300;

  const todayCount = await prisma.dailyRecommendation.count({ where: { date: todayJst } });

  if (todayCount >= DAILY_REC_TARGET) {
    add({
      id: "daily_rec_count", level: "CRITICAL",
      name: `DailyRecommendation today ≥ ${DAILY_REC_TARGET}`,
      value: todayCount, pass: true,
    });
  } else {
    // today < threshold — inspect latest available date
    const latestRec = await prisma.dailyRecommendation.findFirst({
      orderBy: { date: "desc" }, select: { date: true },
    });
    const latestCount = latestRec
      ? await prisma.dailyRecommendation.count({ where: { date: latestRec.date } })
      : 0;
    const latestDateStr = latestRec?.date?.toISOString().slice(0, 10) ?? "none";
    const daysSinceLatest = latestRec
      ? Math.floor((todayJst.getTime() - latestRec.date.getTime()) / 86400000)
      : 99;
    // Fresh = latest date has ≥ target records AND is within 4 days (covers long weekends)
    const latestFresh = latestCount >= DAILY_REC_TARGET && daysSinceLatest <= 4;

    if (pipelineDue) {
      if (latestFresh) {
        // Pipeline due but today empty; latest date has data → degrade to WARNING
        add({
          id: "daily_rec_count", level: "WARNING",
          name: `DailyRecommendation today=0 (latest=${latestDateStr}: ${latestCount})`,
          value: `today=${todayCount}, latest=${latestCount}`,
          pass: false,
          details: [`today snapshot missing; latest=${latestDateStr} (${daysSinceLatest}d ago) has ${latestCount} rows`, "Fix: npm run rerank:top500"],
        });
      } else {
        // Pipeline due AND no fresh data anywhere → CRITICAL
        add({
          id: "daily_rec_count", level: "CRITICAL",
          name: `DailyRecommendation stale (latest=${latestDateStr}: ${latestCount})`,
          value: `today=${todayCount}, latest=${latestCount}`,
          pass: false,
          details: [`No fresh snapshot (latest=${latestDateStr}, ${daysSinceLatest}d ago, ${latestCount} rows < ${DAILY_REC_TARGET})`, "Fix: npm run rerank:top500"],
        });
      }
    } else {
      if (latestFresh) {
        // Pre-pipeline; latest is fresh → INFO pass
        add({
          id: "daily_rec_count", level: "INFO",
          name: `DailyRecommendation pre-pipeline (latest=${latestDateStr}: ${latestCount})`,
          value: latestCount, pass: true,
          details: [`JST ${String(jstHour).padStart(2,"0")}:xx < 07:00 — pipeline not yet due; latest=${latestDateStr} has ${latestCount} rows`],
        });
      } else {
        // Pre-pipeline AND no fresh data → CRITICAL (stale regardless of time)
        add({
          id: "daily_rec_count", level: "CRITICAL",
          name: `DailyRecommendation stale pre-pipeline (latest=${latestDateStr}: ${latestCount})`,
          value: `today=${todayCount}, latest=${latestCount}`,
          pass: false,
          details: [`Latest snapshot ${latestDateStr} (${daysSinceLatest}d ago) has only ${latestCount} rows`, "Fix: npm run rerank:top500"],
        });
      }
    }
  }

  // ── CHECK 21: Stale stocks still STRONG_BUY ──────────────────────────────
  const staleStrongBuy = await prisma.$queryRaw<{ symbol: string }[]>`
    SELECT ss.symbol FROM "StockScore" ss
    JOIN "Stock" s ON s.symbol = ss.symbol
    WHERE ss."recommendationV2" = 'STRONG_BUY'
    AND (s."lastSyncAt" IS NULL OR s."lastSyncAt" < ${staleDate})
  `;
  add({
    id: "stale_strongbuy", level: "WARNING", name: "Stale stocks with STRONG_BUY = 0",
    value: staleStrongBuy.length, pass: staleStrongBuy.length === 0,
    details: staleStrongBuy.map(s => s.symbol),
  });

  // ── CHECK 22: latestClose consistency ────────────────────────────────────
  const inconsistentCount = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) as cnt FROM "StockScore" ss
    WHERE ss."priceCount" >= ${MIN_PRICE_COUNT}
    AND (ss."latestClose" IS NULL OR ss."latestClose" <= 0)
  `;
  const inconsistent = bigint((inconsistentCount[0] as { cnt: bigint }).cnt);
  add({
    id: "latestclose_consistency", level: "INFO", name: "StockScore.latestClose valid (>0)",
    value: inconsistent === 0 ? "OK" : `${inconsistent} invalid`, pass: inconsistent === 0,
  });

  // ── Portfolio Health (v11.0) ──────────────────────────────────────────────
  const [top10Count, portfolioLatest] = await Promise.all([
    prisma.dailyRecommendation.count({ where: { gptRank: { lte: 10 } } }),
    prisma.dailyRecommendation.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
  ]);

  let portfolioPriceOk = false;
  if (portfolioLatest) {
    const recs = await prisma.dailyRecommendation.findMany({
      where: { date: portfolioLatest.date, gptRank: { lte: 10 } },
      select: { symbol: true, entryPrice: true, buyPrice: true },
    });
    const withPrice = recs.filter(r => (r.entryPrice ?? r.buyPrice) != null);
    portfolioPriceOk = withPrice.length >= 5;
  }

  const top10BacktestCount = await prisma.backtestResult.count({ where: { portfolioSize: "TOP10" } });

  add({ id: "portfolio_top10", level: "WARNING", name: "Portfolio Top10 positions exist", value: top10Count, pass: top10Count > 0 });
  add({ id: "portfolio_value", level: "WARNING", name: "Portfolio Value computable (≥5 prices)", value: portfolioPriceOk ? "OK" : "FAIL", pass: portfolioPriceOk });
  add({ id: "portfolio_backtest", level: "INFO", name: "Portfolio BacktestResult (TOP10) exists", value: top10BacktestCount, pass: top10BacktestCount > 0 });

  // ── Strategy Phase 1 Checks ───────────────────────────────────────────────
  // CHECK S1: Strategy tables exist and StrategyType enum is usable
  try {
    const [recCount, posCount, tradeCount, snapCount, capCount, summaryCount] = await Promise.all([
      (prisma as any).strategyRecommendation.count(),
      (prisma as any).strategyPosition.count(),
      (prisma as any).strategyTradeResult.count(),
      (prisma as any).strategySnapshot.count(),
      (prisma as any).strategyCapitalLog.count(),
      (prisma as any).strategyBacktestSummary.count(),
    ]);
    add({
      id: "strategy_tables_exist", level: "CRITICAL",
      name: "Strategy tables (6) accessible",
      value: `rec=${recCount} pos=${posCount} trade=${tradeCount} snap=${snapCount} cap=${capCount} summary=${summaryCount}`,
      pass: true,
    });

    // CHECK S2: Three capital pools initialized
    const capitalLogs = await Promise.all([
      (prisma as any).strategyCapitalLog.findFirst({ where: { strategyType: "DAY_TRADE" } }),
      (prisma as any).strategyCapitalLog.findFirst({ where: { strategyType: "SWING_TRADE" } }),
      (prisma as any).strategyCapitalLog.findFirst({ where: { strategyType: "LONG_TRADE" } }),
    ]);
    const uninitPools = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"].filter((_, i) => !capitalLogs[i]);
    add({
      id: "strategy_capital_initialized", level: "WARNING",
      name: "Strategy capital pools initialized (3/3)",
      value: uninitPools.length === 0 ? "3/3" : `${3 - uninitPools.length}/3 (missing: ${uninitPools.join(", ")})`,
      pass: uninitPools.length === 0,
      details: uninitPools.length > 0 ? ["Run: npm run strategy:init-capital"] : [],
    });

    // CHECK S3: Day Trade must not have long-term OPEN positions (holdingDays > 1)
    const dayLongOpen = await (prisma as any).strategyPosition.count({
      where: { strategyType: "DAY_TRADE", status: "OPEN", holdingDays: { gt: 1 } },
    });
    add({
      id: "day_trade_no_overnight", level: "CRITICAL",
      name: "Day Trade OPEN positions with holdingDays>1 = 0",
      value: dayLongOpen,
      pass: dayLongOpen === 0,
      details: dayLongOpen > 0 ? ["Day Trade must not carry positions overnight"] : [],
    });

    // CHECK S4: Swing/Long positions have valid status
    const invalidStatusCount = await (prisma as any).strategyPosition.count({
      where: {
        strategyType: { in: ["SWING_TRADE", "LONG_TRADE"] },
        status: { notIn: ["OPEN", "CLOSED"] },
      },
    });
    add({
      id: "strategy_position_valid_status", level: "WARNING",
      name: "Swing/Long positions have valid status",
      value: invalidStatusCount === 0 ? "OK" : `${invalidStatusCount} invalid`,
      pass: invalidStatusCount === 0,
    });

    // CHECK S5: StrategySnapshot not generated on weekends for Day Trade
    // Day Trade snapshots should only exist on weekdays (Mon=1 … Fri=5)
    const weekendDaySnaps = await (prisma as any).strategySnapshot.findMany({
      where: { strategyType: "DAY_TRADE" },
      select: { snapshotDate: true },
    });
    const weekendViolations = (weekendDaySnaps as Array<{ snapshotDate: Date }>).filter((s) => {
      const dow = s.snapshotDate.getUTCDay(); // 0=Sun, 6=Sat
      return dow === 0 || dow === 6;
    });
    add({
      id: "day_trade_no_weekend_snapshot", level: "WARNING",
      name: "Day Trade StrategySnapshot not on weekends",
      value: weekendViolations.length === 0 ? "OK" : `${weekendViolations.length} weekend snapshots`,
      pass: weekendViolations.length === 0,
      details: weekendViolations.slice(0, 3).map(
        s => `${s.snapshotDate.toISOString().slice(0, 10)} (weekday=${s.snapshotDate.getUTCDay()})`
      ),
    });

    // CHECK S6: StrategySnapshot uses distinct strategyType (no mixing)
    const snapTypes = await (prisma as any).strategySnapshot.groupBy({
      by: ["strategyType"],
      _count: { id: true },
    });
    const snapTypesCount = snapTypes.length;
    add({
      id: "strategy_snapshot_distinguished", level: "INFO",
      name: "StrategySnapshot records by strategyType",
      value: snapTypesCount === 0
        ? "empty (Phase 1 — no data yet)"
        : snapTypes.map((r: any) => `${r.strategyType}:${r._count.id}`).join(", "),
      pass: true,
    });

    // ── Phase 2A: Day Strategy Engine checks ──────────────────────────────────
    // CHECK S7: WAITING_OPEN stale > 24h (prices never arrived)
    const oneDayAgo = new Date(Date.now() - 86400_000);
    const staleWaitingOpen = await (prisma as any).strategyTradeResult.count({
      where: {
        strategyType: "DAY_TRADE",
        status: "WAITING_OPEN",
        createdAt: { lt: oneDayAgo },
      },
    });
    add({
      id: "day_trade_no_stale_waiting_open", level: "CRITICAL",
      name: "Day Trade stale WAITING_OPEN (>24h) = 0",
      value: staleWaitingOpen,
      pass: staleWaitingOpen === 0,
      details: staleWaitingOpen > 0
        ? ["Trades stuck WAITING_OPEN >24h — prices may be missing", "Fix: check DailyPrice sync for those dates"]
        : [],
    });

    // CHECK S8: WAITING_CLOSE stale > 24h
    const staleWaitingClose = await (prisma as any).strategyTradeResult.count({
      where: {
        strategyType: "DAY_TRADE",
        status: "WAITING_CLOSE",
        createdAt: { lt: oneDayAgo },
      },
    });
    add({
      id: "day_trade_no_stale_waiting_close", level: "WARNING",
      name: "Day Trade stale WAITING_CLOSE (>24h) = 0",
      value: staleWaitingClose,
      pass: staleWaitingClose === 0,
      details: staleWaitingClose > 0
        ? ["Day trades stuck WAITING_CLOSE — close prices missing", "Fix: re-run day-strategy after price sync"]
        : [],
    });

    // CHECK S9: Latest day strategy result (freshness)
    const latestDayResult = await (prisma as any).strategyTradeResult.findFirst({
      where: { strategyType: "DAY_TRADE", status: "CLOSED" },
      orderBy: { tradeDate: "desc" },
      select: { tradeDate: true },
    });
    const latestDayDate = (latestDayResult as any)?.tradeDate?.toISOString().slice(0, 10) ?? "none";
    const dayAgeDays = latestDayResult
      ? Math.floor((todayJst.getTime() - (latestDayResult as any).tradeDate.getTime()) / 86400_000)
      : 99;
    add({
      id: "day_trade_result_freshness", level: "INFO",
      name: "Day Trade latest CLOSED result",
      value: latestDayResult
        ? `${latestDayDate} (${dayAgeDays}d ago)`
        : "no results yet (expected until first run)",
      pass: true,
    });

    // CHECK S10: No invalid status in StrategyTradeResult for Day Trade
    const invalidDayStatus = await (prisma as any).strategyTradeResult.count({
      where: {
        strategyType: "DAY_TRADE",
        status: { notIn: ["CLOSED", "WAITING_OPEN", "WAITING_CLOSE", "SKIPPED_MARKET_CLOSED"] },
      },
    });
    add({
      id: "day_trade_result_no_invalid_status", level: "WARNING",
      name: "Day Trade results have valid status",
      value: invalidDayStatus === 0 ? "OK" : `${invalidDayStatus} invalid`,
      pass: invalidDayStatus === 0,
    });

  } catch (e: any) {
    add({
      id: "strategy_tables_exist", level: "CRITICAL",
      name: "Strategy tables (6) accessible",
      value: "FAIL",
      pass: false,
      details: [
        `DB error: ${e?.message ?? String(e)}`,
        "Fix: npx prisma db push --accept-data-loss",
      ],
    });
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const criticals = checks.filter(c => !c.pass && c.level === "CRITICAL");
  const warnings  = checks.filter(c => !c.pass && c.level === "WARNING");
  const infos     = checks.filter(c => !c.pass && c.level === "INFO");
  const passes    = checks.filter(c => c.pass);

  const status = criticals.length > 0 ? "CRITICAL"
               : warnings.length  > 0 ? "WARNING"
               : "PASS";

  const allowRecommendation = criticals.length === 0;
  const requiresReview = criticals.length > 0 || warnings.length > 0;

  console.log(`\n${"━".repeat(60)}`);
  console.log(`Status: ${status}  ✅${passes.length} ❌${criticals.length} ⚠️${warnings.length} ℹ️${infos.length}`);
  console.log(`Allow recommendations: ${allowRecommendation ? "YES" : "NO"}`);
  console.log(`Requires review: ${requiresReview ? "YES" : "NO"}`);

  // ── Build report ──────────────────────────────────────────────────────────
  const topIssues = [...criticals, ...warnings].map(c => `${c.name}: ${c.value}`);

  const report = {
    auditAt: now.toISOString(),
    version: "v8.2.4",
    status,
    stockTotal,
    scoreTotal,
    latestPriceDate,
    priceAgeDays,
    adjCoveragePct: adjCoverage,
    criticalCount: criticals.length,
    warningCount: warnings.length,
    infoCount: infos.length,
    passCount: passes.length,
    allowRecommendation,
    requiresReview,
    topIssues,
    checks,
    reportFile: path.basename(jsonPath),
  };

  // ── Markdown report ───────────────────────────────────────────────────────
  const md: string[] = [
    `# Data Health Guard — ${now.toISOString().slice(0, 16)} UTC`,
    ``,
    `## Summary`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| Status | **${status}** |`,
    `| Stock total | ${stockTotal} |`,
    `| Score total | ${scoreTotal} |`,
    `| Latest price date | ${latestPriceDate} |`,
    `| adjClose coverage | ${adjCoverage.toFixed(2)}% |`,
    `| CRITICAL | ${criticals.length} |`,
    `| WARNING | ${warnings.length} |`,
    `| INFO | ${infos.length} |`,
    `| Allow recommendation | ${allowRecommendation ? "✅ YES" : "❌ NO"} |`,
    `| Requires review | ${requiresReview ? "⚠️ YES" : "NO"} |`,
    ``,
    `## Check Results`,
    ``,
    `| Check | Level | Value | Pass |`,
    `|-------|-------|-------|:----:|`,
    ...checks.map(c => `| ${c.name} | ${c.level} | ${c.value} | ${c.pass ? "✅" : c.level === "CRITICAL" ? "❌" : "⚠️"} |`),
    ``,
  ];

  if (topIssues.length > 0) {
    md.push(`## Top Issues`, ``);
    topIssues.forEach((issue, i) => md.push(`${i + 1}. ${issue}`));
    md.push(``);
  }

  md.push(`## Action`);
  if (allowRecommendation) {
    md.push(`Daily recommendations allowed. ${requiresReview ? "Please review warnings." : "All clear."}`);
  } else {
    md.push(`**Daily Pick BLOCKED.** Please run \`npm run audit:data\` for full investigation.`);
  }

  // ── Write reports ─────────────────────────────────────────────────────────
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, md.join("\n") + "\n");
  console.log(`\nReports: ${jsonPath}`);

  await prisma.$disconnect();

  if (criticals.length > 0) {
    console.log(`\n❌ CRITICAL issues found — exiting with code 1`);
    process.exit(1);
  }
  console.log(`\n✅ Health guard passed`);
}

main().catch((e) => {
  console.error("GUARD CRASH:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
