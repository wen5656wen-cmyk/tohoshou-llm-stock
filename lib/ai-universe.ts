/**
 * AI Universe Filter — shared codes + auto-classification rules.
 *
 * P1-T1: manual exclude switch (`excludeReason` code).
 * P1-T2: automatic Universe Guard (`scripts/update-ai-universe.ts`) provenance
 *        (`aiExcludeSource` / `aiExcludeRule`) and the pure rule-matching logic below.
 *
 * `excludeReason` is stored on Stock as a stable CODE (not a localized string), so
 * display labels stay in i18n (`universe.reason.<CODE>` keys) across zh-CN/ja-JP/en-US.
 */
export const EXCLUDE_REASON_CODES = [
  "LOW_LIQUIDITY", // 流动性不足
  "LOW_GROWTH",    // 成长性不足
  "POOR_DATA",     // 数据质量差
  "ETF",
  "ETN",           // 上場投資証券
  "REIT",
  "PREFERRED",     // 优先股
  "DELISTED",      // 已退市 / 整理
  "SUSPENDED",     // 长期停牌 / 监理
  "MANUAL",        // 人工排除
  "MANUAL_EXCLUDED", // 人工排除（显式标记，配对 aiExcludeRule='MANUAL_EXCLUDED'）
  "OTHER",         // 其它
] as const;

export type ExcludeReasonCode = (typeof EXCLUDE_REASON_CODES)[number];

export function isValidExcludeReason(x: unknown): x is ExcludeReasonCode {
  return typeof x === "string" && (EXCLUDE_REASON_CODES as readonly string[]).includes(x);
}

/** i18n message key for a reason code, e.g. "universe.reason.LOW_GROWTH". */
export function excludeReasonKey(code: string): string {
  return `universe.reason.${isValidExcludeReason(code) ? code : "OTHER"}`;
}

// ── P1-T2 exclusion provenance ────────────────────────────────────────────────
export const AI_EXCLUDE_SOURCES = ["MANUAL", "AUTO", "SYSTEM"] as const;
export type AiExcludeSource = (typeof AI_EXCLUDE_SOURCES)[number];

/** Rule codes emitted by the auto guard (also used as `aiExcludeRule`). */
export type AutoRule =
  | "DELISTED_FLAG"
  | "SUSPENDED_FLAG"
  | "ETF_NAME"
  | "ETN_NAME"
  | "REIT_NAME"
  | "PREFERRED_NAME"
  | "DATA_QUALITY"
  | "LOW_TURNOVER";

export type AutoVerdict = {
  reason: ExcludeReasonCode;
  rule: AutoRule;
  source: AiExcludeSource;
};

// ── Name/flag detectors ───────────────────────────────────────────────────────
// Japanese listings: ETF「ETF/上場投信/上場投資信託」, ETN「ETN/上場投資証券」,
// J-REIT「リート/REIT/投資法人」, Preferred「優先」. Full-width variants included.
export function isETFName(name: string): boolean {
  return /ETF|上場投信|上場投資信託|ＥＴＦ/i.test(name);
}
export function isETNName(name: string): boolean {
  return /ETN|上場投資証券|ＥＴＮ/i.test(name);
}
export function isREITName(name: string, sector?: string | null): boolean {
  return /リート|REIT|投資法人|ＲＥＩＴ/i.test(name) || sector === "REIT";
}
export function isPreferredName(name: string): boolean {
  return /優先出資証券|優先株|preferred/i.test(name);
}

export type ClassifyInput = {
  name: string;
  sector: string | null;
  isDelisted: boolean;
  isSuspended: boolean;
  tradingStatus: string | null;
  listingStatus: string | null;
  /** avg daily turnover (JPY) over recent window; null = unknown */
  turnoverJpy: number | null;
  /** number of price bars in recent window; null = no recent data */
  recentBars: number | null;
};

export type ClassifyThresholds = {
  minTurnoverJpy: number;
  minRecentBars: number;
};

/**
 * First-match-wins auto classification. Returns the verdict to APPLY, or null if
 * the stock should stay in the AI universe. Order: structural (SYSTEM) → security
 * type (AUTO) → data quality (AUTO) → liquidity (AUTO).
 */
export function classifyAutoExclude(
  s: ClassifyInput,
  th: ClassifyThresholds
): AutoVerdict | null {
  // 1. Delisted / 整理 (structural)
  if (s.isDelisted || s.listingStatus === "DELISTED") {
    return { reason: "DELISTED", rule: "DELISTED_FLAG", source: "SYSTEM" };
  }
  // 2. Long-term suspended / 監理 (structural)
  if (s.isSuspended || s.tradingStatus === "SUSPENDED" || s.tradingStatus === "HALTED") {
    return { reason: "SUSPENDED", rule: "SUSPENDED_FLAG", source: "SYSTEM" };
  }
  // 3-6. Security type (heuristic name match)
  if (isETFName(s.name)) return { reason: "ETF", rule: "ETF_NAME", source: "AUTO" };
  if (isETNName(s.name)) return { reason: "ETN", rule: "ETN_NAME", source: "AUTO" };
  if (isREITName(s.name, s.sector)) return { reason: "REIT", rule: "REIT_NAME", source: "AUTO" };
  if (isPreferredName(s.name)) return { reason: "PREFERRED", rule: "PREFERRED_NAME", source: "AUTO" };
  // 7. Data quality — no / too little recent price data
  if (s.recentBars == null || s.recentBars < th.minRecentBars) {
    return { reason: "POOR_DATA", rule: "DATA_QUALITY", source: "AUTO" };
  }
  // 8. Liquidity — has data but average turnover too low
  if (s.turnoverJpy != null && s.turnoverJpy < th.minTurnoverJpy) {
    return { reason: "LOW_LIQUIDITY", rule: "LOW_TURNOVER", source: "AUTO" };
  }
  return null;
}
