/**
 * AI Score V2 – pure calculation, no external API calls
 * All scoring based on real J-Quants data in the DB
 *
 * Score ranges:
 *   90-100 = STRONG_BUY  ★★★★★
 *   70-89  = BUY         ★★★★☆
 *   60-69  = WATCH       ★★★☆☆
 *   45-59  = HOLD        ★★☆☆☆
 *   0-44   = AVOID       ★☆☆☆☆
 *
 * Design intent:
 *   - TOP stocks with strong fundamentals + technicals → 80-95
 *   - Strong technicals, no financial data → 65-77 (neutral fundamental score)
 *   - Average stocks → 50-65
 *   - Fundamentally absent scores use neutral (12/25 per sub-score), NOT 0
 */

export type ScoreInput = {
  symbol: string;
  name: string;
  latestClose: number;
  latestDate: string;
  // Technical indicators
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  maTrend: string;
  macdSignalLabel: string;
  // Fundamental (most recent annual report)
  revenue: number | null;
  operatingProfit: number | null;
  netProfit: number | null;
  totalAssets: number | null;
  equity: number | null;
  eps: number | null;
  equityRatio: number | null;   // EqAR (0-1)
  financialCount: number;
  // Dividend
  divAnn: number | null;
  divYieldRate: number | null;
  // News sentiment (0-100, optional — neutral=50 when absent)
  newsScore?: number | null;
  positiveNewsCount?: number;
  negativeNewsCount?: number;
};

export type AiScoreResult = {
  symbol: string;
  name: string;
  latestClose: number;
  latestDate: string;
  technicalScore: number;
  fundamentalScore: number;
  riskScore: number;
  totalScore: number;
  stars: number;
  recommendation: "STRONG_BUY" | "BUY" | "WATCH" | "HOLD" | "AVOID";
  starsLabel: string;
  technicalReasons: string[];
  fundamentalReasons: string[];
  riskReasons: string[];
  summaryReason: string;
  // Sub-scores
  detail: {
    maTrendScore: number;
    macdScore: number;
    rsiScore: number;
    return20dScore: number;
    return60dScore: number;
    opMarginScore: number;
    roeScore: number;
    epsScore: number;
    equityRatioScore: number;
    volatilityScore: number;
    rsiSafetyScore: number;
    recentMoveScore: number;
    dataCompletenessScore: number;
  };
};

// ── Technical Score (0-100) ───────────────────────────────────────────────

function maTrendScore(trend: string): { score: number; reason: string } {
  const map: Record<string, { score: number; reason: string }> = {
    GOLDEN:  { score: 25, reason: "MA5 > MA20 > MA60 黄金叉：強気トレンド確立" },
    BULLISH: { score: 18, reason: "MA5 > MA20：短期上昇トレンド中" },
    NEUTRAL: { score: 12, reason: "移動平均線が収束：方向感なし" },
    BEARISH: { score: 6,  reason: "MA5 < MA20：短期下降トレンド中" },
    DEAD:    { score: 0,  reason: "MA5 < MA20 < MA60 死亡叉：下降圧力強い" },
  };
  return map[trend] ?? { score: 12, reason: "MAトレンド不明" };
}

function macdScore(label: string, hist: number | null): { score: number; reason: string } {
  if (label === "BUY")  return { score: 20, reason: "MACD > Signal：上昇シグナル点灯" };
  if (label === "SELL") return { score: 4,  reason: "MACD < Signal：下落シグナル点灯" };
  const absHist = hist !== null ? Math.abs(hist) : 0;
  if (absHist < 1) return { score: 13, reason: "MACD中立：シグナル線近傍で推移" };
  return { score: 10, reason: "MACD：明確なシグナルなし" };
}

