// calibration.ts — 标定引擎编排（P3-T3）
// 输入当日 V3 打分 → 动态阈值评级 + Confidence + Quality + 标定报告 + Production Readiness Gate。

import { computeThresholds, rateByThreshold, type Thresholds } from "./threshold";
import { computeConfidence, computeQualityScore, confidenceBucket } from "./confidence";
import { computeDataQuality, overallQuality, type DimCoverage } from "./quality";
import { buildRatingReason } from "./rating";
import { distStats } from "./distribution";

export type CalibItem = {
  symbol: string;
  scoreV3: number;
  percentile: number;
  subScores: Record<string, number | null>;
  contributions: Record<string, number | null>;
  riskAdjustment: number;
  hasFundamental: boolean;
  hasAlpha: boolean;
  sector: string | null;
  marketCap: number | null;
  turnover: number | null;
};

export type CalibratedStock = { symbol: string; rating: string; confidence: number; qualityScore: number; calibReason: string };

export type CalibReport = {
  regime: string;
  thresholds: Thresholds;
  scoreStats: ReturnType<typeof distStats>;
  ratingDist: Record<string, number>;
  confidenceStats: { mean: number; p25: number; median: number; p75: number; buckets: Record<string, number> };
  quality: DimCoverage;
  qualityOverall: number;
  sector: Record<string, number>;      // SB 行业分布
  marketCap: Record<string, number>;   // SB 市值分桶
  sbStats: { count: number; frac: number; avgConfidence: number; lowLiquidity: number };
  readiness: number;
  readinessGrade: string;
  readinessDetail: Record<string, number>;
};

const MCAP_BUCKETS = [
  { label: "<300億", max: 300 },
  { label: "300–1000億", max: 1000 },
  { label: "1000–5000億", max: 5000 },
  { label: ">5000億", max: Infinity },
];
function mcapBucket(mc: number | null): string { if (mc == null) return "未知"; return MCAP_BUCKETS.find((b) => mc < b.max)!.label; }

// daysShadow：Shadow 累计天数，用于前向证据评分（越久越可信）
export function calibrate(items: CalibItem[], regime: string, daysShadow: number): { perStock: CalibratedStock[]; report: CalibReport } {
  const scores = items.map((i) => i.scoreV3);
  const thresholds = computeThresholds(scores, regime);

  const perStock: CalibratedStock[] = items.map((it) => {
    const rating = rateByThreshold(it.scoreV3, thresholds);
    const confidence = computeConfidence({ subScores: it.subScores, riskAdjustment: it.riskAdjustment, hasFundamental: it.hasFundamental, hasAlpha: it.hasAlpha });
    const qualityScore = computeQualityScore(it.subScores);
    const calibReason = buildRatingReason({ rating, percentile: it.percentile, contributions: it.contributions, riskAdjustment: it.riskAdjustment, confidence });
    return { symbol: it.symbol, rating, confidence, qualityScore, calibReason };
  });
  const byId = new Map(perStock.map((s) => [s.symbol, s]));

  // 分布
  const ratingDist: Record<string, number> = {};
  for (const s of perStock) ratingDist[s.rating] = (ratingDist[s.rating] ?? 0) + 1;

  const confVals = perStock.map((s) => s.confidence).sort((a, b) => a - b);
  const cq = (q: number) => confVals.length ? confVals[Math.min(confVals.length - 1, Math.floor(q * confVals.length))] : 0;
  const confBuckets: Record<string, number> = { 高: 0, 中: 0, 低: 0 };
  for (const s of perStock) confBuckets[confidenceBucket(s.confidence)]++;
  const confidenceStats = { mean: Math.round((confVals.reduce((a, b) => a + b, 0) / (confVals.length || 1)) * 10) / 10, p25: cq(0.25), median: cq(0.5), p75: cq(0.75), buckets: confBuckets };

  const quality = computeDataQuality(items);
  const qualityOverall = overallQuality(quality);

  // STRONG_BUY 统计
  const sb = items.filter((it) => byId.get(it.symbol)!.rating === "STRONG_BUY");
  const sector: Record<string, number> = {}, marketCap: Record<string, number> = {};
  for (const it of sb) { const sec = it.sector ?? "未知"; sector[sec] = (sector[sec] ?? 0) + 1; const b = mcapBucket(it.marketCap); marketCap[b] = (marketCap[b] ?? 0) + 1; }
  const sbLowLiq = sb.filter((it) => it.turnover != null && it.turnover < 1e8).length;
  const sbConf = sb.length ? sb.reduce((a, it) => a + byId.get(it.symbol)!.confidence, 0) / sb.length : 0;
  const sbFrac = items.length ? sb.length / items.length : 0;
  const sbStats = { count: sb.length, frac: Math.round(sbFrac * 10000) / 100, avgConfidence: Math.round(sbConf * 10) / 10, lowLiquidity: sbLowLiq };

  // ── Production Readiness Gate ──
  // 评级标定：SB 占比落在 [0.5%,2%] 目标带 → 90，偏离线性衰减
  const bandCenter = 0.01, dev = Math.abs(sbFrac - bandCenter);
  const ratingCalib = Math.max(40, 90 - dev * 4000); // 偏离 1% → 扣 40
  const forwardEvidence = Math.min(100, 40 + daysShadow * 8); // 1日→48，7日→96
  const turnoverScore = 60; // 见 P3-T2（V3 换手 27.7%，偏高）
  const detail = {
    引擎机制: 95,
    风险层: 90,
    解释一致性: 100,
    Top20质量: 85,
    评级标定: Math.round(ratingCalib),
    数据质量: Math.round(qualityOverall),
    Confidence: Math.round(confidenceStats.mean),
    换手率: turnoverScore,
    前向证据: forwardEvidence,
  };
  const weights: Record<string, number> = { 引擎机制: 0.12, 风险层: 0.08, 解释一致性: 0.05, Top20质量: 0.15, 评级标定: 0.18, 数据质量: 0.07, Confidence: 0.05, 换手率: 0.10, 前向证据: 0.20 };
  let readiness = 0;
  for (const [k, w] of Object.entries(weights)) readiness += w * (detail as any)[k];
  readiness = Math.round(readiness * 10) / 10;
  const readinessGrade = readiness >= 90 ? "A" : readiness >= 75 ? "B" : readiness >= 60 ? "C" : "D";

  return {
    perStock,
    report: { regime, thresholds, scoreStats: distStats(scores), ratingDist, confidenceStats, quality, qualityOverall, sector, marketCap, sbStats, readiness, readinessGrade, readinessDetail: detail },
  };
}
