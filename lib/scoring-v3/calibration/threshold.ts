// threshold.ts — 动态评级阈值（P3-T3）
// 不再用固定 75/65/55/45，改为每日按分布 + 市场状态生成分数切点。
// 目标桶（累计占比，higher=better）：SB ~Top1% / BUY ~Top5% / HOLD ~Top25% / WATCH ~Top60% / AVOID 剩余。

import { buildDistribution, quantile, type Distribution } from "./distribution";

// 各市场状态的累计目标分位（从顶部起算的占比）
// BEAR 更严（SB 更少），BULL 略宽。
const REGIME_TARGETS: Record<string, { sb: number; buy: number; hold: number; watch: number }> = {
  BULL:     { sb: 0.015, buy: 0.06, hold: 0.27, watch: 0.62 },
  SIDEWAYS: { sb: 0.01,  buy: 0.05, hold: 0.25, watch: 0.60 },
  BEAR:     { sb: 0.005, buy: 0.04, hold: 0.22, watch: 0.55 },
};

export type Thresholds = {
  regime: string;
  targets: { sb: number; buy: number; hold: number; watch: number };
  cutoffs: { sb: number; buy: number; hold: number; watch: number }; // scoreV3 分数切点
};

export function computeThresholds(scores: number[], regime: string): Thresholds {
  const t = REGIME_TARGETS[regime] ?? REGIME_TARGETS.SIDEWAYS;
  const dist: Distribution = buildDistribution(scores);
  // 切点 = 分布中「1 - 累计占比」处的分数（top X% 的下界）
  const cutoffs = {
    sb: quantile(dist, 1 - t.sb),
    buy: quantile(dist, 1 - t.buy),
    hold: quantile(dist, 1 - t.hold),
    watch: quantile(dist, 1 - t.watch),
  };
  return { regime, targets: t, cutoffs };
}

export function rateByThreshold(scoreV3: number, th: Thresholds): string {
  const c = th.cutoffs;
  if (scoreV3 >= c.sb) return "STRONG_BUY";
  if (scoreV3 >= c.buy) return "BUY";
  if (scoreV3 >= c.hold) return "HOLD";
  if (scoreV3 >= c.watch) return "WATCH";
  return "AVOID";
}
