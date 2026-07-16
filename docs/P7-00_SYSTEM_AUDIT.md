# P7-00 系统总检报告（System Audit）

> 只读审计，未修改任何代码。审计日期 2026-07-16。基线版本 v17.92.0（HEAD b0e26fd，working clean）。
> 方法：5 个只读子审计（页面/导航、API、Cron、AI评分+因子平台、数据库）+ 特性开关层交叉核实。所有引用判定基于代码 grep，未查询生产库真实行数。

---

## 0. 规模总览

| 维度 | 数量 | 备注 |
|---|---|---|
| 页面 page.tsx | 37 | 其中 6 个 legacy 重定向、3 个孤儿、1 个占位 |
| API route.ts | 93 | 约 30 个疑似废弃/无前端引用 |
| Cron 注册 | 37 | 1 处双重并发链、3 组同分钟并发 |
| 数据库 model | 61（+4 enum=65 声明） | 无「完全未引用」表；4 表只写不读/只读不写 |
| 因子注册 | 83（Prod46/Shadow37） | 仅 8 个有真实截面回测；31 个 pending 无回测 |
| scripts | 74 | 2 个孤儿脚本（pipeline / strategy-backtest:legacy） |

---

## 1. 模块状态总表（生产/已开发未启用/UI占位/已废弃）

### ✅ 已投入生产（用户或运维实际在用）

- **评分主链**：`compute-scores.ts`（07:30 内嵌 06:00）→ `StockScore` → `rerank-top500`（GPT 30% 权重）→ `DailyRecommendation`
- **三策略引擎**：Day/Swing/Long strategy + StrategyRecommendation/Position/TradeResult/Snapshot/CapitalLog + 学习/验证/回测汇总
- **Paper Broker（现役模拟盘）**：Paper Account/Order/Execution/Position/CashLog（`/portfolio`）
- **每日 AI 关注池**：DailyAIWatchlist（`/watchlist/daily`）
- **收盘决策 P6-T12**：ClosingDecision（`/admin/closing-decision`，15:15 JST）
- **展示层页面**：`/`（指挥中心）、`/strategy`、`/backtest`、`/admin/research`（多 tab 收敛 alpha/fusion/regime）、`/news`、`/admin/{learning-report,versions,verify,mission-control,runtime,decision-center}`、`/sync`
- **研究/影子层（自动跑但只写研究表，不外溢生产）**：Alpha 因子链（AlphaFactor/Report/Score/Backtest）、FactorAlphaResult、Feature Platform、MarketRegime/RegimeFusion/FusionPaperPick、AI Top Picks（实验）

### 🟡 已开发但未启用（代码完整，开关关闭 / 未接生产）

| 模块 | 证据 | 现状 |
|---|---|---|
| **Scoring V3（自适应 Pro 引擎）** | `lib/scoring-v3/`（动态权重+风险层+市场门控+标定+freeze）、`compute-score-v3-shadow` cron、4 个 `/api/scoring-v3/*`、freeze/shadow/calibration/backtest 页 | `SCORING_ENGINE=v2`，`compute-scores.ts` 完全不引用 V3，仅写 `AdaptiveScoreV3Shadow` 影子表。`getScoringEngine()` 抽象函数**无任何调用方** |
| **另一套 scoring.ts 引擎** | `lib/scoring.ts`（5×20 均权 growth/valuation 引擎，`SCORING_ENGINE` flag） | 未接入生产（scoring-engine.ts 自注「生产链路不读此标志」） |
| **Explain GPT/Hybrid Provider** | `lib/explain/provider.ts` 预留 GPT/Hybrid | `EXPLAIN_PROVIDER` 默认 rule，GPT/Hybrid 分支从不触发 |
| **AlphaScore / adaptiveScoreV3 因子** | 各自落 shadow 表 | pending，声明「绝不喂入生产评分/推荐」 |

### ⬜ 仅 UI 占位 / 兼容保留

- `/coming-soon`（`?feature=` 回退占位页）
- `/screener`（桌面已并入 `/`，仅移动端入口保留）

### ❌ 已废弃（代码/表/文档残留，无消费者）

