// ── Explain 2.0 · AI 投资报告（P8-1）─────────────────────────────────────────
// 复用现有 Explain 引擎(buildExplain 的 strengths/risks/summary/marketContext) +
// 新增 买入理由 / 复合信心指数 / 建议仓位 / 止盈止损 / 失效条件。
// 纯派生只读函数：禁止重算评分，禁止改 Portfolio Builder；建议仓位/止盈止损为"建议"性质。
// 止盈止损优先复用 Closing Decision 已算值(closing)，否则按 latestClose + 风险档位派生（建议）。

import type { ExplainResult, ScoreSnapshot, RegimeSnapshot } from "./types";

export interface GptSnapshot { gptScore: number | null; gptRating: string | null; gptRank: number | null; confidence: string | null }
export interface ClosingLevels {
  entryLow: number | null; entryHigh: number | null;
  target1: number | null; target2: number | null; stopLoss: number | null;
  weight: number | null; holdPeriod: string | null; confidence: string | null;
}

export interface AiInvestmentReport {
  symbol: string; name: string | null;
  verdict: { code: string; label: string; icon: string };  // AI 最终结论
  confidence: number; stars: number; confidenceLabel: string; // ④ 信心指数
  recommendReasons: string[];                                 // ① 推荐理由（恰 3 条）
  buyReasons: { today: string; notYesterday: string; notOthers: string }; // ② 买入理由（细分）
  buyReasonsList: string[];                                   // ② 为什么今天买（3 条列表）
  risks: string[];                                            // ③ 风险（恰 3 条）
  suggestedPositionPct: number; suggestedPositionNote: string; // ⑤ 建议仓位（建议性）
  takeProfit: { t1: number | null; t2: number | null; t3: number | null; note: string }; // ⑥ 止盈
  stopLoss: { price: number | null; note: string };           // ⑦ 止损
  invalidation: string[];                                     // ⑧ 失效条件
  holdingPeriod: string;
  oneLiner: string;                                           // ⑨ 一句话总结
  marketContext: string;
  levelSource: "closing" | "derived";
  dataAsOf: string | null; generatedAt: string;
  meta: {                                                     // 底部统计条 + 头部徽标
    aiScore: number | null; gptScore: number | null; gptRank: number | null;
    board: string | null; regime: string | null; regimeLabel: string;
    volatility: number | null; volatilityLabel: string; liquidityLabel: string;
  };
}

