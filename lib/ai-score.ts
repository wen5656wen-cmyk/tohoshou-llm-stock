/**
 * TOHOSHOU AI SCORE V2 — 100-point 5-dimension system
 *
 * Dimensions:
 *   技術面     30点  (technicalScore)
 *   基本面     25点  (fundamentalScore)
 *   資金面     20点  (moneyFlowScore)   — proxy until InstitutionalFlow data available
 *   新闻情绪   15点  (newsSentimentScore)
 *   全球趋势   10点  (globalTrendScore)
 *
 * Rating:
 *   90-100 = STRONG_BUY  ★★★★★
 *   80-89  = BUY         ★★★★☆
 *   65-79  = HOLD        ★★★☆☆
 *   50-64  = WATCH       ★★☆☆☆
 *   0-49   = AVOID       ★☆☆☆☆
 */

// V3: real global market snapshot (from GlobalMarket table)
export type GlobalMarketData = {
  nasdaqChange: number | null;
  vixLevel: number | null;     // VIX spot level
  usdJpy: number | null;
  nikkeiChange: number | null;
  topixChange: number | null;
  score: number | null;        // pre-computed 0-10 (used directly if present)
};

// V3: real institutional flow (from InstitutionalFlow table, ALL market, latest week)
export type InstitutionalFlowData = {
  foreignersNet: number | null;  // 億円
  trustNet: number | null;       // 億円
  source: string;               // "jpx" | "synthetic"
};

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
  equityRatio: number | null;  // 0-1
  financialCount: number;
  // Dividend
  divAnn: number | null;
  divYieldRate: number | null;
  // News sentiment (optional)
  newsScore?: number | null;
  positiveNewsCount?: number;
  negativeNewsCount?: number;
  totalNewsCount?: number;
  // V3: real market data (optional — fallback to V2 proxy when absent)
  globalMarketData?: GlobalMarketData | null;
  institutionalFlowData?: InstitutionalFlowData | null;
  // Legacy: direct globalTrendScore override (still accepted)
  globalTrendScore?: number | null;
};

export type AiScoreResult = {
  symbol: string;
  name: string;
  latestClose: number;
  latestDate: string;
  // V2 dimension scores
  technicalScore: number;     // 0-30
  fundamentalScore: number;   // 0-25
  moneyFlowScore: number;     // 0-20
  newsSentimentScore: number; // 0-15
  globalTrendScore: number;   // 0-10
  // Legacy compat
  riskScore: number;
  totalScore: number;         // 0-100
  stars: number;
  recommendation: "STRONG_BUY" | "BUY" | "HOLD" | "WATCH" | "AVOID";
  starsLabel: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  // V3: data source transparency
  moneyFlowSource: string;     // "jpx" | "synthetic" | "v2_proxy"
  globalTrendSource: string;   // "yahoo" | "v2_default"
  // Analysis
  technicalReasons: string[];
  fundamentalReasons: string[];
  moneyFlowReasons: string[];
  summaryReason: string;
  newsSummary: string;
  // Sub-score detail (for bar charts)
  detail: {
    // Technical (max 30)
    maTrendScore: number;   // 0-12
    macdScore: number;      // 0-8
    rsiScore: number;       // 0-6
    momentumScore: number;  // 0-4
    // Fundamental (max 25)
    opMarginScore: number;  // 0-8
    roeScore: number;       // 0-7
    epsScore: number;       // 0-5
    equityRatioScore: number; // 0-5
    // Money Flow (max 20)
    inflowScore: number;    // 0-8
    stabilityScore: number; // 0-7
    shortPressureScore: number; // 0-5
    // Legacy
    return20dScore: number;
    return60dScore: number;
    volatilityScore: number;
    rsiSafetyScore: number;
    recentMoveScore: number;
    dataCompletenessScore: number;
  };
};

// ── 技術面 (0-30) ─────────────────────────────────────────────────────────