function rsiScore(rsi: number | null): { score: number; reason: string } {
  if (rsi === null) return { score: 12, reason: "RSIデータなし" };
  if (rsi >= 80) return { score: 5,  reason: `RSI ${rsi.toFixed(0)}：過買い圏（反落リスク大）` };
  if (rsi >= 70) return { score: 12, reason: `RSI ${rsi.toFixed(0)}：強気圏（追高に注意）` };
  if (rsi >= 60) return { score: 22, reason: `RSI ${rsi.toFixed(0)}：強気圏、短期的には堅調` };
  if (rsi >= 40) return { score: 25, reason: `RSI ${rsi.toFixed(0)}：中立ゾーン（健全な水準）` };
  if (rsi >= 30) return { score: 18, reason: `RSI ${rsi.toFixed(0)}：弱気圏、反発余地あり` };
  if (rsi >= 20) return { score: 8,  reason: `RSI ${rsi.toFixed(0)}：過売り圏（反発に注意）` };
  return { score: 3, reason: `RSI ${rsi.toFixed(0)}：極端な過売り（底打ち期待も判断難）` };
}

function return20dScore(r: number | null): { score: number; reason: string } {
  if (r === null) return { score: 7, reason: "20日騰落データなし" };
  if (r > 15)  return { score: 15, reason: `20日 +${r.toFixed(1)}%：強い上昇モメンタム` };
  if (r > 8)   return { score: 13, reason: `20日 +${r.toFixed(1)}%：上昇トレンド維持` };
  if (r > 2)   return { score: 10, reason: `20日 +${r.toFixed(1)}%：緩やかな上昇` };
  if (r > -3)  return { score: 7,  reason: `20日 ${r.toFixed(1)}%：ほぼ横ばい` };
  if (r > -8)  return { score: 4,  reason: `20日 ${r.toFixed(1)}%：下落傾向` };
  return { score: 0, reason: `20日 ${r.toFixed(1)}%：下落圧力強い` };
}

function return60dScore(r: number | null): { score: number; reason: string } {
  if (r === null) return { score: 7, reason: "60日騰落データなし" };
  if (r > 30)  return { score: 15, reason: `60日 +${r.toFixed(1)}%：強烈な上昇トレンド` };
  if (r > 15)  return { score: 13, reason: `60日 +${r.toFixed(1)}%：中期上昇トレンド強い` };
  if (r > 5)   return { score: 10, reason: `60日 +${r.toFixed(1)}%：中期では上昇継続` };
  if (r > -5)  return { score: 7,  reason: `60日 ${r.toFixed(1)}%：中期的に横ばい` };
  if (r > -15) return { score: 4,  reason: `60日 ${r.toFixed(1)}%：中期下落トレンド` };
  return { score: 0, reason: `60日 ${r.toFixed(1)}%：深い下落、慎重な判断必要` };
}

// ── Fundamental Score (0-100) ─────────────────────────────────────────────
// Missing data → neutral score (12/25), not 0. Prevents tech-only stocks from being
// unfairly punished when J-Quants hasn't yet provided financial data.

function opMarginScore(
  revenue: number | null, operatingProfit: number | null
): { score: number; reason: string } {
  if (revenue === null || operatingProfit === null) {
    return { score: 12, reason: "営業利益率データなし（中立スコア適用）" };
  }
  if (revenue === 0) return { score: 5, reason: "売上高ゼロ（評価不可）" };
  const margin = (operatingProfit / revenue) * 100;
  if (margin > 30) return { score: 25, reason: `営業利益率 ${margin.toFixed(1)}%：非常に高い収益性` };
  if (margin > 20) return { score: 22, reason: `営業利益率 ${margin.toFixed(1)}%：高い収益性` };
  if (margin > 15) return { score: 18, reason: `営業利益率 ${margin.toFixed(1)}%：良好な収益性` };
  if (margin > 10) return { score: 13, reason: `営業利益率 ${margin.toFixed(1)}%：平均的な収益性` };
  if (margin > 5)  return { score: 8,  reason: `営業利益率 ${margin.toFixed(1)}%：低め` };
  if (margin > 0)  return { score: 4,  reason: `営業利益率 ${margin.toFixed(1)}%：薄利` };
  return { score: 0, reason: `営業利益率 ${margin.toFixed(1)}%：赤字` };
}

