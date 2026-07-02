/**
 * P1-T1 AI Universe Filter — shared exclude-reason codes.
 *
 * `excludeReason` is stored on Stock as a stable CODE (not a localized string), so
 * display labels stay in i18n (`universe.reason.<CODE>` keys) across zh-CN/ja-JP/en-US.
 */
export const EXCLUDE_REASON_CODES = [
  "LOW_LIQUIDITY", // 流动性不足
  "LOW_GROWTH",    // 成长性不足
  "POOR_DATA",     // 数据质量差
  "ETF",
  "REIT",
  "PREFERRED",     // 优先股
  "DELISTED",      // 已退市
  "MANUAL",        // 人工排除
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
