// factor-quality.ts — 因子质量评估（P3-T1）
// 计算每个维度的「质量分」q ∈ [0,1]，用于动态权重：
// 无区分度 / 低覆盖 / 数据过旧 / Rank IC 低 的维度自动降权。
// 这正是解决 V2「全球/资金/新闻区分度低」问题的核心——数据不行的维度权重自动被压低。

export type DimKey = "technical" | "fundamental" | "alpha" | "news" | "flow";

export type FactorQuality = {
  coverage: number;        // 0–1，非空占比
  discrimination: number;  // 0–1，横截面区分度（std 归一化）
  freshness: number;       // 0–1，数据新鲜度
  rankIcNorm: number;      // 0–1，|RankIC| 归一化
  quality: number;         // 0–1，综合
};

function std(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
}

// values：整个 universe 的该维度原始值（null = 无数据）
// opts.scaleRef：该维度原始值的参考幅度（用于把 std 归一化到 0–1）
// opts.rankIc：若有历史 RankIC（来自 AlphaFactorReport），传入
// opts.fresh：数据是否为今日
export function assessDimension(
  values: (number | null)[],
  opts: { scaleRef: number; rankIc?: number | null; fresh?: boolean }
): FactorQuality {
  const total = values.length || 1;
  const present = values.filter((v): v is number => v != null);
  const coverage = present.length / total;

  const s = std(present);
  const discrimination = Math.max(0, Math.min(1, s / (opts.scaleRef || 1)));

  const freshness = opts.fresh === false ? 0.5 : 1;

  const rankIcNorm = opts.rankIc != null
    ? Math.max(0, Math.min(1, Math.abs(opts.rankIc) / 0.10))
    : 0.5; // 无历史 IC 的维度（技术/基本面）给中性先验，不惩罚也不奖励

  const quality =
    0.35 * coverage +
    0.30 * discrimination +
    0.15 * freshness +
    0.20 * rankIcNorm;

  return { coverage, discrimination, freshness, rankIcNorm, quality: Math.max(0, Math.min(1, quality)) };
}

// 横截面百分位（0–100，higher = better）。null 保持 null（该维度不参与该股）。
export function crossSectionalPercentile(values: (number | null)[]): (number | null)[] {
  const idx = values.map((v, i) => ({ v, i })).filter((x) => x.v != null) as { v: number; i: number }[];
  idx.sort((a, b) => a.v - b.v);
  const out: (number | null)[] = values.map(() => null);
  const n = idx.length;
  if (n === 0) return out;
  // 处理并列：同值取平均百分位
  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && idx[j + 1].v === idx[k].v) j++;
    const pct = n === 1 ? 100 : ((k + j) / 2 / (n - 1)) * 100;
    for (let t = k; t <= j; t++) out[idx[t].i] = pct;
    k = j + 1;
  }
  return out;
}
