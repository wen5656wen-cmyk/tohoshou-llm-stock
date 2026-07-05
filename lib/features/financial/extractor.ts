// ── TOHOSHOU AI · Financial Quality Feature Extractor（P6-T3）───────────────
// 从现有 Financial 数据派生 10 个财务质量因子（影子）。**纯函数、只读、不落库、
// 不接入任何评分、不改任何财务计算/fundamental score。** 缺失字段一律 N/A（不伪造）。

import {
  pickLatest, pickPrior, num, toEquityRatioPct, toRoePct, growthPct, clampScore,
} from "./parser";
import {
  type FinancialLike, type FinancialFeatureResult, type FinancialFeatureSet,
  type FinancialFeatureType, type FinancialDirection, FINANCIAL_FEATURE_TYPES,
} from "./types";

function na(type: FinancialFeatureType, note: string): FinancialFeatureResult {
  return { type, available: false, value: null, latest: null, prior: null, direction: "NA", score: null, note };
}
function dirByPct(pct: number | null, posAt = 5, negAt = -5): FinancialDirection {
  if (pct == null) return "NA";
  if (pct >= posAt) return "POSITIVE";
  if (pct <= negAt) return "NEGATIVE";
  return "NEUTRAL";
}

/** 主入口：某标的的财务质量因子集合（影子）。 */
export function extractFinancialFeatures(symbol: string, financials: FinancialLike[]): FinancialFeatureSet {
  const latest = pickLatest(financials);
  const empty: FinancialFeatureSet = {
    symbol, fiscalYear: null, quarter: null, comparedFiscalYear: null, comparedQuarter: null,
    comparisonKind: "NONE", asOf: new Date(0).toISOString(),
    features: {} as Record<FinancialFeatureType, FinancialFeatureResult>,
  };
  if (!latest) {
    for (const t of FINANCIAL_FEATURE_TYPES) empty.features[t] = na(t, "无 Financial 数据");
    return empty;
  }
  const { prior, kind } = pickPrior(financials, latest);
  const F = {} as Record<FinancialFeatureType, FinancialFeatureResult>;

  // 1) ROE_TREND（由 netProfit/equity 派生；trend = latest - prior，pp）
  {
    const rl = toRoePct(latest), rp = prior ? toRoePct(prior) : null;
    if (rl == null) F.ROE_TREND = na("ROE_TREND", "缺 netProfit/equity，ROE 无法派生");
    else {
      const improve = rp != null ? rl - rp : null;
      const dir: FinancialDirection = improve == null ? (rl >= 8 ? "POSITIVE" : "NEUTRAL")
        : improve >= 0.5 ? "POSITIVE" : improve <= -0.5 ? "NEGATIVE" : "NEUTRAL";
      const score = clampScore(50 + rl * 2 + (improve ?? 0) * 3);
      F.ROE_TREND = { type: "ROE_TREND", available: true, value: improve, latest: rl, prior: rp, direction: dir, score, note: rp == null ? "无对比期，仅按 ROE 水平评估" : undefined };
    }
  }

  // 2) EPS_GROWTH（YoY）
  F.EPS_GROWTH = growthFeature("EPS_GROWTH", num(latest.eps), prior ? num(prior.eps) : null, "缺 eps");

  // 3) REVENUE_GROWTH（YoY）
  F.REVENUE_GROWTH = growthFeature("REVENUE_GROWTH", num(latest.revenue), prior ? num(prior.revenue) : null, "缺 revenue");

  // 4) OPERATING_MARGIN（operatingProfit/revenue）
  {
    const op = num(latest.operatingProfit), rev = num(latest.revenue);
    if (op == null || rev == null || rev === 0) F.OPERATING_MARGIN = na("OPERATING_MARGIN", "缺 operatingProfit/revenue");
    else {
      const margin = (op / rev) * 100;
      const dir: FinancialDirection = margin >= 10 ? "POSITIVE" : margin < 3 ? "NEGATIVE" : "NEUTRAL";
      F.OPERATING_MARGIN = { type: "OPERATING_MARGIN", available: true, value: margin, latest: margin, prior: null, direction: dir, score: clampScore(50 + margin * 2) };
    }
  }

  // 5) PROFIT_MARGIN_IMPROVEMENT（净利率 YoY 变化，pp）
  {
    const nl = num(latest.netProfit), rl = num(latest.revenue);
    const np = prior ? num(prior.netProfit) : null, rp = prior ? num(prior.revenue) : null;
    const mLatest = nl != null && rl != null && rl !== 0 ? (nl / rl) * 100 : null;
    const mPrior = np != null && rp != null && rp !== 0 ? (np / rp) * 100 : null;
    if (mLatest == null) F.PROFIT_MARGIN_IMPROVEMENT = na("PROFIT_MARGIN_IMPROVEMENT", "缺 netProfit/revenue");
    else if (mPrior == null) F.PROFIT_MARGIN_IMPROVEMENT = { type: "PROFIT_MARGIN_IMPROVEMENT", available: true, value: null, latest: mLatest, prior: null, direction: "NEUTRAL", score: clampScore(50 + mLatest * 2), note: "无对比期，仅按当期净利率" };
    else {
      const improve = mLatest - mPrior;
      const dir: FinancialDirection = improve >= 0.5 ? "POSITIVE" : improve <= -0.5 ? "NEGATIVE" : "NEUTRAL";
      F.PROFIT_MARGIN_IMPROVEMENT = { type: "PROFIT_MARGIN_IMPROVEMENT", available: true, value: improve, latest: mLatest, prior: mPrior, direction: dir, score: clampScore(50 + improve * 10) };
    }
  }

  // 6) EQUITY_RATIO（自己资本比率 %）
  {
    const er = toEquityRatioPct(latest);
    if (er == null) F.EQUITY_RATIO = na("EQUITY_RATIO", "缺 equityRatio / equity+totalAssets");
    else {
      const dir: FinancialDirection = er >= 50 ? "POSITIVE" : er < 30 ? "NEGATIVE" : "NEUTRAL";
      F.EQUITY_RATIO = { type: "EQUITY_RATIO", available: true, value: er, latest: er, prior: null, direction: dir, score: clampScore(er) };
    }
  }

  // 7) DIVIDEND_GROWTH（dividendPerShare YoY；实测多缺 → N/A）
  F.DIVIDEND_GROWTH = growthFeature("DIVIDEND_GROWTH", num(latest.dividendPerShare), prior ? num(prior.dividendPerShare) : null, "缺 dividendPerShare（Financial 表多为空，未来接 Dividend 数据源）");

  // 8) CASH_FLOW_QUALITY（Financial 表无现金流字段 → 恒 N/A，不伪造）
  F.CASH_FLOW_QUALITY = na("CASH_FLOW_QUALITY", "Financial 表无现金流字段，需未来数据源");

  // 9) DEBT_RISK（负债率 = 100 - 自己资本比率；高=风险大，score 反向）
  {
    const er = toEquityRatioPct(latest);
    if (er == null) F.DEBT_RISK = na("DEBT_RISK", "缺 equityRatio / equity+totalAssets");
    else {
      const liab = 100 - er;
      const dir: FinancialDirection = liab >= 70 ? "NEGATIVE" : liab <= 40 ? "POSITIVE" : "NEUTRAL";
      F.DEBT_RISK = { type: "DEBT_RISK", available: true, value: liab, latest: liab, prior: null, direction: dir, score: clampScore(100 - liab) };
    }
  }

  // 10) QUALITY_COMPOSITE（可用子因子 score 均值）
  {
    const subs: FinancialFeatureType[] = ["ROE_TREND", "EPS_GROWTH", "REVENUE_GROWTH", "OPERATING_MARGIN", "PROFIT_MARGIN_IMPROVEMENT", "EQUITY_RATIO", "DIVIDEND_GROWTH", "DEBT_RISK"];
    const scores = subs.map((t) => F[t]?.score).filter((s): s is number => typeof s === "number");
    if (scores.length === 0) F.QUALITY_COMPOSITE = na("QUALITY_COMPOSITE", "无可用子因子");
    else {
      const comp = clampScore(scores.reduce((a, b) => a + b, 0) / scores.length);
      const dir: FinancialDirection = comp >= 60 ? "POSITIVE" : comp < 45 ? "NEGATIVE" : "NEUTRAL";
      F.QUALITY_COMPOSITE = { type: "QUALITY_COMPOSITE", available: true, value: comp, latest: comp, prior: null, direction: dir, score: comp, note: `基于 ${scores.length} 个可用子因子` };
    }
  }

  return {
    symbol, fiscalYear: latest.fiscalYear, quarter: latest.quarter ?? null,
    comparedFiscalYear: prior?.fiscalYear ?? null, comparedQuarter: prior?.quarter ?? null,
    comparisonKind: kind, asOf: latest.reportedAt ? new Date(latest.reportedAt).toISOString() : new Date(0).toISOString(),
    features: F,
  };
}

/** 增长类因子的统一构建（EPS/REVENUE/DIVIDEND）。 */
function growthFeature(type: FinancialFeatureType, latest: number | null, prior: number | null, missNote: string): FinancialFeatureResult {
  if (latest == null || prior == null) {
    // 至少一期缺失
    if (latest == null) return na(type, missNote);
    return { type, available: true, value: null, latest, prior: null, direction: "NEUTRAL", score: 50, note: "无对比期，无法计算增长" };
  }
  const pct = growthPct(latest, prior);
  if (pct == null) {
    // prior<=0（扭亏等）：方向按大小，值 null
    const dir: FinancialDirection = latest > prior ? "POSITIVE" : latest < prior ? "NEGATIVE" : "NEUTRAL";
    return { type, available: true, value: null, latest, prior, direction: dir, score: dir === "POSITIVE" ? 70 : dir === "NEGATIVE" ? 30 : 50, note: "对比期≤0，增长率无意义，按方向评估" };
  }
  return { type, available: true, value: pct, latest, prior, direction: dirByPct(pct), score: clampScore(50 + pct * 2) };
}
