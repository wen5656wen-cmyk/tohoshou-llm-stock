#!/usr/bin/env npx tsx
/**
 * scripts/day-strategy.ts  — Day Trade Strategy Engine  (v2.0.0 — T+1 settlement)
 *
 * Day Trade 设计 (Trading-Architecture.md §3):
 *   - 资金池    ¥30,000,000  (DAY_TRADE)
 *   - 最大持仓  5只  等权分配  每只 ¥6,000,000
 *   - 止盈线    +1.5%
 *   - 止损线    -1.0%
 *   - 强制平仓  当日收盘（本脚本用 DailyPrice.close 模拟）
 *   - 禁止隔夜
 *
 * P0 修复（v2.0.0，2026-07-01）— T+1 结算时序:
 *   旧版本在 T 日 16:30 JST 结算 T 日交易，但 DailyPrice 只在次日 06:00 JST
 *   才同步完成，导致 16:30 时 T 日收盘价永远不存在 —— 每个交易日都会必然
 *   触发 "No DailyPrice data" 而放弃写入，Day Trade 自 2026-06-26 后从未
 *   产生过自动成交记录。
 *
 *   新时序：
 *     T 日   07:30 JST  generate-strategy-recs 生成 T 日推荐
 *     T+1 日 06:00 JST  sync-all-prices 同步 T 日完整 DailyPrice
 *     T+1 日 07:30 JST  cron 在价格同步完成后调用本脚本结算 T 日
 *
 *   tradeDate 字段仍记录真实交易日 T（不是结算发生的日期 T+1）。
 *   自动模式（无 --date）会自动处理所有「已有 StrategyRecommendation 但尚未
 *   结算」且早于今天（JST）的历史交易日，具备断点续跑能力：如果某天 cron
 *   漏跑，下一次运行会自动补上，不会永久丢失当天数据。
 *
 *   单只股票缺 open/close 价格时标记 SKIPPED_DATA_MISSING（不再使用
 *   WAITING_OPEN/WAITING_CLOSE）——因为 T+1 结算已经等过一整晚，缺失就是
 *   缺失，不是"等待中"；继续用 WAITING_* 会被 health guard 的 stale>24h
 *   检查误判为卡死数据（与 v17.23.0 SKIPPED_LOT_SIZE 修复同一类问题）。
 *
 * 执行流程（每个待结算交易日）:
 *   1. 检查是否交易日（周末跳过）
 *   2. 检查该日是否有 DailyPrice（全市场 0 条 = 节假日，整体跳过）
 *   3. 读取 StrategyRecommendation（由 generate-strategy-recs 预先生成）
 *   4. 幂等检查（当日 TradeResult 已存在则跳过）
 *   5. 逐股票读取开盘/收盘价，缺失的标记 SKIPPED_DATA_MISSING（不影响其他股票）
 *   6. 计算交易结果 + TOPIX Alpha
 *   7. 写入 StrategyTradeResult / StrategySnapshot / StrategyCapitalLog
 *
 * Usage:
 *   npm run day-strategy                     # 自动结算所有待处理的历史交易日（不含今天）
 *   npm run day-strategy:dry                  # Dry Run（不写 DB）
 *   npx tsx scripts/day-strategy.ts --date=2026-06-26            # 手动指定/补跑单日
 *   npx tsx scripts/day-strategy.ts --dry-run --date=2026-06-26
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Constants (per Trading-Architecture.md §3 & §7) ──────────────────────────
const STRATEGY_TYPE     = "DAY_TRADE";
const POOL_INITIAL       = 30_000_000;     // ¥30M
const MAX_POSITIONS      = 5;
const POSITION_SIZE      = POOL_INITIAL / MAX_POSITIONS; // ¥6M per stock
const TAKE_PROFIT_PCT    = 1.5;            // +1.5%
const STOP_LOSS_PCT      = -1.0;           // -1.0%
const MAX_CATCHUP_DAYS   = 20;             // safety cap per run in auto mode

// ── CLI args ──────────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes("--dry-run");
const dateArg   = process.argv.find(a => a.startsWith("--date="))?.split("=")[1];

// ── Prisma ────────────────────────────────────────────────────────────────────
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ── Helpers ───────────────────────────────────────────────────────────────────
function jstDate(d?: Date): Date {
  const src  = d ?? new Date();
  const jst  = new Date(src.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

function fmt(n: number, dec = 2): string {
  return n.toFixed(dec);
}

function fmtYen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function exitReason(returnPct: number): string {
  if (returnPct >= TAKE_PROFIT_PCT) return "TAKE_PROFIT";
  if (returnPct <= STOP_LOSS_PCT)   return "STOP_LOSS";
  return "DAY_CLOSE";
}

function row(label: string, value: string | number) {
  console.log(`  ${label.padEnd(28)} ${value}`);
}

// ── Print summary from existing DB records (already-processed days) ─────────
async function printSummaryFromDB(tradeDate: Date) {
  const tradeDateStr = tradeDate.toISOString().slice(0, 10);
  const trades = await (prisma as any).strategyTradeResult.findMany({
    where: { strategyType: STRATEGY_TYPE, tradeDate },
    select: { symbol: true, returnPct: true, returnAmount: true, win: true, status: true, exitReason: true },
  });
  const closed = (trades as any[]).filter(t => t.status === "CLOSED");
  const wins   = closed.filter(t => t.win);
  const pnl    = closed.reduce((s: number, t: any) => s + (t.returnAmount ?? 0), 0);

  console.log(`\n  Already processed: ${tradeDateStr}`);
  console.log(`  Closed: ${closed.length}/${(trades as any[]).length}  Wins: ${wins.length}  P&L: ${fmtYen(pnl)}`);
  (trades as any[]).forEach((t: any) => {
    const ret = t.returnPct != null ? `${t.returnPct >= 0 ? "+" : ""}${fmt(t.returnPct)}%` : t.status;
    console.log(`    ${t.symbol.padEnd(10)} ${ret.padStart(8)}  ${t.exitReason}`);
  });
}

type SettleResult = "settled" | "already_done" | "market_closed" | "no_recommendations";

// ═══════════════════════════════════════════════════════════════════════════════
// Settle a single trade date. Never throws for expected business conditions
// (holiday / no recs / already settled) — only for real errors.
// ═══════════════════════════════════════════════════════════════════════════════
async function settleDate(tradeDate: Date): Promise<SettleResult> {
  const tradeDateStr = tradeDate.toISOString().slice(0, 10);

  console.log("\n" + "═".repeat(62));
  console.log(`  Day Trade Strategy Engine — settling ${tradeDateStr}${DRY_RUN ? "  🔍 DRY RUN" : ""}`);
  console.log("═".repeat(62));

  // ── Step 1: Trading day check ────────────────────────────────────────────
  if (isWeekend(tradeDate)) {
    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][tradeDate.getUTCDay()];
    console.log(`\n🚫 ${tradeDateStr} is a weekend (${dow}) — market closed.`);
    return "market_closed";
  }
  row("Day of week", ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][tradeDate.getUTCDay()]);

  // Check if prices exist at all for this date (holiday detection).
  // NOTE: this only tells us the date was a trading day (market-wide data
  // exists) — individual missing symbols are handled per-symbol below via
  // SKIPPED_DATA_MISSING, not by aborting the whole date.
  const priceCount = await (prisma as any).dailyPrice.count({ where: { date: tradeDate } });
  if (priceCount === 0) {
    console.log(`\n🚫 No DailyPrice data at all for ${tradeDateStr} — holiday or not yet synced.`);
    return "market_closed";
  }
  row("DailyPrice rows for date (market-wide)", priceCount);

  // ── Step 2: Load StrategyRecommendation ──────────────────────────────────
  const srRecs = await (prisma as any).strategyRecommendation.findMany({
    where: { strategyType: STRATEGY_TYPE, tradeDate },
    orderBy: { rank: "asc" },
    take: MAX_POSITIONS,
    select: { symbol: true, rank: true, aiScore: true },
  });

  if (srRecs.length === 0) {
    console.log(`\n⚠  No StrategyRecommendation for ${tradeDateStr} (${STRATEGY_TYPE}).`);
    return "no_recommendations";
  }

  const candidates = (srRecs as any[]).map(r => ({
    symbol:  r.symbol  as string,
    rank:    r.rank    as number,
    aiScore: r.aiScore as number | null,
  }));

  row("StrategyRecommendation", srRecs.length);
  console.log("\n  Candidates:");
  candidates.forEach(c => console.log(`    #${c.rank}  ${c.symbol}  score=${fmt(c.aiScore ?? 0, 1)}`));

  // ── Step 3: Idempotency check ─────────────────────────────────────────────
  // P1-2 fix: key idempotency on StrategySnapshot (written atomically as the last
  // step of the settlement transaction), NOT on StrategyTradeResult count. The old
  // count-based check could early-return "already_done" after a crash that wrote
  // some TradeResult rows but never the Snapshot/CapitalLog, permanently locking a
  // half-settled day. With the settlement now wrapped in a single transaction, the
  // Snapshot's presence means the whole day committed.
  const existingSnap0 = await (prisma as any).strategySnapshot.findUnique({
    where: { strategyType_snapshotDate: { strategyType: STRATEGY_TYPE, snapshotDate: tradeDate } },
  });

  if (existingSnap0) {
    console.log(`\n✅ StrategySnapshot already exists for ${tradeDateStr}. Already settled — skipping.`);
    await printSummaryFromDB(tradeDate);
    return "already_done";
  }
  row("Existing settlement", "none");

  // ── Step 4: Load prices ───────────────────────────────────────────────────
  const symbols = candidates.map(c => c.symbol);

  const prices = await (prisma as any).dailyPrice.findMany({
    where: { symbol: { in: symbols }, date: tradeDate },
    select: { symbol: true, open: true, close: true, high: true, low: true },
  });

  const priceMap = new Map<string, { open: number; close: number; high: number; low: number }>(
    (prices as any[]).map((p: any) => [p.symbol, {
      open: p.open, close: p.close, high: p.high, low: p.low,
    }])
  );

  const missingPrices = symbols.filter(s => !priceMap.has(s));
  if (missingPrices.length > 0) {
    console.log(`  ⚠  Missing prices for: ${missingPrices.join(", ")} — will mark SKIPPED_DATA_MISSING`);
  }

  // ── Step 5: Load TOPIX return ─────────────────────────────────────────────
  const gm = await (prisma as any).globalMarket.findUnique({
    where: { date: tradeDate },
    select: { topixChange: true },
  });

  const topixReturn = (gm as any)?.topixChange ?? null;
  row("TOPIX 1d return", topixReturn != null ? `${fmt(topixReturn)}%` : "N/A");

  // ── Step 6: Load current capital state ────────────────────────────────────
  // P1-3 fix: locate the prior capital state by business date (logDate) strictly
  // before this trade date, NOT by write time (createdAt). Ordering by createdAt
  // returned the most-recently-written row, so an out-of-order `--date` backfill of
  // an earlier day picked a later day's balance as its base and corrupted the pool.
  const latestCapLog = await (prisma as any).strategyCapitalLog.findFirst({
    where: { strategyType: STRATEGY_TYPE, logDate: { lt: tradeDate } },
    orderBy: { logDate: "desc" },
  });

  const poolTotal = (latestCapLog as any)?.totalAfter ?? POOL_INITIAL;
  row("Pool total (before trade)", fmtYen(poolTotal));

  // ── Step 7: Calculate trades ──────────────────────────────────────────────
  type TradeCalc = {
    symbol:        string;
    rank:          number;
    entryPrice:    number;
    exitPrice:     number;
    quantity:      number;
    investedAmount: number;
    exitValue:     number;
    returnPct:     number;
    returnAmount:  number;
    topixReturnPct: number | null;
    alpha:         number | null;
    win:           boolean;
    exitReason:    string;
    status:        string;
  };

  const trades: TradeCalc[] = [];

  for (const c of candidates) {
    const p = priceMap.get(c.symbol);

    if (!p || !p.open || p.open <= 0 || !p.close || p.close <= 0) {
      // Data permanently missing for this symbol on this date — T+1 settlement
      // has already waited a full day for sync, so this is not "waiting",
      // it's a definitive skip. Never use WAITING_OPEN/WAITING_CLOSE here
      // (see v17.23.0 SKIPPED_LOT_SIZE incident for why that anti-pattern
      // breaks the stale>24h health check).
      trades.push({
        symbol: c.symbol, rank: c.rank,
        entryPrice: p?.open ?? 0, exitPrice: 0, quantity: 0,
        investedAmount: 0, exitValue: 0,
        returnPct: 0, returnAmount: 0,
        topixReturnPct: topixReturn, alpha: null,
        win: false, exitReason: "DATA_MISSING",
        status: "SKIPPED_DATA_MISSING",
      });
      continue;
    }

    const qty = Math.floor(POSITION_SIZE / p.open / 100) * 100;
    if (qty <= 0) {
      // Share price too high for one lot (100 shares) within POSITION_SIZE —
      // this is a permanent condition for this trade date, not missing data.
      trades.push({
        symbol: c.symbol, rank: c.rank,
        entryPrice: p.open, exitPrice: 0, quantity: 0,
        investedAmount: 0, exitValue: 0,
        returnPct: 0, returnAmount: 0,
        topixReturnPct: topixReturn, alpha: null,
        win: false, exitReason: "LOT_SIZE_TOO_SMALL",
        status: "SKIPPED_LOT_SIZE",
      });
      continue;
    }

    const invested   = qty * p.open;
    const exitVal    = qty * p.close;
    const retPct     = ((p.close - p.open) / p.open) * 100;
    const retAmt     = exitVal - invested;
    const reason     = exitReason(retPct);
    const alpha      = topixReturn != null ? retPct - topixReturn : null;

    trades.push({
      symbol:        c.symbol,
      rank:          c.rank,
      entryPrice:    p.open,
      exitPrice:     p.close,
      quantity:      qty,
      investedAmount: invested,
      exitValue:     exitVal,
      returnPct:     retPct,
      returnAmount:  retAmt,
      topixReturnPct: topixReturn,
      alpha,
      win:           retPct > 0,
      exitReason:    reason,
      status:        "CLOSED",
    });
  }

  // Summary stats
  const closedTrades   = trades.filter(t => t.status === "CLOSED");
  const winTrades      = closedTrades.filter(t => t.win);
  const winRate        = closedTrades.length > 0 ? winTrades.length / closedTrades.length : 0;
  const totalReturn    = closedTrades.reduce((s, t) => s + t.returnAmount, 0);
  const totalInvested  = closedTrades.reduce((s, t) => s + t.investedAmount, 0);
  const avgReturnPct   = closedTrades.length > 0
    ? closedTrades.reduce((s, t) => s + t.returnPct, 0) / closedTrades.length : 0;
  const validAlphas    = closedTrades.filter(t => t.alpha != null);
  const avgAlpha       = validAlphas.length > 0
    ? validAlphas.reduce((s, t) => s + (t.alpha ?? 0), 0) / validAlphas.length : null;

  const newPoolTotal   = poolTotal + totalReturn;
  const cumulativeRet  = ((newPoolTotal - POOL_INITIAL) / POOL_INITIAL) * 100;

  console.log("\n  Trade results:");
  console.log(`  ${"Symbol".padEnd(10)} ${"Entry".padStart(8)} ${"Exit".padStart(8)} ${"Qty".padStart(6)} ${"Ret%".padStart(7)} ${"Reason"}`);
  console.log(`  ${"-".repeat(60)}`);
  for (const t of trades) {
    const retStr = t.status === "CLOSED" ? `${t.returnPct >= 0 ? "+" : ""}${fmt(t.returnPct)}%` : t.status;
    console.log(
      `  ${t.symbol.padEnd(10)} ${String(t.entryPrice.toFixed(0)).padStart(8)} ${String(t.exitPrice.toFixed(0)).padStart(8)}` +
      ` ${String(t.quantity).padStart(6)} ${retStr.padStart(7)} ${t.exitReason}`
    );
  }

  console.log(`\n  Closed trades:  ${closedTrades.length} / ${trades.length}`);
  console.log(`  Win rate:       ${fmt(winRate * 100, 1)}%  (${winTrades.length}W / ${closedTrades.length - winTrades.length}L)`);
  console.log(`  Avg return:     ${avgReturnPct >= 0 ? "+" : ""}${fmt(avgReturnPct)}%`);
  console.log(`  Total P&L:      ${fmtYen(totalReturn)}`);
  console.log(`  Pool before:    ${fmtYen(poolTotal)}`);
  console.log(`  Pool after:     ${fmtYen(newPoolTotal)}`);
  if (avgAlpha != null) {
    console.log(`  Avg Alpha:      ${avgAlpha >= 0 ? "+" : ""}${fmt(avgAlpha)}% vs TOPIX`);
  }

  // ── Step 8: Write to DB ────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log("\n  [DRY RUN] Would write:");
    console.log(`    StrategyTradeResult  × ${trades.length}`);
    console.log(`    StrategySnapshot     × 1  (${tradeDateStr}  DAY_TRADE)`);
    console.log(`    StrategyCapitalLog   × 1`);
    console.log("\n✅ Dry Run complete — no changes made.");
    return "settled";
  }

  // P1-2 fix: write StrategyTradeResult rows + StrategySnapshot + StrategyCapitalLog
  // inside ONE transaction so settlement is all-or-nothing. A crash mid-loop now
  // rolls back cleanly and the next run redoes the full day (idempotency keyed on
  // Snapshot, see Step 3). Snapshot is created last as the completion marker.
  await (prisma as any).$transaction(async (tx: any) => {
    for (const t of trades) {
      await tx.strategyTradeResult.upsert({
        where: {
          strategyType_tradeDate_symbol: {
            strategyType: STRATEGY_TYPE,
            tradeDate,
            symbol: t.symbol,
          },
        },
        create: {
          strategyType:    STRATEGY_TYPE,
          tradeDate,
          symbol:          t.symbol,
          entryDate:       tradeDate,
          entryPrice:      t.entryPrice > 0 ? t.entryPrice : null,
          exitDate:        t.status === "CLOSED" ? tradeDate : null,
          exitPrice:       t.exitPrice > 0 ? t.exitPrice : null,
          quantity:        t.quantity,
          investedAmount:  t.investedAmount > 0 ? t.investedAmount : null,
          exitValue:       t.exitValue > 0 ? t.exitValue : null,
          returnPct:       t.status === "CLOSED" ? t.returnPct : null,
          returnAmount:    t.status === "CLOSED" ? t.returnAmount : null,
          topixReturnPct:  t.topixReturnPct,
          alpha:           t.alpha,
          win:             t.status === "CLOSED" ? t.win : null,
          holdingDays:     t.status === "CLOSED" ? 1 : null,
          exitReason:      t.exitReason,
          status:          t.status,
        },
        update: {},
      });
    }

    await tx.strategyCapitalLog.create({
      data: {
        strategyType:    STRATEGY_TYPE,
        logDate:         tradeDate,
        cashBefore:      poolTotal,
        cashAfter:       newPoolTotal,
        investedBefore:  0,          // no overnight coming in
        investedAfter:   0,          // no overnight going out
        totalBefore:     poolTotal,
        totalAfter:      newPoolTotal,
        changeAmount:    totalReturn,
        changeReason:    `DAY_CLOSE ${tradeDateStr} ${closedTrades.length}trades W${winTrades.length}L${closedTrades.length - winTrades.length}`,
      },
    });

    // Snapshot written LAST = atomic completion marker for the idempotency check.
    await tx.strategySnapshot.create({
      data: {
        strategyType:        STRATEGY_TYPE,
        snapshotDate:        tradeDate,
        totalValue:          newPoolTotal,
        cash:                newPoolTotal,       // Day Trade: full cash at end of day
        investedValue:       0,                  // no overnight positions
        dailyReturnPct:      totalInvested > 0
          ? (totalReturn / totalInvested) * 100
          : 0,
        cumulativeReturnPct: cumulativeRet,
        topixReturnPct:      topixReturn,
        alpha:               avgAlpha,
        winRate:             winRate,
        openPositions:       0,                  // Day Trade: always 0 at end of day
        closedTrades:        closedTrades.length,
      },
    });
  }, { timeout: 30000 });
  console.log(`  ✅ Settlement committed atomically — TradeResult × ${trades.length} + CapitalLog + Snapshot`);

  console.log(`\n  Day Strategy settled — ${tradeDateStr}`);
  console.log(`  Trades:  ${closedTrades.length} closed | ${trades.filter(t => t.status === "SKIPPED_DATA_MISSING").length} SKIPPED_DATA_MISSING | ${trades.filter(t => t.status === "SKIPPED_LOT_SIZE").length} SKIPPED_LOT_SIZE`);
  console.log(`  Win:     ${winTrades.length}/${closedTrades.length}  (${fmt(winRate * 100, 1)}%)`);
  console.log(`  P&L:     ${fmtYen(totalReturn)}`);
  console.log(`  Pool:    ${fmtYen(poolTotal)} → ${fmtYen(newPoolTotal)}`);
  console.log(`  Cumul:   ${cumulativeRet >= 0 ? "+" : ""}${fmt(cumulativeRet)}% since inception`);
  if (avgAlpha != null) console.log(`  Alpha:   ${avgAlpha >= 0 ? "+" : ""}${fmt(avgAlpha)}% vs TOPIX`);

  return "settled";
}

// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  const startedAt = new Date();

  if (dateArg) {
    // Explicit date from CLI — manual run / backfill for a specific historical day.
    const [y, m, d] = dateArg.split("-").map(Number);
    const tradeDate = new Date(Date.UTC(y, m - 1, d));
    await settleDate(tradeDate);
  } else {
    // Auto mode: catch up on every DAY_TRADE trading day that has a
    // StrategyRecommendation but is not yet settled, strictly before today
    // (JST) — "today" can never be settled same-day because its DailyPrice
    // close won't exist until tomorrow's 06:00 JST sync.
    const todayJst = jstDate();

    const recDates = await (prisma as any).strategyRecommendation.findMany({
      where: { strategyType: STRATEGY_TYPE, tradeDate: { lt: todayJst } },
      distinct: ["tradeDate"],
      orderBy: { tradeDate: "asc" },
      select: { tradeDate: true },
    });

    if (recDates.length === 0) {
      console.log("\n⚠  No past StrategyRecommendation (DAY_TRADE) found to settle.");
      console.log("   Run: npm run generate-strategy-recs first.");
    } else {
      const candidateDates = (recDates as any[]).map(r => jstDate(r.tradeDate));
      const toProcess = candidateDates.slice(-MAX_CATCHUP_DAYS); // most recent N, oldest first within that window
      if (candidateDates.length > MAX_CATCHUP_DAYS) {
        console.log(`\n⚠  ${candidateDates.length} candidate dates found — capping at most recent ${MAX_CATCHUP_DAYS} per run.`);
      }

      let settledCount = 0, alreadyDoneCount = 0, skippedCount = 0;
      for (const d of toProcess) {
        const result = await settleDate(d);
        if (result === "settled") settledCount++;
        else if (result === "already_done") alreadyDoneCount++;
        else skippedCount++;
      }

      console.log("\n" + "═".repeat(62));
      console.log(`  Day Trade catch-up run complete`);
      console.log(`  Dates processed:  ${toProcess.length}`);
      console.log(`  Newly settled:    ${settledCount}`);
      console.log(`  Already done:     ${alreadyDoneCount}`);
      console.log(`  Skipped (holiday/no-rec): ${skippedCount}`);
      console.log(`  Elapsed: ${((Date.now() - startedAt.getTime()) / 1000).toFixed(1)}s`);
      console.log("═".repeat(62));
    }
  }

  await prisma.$disconnect();
}

// ── Entry ─────────────────────────────────────────────────────────────────────
main().catch(e => {
  console.error("\n❌ Day Strategy Engine crashed:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
