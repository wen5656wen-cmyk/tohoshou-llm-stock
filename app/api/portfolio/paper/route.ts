import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// T2 P5 — Paper Broker account summary (read-only view of the simulated ¥10M account).
const POOL: Record<string, number> = { DAY_TRADE: 3_000_000, SWING_TRADE: 4_000_000, LONG_TRADE: 3_000_000 };
const STRATS = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const;

// T2 P6 — read-only data-lineage aggregation (counts/dates only; no engine/logic/schema touch).
// DailyPrice freshness is derived from StockScore (3.7k rows, indexed) instead of scanning the
// 7.9M-row DailyPrice table (its only indexes start with `symbol`).
async function computeLineage(p: any, accountId: number | null) {
  const jstDate = (d: Date | null | undefined) =>
    d ? new Date(new Date(d).getTime() + 9 * 3600_000).toISOString().slice(0, 10) : null;
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

  const [dpMax, ssAgg, srLatest, strLatest, strCount] = await Promise.all([
    p.stockScore.aggregate({ _max: { latestDate: true } }),
    p.stockScore.aggregate({ _max: { computedAt: true }, _count: { _all: true } }),
    p.strategyRecommendation.findFirst({ orderBy: { tradeDate: "desc" }, select: { tradeDate: true } }),
    p.strategyTradeResult.findFirst({ where: { strategyType: "DAY_TRADE" }, orderBy: { tradeDate: "desc" }, select: { tradeDate: true } }),
    p.strategyTradeResult.count({ where: { strategyType: "DAY_TRADE" } }),
  ]);
  const dpLatestDate: string | null = dpMax._max.latestDate ?? null;
  const dpCount = dpLatestDate ? await p.stockScore.count({ where: { latestDate: dpLatestDate } }) : 0;

  let srDay = 0, srSwing = 0, srLong = 0;
  const srDate = srLatest?.tradeDate ?? null;
  if (srDate) {
    [srDay, srSwing, srLong] = await Promise.all([
      p.strategyRecommendation.count({ where: { strategyType: "DAY_TRADE", tradeDate: srDate } }),
      p.strategyRecommendation.count({ where: { strategyType: "SWING_TRADE", tradeDate: srDate } }),
      p.strategyRecommendation.count({ where: { strategyType: "LONG_TRADE", tradeDate: srDate } }),
    ]);
  }

  let poCount = 0, peCount = 0, ppOpen = 0, ppTotal = 0, pcCount = 0;
  let poLatest: any = null, peLatest: any = null;
  if (accountId != null) {
    [poCount, poLatest, peCount, peLatest, ppOpen, ppTotal, pcCount] = await Promise.all([
      p.paperOrder.count({ where: { accountId } }),
      p.paperOrder.findFirst({ where: { accountId }, orderBy: { orderDate: "desc" }, select: { orderDate: true } }),
      p.paperExecution.count({ where: { accountId } }),
      p.paperExecution.findFirst({ where: { accountId }, orderBy: [{ execDate: "desc" }, { id: "desc" }], select: { execDate: true } }),
      p.paperPosition.count({ where: { accountId, status: "OPEN" } }),
      p.paperPosition.count({ where: { accountId } }),
      p.paperCashLog.count({ where: { accountId } }),
    ]);
  }

  return {
    dailyPrice: { latestDate: dpLatestDate, count: dpCount },
    stockScore: { latestDate: jstDate(ssAgg._max.computedAt), count: ssAgg._count._all },
    strategyRecommendation: { latestDate: iso(srDate), day: srDay, swing: srSwing, long: srLong },
    strategyTradeResult: { latestDate: iso(strLatest?.tradeDate), count: strCount },
    paperOrder: { latestDate: iso(poLatest?.orderDate), count: poCount },
    paperExecution: { latestDate: iso(peLatest?.execDate), count: peCount },
    paperPosition: { open: ppOpen, total: ppTotal },
    paperCashLog: { count: pcCount },
  };
}

