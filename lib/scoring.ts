/**
 * 5次元AI評分システム
 * 成長性 20% / バリュエーション 20% / 収益性 20% / 資金面 20% / ニュース感情 20%
 */

export type ScoreDimension = {
  growth: number;       // 成長性 0-100
  valuation: number;    // バリュエーション 0-100
  profitability: number; // 収益性 0-100
  capitalFlow: number;  // 資金面 0-100
  sentiment: number;    // ニュース感情 0-100
  total: number;        // 加重平均 0-100
  stars: number;        // 1-5
  grade: "STRONG_BUY" | "BUY" | "WATCH" | "AVOID" | "STRONG_AVOID";
  recommendation: "BUY" | "WATCH" | "AVOID";
};

type StockInput = {
  price: number;
  high52w?: number | null;
  low52w?: number | null;
  per?: number | null;
  pbr?: number | null;
  roe?: number | null;
  roa?: number | null;
  eps?: number | null;
  dividend?: number | null;
  beta?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  changeRate?: number | null;
};

type FinancialInput = {
  revenue?: number | null;
  operatingProfit?: number | null;
  netProfit?: number | null;
  roe?: number | null;
  roa?: number | null;
  equityRatio?: number | null;
  eps?: number | null;
} | null;

type FinancialPrev = FinancialInput;

type NewsInput = {
  sentiment?: string | null;
  importance?: number;
}[];

type DisclosureInput = {
  sentiment?: string | null;
  category?: string;
  importance?: number;
}[];

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

/** 成長性スコア (0-100) */
export function calcGrowthScore(
  current: FinancialInput,
  prev: FinancialPrev
): number {
  if (!current) return 50;
  let score = 50;

  // 売上成長率
  if (current.revenue && prev?.revenue && prev.revenue > 0) {
    const g = ((current.revenue - prev.revenue) / prev.revenue) * 100;
    if (g > 15) score += 20;
    else if (g > 8) score += 12;
    else if (g > 3) score += 6;
    else if (g < -5) score -= 15;
    else if (g < 0) score -= 8;
  }

  // 営業利益成長率
  if (current.operatingProfit && prev?.operatingProfit && prev.operatingProfit > 0) {
    const g = ((current.operatingProfit - prev.operatingProfit) / Math.abs(prev.operatingProfit)) * 100;
    if (g > 20) score += 15;
    else if (g > 10) score += 8;
    else if (g < -10) score -= 12;
  }

  // EPS成長
  if (current.eps && prev?.eps && prev.eps > 0) {
    const g = ((current.eps - prev.eps) / Math.abs(prev.eps)) * 100;
    if (g > 15) score += 10;
    else if (g > 5) score += 5;
    else if (g < -10) score -= 8;
  }

  return clamp(score);
}

/** バリュエーションスコア (0-100) */
export function calcValuationScore(stock: StockInput): number {
  let score = 50;

  // PER (低いほど良い)
  if (stock.per != null && stock.per > 0) {
    if (stock.per < 10) score += 25;
    else if (stock.per < 15) score += 18;
    else if (stock.per < 20) score += 10;
    else if (stock.per < 25) score += 3;
    else if (stock.per < 35) score -= 5;
    else score -= 15;
  }

  // PBR (低いほど良い、ただし極端に低い場合は問題)
  if (stock.pbr != null && stock.pbr > 0) {
    if (stock.pbr < 1.0) score += 15;
    else if (stock.pbr < 1.5) score += 10;
    else if (stock.pbr < 2.0) score += 5;
    else if (stock.pbr < 3.0) score -= 3;
    else if (stock.pbr > 5.0) score -= 10;
  }

  // 配当利回り
  if (stock.dividend != null) {
    if (stock.dividend > 4) score += 15;
    else if (stock.dividend > 2.5) score += 10;
    else if (stock.dividend > 1.5) score += 5;
    else if (stock.dividend === 0) score -= 5;
  }

  // 52週レンジでの位置 (低いほど割安)
  if (stock.high52w && stock.low52w && stock.price) {
    const range = stock.high52w - stock.low52w;
    if (range > 0) {
      const pos = (stock.price - stock.low52w) / range;
      if (pos < 0.3) score += 10;
      else if (pos < 0.5) score += 5;
      else if (pos > 0.9) score -= 10;
    }
  }

  return clamp(score);
}

/** 収益性スコア (0-100) */
export function calcProfitabilityScore(
  stock: StockInput,
  fin: FinancialInput
): number {
  let score = 50;
  const roe = fin?.roe ?? stock.roe ?? null;
  const roa = fin?.roa ?? stock.roa ?? null;

  // ROE
  if (roe != null) {
    if (roe > 20) score += 25;
    else if (roe > 15) score += 18;
    else if (roe > 10) score += 10;
    else if (roe > 5) score += 3;
    else if (roe < 0) score -= 20;
    else score -= 5;
  }

  // ROA
  if (roa != null) {
    if (roa > 15) score += 15;
    else if (roa > 8) score += 10;
    else if (roa > 4) score += 5;
    else if (roa < 0) score -= 15;
  }

  // 自己資本比率
  if (fin?.equityRatio != null) {
    if (fin.equityRatio > 60) score += 10;
    else if (fin.equityRatio > 40) score += 5;
    else if (fin.equityRatio < 20) score -= 10;
    else if (fin.equityRatio < 10) score -= 20;
  }

  // 営業利益率
  if (fin?.revenue && fin.operatingProfit && fin.revenue > 0) {
    const margin = (fin.operatingProfit / fin.revenue) * 100;
    if (margin > 20) score += 15;
    else if (margin > 12) score += 8;
    else if (margin > 5) score += 3;
    else if (margin < 0) score -= 15;
  }

  return clamp(score);
}

