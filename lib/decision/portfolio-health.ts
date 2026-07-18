// ── Portfolio Health（P17-03 · §6）纯派生 ─────────────────────────────────────
// 输入 = 已有 /api/holdings 汇总 + 持仓 + 风险；输出 = ★ + 评级 + 一句解释（i18n key）。
// 综合：持仓集中度 / 风险等级 / 现金比例 / 行业分散 / 波动。全部来自已有数据，不新增请求。

export type Stars = 1 | 2 | 3 | 4 | 5;

export interface HealthInput {
  summary: { count: number; marketValue: number; positionPct: number | null; cashPct: number | null } | null;
  holdings: { symbol: string; marketValue: number | null; sector: string | null }[];
  riskLevel: string | null; // gd.riskLevel
  highRiskCount: number;     // 风险面板中 HIGH/EXTREME 数量
}

export interface HealthResult {
  stars: Stars | null; labelKey: string; reasonKeys: string[];
  maxSinglePct: number | null; sectorCount: number; cashPct: number | null; riskLevel: string | null;
}

const clamp = (n: number): Stars => Math.max(1, Math.min(5, Math.round(n))) as Stars;

export function computePortfolioHealth(input: HealthInput): HealthResult {
  const sm = input.summary;
  if (!sm || sm.count === 0) {
    return { stars: null, labelKey: "dv.ph.empty", reasonKeys: [], maxSinglePct: null, sectorCount: 0, cashPct: sm?.cashPct ?? null, riskLevel: input.riskLevel };
  }
  const total = sm.marketValue || input.holdings.reduce((a, h) => a + (h.marketValue ?? 0), 0);
  const maxMv = input.holdings.reduce((m, h) => Math.max(m, h.marketValue ?? 0), 0);
  const maxSinglePct = total > 0 ? Math.round((maxMv / total) * 1000) / 10 : null;
  const sectors = new Set(input.holdings.map((h) => h.sector).filter((s): s is string => !!s));
  const sectorCount = sectors.size;
  const cashPct = sm.cashPct;
  const risk = input.riskLevel;

  let score = 5;
  const good: string[] = [], bad: string[] = [];

  // 集中度
  if (maxSinglePct != null && maxSinglePct > 50) { score -= 2; bad.push("dv.ph.r.concHigh"); }
  else if (maxSinglePct != null && maxSinglePct > 35) { score -= 1; bad.push("dv.ph.r.concMid"); }
  else if (maxSinglePct != null) good.push("dv.ph.r.concLow");

  // 行业分散
  if (sm.count >= 3 && sectorCount <= 1) { score -= 1; bad.push("dv.ph.r.sectorNarrow"); }
  else if (sectorCount >= 3) good.push("dv.ph.r.sectorWide");

  // 现金比例
  if (cashPct != null && cashPct < 0) { score -= 1; bad.push("dv.ph.r.cashNeg"); }
  else if (cashPct != null && cashPct > 70) { score -= 1; bad.push("dv.ph.r.cashHigh"); }
  else if (cashPct != null && cashPct >= 10 && cashPct <= 40) good.push("dv.ph.r.cashOk");

  // 风险等级
  if (risk === "EXTREME") { score -= 2; bad.push("dv.ph.r.riskHigh"); }
  else if (risk === "HIGH") { score -= 1; bad.push("dv.ph.r.riskHigh"); }
  else if (risk === "LOW") good.push("dv.ph.r.riskLow");

  // 波动 / 多个高风险标的
  if (input.highRiskCount >= 2) { score -= 1; bad.push("dv.ph.r.volHigh"); }

  const stars = clamp(score);
  const labelKey = stars >= 5 ? "dv.ph.excellent" : stars === 4 ? "dv.ph.good" : stars === 3 ? "dv.ph.normal" : "dv.ph.weak";
  // 一句解释：优先暴露问题（bad），否则展示优点（good），最多 3 条。
  const reasonKeys = (bad.length ? bad : good).slice(0, 3);
  return { stars, labelKey, reasonKeys, maxSinglePct, sectorCount, cashPct, riskLevel: risk };
}
