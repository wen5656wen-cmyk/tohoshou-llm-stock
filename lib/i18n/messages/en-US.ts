import type { Messages } from "../types";

const enUS: Messages = {
  // Site
  "site.subtitle": "Japan AI Stock Screener",
  "site.system_name": "TOHOSHOU AI",

  // Navigation
  "nav.dashboard": "Dashboard",
  "nav.stocks": "Stocks",
  "nav.indicators": "Technicals",
  "nav.ai_picks": "AI Picks",
  "nav.ai_theme": "AI Themes",
  "nav.chat": "AI Chat",
  "nav.screener": "Screener",
  "nav.sectors": "Sectors",
  "nav.watchlist": "Watchlist",
  "nav.news": "News",
  "nav.portfolio": "Portfolio",
  "nav.notifications": "Alerts",
  "nav.sync": "Data Sync",
  "nav.data_sources": "Data Sources",
  "nav.home": "Home",
  "nav.supply_chain": "Supply Chain",
  "nav.dialogue": "Chat",
  "nav.select": "Screen",

  // Ratings
  "rating.STRONG_BUY": "STRONG BUY",
  "rating.BUY": "BUY",
  "rating.HOLD": "HOLD",
  "rating.WATCH": "WATCH",
  "rating.AVOID": "AVOID",

  // Trading actions
  "action.BUY_NOW": "BUY NOW",
  "action.WAIT_PULLBACK": "WAIT PULLBACK",
  "action.HOLD": "HOLD",
  "action.TAKE_PROFIT": "TAKE PROFIT",
  "action.SELL": "SELL",
  "action.AVOID": "AVOID",

  // Risk levels
  "risk.LOW": "Low Risk",
  "risk.MEDIUM": "Medium Risk",
  "risk.HIGH": "High Risk",
  "risk.EXTREME": "Extreme Risk",

  // RSI 5 levels
  "rsi.oversold": "Oversold",
  "rsi.normal": "Normal",
  "rsi.hot": "Warm",
  "rsi.overbought": "Overbought",
  "rsi.extreme_overbought": "Extremely Overbought",

  // MACD trend
  "macd.trend_label": "Trend Signal",
  "macd.bullish": "Bullish",
  "macd.bearish": "Bearish",
  "macd.neutral": "Neutral",

  // Score dimensions
  "dim.technical": "Technical",
  "dim.fundamental": "Fundamental",
  "dim.money_flow": "Money Flow",
  "dim.sentiment": "Sentiment",
  "dim.global": "Global",

  // Stock styles
  "style.QUALITY_COMPOUNDER": "Quality Compounder",
  "style.GROWTH_MOMENTUM": "Growth Momentum",
  "style.CYCLICAL_EXPORTER": "Cyclical Exporter",
  "style.VALUE_DEFENSIVE": "Value Defensive",
  "style.DOMESTIC_DEFENSIVE": "Domestic Defensive",
  "style.SPECULATIVE_MOMENTUM": "Speculative Momentum",
  "style.short.QUALITY_COMPOUNDER": "Quality",
  "style.short.GROWTH_MOMENTUM": "Growth",
  "style.short.CYCLICAL_EXPORTER": "Cyclical",
  "style.short.VALUE_DEFENSIVE": "Value",
  "style.short.DOMESTIC_DEFENSIVE": "Domestic",
  "style.short.SPECULATIVE_MOMENTUM": "Speculative",
  "style.all": "All Styles",

  // AI Action card
  "ai_action.title": "AI Trading Signal",
  "ai_action.position_size": "Position Size",
  "ai_action.entry_range": "Entry Range",
  "ai_action.stop_loss": "Stop Loss",
  "ai_action.target1": "Target 1",
  "ai_action.target2": "Target 2",
  "ai_action.reasons": "Signal Basis",
  "ai_action.warnings": "Risk Warnings",
  "ai_action.disclaimer": "Output from AI rules engine. For reference only — not investment advice.",
  "ai_action.risk_level": "Risk Level",
  "ai_action.of_portfolio": "of portfolio",

  // Stock detail
  "stock.back_to_list": "← Stock List",
  "stock.add_watchlist": "Add to Watchlist",
  "stock.in_watchlist": "In Watchlist",
  "stock.close_price": "Close",
  "stock.5d_return": "5D Return",
  "stock.20d_return": "20D Return",
  "stock.60d_return": "60D Return",
  "stock.52w_high": "52W High",
  "stock.52w_low": "52W Low",
  "stock.no_ai_data": "No AI score data",
  "stock.market_rank": "Market Rank",
  "stock.opportunity_score": "Opportunity",
  "stock.high_risk": "High Risk",
  "stock.steady": "Steady",
  "stock.data_notice": "Data Notice",
  "stock.large_move_warning": "This stock has experienced significant price swings recently. AI scores use adjusted prices and are for reference only.",
  "stock.score_source.REAL": "✅ J-Quants Real Data",
  "stock.score_source.PARTIAL": "⚠️ Partial Real Data",
  "stock.score_source.FALLBACK": "🔴 Estimated Data",
  "stock.style_label": "Style",

  // Tabs
  "tab.overview": "Overview",
  "tab.chart": "Price Chart",
  "tab.financials": "Financials",
  "tab.technical": "Technical",
  "tab.ai": "AI Score",
  "tab.news": "Latest News",

  // Screener
  "screener.title": "AI Screener",
  "screener.search_placeholder": "Search ticker or company…",
  "screener.all": "All",
  "screener.all_styles": "All Styles",
  "screener.all_markets": "All Markets",
  "screener.col_stock": "Stock",
  "screener.col_market": "Market",
  "screener.col_style": "Style",
  "screener.col_price": "Price",
  "screener.col_20d": "20D",
  "screener.col_adaptive": "AI Score",
  "screener.col_percentile": "Mkt Rank",
  "screener.col_opportunity": "Opp.",
  "screener.col_tech": "Tech",
  "screener.col_fund": "Fund",
  "screener.col_flow": "Flow",
  "screener.col_news": "News",
  "screener.col_rating": "Rating",
  "screener.no_results": "No matching stocks",
  "screener.hint": "No keyword: top 200 by score. With keyword: full market search. Click headers to sort.",
  "screener.searching": "Searching…",
  "screener.result_count": "stocks",
  "screener.bull_count": "Bullish",
  "screener.updated": "Updated",

  // Market temperature
  "temp.HOT": "🔥 Hot",
  "temp.WARM": "☀️ Warm",
  "temp.NEUTRAL": "🌤 Neutral",
  "temp.COLD": "❄️ Cold",
  "temp.EXTREME_COLD": "🧊 Extreme Cold",

  // News
  "news.title": "News",
  "news.all": "All",
  "news.positive": "🟢 Positive",
  "news.negative": "🔴 Negative",
  "news.neutral": "⚪ Neutral",
  "news.all_categories": "All Categories",
  "news.earnings": "Earnings",
  "news.guidance": "Guidance",
  "news.dividend": "Dividend",
  "news.buyback": "Buyback",
  "news.ir": "IR Filing",
  "news.market_cat": "Market",
  "news.all_sources": "All Sources",
  "news.stock_specific": "Stock-Specific ≥70%",
  "news.market_only": "Market News",
  "news.no_data": "No news data",

  // Health / Sync
  "health.title": "Data Health Guard",
  "health.allowed": "AI Picks Enabled",
  "health.blocked": "AI Picks Paused",
  "health.critical": "Critical Issue",
  "health.warning": "Warning",
  "health.pass": "Pass",
  "health.last_checked": "Last Checked",
  "health.never_run": "Never Run",
  "health.requires_review": "Requires Review",

  // Indicators
  "ind.title": "Technical Indicator Rankings",
  "ind.macd_bullish_count": "MACD Bullish",
  "ind.macd_bearish_count": "MACD Bearish",
  "ind.ma_up": "MA Uptrend",
  "ind.extreme_overbought": "Extreme Overbought ≥90",
  "ind.overbought_range": "Warm/Overbought 70-89",
  "ind.oversold": "RSI Oversold ≤30",
  "ind.ai_buy_now": "AI Buy Now",
  "ind.rsi_legend": "RSI Levels",
  "ind.macd_note": "MACD shows trend direction, not a trade signal · Use AI Signal for buy/sell decisions",
  "ind.col_ma_trend": "MA Trend",
  "ind.col_rsi": "RSI(14)",
  "ind.col_trend_signal": "Trend Signal",
  "ind.col_ai_action": "AI Trade Signal",
  "ind.ranking": "Rankings",
  "ind.heatmap": "Heatmap",
  "ind.base_date": "Base Date",

  // Common
  "common.loading": "Loading…",
  "common.search": "Search",
  "common.filter": "Filter",
  "common.reset": "Reset",
  "common.close": "Close",
  "common.all": "All",
  "common.score": "Score",
  "common.rank": "Rank",
  "common.market": "Market",
  "common.sector": "Sector",
  "common.symbol": "Symbol",
  "common.name": "Name",
  "common.price": "Price",
  "common.no_data": "No data",
  "common.language": "Language",
  "common.not_overbought": "Not Overbought",
  "common.load_error": "Load Error",
  "common.ai_score_tab": "AI Score",

  // AI Action card (additional)
  "ai_action.action_label": "Action",
  "ai_action.holding_period": "Holding Period",
  "ai_action.holding_1_3m": "1–3 Months",

  // Stock detail (additional)
  "stock.back": "← Back",
  "stock.close": "Close",

  // Screener (additional)
  "screener.col_action": "Action",
  "screener.col_position": "Position",
  "screener.col_risk": "Risk",
  "screener.col_rsi": "RSI",

  // AI Picks page
  "picks.title": "AI Picks",
  "picks.position": "Position Size",
  "picks.risk": "Risk Level",
  "picks.action": "Action",
  "picks.ai_score": "AI Score",
  "picks.opportunity": "Opportunity",

  // Sectors page
  "sectors.title": "Sectors",
  "sectors.hot": "Top Sectors",
  "sectors.weak": "Weak Sectors",
  "sectors.avg_score": "Avg AI Score",
  "sectors.avg_20d": "Avg 20D Return",
  "sectors.buy_count": "Buy Count",
  "sectors.buy_rate": "Buy Ratio",
  "sectors.stock_count": "Stock Count",
  "sectors.top_stocks": "Top Stocks",

  // Dashboard / home
  "home.title": "TOHOSHOU AI",
  "home.subtitle": "Japan AI Stock Screener",
  "home.market_temp": "Market Temp",
  "home.top_picks": "AI Top Picks",
  "home.recent_news": "Latest News",
  "home.view_all": "View All",

  // Watchlist
  "watchlist.title": "Watchlist",
  "watchlist.empty": "No stocks in watchlist",
  "watchlist.remove": "Remove",

  // Portfolio
  "portfolio.title": "Portfolio",
  "portfolio.empty": "No holdings recorded",

  // Notifications
  "notif.title": "Alerts",

  // Chat
  "chat.title": "AI Chat",
  "chat.placeholder": "Ask anything (e.g. What stocks should I watch?)",
  "chat.send": "Send",

  // AI Theme
  "theme.title": "AI Themes",
  "theme.core": "Core Holdings",
  "theme.related": "Related Stocks",

  // Stocks list
  "stocks.title": "Stocks",
  "stocks.search_placeholder": "Search code or name…",

  // Empty / Error states
  "empty.no_score": "No score data",
  "empty.no_news": "No news",
  "empty.retry": "Please try again later",
  "error.fetch_failed": "Failed to fetch data",

  // Sync additional
  "sync.title": "Data Sync",
  "sync.refresh": "↺ Refresh",
  "sync.refreshing": "Refreshing…",
  "sync.run_all": "▶ Sync All",
  "sync.syncing": "Syncing…",

  // Technical indicators (additional)
  "ind.stock_col": "Stock",
  "ind.price_col": "Price",

  // New simplified nav
  "nav.aiScreener": "AI Screener",
  "nav.aiValueChain": "AI Value Chain",
  "nav.myInvestments": "My Investments",
  "nav.systemStatus": "System Status",
  "nav.admin": "Admin",

  // My Investments tabs
  "tabs.watchlist": "Watchlist",
  "tabs.portfolio": "Portfolio",
  "tabs.priceAlerts": "Price Alerts",

  // Chat moved notice
  "chat.movedToLine": "AI Chat is available via LINE Bot",

  // Page merged notices
  "page.merged_screener": "This page has been merged into AI Screener",
  "page.go_screener": "Go to AI Screener",
  "page.merged_portfolio": "This page has been merged into My Investments",
  "page.go_portfolio": "Go to My Investments",

  // TOP500
  "top500.title": "TOP500 Stocks",
};

export default enUS;
