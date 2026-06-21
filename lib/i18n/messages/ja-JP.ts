import type { Messages } from "../types";

const jaJP: Messages = {
  // Site
  "site.subtitle": "日本株AIスクリーニング",
  "site.system_name": "TOHOSHOU AI",

  // Navigation
  "nav.dashboard": "ダッシュボード",
  "nav.stocks": "銘柄一覧",
  "nav.indicators": "テクニカル",
  "nav.ai_picks": "AI推薦",
  "nav.ai_theme": "AIテーマ",
  "nav.chat": "AIチャット",
  "nav.screener": "スクリーナー",
  "nav.sectors": "業界分析",
  "nav.watchlist": "ウォッチリスト",
  "nav.news": "ニュース",
  "nav.portfolio": "ポートフォリオ",
  "nav.notifications": "通知設定",
  "nav.sync": "データ同期",
  "nav.data_sources": "データソース",
  "nav.home": "ホーム",
  "nav.supply_chain": "産業",
  "nav.dialogue": "チャット",
  "nav.select": "スクリーン",

  // Ratings
  "rating.STRONG_BUY": "強い買い",
  "rating.BUY": "買い",
  "rating.HOLD": "保有",
  "rating.WATCH": "注目",
  "rating.AVOID": "見送り",

  // Trading actions
  "action.BUY_NOW": "今すぐ買い",
  "action.WAIT_PULLBACK": "押し目待ち",
  "action.HOLD": "保有継続",
  "action.TAKE_PROFIT": "利益確定",
  "action.SELL": "売却",
  "action.AVOID": "見送り",

  // Risk levels
  "risk.LOW": "低リスク",
  "risk.MEDIUM": "中リスク",
  "risk.HIGH": "高リスク",
  "risk.EXTREME": "超高リスク",

  // RSI 5 levels
  "rsi.oversold": "売られ過ぎ",
  "rsi.normal": "正常",
  "rsi.hot": "過熱気味",
  "rsi.overbought": "買われ過ぎ",
  "rsi.extreme_overbought": "極度買われ過ぎ",

  // MACD trend
  "macd.trend_label": "トレンドシグナル",
  "macd.bullish": "強気",
  "macd.bearish": "弱気",
  "macd.neutral": "中立",

  // Score dimensions
  "dim.technical": "テクニカル",
  "dim.fundamental": "ファンダメンタル",
  "dim.money_flow": "資金フロー",
  "dim.sentiment": "センチメント",
  "dim.global": "グローバル",

  // Stock styles
  "style.QUALITY_COMPOUNDER": "高品質複利型",
  "style.GROWTH_MOMENTUM": "成長モメンタム",
  "style.CYCLICAL_EXPORTER": "輸出景気循環",
  "style.VALUE_DEFENSIVE": "バリュー守備",
  "style.DOMESTIC_DEFENSIVE": "内需守備",
  "style.SPECULATIVE_MOMENTUM": "投機モメンタム",
  "style.short.QUALITY_COMPOUNDER": "高品質",
  "style.short.GROWTH_MOMENTUM": "成長",
  "style.short.CYCLICAL_EXPORTER": "循環",
  "style.short.VALUE_DEFENSIVE": "バリュー",
  "style.short.DOMESTIC_DEFENSIVE": "内需",
  "style.short.SPECULATIVE_MOMENTUM": "投機",
  "style.all": "全スタイル",

  // AI Action card
  "ai_action.title": "AI売買シグナル",
  "ai_action.position_size": "推奨ポジション",
  "ai_action.entry_range": "エントリー範囲",
  "ai_action.stop_loss": "損切りライン",
  "ai_action.target1": "目標①",
  "ai_action.target2": "目標②",
  "ai_action.reasons": "シグナル根拠",
  "ai_action.warnings": "リスク警告",
  "ai_action.disclaimer": "AIルールエンジンの出力です。投資判断の参考情報であり、推奨ではありません。",
  "ai_action.risk_level": "リスクレベル",
  "ai_action.of_portfolio": "保有比率",

  // Stock detail
  "stock.back_to_list": "← 銘柄一覧へ",
  "stock.add_watchlist": "ウォッチリスト追加",
  "stock.in_watchlist": "追加済み",
  "stock.close_price": "終値",
  "stock.5d_return": "5日騰落率",
  "stock.20d_return": "20日騰落率",
  "stock.60d_return": "60日騰落率",
  "stock.52w_high": "52週高値",
  "stock.52w_low": "52週安値",
  "stock.no_ai_data": "AI評価データなし",
  "stock.market_rank": "市場順位",
  "stock.opportunity_score": "チャンススコア",
  "stock.high_risk": "高リスク",
  "stock.steady": "安定",
  "stock.data_notice": "データ注意",
  "stock.large_move_warning": "この銘柄は最近大きく変動しています。AI評価は修正株価で計算されており、参考情報です。",
  "stock.score_source.REAL": "✅ J-Quants 実データ",
  "stock.score_source.PARTIAL": "⚠️ 部分実データ",
  "stock.score_source.FALLBACK": "🔴 推定データ",
  "stock.style_label": "スタイル",

  // Tabs
  "tab.overview": "概要",
  "tab.chart": "価格チャート",
  "tab.financials": "財務",
  "tab.technical": "テクニカル",
  "tab.ai": "AI評価",
  "tab.news": "最新ニュース",

  // Screener
  "screener.title": "AI銘柄選定",
  "screener.search_placeholder": "銘柄コードまたは会社名検索…",
  "screener.all": "すべて",
  "screener.all_styles": "全スタイル",
  "screener.all_markets": "全市場",
  "screener.col_stock": "銘柄",
  "screener.col_market": "市場",
  "screener.col_style": "スタイル",
  "screener.col_price": "株価",
  "screener.col_20d": "20日",
  "screener.col_adaptive": "AI評価",
  "screener.col_percentile": "市場順位",
  "screener.col_opportunity": "チャンス",
  "screener.col_tech": "テク",
  "screener.col_fund": "財務",
  "screener.col_flow": "資金",
  "screener.col_news": "感情",
  "screener.col_rating": "評価",
  "screener.no_results": "該当銘柄なし",
  "screener.hint": "キーワードなし：上位200銘柄を表示。キーワードあり：全市場検索。列ヘッダーでソート。",
  "screener.searching": "検索中…",
  "screener.result_count": "銘柄",
  "screener.bull_count": "買いシグナル",
  "screener.updated": "更新",

  // Market temperature
  "temp.HOT": "🔥 過熱",
  "temp.WARM": "☀️ 強め",
  "temp.NEUTRAL": "🌤 中立",
  "temp.COLD": "❄️ 弱め",
  "temp.EXTREME_COLD": "🧊 極冷",

  // News
  "news.title": "ニュース",
  "news.all": "すべて",
  "news.positive": "🟢 好材料",
  "news.negative": "🔴 悪材料",
  "news.neutral": "⚪ 中立",
  "news.all_categories": "全カテゴリ",
  "news.earnings": "決算",
  "news.guidance": "業績修正",
  "news.dividend": "配当",
  "news.buyback": "自己株",
  "news.ir": "IR開示",
  "news.market_cat": "マーケット",
  "news.all_sources": "全ソース",
  "news.stock_specific": "個株専属 ≥70%",
  "news.market_only": "市場ニュース",
  "news.no_data": "ニュースデータなし",

  // Health / Sync
  "health.title": "データ健全性ガード",
  "health.allowed": "AI推薦有効",
  "health.blocked": "AI推薦停止中",
  "health.critical": "重大異常",
  "health.warning": "警告",
  "health.pass": "正常",
  "health.last_checked": "最終確認",
  "health.never_run": "未実行",
  "health.requires_review": "要レビュー",

  // Indicators
  "ind.title": "テクニカル指標ランキング",
  "ind.macd_bullish_count": "MACD 強気",
  "ind.macd_bearish_count": "MACD 弱気",
  "ind.ma_up": "移動平均上昇",
  "ind.extreme_overbought": "極度買われ過ぎ≥90",
  "ind.overbought_range": "過熱/買われ過ぎ70-89",
  "ind.oversold": "売られ過ぎ≤30",
  "ind.ai_buy_now": "AI 今すぐ買い",
  "ind.rsi_legend": "RSI区分",
  "ind.macd_note": "MACDはトレンド方向を示します。売買判断はAIシグナルを参照してください",
  "ind.col_ma_trend": "移動平均トレンド",
  "ind.col_rsi": "RSI(14)",
  "ind.col_trend_signal": "トレンドシグナル",
  "ind.col_ai_action": "AI売買シグナル",
  "ind.ranking": "ランキング",
  "ind.heatmap": "ヒートマップ",
  "ind.base_date": "基準日",

  // Common
  "common.loading": "読み込み中…",
  "common.search": "検索",
  "common.filter": "フィルター",
  "common.reset": "リセット",
  "common.close": "閉じる",
  "common.all": "すべて",
  "common.score": "スコア",
  "common.rank": "ランク",
  "common.market": "市場",
  "common.sector": "セクター",
  "common.symbol": "コード",
  "common.name": "銘柄名",
  "common.price": "株価",
  "common.no_data": "データなし",
  "common.language": "言語",
  "common.not_overbought": "過熱なし",
  "common.load_error": "読み込みエラー",
  "common.ai_score_tab": "AI評価",

  // AI Action card (additional)
  "ai_action.action_label": "推奨",
  "ai_action.holding_period": "保有期間",
  "ai_action.holding_1_3m": "1〜3ヶ月",

  // Stock detail (additional)
  "stock.back": "← 戻る",
  "stock.close": "終値",

  // Screener (additional)
  "screener.col_action": "売買判断",
  "screener.col_position": "推奨比率",
  "screener.col_risk": "リスク",
  "screener.col_rsi": "RSI",

  // AI Picks page
  "picks.title": "AIおすすめ",
  "picks.position": "推奨比率",
  "picks.risk": "リスク",
  "picks.action": "売買判断",
  "picks.ai_score": "AI総合スコア",
  "picks.opportunity": "チャンススコア",

  // Sectors page
  "sectors.title": "業界分析",
  "sectors.hot": "注目セクター",
  "sectors.weak": "注意セクター",
  "sectors.avg_score": "平均AIスコア",
  "sectors.avg_20d": "20日平均騰落率",
  "sectors.buy_count": "買い推奨数",
  "sectors.buy_rate": "買い推奨率",
  "sectors.stock_count": "銘柄数",
  "sectors.top_stocks": "代表銘柄",

  // Dashboard / home
  "home.title": "TOHOSHOU AI",
  "home.subtitle": "日本株AIスクリーニング",
  "home.market_temp": "マーケット温度",
  "home.top_picks": "AI注目銘柄",
  "home.recent_news": "最新ニュース",
  "home.view_all": "すべて見る",

  // Watchlist
  "watchlist.title": "ウォッチリスト",
  "watchlist.empty": "ウォッチリストは空です",
  "watchlist.remove": "削除",

  // Portfolio
  "portfolio.title": "ポートフォリオ",
  "portfolio.empty": "保有銘柄がありません",

  // Notifications
  "notif.title": "通知設定",

  // Chat
  "chat.title": "AIチャット",
  "chat.placeholder": "質問を入力してください（例：今注目の銘柄は？）",
  "chat.send": "送信",

  // AI Theme
  "theme.title": "AI投資テーマ",
  "theme.core": "コア銘柄",
  "theme.related": "関連銘柄",

  // Stocks list
  "stocks.title": "銘柄一覧",
  "stocks.search_placeholder": "銘柄コードまたは会社名検索…",

  // Empty / Error states
  "empty.no_score": "評価データなし",
  "empty.no_news": "ニュースがありません",
  "empty.retry": "時間をおいて再度お試しください",
  "error.fetch_failed": "データ取得に失敗しました",

  // Sync additional
  "sync.title": "データ同期",
  "sync.refresh": "↺ 更新",
  "sync.refreshing": "更新中…",
  "sync.run_all": "▶ 一括同期",
  "sync.syncing": "同期中…",

  // Technical indicators (additional)
  "ind.stock_col": "銘柄",
  "ind.price_col": "株価",

  // New simplified nav
  "nav.aiScreener": "AI銘柄選定",
  "nav.aiValueChain": "AI投資テーマ",
  "nav.myInvestments": "マイ投資",
  "nav.systemStatus": "システム状態",
  "nav.admin": "管理者",

  // My Investments tabs
  "tabs.watchlist": "ウォッチリスト",
  "tabs.portfolio": "ポートフォリオ",
  "tabs.priceAlerts": "価格アラート",

  // Chat moved notice
  "chat.movedToLine": "AIチャットはLINE Botでご利用ください",

  // Page merged notices
  "page.merged_screener": "このページはAI銘柄選定に統合されました",
  "page.go_screener": "AI銘柄選定へ",
  "page.merged_portfolio": "このページはマイ投資に統合されました",
  "page.go_portfolio": "マイ投資へ",

  // TOP500
  "top500.title": "TOP500 銘柄",
};

export default jaJP;
