#!/usr/bin/env npx tsx
/**
 * scripts/strategy-backtest.ts — Strategy Backtest Engine (Phase 4)
 *
 * Reads StrategyTradeResult and computes rolling performance statistics
 * per strategy × horizon. Writes to StrategyBacktestSummary.
 *
 * Data flow:
 *   StrategyTradeResult → strategy-backtest.ts → StrategyBacktestSummary
 *
 * Horizons (rolling lookback windows in calendar days):
 *   DAY_TRADE:   1D, 3D, 5D
 *   SWING_TRADE: 5D, 7D, 20D, 30D
 *   LONG_TRADE:  30D, 60D, 90D, 180D, 365D
 *
 * fillRate maturity:
 *   ≥80%  → READY        (stats fully trustworthy)
 *   50-79% → PARTIAL      (use with caution)
 *   30-49% → LIMITED
 *   <30%   → INSUFFICIENT (suppress winRate display)
 *
 * Usage:
 *   npx tsx scripts/strategy-backtest.ts                 # ALL strategies
 *   npx tsx scripts/strategy-backtest.ts --strategy=DAY
 *   npx tsx scripts/strategy-backtest.ts --strategy=SWING
 *   npx tsx scripts/strategy-backtest.ts --strategy=LONG
 *   npx tsx scripts/strategy-backtest.ts --dry-run
 *   npx tsx scripts/strategy-backtest.ts --date=2026-06-30
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg }     from "@prisma/adapter-pg";

// ── Prisma ────────────────────────────────────────────────────────────────────
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ── CLI args ──────────────────────────────────────────────────────────────────
const DRY_RUN     = process.argv.includes("--dry-run");
const dateArg     = process.argv.find(a => a.startsWith("--date="))?.split("=")[1];
const strategyArg = process.argv.find(a => a.startsWith("--strategy="))?.split("=")[1]?.toUpperCase();

// ── Strategy types ────────────────────────────────────────────────────────────
type StratType = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";

const ALL_STRATEGIES: StratType[] = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"];

const STRATEGY_MAP: Record<string, StratType> = {
  DAY:   "DAY_TRADE",
  SWING: "SWING_TRADE",
  LONG:  "LONG_TRADE",
};

const HORIZONS: Record<StratType, number[]> = {
  DAY_TRADE:   [1, 3, 5],
  SWING_TRADE: [5, 7, 20, 30],
  LONG_TRADE:  [30, 60, 90, 180, 365],
};

// ── Maturity classification ───────────────────────────────────────────────────
function maturity(fillRate: number | null): string {
  if (fillRate == null) return "INSUFFICIENT";
  if (fillRate >= 0.80) return "READY";
  if (fillRate >= 0.50) return "PARTIAL";
  if (fillRate >= 0.30) return "LIMITED";
  return "INSUFFICIENT";
}

// ── Statistical helpers ───────────────────────────────────────────────────────
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function sharpe(returns: number[]): number | null {
  if (returns.length < 3) return null;
  const sd = stddev(returns);
  if (sd === 0) return null;
  return mean(returns) / sd;
}

// Max peak-to-trough drawdown in percent (over chronological return sequence)
function maxDrawdown(returnsChronological: number[]): number {
  if (returnsChronological.length < 2) return 0;
  let cumulative = 1;
  let peak       = 1;
  let maxDD      = 0;
  for (const r of returnsChronological) {
    cumulative *= (1 + r / 100);
    if (cumulative > peak) peak = cumulative;
    const dd = peak > 0 ? ((peak - cumulative) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function jstDate(d?: Date): Date {
  const src = d ?? new Date();
  const jst = new Date(src.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

// ── Logging ───────────────────────────────────────────────────────────────────
const startedAt = new Date();
let stepIdx = 0;

function step(msg: string) {
  stepIdx++;
  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`\n[Step ${stepIdx}] ${msg}  (+${elapsed}s)`);
}

function row(label: string, value: string | number) {
  console.log(`  ${label.padEnd(32)} ${value}`);
}

function fmt2(n: number | null | undefined): string {
  return n == null ? "N/A" : n.toFixed(2);
}

const border = "═".repeat(66);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(border);
  console.log(`  Strategy Backtest Engine${DRY_RUN ? "  🔍 DRY RUN" : ""}`);
  console.log(`  Started: ${startedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} JST`);
  console.log(border);

  // ── Step 1: Determine asOfDate ──────────────────────────────────────────────
  step("Determine asOfDate");

  let asOfDate: Date;
  if (dateArg) {
    const [y, m, d] = dateArg.split("-").map(Number);
    asOfDate = new Date(Date.UTC(y, m - 1, d));
    row("Mode",      "explicit --date");
  } else {
    asOfDate = jstDate();
    row("Mode",      "today JST");
  }
  const asOfStr = asOfDate.toISOString().slice(0, 10);
  row("asOfDate",  asOfStr);

  // ── Step 2: Determine target strategies ────────────────────────────────────
  step("Determine target strategies");

  let targets: StratType[];
  if (strategyArg) {
    const mapped = STRATEGY_MAP[strategyArg] ?? (ALL_STRATEGIES.includes(strategyArg as StratType) ? strategyArg as StratType : null);
    if (!mapped) {
      console.error(`\n❌ Unknown --strategy=${strategyArg}. Use DAY, SWING, or LONG.`);
      await prisma.$disconnect();
      process.exit(1);
    }
    targets = [mapped];
  } else {
    targets = [...ALL_STRATEGIES];
  }
  row("Strategies", targets.join(", "));

  // ── Step 3: Process each strategy × horizon ─────────────────────────────────
  step("Compute backtest summaries");

  type TradeRow = {
    symbol:         string;
    tradeDate:      Date;
    returnPct:      number | null;
    topixReturnPct: number | null;
    alpha:          number | null;
    holdingDays:    number | null;
    win:            boolean | null;
    status:         string;
  };

  const summaryLines: string[] = [];

  for (const strategyType of targets) {
    const horizonDays = HORIZONS[strategyType];
    console.log(`\n  ── ${strategyType} ──`);

    // Load all StrategyTradeResult for this strategy within max horizon
    const maxHorizon = Math.max(...horizonDays);
    const cutoff     = subtractDays(asOfDate, maxHorizon);

    const allTrades = await (prisma as any).strategyTradeResult.findMany({
      where: {
        strategyType,
        tradeDate: { gte: cutoff },
      },
      orderBy: { tradeDate: "asc" },
      select: {
        symbol:         true,
        tradeDate:      true,
        returnPct:      true,
        topixReturnPct: true,
        alpha:          true,
        holdingDays:    true,
        win:            true,
        status:         true,
      },
    }) as TradeRow[];

    row(`  Total trades (last ${maxHorizon}d)`, allTrades.length);

    for (const horizonDay of horizonDays) {
      const label       = `${horizonDay}D`;
      const windowStart = subtractDays(asOfDate, horizonDay);

      // Trades within this horizon window
      const window = allTrades.filter(t => new Date(t.tradeDate) >= windowStart);

      const sampleCount  = window.length;
      const filledTrades = window.filter(t => t.status === "CLOSED" && t.returnPct != null);
      const filledCount  = filledTrades.length;
      const fillRate     = sampleCount > 0 ? filledCount / sampleCount : null;

      // Per-field arrays (only from filled trades)
      const returns  = filledTrades.map(t => t.returnPct!);
      const topixArr = filledTrades.map(t => t.topixReturnPct).filter((v): v is number => v != null);
      const holdings = filledTrades.map(t => t.holdingDays).filter((v): v is number => v != null);

      // Compute stats
      const wins     = filledTrades.filter(t => (t.returnPct ?? 0) > 0).length;
      const losses   = filledTrades.filter(t => (t.returnPct ?? 0) <= 0).length;

      const winRateVal        = filledCount > 0 ? wins   / filledCount : null;
      const lossRateVal       = filledCount > 0 ? losses / filledCount : null;
      const avgReturnPct      = filledCount > 0 ? mean(returns)              : null;
      const medianReturnPct   = filledCount > 0 ? median(returns)            : null;
      const maxReturnPct      = filledCount > 0 ? Math.max(...returns)       : null;
      const minReturnPct      = filledCount > 0 ? Math.min(...returns)       : null;
      const avgHoldingDays    = holdings.length > 0 ? mean(holdings)          : null;
      const maxHoldingDaysVal = holdings.length > 0 ? Math.max(...holdings)   : null;
      const topixAvg          = topixArr.length > 0 ? mean(topixArr)          : null;
      const alphaVal          = avgReturnPct != null && topixAvg != null
                                  ? avgReturnPct - topixAvg : null;
      // Order returns chronologically (already sorted by tradeDate from query)
      const maxDrawdownVal    = filledCount >= 2 ? maxDrawdown(returns) : 0;
      const sharpeVal         = sharpe(returns);

      const mat = maturity(fillRate);

      console.log(
        `    ${label.padStart(4)}  sample=${String(sampleCount).padStart(3)}` +
        `  filled=${String(filledCount).padStart(3)}  fillRate=${fillRate != null ? (fillRate * 100).toFixed(0).padStart(3) : " N/A"}%` +
        `  [${mat}]` +
        (filledCount > 0
          ? `  win=${fmt2(winRateVal ? winRateVal * 100 : null)}%  avg=${fmt2(avgReturnPct)}%  α=${fmt2(alphaVal)}%`
          : ""),
      );

      summaryLines.push(`${strategyType} ${label}: ${mat} (n=${filledCount}, win=${winRateVal != null ? (winRateVal * 100).toFixed(0) : "?"}%, avg=${fmt2(avgReturnPct)}%)`);

      if (DRY_RUN) continue;

      // Upsert StrategyBacktestSummary
      await (prisma as any).strategyBacktestSummary.upsert({
        where: {
          strategyType_horizon_asOfDate: {
            strategyType,
            horizon: label,
            asOfDate,
          },
        },
        create: {
          strategyType,
          horizon:         label,
          asOfDate,
          sampleCount,
          filledCount,
          fillRate,
          winRate:         winRateVal,
          lossRate:        lossRateVal,
          avgReturnPct,
          medianReturnPct,
          maxReturnPct,
          minReturnPct,
          avgHoldingDays,
          maxHoldingDays:  maxHoldingDaysVal,
          topixReturnPct:  topixAvg,
          alpha:           alphaVal,
          maxDrawdown:     filledCount >= 2 ? maxDrawdownVal : null,
          sharpeRatio:     sharpeVal,
        },
        update: {
          sampleCount,
          filledCount,
          fillRate,
          winRate:         winRateVal,
          lossRate:        lossRateVal,
          avgReturnPct,
          medianReturnPct,
          maxReturnPct,
          minReturnPct,
          avgHoldingDays,
          maxHoldingDays:  maxHoldingDaysVal,
          topixReturnPct:  topixAvg,
          alpha:           alphaVal,
          maxDrawdown:     filledCount >= 2 ? maxDrawdownVal : null,
          sharpeRatio:     sharpeVal,
        },
      });
    }
  }

  // ── Step 4: Summary ─────────────────────────────────────────────────────────
  step("Summary");

  const totalHorizons = targets.reduce((s, t) => s + HORIZONS[t].length, 0);
  row("asOfDate",        asOfStr);
  row("Strategies",      targets.join(", "));
  row("Total horizons",  totalHorizons);
  row("DRY RUN",         DRY_RUN ? "yes — no writes" : "no");

  console.log("\n  Results:");
  summaryLines.forEach(l => console.log(`    ${l}`));

  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`\n  Elapsed: ${elapsed}s`);
  console.log(`\n${DRY_RUN ? "  [DRY RUN] No DB writes performed." : `  ✅ Done — ${totalHorizons} StrategyBacktestSummary rows upserted.`}`);
  console.log(border);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error("CRASH:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
