// ── P18 · AI Mission Lab · 引擎（M1 · 双阶段 Forward Test，无未来函数）──────────
// Phase1 prepareMissionDay（08:20 开盘前）：仅生成/校验今日决策 → READY_FOR_OPEN。
//   绝不生成 Trade / 改 Position / 扣现金 / 成交。标记仅用「上一交易日已知收盘价」。
// Phase2 executeMissionDay（09:30 开盘后·默认）：读实时行情(regularMarketTime 校验新鲜) → 成交。
//   幂等：READY_FOR_OPEN→EXECUTING 的 CAS 认领 + Trade.decisionId 唯一 + 原子现金增减 + NAV upsert。
// 只读 StockScore/Research；只写 ai_mission_*；绝不碰 paper_/user_/strategy_/评分。
import { prisma } from "../prisma";
import { MISSION_CONFIGS, STRATEGY_VERSION, type MissionConfig } from "./config";
import { fetchSignals, fetchCandidates, fetchLatestCloses, fetchRealtimeQuotes, fetchBenchmarkReturn, fetchSectorHeat, type RealtimeQuote } from "./signals";
import { decide, type PositionState } from "./strategy";
import { buildExplain } from "./explain";

const openTime = (d: string) => new Date(`${d}T00:00:00.000Z`); // 09:00 JST 开盘 = 00:00 UTC
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000)));
const PRICE_SOURCE = "yahoo_realtime";
const FOLLOWABLE_BAND = 0.005; // 建议可跟随成交区间 ±0.5%（非固定成交价）
const followBand = (p: number) => ({ followablePriceLow: +(p * (1 - FOLLOWABLE_BAND)).toFixed(2), followablePriceHigh: +(p * (1 + FOLLOWABLE_BAND)).toFixed(2) });

// ═══ Phase 1（开盘前）：准备 + 校验 + 生成 READY_FOR_OPEN，绝不成交 ═══
export async function prepareMissionDay(missionId: string, tradingDay: string) {
  const mission = await prisma.aiMission.findUnique({ where: { id: missionId } });
  if (!mission || mission.status !== "ACTIVE") return { skipped: true as const, reason: mission?.status ?? "not_found" };
  if (mission.lastPrepareDate === tradingDay) return { skipped: true as const, reason: "already_prepared" }; // 幂等
  const cfg = MISSION_CONFIGS[mission.missionType as "WEEKLY" | "MONTHLY"];

  const positions = await prisma.aiMissionPosition.findMany({ where: { missionId, status: "OPEN" } });
  const heldSyms = positions.map((p) => p.symbol);
  const [signals, candidates, sectorHeat, latestCloses] = await Promise.all([
    fetchSignals(heldSyms),
    fetchCandidates({ recommendations: cfg.buyRecommendations, minAiScore: cfg.minAiScore, limit: cfg.maxPositions * 3 }),
    fetchSectorHeat(),
    fetchLatestCloses(heldSyms),
  ]);
  const sigMap = new Map(signals);
  for (const c of candidates) if (!sigMap.has(c.symbol)) sigMap.set(c.symbol, c);

  // 上一交易日已知收盘价做标记（开盘前唯一合法参考，非成交价）
  const posStates: PositionState[] = positions.map((p) => ({ symbol: p.symbol, qty: p.qty, avgCost: p.avgCost, lastClose: latestCloses.get(p.symbol) ?? p.lastPrice ?? p.avgCost }));
  const positionsValue = posStates.reduce((s, p) => s + p.qty * p.lastClose, 0);
  const equity = +(mission.cashJpy + positionsValue).toFixed(2);
  const returnPct = +((equity / mission.initialCapital - 1) * 100).toFixed(2);
  const holdingsSnapshot = posStates.map((p) => ({ symbol: p.symbol, qty: p.qty, avgCost: p.avgCost, lastClose: p.lastClose, returnPct: +((p.lastClose / p.avgCost - 1) * 100).toFixed(2) }));

  const intents = decide({ cashJpy: mission.cashJpy, equityJpy: equity, positions: posStates, signals: sigMap, candidates, cfg });
  let tradeable = 0;
  for (const it of intents) {
    const sig = it.signal;
    const heat = sig?.sector ? sectorHeat.get(sig.sector) ?? null : null;
    const ex = buildExplain({ action: it.action, missionType: mission.missionType, signal: sig, position: it.position, cashJpy: mission.cashJpy, equityJpy: equity, qty: it.qty, refPrice: it.refPrice, takeProfitPrice: it.takeProfitPrice, stopLossPrice: it.stopLossPrice, rulesTriggered: it.rulesTriggered, industryHeat: heat });
    const isTrade = it.action !== "HOLD" && it.action !== "NO_ACTION";
    if (isTrade) tradeable++;
    await prisma.aiMissionDecision.create({ data: {
      missionId, decidedAt: new Date(),
      signalTime: sig?.computedAt ?? new Date(), // 数据 as-of（07:30 评分，开盘前，严格早于成交）
      executionWindow: isTrade ? `OPEN:${tradingDay}` : `NONE:${tradingDay}`,
      status: isTrade ? "READY_FOR_OPEN" : "NOOP",
      symbol: it.symbol, action: it.action, qty: it.qty, refPrice: it.refPrice,
      cashJpy: mission.cashJpy, equityJpy: equity, returnPctAtTime: returnPct, holdingsSnapshot,
      aiScore: sig?.aiScore ?? null, recommendation: sig?.recommendation ?? null, industryHeat: heat,
      newsImpact: sig?.newsScore ?? null, riskLevel: sig?.actionRiskLevel ?? sig?.riskOverride ?? null,
      explainWhy: ex.explainWhy, explainStructured: ex.explainStructured as object, rulesTriggered: ex.rulesTriggered,
      strategyVersion: STRATEGY_VERSION,
    } });
  }
  await prisma.aiMission.update({ where: { id: missionId }, data: { equityJpy: equity, lastPrepareDate: tradingDay } });
  return { skipped: false as const, prepared: intents.length, tradeable };
}

