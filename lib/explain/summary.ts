// ── Explain AI Engine · 总结/策略/置信/关注（P5-T1）─────────────────────────
// 从已有字段派生总体结论、市场环境、建议策略、持有周期、置信度、未来关注。只读。

import type { ExplainInput, ExplainPoint, ExplainConfidence } from "./types";
import { recLabel, regimeLabel } from "./templates";
import { volRisk, fx } from "./utils";

export function buildOverallSummary(input: ExplainInput, strengths: ExplainPoint[], weaknesses: ExplainPoint[]): string {
  const s = input.score;
  if (!s) return "暂无该股票的 AI 评分数据，无法生成解释。";
  const rec = recLabel(s.recommendationV2);
  const sc = s.adaptiveScore != null ? `综合评分 ${fx(s.adaptiveScore, 0)}` : "";
  const rk = s.percentileRank != null ? `全市场前 ${fx(s.percentileRank, 0)}%` : "";
  const lead = strengths[0]?.title;
  const drag = weaknesses[0]?.title;
  const parts = [`AI 当前评级为「${rec}」`];
  if (sc || rk) parts.push([sc, rk].filter(Boolean).join(" · "));
  if (lead) parts.push(`主要支撑：${lead}`);
  if (drag) parts.push(`主要顾虑：${drag}`);
  if (s.recommendationReason) parts.push(s.recommendationReason);
  return parts.join("。") + "。";
}

export function buildMarketContext(input: ExplainInput): string {
  const r = input.regime;
  if (!r || !r.regime) return "暂无市场状态数据。";
  const vr = volRisk(r.volatility);
  return `当前市场处于${regimeLabel(r.regime)}，市场宽度 ${fx(r.breadth, 0)}%、波动率 ${fx(r.volatility, 1)}%（${vr.level}风险）。`;
}

// 建议策略 / 持有周期（读 recommendationV2 + adaptiveScore，对齐三策略门槛口径，非新逻辑）
export function buildStrategy(input: ExplainInput): { recommendedStrategy: string; holdingPeriod: string } {
  const s = input.score;
  const a = s?.adaptiveScore ?? null;
  const rec = s?.recommendationV2 ?? null;
  if (rec === "STRONG_BUY" && a != null && a >= 80) return { recommendedStrategy: "长线（趋势持仓）", holdingPeriod: "20–90 个交易日" };
  if ((rec === "STRONG_BUY" || rec === "BUY") && a != null && a >= 75) return { recommendedStrategy: "日内 / 波段", holdingPeriod: "1–10 个交易日" };
  if ((rec === "STRONG_BUY" || rec === "BUY") && a != null && a >= 70) return { recommendedStrategy: "波段", holdingPeriod: "3–10 个交易日" };
  if (rec === "HOLD") return { recommendedStrategy: "持有观察", holdingPeriod: "维持现有仓位" };
  return { recommendedStrategy: "暂不建议建仓", holdingPeriod: "—" };
}

export function buildConfidence(input: ExplainInput): ExplainConfidence {
  const s = input.score;
  // 优先读已有 ruleConfidence（不重算）；否则由数据完整度 + 分位派生
  let score = s?.ruleConfidence ?? null;
  if (score == null && s) {
    const dims = [s.technicalScore, s.fundamentalScore, s.moneyFlowScore, s.newsSentimentScore, s.globalTrendScore];
    const filled = dims.filter((x) => x != null).length;
    const cov = (filled / dims.length) * 100;
    const rankBoost = s.percentileRank != null ? Math.max(0, 100 - s.percentileRank) : 50;
    score = Math.round(cov * 0.5 + rankBoost * 0.5);
  }
  const v = score ?? 0;
  const level = v >= 75 ? "HIGH" : v >= 50 ? "MEDIUM" : "LOW";
  const label = level === "HIGH" ? "高置信" : level === "MEDIUM" ? "中置信" : "低置信";
  return { level, score: score != null ? Math.round(v) : null, label };
}

export function buildNextObservation(input: ExplainInput, weaknesses: ExplainPoint[], risks: ExplainPoint[]): string[] {
  const s = input.score;
  const out: string[] = [];
  if (!s) return ["等待 AI 评分数据生成。"];
  if (s.newsSentimentScore != null && s.newsSentimentScore <= 3) out.push("关注是否有新的催化新闻 / 财报披露。");
  if (weaknesses.some((w) => w.code === "dim_weak_fundamental")) out.push("关注下一期财报能否改善基本面。");
  if (weaknesses.some((w) => w.code === "dim_weak_moneyFlow") || risks.some((r) => r.code === "low_liquidity")) out.push("关注量能是否放大、资金是否回流。");
  if (risks.some((r) => r.code === "market_volatility" || r.code === "bear_regime")) out.push("关注市场整体波动率与趋势是否企稳。");
  if (s.rsi14 != null && s.rsi14 >= 75) out.push("关注短期是否出现技术回调后的再入场机会。");
  if (out.length === 0) out.push("维持跟踪：评分、量能、市场状态无明显异常。");
  return out.slice(0, 4);
}
