// ── P18 · AI Mission Lab · 策略层（M1）─────────────────────────────────────
// 复用 StockScore/Decision Engine 只读信号 + Mission 进取参数；风控优先（限持仓/单股/现金/止损）。
// 无未来函数：仅用截至决策日的已知信号；输出为「次一交易日开盘执行」的意图。
import type { MissionAction, MissionConfig } from "./config";
import type { SignalSnapshot } from "./signals";

export const TRADE_UNIT = 100; // 日本股通常 100 股/单位，便于现实跟随

export interface PositionState {
  symbol: string;
  qty: number;
  avgCost: number;
  lastClose: number; // 决策日收盘价（标记价）
}

export interface DecisionIntent {
  symbol: string | null;
  action: MissionAction;
  qty: number | null; // 计划股数
  refPrice: number | null; // 参考价（决策日收盘）
  signal: SignalSnapshot | null;
  position: { qty: number; avgCost: number; returnPct: number } | null;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  rulesTriggered: string[];
}

const roundLot = (shares: number) => Math.floor(shares / TRADE_UNIT) * TRADE_UNIT;
const retPct = (last: number, cost: number) => (cost > 0 ? (last / cost - 1) * 100 : 0);

export interface StrategyContext {
  cashJpy: number;
  equityJpy: number;
  positions: PositionState[];
  signals: Map<string, SignalSnapshot>;
  candidates: SignalSnapshot[];
  cfg: MissionConfig;
}

/** 生成一个 Mission 在决策日的全部动作意图（含无操作则回 NO_ACTION）。 */
export function decide(ctx: StrategyContext): DecisionIntent[] {
  const { cfg } = ctx;
  const intents: DecisionIntent[] = [];
  const held = new Set(ctx.positions.map((p) => p.symbol));
  let remaining = 0; // 未被清仓的持仓数（用于新入场槽位）

  // ── 1) 现有持仓评估：SL → 信号崩塌卖出 → TP → 高风险减仓 → 加仓 → 持有 ──
  for (const pos of ctx.positions) {
    const sig = ctx.signals.get(pos.symbol) ?? null;
    const r = retPct(pos.lastClose, pos.avgCost);
    const posCtx = { qty: pos.qty, avgCost: pos.avgCost, returnPct: +r.toFixed(2) };
    const tpP = Math.round(pos.avgCost * (1 + cfg.takeProfitPct / 100));
    const slP = Math.round(pos.avgCost * (1 + cfg.stopLossPct / 100));
    const base = { symbol: pos.symbol, refPrice: pos.lastClose, signal: sig, position: posCtx, takeProfitPrice: tpP, stopLossPrice: slP };

    if (r <= cfg.stopLossPct) {
      intents.push({ ...base, action: "SL", qty: pos.qty, rulesTriggered: [`浮亏${posCtx.returnPct}%≤止损线${cfg.stopLossPct}%`] });
      continue;
    }
    if (sig && (sig.recommendation === "AVOID" || sig.riskOverride === "HARD_BLOCK" || sig.tradingAction === "SELL")) {
      intents.push({ ...base, action: "SELL", qty: pos.qty, rulesTriggered: [`信号转弱(评级${sig.recommendation}/动作${sig.tradingAction}${sig.riskOverride !== "NONE" ? `/风险${sig.riskOverride}` : ""})`] });
      continue;
    }
    if (r >= cfg.takeProfitPct) {
      intents.push({ ...base, action: "TP", qty: pos.qty, rulesTriggered: [`浮盈${posCtx.returnPct}%≥止盈线${cfg.takeProfitPct}%`] });
      continue;
    }
    remaining++;
    if (sig && (sig.actionRiskLevel === "HIGH" || sig.actionRiskLevel === "EXTREME" || sig.riskOverride === "SOFT_BLOCK")) {
      const reduceQty = roundLot(pos.qty / 2);
      if (reduceQty > 0) { intents.push({ ...base, action: "REDUCE", qty: reduceQty, rulesTriggered: [`风险偏高(${sig.actionRiskLevel ?? sig.riskOverride})减半`] }); continue; }
    }
    const strong = sig && sig.aiScore != null && sig.aiScore >= cfg.minAiScore && cfg.buyRecommendations.includes(sig.recommendation ?? "");
    const posValue = pos.qty * pos.lastClose;
    const capRoom = cfg.maxSinglePct / 100 * ctx.equityJpy - posValue;
    if (strong && r <= 0 && r >= cfg.addOnDrawdownPct && capRoom > pos.lastClose * TRADE_UNIT) {
      const addShares = roundLot(Math.min(capRoom, availableCash(ctx, intents)) / pos.lastClose);
      if (addShares > 0) { intents.push({ ...base, action: "ADD", qty: addShares, rulesTriggered: [`信号仍强+浮亏${posCtx.returnPct}%在加仓区间`] }); continue; }
    }
    intents.push({ ...base, action: "HOLD", qty: null, rulesTriggered: [] });
  }

  // ── 2) 新入场：在槽位/单股/现金约束内买入候选 ──
  let slots = cfg.maxPositions - remaining;
  const reserve = cfg.minCashPct / 100 * ctx.equityJpy;
  for (const c of ctx.candidates) {
    if (slots <= 0) break;
    if (held.has(c.symbol)) continue;
    if (intents.some((i) => i.symbol === c.symbol && (i.action === "BUY"))) continue;
    const ref = c.latestClose;
    if (ref == null || ref <= 0) continue;
    const cashLeft = availableCash(ctx, intents) - reserve;
    const alloc = Math.min(cfg.maxSinglePct / 100 * ctx.equityJpy, cashLeft);
    const qty = roundLot(alloc / ref);
    if (qty <= 0 || qty * ref > cashLeft) continue;
    const tpP = Math.round(ref * (1 + cfg.takeProfitPct / 100));
    const slP = c.stopLoss && c.stopLoss > 0 && c.stopLoss < ref ? Math.round(c.stopLoss) : Math.round(ref * (1 + cfg.stopLossPct / 100));
    intents.push({
      symbol: c.symbol, action: "BUY", qty, refPrice: ref, signal: c, position: null,
      takeProfitPrice: tpP, stopLossPrice: slP,
      rulesTriggered: [`评级${c.recommendation}∈白名单`, `adaptiveScore ${fmt(c.aiScore)}≥${cfg.minAiScore}`, "非硬阻断", "仓位/现金约束内"],
    });
    slots--;
  }

  if (!intents.length) intents.push({ symbol: null, action: "NO_ACTION", qty: null, refPrice: null, signal: null, position: null, takeProfitPrice: null, stopLossPrice: null, rulesTriggered: ["无满足入场条件的标的且持仓均未触发调整"] });
  return intents;
}

// 剩余可用现金（扣除本轮已计划的买入/加仓；卖出所得次日才到账，保守不计入）。
function availableCash(ctx: StrategyContext, intents: DecisionIntent[]): number {
  let used = 0;
  for (const i of intents) if ((i.action === "BUY" || i.action === "ADD") && i.qty && i.refPrice) used += i.qty * i.refPrice;
  return ctx.cashJpy - used;
}

function fmt(v: number | null | undefined): string { return v == null ? "—" : (Math.round((v as number) * 100) / 100).toString(); }
