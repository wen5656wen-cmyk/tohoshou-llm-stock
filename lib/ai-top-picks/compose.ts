// ── TOHOSHOU AI · AI Top Picks 综合重排（P7 Preview · Experimental V1）───────
// 从 STRONG_BUY（不足 5 补 top BUY）候选，综合 AI评分 / 因子Alpha / Contribution /
// Confidence / Risk 计算 compositeScore 并重排 Top5。**纯函数 · 只读 · 不改任何评分/推荐。**
// 输入为已从 StockScore + AlphaScore 读出的每股信号（依赖注入），本层不接 DB。

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** 单只候选股票的每股信号（来自 StockScore + AlphaScore，只读）。 */
export interface PickInput {
  symbol: string;
  name: string | null;
  sourceRating: "STRONG_BUY" | "BUY";
  latestClose: number | null;
  aiScore: number | null;        // StockScore.adaptiveScore
  alphaScore: number | null;     // AlphaScore.alphaScore（50=宇宙均值）
  contribution: number | null;   // AlphaScore.percentile（0-100，越高因子越强）
  confidence: number | null;     // StockScore.ruleConfidence（0-100）
  highRiskFlag: boolean;
}

export interface RankedPick extends PickInput {
  rank: number;
  aiScoreN: number;
  alphaScoreN: number;
  contributionN: number;
  confidenceN: number;
  riskScore: number;
  compositeScore: number;
  reason: string;
}

/** 综合权重：AI 0.35 + 因子Alpha 0.25 + Contribution 0.10 + Confidence 0.10 + Risk 0.20。 */
export const TOP_PICK_WEIGHTS = { ai: 0.35, alpha: 0.25, contribution: 0.10, confidence: 0.10, risk: 0.20 } as const;

/** 风险调整分：高风险标记显著扣分（越高越安全）。 */
function riskScoreOf(highRisk: boolean): number {
  return highRisk ? 40 : 85;
}

function composeOne(p: PickInput): RankedPick {
  const aiScoreN = clamp(p.aiScore ?? 0);
  const alphaScoreN = clamp(p.alphaScore ?? 50);
  const contributionN = clamp(p.contribution ?? 0);
  const confidenceN = clamp(p.confidence ?? 50);
  const riskScore = riskScoreOf(p.highRiskFlag);
  const w = TOP_PICK_WEIGHTS;
  const compositeScore = r1(clamp(
    aiScoreN * w.ai + alphaScoreN * w.alpha + contributionN * w.contribution + confidenceN * w.confidence + riskScore * w.risk,
  ));
  const reason = [
    `${p.sourceRating === "STRONG_BUY" ? "强烈买入" : "买入"}`,
    `AI评分 ${r1(aiScoreN)}`,
    `因子Alpha分 ${r1(alphaScoreN)}`,
    `因子排名 前${r1(100 - contributionN)}%`,
    `置信 ${r1(confidenceN)}%`,
    p.highRiskFlag ? "⚠高风险" : "低风险",
  ].join(" · ");
  return { ...p, rank: 0, aiScoreN, alphaScoreN, contributionN, confidenceN, riskScore, compositeScore, reason };
}

/**
 * 综合重排选 TopN。
 * - STRONG_BUY ≥ N：仅在 STRONG_BUY 内按 compositeScore 取 TopN。
 * - STRONG_BUY < N：全部 STRONG_BUY 保证入选（pin），其余槽位从 BUY 按 **compositeScore**
 *   补足，最后整体按 compositeScore 定 rank。
 * @param topN 默认 5
 */
export function composeTopPicks(strongBuys: PickInput[], buys: PickInput[], topN = 5): RankedPick[] {
  const byComposite = (a: RankedPick, b: RankedPick) => b.compositeScore - a.compositeScore;
  const sb = strongBuys.map(composeOne).sort(byComposite);
  const bu = buys.map(composeOne).sort(byComposite);

  let selected: RankedPick[];
  if (sb.length >= topN) {
    selected = sb.slice(0, topN);
  } else {
    const have = new Set(sb.map((p) => p.symbol));
    const fill = bu.filter((b) => !have.has(b.symbol)).slice(0, topN - sb.length);
    selected = [...sb, ...fill];
  }
  selected.sort(byComposite);
  selected.forEach((p, i) => { p.rank = i + 1; });
  return selected;
}
