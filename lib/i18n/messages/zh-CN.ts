import type { Messages } from "../types";

const zhCN: Messages = {
  // Site
  "site.subtitle": "日本AI选股系统",
  "site.system_name": "TOHOSHOU AI",

  // Navigation
  "nav.dashboard": "仪表盘",
  "nav.stocks": "股票列表",
  "nav.indicators": "技术指标",
  "nav.ai_picks": "AI推荐",
  "nav.ai_theme": "AI产业链",
  "nav.chat": "AI对话",
  "nav.screener": "全市场筛选",
  "nav.sectors": "行业分析",
  "nav.watchlist": "自选股",
  "nav.news": "新闻资讯",
  "nav.portfolio": "持仓管理",
  "nav.notifications": "通知管理",
  "nav.sync": "数据同步",
  "nav.data_sources": "数据来源",
  "nav.home": "首页",
  "nav.supply_chain": "产业链",
  "nav.dialogue": "对话",
  "nav.select": "筛选",

  // Ratings
  "rating.STRONG_BUY": "强烈买入",
  "rating.BUY": "买入",
  "rating.HOLD": "持有",
  "rating.WATCH": "观察",
  "rating.AVOID": "回避",

  // Trading actions
  "action.BUY_NOW": "立即买入",
  "action.WAIT_PULLBACK": "等待回调",
  "action.HOLD": "继续持有",
  "action.TAKE_PROFIT": "分批止盈",
  "action.SELL": "卖出",
  "action.AVOID": "暂不参与",

  // Risk levels
  "risk.LOW": "低风险",
  "risk.MEDIUM": "中风险",
  "risk.HIGH": "高风险",
  "risk.EXTREME": "极高风险",

  // RSI 5 levels
  "rsi.oversold": "超卖",
  "rsi.normal": "正常",
  "rsi.hot": "偏热",
  "rsi.overbought": "超买",
  "rsi.extreme_overbought": "极度超买",

  // MACD trend
  "macd.trend_label": "趋势信号",
  "macd.bullish": "多头",
  "macd.bearish": "空头",
  "macd.neutral": "中性",

  // Score dimensions
  "dim.technical": "技术面",
  "dim.fundamental": "基本面",
  "dim.money_flow": "资金面",
  "dim.sentiment": "市场情绪",
  "dim.global": "全球市场",

  // Stock styles
  "style.QUALITY_COMPOUNDER": "质优复利",
  "style.GROWTH_MOMENTUM": "成长动能",
  "style.CYCLICAL_EXPORTER": "出口周期",
  "style.VALUE_DEFENSIVE": "价值防御",
  "style.DOMESTIC_DEFENSIVE": "内需防御",
  "style.SPECULATIVE_MOMENTUM": "投机动能",
  "style.short.QUALITY_COMPOUNDER": "质优",
  "style.short.GROWTH_MOMENTUM": "成长",
  "style.short.CYCLICAL_EXPORTER": "周期",
  "style.short.VALUE_DEFENSIVE": "价值",
  "style.short.DOMESTIC_DEFENSIVE": "内需",
  "style.short.SPECULATIVE_MOMENTUM": "投机",
  "style.all": "全部风格",

  // AI Action card
  "ai_action.title": "AI交易决策",
  "ai_action.position_size": "建议仓位",
  "ai_action.entry_range": "入场区间",
  "ai_action.stop_loss": "止损位",
  "ai_action.target1": "目标1",
  "ai_action.target2": "目标2",
  "ai_action.reasons": "信号依据",
  "ai_action.warnings": "风险警示",
  "ai_action.disclaimer": "以上为AI规则引擎输出，仅供参考，不构成投资建议。",
  "ai_action.risk_level": "风险等级",
  "ai_action.of_portfolio": "仓位",

  // Stock detail
  "stock.back_to_list": "← 股票列表",
  "stock.add_watchlist": "加入自选",
  "stock.in_watchlist": "已加自选",
  "stock.close_price": "收盘价",
  "stock.5d_return": "5日涨跌",
  "stock.20d_return": "20日涨跌",
  "stock.60d_return": "60日涨跌",
  "stock.52w_high": "52周最高",
  "stock.52w_low": "52周最低",
  "stock.no_ai_data": "暂无AI评分数据",
  "stock.market_rank": "市场排名",
  "stock.opportunity_score": "机会分",
  "stock.high_risk": "高风险",
  "stock.steady": "稳健",
  "stock.data_notice": "数据提醒",
  "stock.large_move_warning": "该股票近期存在大幅价格波动，AI评分已使用复权价格处理，仅供参考。",
  "stock.score_source.REAL": "✅ J-Quants 真实数据",
  "stock.score_source.PARTIAL": "⚠️ 部分真实",
  "stock.score_source.FALLBACK": "🔴 回测估算",
  "stock.style_label": "风格",

  // Tabs
  "tab.overview": "概览",
  "tab.chart": "价格图表",
  "tab.financials": "财务",
  "tab.technical": "技术指标",
  "tab.ai": "AI评分",
  "tab.news": "最新新闻",

  // Screener
  "screener.title": "AI选股",
  "screener.search_placeholder": "搜索代码或名称…",
  "screener.all": "全部",
  "screener.all_styles": "全部风格",
  "screener.all_markets": "全部市场",
  "screener.col_stock": "股票",
  "screener.col_market": "市场",
  "screener.col_style": "风格",
  "screener.col_price": "价格",
  "screener.col_20d": "20日",
  "screener.col_adaptive": "AI评分",
  "screener.col_percentile": "市场排名",
  "screener.col_opportunity": "机会分",
  "screener.col_tech": "技术",
  "screener.col_fund": "基本",
  "screener.col_flow": "资金",
  "screener.col_news": "情绪",
  "screener.col_rating": "评级",
  "screener.no_results": "无匹配股票",
  "screener.hint": "无关键词：按评分取前200。有关键词：全市场搜索。点击表头排序。",
  "screener.searching": "搜索中…",
  "screener.result_count": "只股票",
  "screener.bull_count": "看多",
  "screener.updated": "更新于",

  // Market temperature
  "temp.HOT": "🔥 过热",
  "temp.WARM": "☀️ 偏暖",
  "temp.NEUTRAL": "🌤 中性",
  "temp.COLD": "❄️ 偏冷",
  "temp.EXTREME_COLD": "🧊 极冷",

  // News
  "news.title": "新闻资讯",
  "news.all": "全部",
  "news.positive": "🟢 利好",
  "news.negative": "🔴 利空",
  "news.neutral": "⚪ 中性",
  "news.all_categories": "全分类",
  "news.earnings": "财报",
  "news.guidance": "业绩修正",
  "news.dividend": "分红",
  "news.buyback": "回购",
  "news.ir": "IR公告",
  "news.market_cat": "市场",
  "news.all_sources": "全部来源",
  "news.stock_specific": "个股专属",
  "news.market_only": "市场新闻",
  "news.no_data": "暂无新闻数据",

  // Health / Sync
  "health.title": "数据健康守卫",
  "health.allowed": "AI推荐已允许",
  "health.blocked": "AI推荐已暂停",
  "health.critical": "严重异常",
  "health.warning": "警告",
  "health.pass": "通过",
  "health.last_checked": "最后检查",
  "health.never_run": "从未运行",
  "health.requires_review": "需人工复查",

  // Indicators
  "ind.title": "技术指标排行",
  "ind.macd_bullish_count": "MACD 多头",
  "ind.macd_bearish_count": "MACD 空头",
  "ind.ma_up": "均线上涨",
  "ind.extreme_overbought": "极度超买≥90",
  "ind.overbought_range": "偏热/超买70-89",
  "ind.oversold": "RSI超卖≤30",
  "ind.ai_buy_now": "AI 立即买入",
  "ind.rsi_legend": "RSI分级",
  "ind.macd_note": "MACD显示趋势方向，不代表买卖建议 · 买卖动作以AI交易动作为准",
  "ind.col_ma_trend": "均线趋势",
  "ind.col_rsi": "RSI(14)",
  "ind.col_trend_signal": "趋势信号",
  "ind.col_ai_action": "AI交易动作",
  "ind.ranking": "排行榜",
  "ind.heatmap": "热力图",
  "ind.base_date": "基准日",

  // Common
  "common.loading": "加载中…",
  "common.search": "搜索",
  "common.filter": "筛选",
  "common.reset": "重置",
  "common.close": "关闭",
  "common.all": "全部",
  "common.score": "评分",
  "common.rank": "排名",
  "common.market": "市场",
  "common.sector": "行业",
  "common.symbol": "代码",
  "common.name": "名称",
  "common.price": "价格",
  "common.no_data": "暂无数据",
  "common.language": "语言",
  "common.not_overbought": "非超买",
  "common.load_error": "加载失败",
  "common.ai_score_tab": "AI评分",

  // AI Action card (additional)
  "ai_action.action_label": "建议",
  "ai_action.holding_period": "持有周期",
  "ai_action.holding_1_3m": "1～3个月",

  // Stock detail (additional)
  "stock.back": "← 返回",
  "stock.close": "收盘价",

  // Screener (additional)
  "screener.col_action": "交易动作",
  "screener.col_position": "建议仓位",
  "screener.col_risk": "风险等级",
  "screener.col_rsi": "RSI",
  "screener.combined_description": "整合股票列表、AI推荐与全市场筛选",

  // AI Picks page
  "picks.title": "AI推荐",
  "picks.position": "建议仓位",
  "picks.risk": "风险等级",
  "picks.action": "交易动作",
  "picks.ai_score": "AI综合评分",
  "picks.opportunity": "机会评分",

  // Sectors page
  "sectors.title": "行业分析",
  "sectors.hot": "热门行业",
  "sectors.weak": "注意行业",
  "sectors.avg_score": "平均AI评分",
  "sectors.avg_20d": "20日平均涨跌",
  "sectors.buy_count": "买入数量",
  "sectors.buy_rate": "买入比例",
  "sectors.stock_count": "股票数量",
  "sectors.top_stocks": "代表股票",

  // Dashboard / home
  "home.title": "TOHOSHOU AI",
  "home.subtitle": "日本AI选股系统",
  "home.market_temp": "市场温度",
  "home.top_picks": "AI精选",
  "home.recent_news": "最新资讯",
  "home.view_all": "查看全部",

  // Watchlist
  "watchlist.title": "自选股",
  "watchlist.empty": "暂无自选股，去筛选页添加",
  "watchlist.remove": "移除",

  // Portfolio
  "portfolio.title": "持仓管理",
  "portfolio.empty": "暂无持仓记录",

  // Notifications
  "notif.title": "通知管理",

  // Chat
  "chat.title": "AI对话",
  "chat.placeholder": "输入问题，如：最近哪些股票值得关注？",
  "chat.send": "发送",

  // AI Theme
  "theme.title": "AI产业链",
  "theme.core": "核心标的",
  "theme.related": "关联标的",

  // Stocks list
  "stocks.title": "股票列表",
  "stocks.search_placeholder": "搜索代码或名称…",
  "stocks.view_technicals": "查看技术指标",

  // Empty / Error states
  "empty.no_score": "暂无评分",
  "empty.no_news": "暂无新闻",
  "empty.retry": "请稍后重试",
  "error.fetch_failed": "数据获取失败",

  // Sync additional
  "sync.title": "数据同步",
  "sync.refresh": "↺ 刷新状态",
  "sync.refreshing": "刷新中…",
  "sync.run_all": "▶ 全部同步",
  "sync.syncing": "同步中…",

  // Technical indicators (additional)
  "ind.stock_col": "股票",
  "ind.price_col": "价格",

  // New simplified nav
  "nav.aiScreener": "AI选股",
  "nav.aiValueChain": "AI产业链",
  "nav.myInvestments": "我的投资",
  "nav.systemStatus": "系统状态",
  "nav.admin": "管理员",

  // My Investments tabs
  "tabs.watchlist": "自选股",
  "tabs.portfolio": "持仓",
  "tabs.priceAlerts": "价格提醒",

  // Chat moved notice
  "chat.movedToLine": "AI对话已迁移至 LINE Bot",

  // Page merged notices
  "page.merged_screener": "此页面已合并至 AI选股",
  "page.go_screener": "前往 AI选股",
  "page.merged_portfolio": "此页面已合并至我的投资",
  "page.go_portfolio": "前往我的投资",
  "page.stocks_top500_desc": "完整选股功能请前往 AI选股。本页仅保留 TOP500 快速查看。",
  "page.loading_failed_screener": "数据加载失败，请前往 AI选股查看完整列表。",
  "page.back_to_dashboard": "返回仪表盘",

  // TOP500
  "top500.title": "TOP500 股票",

  // Home page labels
  "home.ai_top3": "AI精选 TOP3",
  "home.full_ranking": "查看全部",
  "home.buy_picks": "买入机会",
  "home.watch_label": "观察名单",
  "home.screener_count": "股票总数",
  "home.strong_buy_plus_buy": "强烈买入 + 买入",
  // Dashboard stat cards
  "home.db_stocks": "数据库股票",
  "home.scored_count": "已计算评分",
  "home.buy_recommendation": "买入推荐",
  "home.price_records": "日线价格",
  "home.last_sync": "最后同步",
  "home.unit_stocks": "只",
  "home.unit_records": "条",
  // Dashboard section labels
  "home.no_score_hint": "暂无评分数据，请运行",
  "home.watch_monitoring": "监控中",
  "home.ai_scored": "已完成AI评分",
  "home.ranking_title": "AI 评分排行",
  "home.screener_link": "筛选排序 →",
  "home.show_top100": "仅显示前100条。",
  "home.view_screener": "前往筛选器查看全部 →",

  // Generic table headers
  "table.stock": "股票",
  "table.price": "股价",
  "table.date": "日期",
  "table.ma_trend": "均线趋势",
  "table.financials": "财务",
  "table.detail": "详情",
  "table.trend": "趋势",
  "table.tech": "技术",
  "table.fund": "基本",
  "table.adaptive": "AI评分",
  "table.rating": "评级",

  // MA trend labels
  "trend.golden": "多头（黄金交叉）",
  "trend.bullish": "强势",
  "trend.neutral": "中性",
  "trend.bearish": "弱势",
  "trend.dead": "空头（死亡交叉）",

  // Market board labels
  "market.prime": "主板",
  "market.standard": "标准",
  "market.growth": "成长",

  // Dim short labels
  "dim.tech_short": "技术",
  "dim.fund_short": "基本",
  "dim.flow_short": "资金",
  "dim.news_short": "情绪",
  "dim.global_short": "全球",

  // AI Picks detail
  "picks.detail_rating": "评级详情",
  "picks.mode_top": "综合评分",
  "picks.mode_opp": "稳健机会",
  "picks.mode_risk": "高风险动能",
  "picks.detail_ai": "AI分析",
  "picks.adaptive": "AI综合分",
  "picks.percentile_rank": "市场排名",

  // Stock detail labels
  "stock.ma_lines": "均线系统",
  "stock.oscillators": "震荡指标",
  "stock.price_30d": "30日价格走势",
  "stock.full_chart": "查看完整图表",
  "stock.moving_averages": "移动平均线",
  "stock.vs_price": "较现价",
  "stock.chart_title": "股价走势图",
  "stock.close_label": "收盘",
  "stock.financials_title": "财务数据（J-Quants）",

  // Mobile card
  "card.price": "股价",
  "card.5d": "5日",
  "card.20d": "20日",
  "card.opp": "机会",

  // Sectors
  "sectors.screener_link": "AI选股 →",

  // AI Value Chain
  "theme.stat_tracked": "追踪总数",
  "theme.stat_core": "核心标的",
  "theme.stat_buy": "买入以上",
  "theme.stat_avg_score": "平均评分",
  "theme.stat_categories": "产业链分类",
  "theme.stat_layers": "供应链层",
  "theme.stat_top_score": "最高分",
  "theme.unit_stocks": "只",
  "theme.chain_title": "AI产业链结构",
  "theme.search_placeholder": "搜索股票名/symbol/角色/HBM/封装…",
  "theme.layer_all": "所有层级",
  "theme.rec_all": "所有评级",
  "theme.core_toggle": "核心标的",
  "theme.sort_label": "排序：",
  "theme.sort_ai_score": "AI评分",
  "theme.sort_opportunity": "机会分",
  "theme.sort_importance": "重要度",
  "theme.sort_rank": "排名",
  "theme.sort_dividend": "股息分",
  "theme.sort_catalyst": "催化分",
  "theme.categories_overview": "14分类概览",
  "theme.detail_subtitle": "产业链详情",
  "theme.detail_link": "详情→",
  "theme.loading": "加载AI产业链地图…",
  "theme.loading_detail": "加载产业链详情…",
  "theme.error_load": "加载失败：",
  "theme.back_link": "← 返回AI产业链地图",
  "theme.chain_structure": "产业链结构",
  "theme.pending_score": "待评分",
  "theme.pending_calc": "待 AI 评分计算，下次运行后自动更新。",
  "theme.high_risk": "高风险",
  "theme.dividend_label": "股息",
  "theme.catalyst_label": "催化",
  "theme.avg_score_label": "均分",
  "theme.detail_sorted": "按产业链重要度排序",
  "theme.search_label": "搜索：",
  "theme.core_only_label": "仅核心",
  "theme.empty_data": "暂无数据",
  "theme.tab_all": "全部",
  "theme.tab_hardware": "AI硬件",
  "theme.tab_semi_eq": "半导体设备",
  "theme.tab_test_eq": "测试设备",
  "theme.tab_chip_mat": "芯片材料",
  "theme.tab_hbm": "HBM封装",
  "theme.tab_server_dc": "数据中心",
  "theme.tab_robot": "机器人",
  "theme.tab_sw_cloud": "软件云",
  "theme.tab_medical": "医疗AI",
  "theme.tab_energy": "能源基础设施",

  // ─── Common additions ────────────────────────────────────────────────────
  "common.percentile_prefix": "前",
  "common.clear_filter": "清除",

  // ─── Theme page additions ─────────────────────────────────────────────────
  "theme.sub_categories": "细分主题",
  "theme.active_layers": "活跃层级",
  "theme.scored_prefix": "评分：",
  "theme.run_cmd": "请运行：",
  "theme.not_found": "主题不存在",
  "theme.total_stocks": "股票总数",
  "theme.scored_count_label": "已评分",

  // ─── Sectors page additions ───────────────────────────────────────────────
  "sectors.unit_sector": "个行业",
  "sectors.unit_stock_suffix": "只股票",

  // ─── Stock page additions ─────────────────────────────────────────────────
  "stock.hist_label": "柱状",
  "stock.returns_label": "阶段涨跌",
  "stock.no_financials": "暂无财务数据",

  // ─── News additions ───────────────────────────────────────────────────────
  "news.no_stock_news": "暂无该股专属新闻，显示最新市场动态",
  "news.stock_badge": "个股",

  // ─── Financials table ─────────────────────────────────────────────────────
  "fin.period": "期间",
  "fin.revenue": "营业收入",
  "fin.op_profit": "营业利润",
  "fin.net_profit": "净利润",
  "fin.equity_ratio": "自有资本比率",
  "fin.reported_at": "发布日",
  "fin.full_year": "全年",
};

export default zhCN;