function roeScore(
  netProfit: number | null, equity: number | null
): { score: number; reason: string } {
  if (netProfit === null || equity === null || equity === 0) {
    return { score: 12, reason: "ROEデータなし（中立スコア適用）" };
  }
  const roe = (netProfit / equity) * 100;
  if (roe > 25) return { score: 25, reason: `ROE ${roe.toFixed(1)}%：卓越した資本効率` };
  if (roe > 18) return { score: 22, reason: `ROE ${roe.toFixed(1)}%：高い資本効率` };
  if (roe > 12) return { score: 18, reason: `ROE ${roe.toFixed(1)}%：良好な資本効率` };
  if (roe > 8)  return { score: 13, reason: `ROE ${roe.toFixed(1)}%：平均的な水準` };
  if (roe > 3)  return { score: 7,  reason: `ROE ${roe.toFixed(1)}%：低い資本効率` };
  if (roe > 0)  return { score: 3,  reason: `ROE ${roe.toFixed(1)}%：非常に低い` };
  return { score: 0, reason: `ROE ${roe.toFixed(1)}%：自己資本毀損` };
}

function epsScore(eps: number | null, price: number): { score: number; reason: string } {
  if (eps === null) return { score: 12, reason: "EPSデータなし（中立スコア適用）" };
  if (eps < 0) return { score: 0, reason: `EPS ¥${eps.toFixed(0)}：赤字` };
  if (eps === 0) return { score: 5, reason: "EPS ゼロ（収益なし）" };
  const impliedPE = price / eps;
  if (eps > 500)  return { score: 25, reason: `EPS ¥${eps.toFixed(0)}：高い1株利益` };
  if (eps > 200)  return { score: 22, reason: `EPS ¥${eps.toFixed(0)}：良好な1株利益` };
  if (eps > 100)  return { score: 18, reason: `EPS ¥${eps.toFixed(0)}：1株利益良好` };
  if (eps > 50)   return { score: 14, reason: `EPS ¥${eps.toFixed(0)}：平均的な1株利益` };
  if (impliedPE < 15) return { score: 18, reason: `EPS ¥${eps.toFixed(2)}（PER${impliedPE.toFixed(0)}倍：割安感あり）` };
  if (eps > 10)   return { score: 10, reason: `EPS ¥${eps.toFixed(0)}：低めの1株利益` };
  return { score: 7, reason: `EPS ¥${eps.toFixed(2)}：プラスを確認` };
}

function equityRatioScore(eqAR: number | null): { score: number; reason: string } {
  if (eqAR === null) return { score: 12, reason: "自己資本比率データなし（中立スコア適用）" };
  const pct = eqAR * 100;
  if (pct > 60) return { score: 25, reason: `自己資本比率 ${pct.toFixed(1)}%：財務的に非常に安定` };
  if (pct > 50) return { score: 22, reason: `自己資本比率 ${pct.toFixed(1)}%：財務安定` };
  if (pct > 40) return { score: 18, reason: `自己資本比率 ${pct.toFixed(1)}%：良好` };
  if (pct > 30) return { score: 13, reason: `自己資本比率 ${pct.toFixed(1)}%：普通` };
  if (pct > 20) return { score: 8,  reason: `自己資本比率 ${pct.toFixed(1)}%：やや低い` };
  if (pct > 10) return { score: 4,  reason: `自己資本比率 ${pct.toFixed(1)}%：低め` };
  return { score: 1, reason: `自己資本比率 ${pct.toFixed(1)}%：レバレッジ高め` };
}

// ── Risk Score (0-100) – higher = safer ───────────────────────────────────

function volatilityScore(r60: number | null): { score: number; reason: string } {
  if (r60 === null) return { score: 20, reason: "60日変動データなし（標準スコア適用）" };
  const abs = Math.abs(r60);
  if (abs < 5)  return { score: 30, reason: `60日変動幅 ${abs.toFixed(1)}%：非常に安定` };
  if (abs < 10) return { score: 25, reason: `60日変動幅 ${abs.toFixed(1)}%：安定的` };
  if (abs < 20) return { score: 18, reason: `60日変動幅 ${abs.toFixed(1)}%：適度な変動` };
  if (abs < 30) return { score: 10, reason: `60日変動幅 ${abs.toFixed(1)}%：やや変動大` };
  if (abs < 50) return { score: 5,  reason: `60日変動幅 ${abs.toFixed(1)}%：変動大、リスク注意` };
  return { score: 1, reason: `60日変動幅 ${abs.toFixed(1)}%：非常に高リスク` };
}

