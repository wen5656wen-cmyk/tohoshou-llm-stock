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
  // New simplified nav
  "nav.aiScreener": string;
  "nav.aiValueChain": string;
  "nav.myInvestments": string;
  "nav.systemStatus": string;
  "nav.admin": string;

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
  "screener.combined_description": string;

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
  // Dashboard stat card labels
  "home.db_stocks": string;
  "home.scored_count": string;
  "home.buy_recommendation": string;
  "home.price_records": string;
  "home.last_sync": string;
  "home.unit_stocks": string;
  "home.unit_records": string;
  // Dashboard section labels
  "home.no_score_hint": string;
  "home.watch_monitoring": string;
  "home.ai_scored": string;
  "home.ranking_title": string;
  "home.screener_link": string;
  "home.show_top100": string;
  "home.view_screener": string;

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
  "stocks.view_technicals": string;

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

  // ─── My Investments tabs ───────────────────────────────────────────────────
  "tabs.watchlist": string;
  "tabs.portfolio": string;
  "tabs.priceAlerts": string;

  // ─── Chat moved notice ─────────────────────────────────────────────────────
  "chat.movedToLine": string;

  // ─── Page merged notices ───────────────────────────────────────────────────
  "page.merged_screener": string;
  "page.go_screener": string;
  "page.merged_portfolio": string;
  "page.go_portfolio": string;
  "page.stocks_top500_desc": string;
  "page.loading_failed_screener": string;
  "page.back_to_dashboard": string;

  // ─── TOP500 ────────────────────────────────────────────────────────────────
  "top500.title": string;

  // ─── Home page labels ──────────────────────────────────────────────────────
  "home.ai_top3": string;
  "home.full_ranking": string;
  "home.buy_picks": string;
  "home.watch_label": string;
  "home.screener_count": string;
  "home.strong_buy_plus_buy": string;

  // ─── Generic table headers ─────────────────────────────────────────────────
  "table.stock": string;
  "table.price": string;
  "table.date": string;
  "table.ma_trend": string;
  "table.financials": string;
  "table.detail": string;
  "table.trend": string;
  "table.tech": string;
  "table.fund": string;
  "table.adaptive": string;
  "table.rating": string;

  // ─── MA trend labels ───────────────────────────────────────────────────────
  "trend.golden": string;
  "trend.bullish": string;
  "trend.neutral": string;
  "trend.bearish": string;
  "trend.dead": string;

  // ─── Market board labels ───────────────────────────────────────────────────
  "market.prime": string;
  "market.standard": string;
  "market.growth": string;

  // ─── Dim short labels ─────────────────────────────────────────────────────
  "dim.tech_short": string;
  "dim.fund_short": string;
  "dim.flow_short": string;
  "dim.news_short": string;
  "dim.global_short": string;

  // ─── AI Picks detail ──────────────────────────────────────────────────────
  "picks.detail_rating": string;
  "picks.detail_ai": string;
  "picks.adaptive": string;
  "picks.percentile_rank": string;
  "picks.mode_top": string;
  "picks.mode_opp": string;
  "picks.mode_risk": string;

  // ─── Stock detail labels ──────────────────────────────────────────────────
  "stock.ma_lines": string;
  "stock.oscillators": string;
  "stock.price_30d": string;
  "stock.full_chart": string;
  "stock.moving_averages": string;
  "stock.vs_price": string;
  "stock.chart_title": string;
  "stock.close_label": string;
  "stock.financials_title": string;

  // ─── Mobile card ──────────────────────────────────────────────────────────
  "card.price": string;
  "card.5d": string;
  "card.20d": string;
  "card.opp": string;

  // ─── Sectors page ─────────────────────────────────────────────────────────
  "sectors.screener_link": string;

  // ─── Financials table ─────────────────────────────────────────────────────
  "fin.period": string;
  "fin.revenue": string;
  "fin.op_profit": string;
  "fin.net_profit": string;
  "fin.equity_ratio": string;
  "fin.reported_at": string;
  "fin.full_year": string;

  // ─── AI Value Chain (ai-theme) ────────────────────────────────────────────
  "theme.stat_tracked": string;
  "theme.stat_core": string;
  "theme.stat_buy": string;
  "theme.stat_avg_score": string;
  "theme.stat_categories": string;
  "theme.stat_layers": string;
  "theme.stat_top_score": string;
  "theme.unit_stocks": string;
  "theme.chain_title": string;
  "theme.search_placeholder": string;
  "theme.layer_all": string;
  "theme.rec_all": string;
  "theme.core_toggle": string;
  "theme.sort_label": string;
  "theme.sort_ai_score": string;
  "theme.sort_opportunity": string;
  "theme.sort_importance": string;
  "theme.sort_rank": string;
  "theme.sort_dividend": string;
  "theme.sort_catalyst": string;
  "theme.categories_overview": string;
  "theme.detail_subtitle": string;
  "theme.detail_link": string;
  "theme.loading": string;
  "theme.loading_detail": string;
  "theme.error_load": string;
  "theme.back_link": string;
  "theme.chain_structure": string;
  "theme.pending_score": string;
  "theme.pending_calc": string;
  "theme.high_risk": string;
  "theme.dividend_label": string;
  "theme.catalyst_label": string;
  "theme.avg_score_label": string;
  "theme.detail_sorted": string;
  "theme.search_label": string;
  "theme.core_only_label": string;
  "theme.empty_data": string;
  "theme.tab_all": string;
  "theme.tab_hardware": string;
  "theme.tab_semi_eq": string;
  "theme.tab_test_eq": string;
  "theme.tab_chip_mat": string;
  "theme.tab_hbm": string;
  "theme.tab_server_dc": string;
  "theme.tab_robot": string;
  "theme.tab_sw_cloud": string;
  "theme.tab_medical": string;
  "theme.tab_energy": string;

  // ─── Common additions ─────────────────────────────────────────────────────
  "common.percentile_prefix": string;
  "common.clear_filter": string;

  // ─── Theme page additions ─────────────────────────────────────────────────
  "theme.sub_categories": string;
  "theme.active_layers": string;
  "theme.scored_prefix": string;
  "theme.run_cmd": string;
  "theme.not_found": string;
  "theme.total_stocks": string;
  "theme.scored_count_label": string;

  // ─── Sectors page additions ───────────────────────────────────────────────
  "sectors.unit_sector": string;
  "sectors.unit_stock_suffix": string;

  // ─── Stock page additions ─────────────────────────────────────────────────
  "stock.hist_label": string;
  "stock.returns_label": string;
  "stock.no_financials": string;

  // ─── News additions ───────────────────────────────────────────────────────
  "news.no_stock_news": string;
  "news.stock_badge": string;

  // ─── V9 P1: GPT Score Overlay ─────────────────────────────────────────────
  "gpt.section_title": string;
  "gpt.rule_score": string;
  "gpt.gpt_score": string;
  "gpt.final_score": string;
  "gpt.confidence": string;
  "gpt.insight": string;
  "gpt.strengths": string;
  "gpt.risks": string;
  "gpt.catalysts": string;
  "gpt.time_horizon": string;
  "gpt.not_generated": string;
  "gpt.disclaimer": string;
  "gpt.confidence.HIGH": string;
  "gpt.confidence.MEDIUM": string;
  "gpt.confidence.LOW": string;
  "gpt.action.POSITIVE": string;
  "gpt.action.NEUTRAL": string;
  "gpt.action.NEGATIVE": string;
  "gpt.updated_at": string;
  "gpt.rule_score_desc": string;
  "gpt.gpt_score_desc": string;
  "gpt.final_score_desc": string;
  "screener.col_final_score": string;
  // V8.6 P1: 7 sub-dimension labels
  "gpt.dim.business_quality": string;
  "gpt.dim.growth": string;
  "gpt.dim.industry": string;
  "gpt.dim.moat": string;
  "gpt.dim.valuation": string;
  "gpt.dim.catalyst": string;
  "gpt.dim.risk": string;
  "screener.col_gpt_score": string;
  "screener.col_confidence": string;
  // V8.5 P2: Stock detail AI-first + full i18n
  "stock.aiScore": string;
  "stock.gptScore": string;
  "stock.overallScore": string;
  "stock.confidence": string;
  "stock.direction": string;
  "stock.position": string;
  "stock.gptView": string;
  "stock.gptHorizon": string;
  "stock.reasons": string;
  "stock.risks": string;
  "stock.direction.bullish": string;
  "stock.direction.neutral": string;
  "stock.direction.cautious": string;
  "stock.buyZone": string;
  "stock.watchZone": string;
  "stock.riskZone": string;
  "stock.aiZones": string;
  "stock.load_error": string;
  "score.technical": string;
  "score.fundamental": string;
  "score.money_flow": string;
  "score.sentiment": string;
  "score.trend": string;
  "score.technical_analysis": string;
  "score.fundamental_analysis": string;
  "score.money_analysis": string;
  "score.news_sentiment": string;
  "score.dividend_yield": string;
  "score.annual": string;
  "score.payout_ratio": string;
  "score.dividend_score": string;
  "score.short_ratio_mkt": string;
  "score.jpx_daily": string;
  "score.real_data": string;
  "score.details": string;
  "score.div_short": string;
  "score.ma_trend": string;
  "score.macd_signal_label": string;
  "score.rsi_pos": string;
  "score.momentum": string;
  "score.op_margin": string;
  "score.equity_ratio_label": string;
  "score.inflow": string;
  "score.stability": string;
  "score.short_pressure": string;
  // v9 P1.3 Final Score Unification
  "score.final": string;
  "score.rule_only": string;
  "score.rule": string;
  "score.gpt": string;
};

export type MessageKey = keyof Messages;
