export type Lang = "zh-CN" | "ja-JP" | "en-US";

export type Messages = {
  // ─── Site ──────────────────────────────────────────────────────────────────
  "site.subtitle": string;
  "site.system_name": string;

  // ─── Navigation ────────────────────────────────────────────────────────────
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
  "nav.home": string;
  "nav.supply_chain": string;
  "nav.dialogue": string;
  "nav.select": string;

  // ─── Recommendation ratings ────────────────────────────────────────────────
  "rating.STRONG_BUY": string;
  "rating.BUY": string;
  "rating.HOLD": string;
  "rating.WATCH": string;
  "rating.AVOID": string;

  // ─── Trading action signals ────────────────────────────────────────────────
  "action.BUY_NOW": string;
  "action.WAIT_PULLBACK": string;
  "action.HOLD": string;
  "action.TAKE_PROFIT": string;
  "action.SELL": string;
  "action.AVOID": string;

  // ─── Risk levels ───────────────────────────────────────────────────────────
  "risk.LOW": string;
  "risk.MEDIUM": string;
  "risk.HIGH": string;
  "risk.EXTREME": string;

  // ─── RSI status (5 levels) ─────────────────────────────────────────────────
  "rsi.oversold": string;
  "rsi.normal": string;
  "rsi.hot": string;
  "rsi.overbought": string;
  "rsi.extreme_overbought": string;

  // ─── MACD trend direction ──────────────────────────────────────────────────
  "macd.trend_label": string;
  "macd.bullish": string;
  "macd.bearish": string;
  "macd.neutral": string;

  // ─── Score dimensions ──────────────────────────────────────────────────────
  "dim.technical": string;
  "dim.fundamental": string;
  "dim.money_flow": string;
  "dim.sentiment": string;
  "dim.global": string;

  // ─── Stock style names ─────────────────────────────────────────────────────
  "style.QUALITY_COMPOUNDER": string;
  "style.GROWTH_MOMENTUM": string;
  "style.CYCLICAL_EXPORTER": string;
  "style.VALUE_DEFENSIVE": string;
  "style.DOMESTIC_DEFENSIVE": string;
  "style.SPECULATIVE_MOMENTUM": string;
  "style.short.QUALITY_COMPOUNDER": string;
  "style.short.GROWTH_MOMENTUM": string;
  "style.short.CYCLICAL_EXPORTER": string;
  "style.short.VALUE_DEFENSIVE": string;
  "style.short.DOMESTIC_DEFENSIVE": string;
  "style.short.SPECULATIVE_MOMENTUM": string;
  "style.all": string;

  // ─── AI Action card ────────────────────────────────────────────────────────
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

  // ─── Stock detail page ─────────────────────────────────────────────────────
  "stock.back_to_list": string;
  "stock.add_watchlist": string;
  "stock.in_watchlist": string;
  "stock.close_price": string;
  "stock.5d_return": string;
  "stock.20d_return": string;
  "stock.60d_return": string;
  "stock.52w_high": string;
  "stock.52w_low": string;
  "stock.no_ai_data": string;
  "stock.market_rank": string;
  "stock.opportunity_score": string;
  "stock.high_risk": string;
  "stock.steady": string;
  "stock.data_notice": string;
  "stock.large_move_warning": string;
  "stock.score_source.REAL": string;
  "stock.score_source.PARTIAL": string;
  "stock.score_source.FALLBACK": string;
  "stock.style_label": string;

  // ─── Stock detail tabs ─────────────────────────────────────────────────────
  "tab.overview": string;
  "tab.chart": string;
  "tab.financials": string;
  "tab.technical": string;
  "tab.ai": string;
  "tab.news": string;

  // ─── Screener page ─────────────────────────────────────────────────────────
  "screener.title": string;
  "screener.search_placeholder": string;
  "screener.all": string;
  "screener.all_styles": string;
  "screener.all_markets": string;
  "screener.col_stock": string;
  "screener.col_market": string;
  "screener.col_style": string;
  "screener.col_price": string;
  "screener.col_20d": string;
  "screener.col_adaptive": string;
  "screener.col_percentile": string;
  "screener.col_opportunity": string;
  "screener.col_tech": string;
  "screener.col_fund": string;
  "screener.col_flow": string;
  "screener.col_news": string;
  "screener.col_rating": string;
  "screener.no_results": string;
  "screener.hint": string;
  "screener.searching": string;
  "screener.result_count": string;
  "screener.bull_count": string;
  "screener.updated": string;

  // ─── Market temperature ────────────────────────────────────────────────────
  "temp.HOT": string;
  "temp.WARM": string;
  "temp.NEUTRAL": string;
  "temp.COLD": string;
  "temp.EXTREME_COLD": string;

  // ─── News page ─────────────────────────────────────────────────────────────
  "news.title": string;
  "news.all": string;
  "news.positive": string;
  "news.negative": string;
  "news.neutral": string;
  "news.all_categories": string;
  "news.earnings": string;
  "news.guidance": string;
  "news.dividend": string;
  "news.buyback": string;
  "news.ir": string;
  "news.market_cat": string;
  "news.all_sources": string;
  "news.stock_specific": string;
  "news.market_only": string;
  "news.no_data": string;

  // ─── Health / Sync page ────────────────────────────────────────────────────
  "health.title": string;
  "health.allowed": string;
  "health.blocked": string;
  "health.critical": string;
  "health.warning": string;
  "health.pass": string;
  "health.last_checked": string;
  "health.never_run": string;
  "health.requires_review": string;

  // ─── Indicators page ───────────────────────────────────────────────────────
  "ind.title": string;
  "ind.macd_bullish_count": string;
  "ind.macd_bearish_count": string;
  "ind.ma_up": string;
  "ind.extreme_overbought": string;
  "ind.overbought_range": string;
  "ind.oversold": string;
  "ind.ai_buy_now": string;
  "ind.rsi_legend": string;
  "ind.macd_note": string;
  "ind.col_ma_trend": string;
  "ind.col_rsi": string;
  "ind.col_trend_signal": string;
  "ind.col_ai_action": string;
  "ind.ranking": string;
  "ind.heatmap": string;
  "ind.base_date": string;

  // ─── Common UI ─────────────────────────────────────────────────────────────
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
  "common.load_error": string;
  "common.ai_score_tab": string;

  // ─── AI Action card (additional) ───────────────────────────────────────────
  "ai_action.action_label": string;
  "ai_action.holding_period": string;
  "ai_action.holding_1_3m": string;

  // ─── Stock detail (additional) ─────────────────────────────────────────────
  "stock.back": string;
  "stock.close": string;

  // ─── Screener (additional) ─────────────────────────────────────────────────
  "screener.col_action": string;
  "screener.col_position": string;
  "screener.col_risk": string;
  "screener.col_rsi": string;

  // ─── AI Picks page ─────────────────────────────────────────────────────────
  "picks.title": string;
  "picks.position": string;
  "picks.risk": string;
  "picks.action": string;
  "picks.ai_score": string;
  "picks.opportunity": string;

  // ─── Sectors page ─────────────────────────────────────────────────────────
  "sectors.title": string;
  "sectors.hot": string;
  "sectors.weak": string;
  "sectors.avg_score": string;
  "sectors.avg_20d": string;
  "sectors.buy_count": string;
  "sectors.buy_rate": string;
  "sectors.stock_count": string;
  "sectors.top_stocks": string;

  // ─── Dashboard / home ──────────────────────────────────────────────────────
  "home.title": string;
  "home.subtitle": string;
  "home.market_temp": string;
  "home.top_picks": string;
  "home.recent_news": string;
  "home.view_all": string;

  // ─── Watchlist ─────────────────────────────────────────────────────────────
  "watchlist.title": string;
  "watchlist.empty": string;
  "watchlist.remove": string;

  // ─── Portfolio ─────────────────────────────────────────────────────────────
  "portfolio.title": string;
  "portfolio.empty": string;

  // ─── Notifications ─────────────────────────────────────────────────────────
  "notif.title": string;

  // ─── Chat ──────────────────────────────────────────────────────────────────
  "chat.title": string;
  "chat.placeholder": string;
  "chat.send": string;

  // ─── AI Theme ──────────────────────────────────────────────────────────────
  "theme.title": string;
  "theme.core": string;
  "theme.related": string;

  // ─── Stocks list ───────────────────────────────────────────────────────────
  "stocks.title": string;
  "stocks.search_placeholder": string;

  // ─── Empty / Error states ──────────────────────────────────────────────────
  "empty.no_score": string;
  "empty.no_news": string;
  "empty.retry": string;
  "error.fetch_failed": string;

  // ─── Sync additional ───────────────────────────────────────────────────────
  "sync.title": string;
  "sync.refresh": string;
  "sync.refreshing": string;
  "sync.run_all": string;
  "sync.syncing": string;

  // ─── Technical indicators (additional) ─────────────────────────────────────
  "ind.stock_col": string;
  "ind.price_col": string;
};

export type MessageKey = keyof Messages;
