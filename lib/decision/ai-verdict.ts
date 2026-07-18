// ── AI Verdict · 专业分析师式决策推导（P17-01）─────────────────────────────────
// 纯函数：输入 = /api/stocks/[symbol]/intelligence 已有字段；输出 = 结构化决策。
// 不改评分/权重/阈值/Runtime/Schema/API——只在既有数据上做「可解释」的推导与归纳。
// 所有文案以 i18n key 形式返回，组件用 t() 渲染（日本語 / 中文）。每条结论均可追溯到具体字段。

export type Stars = 1 | 2 | 3 | 4 | 5;

export interface AiVerdictInput {
  action: string;                 // 已解析动作 BUY/ADD/HOLD/WAIT/REDUCE/TAKE_PROFIT/STOP_LOSS
  score: {
    adaptiveScore?: number | null;
    technicalScore?: number | null;   // /30
    fundamentalScore?: number | null; // /25
    moneyFlowScore?: number | null;   // /20
    newsSentimentScore?: number | null; // /15
    globalTrendScore?: number | null; // /10
    recommendationV2?: string | null;
    tradingAction?: string | null;
    stockStyle?: string | null;
    highRiskFlag?: boolean | null;
    overallConfidence?: number | null; // 0-100
    percentileRank?: number | null;    // 1-100 越低越好
    rsi14?: number | null;
    maTrend?: string | null;
  } | null;
  indicators: {
    rsi14?: number | null;
    maTrend?: string | null;
    ma5?: number | null;
    ma20?: number | null;
    macdSignalLabel?: string | null;
  } | null;
  risk: {
    overall?: string | null; technical?: string | null; news?: string | null;
    fundamental?: string | null; volatility?: string | null;
  } | null;
  gpt: { timeHorizon?: string | null } | null;
}

export interface AiVerdict {
  finalDecision: { stars: Stars; action: string; strongDims: string[]; conclKey: string };
  whyBuy: string[];       // ≤3 i18n keys
  whyNotBuy: string[];    // ≤3 i18n keys
  keyRisks: string[];     // ≤3 i18n keys
  bestEntry: { modeKey: string; reasonKey: string };
  takeProfit: { pct: number | null; reasonKey: string }; // pct=null → 长期持有
  stopLoss: { pct: number | null; reasonKey: string };   // pct=null → 长期配置
  holdingPeriod: { labelKey: string; reasonKey: string };
  confidence: { stars: Stars; driverKeys: string[]; weak: boolean };
}

const clampStar = (n: number): Stars => Math.max(1, Math.min(5, Math.round(n))) as Stars;
const num = (v: number | null | undefined): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);

// 维度状态：high / mid / low（阈值与报告「优势/风险」派生保持一致）
type DimState = "high" | "mid" | "low";
function dimState(v: number | null | undefined, hi: number, lo: number): DimState | null {
  const n = num(v); if (n == null) return null;
  return n >= hi ? "high" : n <= lo ? "low" : "mid";
}

const BULL = new Set(["GOLDEN", "BULLISH"]);
const BEAR = new Set(["BEARISH", "DEAD"]);
const HIGH_RISK = new Set(["HIGH", "EXTREME"]);
const BUYISH_ACT = new Set(["BUY", "ADD"]);

