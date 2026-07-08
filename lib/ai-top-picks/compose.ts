// ── TOHOSHOU AI · AI Top Picks 综合重排 + Quality Gates（P7 Preview · V1.1）──
// 从 STRONG_BUY（不足 5 补 top BUY）候选，先过 Quality Gates（News/Liquidity Reject +
// Momentum Penalty），再综合 AI评分 / 因子Alpha / Contribution / Confidence / Risk 计算
// compositeScore（扣动量惩罚）并重排 Top5。**纯函数 · 只读 · 不改任何评分/推荐。**

import {
  evaluateGates, TOP_PICK_GATES, type GateSignals, type GateOutcome, type RejectReason,
} from "./gates";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** 单只候选的每股信号（StockScore + AlphaScore + 门控信号）。 */
export interface PickInput {
  symbol: string;
  name: string | null;
  sourceRating: "STRONG_BUY" | "BUY";
  latestClose: number | null;
  aiScore: number | null;
  alphaScore: number | null;
  contribution: number | null;
  confidence: number | null;
  highRiskFlag: boolean;
  gate: GateSignals;   // V1.1：门控输入
}

export interface RankedPick extends PickInput {
  rank: number;
  aiScoreN: number; alphaScoreN: number; contributionN: number; confidenceN: number; riskScore: number;
  rawComposite: number;      // 未扣惩罚
  momentumPenalty: number;   // Gate3 扣分
  momentumFlag: boolean;
  compositeScore: number;    // 扣惩罚后
  reason: string;
}

export interface RejectedPick {
  symbol: string; name: string | null; sourceRating: string;
  reason: RejectReason; detail: string | null;
  turnover: number | null; momentum20d: number | null; rawComposite: number;
}

export interface FilterStats {
  candidates: number;
  newsReject: number;
  liquidityReject: number;
  momentumPenalty: number;   // 被施加惩罚的存活候选数
  finalPicks: number;
}

export interface ComposeResult {
  picks: RankedPick[];
  rejected: RejectedPick[];
  stats: FilterStats;
}

export const TOP_PICK_WEIGHTS = { ai: 0.35, alpha: 0.25, contribution: 0.10, confidence: 0.10, risk: 0.20 } as const;

function riskScoreOf(highRisk: boolean): number { return highRisk ? 40 : 85; }

function composeOne(p: PickInput, gate: GateOutcome): RankedPick {
  const aiScoreN = clamp(p.aiScore ?? 0);
  const alphaScoreN = clamp(p.alphaScore ?? 50);
  const contributionN = clamp(p.contribution ?? 0);
  const confidenceN = clamp(p.confidence ?? 50);
  const riskScore = riskScoreOf(p.highRiskFlag);
  const w = TOP_PICK_WEIGHTS;
  const rawComposite = r1(clamp(
    aiScoreN * w.ai + alphaScoreN * w.alpha + contributionN * w.contribution + confidenceN * w.confidence + riskScore * w.risk,
  ));
  const compositeScore = r1(clamp(rawComposite - gate.momentumPenalty));
  const reason = [
    p.sourceRating === "STRONG_BUY" ? "强烈买入" : "买入",
    `AI评分 ${r1(aiScoreN)}`,
    `因子Alpha分 ${r1(alphaScoreN)}`,
    `因子排名 前${r1(100 - contributionN)}%`,
    `置信 ${r1(confidenceN)}%`,
    p.highRiskFlag ? "⚠高风险" : "低风险",
    gate.momentumFlag ? `⚠追高−${gate.momentumPenalty}` : "",
  ].filter(Boolean).join(" · ");
  return {
    ...p, rank: 0, aiScoreN, alphaScoreN, contributionN, confidenceN, riskScore,
    rawComposite, momentumPenalty: gate.momentumPenalty, momentumFlag: gate.momentumFlag, compositeScore, reason,
  };
}

/**
 * Quality Gates + 综合重排选 TopN。
 * - Gate1/2：News/Liquidity Reject（含 STRONG_BUY，重大利空/低流动性一律剔除）。
 * - Gate3：Momentum > 阈值 → composite 扣分（非 Reject）。
 * - STRONG_BUY 在**存活候选**内保底；不足 N 时按扣分后 composite 从 BUY 补足。
 */
export function composeTopPicks(
  strongBuys: PickInput[], buys: PickInput[], topN = 5, cfg = TOP_PICK_GATES,
): ComposeResult {
  const rejected: RejectedPick[] = [];
  let newsReject = 0, liquidityReject = 0;

  const survive = (p: PickInput): RankedPick | null => {
    const g = evaluateGates(p.gate, cfg);
    if (g.rejected) {
      const raw = composeOne(p, { ...g, momentumPenalty: 0 }).rawComposite;
      rejected.push({ symbol: p.symbol, name: p.name, sourceRating: p.sourceRating, reason: g.reason!, detail: g.detail, turnover: g.turnover, momentum20d: g.momentum20d, rawComposite: raw });
      if (g.reason === "NEWS_NEGATIVE") newsReject++; else liquidityReject++;
      return null;
    }
    return composeOne(p, g);
  };

  const byComposite = (a: RankedPick, b: RankedPick) => b.compositeScore - a.compositeScore;
  const candidates = strongBuys.length + buys.length;
  const sb = strongBuys.map(survive).filter((x): x is RankedPick => x != null).sort(byComposite);
  const bu = buys.map(survive).filter((x): x is RankedPick => x != null).sort(byComposite);

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

  const momentumPenalty = selected.filter((p) => p.momentumFlag).length;
  return { picks: selected, rejected, stats: { candidates, newsReject, liquidityReject, momentumPenalty, finalPicks: selected.length } };
}
