// rating.ts — 评级解释（P3-T3）
// 生成「为什么是 Strong Buy / Buy / …」的中文说明：分位 + 各维度贡献占比 + 风险 + Confidence。

const RATING_ZH: Record<string, string> = { STRONG_BUY: "强烈买入", BUY: "买入", HOLD: "持有", WATCH: "观察", AVOID: "回避" };
const DIM_ZH: Record<string, string> = { technical: "技术", fundamental: "基本面", alpha: "Alpha", news: "新闻", flow: "资金" };

export function buildRatingReason(p: {
  rating: string;
  percentile: number;                       // 0–100 higher=better
  contributions: Record<string, number | null>;
  riskAdjustment: number;
  confidence: number;
}): string {
  const topPct = (100 - p.percentile).toFixed(1); // 前 X%
  const total = Object.values(p.contributions).reduce((a: number, c) => a + (c ?? 0), 0) || 1;
  const shares = (["technical", "fundamental", "alpha", "news", "flow"] as const)
    .map((d) => ({ d, pct: ((p.contributions[d] ?? 0) / total) * 100 }))
    .filter((x) => x.pct > 0)
    .sort((a, b) => b.pct - a.pct);
  const parts = shares.map((x) => `${DIM_ZH[x.d]}${x.pct.toFixed(0)}%`).join(" ");
  const risk = p.riskAdjustment < 0 ? ` 风险${p.riskAdjustment.toFixed(0)}%` : "";
  return `${RATING_ZH[p.rating] ?? p.rating}：进入前${topPct}% · 贡献 ${parts}${risk} · Confidence ${p.confidence.toFixed(0)}%`;
}