function calcMaTrend(trend: string): { score: number; reason: string } {
  const map: Record<string, { score: number; reason: string }> = {
    GOLDEN:  { score: 12, reason: "MA5>MA20>MA60 黄金叉：多头趋势全面确立" },
    BULLISH: { score: 9,  reason: "MA5>MA20：短期上涨趋势延续" },
    NEUTRAL: { score: 5,  reason: "均线收敛：方向未明，横盘整理" },
    BEARISH: { score: 2,  reason: "MA5<MA20：短期走弱，注意风险" },
    DEAD:    { score: 0,  reason: "MA5<MA20<MA60 死亡叉：空头压力沉重" },
  };
  return map[trend] ?? { score: 5, reason: "均线趋势未知" };
}

function calcMacd(label: string, hist: number | null): { score: number; reason: string } {
  if (label === "BUY")  return { score: 8, reason: "MACD>Signal：买入信号确立，上涨动能增强" };
  if (label === "SELL") return { score: 1, reason: "MACD<Signal：卖出信号，下行压力存在" };
  const absHist = hist !== null ? Math.abs(hist) : 0;
  if (absHist < 0.5) return { score: 5, reason: "MACD接近零轴，方向性不明" };
  return { score: 3, reason: "MACD无明确信号" };
}

function calcRsi(rsi: number | null): { score: number; reason: string } {
  if (rsi === null) return { score: 3, reason: "RSI数据缺失（中性处理）" };
  if (rsi >= 80) return { score: 1, reason: `RSI ${rsi.toFixed(0)}：严重超买，回调风险高` };
  if (rsi >= 70) return { score: 2, reason: `RSI ${rsi.toFixed(0)}：超买区域，追高须谨慎` };
  if (rsi >= 60) return { score: 5, reason: `RSI ${rsi.toFixed(0)}：强势区，动能良好` };
  if (rsi >= 40) return { score: 6, reason: `RSI ${rsi.toFixed(0)}：中性健康区间` };
  if (rsi >= 30) return { score: 4, reason: `RSI ${rsi.toFixed(0)}：弱势区，存在反弹空间` };
  if (rsi >= 20) return { score: 2, reason: `RSI ${rsi.toFixed(0)}：超卖区，短期反弹可能` };
  return { score: 1, reason: `RSI ${rsi.toFixed(0)}：极度超卖` };
}

function calcMomentum(r20: number | null): { score: number; reason: string } {
  if (r20 === null) return { score: 2, reason: "20日涨跌数据缺失" };
  if (r20 > 15) return { score: 4, reason: `20日 +${r20.toFixed(1)}%：强劲上涨动能` };
  if (r20 > 8)  return { score: 3, reason: `20日 +${r20.toFixed(1)}%：上涨趋势稳定` };
  if (r20 > 2)  return { score: 2, reason: `20日 +${r20.toFixed(1)}%：温和上涨` };
  if (r20 > -3) return { score: 1, reason: `20日 ${r20.toFixed(1)}%：基本横盘` };
  return { score: 0, reason: `20日 ${r20.toFixed(1)}%：下跌压力存在` };
}

// ── 基本面 (0-25) ─────────────────────────────────────────────────────────

function calcOpMargin(rev: number | null, op: number | null): { score: number; reason: string } {
  if (rev === null || op === null) return { score: 4, reason: "营业利润率数据缺失（中性处理）" };
  if (rev === 0) return { score: 2, reason: "营收为零，无法评估" };
  const m = (op / rev) * 100;
  if (m > 30) return { score: 8, reason: `营业利润率 ${m.toFixed(1)}%：卓越盈利能力` };
  if (m > 20) return { score: 7, reason: `营业利润率 ${m.toFixed(1)}%：优秀盈利能力` };
  if (m > 15) return { score: 6, reason: `营业利润率 ${m.toFixed(1)}%：良好盈利能力` };
  if (m > 10) return { score: 4, reason: `营业利润率 ${m.toFixed(1)}%：平均水平` };
  if (m > 5)  return { score: 2, reason: `营业利润率 ${m.toFixed(1)}%：偏低` };
  if (m > 0)  return { score: 1, reason: `营业利润率 ${m.toFixed(1)}%：薄利` };
  return { score: 0, reason: `营业利润率 ${m.toFixed(1)}%：亏损状态` };
}