// ═══ Phase 2（开盘后）：实时行情成交（幂等） ═══
export async function executeMissionDay(missionId: string, tradingDay: string) {
  const mission = await prisma.aiMission.findUnique({ where: { id: missionId } });
  if (!mission || mission.status !== "ACTIVE") return { skipped: true as const, reason: mission?.status ?? "not_found" };
  const cfg = MISSION_CONFIGS[mission.missionType as "WEEKLY" | "MONTHLY"];
  const todayOpenMs = openTime(tradingDay).getTime();

  // 崩溃恢复：EXECUTING 决策若已有成交→EXECUTED，否则回退 READY_FOR_OPEN（幂等前置）。
  const stuck = await prisma.aiMissionDecision.findMany({ where: { missionId, status: "EXECUTING", executionWindow: `OPEN:${tradingDay}` } });
  for (const d of stuck) {
    const t = await prisma.aiMissionTrade.findUnique({ where: { decisionId: d.id } });
    await prisma.aiMissionDecision.update({ where: { id: d.id }, data: t ? { status: "EXECUTED", tradeId: t.id } : { status: "READY_FOR_OPEN" } });
  }

  const decisions = await prisma.aiMissionDecision.findMany({ where: { missionId, status: "READY_FOR_OPEN", executionWindow: `OPEN:${tradingDay}` }, orderBy: { decidedAt: "asc" } });
  const symbols = [...new Set(decisions.map((d) => d.symbol).filter((s): s is string => !!s))];
  const quotes = await fetchRealtimeQuotes(symbols);

  let filled = 0, skipped = 0;
  for (const d of decisions) {
    if (!d.symbol || !d.qty || d.qty <= 0) { await claim(d.id, "NOOP"); continue; }
    const q = quotes.get(d.symbol);
    const fresh = q && q.price != null && q.price > 0 && q.time != null && q.time >= todayOpenMs;
    if (!fresh) { await claim(d.id, "SKIPPED"); skipped++; continue; } // 无开盘后新鲜行情 → 跳过，绝不回填/模拟

    // CAS 认领：READY_FOR_OPEN → EXECUTING（0 行=已被处理）
    const claimed = await prisma.aiMissionDecision.updateMany({ where: { id: d.id, status: "READY_FOR_OPEN" }, data: { status: "EXECUTING" } });
    if (claimed.count === 0) continue;
    try {
      const ok = await fillDecision(missionId, cfg, d, { price: q!.price as number, time: q!.time as number });
      await prisma.aiMissionDecision.update({ where: { id: d.id }, data: ok.done ? { status: "EXECUTED", tradeId: ok.tradeId } : { status: ok.status } });
      if (ok.done) filled++;
    } catch (e) {
      // Trade.decisionId 唯一冲突 = 已成交（幂等），标 EXECUTED；否则回退重试。
      const t = await prisma.aiMissionTrade.findUnique({ where: { decisionId: d.id } });
      await prisma.aiMissionDecision.update({ where: { id: d.id }, data: t ? { status: "EXECUTED", tradeId: t.id } : { status: "READY_FOR_OPEN" } });
      if (t) filled++; else console.error(`fillDecision ${d.id} 失败(回退):`, (e as Error).message);
    }
  }

  const nav = await markAndSnapshot(missionId, tradingDay, quotes, todayOpenMs);
  await prisma.aiMission.update({ where: { id: missionId }, data: { lastExecuteDate: tradingDay } });
  return { skipped: false as const, filled, skippedNoQuote: skipped, decisions: decisions.length, nav };
}

