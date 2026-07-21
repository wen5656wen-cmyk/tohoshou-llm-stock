# P19 · Information Architecture Review Report

> 日期：2026-07-21 · 范围：Decision 工作区 7 个一级页面 · **只读审计**（除阻断级问题外不改代码）
> 取证方式：源码静态扫描 + 生产实测（Playwright 逐链路 HTTP 状态 + API 实调）

---

## 1. 页面职责矩阵

| 页面 | 唯一问题 | 时间维度 | 数据性质 | 允许的能力 |
|---|---|---|---|---|
| **决策总览** Overview | 今天我该怎么操作 | 当下 | 真实账户 | 持仓 CRUD / 买卖 / 候选行动 / 风险·市场·系统 |
| **股票中心** Stock Center | 买哪只 | 上一交易日收盘快照 | 全市场 | 选股 / 筛选 / 自选 / 逐股报告 |
| **行业分析** Sector | 买哪个行业 | 上一交易日 | 行业聚合 | 行业排行 → 跳股票中心 |
| **深度研究** Deep Research | 为什么买（产业逻辑） | 结构性 | 研究版本 | 产业链 / 知识图谱 / 研究库 |
| **今日简报** Daily Briefing | 今天系统跑到哪、接下来做什么、关注什么 | **未来 8 小时** | 运行状态 | 时间轴 / 状态 / 事件 / 待办 / 关注方向 |
| **AI Mission Lab** | AI 自己做给你看，可跟单 | 当下 + 本期 | 前向实验 | 当期持仓 / 待跟单 / NAV / 日志 |
| **AI 战绩档案** Track Record | AI 到底准不准 | **全部过去** | 三条业绩线 | 业绩统计 / 切片 / 明细 |

### 职责重叠检查（源码取证）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 底部四栏深度统计是否仍在 Overview | ✅ 已移除 | `grep riskReward\|avgWin\|avgLoss\|cReturns\|perfRows` → **0 命中** |
| 业绩指标渲染分布 | ✅ 收敛 | Track Record 命中 9 个业绩关键词；Overview 仅 2 个（摘要）；Briefing **0**；Mission Lab 仅 `alpha`（当期 NAV，非历史统计） |
| Mission Lab 的 alpha 是否重复统计 | ✅ 否 | 直取 `AiMissionNav.alpha`（当期），Track Record 展示的是**跨期归档**，口径不同且互不覆盖 |
| Briefing 是否新增统计体系 | ✅ 否 | 全部为「存在性判定 + 比价 + 计数」，无均值/胜率类聚合 |
| ⚠️ Overview 是否仍有前端自算业绩 | **⚠️ 残留 1 处** | `DecisionOverviewV2.tsx:124` 账户超额 `mean(returnPct − benchTopixPct)`（属顶部账户总览，非底部四栏；与 Track Record 的 `beatTopixRate` 不同名不同口径，**未构成重复展示**） |

**结论：无重复统计体系、无重复计算入口。** 1 处前端自算指标属账户总览摘要，列入后续建议。

---

## 2. 数据来源矩阵

| 页面 | 主要数据源（表） | 是否只读 | 是否新建计算 |
|---|---|---|---|
| Overview | `user_holdings` / `user_trades` / `user_accounts` / StockScore / ClosingDecision / MarketRegime | 写（持仓 CRUD，设计内） | 否（除 §1 残留 1 处） |
| 股票中心 | StockScore / WatchList / user_holdings | 写（自选） | 否 |
| 今日简报 | StockScore · AiMission* · ClosingDecision · MarketRegime · GlobalMarket · TradeDecisionHistory · PortfolioNavSnapshot · Disclosure · ResearchCalendarEvent · Dividend · UserHolding | **全只读** | 否 |
| Mission Lab | `ai_mission_*` + Yahoo 实时 | **全只读** | 展示投影（不落库） |
| 战绩档案 | DailyRecommendation × BacktestPositionResult · AiMission* · UserTrade | **全只读** | 仅分组统计 |

**收益 / Alpha / 持有天数一律直取落库字段**，三页均无第二套收益计算。

---

## 3. API 对照矩阵

