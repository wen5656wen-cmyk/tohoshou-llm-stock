# P19 · IA 定版：今日简报 / AI 战绩档案

> 状态：**IA Freeze 待批准**（Design First 第 1 级，尚未进入 Hi-Fi Design / 实现）
> 日期：2026-07-21 · 依据：`docs/Module-Responsibility.md`（单一职责·职责不重叠）+ `docs/DESIGN_FIRST_GOVERNANCE.md`
> 适用页面：`/decision-v2?tab=strategy`（今日策略）· `/decision-v2?tab=history`（历史决策）

---

## 0. 背景：为什么要重做这两页

其余五个模块已定版且职责清晰（决策总览=怎么操作 / 股票中心=买哪只 / 行业分析=买哪个行业 /
深度研究=为什么买 / Mission Lab=AI 自己做给你看）。这两页是唯二没有重新规划的，现状实测：

**今日策略**（2026-07-21 生产实拍）
| 区块 | 实际 |
|---|---|
| 交易时间轴（页面最大块） | 8 个节点**全部「计划待生成」**——无盘中执行引擎，纯空壳 |
| 顶部执行条 / 收盘计划 / AI 备注 | **同一句 verdict 重复 3 次**（+ 决策总览 DecisionBar = 第 4 次） |
| 风险检查 7 项 | 2 项无数据；其余与决策总览 `RiskPanel` 重复 |
| 行业重点 | 仅 1 行，且弱于「行业分析」模块 |
| 今日战术 5 分类 | 唯一独有价值 |
| 时间口径 | 标题「今日」，实为**上一交易日**收盘决策（页面 07-17 / 当天 07-21） |

→ 约 60% 空壳 + 30% 重复 + 10% 独有。

**历史决策**（`GET /api/decision/history` 实测）
- 数据是真的：40 条决策记录、7 日前瞻收益、命中/未命中、最大盈亏（+20.9% `505A.T` / −20.6% `9256.T`）
- ❌ 误导：首屏「累计推荐 **12274**」与脚注「基于 **2 个决策日**」并排；实际**已结算仅 20 笔**
- ❌ 串口径：「累计收益 +2.7%」来自 `StrategySnapshot`（三策略纸面组合），与 TOP10 前瞻收益不是一套账
- 6 类策略分析只有 2 类有数据；`aiLearning.available = false`

---

## 1. 职责地图（定版后七模块）

| 模块 | 唯一问题 | 时间维度 |
|---|---|---|
| 决策总览 | 今天我该怎么操作（真实账户） | 当下 |
| 股票中心 | 买哪只 | 当下 |
| 行业分析 | 买哪个行业 | 当下 |
| 深度研究 | 为什么买（产业逻辑） | 结构 |
| AI Mission Lab | AI 自己做给你看，可跟单 | 当下 + 本期 |
| **今日简报**（原今日策略） | **今天这一天按什么节奏做什么、有什么事** | **未来 8 小时** |
| **AI 战绩档案**（原历史决策） | **AI 到底准不准，凭什么信它** | **全部过去** |

---

## 2. 今日简报 Daily Briefing（原「今日策略」）

**唯一问题**：今天这一天，我按什么节奏做什么？有什么事要注意？
**使用场景**：开盘前 5 分钟 / 收盘后 3 分钟，一页看完。

### 模块清单（4 块，全部有真实数据源）

**① 今日状态条**
- 交易日 / 休市（`lib/trading-calendar/jpx.ts`）+ 当前时段（盘前/上午/午休/下午/收盘，复用 M1.1 session 判定）
- 全局 verdict 摘要 —— **必须标注「基于上一交易日 15:15 收盘决策」**，修掉现在「今日」名不副实的问题
- 综合风险等级（只显示等级，不重算七项）→ 点击跳决策总览

**② 今日执行时间轴（真实状态，取代空壳）** ★ 本页核心、全站唯一
| 节点 | 状态源（只读） |
|---|---|
| 08:20 Mission 生成决策 | `AiMission.lastPrepareDate` + 当日 `AiMissionDecision` 计数 |
| 09:30 Mission 成交 | `AiMission.lastExecuteDate` + 当日 `AiMissionTrade` 计数 / `SKIPPED` 数 |
| 09:00–15:30 行情刷新 | M1.1 session（`marketOpen` / `marketPriceAt`） |
| 15:15 收盘决策生成 | 当日 `ClosingDecision` 是否存在 |
| 15:15 持仓每日复盘 | 当日 `TradeDecisionHistory (source=DAILY_REVIEW)` |
| 15:15 NAV 快照 | 当日 `PortfolioNavSnapshot` + `AiMissionNav` |