function calcRoe(netProfit: number | null, equity: number | null): { score: number; reason: string } {
  if (netProfit === null || equity === null || equity === 0) {
    return { score: 3, reason: "ROE数据缺失（中性处理）" };
  }
  const roe = (netProfit / equity) * 100;
  if (roe > 25) return { score: 7, reason: `ROE ${roe.toFixed(1)}%：资本效率卓越` };
  if (roe > 18) return { score: 6, reason: `ROE ${roe.toFixed(1)}%：资本效率优秀` };
  if (roe > 12) return { score: 5, reason: `ROE ${roe.toFixed(1)}%：资本效率良好` };
  if (roe > 8)  return { score: 3, reason: `ROE ${roe.toFixed(1)}%：资本效率一般` };
  if (roe > 3)  return { score: 1, reason: `ROE ${roe.toFixed(1)}%：资本效率偏低` };
  if (roe > 0)  return { score: 0, reason: `ROE ${roe.toFixed(1)}%：极低回报` };
  return { score: 0, reason: `ROE ${roe.toFixed(1)}%：净资产亏损` };
}

function calcEps(eps: number | null, price: number): { score: number; reason: string } {
  if (eps === null) return { score: 2, reason: "EPS数据缺失（中性处理）" };
  if (eps < 0) return { score: 0, reason: `EPS ¥${eps.toFixed(0)}：亏损状态` };
  if (eps === 0) return { score: 1, reason: "EPS为零，基本无盈利" };
  const per = price / eps;
  if (eps > 500)  return { score: 5, reason: `EPS ¥${eps.toFixed(0)}：高盈利能力` };
  if (eps > 200)  return { score: 5, reason: `EPS ¥${eps.toFixed(0)}：盈利能力强劲` };
  if (eps > 100)  return { score: 4, reason: `EPS ¥${eps.toFixed(0)}：良好盈利` };
  if (per < 12)   return { score: 5, reason: `EPS ¥${eps.toFixed(0)}（PER${per.toFixed(0)}倍：估值偏低）` };
  if (per < 20)   return { score: 3, reason: `EPS ¥${eps.toFixed(0)}（PER${per.toFixed(0)}倍：估值合理）` };
  if (eps > 50)   return { score: 3, reason: `EPS ¥${eps.toFixed(0)}：每股盈利可接受` };
  return { score: 2, reason: `EPS ¥${eps.toFixed(2)}：每股盈利偏低` };
}

function calcEquityRatio(eq: number | null): { score: number; reason: string } {
  if (eq === null) return { score: 2, reason: "自有资本比率数据缺失（中性处理）" };
  const pct = eq * 100;
  if (pct > 60) return { score: 5, reason: `自有资本比率 ${pct.toFixed(1)}%：财务极为稳健` };
  if (pct > 50) return { score: 4, reason: `自有资本比率 ${pct.toFixed(1)}%：财务稳定` };
  if (pct > 40) return { score: 3, reason: `自有资本比率 ${pct.toFixed(1)}%：财务良好` };
  if (pct > 30) return { score: 2, reason: `自有资本比率 ${pct.toFixed(1)}%：财务一般` };
  if (pct > 20) return { score: 1, reason: `自有资本比率 ${pct.toFixed(1)}%：财务偏弱` };
  return { score: 0, reason: `自有资本比率 ${pct.toFixed(1)}%：杠杆较高，财务风险偏大` };
}

// ── 資金面 (0-20) ─────────────────────────────────────────────────────────