function boardLabel(m: string | null | undefined): string | null {
  if (!m) return null;
  const map: Record<string, string> = {
    PRIME: "东京主板", STANDARD: "东证标准", GROWTH: "东证成长", TSE: "东京证券", ALL: "东京证券",
    "プライム": "东京主板", "スタンダード": "东证标准", "グロース": "东证成长",
  };
  return map[m] ?? m;
}
function regimeLabelOf(r: string | null | undefined): string {
  return r === "BULL" ? "牛市 (Bull)" : r === "BEAR" ? "熊市 (Bear)" : r === "SIDEWAYS" ? "震荡 (Sideways)" : "—";
}
function volLabelOf(v: number | null | undefined): string {
  if (v == null) return "—"; return v < 20 ? "低" : v <= 25 ? "中等" : "高";
}
function liqLabelOf(turnover: number | null | undefined): string {
  if (turnover == null) return "—"; return turnover >= 5e8 ? "高" : turnover >= 1e8 ? "中等" : "低";
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

const VERDICT: Record<string, { label: string; icon: string }> = {
  STRONG_BUY: { label: "强烈买入", icon: "✅" },
  BUY: { label: "买入", icon: "🟢" },
  HOLD: { label: "观察", icon: "🟡" },
  WATCH: { label: "谨慎", icon: "🟠" },
  AVOID: { label: "回避", icon: "🔴" },
};
function starsOf(c: number): number { return c >= 90 ? 5 : c >= 80 ? 4 : c >= 70 ? 3 : c >= 60 ? 2 : 1; }
function confLabel(c: number): string { return c >= 90 ? "极高" : c >= 80 ? "高" : c >= 70 ? "中高" : c >= 60 ? "中" : "偏低"; }

// ④ 复合信心指数（绝不等于 AI Score）：AI + GPT + Regime + Risk + News + 一致性
function computeConfidence(s: ScoreSnapshot, regime: RegimeSnapshot, gpt: GptSnapshot | null): number {
  const ai = s.adaptiveScore ?? 50;
  const g = gpt?.gptScore ?? ai;
  let c = 0.4 * ai + 0.3 * g; // 基座：AI 40% + GPT 30%
  // Regime 对齐
  const bullish = (s.maTrend ?? "").toUpperCase().includes("UP") || (s.return20d ?? 0) > 0;
  if (regime.regime === "BULL") c += bullish ? 6 : 2;
  else if (regime.regime === "BEAR") c -= bullish ? 6 : 10;
  // Risk
  if (s.highRiskFlag) c -= 10;
  // News（情绪偏离中性 8 → ±5）
  if (s.newsSentimentScore != null) c += clamp(((s.newsSentimentScore - 8) / 7) * 5, -5, 5);
  // 一致性：规则评级 vs GPT 评级
  const rv = s.recommendationV2, gr = gpt?.gptRating;
  const bull = (x: string | null) => x === "STRONG_BUY" || x === "BUY";
  if (rv && gr) c += bull(rv) === bull(gr) ? 5 : -8;
  // GPT 自身 confidence
  if (gpt?.confidence === "HIGH") c += 3; else if (gpt?.confidence === "LOW") c -= 3;
  return round(clamp(c));
}

// ⑤ 建议仓位（建议性；不改 Portfolio Builder）
function suggestPosition(conf: number, highRisk: boolean): { pct: number; note: string } {
  let pct = conf >= 90 ? 25 : conf >= 80 ? 20 : conf >= 70 ? 15 : conf >= 60 ? 10 : 5;
  let note = `按信心 ${conf} 档位建议`;
  if (highRisk) { pct = Math.min(pct, 10); note = "高风险标的，仓位上限 10%（建议）"; }
  return { pct, note };
}

// ⑥⑦ 止盈止损：优先 Closing Decision 已算值，否则按 latestClose + 风险档位派生（建议）
function levels(s: ScoreSnapshot, closing: ClosingLevels | null): {
  tp: AiInvestmentReport["takeProfit"]; sl: AiInvestmentReport["stopLoss"]; src: "closing" | "derived";
} {
  if (closing && (closing.target1 != null || closing.stopLoss != null)) {
    return {
      tp: { t1: closing.target1, t2: closing.target2, t3: null, note: "来自收盘决策（Portfolio Builder 已算）" },
      sl: { price: closing.stopLoss, note: "来自收盘决策止损位" },
      src: "closing",
    };
  }
  const px = s.latestClose;
  if (px == null) return { tp: { t1: null, t2: null, t3: null, note: "缺现价，无法派生" }, sl: { price: null, note: "缺现价" }, src: "derived" };
  const k = s.highRiskFlag ? 1.5 : 1; // 高波动放宽
  return {
    tp: {
      t1: round(px * (1 + 0.07 * k), 1), t2: round(px * (1 + 0.14 * k), 1), t3: round(px * (1 + 0.22 * k), 1),
      note: `按现价 + ${s.highRiskFlag ? "高波动" : "常规"}档位派生（建议，非收盘决策口径）`,
    },
    sl: { price: round(px * (1 - 0.06 * k), 1), note: `约 -${round(6 * k)}%（风控建议；跌破 20 日均线可提前离场）` },
    src: "derived",
  };
}

// ② 买入理由
function buyReasons(s: ScoreSnapshot, regime: RegimeSnapshot, gpt: GptSnapshot | null): AiInvestmentReport["buyReasons"] {
  const up = (s.maTrend ?? "").toUpperCase().includes("UP");
  const today = [
    s.recommendationV2 === "STRONG_BUY" ? "评级达强烈买入" : s.recommendationV2 === "BUY" ? "评级达买入" : "评级为观察级",
    s.tradingAction === "BUY_NOW" ? "交易信号=现价可买" : s.tradingAction === "WAIT_PULLBACK" ? "交易信号=回调再买" : null,
    regime.regime === "BULL" ? "大盘牛市环境支持进攻" : regime.regime === "BEAR" ? "但大盘偏弱需谨慎" : "大盘震荡宜精选",
  ].filter(Boolean).join("；");
  const notYesterday = [
    up ? "近期均线转多/趋势确认" : "趋势尚未走坏",
    (s.return5d ?? 0) > 0 ? `近 5 日 +${round(s.return5d ?? 0, 1)}% 动能显现` : "等待动能启动",
    (s.catalystScore ?? 0) >= 3 ? "近期有催化事件（TDnet）" : null,
  ].filter(Boolean).join("；");
  const rankTxt = s.percentileRank != null ? `全市场前 ${round(s.percentileRank, 0)}%` : "排名靠前";
  const notOthers = [
    rankTxt,
    gpt?.gptRank != null ? `GPT 复核排名第 ${gpt.gptRank}` : null,
    s.opportunityScore != null ? `机会分 ${round(s.opportunityScore, 0)}` : null,
  ].filter(Boolean).join("；");
  return { today: today || "综合评级达标", notYesterday: notYesterday || "趋势与动能配合", notOthers: notOthers || "综合排名领先" };
}

// ③ 风险补充（真实字段派生，非模板；与 base.risks 合并去重后取 3 条）
function deriveRisks(s: ScoreSnapshot, regime: RegimeSnapshot): string[] {
  const out: string[] = [];
  if (s.highRiskFlag) out.push("标的波动率偏高（高风险标记）");
  if (regime.regime === "BEAR") out.push("大盘处于熊市，系统性下行风险");
  else if (regime.regime === "SIDEWAYS") out.push("大盘震荡，方向不明");
  if ((s.return20d ?? 0) > 25) out.push(`近 20 日已涨 +${round(s.return20d ?? 0)}%，追高风险`);
  if ((s.fundamentalScore ?? 25) < 12) out.push("基本面评分偏弱");
  if ((s.newsSentimentScore ?? 8) < 6) out.push("近期新闻情绪偏负面");
  if ((s.catalystScore ?? 0) >= 3) out.push("财报/重大事件临近，波动加大");
  if ((s.rsi14 ?? 50) > 75) out.push("RSI 超买，短期回调压力");
  return out;
}

// ⑧ 失效条件
function invalidation(s: ScoreSnapshot, regime: RegimeSnapshot): string[] {
  const out = ["跌破 20 日均线（均线走坏）"];
  if (s.rsi14 != null) out.push("RSI 跌破 50（动能转弱）");
  out.push("成交量持续萎缩（资金撤离）");
  if (regime.regime !== "BEAR") out.push("大盘转为 BEAR（市场环境恶化）");
  if ((s.catalystScore ?? 0) >= 3) out.push("财报/重大公告不及预期");
  return out;
}

export function buildInvestmentReport(
  base: ExplainResult,
  s: ScoreSnapshot,
  regime: RegimeSnapshot,
  gpt: GptSnapshot | null,
  closing: ClosingLevels | null,
  nowIso: string,
  extra?: { board?: string | null; turnover?: number | null; gptRank?: number | null },
): AiInvestmentReport {
  const confidence = computeConfidence(s, regime, gpt);
  const stars = starsOf(confidence);
  const pos = suggestPosition(confidence, s.highRiskFlag);
  const lv = levels(s, closing);
  const br = buyReasons(s, regime, gpt);
  const rec = s.recommendationV2 ?? "HOLD";
  const v = VERDICT[rec] ?? VERDICT.HOLD;

  return {
    symbol: s.symbol, name: s.name,
    verdict: { code: rec, label: v.label, icon: v.icon },
    confidence, stars, confidenceLabel: confLabel(confidence),
    // 固定 3 条：strengths 不足时从 Explain 引擎已有 opportunities 补充（不编造新逻辑）
    recommendReasons: [...new Set([
      ...base.strengths.map((p) => p.detail ? `${p.title}（${p.detail}）` : p.title),
      ...base.opportunities.map((p) => p.detail ? `${p.title}（${p.detail}）` : p.title),
    ])].slice(0, 3),
    buyReasons: br,
    buyReasonsList: [br.today, br.notYesterday, br.notOthers],
    risks: [...new Set([
      ...base.risks.map((p) => p.detail ? `${p.title}（${p.detail}）` : p.title),
      ...deriveRisks(s, regime),
    ])].slice(0, 3),
    suggestedPositionPct: closing?.weight != null ? round(closing.weight) : pos.pct,
    suggestedPositionNote: closing?.weight != null ? "参考收盘决策组合权重（建议）" : pos.note,
    takeProfit: lv.tp, stopLoss: lv.sl,
    invalidation: invalidation(s, regime),
    holdingPeriod: closing?.holdPeriod ?? base.holdingPeriod,
    oneLiner: `${"★".repeat(stars)}${"☆".repeat(5 - stars)}  ${base.overallSummary}`,
    marketContext: base.marketContext,
    levelSource: lv.src,
    dataAsOf: base.dataAsOf, generatedAt: nowIso,
    meta: {
      aiScore: s.adaptiveScore, gptScore: gpt?.gptScore ?? null, gptRank: gpt?.gptRank ?? extra?.gptRank ?? null,
      board: boardLabel(extra?.board), regime: regime.regime, regimeLabel: regimeLabelOf(regime.regime),
      volatility: regime.volatility, volatilityLabel: volLabelOf(regime.volatility), liquidityLabel: liqLabelOf(extra?.turnover),
    },
  };
}