async function claim(id: string, status: string) {
  await prisma.aiMissionDecision.updateMany({ where: { id, status: "READY_FOR_OPEN" }, data: { status } });
}

// 单个决策成交（事务 + 原子现金 + Trade 唯一 → 恰好一次）。
async function fillDecision(missionId: string, cfg: MissionConfig, d: { id: string; symbol: string | null; action: string; qty: number | null; signalTime: Date; executionWindow: string | null; explainStructured: unknown }, q: { price: number; time: number }): Promise<{ done: boolean; tradeId?: string; status?: string }> {
  const symbol = d.symbol!;
  const isBuy = d.action === "BUY" || d.action === "ADD";
  const execPrice = +(isBuy ? q.price * (1 + cfg.slippagePct / 100) : q.price * (1 - cfg.slippagePct / 100)).toFixed(2);
  const marketPriceAt = new Date(q.time);
  const es = (d.explainStructured ?? {}) as { takeProfit?: number | null; stopLoss?: number | null };

  return prisma.$transaction(async (tx) => {
    const pos = await tx.aiMissionPosition.findFirst({ where: { missionId, symbol, status: "OPEN" } });
    if (isBuy) {
      const m = await tx.aiMission.findUnique({ where: { id: missionId }, select: { cashJpy: true } });
      const cash = m?.cashJpy ?? 0;
      let qty = d.qty!;
      if (qty * execPrice > cash) { const lot = 100; qty = Math.floor(cash / execPrice / lot) * lot; }
      if (qty <= 0) return { done: false, status: "EXPIRED" };
      const amount = +(qty * execPrice).toFixed(2);
      const trade = await tx.aiMissionTrade.create({ data: { missionId, symbol, action: d.action, qty, price: execPrice, amount, executionPrice: execPrice, ...followBand(execPrice), marketPriceAt, priceSource: PRICE_SOURCE, executionWindow: d.executionWindow, slippagePct: cfg.slippagePct, signalTime: d.signalTime, executedAt: new Date(), decisionId: d.id } });
      if (pos) {
        const newQty = pos.qty + qty;
        const newAvg = +((pos.qty * pos.avgCost + qty * execPrice) / newQty).toFixed(4);
        await tx.aiMissionPosition.update({ where: { id: pos.id }, data: { qty: newQty, avgCost: newAvg, costBasis: +(newQty * newAvg).toFixed(2), lastPrice: execPrice, takeProfitPrice: es.takeProfit ?? pos.takeProfitPrice, stopLossPrice: es.stopLoss ?? pos.stopLossPrice } });
      } else {
        await tx.aiMissionPosition.create({ data: { missionId, symbol, qty, avgCost: execPrice, costBasis: amount, openedAt: new Date(), lastPrice: execPrice, marketValue: amount, takeProfitPrice: es.takeProfit ?? null, stopLossPrice: es.stopLoss ?? null } });
      }
      await tx.aiMission.update({ where: { id: missionId }, data: { cashJpy: { decrement: amount } } });
      return { done: true, tradeId: trade.id };
    }
    // 卖出类：SELL/TP/SL 全平，REDUCE 部分
    if (!pos) return { done: false, status: "EXPIRED" };
    const qty = Math.min(d.qty!, pos.qty);
    const amount = +(qty * execPrice).toFixed(2);
    const pnl = +((execPrice - pos.avgCost) * qty).toFixed(2);
    const holdingDays = daysBetween(pos.openedAt, new Date());
    const trade = await tx.aiMissionTrade.create({ data: { missionId, symbol, action: d.action, qty, price: execPrice, amount, executionPrice: execPrice, ...followBand(execPrice), marketPriceAt, priceSource: PRICE_SOURCE, executionWindow: d.executionWindow, slippagePct: cfg.slippagePct, signalTime: d.signalTime, executedAt: new Date(), decisionId: d.id, realizedPnl: pnl, returnPct: +((execPrice / pos.avgCost - 1) * 100).toFixed(2), holdingDays, isWin: pnl > 0, isTakeProfit: d.action === "TP", isStopLoss: d.action === "SL" } });
    const remain = pos.qty - qty;
    if (remain <= 0) await tx.aiMissionPosition.update({ where: { id: pos.id }, data: { qty: 0, status: "CLOSED", closedAt: new Date(), marketValue: 0, lastPrice: execPrice } });
    else await tx.aiMissionPosition.update({ where: { id: pos.id }, data: { qty: remain, costBasis: +(remain * pos.avgCost).toFixed(2), lastPrice: execPrice } });
    await tx.aiMission.update({ where: { id: missionId }, data: { cashJpy: { increment: amount }, realizedPnl: { increment: pnl } } });
    return { done: true, tradeId: trade.id };
  });
}

