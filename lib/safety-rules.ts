/**
 * TOHOSHOU AI Decision Engine — Safety Rules v1.0
 *
 * Six iron rules:
 *  1. No Look-Ahead Bias  — tradeEffectiveDate
 *  2. Normalization       — ImpactLevel → sigmaImpact
 *  3. Confidence Guard    — overallConfidence gates STRONG_BUY / BUY
 *  4. Risk Override       — SOFT_BLOCK / HARD_BLOCK caps final rating
 *  5. Version Freeze      — all snapshots record engine versions
 *  6. Shadow Mode         — TOHOSHOU model runs offline, weight=0 in production
 */

// ── Version constants (Rule 5: Version Freeze) ──────────────────────────────

export const RULE_ENGINE_VERSION         = "v1.0";
export const GLOBAL_EVENT_ENGINE_VERSION = "v0.1";
export const SCORING_SCHEMA_VERSION      = "v1.0";
export const TOHOSHOU_MODEL_VERSION      = "disabled"; // Rule 6: Shadow Mode
export const LLM_MODEL_VERSION          = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export const VERSION_SNAPSHOT = {
  ruleEngineVersion:        RULE_ENGINE_VERSION,
  globalEventEngineVersion: GLOBAL_EVENT_ENGINE_VERSION,
  scoringSchemaVersion:     SCORING_SCHEMA_VERSION,
  tohoshouModelVersion:     TOHOSHOU_MODEL_VERSION,
  llmModelVersion:          LLM_MODEL_VERSION,
} as const;

// ── Impact Level (Rule 2: Normalization) ─────────────────────────────────────

export type ImpactLevel =
  | "VERY_NEGATIVE"
  | "NEGATIVE"
  | "SLIGHT_NEGATIVE"
  | "NEUTRAL"
  | "SLIGHT_POSITIVE"
  | "POSITIVE"
  | "VERY_POSITIVE";

const IMPACT_SIGMA_MAP: Record<ImpactLevel, number> = {
  VERY_NEGATIVE:   -2,
  NEGATIVE:        -1,
  SLIGHT_NEGATIVE: -0.5,
  NEUTRAL:          0,
  SLIGHT_POSITIVE:  0.5,
  POSITIVE:         1,
  VERY_POSITIVE:    2,
};

export function impactLevelToSigma(level: ImpactLevel): number {
  return IMPACT_SIGMA_MAP[level];
}

// ── Japanese trading holiday calendar (2026–2027) ────────────────────────────

const JP_HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20",
  "2026-04-29", "2026-05-03", "2026-05-04", "2026-05-05",
  "2026-07-20", "2026-08-11", "2026-09-21", "2026-09-23",
  "2026-10-12", "2026-11-03", "2026-11-23", "2026-12-31",
  // 2027
  "2027-01-01", "2027-01-11", "2027-02-11", "2027-02-23", "2027-03-21",
  "2027-04-29", "2027-05-03", "2027-05-04", "2027-05-05",
  "2027-07-19", "2027-08-11", "2027-09-20", "2027-09-23",
  "2027-10-11", "2027-11-03", "2027-11-23", "2027-12-31",
]);