每节点三态：`✓已执行（带真实计数）` / `○待执行` / `⚠跳过（原因）`。
决策工作区目前**没有任何页面**回答「今天系统跑到哪一步了」（`/admin/mission-control` 属管理区）。

**③ 今日事件（诚实版）**
| 来源 | 状态 |
|---|---|
| TDnet 披露（`Disclosure`，近 24h，与持仓/候选交叉，按 `importance` 排序） | ✅ 可用（近 7 天 1220 条） |
| 深度研究日历（`ResearchCalendarEvent`，`SCHEDULED`） | ⚠️ 可用但薄（全表 3 条），常态显空 |
| **财报发表预定** | ❌ **无数据源** —— `lib/jquants.ts` 未接 `/fins/announcement` |
| **除权除息日** | ❌ **无数据源** —— `Dividend.exDivDate` 全表 0 条 |

→ 后两项在 V1 **显式标注「未接入」**，绝不伪造。补齐见 §5 P19-X。

**④ 今日待办**
- Mission 今日待跟单**摘要**（笔数 + 首笔）→ 跳 Mission Lab（不重复画卡片）
- 持仓触及止盈/止损线提醒（`/api/holdings` 已有 `takeProfitPrice`/`stopLossPrice`，前端比价，不重算策略）

### 禁止重复（对照 `project_decision_center_final` 定版清单）
不放持仓表 / 候选表 / 行业排行 / 逐股研究报告 / 风险七项明细 / AI 推荐列表。凡涉及一律**摘要 + 跳转**。

---

## 3. AI 战绩档案 Track Record（原「历史决策」）

**唯一问题**：AI 到底准不准？凭什么信它？
**定位**：全站**唯一**的业绩验证入口。现在业绩统计散在三处，本页收敛。

### 三条业绩线（并列展示，口径分明，绝不混算）

| 线 | 数据源 | 现状 |
|---|---|---|
| **① 信号线** AI 每日 TOP10 推荐 | `DailyRecommendation(gptRank≤10)` × `BacktestPositionResult(7d)` | 已有；已结算 20 笔 / 2 决策日 |
| **② 实验线** Mission Lab 周/月任务 | `AiMission` / `AiMissionNav` / `AiMissionTrade` | **完全没有视图**——任务结束即无处可看 ★缺口最大 |
| **③ 账户线** 我的真实账户平仓 | `user_trades` / `user_holdings` | 现挤在决策总览底部 `AiPerformance` |

- 决策总览底部四栏 → 改为**摘要卡 + 跳转本页**，不再各算各的。
- 三条线**必须分区标注口径**（纸面信号 / 前向实验 / 真实账户），不得合并为单一「胜率」。

### 切片分析（基于信号线）
按 AI 分档（60–70 / 70–80 / 80+）· 按风格（`feat_stockStyle`）· 按行业 · 按持有期 → 回答「AI 在**什么情况下**准」。

### 诚实性规则（V1 必须落实）
1. 首屏主数字改为 **「已结算 N 笔 / M 个决策日」**；`totalRecommendations 12274` 降级为脚注（标「含未结算」）。
2. 任一统计**样本 < 20 笔**：标「样本不足，仅供观察」，不给结论。
3. `StrategySnapshot` 的「累计收益」与 TOP10 前瞻收益**不同口径** → 分区标注或移除，禁止并排。
4. AI Learning 无真实产物 → 维持现有硬降级，绝不伪造总结。

---

## 4. 技术边界（两页共同）

- 各新增 **1 个只读聚合 API**：`GET /api/decision/briefing`、`GET /api/decision/track-record`
- **零写入**；不改评分 / Decision Engine / Mission Engine / Strategy / Trade / Position / Cash / NAV 计算 / Cron
- **无 Schema 变更**（P19-X 除外）
- 名称 locale 一律 `lib/company-name.ts getPrimaryName`；格式化一律 `lib/decision/ds`
- i18n 双语 zh-CN / ja-JP，无混排

## 5. 需单独立项（不混入本次）

**P19-X 财报/除权日历数据源**：接 J-Quants `/fins/announcement`（翌日決算発表予定）+ 补 `Dividend.exDivDate`
→ 涉及新增抓取脚本 + cron 节点（可能 + 小表），属数据层工作，须单独评估后再做。

## 6. 验收标准（IA 级）

- [ ] 每页只回答 §1 中它的那一个问题
- [ ] 任一信息在七个模块中**只出现一次**（其余为摘要 + 跳转）
- [ ] 页面上**不存在**「计划待生成」类空壳区块
- [ ] 所有无数据源项显式标「未接入」，不伪造
- [ ] 样本不足的统计显式标注，不给结论
