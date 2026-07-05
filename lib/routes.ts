// ─────────────────────────────────────────────────────────────────────────────
// Central route registry (P3-T7). Single source of truth for every in-app link.
// No component may hardcode an href — import from here instead.
// Values are the CANONICAL production routes (all verified 200). Friendly aliases
// (/control-center, /data-center, /settings, /research, /learning-report) exist as
// thin redirect pages so external/legacy links and the smoke test resolve too.
// ─────────────────────────────────────────────────────────────────────────────

export const ROUTES = {
  DASHBOARD: "/",
  STOCKS: "/stocks",
  AI_SELECTION: "/screener",
  STRATEGY_CENTER: "/strategy",
  AUTO_TRADING: "/portfolio",
  BACKTEST: "/backtest",
  RESEARCH: "/admin/research",
  LEARNING_REPORT: "/admin/learning-report",
  DATA_CENTER: "/sync",
  LABS: "/admin/experiments",
  FEATURES: "/admin/features",
  SETTINGS: "/admin/mission-control",
  CONTROL_CENTER: "/admin/mission-control",
  MISSION_CONTROL: "/admin/mission-control",
  VERIFY: "/admin/verify",
  VERSIONS: "/admin/versions",
  NEWS: "/news",
  MARKET: "/market-regime",
  // Research-center tabs
  SHADOW_SCORE: "/admin/research?tab=score",
  FUSION_REPORT: "/admin/research?tab=fusion",
  FACTORS: "/admin/research?tab=factors",
  ANALYTICS: "/admin/research?tab=analytics",
  PAPER_TRADING: "/admin/research?tab=fusion", // P4-T4: legacy /fusion/paper 收敛至研究中心
  // Fallback
  COMING_SOON: "/coming-soon",
} as const;

export type RouteKey = keyof typeof ROUTES;

/** Stock detail page. e.g. stockDetail("4318.T") → "/stocks/4318.T" */
export const stockDetail = (symbol: string) => `/stocks/${encodeURIComponent(symbol)}`;

/** Coming-soon fallback with a human feature label. */
export const comingSoon = (feature: string) => `/coming-soon?feature=${encodeURIComponent(feature)}`;

/** Search results (reuses the stock-list page's q filter). */
export const searchResults = (q: string) => `/stocks?q=${encodeURIComponent(q)}`;

/** Read-only stock typeahead — reuses the existing /api/stocks?q= endpoint. */
export const stockSearchApi = (q: string, limit = 6) =>
  `/api/stocks?q=${encodeURIComponent(q)}&limit=${limit}&sort=volume&order=desc`;

/** Timeline event type → destination route. */
export function timelineRoute(type: string): string {
  switch (type) {
    case "scores": return ROUTES.AI_SELECTION;
    case "news": return ROUTES.NEWS;
    case "prices": return ROUTES.DATA_CENTER;
    case "global": return ROUTES.MARKET;
    default: return ROUTES.MISSION_CONTROL;
  }
}