// 开盘后按实时价标记市值 + NAV 快照（TOPIX/Nikkei/Alpha/回撤）。
async function markAndSnapshot(missionId: string, tradingDay: string, quotes: Map<string, RealtimeQuote>, todayOpenMs: number) {
  const mission = await prisma.aiMission.findUnique({ where: { id: missionId } });
  if (!mission) return null;
  const positions = await prisma.aiMissionPosition.findMany({ where: { missionId, status: "OPEN" } });
  const need = positions.filter((p) => !quotes.has(p.symbol)).map((p) => p.symbol);
  if (need.length) { const extra = await fetchRealtimeQuotes(need); for (const [k, v] of extra) quotes.set(k, v); }

  for (const p of positions) {
    const q = quotes.get(p.symbol);
    const price = q && q.price != null && q.time != null && q.time >= todayOpenMs ? q.price : (p.lastPrice ?? p.avgCost);
    const mv = +(p.qty * price).toFixed(2);
    const uPct = +((price / p.avgCost - 1) * 100).toFixed(2);
    const maxGain = Math.max(p.maxUnrealizedGain, uPct);
    const maxDd = Math.min(p.maxDrawdownPct, +(uPct - maxGain).toFixed(2));
    await prisma.aiMissionPosition.update({ where: { id: p.id }, data: { lastPrice: price, marketValue: mv, unrealizedPnl: +((price - p.avgCost) * p.qty).toFixed(2), unrealizedPct: uPct, maxUnrealizedGain: maxGain, maxDrawdownPct: maxDd } });
  }

  const fresh = await prisma.aiMissionPosition.findMany({ where: { missionId, status: "OPEN" }, select: { marketValue: true } });
  const positionsValue = +fresh.reduce((s, p) => s + p.marketValue, 0).toFixed(2);
  const m2 = await prisma.aiMission.findUnique({ where: { id: missionId }, select: { cashJpy: true, initialCapital: true, peakEquity: true, startDate: true } });
  const equity = +((m2!.cashJpy) + positionsValue).toFixed(2);
  const returnPct = +((equity / m2!.initialCapital - 1) * 100).toFixed(3);
  const peak = Math.max(m2!.peakEquity || m2!.initialCapital, equity);
  const drawdownPct = +((equity / peak - 1) * 100).toFixed(3);
  const startStr = m2!.startDate.toISOString().slice(0, 10);
  const bench = await fetchBenchmarkReturn(startStr, tradingDay);
  const alpha = bench.topixReturn != null ? +(returnPct - bench.topixReturn).toFixed(3) : null;
  const prev = await prisma.aiMissionNav.findFirst({ where: { missionId, date: { lt: openTime(tradingDay) } }, orderBy: { date: "desc" }, select: { equityJpy: true } });
  const dailyReturnPct = prev && prev.equityJpy > 0 ? +((equity / prev.equityJpy - 1) * 100).toFixed(3) : 0;

  await prisma.aiMissionNav.upsert({
    where: { missionId_date: { missionId, date: openTime(tradingDay) } },
    create: { missionId, date: openTime(tradingDay), cashJpy: +m2!.cashJpy.toFixed(2), positionsValue, equityJpy: equity, returnPct, dailyReturnPct, drawdownPct, topixReturn: bench.topixReturn, nikkeiReturn: bench.nikkeiReturn, alpha },
    update: { cashJpy: +m2!.cashJpy.toFixed(2), positionsValue, equityJpy: equity, returnPct, dailyReturnPct, drawdownPct, topixReturn: bench.topixReturn, nikkeiReturn: bench.nikkeiReturn, alpha },
  });
  await prisma.aiMission.update({ where: { id: missionId }, data: { equityJpy: equity, peakEquity: peak } });
  return { equity, returnPct, drawdownPct, alpha, topixReturn: bench.topixReturn, nikkeiReturn: bench.nikkeiReturn };
}