/** 資金面スコア (0-100) - 出来高・価格トレンド・ベータ */
export function calcCapitalFlowScore(stock: StockInput): number {
  let score = 50;

  // 出来高トレンド (当日 vs 平均)
  if (stock.volume && stock.avgVolume && stock.avgVolume > 0) {
    const ratio = stock.volume / stock.avgVolume;
    if (ratio > 2.0) score += 15;
    else if (ratio > 1.5) score += 8;
    else if (ratio > 1.0) score += 3;
    else if (ratio < 0.5) score -= 10;
  }

  // 52週レンジでの位置 (モメンタム)
  if (stock.high52w && stock.low52w && stock.price) {
    const range = stock.high52w - stock.low52w;
    if (range > 0) {
      const pos = (stock.price - stock.low52w) / range;
      // 中間より上にいるとモメンタム良好
      if (pos > 0.7) score += 10;
      else if (pos > 0.5) score += 5;
      else if (pos < 0.2) score += 8; // 底値からの反発期待
    }
  }

  // 当日変化率
  if (stock.changeRate != null) {
    if (stock.changeRate > 3) score += 10;
    else if (stock.changeRate > 1) score += 5;
    else if (stock.changeRate < -3) score -= 10;
    else if (stock.changeRate < -1) score -= 5;
  }

  // ベータ (低ベータは安定、高ベータはリスク)
  if (stock.beta != null) {
    if (stock.beta < 0.8) score += 8;
    else if (stock.beta < 1.2) score += 3;
    else if (stock.beta > 1.8) score -= 10;
  }

  return clamp(score);
}

/** ニュース感情スコア (0-100) */
export function calcSentimentScore(
  news: NewsInput,
  disclosures: DisclosureInput
): number {
  let score = 50;
  let totalWeight = 0;
  let weightedSentiment = 0;

  const allItems = [
    ...news.map((n) => ({ sentiment: n.sentiment, weight: n.importance || 3 })),
    ...disclosures.map((d) => ({
      sentiment: d.sentiment,
      weight: (d.importance || 5) * 1.5, // Disclosures weigh more
    })),
  ];

  for (const item of allItems) {
    const w = item.weight;
    totalWeight += w;
    if (item.sentiment === "POSITIVE") weightedSentiment += w;
    else if (item.sentiment === "NEGATIVE") weightedSentiment -= w;
  }

  if (totalWeight > 0) {
    const ratio = weightedSentiment / totalWeight; // -1 to +1
    score = Math.round(50 + ratio * 40);
  }

  // 重要開示ボーナス
  const hasPositiveDisclosure = disclosures.some(
    (d) => d.sentiment === "POSITIVE" && (d.importance || 0) >= 8
  );
  const hasNegativeDisclosure = disclosures.some(
    (d) => d.sentiment === "NEGATIVE" && (d.importance || 0) >= 8
  );
  if (hasPositiveDisclosure) score += 10;
  if (hasNegativeDisclosure) score -= 10;

  return clamp(score);
}

/** 統合スコア計算 */
export function calcOverallScore(params: {
  currentFin: FinancialInput;
  prevFin: FinancialPrev;
  stock: StockInput;
  news: NewsInput;
  disclosures: DisclosureInput;
}): ScoreDimension {
  const growth = calcGrowthScore(params.currentFin, params.prevFin);
  const valuation = calcValuationScore(params.stock);
  const profitability = calcProfitabilityScore(params.stock, params.currentFin);
  const capitalFlow = calcCapitalFlowScore(params.stock);
  const sentiment = calcSentimentScore(params.news, params.disclosures);

  // 加重平均 (各20%)
  const total = Math.round(
    growth * 0.2 +
    valuation * 0.2 +
    profitability * 0.2 +
    capitalFlow * 0.2 +
    sentiment * 0.2
  );

  const stars =
    total >= 85 ? 5
    : total >= 70 ? 4
    : total >= 55 ? 3
    : total >= 40 ? 2
    : 1;

  const grade =
    total >= 80 ? "STRONG_BUY"
    : total >= 65 ? "BUY"
    : total >= 50 ? "WATCH"
    : total >= 35 ? "AVOID"
    : "STRONG_AVOID";

  const recommendation =
    grade === "STRONG_BUY" || grade === "BUY" ? "BUY"
    : grade === "WATCH" ? "WATCH"
    : "AVOID";

  return { growth, valuation, profitability, capitalFlow, sentiment, total, stars, grade, recommendation };
}

export function starsToString(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(5 - stars);
}

export function calcTargetPrice(
  price: number,
  score: ScoreDimension,
  per?: number | null,
  eps?: number | null
): number | null {
  // Method 1: PER-based
  if (per && eps && eps > 0) {
    const targetPER =
      score.grade === "STRONG_BUY" ? per * 1.25
      : score.grade === "BUY" ? per * 1.15
      : score.grade === "WATCH" ? per * 1.0
      : per * 0.9;
    const target = Math.round((targetPER * eps) / 100) * 100;
    if (target > 0) return target;
  }

  // Method 2: Price momentum
  const multiplier =
    score.grade === "STRONG_BUY" ? 1.25
    : score.grade === "BUY" ? 1.15
    : score.grade === "WATCH" ? 1.02
    : 0.92;

  return Math.round((price * multiplier) / 100) * 100;
}