function rsiSafetyScore(rsi: number | null): { score: number; reason: string } {
  if (rsi === null) return { score: 15, reason: "RSIデータなし" };
  if (rsi >= 80) return { score: 3,  reason: `RSI ${rsi.toFixed(0)}：過買い圏（高リスク）` };
  if (rsi >= 70) return { score: 10, reason: `RSI ${rsi.toFixed(0)}：過買い域に接近` };
  if (rsi >= 60) return { score: 20, reason: `RSI ${rsi.toFixed(0)}：強気圏（適度）` };
  if (rsi >= 40) return { score: 25, reason: `RSI ${rsi.toFixed(0)}：中立ゾーン（安全）` };
  if (rsi >= 30) return { score: 18, reason: `RSI ${rsi.toFixed(0)}：弱気圏（反発余地）` };
  if (rsi >= 20) return { score: 8,  reason: `RSI ${rsi.toFixed(0)}：過売り域` };
  return { score: 3, reason: `RSI ${rsi.toFixed(0)}：極端な過売り` };
}

function recentMoveScore(r5: number | null, r20: number | null): { score: number; reason: string } {
  const abs5 = r5 !== null ? Math.abs(r5) : 0;
  const abs20 = r20 !== null ? Math.abs(r20) : 0;
  const maxAbs = Math.max(abs5, abs20);
  if (maxAbs < 3)   return { score: 25, reason: "直近の値動きは穏やか（安全）" };
  if (maxAbs < 6)   return { score: 20, reason: "直近の値動きは標準的" };
  if (maxAbs < 10)  return { score: 14, reason: "直近にやや大きな値動きあり" };
  if (maxAbs < 15)  return { score: 8,  reason: "直近に大きな値動きあり（追高注意）" };
  return { score: 3, reason: "直近に急騰/急落あり（ポジション管理に注意）" };
}

function dataCompletenessScore(
  revenue: number | null,
  operatingProfit: number | null,
  netProfit: number | null,
  equity: number | null,
  eps: number | null,
  finCount: number
): { score: number; reason: string } {
  const present = [revenue, operatingProfit, netProfit, equity, eps].filter((v) => v !== null).length;
  if (present === 5 && finCount >= 4) return { score: 20, reason: "財務データ完備・信頼性高い" };
  if (present >= 4)  return { score: 16, reason: "財務データほぼ揃っている" };
  if (present >= 3)  return { score: 11, reason: "一部財務データあり" };
  if (present >= 1)  return { score: 6,  reason: "財務データが限定的（分析精度に影響）" };
  return { score: 10, reason: "財務データなし（技術面のみで評価）" };
}

// ── Summary Reason Generator ──────────────────────────────────────────────

function buildSummary(
  rec: string,
  tech: number,
  fund: number,
  risk: number,
  topTech: string,
  topFund: string,
  topRisk: string,
  positiveNewsCount = 0,
  negativeNewsCount = 0
): string {
  const recLabel: Record<string, string> = {
    STRONG_BUY: "強く買い推奨",
    BUY: "買い推奨",
    WATCH: "要注目",
    HOLD: "中立・様子見",
    AVOID: "回避推奨",
  };
  const base = `${recLabel[rec] ?? rec}：技術面${tech}点・基本面${fund}点・リスク${risk}点。${topTech}。${topFund}。${topRisk}。`;

  const newsPoints: string[] = [];
  if (positiveNewsCount >= 2) newsPoints.push("✓ 新闻情绪积极");
  if (negativeNewsCount === 0 && positiveNewsCount > 0) newsPoints.push("✓ 最近无重大利空");
  if (negativeNewsCount >= 3) newsPoints.push("⚠ 近期多条利空新闻");

  return newsPoints.length > 0 ? `${base} ${newsPoints.join(" ")}` : base;
}

// ── Main Scoring Entry Point ──────────────────────────────────────────────

