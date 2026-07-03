// score-v3.ts — Adaptive Score V3 Pro 主引擎（P3-T1，Shadow-only）
// 7 维：技术 / 基本面 / Alpha / 新闻事件 / 个股资金流动性 / 风险 / 市场状态（门控）
// 流程：原始值 → 横截面百分位 → 动态权重（按可用维度重归一）→ 风险扣分 → 排名 → 评级。

import type { DimWeights } from "./regime-gate";
import type { DimKey } from "./factor-quality";
import { crossSectionalPercentile } from "./factor-quality";
import { computeRiskAdjustment, type RiskDetail } from "./risk-adjustment";
import { buildExplanation } from "./explain";

export type V3StockInput = {
  symbol: string;
  name: string;
  nameZh: string | null;
  sector: string | null;
  market: string | null;
  technicalScore: number | null;    // 0–30
  fundamentalScore: number | null;  // 0–25
  priceCount: number;
  alphaScore: number | null;        // 0–100
  atrPct: number | null;
  averageTurnover20: number | null;
  volumeRatio20: number | null;
  volumeExpansionDays: number | null;
  buyback: boolean | null;
  dividendRaise: boolean | null;
  guidanceRaise: boolean | null;
  tdnetEvent: boolean | null;
  newsSentimentScore: number | null; // 0–15（8=中性）
  hasFinancial: boolean;
};

export type DimBreakdown = {
  technical: number | null;
  fundamental: number | null;
  alpha: number | null;
  news: number | null;
  flow: number | null;
};

export type V3Result = {
  symbol: string;
  name: string;
  nameZh: string | null;
  sector: string | null;
  scoreV3: number;
  rawScore: number;
  riskAdjustment: number;
  rank: number;
  percentile: number;
  rating: string;
  subScores: DimBreakdown;          // 各维度百分位 0–100
  contributions: DimBreakdown;      // 各维度对最终分的贡献（权重×百分位）
  effectiveWeights: Record<string, number>;
  risk: RiskDetail;
  explanation: string;
};

const DIMS: DimKey[] = ["technical", "fundamental", "alpha", "news", "flow"];

// 新闻事件原始值：无事件且情绪中性 → null（不参与评分，不给默认常数分）
function newsRaw(s: V3StockInput): number | null {
  const senti = s.newsSentimentScore ?? 8;
  const sentiDev = senti - 8; // 情绪偏离中性
  const hasEvent = !!(s.buyback || s.dividendRaise || s.guidanceRaise || s.tdnetEvent);
  const strongSenti = Math.abs(sentiDev) >= 2;
  if (!hasEvent && !strongSenti) return null;
  return (
    (s.guidanceRaise ? 2 : 0) +
    (s.buyback ? 1.5 : 0) +
    (s.dividendRaise ? 1 : 0) +
    (s.tdnetEvent ? 1 : 0) +
    sentiDev * 0.5
  );
}

// 个股资金/流动性原始值：换手激增 + 放量（个股级，非市场级）
function flowRaw(s: V3StockInput): number | null {
  if (s.volumeRatio20 == null) return null;
  return s.volumeRatio20 + 0.15 * (s.volumeExpansionDays ?? 0);
}

function computeRating(scoreV3: number, percentile: number): string {
  if (scoreV3 >= 75 && percentile >= 95) return "STRONG_BUY";
  if (scoreV3 >= 70 && percentile >= 85) return "BUY";
  if (scoreV3 >= 60) return "HOLD";
  if (scoreV3 >= 45) return "WATCH";
  return "AVOID";
}

// 主入口：对整个 universe 计算 V3。weights=今日动态权重，regimeRiskMult 由 regime 决定。
export function computeV3(
  stocks: V3StockInput[],
  weights: DimWeights,
  regime: string,
  regimeRiskMult: number
): V3Result[] {
  const n = stocks.length;
  // 1. 原始值
  const raw: Record<DimKey, (number | null)[]> = {
    technical: stocks.map((s) => s.technicalScore),
    fundamental: stocks.map((s) => (s.hasFinancial ? s.fundamentalScore : null)),
    alpha: stocks.map((s) => s.alphaScore),
    news: stocks.map(newsRaw),
    flow: stocks.map(flowRaw),
  };
  // 风险用的横截面百分位
  const atrPct = crossSectionalPercentile(stocks.map((s) => s.atrPct));
  const turnoverPct = crossSectionalPercentile(stocks.map((s) => s.averageTurnover20));

  // 2. 各维度横截面百分位（0–100）
  const pct: Record<DimKey, (number | null)[]> = {
    technical: crossSectionalPercentile(raw.technical),
    fundamental: crossSectionalPercentile(raw.fundamental),
    alpha: crossSectionalPercentile(raw.alpha),
    news: crossSectionalPercentile(raw.news),
    flow: crossSectionalPercentile(raw.flow),
  };

  // 3. 逐股加权（按可用维度重归一）+ 风险
  const interim = stocks.map((s, i) => {
    const sub: DimBreakdown = {
      technical: pct.technical[i], fundamental: pct.fundamental[i], alpha: pct.alpha[i],
      news: pct.news[i], flow: pct.flow[i],
    };
    // 可用维度的有效权重（重归一到和=1）
    const availSum = DIMS.reduce((a, d) => a + (sub[d] != null ? weights[d] : 0), 0) || 1;
    const effW: Record<string, number> = {};
    const contrib: DimBreakdown = { technical: null, fundamental: null, alpha: null, news: null, flow: null };
    let rawScore = 0;
    for (const d of DIMS) {
      if (sub[d] == null) { effW[d] = 0; continue; }
      const w = weights[d] / availSum;
      effW[d] = w;
      const c = w * (sub[d] as number);
      contrib[d] = Math.round(c * 100) / 100;
      rawScore += c;
    }
    const risk = computeRiskAdjustment(
      { atrPctPercentile: atrPct[i], turnoverPercentile: turnoverPct[i], hasFinancial: s.hasFinancial, priceCount: s.priceCount },
      regimeRiskMult
    );
    const scoreV3 = Math.max(0, Math.min(100, rawScore + risk.total));
    return { s, sub, contrib, effW, rawScore: Math.round(rawScore * 100) / 100, risk, scoreV3: Math.round(scoreV3 * 100) / 100 };
  });

  // 4. 排名 + 百分位 + 评级 + 解释
  const sorted = [...interim].sort((a, b) => b.scoreV3 - a.scoreV3);
  const results: V3Result[] = sorted.map((x, idx) => {
    const rank = idx + 1;
    const percentile = n <= 1 ? 100 : Math.round(((n - rank) / (n - 1)) * 1000) / 10;
    const rating = computeRating(x.scoreV3, percentile);
    return {
      symbol: x.s.symbol, name: x.s.name, nameZh: x.s.nameZh, sector: x.s.sector,
      scoreV3: x.scoreV3, rawScore: x.rawScore, riskAdjustment: x.risk.total,
      rank, percentile, rating,
      subScores: x.sub, contributions: x.contrib, effectiveWeights: x.effW, risk: x.risk,
      explanation: buildExplanation({ nameZh: x.s.nameZh, name: x.s.name, symbol: x.s.symbol, scoreV3: x.scoreV3, rating, contrib: x.contrib, sub: x.sub, risk: x.risk }),
    };
  });
  return results;
}
