#!/usr/bin/env npx tsx
/**
 * T2 P5 — Paper Broker（自动交易模拟账户）
 *
 * 独立的模拟券商层。**只读镜像**三条真实策略引擎已发生的成交：
 *   DAY_TRADE   ← StrategyTradeResult (status=CLOSED，当日开+平)
 *   SWING/LONG  ← StrategyPosition   (OPEN→BUY，CLOSED→SELL，多日持仓)
 * 写入独立的 ¥10,000,000 模拟账户（DAY 3M / SWING 4M / LONG 3M），
 * 按 paper 自身资金池给仓位定量（paper POSITION_SIZE = 池 / MAX_POSITIONS）。
 *
 * 铁律：
 *  - 只读策略表（StrategyTradeResult / StrategyPosition / DailyPrice），绝不修改。
 *  - 现金不足 → REJECTED_INSUFFICIENT_CASH；买不起一手 → REJECTED + LOT_SIZE_TOO_SMALL。
 *  - 禁止负现金、禁止超出策略资金池。
 *  - 每笔成交写 PaperCashLog。
 *  - 幂等：按 sourceId 判断是否已镜像，重跑不重复下单。
 *  - 不接真实券商 API。BROKER_MODE=paper（唯一实现），预留 live 扩展。
 *
 * 用法：npx tsx scripts/paper-broker.ts   （cron 07:30 slot 策略执行后调用）
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BROKER_MODE = process.env.BROKER_MODE ?? "paper";
const INITIAL_CAPITAL = 10_000_000;

type Strat = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";
const STRATS: Strat[] = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"];

const POOL: Record<Strat, number>          = { DAY_TRADE: 3_000_000, SWING_TRADE: 4_000_000, LONG_TRADE: 3_000_000 };
const MAX_POSITIONS: Record<Strat, number> = { DAY_TRADE: 5,          SWING_TRADE: 10,        LONG_TRADE: 10 };
const POSITION_SIZE: Record<Strat, number> = {
  DAY_TRADE:   POOL.DAY_TRADE   / MAX_POSITIONS.DAY_TRADE,   // ¥600,000
  SWING_TRADE: POOL.SWING_TRADE / MAX_POSITIONS.SWING_TRADE, // ¥400,000
  LONG_TRADE:  POOL.LONG_TRADE  / MAX_POSITIONS.LONG_TRADE,  // ¥300,000
};

const p = prisma as any;
const lot = (size: number, price: number) => (price > 0 ? Math.floor(size / price / 100) * 100 : 0);

async function main() {
  console.log(`\n━━━ Paper Broker (mode=${BROKER_MODE}) ━━━`);
  if (BROKER_MODE !== "paper") {
    console.log(`⚠  BROKER_MODE=${BROKER_MODE} 非 paper — live 模式未实现，退出。`);
    await prisma.$disconnect();
    return;
  }

  // ── 1. Ensure account + seed initial pool cash logs ────────────────────────
  let account = await p.paperAccount.findFirst({ orderBy: { id: "asc" } });
  if (!account) {
    account = await p.paperAccount.create({ data: { mode: "paper", initialCapital: INITIAL_CAPITAL } });
    console.log(`✅ Created PaperAccount #${account.id} (¥${INITIAL_CAPITAL.toLocaleString()})`);
    // Seed one INIT cash log per pool so the ledger explicitly starts at 3M/4M/3M.
    const initDate = new Date();
    initDate.setUTCHours(0, 0, 0, 0);
    for (const s of STRATS) {
      await p.paperCashLog.create({
        data: {
          accountId: account.id, strategyType: s, logDate: initDate,
          cashBefore: 0, cashAfter: POOL[s], changeAmount: POOL[s], reason: "INIT_POOL",
        },
      });
    }
    console.log(`✅ Seeded pools: DAY ¥${POOL.DAY_TRADE.toLocaleString()} / SWING ¥${POOL.SWING_TRADE.toLocaleString()} / LONG ¥${POOL.LONG_TRADE.toLocaleString()}`);
  }
  const accountId = account.id as number;

  // In-memory cash per pool, seeded from the latest ledger entry (resume-safe).
  const cash: Record<Strat, number> = { DAY_TRADE: POOL.DAY_TRADE, SWING_TRADE: POOL.SWING_TRADE, LONG_TRADE: POOL.LONG_TRADE };
  for (const s of STRATS) {
    // Order by id (insertion = processing order), NOT logDate: the INIT_POOL log is
    // dated "today" while trade logs carry historical trade dates, so logDate-desc
    // would wrongly pick INIT_POOL as "latest". id is monotonic with processing order.
    const last = await p.paperCashLog.findFirst({
      where: { accountId, strategyType: s },
      orderBy: { id: "desc" },
      select: { cashAfter: true },
    });
    if (last) cash[s] = last.cashAfter;
  }

  const stats = { dayMirrored: 0, dayRejected: 0, swingLong: 0, markUpdated: 0 };

  // Helper: create a filled order + execution + cash log inside one transaction.
  async function fill(
    strat: Strat, symbol: string, side: "BUY" | "SELL", date: Date, qty: number,
    price: number, basis: "OPEN" | "CLOSE", sourceType: string, sourceId: number,
    reason: string,
  ) {
    const amount = price * qty;
    const before = cash[strat];
    const after = side === "BUY" ? before - amount : before + amount;
    await p.$transaction(async (tx: any) => {
      const order = await tx.paperOrder.create({
        data: {
          accountId, strategyType: strat, symbol, side, orderDate: date,
          requestedQty: qty, filledQty: qty, status: "FILLED", sourceType, sourceId,
        },
      });
      await tx.paperExecution.create({
        data: {
          accountId, orderId: order.id, strategyType: strat, symbol, side,
          execDate: date, price, quantity: qty, amount, priceBasis: basis,
        },
      });
      await tx.paperCashLog.create({
        data: {
          accountId, strategyType: strat, logDate: date,
          cashBefore: before, cashAfter: after, changeAmount: after - before,
          reason, orderId: order.id,
        },
      });
    }, { timeout: 30000 });
    cash[strat] = after;
  }

  async function reject(strat: Strat, symbol: string, side: "BUY" | "SELL", date: Date, qty: number, sourceType: string, sourceId: number, rejectReason: string) {
    await p.paperOrder.create({
      data: {
        accountId, strategyType: strat, symbol, side, orderDate: date,
        requestedQty: qty, filledQty: 0, status: "REJECTED", rejectReason, sourceType, sourceId,
      },
    });
  }

  // ── 2. Mirror DAY_TRADE (StrategyTradeResult, same-day round trip) ─────────
  const dayTrades = await p.strategyTradeResult.findMany({
    where: { strategyType: "DAY_TRADE", status: "CLOSED", entryPrice: { not: null }, exitPrice: { not: null } },
    orderBy: { tradeDate: "asc" },
    select: { id: true, symbol: true, tradeDate: true, entryDate: true, exitDate: true, entryPrice: true, exitPrice: true },
  });
  // Which sources already mirrored (any order for that sourceId)?
  const mirroredDay = new Set<number>(
    (await p.paperOrder.findMany({
      where: { accountId, sourceType: "STRATEGY_TRADE_RESULT" }, select: { sourceId: true },
    })).map((o: any) => o.sourceId),
  );

  for (const t of dayTrades) {
    if (mirroredDay.has(t.id)) continue;
    const entryDate = new Date(t.entryDate ?? t.tradeDate);
    const exitDate  = new Date(t.exitDate ?? t.tradeDate);
    const qty = lot(POSITION_SIZE.DAY_TRADE, t.entryPrice);
    if (qty <= 0) {
      await reject("DAY_TRADE", t.symbol, "BUY", entryDate, 0, "STRATEGY_TRADE_RESULT", t.id, "LOT_SIZE_TOO_SMALL");
      stats.dayRejected++;
      continue;
    }
    const cost = t.entryPrice * qty;
    if (cost > cash.DAY_TRADE + 1e-6) {
      await reject("DAY_TRADE", t.symbol, "BUY", entryDate, qty, "STRATEGY_TRADE_RESULT", t.id, "INSUFFICIENT_CASH");
      stats.dayRejected++;
      continue;
    }
    // BUY at open, then SELL at close (same day) — cash round-trips, nets to P&L.
    await fill("DAY_TRADE", t.symbol, "BUY", entryDate, qty, t.entryPrice, "OPEN", "STRATEGY_TRADE_RESULT", t.id, `BUY ${t.symbol}`);
    await fill("DAY_TRADE", t.symbol, "SELL", exitDate, qty, t.exitPrice, "CLOSE", "STRATEGY_TRADE_RESULT", t.id, `SELL ${t.symbol}`);
    const invested = t.entryPrice * qty;
    const proceeds = t.exitPrice * qty;
    await p.paperPosition.create({
      data: {
        accountId, strategyType: "DAY_TRADE", symbol: t.symbol, status: "CLOSED",
        entryDate, entryPrice: t.entryPrice, quantity: qty, investedAmount: invested,
        currentPrice: t.exitPrice, currentValue: 0,
        exitDate, exitPrice: t.exitPrice,
        returnPct: ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100,
        returnAmount: proceeds - invested, sourceId: t.id,
      },
    });
    stats.dayMirrored++;
  }

  // ── 3. Mirror SWING / LONG (StrategyPosition lifecycle, multi-day) ─────────
  //     Currently no-op while the Swing/Long engines are FROZEN (Phase 7). Code
  //     handles OPEN→BUY / CLOSED→SELL so paper pools light up on activation.
  for (const strat of ["SWING_TRADE", "LONG_TRADE"] as Strat[]) {
    const positions = await p.strategyPosition.findMany({
      where: { strategyType: strat },
      orderBy: { entryDate: "asc" },
      select: { id: true, symbol: true, status: true, entryDate: true, entryPrice: true, exitDate: true, exitPrice: true },
    });
    const buys = new Map<number, any>(
      (await p.paperOrder.findMany({
        where: { accountId, strategyType: strat, side: "BUY", sourceType: "STRATEGY_POSITION" },
        select: { sourceId: true, status: true },
      })).map((o: any) => [o.sourceId, o]),
    );
    const sells = new Set<number>(
      (await p.paperOrder.findMany({
        where: { accountId, strategyType: strat, side: "SELL", sourceType: "STRATEGY_POSITION" },
        select: { sourceId: true },
      })).map((o: any) => o.sourceId),
    );

    for (const pos of positions) {
      // OPEN leg
      if (!buys.has(pos.id)) {
        const entryDate = new Date(pos.entryDate);
        const qty = lot(POSITION_SIZE[strat], pos.entryPrice);
        if (qty <= 0) {
          await reject(strat, pos.symbol, "BUY", entryDate, 0, "STRATEGY_POSITION", pos.id, "LOT_SIZE_TOO_SMALL");
          continue;
        }
        const cost = pos.entryPrice * qty;
        if (cost > cash[strat] + 1e-6) {
          await reject(strat, pos.symbol, "BUY", entryDate, qty, "STRATEGY_POSITION", pos.id, "INSUFFICIENT_CASH");
          continue;
        }
        await fill(strat, pos.symbol, "BUY", entryDate, qty, pos.entryPrice, "OPEN", "STRATEGY_POSITION", pos.id, `BUY ${pos.symbol}`);
        await p.paperPosition.create({
          data: {
            accountId, strategyType: strat, symbol: pos.symbol, status: "OPEN",
            entryDate, entryPrice: pos.entryPrice, quantity: qty, investedAmount: cost,
            currentPrice: pos.entryPrice, currentValue: cost, sourceId: pos.id,
          },
        });
        buys.set(pos.id, { status: "FILLED" });
        stats.swingLong++;
      }
      // CLOSE leg
      if (pos.status === "CLOSED" && pos.exitPrice != null && !sells.has(pos.id)) {
        const pp = await p.paperPosition.findFirst({ where: { accountId, strategyType: strat, sourceId: pos.id, status: "OPEN" } });
        if (pp) {
          const exitDate = new Date(pos.exitDate ?? pos.entryDate);
          const proceeds = pos.exitPrice * pp.quantity;
          await fill(strat, pos.symbol, "SELL", exitDate, pp.quantity, pos.exitPrice, "CLOSE", "STRATEGY_POSITION", pos.id, `SELL ${pos.symbol}`);
          await p.paperPosition.update({
            where: { id: pp.id },
            data: {
              status: "CLOSED", exitDate, exitPrice: pos.exitPrice, currentPrice: pos.exitPrice, currentValue: 0,
              returnPct: ((pos.exitPrice - pp.entryPrice) / pp.entryPrice) * 100,
              returnAmount: proceeds - pp.investedAmount,
            },
          });
          stats.swingLong++;
        }
      }
    }
  }

  // ── 4. Mark-to-market OPEN paper positions with latest DailyPrice close ────
  const openPositions = await p.paperPosition.findMany({ where: { accountId, status: "OPEN" } });
  for (const pp of openPositions) {
    const latest = await p.dailyPrice.findFirst({
      where: { symbol: pp.symbol }, orderBy: { date: "desc" }, select: { close: true, adjClose: true },
    });
    const px = latest ? (latest.close ?? latest.adjClose) : null;
    if (px != null) {
      await p.paperPosition.update({
        where: { id: pp.id },
        data: {
          currentPrice: px, currentValue: px * pp.quantity,
          returnPct: ((px - pp.entryPrice) / pp.entryPrice) * 100,
          returnAmount: px * pp.quantity - pp.investedAmount,
        },
      });
      stats.markUpdated++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`  DAY mirrored:   ${stats.dayMirrored} (rejected ${stats.dayRejected})`);
  console.log(`  SWING/LONG legs: ${stats.swingLong}`);
  console.log(`  Marked-to-market: ${stats.markUpdated} open`);
  console.log(`  Cash: DAY ¥${Math.round(cash.DAY_TRADE).toLocaleString()} / SWING ¥${Math.round(cash.SWING_TRADE).toLocaleString()} / LONG ¥${Math.round(cash.LONG_TRADE).toLocaleString()}`);
  console.log("✅ Paper Broker sync complete.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[paper-broker] fatal", e);
  await prisma.$disconnect();
  process.exit(1);
});