export function calcAiScore(input: ScoreInput): AiScoreResult {
  // Technical (max 100)
  const maT   = maTrendScore(input.maTrend);
  const macdT = macdScore(input.macdSignalLabel, input.macdHist);
  const rsiT  = rsiScore(input.rsi14);
  const r20T  = return20dScore(input.return20d);
  const r60T  = return60dScore(input.return60d);

  const technicalScore = Math.min(100, Math.round(
    maT.score + macdT.score + rsiT.score + r20T.score + r60T.score
  ));

  // Fundamental (max 100, neutral 48 when data absent)
  const opMT = opMarginScore(input.revenue, input.operatingProfit);
  const roeT = roeScore(input.netProfit, input.equity);
  const epsT = epsScore(input.eps, input.latestClose);
  const eqRT = equityRatioScore(input.equityRatio);

  const fundamentalScore = Math.min(100, Math.round(
    opMT.score + roeT.score + epsT.score + eqRT.score
  ));

  // Risk / Safety (max 100)
  const volT  = volatilityScore(input.return60d);
  const rsiST = rsiSafetyScore(input.rsi14);
  const movT  = recentMoveScore(input.return5d, input.return20d);
  const dataT = dataCompletenessScore(
    input.revenue, input.operatingProfit, input.netProfit,
    input.equity, input.eps, input.financialCount
  );

  const riskScore = Math.min(100, Math.round(
    volT.score + rsiST.score + movT.score + dataT.score
  ));

  // News adjustment: ±5 points max based on sentiment (neutral=50 → no adjustment)
  const ns = input.newsScore ?? 50;
  const newsAdjustment = Math.round((ns - 50) * 0.1);

  // Weighted total: tech 40% + fund 40% + risk 20% + news adjustment
  const totalScore = Math.min(
    100,
    Math.max(0, Math.round(technicalScore * 0.4 + fundamentalScore * 0.4 + riskScore * 0.2 + newsAdjustment))
  );

  // Recommendation
  let recommendation: AiScoreResult["recommendation"];
  let stars: number;
  if (totalScore >= 90)      { recommendation = "STRONG_BUY"; stars = 5; }
  else if (totalScore >= 70) { recommendation = "BUY";        stars = 4; }
  else if (totalScore >= 60) { recommendation = "WATCH";      stars = 3; }
  else if (totalScore >= 45) { recommendation = "HOLD";       stars = 2; }
  else                       { recommendation = "AVOID";      stars = 1; }

  const starsLabel = "★".repeat(stars) + "☆".repeat(5 - stars);

  const technicalReasons   = [maT.reason, macdT.reason, rsiT.reason, r20T.reason, r60T.reason];
  const fundamentalReasons = [opMT.reason, roeT.reason, epsT.reason, eqRT.reason];
  const riskReasons        = [volT.reason, rsiST.reason, movT.reason, dataT.reason];

  const topTech = maT.score >= 18 ? maT.reason : r20T.reason;
  const topFund = Math.max(opMT.score, roeT.score) === opMT.score ? opMT.reason : roeT.reason;
  const topRisk = volT.reason;

  const summaryReason = buildSummary(
    recommendation, technicalScore, fundamentalScore, riskScore,
    topTech, topFund, topRisk,
    input.positiveNewsCount ?? 0,
    input.negativeNewsCount ?? 0
  );

  return {
    symbol: input.symbol,
    name: input.name,
    latestClose: input.latestClose,
    latestDate: input.latestDate,
    technicalScore,
    fundamentalScore,
    riskScore,
    totalScore,
    stars,
    recommendation,
    starsLabel,
    technicalReasons,
    fundamentalReasons,
    riskReasons,
    summaryReason,
    detail: {
      maTrendScore: maT.score,
      macdScore: macdT.score,
      rsiScore: rsiT.score,
      return20dScore: r20T.score,
      return60dScore: r60T.score,
      opMarginScore: opMT.score,
      roeScore: roeT.score,
      epsScore: epsT.score,
      equityRatioScore: eqRT.score,
      volatilityScore: volT.score,
      rsiSafetyScore: rsiST.score,
      recentMoveScore: movT.score,
      dataCompletenessScore: dataT.score,
    },
  };
}

export type { AiScoreResult as AIScoreResult };
