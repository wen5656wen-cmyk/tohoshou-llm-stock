export type Lang = "zh-CN" | "ja-JP" | "en-US";

export type Messages = {
  // Site branding
  "site.subtitle": string;

  // Navigation labels (sidebar + drawer)
  "nav.dashboard": string;
  "nav.stocks": string;
  "nav.indicators": string;
  "nav.ai_picks": string;
  "nav.ai_theme": string;
  "nav.chat": string;
  "nav.screener": string;
  "nav.sectors": string;
  "nav.watchlist": string;
  "nav.news": string;
  "nav.portfolio": string;
  "nav.notifications": string;
  "nav.sync": string;
  "nav.data_sources": string;
  // Bottom nav (short form)
  "nav.home": string;
  "nav.supply_chain": string;
  "nav.dialogue": string;
  "nav.select": string;

  // Recommendation ratings
  "rating.STRONG_BUY": string;
  "rating.BUY": string;
  "rating.HOLD": string;
  "rating.WATCH": string;
  "rating.AVOID": string;

  // Trading action signals
  "action.BUY_NOW": string;
  "action.WAIT_PULLBACK": string;
  "action.HOLD": string;
  "action.TAKE_PROFIT": string;
  "action.SELL": string;
  "action.AVOID": string;

  // Risk levels
  "risk.LOW": string;
  "risk.MEDIUM": string;
  "risk.HIGH": string;
  "risk.EXTREME": string;

  // AI Action card
  "ai_action.title": string;
  "ai_action.position_size": string;
  "ai_action.entry_range": string;
  "ai_action.stop_loss": string;
  "ai_action.target1": string;
  "ai_action.target2": string;
  "ai_action.reasons": string;
  "ai_action.warnings": string;
  "ai_action.disclaimer": string;
  "ai_action.risk_level": string;
  "ai_action.of_portfolio": string;

  // Stock detail tabs
  "tab.overview": string;
  "tab.technical": string;
  "tab.fundamental": string;
  "tab.news": string;
  "tab.ai": string;

  // Common UI
  "common.loading": string;
  "common.search": string;
  "common.filter": string;
  "common.reset": string;
  "common.close": string;
  "common.all": string;
  "common.score": string;
  "common.rank": string;
  "common.market": string;
  "common.sector": string;
  "common.symbol": string;
  "common.name": string;
  "common.price": string;
  "common.no_data": string;
  "common.language": string;
  "common.not_overbought": string;
};

export type MessageKey = keyof Messages;
