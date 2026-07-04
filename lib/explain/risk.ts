// ── Explain AI Engine · 弱点/风险推导（P5-T1）───────────────────────────────
// 从已有评分维度派生「为什么不推荐」与「主要风险」。只读，不重算。

import type { ExplainInput, ExplainPoint } from "./types";
import { dimLabel, type DimKey } from "./templates";
import { dimRatio, dimTier, volRisk, fx, pct, toStringList } from "./utils";

const DIMS: DimKey[] = ["technical", "fundamental", "moneyFlow", "news", "global"];
const DIM_FIELD: Record<DimKey, keyof NonNullable<ExplainInput["score"]>> = {
  technical: "technicalScore", fundamental: "fundamentalScore", moneyFlow: "moneyFlowScore", news: "newsSentimentScore", global: "globalTrendScore",
};

// 弱点 = 明显偏低的维度（为什么不推荐）
export function deriveWeaknesses(input: ExplainInput): ExplainPoint[] {
  const s = input.score;
  if (!s) return [];
  const out: ExplainPoint[] = [];
  for (const d of DIMS) {
    const ratio = dimRatio(s[DIM_FIELD[d]] as number | null, d);
    if (dimTier(ratio) === "weak") {
      out.push({ code: `dim_weak_${d}`, tone: "weakness", weight: Math.round(100 - (ratio ?? 0)), title: `${dimLabel(d)}偏弱`, detail: `${dimLabel(d)}得分偏低（完成度 ${fx(ratio, 0)}%），拖累综合评分。` });
    }
  }
  if (s.adaptiveScore != null && s.adaptiveScore < 45) {
    out.push({ code: "adaptive_low", tone: "weakness", weight: 80, title: "综合评分偏低", detail: `Adaptive 综合评分 ${fx(s.adaptiveScore, 0)}，低于关注门槛。` });
  }
  if (s.percentileRank != null && s.percentileRank > 60) {
    out.push({ code: "percentile_low", tone: "weakness", weight: 50, title: "排名靠后", detail: `全市场分位 ${fx(s.percentileRank, 0)}%（越小越好）。` });
  }
  return out.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 5);
}

// 风险 = 波动/流动性/事件/数据风险（主要风险）
export function deriveRisks(input: ExplainInput): ExplainPoint[] {
  const s = input.score;
  const out: ExplainPoint[] = [];

  // 市场波动率风险（读市场状态）
  const vr = volRisk(input.regime?.volatility ?? null);
  if (vr.level === "高") {
    out.push({ code: "market_volatility", tone: "risk", weight: 70, title: "市场波动偏高", detail: `当前市场波动率 ${fx(input.regime?.volatility, 1)}%，回撤风险上升。` });
  }
  if (input.regime?.regime === "BEAR") {
    out.push({ code: "bear_regime", tone: "risk", weight: 75, title: "处于熊市环境", detail: "整体市场偏空，逆势持仓需谨慎。" });
  }

  if (!s) return out;

  if (s.highRiskFlag) {
    out.push({ code: "high_risk_flag", tone: "risk", weight: 90, title: "高风险标记", detail: "该股票被标记为高风险（流动性/波动/数据质量）。" });
  }
  if (s.riskScore != null && s.riskScore < 0) {
    out.push({ code: "risk_deduction", tone: "risk", weight: 60, title: "风险扣分", detail: `风险层扣分 ${fx(s.riskScore, 0)}。` });
  }
  if (s.rsi14 != null && s.rsi14 >= 75) {
    out.push({ code: "overbought", tone: "risk", weight: 45, title: "技术超买", detail: `RSI ${fx(s.rsi14, 0)}，短期回调概率上升。` });
  }
  if (s.moneyFlowScore != null && dimTier(dimRatio(s.moneyFlowScore, "moneyFlow")) === "weak") {
    out.push({ code: "low_liquidity", tone: "risk", weight: 50, title: "资金/流动性偏弱", detail: "成交与资金流入不足，进出成本较高。" });
  }
  if (s.fxSensitivity && /HIGH|高/.test(s.fxSensitivity)) {
    out.push({ code: "fx_sensitive", tone: "risk", weight: 40, title: "汇率敏感", detail: "业绩对日元汇率较敏感，注意汇率波动。" });
  }
  // 已有 actionWarnings（Json）直接透传（不重算）
  for (const w of toStringList(s.actionWarnings).slice(0, 3)) {
    out.push({ code: "action_warning", tone: "risk", weight: 55, title: w });
  }

  return out.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 6);
}
