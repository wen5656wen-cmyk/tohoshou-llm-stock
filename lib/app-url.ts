/**
 * Centralized URL utilities for TOHOSHOU AI
 *
 * Always use these functions for any URL that appears in LINE messages or
 * Flex Message buttons. Never hardcode localhost or relative paths.
 */

export function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "https://aitohoshou.com"
  );
}

/**
 * Ensure a stock symbol has the .T suffix (TSE convention).
 * "7203" → "7203.T", "7203.T" → "7203.T", "291A.T" → "291A.T"
 */
export function normalizeSymbolForUrl(symbol: string): string {
  const s = symbol.trim().toUpperCase().replace(/\s+/g, "");
  return s.endsWith(".T") ? s : `${s}.T`;
}

export const stockUrl = (symbol: string): string =>
  `${getBaseUrl()}/stocks/${encodeURIComponent(normalizeSymbolForUrl(symbol))}`;

export const aiPicksUrl = (): string => `${getBaseUrl()}/ai-picks`;
export const aiThemeUrl = (): string => `${getBaseUrl()}/ai-theme`;
export const screenerUrl = (): string => `${getBaseUrl()}/screener`;
export const newsUrl = (): string => `${getBaseUrl()}/news`;
export const notificationsUrl = (): string => `${getBaseUrl()}/notifications`;
export const portfolioUrl = (): string => `${getBaseUrl()}/portfolio`;
export const syncUrl = (): string => `${getBaseUrl()}/sync`;