| 类型 | 项 | 说明 |
|---|---|---|
| 页面 | `/ai-picks` `/alpha` `/alpha/*` `/fusion/report` | next.config 307 重定向遮蔽，页面文件仍在 |
| 页面 | `/fusion/paper` | 真实页面被 307 遮蔽 → 「死代码+拦截」并存 |
| 死组件 | `app/HomeDashboardClient.tsx`、`app/SystemDashboard.tsx` | 0 处 import，被 CommandCenter 取代 |
| 死导出 | `DashboardView` 默认导出、`PipelineCompact`、`QuickActions` | 除定义处外 0 引用 |
| 表 | `Portfolio`（原始持仓） | 只写不读，UI 已切 `/api/portfolio/paper` |
| 表 | `SimPortfolio`/`SimPosition`/`SimTrade` | 无任何前端/组件消费者，被 Paper* 取代 |
| API | 30 个（见 §4） | 单股 6 子接口被 intelligence 取代、sim-portfolio 整套、组合聚合多个、sync 旧编排器等 |
| env/文档 | LINE 推送（CLAUDE.md 整节 + `.env` LINE_*）、`WECOM_*`、`STRICT_REAL_DATA`、`DEEPSEEK_API_KEY` | 代码零引用；LINE 脚本/lib 已删但文档未清 |
| 脚本 | `pipeline`（daily-ai-pipeline）、`strategy-backtest:legacy` | 不在任何 cron，手动/遗留入口 |

---

## 2. AI Score 完整组成（生产唯一评分 `lib/ai-score.ts` calcAiScore，满分 100）

| 维度 | 权重 | 因子（子项） | 数据源表 | 成色 | 兜底 |
|---|---|---|---|---|---|
| technicalScore | 30 | maTrend12/MACD8/RSI6/动量4 | DailyPrice→indicators.ts | ✅ 真实 per-stock | 缺失给中性 3-5 |
| fundamentalScore | 25 | 营益率8/ROE7/EPS5/自有资本5 | Financial | ✅ 真实 per-stock | null→中性分（静默） |
| moneyFlowScore | 20 | inflow8/stability7/shortPressure5 | InstitutionalFlow（退 return60d 代理） | ⚠️ 真实源常缺 | 生产常退 synthetic/v2_proxy，inflow 恒 4；stability+shortPressure 永远价格派生 |
| newsSentimentScore | 15 | (正-负)/总×7+8 基准 | News（Kabutan+TDnet sentiment） | ✅ 真实 | 无新闻→恒 8（多数股常年 8） |
| globalTrendScore | 10 | GlobalMarket.score | GlobalMarket（Yahoo） | ✅ 真实（市场级全股同值） | 过期/缺→恒 7 |

**关键判断**：真正 per-stock 有区分度的只有 technical(30)+fundamental(25)；moneyFlow/news/global 三维（合计 45 分）大量落中性兜底，实际区分度弱于名义权重。`scoreSource`(REAL/PARTIAL/FALLBACK) 已诚实标注。

**adaptiveScore（主排序键）**：`classifyStockStyle()` 按 sector+财务归 6 风格，5 维先归一到达成率再按风格权重重加权。SPECULATIVE_MOMENTUM 同时置 highRiskFlag。

**GPT rerank**：`rerank-top500.ts`，`finalScore=adaptiveScore×0.7+gptScore×0.3`（GPT 唯一实质影响排名处），模型 `OPENAI_MODEL` 默认 gpt-4o-mini，无 key/失败→gptScore=ruleScore 退化纯规则。注：memory/注释里的「GPT-5.5」是文案，实际默认 4o-mini。

---

## 3. 因子平台逐项分级（83 因子）

- **8 个有真实截面回测**（唯一有 alpha/rankIc/hitRate 证据，进 factor-map，写 FactorAlphaResult）：`rs5/rs20/rs60/atrPct/averageTurnover20/volumeExpansionDays/volumeRatio20/distance52wHigh`（DailyPrice+TOPIX 计算）
- **PRODUCTION 46**：PRICE5/TECHNICAL10（计算）+ FUNDAMENTAL9/NEWS2/MONEY_FLOW3/TDNET1/GLOBAL5（真实，money 退代理）+ AI9（派生）
- **31 个 pending 无回测**（注册但不进任何评分）：
  - FUNDAMENTAL 影子 11：Financial 季度无 per-date 序列 → INSUFFICIENT_HISTORY；**`fin_cash_flow_quality` 恒 N/A**（Financial 表无现金流字段）= 典型完全无源
  - MONEY_FLOW 影子 11：InstitutionalFlow 市场级无 per-symbol → COVERAGE_TOO_LOW(0)
  - TDNET 影子 7：触发样本<30 或 event-study 未接 → NO_TRIGGER_SAMPLES/BACKTEST_DISABLED
  - AI 影子 2：alphaScore/adaptiveScoreV3 单独 shadow 评估