export async function GET() {
  const p = prisma as any;
  try {
    const account = await p.paperAccount.findFirst({ orderBy: { id: "asc" } });
    if (!account) {
      // Not yet initialized — return an explicit empty-but-valid account shape.
      const pools = STRATS.map((s) => ({ strategyType: s, pool: POOL[s], cash: POOL[s], positionsValue: 0, total: POOL[s], openCount: 0 }));
      return NextResponse.json({
        initialized: false, mode: "paper", initialCapital: 10_000_000,
        totals: { totalAssets: 10_000_000, totalCash: 10_000_000, positionsValue: 0, cumulativePnl: 0, cumulativePnlPct: 0, todayPnl: 0, realizedPnl: 0, unrealizedPnl: 0 },
        pools, positions: [], todayDate: null, todayOrders: [], recentExecutions: [],
        lineage: await computeLineage(p, null),
      });
    }
    const accountId = account.id;

    const [openPositions, closedPositions, latestOrder, recentExecutions] = await Promise.all([
      p.paperPosition.findMany({ where: { accountId, status: "OPEN" }, orderBy: { entryDate: "desc" } }),
      p.paperPosition.findMany({ where: { accountId, status: "CLOSED" }, select: { strategyType: true, exitDate: true, returnAmount: true } }),
      p.paperOrder.findFirst({ where: { accountId }, orderBy: { orderDate: "desc" }, select: { orderDate: true } }),
      p.paperExecution.findMany({ where: { accountId }, orderBy: [{ execDate: "desc" }, { id: "desc" }], take: 20 }),
    ]);

    // Current cash per pool = latest cash-log entry, else the initial pool.
    const cash: Record<string, number> = { ...POOL };
    for (const s of STRATS) {
      // Order by id (insertion=processing order), not logDate: the INIT_POOL log is
      // dated today while trade logs carry historical dates, so logDate-desc would
      // wrongly pick INIT_POOL. id is monotonic with processing order = true latest.
      const last = await p.paperCashLog.findFirst({
        where: { accountId, strategyType: s },
        orderBy: { id: "desc" },
        select: { cashAfter: true },
      });
      if (last) cash[s] = last.cashAfter;
    }

    const openByStrat: Record<string, any[]> = { DAY_TRADE: [], SWING_TRADE: [], LONG_TRADE: [] };
    for (const pos of openPositions) openByStrat[pos.strategyType]?.push(pos);

    const pools = STRATS.map((s) => {
      const posVal = openByStrat[s].reduce((a, pos) => a + (pos.currentValue ?? 0), 0);
      return { strategyType: s, pool: POOL[s], cash: cash[s], positionsValue: posVal, total: cash[s] + posVal, openCount: openByStrat[s].length };
    });

    const totalCash = pools.reduce((a, x) => a + x.cash, 0);
    const positionsValue = pools.reduce((a, x) => a + x.positionsValue, 0);
    const totalAssets = totalCash + positionsValue;
    const realizedPnl = closedPositions.reduce((a: number, x: any) => a + (x.returnAmount ?? 0), 0);
    const unrealizedPnl = openPositions.reduce((a: number, pos: any) => a + (pos.returnAmount ?? 0), 0);
    const cumulativePnl = totalAssets - account.initialCapital;

    const todayDate: Date | null = latestOrder?.orderDate ?? null;
    const todayStr = todayDate ? new Date(todayDate).toISOString().slice(0, 10) : null;
    const todayPnl = todayStr
      ? closedPositions
          .filter((x: any) => x.exitDate && new Date(x.exitDate).toISOString().slice(0, 10) === todayStr)
          .reduce((a: number, x: any) => a + (x.returnAmount ?? 0), 0)
      : 0;

    const todayOrders = todayStr
      ? await p.paperOrder.findMany({
          where: { accountId, orderDate: todayDate },
          orderBy: [{ strategyType: "asc" }, { id: "asc" }],
          select: { strategyType: true, symbol: true, side: true, orderDate: true, requestedQty: true, filledQty: true, status: true, rejectReason: true },
        })
      : [];

    return NextResponse.json({
      initialized: true,
      mode: account.mode,
      initialCapital: account.initialCapital,
      totals: {
        totalAssets, totalCash, positionsValue,
        cumulativePnl, cumulativePnlPct: (cumulativePnl / account.initialCapital) * 100,
        todayPnl, realizedPnl, unrealizedPnl,
      },
      pools,
      positions: openPositions.map((pos: any) => ({
        strategyType: pos.strategyType, symbol: pos.symbol, entryDate: pos.entryDate,
        entryPrice: pos.entryPrice, quantity: pos.quantity, investedAmount: pos.investedAmount,
        currentPrice: pos.currentPrice, currentValue: pos.currentValue,
        returnPct: pos.returnPct, returnAmount: pos.returnAmount,
      })),
      todayDate: todayStr,
      todayOrders,
      recentExecutions,
      lineage: await computeLineage(p, accountId),
    });
  } catch (e: any) {
    console.error("[portfolio/paper]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