| 页面 | 调用的 API | 写操作 |
|---|---|---|
| Overview | `useDecision` → `/api/admin/{closing-decision, decision-center, decision-overview}` + `/api/ai-theme`；`useHoldings` → `/api/holdings`、`/api/holdings/history`；`/api/decision/insights` | 持仓 CRUD |
| 股票中心 | `/api/decision/recommendations` · `/api/screener` · `/api/watchlist` · `/api/holdings` · `/api/admin/decision-overview` | 自选 |
| 今日简报 | **`/api/decision/briefing`** · `/api/health/status` | 无 |
| Mission Lab | `/api/mission-lab` · `/api/mission-lab/quotes` | 无 |
| 战绩档案 | **`/api/decision/track-record`** | 无 |

- 三个新页各自**单一聚合端点**，无交叉调用、无 N+1。
- ⚠️ 观察项：Overview 通过 provider 一次拉 4 个端点 + 独立 2 个 = **6 个请求**，为全站最重页面（既有结构，非本次引入）。

---

## 4. 跳转关系图（生产实测 10/10 HTTP 200，零死链）

```
                        ┌──────────────────────┐
      ┌─────────────────│   决策总览 Overview   │◄────────────┐
      │                 └──────────┬───────────┘             │
      │ 查看完整战绩 →              │                          │ 账户线/TP·SL/风险
      ▼                            │                          │
┌─────────────────┐                │                    ┌─────┴──────────┐
│  AI 战绩档案     │────查看该期 ──►│                    │  今日简报       │
│  Track Record   │                │                    │ Daily Briefing │
└────────┬────────┘                ▼                    └──┬────┬────┬───┘
         │ 明细行          ┌────────────────┐               │    │    │
         ▼                 │ AI Mission Lab │◄──────────────┘    │    │
   StockDetailModal        │  ?mission=…    │  Mission 待执行     │    │
   （复用，不新建）          └────────────────┘                    │    │
                                                    系统全部任务 ──┘    │
                                                    ▼                  ▼
                                          /admin/mission-control   深度研究日历
```

| 出口 | 目标 | 实测 |
|---|---|---|
| Overview →「查看完整战绩」 | `?tab=history` | ✅ 200 |
| 战绩档案 →「查看该期」 | `?tab=portfolio&mission=2026-W29` | ✅ 200 + Mission Lab 自动切到对应期 |
| 战绩档案 → 决策总览 | `?tab=overview` | ✅ 200 |
| 简报 → Overview / Mission Lab / 股票中心 | 三处 | ✅ 200 |
| 简报 →「系统全部任务」 | `/admin/mission-control` | ✅ 200 |
| 简报 → 研究日历 | `/deep-research/calendar` | ✅ 200 |
| 导航 7 项 | 全部 | ✅ 200 |

**循环检查**：`Overview ⇄ 战绩档案`、`Overview ⇄ 简报` 均为**双向导航**（用户主动点击），非自动跳转循环，无死循环风险。
**重复入口检查**：指向决策总览的入口有 3 个（简报的市场卡 / TP·SL / 风险提醒），但均**上下文相关**（点风险看风险面板、点 TP·SL 看持仓），不构成重复入口。

### ⚠️ 链路缺口（非死链）
1. **Overview 无「今日简报」入口** —— 只能经左侧导航到达。用户描述的链路 `Overview → 今日简报` 目前不存在直达。
2. **Mission Lab 零出口** —— 是叶子节点，无法从中跳回战绩档案或决策总览。

---

## 5. 时间口径矩阵

| 语义 | 含义 | 出现位置 | 当前措辞（zh / ja） |
|---|---|---|---|
| **Previous Close** | 上一交易日收盘 | 股票中心 | 收盘快照 · 截至 / 引け値スナップショット · 基準日 |
| **Closing Decision** | 上一交易日 15:15 收盘决策 | ContextBar · 简报 · 战绩档案 | 上一交易日收盘决策 / 前営業日の引け判断 |
| **Real-time** | Yahoo 实时报价（源延迟 ~15 分） | Mission Lab | 最后更新 … JST（源延迟 N 分钟）/ 最終更新 |
| **Current** | 当前 JST 时刻 / 时段 | 简报顶部 | 交易日 · 下午盘 / 取引日 · 後場 |
| **As Of（数据）** | 各数据块基准时间 | 战绩档案 · 简报 · Mission Lab | **7 套措辞，见下** |
| **Mission** | 当期 NAV 基准日 | 简报 · Mission Lab · 战绩档案 | as of 2026-07-21 |