**Integrity=100 语义澄清**：只约束 8 个 mappable 因子链路完整；31 个 pending **不在完整性判据内故不扣分**。「100」= 已声明可回测的 8 个链路完整，**不代表 83 个因子都有数据**。这是诚实设计（未伪造回测），但对外易被误读为「全平台健康」。

---

## 4. Cron 审计（37 注册）

**依赖主线**：05:30 global-market → 06:00 sync-all-prices[JPX守卫] → Phase2 内嵌（compute-scores→rerank→snapshot→signal-stats→backtest→learning→health-guard）→ 07:30 watchdog/fallback + day-strategy/strategy-recs/paper-broker/daily-watchlist[整块守卫]。研究层 08:45–10:45 全只读派生。收盘 16:35→16:40→16:45→17:00→17:15 五策略串行错峰。15:15 收盘决策。

**问题清单**：

| 级别 | 问题 |
|---|---|
| 并发 | **22:00 双任务**（sync-news + sync-stock-meta 同分钟，均重 I/O，cron 限 512M）；**周五16:45**（strategy-backtest + gen-v3-final-review）；**周五17:00**（strategy-learning + ai-top-picks-weekly，后者插进本应串行的策略链）；07:00（sync-news + fetch-tdnet） |
| 竞态 | 09:00–10:45 研究层「叠罗汉」：依赖方启动时间 < 被依赖方最大超时（如 09:15 alpha-score 依赖 09:00 analytics 但 analytics timeout 15min；09:25 feature-platform 依赖 09:20 factor-alpha 但只等 5min）→ 隐性读半成品风险 |
| 缺守卫 | 4 个写「当日日期行」的任务无 JPX 守卫：`compute-alpha-factors`(08:45)/`compute-alpha-score`(09:15)/`fusion-paper-trade`(10:00)/`compute-score-v3-shadow`(10:15)。休市日基于陈旧价生成脏派生行（仅污染研究表，不外溢生产）。另 fetch-tdnet/short-selling 仅排周末未排祝日 |
| 文档漂移 | **CLAUDE.md Cron 段列的 08:00/08:30/12:30/15:45/16:35 LINE 推送 cron 在 scheduler 里根本不存在**；scheduler 自身头部 docstring 未含 alpha/v3/top-picks/closing-decision 等十几个新 cron |
| 无重复扣费 | 核心链只 06:00 跑一次，07:30 fallback 有 isPhaseCompletedToday 幂等守卫 ✅ |

---

## 5. 数据库废弃表/字段

**可直接清退**：`Portfolio`（只写不读）、`SimPortfolio/SimPosition/SimTrade`（无 UI 消费者）+ 对应 API。
**先核对生产行数再定**：`ExperimentRegistry`（零写入源，疑空表）、`VersionSnapshot`（零程序化写入，只读陈旧）。

**冗余表组**：
- 组合概念 4 代并存 → 现役仅 PortfolioSnapshot* + Paper*，Portfolio/Sim* 可退
- 回测多套：BacktestResult/Error/PositionResult(真源) + DailyRecommendation 回测列(schema 标 DEPRECATED 却仍留仍被 verify 读) + AlphaBacktestResult + FactorAlphaResult
- 策略回测两张：StrategyBacktestResult(v15逐股) vs StrategyBacktestSummary(v17.9聚合)
- 影子分 4 套：GPTScore / AdaptiveScoreV3Shadow / AlphaScore / StockScore.shadow* 字段

**废弃字段**：
- `DailyRecommendation`：return/exitDate/price 7d·30d·90d + priceSource/entryPriceType/filledAt（schema 注释 DEPRECATED，被 BacktestPositionResult 取代，但 `admin/verify:360` 仍读）
- `StockScore`：riskScore/rawScore/shadowModelScore·Recommendation·Rank·GeneratedAt/tohoshouModelVersion(="disabled")/modelConfidence(=0)
- `GlobalMarket`：sox/cpi/fedRate（legacy 宏观未用）
- `AlphaFactor`：buyback/dividendRaise/guidanceRaise/tdnetEvent（Phase1 占位，长期 null）

---

## 6. 导航/页面重复与可合并

