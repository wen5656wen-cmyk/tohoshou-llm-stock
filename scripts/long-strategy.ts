#!/usr/bin/env npx tsx
/**
 * scripts/long-strategy.ts — Long Trade Strategy Engine (v1.0.0)
 *
 * Long Trade design (Trading-Architecture.md §5):
 *   Pool       ¥30,000,000  (LONG_TRADE)
 *   Positions  max 10, equal weight ¥3,000,000 each
 *   Entry      STRONG_BUY + adaptiveScore ≥ 75 + fundamentalScore ≥ 18 (70% of 25) + riskOverride = NONE
 *   Take profit +20%   Stop loss -10%   Max hold 90 calendar days
 *   Exit also on: AI score < 55 | rating downgraded below STRONG_BUY
 *
 * Flow:
 *   1. Determine runDate (today or --date arg)
 *   2. TSE trading day check
 *   3. Sync StrategyRecommendation top-10 for today (3-level DR fallback)
 *   4. Load OPEN positions
 *   5. Update each OPEN position (price, holdingDays, returnPct, exit check)
 *   6. Close positions that meet exit rules → write StrategyTradeResult
 *   7. Open new positions only when slots are available (no daily rotation)
 *   8. Write StrategySnapshot (CREATE-only)
 *   9. Write StrategyCapitalLog
 *
 * Usage:
 *   npm run long-strategy           # process latest available date
 *   npm run long-strategy:dry       # dry run (no DB writes)
 *   npx tsx scripts/long-strategy.ts --date=2026-06-26
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Constants ─────────────────────────────────────────────────────────────────
const STRATEGY_TYPE      = "LONG_TRADE";
const POOL_INITIAL       = 30_000_000;
const MAX_POSITIONS      = 10;
const POSITION_SIZE      = POOL_INITIAL / MAX_POSITIONS;  // ¥3M
const TAKE_PROFIT_PCT    = 20.0;
const STOP_LOSS_PCT      = -10.0;
const MAX_HOLD_DAYS      = 90;          // calendar days
const AI_SCORE_EXIT      = 55;         // exit if AI score drops below this
const ENTRY_AI_SCORE     = 75;         // minimum to open new position
const ENTRY_FUND_SCORE   = 18;         // fundamentalScore ≥ 18 (≈70% of 25-pt scale)
const TOP_N              = 10;         // how many candidates to keep

// ── CLI args ──────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const dateArg = process.argv.find(a => a.startsWith("--date="))?.split("=")[1];

// ── Prisma ────────────────────────────────────────────────────────────────────
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ── Helpers ───────────────────────────────────────────────────────────────────
function jstDate(d?: Date): Date {
  const src = d ?? new Date();
  const jst = new Date(src.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

function isWeekend(d: Date): boolean { const dow = d.getUTCDay(); return dow === 0 || dow === 6; }
function calDays(from: Date, to: Date): number { return Math.round((to.getTime() - from.getTime()) / 86_400_000); }
function fmt(n: number, dec = 2): string { return n.toFixed(dec); }
function fmtYen(n: number): string { return `¥${Math.round(n).toLocaleString("ja-JP")}`; }
function fmtPct(n: number): string { return `${n >= 0 ? "+" : ""}${fmt(n)}%`; }

function exitReasonForLong(returnPct: number, holdDays: number, aiScore: number | null, ratingIsStrongBuy: boolean | null): string | null {
  if (returnPct >= TAKE_PROFIT_PCT)                          return "TAKE_PROFIT";
  if (returnPct <= STOP_LOSS_PCT)                            return "STOP_LOSS";
  if (holdDays >= MAX_HOLD_DAYS)                             return "MAX_HOLD_DAYS";
  if (aiScore !== null && aiScore < AI_SCORE_EXIT)           return "AI_SCORE_DROP";
  if (ratingIsStrongBuy !== null && !ratingIsStrongBuy)      return "AI_SCORE_DROP"; // rating downgrade
  return null;
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

// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("═".repeat(62));
  console.log(`  Long Trade Strategy Engine${DRY_RUN ? "  🔍 DRY RUN" : ""}`);
  console.log(`  Started: ${startedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} JST`);
  console.log("═".repeat(62));

  // ── Step 1: Determine runDate ───────────────────────────────────────────────
  step("Determine runDate");

  let runDate: Date;
  if (dateArg) {
    const [y, m, d] = dateArg.split("-").map(Number);
    runDate = new Date(Date.UTC(y, m - 1, d));
    row("Mode",    "explicit --date");
    row("runDate", dateArg);
  } else {
    // Auto: use the latest date that has StrategyRecommendation data
    const latestSR = await (prisma as any).strategyRecommendation.findFirst({
      where: { strategyType: STRATEGY_TYPE },
      orderBy: { tradeDate: "desc" },
      select: { tradeDate: true },
    });
    if (!latestSR) {
      console.log("\n⚠  No StrategyRecommendation (LONG_TRADE) found.");
      console.log("   Run: npm run generate-strategy-recs");
      await prisma.$disconnect();
      return;
    }
    runDate = jstDate(latestSR.tradeDate as Date);
    row("Mode",    "auto (latest StrategyRecommendation)");
    row("runDate", runDate.toISOString().slice(0, 10));
  }

  const runDateStr = runDate.toISOString().slice(0, 10);

  // ── Step 2: TSE trading day check ──────────────────────────────────────────
  step("Check TSE trading day");

  if (isWeekend(runDate)) {
    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][runDate.getUTCDay()];
    console.log(`\n🚫 ${runDateStr} is weekend (${dow}) — market closed. No trades.`);
    await prisma.$disconnect();
    return;
  }

  const priceCount = await (prisma as any).dailyPrice.count({ where: { date: runDate } });
  if (priceCount === 0) {
    console.log(`\n🚫 No DailyPrice for ${runDateStr} — holiday or not yet synced.`);
    await prisma.$disconnect();
    return;
  }
  row("Day of week",     ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][runDate.getUTCDay()]);
  row("DailyPrice rows", priceCount);

  // Idempotency
  const existingSnap = await (prisma as any).strategySnapshot.findUnique({
    where: { strategyType_snapshotDate: { strategyType: STRATEGY_TYPE, snapshotDate: runDate } },
  });
  if (existingSnap) {
    console.log(`\n✅ StrategySnapshot already exists for ${runDateStr}. Already processed.`);
    await printSummaryFromDB(runDate);
    await prisma.$disconnect();
    return;
  }

  // ── Step 3: Load StrategyRecommendation (from generate-strategy-recs) ───────
  step("Load StrategyRecommendation");

  const srRecs = await (prisma as any).strategyRecommendation.findMany({
    where: { strategyType: STRATEGY_TYPE, tradeDate: runDate, isTop10: true },
    orderBy: { rank: "asc" },
    select: { symbol: true, rank: true, aiScore: true },
  });

  // sourceRows may be empty — Long strategy allows running with no new candidates
  // (only processes exits for existing open positions)
  const sourceRows = (srRecs as any[]).map(r => ({
    symbol:        r.symbol as string,
    adaptiveScore: r.aiScore as number | null,
    rank:          r.rank as number,
  }));

  const topNSymbolSet = new Set(sourceRows.map(r => r.symbol));
  const scoreMap      = new Map<string, number | null>(sourceRows.map(r => [r.symbol, r.adaptiveScore]));

  if (sourceRows.length > 0) {
    console.log(`\n  Today's top ${Math.min(sourceRows.length, 5)} LONG candidates:`);
    sourceRows.slice(0, 5).forEach((r, i) => {
      console.log(`    #${i + 1}  ${r.symbol}  score=${fmt(r.adaptiveScore ?? 0, 1)}`);
    });
    if (sourceRows.length > 5) console.log(`    … +${sourceRows.length - 5} more`);
  } else {
    console.log("\n  No LONG candidates today (STRONG_BUY filter may be strict).");
    console.log("  Will still process exits for existing open positions.");
  }

  // ── Step 4: Load OPEN positions ─────────────────────────────────────────────
  step("Load OPEN positions");

  const openPositions = await (prisma as any).strategyPosition.findMany({
    where: { strategyType: STRATEGY_TYPE, status: "OPEN" },
    orderBy: { entryDate: "asc" },
  });
  row("OPEN positions", (openPositions as any[]).length);

  // ── Step 5: Prices for open symbols + new candidates ───────────────────────
  step("Load DailyPrice");

  const openSymbols   = (openPositions as any[]).map((p: any) => p.symbol);
  const newCandidates = sourceRows.filter(r => !openSymbols.includes(r.symbol));
  const allSymbols    = [...new Set([...openSymbols, ...newCandidates.map(r => r.symbol)])];

  const prices = await (prisma as any).dailyPrice.findMany({
    where: { symbol: { in: allSymbols }, date: runDate },
    select: { symbol: true, open: true, close: true },
  });
  const priceMap = new Map<string, { open: number; close: number }>(
    (prices as any[]).map((p: any) => [p.symbol, { open: p.open, close: p.close }])
  );

  row("Prices loaded", priceMap.size);

  // Today's TOPIX
  const gmToday = await (prisma as any).globalMarket.findUnique({
    where: { date: runDate },
    select: { topixChange: true },
  });
  const topixToday = (gmToday as any)?.topixChange ?? null;
  row("TOPIX today", topixToday != null ? fmtPct(topixToday) : "N/A");

  // TOPIX cumulative helper
  async function topixCumulative(from: Date, to: Date): Promise<number | null> {
    const rows = await (prisma as any).globalMarket.findMany({
      where: { date: { gt: from, lte: to } },
      select: { topixChange: true },
    });
    if ((rows as any[]).length === 0) return null;
    return (rows as any[]).reduce((s: number, r: any) => s + (r.topixChange ?? 0), 0);
  }

  // ── Step 6: Today's AI ratings for open positions (for STRONG_BUY downgrade) ─
  const openSymbolsForRating = openSymbols.filter(Boolean);
  let ratingMap = new Map<string, string | null>();

  if (openSymbolsForRating.length > 0) {
    // Read current ratings from StockScore (always up-to-date after compute-scores)
    const todayRatings = await prisma.stockScore.findMany({
      where: { symbol: { in: openSymbolsForRating } },
      select: { symbol: true, recommendationV2: true, adaptiveScore: true },
    });
    for (const r of todayRatings) {
      ratingMap.set(r.symbol, r.recommendationV2 ?? null);
      if (!scoreMap.has(r.symbol)) scoreMap.set(r.symbol, r.adaptiveScore ?? null);
    }
  }

  // ── Step 7: Process exits ───────────────────────────────────────────────────
  step("Process exits");

  type ExitResult = {
    posId: number; symbol: string; entryDate: Date; entryPrice: number;
    quantity: number; investedAmount: number; exitPrice: number; exitValue: number;
    holdingDays: number; returnPct: number; returnAmount: number;
    topixReturnPct: number | null; alpha: number | null; win: boolean; exitReason: string;
  };

  const exits: ExitResult[]           = [];
  const stillOpen: typeof openPositions[0][] = [];

  for (const pos of (openPositions as any[])) {
    const p           = priceMap.get(pos.symbol);
    const closePrice  = p?.close ?? pos.currentPrice ?? pos.entryPrice;
    const holdingDays = calDays(new Date(pos.entryDate), runDate);
    const retPct      = ((closePrice - pos.entryPrice) / pos.entryPrice) * 100;
    const aiScore     = scoreMap.get(pos.symbol) ?? null;
    const rating      = ratingMap.get(pos.symbol) ?? null;
    const isStrongBuy = rating !== null ? rating === "STRONG_BUY" : null;
    const reason      = exitReasonForLong(retPct, holdingDays, aiScore, isStrongBuy);

    if (reason) {
      const invested = pos.investedAmount ?? pos.quantity * pos.entryPrice;
      const exitVal  = pos.quantity * closePrice;
      const retAmt   = exitVal - invested;
      const topixRet = await topixCumulative(new Date(pos.entryDate), runDate);
      const alpha    = topixRet != null ? retPct - topixRet : null;

      exits.push({
        posId: pos.id, symbol: pos.symbol, entryDate: new Date(pos.entryDate),
        entryPrice: pos.entryPrice, quantity: pos.quantity,
        investedAmount: invested, exitPrice: closePrice, exitValue: exitVal,
        holdingDays, returnPct: retPct, returnAmount: retAmt,
        topixReturnPct: topixRet, alpha, win: retPct > 0, exitReason: reason,
      });
    } else {
      stillOpen.push(pos);
    }
  }

  if (exits.length > 0) {
    console.log(`\n  Closing ${exits.length} position(s):`);
    console.log(`  ${"Symbol".padEnd(10)} ${"Entry".padStart(8)} ${"Exit".padStart(8)} ${"Days".padStart(5)} ${"Ret%".padStart(9)} Reason`);
    console.log(`  ${"-".repeat(60)}`);
    for (const e of exits) {
      console.log(
        `  ${e.symbol.padEnd(10)} ${String(e.entryPrice.toFixed(0)).padStart(8)}` +
        ` ${String(e.exitPrice.toFixed(0)).padStart(8)} ${String(e.holdingDays).padStart(5)}` +
        ` ${fmtPct(e.returnPct).padStart(9)} ${e.exitReason}`
      );
    }
  } else {
    console.log("  No positions met exit conditions today.");
  }

  // ── Step 8: Open new positions only if slots available ──────────────────────
  step("Check/open new positions");

  const slotsAvailable    = MAX_POSITIONS - stillOpen.length - exits.length;
  const stillOpenSymbols  = new Set(stillOpen.map((p: any) => p.symbol));

  const toOpen = slotsAvailable > 0
    ? newCandidates
        .filter(r => !stillOpenSymbols.has(r.symbol))
        .slice(0, slotsAvailable)
    : [];

  if (slotsAvailable <= 0) {
    console.log(`  All ${MAX_POSITIONS} slots filled — no new positions (Long strategy: no daily rotation).`);
  } else if (toOpen.length === 0) {
    console.log(`  ${slotsAvailable} slot(s) available but no new qualified candidates today.`);
  } else {
    console.log(`\n  Opening ${toOpen.length} new position(s) (${slotsAvailable} slot(s) available):`);
    for (const r of toOpen) {
      const p = priceMap.get(r.symbol);
      const ep  = p?.open ?? 0;
      const qty = ep > 0 ? Math.floor(POSITION_SIZE / ep / 100) * 100 : 0;
      console.log(`    ${r.symbol}  open=${ep}  qty=${qty}  score=${fmt(r.adaptiveScore ?? 0, 1)}`);
    }
  }

  // ── Step 9: Compute capital state ───────────────────────────────────────────
  step("Compute capital state");

  // P1-3 fix: order by business date (logDate) strictly before this run date, not by
  // write time (createdAt), so out-of-order `--date` backfills use the correct prior
  // balance instead of a later day's most-recently-written row.
  const latestCapLog = await (prisma as any).strategyCapitalLog.findFirst({
    where: { strategyType: STRATEGY_TYPE, logDate: { lt: runDate } },
    orderBy: { logDate: "desc" },
  });

  let cashBefore     = (latestCapLog as any)?.cashAfter     ?? POOL_INITIAL;
  let investedBefore = (latestCapLog as any)?.investedAfter ?? 0;

  if (!latestCapLog && (openPositions as any[]).length > 0) {
    investedBefore = (openPositions as any[]).reduce(
      (s: number, p: any) => s + (p.investedAmount ?? p.quantity * p.entryPrice), 0
    );
    cashBefore = POOL_INITIAL - investedBefore;
  }

  const exitCash     = exits.reduce((s, e) => s + e.exitValue, 0);
  const exitInvested = exits.reduce((s, e) => s + e.investedAmount, 0);

  const newEntries = toOpen.map(r => {
    const p   = priceMap.get(r.symbol);
    const ep  = p?.open ?? 0;
    const qty = ep > 0 ? Math.floor(POSITION_SIZE / ep / 100) * 100 : 0;
    return { symbol: r.symbol, price: ep, qty, invested: qty * ep, score: r.adaptiveScore };
  }).filter(e => e.qty > 0);

  const newInvested   = newEntries.reduce((s, e) => s + e.invested, 0);
  const cashAfter     = cashBefore + exitCash - newInvested;
  const investedAfter = investedBefore - exitInvested + newInvested;
  const totalBefore   = cashBefore + investedBefore;
  const totalAfter    = cashAfter + investedAfter;
  const cumulativeRet = ((totalAfter - POOL_INITIAL) / POOL_INITIAL) * 100;

  const unrealizedPnl = stillOpen.reduce((s: number, p: any) => {
    const cp      = priceMap.get(p.symbol)?.close ?? p.currentPrice ?? p.entryPrice;
    const invested = p.investedAmount ?? p.quantity * p.entryPrice;
    return s + (p.quantity * cp - invested);
  }, 0);
  const realizedPnl = exits.reduce((s, e) => s + e.returnAmount, 0);

  const closedAll = await (prisma as any).strategyTradeResult.count({
    where: { strategyType: STRATEGY_TYPE, status: "CLOSED" },
  });
  const winsAll = await (prisma as any).strategyTradeResult.count({
    where: { strategyType: STRATEGY_TYPE, status: "CLOSED", win: true },
  });
  const winRate = (closedAll + exits.length) > 0
    ? (winsAll + exits.filter(e => e.win).length) / (closedAll + exits.length)
    : 0;

  row("Cash before",    fmtYen(cashBefore));
  row("Cash after",     fmtYen(cashAfter));
  row("Invested after", fmtYen(investedAfter));
  row("Total after",    fmtYen(totalAfter));
  row("Realized P&L",   fmtYen(realizedPnl));
  row("Unrealized P&L", fmtYen(unrealizedPnl));
  row("Cumulative ret", fmtPct(cumulativeRet));

  // ── Step 10: DB writes ───────────────────────────────────────────────────────
  step(DRY_RUN ? "DB writes skipped (Dry Run)" : "Write to database");

  if (DRY_RUN) {
    const totalOpenAfterDry = stillOpen.length + newEntries.length;
    console.log("\n  [DRY RUN] Would write:");
    console.log(`    StrategyPosition CLOSE    × ${exits.length}`);
    console.log(`    StrategyPosition OPEN new × ${newEntries.length}`);
    console.log(`    StrategyTradeResult       × ${exits.length}`);
    console.log(`    StrategySnapshot          × 1  (${runDateStr}  LONG_TRADE)`);
    console.log(`    StrategyCapitalLog        × 1`);
    console.log(`    Open positions after run  : ${totalOpenAfterDry}`);
    console.log("\n✅ Dry Run complete — no changes made.");
    await prisma.$disconnect();
    return;
  }

  // 10a. Close exited positions
  for (const e of exits) {
    await (prisma as any).strategyPosition.update({
      where: { id: e.posId },
      data: {
        status:         "CLOSED",
        exitDate:       runDate,
        exitPrice:      e.exitPrice,
        exitReason:     e.exitReason,
        holdingDays:    e.holdingDays,
        currentDate:    runDate,
        currentPrice:   e.exitPrice,
        currentValue:   e.exitValue,
        returnPct:      e.returnPct,
        returnAmount:   e.returnAmount,
        topixReturnPct: e.topixReturnPct,
        alpha:          e.alpha,
      },
    });

    await (prisma as any).strategyTradeResult.upsert({
      where: {
        strategyType_tradeDate_symbol: {
          strategyType: STRATEGY_TYPE, tradeDate: runDate, symbol: e.symbol,
        },
      },
      create: {
        strategyType:   STRATEGY_TYPE,
        tradeDate:      runDate,
        symbol:         e.symbol,
        entryDate:      e.entryDate,
        entryPrice:     e.entryPrice,
        exitDate:       runDate,
        exitPrice:      e.exitPrice,
        quantity:       e.quantity,
        investedAmount: e.investedAmount,
        exitValue:      e.exitValue,
        returnPct:      e.returnPct,
        returnAmount:   e.returnAmount,
        topixReturnPct: e.topixReturnPct,
        alpha:          e.alpha,
        win:            e.win,
        holdingDays:    e.holdingDays,
        exitReason:     e.exitReason,
        status:         "CLOSED",
      },
      update: {},
    });
  }

  // 10b. Update still-open positions
  for (const pos of (stillOpen as any[])) {
    const cp  = priceMap.get(pos.symbol)?.close ?? pos.currentPrice ?? pos.entryPrice;
    const val = pos.quantity * cp;
    const hd  = calDays(new Date(pos.entryDate), runDate);
    await (prisma as any).strategyPosition.update({
      where: { id: pos.id },
      data: {
        currentDate:  runDate,
        currentPrice: cp,
        currentValue: val,
        holdingDays:  hd,
        returnPct:    ((cp - pos.entryPrice) / pos.entryPrice) * 100,
        returnAmount: val - (pos.investedAmount ?? pos.quantity * pos.entryPrice),
      },
    });
  }

  // 10c. Open new positions
  for (let i = 0; i < newEntries.length; i++) {
    const e   = newEntries[i];
    const src = sourceRows.find(r => r.symbol === e.symbol);
    await (prisma as any).strategyPosition.upsert({
      where: {
        strategyType_symbol_entryDate: {
          strategyType: STRATEGY_TYPE, symbol: e.symbol, entryDate: runDate,
        },
      },
      create: {
        strategyType:   STRATEGY_TYPE,
        symbol:         e.symbol,
        entryDate:      runDate,
        entryPrice:     e.price,
        entryRank:      sourceRows.findIndex(r => r.symbol === e.symbol) + 1 || (i + 1),
        entryScore:     e.score,
        quantity:       e.qty,
        investedAmount: e.invested,
        currentDate:    runDate,
        currentPrice:   priceMap.get(e.symbol)?.close ?? e.price,
        currentValue:   e.qty * (priceMap.get(e.symbol)?.close ?? e.price),
        holdingDays:    0,
        status:         "OPEN",
      },
      update: {},
    });
  }

  const totalOpenAfter = stillOpen.length + newEntries.length;
  console.log(`  ✅ StrategyPosition CLOSE  × ${exits.length}`);
  console.log(`  ✅ StrategyPosition OPEN   × ${newEntries.length} new`);
  console.log(`  ✅ StrategyPosition UPDATE × ${stillOpen.length} still open`);
  console.log(`  ✅ StrategyTradeResult     × ${exits.length}`);

  // 10d. StrategySnapshot (CREATE-only)
  const snapExists = await (prisma as any).strategySnapshot.findUnique({
    where: { strategyType_snapshotDate: { strategyType: STRATEGY_TYPE, snapshotDate: runDate } },
  });
  if (!snapExists) {
    await (prisma as any).strategySnapshot.create({
      data: {
        strategyType:        STRATEGY_TYPE,
        snapshotDate:        runDate,
        totalValue:          totalAfter,
        cash:                cashAfter,
        investedValue:       investedAfter,
        dailyReturnPct:      realizedPnl !== 0 && exitCash > 0
          ? (realizedPnl / (exits.reduce((s, e) => s + e.investedAmount, 0) || 1)) * 100
          : 0,
        cumulativeReturnPct: cumulativeRet,
        topixReturnPct:      topixToday,
        // TODO: 累计 Alpha 等待 topix baseline 后正式启用（cumulativeRet 与 topixToday 时间维度不同，相减无意义）
        alpha:               null,
        winRate:             winRate > 0 ? winRate : null,
        openPositions:       totalOpenAfter,
        closedTrades:        closedAll + exits.length,
      },
    });
    console.log("  ✅ StrategySnapshot created");
  }

  // 10e. StrategyCapitalLog
  await (prisma as any).strategyCapitalLog.create({
    data: {
      strategyType:   STRATEGY_TYPE,
      logDate:        runDate,
      cashBefore,
      cashAfter,
      investedBefore,
      investedAfter,
      totalBefore,
      totalAfter,
      changeAmount:   totalAfter - totalBefore,
      changeReason:   `LONG ${runDateStr} open=${totalOpenAfter} close=${exits.length} new=${newEntries.length}`,
    },
  });
  console.log("  ✅ StrategyCapitalLog updated");

  // ── Final summary ─────────────────────────────────────────────────────────
  const elapsed  = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  const winExits = exits.filter(e => e.win);
  console.log("\n" + "═".repeat(62));
  console.log(`  Long Strategy Complete — ${runDateStr}`);
  console.log(`  Exits:      ${exits.length}  (${winExits.length}W / ${exits.length - winExits.length}L)`);
  console.log(`  New open:   ${newEntries.length}`);
  console.log(`  Still open: ${stillOpen.length}`);
  console.log(`  Total open: ${totalOpenAfter} / ${MAX_POSITIONS}`);
  console.log(`  Realized:   ${fmtYen(realizedPnl)} today`);
  console.log(`  Unrealized: ${fmtYen(unrealizedPnl)}`);
  console.log(`  Pool:       ${fmtYen(totalBefore)} → ${fmtYen(totalAfter)}`);
  console.log(`  Cumulative: ${fmtPct(cumulativeRet)}`);
  console.log(`  Win rate:   ${fmt(winRate * 100, 1)}% (all time)`);
  console.log(`  Elapsed:    ${elapsed}s`);
  console.log("═".repeat(62));

  await prisma.$disconnect();
}

// ── Print summary from existing DB records ────────────────────────────────────
async function printSummaryFromDB(runDate: Date) {
  const snap = await (prisma as any).strategySnapshot.findUnique({
    where: { strategyType_snapshotDate: { strategyType: STRATEGY_TYPE, snapshotDate: runDate } },
  });
  if (!snap) return;
  const s = snap as any;
  console.log(`\n  Snapshot: totalValue=${fmtYen(s.totalValue ?? 0)}`);
  console.log(`  Open: ${s.openPositions ?? 0}  Closed(all): ${s.closedTrades ?? 0}  Cumul: ${fmtPct(s.cumulativeReturnPct ?? 0)}`);
}

// ── Entry ─────────────────────────────────────────────────────────────────────
main().catch(e => {
  console.error("\n❌ Long Strategy Engine crashed:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
