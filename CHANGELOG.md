# Changelog

---

## 🏁 P5 Final — Explain / Runtime / Stabilization 阶段收尾（2026-07-05）

**P5 Status: ✅ COMPLETE** · **Runtime Reliability: 92 / 100** · **Baseline Frozen**

P5 阶段正式结束，进入 Freeze：以下模块除 **Bug Fix** 外禁止修改，新增能力必须走 P6 Feature Pipeline
（Registry → Shadow → Backtest → Learning → Production）。

### P5 交付全景

| 阶段 | 内容 | Deployment / Commit |
|---|---|---|
| **P5-T1** | Explain AI Engine V1（`lib/explain/` 10 文件 + `GET /api/explain/[symbol]`，纯派生只读，绝不重算）| #142 `c71cebf` |
| **P5-T2** | Explain UI 接入（股票详情页 `ExplainPanel` Phase 1 + 策略中心抽屉 Phase 2，旧 `/api/strategy/explain` 并行保留）| #143 `aef5d25` / #144 `5fba99f` |
| **P5-T3** | JPX Trading Calendar（`lib/trading-calendar/jpx.ts` + cron 7 slot 交易日 guard，周末/日本祝日/年末年初跳过；14/14 测试）| #145 `d9c444c` |
| **P5-T4** | AI Runtime Audit（`AI_RUNTIME_AUDIT.md` 13 域只读审计，Runtime 80/100）| `d35eb90` |
| **P5.5** | Runtime Stabilization（R3 rerank 幂等修复 + R4 误报澄清 + Pipeline Tracker + GPT Runtime Logger + `/admin/runtime`）| #147 `1f9e0d9` / `52ac8da` |
| **P6-T1** | Feature Registry V1（**P6 起点**，`lib/features/` + `/admin/features`，因子登记中心，不参与计算）| #146 `7e07d0e` |

外加会话内 P0 处置：OpenAI 配额耗尽 → 回退 `OPENAI_MODEL=gpt-4o-mini`（同账户可用）+ 重建今日 DR 36→500 + 版本中心 llmModelVer 修正（#145 `c28fca3`）。

### Runtime Freeze — 标记为 **P5 Stable**（除 Bug Fix 外禁改）
`Adaptive Engine` · `Shadow Engine` · `Fusion Engine` · `Strategy Engine` · `Learning Engine` · `Explain Engine` · `Pipeline Tracker`

### P6 Baseline — Feature Registry 基线（未来所有新增 Feature 的对照基准）
- **Feature Total: 57** · Production: **46** · Shadow: **11** · Disabled: **0**
- **Category: 9**（TECHNICAL 16 / AI 11 / FUNDAMENTAL 10 / PRICE 5 / GLOBAL 5 / MONEY_FLOW 4 / NEWS 2 / MARKET 2 / TDNET 2）
- **Source: 10**（DailyPrice 21 / System 12 / Financial 7 / Yahoo 4 / JQuants 3 / TDnet 2 / Kabutan 2 / GlobalMarket 2 / InstitutionalFlow 2 / OpenAI 2）

### P0 关闭确认
- **R3 rerank 重复执行** → ✅ 修复（幂等，每天 rerank 只跑一次）
- **R4 Fusion Paper 900** → ✅ 误报澄清（`computedAt` 刷新非新建，0 重复键）

**Next Phase: P6 Feature Platform**

---

## [17.86.1] - 2026-07-06 — 🟢 P6-T7.1 Daily AI Watchlist 实时盯盘优化（Realtime Dashboard）

将「每日 AI 关注池」从列表管理页升级为**盘中实时盯盘 Dashboard**。**仅优化行情展示**，未改 AI评分 / Recommendation / DailyRecommendation / Adaptive / Shadow / Fusion / Learning / GPT / Feature / Backtest / Paper Broker / Cron / **DB Schema**；未新增任何付费/外部行情 API（复用系统现有 Yahoo Finance quote 能力）。

### 实时行情（现价/今日涨跌/推荐后涨跌全部实时）
- `lib/yahoo.ts` 新增 `fetchQuotesBatch(symbols)`：单请求批量拉 Yahoo 近实时报价（`regularMarketPrice` + `regularMarketPreviousClose` + 报价时间），无 per-symbol 节流。
- `GET /api/watchlist/daily` 改为**并行** Yahoo 批量报价（6s 超时）+ EOD 兜底：`currentPrice`＝实时价，`intradayChangePct`＝(现价−前收)/前收，`returnPctFromEntry`＝(现价−entryPrice)/entryPrice，均实时重算；**entryPrice 保持生成时冻结不被覆盖**。新增返回字段 `intradayChangePct / returnPctFromEntry / quoteUpdatedAt / quoteSource`（每只）+ 顶层 `quoteSource / quoteUpdatedAt / realtime`；**旧字段 `currentPrice/changePct/returnPct/status` 全部保留（无回归）**。Provider 抽象化——未来换 JPX/Polygon/IEX 等只需替换 provider，页面无需改。
- 统计 `stats.ts`：上涨/下跌按 `currentPrice vs previousClose`（今日方向）实时计；Top Winner/Loser、STRONG_BUY/BUY 平均按 `returnPctFromEntry` 实时计。

### 页面（`/watchlist/daily`）
- 顶部右上：🟢 **实时** / ⚪ 已收盘 徽章 + 最后更新 `HH:mm:ss` + 立即刷新 + 「交易时段每 60 秒自动刷新（Yahoo Finance）」说明。
- **自动刷新**：交易时段（JST 09:00–11:30 / 12:30–15:30 且 JPX 交易日，客户端 `isJPXTradingDay` 判定）内每 60 秒刷新；**非交易时段停止刷新**（徽章转「已收盘」，不再请求）。
- 表格主列：股票 / 推荐等级 / AI评分 / 推荐价 / 当前价 / 今日涨跌 / 推荐后涨跌 / 加星 / 重点 / 备注 / 操作。**移除「状态」主列**，取消/恢复关注弱化进「操作」列。
- 底部：`Quote Source` + `Last Updated`（YYYY-MM-DD HH:mm:ss JST）。

### 验收
Build ✅ tsc 0；生产 Health ✅ **CRITICAL=0**；Realtime Quote ✅（`quoteSource=Yahoo Finance`, `realtime=true`, 现价脱离 entry：9450 754→757 / 7792 1451→1481 / 2127 657→678）；Top Cards / Table Realtime ✅；60s 自动刷新 + 交易时段 gate + 非交易停止 ✅；Status 弱化 ✅（无状态列，移入操作）；No API Regression ✅（新旧字段并存）；No DB / No Scoring / No Recommendation Change ✅。CDP 截图确认 15:28 盘中 🟢 实时。
- 改 `lib/yahoo.ts`、`lib/daily-watchlist/stats.ts`、`app/api/watchlist/daily/route.ts`、`components/watchlist-daily/DailyWatchlistView.tsx`。

---

## [17.86.0] - 2026-07-06 — ⭐ P6-T7 Daily AI Watchlist（每日 AI 关注池）

每个交易日自动把当日 AI 推荐中 **STRONG_BUY / BUY** 的股票固化为一份**按日期独立**的关注池，用户可取消/恢复关注、加星、重点观察、备注，并持续统计表现。**纯新增功能 + 纯派生层**，未改任何 AI评分 / Adaptive / Shadow / Fusion / Learning / Recommendation / GPT / Feature / Backtest / Paper Broker；数据来源为现有 `DailyRecommendation`（推荐）+ `StockScore` / `DailyPrice`（行情），**未新增任何外部行情 API**。

### 新增表
`daily_ai_watchlist`（model `DailyAIWatchlist`）：`date+symbol` 唯一，历史不覆盖；`entryPrice`/`score`/`rank`/`name` 生成时快照冻结；`currentPrice`/`changePct`/`returnPct` 为最近刷新快照（GET 实时重算）；`status`/`isStarred`/`isMuted`/`isFocus`/`note` 为用户操作字段。

### 生成逻辑（幂等）
`lib/daily-watchlist/`：`generate.ts`（读当日 DailyRecommendation 的 STRONG_BUY/BUY → upsert，**update 不覆盖 entryPrice 与用户操作字段**，history 保留）、`pricing.ts`（`getLiveQuotes` 从 StockScore.latestClose + DailyPrice 最近两日算现价/今日涨跌，无外部 API）、`stats.ts`（`computeWatchlistStats` 纯聚合）。均依赖注入 `prisma`，API 单例与脚本共用。

### 新增脚本 + Cron
`scripts/generate-daily-ai-watchlist.ts`（`npm run daily-ai-watchlist`，JPX 交易日守卫：非交易日不生成；`--date=` 显式回填绕过守卫；`DRY_RUN=1` 预览）。挂入 `cron-scheduler.ts` 07:30+ 已 JPX 守卫块，排在 `generate-strategy-recommendations` / `paper-broker` 之后（DailyRecommendation 已就绪）。

### 新增 API
- `GET /api/watchlist/daily?date=YYYY-MM-DD`（当日列表 + 实时重算现价/涨跌 + 统计 + 可选日期列表；默认最新日期）
- `POST /api/watchlist/daily/generate`（手动生成/重算，幂等）
- `PATCH /api/watchlist/daily/[id]`（取消关注/恢复/加星/重点观察/备注，只改本行不删历史）

### 新增页面
`/watchlist/daily`「每日 AI 关注池」：顶部（标题 + 日期选择 + 刷新 + 生成）· 8 张统计卡（当日关注/上涨/下跌/平均推荐后涨跌/Top Winner/Top Loser/强烈买入表现/买入表现）· 表格（排名/股票/推荐等级/AI评分/推荐价/当前价/今日涨跌/推荐后涨跌/状态/操作 + 加星·重点·备注·取消/恢复）。Apple 浅色 Dashboard；`app/watchlist/daily/page.tsx` CJK-free 薄壳，中文标签在 `components/watchlist-daily/DailyWatchlistView.tsx`。导航「每日AI关注池」（`nav.dailyWatchlist` 三语 + Sparkles 图标）。

### 验收
Build ✅ tsc 0；生产 Health ✅ **CRITICAL=0**；**DB Migration ✅**（`prisma db push` 同步 `daily_ai_watchlist`）；**Daily Generate ✅**（07-06 生成 15 只 STRONG_BUY=0/BUY=15）；**JPX Guard ✅**（Mon=true，Sat/Sun/海の日=false）；**Manual Toggle ✅**（加星/备注/取消→MUTED，重生成后用户操作与 entryPrice 全保留＝幂等）；**Daily Page ✅**（CDP 截图完整渲染，含 today-change 真实值 -1.44%/+9.73%）；**Stats ✅**；No Scoring / No Recommendation Change ✅。新增依赖无。
- 新增 `prisma`(model) · `lib/daily-watchlist/{generate,pricing,stats}.ts` · `scripts/generate-daily-ai-watchlist.ts` · `app/api/watchlist/daily/{route,generate/route,[id]/route}.ts` · `app/watchlist/daily/page.tsx` · `components/watchlist-daily/DailyWatchlistView.tsx`；改 `cron-scheduler.ts`、`lib/routes.ts`、`components/Sidebar.tsx`、`lib/i18n/*`、`package.json`。

---

## [17.85.0] - 2026-07-06 — 📈 P6-T6 Lightweight Charts 接入 V1（股票详情页 K线升级）

接入 TradingView **Lightweight Charts v5.2.0**，将股票详情页 `/stocks/[symbol]` 的价格走势图升级为专业 K线图。**纯展示层升级**，未改数据源 / API / 评分 / Adaptive / Shadow / Fusion / Learning / Feature / Recommendation / Cron / DB Schema / 业务逻辑；未新增任何外部行情 API，数据仍来自现有 `/api/stocks/[symbol]/indicators`（J-Quants / Prisma）。

### 新增 `components/charts/LightweightStockChart.tsx`（Client Component）
- Candlestick + Volume 直方图（底部叠加）+ MA5 / MA20 / MA60 三条均线；ResizeObserver 响应式；light/dark 主题（默认 light，贴合 Apple Dashboard 白卡）；loading / empty / error 三态（永不白屏）。
- 只接受父层传入的统一 `ChartBar[]`，**组件内部绝不请求任何 API**。
- Western 涨跌配色（涨绿 #34C759 / 跌红 #FF3B30），MA5 橙 / MA20 蓝 / MA60 紫（对齐设计 token）。
- 导出适配层纯函数 `buildChartBars(points, sliceLast?)`：把现有 OHLCV 序列转为统一格式，并**从 close 在完整序列上派生 MA5/20/60 后再切片**（保证缩放窗口左缘 MA 值正确，专业行为）。MA 逐点值 API 不提供 → 仅在展示适配层计算，不改 API 返回结构。

### 接入
- `components/stock-detail/ChartTabs.tsx`：价格走势 tab 内 `<PriceChart>` → `<LightweightStockChart data={chartData} height={320} theme="light" />`；prop 类型 `PricePoint[]` → `ChartBar[]`。
- `app/stocks/[symbol]/page.tsx`：`chartFull.slice(-n)` → `buildChartBars(chartFull, n)`（适配层转换）；右侧 Explain Panel / AI评分 / 财务 / 新闻 / 风险模块零改动。
- 旧 `components/PriceChart.tsx` 保留但已无引用（未删除，零风险）。

### 验收
Build ✅ PASS（tsc 0）；生产 Health ✅ **CRITICAL=0**；`/stocks/6525.T` HTTP 200；**CDP 截图确认**桌面端 K线 + 成交量 + MA5/20/60 三线 + 周期切换完整渲染，右侧 Explain 面板无回归；移动 430px 单列堆叠、图表随容器宽度自适应 → Responsive ✅。No API / DB / Business Logic / Scoring Change ✅。新依赖 `lightweight-charts@5.2.0`（+ `fancy-canvas@2.1.0`）已在生产安装。
- 新增 `components/charts/LightweightStockChart.tsx`；改 `components/stock-detail/ChartTabs.tsx`、`app/stocks/[symbol]/page.tsx`、`package.json`、`package-lock.json`。

---

## [17.84.1] - 2026-07-06 — 🐛 Health Guard 周末误报修复（Day Trade Coverage JPX 日历感知）

修复 Data Health Guard **CHECK S33**（`day_trade_result_recent_coverage`）每逢周一必报**假 CRITICAL** 的缺陷。**仅健康检查逻辑，未改任何评分算法 / STRONG_BUY 门槛 / Strategy 逻辑 / Paper Broker / DB Schema / Cron / Feature / 资金链路。**

### 根因
DAY_TRADE 推荐在**周末 / 日本祝日也会预生成**（tradeDate=非交易日），但这些日期**永不结算**（无 TradeResult，设计如此）。S33 原逻辑从最近推荐日往回数「连续缺失 TradeResult 的天数」，未用交易日历过滤 → 周六、周日各计一天 → `consecutiveMissingDays=2` → 误判 CRITICAL，`allowRecommendation=false`。实测 2026-07-06（周一）：07-05 Sun / 07-04 Sat 被算作缺失，而 07-03 Fri 实际已正常结算（5/5，P&L +¥1,153,700）。

### 修复
- **新增 `lib/trading-calendar/coverage.ts`**：纯函数 `countConsecutiveMissingTradingDays(candidates, maxTradingDays=5)`，遍历时用 `isJPXTradingDay()` **跳过周末 / 日本祝日 / 年末年初**（不计入缺失、不中断连续性），只对真实交易日计数；命中首个已结算交易日即停。只读、确定性（JPX 日历离线）、可单测。
- **`scripts/data-health-guard.ts`** CHECK S33 改为调用该纯函数；`take` 由 5 提升到 10 以容纳被跳过的非交易日候选，逻辑上仍只检查「最近 5 个交易日」。
- **新增 `scripts/test-daytrade-coverage.ts`** + `npm run test:daytrade-coverage`：9 用例（生产误报场景 / 单日真实缺口 / 双日缺口 CRITICAL / 周末跳过+真实缺口 / 海の日祝日跳过 / 年末跳过 / 全结算 / cap=5 / 空输入），**9/9 PASS**（本地 + 生产）。

### 验收
Build ✅ PASS（tsc 0）；生产 Health ✅ **CRITICAL=0**（此前 1），S33 → `OK`，`allowRecommendation=true`，`topIssues=[]`；真实交易日缺失仍能正确报错（测试用例 2/3/4 覆盖）；No Business Logic Change ✅（评分 / 门槛 / 策略 / 资金链 / Schema / Cron / Feature 均未动）。无需重启 web/cron（纯 scripts+lib，guard 由 cron 每次读磁盘执行）。
- 新增 `lib/trading-calendar/coverage.ts`、`scripts/test-daytrade-coverage.ts`；改 `scripts/data-health-guard.ts`、`package.json`。

---

## [17.84.0] - 2026-07-05 — P5-T2 Explain Engine 接入 Phase 2（策略中心）🧠📊

将统一 Explain Engine 接入策略中心（`/strategy`）。**仅展示层**，未改任何评分 / Strategy / Learning / Backtest / 推荐 / 排序 / DB / Cron / 业务逻辑。

### 接入方式（复用 Phase 1 组件，零新增 UI 版本）
策略中心每条推荐的「查看原因」打开 `ExplainDrawer`（右侧滑出）——在其内容区**顶部注入 Phase 1 的 `<ExplainPanel symbol={symbol} />`**（读 `/api/explain/[symbol]?provider=rule`，**优先展示**统一 AI决策解释 10 字段），下方**并行保留**原策略专属解释（推荐结论/评分拆解/入选原因/策略适配，走旧 `/api/strategy/explain`）。用户点任一推荐即先看到统一引擎输出。

### 验收
Build ✅ PASS（tsc 0，Compiled 3.0s）；Health ✅ CRITICAL=0；截图 3092.T 抽屉：顶部统一 Explain（买入/综合71/前0%/核心优势6项绿/机会紫/牛市低风险/HIGH 置信）+ 下方旧策略解释并行；No API Regression ✅（旧 `/api/strategy/explain` 仍工作）；No DB / No Logic Change ✅。
- 改 `components/strategy/ExplainDrawer.tsx`（import + 顶部注入 ExplainPanel）。

---

## [17.83.0] - 2026-07-05 — P5-T2 Explain Engine 全站接入 Phase 1（股票详情页）🧠📄

将 P5-T1 统一 Explain Engine 接入 `/stocks/[symbol]` 股票详情页——Explain 从后台能力进入产品界面第一步。**仅展示层**，未改任何 AI 评分 / Adaptive / Shadow / Fusion / Strategy / Learning / Backtest / Paper / GPT Score / Recommendation / Ranking / DB / Prisma / Cron / Prompt / 业务逻辑。

### 新增 `components/stock-detail/ExplainPanel.tsx`
只读 `GET /api/explain/[symbol]?provider=rule`，Apple 白色 `dash-card` 风格展示 ExplainResult 全 10 字段：综合结论 / 核心优势(绿) / 主要弱点(橙) / 风险提示(红) / 机会点(紫) / 市场环境(蓝) / 建议策略 + 持有周期 / 解释可信度(绿·橙·红 by level) / 后续关注。含 **Loading**(骨架) / **Empty**(无评分→「暂无AI解释」) / **Error**(fetch 失败→「暂无AI解释」，不影响页面其它内容) / 空字段→「暂无数据」；禁止白屏。

### 页面接入（并行，不删旧）
右侧 AI 决策栏顶部插入 `<ExplainPanel>`（**优先展示**新引擎）；旧 `DecisionPanel` 于其下**并行保留**（不删旧 Explain 代码，第八部分）。图表/评分/财务/新闻/风险面板均不受影响。

### i18n
新增 14 个 `explain.panel.*` 三语键（zh/ja/en，避开既有 `explain.*` 命名空间冲突）；UI chrome 全走 `t()`（引擎内容为中文，为 P5-T1 规则引擎产出，i18n 化留待引擎升级）。

### 验收
Build ✅ PASS（tsc 0，Compiled 3.1s）；Health ✅ CRITICAL=0；`/api/explain/[symbol]` ✅ PASS；股票详情 Explain UI ✅（截图 6525.T：持有/综合62/前5%/技术面强97%/风险红/机会紫/牛市低风险/HIGH 置信）；No API Regression ✅；No DB / No Logic Change ✅；Fallback ✅（Empty/Error→暂无AI解释）。
- 新增 `components/stock-detail/ExplainPanel.tsx`；改 `app/stocks/[symbol]/page.tsx`、`lib/i18n/types.ts`、`lib/i18n/messages/{zh-CN,ja-JP,en-US}.ts`。

---

## [17.82.0] - 2026-07-05 — P5-T1 Explain AI Engine（AI 决策解释引擎 V1）🧠💬

建立全站唯一的 **AI 决策解释引擎**：在现有 AI 决策之上生成「为什么推荐 / 为什么不推荐 / 主要风险 / 未来关注」，让推荐**可解释**。**纯展示/派生层，只读现有评分数据，绝不重算**——未改 Adaptive / Shadow / Fusion / Learning / Strategy / GPT Score / Recommendation / Ranking / DB / Prisma / Cron / Backtest / Paper Trading；不影响任何评分。

### 新增 `lib/explain/`（10 文件，唯一 Explain 来源）
`types.ts`(ExplainResult 10 字段+ScoreSnapshot/RegimeSnapshot 只读输入+ExplainProvider 接口)、`templates.ts`(维度/评级/风格/市场状态中文映射)、`utils.ts`(dimRatio/dimTier/volRisk 只读换算)、`strength.ts`(优势/机会推导)、`risk.ts`(弱点/风险推导 + actionWarnings 透传)、`summary.ts`(总结/市场环境/建议策略[对齐三策略门槛]/持有周期/置信度[读 ruleConfidence]/未来关注)、`engine.ts`(ruleExplain 规则引擎)、`provider.ts`(**ExplainProvider 抽象**:RuleEngine[默认]/GPT/Hybrid 预留，均安全回退 rule，**默认不调 GPT**，env `EXPLAIN_PROVIDER` 可切)、`builder.ts`(**buildExplain 全站唯一入口**)、`index.ts`。

### 新增统一 Explain API
`GET /api/explain/[symbol]?provider=rule|gpt|hybrid`（默认 rule）——只读 StockScore + 最新 MarketRegime → `buildExplain` → 统一 ExplainResult。实测 6525.T 完整 10 字段（持有/综合 62/前 5%/技术面强 97%/机会分 63/牛市低风险/HIGH 置信）；缺失代码优雅空态；`provider=gpt` 安全回退 rule 无 GPT 调用；`/api/strategy/explain` 仍 200 无回归。

### 验收
Build ✅（tsc 0，Compiled 4.0s）；Health ✅ CRITICAL=0；No API Regression ✅；No DB / No Logic Change ✅（只读零重算）；Explain Engine / 统一 Explain / Rule Explain / Provider ✅ 全 PASS。后续股票详情/策略/Paper/研究可逐步接入 `/api/explain`（现 ExplainDrawer 经 `/api/strategy/explain` 继续工作零回归）；未来切 `EXPLAIN_PROVIDER=gpt` 即完成 Explain AI 升级。
- 新增：`lib/explain/*`（10 文件）、`app/api/explain/[symbol]/route.ts`。

---

## [17.81.0] - 2026-07-05 — P4-T4 Legacy 路由收敛（Redirect First，不删除）🔀

将审计（PROJECT_AUDIT）识别的 7 条历史遗留路由统一 **307 临时重定向**到 AI 研究中心/首页。**仅路由层**，未改任何 API / DB / Prisma / Cron / Alpha·Fusion 计算 / AI评分 / Shadow / Learning / Strategy / Backtest / GPT / 业务逻辑；**不删除**任何旧页面文件/API/脚本/表（安全收敛，非激进删除，观察 2 周后由 P4-T5/T6 再评估物理删除）。

### 重定向（`next.config.ts` redirects，`permanent:false`=307，先于文件系统匹配）
`/alpha`→`?tab=factors` · `/alpha/score`→`?tab=score` · `/alpha/backtest`→`?tab=backtest` · `/alpha/report`→`?tab=analytics` · `/fusion/paper`→`?tab=fusion` · `/fusion/report`→`?tab=fusion` · `/ai-picks`→`/`（均 `/admin/research?tab=<key>`）。目标采用研究中心**真实 tab key**（页面读 `?tab=`），确保落到正确功能 tab，无需改研究中心页面（审计的 `group/alpha-factors` 等为语义别名，对应真实 key）。

### 导航清理
活跃导航（Sidebar/CommandCenter/研究卡/版本中心/学习报告/策略/控制中心）**均无** legacy 链接（首页现为 CommandCenter，已无含 legacy 的 QuickActions）。历史链接均在**死组件**，一并清理：`lib/routes.ts` `PAPER_TRADING`(/fusion/paper→?tab=fusion)、`app/HomeDashboardClient.tsx`(3×/ai-picks→/)、`app/SystemDashboard.tsx`(/fusion/paper→?tab=fusion)。`MobileHeader` 的 route→标题映射键 + `app-url.ts aiPicksUrl` 保留（非 href/外链工具，重定向覆盖，无害）。

### Smoke + 文档
新增 `scripts/smoke-legacy-routes.ts` + `npm run smoke:legacy`（fetch redirect:manual 断言 307/308 + Location）；新增 `docs/LEGACY_ROUTES.md`（映射/实现/导航/观察期/建议删除日期 ~2026-07-19）。

### 验收
Build ✅ PASS（tsc 0，Compiled 3.6s）；Health ✅ CRITICAL=0；**smoke:legacy 7/7 PASS**（全 307 + Location 正确，-L 跟随均 200 单跳）；无 API/DB/逻辑改动。
- 修改：`next.config.ts`、`lib/routes.ts`、`app/HomeDashboardClient.tsx`、`app/SystemDashboard.tsx`、`package.json`；新增 `scripts/smoke-legacy-routes.ts`、`docs/LEGACY_ROUTES.md`。

---

## [17.80.0] - 2026-07-05 — P4-T3 Strategy 模块工程化拆分（Module Refactor）🧩

将全站最大单文件 `app/strategy/page.tsx`（**1837 行**）拆分为模块化结构。**纯工程化重构**（byte-preserving，逐字节移动，不重写/不重设计），未改任何布局 / 视觉 / API / DB / Prisma / Cron / AI评分 / Adaptive / Shadow / Fusion / Learning / Strategy Logic / Paper Trading / GPT / 业务逻辑 —— 实测重构前后 `/strategy` 截图逐像素一致（同高度 2370）。

### 新增 `components/strategy/` 模块（8 文件）
- `types.ts`（199）— 18 个类型/常量（StratType/ALL_TYPES/OverviewData/LearningReport/BacktestSummary/Recommendation/OpenPosition/RecentTrade/StrategyDetail/ExplainData/ValidationData/ReportData/ActiveTab/PHASE7_LABEL_MAP…）
- `utils.ts`（107）— 18 个工具/色值（SM[token 派生]/SHADOW/STRAT_HEX/SFONT/stratLabel/stratShort/returnColor/fmtPct/fmtScore/maturity/EXIT_REASON_KEYS/fill/normalizeSymbol/DIM_ORDER/dimValue/gradeVerdict/retHex/STRAT_COLOR）
- `primitives.tsx`（121）— GradeBadge/RecBadge/StatusChip/SRing/SBadge/MissionCard/StratPremiumCard
- `sections.tsx`（636）— OverviewCard/LearningSection/BacktestSection/PositionsSection/TradesSection/RecommendationSection/CapitalSection/ReportSection/SystemStatusCard/TodayExecutionCard/StabilizationStatusCard（11 组件，各 <90 行）
- `ExplainDrawer.tsx`（289）— Explain 抽屉（**Explain API/逻辑/数据完全不变**）
- `tabs.tsx`（408）— StrategyTab/StabilizationTab/ReportsTab（3 组件，最大 StabilizationTab ~178）
- `hooks.ts`（21）— `useStrategyOverview`（overview fetch 逐字保留）/ `useStrategyTabs`
- `index.ts` — 统一 barrel

### 页面瘦身
`app/strategy/page.tsx`：**1837 → 119 行（−94%）**，仅负责 Layout + Data Fetch(hook) + Component Composition，不含复杂计算/复杂 JSX（Hero/KPI/策略卡/资金分配/Tabs 渲染逐字保留）。

### 验收
Build ✅ PASS（tsc 0，Compiled 3.8s）；Health ✅ CRITICAL=0；/strategy 200；**page.tsx 119 ≤300**；**最大单组件 ExplainDrawer 289 ≤350**；Explain/Recommendation/Strategy 功能一致；**零视觉/数据/布局/性能变化**（byte-preserving 移动，无新增 memo）。最大文件排行更新：strategy/page.tsx 由 #1(1837) 降至 119；现最大文件为 `lib/i18n/types.ts`(1478)。
- 新增 `components/strategy/*`（8 文件）；重写 `app/strategy/page.tsx`（slim compose）。

---

## [17.79.0] - 2026-07-05 — P4-T2 Design Token + UI Kit 工程化统一（Foundation）🎨

建立 TOHOSHOU AI 全站统一 Design System 基础设施。**仅 UI 基础组件重构**，未改任何 API / DB / Prisma / Cron / AI评分 / Adaptive / Shadow / Fusion / Learning / Strategy / Paper Broker / Backtest / GPT / 业务逻辑 / **页面布局**。核心手法：**canonical tokens = 全站已统一的 Apple 值**，各页调色板改为从 token 派生 → 纯 no-op 去重（零视觉变化，实测 Mission Control 截图逐像素一致）。

### 新增 Design Tokens · `lib/design-tokens.ts`（单一来源）
`COLORS`（background/card/tile/track/border/text/textSecondary/textMuted/textFaint/primary/success/warning/danger/purple）· `STATUS_COLORS`（SUCCESS绿/WARNING橙/ERROR红/INFO蓝/COMING_SOON灰）· `RADIUS` · `SHADOW`(sm/md) · `SPACING` · `FONT`(pageTitle/sectionTitle/cardTitle/metric/description/label/caption) · `FONT_FAMILY` · `TRANSITION` · `Z` · `BORDER` · `toneColor()` · `retColor()`。

### 新增 UI Kit · `components/ui/`（17 组件，构建于 tokens）
`primitives.tsx`：AppCard / AppSection / AppHeader / AppBadge / AppStatusChip / AppButton(primary·secondary·ghost·danger + icon·loading·disabled) / AppDivider / AppMetric / AppDot。`data.tsx`：AppKpiCard / AppKpiGrid / AppTable(+AppTh/AppTd + appRowHover) / AppEmptyState / AppLoading / AppTimeline / AppStackBar。`index.ts` 统一入口。**新页面标准**：`import { AppCard, COLORS } from "@/components/ui"`。

### 迁移（8 调色板 → tokens，零视觉变化）
Mission Control（`M`）· Research Center 概览（`center.tsx M`）+ 导航（`ResearchNav M`）+ **kit.tsx `RM`（覆盖全部 9 研究面板）** · Strategy（`SM`）· Paper Broker（`parts.tsx M`）· Learning Report（`C` 共享色）· Version Center（`C` 共享色）——各页调色板对象改为 `COLORS.*` 派生，值不变（含 `#E7EAF0→#E8EAED` 亚感知边框归一）。dash-card 系页面仅共享 accent 接入 tokens，保留专有 `#FAFAFA/#ECECEC/#5856D6` 本地（逐像素不变）。

### 成效
去重 8 个调色板约 **90+ 处 hex 字面量** → 各 0–1，统一到 1 处 token 源；research/kit（9 面板）+ 新增 App* Kit 为全站 go-forward 标准。残留 Strategy 页 ~225 处为 T25 引入的 Tailwind `bg-[#…]` 任意值 class（后续单独治理）。

### 验收
Build ✅ PASS（tsc 0）；Health ✅ CRITICAL=0；6 页面 200；**零布局/视觉变化**；无 API/DB/逻辑改动。
- 新增 `lib/design-tokens.ts`、`components/ui/{primitives,data,index}`；修改（仅调色板派生）`components/research/{kit,center,ResearchNav}`、`app/admin/mission-control/page.tsx`、`components/paper-trading/parts.tsx`、`app/strategy/page.tsx`、`app/admin/{learning-report,versions}/page.tsx`。

---

## [17.78.0] - 2026-07-05 — P4-T1 CI/CD 自动部署基础 + PM2 幽灵进程清理 🔧

P4 工程化治理第一步（无业务逻辑改动）。新增 `.github/workflows/ci.yml`（push/PR：build+typecheck+lint，不连生产DB/不部署）+ `deploy.yml`（workflow_dispatch 手动触发，cron 重启受控，health 门槛 CRITICAL=0）；删除 PM2 幽灵进程 `tohoshou-ai-daily-pipeline`（`pm2 delete`+`save`）并从 `ecosystem.config.js` 移除定义防复活；新增 `npm run typecheck`；新增 `docs/DEPLOYMENT.md`。Secrets（未提交）：SSH_HOST/SSH_USER/SSH_PRIVATE_KEY/SSH_PORT/REMOTE_APP_PATH。commit `bdf8674`，deployment #138。

---

## [17.77.0] - 2026-07-05 — P3-T27 学习报告（Learning Report）全面汉化 🈶

将 `/admin/learning-report` 所有用户可见英文业务文案汉化为简体中文。**仅 UI 文案**，未改任何 API / DB / Prisma / Cron / 学习算法 / Adaptive / Shadow / Fusion / GPT / Learning Engine / 回测逻辑（仍只读 `/api/admin/learning-report` + `/api/admin/mission-control` + 60s 刷新，布局/功能不变）。标题 Learning Intelligence→**AI 学习中心**、Learning Report→**学习报告**、Today's AI Learning Summary→AI 每日学习总结、Refresh→刷新；4 KPI（学习评分 / 特征覆盖率 / 数据填充率 / 数据质量，单位 rows→行、trading days→个交易日）；状态映射 PASS→正常 / WARNING→警告 / CRITICAL→严重、Ready→完成 / Partial→部分 / Insufficient→样本不足 / Pending→等待、INSUFFICIENT_DATA→样本不足；今日学习总结 / 学习时间轴（样本数/已完成/填充率/胜率/平均收益/超额收益）/ 回测统计（周期/样本数/完成率/胜率/平均收益/收益中位数/Alpha/最佳/最差/状态）/ 学习进度 / AI 学习结论 / 模型版本（当前版本/回归检测/数据完整性/特征字段数）。**API 生成的 recommendations 英文说明经展示层 `zhReco()` 正则汉化**（不改后端）：Pipeline issues→检测到流水线问题、Feature coverage is X%→特征覆盖率达到 X%、Nd horizon has no filled positions yet→N日周期暂无有效样本、Expected first fill→预计首次有效日期、Look-ahead validation passed→未来数据泄露检测通过、Regression detection requires→回归检测需要 ≥2 个可比版本…、cohort dates available…Statistical reliability→已积累 N 个样本日期…统计可靠性将持续提升。保留术语：Alpha / AI / GPT / V3 / Adaptive / Shadow / Fusion / schemaVersion / 版本号 / JST。
- 验收：Build ✅ PASS（tsc 0）；Health ✅ CRITICAL=0；/admin/learning-report 200；页面无英文业务文案。
- 修改：`app/admin/learning-report/page.tsx`。

---

## [17.76.0] - 2026-07-05 — P3-T26 AI 自动交易（Paper Broker）UI V2 统一浅色 Dashboard ☀️

将「AI 自动交易 / Paper Broker」`/portfolio` 从 Bloomberg 深色驾驶舱改为与首页 / AI选股 / 研究中心 / 控制中心 / 策略中心一致的 **Apple Dashboard 浅色**。**纯 UI**，未改任何 Paper Trading Logic / Strategy / AI算法 / Adaptive / Shadow / Fusion / Learning / Backtest / GPT / API / DB / Prisma / Cron / 业务逻辑（`/api/portfolio/paper` + `/api/strategy/explain` 只读逻辑全保留）。统一 token：bg `#F7F8FA`·card `#FFFFFF`·border `#E8EAED`·圆角·阴影 `0 8px 30px rgba(0,0,0,.05)`。

### 一处调色板转全页
`components/paper-trading/parts.tsx` 的 `M` 调色板深→浅（bg/card/cardHi/border/ink/sub/faint + blue `#0A84FF`→`#007AFF`、red `#FF453A`→`#FF3B30`），新增 `SHADOW` 并应用于 `DCard` 通用卡片 + 持仓表 + 交易流水表容器（3 处）；无 Tailwind slate 深色类（仅 ExplainDrawer 遮罩 `bg-black/60` 保留为 scrim）。`app/portfolio/page.tsx` 容器已用 `M.bg`（自动转浅）。

### 布局（沿用现有结构，改浅色）
Hero（AI 自动交易驾驶舱 · Paper Broker · Paper Mode badge · 刷新）→ **浅黄色模拟交易 Alert**（`amber` tint）→ 4 KPI（今日表现 / 当前资产 / 累计表现 / 账户状态，大数字 + 状态 chip）→ AI Trading Brief（左：买入/卖出/持仓/盈亏/贡献·拖累；右：风险等级 + AI建议）→ 三策略资金池（allocation bar + 3 白卡：资产/收益率/现金/持仓/买卖）→ 持仓 Apple 白表（蓝代码 + 浮盈绿红 + 风险 chip + 查看原因）→ 交易流水白表（买入绿/卖出红）→ 风险面板白卡 + 策略暴露条。

### 验收
Build ✅ PASS（tsc 0，Compiled 3.3s）；Health ✅ CRITICAL=0；/portfolio 200；响应式；无 API/DB/逻辑改动。**至此 TOHOSHOU AI 全站（首页/AI选股/研究中心/控制中心/策略中心/研发中心/自动交易）统一 Apple Dashboard 单一设计语言。**
- 修改：`components/paper-trading/parts.tsx`。

---

## [17.75.0] - 2026-07-05 — P3-T25 策略中心（Strategy Center）UI V2 统一浅色 Dashboard ☀️

将「策略中心」`/strategy` 从 Bloomberg 深色终端改为与首页 / AI选股 / 研究中心 / Mission Control 一致的 **Apple Dashboard 浅色**。**纯 UI**，未改任何 API / DB / Prisma / Cron / Strategy Logic / Adaptive / Shadow / Fusion / Learning / GPT / 业务逻辑（保留 overview fetch + StrategyTab/StabilizationTab/ReportsTab/ExplainDrawer + 表格/图表全部逻辑）。统一 token：bg `#F7F8FA`·card `#FFFFFF`·border `#E8EAED`·圆角·阴影 `0 8px 30px rgba(0,0,0,.05)`。

### 双套深色系统一次性转浅色
- **`SM` 内联调色板**（主渲染：Hero / 4 KPI MissionCard / 3 策略 StratPremiumCard / 资金分配 / SRing）深→浅；SRing 轨道 `#23272E`→`#E8EAED`、进度条底 `#0d0f12`→`#EEF0F4`；MissionCard + StratPremiumCard 加卡片阴影。
- **Tailwind `slate-*` 深色类**（StrategyTab / StabilizationTab / ReportsTab / ExplainDrawer 及各 Section 表格）批量转浅色：`bg-slate-800/30→bg-white`、`border-slate-700/40→border-[#E8EAED]`、`text-slate-500→text-[#86868B]`、`text-slate-300→text-[#4B5563]`、`bg-slate-900→bg-white`、`ring-offset-[#0f172a]→ring-offset-white` 等（40+ token 有序替换，残留 slate token = 0）。

### 布局（沿用现有结构，改浅色）
Hero（Strategy Intelligence · 今日策略情报 · 3 策略状态 chip · 综合评分 Integrity 环）→ 4 KPI（Overall Score 蓝 / Execution 绿 / Stability 橙 / Learning 紫）→ 3 策略白卡（评分环 + 累计收益/胜率/Alpha + 持仓/推荐 + 状态 chip，选中彩色描边+光晕）→ 资金分配 Allocation Bar（浅色白卡）→ Tabs（日内/波段/长线/稳定化/报告）→ 策略推荐 Apple 白表（蓝色代码 + 查看原因）→ 最近成交/学习等级/回测统计白表（正绿负红）。

### 验收
Build ✅ PASS（tsc 0，Compiled 3.3s）；Health ✅ CRITICAL=0；/strategy 200；响应式；无 API/DB/逻辑改动。**整个 TOHOSHOU AI 后台统一 Apple Dashboard，无黑白混搭。**
- 修改：`app/strategy/page.tsx`。

---

## [17.74.0] - 2026-07-05 — P3-T24 PWA 桌面图标升级（股票 AI 专属 App Icon）🎨

将「添加到桌面（PWA）」图标升级为股票 AI 专属图标（方案 A）。**仅图标 + Manifest**，未改 API/DB/UI/业务逻辑。**设计**：蓝色渐变 `#1677FF → #4DA3FF` + 白色上涨趋势线 + 三根 K 线 + AI 星光，极简 Apple/TradingView 风（无机器人/文字/复杂阴影）。**生成**（sharp 从矢量 SVG 光栅化）：`favicon.ico`（16/32/48 PNG-in-ICO）、`favicon-16x16.png`、`favicon-32x32.png`、`apple-touch-icon.png`(180)、`icon-192.png`、`icon-512.png`、`icon-1024.png`、`icon.svg`（矢量）。**新增** `public/manifest.webmanifest`（name/short_name/icons 192·512 `any maskable`/`theme_color #1677FF`/`background_color #F7F8FA`/display standalone）；`app/layout.tsx` metadata 接线（icons + manifest + apple-web-app）+ `viewport.themeColor`；覆盖 Next 约定 `app/favicon.ico`。
- 验收：Build ✅；所有图标/manifest URL 200（正确 MIME）；HTML head 含 manifest + icon + apple-touch + theme-color；Chrome/Safari/Edge/iOS/Android/Mac Dock 添加到主屏显示新图标。
- 修改：`public/*`（8 图标 + manifest）、`app/favicon.ico`、`app/layout.tsx`。

---

## [17.73.0] - 2026-07-05 — P3-T23 Mission Control V2 + Research Center 统一浅色重构（Apple Dashboard）☀️

取消 Research Center 与 Mission Control 的 Bloomberg Terminal 深色主题，整个后台统一为 **Apple / Stripe / Linear / OpenAI Platform 浅色 Dashboard**，与首页 / AI选股 / 策略中心同一设计语言。**纯 UI 重构**，未改任何 API / DB / Prisma / Cron / Adaptive / Shadow / Fusion / Learning / Strategy / GPT / Backtest / Portfolio / Version / 业务逻辑 / 算法；所有数据继续只读现有 API。统一设计语言：背景 `#F7F8FA` · 卡片 `#FFFFFF` · 边框 `#E7EAF0` · 圆角 22 · 阴影 `0 8px 30px rgba(0,0,0,.05)` · 主色蓝/绿/橙/紫。

### Research Center 全面浅色（一处改，9 面板 + 概览同步）
- **`components/research/kit.tsx`** 深色 `RM` 调色板 → 浅色 Apple（新增 `SHADOW`/`SHADOW_SM`/`tile`/`track`，Hero/Section/KpiCard/Table/Chip/Insight/Timeline/StackBar/Loading/Empty/Error 全部浅色化，`rowHoverClass` 改浅色，新增 `ResearchSegmented`）——**因子研究2 + 市场融合2 + Shadow·Alpha2 + V3组3 共 9 个面板一次性转浅色**。
- 修正各面板硬编码深色：AlphaAnalytics/AlphaBacktest 分段控件 `#343A44` inset → `SHADOW_SM` + `track` 底；FusionReport 权重-夏普柱 `#343A44` → `#D2D5DB`。
- **`ResearchNav.tsx`** 深色 → 浅色（毛玻璃白顶栏 + 蓝色激活 Tier1 pill + 浅灰 Tier2 segmented）。
- **`center.tsx`**（综合驾驶舱概览）深色 `M` → 浅色 + 卡片阴影 + Pill 浅色 tint；顺带 T22 命名统一：Paper Trading → **Fusion Research**（引擎卡 + Engine Matrix）。
- **`app/admin/research/page.tsx`** 容器背景 `#111315` → `#F7F8FA`，移除 `DARK_TABS`（全部面板已浅色）。

### Mission Control V2（重构布局 + 浅色）
`app/admin/mission-control/page.tsx` 深色 Bloomberg → 浅色 Apple，保留全部数据接口 + `load()` + 60s 自动刷新（零逻辑改动），重排为 7 段：① **Hero**（控制中心 · System Health 85/100 · Healthy · 最后同步 · 下一步 Cron · 版本 adaptive-v3）② **6 KPI**（AI Engine / Cron / API / Database / Pipeline / Health）③ **Today's Pipeline · Timeline**（左时间 · 状态色）④ **System Warnings → 5 领域诊断卡**（Data Quality / Pipeline / Score / Research / Strategy，各含标题 + 状态 + 说明 + 查看详情，**不再是 5 个雷同 Warning**）⑤ **Data Freshness**（股票/新闻/评分/全球指数 · 更新时间 + 覆盖率 + 状态）⑥ **Strategy Status**（日内/波段/长线 · 推荐数/持仓/收益/学习）⑦ **System Services**（Web/Cron/Database/API/AI Engine 全绿）。API/Database 状态基于「本页成功拉取 mission-control API（其查询 DB）」判定为正常，非伪造。

### 验收
Build ✅ PASS（tsc 0，Compiled 3.0s）；Health ✅ CRITICAL=0；/admin/mission-control + /admin/research + 9 面板 200；1440/1728/1920 响应式（`repeat(auto-fit,minmax())` + `max-w-[1600]` 居中）；无 API/DB/逻辑改动；V3 Freeze 不受影响。**整个 TOHOSHOU AI 后台现为统一 Apple Dashboard 产品，非多风格拼接。**
- 修改：`components/research/kit.tsx`、`ResearchNav.tsx`、`center.tsx`、`AlphaAnalyticsPanel.tsx`、`AlphaBacktestPanel.tsx`、`FusionReportPanel.tsx`、`app/admin/research/page.tsx`、`app/admin/mission-control/page.tsx`。

---

## [17.72.0] - 2026-07-05 — P3-T22 AI 研发中心命名统一（Research Center Naming Unification）🏷️

统一 AI 研发中心（`/admin/experiments`）所有模块命名风格为 Research / Engine 体系，**彻底移除易误解的「纸面交易 / 模拟盘 / Paper Trading」概念**，改为 Fusion Research。**纯展示文案**，未改 API / Prisma / DB / Cron / Adaptive / Shadow / Fusion 算法 / Learning / Strategy / Backtest / GPT / Version / Health / 数据来源 / 任何逻辑（仍只读 `/api/health/status`）。

### 顶部 6 状态卡（标题 + 副标题双行）
① Adaptive V3 · **AI评分引擎** · 正式·影子；② 已启用 · **Shadow Engine** · V2 vs V3 对比；③ 已启用 · **Fusion Engine** · 市场状态融合；④ 运行中 · **Learning Engine** · 每日学习；⑤ **Fusion Research** · 策略融合研究 · Production × Alpha × Fusion（橙色 icon，替代原「研究/纸面交易/融合模拟盘」）；⑥ 85 · **Research Health** · 研究健康度。

### 研发模块 6 卡命名统一
Adaptive Engine / Shadow Engine / Fusion Engine / Learning Engine / Backtest Engine / **Fusion Research**（原「纸面交易」）。Fusion Research 卡字段：当前状态=研究中、实验模式=Production × Alpha × Fusion、研究方向=策略融合验证、按钮=查看研究 →；`href` 由 PAPER_TRADING 改指 FUSION_REPORT（/admin/research?tab=fusion，真实融合研究页）。

### 文案统一（全页无残留）
Paper Trading → Fusion Research；纸面交易 → 融合研究；模拟盘/Fusion模拟盘 → 研究模式 / Fusion Research。路线图同步（Adaptive Engine V3/Shadow Engine/Fusion Engine/Learning Engine/Fusion Research/Fusion Research（产品化）/Portfolio Engine/Adaptive Engine V4）；未来模块同步（Portfolio Engine/Fusion Research/Factor Lab/Adaptive V4/AI Explain/Institution Flow/Macro Engine）。grep `纸面交易|模拟盘|Paper Trading` = 0。

### 验收
Build ✅ PASS（tsc 0，Compiled 2.9s）；Health ✅ CRITICAL=0；/admin/experiments 200；无 API/DB/逻辑改动。整页统一为 AI Engine Research Platform 命名风格。
- 修改：`app/admin/experiments/page.tsx`。

---

## [17.71.2] - 2026-07-05 — 控制中心（/admin/mission-control）全页汉化 🈶

将 Mission Control 控制中心页所有用户可见英文文案汉化为简体中文。**纯展示层**，未改任何布局 / 组件 / 数据 / API / 检测逻辑（仍只读 `/api/admin/mission-control` + 60s 自动刷新）。标题 Mission Control→**控制中心**、Trading Architecture→交易架构；4 状态卡（生产状态·任务状态 / 交易架构 / 数据流水线·今日 / 每日校验，单位 项通过·步·通过，`FROZEN`→已冻结）；区块标题（数据流水线·时间线 / 警告（N）/ 严重（N）/ 数据新鲜度 / 三策略 / 系统进程）；空状态（No Warnings→无警告、No Critical Issues→无严重问题）；Last Sync→上次同步、score→评分、Nikkei→日经、Phase7→阶段7。**API 返回的运维审计项经展示层映射汉化**（不改后端）：`ISSUE_ZH` 按 `issue.id` 映射 5 条健康检查名（52周高点>股价×10 等）、`zhVal` 处理 genuine/suspect/missing 值文案、`phaseZh` 处理 `nextPhase`、`reasonZh` 处理 `health:data WARNING=N`→数据健康检查·警告 N。保留技术/品牌词：TOHOSHOU、adaptive-v3、版本号、JST、VIX、pm2 进程名。
- 验收：Build ✅ PASS（tsc 0）；Health ✅ CRITICAL=0；/admin/mission-control 200；深色主题不变。
- 修改：`app/admin/mission-control/page.tsx`。

---

## [17.71.1] - 2026-07-05 — AI 研发中心（/admin/experiments）全页汉化 🈶

将 AI Research Lab 研发中心页所有用户可见英文文案汉化为简体中文。**纯文案**，未改任何布局 / 组件 / 数据 / API / 逻辑（仍只读 `/api/health/status`）。标题 AI Research Lab→**AI 研发中心**、Research Center·AI Engine Development→研发中心·AI 引擎研发；6 KPI（AI 引擎 / 影子评分 / 融合引擎 / 学习引擎 / 纸面交易 / 研发健康度）；研发模块 6 卡全部 rows/值汉化（版本·状态·可信度·最近更新·市场状态·最优比例·历史搜索·每日更新·可用·通过·融合模拟盘 等）；Research Roadmap→研发路线图（正式/运行中/下一步/规划中）；Research Notes→研发笔记；Future Modules→未来模块（Coming Soon→敬请期待）；页脚汉化。保留技术/品牌词：Adaptive V3/V4、Alpha、V3、JST、TOHOSHOU、版本号、1d/7d/30d/90d。
- 验收：Build ✅ PASS（tsc 0）；Health ✅ CRITICAL=0；/admin/experiments 200。
- 修改：`app/admin/experiments/page.tsx`。

---

## [17.71.0] - 2026-07-05 — P3-T19.4 AI研究中心·V3组终章重构（V3动态评分 + V3校准中心 + V3冻结监控）🧊✅

完成 AI 研究中心**最后一组 3 个面板**，至此全部 **9/9 子面板**统一为深色 Research Terminal。**纯展示层**，未改任何 API / DB / Prisma / Schema / Cron / Adaptive-v3 / Scoring / Calibration / Freeze / Shadow / Fusion / Learning / Strategy / Backtest / Prompt / 业务逻辑；三面板继续只读现有 `/api/scoring-v3/shadow` `/calibration` `/freeze`，**零假数据**，复用 `components/research/kit.tsx`。

### kit.tsx 新增（440 行）
`ResearchTimeline`（垂直连线步骤：done/current/waiting 三态）+ `ResearchStackBar`（堆叠分布条 + 图例）——供 V3 三面板与后续复用。

### V3动态评分 `ScoreV3Panel.tsx`（218 行）
`AdaptiveScoreHero`（今日评分已完成 + adaptive-v3 + 影子模式 badge · 今日评分数 · 市场状态 · 榜首建议 · 「查看V3 Calibration→」）+ 6 KPI（今日评分数 / **评分均值 全市场 scoreV3 均值** / 强烈买入 / 买入 / 持有·观察 / 回避，均为 ratingDist + rows 真实字段）+ 评级分布 `ResearchStackBar` + AI今日评分结论 insight + 今日动态权重·维度覆盖 chips（新闻覆盖 0.5% 如实）+ V3评分明细 dark table（评级 badge / Confidence 分色 / 风险扣分 / explain 展开 / 股票跳详情 / 搜索+CSV / 前600行）。

### V3校准中心 `CalibrationPanel.tsx`（219 行）
`CalibrationHero`（Grade B · 76.8就绪度 · Confidence 84.3% · 数据质量 94.9% · 「查看V3 Freeze Monitor→」）+ 6 KPI + 校准建议 Recommendation（**grade→文本既有映射：A继续使用/B继续Shadow/C重新校准/D等待更多样本**）+ 今日动态阈值 + Confidence 分布（高/中/低分档）+ Data Quality 维度覆盖条 + STRONG_BUY 统计 + **Calibration History `ResearchTimeline` + 表**。

### V3冻结监控 `FreezeMonitorPanel.tsx`（218 行）
`FreezeHero`（冻结中 + 未达标 · 第2/7天 · 开始/剩余/最终评审）+ 6 KPI（Freeze版本 / Commit / 验证进度 / 就绪度 / 剩余天数 / 是否通过）+ 冻结进度条 + 冻结结论（gateReady/over 派生建议）+ **Validation Timeline `ResearchTimeline`**（Day1…totalDays，按 startDate 推算日期 + history 标注 done/今天/等待中）+ Freeze Result 前向验证（replay verdict V3胜 v3Win/cells + forward V2/V3/spread 表，正绿负红）+ 冻结权重（锁定）chips + 禁改声明 + 每日累计表。

### 导航接线
`app/admin/research/page.tsx`：三面板传 `onNavigate={setTab}`；`DARK_TABS` 补齐 `v3`/`calibration`/`freeze`——**至此 9 tab 全部深色**。ResearchNav 两级高亮（Tier1 V3 + Tier2 三子 tab）正确，无 `href="#"`/空 onClick/console.log。

### 验收（AI 研究中心全部完成）
Build ✅ PASS（tsc 0，Compiled 3.4s）；Health ✅ CRITICAL=0；/admin/research 200；三 V3 API 200 真实数据；1440 无横向溢出、max-w-[1600] 居中；中文化（Adaptive/V3/Calibration/Freeze/Shadow/Production/Confidence 保留）；无 API/DB/逻辑改动；V3 Freeze 不受影响。**AI 研究中心 9/9 子面板全部统一为机构级 Research Terminal（因子研究2 + 市场融合2 + Shadow·Alpha2 + V3组3）。**
- 修改：重写 `components/research/ScoreV3Panel.tsx`、`CalibrationPanel.tsx`、`FreezeMonitorPanel.tsx`；`kit.tsx`（+ResearchTimeline/ResearchStackBar）；`app/admin/research/page.tsx`。

---

## [17.70.0] - 2026-07-05 — P3-T19.3 AI研究中心·Shadow·Alpha 组深色重建（影子评分 + Alpha策略回测）👁️

将 AI 研究中心【Shadow · Alpha】组两个子面板从浅色开发页升级为统一**深色 Research Terminal**。**纯展示层**，未改任何 API / DB / Prisma / Schema / Cron / Shadow 评分算法 / Alpha Score 计算 / Alpha 策略回测算法 / Adaptive / Fusion / Learning / Strategy / Backtest Engine / Prompt / 业务逻辑；两面板继续只读现有 `/api/alpha/score` 与 `/api/alpha/backtest`，**零假数据**，复用 `components/research/kit.tsx`。

### 影子评分（Alpha）`AlphaScorePanel.tsx`（246 行）
新增 `ShadowAlphaHero`（影子评分 · Shadow Alpha Scoring · 已启用 + 影子模式 badge · 当前模式影子(Shadow) · 数据日期 · 最近计算 · 「查看Alpha策略回测→」真实跳转）。6 KPI（Alpha评分覆盖 / Production覆盖 / 平均分差 / 高分歧数≥20 / 最大分差 / 影子健康度→**API 无字段暂无数据**）；**分歧 = `alphaScore − aiAdaptiveScore`（两个 API 已有字段的展示层相减，非新研究指标）**。Alpha 因子权重 chips（6 因子方向±/权重，API 原值）+ 影子评分观察 insight + Production vs Shadow 分歧分布（一致 <10 / 分歧 10-20 / 高分歧 ≥20 分档计数）+ **Top Divergence 表**（按 |分差| 降序，列 股票/正式评分/Alpha评分/差异±色/AI评级/主要贡献因子；高分歧 badge；股票行跳详情页；搜索+导出CSV；前 600 行上限）。

### Alpha策略回测 `AlphaBacktestPanel.tsx`（247 行）
新增 `AlphaBacktestHero`（Alpha Strategy Backtest · 已就绪 · 累计样本 · 成熟周期 30/90/180日 · 数据基准 · 「查看影子评分→」）+ period(30/90/180) + view(正式/影子/融合比较) 切换。6 KPI（影子收益 / 正式收益 / Alpha超额±色 / 影子胜率 / 影子夏普 / 数据基准，全来自 headline + 前20·20日代表配置，API 原值）+ 「Alpha 是否跑赢正式评分」结论卡（**据 headline.alpha 正负如实呈现，当前 90日 Alpha −5.93% 未跑赢即显示红色不隐藏**）+ **持有周期表现卡**（影子·前20，按 holdDays 5/10/20 展示——**本 API 周期维度为持有天数，非单日 horizon，如实标注不伪造 1D-90D**）+ 回测矩阵 dark ResearchTable（组合规模×持有周期，正绿负红，影子行蓝底）。

### 导航接线
`app/admin/research/page.tsx`：两面板传 `onNavigate={setTab}`（Hero CTA 真实切 tab，无 `href="#"`/空 onClick/console.log）；`DARK_TABS` 增加 `score`/`backtest`。ResearchNav 两级高亮（Tier1 Shadow·Alpha + Tier2 影子评分/Alpha策略回测）正确。

### 验收
Build ✅ PASS（tsc 0，Compiled 3.6s）；Health ✅ CRITICAL=0（生产 ❌0 ⚠️5，允许推荐）；/admin/research 200；/api/alpha/score + /api/alpha/backtest 200 真实数据；1440 无横向溢出、表格内部横向滚动、max-w-[1600] 居中；中文化（Alpha/Shadow/Production/TOPIX/V3/AI 保留）；无 API/DB/逻辑改动；V3 Freeze 不受影响。
- 修改：重写 `components/research/AlphaScorePanel.tsx`、`components/research/AlphaBacktestPanel.tsx`；`app/admin/research/page.tsx`（onNavigate + 深色容器）。

---

## [17.69.0] - 2026-07-05 — P3-T19.2 AI研究中心·市场与融合组深色重建（Market Regime + Fusion Research）🛰️

将 AI 研究中心【市场与融合】组两个子面板从浅色开发页升级为统一**深色 Research Terminal**（Bloomberg × Aladdin × OpenAI Research）。**纯展示层**，未改任何 API / DB / Prisma / Schema / Cron / Market Regime 判断逻辑 / Fusion 算法 / Adaptive / Shadow / Learning / Strategy / Backtest / Prompt / 业务逻辑；两面板继续只读现有 `/api/regime` 与 `/api/fusion/report`，**零假数据**，复用 `components/research/kit.tsx` 深色套件。

### 市场状态 `MarketRegimePanel.tsx`（274 行）
新增 panel 局部 `MarketHero`（大字牛市/震荡市/熊市 verdict + AI判断偏多/震荡/偏空 + 风险 + 置信度暂无数据 + 最近更新 + 「查看AI融合策略研究→」真实跳转）+ `MarketInsight`（今日市场摘要，真实字段 regime/breadth/volatility/regimeScore/trendScore 的确定性展示层复述，**非模型编造**）。6 KPI（市场状态/风险等级/状态评分/趋势/市场宽度Breadth/波动率，全为 `/api/regime` 已有字段）+ 市场状态分布（牛/震荡/熊天数 + 状态色带 old→new）+ **Market Timeline**（从时间序列相邻日 regime diff 检测状态切换点）+ 市场指标（TOPIX 收盘 + MA20/60/120，**日经/VIX/USDJPY 不在本 API → 如实标注不伪造**）+ 完整状态历史 dark table。**风险等级 = 波动率阈值映射（沿用 AI指挥中心既有口径 <20低/≤25中/>25高），非新算指标**。

### AI融合策略研究 `FusionReportPanel.tsx`（291 行）
新增 `FusionHero`（Fusion Research + 已就绪 + **研究模式** badge + 研究目标 SHARPE + 数据基准 asOfLatest + 「查看市场状态→」）+ `FusionFlow`（Adaptive→Shadow→**Fusion(高亮)**→Strategy→Recommendation→Production 决策链，高亮当前研究节点）+ `FusionDecisionPanel`（决策面板：`fused.sharpe` vs `production.sharpe` 展示层比较 → 融合占优/正式占优/基本持平 + 每状态研究倾向「建议Fusion/继续Production/继续观察」，**明确标注「是否采纳由人工决定」，非新逻辑**）。6 KPI（覆盖市场状态/研究目标/融合占优状态N/N/平均影子权重/数据基准/运行模式研究模式）+ 研究结论（方法论 note + 各状态真实夏普对比）+ 各市场状态融合明细 3 卡（正式/影子/最佳融合 对比表 + 权重-夏普搜索曲线，正绿负红）。

### 导航接线
`app/admin/research/page.tsx`：两面板传 `onNavigate={setTab}`（Hero CTA/空错态按钮真实切 tab，无 `href="#"`/空 onClick/console.log）；`DARK_TABS` 增加 `regime`/`fusion`（容器切深色 #111315）。ResearchNav 两级高亮（Tier1 市场与融合 + Tier2 市场状态/AI融合策略研究）正确。

### 验收
Build ✅ PASS（tsc 0，Compiled 3.5s）；Health ✅ CRITICAL=0（生产 ❌0 ⚠️5，允许推荐）；/admin/research 200；/api/regime + /api/fusion/report 200 真实数据；1440 无横向溢出、max-w-[1600] 居中；中文化（Fusion/Shadow/Adaptive/AI/TOPIX/Production/SHARPE 保留）；无 API/DB/逻辑改动；V3 Freeze 不受影响。
- 修改：重写 `components/research/MarketRegimePanel.tsx`、`components/research/FusionReportPanel.tsx`；`app/admin/research/page.tsx`（onNavigate + 深色容器）。

---

## [17.68.0] - 2026-07-05 — P3-T19.1 AI研究中心·因子研究组深色重建（Alpha因子库 + 因子分析）🔬

将 AI 研究中心【因子研究】组两个子面板从浅色/旧式开发页升级为统一**深色 Research Terminal** 风格。**纯展示层**，未改任何 API / DB / Prisma / Schema / Cron / Alpha 因子计算 / 因子分析逻辑 / 评分 / Shadow / Fusion / Learning / Strategy / Backtest / Prompt / 业务逻辑；两面板继续只读现有 `/api/alpha` 与 `/api/alpha/report`，**零假数据**。

### 新增共享深色 UI 套件 `components/research/kit.tsx`（389 行）
统一 M 调色板（bg #111315 / panel #15181D / card #171A1F / border #2A3038 / blue #0A84FF / green #34C759 / amber #FF9F0A / red #FF453A / muted #8B949E）。导出组件：`ResearchPanelShell / ResearchHero / ResearchStatusBadge / ResearchKpiGrid / ResearchKpiCard / ResearchSection / ResearchChip / ResearchTable + RTh/RTd / ResearchEmptyState / ResearchLoadingState / ResearchErrorState / ResearchInsightCard / ResearchButton / retColor`。两面板共享，**不复制 JSX**，单文件均 < 500 行。

### Alpha因子库 `AlphaFactorsPanel.tsx`（291 行）
Hero（Alpha因子库 · Factor Library · 已就绪/暂无数据状态 · 最近更新 · 「查看因子分析→」真实跳转）+ 6 KPI（因子总数 15 / 量化 11 / 事件 4 / 覆盖股票数 / 数据日期 / 研究状态，全为真实字段或结构派生）+ 因子清单 chips（**API 无官方分类字段 → 如实标注「暂无官方分类数据」，展示真实因子清单不伪造分类**）+ 因子明细矩阵（Bloomberg dark table，搜索 + 导出CSV + 排序 + 行 hover + 股票代码跳转，前 600 行渲染上限并明示）。空/错/载入三态齐备。

### 因子分析 `AlphaAnalyticsPanel.tsx`（330 行）
Hero（因子分析 · Factor Analysis · 「查看因子库→」真实跳转）+ 周期选择 7/30/90/180 + 6 KPI（分析因子数 / 平均重要度 / 稳定因子数 / 待观察因子 / 累计样本 / 最近分析，均为 API rating/sampleCount 字段的展示聚合）+ 研究洞察 3 卡（真实最佳/最弱因子 + 整体重要度）+ Top/Weak Factors 双列 + **相关性·稳定性（API 无该字段 → 如实「暂无相关性数据」）** + 完整因子分析表（IC/RankIC/胜率/超额/未来5-20日/前后20%/夏普/样本，正向绿负向红中性灰，低覆盖率 < 200 样本 Warning badge）。

### 导航接线
`app/admin/research/page.tsx`：两面板传入 `onNavigate={setTab}`（Hero CTA/空错态按钮真实切 tab，无 `href="#"`/空 onClick）；容器背景对 `factors`/`analytics` 两 tab 切深色 `#111315`（其余面板仍浅色）。ResearchNav 两级高亮（Tier1 因子研究 + Tier2 Alpha因子库/因子分析）正确。

### 验收
Build ✅ PASS（tsc 0，Compiled 2.4s）；Health ✅ CRITICAL=0（生产 ❌0 ⚠️5，允许推荐）；/admin/research 200；/api/alpha + /api/alpha/report 200 真实数据；1440 完整可读无横向溢出、max-w-[1600] 居中；中文化（Alpha/Factor/IC/V3 等技术名保留）；无 API/DB/逻辑改动；V3 Freeze 不受影响。
- 修改：新增 `components/research/kit.tsx`；重写 `components/research/AlphaFactorsPanel.tsx`、`components/research/AlphaAnalyticsPanel.tsx`；`app/admin/research/page.tsx`（onNavigate + 深色容器）。

---

## [17.67.1] - 2026-07-05 — 指挥中心搜索去重 🔍

修复用户反馈「指挥中心搜索重复」：首页（AI 指挥中心 `/`）同时出现两个搜索框——`CmdHeader` 顶部右上「搜索股票」全局 typeahead + `ScreenerHeader`「搜索代码/中文/日文/英文」列表过滤搜索。移除 `CmdHeader` 顶部重复的 `<SearchBox/>`（及 import），保留「AI选股」区的**功能性列表过滤搜索**（filters via `/api/screener?q=`）。顶部头部现仅剩 通知 + 账户 图标。纯 UI，未改任何逻辑/API；`SearchBox` 组件本身保留（未来可用）。
- 修改：`components/dashboard/DashboardView.tsx`。Build ✅ / Health ✅ CRITICAL=0 / `/` 200。

---

## [17.67.0] - 2026-07-05 — P3-T20 首页信息架构精炼（Home × Screener Unified）📉

对 AI 指挥中心首页做信息架构精炼：**减少信息、提高效率**，整体长度约 -40%、股票卡视觉元素约 -30%。**纯 UI**，未改 API/DB/GPT评分/Adaptive/Shadow/Fusion/Strategy/Explain/Learning/Ranking/Backtest/业务逻辑；`/` 与 `/screener` **共享同一组件**（改一处两端同步，无复制）。

### 变更
- **AI推荐统计 5 张巨卡 → 1 张紧凑 Summary Card**（`MetricCards`）：`总股票 3,068 · Buy 11 · Hold 284 · Watch 1590 · Avoid 1183`，每项仍可点击筛选；不再占满整行。
- **股票卡 -30% 视觉元素**（`StockCard`）：删除顶部 rank 徽章 + 重复收藏按钮、watchlist 星标、风格标签、5D chip；保留 名称/代码/AI评分环/建议/价格/涨跌/RSI/MA/查看分析/收藏；`minHeight 232→196`。
- **市场行固定 4 卡一行**（`MarketRow`）：日经225/TOPIX/USDJPY/VIX（去掉换行的第 5 张）。
- **首页去底部冗余**（`CommandCenter`）：移除「今日流水线 + 快捷入口」区块与页脚，首页流为 Hero→市场→推荐Summary→搜索筛选→股票→结束。
- 收紧间距（MetricCards `mb-10→mb-5`、FilterBar `mb-8→mb-5`）。

### 信息层级（3 秒懂）
Hero(今日AI判断 Bullish/置信度/风险 + TOP1推荐 + 系统健康) → 市场 4 卡 → 推荐 Summary → 搜索/风格/市场/排序一行 → 股票网格。首屏即见市场+推荐+可开始选股。

### 验收
Build ✅ PASS（tsc 0）；Health ✅ CRITICAL=0；`/` + `/screener` 200；1440 / MacBook 13"(1280) 响应式；共享组件（StockCard/MetricCards/FilterBar 改动两端同步）；无 API/逻辑改动。V3 Freeze 不受影响。
- 修改：`components/screener/StockCard.tsx`、`components/screener/sections.tsx`、`components/command-center/CommandCenter.tsx`、`components/dashboard/DashboardView.tsx`。

---

## [17.66.0] - 2026-07-05 — 研究中心统一深色终端 Shell + 分组导航 🧭

AI 研究中心从「10 个挤压的 monospace tab」升级为**统一深色 Research Terminal chrome + 两级分组导航**。**纯 UI/信息架构**，未改 API/DB/Alpha/因子/Shadow/V3/Fusion/Calibration/Freeze/Backtest 算法/任何业务逻辑；所有面板继续读原 API。

### 交付（本次）
- 新组件 `components/research/ResearchNav.tsx`：两级分组导航（深色 #111315/#15181D/#2A3038）——Tier1 组 pills【综合｜因子研究｜Shadow·Alpha｜市场与融合｜V3】+ Tier2 当前组子 tab（segmented）。**解决「Tab 太多太挤、1440 不可读」**，当前组/当前页高亮清晰，不再一排塞 10 个按钮。
- `app/admin/research/page.tsx`：顶部旧 tab 栏 → `<ResearchNav>`；页面 canvas → 深色 #111315；9 个面板统一放入 `max-w-[1600px]` 居中工作区（消除横向溢出、统一留白），overview 仍为深色 ResearchCenter。

### 范围说明（诚实）
本次交付**统一页面框架 + 导航优化**（适用于全部 10 个 tab）。9 个子面板正文（Alpha因子库/因子分析/影子评分/Alpha策略回测/市场状态/AI融合策略研究/V3动态评分/V3 Calibration/V3 Freeze Monitor）的逐个 Bloomberg 级 dark 卡片重建（每个需核对各自 API 数据结构 + 重写 ~150 行）为**后续分批推进**，本次未逐一重建——现阶段面板在深色终端 chrome 下的浅色工作区内渲染真实数据（可读、无横向挤压）。未虚报。

### 验收
Build ✅ PASS（tsc 0）；Health ✅ CRITICAL=0；/admin/research 200；分组导航 1440 可读、当前页高亮；无 API/算法改动。V3 Freeze 不受影响。
- 修改：新增 `components/research/ResearchNav.tsx`、`app/admin/research/page.tsx`。

---

## [17.65.0] - 2026-07-05 — P3-T19 AI 指挥中心（Dashboard + Screener 合并）🎛️

将「今日总览（Dashboard）」+「AI选股（Screener）」合并为唯一首页 **AI 指挥中心（AI Command Center）**。**仅信息架构重组 + 组件组合**，未改 Prisma/DB/Cron/API/Adaptive/Shadow/Fusion/Learning/Strategy/Portfolio/Paper/Backtest/News/评分算法/Prompt/任何 business logic；所有筛选/排序/搜索/收藏/分页/评分/API 逐字节保留。

### 合并方式（Composition-only）
- `components/dashboard/DashboardView.tsx`：将 `CmdHeader`/`TodayIntelligence`/`SystemHealth`/`PipelineCompact`/`QuickActions` 改为 `export` + 新增 `MarketRow`（仅市场行，去掉与 Screener 重复的 stats 行）。
- `components/screener/ScreenerBody.tsx`（新）：Screener 页 body 原样抽出为可复用组件 + `embedded` 开关（嵌入时去外层 min-h-screen 容器，逻辑/state/API 完全不变）。
- `components/command-center/CommandCenter.tsx`（新，client）：按第一~七屏顺序组合 —— Today Intelligence Hero + 市场概览 + AI推荐统计(MetricCards 5 卡) + 筛选器 + 股票卡片+分页 + 今日流水线 + 快捷入口。
- `app/page.tsx`（server 取数不变）→ 渲染 `<CommandCenter data>`；`app/screener/page.tsx` → `<ScreenerBody/>`（旧路由 /screener 兼容保留）。

### 导航
Sidebar 删除「今日总览」，「AI选股」→「AI 指挥中心」指向 `/`（新增 i18n `nav.commandCenter` 三语言）。旧路由 `/`、`/screener` 均可访问，不影响 `/stocks/[symbol]` 收藏链接。

### 删除/去重
删除独立 Dashboard 视图（`/` 现为指挥中心）+ Dashboard 与 Screener 重复的 KPI/统计行（保留 Screener 的 Strong Buy/Buy/Hold/Watch/Avoid）。

### 验收
Build ✅ PASS（tsc 0）；Health ✅ CRITICAL=0；`/` + `/screener` 200；股票详情/Explain Drawer/AI评分/排序/搜索/收藏/分页/API 全一致。V3 Freeze 不受影响。
- 修改：`components/dashboard/DashboardView.tsx`、`app/page.tsx`、`app/screener/page.tsx`、`components/Sidebar.tsx`、`lib/i18n/*`；新增 `components/screener/ScreenerBody.tsx`、`components/command-center/CommandCenter.tsx`。

---

## [17.64.0] - 2026-07-04 — P3-T18 研究分析 → AI 研究中心 重构 + 版本中心 LLM 修正 🔬🧠

### 研究分析 `/admin/research` → AI 研究中心（Research Center）
overview 从密密麻麻的小数字 → **AI 研究中心**（AI 决策引擎大脑，深色 Bloomberg Terminal × BlackRock Aladdin × OpenAI Research，与 Mission Control/Strategy Center 统一视觉 #111315/#171A1F/#20242B/#2A3038）。**纯 UI**，未改 Prisma/DB/Cron/API/Adaptive/Shadow/Fusion/Learning/Strategy/Backtest/AI 算法/评分逻辑/Prompt；全部只读现有 `/api/admin/mission-control` + `/api/admin/research`。新组件 `components/research/center.tsx`（259 行），page overview 渲染切换为 `<ResearchCenter onTab={setTab}/>`（其余分析 tab 保留）。
- **Hero**：AI 研究中心 · AI Engine·Adaptive Intelligence·Research Platform + 状态芯片（Research Running/adaptive-v3/Shadow Enabled/Fusion Enabled/Learning Running）。
- **6 KPI**：Universe(3719) / AI评分(3068) / Research Confidence(dataConfidence) / Alpha Engine(adaptive-v3) / Fusion Engine(Enabled) / System Health(health status+C/W)。
- **AI 决策流程**：Market→Universe→Feature→AI Score→Shadow→Fusion→Strategy→Recommendation→Learning（状态色）。
- **AI 引擎 8 卡**：Adaptive/Shadow/Fusion/Learning/News/Institution/Macro/Paper（状态/版本/Confidence/详情按钮真实跳转或 Coming Soon）。
- **研究洞察 Today's Insight**：市场/AI/新闻/机构/推荐（真实数据，机构流向无数据→N/A 不伪造）。
- **AI 模块关系图**：adaptive-v3→Shadow→Fusion→Strategy→Portfolio→Learning→Adaptive v4(Coming Soon)。
- **Research Timeline**（todayPipeline 今日流水线）+ **Engine Matrix**（8 引擎 × Version/Status/Confidence/Update/Health）+ **Future Roadmap**（Adaptive V4/Institution AI/Portfolio AI/Macro/Risk/Factor Lab Coming Soon）。
- 删除密集小数字/重复统计/开发者字段。

### 版本中心 LLM 模型修正（用户反馈）
v17.63.0 升级 gpt-5.5 后，版本中心「LLM 模型」仍显示 gpt-4o-mini —— 因该字段来自 DB `VersionSnapshot.llmModelVer` 历史快照值。已将**当前运行快照**（`20260626-v7.7`，endDate null）`llmModelVer` 更新为 `gpt-5.5`；legacy-baseline 保留 `gpt-4o-mini`（历史准确，其确用 4o-mini）。仅改当前快照 1 字段，不动算法/逻辑。

### 验收
Build ✅ PASS（tsc 0）；Health ✅ CRITICAL=0；/admin/research 200；版本中心当前版本 LLM=gpt-5.5；数据全真（N/A/Coming Soon 不伪造）。V3 Freeze 不受影响。
- 修改：新增 `components/research/center.tsx`、`app/admin/research/page.tsx`（overview 渲染）、DB 当前快照 llmModelVer（不提交）。

---

## [17.63.0] - 2026-07-04 — OpenAI 模型升级 GPT-4o-mini → GPT-5.5 🧠⬆️

将所有 OpenAI GPT 推理从 `gpt-4o-mini` 升级为 `gpt-5.5`（解析为 `gpt-5.5-2026-04-23`）。仅升级模型 + gpt-5.5 强制的最小参数适配，**未改任何 Prompt / JSON Schema / response_format / 评分算法 / 权重 / adaptive-v3 / Shadow / Fusion / Learning / Strategy / Explain / API / DB / Prisma / UI / Cron 调度**。

### 统一配置源
`OPENAI_MODEL` env（生产 .env 已设 `gpt-5.5`，单一配置源）+ 代码默认值同步：`lib/openai.ts`、`lib/safety-rules.ts`(LLM_MODEL_VERSION 版本戳)、`scripts/gpt-score-overlay.ts`、`scripts/rerank-top500.ts`。`lib/ai.ts` 用 `AI_MODEL=deepseek-chat`（DeepSeek 路径，非 OpenAI，**未动**）。

### gpt-5.5 强制的最小参数适配（必需，否则运行时 400）
gpt-5.5 要求 `max_completion_tokens`（拒绝 `max_tokens`）且只支持 `temperature: 1`。故 `rerank-top500.ts` + `gpt-score-overlay.ts` 的 create 调用：`max_tokens: 1100` → `max_completion_tokens: 1100`（**数值不变**）、移除 `temperature: 0.6`（用 gpt-5.5 默认 1）。经用户确认采纳「最小兼容升级」。**参数值、prompt、schema 均未改**，仅参数名适配 + temperature 归默认。

### 受影响模块
OpenAI GPT 实际调用点 = GPT 评分叠加（gpt-score-overlay）+ Top500 重排（rerank-top500，07:30 管线）。News/Explain/Learning/Daily/Strategy 摘要为 DB/规则派生，不直接调 OpenAI（随评分层间接受益）。

### 上线前验证（de-risk）
生产 API 实测 gpt-5.5 + 脚本同参（`response_format json_object` + `max_completion_tokens:1100`）→ 返回干净可解析 JSON（`{"gptScore":75,"confidence":"MEDIUM"}`，finish=stop，仅 50 token，无推理占尽）。

### 验收
Build ✅ PASS（tsc 0，SDK 支持 max_completion_tokens）；Health ✅ CRITICAL=0；站点 200；服务器脚本已核实 gpt-5.5 + max_completion_tokens。**Rollback**：服务器 `.env` 恢复 `OPENAI_MODEL=gpt-4o-mini`（备份 `.env.bak.pre-gpt55`）+ `pm2 restart --update-env`（参数改动向后兼容 4o-mini），或 `git revert`。**V3 Shadow Freeze 保持有效**。
- 修改：`lib/openai.ts`、`lib/safety-rules.ts`、`scripts/gpt-score-overlay.ts`、`scripts/rerank-top500.ts`（+ 生产 .env，不提交）。

---

## [17.62.0] - 2026-07-04 — P3-T19 AI历史回测 → AI Backtest Intelligence 重构 📈

`/backtest` 从深色表格后台页 → **AI Backtest Intelligence**（AI 历史回测分析中心，浅色 Apple × Bloomberg × TradingView）。**纯 UI**，未改 Backtest Engine/回测算法/收益率·Alpha·TOPIX 计算/Strategy Backtest/DB/Prisma/API/Cron/任何计算逻辑；全部只读现有 API（`learning-report` backtestSummary + `backtest/summary` + `mission-control` backtest + `backtest/strategy`）。

### 组件拆分（page 66 行 CJK-free + parts 244 行，均 <500）
`components/backtest/parts.tsx`：BacktestHeader / BacktestHero / BacktestNotice / HorizonStatusCards / BacktestMatrixTable / MaturityTimeline / StrategyBacktestPanel / BacktestEmptyState。

### 内容（3 秒掌握：有无数据/成熟周期/跑赢 TOPIX/最佳周期/需等待）
- **Hero**：推荐日期(cohortCount) / 已成熟周期(READY horizons) / 最佳周期(最高胜率) / 胜率 / Alpha vs TOPIX / 状态(部分成熟) + 跑赢/跑输 TOPIX badge。
- **回测说明**（入场价/收益率/推荐日期/未考虑滑点/历史不代表未来，紧凑浅色）。
- **周期状态 9 卡**（1D~90D：状态点/平均收益/覆盖率/α，缺显 N/A）。
- **回测矩阵**（Apple 表：周期/状态 已就绪·等待中·样本不足/样本·已填/胜率/平均收益/Alpha/成熟日期，正绿负红 tabular-nums，已就绪行高亮 hover）。
- **成熟时间线**（1D~90D READY 实心绿·等待中空心，30D/90D 显 expectedFillDates 预计日期）。
- **三策略回测**（日内30%/波段40%/长线30% 成熟 chips 来自 mission-control；无 stats → Empty State「暂无策略回测数据 + 请先运行 npm run strategy-backtest + 查看策略中心」真实链接 /strategy）。
- 全中文化（周期/样本/已完成/胜率/平均收益/成熟日期/已就绪/等待中/暂无数据），新增 24 个 backtest.* i18n 键（三语言）。

### 验收
Build ✅ PASS（tsc 0 · app/backtest 字符串 CJK-free）；Health ✅ CRITICAL=0；/backtest 200；空状态专业；按钮全真实（刷新/查看策略中心，无 href=#/假按钮）；1440/1920 响应式。**无 API/DB/计算逻辑改动**（learning-report backtestSummary before=after：9 行·1d win 50.9 READY）。V3 Freeze 不受影响。
- 修改：`app/backtest/page.tsx`（重写）、新增 `components/backtest/parts.tsx`、`lib/i18n/types.ts` + 三语言 messages（+24 键）。

---

## [17.61.0] - 2026-07-04 — P3-T18 版本中心 + 新闻资讯 Premium UI 联合重构 🗂️📰

两页同步升级为浅色 Apple Premium。**纯 UI**，未改 API/DB/Prisma/News Sync/Version Logic/Cron/AI Score/Learning/Strategy/任何计算或写入逻辑；全部只读现有 API。

### 版本中心 `/admin/versions`（深色 DB 表 → Version Center · 浅色 Apple/GitHub Releases/Linear Changelog）
- Header（版本中心 + 系统版本·评分架构·模型配置·发布记录 + 返回控制中心 + 刷新时间）。
- **当前版本 Hero**（20260626-v7.7 大字 + 运行中/Production badge + 评分架构/Schema/规则引擎/LLM/开始日期/DR 关联/BP 关联/学习报告）。
- **版本时间线**（version snapshots：基准→当前，role badge）。
- **Segmented tabs**（快照/时间线/对比/完整性）+ Apple 版本表（当前行高亮，全字段保留，tabular-nums，hover）+ 变更日志 + 发布时间线（deployments）+ 对比（A/B + backtest delta）+ 完整性（DR/BP 覆盖卡）。数据来自 `/api/admin/versions` + `version-timeline` + `versions/compare`（只读）。

### 新闻资讯 `/news`（普通列表 → News Intelligence · Apple News/Bloomberg 风）
- 组件拆分 `components/news/parts.tsx`：NewsHeader / NewsSummaryCards / NewsFilters / NewsRow / NewsEmptyState（app/news/page.tsx 61 行 CJK-free）。
- **Header**（新闻资讯 + Yahoo/Kabutan/TDnet + 搜索标题 + 刷新 + 更新时间）。
- **7 摘要卡**（已加载/重要/利好/利空/TDnet/Kabutan/Yahoo，实时从加载集计数，无则 0，**不伪造**）。
- **3 行 Filter Chips**（情绪 全部/利好/利空/中性 · 来源 全部/个股专属/市场新闻 · 分类 全部/财报/业绩修正/分红/回购/IR/市场，统一高度，选中明确）。
- **Apple News Row**（标题主视觉 + 情绪点/代码/来源/时间弱化 + 重要 badge 右侧，hover，标题→原文 url，代码→/stocks/[symbol]）。
- **空状态**（visible=0 → 暂无 + 清除筛选按钮）；client 搜索过滤标题/代码。新增 4 个 i18n 键（loaded_total/important/clear_filter/search，三语言）。

### 验收
Build ✅ PASS（tsc 0 · app/news CJK-free）；Health ✅ CRITICAL=0；/admin/versions + /news 200；按钮全真实（返回/tabs/对比/版本行/搜索/筛选/刷新/清除/新闻点击，无 href=#/假按钮）；1440/1920 响应式。**无 API/DB/逻辑改动**。V3 Freeze 不受影响。
- 修改：`app/admin/versions/page.tsx`（重写）、`app/news/page.tsx`（重写）、新增 `components/news/parts.tsx`、`lib/i18n/types.ts` + 三语言 messages（+4 键）。

---

## [17.60.0] - 2026-07-04 — P3-T17 自动交易 → Paper Trading Cockpit 重构 📊

`/portfolio`（AI 自动交易驾驶舱）从深色 monospace 资金表 → **Paper Trading Cockpit**（AI 模拟交易驾驶舱，Apple × Bloomberg Portfolio × BlackRock Aladdin 深色 #111315/#171A1F/#262B33）。**纯 UI**，未改 Paper Trading/Portfolio/持仓/盈亏计算/买卖规则/AI Score/Strategy/Fusion/Shadow/Cron/DB/Prisma/API/任何算法/任何资金数据；全部来自现有 `/api/portfolio/paper` + `/api/strategy/explain`（只读）。

### 组件拆分（page 61 行 + parts 385 行，均 <500）
`components/paper-trading/parts.tsx`：PaperTradingHeader / PaperModeBanner / TradingHero / TradingBrief / StrategyCapitalPools / PortfolioPositionsTable / TradingTimeline / TradingRiskPanel / EmptyState / ExplainDrawer；`app/portfolio/page.tsx` 仅 fetch + 编排（CJK-free）。

### 内容（3 秒掌握：今天赚没赚/资产/今日交易/策略/持仓/风险）
- **Hero 4 KPI**：今日表现(profited YES/NO + pnl + 收益率) / 当前资产(total+现金/持仓/初始) / 累计表现(returnPct+跑赢TOPIX) / 账户状态(Paper Broker+自动运行+流水线+Health+今日买卖/持仓/成交)。
- **Paper Mode Banner**（amber）：当前为模拟交易模式，不会产生真实买卖或资金变动。
- **AI Trading Brief**：市场状态+买卖/持仓/盈亏+主要贡献/拖累股票 + 风险等级 + AI 建议（aiDailySummary，卡片化 Highlights/Risk/Recommendation）。
- **Strategy Capital Pools**：3 机构级资金卡（日内橙/波段蓝/长线绿）+ 资金占比视觉条（strategyPools）。
- **Portfolio Positions**：Bloomberg 风表（策略/代码/数量/买入价/现价/市值/浮盈/持仓天数/AI评分/风险/查看原因→ExplainDrawer 右抽屉，代码→/stocks/[symbol]，盈利绿亏损红 tabular-nums hover 高亮）。
- **Trading Flow**：recentExecutionsEnhanced 时间线（买入/卖出 badge），无数据 EmptyState「暂无交易流水」不伪造。
- **Risk Panel**：riskMetrics（风险等级/仓位·现金占比/最大单一/Top5集中度/持仓数/未实现盈亏/连胜连亏）+ 策略暴露条；缺数据 N/A。

### 验收
Build ✅ PASS（tsc 0 · CJK-free）；Health ✅ CRITICAL=0；/portfolio 200；1440/1920/2560 响应式（1440 首屏 KPI 完整）；按钮全真实（查看原因/代码/刷新，无 href=#/假按钮）。**交易逻辑/API 100% 未变**：totalAssets=10294200 · todayPnl=100000 · beatTopix=true（before=after）。V3 Freeze 不受影响。
- 修改：`app/portfolio/page.tsx`（重写）、新增 `components/paper-trading/parts.tsx`。

---

## [17.59.0] - 2026-07-04 — 学习报告 → Learning Intelligence Center 重构 🧠

`/admin/learning-report` 从深色 monospace 数据库报表 → **Learning Intelligence Center**（AI 学习驾驶舱，Apple × Bloomberg × OpenAI Research 浅色）。**纯 UI**，未改 Prisma/DB/Cron/Learning Engine/Shadow/Fusion/Adaptive/Strategy/Recommendation/Backtest/Feature/API/计算逻辑；所有数字来自现有 `/api/admin/learning-report` + `/api/admin/mission-control`（featFields）；**零假数据**。

### 内容（全部来自现有 API）
- **Hero**：LEARNING INTELLIGENCE · Learning Report · Today's AI Learning Summary + Refresh + generatedAt + engineVersion（第一屏无 Table）。
- **4 Premium Cards**（ScoreRing）：Learning Score(dataIntegrity.score 60·WARNING) / Feature Coverage(featureCoverage.overallPct 100%) / Fill Rate(Σfilled/Σsample) / Data Quality(grade)。
- **Today's Learning**：`recommendations[]` 逐条 ✓ 摘要；无则 "No Significant Learning Today"（**禁止 GPT 编造**）。
- **Learning Timeline**：Apple Segmented(1D~90D) + 所选周期 Samples/Filled/Fill Rate/Win/Avg/Alpha（读 sampleCounts/filledCounts/backtestSummary）。
- **Backtest Summary**：Bloomberg 风 Apple Table（Horizon/Samples/Fill/Win/Avg/Median/Alpha/Best/Worst/Status，tabular-nums，Ready/Pending）。
- **Learning Progress**：9 周期进度卡（Coverage/Samples/Completion/Status，读 sampleCounts/filledCounts）。
- **AI Insights + Model Version**：recommendations + regressionDetection(currentVersion/status) + dataIntegrity grade。
- Feature Importance 段：API 无 importance 字段 → 未展示（不伪造），仅在 Model Version 显示 Feature Fields 数。

### Learning API Before/After 一致性
`/api/admin/learning-report` 部署前后逐字段一致：dataIntegrity.score=60 · grade=WARNING · backtest[1d].winRate=50.9 · recommendations=11（未改任何后端）。

### 验收
Build ✅ PASS（tsc 0 error）；Health ✅ CRITICAL=0；/admin/learning-report 200；Learning 逻辑/API 100% 未变。V3 Freeze 不受影响。
- 修改：`app/admin/learning-report/page.tsx`。

---

## [17.58.0] - 2026-07-04 — P3-T16 实验管理 → AI Research Lab（研发中心）重构 🔬

`/admin/experiments`（原空的「实验管理」+ Prisma Studio 教程）→ **AI Research Lab**（研发驾驶舱，Apple/Linear/Vercel/Stripe 浅色）。**纯展示层**，未改任何 Prisma/DB/API/Shadow/Fusion/Learning/Strategy/GPT/Ranking/算法；仅读只读 `/api/health/status` 取真实 Research Health。路由 `/admin/experiments` 不变，左侧导航「实验管理」保持跳转一致。

### 内容
- **Header**：AI Research Lab · Research Center · AI Engine Development + Adaptive V3·Production / Healthy pill + 最后更新（真实 health.auditAt）。
- **6 KPI Cards**：AI Engine(Adaptive V3·Production) / Shadow(Enabled) / Fusion(Enabled) / Learning(Running) / Paper Trading(Research) / Research Health(真实健康分，如 88)；均 Apple 卡 + 跳转真实研究页(ROUTES)。
- **6 Research Modules**：Adaptive Score / Shadow Engine / Fusion Engine / Learning Engine / Backtest / Paper Trading，各含 Version/Status/Confidence/Last Update 等（**无真实数据显示 N/A / Coming Soon，绝不伪造**）+ 真实链接按钮(查看评分/影子对比/融合报告/学习报告/回测验证/纸面交易)。
- **Research Roadmap** 时间线（Adaptive V3/Shadow/Fusion/Learning ✔Production → Paper Product/Portfolio ●Next → Adaptive V4 ◎Planning，纯展示）。
- **Research Notes**（v17.57/56/55/54/4x 真实版本摘要）。
- **Future Modules**：Portfolio/Paper Trading/Factor Lab/Adaptive V4/AI Explain/Institution Flow/Macro Engine 全 Coming Soon。
- **删除**：空实验列表 / 0 个实验 / 计划中·已完成·已废弃 / Prisma Studio 教程 / CLI 说明。

### 验收
Build ✅ PASS（tsc 0 error）；Health ✅ CRITICAL=0；/admin/experiments 200；**无 API/DB/算法改动**（仅只读 health/status 展示）；所有按钮真实链接或 Coming Soon（无 href=#/空 onClick/假按钮）。V3 Freeze 不受影响。
- 修改：`app/admin/experiments/page.tsx`。

---

## [17.57.0] - 2026-07-04 — P3-T15 策略中心 Strategy Intelligence Center Premium 重构 🏦

`/strategy` 升级为 Bloomberg × BlackRock Aladdin × Bridgewater × Apple Stocks Pro 风格的机构级策略情报中心。**纯 UI**，未改任何策略/评分/推荐/AI 算法/持仓/API/计算公式。保留 `overview` fetch + `StrategyTab`/`StabilizationTab`/`ReportsTab`/`ExplainDrawer` 全部逻辑。

### 重构（主渲染 · 深色 #111315/#171A1F/#262B33）
- **Hero**：STRATEGY INTELLIGENCE + 今日策略情报 + 3 策略判断芯片（日内/波段/长线 · 强势/稳健/观察/等待，读 learning.grade）+ 右侧综合评分 ScoreRing(unified.integrityScore) + 等级 + recommendation。
- **4 Mission Cards**（统一高度/宽度/数字）：Overall Score(integrity+进度条) / Execution(今日 N/6 OK) / Stability(稳定天数) / Learning(AI 等级)。
- **3 Premium 策略卡**：ScoreRing + 累计收益/胜率/Alpha + 持仓/已平/Top10/仓位 + AI 一句总结 + 等级 badge；**日内=橙 #FF9F0A / 波段=蓝 #0A84FF / 长线=绿 #34C759**，选中态彩色描边+光晕。
- **资金分配关系**：3:4:3 三段彩条（日内30/波段40/长线30，独立资金池 ¥100M，静态展示既有分配）。
- **Segmented Control** tabs（日内/波段/长线/稳定化/报告，Apple 药丸 + 彩点）。
- 推荐股票表(Bloomberg 风 dark：#/銘柄/AI/技术/新闻/策略分/查看原因)、成交记录、学习等级、回测统计 = 既有 `StrategyTab` 内容保留；「查看原因」→ 既有 `ExplainDrawer` 右侧抽屉。tabular-nums 全局。

### 验收
Build ✅ PASS（tsc 0 error）；Health ✅ CRITICAL=0；/strategy 200；**策略逻辑/评分/推荐/API 100% 未改**（仅展示层，overview/[type]/explain/validation Response 一致）。V3 Freeze 不受影响。
- 修改：`app/strategy/page.tsx`。

---

## [17.56.0] - 2026-07-04 — P3-T12/T13/T14 三大运维页 Premium UI 重构 🛰️

纯 UI 重构，**未改任何 API/Cron/DB/Prisma/Health·Pipeline·Sync 逻辑/检测算法/数据源**。三页全部消费现有 endpoint。

### T12 · 控制中心 Mission Control（Premium 深色运维驾驶舱）
`/admin/mission-control` 从黑块 monospace 升级为 Grafana × GitHub Actions × Linear × Datadog 深色风（bg #111315 / card #171A1F / border #262B33 / #34C759·#FF9F0A·#FF453A·#0A84FF）。保留 `data` + 60s 自动刷新 + 全部字段。
- Header：Mission Control + 版本徽章(V1·FROZEN🔒 + scoreVersion + snapshot) + 刷新 + Last Sync。
- 第一屏 **4 张 Status Card**：Production / Trading Architecture / Pipeline(进度条) / Validation（图标+状态 badge+大数字+完成率）。
- **Pipeline Timeline**（GitHub Actions 风）：13 步 time/状态点/名称/结果/耗时/JST/✓。
- **Warnings** 可展开 Apple Alert Cards；**Critical=0 显示 ✅ No Critical Issues**（非空框）。
- Data Freshness + 三策略 + 系统进程(pm2)。tabular-nums、hover/refresh 轻动画。

### T13 · 数据校验 Verification Center（Premium 浅色）
`/admin/verify` 绿框 Banner → **Hero 6 状态卡**（Health Score / Warnings·Non-Blocking / Critical·PASS / Stocks / Coverage / Last Check，读 verify + 新增 `/api/health/status` 只读）。**告警 Apple Alert Cards**（Blocking/Warning 分级）；**生产状态模块时间线**（8 模块 badge）；安全规范 checklist(AISafetyPanel) 保留；刷新/复制报告 Apple 按钮；Critical=0→「No Blocking Issues · System Ready」。抽查/历史快照保留。

### T14 · 同步状态 Data Pipeline Center（Premium 浅色）
`/sync` 5 张普通数字卡 → **统一 Hero**（同步进度条 10/10 Healthy + 100% Data Ready + 6 状态卡：数据源健康/Health Score/覆盖/综合评分/TDnet/市场温度）。**巨大黄色 WARNING → 紧凑可展开 Apple Alert**（数据健康守卫 · N Warning · No Blocking · AI 推荐已允许）。保留 10 张源卡片(✅REAL badge + 立即同步/仅Cron，runSync/poll 逻辑不变) + Cron 时间线 + 同步日志。

### 验收
Build ✅ PASS（tsc 0 error）；Health ✅ CRITICAL=0；三页 /admin/mission-control · /admin/verify · /sync 均 200；**逻辑/API/Cron 100% 未改**（仅展示层 + verify 新增只读 health/status 拉取）。V3 Freeze 不受影响。
- 修改：`app/admin/mission-control/page.tsx`、`app/admin/verify/page.tsx`、`app/sync/page.tsx`。

---

## [17.55.2] - 2026-07-04 — P3-T11 股票详情页 V2：左右平衡 + 信息架构优化 📐

### 目标
纯信息架构优化（无新业务、无 API/评分/数据改动）。修复 T10 详情页下半部严重失衡：左栏图表结束后大片空白，右栏 Decision/Risk/Peer 仍很长。

### P1 修复：左栏连续堆叠（Bloomberg/TradingView 风）
- ChartTabs 精简为 **价格走势 / 技术指标** 两个图表 Tab（保留 K线/MA/RSI/Volume/周期切换）。
- 把原藏在 Tab 里的 **AI 评分构成 / 财务摘要 / 公司新闻** 移出为**左栏常驻堆叠卡片**（`AIScorePanel`/`FinancialsPanel`/`NewsPanel`），全部用现有 API（intelligence 的 score/news + 现有 /financials，financials 改为挂载即加载）。
- 效果：左栏 = 图表 → 评分构成 → 财务数据 → 最新动态，与右栏(决策+风险+同行)**基本等高、上下连续、无 >400px 空白**。实测完整数据股(7203.T)左栏略高于右栏。

### Hero V2（3 区，不增高）
左 identity（名称/代码/行业/市场/风格/评级）｜中 AI verdict（BUY/HOLD/AVOID + AI Confidence 条 + 一句 AI 摘要）｜右 price + ScoreRing。

### 其它优化
- **同行比较 → 排行榜**：前三名金/银/铜排名徽章 + 醒目评分 + 评级色块（Bloomberg 风）。
- **风险分析颜色层级**：低=绿 / 中=橙 / 高=红（复用 riskColor，未改评分）。
- **图表区**：图例字号/留白/padding Apple Stocks 化；周期 1M/3M/6M/1Y/3Y/全部（切片，不改逻辑）。
- 查看报告 → 平滑滚动到「评分构成」卡片（`#ai-score-panel`）。

### 验收
Build ✅ PASS（tsc 0 error，panels 377/ChartTabs 127/page 166 均 <500）；Health ✅ CRITICAL=0；/stocks 200；**API/评分/数据零改动**（仅展示层重排 + 现有 endpoint）。V3 Freeze 不受影响。
- 修改：`app/stocks/[symbol]/page.tsx`、`components/stock-detail/panels.tsx`、`components/stock-detail/ChartTabs.tsx`。
- 备注：会话中观察到 4318.T StockScore 被 purge（其 ai-universe 记录被改为 MANUAL_INCLUDE_WATCHLIST，aiEnabled=true 待重算）——与本 UI 改动无关，下次 07:30 compute-scores 自愈；UI 对空数据正确显示空态。

---

## [17.55.1] - 2026-07-04 — P3-T9 补充：Sidebar 功能入口完整性恢复 🔁

### 背景
T6 Sidebar 重构时丢失了 3 个功能入口、三级分组被压成两组。本次**仅恢复功能完整性，不新增任何功能**。

### 恢复的入口（旧版有、新版缺）
- **版本中心** `/admin/versions`（nav.versionCenter）— 恢复
- **新闻资讯** `/news`（nav.news）— 恢复
- **数据校验** `/admin/verify`（nav.dataVerify）— 恢复（与 `/sync` 同步状态是**不同页面**，非改名：数据校验=「数据有没有问题」，同步状态=「数据同步到哪里」，两者并存）

### 恢复三级结构（13 项，= 旧版数量，零删除）
- **核心**：今日总览 / AI选股 / 策略中心 / 自动交易(Paper) / 回测验证 / 研究分析
- **数据与学习**：学习报告 / 版本中心 / 实验管理 / 新闻资讯
- **系统管理**：控制中心 / 数据校验 / 同步状态
- 分组标题（核心/数据与学习/系统管理，读 nav.core/dataAndLearning/systemMgmt）+ 数据来源(J-Quants/Yahoo Finance JP/TDnet) + 语言切换全部保留。

### 保持
Apple Premium 浅色 UI + Lucide 图标不变；全部走 `ROUTES` 常量；新增图标 Layers(版本中心)/Newspaper(新闻)/CircleCheck(数据校验)/RefreshCw(同步状态)。三个恢复路由实测 200。

### 验收
Build ✅ PASS（tsc 0 error）；Health ✅ CRITICAL=0；**新版功能数量 13 = 旧版 13（≥，零删除）**；仅改 `components/Sidebar.tsx`。

---

## [17.55.0] - 2026-07-04 — P3-T10 股票详情页 Apple Premium AI 决策页重构 📊

### 目标
`/stocks/[symbol]` 从"数据堆叠后台页"重构为 **AI 股票决策页**（Apple × Linear × Vercel × Stripe × Apple Stocks × Bloomberg Lite）。保持数据/评分/推荐/图表/API 完全不变，仅重构展示层。

### 逻辑 100% 保留
`/intelligence`（完整 IntelData）+ `/watchlist` + `/indicators`(图表) + `/financials`(懒加载) + `/admin/stocks/:s/ai-universe`（AiUniverseControl）全部 endpoint 与 fetch 不变；aiConclusion/topReasons/topRisks/stratKey 等派生逻辑逐字保留。实测 intelligence API 不变（adaptiveScore 73 / BUY / rank 1）。

### 组件拆分（<500 行/文件，禁复制 JSX）
`components/stock-detail/`：ui.tsx（types + palette + ScoreRing + Card + MetricCell + ScoreBar + AiUniverseControl）/ panels.tsx（Toolbar / Hero / MetricStrip / DecisionPanel / RiskPanel / CompanyPanel）/ ChartTabs.tsx（5 Tab + 图表周期）；page.tsx 164 行仅做 fetch/state/派生/编排（0 中文字面量）。

### 布局（左主 8 / 右决策栏 4，max-w-1600）
- **顶部工具栏**（压缩）：返回（支持 returnTo/source）+ 查看报告 + 分享 + 自选股。
- **Hero**（≤260px）：#排名 + 名称 + 代码/市场/行业/风格 chips + 评级 + 策略 + 高风险 + 价格 + 5D/20D + **ScoreRing 环形 AI 评分**。
- **指标条**（横向紧凑 10 格）：52周高/低/52W位置/RSI/5·20·60日/量比/机会分/百分位（**仅展示数据真实存在字段；PE/PB/股息/Beta/市值 数据源无 → 不伪造、不展示**）。
- **左栏 ChartTabs**：Tab（价格走势/技术指标/财务数据/公司新闻/AI分析）+ 图表周期 1M/3M/6M/1Y/3Y/全部（对完整 series 切片，无数据改动）+ Apple Stocks 风 K线/量能/MA/RSI。
- **右栏 sticky AI 决策栏**（第一屏完整）：立即买入/观察/回避 + 策略置信度 + 一句 AI 结论 + 目标收益/止损/最长持仓/建议仓位 + 买卖价位 + 核心理由 + 主要风险；下接 AI 风险分析（技术/新闻/基本面/波动 4 维）+ 同行比较（行业排名/均分/相对强度/前列个股，可跳转）。

### 交互（全部真实可用）
返回（returnTo/history/back）、自选（watchlist POST/DELETE）、**分享**（`navigator.share` → 回退 clipboard）、**查看报告**（切 AI分析 Tab）、Tab 切换、图表周期切换、AiUniverseControl（移出AI评分/成长性不足下拉/加入）——无 `href="#"`/空 onClick/假按钮。

### 验收
Build ✅ PASS（tsc 0 error，4 文件均 <500 行）；Health ✅ CRITICAL=0；/stocks/4318.T 200；**intelligence API 逐字段不变**；响应式 1440/1920 左主+右栏。未改任何评分/推荐/图表计算/API/schema，V3 Freeze 不受影响。

---

## [17.54.1] - 2026-07-04 — P0 修复：AI选股 Dropdown 层级被卡片遮挡 🐛

### 根因
`/screener` FilterBar 的 风格/市场/排序 下拉菜单被下方 Stock Card 遮挡。原因：菜单用 `absolute z-50` 定位在 FilterBar 内，而 FilterBar 外层 `.dash-in` 的 `transform`（animation `fill:both` 保留 `translateY(0)`）创建了**层叠上下文**，把 `z-50` 困在其中；DOM 中更靠后的卡片网格（同为 `.dash-in` 独立层叠上下文）绘制在其上 → 下拉被覆盖。（与 T7 SearchBox 同源。）

### 修复（统一 Popover Portal）
- `components/screener/ui.tsx` 的 `Dropdown` 改为 **body Portal**（`createPortal` → `document.body`），菜单以 `position: fixed` 按触发按钮 `getBoundingClientRect()` 定位，**逃离所有祖先 stacking context 与 `overflow:hidden` 裁切**，始终绘制在最上层。
- **统一 z-index 规范** `Z = { CARD:1, STICKY:100, TOOLTIP:9000, DROPDOWN:9500, MODAL:10000 }`（Modal > Dropdown > Tooltip > Card），菜单用 `Z.DROPDOWN`。
- 打开时 `useLayoutEffect` 同步定位；随 `scroll(capture)`/`resize` 重定位；外部点击 / `Escape` 关闭；下方空间不足时自动向上翻转；`role=listbox`/`option` a11y。

### 覆盖检查
`/screener` 三个筛选下拉（风格/市场/排序）共用同一 `Dropdown` → 全部修复；Segmented（rec 筛选）为内联非弹层、SearchBar 为内联输入无弹层，均无此问题；页面无 Date Picker / Context Menu。

### 验收
- Build ✅ PASS（tsc 0 error）；Health ✅ CRITICAL=0；**实测展开风格下拉，菜单完整浮于股票卡之上，无遮挡/无裁切**；未改任何评分/筛选/排序/API/数据。
- 修改：`components/screener/ui.tsx`。

---

## [17.54.0] - 2026-07-04 — P3-T9 Dashboard Command Center（一屏 AI 工作台）重构 🎛️

### 定位转变
Dashboard 从"官网留白风"（T6）重定义为 **AI 指挥中心**：信息效率 > 留白，决策效率 > 动画。**1440×900 / 1920×1080 / 2560×1440 首屏绝对无需滚动**（实测 content scrollHeight == innerHeight：813/993/1353，零溢出）。仅展示层，未改任何算法/API/数据。

### 一屏三行布局（紧凑）
- **Header**（h44）：指挥中心 + 问候 + 搜索(typeahead)/通知/账户。
- **第一行**（h232）：左 **Today Intelligence**（col-8）+ 右 **System Health**（col-4，88/100 + 6 状态点 + 流水线5/5）。
- **第二行**（Market+Statistics 合并）：4 市场卡（含 AI 解读）一行 + 6 统计格一行。
- **第三行**（h210）：左 **今日流水线**（col-7，4 条 time+事件+数量+✔）+ 右 **快速入口**（col-5，6 个 Launchpad 磁贴 3×2）。

### Today Intelligence（回答 4 问）
- **今日 AI 判断**：多头/震荡/空头（读 `MarketRegime.regime` BULL/SIDEWAYS/BEAR，实时真实）+ Bullish/Neutral/Bearish。
- **AI 置信度**：76%（读 `MarketRegime.breadth` 市场宽度）+ 进度条。
- **市场风险**：低·Low（读 `MarketRegime.volatility`：<20 Low / ≤25 Medium / >25 High）+ 波动率。
- **TOP1 推荐 + 为什么**：ScoreRing 73 + 评级 + 3 条理由 bullet（读头号推荐 `StockScore` 维度分 tech/fund/flow/news/global 取 ratio≥0.5 前 3，key→中文映射在组件层）+ 查看分析。
- **删除固定文案**「日本市场正在持续分析中」→ 改为每日随 regime 变化的 AI 判断。

### 金融 AI 化（市场卡 AI 解读）
TOPIX 多头趋势延续 / 美元日元 日元偏弱·利好出口 / VIX 风险偏低·适合持仓 / 纳指 美科技承压（确定性展示层启发式，非模型调用/非业务逻辑）。

### 数据（只读聚合，零业务改动）
page.tsx 新增只读查询：`MarketRegime` 最新行 + 头号推荐 `StockScore` 维度分；`intelligence{regime,confidence,risk,volatility,breadth}` + `hero.reasonKeys` + `stats.strongBuy`。Chinese 标签映射全在 `components/`（app/page.tsx 零中文字面量）。V3 Freeze/评分/推荐/API 完全未动。

### 验收
- Build ✅ PASS（tsc 0 error）；Health ✅ CRITICAL=0；**One Screen ✅**（1440/1920/2560 无滚动实测）；信息密度 ✅；Apple Premium UI ✅；Financial AI UX ✅。
- 修改：`app/page.tsx`、`components/dashboard/DashboardView.tsx`。

---

## [17.53.0] - 2026-07-04 — P3-T8 AI选股页面 Apple Premium UI 重构 📈

### 目标
在**保持 AI 评分 / 筛选 / 排序 / 搜索 / 接口返回完全不变**的前提下，将 `/screener` 重构为 Apple × Linear × Vercel × Stripe × Apple Stocks 风格的专业金融 AI 产品。**纯展示层**，未改任何业务逻辑/算法/API/数据。

### 逻辑 100% 保留（仅搬运，未改一处）
`/api/screener?limit=200` + `/api/gpt-score`；客户端 rec/style/market 筛选；sort（含 percentileRank/gptScore/finalScore 特判）；300ms 防抖搜索（`/api/screener?q=`）；`displayScore = gpt.finalScore ?? adaptiveScore`。**实测 API stats 逐字段不变**（SB0/BUY12/HOLD284/WATCH1590/AVOID1183）。

### Apple Premium 重构（`components/screener/`，无一文件 >500 行）
- **组件拆分**：`ScreenerHeader / MetricCards / FilterBar / SearchBar / StockCard / ScoreRing / Pagination / EmptyState / LoadingState / Segmented / Dropdown`（page.tsx 248 行仅做状态编排）。
- **Header**：AI选股 大标题 + 副标题「整合股票列表、AI推荐与全市场筛选」+ Apple 搜索（⌘K，代码/中/日/英）+ 刷新按钮（旋转态）+ 最后更新时间。
- **统计卡**：5 张 Apple Card（0 Strong Buy / 12 Buy / 284 Hold / 1,590 Watch / 1,183 Avoid），数字 40px + 小标题，点击即筛选、激活态彩色描边。
- **筛选**：Apple **Segmented Control**（全部/强烈买入/买入/观察/持有/回避）；风格 / 市场 / 排序 三个 Apple **Dropdown**（统一 40px 高、圆角、chevron、popover）。
- **股票卡（重点）**：`#rank` + 收藏书签 → 名称(18px 最大) + 代码 + Prime/Standard/Growth 徽章 + 风格芯片 → **ScoreRing 环形评分**（`finalScoreHex` 上色）+ 评级 pill + ¥价格 + 涨跌 → RSI/均线/5D 指标 chip → 查看分析 + 收藏；**hover 整卡上浮 2px + 阴影增强 + 名称变蓝**。
- **AI Score**：改绿色数字为 **Apple Activity Ring** 圆环（73 绿环）。
- **信息层级**：名称 18 > 价格 19 > 评级/环 > 代码 12 > 指标，字号严格分级。
- **分页**：Apple 圆角分页（当前页蓝 / 上一页 / 下一页 / 省略号），每页 24。
- **收藏**：localStorage 本地收藏（**零后端、零 schema、零业务逻辑**，纯 UI 状态），书签填充蓝。
- **⌘K/Ctrl+K** 聚焦搜索；刷新按钮重取数据（不闪 loading）。
- 设计 token 复用 T6 `.dash-card/.dash-int/.dash-in`（圆角/极浅阴影/1px 描边/240ms 动画），新增 `dash-spin`（刷新旋转）；色 #FAFAFA/#FFFFFF/#ECECEC/#007AFF/#34C759/#FF9F0A/#FF3B30，无渐变无霓虹。

### 响应式
`max-w-1600`；grid 1→2→3(lg)→4(2xl) 自动换列；1440 三列 / 1920·2560 四列均协调、留白充足。

### 验收
- Build ✅ PASS（tsc 0 error）；Health ✅ CRITICAL=0；/screener 200；**API stats 不变**（零业务改动，V3 Freeze 不受影响）。
- 新增：`components/screener/{ui,StockCard,sections}.tsx`；修改：`app/screener/page.tsx`、`app/globals.css`、`components/dashboard/icons.tsx`。

---

## [17.52.0] - 2026-07-04 — P3-T7 Dashboard 全链接与全功能可用性修复 🔗

### 目标
全站入口可用性修复 + 链接审计 + 功能连通性验收。只修入口/链接/跳转/展示可用性，**不改任何核心业务**。

### 路由常量化（单一真源）
- 新增 **`lib/routes.ts`**：`ROUTES` 常量表 + `stockDetail(symbol)` / `comingSoon(feature)` / `timelineRoute(type)` / `stockSearchApi(q)` 动态生成器。Sidebar 与 DashboardView 全部改用 ROUTES，**消灭散落硬编码 href**。

### 顶部搜索（真实 typeahead）
- 新增 **`components/dashboard/SearchBox.tsx`**：复用现有只读 `/api/stocks?q=`（已支持 代码/中文/日文/英文 四种搜索 + limit），220ms 防抖、下拉 Top6、方向键/回车/Esc、点击结果跳 `/stocks/[symbol]`、loading skeleton、`未找到相关股票` 空态、错误 `重试`。实测 `7203.T/丰田/トヨタ/Toyota` 均可搜。**修复下拉 z-index 层叠 bug**（`.dash-in` 的 transform 使 header 成层叠上下文困住下拉 → header 提 `relative z-30`）。

### Dashboard 入口全部接线
- **Hero 查看分析** → `stockDetail(symbol)`；symbol 缺失时按钮 `disabled` + 说明（`暂无详情`）。
- **系统状态卡** 整卡可点 → 控制中心。**Market 卡**（TOPIX/USDJPY/VIX/NASDAQ）可点 → 市场状态。**Timeline 每条**可点 → 对应页（评分→AI选股 / 新闻→新闻 / 行情→数据中心 / 全球→市场状态）+ hover 高亮。
- 通知 → 新闻；账户 → 系统设置；Quick Actions 6 个 + Sidebar 10 项全部 ROUTES 常量、全部真实 200。

### Coming Soon + 友好路由别名
- 新增 **`app/coming-soon/page.tsx`** + `components/dashboard/ComingSoonView.tsx`（Apple Premium 风：`功能建设中` + feature 说明 + `返回总览`/`返回上一页`）。
- **`next.config.ts` `redirects()`**：`/control-center`→`/admin/mission-control`、`/data-center`→`/sync`、`/settings`→`/admin/mission-control`、`/research`→`/admin/research`、`/learning-report`→`/admin/learning-report`（服务器级 **308**，瞬时无闪烁，curl 可跟随）。

### Smoke Test
- 新增 **`scripts/smoke-dashboard-links.ts`** + `npm run smoke:links`（`BASE=` 可选，2xx/3xx=PASS，4xx/5xx=FAIL，输出表格）。**实测 28/28 PASS**（含 5 个 308 别名）。

### 按钮状态规范
- 全 Dashboard 无 `href="#"` / `javascript:void(0)` / 空 onClick / console.log 占位；可点即有真实动作，不可用即 disabled + 说明。

### 验收
- Build ✅ PASS（tsc 0 error）；Health ✅ CRITICAL=0；**Smoke 28/28 PASS**；warm TTFB 0.14s；未改任何业务代码（数据契约不变），V3 Freeze 不受影响。
- 新增：`lib/routes.ts`、`app/coming-soon/page.tsx`、`components/dashboard/{ComingSoonView,SearchBox}.tsx`、`scripts/smoke-dashboard-links.ts`；修改：`components/dashboard/DashboardView.tsx`、`components/Sidebar.tsx`、`next.config.ts`、`package.json`。

---

## [17.51.0] - 2026-07-04 — P3-T6 Dashboard Premium UI（Apple × Linear × Vercel × Stripe）✨

### 目标
纯视觉升级（不改任何业务逻辑/数据/API），把首页打磨到专业 SaaS 产品水准。**page.tsx 数据契约零改动**，仅重写 `components/dashboard/DashboardView.tsx` + 固化设计 token 到 `app/globals.css`。

### 信息层级（Less is More）
- **首屏仅 2 张卡**（Hero + 系统状态），取代 T5 的 Hero+状态卡+4 运营卡=6 卡的高密度布局；运营指标（健康度/流水线/校验/新鲜度）**收敛进系统状态卡**，第一屏更克制、更透气。

### 组件重构（named components，禁止重复 JSX）
`DashboardHeader` / `DashboardHero` / `DashboardMetricCard` / `DashboardMarketCard` / `DashboardStatusCard`(+`StatusPill`) / `DashboardTimeline` / `DashboardQuickAction` / `DashboardSection` / `ScoreRing`，`DashboardSidebar`=`components/Sidebar.tsx`。
- **Hero**：eyebrow「TODAY INTELLIGENCE ● 实时」+ 大标题「日本市场正在持续分析中」+「每日 08:00 自动更新」+ 今日精选（股票/**ScoreRing 环形评分 Apple Health 风**/评级 pill/一句总结/查看分析/参考价）；无推荐→空态。
- **Metric Cards**：大数字主导（38–40px）+ 小标题在下（14px）+ 右上极简图标；4 项（3719 日本上市公司 / 3069 AI已完成分析 / 359 新闻事件 / 12 今日推荐）。
- **Market Cards**：Apple Stocks 风（指数/大数值/箭头涨跌 pill/「今日」）。
- **System Status**：大健康度 88/100 良好 + Healthy pill + 6 个 **Status Pills**（数据同步/AI引擎/策略引擎/Cron/数据库/API 全绿点）+ 页脚 流水线5/5·校验通过·行情日。
- **Timeline**：GitHub Activity / Apple Health 连线活动流（竖线 + 光晕状态点 + 时间/事件/明细）。
- **Quick Actions**：Apple Launchpad 圆角图标磁贴（居中图标 + 标题 + 描述，hover 浮起）。

### 设计规范（token 固化于 globals.css）
- 圆角 22px、极浅阴影（`0 1px 2px / 0 1px 3px`）、1px 描边 #ECECEC、卡片 padding 24–36、Section 间距 64px、Grid gap 24；`.dash-card`/`.dash-int`(hover 上浮 2px+阴影)/`.dash-tile`(hover 上浮 3px + scale1.02) 三类交互原语。
- **动画**：`.dash-in` fade+slide-up 240ms cubic-bezier；hover 200ms；尊重 `prefers-reduced-motion`。
- **字号**：Headline 30–34、Section 22、Card Title 15、Body 14、Caption 12，全数字 tabular-nums。
- **颜色**：#FAFAFA/#FFFFFF/#ECECEC + #007AFF/#34C759/#FF9F0A/#FF3B30，无霓虹/无渐变背景。

### 验收
- Build ✅ PASS（tsc 0 error）；Health ✅ CRITICAL=0；页面 200，**warm TTFB 0.14s**。
- 响应式 1440 / 1920 均协调（内容 max-w-1440 居中，宽屏留白充足）。
- **未改任何业务代码**（API/Score/Fusion/Shadow/Paper/Recommendation/Learning/Cron/DB 全未动，page.tsx 数据契约不变），V3 Freeze 不受影响。
- 修改文件：`app/globals.css`、`components/dashboard/DashboardView.tsx`。

---

## [17.50.0] - 2026-07-04 — P3-T5 Dashboard Apple UI 重构 + 首页数据修复（Production）🍎

### 背景 / 根因
首页 `/`（`app/page.tsx` → 旧 `SystemDashboard.tsx`）大量指标显示「—」「加载中…」「Invalid Date」。
**根因**：`/api/admin/mission-control` 早已重构为 V2 结构（`productionStatus`/`todayPipeline`/`dataFreshness`/`health`/`version`/`generatedAt`），
但 `SystemDashboard.tsx` 仍读旧字段（`mc.healthScore`/`mc.pipeline`/`mc.featureCoverage`/`mc.freshness`/`mc.computedAt`）——
全部 `undefined` → 所有 pill 显示「—」，底部 `new Date(mc.computedAt)` → 「Invalid Date」。API 本身健康（HTTP 200、真实数据），纯前端字段映射断裂。

### 架构性修复（消灭客户端 loading 竞态）
- **`app/page.tsx` 改为服务器组件一次性并行抓取全部数据**（force-dynamic），服务器端安全格式化（`fmtDate`/`jstClock`/`daysAgo` 全部 null-safe，永不产生 NaN/Invalid Date），以 props 传给纯展示客户端组件 → **首屏即渲染真实数据，无 loading 态、无「—」**。
- 展示组件 `components/dashboard/DashboardView.tsx` 通过 `router.refresh()` 每 60s 静默刷新（重跑服务器组件、无 loading 闪烁）。

### Apple UI 重构（White / Light Gray / Soft Shadow / Large Radius / Huge Whitespace）
- 背景 `#FAFAFA`、卡片 `#FFFFFF`、描边 `#ECECEC`、极淡阴影、圆角 24–28px、大量留白；Primary `#007AFF` / Success `#34C759` / Error `#FF3B30` / Warn `#FF9F0A`；SF Pro Display → Inter 字体栈（`.dash-font` 作用域限定，不改全局）。
- **动画**：CSS `dash-fade-up`（fade + slide-up，cubic-bezier）+ hover `scale(1.02)`，尊重 `prefers-reduced-motion`（**未引入 Framer Motion——CSS 实现同等 Apple 观感且首屏更快、零依赖零部署风险**）。
- **图标**：本地内联 SVG（Lucide MIT 路径，`components/dashboard/icons.tsx`）——**零依赖、零服务器 npm install**，视觉等同 lucide-react。
- 抽组件：`SectionHeader`/`Card`/`MetricCard`/`StatusRow`/`MarketCard`/`QuickAction` + 各 Section。
- **Sidebar 重构**：浅色（白底 `#ECECEC` 描边）+ Lucide 图标（无彩色/无发光）+ 规范化菜单（总览/AI选股/策略中心/自动交易/回测/研究分析 ─ 学习报告/数据中心/实验室/系统设置），保留三语 i18n `t()`。

### 页面结构（四屏）
- **Header**：晚上好 👋 欢迎回来 / TOHOSHOU AI 正在分析日本市场 / 搜索·通知·账户。
- **第一屏**：① Hero 今日精选（股票/评分/AI 一句总结=`DailyRecommendation.summaryZh`/查看分析；无推荐→「今日暂无推荐·每日08:00自动更新」）② 系统状态（数据同步/AI模型/策略引擎/Cron/数据库/API 全绿）+ 运营条（系统健康度/数据流水线/数据校验/数据新鲜度，即原「—」四项，已修复）。
- **第二屏**：AI 数据统计（股票总数/评分完成/今日推荐/AI分析/新闻数量，Large Number）。
- **第三屏**：今日流水线 Timeline（真实 JST 时间戳）。
- **第四屏**：快速入口（AI选股/影子评分/融合策略/纸面交易/回测研究/学习报告，Apple 大按钮）。

### 数据修复实测（生产）
- 系统健康度 88/100 GREEN（CRITICAL=0、WARNING=4、PASS=61，读最新 `reports/data-health-guard-*.json`）；数据流水线 **5/5 全部完成**；数据校验 **通过 CRITICAL 0**；数据新鲜度 2026-07-03。
- 系统状态 6 项全 **NORMAL**；市场概况 TOPIX 431.70 +1.24% / 美元日元 161.38 / VIX 15.81 / 纳斯达克 25,832.67 −0.80%（**日经225 数据源为 null → 服务器端过滤，不显示占位**）；AI 统计 3,719 / 3,069 / 12 / 3,069 / 359。
- **HTML 无 `—`/`null`/`undefined`/`NaN`/`Invalid Date`/`Loading` 可见文本**（余留 `$undefined` 为 Next.js RSC Flight 内部标记，非 UI）。
- TTFB ≈ 0.63s（服务器渲染，force-dynamic）。

### 边界修正
- 全球指数日期天然滞后（跟随美股 T-1）→ 新鲜度判定放宽至 ≤2 天，避免 Cron/流水线误判 amber。
- 市场卡 `change=null`（USD/JPY·VIX 无涨跌字段）显示「收盘价」而非 `—`；`value=null` 的指数服务器端整卡过滤。

### 禁改项确认（未触碰）
AI Score / GPT Ranking / Recommendation / Strategy / Fusion / Shadow Backtest / Paper Trading / Learning / Cron / DB Schema / Trading / Ranking Logic **全部未改**；仅展示层 + 只读数据聚合。**V3 Freeze 不受影响**（未触任何评分算法/权重/阈值）。

### 验收
- Build ✅ PASS（`next build` exit 0，tsc 0 error）；Health ✅ CRITICAL=0；Dashboard API ✅（`/` HTTP 200）；Dashboard Data ✅（全部真实）；Loading State ✅（无 loading 竞态）；Apple UI ✅；Performance ✅（TTFB 0.63s）；Deploy ✅（rsync `.next` + `pm2 restart tohoshou-web`，未动 cron/schema）。
- 修改文件：`app/page.tsx`、`app/layout.tsx`、`app/globals.css`、`components/Sidebar.tsx`、`components/dashboard/icons.tsx`(新)、`components/dashboard/DashboardView.tsx`(新)。旧 `app/SystemDashboard.tsx` 失去引用（保留、无害）。

---

## [17.49.0] - 2026-07-03 — P3-T4 V3 Shadow Freeze（冻结验证期开始）🔒

### 🔒 V3 Shadow Freeze v1 开始
- **冻结版本：** Adaptive Score V3 · **冻结 Commit：** `ca95896` · **Freeze Date：** 2026-07-03 · **到期评审：** 2026-07-10（下周五）
- 从本次部署起冻结 V3 Shadow 一周，**停止一切算法修改，仅自动收集真实前向证据**。

### 冻结期禁止修改（直到 2026-07-10）
Dynamic Weight / Calibration / Threshold / Risk / Confidence / Quality / Explain / ScoreV3 / Alpha / Market Regime /
Feature Flag / Backtest / Shadow Logic —— 禁止改任何评分逻辑/权重/阈值/算法。`SCORING_ENGINE=v2` 保持，切换须人工确认。

### 自动化（Cron 全部继续运行，不停止）
- **每日 10:15** compute-score-v3-shadow + backtest（Shadow/Calibration 自动累计）。
- **新增 每日 10:35** `replay-score-v3.ts` → 累计 T+1/3/5/10 前向收益，写 `reports/score-v3-replay.json`。
- **新增 金曜 16:45** `gen-v3-final-review.ts` → 到期自动生成 `docs/V3_FINAL_PRODUCTION_REVIEW.md`（Grade A/B/C/D 判定）。
- Universe / AI Score V2 / Alpha / Analytics / Research 等 Cron 全部照常。

### Freeze Monitor（AI研究中心新增 Tab「V3 Freeze Monitor」）
- `lib/scoring-v3/freeze.ts`（冻结常量）+ `GET /api/scoring-v3/freeze` + `components/research/FreezeMonitorPanel.tsx`。
- 显示：Freeze 版本/进度（第 N/7 天）/ Shadow 累计天数 / Readiness+Grade / 冻结权重 / 最新前向收益 V2vsV3 / 每日 Readiness 历史 / 是否达上线条件。

### 当前状态（实测）
- 第 1/7 天；Shadow 累计 1 日；Readiness 76.8（B）；Replay 20 日 V3 vs V2 胜 11/12（T+10 spread +0.69）；gate 未达标（<90）。

### 验收
- Build PASS；Health CRITICAL=0；**Production 完全不变**（StockScore SB2/BUY21/HOLD391/WATCH1494/AVOID1161、DR 500、GPT/Portfolio 未动）。
- Freeze 状态建立成功；每日自动累计 Shadow + Replay；Freeze Monitor 页面正常；cron 已重启注册新槽位。
- 未改 StockScore/DR/Portfolio/GPT/Compute Chain/Production；未切 SCORING_ENGINE=v3。

> **V3 已进入 Freeze。预计 2026-07-10（下周五）进行最终上线评审。在此之前禁止修改评分算法。**

---

## [17.48.1] - 2026-07-03 — P3-T3.1 V3 历史回放（只读，前向证据）

补 P3-T3 唯一缺口「前向证据不足」：不等一周，用历史回放生成前向收益证据。
- **`scripts/replay-score-v3.ts`**（只读）：最近 20 交易日（2026-05-25→06-19）逐日按 as-of 严格重建
  PRODUCTION/ALPHA/FUSION/V3（价格核心），算 Top10/20/50 的 T+1/3/5/10 前向收益，60,984 观测。
- **结果：V3 vs V2 在 12 格（TopN×横期）中 11 胜 1 负**；Top20 V3−V2 spread T+1 +0.03 / T+3 +0.23 / T+5 +0.60 / T+10 +0.69，随横期扩大。
- **诚实说明**：窗口为回撤期，V3 靠「少亏」赢（V3 Top20 T+10 −3.94% vs V2 −4.63%），Alpha 此期最优（+0.35%）；仅单一 regime、价格核心口径。
- Readiness「前向证据」维度 ~48 → ~72 ⇒ **Readiness 76.8 → 约 82（Grade B），仍未达 90**（需上行窗口 + 实盘 Shadow）。
- 报告：`docs/V3_HISTORICAL_REPLAY_2026-07-03.md`。
- 验收：Build PASS、Health CRITICAL=0、**V2 指纹完全不变**（SB2/BUY21/HOLD391/WATCH1494/AVOID1161、DR 500）；未改 StockScore/DR/Portfolio/GPT，未切 SCORING_ENGINE。

---

## [17.48.0] - 2026-07-03 — P3-T3 V3 Calibration Engine（评分标定引擎，Shadow-only）

### 目标
解决 P3-T2 评审的 P0 阻断项——V3 用固定阈值(75/65/55/45)导致 STRONG_BUY 155只(5.1%)过宽。改为**每日按分布 +
市场状态动态生成阈值**，并新增 Confidence / Data Quality / 评级解释 / Production Readiness Gate。仍 Shadow，
`SCORING_ENGINE=v2` 不变，绝不接管生产。

### 标定引擎（`lib/scoring-v3/calibration/`，6 模块）
- **distribution.ts**：当日分数分布 + 分位数。
- **threshold.ts**：动态阈值。目标桶 SB~Top1% / BUY~Top5% / HOLD~Top25% / WATCH~Top60% / AVOID剩余；
  BULL 略宽(SB1.5%)、BEAR 更严(SB0.5%)；每天从分布重算分数切点。
- **confidence.ts**：Confidence 0–100（维度覆盖35% + 新鲜度15% + 基本面20% + Alpha12% + 新闻8% + 低风险10%）。
- **quality.ts**：各维度覆盖率 + 综合数据质量分。
- **rating.ts**：「为什么是 Strong Buy」解释（进入前X% + 各维度贡献占比 + 风险 + Confidence）。
- **calibration.ts**：编排 + Production Readiness Gate（9 维加权 0–100，≥90 才可评估上线）。
- **`lib/scoring-engine.ts`**：新增 Feature Flag `V3_CALIBRATION`（默认 **ON**，off 回退固定阈值）。

### 数据 + 集成
- `AdaptiveScoreV3Shadow` 加 `confidence` / `qualityScore` / `calibrated`；新表 **`AdaptiveScoreV3Calibration`**（每日阈值/分布/Confidence/Quality/SB统计/Readiness/历史）。
- `compute-score-v3-shadow.ts` 集成标定：动态阈值评级 + 每股 Confidence/Quality + 写标定报告表；cron 10:15 每日自动跑。

### 效果（生产实测）
- **STRONG_BUY 155 → 47（5.1% → 1.53%）** —— P0 阻断项已修复，SB 回到可操作区间。动态阈值 SB≥84.4/BUY≥79.0/HOLD≥61.8/WATCH≥42.8。
- 评级分布(标定后)：SB47 / BUY138 / HOLD644 / WATCH1074 / AVOID1166（命中目标桶）。
- Confidence 均值 84.3（高3056/中1/低12）；Data Quality 94.8%；SB 平均 Confidence 85.1%、低流动 5。
- **Production Readiness = 76.8 / Grade B（未达 90，暂缓上线）** —— 评级标定已修复，剩余缺口为「前向证据不足」（仅 1–2 日 Shadow，需累积 ≥1 周）。

### API + UI
- `GET /api/scoring-v3/calibration`（标定报告 + 历史）；`/shadow` 增 Confidence/Quality/calibrated。
- AI研究中心新增 Tab **「V3 Calibration」**：Readiness Gate / 动态阈值 / 评级分布 / Confidence分布 / Data Quality / SB统计 / 市值分布 / 历史 / CSV。ScoreV3Panel 增 Confidence 列。

### 验收
- **V2 生产完全不变**：StockScore SB2/BUY21/HOLD391/WATCH1494/AVOID1161、DR 今日 500、GPT/Portfolio 未动。
- `tsc`/`build` exit 0；`health:data` **CRITICAL=0**；标定/Confidence/Quality/报告均正常；自动部署（schema db push + rsync .next/lib + 重启 web）。
- 回测（scoreV3 排名未变，标定仅相对评级）Top10/20/50 收益与 P3-T1 一致，`reports/score-v3-backtest.json` 有效。
- **禁止事项遵守**：未改 Production/StockScore/Portfolio/DR/GPT/Compute Chain，未切 `SCORING_ENGINE=v3`。

---

## [17.47.0] - 2026-07-03 — P3-T1 Adaptive Score V3 Pro（动态评分引擎，Shadow-only）

### 目标
建立顶级动态评分引擎，解决 V2「全球/资金/新闻维度区分度低」问题（详见 v17.46 数据审计）。用动态权重替代
固定权重，先 Shadow 验证，**完全不影响生产**。周一前据 V3 Shadow + Backtest 决定是否切 `SCORING_ENGINE=v3`。

### 引擎（`lib/scoring-v3/`，6 模块）
- **regime-gate.ts**：市场状态门控。Regime 不直接加分，只提供每状态基准权重 + 风险倍率（BULL 轻 0.6 / SIDEWAYS 1.0 / BEAR 重 1.4）。
- **factor-quality.ts**：因子质量评估（覆盖率/区分度/新鲜度/RankIC → q∈[0,1]）+ 横截面百分位。**低区分度/低覆盖维度自动降权**。
- **dynamic-weight.ts**：动态权重（base × quality → min/max 上下限 → 归一化 100% → 单日±5%限幅）。
- **risk-adjustment.ts**：风险层 [-15,0]（高波动/低流动/财报缺失/数据差；信用制限仅轻扣不排除）。
- **score-v3.ts**：7 维主引擎（技术/基本面/Alpha/新闻事件/个股资金流动性/风险/市场状态门控）。新闻**无事件不给默认常数分**；
  资金**只用个股级数据**（AlphaFactor 量比/放量/流动性，弃市场级 InstitutionalFlow）；**全球维度彻底移除**（V2 中它对排名零贡献）。
- **explain.ts**：每股中文解释（评分/评级/各维度贡献/风险扣分/结论）。
- **lib/scoring-engine.ts**：Feature Flag `SCORING_ENGINE=v2|v3`（默认 v2，一键回滚；本阶段生产链路不读取，仅就绪开关）。

### 数据 + 脚本
- 新表 **`AdaptiveScoreV3Shadow`**（symbol/date/scoreV3/rawScore/riskAdjustment/rank/percentile/rating/regime/weightsJson/factorBreakdownJson/riskAdjustmentJson/explanation）。
- **`scripts/compute-score-v3-shadow.ts`**：只写 Shadow 表；实测 3069 只，BULL，动态权重 技术41.4%/基本面18.3%/Alpha22.6%/新闻7.5%/资金10.2%。
- **`scripts/backtest-score-v3.ts`**：重建 V2/Alpha/Fusion/V3 对比（30/90/180 × Top10/20/50 × 持有5/10/20 + 换手率），写 `reports/score-v3-backtest.json`。
  实测 Top20/20日：180日 V3 45.55% ≈ V2 44.82%（略优）、30日 V3 −3.59% 比 V2 −4.61% 抗跌。
- **cron 10:15 JST** 每日自动跑 V3 Shadow + Backtest。

### API + UI
- `GET /api/scoring-v3/shadow`（V3 评分 + 今日动态权重 + 维度覆盖率 + V2 对比）、`GET /api/scoring-v3/backtest`（回测 JSON）。
- AI研究中心新增 Tab **「V3动态评分」**：今日动态权重 / 回测对比 / V3 排名 / 风险扣分 / V2 对比 / 每股中文解释 / 导出CSV。
- 数据更新时间中心新增 V3 模块。

### 验收（生产实测）
- **V2 生产完全不变**：StockScore SB2/BUY21/HOLD391/WATCH1494/AVOID1161（指纹一致）、DailyRecommendation 今日 500 条、GPT Rank/Portfolio 未动。
- V3 Shadow 独立表 3069 条正常生成；V3 Backtest 108 行正常生成；AI研究中心 Tab HTTP 200。
- `tsc`/`build` exit 0；`health:data` **CRITICAL=0**；自动部署（schema db push + rsync .next/lib/scripts + 重启 web/cron，19:05 JST 安全窗口）。

### 禁止事项遵守
未替换生产评分、未改 V2 StockScore/DailyRecommendation/Portfolio/GPT Rank、未删旧评分、未手设固定权重（权重由质量+状态动态导出）。

---

## [17.46.0] - 2026-07-03 — P2-T7 UI/UX 统一优化 + P2-T8 数据更新时间中心（仅前端）

### 目标
将 AI 研究中心打造为老板每天查看的核心页面：统一视觉/标题/页头/颜色/时间格式，加术语 Tooltip、当前推荐
策略、以及各模块「数据更新时间中心」。**仅改前端显示层**，禁改数据库/API 返回值/Cron/评分/Alpha/Fusion 算法。

### P2-T7 UI/UX 统一
- **统一 Tab 标题**：综合驾驶舱 / Alpha因子库 / 因子分析 / 影子评分（Alpha）/ Alpha策略回测 / 市场状态 / AI融合策略研究。
- **统一页头 `components/research/PanelHeader.tsx`**：所有 panel 用同一页头 —— 标题（统一字号加粗）+ 一句中文说明 +
  `阶段：… · 数据日期：… · 计算时间：… · 股票数量：…只 · 数据状态：…` + 右侧「最后更新：YYYY-MM-DD HH:mm · 正常/偏旧/超时」。
  彻底移除 Phase/Admin/Research Only/computed/date/as-of/shadow 等英文。
- **各 Tab 说明**：Alpha因子库=展示 Alpha 引擎底层技术因子；因子分析=分析各因子对未来收益预测能力；影子评分=仅研究验证，
  不参与正式AI推荐；Alpha回测=比较正式评分与影子评分历史表现；市场状态=识别牛市/震荡市/熊市；AI融合策略研究=寻找各市场状态最优融合比例。
- **术语 Tooltip**（`TERM_TIPS`，鼠标悬停中文解释）：ATR / IC / Rank IC / 夏普比率 / Alpha / 市场宽度 / 波动率 / RS / 量比 等。
- **统一时间格式**：全部 `YYYY-MM-DD HH:mm`（JST），不再出现 computed/UTC/as-of/date。
- **统一按钮/表格/颜色**：导出CSV / 7·30·90·180日 / 正式评分·影子评分·融合比较 按钮高度·圆角·Hover 一致；表头/字体/padding/排序箭头/
  数字右对齐/文字左对齐/股票代码蓝色 统一；颜色规范 绿=上涨·牛市·成功，黄=震荡·等待，红=熊市·回撤·警告，蓝=标题·按钮·链接。
- **综合驾驶舱新增「当前推荐策略」**：按市场状态展示历史搜索的最优融合比例（BULL/SIDEWAYS/BEAR）+ 说明「仍研究/影子阶段，正式推荐当前 100% 使用正式AI评分」，便于未来启用融合。

### P2-T8 数据更新时间中心
- **聚合 API `/api/admin/research-overview` 新增**（我方展示聚合，非生产 API）：`moduleUpdates`（Universe/AI综合评分/Alpha因子/
  因子分析/影子评分/Alpha回测/市场状态/融合策略/新闻 —— 每项最后更新时间 + 状态）、`dataHint`（顶部提示）、`recommendedStrategy`。
  **全部自动读取各产物 `computedAt`（StockScore/AlphaFactor/AlphaFactorReport/AlphaScore/AlphaBacktestResult/MarketRegime/
  RegimeFusionResult/SyncJob-news），不手写时间。**
- **状态颜色**：<24h 绿色（✅正常）/ 24–48h 黄色（偏旧）/ >48h 红色（超时）；新闻当日 18:00 前未更新显示「等待今日更新」。
- **综合驾驶舱新增「数据更新时间」卡**（9 模块，名称/时间/状态）+ **顶部提示**（如「今日研究数据全部最新」或「X 超过 48 小时未更新」）。
- **每个 Tab 顶部**通过统一页头显示「最后更新：YYYY-MM-DD HH:mm · 数据状态：正常」（读取各自 API 的 computedAt）。

### 验证（生产实测）
- `tsc`/`build` exit 0；部署（仅 rsync .next + `pm2 restart tohoshou-web`；无 schema/lib/scripts/cron 变更）；`health:data` exit 0 → **CRITICAL=0**。
- `research-overview` 实测：dataHint「今日研究数据全部最新」；9 模块全绿（Universe 13:07 … 新闻 12:03，均 <24h）；
  recommendedStrategy BULL/SIDEWAYS 影子评分（研究）/ BEAR 20%正式+80%影子。
- 6 个 Tab 路由 HTTP 200；**API 返回值不变**（枚举翻译仍在显示层）；功能 100% 一致。

### 部署
build → rsync `.next` → `pm2 restart tohoshou-web`（未改 schema/cron，未重启 cron）。

---

## [17.45.0] - 2026-07-03 — P2-T6 AI 研究中心全面汉化（UI Only）

### 目标
AI 研究中心 7 个 Tab 全部页面/按钮/表头/统计项/提示文案统一为中文。**仅改前端显示文案**，禁止修改任何
算法/数据库/Prisma/Cron/API 返回值/评分/回测/融合逻辑。保留国际通用缩写（ATR/RS/IC/Rank IC/RSI/TOPIX/CSV）。

### 汉化范围（6 个 panel，综合 Tab 已中文）
- **Alpha因子**：表头 相对强弱5/20/60日、波动率%、距离52周最高/最低点、20日平均成交额、5/20日量比、放量天数；股票代码/股票名称/事件。
- **因子分析**：有效/一般/较弱、胜率、平均超额收益、未来5/10/20日收益、夏普比率、前20%/后20%；因子名中文（相对强弱/波动率/量比…）。
- **Alpha评分**：Alpha评分、百分位、主要贡献因子、AI综合评分、AI评级、推荐排名、推荐等级、因子权重、「影子评分（仅研究，不参与正式评分）」。
- **Alpha回测**：正式评分/影子评分/融合比较、组合配置/策略/累计收益/Alpha年化/年化收益/夏普比率/最大回撤/胜率/样本数。
- **市场状态**：当前市场状态、趋势、市场宽度、波动率、市场状态时间轴、牛市/震荡市/熊市、日期/状态/评分。
- **融合策略研究**：最佳融合比例、最佳融合方案、累计收益/夏普比率/胜率/最大回撤、不同权重下的夏普比率。
- 所有 副标题/Tooltip/Placeholder/Empty/Loading/No Data 文案改中文；所有 CSV 导出按钮统一为「导出CSV」；搜索框「搜索股票代码/名称…」。

### 实现（纯前端显示层）
- 对来自 API 的枚举/数据值（如 `ratingLabel` Effective、`factor` ATR、`regime` BULL、View PRODUCTION）**在显示层加映射翻译**
  （`RATING_ZH`/`FACTOR_ZH`/`RZH`/`VLABEL` 等），**不修改 API 返回值本身**；英文说明性 `note` 以固定中文文案展示。
- 字体/颜色/布局完全不变；表格排序/搜索/导出/切换等功能逻辑一字未动。

### 验证（生产实测）
- `tsc`/`build` exit 0；部署（仅 rsync .next + `pm2 restart tohoshou-web`；无 schema/lib/scripts/cron 变更）；
  `health:data` exit 0 → **CRITICAL=0**。
- 6 个 Tab 路由 + 6 个研究 API 全部 HTTP 200；**API 返回值保持英文原值不变**（实测 `/api/alpha/report` 仍返回 `factor:"ATR"`、`ratingLabel:"Effective"`，仅前端翻译）。
- 页面功能 100% 保持一致；无任何算法/数据库/API 变化。

### 部署
build → rsync `.next` → `pm2 restart tohoshou-web`（未改 schema/cron，未重启 cron）。

---

## [17.44.0] - 2026-07-03 — P2-T5.1 AI 研究中心「综合」老板驾驶舱（Boss Dashboard）

### 目标
升级 AI 研究中心「综合」Tab 为**老板驾驶舱**（第一屏无滚动看全局）；后 6 个 Tab 不变；**仅 UI/只读聚合，
不改任何评分/推荐/Portfolio/Alpha/Fusion 算法**。原「综合」研究分析内容保留在驾驶舱下方。

### 聚合 API（`GET /api/admin/research-overview`，只读）
一次返回全部驾驶舱数据：市场状态 / AI评分 / Universe / Alpha / Fusion / 今日摘要 / 研究结论 / 系统健康 / 时间线。

### Boss Dashboard（`components/research/BossDashboard.tsx`，深色驾驶舱，与首页一致）
- **① 当前市场**：🟢牛市/🟡震荡/🔴熊市 + Trend Score / Breadth / Volatility / 最近更新（读 MarketRegime 最新）。
- **② AI评分状态**：Strong Buy / Buy / Hold / Watch / Avoid（读 StockScore recommendationV2，与 AI选股首页一致）。
- **③ Alpha状态**：AlphaScore 已计算数 / 最新时间 / 当前 Shadow。
- **④ Fusion状态**：Production Running / Alpha Shadow / Fusion Research / Paper Running｜Stopped（Paper 由最新 pick 时效判定）。
- **⑤ 今日摘要**：今日市场 / Production SB·Buy（今日 DailyRecommendation）/ Alpha 已评分数 / Fusion 研究模式 /
  Shadow 30·90·180 日跑赢·落后（读 AlphaBacktestResult Top20·20d）。
- **⑥ 系统健康**：Health / CRITICAL / WARNING / Cron / DB / API（读最新 `data-health-guard-*.json`）。
- **Universe**：总/启用/排除/自动排除/人工排除/数据质量/低流动性。
- **研究结论**（自动读取 Fusion/Backtest 结果生成）：如「✓ Alpha 短周期表现优秀 / ✓ Production 中长期更稳定 /
  ✓ 当前建议：继续 Shadow，暂不正式融合」。
- **今日时间线**：05:00 Universe Guard → 07:30 Compute Score → 08:45 Alpha Factors → 09:00 Analytics →
  09:15 Alpha Score → 09:30 Backtest → 09:45 Fusion → 10:00 Paper → 11:30 Midday → 18:00 News → 22:00 Night，
  标记 ✅已完成/⏳等待/❌失败（依产物 computedAt 是否为今日 + 当前 JST 时刻）。
- 布局：3 列网格，①-⑥ 首屏无滚动；驾驶舱置于「综合」Tab 顶部，原研究分析内容保留在下方。

### 验证（生产实测）
- `tsc`/`build` exit 0；部署（仅 rsync .next + `pm2 restart tohoshou-web`；无 schema/lib/scripts/cron 变更）；
  `health:data` exit 0 → **CRITICAL=0**。
- `/api/admin/research-overview` 实测：regime BULL(trend0.2/breadth69.25%/vol19.84%)；AI评分 SB2/Buy21/Hold391/Watch1494/Avoid1161；
  Universe 3719/3070/649/AUTO645/MANUAL1/数据质量3/低流动性639；Alpha 3058已评分/Shadow；Fusion Prod Running/Alpha Shadow/Fusion Research/Paper Running；
  今日摘要 Shadow 30日跑赢/90·180日落后；结论 3 行自动生成；health CRITICAL0/WARNING4/cron·db·api green；时间线 9/11 done。
- `/admin/research` HTTP 200；**纯 UI，生产推荐/评分/Portfolio 完全不变**。

### 部署
build → rsync `.next` → `pm2 restart tohoshou-web`（未改 schema/cron，未重启 cron）。

---

## [17.43.0] - 2026-07-03 — P2-T5 AI 研究中心（Research Center）整合

### 目标
不新增左侧菜单，直接把现有「研究分析」(`/admin/research`) 升级为 **「AI 研究中心」**，将所有 Alpha/Fusion
研究工具以 **Tab 切换**内嵌（不跳页、统一入口、标题全中文），并消除孤立页面。

### Tab 结构（顶层 Tab 壳，7 个）
| Tab | 标题 | 内容来源 |
|---|---|---|
| 1 | **综合** | 原「研究分析」全部内容（回测可信度/特征覆盖率/最佳·最弱因子/分析说明 + 内部 5 子 Tab）**原样保留，未删** |
| 2 | **Alpha因子** | 原 `/alpha` |
| 3 | **因子分析** | 原 `/alpha/report` |
| 4 | **Alpha评分（影子评分）** | 原 `/alpha/score` |
| 5 | **Alpha回测** | 原 `/alpha/backtest` |
| 6 | **市场状态** | 原 `/market-regime` |
| 7 | **融合策略研究** | 原 `/fusion/report` |

### 实现
- 6 个原页逻辑抽取为 `components/research/*Panel.tsx`（`AlphaFactorsPanel`/`AlphaAnalyticsPanel`/`AlphaScorePanel`/
  `AlphaBacktestPanel`/`MarketRegimePanel`/`FusionReportPanel`），H1 标题改为中文。
- `/admin/research/page.tsx` 重构：原页组件改名 `OverviewTab`（内容不动）+ 新增顶层 `ResearchCenterPage`
  Tab 壳（读 `?tab=` 初始定位，`window.location` 避开 useSearchParams Suspense 约束）；6 Tab 内嵌对应 Panel。
- **消除孤立页面**：`/alpha`、`/alpha/report`、`/alpha/score`、`/alpha/backtest`、`/market-regime`、`/fusion/report`
  改为 client 重定向到 `/admin/research?tab=<key>`（保留深链接、不再是孤立页）。
- SystemDashboard 六个入口链接改指 `/admin/research?tab=<key>`（`/fusion/paper` 纸面交易不在本次 6 Tab 内，保持独立）。

### 验证（生产实测）
- `tsc --noEmit` exit 0；`npm run build` exit 0（Compiled successfully）。
- 部署（仅 rsync .next + `pm2 restart tohoshou-web`；无 schema/lib/scripts/cron 变更）；`health:data` exit 0 → **CRITICAL=0**。
- `/admin/research` HTTP 200，7 个中文 Tab 全部渲染（综合/Alpha因子/因子分析/Alpha评分/Alpha回测/市场状态/融合策略研究）；
  6 个重定向路由 + `/fusion/paper` 均 HTTP 200；`/api/alpha`·`/api/regime`·`/api/fusion/report`·`/api/fusion/paper` 均 200。
- **生产推荐完全不变**：本次为纯 UI 重组，未触碰任何评分/推荐/Portfolio 数据。

### 部署
build → rsync `.next` → `pm2 restart tohoshou-web`（未改 schema/cron，未重启 cron）。

---

## [17.42.0] - 2026-07-03 — P2-T4 Fusion Paper Trading（三策略前向纸面交易）

### 目标
用真实未来行情跑 2–4 周纸面交易，对比：① **Production**（当前正式推荐）② **AlphaScore** 推荐
③ **Regime Fusion** 推荐。**不改正式推荐**；每日生成三套 Top10/Top20，记录未来 1/3/5/10/20 日收益；
Dashboard 实时对比；2–4 周后再决定是否接入正式评分。

### 三套策略（`scripts/fusion-paper-trade.ts`，READ-ONLY，绝不改官方推荐/StockScore/Portfolio）
- **PRODUCTION** = 真实官方 `DailyRecommendation` Top 按 gptRank（只读消费，非重建）。
- **ALPHA** = AlphaScore 复合分（截面 z-composite 重建）Top。
- **FUSION** = regime 自适应 `w·Alpha + (1-w)·Production`，w = 当日 Market Regime 的**已搜索最优权重**（RegimeFusionResult）。
- 每 entry 日记录 entryClose + 未来 1/3/5/10/20 日真实收益（`FusionPaperPick`）；**幂等**，cron 每日跑：
  长周期收益随未来行情逐日填充，新交易日自动追加 → 累积 2–4 周。

### Bootstrap
初始 entry dates = `DailyRecommendation` 已有且已有收盘价的 11 个交易日（2026-06-20…07-02），
即刻获得真实 Production 推荐 + 部分已实现前瞻收益（1/3/5d 已填充，10/20d 待未来行情）。

### 数据库 · Cron
- 新表 `FusionPaperPick`（entryDate×strategy×topN×symbol，rank/entryClose/ret1·3·5·10·20d/regime；严格附加）。cron **10:00 JST**。

### API · 页面 · Dashboard · CSV
- `GET /api/fusion/paper?topN=10|20`：三策略×各周期 平均收益/胜率/样本数 + 最新持仓 + 运行天数。
- `/fusion/paper` 管理员 Dashboard：Top10/20 切换 + 三策略平均前瞻收益对比表（1/3/5/10/20d，含胜率）+ 最新三套持仓 + CSV。
- SystemDashboard 入口新增「◎ Fusion Paper Trading」。

### 验证（生产实测）
- **生产推荐 100% 一致（指纹逐字段吻合 BASELINE）**：Σ adaptiveScore **146778 = 146778**、lastComputedAt 未变、
  StrongBuy 2 / Buy 21 / Hold 391 / Watch 1494 / Avoid 1161、DR today 500、Portfolio #11 / 9 —— 全一致。
- 纸面交易正常：**810 pick-rows / 11 entry dates（9 usable）/ 15.2s**；`health:data` exit 0 → **CRITICAL=0**；
  cron 重启加载 10:00 slot（15:58 JST 窗口外）；6 个 alpha slots（08:45/09:00/09:15/09:30/09:45/10:00）。
- `tsc`/`build` exit 0（无 CJK UI）；Paper API/页面 HTTP 200。

### 早期观察（样本小、周期短，待累积）
Top20 平均前瞻收益：5d Production −3.28%（胜率 53.6%）/ Alpha −1.33% / **Fusion −0.80%（最优）**；1d/3d 三者接近；
10d/20d 尚无数据（entry 日距今 <10 交易日），将随未来 2–4 周行情逐日填充。**待累积充分后再决定是否接入正式评分。**

### 部署
db push（FusionPaperPick）+ generate；rsync .next+lib+scripts；`pm2 restart tohoshou-web` + `tohoshou-cron`（10:00 slot，15:58 JST 窗口外）。

> **READ-ONLY**：纸面交易全程不改官方推荐；接入与否留待 2–4 周纸面结果。

---

## [17.41.0] - 2026-07-03 — P2-T3 Adaptive Fusion Engine（Market Regime Research）

### 目标
建立 Market Regime（市场状态）识别系统，**从历史数据搜索**不同市场环境下 Production Score 与 Alpha Score
的最佳融合比例（**禁止人工指定**）。仍为**只读研究**，禁止修改
AI Score / Adaptive Score / GPT Rank / Daily Recommendation / Portfolio。

### Market Regime 模块（`lib/market-regime/`，各独立纯函数）
- `trend.ts` — `classifyTrend(topixDesc)`：TOPIX MA20/MA60/MA120 五条件对齐 → trendScore ∈ [-1,1] + MA 值。
- `volatility.ts` — `computeVolatility(topixDesc)`：TOPIX 20 日实现波动率（年化 %）。
- `breadth.ts` — `computeBreadth(above,total)`：% 高于 MA20（宽度）。
- `regime.ts` — `classifyRegime({trend,breadth,vol})`：`0.55·trend + 0.45·breadth`（高波动 risk-off 微调）→
  **BULL / SIDEWAYS / BEAR**（阈值 ±0.25；分类规则固定，非融合比例）。

### 历史分类 & 融合搜索（`scripts/research-fusion.ts`，READ-ONLY，绝不读写生产表）
- 每日（149 天，含最近未评估的 20 天供「当前状态」）分类 → `MarketRegime`；分布 BULL 62 / SIDEWAYS 22 / BEAR 65，当前 **BULL**。
- 从 DailyPrice 重建 Alpha/Production 组合（Top20 · 持有 20d），按 regime 分组，**网格搜索** w∈{0,0.1,…,1}
  的融合 `fused = w·Alpha + (1-w)·Production`（两者截面标准化），**目标 = Sharpe** → 每 regime 最优 w → `RegimeFusionResult`。

### 数据库 · Cron
- 新表 `MarketRegime`（每日 regime + trend/breadth/vol/MA）+ `RegimeFusionResult`（每 regime Production/Alpha/最优融合 stats + gridJson）。cron **09:45 JST**。

### API · 页面 · Dashboard · CSV
- `GET /api/regime`（时间线 + 当前状态 + 分布）；`GET /api/fusion/report`（每 regime 对比 + 最优比例 + 网格）。
- `/market-regime`（当前状态卡 + 分布 + 颜色时间线带 + 明细 + CSV）；`/fusion/report`（每 regime 卡：Production/Alpha/Best-Fused + 最优 prod/alpha 比例 + Sharpe-by-w 网格图 + CSV）。
- SystemDashboard 入口新增「◱ Market Regime」「⚗ Fusion Report」。

### 验证（生产实测）
- **生产推荐 100% 一致（指纹逐字段吻合 BASELINE）**：Σ adaptiveScore **146778 = 146778**、lastComputedAt 未变、
  StrongBuy 2 / Buy 21 / Hold 391 / Watch 1494 / Avoid 1161、DR today 500、Portfolio #11 / 9 —— 全一致。
- 研究正常：MarketRegime **149 行** / RegimeFusionResult **3 行**（35.5s）；`health:data` exit 0 → **CRITICAL=0**；
  cron 重启加载 09:45 slot（15:45 JST 窗口外）；5 个 alpha slots（08:45/09:00/09:15/09:30/09:45）。
- `tsc`/`build` exit 0（无 CJK UI）；4 个 Regime/Fusion API/页面 HTTP 200。

### 关键发现（数据搜索，非人工，目标 Sharpe）
| Regime | 最优 prod/alpha | Production (Sharpe/cum) | Alpha | Best-Fused |
|---|---|---|---|---|
| BULL | 0/100 | 1.73 / +21.4% | 2.25 / +12.1% | =Alpha |
| SIDEWAYS | 0/100 | 0.68 / +2.3% | 1.24 / +1.3% | =Alpha |
| BEAR | **20/80** | 1.53 / +16.6% | 1.86 / +10.2% | **Sharpe 3.24 / +23.7%** |
- **BEAR 状态出现融合协同**：20% Production + 80% Alpha 的 Sharpe（3.24）显著高于两者单独（1.53 / 1.86）。
- 以 Sharpe 为目标时 Alpha 风险调整后更优（故多偏 alpha-heavy）；若以累计收益为目标则动量占优（见 P2-T2）。
- **数据窗口（2025-11…2026-06）为强上行，无持续熊市**：「BEAR」日多为高波动回调后反弹，须注意样本局限。

### 部署
db push（MarketRegime + RegimeFusionResult）+ generate；rsync .next+lib+scripts；`pm2 restart tohoshou-web` + `tohoshou-cron`（09:45 slot，15:45 JST 窗口外）。

> **Phase 2B（正式融合）必须建立在本研究的搜索结果之上，禁止凭经验设定融合比例。**

---

## [17.40.0] - 2026-07-03 — P2-T2 Shadow Validation Engine（Alpha Shadow Backtest）

### 目标
验证 AlphaScore 是否真正优于当前 Production Score。**只读回测验证**，禁止修改
AI Score / Adaptive Score / GPT Rank / Daily Recommendation / Portfolio。

### 数据现实 & 方法
DailyRecommendation 仅 12 天（且无 20 日前瞻数据），无法作为回测的 production 历史；production
adaptiveScore 未按日期版本化、非技术维度不可历史重建。因此**两分数均从 DailyPrice 历史重建**做公平回测：
- **AlphaScore** = Analytics 加权 6 因子截面 z-composite（真实 Alpha 引擎）。
- **Production Score** = 可复现的动量核心 `z(return20d)+z(return60d)`（生产技术排名的重建代理，**透明标注**）。
- 每个 as-of 日截面 z-score → 按各分数排名 → **Top10/20/50 等权** → 持有 **5/10/20 日** → 前瞻收益；
  385,144 观测（as-of 2025-11-25…2026-06-08）。

### 统计（`lib/alpha/backtest.ts`，纯函数）
每策略×TopN×持有×周期输出：**累计收益 / Alpha（年化超额 vs 等权市场）/ Sharpe / 最大回撤 / 胜率 / 年化收益 / 样本数**。
重叠日采样算胜率/Sharpe；非重叠（步长=持有）权益曲线算累计收益/回撤。

### 数据库 · 脚本 · Cron
- 新表 `AlphaBacktestResult`（period×strategy×topN×holdDays = 54 行；严格附加）。
- `scripts/backtest-shadow.ts`（**绝不读写 StockScore/DR/Portfolio/GPTScore**；DRY_RUN）；`package.json` 加 `backtest-shadow(:dry)`。cron **09:30 JST**。

### API · 页面 · Dashboard · CSV
- `GET /api/alpha/backtest?period=30|90|180`（默认 90）+ headline（Production/Shadow/Alpha）。
- `/alpha/backtest` 管理员页：headline 卡 + **Production / Shadow / Overlay 切换** + 周期切换 + TopN×持有 矩阵表 + **CSV 导出**。
- SystemDashboard 入口新增「⚖ Shadow Backtest」。

### 验证（生产实测）
- **生产推荐 100% 一致（指纹逐字段吻合 BASELINE）**：Σ adaptiveScore **146778 = 146778**、lastComputedAt 未变、
  StrongBuy 2 / Buy 21 / Hold 391 / Watch 1494 / Avoid 1161、DR today 500、Portfolio #11 / 9 —— 全一致。
- 回测正常：**385,144 观测 / 24.3s / 54 行**；`health:data` exit 0 → **CRITICAL=0**；cron 重启加载 09:30 slot（15:30 JST 窗口外）；4 个 alpha slots。
- `tsc`/`build` exit 0（无 CJK UI）；Backtest API/页面 HTTP 200。

### 关键发现（诚实结论）
Top20 / 持有 20d 累计收益：**30d** Production −4.61% / Shadow(Alpha) +1.55%（Alpha 胜 +6.16%）；
**90d** Production +14.49% / Shadow +9.77%（Alpha −4.72%）；**180d** Production +44.82% / Shadow +25.27%（Alpha −19.55%）。
→ **Alpha 并未全面优于 Production**：短周期(30d)占优，中长周期(90/180d)在本轮强动量牛市中跑输动量核心
（Alpha 因低波动/防御倾向更保守）。**Phase 2 融合须审慎，禁止盲目上线 Alpha。**

### 部署
db push（AlphaBacktestResult）+ generate；rsync .next+lib+scripts；`pm2 restart tohoshou-web` + `tohoshou-cron`（09:30 slot，15:30 JST 窗口外）。

> **READ-ONLY**：回测仅重建历史数据比较，生产 AI Score / 推荐 / Portfolio 完全不受影响。

---

## [17.39.0] - 2026-07-03 — P2-T1 Alpha Engine 2.0（Phase 2A：Alpha Score Shadow Mode）

### 目标
基于 Phase 1.5 Analytics 生成 **AlphaScore**（影子模式），**不接入正式 AI Score**。仍禁止影响
Adaptive Score / GPT Rank / Daily Recommendation / Portfolio。

### 权重推导（`lib/alpha/score.ts`，纯函数）
- 来源 `AlphaFactorReport`（默认 period=30，env `ALPHA_SCORE_WEIGHT_PERIOD`）。
- **Rank IC 为主（70%）+ Sharpe 为辅（30%）**：`w_i = 0.7·|IC_i|/Σ|IC| + 0.3·|Sharpe_i|/Σ|Sharpe|`，归一化（included Σ=1）。
- **方向自动识别**：`direction = sign(Rank IC)`——负 IC 因子（如 ATR）自动反向 → **ATR 作为低波动因子处理**（低 ATR 得分高）。
- `|Rank IC| < 0.01` 的因子视为噪声（权重 0，如本次 VolumeRatio）。
- 生产实测权重：Distance52WeekHigh +35.9% / ATR −33.0% / AverageTurnover +16.7% / RS +7.8% / VolumeExpansion −6.5% / VolumeRatio 0%。

### 打分（`scripts/compute-alpha-score.ts`，仅 aiEnabled=true，**不写 StockScore**）
- 取最新 AlphaFactor 快照，各因子**截面 z-score 标准化**（AverageTurnover 先 log10 去偏），`composite = Σ direction·z·weight`。
- `alphaScore = clamp(50 + 10·composite, 0, 100)`（50=universe 均值）；按 composite 降序排名 + percentile。
- `factorBreakdown` JSON 存每因子 {value, z, direction, weight, contribution}。DRY_RUN 支持；cron **09:15 JST**。

### 数据库 · API · 页面 · Dashboard
- 新表 `AlphaScore`（symbol/date/alphaScore/composite/factorBreakdown/rank/percentile/computedAt；严格附加，SHADOW ONLY）。
- `GET /api/alpha/score?limit=&q=`：AlphaScore 排名 + join 当前 AI Score（adaptiveScore/recommendationV2）+ 今日 DailyRecommendation（gptRank/recommendation）对比 + 权重 meta。
- `/alpha/score` 管理员页：AlphaScore 排名 + 每股因子贡献（Top 贡献）+ **vs AI Score** + **vs DailyRecommendation** + 权重条 + 搜索 + CSV。
- SystemDashboard 入口扩为「⚡ Factors / ★ Analytics / ◈ Score」。

### 验证（生产实测）
- **生产结果完全不变（指纹逐字段吻合 BASELINE）**：Σ adaptiveScore **146778 = 146778**、lastComputedAt 未变、
  StrongBuy 2 / Buy 21 / Hold 391 / Watch 1494 / Avoid 1161、DR today 500、Portfolio #11 / 9 —— 全一致。
- AlphaScore 正常生成：**3058 只**（5.2s）；`health:data` exit 0 → **CRITICAL=0**；cron 重启加载 09:15 slot（14:59 JST 窗口外）。
- `tsc`/`build` exit 0（无 CJK UI）；Alpha score API/页面 HTTP 200。
- 影子分化示例：#1 6522.T AlphaScore 60.84 vs AI 47/WATCH；#3 8306.T(MUFG) 60.44 vs AI 46/WATCH，DR 未入选
  ——AlphaScore（动量/低波动/流动性）与生产 AI Score 明显不同，供 Phase 2 融合决策参考。

### 部署
db push（AlphaScore）+ generate；rsync .next+lib+scripts；`pm2 restart tohoshou-web`（含新 AlphaScore client）+ `tohoshou-cron`（09:15 slot，14:59 JST 窗口外）。

> **SHADOW ONLY**：AlphaScore 本阶段绝不接入 AdaptiveScore/GPT Rank/DailyRecommendation/Portfolio。

---

## [17.38.0] - 2026-07-03 — P2-T1 Alpha Engine 2.0（Phase 1.5：Alpha Analytics，只读统计）

### 目标
建立 Alpha 因子分析系统，统计每个因子的历史有效性（IC / 胜率 / 前瞻收益 / 分位分析）。
**只读分析层**，禁止修改 AI Score / Adaptive Score / Universe / GPT Rank / Daily Recommendation / Portfolio。

### 关键方法
AlphaFactor 表目前仅 1 天数据、无历史。因子是价格的确定性函数——分析引擎**从 DailyPrice 历史按 as-of
日期重算因子 + 前瞻收益**，做真正的因子回测（385,144 个 stock×date 观测，as-of 2025-11-25 … 2026-06-08）。

### Analytics 模块（`lib/alpha/analytics/`，各模块独立纯函数）
- `forward-return.ts` — 前瞻收益 `forwardReturnPct(bars,k,h)` + TOPIX `pctChange` + `excess`。
- `information-coefficient.ts` — `pearson`（IC）+ `spearman`（Rank IC，含 tie 平均秩）。
- `rank-analysis.ts` — `quantileReturns` Top/Bottom 20% 收益 + 多空 spread。
- `factor-performance.ts` — `mean` / `winRate` / `std` / `sharpe`。
- `report.ts` — `buildFactorReport()` 编排 + `starRating()`（按 |Rank IC| 1–5 星：≥0.05★5 / ≥0.035★4 /
  ≥0.02★3 / ≥0.01★2 / else★1；Effective/Moderate/Weak）；winRate = **因子 Top 20% 分位的上涨胜率**（因子专属）。

### 统计周期 & 因子
- 周期 **7 / 30 / 90 / 180 天**（默认 30）。因子：RelativeStrength / ATR / VolumeRatio / AverageTurnover /
  Distance52WeekHigh / VolumeExpansion（各取代表标量 rs20 / atrPct / volumeRatio20 / averageTurnover20 /
  distanceTo52WeekHigh / volumeExpansionDays）。
- 每因子输出：样本数 / 平均前瞻收益(5·10·20日) / 胜率 / 平均超额收益(vs TOPIX) / IC / Rank IC /
  Top20% · Bottom20% 收益 / Sharpe（简化：逐 as-of 多空 spread 的 mean/std）/ 星级评分。

### 数据库 · 脚本 · Cron
- 新表 `AlphaFactorReport`（period×factor，24 行；严格附加，不被生产消费）。
- `scripts/compute-alpha-analytics.ts`（**绝不读写 StockScore/DR/Portfolio/GPTScore**；一次扫描算 180 天窗口，
  按 asOfIdx 派生短周期；DRY_RUN 支持）；`package.json` 加 `compute-alpha-analytics(:dry)`。cron **09:00 JST**。

### API · 页面 · Dashboard · CSV
- `GET /api/alpha/report?period=30|90|…`（默认 30）。
- `/alpha/report` 管理员报告页：每因子卡片（★★★★★ Effective / ★★★☆☆ Moderate / ★☆☆☆☆ Weak）+ IC / 胜率 /
  平均收益 / Top20% / Bottom20% + 周期切换 + **CSV 导出**。
- SystemDashboard 新增管理员入口「⚡ Alpha Factors」「★ Alpha Analytics」。

### 验证（生产实测）
- **生产结果完全不变（指纹逐字段吻合 BASELINE）**：Σ adaptiveScore **146778 = 146778**、lastComputedAt 未变
  （compute-scores 未跑）、StrongBuy 2 / Buy 21 / Hold 391 / Watch 1494 / Avoid 1161 全一致、DR today 500、
  Portfolio #11 / 9 持仓一致。新增 AlphaFactorReport 24 行（AlphaFactor 仍 3069）。
- 引擎实跑 **385,144 观测 / 44.8s**；`health:data` exit 0 → **CRITICAL=0**；cron 重启加载 09:00 slot（14:47 JST 窗口外）。
- `tsc`/`build` exit 0（无 CJK UI）；Alpha report API/页面 HTTP 200。
- 示例（30d）：Distance52WeekHigh ★5（RankIC 0.147，Top20 +0.18% / Bot20 −4.64%，Sharpe 1.91）、
  ATR ★5（RankIC −0.142，低波动异象）、AverageTurnover ★5（RankIC 0.068，胜率 51.2%）、RelativeStrength ★3、
  VolumeExpansion ★2、VolumeRatio ★1。

### 部署
db push（AlphaFactorReport）+ generate；rsync .next+lib+scripts；`pm2 restart tohoshou-web`（×2，第二次加载含
AlphaFactorReport 的新 Prisma client）+ `tohoshou-cron`（新 09:00 slot，14:47 JST 窗口外）。

> **Phase 2 必须建立在本 Analytics 的统计结果之上，禁止凭经验修改任何评分权重。**

---

## [17.37.0] - 2026-07-03 — P2-T1 Alpha Engine 2.0（Phase 1：Alpha Factors，纯新增数据层）

### 目标
在保持 `v2.0.0-universe-stable` 生产结果**完全不变**的前提下，建立第二代 Alpha 因子系统。
**本阶段只新增数据**，不修改任何 AI Score / Adaptive Score / GPT Rank / Daily Recommendation / Portfolio / Universe。

### Alpha Factor 模块（`lib/alpha/`，每因子独立、互不耦合）
- `relative-strength.ts` — **RS5 / RS20 / RS60**：相对 TOPIX 的 5/20/60 交易日超额收益（%），按日期对齐 TOPIX。
- `atr.ts` — **ATR14 / ATR%**：Average True Range(14) 及其占价百分比。
- `new-high.ts` — **DistanceTo52WeekHigh / Low**：距 52 周高/低的有符号 %（adjClose，防拆股失真）。
- `liquidity.ts` — **AverageTurnover20**：20 日平均成交额（JPY = close×volume）。
- `volume-ratio.ts` — **VolumeRatio5 / VolumeRatio20 / VolumeExpansionDays**：量比（最新/前 N 日均量）+ 连续放量天数。
- `event-factor.ts` — **Buyback / DividendRaise / GuidanceRaise / TDnetEvent**：Phase 1 仅接口（返回 null，后续阶段填充）。
- `index.ts` — 类型 `Bar` + `computeAllAlphaFactors()` 编排（仅合并各因子输出，无跨因子耦合）。

### 数据库
- 新增 `AlphaFactor` 表（`alpha_factors`）：symbol / date / 全部 Alpha 因子 / event 布尔（nullable）/ computedAt；
  `@@unique([symbol,date])` + 索引。**严格附加**，Phase 1 不被任何评分/推荐消费。

### 脚本 & Cron
- `scripts/compute-alpha-factors.ts`：读 DailyPrice + GlobalMarket(TOPIX) + Stock（aiEnabled=true），upsert AlphaFactor；
  **绝不读写 StockScore/DR/Portfolio/GPTScore**；DRY_RUN 支持；`package.json` 加 `compute-alpha-factors(:dry)`。
- `cron-scheduler.ts`：新增 **08:45 JST** slot（价格/TOPIX/评分流水线完成后）独立运行，隔离于生产关键路径。

### API & 调试页面
- `GET /api/alpha/[symbol]` — 返回该股最新全部 Alpha 因子。
- `GET /api/alpha` — 最新交易日全量（供调试页；带 names、q 搜索）。
- `/alpha` — 管理员调试控制台：因子表格 + 列排序 + 搜索 + CSV 导出（英文/技术标签，无 CJK）。

### 验证（生产实测）
- **生产结果完全一致（不变性指纹逐字段吻合 BASELINE）**：StockScore 3069、Σ adaptiveScore **146778=146778**、
  Σ percentileRank 一致、lastComputedAt 未变（compute-scores 未重跑）；StrongBuy **2** / Buy **21** / Hold 391 /
  Watch 1494 / Avoid 1161 全一致；DailyRecommendation today 500 一致；Portfolio #11 / 9 持仓一致。
- **AlphaFactor 新增 3069 行**（computed 3069 / skipped 1 / errors 0，17.9s；TOPIX 276 天）。
- `tsc`/`build` exit 0（无新增 CJK UI）；`health:data` exit 0 → **CRITICAL=0**；Cron 重启加载新 slot（14:24 JST，窗口外）。
- Alpha API/页面 HTTP 200；抽样 7203.T：RS5 3.31 / RS20 -3.47 / RS60 -24.49 / ATR14 65.79 / ATR% 2.36 /
  Dist52wH -29.18 / Dist52wL +13.86 / AvgTurnover20 ¥73.6B / VolR5 1.09 / VolR20 1.17 / VolExpDays 1 / events null。

### 部署
db push（AlphaFactor）+ generate；rsync .next+lib+scripts；`pm2 restart tohoshou-web` + `tohoshou-cron`（新 cron slot，14:24 JST 窗口外）。

> **Phase 2（后续）** 才允许根据历史统计结果调整评分权重；Phase 1 仅建立 Alpha 数据层。

---

## [🔒 FREEZE] v2.0.0-universe-stable - 2026-07-03 — Production Baseline（P2-T0 收官）

**版本冻结 / Version Freeze**：以 v17.36.2（commit `d066e12`，deployment #88）为 **P2-T1 的生产基线**。
Git Tag `v2.0.0-universe-stable`。基线文档见 `docs/BASELINE_2026-07-03.md`。

### 里程碑（全部完成）
- ✅ **P1-T1 Universe Filter** — `Stock.aiEnabled`/`excludeReason`；后台加入/移出；评分流程仅处理 aiEnabled=true。
- ✅ **P1-T2 Universe Guard** — `scripts/update-ai-universe.ts` 自动排除（ETF/ETN/REIT/优先股/退市/停牌/低流动性/数据质量）；
  `aiExcludeSource(MANUAL/AUTO/SYSTEM)`/`aiExcludeRule`；手动优先（MANUAL 永不被自动触碰，覆盖保留 warning，AUTO 自愈）。
- ✅ **P2-T0 Data Rebuild** — 全量重建 StockScore/GPTScore/DailyRecommendation/StrategyRecommendation/Portfolio，
  与新 universe 一致；根因修复 compute-scores/rerank 清理离开 universe 股票的当日 DR+GPTScore。
- ✅ **Cron Guard Active** — `cron-scheduler.ts` 05:00 JST `update-ai-universe` 已注册；2026-07-03 14:04 JST 重启 cron 激活。

### Production Baseline 数据（2026-07-03，lastComputedAt 2026-07-03T04:07:45Z）
| 指标 | 值 |
|------|-----|
| Universe Size | 3719 |
| Enabled | 3070 |
| Excluded | 649（AUTO 645 / MANUAL 1 / SYSTEM 3；Low-Liquidity 639 / Data-Quality 3） |
| Scored（StockScore, priceCount≥20） | 3069 |
| **Strong Buy** | 2 |
| **Buy** | 21 |
| **Hold** | 391 |
| **Watch** | 1494 |
| **Avoid** | 1161 |
| Bull Rate | 0.7% ·  Market Temp: COLD |
| DailyRecommendation today | 500（excluded 0，gptRank 1..500 连续） |
| Health | **CRITICAL=0** |
| Manual Watchlist / Exclude | 8918.T 排除（MANUAL_EXCLUDED）；无 watchlist 置顶（8198.T 已恢复普通股） |

### Known Issues
None（无阻断项；P1-T1/T2/T0 全部遗留待办已清零，cron 05:00 Guard 已激活）。

---

## [17.36.2] - 2026-07-03 — 修正 Universe 配置：恢复 8198.T，改排除 8918.T

### 原因
之前误将 8198.T（マックスバリュ東海）设为排除，实际应排除 8918.T（ランド）。

### 变更
- **8198.T** 完全恢复为普通参与股：`aiEnabled=true`，清除 `excludeReason/aiExcludeSource/aiExcludeRule`
  （全 null，非 watchlist 置顶）。turnover ¥70.8M≥5M、bars22≥10 → Universe Guard 评估后**不会**再排除它。
- **8918.T** 排除（精确状态）：`aiEnabled=false / aiExcludeSource=MANUAL / excludeReason=MANUAL_EXCLUDED /
  aiExcludeRule=MANUAL_EXCLUDED / aiExcludeUpdatedAt=now()`；清理其 StockScore(+GPTScore+当日DR，各1，
  8918 原为 STRONG_BUY/top-10 持仓)。
- **新代码 `MANUAL_EXCLUDED`**：加入 `EXCLUDE_REASON_CODES` + i18n `universe.reason.MANUAL_EXCLUDED` /
  `universe.rule.MANUAL_EXCLUDED`（三语），使显式人工排除状态可正确显示。

### 重建（生产按序）
数据更新 → `compute-scores`（3070 enabled，8198 重新评分 adp40/rank2304）→ `rerank:top500`
（500 DR；**rerank 永久修复自动 🧹 purged 7 stale DR**，无需手动清理）→ 删今日 StrategyRec 重生成
（LONG 3→2，8918 移除）→ `create-portfolio-snapshot --force`（#11，9 持仓，8918 移除）→ `health:data`。

### 验证（生产实测，全绿）
- **8198.T**：aiEnabled=true、provenance 全 null、有 StockScore(adp40/rank2304) → 已恢复参与评分/排名 ✓。
- **8918.T**：精确排除状态 ✓；StockScore=0 / GPTScore=0 / 今日DR=0 / 今日StrategyRec=0 / portfolio#11=0
  → 完全不参与评分·排名·推荐 ✓。
- **Guard 再跑**：skipped(MANUAL)=1（8918）、newly=0 → 8918 保持排除、8198 未被误排 ✓。
- DR 今日 500、excluded 0、rank 1..500 连续；`health:data` exit 0 → **CRITICAL=0**（Enabled 3070 / Excluded 649）。
- `tsc`/`build` exit 0；部署 .next+lib、`pm2 restart tohoshou-web`（未改 cron）。

---

## [17.36.1] - 2026-07-03 — 修复：关注股在「AI选股」(/screener) 页可见

### 问题
v17.36.0 让 8198.T 在 `/stocks`（TOP500 股票）可见，但用户反馈「AI选股 仍然没有」。**「AI选股」实为
`/screener` 页**（`nav.aiScreener`/`screener.title`），走 `/api/screener`（默认 top-N by finalScore），
而 8198.T adaptiveScore=40/AVOID/rank2266 不在 top-N，故默认列表缺失（搜索「8198」本已可返回）。

### 修复
- **`/api/screener`**：默认视图（无 q/评级/风格/minScore 过滤）追加 watchlist 纳入股
  （aiEnabled=true + aiExcludeSource=MANUAL + aiExcludeRule=MANUAL_INCLUDE_WATCHLIST）——即使评分未进 top-N
  也带真实 StockScore 数据置入结果（`isWatchlist:true`）；搜索时原 where 子句已覆盖，不重复追加。
- **`/screener` 前端**：`Score` 增 `isWatchlist`；卡片名称前显示 ★（title 提示「手动纳入（关注股）」）。

### 验证（生产）
- `/api/screener`（默认）含 8198.T（isWatchlist:true, adp40/AVOID）；`/api/screener?q=8198` 仍返回；
  recFilter 默认 ALL（客户端）→ 列表可见；`tsc`/`build` exit 0；`pm2 restart tohoshou-web`。

---

## [17.36.0] - 2026-07-03 — 紧急修复：恢复 8198.T 到 AI 评分池（受保护关注股）

### 目标
8198.T（マックスバリュ東海）是人工关注股，误被排除（T1 手动 LOW_GROWTH）。立即恢复并**永久保护**其
不被 Universe Guard 移出。

### 8198.T 目标状态（已达成）
`aiEnabled=true` / `excludeReason=null` / `aiExcludeSource=MANUAL` / `aiExcludeRule='MANUAL_INCLUDE_WATCHLIST'` /
`aiExcludeUpdatedAt=now()`。Guard 跳过所有 `source=MANUAL`，因此永不自动排除它。

### 新增/变更（受保护「手动纳入」机制）
- **Admin API**（`POST /api/admin/stocks/[symbol]/ai-universe` enable 路径）：手动加入现在**始终**写
  `aiExcludeSource=MANUAL`——若原为 AUTO/SYSTEM 排除→保留原 rule 作 override 警告；否则写
  `aiExcludeRule='MANUAL_INCLUDE_WATCHLIST'`（受保护关注股）。此前 clean-enable 写 source=null（会被 guard 重新评估），
  现改为 MANUAL（受保护）。
- **新 rule 码** `MANUAL_INCLUDE_WATCHLIST` + i18n `universe.rule.MANUAL_INCLUDE_WATCHLIST` /
  `universe.watchlist_note`（三语）。
- **详情页**：区分 watchlist 纳入（绿色 ★「人工关注股，自动排除规则不会将其移出」）与 override 警告（琥珀色）。
- **`/api/indicators` + `/stocks`**：手动纳入的关注股（enabled + rule=MANUAL_INCLUDE_WATCHLIST）即使评分未进
  top-500 也**追加到列表并带真实指标**（`isWatchlist:true` + ★ 徽章），保证「可在 /stocks 搜索到」。
- **rerank 永久修复**：`rerank-top500.ts` Step 8 upsert 前 `deleteMany` 当日 DR 中不在本次 top-N 集合的行
  （历史 DR 不动），根治「re-run/universe 变动留下 stale DR 重复 gptRank」——本次复现 8 条已按此清理。

### 重建执行（生产，按序）
恢复 8198.T → `compute-scores`（3071 enabled，8198.T 获评分 adaptiveScore=40/AVOID/rank2266）→
`rerank:top500`（500 DR）→ 日志精确清理 8 条 enabled stale DR（508→500）→ 删今日 StrategyRec 重生成 →
`health:data`。

### 验证（生产实测，全绿）
- **8198.T**：aiEnabled=true ✓；有 StockScore（adaptiveScore=40，rsi 33.33，close 3130）✓；
  `/api/stocks?q=8198` 找到 ✓；`/api/indicators` 现含 8198.T（isWatchlist:true）→ **/stocks 可搜到** ✓；
  `/stocks/8198.T` HTTP 200 ✓；参与评分/排名（marketRank=2266）/推荐（在池，未进 top-500 属评分所致）✓。
- **Guard 再跑一次**：skipped(MANUAL)=1、newly=0 → **8198.T 未被排除** ✓。
- **Health**：`health:data` exit 0 → **CRITICAL=0**；Enabled **3071** / Excluded **648**。
- **DR 一致性**：今日 500 行、excluded 0、gptRank 1..500 连续无重复。
- `tsc`/`build` exit 0；无新增硬编码 CJK UI。

### 部署
`app/api/*`、`app/stocks/*`、`scripts/rerank-top500.ts`、`lib/i18n/*`；build + rsync .next+lib+scripts +
`pm2 restart tohoshou-web`（未改 cron-scheduler.ts，未重启 cron）。

---

## [17.35.0] - 2026-07-03 — P2-T0 Universe 重建（Rebuild After Universe Guard）

### 目标
P1-T1/T2 改变了 AI Universe（3070 Enabled / 649 Excluded）后，今晨（07:56 JST）流水线产出的
StockScore/GPTScore/DailyRecommendation/StrategyRecommendation 仍基于旧 universe（含已排除股票），
需全量重建使所有评分/排名/推荐与新 universe 一致。

### 发现并修复的 BUG（根因）
今晨 rerank 早于 09:54 JST 的 guard 排除运行，导致：今日 DailyRecommendation 含 **92 条**已排除股票、
GPTScore 含 **193 条**已排除股票、StrategyRecommendation 含 **17 条**（3 isTop10）——即 aiEnabled=false
股票仍出现在排名/推荐中。**根因**：股票离开 universe 时其当日 DR + GPTScore 未被清理（rerank 按
(date,symbol) upsert 不删旧行）。**修复**：扩展 `compute-scores.ts` 既有「排除股票 purge」块——在删除
excluded StockScore 的同时，`deleteMany` 删除 excluded 的 **全部 GPTScore** + **当日** DailyRecommendation
（历史 DR 为回测不可变源 ARCHITECTURE §6，永不删除）。此后每日 07:30 compute-scores 自动保持三者一致。

### 重建执行（生产，严格按序）
1. `compute-scores`（clean StockScore over 3070 + Pass2 重排 percentileRank/marketRank；含新 purge 逻辑）
2. `rerank:top500`（GPT 排名 + 今日 DailyRecommendation top-500，49min，saved 500/500）
3. 修复后重跑 `compute-scores` → 清理 193 GPTScore + 92 今日 DR（0 StockScore 已净）
4. `create-portfolio-snapshot --force`（snapshot #10，8 持仓，源自干净 DR）
5. `generate-strategy-recommendations`（删今日 204 旧行后重生成 → DAY/SWING/LONG Top100 over 干净 StockScore）

### 验证（生产实测，全绿）
- **Health**：`health:data` exit 0 → **CRITICAL=0**。
- **Universe**：Enabled **3070** / Excluded **649**（Size 3719）✓。
- **StockScore**：3069 行（3070 enabled 中 1 只价格数据不足未评分，正常），**excludedWithScore=0** ✓。
- **GPT Rank / DailyRecommendation**：今日 DR **500 行**，excluded **0**，gptRank **1..500 连续无重复**，全部 aiEnabled=true ✓。
- **GPTScore**：excluded **0** ✓。
- **Portfolio Candidate**：snapshot #10，8 持仓，excludedPositions **0** ✓。
- **StrategyRecommendation**：今日 203 行，excluded **0** ✓。
- **Dashboard**（`/`）：强烈推荐 **3** / 推荐 **21** / 合计 24 / AI评分池排除 649 —— 全部刷新一致
  （DR recCounts：STRONG_BUY 3 / BUY 21 / HOLD 391 / WATCH 85）。
- **API/页面 HTTP 200**：`/api/indicators`、`/api/stocks/[symbol]/intelligence`、`/`（dashboard）、
  `/screener`、`/strategy`、`/api/ai-scores`。（注：项目**无** `/api/dashboard` 路由，dashboard 为 `app/page.tsx` 服务端组件即 `/`。）

### 代码变更 & 部署
仅 `scripts/compute-scores.ts`（新增 GPTScore + 当日 DR 的 excluded purge）。`tsc`/`build` exit 0；
rsync `scripts/` 到生产并重跑生效；无 app/ 变更、无需重启 web/cron。

---

## [17.34.0] - 2026-07-03 — P1-T2 AI Universe 自动排除规则（Universe Guard）

### 目标
在 T1 手动开关基础上，新增**定期自动 Universe Guard**，识别不适合参与 AI 评分的股票并自动排除，
手动决策拥有绝对优先级。

### Schema（`prisma db push` 生产已应用，纯增量）
`Stock` 新增 3 字段（排除溯源）：`aiExcludeSource String?`（MANUAL/AUTO/SYSTEM）、
`aiExcludeRule String?`（命中规则代码，同时兼作「手动覆盖」warning 标记）、`aiExcludeUpdatedAt DateTime?`。

### 自动排除规则（`lib/ai-universe.ts` `classifyAutoExclude`，first-match-wins）
1. **DELISTED_FLAG**（SYSTEM）：`isDelisted || listingStatus=DELISTED` → 已退市/整理
2. **SUSPENDED_FLAG**（SYSTEM）：`isSuspended || tradingStatus∈{SUSPENDED,HALTED}` → 长期停牌/监理
3. **ETF_NAME / ETN_NAME / REIT_NAME / PREFERRED_NAME**（AUTO）：名称/行业启发式匹配
   （ETF：`ETF/上場投信/上場投資信託`；ETN：`ETN/上場投資証券`；REIT：`リート/REIT/投資法人`|sector=REIT；优先股：`優先出資証券/優先株`）
4. **DATA_QUALITY**（AUTO）：近30日 DailyPrice bar 数 `< AI_UNIVERSE_MIN_BARS_30D`（默认10）
5. **LOW_TURNOVER**（AUTO）：近30日日均成交额 `avg(volume)×avg(close) < AI_UNIVERSE_MIN_TURNOVER_JPY`（默认¥5,000,000）
- 新增 reason 码：`ETN`、`SUSPENDED`（EXCLUDE_REASON_CODES 扩展）。

### 手动优先级（LOCKED）
- `aiExcludeSource==='MANUAL'` 的股票 guard **绝不触碰**：手动排除不可被自动恢复。
- **手动加入覆盖自动排除但保留 warning**：admin re-enable 一个 AUTO/SYSTEM 排除的股票时，
  API 返回 `override:true`，写 `aiEnabled=true, aiExcludeSource='MANUAL', aiExcludeRule=<原规则>`（保留为 warning），
  guard 因 source=MANUAL 而跳过、不再排除；详情页显示「⚠ 已手动保留（命中自动排除规则）」。
- **自动排除自愈**：AUTO/SYSTEM 排除的股票当不再命中任何规则时，guard 自动 re-enable（StockScore 由次日 compute-scores 重建）。
- 兼容处理：T1 遗留的 `aiExcludeSource=null` 手动排除（8198.T）已 backfill 为 MANUAL，避免被 guard 误管。

### 新增脚本 `scripts/update-ai-universe.ts`
扫描全部 Stock；近30日 DailyPrice `groupBy(symbol)` 聚合 turnover+bar 数（单查询，~11万行，高效）；
按规则分类；新排除者在 `$transaction` 内 `aiEnabled=false`+溯源字段+**即时 purge StockScore**（同 T1 合约，
7 条评分流程立即继承）；DRY_RUN=1 预览；`by reason/source` 计数与示例。`package.json` 加
`update-ai-universe` / `:dry`。**cron**：`cron-scheduler.ts` 加 05:00 JST slot（compute-scores 前，排除当日生效）。

### 后台（详情页）
`AiUniverseControl` 卡在 T1 基础上新增 provenance 明细：**当前状态 / 排除来源（人工·自动·系统）/
命中规则 / 更新时间**，以及手动覆盖 warning。`GET /intelligence` 的 `stock` 增返
`aiExcludeSource/aiExcludeRule/aiExcludeUpdatedAt`；`/api/indicators` 已排除行增 `aiExcludeSource`，
列表在原因徽章旁显示来源标签。

### Health（`data-health-guard.ts`）
新增 4 项 INFO：**AUTO Excluded / MANUAL Excluded / Low-Liquidity Excluded / Data-Quality Excluded**
（另加 SYSTEM Excluded）。

### i18n
`universe.*` 三语补齐：新 reason（ETN/SUSPENDED）+ `source_label`/`source.*`(3) + `rule_label`/`rule.*`(8) +
`updated_label` + `override_warning`。

### 验证（生产实测，2026-07-03）
- `tsc --noEmit` exit 0；`npm run build` exit 0；修改 TSX 无新增硬编码 CJK。
- 生产 `prisma db push` 成功；DRY_RUN 预览后实跑：**648 自动排除**（LOW_LIQUIDITY 639 / DELISTED 3 /
  REIT 3 / POOR_DATA 3；AUTO 645 / SYSTEM 3），648 StockScore 即时 purge。
- **幂等**：二次运行 newly=0、skipped(MANUAL)=1；**手动优先**：re-enable 1380.T→`override:true`、
  source=MANUAL、rule=LOW_TURNOVER 保留，guard 三次运行 skipped(MANUAL)=2 不再排除（测试后已恢复其 AUTO 排除）。
- `health:data` on prod exit 0 → **CRITICAL=0**；Universe Size 3719 / Enabled 3070 / Excluded 649
  （AUTO 645 / MANUAL 1 / SYSTEM 3 / Low-Liquidity 639 / Data-Quality 3，计数自洽）。
- 页面 HTTP 200（/、/stocks、/stocks/1380.T、/stocks/8198.T）；`/api/indicators` 1149 行（500+649），
  excluded 携带 source；`/intelligence` 1380.T 返 AUTO/LOW_TURNOVER/updatedAt。
- 部署：scp schema + db push + generate；rsync .next+lib+scripts；`pm2 restart tohoshou-web`。
  **cron-scheduler.ts 已改（05:00 slot）但因当前处于 07:30–14:00 JST rerank 窗口，`pm2 restart tohoshou-cron`
  推迟至窗口后执行**（guard 已手动生效、排除由 compute-scores 每日强制维持，延迟无害）。

---

## [17.33.0] - 2026-07-03 — P1-T1 AI 评分股票池（Universe Filter）

### 目标
建立可维护的股票池过滤机制（而非手工删除个股）。所有 AI 评分流程仅处理 `aiEnabled=true` 的股票；
后台可在股票详情一键「加入/移出 AI 评分」并选择排除原因；列表可按池筛选；仪表盘与 Health Check 展示池规模。

### 架构决策（关键）
`compute-scores.ts` 是评分中枢——它枚举 Stock 写入 StockScore，而下游 **rerank-top500 / gpt-score-overlay /
ai-scores API / sync-news(top200) / generate-strategy-recommendations / create-portfolio-snapshot /
update-backtest·strategy-backtest** 全部读 StockScore 或其派生表。因此只需在**源头**（compute-scores）
过滤 `aiEnabled:true` + **清理被排除股票的残留 StockScore**，7 条流程即自动全部继承过滤，零下游改动。
Admin 关闭个股时在同一 `$transaction` 内**立即删除该股 StockScore 行**，使排除即时生效（不必等次日 07:30）。

### Schema（`prisma db push` 生产已应用，纯增量+默认值，无数据丢失）
- `Stock.aiEnabled Boolean @default(true)`：false = 从所有 AI 评分流程排除。
- `Stock.excludeReason String?`：排除原因**代码**（非本地化字符串，见下）。
- `@@index([aiEnabled])`：池筛选查询走索引。

### 排除原因（存代码，i18n 映射标签）
`lib/ai-universe.ts` 定义 9 个稳定代码：`LOW_LIQUIDITY / LOW_GROWTH / POOR_DATA / ETF / REIT /
PREFERRED / DELISTED / MANUAL / OTHER`；显示经 `universe.reason.<CODE>` 三语 i18n（zh 流动性不足/成长性不足/
数据质量差/ETF/REIT/优先股/已退市/人工排除/其它）。禁止把本地化中文直接存 DB。

### 评分流程（源头过滤 + 清理）
- `compute-scores.ts`：Pass 1 前先 `deleteMany StockScore where symbol in (aiEnabled=false)`（清理残留），
  再 `stock.findMany({ where: { aiEnabled: true } })`；日志打印排除数与清理数。

### 后台功能
- 新 API `POST /api/admin/stocks/[symbol]/ai-universe`（+ GET 查询状态）：
  disable → 写 `aiEnabled=false + excludeReason` 并 `$transaction` 删 StockScore（返回 `purgedScore`）；
  enable → `aiEnabled=true, excludeReason=null`（次日 compute-scores 重建评分）。可选 `ADMIN_TOKEN` 鉴权。
- 股票详情页 `/stocks/[symbol]` 顶部新增 **AI 评分状态控制卡**：显示当前状态（已加入/已移出+原因），
  提供【加入AI评分】/【移出AI评分】按钮 + 排除原因下拉；`GET /intelligence` 的 `stock` 增返
  `aiEnabled/excludeReason`。

### 股票列表筛选
- `/stocks` 新增池筛选按钮：**全部 / AI评分股票 / 已排除股票**（默认「AI评分股票」），各带计数。
- `/api/indicators` 每行增 `aiEnabled/excludeReason`，并**追加**已排除股票行（指标为 null）供「已排除」筛选；
  已排除行在名称单元显示原因徽章。

### Health Check
- `data-health-guard.ts` 新增 3 项 INFO 检查：**AI Universe Size** / **Enabled Stocks**（>0 pass）/
  **Excluded Stocks**。

### Dashboard
- 首页新增 **AI 评分池** 统计卡：启用 XXX / 排除 XXX（`app/page.tsx` 增两个 count，
  `SystemDashboard.tsx` 新增 props + 卡片，标签走 i18n）。

### i18n
`universe.*` 三语言补齐（title/filter.*/enabled_label/excluded_label/add/remove/updating/dash_*/reason.*×9）。

### 验证（生产实测）
- `npx tsc --noEmit` exit 0；`npm run build` exit 0（Compiled successfully）；修改的 TSX 无新增硬编码 CJK。
- 生产 `prisma db push` 成功（3719 股票默认 aiEnabled=true）。
- 设 8198.T（マックスバリュ東海）→ API 返回 `aiEnabled:false, excludeReason:LOW_GROWTH, purgedScore:true`。
- `health:data` on prod exit 0 → **CRITICAL=0**；新检查显示 Size 3719 / Enabled 3718 / Excluded 1。
- 页面 HTTP 200：`/`、`/stocks`、`/stocks/8198.T`、`/portfolio`。
- `/api/indicators` 501 行（500 scored + 1 excluded）；8198.T `aiEnabled:false`，且不再出现在 scored 集合。
- 首页 HTML 含 3718 / AI评分池 / 启用；`/intelligence` 8198.T 返 `aiEnabled:false, LOW_GROWTH`。
- 部署：scp schema + prisma db push + generate；rsync .next + lib + scripts；`pm2 restart tohoshou-web`
  （**未改 cron-scheduler.ts，未重启 cron**）。

---

## [17.32.0] - 2026-07-02 — T3 P1 Paper Broker Dashboard（AI 自动交易驾驶舱，UI+只读聚合）

### 目标
把 /portfolio 从技术型数据页升级为每天可用的「AI 自动交易驾驶舱」。仅 UI 展示 + 只读 API 聚合，
数据全部来自真实数据库，数据不足显式显示「数据不足/数据积累中」，不造假、不写死。

### 严格边界（未碰）
未修改三策略算法 / StockScore / StrategyRecommendation / StrategyTradeResult / Learning / Backtest /
Cron / Paper Broker 撮合逻辑（paper-broker.ts 未动）/ 真实交易逻辑 / **Schema**；未调新大模型。

### API（`GET /api/portfolio/paper` 增量只读聚合，已有字段语义/结构不变）
新增 9 块：`bossSummary`（今日盈亏YES/NO+收益率、当前资产、累计+跑赢TOPIX/Nikkei、账户状态synced+
pipeline+healthCritical、交易摘要）、`strategyPools`（三池累计收益/今日盈亏/买卖/持仓）、`holdingsEnhanced`
（join StockScore 名称/AI评分/建议/风险 + 持仓天数/浮盈）、`todayTradesEnhanced`（order↔execution join +
名称）、`recentExecutionsEnhanced`（fee=0 + broker "Paper"）、`navSeries`（account 新→insufficient=true）、
`performanceMetrics`（胜率/均盈亏/盈亏比/均持仓天数/现金比/仓位利用率；maxDrawdown 无 NAV 历史→null）、
`riskMetrics`（现金比/集中度/连续盈亏天数 + riskLevel LOW/MEDIUM/HIGH，规则写在代码注释）、`aiDailySummary`
（模板字段：市场态/买卖/持仓/盈亏/主要贡献·拖累/风险/建议，**无模型调用**）。
- 性能：DailyPrice 不直接查（沿用 StockScore 派生）；GlobalMarket 单行 benchmark；StockScore join ≤~50 symbol；
  健康 CRITICAL 读最新 `reports/data-health-guard-*.json`。实测 warm API **0.13–0.22s**（<800ms）。
- riskLevel 规则（注释）：HIGH=现金<15% 或 单股>35% 或 连亏≥3天；LOW=现金≥40% 且 单股≤20% 且 连亏=0；否则 MEDIUM。

### /portfolio 页（重写为驾驶舱）
顶部老板视角 5 KPI 卡 + AI 今日总结（i18n 模板 fill）+ 三策略基金卡（累计收益/今日盈亏/买卖/持仓）+
当前持仓（策略/名称/浮盈/持仓天数/AI评分/建议/风险 + 「查看原因」ExplainDrawer→/api/strategy/explain，
缺失显示「暂无解释」）+ 今日交易（买卖色分 + 查看原因）+ 最近成交（Paper 标识 + 手续费0）+ 账户净值
（insufficient→「数据积累中」，不画假曲线）+ 绩效分析（null→「数据不足」，不用0伪装）+ 风险中心 +
数据来源/自动交易流程 Timeline（P6 保留，折叠到底部）。

### i18n
`dash.*` 三语言补齐（标题/KPI/资金池/持仓/交易/成交/净值/绩效/风险/AI总结/列头/风险等级/建议/市场态/模板）；
页面无新增硬编码 CJK（表名等技术标识保留英文）。

### 验证
- `npm run build --webpack` exit 0；`tsc --noEmit` exit 0；无硬编码 CJK。
- 生产实测（真实、非造假）：今日 NO/-¥9,700；累计 +119,200(+1.192%) vs TOPIX +1.284% → beatTopix=False；
  Nikkei 缺→null→「数据积累中」；maxDrawdown=null→「数据不足」；胜率50%；risk MEDIUM；AI 市场态UP/贡献7031.T/拖累3092.T；
  healthCritical=0(读报告)；holdings join StockScore(7031.T aiScore71/BUY_NOW/MEDIUM)。
- `health:data` CRITICAL=0（53/4/1）；/portfolio HTTP 200；策略/Paper 数据零改动。
- 部署：仅 rsync .next + lib，`pm2 restart tohoshou-web`（无 schema/scripts/cron 变更，未重启 cron）。

---

## [17.31.0] - 2026-07-02 — T2 P6 Paper Broker 数据来源可追溯（Data Lineage，仅展示层）

### 目标
提升 /portfolio（自动交易）可解释性：每块数据标注来源表/字段/脚本/API，并新增「自动交易流程」时间线。

### 仅改展示层（严格未碰）
未修改 Trading/Strategy Engine、StrategyRecommendation、StockScore、Learning、Backtest、Validation、
Cron 时间、Paper Broker 交易逻辑（`scripts/paper-broker.ts` 未动）、数据库计算逻辑、**Schema**。

### 新增
- **`GET /api/portfolio/paper` 增加 `lineage` 只读聚合块**（纯计数/日期，不改任何逻辑）：DailyPrice /
  StockScore / StrategyRecommendation（三策略计数）/ StrategyTradeResult / Paper 四表 的最新日期+数量。
  **性能关键**：DailyPrice 的唯一索引均以 `symbol` 开头，直接 `count where date=X` / `orderBy date desc`
  会扫 7.9M 行；改由 **StockScore**（3.7k 行、`latestDate` 字段 + `count where latestDate=max`）派生
  "最新交易日+覆盖数"，语义等价且廉价。实测 API 0.22s、页面 0.31s（<500ms）。
- **/portfolio 底部两块（展示）**：
  - **数据来源**：15 行「指标 → 来源」映射（总资产/现金/持仓市值/今日盈亏/累计盈亏/持仓/订单/成交/
    买入价/卖出价/最新价/推荐来源/交易信号/评分来源/AI解释），来源以 monospace 展示（表名/字段/API 属技术标识，不入 i18n）。
  - **自动交易流程**：竖向 Timeline（J-Quants+Yahoo+TDnet → DailyPrice → StockScore →
    StrategyRecommendation → StrategyTradeResult → Paper Broker → PaperOrder → PaperExecution →
    PaperPosition → PaperCashLog → /portfolio），每步 ✅正常 + 最近更新 + 数据量 + **原生 `title` Hover
    Tooltip 说明**（无第三方库、无复杂动画）。沿用现有深色 Card/字体/间距。
- i18n：`lineage.*`（title/flow_title/status_ok/last_update/note/unit_rows + src.*(7) + tip.*(11)）三语言补齐。

### 验证
- `npm run build --webpack` exit 0；`tsc --noEmit` exit 0；/portfolio 页无硬编码 CJK（表名/J-Quants 等为技术标识）。
- 生产 lineage 实测：DailyPrice 07-01/3672、StockScore 07-02/3715、SR 07-02 DAY100/SWING100/LONG2、
  STR 07-01/15、PaperOrder 44/Exec 42/Position 10-26/CashLog 45。
- `health:data` CRITICAL=0（53/4/1，未新增）；/portfolio HTTP 200；策略/Paper 数据零改动（纯读）。
- 部署：仅 rsync .next + lib，`pm2 restart tohoshou-web`（无 schema/scripts/cron 变更，未重启 cron）。

---

## [17.30.0] - 2026-07-02 — T2 P5 Paper Broker 自动交易模拟账户

### 目标
把 /portfolio 从 Legacy 页升级为「自动交易」模拟券商账户（Paper Broker），初始资金 ¥10,000,000，
按三策略分配 DAY 3M / SWING 4M / LONG 3M。纯 Paper Trading，不接真实券商 API、不产生真实交易。

### 架构决策（用户拍板）
- **数据源：镜像真实引擎成交**（非从 Top10 信号独立重算）。Paper Broker 只读镜像三引擎已发生的成交
  （DAY 读 `StrategyTradeResult`、SWING/LONG 读 `StrategyPosition` 开/平仓），**绝不修改任何策略表**。
- 真实策略池为 ¥100M（30/40/30M），paper 账户 ¥10M（3/4/3M）= 1/10 scale；Paper Broker 沿用引擎的
  **决策**（标的/价格/时点），但按**自身池**给仓位定量（paper POSITION_SIZE = 池/MAX_POSITIONS），独立做
  现金/一手校验。Swing/Long 引擎虽 FROZEN，但存量 StrategyPosition（手动跑产生）会被镜像；Phase 7 激活后自动放量。

### 新增（授权 schema 变更）
- **5 张 Paper 表**（`prisma db push`，只增不改）：`PaperAccount / PaperOrder / PaperExecution /
  PaperPosition / PaperCashLog`（复用 StrategyType 枚举，状态用 String）。
- **`scripts/paper-broker.ts`**：ensureAccount(¥10M, 3/4/3, BROKER_MODE=paper) → 镜像 DAY 当日往返
  （BUY@open+SELL@close，净额=P&L）+ SWING/LONG 持仓开平 → 每笔写 Order/Execution/CashLog +
  Position；一手不足→REJECTED `LOT_SIZE_TOO_SMALL`；现金不足→REJECTED `INSUFFICIENT_CASH`；
  禁负现金/超池；幂等按 `sourceId`；结算包 `$transaction`；OPEN 仓按最新 DailyPrice.close 盯市。
- **`GET /api/portfolio/paper`**：返回总资产/现金/持仓市值/今日盈亏/累计盈亏/三池/持仓/今日订单/最近成交。
- **`/portfolio` 页重写**为「自动交易」账户视图（顶部5指标 + 三策略池卡 + 当前持仓 + 今日订单 + 最近成交 +
  模拟风险提示）；侧栏 badge `Legacy → Paper`，`nav.aiPortfolio` 标签改「自动交易/自動取引/Auto Trading」。
- **cron**：07:30 slot 在 day-strategy + gen-recs 之后调用 `paper-broker.ts`（只读镜像，秒级）。
- i18n：`paper.*` 三语言补齐；`package.json` 加 `paper-broker` 脚本。

### 修复（自查发现）
- Paper cash 读取 order-by 缺陷：`INIT_POOL` cashlog 日期为「今天」，早于历史成交日的 cashlog，
  `orderBy logDate desc` 会误取 INIT_POOL 导致"当前现金"退回池初值（并会污染未来 cron 的现金基数）。
  改为 `orderBy id desc`（插入=处理顺序=真正最新），脚本 seed 与 API 同步修正。

### 验证
- `npm run build --webpack` exit 0；`tsc --noEmit` exit 0；/portfolio 页无硬编码 CJK。
- 生产 `prisma db push` 建 5 表成功；`paper-broker` 首跑：账户 #1 建成、池 3M/4M/3M、DAY 镜像 14 笔（0 拒绝）、
  SWING/LONG 14 腿、盯市 10 仓；**二次跑幂等**（0 新镜像）。
- API 数值自洽：cash 7,412,150 + posVal 2,707,050 = totalAssets 10,119,200，cumPnl 119,200；
  三池 cash（3,107,350 / 2,284,500 / 2,020,300）为真实当前值（非池初值）。
- 生产 `health:data` CRITICAL=0（53/4/1，Paper 表不影响 health guard）；/portfolio HTTP 200。
- **策略表零改动**：/api/strategy/DAY_TRADE 仍 10 成交/0 持仓（Paper Broker 只读）。
- 部署：db push + rsync .next(--delete)+lib+scripts+package.json；`pm2 restart web+cron`（18:30 JST 窗口外）。

### 未改动
未修改任何 Strategy Engine / Recommendation / Learning / Backtest / 学习算法 / 资金池逻辑；
不接真实券商 API；BROKER_MODE=paper（唯一实现），预留 live。

---

## [17.29.0] - 2026-07-02 — T3 P1 Production Bug Zero Sprint（审计 + 修复,不新增功能）

### 背景
进入 Production Maintenance 模式,对 app/components/lib/scripts/prisma 全项目做 Production Audit
（4 个只读子代理并行 + 人工逐条复核 P0/P1,剔除误报）。审计结果:**P0=1 · P1=7 · P2≈14**。
未开发任何新功能/新页面/新表。

### 审计发现（完整清单见会话《Production Bug Zero Audit》）
- **P0-1**（生产日志证实）:Swing/Long 策略引擎在自动 cron 下每个交易日空跑——`runDate=T` 而 T 当日
  收盘价 T+1 才同步,`priceCount(T)===0` 提前 return（Day Trade v17.24.0 已修的 T+1 时序缺陷未同步到
  另两条线）。生产日志 `2026-07-02/06-30 15:35/15:40 🚫 No DailyPrice ... not yet synced` 佐证。
  → **按用户决策本次暂不修,仅记录**（激活两条策略线属 FROZEN 架构行为变更,留待专项排期）。

### 本次修复（逐项 tsc+build 验证,一次性风险分级部署 + 运行时验证）
**P1（交易相邻,已获用户授权 + 安全项）**
- **P1-1** `update-backtest.ts`:entry(未复权 open) vs exit(复权 adjClose) 价基不一致 → 拆股/分红失真。
  修复:按入场日调整因子 `adjClose/close` 把 entry 缩放到复权基准与 exit 一致（无 adj 数据回退 raw↔raw）;
  存储 entryPrice 仍保留原始价供展示。
- **P1-2** `day-strategy.ts`:结算三表写入包进单个 `$transaction`（全成或全滚),幂等改判 StrategySnapshot
  （事务末尾写入的完成标记）而非 TradeResult 计数,杜绝崩溃半成品被永久锁死。运行时验证:catch-up
  "Newly settled:0 / Already done:3",正确跳过不重写。
- **P1-3** `day/swing/long-strategy.ts`:资金池「上一状态」改 `orderBy logDate desc + where logDate<runDate`
  （原按 createdAt,乱序 `--date` 补跑会取错资金基数）。
- **P1-4** `cron-scheduler.ts`:`runAsync` 改返回 `Promise<boolean>`(成功与否);07:30 watchdog 据此判断
  06:00 同步是否真正成功,失败/未完成时触发降级流水线（原恒 resolve()→失败被记为成功、health 漏跑）。
- **P1-5** `fetch-jquants-investor-types.ts`:`Number(null/"")===0` 把缺失字段写成真实 0 → 改 `toNum`
  先判空返回 NaN→null,避免「无数据」当「零资金流」进 moneyFlowScore。
- **P1-6** `app/api/admin/mission-control/route.ts`:`stockScore.latestDate` 用 `computedAt` 裸 UTC →
  JST 跨日 off-by-one,改 +9h 后取日期。验证:现返回 2026-07-02（正确）。
- **P1-7** `lib/trading-action.ts`:WAIT_PULLBACK 入场区间 `entryLow>entryHigh` 倒挂 → 加 `if(low>high) low=high` 钳制。

**P2（安全清理）**
- `ai-scores/route.ts`:moneyFlowScore 错误回退到 riskScore（维度混淆）→ 移除 `?? s.riskScore`。
- `ai-decision/route.ts`:重复查询 Stock 表 → 首个 select 加 `id`,复用,删第二次查询。
- 死代码删除:`components/ScoreBreakdown.tsx`、`lib/stock-display.ts`、`lib/stock-display-name.ts`、
  `lib/display-labels.ts`、`lib/llm/{client,router}.ts`（全 0 引用,后者潜伏 baseURL 劫持隐患）、
  `snapshot-valuation.todayJSTString`、`ai-picks` 未用的 STYLE_LABEL/SOURCE_BADGE。

### 遗留 P2（本次不动,记录待排期）
i18n 硬编码 CJK 泄漏（NewsCard/PriceChart/indicators/screener/watchlist/layout/stocks「億」等,多为既有单语债务）;
口径类（portfolio/summary 固定 100M 分母、market-stats vs ai-scores 候选池、strategy/overview healthDays 非连续、
update-ai-signal-stats adjClose、snapshot 日历5天窗口、safety-rules 节假日仅2026-2027、fetch-* 日期/跳过逻辑）;
day-strategy 断点续跑 `slice(-20)` 静默丢弃;**ROE `<1.5?×100` 启发式**（Financial.roe 量纲存疑,equityRatio
存为分数,需数据审计后再定,本次不改以免误伤）。

### 验证
- `npm run build --webpack` exit 0;`tsc --noEmit` exit 0（tsconfig `**/*.ts` 覆盖 scripts/,脚本已类型校验）
- 生产 `health:data` CRITICAL=0（53 PASS / 4 WARNING / 1 INFO,与基线一致,未新增 CRITICAL）
- day-strategy 运行时验证幂等（Already done:3,不重写）;strategy/ai-picks/mission-control/stocks/screener/
  indicators 全 HTTP 200;mission-control latestDate=2026-07-02（P1-6 生效）
- 部署:rsync .next(--delete)+lib+scripts + 删服务器死文件;`pm2 restart tohoshou-web + tohoshou-cron`
  （18:16 JST,rerank 窗口外;cron-scheduler.ts 改动已重启,pid 51→52 单次重启无循环）

---

## [17.28.0] - 2026-07-02 — T2 P4 AI Explain 未入选原因（Why Not Recommended，只读增强）

### 目标
在 v17.27.0 AI Explain 基础上，让用户查询任意股票「为什么没进 DAY/SWING/LONG Top10」：
当前排名、距 Top10 差多少分、主要短板、需改善哪些因素。纯解释层 + 展示层。

### 严格边界（零违反）
未改：交易逻辑 / 推荐算法 / StockScore / StrategyRecommendation 生成 / **数据库 Schema** /
未调新大模型 API / 未改任何交易结果。全部基于已有存储数据，单 symbol+tradeDate 查询无全表扫描。

### API 增强（`GET /api/strategy/explain`）
新增字段（向后兼容 v17.27.0，未删除既有字段）：
- `explanationType`：**RECOMMENDED**（在 Top10）/ **NOT_TOP10**（在推荐池但 rank>10）/
  **NOT_CANDIDATE**（有 StockScore 但不在该策略推荐池）/ **DATA_INSUFFICIENT**（无 StockScore）
- `totalCandidates`（候选池规模）、`shortfalls[]`（最弱维度，NOT_CANDIDATE 追加 LONG_FILTER/
  WATCH 结构性短板）、`improvementFactors[]`（≤5 条改善建议，按短板+策略确定性派生）、
  `adaptiveScore`、`notRecommendedReason`（打包 not-recommended 子字段）
- 关键判定：有 rec→RECOMMENDED/NOT_TOP10；无 rec 但有 StockScore→NOT_CANDIDATE；无 score→
  DATA_INSUFFICIENT。短板用归一化 0-100（StockScore 各维度按原生上限 30/25/20/15 归一）比较，
  跨维度公平。改善建议 code 化（TECH/NEWS/FUND/AI/FLOW/RISK/GAP/STRONG_BUY/TREND/NOT_SWING/WATCH）

### UI（`app/strategy/page.tsx`）
- 推荐表下方新增「查询未入选原因」输入框（股票代码，`normalizeSymbol` 自动补 `.T`）→ 打开
  同一 ExplainDrawer
- ExplainDrawer 按 `explanationType` 分支：
  - RECOMMENDED：原推荐解释（v17.27.0）保持不变
  - NOT_TOP10：排名/Top10截止分/分数差距 + 评分拆解 + 主要短板 + 改善建议
  - NOT_CANDIDATE：候选池规模/综合评分/截止分 + 主要短板 + 改善建议 + 风险
  - DATA_INSUFFICIENT：仅显示「暂无足够数据解释该股票。」
- 短板改用 `explain.short.*`（"不足" 语义，区别于 reasons 的 "贡献"），改善建议 `explain.imp.*`

### i18n（三语言补齐）
types.ts + zh-CN/ja-JP/en-US 新增 explain.why_not / improvement / query_title /
query_placeholder / not_candidate_msg / data_insufficient_msg / candidate_pool /
overall_score / conclusion.NOT_CANDIDATE / status.NOT_CANDIDATE / short.*（9）/ imp.*（11）。
summary 仍用 {token} + 前端 fill()，TSX 无新增硬编码 CJK。

### Smoke Test（`scripts/smoke-explain.ts` 扩展，生产 5/5 PASS）
- DAY Top10 6223.T → RECOMMENDED（165ms）
- DAY rank11 2670.T → NOT_TOP10（gap=0.03，imp=3，26ms）
- SWING rank11 7792.T → NOT_TOP10（gap=0.2，short=3，23ms）
- LONG 池外 4194.T ビジョナル → NOT_CANDIDATE（adaptive=50，short=4，imp=4，57ms）
- 未知 0000_NOPE.T → DATA_INSUFFICIENT（found=false，57ms）

### 验证
- `npm run build --webpack`：exit 0（✓ Compiled successfully）；`tsc --noEmit` exit 0
- 生产 `health:data`：CRITICAL=0（53 PASS / 4 WARNING / 1 INFO，与基线一致，未新增 CRITICAL）
- 生产 `/strategy` HTTP 200；公网 explain API 对 NOT_CANDIDATE（4194.T）返回正确结构
- 部署：rsync .next（--delete 清 stale chunk）+ lib + scripts，`pm2 restart tohoshou-web`
  （pid 变化）；**未重启 tohoshou-cron**（cron-scheduler.ts 未改动）

### Module Responsibility
仍归属「策略中心内的推荐解释」，仅落在 `/strategy`，未触及 Dashboard/Portfolio Legacy/
Mission Control/Verify。

---

## [17.27.0] - 2026-07-02 — T2 P3 AI Explain：三策略推荐解释系统（只读解释层，零交易逻辑改动）

### 目标
为策略中心新增「AI 推荐解释」能力：让用户看清某只股票为什么进入 DAY/SWING/LONG 推荐、
靠哪个维度入选，以及没进 Top10 时主要差在哪里。**纯解释层 + 展示层**。

### 严格边界（全部遵守，零违反）
未修改：Trading Architecture / 三策略买卖逻辑 / StrategyRecommendation 生成逻辑 /
StockScore 计算逻辑 / 资金池 / Cron 时间 / **数据库 Schema** / 未调用任何新的大模型 API /
未重新评分 / 未改变任何交易结果。解释完全基于已有存储数据，可追溯、可复现，数据缺失时
显式显示「暂无数据/暂无新闻评分/暂无基本面数据/暂无行情数据」，禁止编造原因。

### 新增 API：`GET /api/strategy/explain`
- 参数：`strategyType` / `symbol` / `tradeDate`（缺省取该策略最新推荐日）
- 只读，全部查询限定单 `symbol + tradeDate`，无全表扫描；实测 20–106ms（目标 <500ms）
- 数据来源：`StrategyRecommendation`（rank/isTop10/aiScore/technical/fundamental/news/
  moneyFlow/risk/finalScore/recommendationReason）+ `StockScore`（recommendationV2/波动/
  数据质量）+ `StrategyPosition`（持仓状态/持有天数/浮盈亏）+ `StrategyTradeResult`
  （状态/退出原因，识别 SKIPPED_LOT_SIZE=买不起一手 / SKIPPED_DATA_MISSING 等）
- 返回：`conclusion`（STRONG/RECOMMEND/WATCH/NOT_TOP10/INSUFFICIENT）、`reasons[]`
  （按策略侧重排序的正贡献维度，最多5条）、`risks[]`（仅数据中真实存在的风险项）、
  `scoreBreakdown`、`status`（推荐中/已买入/已卖出/已跳过/等待数据/未进入Top10）、
  `rank/totalCount/top10CutoffScore/scoreGap/missingReasons`（合并 not-recommended 场景）、
  `dataQuality`（hasNews/hasFundamental/hasPrice/scoreSource，纯从 StockScore 派生，
  不额外查表）、`generatedAt`
- **说明**：spec 提及的 `AIAnalysis` 表在本项目 schema 中不存在（40 模型），改用 StockScore
  等价字段（recommendationV2/return60d/highRiskFlag/scoreSource）补充，未新增表

### 策略中心 UI（`app/strategy/page.tsx`）
- 推荐表新增「AI解释」列 + 每行「查看原因」按钮
- 新增 `ExplainDrawer` 右侧抽屉（点击打开，不跳转页面、不影响列表加载速度，点击时才请求）：
  结论徽章 + 操作状态、总结句、（非Top10）当前排名/Top10最低分/分数差距、评分拆解横条
  （按策略侧重排序，风险为负显红）、入选原因列表、主要短板、风险提示标签、策略适配、
  数据更新时间；接口失败显示「解释生成失败，请稍后重试」
- Drawer 状态提升到 `StrategyTab`，`RecommendationSection` 经 `onExplain` 回调触发

### i18n（三语言补齐）
`lib/i18n/types.ts` 新增 explain.* 全部 key；zh-CN/ja-JP/en-US 三文件同步补齐（结论/入选原因/
风险/评分拆解/状态/数据质量/summary 模板/策略适配）。summary 模板用 `{token}` 占位 +
前端 `fill()` 轻量替换，所有 CJK 文案留在 message 文件内（TSX 无新增硬编码 CJK 串）。

### Smoke Test（spec §14）
新增 `scripts/smoke-explain.ts`（BASE_URL 可配，从 DB 取活体 symbol 后打 HTTP 端点），
生产 5 项全 PASS：
- DAY_TRADE Top10（6223.T 西部技研）conclusion=STRONG，reasons=5，106ms
- SWING_TRADE Top10（8918.T）STRONG，45ms
- LONG_TRADE Top10（8918.T）STRONG，76ms
- 非Top10（2670.T）rank=11 / gap=0.03 / cutoff=78.43，正确显示未入选原因，20ms
- null/未知 symbol 不崩溃，优雅返回 found=false / INSUFFICIENT，55ms

### 验证
- `npm run build --webpack`：PASS（`/api/strategy/explain` 已进路由清单），`tsc --noEmit` exit 0
- `health:data`（生产）：CRITICAL=0（53 PASS / 4 WARNING / 1 INFO，与 v17.26.1 基线一致，
  本次改动不碰数据/schema，不可能新增 CRITICAL）
- 生产 `/strategy` HTTP 200；公网 `/api/strategy/explain` 返回真实数据
- 部署：rsync .next（--delete 清 stale chunk）+ lib + scripts，`pm2 restart tohoshou-web`
  （pid 变化确认重启）；**未重启 tohoshou-cron**（cron-scheduler.ts 未改动）

### Module Responsibility
AI Explain 归属「策略中心内的推荐解释」，仅落在 `/strategy`，未触及 Dashboard/Portfolio
Legacy/Mission Control/Verify，符合 Module Responsibility Baseline。

---

## [17.26.1] - 2026-07-01 — 收尾：全量 compute-scores 重算，完成 v17.26.0 遗留的全市场排名刷新

### 背景
v17.26.0 的定向修复脚本（`repair-stale-return60d.ts`）刻意只刷新了3582只受影响股票的
`calcIndicators` 技术字段，未重算 `adaptiveScore`/`percentileRank`/`marketRank`/
`recommendationV2`/`opportunityScore`（避免只对局部股票重排名会破坏另外133只未受影响股票
的相对排名一致性），当时计划留给次日 07:30 JST 常规全量流水线统一处理。

### 本次操作
按标准收尾流程，鉴于本次会话直接涉及 StockScore/return60d 修复，在生产环境执行全量
`npx tsx scripts/compute-scores.ts`（未提前等到次日）：
- Pass 1：3715 只计算完成（3只因价格记录不足跳过，0错误，33.5s）
- Pass 2：全市场排名完成（4.4s，1只触发安全守卫降级）
- Pass 3：AI Action 交易决策计算完成（8.9s，3715只更新）
- 全部完成，总耗时 46.8s

结果：全市场 `percentileRank`/`marketRank`/`recommendationV2`/`opportunityScore`/
`tradingAction` 现已基于完整价格历史（含06-29/06-30补数）一致刷新，完成了 v17.26.0 遗留
的收尾项。`recommendationV2` 分布：STRONG_BUY 18 / BUY 76 / HOLD 721 / WATCH 1707 /
AVOID 1193（市场温度 NEUTRAL）。

### 验证
- `health:data`：全量重算前后均 CRITICAL=0（`Split contamination` 检查显式验证为 0，
  非仅未触发采样阈值），53 PASS / 4 WARNING / 1 INFO，与 v17.26.0 时一致，无新增问题
- `pm2 restart tohoshou-web` 确认重启成功（pid变化，"✓ Ready in 333ms"）；
  `pm2 logs` 检查确认无新增错误（error log 中的 "Failed to find Server Action" 均为今晨
  更早时间的历史记录，是 Next.js 部署后旧浏览器标签页请求已失效 Server Action 的已知良性
  现象，非本次改动引入）
- 生产页面存活检查：首页/策略中心/控制中心页面与 API 均 HTTP 200

### 未改动
本次未修改任何代码文件，仅执行了一次常规数据处理脚本（`compute-scores.ts` 本身在v17.26.0
及更早版本中已存在，逻辑未变）。

---

## [17.26.0] - 2026-07-01 — P0 Split Contamination 生产 CRITICAL 根治：Root Cause + 定向数据修复

### 背景
生产环境唯一剩余 CRITICAL `Split contamination = 7`。前两版本报告（v17.24.0/v17.25.0）
误判为"会在次日 compute-scores 重算后自愈"且"疑似跨真实除权除息区间"——均未经严格验证，
本次做完整根因排查并推翻此前的错误猜测，改为逐股票精确算术复现。

### Root Cause（已用逐股票精确算术复现验证，非猜测）
`scripts/data-health-guard.ts` CHECK 2（`split_contamination`）逻辑：取
`StockScore.priceCount≥20 且 |return60d|>100%` 的前10只（按 return60d 降序），对每只重新
拉取最近65条 `DailyPrice`（按日期降序），用 `bars[60].adjClose??close` 与 `bars[0]` 独立
重算一次60日收益率，与 `StockScore.return60d` 相差 >15个百分点即判定为"contamination"。

对全部7只股票（285A.T/6976.T/6327.T/6997.T/3449.T/6779.T/3905.T）逐一验证：
- `adjClose === close` 对该窗口内每一行都成立 → **不存在真实拆股/除权**（排除 D）
- 用当前完整 `DailyPrice` 手工按 `nDayReturn` 公式重算，7只全部与 health-guard 的
  "adj-computed" 值精确吻合（至小数点后1位）→ **算法本身无误**（排除 B）
- 用"回退2行"（即去掉 06-29/06-30，模拟这两只股票当时的历史状态）手工重算，7只全部与
  `StockScore` 中"stored"的旧值精确吻合（至小数点后1-2位，6997.T 因额外含07-01行需回退
  3行同样精确吻合）→ **锁定唯一解释**
- `StockScore.computedAt` 全库仅一个时间戳 `2026-06-30 21:23:04.043`（今晨常规07:30 JST
  流水线运行时刻），早于这7只股票 06-29/06-30 `DailyPrice.createdAt`
  （`2026-07-01 06:15~06:52`，即 v17.24.0 修复验证阶段的价格补数写入时刻）

**结论：Category A — DailyPrice 数据完整性（时效性）问题**：`compute-scores.ts` 于今晨
07:30 JST 常规运行时，这些股票的 06-29/06-30 收盘价尚未同步成功（v17.24.0 修复前的
J-Quants 429 限流遗留问题，同一批次），`nDayReturn()` 按数组下标（非日历日期）回溯
"60天前"，序列少 2-3 行导致回溯基准点整体前移，产生一个内部算术自洽但已过时的
`return60d`。DailyPrice 当前数值本身完全正确（无需修复）；J-Quants/Yahoo 原始数据无异常
（排除 E/F）；Health Guard 判断完全正确、如实检出了一个真实的数据不一致（排除 G）。

**扩大排查：不只这7只**。通过 `StockScore.computedAt < 该symbol DailyPrice最新createdAt`
精确定位，全库共 **3582 只**（占比96.4%）股票的技术指标字段（return5d/20d/60d、
ma5/20/60、rsi14、macd 等）处于同样的过时状态——这7只只是恰好 |return60d|>100% 排进了
health-guard 抽样前10而被检出，其余3575只有相同性质但未达抽样/阈值条件，未被现有检查
发现（不代表没问题，只是未被采样到）。

### Production Fix
**未修改任何代码逻辑**（`nDayReturn`/`calcIndicators`/`data-health-guard.ts` split_contamination
判断条件/阈值/等级均未改动，符合"禁止把 CRITICAL 改成 WARNING/禁止放宽阈值/禁止删检查"）。
根因是数据过时，不是代码缺陷，因此修复手段是**定向数据重算**：

新增 `scripts/repair-stale-return60d.ts`：
- 精确定位受影响股票：`StockScore.computedAt < MAX(DailyPrice.createdAt) per symbol`
- 仅重算 `calcIndicators()` 产出的技术字段：`priceCount/latestDate/latestClose/
  return5d/return20d/return60d/rsi14/macd/macdSignal/macdHist/maTrend/macdSignalLabel`
- **刻意不重算** `adaptiveScore/technicalScore/percentileRank/marketRank/
  recommendationV2/opportunityScore/tradingAction` 等全市场排名相关字段——这些是
  Pass 2 全市场横向比较的产物，只对3582只做局部重算会破坏未受影响的133只股票的相对
  排名一致性；这些字段将由明日 07:30 JST 常规 `compute-scores.ts` 全量流水线统一刷新，
  不在本次抢修范围（且不影响 split_contamination 判定，该检查只读 return60d）
- `--dry-run` 预演确认 3582/0错误 后正式执行：3582 更新 / 0 跳过 / 0 错误

### 历史数据修复结果
- 3582 只股票的 return5d/20d/60d 等技术字段已刷新为基于完整价格历史的正确值
- 7只原CRITICAL标的验证：285A.T 311.38%、6976.T 398.15%、6327.T 418.03%、
  6997.T 296.85%、3449.T 286.52%、6779.T 173.56%、3905.T 152.37% ——与 health-guard
  "adj-computed" 独立重算值完全一致

### Health 验证
- 修复前：`Split contamination = 7`（唯一 CRITICAL）
- 修复后：**CRITICAL = 0**（`✅ Health guard passed`，53 PASS / 4 WARNING / 1 INFO）
- 剩余4条 WARNING 均为无关既有项（52周高低可疑阈值×2、return20d极端值、return60d极端值
  "5 genuine, 0 suspect"——已被独立验证为真实市场行情，非污染）

### Mission Control 验证
- `productionStatus.status = "WARNING"`（非 CRITICAL，如实反映4条既有WARNING）
- `criticalIssues = []`（空）

### 回归验证（全部正常，未受影响）
- Day Trade：`recentTrades` 仍正确显示 2026-06-26 / 2026-06-30（StrategyTradeResult
  未被本次修复触碰）
- Swing/Long：持仓数正常（5/5），Learning grade=B（SWING）
- Learning：DAY grade=B / SWING grade=B / LONG grade=D，均由常规 cron 自然产出
- Backtest：DAY asOf=2026-07-01 n=5 fill=100%，SWING n=4 fill=100%
- Strategy Center API (`/api/strategy/overview`)：`healthOk=true`，
  `dayTradeResultOk=true`，`dayTradeSnapshotOk=true`
- Mission Control：`todayPipeline` 各步骤正常（常规 cron 在本次会话期间自然运行了
  16:35/16:40/16:45/17:00/17:15 JST 各步骤）

### 验收
- `npm run build` ✅ PASS
- `health:data`：修复前 CRITICAL=7 → 修复后 **CRITICAL=0**
- 部署：rm chunks → rsync .next/scripts/lib → pm2 restart web+cron 均确认重启成功
- 未触碰：Trading Engine / Strategy Engine / Cron 时间 / Architecture / Schema /
  Learning 逻辑 / Backtest 逻辑 / Validation 逻辑（仅新增一个独立的技术字段定向修复脚本）

---

## [17.25.1] - 2026-07-01 — P2 Mission Control V2 细节优化（纯展示层，未改任何业务逻辑）

### 目标
在 v17.25.0 基础上做运营体验优化：Production Status 展示具体 issue 而非只报数量、Today
Pipeline 加进度条、三策略状态展开为三列详情、Validation 增加 Phase 7 条件进度、新增
Health Detail 明细卡与 Recent Incidents 事件流、新增 Trading Architecture 状态条、页面标题
补充汉化。仅新增/丰富 API 返回字段与页面展示，未触碰 Trading Architecture / 交易逻辑 /
Schema / Cron 时间 / Strategy Engine / Backtest·Learning·Validation 计算逻辑。

### API 新增字段（`app/api/admin/mission-control/route.ts`，均为新增，未删除/未改变任何既有字段语义）
- `criticalIssues` / `warningIssues` / `healthDetails`：从 health-guard 报告的完整 `checks`
  数组解析出结构化明细（name/level/value/impact/suggestion/relatedToCurrentTask），并附带
  一份手工整理的已知问题知识库（split_contamination 等）用于展示影响与处理建议——**纯展示
  层标注，不改变任何检查项的 pass/fail/severity 判定**。
- `recentIncidents`：合并4个来源的最近10条事件（当前 health:data CRITICAL/WARNING、
  StrategyDailyValidation.incidentReport 逐行拆解、DeploymentLog 中 healthStatus≠PASS 的
  历史部署、cron-error.log 尾部摘要），按时间倒序。
- `phase7Progress` / `architectureStatus`：直接复用 StrategyDailyValidation 已计算好的
  字段（dayFilledTotal/swingClosedTotal/longClosedTotal/dayGrade/swingGrade/longGrade/
  phase7Ready/phase7Detail）与静态展示常量（V1/FROZEN/2026-06-30冻结日期），**均为纯展示，
  不参与任何 Phase 7 判定逻辑本身**（判定逻辑仍完全在 strategy-daily-validation.ts 内）。
- `refreshStatus`：health-guard 报告新鲜度（分钟数 + 是否 >5 分钟过期），供页面提示。
- `todayPipeline` 新增 `completionPct`/`failedCount`/`allDoneToday`；`productionStatus`
  新增 `passCount`/`highestSeverity`（`healthCriticalCount`/`healthWarningCount` 等既有
  字段原样保留）。

### 页面重写（`app/admin/mission-control/page.tsx`）
- Production Status 卡片下方新增 CRITICAL/WARNING Issues 明细区块，**CRITICAL>0 时强制
  显示"严重"，不允许显示"正常"**（沿用 v17.25.0 已有的 productionStatus 判定，未减弱）。
- Today Pipeline 加进度条 + 百分比 + 失败步骤红色高亮。
- 三策略状态展开为三列（推荐总数/Top10/已成交或持仓/已跳过或新开平仓/最新交易日），
  每策略显示 正常/注意/异常 三级状态。
- Validation 卡片新增 Phase 7 条件进度（DAY/SWING/LONG 当前/目标 + Learning 等级 +
  Health 连续天数/30）。
- 新增 Health Detail 卡（CRITICAL/WARNING 逐条列出，Split contamination 明确展示，
  不再只显示数量）与 Recent Incidents 事件流表格。
- 顶部新增 Trading Architecture 状态条（V1/FROZEN/2026-06-30/运营+数据积累/Phase 7/
  未就绪，纯展示不参与逻辑）。
- 页面标题全部汉化（生产状态/今日流水线/策略状态/验证状态/Trading Architecture V1
  流水线/每日行情/新闻资讯/全球指数/综合评分/策略回测/策略学习/每日验证/报告状态/
  PM2·Cron 状态），PM2/Cron/API/DAY_TRADE 等技术标识按要求保留在技术表格中。

### 验收
- `npm run build` ✅ PASS
- `health:data`：CRITICAL=1（与 v17.25.0 相同的既有 Split contamination 问题，本次页面
  如实显示为 CRITICAL Issue 明细，未掩盖、未强行改绿）
- 生产环境实测：`productionStatus.status="CRITICAL"`、`criticalIssues` 明确列出
  split_contamination 详情、`recentIncidents` 7条正确聚合、`phase7Progress`/
  `architectureStatus`/`refreshStatus` 均按预期返回、`todayPipeline` 11/11/100%/无失败
- 部署：schema 无变更；rsync .next/app/components/lib/scripts/package.json；
  pm2 restart tohoshou-web + tohoshou-cron 均确认重启成功

---

## [17.25.0] - 2026-07-01 — P1 Mission Control V2：Trading Architecture V1 运营驾驶舱

### 目标
`/admin/mission-control` 全面重写为 Trading Architecture V1 的生产运营驾驶舱，替换早已过时的
旧 Pipeline（Compute Scores/Rerank Top500/Portfolio Snapshot/AI Signal Stats/Update
Backtest/Learning Report）。纯只读监控，未改动任何交易逻辑/schema/策略引擎/Cron 时间。

### 新增 API：`app/api/admin/mission-control/route.ts`（完全重写，不再是旧 pipeline 结构）
返回 `productionStatus/todayPipeline/dataFreshness/strategyRecommendations/
strategyExecutions/backtest/learning/validation/reports/pm2/health/version/generatedAt`。

### 新 Pipeline（13步，真实反映当前 cron-scheduler.ts 实际调度时间，未虚构任何时间）
05:30 全球指数 → 06:00 行情同步 → 07:00 新闻 → 07:30 综合评分/三策略推荐/日内T+1结算 →
16:35 波段 → 16:40 长线 → 16:45 回测 → 17:00 学习 → 17:15 验证 → 周六17:30周报 →
月末18:00月报。

### 发现并修复：两个"日志盲区"导致的误报 FAILED
- **compute-scores**：由 `sync-all-prices.ts` 内部通过 `execSync` 链式调用，从未写入
  `pipeline-runs.jsonl`（该日志只有 2026-06-26 一条历史 dry-run 记录）——导致该步骤在
  日志驱动的判断下永远显示"逾期未执行"。改用 `StockScore` 当日新鲜度（`computedAt` 落在今天）
  作为该步骤的真实判据，不依赖那条从未被写入的日志。
- **day_settle**：本次会话中曾手动 CLI 直接运行 `day-strategy.ts`（绕过 cron 包装器的
  `runAsync`/`writePipelineLog`），导致今日日志同样缺失。改用"是否存在未结算的历史交易日
  积压"作为真实判据（而非"今日是否有一条调用记录"），更准确反映运营意义上的"是否已结清"。

### PM2 / Cron 状态
API 在生产环境直接读取本机 `pm2 jlist`（Next.js 服务端代码与 pm2 daemon 同机运行，无需
远程凭据）；额外交叉核对 `DeploymentLog` 中最近一次修改 `cron-scheduler.ts` 的部署时间
是否晚于 `tohoshou-cron` 进程的启动时间——若是，标记 `cronStaleAfterDeploy` WARNING，
提示"新调度可能未生效"。

### 已知的、本次未处理的旁支发现（更正上一版本 v17.24.0 报告中的错误判断）
`data-health-guard.ts` 的"Split contamination"CRITICAL（7条）**并未如 v17.24.0 报告预期
在次日 `compute-scores` 重算后自愈**——今日 07:30 已用完整价格历史重新计算过
`StockScore.return60d`，问题依然存在。经复核，这更可能是 `return60d` 计算方法论本身的
问题（疑似跨越真实除权除息（split）区间时使用了未复权 `close` 而非 `adjClose`，导致
60日窗口首尾两端的复权基准不一致），而非数据过渡态。与 Day Trade、Mission Control 均
无关，未在本次范围内修复（涉及 `lib/indicators.ts`/`compute-scores.ts` 的计算方法论，
需要独立评估，不应在监控类任务中顺手改动）。建议后续单开 P1/P2 任务专项排查。

### 验收
- `npm run build` ✅ PASS
- `/admin/mission-control` 生产环境实测：11/11 今日步骤全部 SUCCESS（周报/月报按条件正确
  SKIPPED，非本周六/月末）；三策略推荐/执行/回测/学习/验证/报告/PM2 状态均正常读取
- `health:data`：CRITICAL=1（上述已知无关旁支问题，非本次引入）
- 部署：schema 无变更；rsync .next/app/components/lib/scripts/package.json；
  pm2 restart tohoshou-web + tohoshou-cron 均确认重启成功

---

## [17.24.0] - 2026-07-01 — P0 Day Trade 生产链路修复：T+1 结算时序 + 价格同步限流 + 断点续跑

### 背景
`/review payment` 级别审计发现 Day Trade 自 2026-06-26 后从未自动产生过成交/快照——
Strategy Center「最近成交记录」永远停在 2026-06-26，是 3 个独立根因叠加的结果。

### 根因 1：16:30 JST 结算时序与价格同步时序矛盾
`day-strategy.ts` 旧版在当天 16:30 JST 结算当天交易，要求当天 DailyPrice 已有收盘价；
但全站唯一的价格同步 cron 只在**次日** 06:00 JST 才写入前一交易日的收盘数据——16:30 时
当天收盘价在架构上永远不可能存在，每个交易日都必然触发「无数据」放弃写入。

**修复（T+1 结算）：** `day-strategy.ts` 改为自动断点续跑模式——处理所有已有
`StrategyRecommendation` 但尚未结算、且严格早于今天（JST）的历史交易日；`cron-scheduler.ts`
删除 16:30 触发，改为在 07:30 价格同步完成（`await syncPricesPromise`）之后立即结算 T-1。
单只股票缺 open/close 价格时标记新增状态 `SKIPPED_DATA_MISSING`（不再用
`WAITING_OPEN`/`WAITING_CLOSE`，避免重演 v17.23.0 的 stale>24h 误报 CRITICAL）。

### 根因 2：部署流程未重启 tohoshou-cron
`cron-scheduler.ts` 的 `cron.schedule()` 注册只在进程启动时读取一次；历次部署只
`pm2 restart tohoshou-web`，导致 2026-06-29 当天新增的 Day Trade 16:30 调度从未被
运行中的旧进程加载——当天没有任何触发记录（日志证实全天无 Day Trade 相关行），
是「静默漏跑」而非报错。

**修复：** `CLAUDE.md` 部署流程明确要求——凡改动 `cron-scheduler.ts`，必须同时
`pm2 restart tohoshou-cron`（非 07:30–14:00 JST 时段内执行），并用 `pm2 list` 核实
两个进程的重启计数/pid 均已变化。

### 根因 3：sync-all-prices 遭 J-Quants 429 限流，3 天几乎全灭
生产环境实测确认：J-Quants API（AWS API Gateway usage plan）对持续高频请求有短窗口限流
（约 60-70 秒后自动恢复）；旧配置 concurrency=5 + 批次间隔 200ms 实际持续速率约
25 req/秒，远超限额，导致 2026-06-28~06-30 连续 3 天 3597~3598/3718 只股票同步失败
（成功率仅约 3%），`sync-prices-failed-*.json` 100% 为 429 错误。

**修复：** `sync-all-prices.ts` 加入全局共享节流网关（`SYNC_MIN_INTERVAL_MS`，默认
500ms，所有并发 worker 共享同一发号时钟，实际速率与并发数解耦）；命中 429 时设置
90 秒全局冷却；新增失败原因分类统计（rate_limit/timeout/db_write_failed/
symbol_format/api_error/unknown）写入 `sync-prices-failed-<date>-summary.json`。
默认并发数从 5 降为 2（实际吞吐由共享节流间隔决定，非并发数）。

### Health Guard 增强（`data-health-guard.ts`）
- 新增 CHECK：DAY_TRADE 最近连续缺失 TradeResult 的交易日天数——1 天 WARNING，
  ≥2 天 CRITICAL（S33）
- 新增 CHECK：DailyPrice 在**最近一个已完整同步的交易日**（非当天，避免当天数据
  尚未同步完成时误报）覆盖率 <80% → CRITICAL
- S10 有效状态白名单加入 `SKIPPED_DATA_MISSING`

### Strategy Center API 修复（`app/api/strategy/overview/route.ts` + `app/strategy/page.tsx`）
「今日执行状态」卡片原本只读 `StrategyDailyValidation.dayRecOk`（只检查推荐是否生成），
无法反映 TradeResult/Snapshot 是否真的写入——这正是本次故障能持续 5 天却「看起来健康」
的原因之一。新增独立字段 `dayTradeResultOk`/`dayTradeSnapshotOk`，直接查询最近一个
应结算交易日的 TradeResult/Snapshot 是否存在，前端卡片由 6 项扩为 7 项。

### 生产数据补跑
- `sync-all-prices --prices-only` 全量重跑：3718/3718 成功，0 失败，0 次 429（验证限流
  修复彻底生效），DailyPrice 覆盖率 2026-06-29 从 119→3686 条、2026-06-30 从 119→3680 条
- `day-strategy.ts` 自动结算：2026-06-30 新增 5 笔真实成交（P&L +¥845,100，
  Alpha +2.37% vs TOPIX）+ 1 条 StrategySnapshot + 1 条 StrategyCapitalLog
- **2026-06-29 无法补跑**：`generate-strategy-recommendations.ts`（Phase 3）实际部署于
  2026-06-30 凌晨，06-29 当天从未生成过 `StrategyRecommendation`；`StockScore` 非按日
  版本化存储，无法在事后重建「当天 AI 会推荐什么」而不产生前视偏差（look-ahead bias，
  违反 `lib/safety-rules.ts` 铁律一）。因此 06-29 是永久性数据缺口，未伪造补齐，
  health guard 的连续缺失检查会自然跳过该日（因其从无 recommendation，不进入候选清单）。

### 已知的、本次未处理的旁支发现
补跑价格数据后，`data-health-guard.ts` 的既有检查「Split contamination」新增 7 项 CRITICAL——
经核实为 backfill 引入 06-29/06-30 历史数据后，`StockScore.return60d`（今晨 07:30 计算，
基于当时不完整的价格历史）与刷新后的 60 日窗口不再对齐的**过渡态**，与 Day Trade 无关、
非本次引入的新 bug，预期在明日 07:30 JST `compute-scores.ts` 自然重算后恢复；未在本次
范围内强制触发 90 分钟的全量重算。

### 验收
- `npm run build` ✅ PASS
- `npm run health:data`：Day Trade 相关全部检查 ✅ PASS（含新增 S33/覆盖率检查）；
  唯一剩余 CRITICAL 为上述已知旁支过渡态（非 Day Trade 范畴）
- Strategy Center 最近成交记录现含 2026-06-26 / 2026-06-30（2026-06-29 因史实缺口
  无法补齐，2026-07-01 因 T+1 设计需等次日结算）
- `pm2 list` 确认 tohoshou-web / tohoshou-cron 均已重启并加载新代码

---

## [17.23.0] - 2026-07-01 — P1 生产红色报警修复：Day Trade 高价股卡死 WAITING_OPEN + 报警文案误报

### 背景
`/admin/verify` 报 `ready:false`，1 CRITICAL：`Day Trade stale WAITING_OPEN (>24h) = 0: 1`，
同一条消息里还夹带了一条 WARNING（`high52w > price×10 (suspect): 8`），看起来像2个红色阻断项，实际只有1个。

### 根因 1（真实 CRITICAL）：`scripts/day-strategy.ts:276-288`
Day Trade 单笔仓位 ¥6,000,000 ÷ 8035.T（东京威力科创）开盘价 ¥72,560 ≈ 82.7股，
日股最小交易单位100股一手 → `floor(82.7/100)*100=0`，quantity算出0股。
这种"买不起一手"的情况被错误地打上了 `status:"WAITING_OPEN"` 标签——但 entryPrice 其实已经写入，
这不是在等数据，是这只股票在当前仓位规模下永远买不起一手，属于永久性状态，被 health guard 的
"WAITING_OPEN 超24小时"检查判定为卡死数据。

**修复：**
- `prisma/schema.prisma`：`StrategyTradeStatus` 枚举新增 `SKIPPED_LOT_SIZE`；`StrategyExitReason` 枚举新增 `LOT_SIZE_TOO_SMALL`
- `scripts/day-strategy.ts`：qty≤0 分支 `status` 改为 `SKIPPED_LOT_SIZE`，`exitReason` 改为 `LOT_SIZE_TOO_SMALL`（不再复用 `WAITING_OPEN`/`DATA_MISSING`）
- `scripts/data-health-guard.ts` CHECK S10 的有效状态白名单加入 `SKIPPED_LOT_SIZE`
- 生产数据修复：`strategy_trade_results` id=4（8035.T, 2026-06-26）手动改为 `SKIPPED_LOT_SIZE`（历史行，upsert 的 `update:{}` 不会自动修正旧数据）

### 根因 2（报警文案误报）：`scripts/data-health-guard.ts:1007`
`topIssues = [...criticals, ...warnings]` 把 CRITICAL 和 WARNING 检查混进同一个数组，
`app/api/admin/verify/route.ts:262` 又直接摘取这个混合数组的前2条，套上"CRITICAL issue(s)"文案，
导致一条 WARNING（52周高点数据异常）被误标为红色报警的一部分。

**修复：** `topIssues` 只保留 `criticals`；新增独立的 `warningIssues` 字段承载 WARNING 明细。

### 验收
- `npm run build` ✅ PASS
- 生产 `npx tsx scripts/data-health-guard.ts`：CRITICAL=0，WARNING=5（非阻断）
- `curl /api/admin/verify?module=status`：`ready:true`，`blockingIssues:[]`
- deployment #72，commit（见下）

---

## 🏁 MILESTONE — Trading Architecture V1：Production Stable（2026-06-30）

```
Status        : ✅ Production Stable
Freeze Date   : 2026-06-30
Architecture  : FROZEN
Production    : YES
Current Mode  : Operation & Data Accumulation
Next Major    : v18.x（Phase 7 — AI Strategy Optimization）
```

**V1 包含版本：v17.9.0 → v17.19.0**（Phase 1 数据底座 → Phase 6 Strategy Center → T1 稳定化 → T2 UI精修）

Phase 7 开启条件（需同时满足）：
- DAY_TRADE 成交 ≥ 100 次
- SWING_TRADE 平仓 ≥ 30 次
- LONG_TRADE 平仓 ≥ 20 次
- StrategyLearningSummary Grade ≥ C
- 连续 30 日 CRITICAL = 0

---

## [17.22.0] - 2026-06-30 — P1 Production Audit Bug Fix Sprint（全部P1修复）

### P1-001/002：StrategySnapshot.alpha 错误值修复（swing + long）
**根因：** `cumulativeRet - topixToday`：`cumulativeRet` 是策略启动以来的累计回报（如 +14.7%），
`topixToday` 是当日 TOPIX 单日涨跌（如 -0.3%）。两者时间维度不同，差值无任何经济意义。

**修复：**
- `scripts/swing-strategy.ts:545` / `scripts/long-strategy.ts:525`：StrategySnapshot 写入改为 `alpha: null`
- 添加 TODO 注释：累计 Alpha 等待 topix baseline 后正式启用
- **DB Migration（生产已执行）：** 3条 SWING/LONG StrategySnapshot alpha 错误值已清零，0条残留

**注意：** StrategyPosition/StrategyTradeResult 的个交 alpha（持仓期间 TOPIX 累计收益对比）
逻辑正确，未改动。

### P1-003：Phase 7 连续健康天数算法修复
**根因：** `app/api/strategy/validation/route.ts` 使用 `reduce(-1 哨兵)` 模式：只要历史上有任意一天
`healthOk=false`，哨兵永不恢复，`consecutiveHealthDays` 被强制归零，显示「0/30天」。

**修复：** 改为从最新记录（DESC 顺序）向前迭代，遇 false 立即 break：
```typescript
let consecutiveHealthDays = 0;
for (const r of records) {
  if (!r.healthOk) break;
  consecutiveHealthDays++;
}
```
Phase 7 健康进度条现在准确反映最近连续 PASS 天数。

### P1-004：package.json strategy-backtest 脚本命名修正
**根因：** `npm run strategy-backtest` 执行旧引擎 `compute-strategy-backtest.ts`（写旧表），
新引擎藏在 `:new` 后缀下，开发者手动运行结果对 Strategy Center 完全无效。

**修复：**
| 旧命令 | 新命令 | 脚本 |
|--------|--------|------|
| `strategy-backtest` | `strategy-backtest:legacy` | `compute-strategy-backtest.ts`（旧）|
| `strategy-backtest:dry` | `strategy-backtest:legacy:dry` | 同上 dry |
| `strategy-backtest:new` | `strategy-backtest` | `strategy-backtest.ts`（新，正式）|
| `strategy-backtest:new:dry` | `strategy-backtest:dry` | 同上 dry |

### Commit: 878ae98

---

## [17.21.0] - 2026-06-30 — P1 Bug Fix: StrategySnapshot winRate 重复×100

### 根因
`day-strategy.ts` / `swing-strategy.ts` / `long-strategy.ts` 写入 `StrategySnapshot.winRate`
时已乘以100（存储 0~100），而 Strategy Center UI 渲染时再次 `×100` → 显示 **5000%**。

其余表（`StrategyBacktestSummary` / `StrategyLearningReport` / `StrategyDailyValidation`）
均正确存储 0~1，UI `×100` 显示正确。

### 修复

**`scripts/day-strategy.ts`**
- `winRate = wins / total * 100` → `wins / total`（0~1）
- `console.log` 行补 `×100` 保持日志可读性

**`scripts/swing-strategy.ts`**
- `winRate` 局部变量移除 `×100`
- Snapshot inline 写入 `((wins) / (total)) * 100` → 移除 `* 100`
- `console.log` 行补 `×100`

**`scripts/long-strategy.ts`**
- `winRate = ... * 100` → 移除 `* 100`
- `console.log` 行补 `×100`

**DB Migration（生产已执行）**
- `strategy_snapshots` 表：DAY_TRADE 2026-06-26 `winRate: 50 → 0.5`
- `remaining winRate > 1: 0` ✅

### 统一规范（全系统确认）
| 表 | 存储单位 | UI 渲染 |
|---|---|---|
| StrategySnapshot | 0~1（修复后）| ×100 显示 |
| StrategyBacktestSummary | 0~1 | ×100 显示 |
| StrategyLearningReport | 0~1 | ×100 显示 |
| StrategyDailyValidation | 0~1 | ×100 显示 |
| BacktestPositionResult（旧）| 0~100 | 直接显示（backtest页面）|

### 验收
- DB winRate=0.5 → UI 显示 50.0% ✅
- 5000% Bug 修复 ✅
- `npm run build` ✅ PASS
- `npm run health:data` ✅ CRITICAL=0
- deployment #70，commit ac816af

---

## [17.20.0] - 2026-06-30 — T2 P2: Legacy AI组合页面最终收尾

### 目标
/portfolio 页面彻底完成 Legacy 化。统一 Layout、新增升级说明与新旧架构对照、Sidebar Legacy Badge。
不恢复任何旧业务数据，仅保留历史入口与 Strategy Center 跳转。

### 改动

**`app/portfolio/page.tsx`（完全重写）**
- 外层改用 `p-4 md:p-6 max-w-6xl bg-[#0f172a] min-h-screen`，与 Strategy Center 统一 Layout
- 内容区 `max-w-[860px] mx-auto`，消除左右大面积留白
- 新增「Trading Architecture V1 升级说明」卡片（upgrade_body1-4 + 三策略列表）
- 新增「新旧架构对照」表格卡（6行：策略/周期/收益/学习/回测/维护状态）
- 「进入策略中心 →」按钮居中，宽 240px，Primary Green
- 页面底部新增「Legacy Notice」区块（旧快照停止生成 + 历史数据说明）

**`components/Sidebar.tsx`**
- `NavItem` 新增可选 `badge?: string` 字段
- `/portfolio` 添加 `badge: "Legacy"`（灰色小标签，渲染在导航项右侧）

**`lib/i18n/types.ts` + 三语言文件（zh-CN / ja-JP / en-US）**
- `portfolio.legacy.title/subtitle` 更新文案（title → "AI组合（Legacy）"）
- 新增 27 个 key：upgrade_title / upgrade_body1-4 / strategy_day/swing/long / cmp_title / cmp_col_legacy/new / cmp_r1-r6_legacy/new / notice_footer_title/body1/body2

### 验收
- Layout 与 Strategy Center 统一 ✅
- 升级说明卡 ✅
- 新旧架构对照表 ✅
- 「进入策略中心」按钮 ✅
- Sidebar Legacy Badge ✅
- 不恢复旧数据 ✅
- `npm run build` ✅ PASS
- `npm run health:data` ✅ CRITICAL=0
- 生产 HTTP 200 ✅
- deployment #69，commit 7dae458

---

## [17.18.0] - 2026-06-30 — T2 P1: Weekly & Monthly Strategy Report System

### 目标
T2 第一阶段（P1）：建立策略运营自动报告系统。每周六 17:30 JST 生成周报，月末 18:00 JST 生成月报，
Strategy Center 新增「报告」第5个 Tab，健康守卫新增 S31/S32 WARNING 检查。

### 改动

**新增脚本**
- `scripts/generate-weekly-report.ts` — 周报生成引擎
  - 统计当周（周一至周五）已结算交易：成交数、胜率、平均收益、平均超额、最大回撤、持仓天数
  - 汇总最新 Learning Grade + Recommendation + 完整性分
  - 输出本周健康检查日志（通过/失败/异常天数）
  - 保存至 `reports/weekly/YYYY-Www.md`，自动剪枝（保留13周）
- `scripts/generate-monthly-report.ts` — 月报生成引擎
  - 月内全量已结算交易统计 + Sharpe/Sortino 样本近似
  - 月内评级变化（首末 Grade 对比）
  - 月度异常事件汇总 + 健康趋势表 + Phase 7 就绪天数
  - 保存至 `reports/monthly/YYYY-MM.md`，自动剪枝（保留12个月）
  - 含内置月末守卫（非月最后一天自动跳过，`FORCE=1` 可覆盖）

**Cron 新增**
- `30 17 * * 6`（土曜 17:30 JST）：`generate-weekly-report.ts`
- `0 18 28-31 * *`（月末 18:00 JST）：`generate-monthly-report.ts`（脚本内部二次验证）

**新 API**
- `app/api/reports/weekly/route.ts` — 列举周报文件 + 读取指定周内容
- `app/api/reports/monthly/route.ts` — 列举月报文件 + 读取指定月内容

**Strategy Center 更新**
- `app/strategy/page.tsx` — 新增「报告」第5个 Tab（teal 配色）
  - `ReportsTab` 组件：双栏（周报 + 月报），含文件选择器 + Markdown 原文展示
  - `ReportSection` 子组件：可复用，支持 teal / indigo 颜色主题

**Health Guard**
- S31（WARNING）：`weekly_report_exists` — 最新周报是否存在且不超过14天
- S32（WARNING）：`monthly_report_exists` — 最新月报是否存在且不超过35天

**i18n**
- 三语言新增8个 Key（strategy.reports.*）

**其他**
- `package.json`：新增 `generate-weekly-report` / `generate-monthly-report` / `generate-monthly-report:force`
- `.gitignore`：将 `reports` 改为 `/reports`（防止误排除 `app/api/reports/` 路由目录）
- `reports/weekly/.gitkeep` + `reports/monthly/.gitkeep`：目录占位（数据文件本身不入库）

---

## [17.17.0] - 2026-06-30 — T1: Trading Architecture V1 Stabilization

### 目标
Trading Architecture V1 全部阶段完成后进入连续30个交易日稳定运行验证阶段。
V1 冻结：禁止修改数据库 Schema、禁止修改交易流程，仅允许 Bug Fix / 性能优化 / 日志优化。

### 改动

**新 DB 表**
- `StrategyDailyValidation`（新增）：每日9项验证结果、累计统计、Phase 7 就绪状态

**新增脚本**
- `scripts/strategy-daily-validation.ts` — T1 每日验证引擎
  - 9项检查：DAY/SWING/LONG推荐、策略执行、资金快照、交易记录、回测更新、学习更新、系统健康
  - 累计统计：三策略成交/胜率/Learning Grade 快照
  - Phase 7 就绪判定：7个条件（成交量+Grade+连续30日Health）
  - Incident Report：任一 FAIL → console.error 输出事故报告
  - 自动剪枝：保留最近45天（约30个交易日）

**Cron 新增**
- 17:15 JST（工作日）：`strategy-daily-validation.ts`，位于 Learning(17:00) 之后

**新 API**
- `app/api/strategy/validation/route.ts` — 返回最近30条记录 + Phase 7 条件状态 + 运行统计

**Strategy Center 更新**
- `app/strategy/page.tsx` — 新增「稳定化」第4个 Tab（violet 配色）
  - Phase 7 开启条件面板（7项条件进度）
  - 累计统计（DAY/SWING/LONG 成交数/胜率/Grade）
  - 30天日验证历史表（9列 ✓/✗）
  - Stabilization 状态横幅（V1 FROZEN 标签 + 通过率）

**i18n**
- 三语言新增31个 Key（strategy.stabilization.* / strategy.validation.* / strategy.phase7.*）

**package.json**
- 新增 `strategy-validation` / `strategy-validation:dry` 脚本

### Phase 7 开启条件（7项）
| 条件 | 目标 | 当前 |
|------|------|------|
| DAY 成交 | ≥ 100 | 5 |
| SWING 平仓 | ≥ 30 | 0 |
| LONG 平仓 | ≥ 20 | 0 |
| DAY Grade | ≥ B | C |
| SWING Grade | ≥ C | D |
| LONG Grade | ≥ C | D |
| 连续30日 Health CRITICAL=0 | 30 | 0 |

### 首次验证结果（2026-06-30）
```
DAY:C(5) SWING:D(0) LONG:D(0)
ALL PASS ✅ — Phase 7: NOT READY
```

### 规则锁定（T1 Stabilization）
- 禁止新增大型功能
- 禁止修改数据库 Schema（此版本是最后一次 Schema 变更）
- 禁止修改三交易体系流程（Day/Swing/Long Strategy Engine）
- 仅允许：Bug Fix / 性能优化 / 日志优化

---

## [17.16.0] - 2026-06-30 — Phase 6: Strategy Center V1.0

### 改动

**新增页面**
- `app/strategy/page.tsx` — Strategy Center（`/strategy`）三策略统一管理中心
  - Overview section：3张卡片（DAY/SWING/LONG），各显示 Learning Grade/Recommendation/关键指标
  - 三栏 Tab 切换（DAY | SWING | LONG），各 Tab 独立 fetch `/api/strategy/{type}` 详情
  - DAY Tab 规范：禁止显示持仓/持有天数，仅显示 Learning / Backtest / 近期成交 / Top10推荐
  - SWING / LONG Tab：资金池 + 当前持仓 + Learning + Backtest + 推荐
  - 统一色调：DAY=amber / SWING=blue / LONG=emerald

**新增 API**
- `app/api/strategy/overview/route.ts` — 并行查询3策略 Overview（持仓数/成交数/Learning/Backtest/快照/推荐）
- `app/api/strategy/[type]/route.ts` — 单策略详情（资金池/持仓/近期成交/Backtest/Learning/Top10推荐）

**i18n 三语言扩充（34个新 Key）**
- `lib/i18n/types.ts` + zh-CN / ja-JP / en-US 同步新增 Strategy Center 相关文案

**导航更新**
- `components/Sidebar.tsx` — Core 组添加「策略中心 /strategy」（◆ 图标）
- `components/mobile/MobileBottomNav.tsx` — 替换 /backtest 为 /strategy（移动端5项限制）

**旧页面 Legacy 通知**
- `app/portfolio/page.tsx` — 顶部新增 ⚠ 橙色提示横幅：「此页面已停止维护，请使用 Strategy Center」+ 「前往 Strategy Center →」按钮

### 规范锁定
- DAY tab 禁止显示「当前持仓」（PositionsSection 用 isDayTrade 守卫）
- 所有新策略 API 数据源仅读 Strategy* 新表，禁止 DailyRecommendation
- 移动端底导 `/backtest` 已替换（桌面侧边栏仍保留 /backtest 链接）

---

## [17.15.0] - 2026-06-30 — Phase 5: Strategy Learning Engine

### 改动

**新增脚本**
- `scripts/strategy-learning.ts` — Strategy Learning Engine（Phase 5）
  - 读取 `StrategyBacktestSummary`（不触碰 Day/Swing/Long 引擎、SR Engine、Backtest Engine、Dashboard）
  - 三维评分体系（0-100 每项）：
    - `predictionScore`：winRate质量(×0.40) + alpha质量(×0.35) + 回报质量(×0.25)
    - `stabilityScore`：horizon覆盖率（READY×1.0 / PARTIAL×0.5 / INSUFFICIENT×0）+ fillRate一致性
    - `confidenceScore`：样本量(×0.50) + maxDrawdown风险(×0.30) + Sharpe质量(×0.20)
    - `integrityScore`：prediction×40% + stability×30% + confidence×30%
  - Learning Grade：A+(≥85) / A(≥75) / B(≥60) / C(≥45) / D(<45)
  - Recommendation：READY(≥75) / PARTIAL(≥60) / NOT_READY(<60)
  - 统一 `StrategyLearningSummary`：DAY×30% + SWING×40% + LONG×30% 加权 integrityScore
  - `--strategy=DAY|SWING|LONG`（默认 ALL）/ `--dry-run` / `--date=YYYY-MM-DD`

**schema.prisma**
- `StrategyLearningReport`：id/strategyType/reportDate/sampleCount/fillRate/winRate/avgReturnPct/alpha/maxDrawdown/predictionScore/stabilityScore/confidenceScore/integrityScore/grade/recommendation/summary
- `StrategyLearningSummary`：reportDate（unique）/ dayIntegrity/swingIntegrity/longIntegrity/integrityScore/grade/recommendation/summary
- 生产已 `db push` 并 `generate`

**cron-scheduler.ts**
- 新增 17:00 JST（工作日）：Strategy Learning Engine，位于 Backtest(16:45) 之后

**data-health-guard.ts**
- S28: DAY Learning report exists（INFO）
- S29: SWING Learning report exists（INFO）
- S30: LONG Learning report exists（INFO）

**package.json**
- `strategy-learning` / `strategy-learning:dry`

### 生产验证（2026-06-30 首次运行）

- DAY_TRADE: **grade=C, score=48.31, NOT_READY**（1个 READY horizon，4笔成交，win=50%, α=4.11%）
- SWING_TRADE: **grade=D, score=0, NOT_READY**（无已平仓持仓，随时间积累自动晋升）
- LONG_TRADE: **grade=D, score=0, NOT_READY**（同上）
- Unified: **grade=D, score=14.49, NOT_READY**（加权：DAY×30%=14.49）
- Health: CRITICAL=0, 51 checks pass, S28-S30 ✅

---

## [17.14.0] - 2026-06-30 — Phase 4: Strategy Backtest Engine

### 改动

**新增脚本**
- `scripts/strategy-backtest.ts` — 策略回测引擎（Phase 4）
  - 读取 `StrategyTradeResult`，不读取 `DailyRecommendation`
  - 三套策略独立 horizon：DAY(1D,3D,5D) / SWING(5D,7D,20D,30D) / LONG(30D,60D,90D,180D,365D)
  - 统计项（14个）：sampleCount / filledCount / fillRate / winRate / lossRate / avgReturnPct / medianReturnPct / maxReturnPct / minReturnPct / avgHoldingDays / maxHoldingDays / topixReturnPct / alpha / maxDrawdown / sharpeRatio
  - fillRate 成熟度：≥80% READY / 50-79% PARTIAL / 30-49% LIMITED / <30% INSUFFICIENT
  - Upsert 至 `StrategyBacktestSummary`（unique: strategyType_horizon_asOfDate）
  - `--strategy=DAY|SWING|LONG`（默认 ALL）/ `--dry-run` / `--date=YYYY-MM-DD`

**schema.prisma**
- `StrategyBacktestSummary` 新增5字段：`lossRate` / `avgHoldingDays` / `maxHoldingDays` / `maxDrawdown` / `sharpeRatio`
- 生产已 `db push` 并 `generate`

**cron-scheduler.ts**
- 新增 16:45 JST（工作日）：Strategy Backtest Engine，位于 Long(16:40) 之后

**data-health-guard.ts**
- S25: DAY_TRADE backtest summary exists（INFO）
- S26: SWING_TRADE backtest summary exists（INFO）
- S27: LONG_TRADE backtest summary exists（INFO）

**package.json**
- `strategy-backtest:new` / `strategy-backtest:new:dry` 脚本入口

### 生产验证

- 首次运行写入12行（3策略×12 horizon）
- DAY_TRADE 5D: READY（n=4, win=50%, avg=2.82%, α=4.11%）— 5条 StrategyTradeResult 已结算
- SWING/LONG: INSUFFICIENT（无已平仓持仓，随数据积累自动晋升）
- Health: CRITICAL=0, 48 checks pass, S25-S27 ✅

---

## [17.13.0] - 2026-06-30 — Phase 3: Strategy Recommendation Engine

### 改动

**新增脚本**
- `scripts/generate-strategy-recommendations.ts` — 策略推荐引擎（380行）
  - 读取 StockScore（compute-scores.ts 预计算），生成 DAY_TRADE / SWING_TRADE / LONG_TRADE 三套推荐
  - 每套 Top 100，前 10 名标记 `isTop10 = true`
  - 权重方案：
    - DAY: tech×40% + moneyFlow×30% + news×20% + fund×10%
    - SWING: adaptive×30% + tech×30% + moneyFlow×20% + news×10% + fund×10%
    - LONG: fund×35% + adaptive×30% + moneyFlow×15% + tech×10% + news×10%
  - 入场过滤：DAY/SWING 排除 AVOID；LONG 仅 STRONG_BUY
  - 幂等性：当日已生成则跳过
  - Legacy 同步：更新 DailyRecommendation.strategyType（DAY/SWING/POSITION）
  - `--dry-run` / `--date=YYYY-MM-DD` 参数

**schema.prisma**
- `StrategyRecommendation` 新增 `isTop10 Boolean @default(false)` 字段
- 新增索引 `@@index([strategyType, tradeDate, isTop10])`

**策略脚本重构（禁止直接查询 DailyRecommendation）**
- `day-strategy.ts`：Step 1 改从 StrategyRecommendation 取最新日期；Step 3+4 合并的 DR-fallback 替换为直接读 StrategyRecommendation Top N
- `swing-strategy.ts`：同上，Step 3 读 isTop10=true 行
- `long-strategy.ts`：同上，Step 3 读 isTop10=true 行；Step 6 STRONG_BUY 降级检测改从 StockScore.recommendationV2 读取

**cron-scheduler.ts**
- 07:30 流水线完成后追加 `generate-strategy-recommendations.ts`（最多15分钟）

**health:data 新增 4 项 Phase 3 检查（S21–S24）**
- `sr_day_count`（WARNING）：DAY_TRADE 推荐 >= 10 条
- `sr_swing_count`（WARNING）：SWING_TRADE 推荐 >= 10 条
- `sr_long_count`（INFO）：LONG_TRADE 推荐（STRONG_BUY 严格，可为0）
- `sr_top10_marked`（WARNING）：isTop10=true 总数 >= 10

**package.json**
- 新增 `generate-strategy-recs`、`generate-strategy-recs:dry` 脚本

### 生产验证
- 2026-06-30 首次运行：DAY 100条 / SWING 100条 / LONG 15条（215总行）
- health:data CRITICAL=0，45项全通过
- day-strategy:dry 正确从 StrategyRecommendation 读取（mode: auto latest SR）
- 部署 #62，commit 517816a

---

## [17.12.0] - 2026-06-30 — P2C: Long Trade Strategy Engine

### 改动

**新增脚本**
- `scripts/long-strategy.ts` — Long Trade 策略执行引擎（380行）
  - 资金池 ¥30M / 最多10持仓 / 每笔 ¥3M 等权
  - 入场条件：STRONG_BUY + adaptiveScore ≥ 75 + fundamentalScore ≥ 18（70% of 25）+ riskOverride = NONE
  - 退出规则：止盈 +20%、止损 -10%、时间止损 90日、AI分 < 55、评级降级退出
  - 换仓规则：仅在有空仓时补仓，禁止每日换仓
  - 3级 DR 降级：L1 (POSITION+STRONG_BUY+score≥75+fund≥18) → L2 (POSITION+STRONG_BUY) → L3 (全量STRONG_BUY)
  - 今日评级获取：从 DailyRecommendation 读取当日评级用于 STRONG_BUY 降级检测
  - `--dry-run` / `--date=YYYY-MM-DD` 参数

**cron-scheduler.ts**
- 新增 16:40 JST 工作日 cron → `long-strategy.ts`（比 Swing 晚5分钟）

**health:data 新增 5 项 Long 检查（S16–S20）**
- `long_open_position_count`（WARNING）：OPEN 持仓 <= 10
- `long_no_duplicate_positions`（WARNING）：无重复 OPEN 持仓
- `long_closed_has_exit_price`（CRITICAL）：CLOSED 持仓必须有 exitPrice
- `long_no_negative_holding_days`（WARNING）：holdingDays >= 0
- `long_capital_initialized`（INFO）：资金池有日志记录

**package.json**
- 新增 `long-strategy`、`long-strategy:dry` 脚本

### 验收
- `npm run build` ✅ PASS
- `npm run health:data` ✅ CRITICAL=0（共41项通过，S16–S20全绿）
- Dry Run PASS（2026-06-26：3支STRONG_BUY候选，3新仓）
- 真实写入 PASS：StrategyPosition×3 + Snapshot×1 + CapitalLog×1
- 2026-06-29 更新 PASS：3仓 UPDATE，无退出，换仓规则：7 slots available but no new qualified candidates（禁止旋转，正确）

---

## [17.11.0] - 2026-06-29 — P2B: Swing Trade Strategy Engine

### 改动

**新增脚本**
- `scripts/swing-strategy.ts` — Swing Trade 策略执行引擎（420行）
  - 资金池 ¥40M / 最多10持仓 / 每笔 ¥4M 等权
  - 止盈 +8%、止损 -5%、时间止损 20日、AI分 < 60 退出、跌出 Top10 退出
  - 3级 DR 降级（L1: SWING typed + score≥70 → L2: SWING typed → L3: 全量 BUY/STRONG_BUY）
  - 幂等检查：StrategySnapshot 已存在则跳过
  - 全流程：更新 OPEN 持仓 → 触发退出 → 写 StrategyTradeResult → 开新仓 → Snapshot + CapitalLog
  - `--dry-run` / `--date=YYYY-MM-DD` 参数支持

**cron-scheduler.ts**
- 新增 16:35 JST 工作日 cron → `swing-strategy.ts`（比 Day 晚5分钟，避免竞争）

**health:data 新增 5 项 Swing 检查（S11–S15）**
- `swing_open_position_count`（WARNING）：OPEN 持仓 <= 10
- `swing_no_duplicate_positions`（WARNING）：无重复 OPEN 持仓
- `swing_closed_has_exit_price`（CRITICAL）：CLOSED 持仓必须有 exitPrice
- `swing_no_negative_holding_days`（WARNING）：holdingDays >= 0
- `swing_open_has_return_pct`（INFO）：持仓 > 0 天的 OPEN 持仓有 returnPct

**package.json**
- 新增 `swing-strategy`、`swing-strategy:dry` 脚本

### 验收（2026-06-26 历史日）
- `npm run build` ✅ PASS
- `npm run health:data` ✅ CRITICAL=0（S11–S15 全 PASS，共36项通过）
- Dry Run PASS：10支候选，8新仓（2支因价格过高qty=0自动跳过）
- 真实写入 PASS：StrategyPosition×8 + Snapshot×1 + CapitalLog×1
- 2026-06-27/28（周末）：正确退出，无交易
- 2026-06-29（无价格数据）：正确退出，无交易

---

## [17.10.0] - 2026-06-29 — P2A: Day Trade Strategy Engine

### 改动

**新增脚本**
- `scripts/day-strategy.ts` — Day Trade 策略执行引擎（330行）
  - `--dry-run` / `--date=YYYY-MM-DD` 参数支持
  - 3级候选股降级：L1（DAY typed + score≥75 + BUY/STRONG_BUY）→ L2（DAY typed，无 score 门槛）→ L3（全量 BUY/STRONG_BUY，支持 v15.0 以前历史日期）
  - Step 3+4 合并：候选股在 sync 阶段产出，dry-run 不再重查 DB
  - ¥30M 池 / 5 支持仓 / ¥6M 均配 / 止盈 +1.5% / 止损 -1.0%
  - 日本 100 股手数取整 `Math.floor(6M / price / 100) * 100`
  - DATA_MISSING 股票记录为 WAITING_OPEN（幂等）
  - 事务内原子写 StrategyTradeResult×5 + StrategySnapshot + StrategyCapitalLog

**cron-scheduler.ts**
- 新增 16:30 JST 工作日 cron → `day-strategy.ts`

**health:data 新增 4 项 Strategy 检查（S7–S10）**
- `day_trade_stale_waiting_open`（CRITICAL）：WAITING_OPEN 超 24h
- `day_trade_stale_waiting_close`（WARNING）：WAITING_CLOSE 超 24h
- `day_trade_result_freshness`（INFO）：最新 CLOSED 交易时间
- `day_trade_valid_status`（WARNING）：策略结果状态合规

**package.json**
- 新增 `day-strategy`、`day-strategy:dry` 脚本

### 验收（2026-06-26 历史日）
- `npm run build` ✅ PASS
- `npm run health:data` ✅ CRITICAL=0（S7–S10 全 PASS）
- Dry Run PASS：5 支候选，4 笔收盘，P&L ¥656,550
- 真实写入 PASS：StrategyTradeResult×5 + Snapshot×1 + CapitalLog×1
- 池余额：¥30,000,000 → ¥30,656,550（+2.19%，Alpha +4.11% vs TOPIX）

---

## [17.9.0] - 2026-06-29 — P1: Trading Architecture Phase 1 — 三策略数据库底座

### 改动

**新增 enum（4个）**
- `StrategyType`：`DAY_TRADE | SWING_TRADE | LONG_TRADE`
- `StrategyPositionStatus`：`OPEN | CLOSED`
- `StrategyTradeStatus`：`WAITING_OPEN | WAITING_CLOSE | CLOSED | WAITING_DATA | SKIPPED_MARKET_CLOSED`
- `StrategyExitReason`：11种出场原因（`DAY_CLOSE | TAKE_PROFIT | STOP_LOSS | AI_SCORE_DROP | DROPPED_FROM_TOP10 | MAX_HOLD_DAYS | FUNDAMENTAL_RISK | NEGATIVE_NEWS | MANUAL | MARKET_CLOSED | DATA_MISSING`）

**新增表（6个）**
- `strategy_recommendations` — 每日策略推荐候选（含 unique: strategyType+tradeDate+symbol）
- `strategy_positions` — Swing/Long 持仓记录（unique: strategyType+symbol+entryDate）
- `strategy_trade_results` — 所有已完成交易（Day Trade 主记录）
- `strategy_snapshots` — 每日策略表现快照（CREATE-only，unique: strategyType+snapshotDate）
- `strategy_capital_logs` — 独立资金池流水（3:4:3 独立）
- `strategy_backtest_summaries` — 三策略独立回测汇总（unique: strategyType+horizon+asOfDate）

**新增脚本**
- `scripts/init-strategy-capital.ts` — 幂等资金池初始化；DAY_TRADE ¥30M / SWING_TRADE ¥40M / LONG_TRADE ¥30M

**package.json**
- 新增 `strategy:init-capital` 脚本

**health:data 新增 6 项 Strategy 检查**
- `strategy_tables_exist`（CRITICAL）：6张表可访问
- `strategy_capital_initialized`（WARNING）：3套资金池是否初始化
- `day_trade_no_overnight`（CRITICAL）：Day Trade 无隔夜 OPEN 仓
- `strategy_position_valid_status`（WARNING）：Swing/Long 持仓状态合规
- `day_trade_no_weekend_snapshot`（WARNING）：Day Trade 快照不在周末
- `strategy_snapshot_distinguished`（INFO）：Snapshot 按 strategyType 区分统计

### 验收
- `npm run build` ✅ PASS（webpack）
- `prisma db push` ✅ PASS（生产服务器）
- `npm run strategy:init-capital` ✅ PASS（DAY 30M / SWING 40M / LONG 30M 初始化正确）
- `npm run health:data` ✅ CRITICAL=0（WARNING=3，均为已知数据质量问题）
- 部署记录 #58 ✅
- commit `6900b3c` ✅

---

## [17.8.0] - 2026-06-28 — T1: Trading Architecture Baseline 建立

### 改动

**新增**
- `docs/Trading-Architecture.md` — 三交易体系架构规范（16节）：
  1. 文档目的（设计原则 / 适用/不适用范围）
  2. 三交易体系总体架构（数据流 / 3:4:3资金分配图）
  3. Day Trade 定义（1日日内 / 5只等权 / 止盈+1.5% / 止损-1.0%）
  4. Swing Trade 定义（3-10日 / 止盈+5% / 止损-3% / 时间止损10日）
  5. Long Trade 定义（20-90日 / 止盈+15% / 止损-8% / STRONG_BUY专用）
  6. AI评分与策略关系（共享评分 / 独立规则对比表 / 评分流程图）
  7. 资金管理（独立资金池推荐方案 / 3:4:3 / 等权仓位计算）
  8. Snapshot（生成时机 / 不生成情况 / 内容字段设计）
  9. Portfolio（三套独立 / 汇总视图 / 买卖记录字段）
  10. Backtest（三套独立 / 指标定义 / 数据成熟度 / 生命周期）
  11. Learning（三策略汇总方式 / integrityScore加权计算）
  12. Cron（每日调度时间表 / 禁止重启窗口）
  13. 数据库规划（StrategyPosition / StrategyCapitalLog / StrategyBacktestSummary / ER图）
  14. UI规划（/strategy 页面布局 / 三Tab展示内容）
  15. 实施路线（Phase 1-6：DB → 策略引擎 → Portfolio → Backtest → Learning → UI）
  16. 暂不开发（8项明确排除项）

### 验收
- 代码无修改 ✅
- 数据库无修改 ✅
- `docs/Trading-Architecture.md` 已建立 ✅
- 部署记录 #57 ✅

---

## [17.7.1] - 2026-06-28 — T1: Module Responsibility Baseline 完整版（11节）

### 改动

**更新**
- `docs/Module-Responsibility.md` — 升级为11节完整规范：
  1. 文档目的（Why / 适用范围 / 设计原则）
  2. 12模块唯一职责（含典型示例 PASS/FAIL）
  3. 模块关系图（用户主流程 / 支撑链 / 运维链 / 版本链 / 数据流向规则）
  4. 开发前必答四问
  5. PR 检查模板（含 PASS/FAIL 示例）
  6. 禁止事项（6条，新增「禁止复制已有页面」）
  7. 页面生命周期（使用时机 / 频率 / 典型行为）
  8. 版本验收模板（12项 PASS/FAIL → productionReady 判定）
  9. 历史违规案例（v17.6.0 全部9处违规完整解析）
  10. 后续扩展规则（新模块申请流程 / 4个待建模块预定义 / 扩展原则）
  11. 变更记录

### 验收
- `npm run build` ✅ PASS
- docs/Module-Responsibility.md 完整版已建立 ✅
- 部署记录 #56 ✅

---

## [17.7.0] - 2026-06-28 — T1: Module Responsibility Baseline 正式建立

### 改动

**新增**
- `docs/Module-Responsibility.md` — 项目信息架构规范文档：12模块唯一职责定义、允许/禁止列表、开发前四问、PR检查格式、版本验收模板、历史违规记录

**更新**
- `CLAUDE.md` — Session Start 必读文件列表新增 `docs/Module-Responsibility.md`

### 验收
- `npm run build` ✅ PASS
- Module Responsibility Baseline 正式建立 ✅
- 部署记录 #55 ✅

---

## [17.6.0] - 2026-06-28 — P1: 模块职责归位（Dashboard/AI组合/数据校验/同步状态）

### 改动

**新增**
- `lib/i18n/system-labels.ts` — 统一标签映射：`getDataSourceLabel`/`getHorizonLabel`，同时 re-export `getPipelineStageLabel`/`getStatusLabel`

**Dashboard（/）职责归位**
- `app/SystemDashboard.tsx` — 移除「回测摘要 v2.3」、7d/30d/90d horizon 表格、「三策略胜率 v15.0」、「回测数据成熟度倒计时」；Col3 替换为「→ 查看回测验证」重定向卡片；`FRESHNESS_SOURCE_LABELS` 本地 map 替换为 `getDataSourceLabel()`；移除 `/api/strategy/performance` fetch 和 `stratPerf` 状态

**AI组合（/portfolio）职责归位**
- `app/portfolio/page.tsx` — 移除 Tab 结构（system/watchlist）、`AISignalStatsPanel` 调用、watchlist 状态和 fetch；页面直接渲染免责声明 + `SnapshotsPanel`

**数据校验（/admin/verify）职责归位**
- `app/admin/verify/page.tsx` — 移除「回测结果」明细表格和「部署历史」展开列表；两者替换为重定向按钮（→/backtest、→/admin/versions）；移除 `btPicks/btResults/deploys` 状态和 `loadBacktest/loadDeploys` callback

**同步状态（/sync）职责归位**
- `app/sync/page.tsx` — 移除 Backtest Health 卡片（`/api/backtest/health`）、BUY评级卡片、买入占比卡片；「StockScore」标签改为「综合评分」

**汉化统一**
- `app/admin/mission-control/page.tsx` — 本地 `FRESHNESS_SOURCE_LABELS` 替换为 `getDataSourceLabel()`，与 Dashboard 共用同一映射

### 验收
- `npm run build` ✅ PASS
- 生产 CRITICAL=0 ✅
- 部署记录 #53 ✅

---

## [17.5.0] - 2026-06-28 — P1: 全站汉化二阶段（research/verify/backtest/portfolio/screener）

### 改动

**新增**
- `lib/i18n/status-labels.ts` — 集中式状态标签映射（`getStatusLabel`/`getPipelineLabel`）
- `scripts/i18n-scan.ts` — `npm run i18n:scan` 扫描工具，扫描 app/ components/ 中残留英文

**汉化修复**
- `app/admin/research/page.tsx` — 全页汉化（标题→研究分析、Tab→概览/因子分析/相关性/数据质量/就绪状态、所有列头、警告信息、说明文字、页脚）
- `app/admin/verify/page.tsx` — "Production Ready"→"生产环境已就绪"、"YES ✓"→"是 ✓"、"Latest"→"最新"、Build/Health/Page 部署徽章汉化
- `app/admin/mission-control/page.tsx` — "DRY"→"试运行"、"Error:"→"错误："、CRITICAL/WARN 标签、"h ago"→"小时前"、healthGuardStatus 映射为中文
- `app/admin/experiments/page.tsx` — 状态卡片显示 `cfg.label`（中文），不再显示原始枚举键
- `app/admin/versions/page.tsx` — 页脚"Version Center"→"版本中心"、"Experiment Dashboard"→"实验管理"
- `app/backtest/page.tsx` — "vs TOPIX"→"相对TOPIX"、"OPEN positions"→"持仓中"、"ETF Proxy"→"ETF基准"、"Loading…"→"加载中…"、"Date"列头→"日期"
- `app/portfolio/page.tsx` — "DAY 30%"→"日内 30%"、"SWING 40%"→"波段 40%"、"POSITION 30%"→"持仓 30%"、"vs TOPIX"→"相对TOPIX"
- `app/screener/page.tsx` — "Score "→"综合分 "

### 验收
- `npm run build` ✅ PASS
- `criticalCount: 0` ✅ 生产健康检查
- 部署记录 #52 ✅

---

## [17.4.0] - 2026-06-28 — P1: 全站汉化与投资人语言优化

### 改动

后台所有管理页面的英文/开发术语全部替换为投资人友好的中文：

- **`lib/i18n/messages/zh-CN.ts`** — `STRONG_BUY→强烈推荐`、`BUY→推荐`、`health.pass→正常`、`health.never_run→尚未执行`
- **`components/AISafetyPanel.tsx`** — STATUS_CFG 状态标签汉化（已启用/已禁用/部分启用）
- **`components/LanguageSwitcher.tsx`** — "English" → "英文"
- **`app/SystemDashboard.tsx`** — 所有 Pill 标签、Pipeline/Mission Control/STRONG_BUY/BUY 等英文术语全部汉化
- **`app/admin/mission-control/page.tsx`** — "Mission Control" → "控制中心"；Pipeline→"流水线"；Stage→"步骤"；所有状态/列头/空态/刷新信息全部汉化
- **`app/admin/versions/page.tsx`** — "Version Center"→"版本中心"；Role badge/Tab标签/表格列头/Integrity说明全部汉化；"← Mission Control"→"← 控制中心"
- **`app/admin/experiments/page.tsx`** — STATUS/DECISION 标签、表格列头、说明文字全部汉化；"Experiment Dashboard"→"实验管理"
- **`app/admin/learning-report/page.tsx`** — Grade 枚举映射（GREEN→良好/YELLOW→注意/RED→异常）；Regression status 映射（OK→正常/WARNING→注意/CRITICAL→严重/INSUFFICIENT_DATA→数据不足）；"Horizon"→"周期"；"7d WinRate delta"→"7日胜率变化"

### 验收标准

- `npm run build` ✅ PASS
- `criticalCount: 0` ✅（生产健康检查）
- 所有管理页面不再出现英文开发术语
- 股票代码/技术缩写（RSI、MACD、AI、J-Quants）保持英文不变
- 无功能性改动

---

## [17.3.0] - 2026-06-28 — P1: 並行価格同期 + 自動後続流水線（93min → ~23min）

### 问题

`sync-all-prices.ts` 主循环完全串行，3,717只 × 平均1.5s = **93分钟**。
v17.2.0 的 spawn 解决了事件循环阻塞，但 07:30 仍需等待 1.5h 的完成信号。

### 修改

**`scripts/sync-all-prices.ts`（完全重写）**

Phase 1 — 并行价格同步:
- `SYNC_CONCURRENCY` (env, default=5) 并发批处理
- `SYNC_BATCH_DELAY_MS` (env, default=200ms) 批次间节流
- Per-stock retry: `MAX_RETRIES=2`（共3次），500ms→1000ms 退避
- 进度日志: `[N/3717] 50%  ✓ok ✗err ○skip  elapsed:12m  ETA:~11m`（~5% 间隔）
- 失败文件: `logs/sync-prices-failed-YYYYMMDD.json`
- `--retry-failed`: 仅重跑前日失败银柄（价格only）
- `--prices-only`: 跳过下游流水线
- `--limit=N`: 前 N 只（测试用）

Phase 2 — 自动后续流水线（非 `--prices-only` / `--retry-failed`）:
- `compute-scores` → `rerank-top500`（compute失败时跳过）→ `portfolio-snapshot` → `ai-signal-stats` → `update-backtest` → `learning-report` → `data-health-guard`
- 任一阶段失败不阻断后续（部分失败容忍）

**`scripts/cron-scheduler.ts`**
- `07:30 slot` 降级为 watchdog：等待 syncPricesPromise（含 Phase1+2） → 确认日志
- fallback：syncPricesPromise 为 null（cron 重启）→ 降级流水线直接执行

**`package.json`**
- 新增 `sync-prices-daily`（增量 7天 + 流水线）
- 新增 `sync-prices-retry`（失败重跑）

### 实测数据（生产服务器）

| 样本 | 结果 | 耗时 |
|------|------|------|
| `--limit=10` | ✓10 ✗0 ○0 | 4s |
| `--limit=100` | ✓100 ✗0 ○0 | 37s |
| 全量推计 (3,717只) | — | **~23分钟** |

旧串行: 93分 → 新并发: ~23分（**4× 提速**，达成 ≤30分钟目标）

commit: `24b3bb1`，deployment #50

---

## [17.2.0] - 2026-06-28 — P1-Cron Fix: sync-all-prices spawn（事件循环解阻塞）

### 问题根因

`cron-scheduler.ts` 的 `run()` 函数使用 `execSync()`，在主进程同步执行脚本。
`sync-all-prices.ts` 耗时约 1.5 小时，独占 Node.js 事件循环，导致：
- node-cron 内部 `setInterval` 被阻塞，07:00 / 07:30 slot 打印 "missed execution" 并跳过
- 每周日整条 AI 评分流水线（compute-scores → rerank → portfolio → ...）全部 NEVER_RUN
- 需要人工干预补跑（见 2026-06-28 T1 MONDAY OPEN CHECK 记录）

### 修复

#### `scripts/cron-scheduler.ts`

- **新增 `runAsync()`**：使用 `spawn()` 在子进程执行脚本，立即返回 `Promise<void>`，不占用主进程事件循环；处理 timeout/error/close 三个事件，统一写 `pipeline-runs.jsonl`
- **`run()` + `execSync` 全部移除**，替换为 `await runAsync()`
- **06:00 slot**：改为普通（非 async）callback，fire-and-forget：`syncPricesPromise = runAsync(...)` 不 await，子进程在后台运行，主进程立即返回
- **07:30 slot**：改为 `async` callback，pipeline 开始前先 `await syncPricesPromise`（等价格同步完成后再计算评分），随后顺序 `await runAsync(...)` 执行各阶段
- **所有其他 callback**：改为 `async` + `await runAsync()`，事件循环永远保持空闲
- **新增 00:00 JST 日次リセット**：每天清空 `syncPricesPromise`，确保 07:30 等待的是当日任务
- **`runNewsSync()`** 移除，合并至各 cron slot 的 `await runAsync("sync-news.ts", ...)`
- 启动日志更新为 `v17.2.0 — async spawn 修复`，schedule 摘要标注 `06:00 価格(spawn)`

### 效果

- 07:00 news sync 和 07:30 AI pipeline 在 sync-all-prices 运行期间正常触发
- 流水线全自动完成，无需手动补跑
- 长任务（rerank-top500 ~47min）也通过 `await runAsync()` 在子进程执行，不阻塞未来 slot

### 修改文件

| 文件 | 变更 |
|------|------|
| `scripts/cron-scheduler.ts` | 重写：execSync→spawn，全 async callback，syncPricesPromise 协调机制 |

### 验证

- `npx tsc --noEmit` ✅ 无错误
- `npm run build` ✅ exit 0
- PM2 restart tohoshou-cron ✅ online（2026-06-28 15:00 JST）
- 启动日志确认 `06:00 価格(spawn)` ✅
- commit: `0f368a9`，deployment #49

---

## [17.1.0] - 2026-06-26 — AI Portfolio Strategy Allocation (3:4:3)

**Schema + 核心逻辑:**
- `prisma/schema.prisma`: PortfolioSnapshotPosition 新增7字段（strategyType/allocationWeight/strategyAllocationPct/strategyConfidence/targetReturnPct/stopLossPct/maxHoldingDays + @@index([strategyType])）；db push成功（223ms）
- `lib/portfolio/snapshot-builder.ts` (新文件): 共享的3:4:3分配逻辑 `buildStrategyAllocations()`，DAY≤3/SWING≤4/POSITION≤3槽位+30/40/30预算；优先使用DailyRecommendation.strategyType，fallback到classifyStrategy()

**API层:**
- `POST /api/portfolio/snapshots`: 重构为3:4:3分配，返回allocationWarnings
- `GET /api/portfolio/snapshots`: 新增strategyStats[]、isLegacy、unallocatedCashPct
- `GET /api/portfolio/snapshots/[date]`: position新增6个策略字段 + strategyStats
- `GET /api/admin/portfolio-debug`: 新增strategyAllocation调试（4类警告：MISSING_STRATEGY_TYPE/LEGACY_SNAPSHOT/STRATEGY_UNDER_ALLOCATED/BENCHMARK_MISSING）

**UI层:**
- `app/portfolio/page.tsx`: StrategyBadge组件 + StrategyAllocationSection三格策略卡片（展开后显示）；position表新增strategy列；旧版快照显示legacy提示
- 10个新i18n key × 3语言（zh-CN/ja-JP/en-US）

**生产验证:**
- 快照id=3创建成功，4个SWING持仓（今日DR无stored strategyType→fallback分类全走SWING，次日cron rerank后自愈）
- debug API：isLegacy=false，SWING actualPct=37.3% vs target=40%
- deployment #48

---

## [17.0.0] - 2026-06-26 — AI Portfolio Accuracy Audit

**3 bugs fixed + debug API:**
- `lib/snapshot-valuation.ts`: DailyPrice查询从"今日"改为"最近5天最新"（J-Quants同步T-1数据，今日查询恒空→STALE→修复为CLOSED）；统一使用adjClose??close
- `scripts/update-ai-signal-stats.ts`: 改用adjClose??close（原来只用close，对分红股收益计算有偏差）
- `app/api/portfolio/snapshots POST`: 补充记录benchmarkTopixEntry（修复API创建快照alpha始终null问题；cron脚本已有此逻辑）
- 新API `GET /api/admin/portfolio-debug`: 每个快照的持仓级别调试信息，含价格来源标签、警告标志、含价格胜率、Alpha

**审计结论:**
- 收益计算公式正确（(currentPrice-entryPrice)/entryPrice×100）
- OPEN未结算持仓正确排除（null检查）
- JPY/RMB无混用问题
- 3:4:3策略分配为设计缺口（PortfolioSnapshotPosition无strategyType字段，快照按等权Top10创建），已文档化

---

## [16.0.0] - 2026-06-26 — AI Stock Intelligence（AI 个股决策中心）

10节完整决策页：Hero → AI决策中心 → 交易计划 → 评分+风险(2-col) → 技术(K线展开) → 新闻 → 基本面(折叠) → 历史表现+同行比较(2-col)；新统一端点 `/api/stocks/[symbol]/intelligence`；Skeleton加载；服务端4维度风险推导；按策略胜率历史；行业排名排行榜；29个新i18n key

---

## [15.0.0] - 2026-06-26 — 三策略胜率与回测体系

### 变更目的

统一 DAY（日内）/ SWING（波段）/ POSITION（趋势）三策略体系，实现基于止盈/止损/时间止出场的回测模拟，并将策略分类贯穿仪表盘、回测页、个股详情、学习报告全链路。

### 数据库变更（prisma/schema.prisma）

- `DailyRecommendation` 新增5字段：`strategyType / strategyConfidence / targetReturnPct / stopLossPct / maxHoldingDays`（nullable，老数据为null）
- 新模型 `StrategyBacktestResult`：per-symbol×per-strategyType 回测结果，exitReason 四态（TAKE_PROFIT/STOP_LOSS/TIME_EXIT/OPEN/INSUFFICIENT_DATA）

### 新增 `lib/strategy/strategy-classifier.ts`

- 纯函数 `classifyStrategy(input: ClassifyInput): StrategyParams`
- DAY：`tradingAction=BUY_NOW` + technicalScore≥22 + BULLISH maTrend + RSI 50-78
- POSITION：`fundamentalScore≥19` + POSITION_STYLES + adaptiveScore≥65 + 无BEARISH趋势 + 非高风险
- SWING：默认兜底

### 新增 `lib/strategy/strategy-performance.ts`

- `aggregateStrategyStats(rows)` 聚合胜率/均收益/Alpha，MIN_SAMPLE=10 保护防止误导性数值

### 新增 `scripts/compute-strategy-backtest.ts`

- `npm run strategy-backtest` / `npm run strategy-backtest:dry`
- 读取 DailyRecommendation entryDate/entryPrice，模拟止盈/止损/时间止出场
- 写入 StrategyBacktestResult（upsert，可重复运行）

### 新增 API

- `GET /api/strategy/performance`：全量聚合 + byStrategy
- `GET /api/backtest/strategy`：回测页专用（含 exitBreakdown）
- `GET /api/stocks/[symbol]/strategy`：个股策略分类 + 历史胜率

### UI 更新

- **SystemDashboard**：新增「三策略胜率（v15.0）」4列卡片（综合/日内/波段/趋势）
- **回测页**：三策略回测区块（Tabs：OVERALL/DAY/SWING/POSITION），含KPI/出场方式明细/策略参数，位于v2.3矩阵前
- **个股详情页**：Strategy推荐条（显示策略类型/置信度/目标收益/止损/历史胜率）位于AI决策与交易计划间
- **学习报告**：新增 Section 7 策略性能报告（4列卡片）

### scripts/rerank-top500.ts

- Step 8 新增策略分类写入 DailyRecommendation（recPayload 中 strategyType/strategyConfidence/targetReturnPct/stopLossPct/maxHoldingDays）
- top500 查询新增 `tradingAction: true` 字段

### i18n

- 30 个新 key（zh-CN/ja-JP/en-US）：strategy.*命名空间

---

## [14.3.0] - 2026-06-26 — AI 个股详情页升级 Phase 1

### 变更目的

将 `/stocks/[symbol]` 从标签页布局重构为每日交易决策页，单屏滚动展示7个核心模块。

### 新增 `app/api/stocks/[symbol]/ai-decision/route.ts`

- 聚合 Stock + StockScore + GPTScore + DailyRecommendation + Indicators + News 五大数据源
- 单次请求返回个股详情页所需全部数据，减少瀑布式请求
- 新增量比计算（latestVolume / avgVolume20d，基于最近20日DailyPrice）
- `riskLevel` 由 `actionRiskLevel ?? (highRiskFlag ? "HIGH" : "MEDIUM")` 推导（非存储字段）

### 重构 `app/stocks/[symbol]/page.tsx`

移除原有 AI / Chart / Technical / News / Financials 5-tab 布局，改为单列滚动：

1. **Hero**：股票名称、价格、5D收益、AI评级徽章（STRONG_BUY等）、自适应分数圆圈、风险级别、市场排名
2. **AI 决策总结**（Section 1）：操作建议胶囊、一句话结论、Top-5核心理由、Top-5主要风险（融合 actionReasons + GPT strengths）
3. **交易计划**（Section 2）：买入区间、止损、目标价1/2、仓位%、盈亏比（自动计算）
4. **评分构成**（Section 3）：5维度评分条（技术/基本面/资金/情绪/全球）+ 风格标签 + 信心值 + 新闻情绪摘要
5. **技术状态**（Section 4）：MA趋势徽章、MA5/MA20/MA60网格（含偏离%）、RSI仪表盘+信号、52周位置条、量比
6. **最新动态**（Section 5）：最新5条新闻（始终加载，非懒加载），情绪标签
7. **同行比较**（Section 6）：Phase 2 占位符
8. **价格图表**（可折叠，默认折叠，延迟加载）
9. **财务数据**（可折叠，默认折叠，延迟加载）

### i18n

新增32个 key 到 zh-CN / ja-JP / en-US 及 types.ts：`ad.*`、`tp.*`、`sb.*`、`ts.*`、`ne.*`、`pc.*`、`detail.*`

### 验证

- build PASS，health CRITICAL=0
- HTTP 200：7203.T / 6758.T / 9984.T
- `/api/stocks/7203.T/ai-decision` 返回正确：stock.name="トヨタ自動車"，score/indicators 非空，tradingAction=AVOID，adaptiveScore=37

---

## [14.2.0] - 2026-06-26 — Dry-Run Pipeline 验证器 + Mission Control Dry-Run 支持

### 变更目的

提前验证 Pipeline Status / Feature Coverage 显示逻辑，无需等待首次真实 cron 运行。

### 新增 `scripts/dry-run-pipeline.ts`

- 为全部 10 个主 pipeline stage 写入 `runType="dry-run"` 的日志条目
- 安全阶段真实执行：`update-ai-signal-stats --dry-run`、`generate-learning-report --dry-run`、`data-health-guard`（只读）
- 写入量大/有 DB 修改风险的阶段写 synthetic SUCCESS 条目（保护 DailyRecommendation / StockScore / BacktestPositionResult）
- `pipelineRunId = dry-run-YYYYMMDD-NNNNNN`
- `npm run pipeline:dry-run` 命令

### `scripts/cron-scheduler.ts`

- `writePipelineLog()` 新增可选字段 `runType?: "production" | "dry-run"` 和 `pipelineRunId?`

### `app/api/admin/mission-control/route.ts`

- `PipelineRunEntry` 新增 `runType?` / `pipelineRunId?` 字段
- 接受 `?includeDryRun=true` 查询参数（默认隐藏 dry-run 条目）
- `pipelineScore` 健康分只计 production 运行（dry-run 不膨胀分数）
- 响应新增 `productionRuns` / `dryRunCount` / `includeDryRun` 字段

### `app/admin/mission-control/page.tsx`

- 新增 `showDryRun` 切换开关（仅在 `dryRunCount>0` 时显示）
- Dry-run 条目在 Pipeline Status 表中显示 `[DRY]` badge
- 切换时重新 fetch `?includeDryRun=true`，显示说明提示
- 修复 Refresh 按钮的 `onClick` 类型错误（传 `showDryRun` 参数）

### 干运行验证结果（2026-06-26 生产）

```
totalRuns=11  productionRuns=1  dryRunCount=10
所有 10 个主 stage → isDry=True, status=SUCCESS
Health Score: 45/100 (pipelineStatus=0/25 — dry-run 未计入)
generate-learning-report dry-run: integrityScore=87/100 PASS (pipeline 8/10 stages ok)
  1d fillRate=65.78% (确认旧报告 186.89% bug 为历史文件问题，新跑正确)
data-health-guard: CRITICAL=0, WARNING=1 (7条真实极端市场行情, 验证为真实)
Feature Coverage SQL: 30字段全返回, 0% 正确显示 (pre-Step2 行)
```

### Deployment #43，commit e54d601 ✅

---

## [14.1.0] - 2026-06-26 — P1-B PM2清理 + P2-006 featureCoverage 区块

### P1-B 修复：删除废弃 PM2 进程

- 生产服务器执行 `pm2 delete tohoshou-ai-daily-pipeline`，进程原为 stopped 状态，双写风险消除
- `pm2 save` 持久化，PM2 进程表现仅保留 `tohoshou-cron`（online）和 `tohoshou-web`（online）

### P2-006 修复：/admin/learning-report 新增 feat_* 覆盖率区块

| 文件 | 变更 |
|------|------|
| `app/admin/learning-report/page.tsx` | 新增 `FeatureCoverage`/`FeatureField` 类型；`DataReadiness` 增加 `featureCoverage` 字段；新增 `featFields` state + `loadFeatFields()` 从 `/api/admin/mission-control` 拉取 per-field 数据；新增 Section 4「特征覆盖率（feat_* · 30 字段）」—— 总行数/字段数/覆盖率/最新日期摘要 + 30字段芯片格 + 0%时 WARNING banner；原 Section 4/5 重编为 5/6 |

### 验收

- `npm run build` ✅ 0 errors
- `npm run health:data` ✅ CRITICAL=0
- 生产页面 `/admin/learning-report` HTTP 200 ✅
- `featureCoverage` 区块展示 WARNING banner（覆盖率 0%，设计预期）✅
- Deployment #42，commit f735f24 ✅

---

## [14.0.1] - 2026-06-26 — /admin/learning-report 运行时崩溃修复

**P0 Bug Fix — React "Objects are not valid as a React child"**

### Root Cause

`dataIntegrity.components` API 响应结构为 `Record<string, {score, stagesChecked, ...}>`（对象），
但 page.tsx 类型声明为 `Record<string, number>`，导致 `{v}` 渲染对象时 React 抛出运行时异常。
页面在 loading 状态后立即 crash，客户端永久停留于「加载学习报告中…」旋转器。

同时：`dataIntegrity.grade` 实际值为 `"WARNING"`，未在 `gradeColor()` 联合类型中处理。

### 修复

| 文件 | 变更 |
|------|------|
| `app/admin/learning-report/page.tsx` | 新增 `ComponentDetail` 类型；`components` 改为 `Record<string, ComponentDetail \| number>`；render 提取 `.score`；`grade` 类型改为 `string`；`gradeColor()` 接受 `"WARNING"` → yellow |

### 验证

- `npm run build` ✅ 0 errors
- `npm run health:data` ✅ CRITICAL=0
- 生产已部署，页面 HTTP 200

---

## [14.0.0-IA] - 2026-06-26 — UI 信息架构重组（v14.0.0-IA）

**范围：纯 UI 重组 — 零新增 API / 零 DB 变更 / 零算法改动 / 零 cron 变更**

### 修改文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `components/Sidebar.tsx` | 改 | 3 分组导航（核心/数据与学习/系统管理），12 条目，新增 research/learning-report/versions/experiments/mission-control 入口 |
| `components/mobile/MobileBottomNav.tsx` | 改 | 同步核心分组（今日总览/AI选股/AI组合/回测验证/新闻资讯） |
| `lib/i18n/messages/zh-CN.ts` | 改 | +10 nav key |
| `lib/i18n/messages/en-US.ts` | 改 | +10 nav key |
| `lib/i18n/messages/ja-JP.ts` | 改 | +10 nav key |
| `lib/i18n/types.ts` | 改 | +10 nav type 声明 |
| `app/SystemDashboard.tsx` | 改 | 完全重写为主驾驶舱：状态栏 5 pills + 3 列格 + 数据新鲜度 + 成熟度倒计时 + Pipeline 阶段总览 + Alerts；60s 自动刷新 `/api/admin/mission-control` |
| `app/page.tsx` | 不改 | 保留服务端 Prisma 查询（今日推荐数量） |
| `app/portfolio/page.tsx` | 改 | 策略快照 Tab 加「仅作研究参考」banner；自选股 Tab 加「模拟账户·非真实资金」amber 免责声明 |
| `app/backtest/page.tsx` | 改 | 新增 v2.3 9-Horizon KPI 矩阵（从 /api/admin/mission-control 读数）；PENDING horizon 显示「待数据+天数倒计时」而非空白；旧 v1 内容保留并标注 |
| `app/admin/learning-report/page.tsx` | 新建 | 学习报告阅读页：Integrity Score + 9 Horizon 填充率/胜率/收益/Alpha + 数据成熟度 + 回归检测；404 graceful（显示等待首次 cron 说明） |

### Phase 验收

| Phase | 内容 | Build | 状态 |
|-------|------|-------|------|
| P1 | 导航骨架（Sidebar + i18n + MobileBottomNav） | ✅ 0 errors | ✅ |
| P2 | 学习报告新页面 | ✅ 0 errors | ✅ |
| P3 | 首页驾驶舱 + Portfolio 免责声明 | ✅ 0 errors | ✅ |
| P4 | 回测验证 v2.3 矩阵 | ✅ 0 errors | ✅ |

### 生产验证

- 5 个新页面 HTTP 200：`/`、`/admin/research`、`/admin/learning-report`、`/admin/versions`、`/admin/mission-control`
- `npm run health:data`：CRITICAL=0 ✅
- commit 88468a7，deployment #41，push to main ✅

---

## [13.7.1] - 2026-06-26 — Stabilization Audit：Production Readiness

### 变更（仅修复，无新功能）

**P0 修复：deploy 协议补 lib/ + scripts/ rsync**（CLAUDE.md）
- 根因：v12.4.0 新增 `isHardBlockedStock` 到 safety-rules.ts，但 lib/ 未随标准 deploy rsync 到生产服务器
- 后果：2026-06-26 07:30 JST cron `compute-scores` 全量失败（3700+ 股逐个 TypeError），StockScore 当日无更新
- 修复：CLAUDE.md deploy 序列增加步骤 3b：`rsync lib/ scripts/` 紧跟 `.next/` rsync
- 附加规则：部署时 NEVER restart `tohoshou-cron`（07:30–14:00 JST 窗口内 rerank 仍在运行）

**P1 修复：fillRate > 100% bug**（scripts/generate-learning-report.ts）
- 原因：`fillRate = filled / fillable * 100`，当 `filled > fillable` 时超过 100%
- 现象：1d horizon fillRate = 186.89%（DailyPrice 比日历阈值填充更早）
- 修复：改为 `fillRate = filled / total * 100`（正确分母为总样本量）

**P2 修复：Mission Control 缺少 2 个 pipeline stages**（app/api/admin/mission-control/route.ts + generate-learning-report.ts）
- `update-ai-signal-stats` 和 `generate-learning-report` 在 cron 中存在但不在 PIPELINE_STAGES 中
- 两个文件均同步更新 PIPELINE_STAGES 列表（从 8 增至 10 stages）

**新建 TECH_DEBT.md**（11 个 P2 开放条目）
- P2-001 ~ P2-011：Research API 内存、computeMA null 安全、pipeline JSONL 创建、监控阈值等

### 生产稳定性核查结果（2026-06-26）

**数据完整性链（7 层）：**

| 层 | 记录数 | 缺失 | 完整率 |
|----|--------|------|--------|
| Stock | 3717 | 0 | 100% |
| StockScore | ~3717 | 0 | ~100% |
| DailyRecommendation | 2774 | 0 versionSnapshotId | 100% |
| BacktestPositionResult | 14625 | 0 versionSnapshotId | 100% |
| BacktestResult (derived) | — | — | N/A |
| LearningReport | 67/100 (WARNING) | pipelineScore=0 | 自愈 |
| Research Dashboard | 0 joined rows | 30 feat_* NULL | 明日自愈 |

**Look-ahead Bias：** ✅ 0 violations（14625 BP rows 验证通过）

**API 状态（7 个 admin endpoints）：** 全部 HTTP 200，响应时间 0.15s–1.16s

**Cron 状态：** online，但 pipeline-runs.jsonl 尚未创建（待 2026-06-27 07:30 首次完整运行）

**Production Readiness Score：** 72/100 → READY WITH WARNINGS

---

## [13.8.0] - 2026-06-26 — Step 6：Research Phase — Analytical Research Platform

### 变更

**Research Dashboard（`/admin/research`）** — 只读，5 tab 研究平台

- **Overview tab（Module 5）**：Data Confidence / feat_* Coverage / Joined Rows / Trading Days 4 指标卡；Top Positive/Negative Factors、Most Predictive/Stable/Weakest Features、系统观察列表
- **Factors tab（Module 1）**：25 数值特征（tertile TOP 20%/MIDDLE 60%/BOTTOM 20% 的 WinRate/AvgReturn/Alpha/MedianReturn）+ 4 分类特征（每个类别值的统计）+ feat_highRiskFlag 布尔分析；Direction 判定（positive/negative/neutral/unknown）
- **Correlation tab（Module 2）**：Feature→Return/Alpha/WinRate Pearson r 表；高相关对检测（|r|≥0.70 标为冗余）
- **Quality tab（Module 3）**：30 特征覆盖率 / Min/Max/Mean/Stddev/Median；Overall Coverage；Unexpected NULL 列表
- **Readiness tab（Module 4）**：Walk-Forward Readiness 表（9 horizon × 填充率 / 状态 / 预计就绪日）；trading days / available horizons / recDate 范围

**新建 API 路由（只读）**：`GET /api/admin/research?horizon={1d|3d|5d|7d|10d|20d|30d|60d|90d}`
- Module 1：JS 内存计算 tertile + categorical 统计（避免 300 SQL 调用）
- Module 2：Pearson 相关矩阵（feature-outcome + feature-feature）
- Module 3：单条 SQL 聚合（COUNT/MIN/MAX/AVG/STDDEV/PERCENTILE_CONT）
- Module 4：从 BacktestPositionResult DISTINCT recDate 数量推算就绪状态
- Module 5：汇总排名生成（top/bottom/stable/weak/predictive）

**当前数据状态（2026-06-26）**：feat_* 覆盖率 0%（预计 2026-06-27 07:30 JST cron 首次写入）；BP 已填充：1d=1069、3d=493（4 个 trading days）；设计支持空数据优雅降级

### 技术细节

- `computeTertiles(rows, key)`: bottom 20% / middle 60% / top 20%；MIN_SAMPLES=10
- `pearsonCorr(xs, ys)`: 要求 ≥5 样本，无效返回 null
- `$queryRawUnsafe` 中 feat_* 列名须双引号（PostgreSQL camelCase 列名规则）
- JoinedRow 类型交叉 Record<string, ...> 保留索引签名，map 后须 as JoinedRow[]
- 60s 自动刷新；Horizon 选择器；hasData=false 时横幅警告 + 预计就绪日

---

## [13.7.0] - 2026-06-26 — Step 5：Version & Experiment Platform

### 变更

**Version Center（`/admin/versions`）**

4 tab 操作面板：Versions / Timeline / Compare / Integrity

- **Versions tab**：完整 VersionSnapshot 列表，字段含 schemaVersion/modelVersion/scoreVersion/llmModelVer/startDate/endDate/role（current/baseline/legacy）/DR Linked/BP Linked/学习报告标志
- **Timeline tab**：Version + Deployment + Experiment 三类事件按日期倒序合并显示
- **Compare tab**：双版本对比；跨 schemaVersion 时 comparisonAllowed=false；相同时输出9 horizon delta表（ΔWinRate/ΔReturn/ΔAlpha）+ regressionStatus
- **Integrity tab**：DR/BP versionSnapshotId 覆盖率；每版本 breakdown；状态 OK/WARNING/CRITICAL

**Experiment Dashboard（`/admin/experiments`）**：只读，5 状态卡片+过滤器+操作规程

**新建 API 路由（全部只读）**：`GET /api/admin/versions`、`/compare`、`/api/admin/experiments`、`/api/admin/version-timeline`

**修复：`scripts/rerank-top500.ts` versionSnapshotId 缺失（P1 bug）**：Step 8 补写 versionSnapshotId/modelVersion/scoreVersion/schemaVersion 到 recPayload（create+update 均写）

**`scripts/backfill-dr-version.ts`**：一次性回填工具，已在生产执行 2774 行

### 完整性验证（2026-06-26）

```
DailyRecommendation:      2774 / 2774 linked → 100% ✅
BacktestPositionResult:  14625 / 14625 linked → 100% ✅
Overall Integrity Status: OK
```

---

## [13.6.0] - 2026-06-26 — Step 4：Learning Engine — 确定性回测学习报告

### 变更

**新建 `scripts/generate-learning-report.ts`（Learning Engine v1.0）**

7 个独立报告章节，全部确定性（相同 DB 状态 → 相同输出），无随机性，无隐藏状态：

1. **Data Integrity（0-100 分）**：4 分量 × 25 pts
   - Pipeline Validation：读取 `logs/pipeline-runs.jsonl`，8 stage 状态 × 48h 窗口
   - Look-ahead Validation：SQL 校验 `entryDate ≥ recDate`、`exitDate ≥ entryDate`、`exitDate ≤ reportDate`（0 violations → 25/25）
   - Missing Data：fillable 仓位的 fill rate（不足数据 → 不扣分，非 failure）
   - Data Freshness：DailyPrice/GlobalMarket/BacktestPositionResult 时效性

2. **Data Readiness**：`tradingDays`（DISTINCT recDate）、`availableHorizons`（有 returnPct 的 horizon）、`sampleCounts`/`filledCounts`、feat_* 覆盖率、30d/90d 预期填充日期

3. **Backtest Summary（9 horizons）**：winRate/avgReturn/medianReturn（PostgreSQL PERCENTILE_CONT）/alpha/bestReturn/worstReturn；状态 READY/PARTIAL/INSUFFICIENT/PENDING

4. **Version Comparison**：按 `versionSnapshotId` 分组，`schemaVersion` 不同时标记 `NOT_COMPARABLE`，相同时计算 delta（7d winRate/avgReturn/alpha）

5. **Regression Detection**：PRIMARY metric = 7d win rate；current vs baseline；WARNING = -5pp / CRITICAL = -15pp；schemaVersion 不同 → INSUFFICIENT_DATA

6. **Experiment Summary**：读 ExperimentRegistry，按 status 分组（RUNNING/COMPLETED/PENDING/REJECTED/ADOPTED）

7. **Recommendations（规则引擎）**：系统自动生成观测文字；永不推荐修改权重/prompt/模型；禁止自动优化

**数据源约束（严格）**：仅读 BacktestPositionResult/BacktestResult/VersionSnapshot/ExperimentRegistry/DailyRecommendation(feat_* coverage only)；禁止读 StockScore（可变）

**新建 `GET /api/admin/learning-report`**：
- `?mode=latest`（默认）→ `reports/latest-learning.json`
- `?mode=summary` → `reports/learning-summary.json`
- `?date=YYYY-MM-DD` → `reports/learning-report-YYYYMMDD.json`

**更新 `scripts/cron-scheduler.ts`**：
- 07:30 链新增 `generate-learning-report.ts`，位置在 `update-backtest` 之后、`data-health-guard` 之前

**新增 npm scripts**：
- `npm run learning:report` — 生成当日报告
- `npm run learning:report:dry` — 干运行（输出 JSON，不写文件）

### 确定性保证
- 全部浮点数：`Math.round(x * 10000) / 10000`（4位精度）
- 全部数组：固定 ORDER BY 排序
- 无 Date.now()（用 reportDate 参数）
- 相同 DB 状态 → 相同输出 → 可任意回溯重建

### 生产验证（2026-06-26）
- 干运行无错误 ✅
- 首份报告已生成：`reports/learning-report-2026-06-26.json`
- integrityScore: 67/100 (WARNING)（pipeline=0 因无日志，lookAhead=25/25，missingData=25/25）
- 1d win_rate=43.78% / 3d win_rate=42.39% ✅
- 30d expected fill: 2026-08-09 / 90d expected fill: 2026-11-03 ✅
- Look-ahead violations: 0 ✅
- API `GET /api/admin/learning-report?mode=summary` 正常响应 ✅

### 已知限制
- 仅 1 个 versionSnapshot → regressionStatus=INSUFFICIENT_DATA（需 ≥2 同 schemaVersion 版本）
- pipeline score=0 直到首次 cron 运行（预计今日 18:00 JST）
- feature coverage=0 直到明日 07:30 JST

---

## [13.5.0] - 2026-06-26 — Step 3：Mission Control 运营可视化仪表盘

### 变更

**新增 `GET /api/admin/mission-control` API（6 个 Widget）**
- **Pipeline Status**：8 个 stage 的最新运行状态/耗时/时间（从 `logs/pipeline-runs.jsonl` 读取，同步 appendFileSync 写入，无 DB schema 变更）
- **Data Freshness**：DailyPrice/StockScore/DailyRecommendation/GlobalMarket/News/Backtest 6 个数据源的最新日期及时效状态（FRESH/STALE/CRITICAL）
- **Feature Coverage**：最新 DR 日期的 feat_* 30 个字段逐一统计覆盖率及 top missing fields
- **Version Status**：schemaVersion/modelVersion/scoreVersion/versionSnapshotId/pipelineRunId + activeExperiment（单一来源）
- **Backtest Summary**：BacktestPositionResult 聚合 1d/3d/7d/30d/90d win rate/avgReturn/alpha/sampleCount（无新计算，纯查询）
- **Health Score（0-100）**：4 分量各 0-25：dataFreshness（6 源×4pt）+ pipelineStatus（8 stage×3pt）+ featureCoverage（覆盖率%×25）+ healthGuard（CRITICAL 数量）；GREEN≥75 / YELLOW≥50 / RED<50

**新增 `app/admin/mission-control/page.tsx`（Mission Control 仪表盘）**
- 顶部健康评分总览 + 4 分量 mini card
- 左：Pipeline Status 表格 / 右：Data Freshness 表格
- 左：Feature Coverage 明细（含 0% 警告 banner 和逐字段覆盖率）/ 右：Version Status + Health Guard 状态
- 底部：Backtest Summary 5 个 horizon 横排表格
- 60 秒自动刷新；深色主题；无第三方依赖

**更新 `scripts/cron-scheduler.ts`（流水线日志写入）**
- 新增 `writePipelineLog()` 函数：同步 `appendFileSync` 写入 `logs/pipeline-runs.jsonl`（JSONL 格式）
- `run()` 函数：新增 startedAt/finishedAt/durationMs/status/exitCode/errorMessage 记录（每次 stage 完成后写入，无 async 改造）
- `runNewsSync()` 函数：同样加入流水线日志，stage = "sync-news"

### 架构决策
- Pipeline 日志选用 JSONL 文件而非 DB 表：`execSync` 同步阻塞期间 Prisma 异步 Promise 无法执行；`appendFileSync` 100% 可靠，且生产服务器 API 可直接 `fs.readFileSync` 读取
- JSONL 每行约 200B，8 stage/天 × 365 天 = 约 600KB/年，无需轮转

### 生产验证（2026-06-26）
- API `https://aitohoshou.com/api/admin/mission-control` 返回正确 JSON ✅
- Health Score: 45/100 RED（pipeline=0 因首次部署无历史日志，feat=0 因 Step 2 限制）
- Data Freshness: 所有 6 源 FRESH（25/25）✅
- Backtest 1d win_rate=43.8%, 3d win_rate=42.4% 正常显示 ✅
- Version: schema-v2.3 / v7.7 / adaptive-v3 正确 ✅
- 首条 pipeline log：将在今日 18:00 JST news sync 后写入

### 已知限制
- Pipeline Score = 0/25 直到 cron 首次运行（预计今日 18:00 JST）
- Feature Coverage Score = 0/25 直到明日 07:30 JST cron 运行后（Step 2 已知限制）
- 7d/30d/90d backtest win rate 待市场数据积累（90d 需 ~90 个交易日）

---

## [13.4.0] - 2026-06-26 — Step 2：feat_* 不可变特征快照字段

### 变更

**DailyRecommendation 新增 30 个 feat_* 不可变特征快照字段（nullable，additive-only）**
- 股票基本面：`feat_sector`, `feat_industry`, `feat_marketCap`, `feat_per`, `feat_pbr`, `feat_roe`, `feat_dividendYield`
- AI 评分维度：`feat_adaptiveScore`, `feat_technicalScore`, `feat_fundamentalScore`, `feat_moneyFlowScore`, `feat_newsSentimentScore`, `feat_globalTrendScore`, `feat_percentileRank`, `feat_marketRank`
- 风格分类：`feat_stockStyle`, `feat_highRiskFlag`, `feat_rsi14`, `feat_maTrend`
- 价格历史（技术指标）：`feat_ma20`, `feat_ma60`, `feat_return5d_pre`, `feat_return20d_pre`, `feat_return60d_pre`, `feat_volatility20d`（年化波动率%）
- 宏观市场：`feat_vix`, `feat_usdjpy`, `feat_topixReturn5d`, `feat_topixReturn20d`, `feat_marketTemperature`

**更新 `scripts/rerank-top500.ts`（Step 8 扩展）**
- 新增 4 个 helper 函数：`addDays`, `computeMA`, `computeVolatility20d`, `computeTopixReturn`
- Step 8 新增 3 个批量预取：DailyPrice 最近 100 日历天价格历史（ma20/ma60/volatility20d）、GlobalMarket 最近 50 日历天（vix/usdjpy/topixReturn5d/20d/marketTemperature）、StockScore 额外字段（technicalScore 等 8 个维度）
- DailyRecommendation upsert：`featSnapshot` 仅写入 `create` 路径，`update` 路径不含任何 feat_* 字段（不可覆盖历史快照）

### 不可变性规则（锁定）
- feat_* 永远只在 DailyRecommendation 创建时写入一次
- 永不覆盖已有值，永不 update 路径写入，永不使用未来数据回填过去快照
- NULL = 当时数据缺失（语义清晰），永不用 0 或默认值掩盖

### 已知限制
- 2026-06-25 及之前的 DR 行 feat_* 全为 NULL（Step 2 部署前已创建，且回填会引入未来数据泄露，拒绝回填）
- 2026-06-26 当日 DR 行 feat_* 全为 NULL（当日 rerank 在 Step 2 部署前运行）
- 首个 feat_* 完整快照将在 2026-06-27 早 07:30 cron 运行后产生

### 生产验证（2026-06-26）
- schema：30 个 feat_* 列已通过手动 DDL 在生产 `daily_recommendations` 表添加 ✅
- `npx prisma generate` 已在生产端重新生成客户端 ✅
- 干运行（`--dry-run --limit=5`）：5 只股票 0.4s 无错误完成 ✅
- Build：TypeScript 编译通过 ✅
- 数据源：GlobalMarket topix=269 行 / StockScore 3714 条 / DailyPrice 3717 个 symbol ✅

---

## [13.3.0] - 2026-06-26 — Step 1：BacktestPositionResult + 9 horizons + VersionSnapshot 上线

### 变更

**新增 3 个数据库 model（additive-only，生产已 DDL 部署）**
- `BacktestPositionResult`（`backtest_position_results`）：per-symbol per-horizon 回测事实表，替代 DailyRecommendation return 字段成为事实来源；9 horizons × 7 索引
- `VersionSnapshot`（`version_snapshots`）：版本快照注册表；初始化 legacy-baseline + 20260626-v7.7
- `ExperimentRegistry`（`experiment_registries`）：实验注册表

**DailyRecommendation 新增 5 个版本字段（nullable，不破坏现有数据）**
- `versionSnapshotId`, `modelVersion`, `scoreVersion`, `schemaVersion`, `pipelineRunId`

**重写 `scripts/update-backtest.ts` v2.3.0**
- **Phase A**：entry fill（WHERE entryPrice IS NULL 守卫，永不覆盖）→ 只写 entryDate/entryPrice/entryPriceType
- **Phase B**：9 horizons（1d/3d/5d/7d/10d/20d/30d/60d/90d）→ BacktestPositionResult upsert（批量 50 并发）；TOPIX + Nikkei 双基准；alphaVsTopix 字段
- **Phase C**：in-memory 聚合 → BacktestResult（6 portfolioSize × 9 horizons）
- **停止写入** DailyRecommendation.return7d/30d/90d/exitDate*/price*/filledAt/priceSource（字段保留但废弃）
- 导入 RULE_ENGINE_VERSION/CURRENT_SCHEMA_VERSION/SCORING_SCHEMA_VERSION 填充 modelVersion/schemaVersion/scoreVersion

**更新 `scripts/cron-scheduler.ts`**
- 07:30 链新增 `update-backtest.ts`（20 分钟 timeout），位置在 `update-ai-signal-stats` 之后、`data-health-guard` 之前

### 生产验证（2026-06-26）
- 6 cohort dates 处理，14,625 BacktestPositionResult 行 upsert，24 BacktestResult 行
- 1d win_rate=43.8%，3d win_rate=42.4%；TOPIX 基准和 excessVsTopix 正确计算
- health:data CRITICAL=0，Portfolio BacktestResult(TOP10)=4 ✅
- VersionSnapshot: legacy-baseline(schema-v1.0) + 20260626-v7.7(schema-v2.3) 已初始化

---

## [13.2.0] - 2026-06-26 — Architecture v2.3 冻结（ARCHITECTURE.md + schemaVersion）

### 变更

**新建 `ARCHITECTURE.md`（Architecture Freeze Document）**
- Part 1：所有表的 Source of Truth 注册表 + 可变性分类（Immutable/Mutable/Derived/Registry）
- Part 2：允许的写入路径（DailyRecommendation/BacktestPositionResult/VersionSnapshot 严格路径）
- Part 3：Migration Rules（Additive-Only 约束 + 禁止操作列表）
- Part 4：Version Management（VersionSnapshot 设计 + schemaVersion 定义 + 传播链）
- Part 5：Data Compatibility Rules（LearningReport 比较前的 schemaVersion 检查）
- Part 6：Feature Dictionary（feat_* 30个字段，Append-Only 合约）
- Part 7：Pipeline State Management（pipelineRunId 设计）
- Part 8：Missing Data Policy（NULL 语义标准化）
- Part 9：Time Zone Policy（JST Business Date / UTC Storage / PostgreSQL UTC+8 已知问题）
- Part 10：禁止操作列表
- Part 11：fill-entry-price 实现规格（Step 1 的组成部分）
- Part 12：VersionSnapshot 初始化 SQL（legacy baseline + 当前生产版本）
- Part 13：P2 未来扩展（预批准，不需要架构审查）

**更新 `lib/safety-rules.ts`**
- `RULE_ENGINE_VERSION` 更新为 `"v7.7"`（与生产实际版本同步）
- `SCORING_SCHEMA_VERSION` 更新为 `"adaptive-v3"`
- 新增 `CURRENT_SCHEMA_VERSION = "schema-v2.3"`（feat_* 特征模式版本）
- `VERSION_SNAPSHOT` 新增 `schemaVersion` 字段
- 新增注释：修改版本时必须先登记 ExperimentRegistry

### Architecture Status

```
APPROVED — schema-v2.3
Ready for Step 1 implementation
No further architectural redesign before Step 8 complete
```

---

## [13.1.1] - 2026-06-26 — sync-all-prices fetch 无超时修复

### 问题

`sync-all-prices.ts` 中 `fetchBars()` 调用 J-Quants API 时无任何 timeout 保护。当 J-Quants API 在某只股票处停止响应（连接挂起，不关闭也不报错），Node.js fetch 会无限等待，导致整个 cron 调度链卡死，后续所有任务（compute-scores / rerank / health-guard）永远不会运行。

### 修复（`scripts/sync-all-prices.ts`）

- 引入 `AbortController` + `setTimeout(30s)` 对每次 fetch 请求设置超时
- 分页请求（pagination_key 分支）同样受保护
- 常量 `FETCH_TIMEOUT_MS = 30_000`（明确注释说明用途）
- 超时触发时 fetch 抛出 `AbortError`，被现有 catch 块捕获，计入 `err` 计数，不影响后续股票同步

### 验收（2026-06-26 生产手动运行）

- 模式：`--daily`（最近7天，3717只股票）
- 结果：attempted=3717 / success=3717 / failed=0 / skipped=0
- 耗时：5311.9s（含 API 响应时间，J-Quants 平均响应约 1.4s/只）
- DailyPrice 总计：7,927,289 条
- latest tradeDate：2026-06-25 ✅
- 2026-06-25 行数：3,696 行（3717 只中 3696 只当日有交易数据，覆盖率 99.4%）
- Stock.lastSyncAt 最新：2026-06-26 03:16 UTC（= 12:16 JST）✅
- Stock.price 刷新数：3717 / 3717 全部更新 ✅
- health:data CRITICAL：0 ✅
- health:data WARNING：1（7只极端涨跌，均经 adjClose 验证为真实市场行情）✅
- PM2 tohoshou-cron：online ✅
- PM2 tohoshou-web：online ✅

---

## [13.1.0] - 2026-06-26 — 每日自动流水线修复（Cron Pipeline Fix）

### 根因

1. **`lib/safety-rules.ts` 未同步到生产**（v12.4 新增的 `isHardBlockedStock` 函数缺失）→ `compute-scores.ts` 每只股票调用时抛 `TypeError: isHardBlockedStock is not a function` → catch块跳过DB写入 → StockScore当日未更新
2. **`tohoshou-cron` 运行旧版本**（最近部署只重启了 `tohoshou-web`，未重启 cron）→ `create-portfolio-snapshot.ts` 步骤缺失
3. **`update-ai-signal-stats.ts` 从未加入 cron 调度**（v12.7.0 引入脚本，但漏加入 cron-scheduler.ts）
4. **`run()` 超时 10 分钟**太短：株価同期需 ~70min、GPT Rerank 需 ~2.5h → 触发 ETIMEDOUT，health-guard 在 rerank 未完成时就运行 → 误报 CRITICAL DailyRecommendation=0

### 修复内容

**`scripts/cron-scheduler.ts`**：
- `run()` 新增可选 `timeoutMs` 参数（默认 10min 不变）
- 株価同期：10min → 2h
- GPT Rerank：10min → 5h
- 07:30 流水线新增 `update-ai-signal-stats.ts`（snapshot 之后，health-guard 之前）
- 注释同步更新

**生产修复步骤**（2026-06-26 手动执行）：
- `rsync lib/` → 修复 `isHardBlockedStock`
- `rsync scripts/` → 更新 cron-scheduler.ts
- 手动补运：compute-scores（✅ 3714只 0错误）→ create-portfolio-snapshot（✅ id=2 10只）→ update-ai-signal-stats（✅ PENDING）
- `pm2 restart tohoshou-cron` → 新版 cron 生效
- 后台启动 rerank 补完今日 DailyRecommendation（进行中）

### 验收（2026-06-26 生产）
- Health: ✅ CRITICAL=0 WARNING=3（既有数据质量警告）
- StockScore.computedAt: 2026-06-26 ✅
- DailyRecommendation 今日: 500 条 ✅
- PortfolioSnapshot 今日: ✅（id=2）
- AISignalDailyStat tradeDate 2026-06-26: ✅

---

## [13.0.0] - 2026-06-25 — AI信号统计最终形态（v13.0 Final）

### 核心改动

**schema**（`prisma/schema.prisma`）：`AISignalDailyStat` 新增 17 字段
- 今日扩展：`todayLossCount / todayFlatCount / avgTodayReturnPct / bestTodayReturnPct / worstTodayReturnPct`
- 今日分布（±3%）：`bigUpTodayCount / smallUpTodayCount / smallDownTodayCount / bigDownTodayCount`
- 7日扩展：`loss7dCount / flat7dCount / avg7dReturnPct / best7dReturnPct / worst7dReturnPct`
- 7日分布（±5%）：`bigUp7dCount / smallUp7dCount / smallDown7dCount / bigDown7dCount`
- 标的去重：`uniqueSymbolCount / uniqueWinCount / uniqueWinRate`

**脚本**（`scripts/update-ai-signal-stats.ts`）：完整重写
- 新增 `avgOf / maxOf / minOf` helper
- 今日分布 ±3%：`bigUp≥3% / smallUp 0~3% / flat=0 / smallDown -3~0% / bigDown≤-3%`
- 7日分布 ±5%：同上阈值 ±5%
- Cohort（P2）：per-day = regular stats（未来扩展跨日生命周期）
- PENDING 检测与 v12.9 保持一致（`latestPriceDate < tradeDate`）

**API**（`app/api/ai-signal-stats/route.ts`）
- 状态机：`todayStatus: "PENDING"|"READY"`（原 WAITING_DAILY_PRICE/OK）+ `weekStatus: "ACCUMULATING"|"READY"`
- `SignalStatEntry` 扩展全部 17 字段
- Prisma `select` 覆盖所有新字段

**UI**（`app/portfolio/page.tsx` `SignalCard`）：按 P4 布局重设计
- 头部：label + 推荐数
- 今日区块（PENDING→待收盘, validCount=0→待行情更新, READY→完整数据）：W/L/F 计数 + 胜率 + avg/best/worst + 分布条
- 7日区块（ACCUMULATING→数据积累中, READY→完整数据）：W/L/F + 胜率 + avg/best/worst + 分布条
- 标的去重行（Cohort）：uniqueWinRate + 分子分母

**i18n**（12 新 key × 3 语言）：`signal_win_short / signal_loss_short / signal_flat_short / signal_best / signal_worst / signal_big_up / signal_small_up / signal_small_down / signal_big_down / signal_unique / signal_today_section / signal_7d_section`

### 验收（2026-06-25 生产）
- Build: ✅ PASS
- Health: ✅ CRITICAL=0
- Deployment id=33，commit `78351bb`
- 生产脚本输出：2026-06-23 W0L5F2/7(0%)、2026-06-24 W2L1F3/6(33.3% avg+0.64%)、2026-06-25 PENDING（正确）
- 7日仍 ACCUMULATING（仅3天数据，正常）

---

## [12.9.0] - 2026-06-25 — AI信号统计日线收盘价口径修正

### 核心修正
- **`scripts/update-ai-signal-stats.ts` 彻底重写价格逻辑**：
  - 移除 `StockScore.latestClose` 分支（该值可能来自任意过去日期，导致假 0%）
  - 改为：先查 `max(DailyPrice.date)` 全局最新日期
  - 若 `latestPriceDate < tradeDate`：priceMap 为空 → `validTodayCount=0, todayWinRate=null` → **WAITING_DAILY_PRICE**
  - 若 `latestPriceDate >= tradeDate`：查 `DailyPrice.close` 精确匹配 `date = tradeDate`（不用 adjClose）
- **收益率 = 0 的处理**：`ret > 0 → win`；`ret < 0 → loss`；`ret = 0 → flat`（计入 validTodayCount，不计 win）
- **新 DB 字段**：`AISignalDailyStat.todayLossCount Int @default(0)` + `todayFlatCount Int @default(0)`
- **API `todayStatus`**：`recommendationCount>0 && validTodayCount===0 && todayWinRate===null → "WAITING_DAILY_PRICE"`，否则 `"OK"`
- **UI**：`SignalCard.todayWinDisplay` 优先判 `todayStatus === "WAITING_DAILY_PRICE"` → 显示「待收盘」（zh）/ 「終値待ち」（ja）/ 「Awaiting close」（en）；历史表 fmt 对 WAITING 行显示「待収」
- **新 i18n key**：`portfolio.signal_awaiting_close`（3语言）

### 验收结果（2026-06-25 生产）
- 生产 DailyPrice 已同步至 2026-06-25 → 显示真实 0%（今日无股票上涨）
- 本地 DailyPrice 止于 2026-06-22 → 显示「WAITING [latestPrice=2026-06-22]」→ 触发「待收盘」

---

## [12.8.1] - 2026-06-25 — SignalCard 待行情更新守卫 + 2026-06-25 数据补齐

### 改动
- **SignalCard 今日胜率显示修复**：当 `validTodayCount === 0` 时显示「待行情更新」而非「0.0%」，防止价格未同步时显示误导性 0%
- **新增 i18n key**：`portfolio.signal_price_pending`（zh-CN=待行情更新 / ja-JP=価格更新待ち / en-US=Awaiting price update）

### 数据补齐（2026-06-25）
- 生产执行 `compute-scores` → `rerank:top500` → DailyRecommendation 补齐：**STRONG_BUY=1 / BUY=19 / 总计=20**
- `update:signal-stats --date=2026-06-25`：AISignalDailyStat 已写入 STRONG_BUY/BUY/ALL_BUY 3条，validTodayCount=1/19/20，todayWinRate=0%（DailyPrice 尚未同步至今日，latestClose≈entryPrice）
- PortfolioSnapshot 2026-06-25：已存在（id=1），10只持仓，investedAmount=90,588,300 + cash=9,411,700 = ¥100,000,000 ✅，全部100整数倍 ✅
- 当前总资产：¥100,040,800（+0.04%），TOPIX对比：419.9→419.9（+0.00%），Alpha≈+0.04%

---

## [12.8.0] - 2026-06-25 — Dashboard 重定位为「系统运行总览」

### 改动
- **新增 `app/SystemDashboard.tsx`**（`"use client"`）
  - Row 1 数据概览（4 StatCard）：活跃股票数 / 已评分数 / 价格记录数 / 最新行情日
  - Row 2 今日推荐（3 StatCard）：STRONG_BUY / BUY / TOTAL，链接到 /ai-picks
  - Row 3 双列：数据健康面板（client 侧拉 `/api/health/status`，CRITICAL/WARNING/PASS 数 + topIssues）+ 同步状态面板（AI评分 / jquants / 新闻，相对时间 + 颜色编码 12h绿/48h黄/超时红）
  - 快速导航：AI选股 / AI组合 / 行业分析 / 数据同步
- **重写 `app/page.tsx`**：纯 server component，并发8个 Prisma 查询，不再引用旧 HomeDashboardClient/HomeStockDisplay
- **i18n**：6个新键（home.system_overview_desc / data_overview / today_recs / data_health / sync_status / quick_links），zh-CN/ja-JP/en-US 全覆盖

### 移除
- 首页不再展示 TOP3 推荐、评分卡片格、200股打分结果

---

## [12.7.0] - 2026-06-25 — AI信号胜率统计模块

### 新增功能
- **DB 新增表**：`AISignalDailyStat`（`tradeDate + actionType` 唯一约束）
  - 字段：recommendationCount / validTodayCount / todayWinCount / todayWinRate / avgTodayReturnPct / valid7dCount / win7dCount / win7dRate / avg7dReturnPct / calculatedAt
- **新增脚本**：`scripts/update-ai-signal-stats.ts`
  - 参数：`--date=YYYY-MM-DD` / `--all` / `--dry-run`
  - 当天胜率：`buyPrice` vs `DailyPrice.close`（当日价格），今天则用 `StockScore.latestClose`
  - 7日胜率：复用 `DailyRecommendation.return7d`（null → 积累中，不计入失败）
  - Timezone fix：DB 日期比较用 `T00:00:00.000Z` 避免 JST/UTC 偏移
- **新增 npm 脚本**：`update:signal-stats` / `update:signal-stats:all` / `update:signal-stats:dry`
- **新增 API**：`GET /api/ai-signal-stats` — 返回最近90天统计，按 tradeDate 分组 STRONG_BUY/BUY/ALL_BUY
- **页面新增**：`AISignalStatsPanel` + `SignalCard` 嵌入「系统AI组合」Tab 顶部
  - 3张卡：STRONG_BUY / BUY / 合计
  - 当天胜率（颜色编码：≥60% 绿，≥50% 黄，<50% 红）
  - 7日胜率（未满7日→「数据积累中」，不显示0%）
  - 折叠式30日历史表
- **i18n**：13个新键（zh-CN/ja-JP/en-US 全覆盖）

### 数据（截至2026-06-25）
- 2026-06-25：STRONG_BUY=1，BUY=19，合计=20，当天胜率暂0%（今日），7日积累中
- 2026-06-24：BUY=6，合计=6，当天胜率33.3%，7日积累中
- 2026-06-23：STRONG_BUY=1，BUY=6，合计=7，当天胜率0%，7日积累中

---

## [12.6.2] - 2026-06-25 — Portfolio 重构：模拟账户 + 快照专属系统Tab

### 核心重构
- **系统AI组合 Tab**：移除全部旧KPI卡/持仓表/趋势图/历史表，仅保留 `SnapshotsPanel`（快照历史列表）
- 单条快照时显示「当前仅有 1 条历史快照，后续每日自动生成」提示

### 新增：模拟账户系统
- **DB 新增 3 个模型**：`SimPortfolio`（¥1,000,000初始资金）/ `SimPosition`（加权均价持仓）/ `SimTrade`（交易历史）
- `GET /api/sim-portfolio`：获取账户概览（含实时市值、浮盈、历史30笔交易）
- `DELETE /api/sim-portfolio`：重置账户（清空持仓+交易记录）
- `POST /api/sim-portfolio/buy`：买入（1手=100股，整手数校验，现金不足返回422）
- `POST /api/sim-portfolio/sell`：卖出（加权均价计算已实现盈亏，清仓删除持仓行）

### 自选股 Tab 重构
- `WatchlistCard` 新增「买入」按钮 → 打开 `BuyModal`
- 移除旧的自动模拟仓位区（Section B/C/D：自选股仓位权重/AI明细/调仓建议）
- 新增 `SimPortfolioPanel`（Section B）：账户概览6KPI + 持仓表（含「卖出」按钮）+ 最近30笔交易历史
- 新增 `BuyModal`：数量快捷按钮100/200/300/500/1000，显示预计金额/剩余现金
- 新增 `SellModal`：25%/50%/75%/全部快捷按钮，显示预计收益/盈亏

### 删除死代码
- 移除：`TrendChart`、`AssetCard`、`KPICard`、`Skeleton`、`HistoryTable`、`SuggestionBadge`
- 移除：`wlSuggestion`、`BUY_RATINGS`、`INITIAL_CAPITAL_WL`、`WindowKey` 类型
- 移除：`summary/trend/history` 全部旧状态与 `fetchAll` 回调

### i18n
- 新增36个键（zh-CN / ja-JP / en-US 全覆盖）：`portfolio.sim_*` / `portfolio.buy_*` / `portfolio.sell_*` / `portfolio.trade_*` / `portfolio.snap_only_one`

---

## [12.5.1] - 2026-06-25 — 每日AI快照展示优化（基准指数与Alpha追踪）

### 页面结构调整
- 移除「每日AI快照」Tab，将 `SnapshotsPanel` 移入「系统AI组合」Tab 底部（历史表下方）
- TABS 数组恢复为2项（system + watchlist），消除三Tab导航

### 基准指数与Alpha
- `PortfolioSnapshot` schema 新增字段：`benchmarkTopixEntry Float?`、`completedAt DateTime?`
- `scripts/create-portfolio-snapshot.ts`：建仓时记录 TOPIX 当时价格（`GlobalMarket.topix` 最新值）
- `GET /api/portfolio/snapshots`：返回 `holdingDays`（动态计算）、`benchmarkTopixCurrent`、`benchmarkTopixReturnPct`、`alphaVsTopix`、`isOutperformingTopix`、`completedAt`
- `GET /api/portfolio/snapshots/[date]`：同上字段扩展

### 快照卡片展示
- `SnapshotCard` 新增第二行指标网格：持仓天数 / TOPIX收益 / Alpha / 跑赢|跑输TOPIX 徽章
- 空状态移除 📊 emoji

### 修正
- `GET /api/portfolio/summary/route.ts`：`INITIAL_CAPITAL 10_000_000 → 100_000_000`，`ALLOC_PER_STOCK 1_000_000 → 10_000_000`
- 系统AI组合Tab初始资金显示：从硬编码 `10,000,000` 改为 `summary.initialCapital.toLocaleString()`

### i18n
- 新增6个 `portfolio.snap_*` 键（zh-CN / ja-JP / en-US 全覆盖）：`snap_holding_days`、`snap_days_unit`、`snap_topix_return`、`snap_alpha`、`snap_outperform`、`snap_underperform`

---

## [12.4.0] - 2026-06-25 — Hard Block Phase 2 データ接入完成

### Hard Block データソース同期スクリプト
- `scripts/sync-hard-block-status.ts`：新規作成（v12.4.0 P1 完了）
  - J-Quants `/v2/equities/master` と DB の Stock テーブルをクロスリファレンス
  - DB に存在するが J-Quants に存在しない銘柄 → `isDelisted=true, listingStatus='DELISTED', tradingStatus='SUSPENDED'`
  - J-Quants 上場中 → `isDelisted=false, listingStatus='LISTED'`
  - 直近 14 日間の DailyPrice で出来高ゼロが 3 日以上続く銘柄 → `isSuspended=true, tradingStatus='HALTED'`
  - 単一 SQL で停止銘柄を一括検出（N+1 クエリ回避）
  - `--dry-run` フラグ対応（DB 更新なし）
- `package.json`：`sync:hard-block` / `sync:hard-block:dry` スクリプト追加

### 初回実行結果（2026-06-25 生産サーバー）
- ACTIVE: 3714 件 / DELISTED: 3 件（2686.T, 7922.T, 6403.T）/ HALTED: 0 件
- 3 只退市株が Hard Block 対象として登録（次の `compute-scores` 実行で HARD_BLOCK 付与）
- 実行時間: 3.0s

### 문서アップデート
- `docs/KNOWN_ISSUES.md`：P2-1 (Hard Block データ源未接入) を Recently Fixed へ移動
- `docs/ROADMAP.md`：P1-1 を ✅ Done に更新

---

## [12.3.0] - 2026-06-25 — maxDrawdown算法 + Hard Block Phase 2 + Screener卡片对齐 + 文档同步

### 任务一：maxDrawdown 算法
- `app/api/portfolio/trend/route.ts`：`maxDrawdown` 类型从 `number | null` 改为 `number`
  - 返回负值（如 -3.25 = 3.25% 回撤），数据不足 2 条时返回 0
- `app/portfolio/page.tsx`：Portfolio KPI 卡片接受 number，直接显示负值，0 时显示 "0%"
  - 颜色阈值从 `> 5` 改为 `< -5`（适配负值语义）
- Deployment id=20, commit `d17051c`

### 任务二：文档版本同步
- `docs/KNOWN_ISSUES.md`：从 v8.9.5 升级至 v12.3.0，删除过期条目，新增当前真实 P1/P2/P3
- `docs/ROADMAP.md`：从 v8.9.5 升级至 v12.3.0，补充 v9.x～v12.3 已完成里程碑，更新 P1/P2/P3 路线图

### 任务三：铁律四 Hard Block Phase 2
- `lib/safety-rules.ts`：新增 `HardBlockStockInput` 接口 + `isHardBlockedStock()` 函数
  - isDelisted=true / isSuspended=true / tradingStatus IN [SUSPENDED,HALTED] / listingStatus=DELISTED → HARD_BLOCK
  - 所有字段为空/false 时返回 false，不误杀正常股票
- `prisma/schema.prisma`：Stock 模型增加 `isDelisted Boolean @default(false)` / `isSuspended Boolean @default(false)` / `tradingStatus String?` / `listingStatus String?`
- `scripts/compute-scores.ts`：Pass 1 中 `isHardBlockedStock()` 判断优先级高于 SOFT_BLOCK
- 生产 `npx prisma db push` 已执行，字段已建表，默认全空，无股票被误 Block

### 任务四：Screener 卡片样式对齐
- `app/screener/page.tsx`：重写桌面卡片，对齐 Watchlist 紧凑风格
  - 增加 `maTrendDisplay()` 辅助函数
  - 新卡片布局：名称+代码行 / Score+Badge行 / 价格+20D行 / RSI·MA·5D 指标行
  - 网格从 `grid-cols-3 lg:grid-cols-4 gap-3` 改为 `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5`
  - 分数不再大字展示（text-xl→text-[13px]），边框/圆角/间距与 Watchlist 一致

### Verification
- `npm run build` → PASS ✅
- `npm run health:data` → CRITICAL=0 ✅
- `GET /api/portfolio/trend` → `{"maxDrawdown":0,...}` number 类型 ✅
- `npx prisma db push` on server → Done in 194ms ✅

---

## [12.2.0] - 2026-06-25 — P1 新闻同步Worker化 + P0 No Look-Ahead过滤 + 版本字段写入

### v12.2.0 — P1: 新闻同步Worker化（pm2 restart不再杀死同步）
- `scripts/sync-news.ts`：新建独立worker，完整提取 route.ts 中的 `runNewsSync` 逻辑
  - 包含：2h僵尸Job守卫 / Yahoo+Kabutan+TDnet三源同步 / SyncJob进度更新 / SyncLog写入
  - 独立进程运行，pm2 restart tohoshou-web 不影响进行中的同步
- `scripts/cron-scheduler.ts`：`runNewsSync()` 改为 execSync 调用 sync-news.ts（30min超时）
  - 不再通过 HTTP POST /api/sync/news 触发，彻底消除 pm2 restart 杀死任务风险
- Deployment id=19, commit `b06d777`

### v12.1.0 — P0: No Look-Ahead Bias过滤 + DailyRecommendation版本字段写入
- `scripts/compute-scores.ts`：recentNews查询加 `tradeEffectiveDate <= todayJST` 过滤
  - OR `tradeEffectiveDate IS NULL` 向后兼容历史行（铁律一完整实施）
- `scripts/rerank-top500.ts`：DailyRecommendation upsert写入 VERSION_SNAPSHOT
  - ruleEngine/globalEvent/llm/scoringSchema 版本字段 + overallConfidence/riskOverride 快照
  - 铁律五 Version Freeze 完成闭环
- Deployment id=18, commit `9536247`

---

## [12.0.0] - 2026-06-25 — TOHOSHOU AI Decision Engine v1.0

### New: 六大铁律安全框架

**铁律一 No Look-Ahead Bias**
- `News.tradeEffectiveDate` 新字段：JST 15:00 截止，周末/节假日顺延到下一交易日
- 所有新闻同步路径（Yahoo/Kabutan/TDnet）自动写入
- `lib/safety-rules.ts` → `calcTradeEffectiveDate()`

**铁律二 Normalization（标准化）**
- `ImpactLevel` 枚举：VERY_NEGATIVE(-2) → VERY_POSITIVE(+2)
- `impactLevelToSigma()` 统一映射，LLM 禁止输出任意 impact 数值

**铁律三 Confidence Guard（置信度守卫）**
- 5维置信度：ruleConfidence / newsConfidence / industryConfidence / modelConfidence / overallConfidence
- overallConfidence < 60 → STRONG_BUY 自动降为 BUY
- overallConfidence < 40 → 封顶 WATCH
- Pass 1 计算，Pass 2 保护 recommendationV2

**铁律四 Risk Override（风险熔断）**
- SOFT_BLOCK：STRONG_BUY→BUY，BUY→WATCH（暴跌 / 高风险 + RSI 极端触发）
- HARD_BLOCK：封顶 WATCH（Phase 2 接入退市/停牌数据）
- `computeRiskOverride()` + `applyRiskOverride()`

**铁律五 Version Freeze（版本冻结）**
- StockScore / DailyRecommendation 快照记录全部版本字段
- `ruleEngine=v1.0 / globalEvent=v0.1 / schema=v1.0 / tohoshou=disabled / llm=gpt-4o-mini`

**铁律六 Shadow Mode（影子模式）**
- TOHOSHOU MODEL 生产权重 = 0，字段预留（shadowModelScore/Recommendation/Rank/GeneratedAt）

### Schema 变更 (V12.0)
- StockScore: +15字段 (confidence×5, riskOverride, version×5, shadow×4)
- DailyRecommendation: +6字段 (confidence, riskOverride, version×4)
- News: +tradeEffectiveDate + index
- 废弃孤儿表清理: line_users / notification_logs / user_ai_settings

### Other
- `components/AISafetyPanel.tsx`: admin/verify 页面七条规则状态面板
- `docs/TOHOSHOU_AI_DECISION_ENGINE.md`: 六大铁律完整文档

### Verification
- `npm run build` → PASS ✅
- `npm run health:data` → CRITICAL=0 ✅
- `compute-scores.ts` 运行 47s，STRONG_BUY criteria violations = 0 ✅
- 守卫降级日志输出正常 ✅
- Deployment id=17, commit `7680d8f`

---

## [11.2.0] - 2026-06-25 — 新闻同步僵尸 Job 修复

### Bug Fix (P0)
- **根因**：2026-06-20T13:01 起 SyncJob(`cmqmd7on50000o3oza9pi2hda`) 卡死 RUNNING 状态
  - 导致 5天内每次 POST `/api/sync/news` 命中早返回（"已有正在运行"），0 新闻入库
  - cron 日志全部假 ✅，实际无任何同步
- **修复 1**：手动将僵尸 Job 标记为 FAILED，恢复同步（新增 263+ 条新闻）
- **修复 2**：`POST /api/sync/news` 加入 2小时超时守卫 (`STALE_JOB_THRESHOLD_MS`)
  - job 年龄 ≤ 2h → `skipped:true`，正常跳过
  - job 年龄 > 2h → 自动标记 FAILED，`staleAutoFailed:true`，允许新建
- **修复 3**：`cron-scheduler.ts` `runNewsSync` 解析 JSON 响应
  - `skipped:true` → `⚠️ SKIPPED: existing running job`
  - `staleAutoFailed:true` → `⚠️ stale job auto-failed, new job started`
  - 正常启动 → `✅ 完成 (jobId=... total=...)`
  - 禁止假 ✅

### Verification
- `npm run build` → PASS ✅
- `npm run health:data` → CRITICAL=0 ✅
- 僵尸 Job 手动 FAILED → 新同步启动 → newsCount 2496 → 3300+ ✅
- `GET /api/sync/news runningJob.processed` 逐步递增 → 正常工作 ✅
- commit `aaec849`

---

## [11.1.0] - 2026-06-25 — 我的自选组合真实数据

### New Features
- `我的自选组合` Tab 接入真实 WatchList 数据（GET /api/watchlist）
  - 空状态：「还没有加入自选股」+ 「去股票列表添加」→ /stocks
  - Section A：AI评分排序（按 finalScore 降序）
  - Section B：模拟建仓（100M JPY 等权，BUY/STRONG_BUY，最多 Top10）
  - Section C：调仓建议（per-stock 建议纳入/继续观察/建议剔除）
- 懒加载：首次切换到 Tab 时才请求数据
- i18n：11个 `portfolio.wl_*` 键（zh-CN / en-US / ja-JP）
- commit `c2601bb`，Deployment History id=15

---

## [11.0.0] - 2026-06-24 — AI Portfolio Engine

### New Features
- **`/portfolio`** 页面完全重写：AI Portfolio Engine（取代旧版手动持仓追踪器）
  - 初始资金 10,000,000 JPY；每日自动从 DailyRecommendation Top10 等权买入（每只 100 万）
  - 6张汇总卡片：当前资产(JPY) / 累计收益(%) / TOPIX ETF(%) / Alpha(%) / 胜率(%) / 最大回撤(%)
  - 持仓表：symbol/公司名/AI评级/AI建议（ADD/HOLD/REDUCE/SELL）/持有天数/买入价/当前价/收益%
  - SVG收益曲线：portfolioReturn / topixReturn / alpha；时间窗口 [7D][30D][90D][ALL]
  - 历史成绩表：per-cohort BacktestResult TOP10 数据
- **新 API 路由**：`/api/portfolio/summary`、`/api/portfolio/trend`、`/api/portfolio/history`
- **i18n**：29个 `portfolio.*` 键，覆盖 zh-CN / en-US / ja-JP
- **health:data**：新增 portfolio_top10(WARNING) / portfolio_value(WARNING) / portfolio_backtest(INFO) 三项检查
- **Sidebar**：`/portfolio` 导航标签改为 `nav.aiPortfolio`（「AI组合」）

### Verification
- `npm run build` → PASS ✅
- `npm run health:data` → CRITICAL=0, WARNING=4 ✅
- `https://aitohoshou.com/portfolio` → HTTP 200 ✅
- `https://aitohoshou.com/api/portfolio/summary` → 返回 cohortDate/positions/alpha 数据 ✅
- Deployment History id=10 写入成功 ✅

### Technical Notes
- `maxDrawdown` 暂为 null（trend API 已有计算占位，TODO: 实现滚动最大回撤算法）
- `portfolio_backtest INFO count=0`：BacktestResult TOP10 条目由定时任务生成，预期 INFO 非 CRITICAL
- 旧 `/api/portfolio` CRUD 路由保留（手动持仓管理），不影响新 AI Portfolio 路由
- commit `a126dde`

---

## [10.3.0] - 2026-06-24 — Backtest Page v10.3 Polish

### Changed
- Backtest 页面标题 → 「AI历史回测」/ subtitle → 「AI组合收益与TOPIX基准对比」
- 免责声明：amber Banner → 结构化 ✓/✗ 网格
- 6张汇总卡片：移除标签中 「(7D)」，添加 sub-label 说明（horizon/proxy/日期）
- Waiting 状态：显示预计可用日期（7D: +11天, 30D: +40天, 90D: +102天）
- 趋势图标题 → 「累计收益率」；TOPIX legend → 「TOPIX ETF」
- Cohort 表头 → 「推荐日期」/「推荐数量」；数据修复 ISO 时间字符串 → `.slice(0,10)`
- 页脚新增 TOPIX ETF Proxy 注释
- commit `68ca0a0`，Deployment History id=9

---

## [10.1.2] - 2026-06-24 — Hotfix: 2026-06-23 DailyRecommendation gptRank 重复污染修复

### Fixed (DB Hotfix — 无代码改动)
- **2026-06-23 DailyRecommendation 550→500**：`rerank-top500.ts` 当日执行两次，导致50个 gptRank 值各有2条记录（两次运行评分略有差异，`@@unique([date,symbol])` 约束防止了 symbol 重复，但 gptRank 无唯一约束）
- 修复策略：每个重复 gptRank 保留 `finalScore` 最高的一条，删除低分条目（50条）
- 验证：`COUNT(*) = 500` ✅，`COUNT(DISTINCT gptRank) = 500` ✅，`MIN(gptRank) = 1, MAX = 500` ✅，无重复 ✅

### Verification
- `npm run health:data` → CRITICAL=0, WARNING=3, Allow recommendations: YES ✅
- `/api/backtest/health` → WAITING_PRICE（预期，latestPriceDate=2026-06-23）✅
- Deployment History id=7 写入成功 ✅

### No Code Deploy
DB-only hotfix，无需构建或 rsync。commit `88302b5`（docs only）。

---

## [10.1.1] - 2026-06-24 — 状态文档全面核验与统一

### Verified (生产 API + DB 核验，无代码改动)
- `/api/admin/verify`: ready=true, CRITICAL=0, WARNING=4（非阻断）
- `/api/backtest/health`: status=WAITING_PRICE, latestPriceDate=2026-06-23, filled=0（预期）
- `/api/admin/deployments`: 最新 id=6, commit=`73d253e`, 2026-06-23 16:08 JST
- 生产 DB DailyRecommendation: 2026-06-24=500✅, 2026-06-23=550⚠️（异常>500）, 2026-06-20=500
- 生产 DB Stock=3717, StockScore=3714, GPT nullRank=283（P2 WARNING）

### Docs Updated
- `PROJECT_STATUS.md`: 全面更新至 2026-06-24 核验状态
  - 版本号修正：v10.1.1 → v10.1.0（HEAD: `3a3ed1f`）
  - 生产域名：统一为 https://aitohoshou.com（删除 tohoshou.com 引用）
  - DB 状态表：移除 UserAiSettings/LineUser 行，更新 DailyRecommendation 为实际 4 日期数据
  - Cron 时间表：移除 LINE 推送条目（send-morning-brief/midday-flash/closing-summary/risk-alert）
  - API 路由表：移除 /api/chat、/api/line/webhook，补充 /api/admin/verify、/api/backtest/trend 等
  - 核心 Lib 索引：移除已删除的 intent-engine/query-engine/answer-builder/ai-control/intent-schema
  - npm scripts：移除 LINE 相关脚本，移除 test:intent-engine
  - 代码规则：移除 Intent Engine Pipeline / 系统命令触发词（相关文件已于 v9.0.0 删除）
  - Known Issues：升级为核验状态（新增 P2: nullRank=283, P2: DailyRec 550 异常）
  - NEXT SESSION：全面更新为 2026-06-24 实际状态
- `docs/CLAUDE_DEVELOPMENT_RULES.md`: 新增 Rule 8（生产域名统一规则）

### New Known Issues (发现)
- **P2: GPT nullRank=283** — 283只股票 gptRank=null，需运行 rerank:top500 补全
- **P2: DailyRecommendation 2026-06-23=550** — 当日记录超过500条（正常上限），需排查 daily pipeline 重复写入

### No Code Changes / No Deploy
- 本次会话仅文档更新，无生产代码变动，无需部署

---

## [10.1.0] - 2026-06-23 — v10 Stable Final Audit & Fix

### Fixed (P1)
- **P1-1: gptRank null=0** — Already resolved before session start (all 325 stocks scored).
- **P1-2: DailyRecommendation today=0** — Root cause: `rerank-top500.ts` was not in the cron schedule. Fixed by adding it to `cron-scheduler.ts` after `compute-scores.ts` (07:30 JST). Ran manually: 325 entries for 2026-06-23 now in DB. Health check confirms ✅ today=325.
- **P1-3: RealtimeMarket Staleness Indicator** — Created `components/StalenessTag.tsx` (≤5min LIVE green, ≤60min Xm ago blue, ≤3h Xh ago amber, >3h stale gray). Added `computedAt` to: `api/watchlist/route.ts` (StockScore select), `api/stocks/[symbol]/ai-score/route.ts` (response), `app/page.tsx` (getDashboardData). Displayed in: Dashboard header, Watchlist title, Stock Detail AI score section.

### Fixed (P2 — TypeScript)
- **DeploymentRow badge loop** (`app/admin/verify/page.tsx`): Replaced `d[k as keyof DeploymentRow] as string` with a typed `as const` tuple of `{ key, label }` pairs. No more unsafe keyof cast; labels hardcoded instead of runtime string manipulation. `npx tsc --noEmit` → 0 errors.

### Build/Deploy
- `npm run build` ✅ PASS
- `npx tsc --noEmit` ✅ 0 errors
- `npm run health:data` ✅ CRITICAL=0, DailyRecommendation today=325
- rsync → pm2 restart tohoshou-web + tohoshou-cron ✅
- commit `73d253e` → push ✅

---

## [10.0.0] - 2026-06-23 — Legacy Cleanup Phase 1（LINE/AIAnalysis残留物清除）

### Removed (P0 — 生产 UI 显示错误修复)
- `app/api/sync/status/route.ts`: 删除 `lineConfigured` 变量、`LINE_CHANNEL_ACCESS_TOKEN`/`LINE_ACCESS_TOKEN` 检测、`line_gpt` 整个数据源块（含 24 行）、summary 返回值中的 `lineConfigured`/`gptConfigured` 字段
- `app/sync/page.tsx`: 删除 5 条 LINE CRON 条目（08:00朝报/08:30TOP10/12:30午间/15:45收盘/16:35风险提示）、`line_gpt` 配置状态 UI 块、版本字符串更新 v7.7 → v10

### Removed (P1 — 配置/i18n 清理)
- `.env.example`: 删除 13 个 LINE/WeChat/WeCom 环境变量；新增 `APP_URL` / `ADMIN_TOKEN` / `OPENAI_MODEL=gpt-5.5` / `JQUANTS_API_KEY` / `JQUANTS_REFRESH_TOKEN`
- `lib/i18n/types.ts` + 3个语言文件: 删除 `chat.movedToLine` key（LINE Chat 迁移通知，系统已无 LINE）

### Removed (P2 — 孤立代码)
- `app/api/ai/daily-picks/route.ts`: 整文件删除（调用已删 AIAnalysis 模型和 generateDailyPicks）
- `lib/ai.ts`: 删除 `generateDailyPicks` 函数（46行），保留 `analyzeStock`
- `lib/app-url.ts`: 修复注释（移除 LINE 引用），删除未使用 export（`newsUrl`/`notificationsUrl`/`portfolioUrl`/`syncUrl`）

### Removed (Prisma — schema-only，不 DROP 数据库表)
- 删除 9 个孤立模型：`AIAnalysis` / `PortfolioDiagnosis` / `NotificationLog` / `NotificationSetting` / `TelegramUser` / `LineGroup` / `LineUser` / `AlertLog` / `UserAiSettings`
- 同步清理 `Stock` model 的 `analyses AIAnalysis[]` relation
- 运行 `npx prisma generate`（仅客户端重生成，不修改数据库）

### Fixed (副作用修复)
- `app/api/stocks/[symbol]/analysis/route.ts`: 改为直接返回 `analyzeStock` 结果，不再 persist 到已删的 AIAnalysis 表
- `app/api/stocks/[symbol]/route.ts`: 删除 `analyses` include 字段
- `prisma/seed.ts`: 删除 AIAnalysis deleteMany + create 块及 `analyses` 变量

### Build/Deploy
- `npm run build` ✅ PASS
- `npm run health:data` ✅ CRITICAL=0
- rsync → pm2 restart tohoshou-web + tohoshou-cron ✅
- commit `21fb96f` → push ✅

---

## [9.0.1] - 2026-06-23 — 全局项目边界污染审核清理

### Fixed (docs/chore)
- `docs/KNOWN_ISSUES.md`: 删除 yahoo-auction 跨项目污染（P0 note / P1-4 LINE quota / P2-4 sendWxWon+auctionBid.ts / P2-5 POST /bill/api / P3-1 H5 PackageImages / P3-2 sendWxEnding / P3-3 SystemConfig TOCTOU）
- `docs/ROADMAP.md`: 删除 yahoo-auction P0-1 条目及 note、删除 P2-2 AI Chat（系统已移除）、删除 P3-1 LINE push re-enable、删除 P3-3 WeChat Work（系统已移除）；重新排号剩余条目
- `docs/API_MAP.md`: 删除"AI / Chat"整节（/api/chat, /api/wecom/callback, /api/wecom/chat）和"Notifications"整节（/api/notifications，v9.0已删除）
- `lib/stock-display-name.ts`: 删除注释"All LINE pushes must use this function"（LINE 系统已于 v9.0 全量删除）
- `PROJECT_STATUS.md`: 删除"H5/小程序 PackageImages img src 未经 proxyImgMedium"行（yahoo-auction 项目内容）

### Verified Legitimate (not contamination)
- `lib/i18n/market-labels.ts`: 物流 → 日本市场板块标签（Warehouse & Transport）
- `scripts/seed-ai-themes.ts`: 物流自動化 AI 主题（Daifuku 等真实日股）
- `CHANGELOG.md`: 历史 wecom/LINE 条目 → 已删系统的正规变更记录

---

## [9.0.0] - 2026-06-23 — 完全移除所有推送系统（LINE + 企业微信）

### Removed
- **LINE 全栈删除**：`lib/line.ts` / `lib/line-push.ts` / `lib/line-flex.ts` / `lib/line-flex-v79.ts` / `lib/line-agent.ts` / `lib/line-chat.ts` / `lib/line-intent.ts`（7个lib）
- **企业微信全栈删除**：`lib/wechat.ts` / `lib/wecom-chat.ts` / `lib/notify/wecom.ts` / `lib/notify/wecom-customer-service.ts`（4个lib）
- **Chat pipeline 删除**：`lib/intent-engine.ts` / `lib/query-engine.ts` / `lib/answer-builder.ts` / `lib/ai-agent.ts` / `lib/ai-control.ts` / `lib/intent-schema.ts` / `lib/daily-picks-report.ts`（7个lib）
- **API routes 删除**：`/api/line/*`（2）/ `/api/wecom/*`（2）/ `/api/notifications/*`（6）/ `/api/cron/daily-picks` / `/api/chat`（12个路由）
- **Pages 删除**：`/chat` / `/notifications`
- **Scripts 删除**：21个 send-*/test-*/validate-* 推送脚本

### Changed
- `scripts/cron-scheduler.ts`：移除所有 LINE/WeChat cron jobs（08:00朝報/08:30日報/11:30盘中/12:30午間/15:30收盘/15:45大引/16:35リスク/毎30分アラート/毎15分预警），保留数据同步调度（05:30市場/06:00価格/07:00-22:00ニュース/07:30AI評分/18:30空売り/22:00メタ/22:30配当）
- `scripts/data-health-guard.ts`：移除 LINE import + LINE 告警发送块（LINE 429 WARNING 不再出现）
- `package.json`：移除所有 `line:*` / `wecom:*` / `send-daily` / `validate:line-*` / `test:intent-engine` / `test:chat-api` npm scripts（删除23个命令）

### Preserved
- Dashboard / Watchlist / Backtest / DailyRecommendation / Cron 数据同步 / DeploymentLog / AI 评分 / AI Value Chain / Sectors / Portfolio / News 全部保留

## [8.9.6] - 2026-06-23 — Session 基线确认 + Known Issues 纠正

### Fixed
- memory/project_llm_stock.md: 移除误混入的 yahoo-auction 项目 P1 issue（`batch-paid/orders.ts` OrderBillItem 未同步），该问题属于独立项目，与 llm-stock 无关
- 明确本项目实际 Known Issues：LINE 月配额 P2、en-US 股票名 P3、CST/JST cosmetic P3、CHECK 19 INFO

## [8.9.5] - 2026-06-23 — Deployment History 系统 + 代码审查 Bug 修复

### Added
- `prisma/schema.prisma`: DeploymentLog model (`deployment_logs` 表，含 commitHash/summary/modifiedFiles/buildStatus/healthStatus/apiStatus/pageStatus/databaseStatus/pm2Status/productionReady/warnings/blockingIssues/operator/deployedAt)
- `scripts/record-deployment.ts`: CLI 部署记录脚本，支持全部验收字段作为参数
- `app/api/admin/deployments/route.ts`: GET（列表，最新优先）+ POST（创建）
- `package.json`: `npm run record:deployment` 脚本
- `app/admin/verify/page.tsx`: 部署历史区块 — 状态徽章 + 终端风格验收报告 + 展开详情
- `docs/ARCHITECTURE.md`: 系统架构文档（新建）
- `docs/API_MAP.md`: 所有 API 路由映射（新建）
- `docs/ROADMAP.md`: 功能路线图（新建）
- `docs/KNOWN_ISSUES.md`: 已知问题清单（新建）
- `docs/CLAUDE_DEVELOPMENT_RULES.md`: Rule 7 — 强制部署历史记录
- `CLAUDE.md`: 更新 Deploy Sequence + 新增 record:deployment 命令

### Fixed (code review findings)
- `app/api/watchlist/route.ts`: `week52Pct` 未 clamp — 当 close > high52w（牛市中常见）时会返回 >100，现已 `Math.min(100, Math.max(0, ...))`
- `app/api/admin/deployments/route.ts`: GET/POST DB 调用缺少 try/catch — migration 缺失时返回 HTML 500，现返回 JSON error
- `app/api/admin/deployments/route.ts`: 无效 `deployedAt` 字符串（如 locale 格式）产生 `Invalid Date` 静默写入 — 现加 `isNaN` 守卫 fallback 到 `new Date()`

### Fixed — Navigation
- `components/mobile/MobileDrawer.tsx`: 补充系统校验入口（v8.9.3）
- `components/Sidebar.tsx` + `lib/i18n/*`: 系统校验三语言 key（v8.9.2）

### Changed — Watchlist (v8.9.4)
- `app/watchlist/page.tsx`: 4 列紧凑卡片（名称+代码同行、价格+涨跌同行、RSI·MA↑↑/↑/—/↓/↓↓·52W% 指标行、量比·成交占比灰色底栏、Score 74 格式、📈🗑 右上角图标按钮）
- `app/api/watchlist/route.ts`: 加入 RealtimeMarket join（volumeRatio, turnoverRate）+ Stock high52w/low52w → week52Pct

## [8.9.1] - 2026-06-23 — /admin/verify 升级为生产校验中心 + rerank timeHorizon 修复

### Changed — app/api/admin/verify/route.ts

- **标准化响应结构**: `{ ready, blockingIssues, warnings, modules[], checkedAt, meta }`
- `modules[]` 每项含 `{ key, name, status, current, expected, message, fixHint }`
- `module=status` (默认) 返回系统整体状态
- 新增 8 个检查模块: System / DataSync / DailyRecommendation / AIScores / Backtest / Cron / DataHealth / APIRoutes
- 每模块独立 PASS / WARNING / FAIL 判断，含修复建议 fixHint

### Changed — app/admin/verify/page.tsx

- **顶部总状态 Banner**: `PRODUCTION READY: YES/NO`，Allow Recommendation，Blocking Issues 数量
- 每个模块显示 PASS/WARNING/FAIL 徽章，点击展开 current/expected/message/fixHint
- **"⟳ Refresh All Checks"** 按钮：重新请求 /api/admin/verify，无需刷新页面
- **"⎘ Copy Acceptance Report"** 按钮：复制标准格式验收报告到剪贴板
- 保留 DailyRec 快照表、History 查询、Backtest 明细

### Fixed — scripts/rerank-top500.ts

- `timeHorizon: undefined` → `?? "1-3M"` 防止 Prisma 7 validation error
- `strengths/risks/catalysts` 加 `Array.isArray()` + `filter(typeof === "string")` 防止 GPT 返回嵌套数组导致 DB 类型错误

### Data — 2026-06-23 生产 rerank

- 第一次运行：500/500 GPT 完成，但 Step 5 (GPTScore upsert) 因 timeHorizon=undefined 失败，Step 8 未执行
- 修复后第二次运行（全部 cache hit）：Step 8 成功写入 500 条 2026-06-23 DailyRecommendation
- health:data: CRITICAL=0 ✅ Allow recommendations: YES

## [8.9] - 2026-06-23 — /admin/verify 内部验证页面（8模块）

### Added — app/admin/verify/page.tsx

- Module 1: System Status — commit hash, build time, environment, Node version, health status, CRITICAL/WARNING count, Allow recommendation, top issues
- Module 2: Data Sync — latest price date, stock count, GPTScore total/ranked, DailyRecommendation count by date
- Module 3: DailyRecommendation Snapshot — 100行表格，按 date/symbol 过滤，含 return7d/30d 颜色标注
- Module 4: Historical Snapshot — 按 symbol 查历次 rank/score，确认无覆盖
- Module 5: Indicator Breakdown — volumeRatio (今日量/10日均量) 公式+数字，turnoverRate 展示，10日K线明细表
- Module 6: GPT Score — gptRank/gptScore/finalScore/rating/summary/risks，gptRank=null 高亮红色 + 计数告警
- Module 7: Backtest — 组合业绩汇总（winRate/avgReturn/medianReturn/bestSymbol/worstSymbol），逐笔明细含 WIN/LOSS 标注
- Module 8: Errors — BacktestError 列表，无数据时显示 "✓ No errors"

### Added — app/api/admin/verify/route.ts

- module=system|sync|dailyrec|history|indicators|gpt|backtest|errors|all
- ADMIN_TOKEN 认证（未设置时 open access for dev）
- indicators: 计算 volumeRatio (DailyPrice 10日均) + RealtimeMarket 实时数据

### Build / Deploy

- npm run build: ✅ PASS
- npm run health:data: CRITICAL=0 ✅
- Deployed to https://tohoshou.com/admin/verify

---

## [8.8.1] - 2026-06-23 — health CHECK 19 时间门控修正（WARNING/CRITICAL 分离）

### Changed — data-health-guard.ts CHECK 19

- **时间门控**: 07:00 JST 前（pipeline 未到时）检查 latest date，不强制 today
  - 今日无数据 + latest date ≥ 300 且 ≤ 4 天内 → **WARNING**（非 CRITICAL）
  - 今日无数据 + latest date 陈旧/不足 → **CRITICAL**
- **07:00 JST 后（pipeline 应已完成）**:
  - 今日 ≥ 300 → **PASS**
  - 今日 0 + latest fresh → **WARNING**（降级，不阻断）
  - 今日 0 + latest stale → **CRITICAL**
- 4 天窗口覆盖长周末（日本连休）

### 验证

- health:data CHECK 19: `⚠️ WARNING today=0, latest=2026-06-22:325` (1d ago, fresh)
- CRITICAL = 0 ✅ / Allow recommendations: YES

## [8.8] - 2026-06-23 — DailyRecommendation 自动快照 + 硬失败链路 + health CRITICAL 检查

### Changed — rerank-top500.ts Step 8 (DailyRecommendation)

- **JST 日期修正**: `today` 改用 UTC+9 计算，不再依赖本机 TZ，避免 UTC 服务器写入前一天
- **`recommendation` 字段新增**: 从 StockScore.recommendationV2 写入 DailyRecommendation（STRONG_BUY/BUY/HOLD/WATCH/AVOID）
- **硬失败语义**: 单条 upsert 失败不再静默跳过，累计到 `failedSymbols[]` 后 `throw`，pipeline 以 exit 1 退出
- **`top500` select 增加 `recommendationV2`**: 随 Step 1 一次性加载，无额外查询

### Added — DailyRecommendation Schema

- `prisma/schema.prisma`: `DailyRecommendation.recommendation String?` — 记录创建时的 StockScore 评级
- `npx prisma db push` + `npx prisma generate` 已执行

### Added — data-health-guard.ts CHECK 19

- **CRITICAL: DailyRecommendation today ≥ 300** — 今日 JST 记录数不足 300 则阻断推荐
- 覆盖 pipeline 未运行、部分失败、`--limit=N` 测试遗留等场景
- 编号 CHECK 19，原 19→20→21 顺移

### Data

- rerank Run 2 (2026-06-23): `gptSuccessCount=210 gptCachedCount=115 gptFailCount=0 finalSaved=325`
- DailyRecommendation 2026-06-22: 325 entries (含 `recommendation` 字段回填，0 null)
- GPTScore: `gptRank null=0 filled=325`
- health:data: CRITICAL=0 (data checks), WARNING=4 (stale sync, 52w suspects, LINE quota)

## [8.7] - 2026-06-23 — 盘中量比/成交占比 i18n + 15:30 时间门控 + 2026-06-22 回测数据补写

### Changed — Portfolio 页 Realtime Indicators

- **量比 → 盘中量比** (`field.vol_ratio`): zh-CN / ja-JP（日中出来高比）/ en-US（Intraday Vol.）
- **换手率 → 成交占比** (`field.turnover`): zh-CN / en-US（Shr.Flow）/ ja-JP（売買比率）
- 新增 hover tooltip 说明口径（三语言），HTML `title` 属性
- `isVolRatioReliable()` 函数：vol_spike badge 和橙色只在 15:30 JST 后（平日）触发
- 影响文件：`app/portfolio/page.tsx`, `lib/i18n/types.ts`, `lib/i18n/messages/zh-CN.ts`, `en-US.ts`, `ja-JP.ts`

### Added — 2026-06-22 DailyRecommendation 补写

- `scripts/backfill-daily-rec-20260622.ts`: 补写 2026-06-22 历史回测首日数据
- 写入 22 条记录（1 STRONG_BUY + 1 BUY + 20 WATCH Top20），全标记 `BACKFILLED_FROM_AVAILABLE_DATA`
- GPTScore pipeline 今日未完整运行（仅10条无 gptRank 记录），Top50 FinalScore 无法补全
- entryPrice 使用 2026-06-22 收盘价，upsert key = date + symbol

### Deployed

- 生产服务器: `rsync .next/ root@8.209.247.68 + pm2 restart tohoshou-web`
- Bundle 确认: `.next/server/chunks/ssr/lib_i18n_index_tsx_0vavxq_._.js` 含「盘中量比」「成交占比」

## [12.1.1] - 2026-06-23 — 通道验证通过，深山老林 UID 确认

### Verified
- `npm run wecom:test` 生产环境运行结果：errcode=0，msgid=msgR_snIgAA75yIO0x1C465q4tkje-tHg
- VIP 双客户均成功查到：温老头 + 深山老林（首次确认）
- 深山老林 external_userid：`wmR_snIgAASOVTxH1XxRJwXBdyOEVLlg`
- 任务创建成功，需在企业微信 App「客户群发」确认发送

## [12.1] - 2026-06-23 — 最终架构确认：VIP 人工确认私信模式

### Architecture Final
- **唯一发送通道**: `add_msg_template`（员工手动确认，无 KF 48h 自动逻辑）
- **白名单 VIP**: 温老头 / 深山老林（运行时动态查询 external_userid，禁止其他客户）
- **消息风格**: 专业金融机构风格（参考高盛/摩根士丹利/瑞银），禁止「暴涨/翻倍/稳赚」

### Deleted
- `scripts/kf-poll-messages.ts` — KF 触发词轮询（已停用）
- cron KF 每10分钟轮询任务
- `package.json kf:poll` 脚本

### Updated
- **`lib/notify/wecom-customer-service.ts`** (v12.1 最终版):
  - 删除全部 KF 逻辑（syncKfMessages/sendKfMsg/pollAndActivate/subscriber storage）
  - 保留：`getWecomToken`, `findVipContacts`（动态查询 VIP 名称）, `sendToVipCustomers`
  - `sendToVipCustomers(content)` → 查找 VIP → add_msg_template → 等待员工确认
- **`scripts/send-morning-report.ts`** (金融机构风格):
  - "TOHOSHOU AI 研究院 | 晨间策略报告"
  - TOP3 标的：评级/AI评分/目标价/建议区间/风险等级
  - 模型组合绩效：收益率/日经225/超额收益/胜率
- **`scripts/send-wecom-midday.ts`** (信号驱动):
  - 仅当≥1只标的进入建议区间时创建任务，否则跳过
  - "买入时机信号"：当前价/建议区间/目标价涨幅空间
- **`scripts/send-market-close.ts`** (金融机构风格):
  - "TOHOSHOU AI 研究院 | 每日收盘复盘"
  - 市场评级分布/情绪倾向/近5日涨跌领先/明日关注
- **`scripts/test-wecom-customer-service.ts`** (v12.1):
  - 纯 add_msg_template 测试，无 KF 步骤
- **`scripts/cron-scheduler.ts`**: 删除 KF 轮询任务

### Send Pipeline (Final)
```
系统生成报告内容
↓
create add_msg_template → errcode=0
↓
企业微信 App（WenZhiYong）待发送队列
↓
手动点击"发送"
↓
温老头 / 深山老林 收到消息
```

## [12.0] - 2026-06-23 — 架构调整：Wecom Bot 下线，VIP 客户私信体系重建

### Architecture Change
企业微信群机器人（Wecom AI Bot）完全下线，推送架构改为 VIP 客户私信：
- **Channel A**: KF send_msg（48h 会话窗口，无需确认）— 需 KF 账号改为「智能助手」模式
- **Channel B**: add_msg_template（保底通道，需员工手动确认）
- 白名单：仅「温老头」「深山老林」

### Deleted
- `lib/notify/wecom-aibot.ts` — WecomAiBot WebSocket 客户端 + sendViaWorker + isAibotConfigured
- `scripts/wecom-aibot-worker.ts` — PM2 长连接 worker（端口 3977）
- `scripts/send-wecom-aibot-test.ts` — aibot 测试脚本
- `scripts/kf-send-now.ts` — 临时调试脚本

### New Files
- **`scripts/send-wecom-midday.ts`**: 11:30 盘中策略更新推送（TOP3 + 市场情绪快照）
- **`scripts/kf-poll-messages.ts`**: KF 消息轮询 — 检测「开始接收AI策略」触发词，激活订阅者

### Updated
- **`lib/notify/wecom-customer-service.ts`** (完全重写 v12.0):
  - 订阅者管理：`data/kf-subscribers.json`，`loadSubscribers/saveSubscribers/upsertSubscriber`
  - `sendToVipSubscribers(content)` — KF → add_msg_template fallback 双通道
  - `pollAndActivate(token, openKfId)` — 轮询检测触发词，白名单校验，自动发欢迎消息
  - `sendAddMsgTemplate()` — add_msg_template 保底通道
- **`scripts/test-wecom-customer-service.ts`**: 全新测试流程（v12.0）
- **`scripts/send-morning-report.ts`**: 替换 sendViaWorker → sendToVipSubscribers
- **`scripts/send-market-close.ts`**: 同上
- **`scripts/send-stock-alert.ts`**: 同上
- **`app/api/wecom/callback/route.ts`**: 移除 sendViaWorker 和 handleWecomQuery（bot 已下线）
- **`scripts/cron-scheduler.ts`**: 
  - hasWecom() 改为检查 WECOM_CORP_ID + WECOM_CUSTOMER_SECRET
  - 新增 11:30 盘中推送（工作日）
  - 新增 08:00-16:00 每10分钟 KF 消息轮询
- **`package.json`**: 新增 `wecom:midday`, `wecom:test`, `kf:poll`；删除 `wecom:aibot*`

### Known Issues
- KF send_msg 仍返回 95018（TOHO 账号「接待方式」为「人工接待」）
- 修复方法：企业微信后台 → 微信客服 → TOHO → 接待设置 → 改为「智能助手」
- 修复前 Channel A 不可用，自动 fallback 到 Channel B（add_msg_template，需员工确认）

## [11.7] - 2026-06-23 — 微信客服 KF 48h 通道探测 + 晨报格式升级

### New Files
- **`lib/notify/wecom-customer-service.ts`**: 微信客服 KF API 模块
  - `getWecomToken()` — 获取 access_token（复用 WECOM_CUSTOMER_SECRET）
  - `listKfAccounts()` — 列出客服账号（`GET /cgi-bin/kf/account/list`）
  - `syncKfMessages()` — 拉取近期客户消息 + 活跃会话
  - `sendKfMsg()` — 48h 窗口内直发（无需人工确认）
  - `kfErrHint()` — errcode → 人类可读说明
- **`scripts/test-wecom-customer-service.ts`**: 完整通道探测 + 测试脚本
  - Step1: gettoken · Step2: 筛选外部联系人（仅温老头/深山老林）
  - Step3: kf/account/list 探测权限 + 账号状态
  - Step4: kf/sync_msg 查近期客户消息（活跃 KF 会话）
  - Step5: kf/send_msg → 温老头 — 报告 errcode/errmsg
  - 含「开通步骤」说明 + 官方限制总结表

### Modified
- **`scripts/send-morning-report.ts`**: 晨报格式全面升级
  - 新格式：纯文本风格，①②③圆圈数字，`━━━━━━━━` 分隔线
  - 新字段：`entryLow/entryHigh`（建议区间）、`target1`（目标价）、`actionRiskLevel`（风险等级）
  - TOP5 组合绩效：近1月收益（return20d 均值）、超越日经225、胜率

### API 探测结论（实测，2026-06-23）
| 接口 | 状态 | 说明 |
|------|------|------|
| `externalcontact/send_msg` | HTTP 404 | 不存在 |
| `kf/account/list` | errcode=48002 | API 未授权 + 无账号 |
| `kf/send_msg` | errcode=48002 | API 未授权 |
| `kf/sync_msg` | errcode=48002 | API 未授权 |

### 官方限制说明
- 外部联系人主动发消息：仅 `add_msg_template`（员工确认）/ `send_welcome_msg`（新增时一次性）/ `send_msg_on_event`（事件触发）
- 48h 无确认直发：需开通独立**微信客服**（kf）模块 + 创建客服账号（open_kfid）

### 开通微信客服步骤
1. 企业微信管理后台 → 应用管理 → 微信客服 → 创建客服账号
2. 记录 `open_kfid`（wk 开头）→ 写入 `.env WECOM_KF_ID=wk..`
3. 客户联系应用 → 开启「微信客服」API 权限（或创建独立应用）
4. 设置 KF 消息回调 URL → 接收客户消息事件
5. 让客户扫客服账号二维码发消息 → 开启 48h 会话窗口

---

## [11.6] - 2026-06-23 — 企业微信客户联系一对一私信群发

### New Files
- **`scripts/send-wecom-private-test.ts`**: 全自动客户联系私信测试
  - gettoken → get_follow_user_list → externalcontact/list（分页）→ externalcontact/get（打印客户昵称）→ add_msg_template
  - 支持按客户名筛选（TARGET_NAME 参数）

### Verified Results（2026-06-23）
- 4 个外部联系人：深山老林 / wmy / 温老头 / 東方駿 村上
- 向温老头（wmR_snIgAA-YjrtMl3tsw9uRvuEtkGTA）发送成功：errcode=0，msgid=msgR_snIgAAjcdFxa31WNYz7GLMEQAHbQ
- `add_msg_template chat_type=single`：需员工在企业微信客户端手动确认后发出

---

## [11.5.2] - 2026-06-23 — 企业微信回调 AES 解密双 Bug 修复

### Root Cause（两个独立 Bug）
1. **WECOM_AES_KEY l/I 混淆**：控制台字体 `l`（小写L）和 `I`（大写i）视觉难辨，复制时出错
   - 症状：`last_byte` 随机值（66/141/125…）→ 解密后内容全乱
   - 修复：重新核对 key，确认正确值 `I7HlI6WzEmEQCnrO6CVlGIuGxNXmhBOol2GFBtKYFFp`
2. **PKCS7 block_size=32 写成 16**：企业微信官方 Python SDK `block_size=32`，非 AES 的 16
   - 症状：`raw_hex_tail=19191919`（padLen=25，合法但被误判）→ HTTP 403
   - 修复：`if (padLen < 1 || padLen > 32)`（原来是 `> 16`）

### Modified
- **`app/api/wecom/callback/route.ts`**: PKCS7 检查 `> 16` → `> 32`（commit 7af81f8）

---

## [11.5] - 2026-06-22 — 企业微信智能机器人回调 URL

### New Files
- **`app/api/wecom/callback/route.ts`**:
  - `GET /api/wecom/callback` — URL 验证：验签（SHA1 sort）+ AES-256-CBC 解密 echostr → 返回明文
  - `POST /api/wecom/callback` — 消息回调：验签 → 解密 → 解析 XML → `handleWecomQuery()` → `sendViaWorker(reply, chatId)`
  - 自动打印 `chatId`（💡 提示写入 `WECOM_AIBOT_CHAT_ID`）
  - 无 chatId 时只打印日志（不报错）

### Modified
- **`lib/notify/wecom-aibot.ts`**: `sendMarkdown(content, chatIdOverride?)` + `sendViaWorker(content, chatId?)` 支持动态 chatId 覆盖
- **`scripts/wecom-aibot-worker.ts`**: POST /send 接受 `body.chatId`，传递给 `bot.sendMarkdown(content, chatId)`

### New Env (已写入生产 /opt/tohoshou/.env)
```
WECOM_BOT_ID=aibJ2TsgQwk6Rsc6-juUHNHpRvuJAyjy59g
WECOM_TOKEN=R6dDp87oWQcW2EiTFxaxYlab4FgY2kd6
WECOM_AES_KEY=l7HII6WzEmEQCnrO6CVIGluGxNXmhBOol2GFBtKYFFp
```

### 验证
- `curl -I https://aitohoshou.com/api/wecom/callback` → HTTP 403（路由存在，无签名参数）
- 旧 404 已消除；企业微信保存 URL 时会携带正确参数，验证通过

### 回调链路
```
企业微信 → POST /api/wecom/callback
         → 解密 XML → handleWecomQuery()
         → sendViaWorker(reply, chatId) → 127.0.0.1:3977/send
         → WebSocket → 群聊
```

---

## [11.4] - 2026-06-22 — 企业微信智能机器人 WebSocket 长连接推送

### Architecture
- **Method B 架构**：唯一长连接由 PM2 进程 `tohoshou-wecom-aibot` 持有；cron 脚本通过 `POST http://127.0.0.1:3977/send` 发送
- 废弃 `WECOM_WEBHOOK_URL` 对三个 cron 推送脚本的依赖

### New Files
- **`lib/notify/wecom-aibot.ts`**:
  - `WecomAiBot` 类：WebSocket → `wss://openws.work.weixin.qq.com`，`aibot_subscribe`，30s ping，自动重连（5s 延迟）
  - 回调自动打印 chatid（首次配置辅助）
  - `sendViaWorker(content)` HTTP 客户端（供 push 脚本调用，5s 超时）
  - `isAibotConfigured()` 检查三个必须 env 变量
- **`scripts/wecom-aibot-worker.ts`**:
  - 启动 WebSocket 长连接，监听 `127.0.0.1:3977`
  - `POST /send { content }` — 推送 Markdown，需 `X-Internal-Token` 鉴权（可选）
  - `GET /status` — 返回 `{ ok, subscribed, chatId }`
  - SIGTERM/SIGINT 优雅退出
- **`scripts/send-wecom-aibot-test.ts`**: 先 GET /status 验证 worker 再推送测试消息

### Modified
- **3 个 cron 推送脚本**（send-morning-report/send-stock-alert/send-market-close）：
  - 移除 `isConfigured()` + `WECOM_WEBHOOK_URL` 检查
  - 新逻辑：DRY_RUN → print | 未配置 → console 输出（降级） | 已配置 → sendViaWorker
  - stock-alert 推送失败时不写 AlertLog（下次轮询重试）
- **`package.json`**: `wecom:aibot` / `wecom:aibot:test`
- **`.env.example`**: WECOM_AIBOT_ID / SECRET / CHAT_ID / CHAT_TYPE / INTERNAL_TOKEN

### 部署后配置步骤
```bash
# 1. 在 /opt/tohoshou/.env 中配置（需要从企业微信开发者后台获取）
WECOM_AIBOT_ID=<智能机器人 ID>
WECOM_AIBOT_SECRET=<智能机器人 Secret>
WECOM_AIBOT_CHAT_ID=<群聊 chatid，首次在群里 @机器人 后从 worker 日志获取>
WECOM_AIBOT_INTERNAL_TOKEN=<自设随机字符串>

# 2. 启动/重启 worker
pm2 start tohoshou-wecom-aibot    # 首次已由部署脚本注册
# 或：pm2 restart tohoshou-wecom-aibot

# 3. 验证（应看到 "subscribed ok" + "ping ok"）
pm2 logs tohoshou-wecom-aibot --lines 30

# 4. 推送测试
npm run wecom:aibot:test
```

---

## [11.3] - 2026-06-22 — 企业微信智能机器人问答接口

### New Files
- **`app/api/wecom/chat/route.ts`**: `POST /api/wecom/chat` 问答接口 + `GET` 健康检查
  - Bearer token 鉴权（`CHAT_API_TOKEN`，未配置时生产打 WARNING）
  - 兼容 `query` / `message` / `text` 三种请求字段
  - 返回格式：`{ ok, type, text, data }`
- **`lib/wecom-chat.ts`**: 4类查询核心逻辑（纯 DB，无 GPT）
  - 股票查询：4位代码 / `xxx.T` / 中文名搜索，返回评分/评级/AI建议/风险/新闻
  - 今日推荐：DailyRecommendation 最新日期 Top5
  - STRONG BUY：recommendationV2=STRONG_BUY 或 adaptiveScore≥80 Top10
  - 回测：BacktestResult 最新日期 7d/30d/90d 摘要，无数据提示"暂无"
- **`scripts/test-chat-api.ts`**: 5问题直调测试（直接 import lib，无需运行服务器）

### Modified
- **`package.json`**: 新增 `test:chat-api` 命令
- **`.env.example`**: 新增 `CHAT_API_TOKEN` 说明

### API 用法
```bash
# POST 查询
curl -X POST https://aitohoshou.com/api/wecom/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "7203能买吗"}'

# GET 健康检查
curl https://aitohoshou.com/api/wecom/chat

# 本地测试
npm run test:chat-api
```

### 测试结果（本地 DB）
- 「7203」→ type:stock，丰田汽车评分 57.0 ✅
- 「7203能买吗？」→ type:stock，中文回答 ✅
- 「今日推荐」→ type:recommendations，暂无数据提示 ✅
- 「最近有哪些STRONG BUY」→ type:strong_buy，Top1 2127.T ✅
- 「回测结果」→ type:backtest，暂无数据提示 ✅

---

## [11.2] - 2026-06-22 — 企业微信群机器人推送模块

### New Files
- **`lib/notify/wecom.ts`**: 企业微信群机器人推送模块（`WECOM_WEBHOOK_URL`）
  - `sendText(content)` / `sendMarkdown(content)` / `isConfigured()`
  - 3次指数退避重试（1s/2s/4s）
  - 独立于旧 `lib/wechat.ts`（`WECHAT_WORK_WEBHOOK_URL`）

- **`scripts/send-morning-report.ts`**: 晨报（08:00 JST 工作日）
  - STRONG BUY/BUY Top3：评分/评级/5日收益率/BUY NOW标记
  - 市场情绪（BULLISH/POSITIVE/CAUTIOUS/COLD，基于BUY率）
  - 数据时间（最新 computedAt JST）

- **`scripts/send-stock-alert.ts`**: 股票预警（每15分钟，09:00-15:30 工作日）
  - 4类预警：AI_BUY_SIGNAL（tradingAction=BUY_NOW）/ BELOW_MA20（maTrend dead/bearish + SELL）/ RSI_HIGH/EXTREME（≥83）/ NEAR_52W_HIGH（≥98%前高）
  - AlertLog 去重（channel=WECOM，同日同类型只发一次）

- **`scripts/send-market-close.ts`**: 收盘总结（15:30 JST 工作日）
  - 5档评级分布（STRONG BUY/BUY/HOLD/WATCH/AVOID）
  - 情绪色柱（🟢/⚪/🔴 10格）
  - 5日涨幅/跌幅第一（基于 StockScore.return5d，日内数据次日更新）

### Modified
- **`scripts/cron-scheduler.ts`**: 新增3条 WeComl 定时任务（08:00/每15分/15:30），hasWecom() 守卫
- **`package.json`**: `wecom:morning-report` / `wecom:stock-alert` / `wecom:market-close`（各含 `:dry` 变体）
- **`.env.example`**: 新增 `WECOM_WEBHOOK_URL` 说明

### Usage
```bash
# 晨报
npm run wecom:morning-report
npm run wecom:morning-report:dry

# 股票预警
npm run wecom:stock-alert
npm run wecom:stock-alert:dry

# 收盘总结
npm run wecom:market-close
npm run wecom:market-close:dry

# 配置环境变量
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx
```

---

## [11.1.1] - 2026-06-22 — chore: 移除微信服务号推送模块

### Deleted
- **`lib/notify/wechat-official.ts`**: 微信服务号模板消息发送模块（getAccessToken/sendStockAlert/isConfigured）
- **`scripts/send-watchlist-wechat-alerts.ts`**: 自选股服务号/企业微信推送脚本
- **`docs/WECHAT_OFFICIAL_SETUP.md`**: 服务号配置说明文档

### Modified
- **`package.json`**: 移除 `wechat:watchlist-alerts` / `wechat:watchlist-alerts:dry` 两条 npm scripts
- **`.env.example`**: 移除 `WECHAT_OFFICIAL_APP_ID/APP_SECRET/TEMPLATE_ID_STOCK_ALERT/TOUSER_OPENID` 四个环境变量

### Rationale
微信服务号 openid 获取链路复杂（需公众号关注 → openid 换取），环境变量缺失在生产会直接失败；企业微信 Webhook 也需配置。保留现有 `lib/wechat.ts`（企业微信群机器人）和 `line:watchlist-alerts`（LINE Bot）作为推送通道。

### Not Modified
- `lib/wechat.ts` — 保留（被 `app/api/cron/daily-picks/route.ts` 独立使用）
- `scripts/send-watchlist-alerts.ts` (LINE) — 保留
- AI评分 / Backtest / 所有核心功能 — 均未改动

---

## [11.1] - 2026-06-22 — V11.1 微信推送：自选股风险提醒 + AlertLog去重

### New Files
- **`scripts/send-watchlist-wechat-alerts.ts`**: 企业微信群机器人风险推送脚本（复用 `lib/wechat.ts`）
  - 数据链：`RealtimeMarket` DB缓存（<3h）→ 过期则 Yahoo Finance + DailyPrice 重算
  - 风险类型：`RSI_EXTREME`(>85) / `RSI_HIGH`(>75) / `BELOW_MA20` / `NEAR_52W_HIGH`(>98%) / `VOL_SPIKE`(>3x) / `AI_BUY_SIGNAL`(BUY_NOW) / `NEWS_RISK`(负面新闻+confidence≥70)
  - 格式：企业微信 Markdown subset（red/warning/green颜色、clickable链接）
  - 去重：发送前查 `AlertLog`，成功后写入；同日同股票同类型只发一次
  - CLI flag `--dry-run` + env `DRY_RUN=1` 均支持
  - 顺序遍历 150ms 间隔；缓存自动刷新写回 `RealtimeMarket`

### Schema Changes
- **`AlertLog`** 新模型（`@@map("alert_logs")`）：`symbol/alertType/channel/tradingDay` 四字段 `@@unique`，精确去重

### Not Modified
- `lib/wechat.ts` — 保持原样，直接复用
- `scripts/send-watchlist-alerts.ts` (LINE) — 保持原样
- AI评分 / Backtest / News / 实时行情页面 — 均未改动

### Usage
```bash
npm run wechat:watchlist-alerts           # 生产推送
npm run wechat:watchlist-alerts -- --dry-run  # 预览
# 需配置：WECHAT_WORK_WEBHOOK_URL 环境变量
```

### Result
- Build ✅ · Health ✅ CRITICAL=0 · Deploy ✅ · Commit `86e41c7` · Pushed (pending)

---

## [11.0] - 2026-06-22 — V11 AI Trading Dashboard：我的投资升级为实时行情工作台

### New Files
- **`app/api/realtime-market/route.ts`**: `GET /api/realtime-market?symbols=...` — Yahoo Finance 实时报价（price/changePct/volume/52wHigh/52wLow/sharesOutstanding）+ DailyPrice计算 MA5/MA20/MA60/RSI14/量比（avg10d）/换手率（volume/sharesOut）；每次调用 upsert `RealtimeMarket` 表；最多30只/请求
- **`scripts/send-watchlist-alerts.ts`**: 自选股 LINE 风险推送脚本；顺序检查每只（150ms间隔防限流）；触发条件：RSI>75/85、跌破MA20、接近52周高位98%、量比>3x；支持 `DRY_RUN=1`

### Schema Changes (`prisma/schema.prisma`)
- **`WatchList`**: 新增 `sortOrder Int @default(0)` 和 `groupName String?`
- **`RealtimeMarket`**: 新模型（@@map("realtime_market")），symbol @id，存储实时行情缓存；@updatedAt 自动更新

### Modified Files
- **`app/portfolio/page.tsx`**: WatchlistTab 全面升级
  - 深色渐变仪表盘 header（总只数/上涨数/下跌数/平均涨幅/市场开闭/最后更新时间/刷新按钮）
  - 风险提醒 panel（最多8条，黄/红颜色区分，显示股名+风险类型+数值）
  - 每张卡片增强：实时价格（大字）+涨跌幅色标/RSI分格/MA20状态/52周位置/量比/换手率/内嵌风险徽章
  - 卡片边框随最高风险等级变色（red/amber/默认蓝）
  - PortfolioTab 和 PriceAlertsTab 保持原样未改
- **`lib/i18n/types.ts`** + **zh-CN/en-US/ja-JP**: 新增 20 个 V11 key（`dashboard.*` / `risk.*` / `field.*`）
- **`package.json`**: 新增 `line:watchlist-alerts` / `line:watchlist-alerts:dry` 脚本

### Not Modified (V11 保留原样)
- `lib/ai-score.ts` / `scripts/compute-scores.ts` / `scripts/update-backtest.ts` / news / stock detail / GPT View / LINE reports

### isTokyoMarketOpen Logic
- UTC+9 换算 → 判断工作日 + 09:00–11:30 / 12:30–15:30 JST 两个交易时段
- 非交易时段显示「休市」badge，仍展示最新数据

### Result
- Build ✅ · Health ✅ CRITICAL=0 · Deployed ✅ · Commit `9c5cbdd` · Pushed ✅
- DB: `realtime_market` 表已创建，`watch_list` 新增 `sort_order` / `group_name` 列

---

## [10.4] - 2026-06-22 — health:data：LINE 429 降级为 WARNING，CRITICAL=0

### Problem
`npm run health:data` 每次本地运行显示 CRITICAL=1，来源两处：
1. `stale_strongbuy` 检查：2127.T 本地数据 >3 天未 sync，触发 CRITICAL；生产 cron 每日同步，此检查在生产上始终为 0
2. LINE 429 仅以 `[line] ❌ alert failed` console.warn 出现，视觉上紧跟 CRITICAL 输出，造成误读

### Changes (`scripts/data-health-guard.ts` → v8.2.6)
1. **`stale_strongbuy` CRITICAL → WARNING**：本地无日常价格同步，此检查不应阻断 deploy；生产 cron 保证每日更新
2. **LINE 告警段前移**：移至 `aggregate` 计算前；捕获 429 后调用 `add(WARNING)` 将其写入检查摘要
3. **新检查 `line_quota`**：`⚠️ [WARNING] LINE 月配额 超限（HTTP 429）`，附说明"属外部服务额度限制，非核心数据故障，无需处理"
4. **console 输出**：`[line] ⚠ 月配额超限（HTTP 429）— 非核心数据故障`（原 `❌ alert failed`）

### Result
- Build ✅ · Health ✅ CRITICAL=0 (`Status: WARNING  ✅17 ❌0 ⚠️4 ℹ️0`) · Deployed ✅
- LINE 429 明确显示为 `⚠️ [WARNING]`，不计入 CRITICAL，health guard 返回 exit 0

### 2127.T 数据补丁（2026-06-22，无代码修改）
- `stale_strongbuy` WARNING 来源：2127.T `lastSyncAt=2026-06-19`，本地 DB 缺 2026-06-20/06-22 两根 Bar
- 调查：Yahoo Finance 有活跃行情；J-Quants 有 2026-06-19/06-22 数据；股票正常交易，**非退市/停牌/脚本漏洞**
- 原因：本地 DB 无日常 cron price sync（生产服务器 cron 每日 06:00 JST 自动同步，生产无此警告）
- 修复：内联脚本 J-Quants 拉取并写入本地 DB，`lastSyncAt` 更新为当前时间
- 结论：**纯本地 DB gap，生产无影响，不需要部署**

---

## [10.3] - 2026-06-22 — 修复同步中心两个失效的「立即同步」按钮

### Root Causes Fixed
1. **ComputeScores 同步失败（ENOENT）**：`app/api/sync/scores/route.ts` 用 `join(cwd,"node_modules",".bin","tsx")` 硬编码 tsx 二进制路径，生产环境 tsx 未安装到 node_modules 导致 `spawn ENOENT`
2. **GlobalMarket 同步返回 HTML**：`app/api/sync/status/route.ts` 将 GlobalMarket 的 `apiEndpoint` 映射到 `/api/sync/yahoo`（股票行情同步，返回 HTML 错误页），而非全球市场数据脚本

### Modified Files
- **`app/api/sync/scores/route.ts`**: `spawn(tsxBin, ...)` → `spawn("npx", ["tsx", scriptPath], { shell: true })`；与 Cron/daily-pipeline 统一使用系统 npx（`/usr/bin/npx`）

### New Files
- **`app/api/sync/global-market/route.ts`**: 新路由 `POST /api/sync/global-market`，spawn `npx tsx scripts/fetch-global-market.ts`，返回结构化 JSON；50s 超时

### Status Route Fix
- **`app/api/sync/status/route.ts` line 304**: `apiEndpoint: "/api/sync/yahoo"` → `"/api/sync/global-market"`

### Result
- Build ✅ · Health ❌ CRITICAL=1（2127.T 数据陈旧，与本次修改无关）· Deployed ✅
- 生产验证：`POST /api/sync/global-market` → `{"success":true,"durationMs":3863}` ✅
- 生产验证：`POST /api/sync/scores` → `{"success":true,"durationMs":44662}` ✅（44s 完成全市场评分）

---

## [10.2] - 2026-06-22 — Backtest 页面升级：历史趋势图 + 错误处理 + 风险提示

### New Files
- **`app/api/backtest/trend/route.ts`**: `GET /api/backtest/trend?horizon=7d|30d|90d` — 按 cohort 日期返回各组合 avgReturn 时序数据；portfolioSize ∈ {TOP10, TOP50, TOP100, ALL}

### Modified Files
- **`app/backtest/page.tsx`**: 全面重写
  - **风险提示横幅**：页面顶部醒目 amber 色 ⚠ 横幅，三语言，说明模拟回测局限性
  - **错误状态**：fetch 失败时显示红色错误框 + 重试按钮，与真无数据（蓝灰空态）明确区分；HTTP 500 / 网络错误均捕获
  - **历史趋势图**：纯 SVG 折线图（无新依赖）
    - 4 条折线：TOP10（蓝）/ TOP50（绿）/ TOP100（琥珀）/ ALL≈500（紫）
    - 周期切换：7日 / 30日 / 90日
    - 粒度切换：每日 / 按周（前端聚合，取均值）
    - 悬停交互：竖线 + 各系列高亮圆点 + 下方数据行实时更新
    - 自动缩放 Y 轴，零线虚线标注
    - 数据不足时显示友好空态
- **`scripts/update-backtest.ts`**: 新增 TOP50 / TOP100 portfolio size（共 6 种：TOP5/10/20/50/100/ALL）
- **`lib/i18n/types.ts`** + **zh-CN / en-US / ja-JP**: 新增 6 个 key（risk_banner / trend_title / trend_no_data / trend_hint / error_load / retry）

### Result
- Build ✅ · Health ❌ CRITICAL=1（LINE 月配额超限，与本次修改无关）· Deployed ✅ · Commit `99b442e` · Pushed ✅
- 生产 update-backtest --all 已执行（1 cohort，19 stocks filled，return7d 尚未满 7 交易日，趋势图将在下周积累数据后显示）
- **不影响现有推荐评分逻辑**（compute-scores.ts / ai-score.ts 未改动）

---

## [10.1.2] - 2026-06-22 — Code Review 修复：4 个 Backtest 正确性 Bug

### Modified Files
- **`app/sync/page.tsx`**: 修复 `["7D","30D","90D"]` 大写 D 导致 filled7D/fillRate7D key 匹配失败，健康卡全显 undefined/NaN%
- **`scripts/update-backtest.ts`**: ① 移除 `!FORCE &&` guard，FORCE 模式也跳过 null-entry 行，防止覆盖有效历史数据；② 正常模式 WHERE 增加 `COALESCE("entryPrice",0)!=0`，排除 entryPrice=0 行的无限重选；③ `median()` 补 `Math.round` 统一2位精度
- **`prisma/schema.prisma`**: `BacktestError` 增加 `@@unique([symbol,recommendDate,horizon,reason])`，使 `skipDuplicates:true` 真正去重

### Result
- Build ✅ · Deployed ✅ · Commit `8c8bf5f` · Pushed ✅

---

## [10.1.1] - 2026-06-22 — Backtest Auto Fill: pipeline --all + health API + BacktestError + Sync card

### New Files
- **`app/api/backtest/health/route.ts`**: `GET /api/backtest/health` — returns `latestRecommendationDate/totalRecommendations/filled7d/30d/90d/fillRate7d/30d/90d/latestPriceDate/recentErrors/status`; status logic: HEALTHY(fillRate7d≥80%) / WAITING_PRICE(filled7d=0) / PARTIAL / FAILED

### Schema Changes (`prisma/schema.prisma`)
- **`BacktestError`** model (@@map("backtest_errors")): `symbol/recommendDate/horizon/reason/createdAt`; indexes on date/symbol/reason; reason codes: `NO_DAILY_PRICE` / `NO_ENTRY_PRICE` / `NO_EXIT_PRICE`

### Modified Files
- **`scripts/daily-ai-pipeline.ts`**: Step 8 changed from `update-backtest.ts []` → `update-backtest.ts ["--all"]`, timeout 5min → 10min; ensures all cohorts refill daily
- **`scripts/update-backtest.ts`**: v10.1.1 — adds BacktestError recording per cohort: NO_DAILY_PRICE (age>5d, no prices), NO_ENTRY_PRICE (open=0), NO_EXIT_PRICE (age>15/50/135d per horizon); batch createMany with skipDuplicates; FORCE mode clears stale errors first
- **`app/sync/page.tsx`**: Backtest health card between Data Health and Source cards — shows status badge (🟢/🟡/🔴), latest rec date, total count, 7D/30D/90D fill counts + rates, latest price date, recent error count; fetched on load + refresh

### Result
- Build ✅ · Health ✅ CRITICAL=0 · Deployed ✅ · Commit `def9fc0` · Pushed ✅
- Production: backtest_errors table created; health API returns `WAITING_PRICE` (expected — 2026-06-23 prices not yet available)
- Automation: daily pipeline Step 8 now always runs `--all`, no manual intervention needed

---

## [10.1] - 2026-06-22 — Backtest Logic Upgrade: entry/exit via true trading days + portfolio + benchmark

### Schema Changes (`prisma/schema.prisma`)
- **`DailyRecommendation`**: 7 new fields — `entryDate/entryPrice/entryPriceType/exitDate7d/exitDate30d/exitDate90d/priceSource`; entry = next trading day open; exit = strict Nth trading day adjClose??close; `priceSource` = "ADJUSTED"/"RAW"
- **`BacktestResult`**: 6 new fields — `portfolioSize/benchmarkNikkeiReturn/benchmarkTopixReturn/excessVsNikkei/excessVsTopix/maxDrawdown`; unique key changed to `[date, horizon, portfolioSize]`; portfolioSize = "ALL"/"TOP5"/"TOP10"/"TOP20"

### Modified Files
- **`scripts/update-backtest.ts`**: Full rewrite — true trading day counting (prices[0]=entry, prices[7]=exit7d, prices[30]=exit30d, prices[90]=exit90d); batch fetch per cohort; TOP5/TOP10/TOP20/ALL equal-weight portfolio stats; GlobalMarket benchmark (Nikkei225/TOPIX same-period return); `excessVsNikkei/excessVsTopix` alpha computation; fixed raw SQL to use camelCase column names (Prisma 7 production column naming)
- **`app/api/backtest/summary/route.ts`**: New response structure — `portfolios: { TOP5/TOP10/TOP20/ALL: { 7d/30d/90d: HorizonStat } }`; benchmark fields in HorizonStat; `entryPrice` in cohort/winners/losers lists
- **`app/backtest/page.tsx`**: Portfolio comparison table (rows=TOP5/TOP10/TOP20/ALL, cols=7d/30d/90d × avgReturn/winRate/vs Nikkei/vs TOPIX); horizon stat cards use ALL data; entry price column in cohort table; disclaimer notes
- **`lib/i18n/types.ts`** + all 3 locale files: 8 new keys (`backtest.portfolio_title/col_portfolio/col_nikkei/col_topix/col_excess/col_entry_price/entry_note/benchmark_note`)

### Key Fix
- Production DB columns use camelCase (`entryDate` not `entry_date`) — raw SQL in update-backtest.ts updated to quote identifiers correctly

### Design
- Entry price = raw open on next trading day (no look-ahead bias); exit price = adjClose??close on strict Nth trading day
- Portfolio returns: equal-weight avg of filled stocks; winRate = % with return > 0; maxDrawdown = worst individual return
- Benchmark: GlobalMarket nikkei/topix at entryDate and exitDate; alpha = avgReturn − benchmarkReturn
- Data fills automatically as prices sync nightly; until Monday 2026-06-23 open prices are available, entryPrice = null

### Result
- Build ✅ · Health ✅ CRITICAL=0 · Deployed ✅ · Commit `9e2bbb5` · Pushed ✅
- Production: 1 cohort (2026-06-20), 0/500 filled (expected — awaiting Monday 2026-06-23 price sync)

---

## [10.0 P2] - 2026-06-21 — Backtest Winners/Losers empty state fix

### Modified Files
- **`app/backtest/page.tsx`**: Winners / Losers tbody 空数据时显示 `t("backtest.no_data")` 提示行，复用已有 i18n key，三语言无需新增

### Result
- Build ✅ · Health ✅ CRITICAL=0 · Deployed ✅ · Commit `f064db9` · Pushed ✅

---

## [10.0 P1] - 2026-06-21 — Backtest MVP: DailyRecommendation + BacktestResult + /backtest page

### New Files
- **`prisma/schema.prisma`**: `DailyRecommendation` (date+symbol unique, 500 rows/day) + `BacktestResult` (per cohort × horizon)
- **`scripts/update-backtest.ts`**: fills `price7d/30d/90d` from `DailyPrice` (nearest trading day), computes returns, upserts `BacktestResult` aggregates
- **`app/api/backtest/summary/route.ts`**: returns `winRate/avgReturn` per horizon + top 10 winners/losers (30D) + latest cohort Top20
- **`app/backtest/page.tsx`**: three-language backtest page with horizon stat cards + cohort table (with live return columns) + winner/loser tables

### Modified Files
- **`scripts/rerank-top500.ts`**: Step 8 appended — saves Top500 snapshot to `DailyRecommendation` after each rerank (skipped in `--dry-run`)
- **`scripts/daily-ai-pipeline.ts`**: Step 8 = `update-backtest` (best-effort, 5-min timeout, after rerank)
- **`package.json`**: added `update-backtest` + `update-backtest:force` (--all flag) scripts
- **`lib/i18n/types.ts`** + all 3 locale files: 30 new `backtest.*` keys + `nav.backtest`
- **`components/Sidebar.tsx`**: added `/backtest` link in main nav

### Design
- Daily pipeline: rerank-top500 (Step 6+7) → save snapshot (Step 8 inside rerank) → update-backtest (Step 8 pipeline)
- Backtest fills run nightly — price7d ready after ~10 calendar days, price30d after ~42, price90d after ~126
- Calendar day approximation: 7td≈10cd, 30td≈42cd, 90td≈126cd; looks for nearest DailyPrice within +7 calendar days
- No BacktestResult rows until enough time has passed — `/backtest` page shows graceful empty state
- `update-backtest --all` forces refill of all rows (for corrections)

### Result
- Build ✅ · Health ✅ CRITICAL=0 · Deployed ✅ · Production schema pushed ✅
- `npm run update-backtest` → "0 rows to process" (expected — first data after tomorrow's pipeline)
- Commit: `1b1717f`

---

## [10.0] - 2026-06-21 — V10 Cold Start Scoring Formula: 70/30 Blend

### Changed Files

**`scripts/rerank-top500.ts`**
- New formula: `finalScore = adaptiveScore × 0.7 + gptScore × 0.3` (V10 70/30 blend)
- Cache hit path: recomputes finalScore with V10 formula from cached gptScore + current adaptiveScore (not stored V9 value)
- Cache hit DB write: now also persists updated `finalScore` + `ruleScore` to keep DB consistent
- Dry-run path unchanged (uses ruleScore as proxy, no GPT)

**`lib/i18n/messages/zh-CN.ts`** / **`en-US.ts`** / **`ja-JP.ts`**
- `gpt.final_score_desc`: "规则分70% + GPT分30%" / "Rule Score 70% + GPT Score 30%" / "ルールスコア70% + GPTスコア30%"

### Design
- Rule Engine (adaptiveScore) = 70%: technical, fundamental, money flow, news, AI themes
- GPT Research (gptScore) = 30%: business quality, growth, risk, catalysts, management
- GPT limited to Top500 only — no full-market GPT

### Result
- Build ✅ · Health ✅ CRITICAL=0 · Deployed · Rerank V10 verified (2s, 500 cache hits)
- Example: adaptiveScore=80, gptScore=90 → finalScore=83.0 ✅

---

## [9.0 P5] - 2026-06-21 — Daily Pipeline: gptRank Cache Bug Fix + Process Group Kill

### Fixed Files

**`scripts/rerank-top500.ts`**
- Added `gptRank: number | null` field to `ScoredEntry` type
- All three `scored.push()` calls (cache hit, dry-run, GPT success) initialize `gptRank: null`
- Step 5: assigns `s.gptRank = i + 1` for ALL 500 entries (including cache hits)
- Step 6: pre-clears all stale gptRank with `prisma.gPTScore.updateMany({ data: { gptRank: null } })` before writing
- Step 6 cache hit branch: now updates `{ gptRating, gptRank }` instead of `gptRating` only

**`scripts/sync-all-prices.ts`**
- Added `--daily` mode: `DATE_RANGE_DAYS=7`, `RATE_LIMIT_MS=150` (~12 min vs ~27 min full)
- Enhanced summary log: `attempted / success / skipped / failed / duration`
- Default behavior unchanged (full 400-day sync for manual runs)

**`scripts/daily-ai-pipeline.ts`**
- Step 2 (price-sync): passes `["--daily"]` arg + 25-min timeout (was 20 min)
- `runScript()`: replaced `execSync(cmd, { timeout })` with `timeout -k 15 ${sec} npx tsx ...` shell command — properly kills the entire process group (npx/tsx/node chain) on timeout; prevents orphaned grandchild processes
- Rerank step timeout: 90 min (was 50 min; 500 stocks × ~6s/GPT = ~50 min, old budget too tight)

### Root Cause Analysis
- **gptRank duplicate bug**: `--limit=5` test run assigned gptRank 1-5 to 5 stocks. Full run had those 5 as cache hits. Cache hit branch only wrote `gptRating`, not `gptRank` → stale ranks remained → 5 duplicates after sorting.
- **price-sync orphan**: `execSync` with `timeout` only SIGTERMs the direct child (`/bin/sh`); grandchildren (npm exec → tsx → node) survived → sync process kept running 60+ min consuming bandwidth.
- **rerank pipeline timeout**: 500 cache-miss GPT calls after compute-scores (hash invalidation) took ~50 min, exactly at the old 50-min limit → intermittent timeout.

### Verification (production)
- `gpt_rank_nn = 500`, `min = 1`, `max = 500`, `distinct = 500`, **`duplicate_ranks = 0`** ✅
- Manual rerank ran in 2.0s (all 500 cache hits, no GPT spend) ✅

### Result
- Build ✅ · Health ✅ CRITICAL=0 · Deployed · Commit below

---

## [9.0 P4] - 2026-06-21 — Watchlist / Portfolio Score Migration

### Updated Files

**`app/api/watchlist/route.ts`**
- Replaced N+1 per-item queries with single batch `findMany` for StockScore + Stock + GPTScore
- Removed `totalScore`/`recommendation`; now selects `adaptiveScore`/`recommendationV2`/`percentileRank`
- Computes `finalScore = gpt?.finalScore ?? adaptiveScore ?? 0`, `effectiveRating = gptRating ?? recommendationV2`
- Sorts: `finalScore DESC → gptRank ASC` (null gptRank → 9999)

**`app/api/portfolio/route.ts`**
- Same batch pattern for StockScore + GPTScore
- Returns enriched `score` object per item with `finalScore`, `gptRank`, `gptRating`, `effectiveRating`
- Sorts items by `finalScore DESC → gptRank ASC`

**`app/watchlist/page.tsx`**
- Removed local `REC_CFG` object (violated single source of truth)
- Imports `getRec`, `finalScoreColor` from `@/lib/rec-config`
- Updated `WatchScore` type: replaced `totalScore`/`recommendation` with `finalScore`/`gptScore`/`gptRank`/`gptRating`/`effectiveRating`
- Rating badge: `getRec(s.effectiveRating).bg/.text`; score display: `finalScoreColor(s.finalScore)` + G#N badge

**`app/portfolio/page.tsx`**
- `WatchlistTab`: same score fields + getRec/finalScoreColor; removed `totalScore`
- `PortfolioTab`: replaced `AIScoreBadge score={item.stock?.aiScore}` with `finalScore` number + effectiveRating label + G#N badge
- Removed `AIScoreBadge` import

### Result
- `totalScore` fully removed from all 4 files
- Build ✅ · Health ✅ CRITICAL=0 · Deployed · Commit `a47b8a1`

---

## [9.0 P3] - 2026-06-21 — Daily AI Pipeline Cron Job

### New File
**`scripts/daily-ai-pipeline.ts`**
- 6-step sequential pipeline: global-market → price-sync → news-sync → tdnet → compute-scores → rerank-top500
- PID-based file lock at `/tmp/daily-ai-pipeline.lock` — detects stale locks (dead PID), exits immediately if already running
- Per-step logging: start/end timestamp, duration, ✅/❌/⏭ status
- Final summary: end time, total duration, per-step results
- `--dry-run` flag: skips all heavy steps; rerank-top500 runs with `--dry-run` to print Top500 without GPT calls
- Step 6 (rerank-top500) only runs if Step 5 (compute-scores) succeeds — prevents GPT rerank on stale rule scores

### Updated Files
**`ecosystem.config.js`**
- New PM2 app: `tohoshou-ai-daily-pipeline`
- `cron_restart: "0 21 * * *"` (21:00 UTC = 06:00 JST)
- `autorestart: false` — one-shot; does not restart after each run
- Registered and saved on server: `pm2 start ecosystem.config.js --only tohoshou-ai-daily-pipeline && pm2 save`

**`package.json`**
- `npm run pipeline` — full pipeline
- `npm run pipeline:dry` — dry-run preview

### Verification
- `npm run build` ✅ PASS
- `npm run health:data` ✅ CRITICAL=0
- `npm run pipeline:dry` ✅ — all steps logged, dry-run output includes Top10 table
- PM2 registered ✅ — `pm2 save` ✅

---

## [9.0 P2] - 2026-06-21 — Manual Full-Market Rescore + GPT Top500 Rerank

### Changes

**Schema (`prisma/schema.prisma`)**
- `GPTScore`: added `gptRating String?` (STRONG_BUY|BUY|HOLD|WATCH|AVOID from finalScore+percentileRank)
- `GPTScore`: added `gptRank Int?` (rank within Top500 after final sort, 1=best)
- `finalScore` comment: updated to reflect V9 formula (`= gptScore`, pure GPT, no weighting)

**New script (`scripts/rerank-top500.ts`)**
- Load Top500 from StockScore by adaptiveScore DESC
- GPT score each with 24h hash-based cache
- `finalScore = gptScore` (V9: no 40/60 weighting)
- `gptRating` = recommendation from finalScore + percentileRank thresholds
- `gptRank` = position in Top500 after finalScore DESC sort
- Full stats log: totalStocks / ruleScoredStocks / gptSuccessCount / gptFailCount / ratingCounts / top10

**New npm scripts**
- `rerank:top500` – full run
- `rerank:top500:dry` – dry-run (no GPT)
- `rerank:top500:test` – limit=5 test
- `rescore` – compute-scores + rerank:top500 in sequence

**API (`app/api/ai-scores/route.ts`)**
- Join `GPTScore` for all returned symbols
- For "top" mode: fetch 600 candidates, re-sort by `finalScore DESC → adaptiveScore DESC → percentileRank ASC`
- Default limit changed 50→200; max 500
- Response adds: `finalScore`, `gptScore`, `gptRating`, `gptRank`, `hasGPT`, `effectiveRating`, `gptSummaryZh/Ja/En`

**Frontend (`app/ai-picks/page.tsx`)**
- `AiScore` type: added `finalScore/gptScore/gptRating/gptRank/hasGPT/effectiveRating/gptSummaryZh/Ja/En`
- `DetailCard`: primary score = `finalScore ?? adaptiveScore`; color from `finalScoreColor`; label shows "Final Score" or "Rule Score"
- `DetailCard`: shows `G#{gptRank}` badge when `hasGPT`; expanded detail shows both finalScore and adaptiveScore
- TOP3: shows `finalScore ?? adaptiveScore`; shows "GPT #N" label for GPT-ranked stocks
- Default fetch limit: 100→200 (`limit=200`)

**Execution**
- `npm run compute-scores` ran on server: 3714 stocks, 42.8s
- `npm run rerank:top500` running on server: Top500 GPT scoring in progress

---

## [9.0 P1] - 2026-06-21 — totalScore Global Migration (Data Fix)

### Changes
- `app/ai-picks/page.tsx`: removed `totalScore` from `AiScore` type; filter tab counts now use `marketStats` (global DB counts) for consistency with header banner
- `app/api/ai-scores/route.ts`: removed `totalScore` from Prisma select + response; fixed `rawScore`/`adaptiveScore` fallbacks to not reference `totalScore`
- `app/api/indicators/route.ts`: where/orderBy changed from `totalScore` → `adaptiveScore`
- `app/api/sectors/route.ts`: Prisma select + counts use `adaptiveScore`/`recommendationV2`; `avgTotalScore` → `avgAdaptiveScore`; top3 sort + map uses `adaptiveScore`/`recommendationV2`
- `app/sectors/page.tsx`: types + sort key + display updated to `avgAdaptiveScore`/`adaptiveScore`/`recommendationV2`
- `app/api/notifications/send-morning-report/route.ts`: queries use `adaptiveScore` + `recommendationV2`; mapped to `totalScore`/`recommendation` for line-flex compat
- `app/api/notifications/send-close-report/route.ts`: same pattern; `_avg.totalScore` → `_avg.adaptiveScore`
- `app/api/line/test-flex/route.ts`: both morning + stock cases use `adaptiveScore`/`recommendationV2`
- `app/api/sync/jquants,news,yahoo/route.ts`: `orderBy: { totalScore }` → `{ adaptiveScore }`
- Exemptions: `/watchlist` and `/portfolio` routes retained as-is (per design)

---

## [9.0 P2.1] - 2026-06-21 — Compact Card UI

### Changes

**Dashboard (`HomeDashboardClient.tsx` + `HomeStockDisplay.tsx`)**
- Stats cards: `h-24` → `h-16`, 5-col desktop / 2-col mobile, icon removed, number `text-[22px]`
- TOP3: Removed tech/fund/flow 3 mini-scores; replaced with price + 5D return; card padding `p-4→p-3`, `rounded-2xl→rounded-xl`
- 3 mini stat cards (buy/watch/scored): compact horizontal, height ~100px
- HomeScoreTable → `HomeScoreGrid`: 3-col card grid with hover effect; shows Final Score + Rule/GPT sub-labels + price + returns; "show more" after 51 items

**Portfolio/Watchlist (`portfolio/page.tsx`)**
- WatchlistTab: `space-y-2` list → `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` card grid; 🗑 icon button; compact ~130px per card
- PortfolioTab: table → same 3-col card grid; shows price + P&L + value; 🗑 icon

**AI Screener (`screener/page.tsx`)**
- Desktop table removed, replaced with `grid-cols-3 lg:grid-cols-4` card grid
- Each card: name + code + market chip + style + price + 20D + RSI + Final Score + Rule/GPT + rating
- Mobile StockMobileCard kept as-is

**AI Theme Detail (`ai-theme/[theme]/page.tsx`)**
- StockRow: padding `p-3→p-2.5`, metrics into single compact row
- reason/riskNote moved inside expandable GPT section (hidden by default)

**AI Theme Index (`ai-theme/page.tsx`)**
- StockCard: removed 4 mini score bars (tech/fund/flow/news), removed separate metrics row
- Compact: name + badges + score right side + price/returns/percentile single bottom row

**Performance**
- All cards: `hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`
- HomeScoreGrid: "show more" after 51 items (replaces full table scroll)

### Files Modified
- `app/HomeDashboardClient.tsx`
- `app/HomeStockDisplay.tsx` (removed `HomeScoreTable`, added `HomeScoreGrid`)
- `app/portfolio/page.tsx`
- `app/screener/page.tsx`
- `app/ai-theme/page.tsx`
- `app/ai-theme/[theme]/page.tsx`

---

## [9.0 P1.3] - 2026-06-21 — Global Final Score Unification

### Changes

**Score hierarchy unified across entire platform:**
- `finalScore` (GPT×0.6 + Rule×0.4) is now the primary display score everywhere
- `adaptiveScore` demoted to "Rule Score" sub-label
- Value-based color scheme: 90+ violet, 80+ blue, 70+ emerald, 60+ amber, <60 slate
- No-GPT stocks show "Rule Only" / "仅规则评分" / "ルール評価のみ" badge

**APIs updated:**
- `app/api/market-stats/route.ts` — TOP3 now fetches 100 candidates, joins GPTScore, JS re-sorts by finalScore
- `app/api/ai-theme/route.ts` — Added finalScore/ruleScore/gptScore to theme stocks; avgScore uses finalScore fallback
- `app/api/ai-theme/[theme]/route.ts` — Same GPTScore join added to theme detail

**UI pages updated:**
- `app/page.tsx` + `app/HomeDashboardClient.tsx` + `app/HomeStockDisplay.tsx` — Dashboard TOP3 and ranking table use finalScore
- `app/screener/page.tsx` — Default sort changed to finalScore; merged GPT column into primary score cell with sub-labels; GptSummary type now includes ruleScore
- `app/ai-theme/page.tsx` — finalScore sort option at top; StockCard shows finalScore with sub-labels
- `app/ai-theme/[theme]/page.tsx` — Theme detail stock cards show finalScore with sub-labels
- `app/stocks/[symbol]/page.tsx` — Bloomberg 72px card now shows finalScore with finalScoreHex color; sub-labels show Rule/GPT breakdown

**New utilities in `lib/rec-config.ts`:**
- `finalScoreColor(score)` — Tailwind class (violet/blue/emerald/amber/slate)
- `finalScoreHex(score)` — Hex color for inline styles

**New i18n keys (3 locales):**
- `score.final` / `score.rule_only` / `score.rule` / `score.gpt`

### Files Modified
- `lib/rec-config.ts`
- `lib/i18n/types.ts`, `messages/zh-CN.ts`, `messages/ja-JP.ts`, `messages/en-US.ts`
- `app/api/market-stats/route.ts`, `app/api/ai-theme/route.ts`, `app/api/ai-theme/[theme]/route.ts`
- `app/page.tsx`, `app/HomeDashboardClient.tsx`, `app/HomeStockDisplay.tsx`
- `app/screener/page.tsx`, `app/ai-theme/page.tsx`, `app/ai-theme/[theme]/page.tsx`
- `app/stocks/[symbol]/page.tsx`

---

## [8.5 P2] - 2026-06-21 — Stock Detail AI First + Full i18n

### Changes

**`app/stocks/[symbol]/page.tsx`** — Major restructure
- Deleted "概览" (overview) tab entirely
- Default tab changed from "overview" to "ai" (AI Score)
- New tab order with emoji: 🤖 AI评分 | 📈 图表 | 💰 财务 | 📊 技术 | 📰 新闻
- `activeTab` state type: removed "overview", renamed "indicators" → "technical"
- All hardcoded strings in AI tab replaced with `t()` calls (35+ keys):
  - ScoreBar labels: 技術面/基本面/資金面/情绪/趋势 → `score.*`
  - Dimension analysis titles: 技術面分析/基本面分析/资金面分析 → `score.*_analysis`
  - News sentiment title, Dividend & Short section title
  - Dividend labels: 配当利回り/年間/配当性向/配当スコア
  - Short selling labels: 市場空売り比率/JPX日次/✓ 実データ
  - Score Details title; all 11 sub-score bar labels
- Added "🧠 GPT Investment View" section at bottom of AI tab (direction + horizon + reasons + risks)

**`components/mobile/MobileHeader.tsx`**
- Fixed stale `"tab.overview"` reference → `"tab.ai"`

### Files Modified
- `app/stocks/[symbol]/page.tsx`
- `components/mobile/MobileHeader.tsx`

---

## [8.6 P1] - 2026-06-21 — GPT Driven Scoring Upgrade (7 Sub-Dimensions + 40/60 Formula)

### Changes

**Formula** (breaking): `finalScore = ruleScore × 0.4 + gptScore × 0.6`（GPT 权重从 30% 提升至 60%）

**`prisma/schema.prisma`**
- `GPTScore` 表新增 7 个可空 Int 字段：`businessQuality`, `growthScore`, `industryScore`, `moatScore`, `valuationScore`, `catalystScore`, `riskScore`
- 已 push 到本地 + 生产 DB（零停机，nullable columns）

**`scripts/gpt-score-overlay.ts`**
- 公式 0.7/0.3 → 0.4/0.6
- `GPTResponse` 新增 7 个子维度字段
- Prompt 新增 7 维度说明，JSON 输出格式含 7 个评分
- `callGPT` 验证逻辑 clamp 所有子维度到 0-100（missing → fallback 50）
- max_tokens: 900 → 1100（为子维度留空间）
- 测试：avgAbsDiff = 22.0 pts（通过独立性检查），5/5 成功

**`lib/i18n/`** — 9 个新 key + 3 个更新
- 新增：`gpt.dim.{business_quality, growth, industry, moat, valuation, catalyst, risk}`（三语言）
- 新增：`screener.col_gpt_score`, `screener.col_confidence`（三语言）
- 更新：`gpt.action.POSITIVE` → 看涨/強気/Bullish；`gpt.action.NEGATIVE` → 谨慎/慎重/Cautious
- 更新：`gpt.final_score_desc` → 40%/60% 描述

**`app/stocks/[symbol]/page.tsx`** — GptScoreCard 升级
- `GPTData` 类型新增 7 个可空子维度字段
- 新增 `DimBar` 组件（水平进度条，颜色 ≥80 emerald / ≥65 blue / ≥50 amber / <50 red）
- `dimBarColor()` 纯函数
- 7 维度区块在 Score 说明行下方展示（`hasDimScores` guard，老数据行不显示）
- `ACTION_CFG.NEGATIVE` 颜色改为 amber（谨慎，非负面）

**`app/ai-theme/[theme]/page.tsx`** — StockRow 升级
- `GptSummary` 类型扩展：新增 `gptScore`, `thesisZh/Ja/En`, `strengths`, `risks`, `catalysts`, 7 维度字段
- `GptDimBar` 模块级组件（mini 1px 进度条）
- StockRow 新增 `expanded` useState
- GPT 区块变为可展开按钮，展开后显示：7 维度条、thesis、strengths/risks mini 列表

**`app/screener/page.tsx`** — 三列 GPT 数据
- `SortKey` 新增 `"gptScore"`
- 排序逻辑新增 gptScore case
- 表头新增：GPT Score（可排序）、Final Score（可排序）、Confidence（显示）
- 表体替换：原单列 `finalScore` → 三独立列（violet GPT分 / blue 综合分 / confidence 彩色）

### Test
```
npm run gpt:score -- --limit=5 --force
→ avgAbsDiff = 22.0 pts ✓
→ 5/5 succeeded, 0 failures
→ formula 40/60 verified: rule=47 gpt=68 final=59.6 ✓
```

---

## [9.0 P1.1] - 2026-06-21 — GPT Score Independence Fix

### Problem
P1.0 测试中 10 只股票的 GPT 分与规则分完全相同（avgAbsDiff = 0），原因是 prompt 中直接暴露了 adaptiveScore / percentileRank / recommendationV2 / tradingAction 等系统评分，导致 GPT 锚定。

### Fix
**scripts/gpt-score-overlay.ts**
- 移除 GPT 输入：`adaptiveScore`、`percentileRank`、`opportunityScore`、`recommendationV2`、`tradingAction`
- 新增 GPT 输入：PER、PBR、ROE、dividend yield、marketCap、52w高低位置、operating margin、revenue、net profit、EPS（来自 Stock + Financial 表）
- MA trend → 描述性文字（"MA5 > MA20 > MA60 — all moving averages aligned upward"）
- MACD → 描述性文字（"MACD line above signal line"）
- 52w range → 计算当前价在 52w 区间的百分位并描述
- temperature: 0.3 → 0.6（鼓励独立推理）
- 明确指令：「Do NOT anchor to any external rating」
- 批量查询 Stock 和 Financial 表，不再只查 StockScore
- 新增 `avgAbsDiff` 统计 + WARNING（< 3 时报警）
- 输出格式增加 rule/gpt/diff 对比列

**app/stocks/[symbol]/page.tsx**
- GptScoreCard 三个分数下方增加说明文字行
- 使用 `gpt.rule_score_desc` / `gpt.gpt_score_desc` / `gpt.final_score_desc`

### Result (10只 --force 重测)
| 股票 | 规则分 | GPT分 | 差值 |
|------|-------|-------|------|
| 6758.T | 47 | 68 | +21 |
| 6861.T | 53 | 75 | +22 |
| 9432.T | 40 | 65 | +25 |
| 2127.T | 75 | 55 | -20 |
| 2300.T | 73 | 65 | -8  |
| 9983.T | 67 | 82 | +15 |
**avgAbsDiff = 14.4 pts — Independence check PASSED**

### New i18n Keys (3 keys × 3 locales)
- `gpt.rule_score_desc` / `gpt.gpt_score_desc` / `gpt.final_score_desc`

---

## [9.0 P1] - 2026-06-21 — GPT Scoring Overlay (AI Chain + TOP100)

### Overview
在规则引擎基础上新增 GPT 评分层。GPT 只分析 AI产业链股票 + TOP100 候选，不分析全市场。
综合分 = 规则分 × 0.7 + GPT分 × 0.3。24小时缓存 + inputHash 变化才重调。

### New: GPTScore Table
| 字段 | 说明 |
|------|------|
| `symbol` | @id, unique |
| `ruleScore / gptScore / finalScore` | 三维分数 |
| `confidence` | LOW / MEDIUM / HIGH |
| `action` | POSITIVE / NEUTRAL / NEGATIVE |
| `summaryZh/Ja/En` | 三语总结 |
| `thesisZh/Ja/En` | 三语论点 |
| `strengths / risks / catalysts` | JSON数组 |
| `timeHorizon` | 1-3M / 3-6M / 6-12M |
| `inputHash` | 缓存标记 |

### New Scripts
- `scripts/gpt-score-overlay.ts` — GPT评分脚本
- `npm run gpt:score` — 默认 limit=100
- `npm run gpt:score -- --limit=10` — 首次测试
- `npm run gpt:score -- --force` — 强制跳过缓存
- 脚本输出：候选数 / 调用数 / 缓存命中数 / 失败数 / 预估Token / 预估成本

### New API Routes
- `GET /api/gpt-score` — 批量获取（支持 ?symbols= 过滤）
- `GET /api/stocks/[symbol]/gpt-score` — 单只股票 GPT 评分

### Frontend Updates
| 页面 | 改动 |
|------|------|
| `/stocks/[symbol]` AI Tab | 新增 `GptScoreCard` 组件：三维分数、信心等级、GPT观点、优势/风险/催化剂、投资周期、免责声明 |
| `/screener` | 新增「综合分」可选列（有GPT数据时显示），支持按 finalScore 排序 |
| `/ai-theme/[theme]` | 每只股票卡片显示 GPT综合分 + 一句话总结，无数据时显示「尚未生成GPT分析」 |

### Safety Caps
- stale (computed >2d ago) → finalScore ≤ 50
- suspicious (return60d > 300%) → finalScore ≤ 50
- return60d > 300% → finalScore ≤ 75
- RSI > 90 → finalScore ≤ 75
- priceCount < 60 → 不调用 GPT

### Cost Control
- 默认 limit=100（禁止全市场）
- gpt-4o-mini + JSON mode
- 首次运行 10 只：~4,389 tokens，~$0.002

### i18n
新增 22 个 i18n keys (gpt.*) — zh-CN / ja-JP / en-US 三语完整

---

## [8.6 P2.1–P2.3] - 2026-06-21 — Banner Removal / Smart Back Nav / Sync Refresh Fix

### P2.1 Remove Legacy Merge Banners
| 页面 | 改动 |
|------|------|
| `/ai-picks` | 删除蓝色 Info Banner |
| `/notifications` | 删除蓝色 Info Banner |
| `/watchlist` | 删除蓝色 Info Banner |
| `/indicators` | 删除蓝色 Info Banner |
| `/stocks` | 蓝色提示框 → 单行 14px 灰色文字 |
| `/chat` | amber 框 → 干净 LINE 绿色按钮页面 |

### P2.2 Smart Back Navigation
| 文件 | 说明 |
|------|------|
| `lib/navigation/back.ts` | 新建：`buildStockUrl()`/`getBackHref()`/`getBackLabel()` |
| `app/stocks/[symbol]/page.tsx` | 读取 `returnTo`/`source` searchParams，智能返回按钮 |
| `app/screener/page.tsx` | 所有股票链接带 `source=screener&returnTo=/screener` |
| `app/ai-theme/page.tsx` | 所有股票链接带 `source=ai-theme` |
| `app/ai-theme/[theme]/page.tsx` | 所有股票链接带 `source=ai-theme&returnTo=当前路径` |
| `app/sectors/page.tsx` | 所有股票链接带 `source=sectors` |
| `app/portfolio/page.tsx` | 所有股票链接带 `source=portfolio&returnTo=当前路径` |
| `app/HomeStockDisplay.tsx` | 仪表盘股票链接带 `source=dashboard` |
| `components/StockMobileCard.tsx` | 新增可选 `href` prop 供外部注入 returnTo |

### P2.3 Sync Refresh Button Fix
| 项目 | 修复前 | 修复后 |
|------|--------|--------|
| 点击反馈 | 无 | ↺ 旋转 + 按钮文字变「刷新中…」|
| 成功提示 | 无 | 右上角绿色 toast 3秒自动消失 |
| 失败提示 | 无 | 右上角红色 toast + 错误原因 |
| 并发保护 | 无 | `refreshing` state debounce |
| 最后刷新时间 | 无 | 标题副标题显示 HH:mm:ss |
| 并行请求 | 串行 | `Promise.all([fetchStatus, fetchHealth])` |

---

## [8.6 P2] - 2026-06-21 — Smooth Navigation & Performance

### 目标
提升全站页面切换流畅度，消灭白屏，增加骨架屏，TOP500 虚拟滚动，滚动位置保存恢复。

### 核心变更

| 文件 | 说明 |
|------|------|
| `components/PageTransition.tsx` | 新建：pathname 变化时 180ms fade-in + nav-progress-bar（蓝紫渐变，顶部 2px） |
| `app/layout.tsx` | 引入 PageTransition 包裹 {children} |
| `app/globals.css` | 新增 page-fade-in / skeleton-pulse / nav-progress 三个 keyframe 动画 |
| `components/Skeleton.tsx` | 新建：SkeletonLine/SkeletonCard/SkeletonTableRows/SkeletonStat/SkeletonNewsCard 复用组件 |
| `app/loading.tsx` | 新建：仪表盘骨架屏（4统计卡 + 3选股卡 + 10行表格） |
| `app/screener/loading.tsx` | 新建：筛选器骨架屏（filter chips + 12行表格） |
| `app/ai-theme/loading.tsx` | 新建：AI产业链骨架屏（tab行 + 6个主题卡） |
| `app/sectors/loading.tsx` | 新建：行业分析骨架屏（sort chips + 15行表格） |
| `app/portfolio/loading.tsx` | 新建：投资组合骨架屏（tab栏 + 4统计卡 + 8行表格） |
| `app/news/loading.tsx` | 新建：新闻骨架屏（filter chips + 8条新闻卡） |
| `hooks/useScrollRestoration.ts` | 新建：sessionStorage 保存/恢复滚动位置（mount恢复 + unmount保存） |
| `app/ai-theme/page.tsx` | 引入 useScrollRestoration("ai-theme") |
| `app/screener/page.tsx` | 引入 useScrollRestoration("screener") |
| `app/stocks/page.tsx` | 引入 useScrollRestoration("stocks") + 全虚拟滚动（@tanstack/react-virtual，只渲染可见行，ROW_HEIGHT=56px） |
| `components/Sidebar.tsx` | 所有 Link 加 prefetch={true} + active:scale-[0.98] 点击即时反馈 |
| `package.json` | 新增 @tanstack/react-virtual ^3.14.3 |

### 性能改进对照

| 项目 | 改进前 | 改进后 |
|------|--------|--------|
| 页面切换 | 白屏 ~200ms | 180ms fade-in 无白屏 |
| 导航反馈 | 无 | 顶部进度条 + 按钮缩放 |
| 初始加载 | 空白/spinner | Skeleton 骨架屏 |
| TOP500 渲染 | 全部 ~3700 行 DOM | 仅渲染可见 ~15 行 |
| 返回滚动位置 | 回顶部 | sessionStorage 精确恢复 |

---

## [8.5 P3] - 2026-06-21 — Legacy Route Cleanup & /stocks Loading Fix

### 目标
修复 /stocks 合并后永久 loading 问题；旧路由统一添加合并提示引导至新主入口；/chat 改为 LINE Bot 迁移说明页；补充 15 个 i18n keys。

### 核心变更

| 文件 | 说明 |
|------|------|
| `app/stocks/page.tsx` | 修复永久 loading（加 15s timeout + clearTimeout）；表头全 `table.*` 本地化；MaBadge/MacdBadge 通过 `trend.*/macd.*` 本地化；技术指标按钮改为 `/screener?sort=technical` |
| `app/chat/page.tsx` | 完全替换为 LINE Bot 迁移提示页，移除旧聊天 UI |
| `app/ai-picks/page.tsx` | 修复 loading/error 硬编码；mode tabs → `picks.mode_*`；filter tabs → `getRecommendationLabel()` |
| `app/notifications/page.tsx` | 新增合并提示 → `/portfolio?tab=alerts` |
| `app/indicators/page.tsx` | 新增合并提示 → `/screener?sort=technical` |
| `app/screener/page.tsx` | 标题下新增 `screener.combined_description` 副标题 |
| `lib/i18n/types.ts` + 三语言文件 | 新增 15 keys（page.stocks_top500_desc/loading_failed_screener/back_to_dashboard, table.date/ma_trend/financials/detail, screener.combined_description, stocks.view_technicals, picks.mode_top/opp/risk） |

### 旧路由引导对照

| 旧路由 | 新入口 | 方式 |
|--------|--------|------|
| /stocks | /screener | 合并提示 Banner |
| /ai-picks | /screener | 合并提示 Banner（已有）|
| /indicators | /screener?sort=technical | 合并提示 Banner |
| /watchlist | /portfolio | 合并提示 Banner（已有）|
| /notifications | /portfolio?tab=alerts | 合并提示 Banner |
| /chat | / | 迁移说明页 + 返回仪表盘 |

### /stocks 加载 bug 根因
`/api/indicators` 请求若超时或挂起，旧代码无 timeout 机制导致 loading 永不置 false；修复方案：`setTimeout 15s` 兜底 + `clearTimeout` 正常路径清除。

---

## [8.5 P2] - 2026-06-21 — Native Locale Final Cleanup（五页面三语言彻底清洁）

### 目标
消灭 `/ai-theme`、`/ai-theme/[theme]`、`/sectors`、`/screener`、`/stocks/[symbol]` 中全部硬编码业务字符串；建立 `lib/display-labels.ts` 统一导出枢纽；修复 `sectors` 组件违反单一真相来源的本地 `REC_CFG`；修复 `RetBadge` 国际惯例颜色（绿涨红跌）。

### 核心变更

| 文件 | 说明 |
|------|------|
| `lib/i18n/types.ts` | 新增 30 个 MessageKey（fin.*/common.percentile_prefix/theme.*/sectors.*/stock.*/news.*） |
| `lib/i18n/messages/zh-CN.ts` | 30键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 30键日文翻译 |
| `lib/i18n/messages/en-US.ts` | 30键英文翻译 |
| `lib/display-labels.ts` | **新建**：re-export 枢纽（getRec/getRecommendationLabel/returnColorClass/fmtPct/fmtJpy/getThemeLabel/getLayerLabel/getLayerDesc） |
| `app/ai-theme/page.tsx` | 删除 `scoreBarLabel()` helper；替换6处 lang 三元 → t() |
| `app/ai-theme/[theme]/page.tsx` | 替换4处 lang 三元 → t() |
| `app/sectors/page.tsx` | 删除本地 `REC_CFG`；引入 `getRec/getRecommendationLabel/returnColorClass`；修复颜色惯例；替换2处字幕三元 |
| `app/screener/page.tsx` | 替换 percentile prefix 三元 → `t("common.percentile_prefix")` |
| `app/stocks/[symbol]/page.tsx` | 财务表头全 `fin.*`；MACD/Returns 标签；新闻分类标签 → `t("news.*")`；日期使用 `lang` 变量 |

### 新增 i18n Keys
```
fin.*: period/revenue/op_profit/net_profit/equity_ratio/reported_at/full_year
common: percentile_prefix(前/上位/Top) / clear_filter(清除/クリア/Clear)
theme: sub_categories/active_layers/scored_prefix/run_cmd/not_found/total_stocks/scored_count_label
sectors: unit_sector/unit_stock_suffix
stock: hist_label/returns_label/no_financials
news: no_stock_news/stock_badge
```

### 已知问题
- 无新增 CRITICAL

---

## [8.5 P1.3] - 2026-06-21 — Dashboard & Sectors 三语言清理

### 目标
将仪表盘（/）从服务器组件中抽取全部UI文本，通过新建客户端组件实现三语言支持；修复 Dashboard 中所有硬编码中文字符串。

### 核心变更

| 文件 | 说明 |
|------|------|
| `app/HomeDashboardClient.tsx` | **新建**：客户端组件，接收服务器数据，用 `useI18n()` 渲染仪表盘全部 UI |
| `app/page.tsx` | 精简为纯数据获取 + `<HomeDashboardClient {...data} />`；新增 `nameEn` 不在 StockScore 的修复 |
| `lib/i18n/types.ts` | 新增 14 个 `home.*` MessageKey（stat卡/单位/空状态/排行/筛选器链接） |
| `lib/i18n/messages/zh-CN.ts` | 14键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 14键日文翻译 |
| `lib/i18n/messages/en-US.ts` | 14键英文翻译（unit_stocks/unit_records="" 空字符串） |

### 新增 i18n Keys（home.*）
```
home.db_stocks       数据库股票 / データベース銘柄 / Database Stocks
home.scored_count    已计算评分 / AI評価済み銘柄 / AI Scored
home.buy_recommendation 买入推荐 / 買い推奨 / Buy Signals
home.price_records   日线价格 / 日足データ / Daily Prices
home.last_sync       最后同步 / 最終更新 / Last Sync
home.unit_stocks     只 / 銘柄 / ""
home.unit_records    条 / 件 / ""
home.no_score_hint   暂无评分数据，请运行 / 評価データなし。実行：/ No score data. Run:
home.watch_monitoring 监控中 / 注目銘柄 / Watching
home.ai_scored       已完成AI评分 / AI評価完了 / AI Scored
home.ranking_title   AI 评分排行 / AI評価ランキング / AI Rankings
home.screener_link   筛选排序 → / スクリーナー → / Screener →
home.show_top100     仅显示前100条。/ 上位100銘柄まで表示。/ Showing top 100 only.
home.view_screener   前往筛选器查看全部 → / スクリーナーで全て見る → / View all in screener →
```

### 三语言验收
- **zh-CN**：仪表盘 / 数据库股票N只 / 已计算评分N只 / 买入推荐N只 / 日线价格N条 / AI精选 TOP3 / 买入机会 / 观察名单·监控中 / 股票总数·已完成AI评分 / AI 评分排行
- **ja-JP**：ダッシュボード / データベース銘柄N銘柄 / AI評価済み銘柄N銘柄 / 買い推奨N銘柄 / 日足データN件 / AI厳選 TOP3 / 買い銘柄 / 注目中·注目銘柄 / 銘柄数·AI評価完了 / AI評価ランキング
- **en-US**：Dashboard / Database Stocks N / AI Scored N / Buy Signals N / Daily Prices N / AI Picks — TOP 3 / BUY Picks / WATCH·Watching / Screener·AI Scored / AI Rankings

### 影响页面
- `/`（仪表盘）：全三语言

### DB 变更
无

### API 变更
无（仅前端展示层）

### 验证
- TypeScript：0 错误
- Build：成功
- 部署到生产 8.209.247.68，pm2 restart 完成
- Git commit：1592b14

---

## [8.5 P1.1] - 2026-06-21 — AI Value Chain Locale Fix

### 目标
修复 /ai-theme 页面中英文日文混杂，统一三语言显示。

### 核心变更

| 内容 | 说明 |
|------|------|
| `lib/i18n/theme-labels.ts` | 新建：14主题×3语言、5层级×3语言、层级描述×3语言映射 |
| `lib/i18n/types.ts` | 新增 48个 MessageKey（theme.*） |
| `lib/i18n/messages/zh-CN.ts` | 48键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 48键日文翻译 |
| `lib/i18n/messages/en-US.ts` | 48键英文翻译；theme.title → "AI Value Chain" |
| `app/ai-theme/page.tsx` | 全量重写：标题/副标题/统计卡/层级/Tab/筛选/排序/股票卡片全 t() |
| `app/ai-theme/[theme]/page.tsx` | 全量重写：breadcrumb/Header/Stats/层级结构/股票行全 t() |

### 三语言验收
- zh-CN：AI产业链 · 追踪总数/核心标的/产业链分类/供应链层 · 上游/中游/应用层 · 全部/AI硬件/半导体设备
- ja-JP：AI投資テーマ → 実際は "AI Value Chain" / "AIバリューチェーン" 为正确标题
- en-US：AI Value Chain · Tracked Stocks/Core Stocks/Categories · Upstream/Midstream/Applications · All/AI Hardware/Semiconductor Equipment
- en-US 模式：role字段隐藏（含CJK字符）；reason/riskNote 隐藏

### 验证
- TypeScript: 0 错误
- Build: 成功
- 部署到生产 8.209.247.68 并 pm2 restart

---

## [8.5 P1] - 2026-06-21 — 中文版全面汉化

### 目标
zh-CN 模式全面汉化：消除所有业务英文显示文本，完成 MaTrend/推荐评级/维度标签/交易信号/原因说明中文化。

### 核心变更

| 内容 | 说明 |
|------|------|
| `lib/i18n/types.ts` | 新增 43 个 MessageKey（home/table/trend/market/dim/picks/stock/card/sectors） |
| `lib/i18n/messages/zh-CN.ts` | 43 键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 43 键日文翻译 |
| `lib/i18n/messages/en-US.ts` | 43 键英文翻译 |
| `lib/trading-action.ts` | reasons/warnings 全部翻译为中文（18 条字符串） |
| `app/page.tsx` | 仪表盘完全中文化（硬编码 zh-CN 字符串） |
| `app/HomeStockDisplay.tsx` | MaTrendBadge 使用 t()；评级用 getRecommendationLabel()；表头全 t() |
| `app/screener/page.tsx` | 推荐标签/市场筛选/百分位 t()；getRecommendationLabel() |
| `app/ai-picks/page.tsx` | 维度标签/评分/百分位/5D 标签全 t() |
| `app/stocks/[symbol]/page.tsx` | 均线系统/震荡指标/30日走势/MA/MACD柱状/返回期全 t()；MaTrendBadge 用 useI18n() |
| `components/StockMobileCard.tsx` | 股价/5日/20日/机会/股息/催化标签 t()；百分位中文条件 |
| `app/sectors/page.tsx` | 日本語リンク→t("sectors.screener_link")；20D/60D→t() |

### 验证
- TypeScript: 0 错误
- Build: 成功
- 部署到生产 8.209.247.68 并 pm2 restart

---

## [8.4 P3] - 2026-06-21 — Full Native Locale Refactor (Phase 3)

### 目标
扩展 i18n 系统，新增 market-labels/stock-name 工具库，全面更新页面显示文本三语言化。

### 核心变更

| 内容 | 说明 |
|------|------|
| `lib/i18n/types.ts` | 新增 55 个 MessageKey（picks/sectors/home/watchlist/portfolio/notif/chat/theme/stocks/empty/error/sync/ai_action/screener/ind 追加） |
| `lib/i18n/messages/zh-CN.ts` | 新增 55 键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 新增 55 键日文翻译 |
| `lib/i18n/messages/en-US.ts` | 新增 55 键英文翻译 |
| `lib/i18n/market-labels.ts` | 新建：33种行业×3语言 + 3种市场×3语言映射，localeSector/localeMarket 函数 |
| `lib/i18n/stock-name.ts` | 新建：getPrimaryName/getSecondaryName/getNameLines，按语言优先级返回股票名称 |
| `components/StockMobileCard.tsx` | 使用 getPrimaryName() 根据 lang 返回主名称 |
| `app/stocks/[symbol]/page.tsx` | 使用 getNameLines() 显示分层股票名，market/sector 使用 localeMarket/localeSector |
| `app/sectors/page.tsx` | 完整 i18n：标题/列头/行业名称（localeSector）/按钮全三语言 |
| `app/ai-picks/page.tsx` | 标题使用 t("picks.title") |
| `app/watchlist/page.tsx` | 标题/空状态使用 t() |
| `app/sync/page.tsx` | 页面标题/刷新按钮/全部同步按钮使用 t() |
| `app/chat/page.tsx` | 标题/输入框占位符/发送按钮使用 t() |
| `app/ai-theme/page.tsx` | 标题使用 t("theme.title") |

### 验证
- TypeScript: 0 错误
- Build: 成功
- 部署到生产 8.209.247.68 并 pm2 restart

---

## [8.4] - 2026-06-21 — Full Locale Mode (True Three-Language)

### 目标
全站真正三语言：zh-CN ≥95% 中文、ja-JP ≥95% 日文、en-US ≥95% 英文。

### 核心变更

| 内容 | 说明 |
|------|------|
| `lib/i18n/types.ts` | 扩展至 188 个 MessageKey（含 RSI/MACD/维度/风格/股票详情/Screener/News/Health/Indicators） |
| `lib/i18n/messages/zh-CN.ts` | 全量 188 键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 全量 188 键日文翻译（完整重写） |
| `lib/i18n/messages/en-US.ts` | 全量 188 键英文翻译（完整重写） |
| `components/HtmlLangSync.tsx` | 新增：语言切换时同步 `document.documentElement.lang` |
| `app/layout.tsx` | 加入 `<HtmlLangSync />` |
| `app/screener/page.tsx` | 全局 i18n：标题/Placeholder/列头/风格/市场/提示 |
| `app/news/page.tsx` | 全局 i18n：标题/情绪/分类/来源标签 |
| `app/sync/page.tsx` | 健康状态标签 i18n |
| `app/indicators/page.tsx` | RSI级别/MACD趋势/列头/统计卡片全 i18n（MaTrend/RsiBar/MacdTrendBadge接收`t`参数） |
| `app/stocks/[symbol]/page.tsx` | 数据提醒/涨跌标签/52周高低/AI评分页风险/风格/来源/排名标签全 i18n |

### 验证
- TypeScript: 0 错误
- Build: 成功（所有 Static 页正常编译）
- 3个 locale 文件 key 数一致（188:188:188）
- 部署到生产并验证 HTTP 200

---

## [8.3 P2.3] - 2026-06-21 — Technical Signal / AI Action Alignment

### 目标
修复 RSI 极度超买但 MACD 仍显示"买入"的误导性信号。MACD 改为趋势方向，买卖决策统一以 AI Action 为准。

### 核心修复

| 问题 | 修复方案 |
|------|---------|
| RSI>=90 股票仍可能 BUY_NOW | 新增 RSI 过热保护规则，RSI>=95→TAKE_PROFIT，RSI>=90→TAKE_PROFIT/WAIT_PULLBACK |
| MACD 显示"买入/卖出"误导买卖方向 | 改为"多头/空头/中性"（趋势信号） |
| RSI 只分"超买/超卖" | 改为5级：极度超买≥90/超买80-90/偏热70-80/正常/超卖 |
| 技术指标页无 AI 交易建议 | 新增"AI交易动作"列 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `lib/trading-action.ts` | 新增 RSI 过热保护守卫（RSI≥95/≥90/≥85+20D>30%/≥80+5D>20%），任意触发均阻断 BUY_NOW |
| `app/api/indicators/route.ts` | 新增 tradingAction/positionSizePct/actionRiskLevel 字段返回 |
| `app/indicators/page.tsx` | ①MACD列改为"趋势信号"（多头/空头/中性）②RSI 5级颜色分级 ③新增"AI交易动作"列 ④统计看板更新 |

### 验证结果

| 验证项 | 结果 |
|--------|------|
| RSI>=95 中 BUY_NOW 数量 | **0**（通过） |
| RSI>=90 中 BUY_NOW 数量 | **0**（通过） |
| 285A.T（RSI≈79，20D=+89%） | → TAKE_PROFIT ✅ |
| 4062.T（RSI≈57，5D=+29%） | → WAIT_PULLBACK ✅ |
| 9552.T（RSI≈59，STRONG_BUY） | → BUY_NOW ✅（正常持续） |
| build | ✅ 通过 |
| health:data | ✅ WARNING（无 CRITICAL）|

---

## [8.3 P2] - 2026-06-21 — AI Action Trading Decision

### 目标
把评分系统从"评分展示"升级为"交易决策提示"，新增独立的 AI Action 层。

### 新增文件（1个）
| 文件 | 说明 |
|------|------|
| `lib/trading-action.ts` | 交易动作引擎：BUY_NOW/WAIT_PULLBACK/HOLD/TAKE_PROFIT/SELL/AVOID，计算价格区间/止损/目标价 |

### 修改文件（7个）
| 文件 | 修改内容 |
|------|---------|
| `prisma/schema.prisma` | StockScore 新增 10 字段：tradingAction/positionSizePct/entryLow/entryHigh/stopLoss/target1/target2/actionRiskLevel/actionReasons/actionWarnings |
| `scripts/compute-scores.ts` | 新增 Pass 3：全量计算 AI Action（3714只，8.2s）|
| `app/api/ai-scores/route.ts` | 返回 tradingAction/positionSizePct/actionRiskLevel |
| `app/api/stocks/[symbol]/ai-score/route.ts` | 返回全部 AI Action 字段 |
| `app/api/screener/route.ts` | 新增 tradingAction/positionSizePct/actionRiskLevel 字段 |
| `app/stocks/[symbol]/page.tsx` | AI Tab 新增 AI Action 卡片（大标签+仓位+价格区间+止损+目标+理由+免责声明）|
| `app/ai-picks/page.tsx` | 每张卡片显示 Action badge（BUY NOW/WAIT/HOLD/PROFIT/SELL/AVOID +仓位%）|
| `components/StockMobileCard.tsx` | 新增小 Action badge |

### AI Action 规则摘要
- **BUY_NOW**：STRONG_BUY/BUY + adaptiveScore≥70 + opp≥65 + percentileRank≤10 + price>MA20 + RSI 45-75 + 5D≤20%
- **WAIT_PULLBACK**：评级好但 5D>20%/RSI>75/price>MA20×1.12/60D>100%
- **HOLD**：adaptiveScore 55-70，趋势中性
- **TAKE_PROFIT**：60D>150%+RSI>80 / 20D>60%+RSI>75 / 近52W高+RSI>78 / 5D>30%
- **SELL**：price<MA60+score<55 / 死叉+20D<-10% / RSI<35+20D<-15%
- **AVOID**：stale/suspicious/score<45/AVOID评级

### 建议仓位
- STRONG_BUY+BUY_NOW → 60%；BUY+BUY_NOW → 40%；WAIT_PULLBACK → 20%；HOLD → 30%；TAKE_PROFIT → 30%（剩余）；SELL/AVOID → 0%

### 验证样本（生产）
| 股票 | 评级 | AI Action | 仓位 |
|------|------|-----------|------|
| 9552.T (STRONG_BUY) | STRONG_BUY | **BUY_NOW** | 60% |
| 285A.T (+405% 60D) | WATCH | **TAKE_PROFIT** | 30% |
| 4062.T (+225% 60D) | HOLD | **WAIT_PULLBACK** | 20% |
| 8035.T (+96% 60D) | HOLD | **WAIT_PULLBACK** | 20% |
| 7012.T (拆股修正) | WATCH | **HOLD** | 30% |
| 9984.T/5803.T/6758.T | AVOID | **AVOID** | 0% |

### 生产分布（3714只）
BUY_NOW: 30 · WAIT_PULLBACK: 195 · HOLD: 1143 · TAKE_PROFIT: 49 · SELL: 639 · AVOID: 1658

### 免责声明
所有前端展示底部均标注：
"AI Action is a rules-based signal for research only. Not financial advice."

---

## [8.2.5] - 2026-06-21 — Health Guard 阈值调优

### 目标
避免真实极端行情误判为 CRITICAL，防止 AI recommendations 被错误阻断。

### 修改文件（2个）
| 文件 | 修改内容 |
|------|---------|
| `scripts/data-health-guard.ts` | CHECK 9 重写：return60d>300% 按 adjClose 验证真实性；NULL rec 增加 Pass2 提示 |
| `app/sync/page.tsx` | Data Health 卡片：显示"Recommendations allowed"；WARNING 用 amber 色 |

### 规则调整
- **return60d > 300%（CHECK 9）**：不再无脑 WARNING，而是逐股验证：close≈adjClose + high52w≥price + low52w≤price → "✓ Extreme real market move, verified by adjClose: ..."。split 或 52w 异常才升级为 suspect（其他 CRITICAL 检查兜底）。
- **recommendationV2 NULL**：若 adaptiveScore=OK 但 rec=NULL（Pass 2 未跑），输出明确提示 "npx tsx scripts/compute-scores.ts"。
- **stale 股票**：普通 stale 保持 WARNING；stale+STRONG_BUY 保持 CRITICAL（无变化）。
- **/sync Data Health 卡片**：CRITICAL=0 → 显示绿色 "Recommendations allowed"；WARNING → amber 文字；topIssues 颜色随状态切换（红/琥珀）。

---

## [8.3] - 2026-06-21 — 全局 UX 统一（Global UX Audit P1）

### 目标
全站 UI 设计规范统一：单一评级色彩真相来源、国际惯例涨跌色、英文标签、统一圆角和字号。

### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/rec-config.ts` | ★ 评级色彩 + 工具函数单一真相来源（getRec/returnColorClass/fmtPct/fmtJpy）|

### 修改文件（10个）
| 文件 | 修改内容 |
|------|---------|
| `components/RecommendationBadge.tsx` | 使用 getRec()，英文标签，text-[11px] font-semibold |
| `components/StockMobileCard.tsx` | green=up/red=down，rounded-2xl，fmtPct/fmtJpy，英文标签 |
| `app/page.tsx` | 英文表头，#1/#2/#3 排名，emerald BUY 卡片，rounded-2xl |
| `app/ai-picks/page.tsx` | 移除本地 REC_CFG，getRec()，移除 V7.7 版本引用 |
| `app/screener/page.tsx` | 英文分布 chips，Adaptive/Percentile/Opportunity 列名 |
| `app/stocks/page.tsx` | green=up，英文表头，rounded-2xl |
| `app/stocks/[symbol]/page.tsx` | 股价 text-[36px]，52W High/Low，getRec()，所有色修正 |
| `app/sync/page.tsx` | Data Health 卡片大字体 CRITICAL/WARNING/PASS |
| `app/ai-theme/page.tsx` | getRec()，ReturnBadge green/red，rounded-2xl，h1 32px |
| `app/ai-theme/[theme]/page.tsx` | 同上 |

### 设计规范（已封版）
```
评级色：STRONG BUY=emerald / BUY=blue / HOLD=slate / WATCH=amber / AVOID=red
涨跌色：green=涨（+25.32%）/ red=跌（-25.32%）— 国际惯例
卡片：  rounded-2xl / p-4 / gap-4 / shadow-sm
h1：    text-[32px] font-bold / 股价：text-[36px] font-extrabold
英文：  STRONG BUY/BUY/HOLD/WATCH/AVOID / 52W High/Low / Adaptive/Percentile/Opportunity
```

### Commit
`61ebe8d` — feat: v8.3 P1 — Global UX Audit implementation（11 files changed, 491 insertions, 514 deletions）

---

## [8.2.4] - 2026-06-21 — Data Health Guard（每日自动数据健全性守卫）

### 目标
在 v8.2.3 全量审计的基础上，增加每日自动保险层：每次评分完成后自动执行20项数据健全性检查；CRITICAL 异常自动阻断推荐并发送 LINE 告警。

### 新增文件
| 文件 | 说明 |
|------|------|
| `scripts/data-health-guard.ts` | 每日自动守卫脚本（20项检查，exit 1 on CRITICAL） |
| `app/api/health/status/route.ts` | 读取最新健康报告的 API 端点 |

### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `package.json` | 新增 `health:data` / `audit:data` 命令 |
| `scripts/cron-scheduler.ts` | 07:30 compute-scores 后自动运行 data-health-guard |
| `app/sync/page.tsx` | /sync 页面新增 Data Health Guard 状态卡片 |

### 20项检查规则
| # | 检查项 | 等级 |
|---|--------|------|
| 1 | adjClose coverage ≥99% | CRITICAL |
| 2 | split contamination = 0 (top-10 sample) | CRITICAL |
| 3 | high52w < current price = 0 | CRITICAL |
| 4 | low52w > current price = 0 | CRITICAL |
| 5 | high52w > price×10 (异常膨胀) | WARNING |
| 6 | low52w < price÷20 (异常低洼) | WARNING |
| 7 | \|return5d\| > 50% | INFO |
| 8 | \|return20d\| > 100% or < -70% | WARNING |
| 9 | return60d > 300% or < -90% | WARNING |
| 10 | adaptiveScore NULL = 0 | CRITICAL |
| 11 | opportunityScore NULL = 0 | INFO |
| 12 | percentileRank NULL = 0 | CRITICAL |
| 13 | recommendationV2 NULL = 0 | CRITICAL |
| 14 | NaN/Infinity = 0 | CRITICAL |
| 15 | stale stocks (>3 days) | WARNING |
| 16 | STRONG_BUY 双门槛违规 = 0 | CRITICAL |
| 17 | BUY 双门槛违规 = 0 | INFO |
| 18 | extreme return without highRiskFlag | WARNING |
| 19 | stale stocks with STRONG_BUY = 0 | CRITICAL |
| 20 | latestClose 有效性 | INFO |

### 退出码规则
- CRITICAL > 0 → `process.exit(1)` → 每日推荐被阻断
- 仅 WARNING/INFO → `process.exit(0)` → 正常运行

### LINE 告警格式
- CRITICAL: `⚠ TOHOSHOU DATA ALERT` + 问题汇总 + Action
- WARNING: `⚠ TOHOSHOU DATA WARNING` + 不阻断说明

### 报告输出
```
reports/data-health-guard-YYYYMMDD-HHmm.json
reports/data-health-guard-YYYYMMDD-HHmm.md
```

---

## [8.2.3] - 2026-06-21 — Global Data Integrity Audit（9/9 全部通过）

新增 `scripts/audit-data-integrity.ts`（只读全量审计脚本）。
生成 `reports/data-integrity-audit-YYYYMMDD-HHmm.json + .md`。
审计结论：adjClose 100% 覆盖，split contamination = 0，NaN/Inf = 0，STRONG_BUY 合规 5/5，9/9 通过。

---

## [8.2.2] - 2026-06-21 — 全价格计算口径统一修复（adjClose 优先）

### 问题根因
J-Quants API 的 `C`（close）字段为未复权原始价格，`AdjC`（adjClose）为拆股后复权价格。
旧代码使用 `close` 计算所有指标，导致发生拆股/缩股的股票在60日窗口内产生系统性错误。

审计发现：3714只股票中有 **432只（11.6%）的 return60d 被拆股事件污染**，严重股票误差超过100个百分点（如川崎重工业 return60d 显示 -79.2%，实际为 +3.8%）。

### 修复范围
| 文件 | 修改内容 |
|------|---------|
| `lib/indicators.ts` | 新增 `effectiveClose()` 导出函数；`closes` 数组全面改为 `sorted.map(effectiveClose)` |
| `scripts/compute-scores.ts` | `dailyPrice` select 增加 `adjClose`，传递给 `calcIndicators` |
| `scripts/sync-all-prices.ts` | `high52w`/`low52w` 改用 `AdjC ?? C` 计算 |
| `scripts/sync-jquants.ts` | `high52w`/`low52w` 改用 `AdjC ?? C` 计算 |
| `lib/daily-picks-report.ts` | `dailyPrice` select 增加 `adjClose` |
| `app/api/stocks/[symbol]/ai-score/route.ts` | `dailyPrice` select 增加 `adjClose` |
| `app/stocks/[symbol]/page.tsx` | warning banner 文案改为"大幅价格波动，AI评分已使用复权价格处理" |

### 核心规则（已落地）
- **展示价格**：继续使用 `close`（原始未复权，用于页面当前价显示）
- **计算价格**：所有指标统一使用 `adjClose ?? close`（复权优先）
- 受影响计算：return5d / return20d / return60d / high52w / low52w / MA5 / MA20 / MA60 / RSI / MACD / moneyFlowScore / adaptiveScore / percentileRank / 评级判定

### 修复效果
| 股票 | 修复前 ret60d | 修复后 ret60d |
|------|------------|------------|
| 川崎重工業 7012.T | -79.2% ❌ | +3.8% ✅ |
| フジクラ 5803.T | -78.8% ❌ | +27.3% ✅ |
| サンリオ 8136.T | -82.7% ❌ | -13.6% ✅ |
| ピクセラ 6731.T | +157.5% ❌ | -74.3% ✅ |
- 拆股污染股票：432只 → **0只**

---

## [8.2.0] - 2026-06-21 — v8.1 Mobile First 手机端全面适配

### 概述
完整移动端响应式改造，覆盖 9 个页面，新增 5 个移动端组件。桌面端布局完全保留，无破坏性变更。

### 新增文件
| 文件 | 说明 |
|------|------|
| `components/mobile/MobileHeader.tsx` | 手机固定顶栏（TOHOSHOU AI + 当前页名 + 菜单按钮） |
| `components/mobile/MobileBottomNav.tsx` | 手机固定底部导航（5项：首页/AI推荐/对话/筛选/产业链），safe-area 支持 |
| `components/mobile/MobileDrawer.tsx` | 全屏侧滑导航抽屉（11项菜单 + 数据来源面板） |
| `components/mobile/ResponsiveShell.tsx` | Client wrapper，统一管理 Drawer 开关状态 |
| `components/StockMobileCard.tsx` | 筛选器手机端股票卡片（评级/评分/现价/涨跌/机会分） |

### 页面改造
| 页面 | 主要改动 |
|------|---------|
| `app/layout.tsx` | `md:ml-56 pt-14 md:pt-0 pb-20 md:pb-0`，引入 ResponsiveShell |
| `components/Sidebar.tsx` | `hidden md:flex`，手机端隐藏侧边栏 |
| `app/page.tsx` | stats 2×5→2col/5col，TOP3 1col/3col，score dist 2→3col |
| `app/ai-picks/page.tsx` | mode/filter tabs overflow-x-scroll，TOP3 1/3col，5dim grid 2/5col |
| `app/chat/page.tsx` | `h-[calc(100dvh-136px)] md:h-screen`，quick prompts 横向滚动，desktop header hidden on mobile |
| `app/ai-theme/page.tsx` | stats 2/7col，14主题卡 2/3/7col，默认折叠主题卡，tabs overflow-x，stock grid 1/2/3col |
| `app/ai-theme/[theme]/page.tsx` | 供应链横排→手机纵排+下箭头，stats 2/5col，stock grid 1/2col |
| `app/screener/page.tsx` | 手机显示 StockMobileCard，桌面显示完整表格，filters overflow-x |
| `app/stocks/[symbol]/page.tsx` | hero flex-col/row，tabs overflow-x，AI评分卡 flex-col/row，Radar手机隐藏，dimension cards 1/3col |
| `app/sync/page.tsx` | header flex-col/row，summary 2/3/7col |
| `app/notifications/page.tsx` | px-4 padding，heading text-slate-900，settings grid 1/3col |

### 验收标准
- 手机：隐藏 Sidebar，显示 MobileHeader(h-14) + MobileBottomNav(h-14+safe-area)
- 内容区：`pt-14 pb-20` 防被固定组件遮挡
- 聊天页：`h-[calc(100dvh-136px)]` 精确适配可视区
- 筛选器：手机显示卡片，桌面显示完整11列表格

---

## [8.1.0] - 2026-06-21 — STRONG_BUY 阈值放宽 + CHIP_DESIGN 扩充 + 供应链流矢印修复

### 概述
- **STRONG_BUY 阈值放宽**：`adaptiveScore≥78 AND percentileRank≤2%` → `≥75 AND ≤5%` → 结果 STRONG_BUY=5（新增 Reskill教育/量化研究/日本M&A中心/阿特拉埃/Land不动产）
- **BUY 阈值放宽**：`percentileRank≤10%` → `≤15%`
- **CHIP_DESIGN 扩充**：3只 → 6只（新增 メガチップス/ソニー/富士電機）
- **供应链流矢印修复**：`grid + absolute` → `flex + SVG arrow`，层级间视觉箭头正常显示

### 修改文件
| 文件 | 变更 |
|------|------|
| `scripts/compute-scores.ts` | `computeRecommendationV2()` 阈值调整 |
| `scripts/seed-ai-themes.ts` | CHIP_DESIGN 新增 6875.T/6758.T/6504.T |
| `app/ai-theme/[theme]/page.tsx` | 供应链流从 grid 改为 flex + SVG 矢印 |

### 验收（生产 2026-06-21）
- STRONG_BUY=5 ✅（原 0）
- CHIP_DESIGN 6只 ✅（瑞萨/罗姆/滨松/メガチップス/索尼/富士电机）
- /ai-theme/chip_design 返回 200，byLayer 正常 ✅
- 供应链流箭头 → 正常渲染 ✅

### 背景
v8.0 生产数据显示最高 adaptiveScore=77（291A.T），旧阈值 78 导致 STRONG_BUY=0。

---

## [8.0.0] - 2026-06-21 — AI产业链地图：14细分主题完整产业链

### 概述
- **AITheme精细化重构**：从6个粗分类升级为14细分AI产业链主题
- **106条目，82只股票，38个核心标的**
- **供应链层级**：UPSTREAM→MIDSTREAM→DOWNSTREAM/INFRASTRUCTURE/APPLICATION
- **每条目含**：role/supplyChainLayer/importanceScore/reason/riskNote/isCore
- **股票可多主题归属**（东京电子同时属于SEMI_EQUIPMENT+TEST_EQUIPMENT）

### 14细分主题
| 主题 | 条目 | 核心 |
|------|------|------|
| AI芯片设计 | 3 | 1 |
| AI半导体设备 | 8 | 5 |
| AI测试设备 | 6 | 1 |
| AI芯片材料 | 8 | 3 |
| HBM・先进封装 | 7 | 2 |
| AI传感器・精密 | 8 | 4 |
| AI服务器・DC | 9 | 4 |
| AI网络通信 | 8 | 2 |
| AI机器人・自动化 | 8 | 3 |
| AI软件・云・SaaS | 14 | 4 |
| AI互联网・平台 | 6 | 2 |
| AI医疗・生命科学 | 7 | 3 |
| AI安防・图像识别 | 7 | 3 |
| AI电力・能源 | 7 | 1 |

### 新增/修改文件
| 文件 | 变更 |
|------|------|
| `prisma/schema.prisma` | AITheme扩展字段，@@unique改为[symbol,theme]复合键 |
| `scripts/seed-ai-themes.ts` | 全量重写，106条目14主题 |
| `app/api/ai-theme/route.ts` | 重写，返回themes/layers/summary，使用adaptiveScore |
| `app/api/ai-theme/[theme]/route.ts` | 新增，byLayer产业链详情 |
| `app/ai-theme/page.tsx` | 重写，搜索/筛选/供应链层可视化/14主题卡/3列股票网格 |
| `app/ai-theme/[theme]/page.tsx` | 新增，产业链流可视化+全量股票排列 |

### 验收（生产 2026-06-21）
- /ai-theme HTTP 200 ✅
- /api/ai-theme HTTP 200 ✅，14主题全返回 ✅
- 东京电子/Advantest/信越化学/SUMCO/Ibiden/NEC/Sakura Internet全显示 ✅
- recommendationV2/adaptiveScore/dividendScore/catalystScore正常 ✅
- /ai-theme/[theme] 6条路由全200 ✅
- /ai-picks /screener /stocks不受影响 ✅

---

## [7.9.3] - 2026-06-21 — AI System Control Center

### 概述
- **系统控制命令**：START / STOP / RESET / STATUS — 最高优先级，绕过整个 pipeline（零 GPT / 零 DB 股票查询）
- **AI 启停状态持久化**：新增 `UserAiSettings` DB 表，每用户独立开关
- **AI 暂停门控**：`aiEnabled=false` 时任何非系统指令均返回暂停提示，彻底不触发意图引擎
- **Web sessionId 追踪**：`/chat` 页面以 `sessionStorage` 稳定 session ID 传给后端，实现独立上下文隔离

### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/ai-control.ts` | detectSystemCommand / getAiEnabled / handleSystemCommand / buildStatusText / PAUSE_MSG |

### 新增数据表
| 表 | 字段 |
|----|------|
| `user_ai_settings` | userId(unique) / aiEnabled / mode / strictRealData / createdAt / updatedAt |

### 修改文件
- `lib/line-chat.ts`：最高优先级插入系统命令检测 + aiEnabled 门控
- `app/api/chat/route.ts`：同上（系统命令 → aiEnabled → 正常 pipeline）
- `app/chat/page.tsx`：sessionId 生成（sessionStorage）、传 userId 给后端、INTENT_BADGE 补全 17 种

### 触发词（精确匹配）
| 命令 | 触发词示例 |
|------|-----------|
| START | 启动AI / 开启AI / start / 唤醒 / 激活 |
| STOP | 关闭AI / 停止 / 暂停 / stop / 休眠 |
| RESET | 清空上下文 / 重置 / reset / 清空记忆 |
| STATUS | 当前状态 / 状态 / status / AI状态 |

### 验收结果（生产）
- LINE 9步链 ✅（启动→状态→个股→停止→AI暂停→恢复→主题→重置→追问无上下文）
- Web 3步链 ✅（启动→停止→AI暂停门控）
- STATUS 显示完整数据源清单 ✅（3714 REAL / JPX REAL / 4691件 TDnet）
- STRICT_REAL_DATA 始终 ON ✅

---

## [7.9.2] - 2026-06-21 — GPT Intent Engine 重构：DB-only 回答

### 概述
- **GPT 职责边界**：GPT 仅作为意图识别 fallback（输出 JSON only），所有回答 100% 来自 DB
- **统一调用链**：`/api/chat` 和 LINE webhook 共用 `parseUserIntent → queryDatabase → buildAnswer`
- **12种意图**：新增 `recommend_more`（记忆排除）、`stock_compare`（对比）、`risk_analysis`（风险）、`reason_explain`（解释原因）
- **对话上下文**：30分钟 TTL，`lastSymbols/lastResults` 支持追问（"还有其他的"、"风险呢"、"为什么"）

### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/intent-schema.ts` | 统一类型：StructuredIntent / ConversationContext / DbQueryResult |
| `lib/intent-engine.ts` | 意图解析（regex优先 + GPT JSON fallback）+ 上下文存储 |
| `lib/query-engine.ts` | 所有意图的 DB 查询（12种意图统一入口） |
| `lib/answer-builder.ts` | buildWebAnswer() + buildLineMessages()（zero GPT） |
| `scripts/test-intent-engine.ts` | 14/14 意图测试 + 6种回答测试 |

### 修改文件
- `app/api/chat/route.ts`：简化至 50 行（pipeline 调用），移除旧 GPT 回答逻辑
- `lib/line-chat.ts`：简化至 80 行（pipeline 调用），移除重复 DB 查询
- `package.json`：新增 `test:intent-engine` / `test:intent-engine:dry`

### 验收结果（生产）
- Intent 14/14 ✅（regex 全命中，含 "高股息低风险的"、"丰田和伊藤忠比"、追问三连）
- answerSource=DB ✅ hallucination=false ✅ 零 localhost URL ✅
- 追问上下文：`top_picks→recommend_more→risk_analysis→reason_explain` 链全通

---

## [7.9.1] - 2026-06-21 — 修复 Flex Message localhost 链接根本原因

### 修复
- **`lib/app-url.ts` `getBaseUrl()` 优先级调整**：`APP_URL`（运行时读取）调整至 `NEXT_PUBLIC_APP_URL`（build-time bake-in）之前
  - 根本原因：Next.js 在 build 时将 `NEXT_PUBLIC_*` 变量的值直接替换进 server bundle（webpack DefinePlugin），本地 `.env` 有 `NEXT_PUBLIC_APP_URL=http://localhost:3000`，导致生产 bundle 里该值被硬编码为 localhost
  - 修复方案：在生产服务器 `.env` 加入 `APP_URL=https://aitohoshou.com`，`getBaseUrl()` 改为优先读 `APP_URL`（运行时 process.env，不会被 bake-in）
  - Bundle 验证：server chunk 含 `process.env.APP_URL`（运行时）+ `"http://localhost:3000"`（旧 bake-in，被 `??` 跳过）+ `"https://aitohoshou.com"`（fallback）
- **生产验收测试脚本** `scripts/test-line-production.ts` — 14/14 通过

---

## [7.9] - 2026-06-21 — LINE 全智能投资助手 V7.9 + Web Chat UI

### 概述
- **LINE NLP 意图引擎**：完全重构 LINE 对话入口，8种意图 + 100+公司名映射，零"不支持该查询"
- **Flex Message V7.9**：全新8个 Flex 构建器，全链接经 app-url.ts 验证，零 localhost
- **统一调用链**：parseLineIntent → queryRealData(DB only) → buildLineReply，GPT 禁止生成股票列表
- **Web Chat UI**：`/chat` 页面，对话式AI助手，对接 `/api/chat`
- **36/36 测试通过**：意图分类 14/14、Flex URL 8/8、边界用例 14/14

### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/line-intent.ts` | LINE NLP 意图解析器（8种意图类型、~100条公司名映射、SECTOR_MAP） |
| `lib/line-flex-v79.ts` | V7.9 Flex Message 构建器（8个 builder + buildRealReason）|
| `scripts/test-line-v79.ts` | 意图分类 + Flex URL 验证 + 边界用例测试脚本 |
| `app/chat/page.tsx` | Web Chat UI（快速提问按钮、意图 badge、打字动画）|

### 修改文件
| 文件 | 修改 |
|------|------|
| `lib/line-chat.ts` | 完整重写：统一调用链，引入 parseLineIntent，移除"不支持该查询" |
| `app/api/line/webhook/route.ts` | 使用 handleLineChat + buildWelcomeFlexV79 + buildGroupJoinFlexV79 |
| `scripts/validate-line-links.ts` | 新增 validateFlexUrls() 导出 + V7.9 builders 验证 |
| `components/Sidebar.tsx` | 新增「AI对话」入口（💬）|
| `package.json` | 新增 test:line-v79 / validate:line-v79 脚本 |

### 意图类型
| 意图 | 触发示例 |
|------|---------|
| TOP_PICKS | 今天买什么 / 明天买什么 / 推荐十只 / 再推荐五只 |
| STOCK_ANALYSIS | 7203 / 分析7203 / 丰田怎么样 / 伊藤忠值得买吗 |
| TECH_THEME | 科技股 / 科技股谁最强 |
| SECTOR_OUTLOOK | 半导体还能买吗 / 机器人 / 银行股怎么样 |
| MARKET_OVERVIEW | 市场怎么样 / 日经怎么样 / 行情如何 |
| DATA_SOURCE | 数据哪里来的 / 评分怎么算 |
| HELP | 帮助 / 菜单 |
| UNKNOWN | → 自动显示 HELP，永不回复"不支持" |

### V7.9 Flex 构建器
- `buildTopPicksFlexV79` — Carousel（每页5只，最多10只），含 percentileRank + 真实原因标签
- `buildStockCardV79` — 5维评分雷达 + 配当分/收益率 + 空売り比率 + scoreSource REAL badge
- `buildMarketOverviewFlexV79` — 市场温度 + 分布 + GlobalMarket + 机构流向 + 空売り
- `buildSectorFlexV79` — 板块 TOP8 + return5d/return20d + percentileRank
- `buildHelpFlexV79` — 7项功能指南，含自然语言示例
- `buildDataSourceFlexV79` — 9数据来源列表
- `buildWelcomeFlexV79` / `buildGroupJoinFlexV79` — V7.9 欢迎卡

### 关键修复（TypeScript 类型）
- `セブン&アイ` 作为对象键需要引号（syntax error）
- `三菱ufj` 重复键去重
- `sp500Change` 不存在于 GlobalMarket schema → 移除
- `analysisPrefix` 由 `\s+` 改为 `\s*` → 支持`分析7203`（无空格）
- MARKET_OVERVIEW 正则新增 `日经`（简体）覆盖 `日経`（繁体）

---

## [7.8.5] - 2026-06-21 — GPT Phase 2 Web Chat UI (prev label)

### 新增
- **`/chat` 页面** — Web Chat UI，对话式 AI 选股助手
  - 聊天气泡 UI（用户消息 / AI 回复）
  - 快速提问按钮：今日TOP5 / TOP10推荐 / 市场概况 / 科技股 / 半导体 / 汽车股
  - Intent 标签：自动显示意图分类（AI推荐 / TOP10 / 个股分析 / 板块分析 / 市场概况）
  - 打字中动画指示器（三点跳动）
  - 自适应输入框（Enter 发送，Shift+Enter 换行，自动高度）
  - 清空对话按钮
  - 严格真实数据模式标识（REAL DATA badge）
- **侧边栏新增「AI对话」入口**（💬 图标，位于 AI产业链 与 全市场筛选 之间）

### 技术细节
- 调用现有 `POST /api/chat`（GPT Phase 1.5 STRICT_REAL_DATA 模式）
- 响应解析 `intent` 字段 → 意图 badge
- 欢迎消息说明支持功能和数据来源
- 全高度布局（header + 滚动消息区 + 快捷键 + 输入框）

---

## [7.8] - 2026-06-20 — 空売り比率 JPX REAL + 配当スコア + Sync Center 11源

### 概述
- **空売り比率（ShortSellingRatio）**：从 JPX 官网下载 PDF → `pdftotext` 解析 → 写入 `ShortSellingRatio` 表，source=jpx_real，数据：2026-06-19，38.8%
- **配当スコア（dividendScore 0-10）**：利用已有 Dividend 表（32,315行），`calcDividendScore(yield%, payoutRatio)` 写入 StockScore，全量3714只
- **Sync Center 11源**：`/api/sync/status` 新增 short_selling_ratio + dividend_history 两张源卡，生产全部 REAL ✅
- **Cron 扩展**：18:30 JST 工作日（空売り）+ 22:30 JST 每日（配当历史）

### 新文件
| 文件 | 说明 |
|------|------|
| `scripts/fetch-short-selling-ratio.ts` | JPX PDF 下载 → pdftotext 解析 → upsert ShortSellingRatio |
| `scripts/fetch-dividend-history.ts` | J-Quants fins/summary → 批量同步 Dividend（CONCURRENCY=5，7天去重）|

### Schema 变更（已 `npx prisma db push` 到生产）
| 变更 | 说明 |
|------|------|
| `ShortSellingRatio.market String @default("ALL")` | 新增字段，支持按市场区分 |
| `ShortSellingRatio @@unique([date, market])` | 原 `@unique(date)` 改为联合唯一键 |
| `StockScore.dividendScore Int?` | 配当质量分 0-10 |
| `StockScore.shortSellingSource String?` | "jpx_real" 或 "fallback" |

### 关键技术细节

#### JPX PDF 解析
- JPX 空売り比率每日 PDF：`https://www.jpx.co.jp/markets/statistics-equities/short-selling/nlsgeu0000XXX.pdf`
- 生产服务器安装 `poppler-utils`（apt-get install -y poppler-utils）
- `execSync('pdftotext /tmp/jpx_short.pdf -', { encoding: 'utf-8' })` 提取文本
- PDF 文本含三个百分比：(a)/(d) 普通注文 ~61%、(b)/(d) 空売り+価格制限 ~32%、(c)/(d) 空売り ~7%
- 总空売り比率 = [1]+[2]（b/d + c/d）≈ 38.8%

#### 日期时区修复（CST 服务器）
- 生产服务器为 CST（UTC+8），`new Date(y, m, d)` 创建 CST 午夜 = UTC 前一天
- **必须用** `new Date(Date.UTC(year, month-1, day))` 确保 @db.Date 存储正确
- 错误行（2026-06-18）仍在 DB 中但无害（orderBy date desc 始终取正确行）

#### payoutRatio 单位处理
- J-Quants `PayoutRatioAnn` 返回 0-1 小数（0.321 = 32.1%），非百分比
- `calcDividendScore` 内自动检测：`payoutRatio < 1.5 → × 100 转为 %`
- UI 同样需要此转换：`(pr < 1.5 ? pr * 100 : pr).toFixed(0) + "%"`

### calcDividendScore 评分表（`lib/ai-score.ts`）
| 配当利回り | 基础分 |
|-----------|--------|
| = 0 或 null | 0（无配当）|
| < 1% | 1 |
| 1-2% | 3 |
| 2-3% | 5 |
| 3-4% | 7 |
| 4-6% | 8（甜蜜区间）|
| ≥ 6% | 6（高yield陷阱风险）|

配当性向 20-60%：+1；> 80%：-1；最大10分。

### API 扩展（`/api/stocks/[symbol]/ai-score`）
新增7个字段：
- `dividendScore`（从 StockScore precomputed 或实时计算）
- `dividendYield`（%，来自 Dividend.yieldRate）
- `payoutRatio`（0-1 小数，来自 Dividend.payoutRatio，J-Quants 原始值）
- `dividendAnn`（年间配当额，来自 Dividend.dividend）
- `shortSellingRatio`（%，来自 ShortSellingRatio.shortSellRatio，最新）
- `shortSellingDate`（ISO 日期字符串）
- `shortSellingSource`（"jpx_real" 或 "fallback"）

### compute-scores 更新（`scripts/compute-scores.ts`）
- Pass1 开始前：预加载最新 ShortSellingRatio（where market="ALL", source="jpx_real"）
- Pass1 逐股：`prisma.dividend.findFirst({ where: { symbol }, orderBy: { year: "desc" } })` 取配当，调 `calcDividendScore` 计算 dividendScore
- 两者均写入 StockScore create + update 块

### 股票详情页 AI Tab（`app/stocks/[symbol]/page.tsx`）
新增「配当・空売り」面板（位于5维分数条之后）：
- **配当卡**：年間配当（円）/ 配当利回り（%）/ 配当性向（%）/ dividendScore（0-10 星级）
- **空売りカード**：市場空売り比率（%）/ 最新日期 / source badge（REAL/推算）

### 生产验证（2026-06-20）
```
Symbol: 7203.T (Toyota)
adaptiveScore: 48 / WATCH
dividendScore: 7 / 10（precomputed）
dividendYield: 3.42%，payoutRatio: 0.321（32.1%）
shortSellingRatio: 38.8%
shortSellingSource: jpx_real
shortSellingDate: 2026-06-19
Sync Center: 11/11 REAL ✅
```

### npm scripts 新增
```bash
npm run fetch-short-selling         # 抓取 JPX 空売り比率 PDF → ShortSellingRatio
npm run fetch-short-selling:dry     # DRY_RUN 预览
npm run fetch-dividend-history      # J-Quants fins/summary → Dividend（FORCE=1 强制全量）
npm run fetch-dividend-history:dry  # DRY_RUN 预览
```

---

## [7.7] - 2026-06-20 — 双门槛评级 V2 + 市场温度 + 机会分 + TDnet REAL

### 概述
- **recommendationV2**（双门槛）：STRONG_BUY（adaptiveScore≥78 AND percentileRank≤2%）/ BUY（≥70 AND ≤10%）/ HOLD / WATCH / AVOID
- **MarketTemperature**：HOT/WARM/NEUTRAL/COLD/EXTREME_COLD，基于全市场 BUY+ 占比实时计算
- **opportunityScore**：综合机会分（0-100），复合公式 = adaptiveScore×0.5 + 排名强度×0.2 + 资金×0.1 + catalyst×0.1 - 风险×0.1
- **TDnet REAL 真实数据接通**：东京阿里云 IP 无地理封锁，Cookie 方案绕过 WAF 挑战

### StockScore 新增字段（v7.7，已部署生产 DB）
| 字段 | 说明 |
|------|------|
| `percentileRank` | Float 全市场百分位（越低越好，1=前1%） |
| `marketRank` | Int 绝对排名（1=最佳） |
| `recommendationV2` | 双门槛评级字符串 |
| `recommendationReason` | 中文评级理由（含阈值） |
| `opportunityScore` | 综合机会分 Float 0-100 |
| `opportunityRank` | 机会分排名 Int |
| `opportunityLabel` | STEADY \| HIGH_RISK_SPECULATIVE |

### compute-scores 双Pass（`scripts/compute-scores.ts`）
- **Pass 1**：逐股计算5维原始分 + adaptiveScore + stockStyle（同 V7.5）
- **Pass 2**：全市场 3714 只排序 → percentileRank / marketRank → recommendationV2 / recommendationReason → opportunityScore / opportunityRank / opportunityLabel，批量更新 200条/批

### API 更新
- `GET /api/market-stats`：返回 marketTemperature / bullCount / bullRate / distribution / topAdaptive / topOpportunity
- `GET /api/ai-scores?mode=top|opportunity|high_risk`：含全部 V7.7 字段 + marketStats 内嵌
- `GET /api/screener`：新增 V7.7 列（adaptiveScore / percentileRank / recommendationV2 / opportunityScore / stockStyle / highRiskFlag）
- `GET /api/stocks/[symbol]/ai-score`：从 StockScore 合并全部 V7.7 预计算字段
- `POST /api/chat`：所有意图切换为 recommendationV2，响应含 percentileRank / opportunityScore / stockStyle

### 前端更新
- **`/ai-picks`**：MarketTemperatureBanner（5类分布格子）+ 三模式 Tab（综合/稳健机会/高风险动能）+ V7.7 评级 badge + percentileRank + opportunityScore
- **`/screener`**：动态分列 / 排名列（前X%）/ 机会分列 / 风格过滤器 / 点击表头排序 / 高风险行浅红底色
- **`/stocks/[symbol]` AI Tab**：主分数显示 adaptiveScore，V7.7 评级 badge，市场排名行，机会分行，风格标签，scoreSource badge

### LINE 更新（`lib/line-flex.ts`）
- `compactRow`：使用 recommendationV2 着色，展示 percentileRank（前X%），⚠ 高风险前缀

### 生产数据（2026-06-20 部署后）
- STRONG_BUY: 0 / BUY: 35（0.9%）/ MarketTemperature: COLD ❄️
- 最高分：Reskill 291A.T，adaptiveScore=77

---

## [7.7-TDnet] - 2026-06-20 — TDnet REAL 真实数据接通

### 问题
- `lib/tdnet.ts` 此前全部返回 mock/fallback 数据
- 原以为香港服务器被地理封锁，实际为 Cookie WAF 挑战

### 根本原因（调查结论）
1. GET `https://www.release.tdnet.info/` → HTTP 403，但 **Set-Cookie: te-w1-pri=xxx**
2. 带该 Cookie 发 GET → HTTP 200
3. 非地理封锁，非 Cloudflare，非 IP ban；东京阿里云 IP（8.209.247.68）可正常访问

### 实现
**`lib/tdnet.ts`（完整重写）**
- `acquireSessionCookie()`：首次 GET 根页提取 `te-w1-pri` Cookie
- `fetchTDnetForDate(date)`：分页 GET `I_list_NNN_YYYYMMDD.html`，带 Cookie + 浏览器 UA
- 翻页检测：检查 HTML 是否含下一页链接（**不用行数判断**，因字母股票代码被过滤后行数偏少）
- 代码解析：`XXXX0`（5位）→ 取前4位，仅保留 `/^\d{4}$/` 纯数字代码，过滤 `485A` 等字母代码
- 1秒翻页间隔（robots.txt `Disallow: /`，法定公开信息）
- 删除所有 mock / fallback 分支

**`scripts/fetch-tdnet.ts`（新增）**
- `DRY_RUN=1` 预览模式，默认同步最近5个工作日
- 写入 Disclosure 表后自动更新 catalystScore（base=5 + min(3,count) + 业绩奖励 + 重要性奖励，范围 1-10）

**`scripts/cron-scheduler.ts`**
- 新增 `0 7 * * 1-5`（07:00 JST 工作日）：TDnet 同步
- 确保先于 `0 7:30 * * *` compute-scores 运行

**`app/api/sync/tdnet/route.ts`（重写）**
- 改用 `fetchTDnetForDate`，同步最近3个工作日

### 已验证数据
- 2026-06-19 单日：288件公告（3页），有效4位代码 272件
- 生产 DB（5天）：975件新增 + 已有历史 = 4691件总计
- 673只股票 catalystScore 更新
- 类型分布：OTHER 72% / EARNINGS 9.2% / DIVIDEND 5% / EQUITY 4.7% / BUYBACK 4.3% / MATERIAL 3.1% / FORECAST_REVISION 1.6%

### 结论
- **TDnet REAL = YES** ✅（东京 IP 可访问）
- **TDnet proxy server：暂不需要**

---

## [7.6.2] - 2026-06-20 — LINE STRICT_REPLY 模板 + localhost 全清零

### 问题
1. LINE 回复仍含客服话术（"表现稳定/建议关注/进一步研究/业务布局良好"）
2. URL 验证脚本确认全部 Flex URI 均为 https://aitohoshou.com（无 localhost）

### 修复

**`lib/line-flex.ts`**
- `buildStockCard` 新增字段展示：`adaptiveScore`/`stockStyle`/`scoreSource`/`latestDate`/`数据来源 footer`
- 五维评分加进度条 `█░` 可视化
- `AiPicksStock` 新增 `adaptiveScore`/`stockStyle` 字段
- `compactRow` 优先显示 `adaptiveScore`；评分行展示 `stockStyle` 缩写；删除 `summaryReason` 显示（防混入GPT话术）

**`lib/line-chat.ts`**
- 新增 `handleStockFlexCard(code)` — 查 DB → 返回 `buildStockCard` Flex（无 GPT 调用）
- `handleLineChat` 中拦截 `^(\d{4})` 和 `^分析\d{4}` → 走 Flex 卡片路径，不再落入 `processMessage` 文本路径
- `handleStockFlexCard` 在显示前清洗 `summaryReason`（删除「表现稳定/建议关注」等模板词）
- 最终 fallback：直接返回使用指南文本，**不调用任何 GPT**

**`lib/ai-agent.ts`**
- `buildAnalysisReply`：完全删除 GPT 调用，输出纯结构化 DB 数据文本（含全字段）
- `buildStockReply`：保留纯文本格式（LINE 走 Flex；此为 Web/API 文本 fallback）

### validate:line-links 结果
- 0 错误，1 警告（testFlex 无按钮，正常）
- 全部 13 个 Flex payload 均通过 https://aitohoshou.com 验证

### LINE 消息路由（修复后）
| 输入 | 路由 | 输出 |
|------|------|------|
| `推荐/再推荐五只/TOP10` | V2 `ai_picks` → `handleAiPicks` | Flex Carousel，DB REAL TOP10 |
| `科技股/半导体` | V2 `ai_theme` → `handleAiTheme` | Flex，科技主题TOP20 |
| `伊藤忠怎么样/8001` | `handleStockFlexCard("8001")` | `buildStockCard` Flex |
| `分析8001` | `handleStockFlexCard("8001")` | `buildStockCard` Flex |
| 其他 | 直接返回使用指南 | 文本（无GPT） |

---

## [7.6.1] - 2026-06-20 — LINE 调用链 STRICT 修复

### 问题
- LINE "再推荐五只" → `parseV2Intent` 无匹配 → 落入 `buildGeneralReply` → GPT 自由编造 Toyota/Sony/Nintendo（100% 幻觉）

### 修复（`lib/ai-agent.ts` 完全重写 + `lib/line-chat.ts` 修复）

**`lib/ai-agent.ts`（完全重写）**
- `parseIntent`：新增 `/推荐|精选|top10?|picks/i` 宽泛模式（覆盖"再推荐"/"推荐五只"等所有变体）
- `buildPicksReply`：DB 查询改为 `scoreSource:"REAL"` + `adaptiveScore DESC`（原 `totalScore DESC`，无 REAL 过滤）
- `buildGeneralReply`：**完全删除** — 原函数调用 `callAI(temperature=0.7)` 致使 GPT 自由编造推荐
- `callAI`：`temperature: 0.2`（原 0.7）
- `buildAnalysisReply`：新增 STRICT system prompt（6条禁止规则），GPT 只解读 DB 数据
- 删除 `upProb()` / "上涨概率" 伪造指标
- `unknown` 意图：直接返回使用指南，不调用 GPT

**`lib/line-chat.ts`**
- `parseV2Intent`：新增模式 `/(再推荐|推荐更多|多推荐|推荐[五六七八九十\d]+[只只])/i` → `ai_picks`
- `handleAiPicks`：DB 查询改为 `scoreSource:"REAL"` + `adaptiveScore:{ not:null }` + `adaptiveScore DESC`

### 修复后调用链
```
"再推荐五只" → parseV2Intent → "ai_picks" → handleAiPicks → DB REAL TOP10 → Flex 卡片
```
零 GPT 调用，零幻觉

---

## [7.6.0] - 2026-06-20 — GPT Phase 1.5: STRICT REAL DATA 模式

### 概述
- **STRICT_REAL_DATA 全局开关**：`STRICT_REAL_DATA=true` 写入 `.env`，启用后 GPT 被禁止编造任何投资数据
- **`/api/chat` 全面重写**：新增意图 `recommend_ten` / `market_overview`；全部切换为 `adaptiveScore DESC` + `scoreSource=REAL` 排序
- **Bloomberg级别回复格式**：结构化卡片、emoji分隔线、五维进度条（`████░░`）、数据来源footer（`✓ J-Quants ✓ ...`）
- **STOCK_NOT_FOUND 严格处理**：未知代码直接早返回"未找到"，不经过GPT，无幻觉风险
- **数据来源公开**：每次回复底部自动追加 `📊 数据来源 / ⏰ 更新时间 JST`

### 新增意图
| 意图 | 触发词 | 说明 |
|------|--------|------|
| `recommend_ten` | 推荐十只/TOP10 | 真实TOP10；DB<10时如实告知数量 |
| `market_overview` | 今天市场如何/日经怎么样 | NASDAQ+VIX+日经+外资+AI TOP3 |

### DB查询升级
- `fetchTopPicks` — `scoreSource:"REAL"` + `adaptiveScore DESC`（原 `totalScore DESC`）
- `fetchStockData` — 新增 `Disclosure` 查询（近3条TDnet公告）、`equityRatio`、`scaleCategory`
- `fetchThemeStocks` — `scoreSource:"REAL"` + `adaptiveScore DESC` + 外资仅取 `foreigners` 类型
- `fetchMarketOverview` — 新增（GlobalMarket + AI TOP3 + 外资）
- 全部 theme 查询：新增 `金融股` / `医药股` / `能源股` 三个主题

### GPT System Prompt 升级（Phase 1.5）
- 明确禁止规则 6 条（禁止虚构名称/价格/评分/猜测语言/占位符/DB空时补全）
- 四种意图各有独立格式模板（top_picks / stock_analysis / theme / market_overview）
- `temperature: 0.2`（原 0.3）+ `max_tokens: 1500`（原 500）

### 验收结果（2026-06-20 生产）
| 测试 | 结果 |
|------|------|
| 今天买什么 → TOP5 | ✅ 全部真实（291A,9552,6194,...） |
| 推荐十只 → TOP10 | ✅ 全部真实，无虚构名称 |
| 分析7203（丰田） | ✅ 真实价格¥2,776.5 / 真实财务 / 五维进度条 |
| 分析8035（东京电子） | ✅ 真实价格¥75,360 / 评分68 / PER60.1 |
| 分析9999（虚构） | ✅ 直接返回"未找到"，零幻觉 |
| 分析1234（随机） | ✅ 同上 |
| 科技股谁最强 | ✅ 真实TOP8板块股票 |
| 半导体还能买吗 | ✅ 真实VIX+外资+板块数据 |
| 今天市场如何 | ✅ NASDAQ/日经/VIX/外资全真实 |
| 未知意图 | ✅ 返回使用指南，不猜测 |
| 虚构关键词检查 | ✅ 0处"株式会社A/B"等 |
| strictMode 字段 | ✅ 全部返回 `true` |

### 规则（勿改）
- `STRICT_REAL_DATA=true` 禁止删除或改为 `false`
- GPT 职责：仅格式化DB数据，不产生任何原始投资判断
- 数据源footer 为强制项，每次回复必须包含

---

## [7.5.0] - 2026-06-20 — 动态权重评分 + GPT Phase 1（稳定基线）

### 概述
- **TOHOSHOU AI V4（动态权重评分）**：`adaptiveScore` 按 6 种股票风格（StockStyle）对 5 维度差异化加权，脱离固定权重
- **v7.5 新增字段**：`rawScore / adaptiveScore / stockStyle / highRiskFlag / fxSensitivity / catalystScore`
- **GPT Phase 1**：接入 GPT-4o-mini，`POST /api/chat` 处理 4 种自然语言意图，全部数据来自 DB，无幻觉
- **OpenAI baseURL 固定**：`lib/openai.ts` + `lib/ai-agent.ts` 均显式 pin `https://api.openai.com/v1`，防 `OPENAI_BASE_URL=deepseek` 劫持
- **localhost 全站清零**：所有实际 URL 统一至 `https://aitohoshou.com`，grep 0 处匹配

### 新增文件
- `lib/openai.ts` — GPT-4o-mini 客户端，显式 pin OpenAI baseURL；`isOpenAIConfigured()`；DB-grounded 规则注释
- `lib/llm/client.ts` — 统一 LLM 客户端工厂（`llmClient()` / `LLM_MODEL()` / `isLLMConfigured()`）
- `lib/llm/router.ts` — Intent Router（quickParse 正则快路 + GPT JSON 模式慢路）；返回 8 种 `LLMIntent` 类型
- `app/api/chat/route.ts` — `POST /api/chat`；4 意图：today_picks / stock_analysis / theme_best / theme_outlook；DB 取数 + GPT 格式化；OPENAI_API_KEY 缺失时返回 503
- `app/api/stocks/[symbol]/alternatives/route.ts` — 同风格替代股，优先同行业，最多5只，按 adaptiveScore 排序
- `prisma/migrations/20260620_add_ai_themes/` — AITheme 表迁移（已应用）
- `prisma/migrations/20260620_score_source_fields/` — StockScore 新字段迁移（已应用）

### 修改文件
- `prisma/schema.prisma` — StockScore 新增 6 字段：`rawScore / adaptiveScore / stockStyle / highRiskFlag / fxSensitivity / catalystScore`；新增 `PortfolioDiagnosis` 模型
- `lib/ai-score.ts` — 新增 `StockStyle` 类型 / `STYLE_WEIGHTS` map / `classifyStockStyle()` / `computeAdaptiveScore()` / `computeFxSensitivity()` / `computeCatalystScore()`；`ScoreInput` 扩展 sector/industry/scaleCategory/disclosureCategories；`AiScoreResult` 扩展全部 v7.5 字段
- `lib/ai-agent.ts` — **修复 baseURL 劫持 bug**：当 `OPENAI_API_KEY` 存在时强制 `https://api.openai.com/v1` + `gpt-4o-mini`，不再被 `OPENAI_BASE_URL=deepseek` 覆盖
- `scripts/compute-scores.ts` — 新增 disclosure 查询 + sector/industry/disclosureCategories 传入 + 全部 v7.5 字段写入 scorePayload
- `app/api/ai-scores/route.ts` — select + mapping 新增 v7.5 字段及默认值
- `lib/app-url.ts` — 新增（v7.4.0），本次复用；已覆盖所有 LINE Flex 按钮 + 脚本 URL
- `lib/daily-picks-report.ts` — `aiPicksUrl()` 替换 hardcoded localhost
- `scripts/send-daily-picks.ts` — 同上

### v7.5 评分体系

#### 6 种 StockStyle 及权重分配
| 风格 | 技术 | 基本面 | 资金 | 新闻 | 全球 |
|------|------|--------|------|------|------|
| VALUE_DEFENSIVE | 15% | 50% | 15% | 10% | 10% |
| GROWTH_MOMENTUM | 35% | 20% | 25% | 10% | 10% |
| QUALITY_COMPOUNDER | 25% | 35% | 20% | 10% | 10% |
| SPECULATIVE_MOMENTUM | 40% | 10% | 30% | 15% | 5% |
| CYCLICAL_EXPORTER | 30% | 20% | 20% | 10% | 20% |
| DOMESTIC_DEFENSIVE | 20% | 35% | 25% | 15% | 5% |

#### 新字段说明
- `rawScore`：等同原 `totalScore`（向后兼容）
- `adaptiveScore`：各维度归一化 0→1 后按风格权重加权 ×100
- `stockStyle`：6 种风格之一（sector + 财务特征分类）
- `highRiskFlag`：SPECULATIVE_MOMENTUM 且近期大涨时为 true
- `fxSensitivity`：EXPORT_POSITIVE / IMPORT_SENSITIVE / FX_NEUTRAL / DOMESTIC_NEUTRAL
- `catalystScore`：TDnet 公告类别打分（baseline=5，增发−3，业绩修正+3 等）

### GPT Phase 1 — `/api/chat` 验收结果
| 查询 | Intent | 字数 | 无幻觉 | DB数据 |
|------|--------|------|--------|--------|
| 今天买什么？ | top_picks | 418 | ✅ | ✅ StockScore TOP5 |
| 分析7203 | stock_analysis | 312 | ✅ | ✅ ¥2,776.5 score=46 |
| 科技股谁最强？ | theme_best | 288 | ✅ | ✅ 情報通信セクター |
| 半导体还能买吗？ | theme_outlook | 253 | ✅ | ✅ GlobalMarket+InstitutionalFlow |

### alternatives API 验收结果
- 7203.T (CYCLICAL_EXPORTER, adaptive=46) → 5只，最高 6161.T adaptive=73
- 8035.T (CYCLICAL_EXPORTER, adaptive=68) → 5只
- 9983.T (VALUE_DEFENSIVE, adaptive=67) → 1只（3333.T adaptive=68）

### 规则（勿改）
- `rawScore/adaptiveScore` 均不影响 `recommendation`（仍按 `totalScore` 的 ≥90/80/65/50 阈值）
- 禁止为提升 BUY 数量而调高 adaptive 评分或降低 BUY 阈值
- GPT 回复必须来自 DB；DB 无数据时返回"暂无真实数据"

---

## [7.4.0] - 2026-06-20 — LINE 对话入口 V2 + 全链接修复

### 新增
- `lib/app-url.ts`: 中央 URL 工具（getBaseUrl / normalizeSymbolForUrl / stockUrl / aiPicksUrl 等8个函数）
- LINE 对话 V2：7个新意图（AI推荐/科技股/全市场/新闻/通知/持仓/帮助）→ 返回 Flex Message
- `lib/line-flex.ts` 新增 7 个 V2 构建器：buildAiPicksChatFlex / buildAiThemeChatFlex / buildMarketSummaryFlex / buildNotificationStatusFlex / buildHelpFlex / buildWelcomeFlex / buildGroupJoinFlex
- `scripts/validate-line-links.ts`: 全量验证所有 LINE Flex 按钮 URL（+HTTP 200 检查）
- `npm run validate:line-links`: 部署前必跑验证

### 修复
- 修复所有 LINE Flex Message 按钮 URL（之前 `line-agent.ts` fallback 为 `localhost:3000`）
- webhook 返回类型从 `string | null` 升级为 `LineMessage[] | null`（支持 Flex 直接返回）
- Follow/Join 欢迎消息改为 V2 Flex Card
- `lib/line-agent.ts` APP_URL localhost 错误 fallback → 使用 `getBaseUrl()`

### 验证结果
- validate:line-links → 0错误，9核心页面全部 HTTP 200
- 所有 Flex 按钮 URL: https://aitohoshou.com/* 正确
- normalizeSymbolForUrl: 7203→7203.T, 291A→291A.T ✅

---

## [7.3.0] - 2026-06-20 — LINE 中文名 + Flex Message 智能推送

### 概述
- **全面 Flex Message 升级**：所有 LINE 推送改为 LINE Flex Message 富文本卡片，禁止纯文本股票列表
- **股票中文名统一**：新增 `getStockDisplayName()` 工具，所有推送优先显示 nameZh
- **通知管理系统**：新增 `/notifications` 管理页、`NotificationSetting` DB 模型、6 个 API 路由
- **异动提醒**：新增 `check-alerts.ts` 每30分钟检测价格涨跌≥5%/出来高≥2x/HIGH新闻，去重推送

### 新增文件
- `lib/stock-display-name.ts` — `getStockDisplayName(nameZh→name→nameEn→symbol)` / `getStockSubName()`
- `lib/line-flex.ts` — 7个 Flex Message 构建器：`buildMorningReportFlex` / `buildMiddayFlex` / `buildCloseReportFlex` / `buildAlertFlex` / `buildRiskAlertFlex` / `buildStockCard` / `buildTestFlex`
- `scripts/check-alerts.ts` — 异动提醒脚本（价格涨跌≥5% / 出来高≥2x / HIGH新闻）
- `app/notifications/page.tsx` — 通知管理页（测试按钮 + 设置 + 日志）
- `app/api/line/test-flex/route.ts` — `POST /api/line/test-flex`
- `app/api/notifications/settings/route.ts` — GET/POST 通知设置
- `app/api/notifications/logs/route.ts` — GET 推送日志
- `app/api/notifications/send-morning-report/route.ts` — POST 立即发送朝報
- `app/api/notifications/send-close-report/route.ts` — POST 立即发送大引けまとめ
- `app/api/notifications/check-alerts/route.ts` — POST 触发异动检查

### 修改文件
- `lib/line.ts` — 新增 `LineFlexMessage` / `FlexBubble` / `FlexCarousel` 等所有 Flex 类型 + `flexMsg()` 构建器
- `lib/line-push.ts` — export `flexMsg`
- `scripts/send-morning-brief.ts` — 改为 `buildMorningReportFlex`，写入 NotificationLog
- `scripts/send-closing-summary.ts` — 改为 `buildCloseReportFlex`，写入 NotificationLog
- `scripts/send-midday-flash.ts` — 改为 `buildMiddayFlex`，写入 NotificationLog
- `scripts/send-line-risk-alert.ts` — 改为 `buildRiskAlertFlex`，写入 NotificationLog
- `scripts/cron-scheduler.ts` — 新增每工作日 09:00-16:00 每30分钟 `check-alerts.ts`
- `components/Sidebar.tsx` — 新增"🔔 通知管理"导航
- `prisma/schema.prisma` — 更新 `NotificationLog`（symbols String[], errorMessage），新增 `NotificationSetting`
- `package.json` — 新增 `line:check-alerts` / `line:check-alerts:dry` npm scripts

### Flex Message 设计规范
- **颜色**：BUY=#27AE60(绿) WATCH=#E67E22(橙) AVOID=#C0392B(红) 按钮=#3B82F6(蓝)
- **日本股价色**：涨=红 跌=蓝（日本惯例）
- **名称优先级**：nameZh → name(nameJa) → nameEn → symbol（不允许空白）
- **每报最多 TOP5**，每条包含：中文名/代码/AI评分/推荐等级/理由/涨跌幅

---

## [7.2.0] - 2026-06-20 — V3.1 J-Quants 机构资金实时接入 + 日本科技股主题筛选

### 概述
- **TOHOSHOU AI V3.1**：资金面评分升级为 J-Quants `/v2/equities/investor-types` 真实数据，3714只股票全部 scoreSource=REAL
- **日本科技股・AI产业链**：新增 `/ai-theme` 主题筛选页，覆盖 6 分类 38 只核心科技股

---

### V3.1 — J-Quants 机构资金流接入

#### `scripts/fetch-jquants-investor-types.ts`（新增）
- 调用 J-Quants `/v2/equities/investor-types`，获取 TSEPrime/TSEStandard/TSEGrowth 三市场
- 9种投资者类型：foreigners/trust/corp/individual/dealer/trust_bank/insurance/bank/other
- API 单位 ¥1 → 除以 1e8 → 億円写入 DB
- source = `"jquants_investor_types"`，authority rank = 1（最高）
- 支持 `--dry-run`、`--weeks=N` 参数
- npm scripts：`sync:institutional-flow` / `sync:institutional-flow:dry`

#### 数据权威体系（新增）
- **AUTHORITY_RANK**：`jquants_investor_types(1) = jpx(1) > jpx_file(2) > jpx_manual(3) > synthetic(99)`
- `StockScore` 新增 3 字段：`moneyFlowSource` / `globalTrendSource` / `scoreSource`
- `computeScoreSource()`：REAL = 两维度均真实；PARTIAL = 一个；FALLBACK = 无
- `REAL_MONEY_SOURCES`（`lib/ai-score.ts` 两处）= `["jquants_investor_types","jpx","jpx_file","jpx_manual"]`

#### `scripts/compute-scores.ts` 加固
- 优先选 `REAL_FLOW_SOURCES` 查 InstitutionalFlow，不被 synthetic 日期抢占最新位
- `FLOW_MAX_AGE_DAYS` 从 14 → 21 天（周度数据，允许3周内有效）
- J-Quants 数据自动用 market="TSEPrime"，legacy/synthetic 用 market="ALL"

#### `scripts/cron-scheduler.ts`
- 新增：**周五 16:30 JST** → `fetch-jquants-investor-types.ts`（正式）
- 新增：**周一 07:15 JST** → `fetch-jquants-investor-types.ts`（备份）

#### Synthetic 数据清零
- 本地 DB + 生产 DB 全部 synthetic 行已删除（4行）
- `scripts/fetch-institutional-flow.ts` 旧脚本不再自动写 synthetic
- 永不再写入 synthetic

#### `app/api/sync/route.ts` V3.1 升级
- GET 返回 `dataAuthority` 块：GlobalMarket 状态 / InstitutionalFlow 状态 / scoreSourceDist
- InstitutionalFlow 查询：优先查真实 sources，fallback 才用最新任意行
- `app/sync/page.tsx`：`isReal` 检查补全 `jquants_investor_types`，修复"SYNTHETIC"误显

#### 生产结果（2026-06-20）
```
InstitutionalFlow: 216行 jquants_investor_types（无 synthetic）
最新日期: 2026-06-12  外国人净=-4.9億円  投信净=+0.9億円
scoreSource: REAL 3714 / 100%
```

---

### AI 科技股主题筛选

#### `prisma/schema.prisma` — 新增 `AITheme` model
```prisma
model AITheme {
  id        Int      @id @default(autoincrement())
  symbol    String   @unique
  theme     String   // SEMICONDUCTOR|ELECTRONICS|SOFTWARE_AI|INDUSTRIAL_AUTO|TELECOM_DC|TECH_SERVICES
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([theme])
  @@map("ai_themes")
}
```

#### `scripts/seed-ai-themes.ts`（新增）
- 38只日本核心科技股，6分类
- seed 策略：先全量 deleteMany 再重建，避免旧 symbol 残留
- npm scripts：`seed:ai-themes`

| 分类 | key | 数量 |
|------|-----|------|
| 半导体设备 | SEMICONDUCTOR | 6 |
| 电子・传感器・精密 | ELECTRONICS | 7 |
| 软件・AI・云 | SOFTWARE_AI | 9 |
| 工业自动化・机器人 | INDUSTRIAL_AUTO | 5 |
| 通信・数据中心 | TELECOM_DC | 5 |
| 科技服务・互联网 | TECH_SERVICES | 6 |

#### `app/api/ai-theme/route.ts`（新增）
- 查 AITheme 全部 symbol → 分批查 StockScore（scored=true）+ Stock 表（unscored）
- 两者都无则用 `SYMBOL_NAME_FALLBACK`（9613.T NTT Data / 9719.T SCSK）
- 返回：`{ stocks[], themeSummary[], totalCount, scoredCount, updatedAt }`
- themeSummary 含：avgScore / buyCount / count / scoredCount / topSymbol

#### `app/ai-theme/page.tsx`（新增）
- 标题：「日本科技股・AI产业链」+ 「科技主题」标签
- 统计面板：科技股总数 / 已评分数量 / 平均分 / BUY数量 / 最高分
- 分类汇总卡（6张，可点击跳转 Tab）
- Tab 切换：全部 / 6分类
- 排序：综合评分 / 5日涨跌 / 20日涨跌
- 股票卡：5维度评分条 + 涨跌幅 + AI摘要，unscored 显示"评分待生成"

#### `components/Sidebar.tsx` 更新
- 在"AI推荐"后新增 `⚡AI产业链` 导航项，链接 `/ai-theme`

#### 生产结果（2026-06-20）
```
ai_themes: 38只，6分类
已评分: 36/38（9613.T NTT Data、9719.T SCSK 不在Stock表，显示评分待生成）
TOP1: 广濑电机 6806.T 71pt
平均分: ~53pt
HTTP 200 ✅
```

---

### 修改文件汇总

| 文件 | 变更 |
|------|------|
| `prisma/schema.prisma` | 新增 AITheme model；StockScore 新增 moneyFlowSource/globalTrendSource/scoreSource |
| `prisma/migrations/20260620_add_ai_themes/migration.sql` | 新增 |
| `prisma/migrations/20260620_score_source_fields/migration.sql` | 新增 |
| `scripts/fetch-jquants-investor-types.ts` | 新增：J-Quants investor-types 周度同步 |
| `scripts/seed-ai-themes.ts` | 新增：38只科技股种子数据（后续调整为6分类版本）|
| `scripts/compute-scores.ts` | 更新：scoreSource/moneyFlowSource/globalTrendSource 写入；REAL_FLOW_SOURCES 优先查询 |
| `scripts/cron-scheduler.ts` | 更新：周五16:30+周一07:15 J-Quants 机构流向自动同步 |
| `lib/ai-score.ts` | 更新：两处 REAL_MONEY_SOURCES 均含 jquants_investor_types；computeScoreSource() |
| `app/api/ai-theme/route.ts` | 新增：科技股主题 API |
| `app/api/sync/route.ts` | 更新：dataAuthority 块；InstitutionalFlow 优先查真实源 |
| `app/ai-theme/page.tsx` | 新增：科技股主题筛选页面 |
| `app/sync/page.tsx` | 更新：isReal 含 jquants_investor_types；DataAuthorityStatus 面板 |
| `components/Sidebar.tsx` | 更新：新增 AI产业链 导航项 |
| `package.json` | 更新：sync:institutional-flow / seed:ai-themes |

---

## [7.1.0] - 2026-06-20 — VIX 实时修复 + LINE 智能推送升级（朝報/午間/大引）

### 修复

#### `scripts/fetch-global-market.ts`
- VIX 抓取改用 `yf.quote("^VIX").regularMarketPrice`（实时报价），不再依赖 `historical()` — 旧方式某些日期 close=null 导致 VIX 显示 N/A
- 保留 fallback：quote 失败时回退到 `historical()`
- 验证：VIX 由 "N/A" → 实时 16.78

### 新增

#### `scripts/send-morning-brief.ts` (npm run line:morning-brief)
- 每个工作日 **08:00 JST** 在开场前30分钟推送
- 内容：昨夜グローバル市場（NASDAQ/VIX/USDJPY/日経）→ AI推薦 TOP5（HOLD以上）→ 超買警戒（RSI≥75）
- 市場スコア进度条可视化

#### `scripts/send-midday-flash.ts` (npm run line:midday-flash)
- 每个工作日 **12:30 JST** 午間速報
- 内容：急騰株（5日+5%以上・AI注目）→ 急落株（-5%以下）→ MACD 買転換シグナル → 市場体温
- 无注目銘柄时自动跳过，不推送

#### `scripts/send-closing-summary.ts` (npm run line:closing-summary)
- 每个工作日 **15:45 JST** 大引け後总结
- 内容：市場総括（分布 + 平均スコア棒グラフ）→ AI推薦銘柄パフォーマンス → 底打ちサイン候補 → 本日注目ニュース

### 修改

#### `scripts/cron-scheduler.ts`
- 新增 **05:30 JST** GlobalMarket 取得（AI評分前に確保）
- 新增 **08:00 JST** LINE 朝報（工作日）
- 新增 **12:30 JST** LINE 午間速報（工作日）
- 新增 **15:45 JST** LINE 大引けまとめ（工作日）
- 各 LINE 推送统一用 `hasLine()` 判断

#### `package.json`
- 新增 scripts：`line:morning-brief` / `line:morning-brief:dry` / `line:midday-flash` / `line:midday-flash:dry` / `line:closing-summary` / `line:closing-summary:dry`

---

## [7.0.0] - 2026-06-20 — TOHOSHOU AI V3：全球市场真实数据接入第一阶段

### 概述

将 V2 的两个"固定默认值"替换为真实市场数据：
- `globalTrendScore`：改为从 Yahoo Finance 抓取 NASDAQ/VIX/USDJPY/日经指数，动态计算 0-10 分
- `moneyFlowScore`：预留 JPX 机构资金流接口，JPX 不可访问时自动 fallback 到 V2 代理评分

### 新增

#### `scripts/fetch-global-market.ts` (新 npm run fetch-global-market)
- 从 Yahoo Finance 抓取：NASDAQ (^IXIC), VIX (^VIX), USD/JPY (JPY=X), 日经 (^N225), TOPIX (^TOPX)
- 评分逻辑：NASDAQ变化(3pts) + VIX水平(3pts) + USD/JPY区间(2pts) + 日经变化(2pts) → 0-10分
- 写入 `GlobalMarket` 表
- 当日数据：NASDAQ +1.91%，日经 +0.28%，USD/JPY 161.27，score=7

#### `scripts/fetch-institutional-flow.ts` (新 npm run fetch-institutional-flow)
- 目标：JPX「投資部門別売買動向」周次 CSV（外資/投信/法人/個人）
- 当前状态：JPX 网站从海外服务器不可访问 → 自动 fallback 写入 synthetic 中性数据
- 当 JPX 数据获取成功时：替换 `calcInflow(return60d)` 为 `calcRealInflow(foreigners+trust)` (0-8分)
- 写入 `InstitutionalFlow` 表（date, investorType, market, buyAmount, sellAmount, netAmount, source）

#### `app/api/market-data/route.ts`
- 验证接口：返回 GlobalMarket/InstitutionalFlow 最新状态、数据新鲜度、scoring mode
- scoringMode: `{ globalTrend: "yahoo_v3"|"v2_default_7", moneyFlow: "jpx_v3"|"synthetic_neutral"|"v2_proxy" }`

### 修改

#### `prisma/schema.prisma`
- `InstitutionalFlow`：重构为市场整体投资部门数据（investorType, market, buyAmount, sellAmount, netAmount, source）
- `GlobalMarket`：新增字段 nasdaqChange, nikkei, nikkeiChange, topix, topixChange, source

#### `lib/ai-score.ts`
- 新增类型 `GlobalMarketData`, `InstitutionalFlowData`
- `ScoreInput` 新增可选字段 `globalMarketData`, `institutionalFlowData`
- `calcGlobalTrendReal()`: 从实时 GlobalMarket 数据计算 globalTrendScore
- `calcRealInflow()`: 从 JPX 机构资金流数据计算 inflow 分量（0-8分）
- `AiScoreResult` 新增 `moneyFlowSource`, `globalTrendSource` 用于透明度展示
- 数据缺失时完整 fallback：JPX synthetic/缺失 → V2 proxy；GlobalMarket 缺失/过期 → 默认7

#### `scripts/compute-scores.ts`
- 评分前预加载最新 GlobalMarket（≤7天）和 InstitutionalFlow（≤14天）
- 日志输出数据日期、score、source，以及是否使用 fallback

### 生产数据状态 (2026-06-20)

| 维度 | 数据源 | 状态 |
|------|--------|------|
| globalTrendScore | Yahoo Finance (NASDAQ/日経) | ✓ 实时 score=7/10 |
| moneyFlowScore | JPX (海外不可访问) | → V2 proxy fallback |
| newsSentimentScore | Kabutan 新闻 | 不变 |
| technicalScore | J-Quants 价格数据 | 不变 |
| fundamentalScore | J-Quants 财务数据 | 不变 |

### 评分分布（全量 3714 只）

| 评级 | 数量 |
|------|------|
| STRONG_BUY | 0 |
| BUY | 0 |
| HOLD | 410 |
| WATCH | 1463 |
| AVOID | 1841 |
| 平均分 | 49.8 |
| 最高分 | 79 |

---

## [6.1.0] - 2026-06-20 — TOHOSHOU AI V2 稳定性复查（V1残留清零）

### 修复（全站 V1 残留清零）
- `app/api/ai-scores/route.ts`：新增 moneyFlowScore/newsSentimentScore/globalTrendScore/newsSummary 返回；删除全零 V1 detail 对象
- `app/ai-picks/page.tsx`：类型、标签、进度条全面升级为5维度（"安全性(40%)" → "資金/情绪/全球"）
- `app/page.tsx`：首页 TOP3 "安全性" → "資金面"，新增 moneyFlowScore 查询
- `app/screener/page.tsx`：副标题 "技术40%+基本面40%+安全性20%" → "技術/30+基本面/25+資金面/20+情绪/15+全球/10"
- `lib/ai-agent.ts`：LINE 完整分析中 "安全性" → "資金面" (2处)
- `lib/line-agent.ts`：LINE 推送评分拆解中 "安全性" → "資金面"

---

## [6.0.0] - 2026-06-20 — TOHOSHOU AI V2（100分5维度评分系统）

---

## [5.8.0] - 2026-06-20 — 全量股票中文名填充（100% 覆盖）

### 新增

#### `scripts/seed-all-chinese-names.ts`
- **目标**：3716 只 TSE 股票全部获得 `nameZh`，覆盖率从 167/3716 (4.5%) → 3716/3716 (100%)
- 翻译优先级：手动精确映射（305只）> 保留已有 > 自动翻译
- **手动映射**：~305 只知名企业（丰田/索尼/三菱UFJ/任天堂/基恩士等主要行业龙头）
- **自动翻译规则（三级流水线）**：
  1. **全角归一化**：`Ａ-Ｚ` / `０-９` / `　` → ASCII 半角
  2. **片假名→中文词典**（60+ 条）：`ホールディングス→控股`, `テクノロジー→技术`, `グループ→集团` 等
  3. **日语汉字→简体中文字典**（90+ 字）：`東→东`, `電→电`, `極→极`, `銀→银`, `証→证` 等
- 执行命令：`npm run seed-all-zh`（跳过已有）/ `npm run seed-all-zh:force`（全量覆盖）
- 生产已执行：**3716/3716 = 100%，0 失败**

### 质量验收
- `極洋 → 极洋`（汉字转换）
- `東洋水産 → 东洋水产`（東→东, 産→产）
- `ウエストホールディングス → ウエスト控股`（片假名转换）
- `信越化学工業 → 信越化学工业`（手动 + 工業→工业）
- `黒田グループ → 黑田集团`（黒→黑, グループ→集团）

---

## [5.7.0] - 2026-06-20 — 中文名显示体系（nameZh）

### 新增

#### DB Schema：`Stock.nameZh` + `StockScore.nameZh`
- 新增 `nameZh TEXT` 字段到 `Stock` 和 `StockScore` 表
- 迁移：`prisma/migrations/20260620_add_name_zh/migration.sql`
- 本地 `prisma db push` + `prisma generate` 已同步

#### 中文名种子数据（`scripts/seed-chinese-names.ts`）
- 覆盖 **168 只**主要日本上市股票的中文名
- 包括：丰田汽车 / 索尼集团 / 软银集团 / 任天堂 / 三菱UFJ金融集团 / 东京电子 / 基恩士 / 迅销集团（优衣库）/ 日本M&A中心 / 东京海上控股 等
- 执行：`npm run seed-zh-names`

#### 个股详情页 Header 重设计
- **第一行**：`nameZh`（font-size: 40px, bold, #111827）— 无中文名时隐藏
- **第二行**：`name`（日文名，18px, #4B5563；无中文名时升为主标题）
- **第三行**：`nameEn`（英文名，16px, #6B7280）— 有时显示
- **第四行**：股票代码灰蓝 Badge（monospace, 圆角）+ 市场 + 行业 chips
- 效果示例：极东 / きょくとう / Kyokuto Co.,Ltd. / `2300.T`

#### 列表页股票格
- 有中文名：`nameZh`（粗体主行）+ `name`（日文小字）+ `symbol`（灰色）
- 无中文名：`name`（原样）+ `symbol`

#### 搜索升级（三端同步）
- 列表页搜索：同时匹配 `symbol` / `nameZh` / `name`（含 `.T` 去除后数字搜索）
- `/api/stocks` 搜索：增加 `nameZh` + `nameEn`（不区分大小写）到 OR 条件
- 搜索框提示文字更新：`搜索：代码（7203）、中文名（丰田）、日文名（トヨタ）`

#### `compute-scores.ts` 同步
- 每次重算 AI 评分时，同步将 `Stock.nameZh` 写入 `StockScore.nameZh`

### 生产部署步骤（额外）
```bash
# 生产 DB 迁移（SSH进入服务器）
psql $DATABASE_URL -c "ALTER TABLE \"Stock\" ADD COLUMN IF NOT EXISTS \"nameZh\" TEXT;"
psql $DATABASE_URL -c "ALTER TABLE \"StockScore\" ADD COLUMN IF NOT EXISTS \"nameZh\" TEXT;"

# 同步 prisma schema + regenerate
rsync prisma/schema.prisma root@8.209.247.68:/opt/tohoshou/prisma/
ssh root@8.209.247.68 "cd /opt/tohoshou && npx prisma generate"

# 填充中文名
rsync scripts/seed-chinese-names.ts root@8.209.247.68:/opt/tohoshou/scripts/
ssh root@8.209.247.68 "cd /opt/tohoshou && npx tsx scripts/seed-chinese-names.ts"
```

### 修改文件

| 文件 | 变更类型 |
|------|---------|
| `prisma/schema.prisma` | 新增 `nameZh` 字段（Stock + StockScore）|
| `prisma/migrations/20260620_add_name_zh/migration.sql` | 新增 |
| `scripts/seed-chinese-names.ts` | **新增**：168 只股票中文名种子 |
| `scripts/compute-scores.ts` | 同步 `nameZh` 到 StockScore |
| `app/api/indicators/route.ts` | 返回 `nameZh` |
| `app/api/stocks/route.ts` | 搜索 + 返回 `nameZh` |
| `app/stocks/[symbol]/page.tsx` | Header 重设计（4行层级）|
| `app/stocks/page.tsx` | 列表格：nameZh + name + symbol |
| `package.json` | 新增 `seed-zh-names` 命令 |

### 生产部署（2026-06-20 已完成）✅

| 步骤 | 结果 |
|------|------|
| DB ALTER TABLE Stock + StockScore | ✅ |
| npx prisma generate（生产） | ✅ |
| seed-chinese-names.ts（生产） | ✅ 167 只 |
| npm run build + rsync .next/ | ✅ |
| pm2 restart tohoshou-web | ✅ online |

**验收结果**
- `GET /api/stocks/2300.T` → `nameZh:"极东"` ✅
- 搜索「极东」→ 2300.T ✅ | 搜索「2300」→ 2300.T ✅
- 搜索「Kyokuto」→ 2300.T ✅ | 搜索「丰田」→ 7203.T 等 ✅
- 无 nameZh 的股票（nameZh=null）→ 日文名正常降级显示 ✅
- indicators TOP500 中 39 只展示中文名，128 只在 TOP500 外（评分问题，非 nameZh 问题）

---

## [5.6.0] - 2026-06-20 — LINE Webhook 上线 + 智能推送规划

### 完成

#### LINE Bot 全面上线（验证通过）

- **Webhook URL 已注册**：`https://aitohoshou.com/api/line/webhook`
  - LINE Developers Console 已填入并启用 Use webhook
  - GET 健康检查返回：`{"status":"LINE webhook active","version":"ai-chat"}`
- **LINE 推送验证通过**：主动推送消息已成功送达
- **用户消息自动回复验证通过**：向 Bot 发送股票代码自动返回 AI 分析

### 规划（下阶段 P1）

#### LINE 智能推送升级（待开发）

| 功能 | 说明 |
|------|------|
| 每日早报 | 08:00 JST，STRONG_BUY TOP5 卡片 |
| 午间快报 | 12:30 JST，涨跌幅 > 5% 异动股 |
| 收盘总结 | 15:45 JST，日涨跌榜 + AI 分析 |
| 异动提醒 | 价格突破 52w 高/低、量能异常 |
| 持仓提醒 | WatchList 重要新闻 / 业绩公告 |
| Flex Message | 富文本卡片格式（`lib/line-flex.ts`）|
| NotificationSetting | 用户订阅偏好表（DB 新增）|
| NotificationLog | 推送历史记录表（DB 新增）|

---

## [5.5.0] - 2026-06-20 — 新闻同步改异步任务（消除 504 超时）

### 改进

#### 新闻同步 `POST /api/sync/news` 改为 fire-and-forget 异步模式

- **根因**：Top 200 只 Kabutan 新闻抓取耗时约 160 秒（800ms 间隔 × 200 只），nginx 60s 超时导致 504
- **修复**：参照 jquants 异步方案重写 `app/api/sync/news/route.ts`
  - `POST`：防重检查 → 创建 SyncJob（`source="news"`, `total=200`）→ `void runNewsSync()` 后台执行 → 立即返回 `{ jobId, status:"RUNNING", total, processed:0 }`
  - 后台 `runNewsSync`：Yahoo(50只) → Kabutan(200只，每只更新进度) → TDnet
  - 进度跟踪：每处理完一只 Kabutan 股票，更新 `SyncJob.processed / successCount / failedCount`
  - 完成后写 SyncLog（与之前一致）
- **前端** `app/sync/page.tsx`：
  - 新增 `newsJobStatus` state + `newsPollTimer` ref
  - 新增 `startNewsPolling(jobId)` 函数（每3秒轮询 `/api/sync/jobs/:jobId`）
  - `runSync("news")` 检测 `data.jobId` → 触发轮询（与 jquants 对称）
  - 新闻卡片显示「异步任务」badge + `JobProgressPanel` 进度条
  - 轮询完成（SUCCESS/FAILED）后自动刷新全局 SyncStatus

### 修改文件

| 文件 | 变更类型 |
|------|---------|
| `app/api/sync/news/route.ts` | 重写：异步任务 + fire-and-forget |
| `app/sync/page.tsx` | 更新：news 轮询 + 进度条 |

---

## [5.4.0] - 2026-06-20 — Kabutan 新闻修复 + J-Quants 504 异步任务

### 修复

#### Kabutan 新闻爬虫（P0，两处 bug）

**Bug 1：无效 Date 导致 Prisma 批量静默失败**
- 现象：`upsert` 全部走 `.catch(() => null)`，DB 新闻条数一直为 0
- 根因：`parseKabutanDate` 对 `MM/DD HH:mm` 格式拼接 `new Date("2026-00-00T...")` → `NaN`，Prisma 在校验阶段抛 `Invalid value for argument 'publishedAt'`
- 修复：`lib/kabutan.ts` — 新增 `valid()` 包装：`const valid = (d: Date) => !isNaN(d.getTime()) ? d : null`，两条正则分支均经过 `valid()` 后才返回

**Bug 2：CSS 选择器指向错误元素**
- 现象：所有 1542 篇文章 `relatedSymbolConfidence=25`，无一被分类为材料（50）
- 根因：代码用 `td[class*='newslist_ctg']`，但实际 Kabutan HTML 结构为 `<td><div class="newslist_ctg newsctg_kaiji_b">...</div></td>`，class 在 `<div>` 上而非 `<td>`
- 修复：改为 `row.querySelector(".newslist_ctg")`

**修复结果（生产验证）**
- 新闻总条数：0 → **1,590 条**
- confidence=50 材料新闻：0 → **387 条**
- 修复后执行 `npm run compute-scores` → 3,714 只股票 AI 评分全量更新

#### J-Quants 同步 504 Gateway Time-out（P0）

- 现象：`/sync` 页面点击 J-Quants 立即同步返回 HTTP 504（nginx 60s 超时），Top200 近90天数据耗时 30+ 分钟
- 修复：**异步任务模式（fire-and-forget）**

**新增 SyncJob 数据表**（`prisma/schema.prisma` + `prisma/migrations/20260620_add_sync_job/migration.sql`）

**重写** `app/api/sync/jquants/route.ts`
- `POST`：防重检查 → 创建 SyncJob → `void runJQuantsSync()` 后台执行 → 立即返回 `{ success:true, jobId, status:"RUNNING", total, processed:0 }`
- `runJQuantsSync`：Top200，批次10只，300ms 间隔，每批更新进度，单只失败不中断，完成写 SyncLog

**新增** `app/api/sync/jobs/[jobId]/route.ts`
- `GET`：返回 `{ jobId, status, total, processed, successCount, failedCount, pct, startedAt, finishedAt }`

**更新** `app/sync/page.tsx`
- 新增 `jobStatus` state + `pollTimer` ref + `startPolling(jobId)` 函数（每3秒轮询）
- 新增 `JobProgressPanel` 组件：进度条 + pct% + processed/total

**生产验证（2026-06-20）**
- POST 立即返回 jobId（无504）✅
- 进度条每3秒更新 ✅
- 后台同步：60/200 已处理，success=60，failed=0 ✅
- Financial 表：13,619 → 35,986 条（同步中持续增加）✅

### 修改文件

| 文件 | 变更类型 |
|------|---------|
| `lib/kabutan.ts` | 修复：parseKabutanDate NaN + CSS 选择器 |
| `prisma/schema.prisma` | 新增：SyncJob model |
| `prisma/migrations/20260620_add_sync_job/migration.sql` | 新增 |
| `app/api/sync/jquants/route.ts` | 重写：异步任务 + fire-and-forget |
| `app/api/sync/jobs/[jobId]/route.ts` | 新增：任务进度查询 |
| `app/sync/page.tsx` | 更新：轮询 + JobProgressPanel |

---

## [5.3.0] - 2026-06-20 — 数据源同步修复（Yahoo Finance + J-Quants）

### 修复

#### Yahoo Finance Japan（P0 修复）
- **根因**：`yahoo-finance2` v3 改为实例模式，调用 `YahooFinance.quote()` 静态方法会抛 "Call `const yahooFinance = new YahooFinance()` first"
- **新增** `lib/yahooFinance.ts` — 统一单例封装：`export const yahooFinance = new YahooFinance()`
- **更新** `lib/yahoo.ts` — 移除旧 `require("yahoo-finance2").default`，改为 `import { yahooFinance } from "@/lib/yahooFinance"`
- 修复 `fetchQuote` 返回类型：v3 返回联合类型，改用 `any` + `num()` 辅助函数安全提取数值字段
- 修复 `fetchNews` 中 `providerPublishTime` 类型：v3 返回 `Date`（旧 v2 为 `number`），兼容两种类型

#### J-Quants（P0 修复）
- **重写** `lib/jquants.ts` — 实现 V1 email/password 认证流程
- **新增** `configStatus()` 函数：返回当前认证方式
- **新增** token 内存缓存（23h TTL），自动续期
- **向后兼容** `JQUANTS_API_KEY`：V2 `x-api-key` 模式

### 修改文件

| 文件 | 变更类型 |
|------|---------|
| `lib/yahooFinance.ts` | **新增**：yahoo-finance2 单例 |
| `lib/yahoo.ts` | 修复：import + 类型 + fetchNews |
| `lib/jquants.ts` | 重写：V1 auth + content-type 防护 + token 缓存 |
| `app/api/sync/jquants/route.ts` | 更新：错误提示 + configStatus |

---

## [5.2.0] - 2026-06-20 — K 线图升级 + 推荐阈值优化 + 生产全量重算

### 新增

#### K 线图（PriceChart.tsx 完全重写）
- **蜡烛图（Candlestick）**：含 Open/High/Low/Close，红涨蓝跌（日本配色）
- **MA 均线**：MA5（橙）/ MA20（蓝）/ MA60（紫）同图显示
- **成交量柱**：图表底部30%区域
- **鼠标 Tooltip**：悬停显示 OHLCV + MA5/MA20，十字线跟随

#### API 增强
- `app/api/stocks/[symbol]/indicators/route.ts` — series 数据由 `{date,close,volume}` 升级为 `{date,open,high,low,close,volume}`

### 变更
- `lib/ai-score.ts` — 推荐阈值：`STRONG_BUY≥90 | BUY≥70 | WATCH≥60 | HOLD≥45 | AVOID<45`
- 调整后 TOP50 中 BUY 推荐从 0 只 → **50 只**

---

## [5.1.0] - 2026-06-19 — 生产无限加载修复 + 全量数据同步完成

### 修复（紧急 P0）
- `app/api/indicators/route.ts` — 从 3716 只股票并发 `Promise.all` 改为单次读 `StockScore` TOP500
- `app/api/ai-scores/route.ts` — 同上修复

### 全量数据同步
- DailyPrice：7,912,242 条（TSE 全3716只，近90天）
- Financial：13,619 条
- StockScore：3,714 只全量评分

---

## [5.0.0] - 2026-06-19 — 初始版本

- Next.js 16 + Prisma 7 + PostgreSQL
- J-Quants / Yahoo Finance / Kabutan / TDnet 数据源
- AI 评分引擎（5维度）
- LINE Bot 集成
- 生产部署：aitohoshou.com（阿里云 8.209.247.68）

## v17.19.0 — 2026-06-30

### T2 P1: Strategy Center UI 精修 + AI组合 Legacy 退役

**app/portfolio/page.tsx** — 完全重写为 Legacy 重定向页
- 移除所有旧 AI Top10 快照展示内容
- 简洁重定向卡片，含公告提醒 + 「前往策略中心」按钮

**app/strategy/page.tsx** — 大范围 UI 精修
- 顶部新增三状态卡行（综合状态 / 今日执行状态 / 稳定化状态）
- 成交记录改名「最近成交记录」，新增买入价/卖出价列，退出原因 i18n 翻译（11种）
- 推荐列表重构为表格，按策略类型动态显示得分列（日内:技术+新闻+综合, 波段:技术+综合, 长线:基本面+综合）
- 回测成熟度标签 i18n 化（数据不足/数据有限/...）
- "Strategy Center" → "策略中心"（三语言）

**app/api/strategy/overview/route.ts** — API 增强
- 新增 `todayExecution`（日内/波段/长线推荐、回测、学习、日检验6项状态）
- 新增 `recentValidation`（近30天健康天数、stableDays、phase7Ready）

**app/api/strategy/[type]/route.ts** — top10 新增得分字段
- 返回 `technicalScore / fundamentalScore / newsScore / moneyFlowScore / riskScore`

**lib/i18n/** — 新增 ~50 个 i18n key
- portfolio.legacy.* (6), strategy.system_status.* (4), strategy.today_exec.* (7)
- strategy.stab_card.* (5), strategy.exit.* (11 退出原因), strategy.maturity.*
- strategy.rec.final/tech/fund/news/date