export function deriveAiVerdict(input: AiVerdictInput): AiVerdict {
  const sc = input.score;
  const ind = input.indicators;
  const risk = input.risk;
  const style = sc?.stockStyle ?? null;

  const rsi = num(ind?.rsi14) ?? num(sc?.rsi14);
  const maTrend = ind?.maTrend ?? sc?.maTrend ?? "NEUTRAL";
  const macd = ind?.macdSignalLabel ?? null;
  const adaptive = num(sc?.adaptiveScore);
  const conf = num(sc?.overallConfidence);
  const percentile = num(sc?.percentileRank);
  // Best Entry 只跟随「已解析展示动作」，避免「动作=等待」却「最佳买点=立即买入」的自相矛盾。
  const entryBuyish = BUYISH_ACT.has(input.action);

  const dTech = dimState(sc?.technicalScore, 20, 15);
  const dFund = dimState(sc?.fundamentalScore, 17, 13);
  const dMoney = dimState(sc?.moneyFlowScore, 14, 10);
  const dSenti = dimState(sc?.newsSentimentScore, 10, 7);
  const dTrend = dimState(sc?.globalTrendScore, 7, 4);

  // ── ④ AI 最终决策：星级(按 adaptiveScore 分档) + 强势维度 + 动作结论句 ──────────
  const decStars: Stars = clampStar(
    adaptive == null ? 3 : adaptive >= 80 ? 5 : adaptive >= 70 ? 4 : adaptive >= 60 ? 3 : adaptive >= 45 ? 2 : 1
  );
  const strongDims: string[] = [];
  if (dTech === "high") strongDims.push("dv.aiv.dim.tech");
  if (dMoney === "high") strongDims.push("dv.aiv.dim.money");
  if (dTrend === "high") strongDims.push("dv.aiv.dim.trend");
  if (dFund === "high") strongDims.push("dv.aiv.dim.fund");
  if (dSenti === "high") strongDims.push("dv.aiv.dim.senti");
  const CONCL = new Set(["BUY", "ADD", "WAIT", "HOLD", "REDUCE", "TAKE_PROFIT", "STOP_LOSS"]);
  const conclKey = `dv.rr.concl.${CONCL.has(input.action) ? input.action : "default"}`;

  // ── ⑤ Why Buy（≤3，按强度排序）───────────────────────────────────────────────
  const buy: string[] = [];
  if (adaptive != null && adaptive >= 75) buy.push("dv.aiv.buy.scoreTop");
  if (dTech === "high") buy.push("dv.aiv.buy.tech");
  if (dMoney === "high") buy.push("dv.aiv.buy.money");
  if (dTrend === "high") buy.push("dv.aiv.buy.trend");
  if (dFund === "high") buy.push("dv.aiv.buy.fund");
  if (dSenti === "high") buy.push("dv.aiv.buy.senti");
  if (BULL.has(maTrend)) buy.push("dv.aiv.buy.maUp");
  if (macd === "BUY") buy.push("dv.aiv.buy.macd");
  if (percentile != null && percentile <= 15) buy.push("dv.aiv.buy.percentile");
  const whyBuy = Array.from(new Set(buy)).slice(0, 3);

  // ── ⑪ Confidence Drivers：维度一致性（核心 = 技术/资金/趋势）+ 解释 ───────────
  // 先算信心（whyNot 的「信心不足」与本星级同口径，避免自相矛盾）。
  const coreStrong = [dTech, dMoney, dTrend].filter(d => d === "high").length;
  let confStars = clampStar(2 + coreStrong);
  if (adaptive != null && adaptive < 45) confStars = clampStar(Math.min(confStars, 2));
  else if (adaptive != null && adaptive < 60) confStars = clampStar(Math.min(confStars, 3));
  const driverKeys: string[] = [];
  if (dTech === "high") driverKeys.push("dv.aiv.dim.tech");
  if (dMoney === "high") driverKeys.push("dv.aiv.dim.money");
  if (dTrend === "high") driverKeys.push("dv.aiv.dim.trend");
  if (dFund === "high") driverKeys.push("dv.aiv.dim.fund");
  if (dSenti === "high") driverKeys.push("dv.aiv.dim.senti");
  const weak = coreStrong <= 1;
  const lowConfidence = confStars <= 2 || (conf != null && conf < 50);

  // ── ⑥ Why Not Buy（≤3）────────────────────────────────────────────────────────
  const not: string[] = [];
  if (rsi != null && rsi >= 70) not.push("dv.aiv.not.rsiHigh");
  if (risk?.volatility === "HIGH") not.push("dv.aiv.not.vol");
  if (dFund === "low" || risk?.fundamental === "HIGH") not.push("dv.aiv.not.fundWeak");
  if (lowConfidence) not.push("dv.aiv.not.confLow");
  if (BEAR.has(maTrend)) not.push("dv.aiv.not.maDown");
  if (dMoney === "low") not.push("dv.aiv.not.moneyOut");
  if (dSenti === "low") not.push("dv.aiv.not.sentiWeak");
  if (sc?.highRiskFlag || risk?.overall === "EXTREME") not.push("dv.aiv.not.highRisk");
  const whyNotBuy = Array.from(new Set(not)).slice(0, 3);

  // ── ⑫ Key Risks（≤3）─────────────────────────────────────────────────────────
  const rks: string[] = [];
  if (risk?.volatility === "HIGH") rks.push("dv.aiv.risk.vol");
  if (rsi != null && rsi >= 75) rks.push("dv.aiv.risk.overbought");
  if (risk?.news === "HIGH") rks.push("dv.aiv.risk.news");
  if (risk?.fundamental === "HIGH") rks.push("dv.aiv.risk.fund");
  if (risk?.technical === "HIGH" || BEAR.has(maTrend)) rks.push("dv.aiv.risk.tech");
  if (HIGH_RISK.has(risk?.overall ?? "")) rks.push("dv.aiv.risk.overall");
  const keyRisks = Array.from(new Set(rks)).slice(0, 3);

  // ── ⑦ Best Entry：来自 RSI / MA / MACD / 趋势 ─────────────────────────────────
  let entryMode: string, entryReason: string;
  if (rsi != null && rsi >= 70) {
    entryMode = "dv.aiv.entry.pullback"; entryReason = "dv.aiv.entryR.pullback";
  } else if (entryBuyish && BULL.has(maTrend) && (rsi == null || rsi <= 65)) {
    entryMode = "dv.aiv.entry.now"; entryReason = "dv.aiv.entryR.now";
  } else if (entryBuyish && maTrend === "NEUTRAL" && macd !== "SELL") {
    entryMode = "dv.aiv.entry.breakout"; entryReason = "dv.aiv.entryR.breakout";
  } else {
    entryMode = "dv.aiv.entry.watch"; entryReason = "dv.aiv.entryR.watch";
  }

  // ── ⑧ Take Profit：按股票风格 stockStyle ──────────────────────────────────────
  let tpPct: number | null, tpReason: string;
  switch (style) {
    case "SPECULATIVE_MOMENTUM":
    case "GROWTH_MOMENTUM": tpPct = 15; tpReason = "dv.aiv.tpR.growth"; break;
    case "CYCLICAL_EXPORTER": tpPct = 12; tpReason = "dv.aiv.tpR.cyclical"; break;
    case "VALUE_DEFENSIVE":
    case "DOMESTIC_DEFENSIVE": tpPct = 8; tpReason = "dv.aiv.tpR.value"; break;
    case "QUALITY_COMPOUNDER": tpPct = null; tpReason = "dv.aiv.tpR.quality"; break;
    default: tpPct = 10; tpReason = "dv.aiv.tpR.default";
  }

  // ── ⑨ Stop Loss：按 风险等级 / 波动率 / 风格 ─────────────────────────────────
  let slPct: number | null, slReason: string;
  const defensive = style === "QUALITY_COMPOUNDER" || style === "VALUE_DEFENSIVE" || style === "DOMESTIC_DEFENSIVE";
  if (risk?.volatility === "HIGH" || risk?.overall === "EXTREME") {
    slPct = -5; slReason = "dv.aiv.slR.tight";
  } else if (risk?.overall === "HIGH" || sc?.highRiskFlag) {
    slPct = -8; slReason = "dv.aiv.slR.normal";
  } else if (defensive && (risk?.overall === "LOW" || risk?.overall == null)) {
    slPct = style === "QUALITY_COMPOUNDER" ? null : -10;
    slReason = slPct == null ? "dv.aiv.slR.long" : "dv.aiv.slR.wide";
  } else {
    slPct = -8; slReason = "dv.aiv.slR.normal";
  }

  // ── ⑩ Holding Period：Trend / Style / Risk（gpt.timeHorizon 优先）────────────
  let periodKey: string, periodReason: string;
  const th = (input.gpt?.timeHorizon ?? "").toUpperCase();
  if (th === "SHORT" || th === "SCALP" || th === "DAY") { periodKey = "dv.aiv.period.scalp"; periodReason = "dv.aiv.holdR.scalp"; }
  else if (th === "MID" || th === "MEDIUM") { periodKey = "dv.aiv.period.m13"; periodReason = "dv.aiv.holdR.trend"; }
  else if (th === "LONG") { periodKey = "dv.aiv.period.long"; periodReason = "dv.aiv.holdR.long"; }
  else {
    switch (style) {
      case "SPECULATIVE_MOMENTUM": periodKey = "dv.aiv.period.scalp"; periodReason = "dv.aiv.holdR.scalp"; break;
      case "GROWTH_MOMENTUM": periodKey = "dv.aiv.period.w12"; periodReason = "dv.aiv.holdR.momentum"; break;
      case "CYCLICAL_EXPORTER": periodKey = "dv.aiv.period.m13"; periodReason = "dv.aiv.holdR.trend"; break;
      case "VALUE_DEFENSIVE":
      case "DOMESTIC_DEFENSIVE":
      case "QUALITY_COMPOUNDER": periodKey = "dv.aiv.period.long"; periodReason = "dv.aiv.holdR.long"; break;
      default: periodKey = "dv.aiv.period.m13"; periodReason = "dv.aiv.holdR.default";
    }
  }

  return {
    finalDecision: { stars: decStars, action: input.action, strongDims, conclKey },
    whyBuy, whyNotBuy, keyRisks,
    bestEntry: { modeKey: entryMode, reasonKey: entryReason },
    takeProfit: { pct: tpPct, reasonKey: tpReason },
    stopLoss: { pct: slPct, reasonKey: slReason },
    holdingPeriod: { labelKey: periodKey, reasonKey: periodReason },
    confidence: { stars: confStars, driverKeys, weak },
  };
}
