// ── Explain AI Engine · 优势/机会推导（P5-T1）───────────────────────────────
// 从已有评分维度派生「为什么推荐」与「机会」。只读，不重算。

import type { ExplainInput, ExplainPoint } from "./types";
import { dimLabel, styleLabel, type DimKey } from "./templates";
import { dimRatio, dimTier, fx, pct } from "./utils";

const DIMS: DimKey[] = ["technical", "fundamental", "moneyFlow", "news", "global"];
const DIM_FIELD: Record<DimKey, keyof NonNullable<ExplainInput["score"]>> = {
  technical: "technicalScore", fundamental: "fundamentalScore", moneyFlow: "moneyFlowScore", news: "newsSentimentScore", global: "globalTrendScore",
};

export function deriveStrengths(input: ExplainInput): ExplainPoint[] {
  const s = input.score;
  if (!s) return [];
  const out: ExplainPoint[] = [];

  // 高分维度 → 优势
  for (const d of DIMS) {
    const ratio = dimRatio(s[DIM_FIELD[d]] as number | null, d);
    if (dimTier(ratio) === "strong") {
      out.push({ code: `dim_strong_${d}`, tone: "strength", weight: Math.round(ratio ?? 0), title: `${dimLabel(d)}强`, detail: `${dimLabel(d)}得分处于较高水平（完成度 ${fx(ratio, 0)}%）。` });
    }
  }

  // 综合评分 / 分位
  if (s.adaptiveScore != null && s.adaptiveScore >= 70) {
    out.push({ code: "adaptive_high", tone: "strength", weight: Math.round(s.adaptiveScore), title: "AI 综合评分领先", detail: `Adaptive 综合评分 ${fx(s.adaptiveScore, 0)}，处于市场较高区间。` });
  }
  if (s.percentileRank != null && s.percentileRank <= 15) {
    out.push({ code: "percentile_top", tone: "strength", weight: 100 - s.percentileRank, title: `全市场前 ${fx(s.percentileRank, 0)}%`, detail: "综合排名进入市场头部。" });
  }

  // 动量
  if (s.return20d != null && s.return20d > 0 && s.maTrend && /UP|多头|上/.test(s.maTrend)) {
    out.push({ code: "momentum_up", tone: "strength", weight: 60, title: "趋势向上", detail: `20 日收益 ${pct(s.return20d)}，均线多头排列。` });
  }

  // 风格
  if (s.stockStyle) {
    out.push({ code: "style", tone: "neutral", weight: 20, title: `风格：${styleLabel(s.stockStyle)}`, detail: "AI 已按该风格自适应加权。" });
  }

  return out.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 6);
}

export function deriveOpportunities(input: ExplainInput): ExplainPoint[] {
  const s = input.score;
  if (!s) return [];
  const out: ExplainPoint[] = [];

  if (s.opportunityScore != null && s.opportunityScore >= 60) {
    out.push({ code: "opportunity_score", tone: "opportunity", weight: Math.round(s.opportunityScore), title: `机会分 ${fx(s.opportunityScore, 0)}${s.opportunityLabel ? " · " + s.opportunityLabel : ""}`, detail: "AI 机会评分较高，具备潜在上行空间。" });
  }
  if (s.catalystScore != null && s.catalystScore >= 50) {
    out.push({ code: "catalyst", tone: "opportunity", weight: Math.round(s.catalystScore), title: "存在催化事件", detail: `催化评分 ${fx(s.catalystScore, 0)}（来自 TDnet / 新闻事件）。` });
  }
  if (s.return60d != null && s.return60d > 15) {
    out.push({ code: "mid_momentum", tone: "opportunity", weight: 45, title: "中期动量强", detail: `60 日收益 ${pct(s.return60d)}。` });
  }
  return out.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 4);
}
