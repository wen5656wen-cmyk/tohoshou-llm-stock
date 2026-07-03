// quality.ts — Data Quality（P3-T3）
// 各维度在整个 universe 的覆盖率（%），反映哪些维度数据充足、哪些稀疏。

const DIMS = ["technical", "fundamental", "alpha", "news", "flow"] as const;

export type DimCoverage = Record<string, number>; // 维度 → 覆盖率 %

export function computeDataQuality(items: { subScores: Record<string, number | null> }[]): DimCoverage {
  const n = items.length || 1;
  const cov: DimCoverage = {};
  for (const d of DIMS) {
    const present = items.filter((it) => it.subScores[d] != null).length;
    cov[d] = Math.round((present / n) * 1000) / 10;
  }
  return cov;
}

// 综合数据质量分（0–100）：核心维度加权覆盖率（news 稀疏是设计使然，权重低）
export function overallQuality(cov: DimCoverage): number {
  const w = { technical: 0.30, fundamental: 0.25, alpha: 0.25, flow: 0.15, news: 0.05 };
  let s = 0;
  for (const [d, wt] of Object.entries(w)) s += wt * (cov[d] ?? 0);
  return Math.round(s * 10) / 10;
}
