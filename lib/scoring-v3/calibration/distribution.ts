// distribution.ts — 当日分数分布（P3-T3）
// 提供排序分布 + 分位数查询，供动态阈值使用。

export type Distribution = { sorted: number[]; n: number };

export function buildDistribution(scores: number[]): Distribution {
  const sorted = [...scores].sort((a, b) => a - b);
  return { sorted, n: sorted.length };
}

// 分位数（q∈[0,1]，线性插值）。q=0.99 → 第 99 百分位（top 1% 的下界）。
export function quantile(dist: Distribution, q: number): number {
  if (dist.n === 0) return 0;
  if (dist.n === 1) return dist.sorted[0];
  const pos = Math.max(0, Math.min(1, q)) * (dist.n - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return dist.sorted[lo];
  return dist.sorted[lo] + (dist.sorted[hi] - dist.sorted[lo]) * (pos - lo);
}

export function distStats(scores: number[]) {
  const d = buildDistribution(scores);
  return { min: d.sorted[0] ?? 0, p25: quantile(d, 0.25), median: quantile(d, 0.5), p75: quantile(d, 0.75), max: d.sorted[d.n - 1] ?? 0, mean: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0 };
}
