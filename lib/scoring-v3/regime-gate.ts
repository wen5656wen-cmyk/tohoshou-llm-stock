// regime-gate.ts — 市场状态门控（P3-T1）
// Market Regime 不直接给个股加分，只作为「权重门控 + 风险控制」。
// 提供每种市场状态下的基准权重模板 + 风险惩罚倍率。

export type DimWeights = {
  technical: number;
  fundamental: number;
  alpha: number;
  news: number;
  flow: number;
};

// 基准权重（和为 1）。dynamic-weight 会在此基础上按因子质量再调整并归一化。
// BULL：↑技术/动量，Alpha 辅助，风险惩罚轻
// SIDEWAYS：技术与 Alpha 均衡，↑质量（基本面），↓追高
// BEAR：↓动量（技术），↑Alpha/质量（低波动），风险惩罚重
const REGIME_BASE: Record<string, DimWeights> = {
  BULL:     { technical: 0.38, fundamental: 0.18, alpha: 0.24, news: 0.10, flow: 0.10 },
  SIDEWAYS: { technical: 0.28, fundamental: 0.27, alpha: 0.25, news: 0.10, flow: 0.10 },
  BEAR:     { technical: 0.22, fundamental: 0.30, alpha: 0.28, news: 0.08, flow: 0.12 },
};

// 风险惩罚倍率：BULL 轻、SIDEWAYS 中、BEAR 重
const REGIME_RISK_MULT: Record<string, number> = {
  BULL: 0.6,
  SIDEWAYS: 1.0,
  BEAR: 1.4,
};

export function regimeBaseWeights(regime: string | null | undefined): DimWeights {
  return REGIME_BASE[regime ?? "SIDEWAYS"] ?? REGIME_BASE.SIDEWAYS;
}

export function regimeRiskMultiplier(regime: string | null | undefined): number {
  return REGIME_RISK_MULT[regime ?? "SIDEWAYS"] ?? 1.0;
}

export function regimeLabelZh(regime: string | null | undefined): string {
  return regime === "BULL" ? "牛市" : regime === "BEAR" ? "熊市" : "震荡市";
}
