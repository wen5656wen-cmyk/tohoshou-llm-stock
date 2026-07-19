// ── P18 · AI Mission Lab · Explain 层（M1 · 规则派生，GPT 不参与，可回放）────
// 每个决策的「为什么」全部由规则+当时数据派生，确定性、可回放。禁止编造数字。
import type { MissionAction } from "./config";
import { STRATEGY_VERSION } from "./config";
import type { SignalSnapshot } from "./signals";

export interface ExplainInput {
  action: MissionAction;
  missionType: string;
  signal: SignalSnapshot | null;
  position: { qty: number; avgCost: number; returnPct: number } | null;
  cashJpy: number;
  equityJpy: number;
  qty: number | null;
  refPrice: number | null;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  rulesTriggered: string[];
  industryHeat: number | null;
}

export interface ExplainStructured {
  aiScore: number | null;
  recommendation: string | null;
  industryHeat: number | null;
  newsScore: number | null;
  riskLevel: string | null;
  riskOverride: string | null;
  position: { qty: number; avgCost: number; returnPct: number } | null;
  cashJpy: number;
  equityJpy: number;
  qty: number | null;
  refPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  rulesTriggered: string[];
  strategyVersion: string;
}

const ACTION_ZH: Record<MissionAction, string> = {
  BUY: "买入", SELL: "卖出", ADD: "加仓", REDUCE: "减仓", TP: "止盈", SL: "止损", HOLD: "持有", NO_ACTION: "今日不操作",
};

export function buildExplain(input: ExplainInput): { explainWhy: string; explainStructured: ExplainStructured; rulesTriggered: string[] } {
  const s = input.signal;
  const parts: string[] = [];
  const head = s?.name ? `${s.name}(${s.symbol})` : (s?.symbol ?? "组合");

  switch (input.action) {
    case "BUY":
      parts.push(`【买入 ${head}】AI 评分 ${fmt(s?.aiScore)}、评级 ${s?.recommendation ?? "—"}`);
      parts.push(`交易动作=${s?.tradingAction ?? "—"}，风险=${s?.actionRiskLevel ?? "—"}；在最大持仓/单股仓位/现金比例约束内建仓。`);
      break;
    case "ADD":
      parts.push(`【加仓 ${head}】信号仍强（评分 ${fmt(s?.aiScore)}/评级 ${s?.recommendation ?? "—"}），当前浮亏 ${fmt(input.position?.returnPct)}% 在允许加仓区间内，风险可控下加仓。`);
      break;
    case "REDUCE":
      parts.push(`【减仓 ${head}】风险等级偏高（${s?.actionRiskLevel ?? s?.riskOverride ?? "—"}），按风控降低敞口，非清仓。`);
      break;
    case "SELL":
      parts.push(`【卖出 ${head}】信号转弱（评级 ${s?.recommendation ?? "—"}/动作 ${s?.tradingAction ?? "—"}${s?.riskOverride && s.riskOverride !== "NONE" ? `/风险覆盖 ${s.riskOverride}` : ""}），清仓退出。`);
      break;
    case "TP":
      parts.push(`【止盈 ${head}】浮盈 ${fmt(input.position?.returnPct)}% 达到止盈阈值，锁定收益。`);
      break;
    case "SL":
      parts.push(`【止损 ${head}】浮亏 ${fmt(input.position?.returnPct)}% 触及止损线，严格执行止损、控制回撤。`);
      break;
    case "HOLD":
      parts.push(`【持有 ${head}】信号未变差、未触及止盈/止损（当前 ${fmt(input.position?.returnPct)}%），继续持有等待。`);
      break;
    case "NO_ACTION":
      parts.push(`【今日不操作】无满足入场条件的新标的，且现有持仓均未触发调整规则；保持组合不动。`);
      break;
  }
  if (input.rulesTriggered.length) parts.push(`触发规则：${input.rulesTriggered.join("、")}。`);
  if (input.takeProfitPrice || input.stopLossPrice) parts.push(`止盈价 ${fmt(input.takeProfitPrice)} / 止损价 ${fmt(input.stopLossPrice)}。`);
  parts.push(`（现金 ${yen(input.cashJpy)}，总资产 ${yen(input.equityJpy)}，策略 ${STRATEGY_VERSION}）`);

  const explainStructured: ExplainStructured = {
    aiScore: s?.aiScore ?? null,
    recommendation: s?.recommendation ?? null,
    industryHeat: input.industryHeat,
    newsScore: s?.newsScore ?? null,
    riskLevel: s?.actionRiskLevel ?? null,
    riskOverride: s?.riskOverride ?? null,
    position: input.position,
    cashJpy: input.cashJpy,
    equityJpy: input.equityJpy,
    qty: input.qty,
    refPrice: input.refPrice,
    takeProfit: input.takeProfitPrice,
    stopLoss: input.stopLossPrice,
    rulesTriggered: input.rulesTriggered,
    strategyVersion: STRATEGY_VERSION,
  };
  return { explainWhy: parts.join(" "), explainStructured, rulesTriggered: input.rulesTriggered };
}

function fmt(v: number | null | undefined): string { return v == null ? "—" : (Math.round(v * 100) / 100).toString(); }
function yen(v: number): string { return `¥${Math.round(v).toLocaleString("en-US")}`; }