// V3 path: real institutional flow from JPX (foreigners + trust fund net weekly amount)
function calcRealInflow(flow: InstitutionalFlowData): { score: number; reason: string } {
  const foreignNet = flow.foreignersNet ?? 0;
  const trustNet   = flow.trustNet ?? 0;
  // Foreigners dominate (~70% weight), trust funds supplement
  const combined = foreignNet + trustNet * 0.5;
  const isSynthetic = flow.source === "synthetic";

  if (isSynthetic) return { score: 4, reason: "机构资金面：中性（待接入JPX实时数据）" };
  if (combined > 1000)  return { score: 8, reason: `外资+投信净买入 ${combined.toFixed(0)}億円：强势机构资金流入` };
  if (combined > 300)   return { score: 7, reason: `外资+投信净买入 ${combined.toFixed(0)}億円：机构资金持续流入` };
  if (combined > 0)     return { score: 5, reason: `外资+投信净买入 ${combined.toFixed(0)}億円：机构小幅净买入` };
  if (combined > -300)  return { score: 3, reason: `外资+投信净卖出 ${(-combined).toFixed(0)}億円：机构小幅撤出` };
  if (combined > -1000) return { score: 2, reason: `外资+投信净卖出 ${(-combined).toFixed(0)}億円：机构资金外流` };
  return { score: 1, reason: `外资+投信净卖出 ${(-combined).toFixed(0)}億円：机构大幅撤退` };
}

// V2 fallback proxy: use 60-day return as inflow signal
function calcInflow(r60: number | null): { score: number; reason: string } {
  if (r60 === null) return { score: 4, reason: "60日趋势数据缺失（中性处理）" };
  if (r60 > 20) return { score: 8, reason: `60日 +${r60.toFixed(1)}%：强劲资金流入信号` };
  if (r60 > 10) return { score: 7, reason: `60日 +${r60.toFixed(1)}%：资金持续流入` };
  if (r60 > 5)  return { score: 6, reason: `60日 +${r60.toFixed(1)}%：温和资金流入` };
  if (r60 > 0)  return { score: 4, reason: `60日 +${r60.toFixed(1)}%：资金小幅流入` };
  if (r60 > -5) return { score: 2, reason: `60日 ${r60.toFixed(1)}%：资金轻微外流` };
  return { score: 1, reason: `60日 ${r60.toFixed(1)}%：资金持续外流，机构回避` };
}

function calcStability(trend: string, rsi: number | null): { score: number; reason: string } {
  const r = rsi ?? 50;
  if (trend === "GOLDEN" && r >= 50 && r <= 65) return { score: 7, reason: "多头趋势+RSI健康：机构持仓稳定" };
  if (trend === "GOLDEN" && r > 65)             return { score: 5, reason: "多头趋势但RSI偏高：追高风险存在" };
  if (trend === "GOLDEN")                        return { score: 6, reason: "多头趋势：整体资金流向正面" };
  if (trend === "BULLISH" && r >= 45 && r <= 65) return { score: 6, reason: "偏强趋势+RSI适中：资金入场" };
  if (trend === "BULLISH")                        return { score: 4, reason: "偏强趋势：资金温和关注" };
  if (trend === "NEUTRAL")                        return { score: 4, reason: "横盘整理：资金观望" };
  if (trend === "BEARISH")                        return { score: 2, reason: "偏弱趋势：资金撤退信号" };
  return { score: 1, reason: "空头趋势：资金持续流出" };
}

function calcShortPressure(r5: number | null): { score: number; reason: string } {
  if (r5 === null) return { score: 3, reason: "5日波动数据缺失" };
  const abs = Math.abs(r5);
  if (abs < 1) return { score: 5, reason: "近期价格极为稳定，空方压力极低" };
  if (abs < 2) return { score: 4, reason: "近期波动温和，空方压力可控" };
  if (abs < 4) return { score: 3, reason: "近期有一定波动，空方介入迹象" };
  if (abs < 7) return { score: 2, reason: "近期波动较大，注意空方压力" };
  return { score: 1, reason: "近期剧烈波动，可能存在空头攻击" };
}

// ── 新闻情绪 (0-15) ──────────────────────────────────────────────────────

