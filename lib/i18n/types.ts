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
  "nav.aiPortfolio": string;
  "nav.systemStatus": string;
  "nav.systemVerify": string;
  "nav.admin": string;
  // v14.0.0-IA
  "nav.core": string;
  "nav.dataAndLearning": string;
  "nav.systemMgmt": string;
  "nav.cockpit": string;
  "nav.missionControl": string;
  "nav.research": string;
  "nav.learningReport": string;
  "nav.versionCenter": string;
  "nav.experiments": string;
  "nav.syncStatus": string;
  "nav.dataVerify": string;

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
  // Dashboard system overview
  "home.system_overview_desc": string;
  "home.data_overview": string;
  "home.today_recs": string;
  "home.data_health": string;
  "home.sync_status": string;
  "home.quick_links": string;
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
  // ─── Portfolio v11.0 (AI Engine) ──────────────────────────────────────────
  "portfolio.ai_title": string;
  "portfolio.ai_subtitle": string;
  "portfolio.current_assets": string;
  "portfolio.cumulative_return": string;
  "portfolio.topix_etf": string;
  "portfolio.alpha": string;
  "portfolio.max_drawdown": string;
  "portfolio.holdings_title": string;
  "portfolio.col_buy_price": string;
  "portfolio.col_current": string;
  "portfolio.col_suggestion": string;
  "portfolio.col_value": string;
  "portfolio.col_days": string;
  "portfolio.suggest_hold": string;
  "portfolio.suggest_add": string;
  "portfolio.suggest_reduce": string;
  "portfolio.suggest_sell": string;
  "portfolio.trend_title": string;
  "portfolio.trend_ai": string;
  "portfolio.history_title": string;
  "portfolio.history_col_return7d": string;
  "portfolio.history_col_winrate": string;
  "portfolio.history_col_topix": string;
  "portfolio.history_col_alpha": string;
  "portfolio.pending_entry": string;
  "portfolio.no_data": string;
  "portfolio.loading_error": string;
  "portfolio.retry": string;
  "portfolio.tab_system": string;
  "portfolio.tab_watchlist": string;
  "portfolio.tab_system_desc": string;
  "portfolio.tab_watchlist_desc": string;
  "portfolio.simulate_disclaimer": string;
  "portfolio.initial_capital_label": string;
  "portfolio.cohort_date_label": string;
  "portfolio.system_subtitle": string;
  "portfolio.coming_soon": string;
  "portfolio.wl_empty_title": string;
  "portfolio.wl_empty_btn": string;
  "portfolio.wl_section_ranking": string;
  "portfolio.wl_section_simulate": string;
  "portfolio.wl_section_adjust": string;
  "portfolio.wl_suggest_buy": string;
  "portfolio.wl_suggest_watch": string;
  "portfolio.wl_suggest_sell": string;
  "portfolio.wl_suggest_pending": string;
  "portfolio.wl_simulate_rule": string;
  "portfolio.wl_realtime_title": string;
  "portfolio.wl_realtime_desc": string;
  "portfolio.wl_realtime_price": string;
  "portfolio.wl_1d_change": string;
  "portfolio.wl_vol": string;
  "portfolio.wl_vol_ratio": string;
  "portfolio.wl_turnover": string;
  "portfolio.wl_detail_btn": string;
  "portfolio.wl_delete_btn": string;
  "portfolio.wl_auto_refreshing": string;
  "portfolio.wl_refresh_label": string;
  "portfolio.wl_score_detail_title": string;
  "portfolio.wl_count_unit": string;
  "portfolio.wl_sim_entry": string;
  "portfolio.wl_sim_current": string;

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

  // ─── Backtest (v10.0) ────────────────────────────────────────────────────
  "nav.backtest": string;
  "backtest.title": string;
  "backtest.subtitle": string;
  "backtest.no_data": string;
  "backtest.cohorts": string;
  "backtest.horizon_7d": string;
  "backtest.horizon_30d": string;
  "backtest.horizon_90d": string;
  "backtest.win_rate": string;
  "backtest.avg_return": string;
  "backtest.filled": string;
  "backtest.top_winners": string;
  "backtest.top_losers": string;
  "backtest.latest_picks": string;
  "backtest.col_rank": string;
  "backtest.col_symbol": string;
  "backtest.col_score": string;
  "backtest.col_rating": string;
  "backtest.col_buy_price": string;
  "backtest.col_ret7d": string;
  "backtest.col_ret30d": string;
  "backtest.col_ret90d": string;
  "backtest.col_summary": string;
  "backtest.pending": string;
  "backtest.as_of": string;
  // v10.1 portfolio + benchmark
  "backtest.portfolio_title": string;
  "backtest.col_portfolio": string;
  "backtest.col_nikkei": string;
  "backtest.col_topix": string;
  "backtest.col_excess": string;
  "backtest.col_entry_price": string;
  "backtest.entry_note": string;
  "backtest.benchmark_note": string;
  "backtest.risk_banner": string;
  "backtest.trend_title": string;
  "backtest.trend_no_data": string;
  "backtest.trend_hint": string;
  "backtest.error_load": string;
  "backtest.retry": string;
  "backtest.summary_ai_return": string;
  "backtest.summary_topix": string;
  "backtest.summary_alpha": string;
  "backtest.summary_winrate": string;
  "backtest.summary_recs": string;
  "backtest.summary_updated": string;
  "backtest.cohort_title": string;
  "backtest.col_count": string;
  "backtest.col_date": string;
  "backtest.col_alpha": string;
  "backtest.cohort_pending": string;
  "backtest.disclaimer_title": string;
  "backtest.disclaimer_intro": string;
  "backtest.disclaimer_entry": string;
  "backtest.disclaimer_return": string;
  "backtest.disclaimer_date": string;
  "backtest.disclaimer_no_slippage": string;
  "backtest.disclaimer_no_future": string;
  "backtest.waiting_title": string;
  "backtest.waiting_subtitle": string;
  "backtest.topix_proxy_note": string;
  "backtest.sub_winrate": string;
  "backtest.sub_alpha": string;
  "backtest.sub_recs_suffix": string;
  "backtest.rec_count_suffix": string;
  "backtest.rec_updated_prefix": string;

  // ─── V11: AI Trading Dashboard ──────────────────────────────────────────────
  "dashboard.up": string;
  "dashboard.down": string;
  "dashboard.avg_change": string;
  "dashboard.market_open": string;
  "dashboard.market_closed": string;
  "dashboard.last_updated": string;
  "dashboard.refresh": string;
  "dashboard.realtime": string;
  "dashboard.risk_section": string;
  // Risk alert labels
  "risk.rsi_high": string;
  "risk.rsi_extreme": string;
  "risk.below_ma20": string;
  "risk.near_52w_high": string;
  "risk.vol_spike": string;
  // Realtime field labels
  "field.vol_ratio": string;
  "field.vol_ratio.tip": string;
  "field.turnover": string;
  "field.turnover.tip": string;
  "field.52w_pos": string;
  "field.ma20_above": string;
  "field.ma20_below": string;

  // ─── V12.5: Portfolio Snapshots ─────────────────────────────────────────────
  "portfolio.tab_snapshots": string;
  "portfolio.tab_snapshots_desc": string;
  "portfolio.snap_title": string;
  "portfolio.snap_no_data": string;
  "portfolio.snap_total_assets": string;
  "portfolio.snap_pnl": string;
  "portfolio.snap_return_pct": string;
  "portfolio.snap_positions": string;
  "portfolio.snap_invested": string;
  "portfolio.snap_cash": string;
  "portfolio.snap_expand": string;
  "portfolio.snap_collapse": string;
  "portfolio.snap_entry_price": string;
  "portfolio.snap_current_price": string;
  "portfolio.snap_shares": string;
  "portfolio.snap_entry_amount": string;
  "portfolio.snap_market_value": string;
  "portfolio.snap_pos_pnl": string;
  "portfolio.snap_loading": string;
  "portfolio.snap_holding_days": string;
  "portfolio.snap_days_unit": string;
  "portfolio.snap_topix_return": string;
  "portfolio.snap_alpha": string;
  "portfolio.snap_outperform": string;
  "portfolio.snap_underperform": string;
  "portfolio.snap_detail_error": string;
  "portfolio.snap_no_positions": string;
  "portfolio.snap_section_title": string;
  "portfolio.snap_only_one": string;
  "portfolio.snap_holding_return_pct": string;
  "portfolio.snap_alpha_desc": string;
  "portfolio.snap_card_title_suffix": string;
  // Valuation status badges
  "portfolio.snap_vs_intraday": string;
  "portfolio.snap_vs_closed": string;
  "portfolio.snap_vs_stale": string;
  "portfolio.snap_vs_fallback": string;
  // Per-position price source badges (short)
  "portfolio.snap_ps_yahoo": string;
  "portfolio.snap_ps_daily": string;
  "portfolio.snap_ps_score": string;
  "portfolio.snap_ps_entry": string;
  // Intraday warning (today's snapshot only)
  "portfolio.snap_intraday_warning": string;
  // AI signal stats
  "portfolio.signal_title": string;
  "portfolio.signal_strong_buy": string;
  "portfolio.signal_buy": string;
  "portfolio.signal_all_buy": string;
  "portfolio.signal_rec_count": string;
  "portfolio.signal_today_win": string;
  "portfolio.signal_7d_win": string;
  "portfolio.signal_accumulating": string;
  "portfolio.signal_avg_today": string;
  "portfolio.signal_avg_7d": string;
  "portfolio.signal_no_data": string;
  "portfolio.signal_updated": string;
  "portfolio.signal_price_pending": string;
  "portfolio.signal_awaiting_close": string;
  // v13.0 extended signal stats
  "portfolio.signal_win_short": string;
  "portfolio.signal_loss_short": string;
  "portfolio.signal_flat_short": string;
  "portfolio.signal_best": string;
  "portfolio.signal_worst": string;
  "portfolio.signal_big_up": string;
  "portfolio.signal_small_up": string;
  "portfolio.signal_small_down": string;
  "portfolio.signal_big_down": string;
  "portfolio.signal_unique": string;
  "portfolio.signal_today_section": string;
  "portfolio.signal_7d_section": string;
  // Sim portfolio
  "portfolio.sim_title": string;
  "portfolio.sim_initial_cash": string;
  "portfolio.sim_current_cash": string;
  "portfolio.sim_holdings_value": string;
  "portfolio.sim_total_assets": string;
  "portfolio.sim_realized_pnl": string;
  "portfolio.sim_unrealized_pnl": string;
  "portfolio.sim_return_pct": string;
  "portfolio.sim_reset": string;
  "portfolio.sim_reset_confirm": string;
  "portfolio.sim_holdings_title": string;
  "portfolio.sim_trades_title": string;
  "portfolio.sim_no_holdings": string;
  "portfolio.sim_no_trades": string;
  "portfolio.sim_buy": string;
  "portfolio.sim_sell": string;
  "portfolio.sim_avg_cost": string;
  "portfolio.sim_shares": string;
  "portfolio.sim_market_value": string;
  "portfolio.sim_unrealized": string;
  "portfolio.buy_modal_title": string;
  "portfolio.buy_qty": string;
  "portfolio.buy_amount_est": string;
  "portfolio.buy_cash_after": string;
  "portfolio.buy_confirm": string;
  "portfolio.buy_no_cash": string;
  "portfolio.sell_modal_title": string;
  "portfolio.sell_qty": string;
  "portfolio.sell_amount_est": string;
  "portfolio.sell_pnl_est": string;
  "portfolio.sell_confirm": string;
  "portfolio.sell_all": string;
  "portfolio.trade_action": string;
  "portfolio.trade_price": string;
  "portfolio.trade_amount": string;
  "portfolio.trade_pnl": string;
  // AI Decision page sections (v14.3.0)
  "ad.title": string;
  "ad.operation": string;
  "ad.conclusion": string;
  "ad.top_reasons": string;
  "ad.top_risks": string;
  "ad.no_data": string;
  "tp.title": string;
  "tp.entry_low": string;
  "tp.entry_high": string;
  "tp.stop_loss": string;
  "tp.target1": string;
  "tp.target2": string;
  "tp.position": string;
  "tp.rr_ratio": string;
  "tp.no_plan": string;
  "sb.title": string;
  "sb.overall": string;
  "sb.adaptive_score": string;
  "sb.market_rank": string;
  "ts.title": string;
  "ts.vs_ma20": string;
  "ts.52w_pos": string;
  "ts.volume_ratio": string;
  "ne.title": string;
  "ne.more": string;
  "pc.title": string;
  "pc.phase2": string;
  "detail.chart_title": string;
  "detail.financials_title": string;
  "detail.expand": string;
  "detail.collapse": string;
  "stock.data_as_of": string;
  "stock.no_score": string;

  // ─── v16.0: AI Stock Intelligence ─────────────────────────────────────────
  "ai_risk.title": string;
  "ai_risk.overall": string;
  "ai_risk.technical": string;
  "ai_risk.news": string;
  "ai_risk.fundamental": string;
  "ai_risk.volatility": string;
  "ai_risk.tech.LOW": string;
  "ai_risk.tech.MEDIUM": string;
  "ai_risk.tech.HIGH": string;
  "ai_risk.news.LOW": string;
  "ai_risk.news.MEDIUM": string;
  "ai_risk.news.HIGH": string;
  "ai_risk.fund.LOW": string;
  "ai_risk.fund.MEDIUM": string;
  "ai_risk.fund.HIGH": string;
  "ai_risk.vol.LOW": string;
  "ai_risk.vol.MEDIUM": string;
  "ai_risk.vol.HIGH": string;
  "ai_hist.title": string;
  "ai_hist.total_recs": string;
  "ai_hist.wins": string;
  "ai_hist.losses": string;
  "ai_hist.by_strategy": string;
  "ai_hist.collecting": string;
  "pc.sector_avg": string;
  "pc.your_rank": string;
  "pc.rel_strength": string;
  "pc.top_in_sector": string;
  "pc.vs_sector_avg": string;

  // ─── v17.1: Portfolio Strategy Allocation ─────────────────────────────────
  "portfolio.strategy_overview": string;
  "portfolio.strategy_alloc_target": string;
  "portfolio.strategy_alloc_actual": string;
  "portfolio.strategy_pos_count": string;
  "portfolio.strategy_return": string;
  "portfolio.strategy_legacy_label": string;
  "portfolio.strategy_insufficient": string;
  "portfolio.strategy_unallocated": string;
  "portfolio.snap_strategy": string;
  "portfolio.snap_alloc_weight": string;

  // ─── v15.0: Three-Strategy System ─────────────────────────────────────────
  "strategy.section_title": string;
  "strategy.DAY": string;
  "strategy.SWING": string;
  "strategy.POSITION": string;
  "strategy.DAY.short": string;
  "strategy.SWING.short": string;
  "strategy.POSITION.short": string;
  "strategy.DAY.desc": string;
  "strategy.SWING.desc": string;
  "strategy.POSITION.desc": string;
  "strategy.confidence": string;
  "strategy.target_return": string;
  "strategy.stop_loss": string;
  "strategy.max_days": string;
  "strategy.win_rate": string;
  "strategy.avg_return": string;
  "strategy.avg_alpha": string;
  "strategy.sample_count": string;
  "strategy.collecting": string;
  "strategy.open_count": string;
  "strategy.tab_overall": string;
  "strategy.allocation": string;
  "strategy.days_unit": string;
  "strategy.exit_take_profit": string;
  "strategy.exit_stop_loss": string;
  "strategy.exit_time": string;
  "strategy.exit_open": string;
  "strategy.backtest_title": string;
  "strategy.backtest_subtitle": string;
  "strategy.detail_title": string;
  // Strategy Center (Phase 6)
  "nav.strategyCenter": string;
  "strategy.long": string;
  "strategy.long.short": string;
  "strategy.center.title": string;
  "strategy.center.subtitle": string;
  "strategy.center.overview": string;
  "strategy.learning.grade": string;
  "strategy.learning.integrity": string;
  "strategy.learning.prediction": string;
  "strategy.learning.stability": string;
  "strategy.learning.confidence": string;
  "strategy.learning.recommendation": string;
  "strategy.capital.cash": string;
  "strategy.capital.invested": string;
  "strategy.capital.total": string;
  "strategy.capital.return": string;
  "strategy.backtest.section": string;
  "strategy.position.open_title": string;
  "strategy.position.none": string;
  "strategy.trade.title": string;
  "strategy.trade.none": string;
  "strategy.rec.title": string;
  "strategy.rec.top10": string;
  "strategy.rec.top100": string;
  "strategy.rec.ai_score": string;
  "strategy.legacy.notice": string;
  "strategy.legacy.goto": string;
  "strategy.status.ready": string;
  "strategy.status.partial": string;
  "strategy.status.not_ready": string;
  "strategy.day.status.open": string;
  "strategy.day.status.closed": string;
  "strategy.day.status.waiting": string;
  "strategy.day.status.nodata": string;

  // ─── Strategy Stabilization / T1 ───────────────────────────────────────────
  "strategy.stabilization.tab": string;
  "strategy.stabilization.title": string;
  "strategy.stabilization.frozen": string;
  "strategy.stabilization.period": string;
  "strategy.validation.title": string;
  "strategy.validation.date": string;
  "strategy.validation.allPass": string;
  "strategy.validation.failCount": string;
  "strategy.validation.incident": string;
  "strategy.validation.noData": string;
  "strategy.validation.passRate": string;
  "strategy.validation.check.dayRec": string;
  "strategy.validation.check.swingRec": string;
  "strategy.validation.check.longRec": string;
  "strategy.validation.check.strategy": string;
  "strategy.validation.check.snapshot": string;
  "strategy.validation.check.trade": string;
  "strategy.validation.check.backtest": string;
  "strategy.validation.check.learning": string;
  "strategy.validation.check.health": string;
  "strategy.cumulative.title": string;
  "strategy.cumulative.dayTrades": string;
  "strategy.cumulative.closedTrades": string;
  "strategy.phase7.title": string;
  "strategy.phase7.ready": string;
  "strategy.phase7.not_ready": string;
  "strategy.phase7.conditions": string;
  "strategy.phase7.day100": string;
  "strategy.phase7.swing30": string;
  "strategy.phase7.long20": string;
  "strategy.phase7.gradeB": string;
  "strategy.phase7.swingC": string;
  "strategy.phase7.longC": string;
  "strategy.phase7.health30": string;
  "strategy.reports.tab": string;
  "strategy.reports.title": string;
  "strategy.reports.weekly.title": string;
  "strategy.reports.monthly.title": string;
  "strategy.reports.loading": string;
  "strategy.reports.nodata": string;
  "strategy.reports.select": string;
  "strategy.reports.generated": string;
};

export type MessageKey = keyof Messages;
