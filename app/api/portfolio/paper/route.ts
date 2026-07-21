// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { guardAdminRoute } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// T2 P5 — Paper Broker account summary (read-only view of the simulated ¥10M account).
const POOL: Record<string, number> = { DAY_TRADE: 3_000_000, SWING_TRADE: 4_000_000, LONG_TRADE: 3_000_000 };
const STRATS = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const;

const isoDate = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));

// Read the newest data-health-guard report (written daily to reports/) for the CRITICAL count.
// Best-effort, read-only; returns nulls on any failure so the dashboard degrades gracefully.
function readHealth(): { critical: number | null; status: string | null } {
  try {
    const dir = path.join(process.cwd(), "reports");
    const files = fs.readdirSync(dir).filter((f) => f.startsWith("data-health-guard-") && f.endsWith(".json"));
    if (!files.length) return { critical: null, status: null };
    files.sort();
    const j = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"));
    return { critical: typeof j.criticalCount === "number" ? j.criticalCount : null, status: j.status ?? null };
  } catch {
    return { critical: null, status: null };
  }
}

// T3 P1 — read-only dashboard aggregation. No engine/paper/schema mutation; all queries are
// bounded (open positions ~tens, closed trades all-time, StockScore join on ≤~50 symbols,
// GlobalMarket single-row lookups). "Insufficient" is surfaced explicitly, never faked.
async function computeDashboard(p: any, accountId: number, ctx: any) {
  const {
    initialCapital, totalCash, positionsValue, totalAssets, cumulativePnl, cumulativePnlPct,
    todayPnl, todayStr, todayDate, openPositions, closedFull, pools, lineage,
  } = ctx;

  // ── Enrichment: StockScore for names / AI score / action / risk ────────────
  const symSet = new Set<string>();
  for (const x of openPositions) symSet.add(x.symbol);
  const recentExecs: any[] = ctx.recentExecutions ?? [];
  for (const x of recentExecs) symSet.add(x.symbol);
  const symbols = [...symSet];
  const scoreRows = symbols.length
    ? await p.stockScore.findMany({
        where: { symbol: { in: symbols } },
        select: { symbol: true, name: true, nameZh: true, adaptiveScore: true, recommendationV2: true, tradingAction: true, actionRiskLevel: true },
      })
    : [];
  const scoreMap = new Map<string, any>(scoreRows.map((r: any) => [r.symbol, r]));
  const nm = (s: string) => ({ name: scoreMap.get(s)?.name ?? null, nameZh: scoreMap.get(s)?.nameZh ?? null });

  // ── Benchmark (TOPIX / Nikkei) over the account's trade period ─────────────
  const firstExec = await p.paperExecution.aggregate({ where: { accountId }, _min: { execDate: true } });
  const startDate: Date | null = firstExec._min.execDate ?? null;
  const [gmStart, gmLatest] = await Promise.all([
    startDate
      ? p.globalMarket.findFirst({ where: { date: { lte: startDate } }, orderBy: { date: "desc" }, select: { topix: true, nikkei: true } })
      : null,
    p.globalMarket.findFirst({ orderBy: { date: "desc" }, select: { topix: true, nikkei: true, topixChange: true, nikkeiChange: true, date: true } }),
  ]);
  const bench = (start: number | null | undefined, end: number | null | undefined) =>
    start != null && end != null && start !== 0 ? ((end - start) / start) * 100 : null;
  const benchTopixPct = bench(gmStart?.topix, gmLatest?.topix);
  const benchNikkeiPct = bench(gmStart?.nikkei, gmLatest?.nikkei);

  // ── Today's orders + executions (enhanced) ─────────────────────────────────
  const [todayOrdersFull, todayExecs] = todayDate
    ? await Promise.all([
        p.paperOrder.findMany({ where: { accountId, orderDate: todayDate }, orderBy: [{ id: "asc" }], select: { id: true, strategyType: true, symbol: true, side: true, requestedQty: true, filledQty: true, status: true, rejectReason: true, createdAt: true } }),
        p.paperExecution.findMany({ where: { accountId, execDate: todayDate }, select: { orderId: true, price: true, amount: true, quantity: true } }),
      ])
    : [[], []];
  const execByOrder = new Map<number, any>((todayExecs as any[]).map((e: any) => [e.orderId, e]));

  const todayBuys = (todayOrdersFull as any[]).filter((o: any) => o.side === "BUY" && o.status === "FILLED").length;
  const todaySells = (todayOrdersFull as any[]).filter((o: any) => o.side === "SELL" && o.status === "FILLED").length;

  // ── Daily realized P&L (from closed trades) → consecutive win/loss days ─────
  const byDay = new Map<string, number>();
  for (const c of closedFull) {
    const d = isoDate(c.exitDate);
    if (d) byDay.set(d, (byDay.get(d) ?? 0) + (c.returnAmount ?? 0));
  }
  const dayEntries = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)); // desc by date
  let consecWin = 0, consecLoss = 0;
  for (const [, pnl] of dayEntries) { if (pnl > 0) consecWin++; else break; }
  for (const [, pnl] of dayEntries) { if (pnl < 0) consecLoss++; else break; }

  // ── Performance metrics (null where data insufficient — never 0-as-real) ───
  const wins = closedFull.filter((c: any) => (c.returnAmount ?? 0) > 0);
  const losses = closedFull.filter((c: any) => (c.returnAmount ?? 0) < 0);
  const sumWin = wins.reduce((a: number, c: any) => a + (c.returnAmount ?? 0), 0);
  const sumLoss = losses.reduce((a: number, c: any) => a + (c.returnAmount ?? 0), 0);
  const nClosed = closedFull.length;
  const holdDaysArr = closedFull.filter((c: any) => c.entryDate && c.exitDate).map((c: any) => daysBetween(c.entryDate, c.exitDate));
  const performanceMetrics = {
    cumulativeReturnPct: cumulativePnlPct,
    todayReturnPct: totalAssets - todayPnl !== 0 ? (todayPnl / (totalAssets - todayPnl)) * 100 : null,
    maxDrawdown: null, // needs a daily NAV history the paper account has not accumulated yet
    winRate: nClosed > 0 ? (wins.length / nClosed) * 100 : null,
    avgProfit: wins.length > 0 ? sumWin / wins.length : null,
    avgLoss: losses.length > 0 ? sumLoss / losses.length : null,
    profitFactor: sumLoss !== 0 ? sumWin / Math.abs(sumLoss) : null,
    avgHoldingDays: holdDaysArr.length > 0 ? holdDaysArr.reduce((a: number, x: number) => a + x, 0) / holdDaysArr.length : null,
    totalTrades: nClosed,
    currentPositions: openPositions.length,
    cashRatio: totalAssets > 0 ? (totalCash / totalAssets) * 100 : null,
    positionUtilization: totalAssets > 0 ? (positionsValue / totalAssets) * 100 : null,
  };

  // ── Risk metrics + risk level ──────────────────────────────────────────────
  // Risk-level rule (traceable, no ML):
  //   HIGH   : cashRatio < 15%  OR  maxSingleStock > 35%  OR  consecutiveLossDays >= 3
  //   LOW    : cashRatio >= 40% AND maxSingleStock <= 20% AND consecutiveLossDays == 0
  //   MEDIUM : everything in between
  const posVals = openPositions.map((x: any) => x.currentValue ?? 0).sort((a: number, b: number) => b - a);
  const maxSingle = totalAssets > 0 && posVals.length ? (posVals[0] / totalAssets) * 100 : 0;
  const top5 = totalAssets > 0 ? (posVals.slice(0, 5).reduce((a: number, x: number) => a + x, 0) / totalAssets) * 100 : 0;
  const cashRatio = totalAssets > 0 ? (totalCash / totalAssets) * 100 : 0;
  let riskLevel: "LOW" | "MEDIUM" | "HIGH";
  if (cashRatio < 15 || maxSingle > 35 || consecLoss >= 3) riskLevel = "HIGH";
  else if (cashRatio >= 40 && maxSingle <= 20 && consecLoss === 0) riskLevel = "LOW";
  else riskLevel = "MEDIUM";
  const grandTotal = pools.reduce((a: number, x: any) => a + x.total, 0);
  const riskMetrics = {
    cashRatio, positionRatio: totalAssets > 0 ? (positionsValue / totalAssets) * 100 : 0,
    maxSingleStock: maxSingle, top5Concentration: top5,
    strategyAllocation: pools.map((x: any) => ({ strategyType: x.strategyType, pct: grandTotal > 0 ? (x.total / grandTotal) * 100 : 0 })),
    consecutiveWinDays: consecWin, consecutiveLossDays: consecLoss, riskLevel,
  };

  // ── Contributors / detractors (open unrealized + today realized) ───────────
  const contribPool = [
    ...openPositions.map((x: any) => ({ symbol: x.symbol, amount: x.returnAmount ?? 0 })),
    ...closedFull.filter((c: any) => isoDate(c.exitDate) === todayStr).map((c: any) => ({ symbol: c.symbol, amount: c.returnAmount ?? 0 })),
  ];
  const sortedContrib = [...contribPool].sort((a, b) => b.amount - a.amount);
  const topContributor = sortedContrib.length && sortedContrib[0].amount > 0 ? { ...sortedContrib[0], ...nm(sortedContrib[0].symbol) } : null;
  const worst = sortedContrib.length ? sortedContrib[sortedContrib.length - 1] : null;
  const topDetractor = worst && worst.amount < 0 ? { ...worst, ...nm(worst.symbol) } : null;

  const health = readHealth();

  // ── Boss summary ───────────────────────────────────────────────────────────
  const bossSummary = {
    today: { pnl: todayPnl, returnPct: performanceMetrics.todayReturnPct, profited: todayPnl > 0 ? "YES" : todayPnl < 0 ? "NO" : "FLAT" },
    assets: { initialCapital, totalAssets, cash: totalCash, positionsValue },
    cumulative: { pnl: cumulativePnl, returnPct: cumulativePnlPct, benchTopixPct, benchNikkeiPct, beatTopix: benchTopixPct == null ? null : cumulativePnlPct > benchTopixPct, beatNikkei: benchNikkeiPct == null ? null : cumulativePnlPct > benchNikkeiPct },
    accountStatus: {
      mode: "paper",
      synced: lineage.paperExecution.latestDate != null && lineage.paperExecution.latestDate === lineage.strategyTradeResult.latestDate,
      paperLatestDate: lineage.paperExecution.latestDate,
      strategyLatestDate: lineage.strategyTradeResult.latestDate,
      healthCritical: health.critical, healthStatus: health.status,
      pipeline: {
        done: [lineage.stockScore.latestDate, lineage.strategyRecommendation.latestDate, lineage.strategyTradeResult.latestDate,
          lineage.paperExecution.latestDate != null && lineage.paperExecution.latestDate === lineage.strategyTradeResult.latestDate ? "x" : null,
          health.critical != null ? "x" : null].filter(Boolean).length,
        total: 5,
      },
    },
    tradeSummary: { todayBuys, todaySells, currentPositions: openPositions.length, totalExecutions: lineage.paperExecution.count },
  };

  // ── Strategy pools (enhanced) ──────────────────────────────────────────────
  const todayClosedByStrat: Record<string, number> = { DAY_TRADE: 0, SWING_TRADE: 0, LONG_TRADE: 0 };
  for (const c of closedFull) if (isoDate(c.exitDate) === todayStr) todayClosedByStrat[c.strategyType] = (todayClosedByStrat[c.strategyType] ?? 0) + (c.returnAmount ?? 0);
  const ordersByStrat = (side: string) => {
    const m: Record<string, number> = { DAY_TRADE: 0, SWING_TRADE: 0, LONG_TRADE: 0 };
    for (const o of todayOrdersFull as any[]) if (o.side === side && o.status === "FILLED") m[o.strategyType] = (m[o.strategyType] ?? 0) + 1;
    return m;
  };
  const buysByStrat = ordersByStrat("BUY"), sellsByStrat = ordersByStrat("SELL");
  const strategyPools = pools.map((x: any) => ({
    ...x,
    cumulativeReturnPct: x.pool > 0 ? ((x.total - x.pool) / x.pool) * 100 : 0,
    todayPnl: todayClosedByStrat[x.strategyType] ?? 0,
    todayBuys: buysByStrat[x.strategyType] ?? 0,
    todaySells: sellsByStrat[x.strategyType] ?? 0,
  }));

  // ── Holdings (enhanced) ────────────────────────────────────────────────────
  const today = todayDate ? new Date(todayDate) : new Date();
  const holdingsEnhanced = openPositions.map((pos: any) => {
    const sc = scoreMap.get(pos.symbol);
    return {
      strategyType: pos.strategyType, symbol: pos.symbol, ...nm(pos.symbol),
      quantity: pos.quantity, entryPrice: pos.entryPrice, currentPrice: pos.currentPrice, currentValue: pos.currentValue,
      unrealizedAmount: pos.returnAmount, unrealizedPct: pos.returnPct,
      holdingDays: pos.entryDate ? daysBetween(pos.entryDate, today) : null,
      aiScore: sc?.adaptiveScore ?? null, action: sc?.tradingAction ?? sc?.recommendationV2 ?? null, riskLevel: sc?.actionRiskLevel ?? null,
    };
  });

  // ── Today trades (enhanced) ────────────────────────────────────────────────
  const todayTradesEnhanced = (todayOrdersFull as any[]).map((o: any) => {
    const e = execByOrder.get(o.id);
    return {
      time: o.createdAt, strategyType: o.strategyType, symbol: o.symbol, ...nm(o.symbol),
      side: o.side, quantity: e?.quantity ?? o.filledQty, price: e?.price ?? null, amount: e?.amount ?? null,
      status: o.status, rejectReason: o.rejectReason,
    };
  });

  // ── Recent executions (enhanced) ───────────────────────────────────────────
  const recentExecutionsEnhanced = recentExecs.map((e: any) => ({
    execDate: e.execDate, strategyType: e.strategyType, symbol: e.symbol, ...nm(e.symbol),
    side: e.side, quantity: e.quantity, price: e.price, amount: e.amount, priceBasis: e.priceBasis,
    fee: 0, source: e.strategyType, broker: "Paper",
  }));

  // ── NAV series — the paper account has not yet accumulated a daily NAV history ─
  const navSeries = { insufficient: true, points: [] as any[] };

  // ── AI daily summary (template — NO model call; all fields from real data) ──
  const nkChg = gmLatest?.nikkeiChange ?? gmLatest?.topixChange ?? null;
  const marketState = nkChg == null ? "UNKNOWN" : nkChg > 0.3 ? "UP" : nkChg < -0.3 ? "DOWN" : "FLAT";
  let suggestion: "CAUTION" | "WATCH" | "NORMAL";
  if (riskLevel === "HIGH") suggestion = "CAUTION";
  else if (todayPnl < 0 && riskLevel === "MEDIUM") suggestion = "WATCH";
  else suggestion = "NORMAL";
  const aiDailySummary = {
    marketState, todayBuys, todaySells, currentPositions: openPositions.length,
    todayPnl, cumulativePnl,
    topContributor, topDetractor, riskLevel, suggestion,
    running: bossSummary.accountStatus.synced,
  };

  return { bossSummary, strategyPools, holdingsEnhanced, todayTradesEnhanced, recentExecutionsEnhanced, navSeries, performanceMetrics, riskMetrics, aiDailySummary };
}

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

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

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
      p.paperPosition.findMany({ where: { accountId, status: "CLOSED" }, select: { strategyType: true, symbol: true, entryDate: true, exitDate: true, returnAmount: true, returnPct: true, investedAmount: true, quantity: true, entryPrice: true, exitPrice: true } }),
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

    const cumulativePnlPct = (cumulativePnl / account.initialCapital) * 100;
    const lineage = await computeLineage(p, accountId);
    const dashboard = await computeDashboard(p, accountId, {
      initialCapital: account.initialCapital, totalCash, positionsValue, totalAssets,
      cumulativePnl, cumulativePnlPct, todayPnl, todayStr, todayDate,
      openPositions, closedFull: closedPositions, pools, recentExecutions, lineage,
    });

    return NextResponse.json({
      initialized: true,
      mode: account.mode,
      initialCapital: account.initialCapital,
      totals: {
        totalAssets, totalCash, positionsValue,
        cumulativePnl, cumulativePnlPct,
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
      lineage,
      ...dashboard,
    });
  } catch (e: any) {
    console.error("[portfolio/paper]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