function calcNewsSentiment(
  positiveCount = 0,
  negativeCount = 0,
  totalCount = 0
): { score: number; summary: string } {
  if (totalCount === 0) {
    return { score: 8, summary: "近30日无相关新闻，情绪中性" };
  }
  const ratio = (positiveCount - negativeCount) / totalCount;
  const score = Math.min(15, Math.max(0, Math.round(8 + ratio * 7)));

  let summary = "";
  if (score >= 13)       summary = `近30日${totalCount}条新闻，${positiveCount}条正面，情绪强烈积极`;
  else if (score >= 10)  summary = `近30日${totalCount}条新闻，正面居多（+${positiveCount}/-${negativeCount}），情绪偏正面`;
  else if (score >= 8)   summary = `近30日${totalCount}条新闻，情绪中性（+${positiveCount}/-${negativeCount}）`;
  else if (score >= 5)   summary = `近30日${totalCount}条新闻，负面偏多（+${positiveCount}/-${negativeCount}），情绪偏谨慎`;
  else                   summary = `近30日${totalCount}条新闻，${negativeCount}条负面为主，情绪明显偏空`;

  return { score, summary };
}

// ── 全球趋势 (0-10) ──────────────────────────────────────────────────────

// V3 path: real data from GlobalMarket table
function calcGlobalTrendReal(data: GlobalMarketData): { score: number; reason: string } {
  // Use pre-computed score if available
  if (data.score != null) {
    const n = data.nasdaqChange;
    const v = data.vixLevel;
    const u = data.usdJpy;
    const k = data.nikkeiChange;
    const note = [
      n != null ? `NASDAQ${n >= 0 ? "+" : ""}${n.toFixed(1)}%` : null,
      v != null ? `VIX ${v.toFixed(1)}` : null,
      u != null ? `USD/JPY ${u.toFixed(1)}` : null,
      k != null ? `日经${k >= 0 ? "+" : ""}${k.toFixed(1)}%` : null,
    ].filter(Boolean).join("；");
    return { score: data.score, reason: `全球趋势 ${data.score}/10（${note || "实时数据"}）` };
  }
  // Fallback within real data path
  return { score: 7, reason: "全球趋势：实时数据解析中（使用基准值）" };
}

// V2 fallback or legacy override
function calcGlobalTrend(override: number | null | undefined): { score: number; reason: string } {
  if (override != null) return { score: override, reason: `全球市场评分 ${override}/10（实时数据）` };
  return { score: 7, reason: "全球趋势：温和偏多（V2基准，待接入实时数据）" };
}

// ── Main Entry Point ──────────────────────────────────────────────────────

