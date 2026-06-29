#!/usr/bin/env npx tsx
/**
 * scripts/swing-strategy.ts — Swing Trade Strategy Engine (v1.0.0)
 *
 * Swing Trade design (Trading-Architecture.md §4):
 *   Pool       ¥40,000,000  (SWING_TRADE)
 *   Positions  max 10, equal weight ¥4,000,000 each
 *   Take profit  +8%   Stop loss -5%   Max hold 20 calendar days
 *   Exit also on: AI score < 60 | dropped from top 10
 *
 * Flow:
 *   1. Determine runDate (today or --date arg)
 *   2. TSE trading day check (weekend / no DailyPrice)
 *   3. Sync StrategyRecommendation top-10 for today (3-level DR fallback)
 *   4. Load current OPEN positions
 *   5. Update each open position with today's price → check exit rules
 *   6. Close positions that triggered exit → write StrategyTradeResult
 *   7. Open new positions to fill available slots
 *   8. Write StrategySnapshot (CREATE-only, immutable)
 *   9. Write StrategyCapitalLog
 *
 * Usage:
 *   npm run swing-strategy           # process latest available date
 *   npm run swing-strategy:dry       # dry run (no DB writes)
 *   npx tsx scripts/swing-strategy.ts --date=2026-06-26
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Constants ─────────────────────────────────────────────────────────────────
const STRATEGY_TYPE    = "SWING_TRADE";
const DR_STRATEGY_TYPE = "SWING";
const POOL_INITIAL     = 40_000_000;
const MAX_POSITIONS    = 10;
const POSITION_SIZE    = POOL_INITIAL / MAX_POSITIONS; // ¥4M
const TAKE_PROFIT_PCT  = 8.0;
const STOP_LOSS_PCT    = -5.0;
const MAX_HOLD_DAYS    = 20;            // calendar days
const AI_SCORE_EXIT    = 60;
const TOP_N            = 10;           // how many candidates to keep

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

function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

function calDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function fmt(n: number, dec = 2): string { return n.toFixed(dec); }
function fmtYen(n: number): string { return `¥${Math.round(n).toLocaleString("ja-JP")}`; }
function fmtPct(n: number): string { return `${n >= 0 ? "+" : ""}${fmt(n)}%`; }

function exitReasonForSwing(returnPct: number, holdDays: number, inTopN: boolean, aiScore: number | null): string | null {
  if (returnPct >= TAKE_PROFIT_PCT)                     return "TAKE_PROFIT";
  if (returnPct <= STOP_LOSS_PCT)                        return "STOP_LOSS";
  if (holdDays >= MAX_HOLD_DAYS)                         return "MAX_HOLD_DAYS";
  if (aiScore !== null && aiScore < AI_SCORE_EXIT)       return "AI_SCORE_DROP";
  if (!inTopN)                                           return "DROPPED_FROM_TOP10";
  return null; // still holding
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
  console.log(`  ${label.padEnd(30)} ${value}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("═".repeat(62));
  console.log(`  Swing Trade Strategy Engine${DRY_RUN ? "  🔍 DRY RUN" : ""}`);
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
    // Auto: use the latest date that has DailyRecommendation data
    const latestDR = await (prisma as any).dailyRecommendation.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (!latestDR) {
      console.log("\n⚠  No DailyRecommendation rows found. Exiting.");
      await prisma.$disconnect();
      return;
    }
    runDate = jstDate(latestDR.date as Date);
    row("Mode",    "auto (latest DR date)");
    row("runDate", runDate.toISOString().slice(0, 10));
  }

  const runDateStr = runDate.toISOString().slice(0, 10);

  // ── Step 2: TSE trading day check ──────────────────────────────────────────
  step("Check TSE trading day");

  if (isWeekend(runDate)) {
    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][runDate.getUTCDay()];
    console.log(`\n🚫 ${runDateStr} is a weekend (${dow}) — market closed. No trades.`);
    await prisma.$disconnect();
    return;
  }

  const priceCount = await (prisma as any).dailyPrice.count({ where: { date: runDate } });
  if (priceCount === 0) {
    console.log(`\n🚫 No DailyPrice data for ${runDateStr} — holiday or not yet synced.`);
    await prisma.$disconnect();
    return;
  }
  row("Day of week",        ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][runDate.getUTCDay()]);
  row("DailyPrice rows",    priceCount);

  // ── Idempotency: skip if already processed today ────────────────────────────
  const existingSnap = await (prisma as any).strategySnapshot.findUnique({
    where: { strategyType_snapshotDate: { strategyType: STRATEGY_TYPE, snapshotDate: runDate } },
  });
  if (existingSnap) {
    console.log(`\n✅ StrategySnapshot already exists for ${runDateStr}. Already processed.`);
    await printSummaryFromDB(runDate);
    await prisma.$disconnect();
    return;
  }

  // ── Step 3: Sync StrategyRecommendation (top-10 SWING candidates) ──────────
  step("Sync StrategyRecommendation (SWING_TRADE top 10)");

  type DrRow = {
    symbol: string; gptRank: number; adaptiveScore: number | null;
    finalScore: number | null; feat_technicalScore: number | null;
    feat_fundamentalScore: number | null; feat_newsSentimentScore: number | null;
    feat_moneyFlowScore: number | null; recommendation: string | null;
    summaryZh: string | null;
  };

  const existingRecs = await (prisma as any).strategyRecommendation.count({
    where: { strategyType: STRATEGY_TYPE, tradeDate: runDate },
  });

  let sourceRows: DrRow[] = [];
  let fallbackLabel = "";

  if (existingRecs === 0) {
    // L1: SWING typed + score ≥ 70 + BUY/STRONG_BUY
    const l1 = await (prisma as any).dailyRecommendation.findMany({
      where: {
        date: runDate,
        strategyType: DR_STRATEGY_TYPE,
        recommendation: { in: ["STRONG_BUY", "BUY"] },
        adaptiveScore: { gte: 70 },
      },
      orderBy: { gptRank: "asc" },
      take: TOP_N,
      select: {
        symbol: true, gptRank: true, adaptiveScore: true, finalScore: true,
        feat_technicalScore: true, feat_fundamentalScore: true,
        feat_newsSentimentScore: true, feat_moneyFlowScore: true,
        recommendation: true, summaryZh: true,
      },
    });

    if (l1.length > 0) {
      sourceRows = l1 as DrRow[];
    } else {
      // L2: SWING typed, relax score threshold
      const l2 = await (prisma as any).dailyRecommendation.findMany({
        where: { date: runDate, strategyType: DR_STRATEGY_TYPE },
        orderBy: { gptRank: "asc" },
        take: TOP_N,
        select: {
          symbol: true, gptRank: true, adaptiveScore: true, finalScore: true,
          feat_technicalScore: true, feat_fundamentalScore: true,
          feat_newsSentimentScore: true, feat_moneyFlowScore: true,
          recommendation: true, summaryZh: true,
        },
      });

      if (l2.length > 0) {
        sourceRows    = l2 as DrRow[];
        fallbackLabel = "L2: score threshold relaxed";
      } else {
        // L3: any BUY/STRONG_BUY (legacy dates before v15)
        const l3 = await (prisma as any).dailyRecommendation.findMany({
          where: { date: runDate, recommendation: { in: ["STRONG_BUY", "BUY"] } },
          orderBy: { gptRank: "asc" },
          take: TOP_N,
          select: {
            symbol: true, gptRank: true, adaptiveScore: true, finalScore: true,
            feat_technicalScore: true, feat_fundamentalScore: true,
            feat_newsSentimentScore: true, feat_moneyFlowScore: true,
            recommendation: true, summaryZh: true,
          },
        });

        if (l3.length === 0) {
          console.log(`\n⚠  No DailyRecommendation for ${runDateStr}. Cannot run Swing Strategy.`);
          await prisma.$disconnect();
          return;
        }
        sourceRows    = l3 as DrRow[];
        fallbackLabel = "L3: no SWING-typed recs, using top BUY/STRONG_BUY overall";
      }
    }

    if (fallbackLabel) console.log(`  ⚠  Fallback ${fallbackLabel}`);

    if (!DRY_RUN) {
      for (let i = 0; i < sourceRows.length; i++) {
        const dr = sourceRows[i];
        await (prisma as any).strategyRecommendation.upsert({
          where: { strategyType_tradeDate_symbol: { strategyType: STRATEGY_TYPE, tradeDate: runDate, symbol: dr.symbol } },
          create: {
            strategyType:         STRATEGY_TYPE,
            tradeDate:            runDate,
            symbol:               dr.symbol,
            rank:                 i + 1,
            aiScore:              dr.adaptiveScore,
            finalScore:           dr.finalScore,
            technicalScore:       dr.feat_technicalScore,
            fundamentalScore:     dr.feat_fundamentalScore,
            newsScore:            dr.feat_newsSentimentScore,
            moneyFlowScore:       dr.feat_moneyFlowScore,
            recommendationReason: dr.summaryZh ?? null,
            sourceScoreDate:      runDate,
          },
          update: {},
        });
      }
      row("StrategyRecommendation synced", sourceRows.length);
    } else {
      row("StrategyRecommendation [DRY]", `would sync ${sourceRows.length} rows`);
    }
  } else {
    // Load existing recs so we have the top-N set for "dropped from top10" check
    const existing = await (prisma as any).strategyRecommendation.findMany({
      where: { strategyType: STRATEGY_TYPE, tradeDate: runDate },
      orderBy: { rank: "asc" },
      take: TOP_N,
      select: { symbol: true, rank: true, aiScore: true },
    });
    sourceRows = (existing as any[]).map((r: any) => ({
      symbol: r.symbol, gptRank: r.rank, adaptiveScore: r.aiScore,
      finalScore: null, feat_technicalScore: null, feat_fundamentalScore: null,
      feat_newsSentimentScore: null, feat_moneyFlowScore: null,
      recommendation: null, summaryZh: null,
    }));
    row("StrategyRecommendation", `${existingRecs} rows already exist`);
  }

  const topNSymbolSet = new Set(sourceRows.map(r => r.symbol));
  const scoreMap = new Map<string, number | null>(
    sourceRows.map(r => [r.symbol, r.adaptiveScore])
  );

  console.log(`\n  Today's top ${sourceRows.length} SWING candidates:`);
  sourceRows.slice(0, 5).forEach((r, i) => {
    console.log(`    #${i + 1}  ${r.symbol}  score=${fmt(r.adaptiveScore ?? 0, 1)}`);
  });
  if (sourceRows.length > 5) console.log(`    … +${sourceRows.length - 5} more`);

  // ── Step 4: Load OPEN positions ─────────────────────────────────────────────
  step("Load OPEN positions");

  const openPositions = await (prisma as any).strategyPosition.findMany({
    where: { strategyType: STRATEGY_TYPE, status: "OPEN" },
    orderBy: { entryDate: "asc" },
  });

  row("OPEN positions", (openPositions as any[]).length);

  // ── Step 5: Load today's prices for open positions + new candidates ─────────
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

  // ── Step 6: TOPIX cumulative return helper ──────────────────────────────────
  // Sums daily topixChange from start+1 to end (inclusive)
  async function topixCumulative(from: Date, to: Date): Promise<number | null> {
    const rows = await (prisma as any).globalMarket.findMany({
      where: { date: { gt: from, lte: to } },
      select: { topixChange: true },
    });
    if ((rows as any[]).length === 0) return null;
    return (rows as any[]).reduce((s: number, r: any) => s + (r.topixChange ?? 0), 0);
  }

  // Today's TOPIX for snapshot
  const gmToday = await (prisma as any).globalMarket.findUnique({
    where: { date: runDate },
    select: { topixChange: true },
  });
  const topixToday = (gmToday as any)?.topixChange ?? null;
  row("TOPIX today", topixToday != null ? fmtPct(topixToday) : "N/A");

  // ── Step 7: Process exits for each open position ────────────────────────────
  step("Process exits");

  type ExitResult = {
    posId:          number;
    symbol:         string;
    entryDate:      Date;
    entryPrice:     number;
    quantity:       number;
    investedAmount: number;
    exitPrice:      number;
    exitValue:      number;
    holdingDays:    number;
    returnPct:      number;
    returnAmount:   number;
    topixReturnPct: number | null;
    alpha:          number | null;
    win:            boolean;
    exitReason:     string;
  };

  const exits: ExitResult[]                   = [];
  const stillOpen: typeof openPositions[0][]  = [];

  for (const pos of (openPositions as any[])) {
    const p           = priceMap.get(pos.symbol);
    const closePrice  = p?.close ?? pos.currentPrice ?? pos.entryPrice;
    const holdingDays = calDays(new Date(pos.entryDate), runDate);
    const retPct      = ((closePrice - pos.entryPrice) / pos.entryPrice) * 100;
    const inTopN      = topNSymbolSet.has(pos.symbol);
    const aiScore     = scoreMap.get(pos.symbol) ?? null;
    const reason      = exitReasonForSwing(retPct, holdingDays, inTopN, aiScore);

    if (reason) {
      const invested = pos.investedAmount ?? pos.quantity * pos.entryPrice;
      const exitVal  = pos.quantity * closePrice;
      const retAmt   = exitVal - invested;
      const topixRet = await topixCumulative(new Date(pos.entryDate), runDate);
      const alpha    = topixRet != null ? retPct - topixRet : null;

      exits.push({
        posId:          pos.id,
        symbol:         pos.symbol,
        entryDate:      new Date(pos.entryDate),
        entryPrice:     pos.entryPrice,
        quantity:       pos.quantity,
        investedAmount: invested,
        exitPrice:      closePrice,
        exitValue:      exitVal,
        holdingDays,
        returnPct:      retPct,
        returnAmount:   retAmt,
        topixReturnPct: topixRet,
        alpha,
        win:            retPct > 0,
        exitReason:     reason,
      });
    } else {
      stillOpen.push(pos);
    }
  }

  if (exits.length > 0) {
    console.log(`\n  Closing ${exits.length} position(s):`);
    console.log(`  ${"Symbol".padEnd(10)} ${"Entry".padStart(8)} ${"Exit".padStart(8)} ${"Days".padStart(5)} ${"Ret%".padStart(8)} Reason`);
    console.log(`  ${"-".repeat(58)}`);
    for (const e of exits) {
      console.log(
        `  ${e.symbol.padEnd(10)} ${String(e.entryPrice.toFixed(0)).padStart(8)}` +
        ` ${String(e.exitPrice.toFixed(0)).padStart(8)} ${String(e.holdingDays).padStart(5)}` +
        ` ${fmtPct(e.returnPct).padStart(8)} ${e.exitReason}`
      );
    }
  } else {
    console.log("  No positions met exit conditions today.");
  }

  // ── Step 8: Determine new positions to open ─────────────────────────────────
  step("Open new positions");

  const slotsAvailable = MAX_POSITIONS - stillOpen.length - exits.length;
  // symbols already in OPEN positions (still open after exits)
  const stillOpenSymbols = new Set(stillOpen.map((p: any) => p.symbol));

  const toOpen = newCandidates
    .filter(r => !stillOpenSymbols.has(r.symbol))
    .slice(0, Math.max(0, slotsAvailable));

  if (toOpen.length > 0) {
    console.log(`\n  Opening ${toOpen.length} new position(s) (${slotsAvailable} slots available):`);
    for (const r of toOpen) {
      const p = priceMap.get(r.symbol);
      const entryPrice = p?.open ?? 0;
      const qty        = entryPrice > 0 ? Math.floor(POSITION_SIZE / entryPrice / 100) * 100 : 0;
      console.log(`    ${r.symbol}  open=${entryPrice}  qty=${qty}  score=${fmt(r.adaptiveScore ?? 0, 1)}`);
    }
  } else {
    console.log(`  No new positions to open (slots: ${slotsAvailable}, candidates: ${newCandidates.length})`);
  }

  // ── Step 9: Compute capital state ───────────────────────────────────────────
  step("Compute capital state");

  // Get latest capital log to find current cash balance
  const latestCapLog = await (prisma as any).strategyCapitalLog.findFirst({
    where: { strategyType: STRATEGY_TYPE },
    orderBy: { createdAt: "desc" },
  });

  let cashBefore = (latestCapLog as any)?.cashAfter ?? POOL_INITIAL;
  let investedBefore = (latestCapLog as any)?.investedAfter ?? 0;

  // If no capital log at all and there are open positions, reconstruct from positions
  if (!latestCapLog && (openPositions as any[]).length > 0) {
    investedBefore = (openPositions as any[]).reduce(
      (s: number, p: any) => s + (p.investedAmount ?? p.quantity * p.entryPrice), 0
    );
    cashBefore = POOL_INITIAL - investedBefore;
  }

  // Cash after exits
  const exitCash    = exits.reduce((s, e) => s + e.exitValue, 0);
  const exitInvested = exits.reduce((s, e) => s + e.investedAmount, 0);

  // Cash after new entries
  const newEntries = toOpen.map(r => {
    const p     = priceMap.get(r.symbol);
    const price = p?.open ?? 0;
    const qty   = price > 0 ? Math.floor(POSITION_SIZE / price / 100) * 100 : 0;
    return { symbol: r.symbol, price, qty, invested: qty * price, score: r.adaptiveScore };
  }).filter(e => e.qty > 0);

  const newInvested = newEntries.reduce((s, e) => s + e.invested, 0);

  const cashAfter     = cashBefore + exitCash - newInvested;
  const investedAfter = investedBefore - exitInvested + newInvested;
  const totalBefore   = cashBefore + investedBefore;
  const totalAfter    = cashAfter + investedAfter;

  // Unrealized P&L from still-open positions
  const unrealizedPnl = stillOpen.reduce((s: number, p: any) => {
    const cp = priceMap.get(p.symbol)?.close ?? p.currentPrice ?? p.entryPrice;
    const invested = p.investedAmount ?? p.quantity * p.entryPrice;
    return s + (p.quantity * cp - invested);
  }, 0);

  const realizedPnl    = exits.reduce((s, e) => s + e.returnAmount, 0);
  const cumulativeRet  = ((totalAfter - POOL_INITIAL) / POOL_INITIAL) * 100;

  const closedAll = await (prisma as any).strategyTradeResult.count({
    where: { strategyType: STRATEGY_TYPE, status: "CLOSED" },
  });
  const winsAll = await (prisma as any).strategyTradeResult.count({
    where: { strategyType: STRATEGY_TYPE, status: "CLOSED", win: true },
  });
  const winRate = closedAll > 0 ? (winsAll / closedAll) * 100 : 0;

  row("Cash before",     fmtYen(cashBefore));
  row("Cash after",      fmtYen(cashAfter));
  row("Invested after",  fmtYen(investedAfter));
  row("Total after",     fmtYen(totalAfter));
  row("Realized P&L",    fmtYen(realizedPnl));
  row("Unrealized P&L",  fmtYen(unrealizedPnl));
  row("Cumulative ret",  fmtPct(cumulativeRet));

  // ── Step 10: DB writes ───────────────────────────────────────────────────────
  step(DRY_RUN ? "DB writes skipped (Dry Run)" : "Write to database");

  if (DRY_RUN) {
    const totalOOpen = stillOpen.length + newEntries.length;
    console.log("\n  [DRY RUN] Would write:");
    console.log(`    StrategyPosition CLOSE    × ${exits.length}`);
    console.log(`    StrategyPosition OPEN new × ${newEntries.length}`);
    console.log(`    StrategyTradeResult       × ${exits.length}`);
    console.log(`    StrategySnapshot          × 1  (${runDateStr}  SWING_TRADE)`);
    console.log(`    StrategyCapitalLog        × 1`);
    console.log(`    Open positions after run  : ${totalOOpen}`);
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

    // Write StrategyTradeResult — use exitDate as tradeDate key
    await (prisma as any).strategyTradeResult.upsert({
      where: {
        strategyType_tradeDate_symbol: {
          strategyType: STRATEGY_TYPE,
          tradeDate:    runDate,
          symbol:       e.symbol,
        },
      },
      create: {
        strategyType:    STRATEGY_TYPE,
        tradeDate:       runDate,
        symbol:          e.symbol,
        entryDate:       e.entryDate,
        entryPrice:      e.entryPrice,
        exitDate:        runDate,
        exitPrice:       e.exitPrice,
        quantity:        e.quantity,
        investedAmount:  e.investedAmount,
        exitValue:       e.exitValue,
        returnPct:       e.returnPct,
        returnAmount:    e.returnAmount,
        topixReturnPct:  e.topixReturnPct,
        alpha:           e.alpha,
        win:             e.win,
        holdingDays:     e.holdingDays,
        exitReason:      e.exitReason,
        status:          "CLOSED",
      },
      update: {},
    });
  }

  // 10b. Update still-open positions (currentPrice, currentValue, holdingDays)
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
          strategyType: STRATEGY_TYPE,
          symbol:       e.symbol,
          entryDate:    runDate,
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

  // 10d. Write StrategySnapshot (CREATE-only)
  const snap = await (prisma as any).strategySnapshot.findUnique({
    where: { strategyType_snapshotDate: { strategyType: STRATEGY_TYPE, snapshotDate: runDate } },
  });
  if (!snap) {
    await (prisma as any).strategySnapshot.create({
      data: {
        strategyType:        STRATEGY_TYPE,
        snapshotDate:        runDate,
        totalValue:          totalAfter,
        cash:                cashAfter,
        investedValue:       investedAfter,
        dailyReturnPct:      realizedPnl > 0 || realizedPnl < 0
          ? (realizedPnl / (exits.reduce((s, e) => s + e.investedAmount, 0) || 1)) * 100
          : 0,
        cumulativeReturnPct: cumulativeRet,
        topixReturnPct:      topixToday,
        alpha:               topixToday != null ? cumulativeRet - topixToday : null,
        winRate:             closedAll + exits.length > 0
          ? ((winsAll + exits.filter(e => e.win).length) / (closedAll + exits.length)) * 100
          : null,
        openPositions:  totalOpenAfter,
        closedTrades:   closedAll + exits.length,
      },
    });
    console.log("  ✅ StrategySnapshot created");
  }

  // 10e. Write StrategyCapitalLog
  await (prisma as any).strategyCapitalLog.create({
    data: {
      strategyType:    STRATEGY_TYPE,
      logDate:         runDate,
      cashBefore,
      cashAfter,
      investedBefore,
      investedAfter,
      totalBefore,
      totalAfter,
      changeAmount:    totalAfter - totalBefore,
      changeReason:    `SWING ${runDateStr} open=${totalOpenAfter} close=${exits.length} new=${newEntries.length}`,
    },
  });
  console.log("  ✅ StrategyCapitalLog updated");

  // ── Final summary ─────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  const winExits = exits.filter(e => e.win);
  console.log("\n" + "═".repeat(62));
  console.log(`  Swing Strategy Complete — ${runDateStr}`);
  console.log(`  Exits:      ${exits.length}  (${winExits.length}W / ${exits.length - winExits.length}L)`);
  console.log(`  New open:   ${newEntries.length}`);
  console.log(`  Still open: ${stillOpen.length}`);
  console.log(`  Total open: ${totalOpenAfter} / ${MAX_POSITIONS}`);
  console.log(`  Realized:   ${fmtYen(realizedPnl)} today`);
  console.log(`  Pool:       ${fmtYen(totalBefore)} → ${fmtYen(totalAfter)}`);
  console.log(`  Cumulative: ${fmtPct(cumulativeRet)}`);
  console.log(`  Win rate:   ${fmt(winRate, 1)}% (all time)`);
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
  console.log(`\n  Snapshot: totalValue=${fmtYen((snap as any).totalValue ?? 0)}`);
  console.log(`  Open: ${(snap as any).openPositions ?? 0}  ` +
    `Closed(all): ${(snap as any).closedTrades ?? 0}  ` +
    `Cumul: ${fmtPct((snap as any).cumulativeReturnPct ?? 0)}`);
}

// ── Entry ─────────────────────────────────────────────────────────────────────
main().catch(e => {
  console.error("\n❌ Swing Strategy Engine crashed:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
