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
import { isConfigured, broadcastMessage } from "../lib/line";

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

  // ── CHECK 19: Today's DailyRecommendation count ──────────────────────────
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayJst = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()));
  const dailyRecCount = await prisma.dailyRecommendation.count({
    where: { date: todayJst },
  });
  const DAILY_REC_TARGET = 300;  // full rerank writes 325+, threshold catches failed/partial runs
  add({
    id: "daily_rec_count",
    level: "CRITICAL",
    name: `DailyRecommendation today ≥ ${DAILY_REC_TARGET}`,
    value: dailyRecCount,
    pass: dailyRecCount >= DAILY_REC_TARGET,
    details: dailyRecCount < DAILY_REC_TARGET
      ? [`today=${todayJst.toISOString().slice(0, 10)}: got ${dailyRecCount}, need ≥${DAILY_REC_TARGET}`, "Fix: npm run rerank:top500"]
      : [],
  });

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

  // ── LINE 告警发送（聚合前，捕获配额超限作为 WARNING 检查）────────────────
  // LINE 429 = 外部服务月配额超限，非核心数据故障，不计入 CRITICAL
  if (isConfigured()) {
    const ts = now.toISOString().replace("T", " ").slice(0, 16);
    const tentCriticals = checks.filter(c => !c.pass && c.level === "CRITICAL");
    const tentWarnings  = checks.filter(c => !c.pass && c.level === "WARNING");

    if (tentCriticals.length > 0 || tentWarnings.length > 0) {
      const level = tentCriticals.length > 0 ? "CRITICAL" : "WARNING";
      const issueLines = [...tentCriticals, ...tentWarnings]
        .slice(0, 5)
        .map(c => `・${c.name}: ${c.value}`)
        .join("\n");
      const action = level === "CRITICAL"
        ? "Daily Pick blocked. Run npm run audit:data."
        : "Daily Pick not blocked. Please review.";
      const alertText = [`⚠ TOHOSHOU DATA ${level}`, `Time: ${ts}`, "", issueLines, "", action].join("\n");

      try {
        await broadcastMessage([{ type: "text", text: alertText }]);
        console.log(`[line] ✅ ${level} alert sent`);
      } catch (e) {
        const err = e as Error;
        const isQuota = err.name === "QuotaExceededError" || err.message.includes("429");
        if (isQuota) {
          console.log(`[line] ⚠ 月配额超限（HTTP 429）— 非核心数据故障`);
          add({
            id: "line_quota",
            level: "WARNING",
            name: "LINE 月配额",
            value: "超限（HTTP 429）",
            pass: false,
            details: ["LINE 月配额超限，属外部服务额度限制，非核心数据故障，无需处理"],
          });
        } else {
          console.warn(`[line] ⚠ 告警发送失败: ${err.message}`);
        }
      }
    }
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
