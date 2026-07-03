// explain.ts — V3 中文解释系统（P3-T1）
// 从维度贡献 + 风险扣分生成每只股票的中文解释。

import type { DimBreakdown } from "./score-v3";
import type { RiskDetail } from "./risk-adjustment";

const RATING_ZH: Record<string, string> = {
  STRONG_BUY: "强烈买入", BUY: "买入", HOLD: "持有", WATCH: "观察", AVOID: "回避",
};
const DIM_ZH: Record<string, string> = {
  technical: "技术面", fundamental: "基本面", alpha: "Alpha", news: "新闻事件", flow: "资金流动性",
};

// 维度理由短语（按百分位强弱）
function dimReason(dim: string, sub: number): string {
  const strong = sub >= 70, weak = sub <= 30;
  switch (dim) {
    case "technical": return strong ? "趋势向上，动量强于大盘" : weak ? "趋势偏弱" : "趋势中性";
    case "fundamental": return strong ? "盈利质量良好" : weak ? "基本面偏弱" : "基本面中性";
    case "alpha": return strong ? "低波动/52周高点等因子有效" : weak ? "Alpha 因子偏弱" : "Alpha 因子中性";
    case "news": return sub >= 60 ? "近期有正向事件/情绪" : sub <= 40 ? "近期有负面消息" : "新闻中性";
    case "flow": return strong ? "换手放量，资金活跃" : weak ? "流动性偏弱" : "资金中性";
    default: return "";
  }
}

export function buildExplanation(p: {
  nameZh: string | null; name: string; symbol: string;
  scoreV3: number; rating: string; contrib: DimBreakdown; sub: DimBreakdown; risk: RiskDetail;
}): string {
  const dispName = p.nameZh ?? p.name;
  const dims = (["technical", "fundamental", "alpha", "news", "flow"] as const)
    .map((d) => ({ d, c: p.contrib[d], s: p.sub[d] }))
    .filter((x) => x.c != null)
    .sort((a, b) => (b.c as number) - (a.c as number));

  const lines: string[] = [];
  lines.push(`${p.symbol} ${dispName}`);
  lines.push(`V3评分：${p.scoreV3.toFixed(0)} · 评级：${RATING_ZH[p.rating] ?? p.rating}`);
  lines.push("贡献：");
  for (const x of dims) {
    lines.push(`· ${DIM_ZH[x.d]} +${(x.c as number).toFixed(0)}：${dimReason(x.d, x.s as number)}`);
  }
  if (p.risk.total < 0) {
    const rs: string[] = [];
    if (p.risk.volatilityPenalty < 0) rs.push("波动偏高");
    if (p.risk.liquidityPenalty < 0) rs.push("流动性偏低");
    if (p.risk.financialMissingPenalty < 0) rs.push("财报缺失");
    if (p.risk.dataQualityPenalty < 0) rs.push("数据不足");
    lines.push(`· 风险 ${p.risk.total.toFixed(0)}：${rs.join("、") || "综合风险"}`);
  }
  const concl = p.rating === "STRONG_BUY" || p.rating === "BUY"
    ? "综合信号中等偏强，适合观察买入。"
    : p.rating === "HOLD" ? "综合信号中性，建议持有观望。"
    : p.rating === "WATCH" ? "综合信号偏弱，暂列观察。" : "综合信号弱，建议回避。";
  lines.push(`结论：${concl}`);
  return lines.join("\n");
}