export function calcAiScore(input: ScoreInput): AiScoreResult {
  // Technical (0-30)
  const maT   = calcMaTrend(input.maTrend);
  const macdT = calcMacd(input.macdSignalLabel, input.macdHist);
  const rsiT  = calcRsi(input.rsi14);
  const momT  = calcMomentum(input.return20d);
  const technicalScore = Math.min(30, maT.score + macdT.score + rsiT.score + momT.score);

  // Fundamental (0-25)
  const opMT = calcOpMargin(input.revenue, input.operatingProfit);
  const roeT = calcRoe(input.netProfit, input.equity);
  const epsT = calcEps(input.eps, input.latestClose);
  const eqRT = calcEquityRatio(input.equityRatio);
  const fundamentalScore = Math.min(25, opMT.score + roeT.score + epsT.score + eqRT.score);

  // Money Flow (0-20) — V3: real InstitutionalFlow (jpx only) else V2 proxy
  const useRealFlow = input.institutionalFlowData?.source === "jpx";
  const inflowT = useRealFlow
    ? calcRealInflow(input.institutionalFlowData!)
    : calcInflow(input.return60d);
  const stabT  = calcStability(input.maTrend, input.rsi14);
  const shortT = calcShortPressure(input.return5d);
  const moneyFlowScore = Math.min(20, inflowT.score + stabT.score + shortT.score);
  const moneyFlowSource = useRealFlow ? "jpx" : "v2_proxy";

  // News Sentiment (0-15)
  const pos   = input.positiveNewsCount ?? 0;
  const neg   = input.negativeNewsCount ?? 0;
  const total = input.totalNewsCount ?? (pos + neg);
  const newsSent = calcNewsSentiment(pos, neg, total);
  const newsSentimentScore = newsSent.score;

  // Global Trend (0-10) — V3: real GlobalMarket if available, else V2 proxy
  const globalT = input.globalMarketData
    ? calcGlobalTrendReal(input.globalMarketData)
    : calcGlobalTrend(input.globalTrendScore);
  const globalTrendScore = globalT.score;
  const globalTrendSource = input.globalMarketData ? "yahoo" : "v2_default";

  // Total (0-100)
  const totalScore = Math.min(100, Math.max(0,
    technicalScore + fundamentalScore + moneyFlowScore + newsSentimentScore + globalTrendScore
  ));

  // Rating
  let recommendation: AiScoreResult["recommendation"];
  let stars: number;
  if (totalScore >= 90)      { recommendation = "STRONG_BUY"; stars = 5; }
  else if (totalScore >= 80) { recommendation = "BUY";        stars = 4; }
  else if (totalScore >= 65) { recommendation = "HOLD";       stars = 3; }
  else if (totalScore >= 50) { recommendation = "WATCH";      stars = 2; }
  else                       { recommendation = "AVOID";      stars = 1; }

  const starsLabel = "★".repeat(stars) + "☆".repeat(5 - stars);

  // Risk Level
  const rsiVal = input.rsi14 ?? 50;
  const absR60 = Math.abs(input.return60d ?? 0);
  const riskLevel: AiScoreResult["riskLevel"] =
    (rsiVal > 75 || absR60 > 30 || (input.return60d ?? 0) < -20) ? "HIGH" :
    (rsiVal > 65 || absR60 > 15) ? "MEDIUM" : "LOW";

  // Summary
  const recLabel: Record<string, string> = {
    STRONG_BUY: "强烈买入",
    BUY: "买入",
    HOLD: "持有观察",
    WATCH: "关注等待",
    AVOID: "回避",
  };
  const summaryReason = `${recLabel[recommendation] ?? recommendation}（${totalScore}分）：技术面${technicalScore}/30，基本面${fundamentalScore}/25，资金面${moneyFlowScore}/20[${moneyFlowSource}]，情绪${newsSentimentScore}/15，趋势${globalTrendScore}/10[${globalTrendSource}]。${maT.reason}。${opMT.reason}。`;

  return {
    symbol: input.symbol,
    name: input.name,
    latestClose: input.latestClose,
    latestDate: input.latestDate,
    technicalScore,
    fundamentalScore,
    moneyFlowScore,
    newsSentimentScore,
    globalTrendScore,
    riskScore: moneyFlowScore, // legacy compat
    totalScore,
    stars,
    recommendation,
    starsLabel,
    riskLevel,
    moneyFlowSource,
    globalTrendSource,
    technicalReasons: [maT.reason, macdT.reason, rsiT.reason, momT.reason],
    fundamentalReasons: [opMT.reason, roeT.reason, epsT.reason, eqRT.reason],
    moneyFlowReasons: [inflowT.reason, stabT.reason, shortT.reason],
    summaryReason,
    newsSummary: newsSent.summary,
    detail: {
      maTrendScore: maT.score,
      macdScore: macdT.score,
      rsiScore: rsiT.score,
      momentumScore: momT.score,
      opMarginScore: opMT.score,
      roeScore: roeT.score,
      epsScore: epsT.score,
      equityRatioScore: eqRT.score,
      inflowScore: inflowT.score,
      stabilityScore: stabT.score,
      shortPressureScore: shortT.score,
      // legacy keys (retained for backward compat)
      return20dScore: momT.score,
      return60dScore: inflowT.score,
      volatilityScore: shortT.score,
      rsiSafetyScore: rsiT.score,
      recentMoveScore: shortT.score,
      dataCompletenessScore: 0,
    },
  };
}

export type { AiScoreResult as AIScoreResult };
