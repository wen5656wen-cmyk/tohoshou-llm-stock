/**
 * Centralized URL utilities for TOHOSHOU AI
 *
 * Always use these functions for URLs in server-side responses.
 * Never hardcode localhost or relative paths.
 */

export function getBaseUrl(): string {
  // APP_URL is a server-side runtime variable (not baked in at build time).
  // NEXT_PUBLIC_APP_URL is replaced by Next.js at build time — local builds
  // would embed "http://localhost:3000" into the bundle, so it must come last.
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
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