function isJpTradingDay(d: Date): boolean {
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat in UTC — but we work in JST days
  if (dow === 0 || dow === 6) return false;
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(d.getUTCDate()).padStart(2, "0");
  return !JP_HOLIDAYS.has(`${yyyy}-${mm}-${dd}`);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function nextTradingDay(d: Date): Date {
  let cur = addDays(d, 1);
  while (!isJpTradingDay(cur)) cur = addDays(cur, 1);
  return cur;
}

/**
 * Rule 1: No Look-Ahead Bias
 *
 * Given the UTC timestamp of an event, compute the first JST calendar date
 * on which it is safe to use this event for trading decisions.
 *
 * Cut-off: 15:00 JST = 06:00 UTC
 *   - publishedAt <= 06:00 UTC of day D → tradeEffectiveDate = JST calendar date of D
 *   - publishedAt >  06:00 UTC of day D → tradeEffectiveDate = next trading day after D (JST)
 */
export function calcTradeEffectiveDate(publishedAt: Date): Date {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jstMs = publishedAt.getTime() + JST_OFFSET_MS;

  // JST date midnight (UTC)
  const jstDate = new Date(jstMs);
  const jstDayUTC = new Date(Date.UTC(
    jstDate.getUTCFullYear(),
    jstDate.getUTCMonth(),
    jstDate.getUTCDate(),
  ));

  // JST 15:00 cutoff = UTC 06:00 of the same JST calendar day
  const cutoffUTC = new Date(jstDayUTC.getTime() + 6 * 60 * 60 * 1000);

  if (publishedAt.getTime() <= cutoffUTC.getTime()) {
    // Before 15:00 JST — use same JST calendar day, but only if it's a trading day
    if (isJpTradingDay(jstDayUTC)) return jstDayUTC;
    return nextTradingDay(jstDayUTC);
  }

  // After 15:00 JST — next trading day
  return nextTradingDay(jstDayUTC);
}

// ── Confidence computation (Rule 3) ─────────────────────────────────────────

export interface ConfidenceInput {
  priceCount:        number;        // number of price data points
  hasFinancial:      boolean;       // financial data available
  financialCount:    number;        // number of quarters
  recentNewsCount:   number;        // news in last 30d with conf>=70
  newsDataAgeDays:   number;        // age of newest news (days)
  hasGlobalMarket:   boolean;
  hasInstitutional:  boolean;
  hasSector:         boolean;
}

export interface ConfidenceResult {
  ruleConfidence:     number; // 0-100
  newsConfidence:     number; // 0-100
  industryConfidence: number; // 0-100
  modelConfidence:    number; // 0-100 (always 0 in shadow mode)
  overallConfidence:  number; // 0-100 weighted
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  // Rule confidence: based on price data completeness
  const priceScore = Math.min(100, (input.priceCount / 250) * 100);
  const finScore   = input.hasFinancial
    ? Math.min(100, 40 + (input.financialCount / 8) * 60)
    : 20;
  const globalScore = input.hasGlobalMarket  ? 100 : 50;
  const flowScore   = input.hasInstitutional ? 100 : 60;
  const ruleConfidence = Math.round(
    priceScore * 0.40 + finScore * 0.30 + globalScore * 0.15 + flowScore * 0.15
  );

  // News confidence: based on recency and volume
  let newsConfidence = 30; // baseline
  if (input.recentNewsCount >= 3) newsConfidence += 30;
  else if (input.recentNewsCount >= 1) newsConfidence += 15;
  if (input.newsDataAgeDays <= 3)       newsConfidence += 40;
  else if (input.newsDataAgeDays <= 7)  newsConfidence += 25;
  else if (input.newsDataAgeDays <= 14) newsConfidence += 10;
  newsConfidence = Math.min(100, newsConfidence);

  // Industry confidence
  const industryConfidence = input.hasSector ? 80 : 40;

  // Model confidence: always 0 — TOHOSHOU model disabled (Rule 6: Shadow Mode)
  const modelConfidence = 0;

  // Overall: weighted average (model weight = 0 since disabled)
  const overallConfidence = Math.round(
    ruleConfidence    * 0.50 +
    newsConfidence    * 0.25 +
    industryConfidence * 0.20 +
    modelConfidence   * 0.05
  );

  return {
    ruleConfidence:     Math.min(100, Math.max(0, ruleConfidence)),
    newsConfidence:     Math.min(100, Math.max(0, newsConfidence)),
    industryConfidence: Math.min(100, Math.max(0, industryConfidence)),
    modelConfidence,
    overallConfidence:  Math.min(100, Math.max(0, overallConfidence)),
  };
}

// ── Confidence Guard (Rule 3) ─────────────────────────────────────────────────

/**
 * Apply confidence-based rating cap.
 * overallConfidence < 60 → max BUY (no STRONG_BUY)
 * overallConfidence < 40 → max WATCH
 */
export function applyConfidenceGuard(rec: string, overallConfidence: number): string {
  if (overallConfidence < 40) {
    if (rec === "STRONG_BUY" || rec === "BUY" || rec === "HOLD") return "WATCH";
  } else if (overallConfidence < 60) {
    if (rec === "STRONG_BUY") return "BUY";
  }
  return rec;
}

// ── Risk Override (Rule 4) ────────────────────────────────────────────────────

export type RiskOverride = "NONE" | "SOFT_BLOCK" | "HARD_BLOCK";

/**
 * Apply riskOverride to the recommendation.
 * SOFT_BLOCK: STRONG_BUY→BUY, BUY→WATCH
 * HARD_BLOCK: anything above WATCH → WATCH; can be set to SELL by caller for severe cases
 */
export function applyRiskOverride(rec: string, override: RiskOverride): string {
  if (override === "NONE") return rec;
  if (override === "SOFT_BLOCK") {
    if (rec === "STRONG_BUY") return "BUY";
    if (rec === "BUY")        return "WATCH";
    return rec;
  }
  if (override === "HARD_BLOCK") {
    if (rec === "STRONG_BUY" || rec === "BUY" || rec === "HOLD") return "WATCH";
    return rec;
  }
  return rec;
}

/**
 * Determine riskOverride based on stock characteristics.
 * Basic framework: highRiskFlag + severe RSI overbought → SOFT_BLOCK
 */
export function computeRiskOverride(params: {
  highRiskFlag: boolean;
  rsi14: number | null;
  return20d: number | null;
}): RiskOverride {
  const { highRiskFlag, rsi14, return20d } = params;

  // SOFT_BLOCK conditions
  const rsiExtreme  = rsi14 != null && rsi14 > 88;
  const crashRisk   = return20d != null && return20d < -30;

  if (crashRisk) return "SOFT_BLOCK";
  if (highRiskFlag && rsiExtreme) return "SOFT_BLOCK";

  // HARD_BLOCK: reserved for delisting / halt / sanction (requires external data, future work)

  return "NONE";
}

// ── Combined guard application ────────────────────────────────────────────────

export function applyAllGuards(
  rawRec: string,
  confidence: ConfidenceResult,
  riskOverride: RiskOverride,
): string {
  let rec = rawRec;
  rec = applyConfidenceGuard(rec, confidence.overallConfidence);
  rec = applyRiskOverride(rec, riskOverride);
  return rec;
}
