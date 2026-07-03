// risk-adjustment.ts — 风险层（P3-T1）
// 负向扣分 [-15, 0]：低流动性 / 高波动 / 财报缺失 / 数据质量差。
// 信用交易限制/日々公表：仅轻扣分或提示，不直接排除（人工排除仍最高优先级，在上游处理）。

export type RiskInput = {
  atrPctPercentile: number | null;      // 波动率横截面百分位 0–100（越高越波动）
  turnoverPercentile: number | null;    // 流动性横截面百分位 0–100（越低越差）
  hasFinancial: boolean;
  priceCount: number;
  marginRestricted?: boolean;           // 信用制限/日々公表（若有数据）
};

export type RiskDetail = {
  volatilityPenalty: number;
  liquidityPenalty: number;
  financialMissingPenalty: number;
  dataQualityPenalty: number;
  marginNotePenalty: number;
  total: number; // -15..0
};

// regimeRiskMult：BULL 0.6 / SIDEWAYS 1.0 / BEAR 1.4（熊市风险惩罚更重）
export function computeRiskAdjustment(input: RiskInput, regimeRiskMult: number): RiskDetail {
  // 高波动：atr 百分位 > 70 才开始扣，最高 -6
  let vol = 0;
  if (input.atrPctPercentile != null && input.atrPctPercentile > 70) {
    vol = -((input.atrPctPercentile - 70) / 30) * 6;
  }
  // 低流动性：换手百分位 < 30 才扣，最高 -5
  let liq = 0;
  if (input.turnoverPercentile != null && input.turnoverPercentile < 30) {
    liq = -((30 - input.turnoverPercentile) / 30) * 5;
  }
  // 财报缺失：-3
  const fin = input.hasFinancial ? 0 : -3;
  // 数据质量：priceCount < 60 递增扣，最高 -2
  const dq = input.priceCount >= 60 ? 0 : -((60 - input.priceCount) / 60) * 2;
  // 信用制限/日々公表：仅轻扣 -1（不排除）
  const margin = input.marginRestricted ? -1 : 0;

  // regime 倍率只作用于市场性风险（波动/流动），结构性风险（财报/数据/信用）不放大
  const volA = vol * regimeRiskMult;
  const liqA = liq * regimeRiskMult;

  let total = volA + liqA + fin + dq + margin;
  total = Math.max(-15, Math.min(0, total));

  return {
    volatilityPenalty: Math.round(volA * 100) / 100,
    liquidityPenalty: Math.round(liqA * 100) / 100,
    financialMissingPenalty: fin,
    dataQualityPenalty: Math.round(dq * 100) / 100,
    marginNotePenalty: margin,
    total: Math.round(total * 100) / 100,
  };
}