1. **6 个「驾驶舱/总览」重叠**：`/`、`/admin/decision-center`(超集聚合)、`/admin/closing-decision`(收盘切面)、`/admin/ai-top-picks`、`/admin/feature-platform`、`/admin/mission-control`。→ 以 decision-center 为统一驾驶舱，closing-decision 降为其「收盘」tab，ai-top-picks/feature-platform 收为子模块
2. **因子三件套可合一**：`/admin/features`+`/feature-promotion`+`/feature-platform` → 单页多 tab
3. **回测双入口**：`/backtest` vs `/admin/research?tab=backtest`（+`/alpha/backtest` 307 也指此）
4. **watchlist 语义冲突**：`/watchlist`(个人自选,孤儿,含硬编码中文违反 i18n) vs `/watchlist/daily`(AI 关注池)
5. **孤儿页**：`/stocks`(列表)、`/indicators`、`/watchlist` 无 nav 入口
6. **legacy 收敛不彻底**：`/market-regime` 只有客户端 replace 未进 next.config（首屏闪烁+爬虫拿不到307），ROUTES.MARKET 仍指它；`/fusion/paper` 死代码+拦截并存
7. **桌面↔移动导航未同源**：`/screener`/`/ai-theme`/`/sectors` 仅移动端有入口，两套 IA 不一致
8. **API 职责重叠**：单股 6 子接口(被 intelligence 取代)、组合聚合 5+接口、市场快照 4 接口、GPT 分 3 出口、sync 新旧双通道

---

## 7. 《系统整理方案》（P0/P1/P2 — 仅建议，不改代码）

### P0 — 立即（消除误导与脏数据风险，低风险高收益）

- **P0-1 修正文档漂移**：删/重写 CLAUDE.md 的 Cron 段（不存在的 LINE 推送 cron）、LINE 整节；同步 cron-scheduler.ts 头部 docstring 到 37 个真实 cron。防止运维照错文档操作
- **P0-2 澄清 Integrity=100 语义**：在 feature-platform 页/文档标注「= 8 个 mappable 因子链路完整，非 83 因子全有数据」，避免对外误读
- **P0-3 补 4 个 JPX 守卫**：compute-alpha-factors/compute-alpha-score/fusion-paper-trade/compute-score-v3-shadow（休市日不写当日脏行）
- **P0-4 拆同分钟并发**：22:00→错开 sync-news/sync-stock-meta；周五 16:45/17:00 把 v3-final-review/top-picks-weekly 移出策略串行链

### P1 — 近期（清理死代码/死接口，收敛 env）

- **P1-1 删两个死组件**：`app/HomeDashboardClient.tsx`、`app/SystemDashboard.tsx`；摘 DashboardView 默认导出/PipelineCompact/QuickActions
- **P1-2 清退废弃表**：`Portfolio` + legacy `/api/portfolio`；`Sim*` 三表 + `/api/sim-portfolio/*` 三路由（先生产核对无隐藏写入）
- **P1-3 下线 30 个疑似废弃 API**：优先单股 6 子接口（intelligence 已取代）、组合聚合 5 个、市场 3 个、sync 旧编排器+yahoo；含写操作的（analysis/sim/realtime/sync）删前确认无外部触发
- **P1-4 收敛死 env**：删 WECOM_*/STRICT_REAL_DATA/DEEPSEEK_API_KEY/OPENAI_BASE_URL；统一 AI_MODEL→OPENAI_MODEL（lib/ai.ts 不一致）
- **P1-5 legacy 路由收口**：`/market-regime` 进 next.config 307；`/fusion/paper` 二选一（删页面或撤 redirect）

### P2 — 规划（架构收敛，需产品决策）

- **P2-1 驾驶舱收敛**：6 个总览页 → decision-center 为主，closing-decision/ai-top-picks/feature-platform 收为 tab/子模块
- **P2-2 因子三件套合一**：features+promotion+platform → 单页多 tab
- **P2-3 回测/影子分去重**：明确 BacktestPositionResult 为回测唯一真源，清 DailyRecommendation 废弃回测列（先切 verify 读）；评估 StrategyBacktestResult(v15) 是否仍需与 Summary 并存；4 套影子分统一治理
- **P2-4 Scoring V3 去留决策**：整套已开发未启用——要么走 freeze→上线（SCORING_ENGINE=v3），要么正式归档；不宜长期养着不接
- **P2-5 孤儿页/导航同源**：决定 `/watchlist`(修 i18n 或废)、`/indicators`、`/stocks` 去留；统一桌面↔移动 IA
- **P2-6 P2-020 TOPIX 断裂**：长期换 TOPIX 现货源（已 fallback 等权宇宙，非阻断）

### 明确不动（资金链路/冻结区，禁顺手改）

- 生产评分链 compute-scores/rerank、DailyRecommendation、三策略引擎、Paper Broker、P5 Runtime Freeze 模块、P6 Freeze/AI Top Picks V1.1 冻结算法。整理只碰死代码/文档/env/守卫/展示层收敛，**不触碰评分与资金逻辑**。
