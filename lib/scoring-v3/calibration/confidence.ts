// confidence.ts — 可信度引擎（P3-T3）
// Confidence 0–100：分数背后的数据支撑度。高分但覆盖不足/风险大 → 低 Confidence。

export type ConfidenceInput = {
  subScores: Record<string, number | null>; // 各维度百分位（null=该股无此维度）
  riskAdjustment: number;                    // -15..0
  hasFundamental: boolean;
  hasAlpha: boolean;
  freshness?: number;                        // 0–1，默认 1
};

const DIMS = ["technical", "fundamental", "alpha", "news", "flow"];

export function computeConfidence(inp: ConfidenceInput): number {
  const present = DIMS.filter((d) => inp.subScores[d] != null).length;
  const dimCov = present / DIMS.length;
  const fresh = inp.freshness ?? 1;
  const hasNews = inp.subScores["news"] != null;
  const riskFrac = Math.min(1, Math.abs(inp.riskAdjustment) / 15);

  const conf =
    0.35 * dimCov +
    0.15 * fresh +
    0.20 * (inp.hasFundamental ? 1 : 0) +
    0.12 * (inp.hasAlpha ? 1 : 0) +
    0.08 * (hasNews ? 1 : 0) +
    0.10 * (1 - riskFrac);

  return Math.round(Math.max(0, Math.min(1, conf)) * 1000) / 10; // 0–100，一位小数
}

// 质量分（该股数据完整度）= 维度覆盖 * 100
export function computeQualityScore(subScores: Record<string, number | null>): number {
  const present = DIMS.filter((d) => subScores[d] != null).length;
  return Math.round((present / DIMS.length) * 1000) / 10;
}

export function confidenceBucket(conf: number): "高" | "中" | "低" {
  return conf >= 80 ? "高" : conf >= 60 ? "中" : "低";
}
