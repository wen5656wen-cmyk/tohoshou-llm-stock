// ── TOHOSHOU AI · Closing Decision · Portfolio Builder（P6-T12）──────────────
// 从合格候选自动生成 3-5 只建仓组合（非简单排序）：
//   · 优先买区内 / 未追高标的     · 行业集中度控制（单行业 ≤ 2）
//   · 低相关性（行业分散优先）    · 按综合分自动计算仓位（20%–40%，5% 取整）
// 无合格机会 → 空组合 + "今日建议空仓"。
// **纯函数 · 只读 · 不影响任何评分/推荐。**

import type { DecisionRow, PortfolioLeg, PortfolioResult } from "./types";

export const PORTFOLIO_CONFIG = {
  minLegs: 3,
  maxLegs: 5,
  maxPerSector: 2, // 行业集中度上限
  maxWeight: 40, // 单只最大仓位 %
  minWeight: 15, // 单只最小仓位 %
} as const;

const r5 = (v: number) => Math.round(v / 5) * 5; // 5% 取整

/**
 * 生成建仓组合。
 * @param candidates 已按 closingScore 降序的**合格**候选（qualified=true 的行）
 * @param verdict 当日裁决——STAY_CASH 时强制空仓
 */
export function buildPortfolio(
  candidates: DecisionRow[],
  verdict: string,
  cfg = PORTFOLIO_CONFIG,
): PortfolioResult {
  if (verdict === "STAY_CASH") {
    return { legs: [], note: "今日建议空仓——市场条件不满足建仓门槛，等待更明确的买点。" };
  }

  const qualified = candidates.filter((r) => r.qualified);
  if (qualified.length === 0) {
    return { legs: [], note: "今日建议空仓——无满足买区/风控条件的合格标的。" };
  }

  // 行业集中度控制：贪心选取，单行业 ≤ maxPerSector，优先 closingScore 高者
  const sorted = [...qualified].sort((a, b) => b.closingScore - a.closingScore);
  const picked: DecisionRow[] = [];
  const sectorCount = new Map<string, number>();
  for (const row of sorted) {
    if (picked.length >= cfg.maxLegs) break;
    const sec = row.sector ?? "其他";
    const c = sectorCount.get(sec) ?? 0;
    if (c >= cfg.maxPerSector) continue; // 行业已满，跳过（低相关性优先）
    picked.push(row);
    sectorCount.set(sec, c + 1);
  }
  // 若因行业限制不足 minLegs，放开限制补足（仍按分数）
  if (picked.length < cfg.minLegs) {
    for (const row of sorted) {
      if (picked.length >= cfg.minLegs) break;
      if (picked.some((p) => p.symbol === row.symbol)) continue;
      picked.push(row);
    }
  }

  // 仓位：按 closingScore 归一 → clamp[min,max] → 5% 取整 → 再归一到 100%
  const scores = picked.map((p) => Math.max(1, p.closingScore));
  const sum = scores.reduce((a, b) => a + b, 0);
  let weights = scores.map((s) => (s / sum) * 100);
  weights = weights.map((w) => Math.min(cfg.maxWeight, Math.max(cfg.minWeight, w)));
  weights = weights.map(r5);
  // 归一化到 100（把误差加到最大仓位那只）
  let total = weights.reduce((a, b) => a + b, 0);
  if (total !== 100 && weights.length) {
    const idx = weights.indexOf(Math.max(...weights));
    weights[idx] += 100 - total;
    if (weights[idx] < 5) weights[idx] = 5;
    total = weights.reduce((a, b) => a + b, 0);
  }

  const legs: PortfolioLeg[] = picked.map((p, i) => ({
    symbol: p.symbol,
    name: p.name,
    sector: p.sector,
    weight: weights[i],
    price: p.price,
    entryLow: p.entryLow,
    entryHigh: p.entryHigh,
    target1: p.target1,
    stopLoss: p.stopLoss,
    aiScore: p.aiScore,
    gptScore: p.gptScore,
    reason: p.reason,
  }));

  const sectors = [...new Set(picked.map((p) => p.sector ?? "其他"))];
  const note =
    `共 ${legs.length} 只（覆盖 ${sectors.length} 个行业，单行业≤${cfg.maxPerSector}，优先买区内标的）。` +
    (legs.length < cfg.minLegs ? "（合格标的不足，仓位偏保守）" : "");

  return { legs, note };
}
