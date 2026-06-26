// Strategy classification: classify DAY / SWING / POSITION from StockScore fields
// v15.0 — Three-Strategy System

export type StrategyType = "DAY" | "SWING" | "POSITION";

export type StrategyParams = {
  strategyType: StrategyType;
  confidence: number;       // 0–100
  targetReturnPct: number;  // take-profit % (3 | 8 | 20)
  stopLossPct: number;      // stop-loss % (−2 | −4 | −8)
  maxHoldingDays: number;   // trading days (1 | 10 | 60)
};

export type ClassifyInput = {
  tradingAction?: string | null;
  technicalScore?: number | null;
  fundamentalScore?: number | null;
  moneyFlowScore?: number | null;
  newsSentimentScore?: number | null;
  adaptiveScore?: number | null;
  rsi14?: number | null;
  maTrend?: string | null;
  stockStyle?: string | null;
  highRiskFlag?: boolean | null;
  overallConfidence?: number | null;
  recommendation?: string | null;
};

const DAY_PARAMS:      Omit<StrategyParams, "confidence"> = { strategyType: "DAY",      targetReturnPct: 3.0,  stopLossPct: -2.0, maxHoldingDays: 1  };
const SWING_PARAMS:    Omit<StrategyParams, "confidence"> = { strategyType: "SWING",    targetReturnPct: 8.0,  stopLossPct: -4.0, maxHoldingDays: 10 };
const POSITION_PARAMS: Omit<StrategyParams, "confidence"> = { strategyType: "POSITION", targetReturnPct: 20.0, stopLossPct: -8.0, maxHoldingDays: 60 };

const POSITION_STYLES = new Set(["VALUE_DEFENSIVE", "QUALITY_COMPOUNDER", "DOMESTIC_DEFENSIVE"]);
const BULLISH_TRENDS  = new Set(["GOLDEN", "BULLISH"]);
const BEARISH_TRENDS  = new Set(["DEAD", "BEARISH"]);

export function classifyStrategy(input: ClassifyInput): StrategyParams {
  const {
    tradingAction, technicalScore, fundamentalScore, moneyFlowScore,
    adaptiveScore, rsi14, maTrend, stockStyle, highRiskFlag,
    overallConfidence,
  } = input;

  const tech  = technicalScore  ?? 0;
  const fund  = fundamentalScore ?? 0;
  const flow  = moneyFlowScore  ?? 0;
  const score = adaptiveScore   ?? 0;
  const rsi   = rsi14           ?? 50;
  const conf  = overallConfidence ?? 50;

  // ── DAY detection ──────────────────────────────────────────────────────────
  // Short-term momentum play: immediate technical strength + volume surge signal
  const isDayCandidate =
    tradingAction === "BUY_NOW" &&
    tech >= 22 &&
    BULLISH_TRENDS.has(maTrend ?? "") &&
    rsi >= 50 && rsi <= 78 &&
    (flow >= 13 || score >= 72);

  if (isDayCandidate) {
    // Confidence: weight technical strength and momentum
    const dayConf = Math.min(95,
      Math.round(
        (tech / 30) * 40 +
        (flow / 20) * 25 +
        (Math.min(conf, 90) / 90) * 20 +
        (score >= 75 ? 15 : score >= 70 ? 10 : 5),
      ),
    );
    return { ...DAY_PARAMS, confidence: dayConf };
  }

  // ── POSITION detection ────────────────────────────────────────────────────
  // Medium-term fundamental play: strong fundamentals + stable style + trend not bearish
  const isPositionCandidate =
    fund >= 19 &&
    POSITION_STYLES.has(stockStyle ?? "") &&
    !BEARISH_TRENDS.has(maTrend ?? "") &&
    score >= 65 &&
    !highRiskFlag;

  if (isPositionCandidate) {
    // Confidence: weight fundamental quality and style fit
    const posConf = Math.min(92,
      Math.round(
        (fund / 25) * 45 +
        (score >= 75 ? 25 : score >= 70 ? 20 : 15) +
        (Math.min(conf, 90) / 90) * 20 +
        (BULLISH_TRENDS.has(maTrend ?? "") ? 10 : 5),
      ),
    );
    return { ...POSITION_PARAMS, confidence: posConf };
  }

  // ── SWING (default) ───────────────────────────────────────────────────────
  const swingConf = Math.min(88,
    Math.round(
      (tech / 30) * 25 +
      (fund / 25) * 20 +
      (flow / 20) * 20 +
      (Math.min(conf, 90) / 90) * 20 +
      (score >= 75 ? 15 : score >= 65 ? 10 : score >= 55 ? 7 : 5),
    ),
  );
  return { ...SWING_PARAMS, confidence: swingConf };
}