### ⚠️ 一致性问题（本次审计的核心发现）

全站 As Of 措辞共 **7 套**，且 **3 个键中英混排 + 1 处硬编码英文**：

| 键 | zh 实际值 | 问题 |
|---|---|---|
| `tr.asOf` | 数据截至 | 纯中文 ✅ |
| `dc.ov.snapshotAsOf` | 收盘快照 · 截至 | 纯中文 ✅ |
| `dc.ov.lastClose` | 上一交易日收盘决策 | 纯中文 ✅ |
| `ml.rt.updated` | 最后更新 | 纯中文 ✅ |
| `br.asOf.close` | **收盘 as of** | ❌ 中英混排 |
| `br.asOf.today` | **as of** | ❌ 中文界面显示纯英文 |
| `br.asOf.audit` | **审计 as of** | ❌ 中英混排 |
| `DecisionStrategyV2.tsx:339` | **`as of {asOf}`（硬编码）** | ❌ 未走 i18n |

**判定：阻断级。** 违反 `docs/DESIGN_FIRST_GOVERNANCE.md` 明文规定「语言切换整页 100% 同语言」。
**责任说明**：该问题由 P19-T2 引入，且我在 T2 验收中报告「i18n ✅」—— 当时的自动检查只验证了「日文页无中文残留」，**未检查「中文页出现英文」**，属验证不完整导致的误报。

---

## 6. 重复功能检查汇总

| 检查项 | 结论 |
|---|---|
| 重复统计体系 | ✅ 无。业绩统计已全部收敛至战绩档案 |
| 重复计算 | ✅ 无第二套收益/Alpha 计算；⚠️ 1 处账户超额前端自算（Overview:124，口径独立） |
| 重复入口 | ✅ 无。多入口均上下文相关 |
| 重复展示 | ✅ 无。四页展示字段无交集（Overview=当下操作 / 简报=运行状态 / 战绩=历史统计 / Mission=当期实验） |
| 死链 | ✅ 无（10/10 实测 200） |
| 循环跳转 | ✅ 无自动循环 |
| 与 Mission Control 职责分离 | ✅ 简报=老板视图 6 节点决策链路；Mission Control=运维视图 13 步全量任务，仅入口相连 |

---

## 7. 后续建议（仅建议，不在本轮开发）

| 优先级 | 建议 | 理由 |
|---|---|---|
| **P1** | 统一 As Of 措辞为单一 i18n 组（如 `common.asOf.*`），全站复用 | 目前 7 套措辞分散在 4 个键空间，未来新增页面会继续发散 |
| **P1** | 修复 `mission-control` 的 `todayPipeline` 状态源 | 实测 `compute_scores` 显示 2026-07-04 而真实 07-21；`todayPipeline` 与 `dataFreshness` 同 API 内自相矛盾（既有技术债 P2-003/P1-002） |
| P2 | Overview 增加「今日简报」入口 | 补齐 `Overview → 简报` 链路缺口 |
| P2 | Mission Lab 增加返回出口（→ 战绩档案 / 决策总览） | 目前是叶子节点，无法横向跳转 |
| P2 | `DecisionOverviewV2:124` 账户超额改由 API 提供 | 消除最后 1 处前端自算业绩指标 |
| P3 | Overview 6 个请求合并 | 全站最重页面（既有结构） |
| P3 | **P19-X**：接 J-Quants `/fins/announcement` + 补 `Dividend.exDivDate` | 简报「今日事件」的财报/除权息才能从「未接入」转为可用 |
| P3 | Weekly Mission 周滚动（W29 → W30）验证 | W29 于 2026-07-26 结束，届时战绩档案「实验线」才会有首条归档数据 |

---

## 8. 审计结论

**Decision 工作区 7 页职责边界清晰，无重复统计、无重复计算、无重复入口、无死链、无循环跳转。**
唯一阻断级问题为 P19-T2 引入的 i18n 中英混排（4 处），已按「阻断级可修」原则修复并记录于 CHANGELOG。
其余 8 项为后续建议，不在本轮开发范围。
