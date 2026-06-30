# T2 Development Roadmap

**文档版本：** v1.0.0  
**创建日期：** 2026-06-30  
**状态：** ACTIVE — T1 封版，T2 正式开始  
**前置文档：**
- `docs/Trading-Architecture.md`（V1 FROZEN）
- `docs/Module-Responsibility.md`（FROZEN）
- `docs/AI-Strategy-Optimization.md`（Phase 7 设计基准）

---

## 一、T2 定位

### T1 完成了什么

T1（Trading Architecture V1）建立了完整的基础设施：

- 三策略引擎（DAY / SWING / LONG）
- Strategy Recommendation Engine
- Strategy Backtest Engine
- Strategy Learning Engine
- Strategy Center UI（Strategy Center V1.0）
- Daily Validation（每日9项自动验证）
- Phase 7 Roadmap

**T1 现已正式封版（FROZEN）。**

### T2 要做什么

T2 不再建设基础架构。T2 的唯一任务是：

> **利用 T1 建立的系统所积累的真实运行数据，持续优化 AI 策略，提升 Alpha、降低风险、提高资金效率。**

T2 是一个长期的、由数据驱动的持续优化阶段。没有终点，只有不断的改进循环。

### T2 和 T1 的本质区别

| | T1 | T2 |
|--|--|--|
| 核心任务 | 建设基础架构 | 优化策略效果 |
| 主要产出 | 数据库表、脚本、API、UI | 参数调优、模型升级、风控规则 |
| 开发节奏 | 功能型冲刺 | 实验→验证→上线的迭代循环 |
| 数据依赖 | 无需历史成交数据 | 强依赖真实成交数据 |
| 架构变更 | 允许（在定义的范围内） | 禁止 |
| Schema 变更 | 允许 | 禁止 |

---

## 二、核心约束（永久有效）

进入 T2 后，以下约束永久有效，任何 T2 功能都不得违反：

| 约束 | 说明 |
|------|------|
| Trading Architecture FROZEN | `docs/Trading-Architecture.md` 的整体架构不变 |
| Module Responsibility FROZEN | `docs/Module-Responsibility.md` 的模块职责不变 |
| 数据库 Schema FROZEN | 禁止新增 / 删除 / 修改任何表或字段 |
| 三策略核心流程 FROZEN | `day-strategy.ts` / `swing-strategy.ts` / `long-strategy.ts` 主流程不变 |
| DailyRecommendation 禁用 | 策略层禁止读取该表（已由 StrategyRecommendation 替代） |

---

## 三、T2 五阶段规划

```
T2 Timeline（估算，以实际数据积累速度为准）

Phase 7  AI Strategy Optimization     ←── 当前等待启动
   │
   ▼
Phase 8  Risk Management              ←── Phase 7 完成后
   │
   ▼
Phase 9  Portfolio Optimization       ←── Phase 8 完成后
   │
   ▼
Phase 10 Execution Optimization       ←── Phase 9 完成后
   │
   ▼
Phase 11 Production Intelligence      ←── 长期持续运行
```

---

## 四、Phase 7 — AI Strategy Optimization

**详细设计见：** `docs/AI-Strategy-Optimization.md`

### 摘要

Phase 7 利用真实成交数据优化三策略的参数和 AI 模型，不修改架构。

**启动条件（7项全部满足）：**

| 条件 | 目标 |
|------|------|
| DAY 成交 | ≥ 100 笔 |
| SWING 平仓 | ≥ 30 笔 |
| LONG 平仓 | ≥ 20 笔 |
| DAY Learning Grade | ≥ B |
| SWING Learning Grade | ≥ C |
| LONG Learning Grade | ≥ C |
| 连续 Health CRITICAL=0 | 30 个交易日 |

**子阶段：**

| 子阶段 | 内容 | 版本预估 |
|--------|------|---------|
| Phase 7.1 | 参数优化（Top5/量过滤/止损阈值） | v18.x |
| Phase 7.2 | Feature 优化（Learning 维度权重） | v18.x |
| Phase 7.3 | AI 模型升级（XGBoost/LightGBM 部分替换） | v19.x |
| Phase 7.4 | 风险模型（Kelly/VaR/熔断） | v19.x |
| Phase 7.5 | 自动参数学习（Bayesian / 在线学习） | v20.x |

---

## 五、Phase 8 — Risk Management

**依赖：** Phase 7.1 完成（有基本参数基线）

### 目标

建立独立的风险管理层，使系统能够在市场极端情况下自动保护资本。

### 研究和开发方向

**8.1 行业暴露管理**

- 问题：当前三策略可能在同一行业重度持仓，形成隐性集中度风险
- 目标：建立行业暴露监控，单行业持仓不超过总资金 30%
- 实现：每日计算各策略持仓的行业分布，超限时减仓最弱持仓

**8.2 仓位限制**

- 问题：单股持仓可能过重
- 目标：单股持仓上限 = 总资金的 N%（N 按策略类型分别定义）
- DAY: 10% / SWING: 15% / LONG: 20%

**8.3 VaR 风险评估**

- 目标：每日计算投资组合的 1 日 95% VaR（历史模拟法）
- 用途：当 VaR > 日资金 3% 时，触发风险警报
- 数据：`DailyPrice` 历史收益率 + 当前持仓权重

**8.4 Kelly 准则（部分实现）**

- 问题：等权分配没有利用胜率和赔率信息
- 目标：计算每个信号的 Kelly 仓位，上限为等权的 2 倍
- 公式：`f = (p × b - q) / b`，p=历史胜率，b=历史赔率
- 数据来源：`StrategyBacktestSummary` 的 winRate / avgReturnPct

**8.5 资金利用率**

- 问题：SWING/LONG 策略可能有大量资金闲置
- 目标：当资金利用率 < 40% 时，适当放宽入场条件（保持信号质量）
- 监控：`StrategyCapitalLog.investedAfter / totalAfter`

**8.6 风险预算**

- 目标：为三策略分配不同的风险预算
  - DAY: 最大日亏损 1%
  - SWING: 最大周亏损 3%
  - LONG: 最大月亏损 5%
- 实现：日终检查，超过风险预算则下一交易日降仓 50%

### 评估指标

- Max Drawdown ↓
- Sortino Ratio ↑
- VaR 实现精度（Backtest VaR vs 实际亏损）

---

## 六、Phase 9 — Portfolio Optimization

**依赖：** Phase 8 完成（有稳定的风险控制基线）

### 目标

将三策略从独立运行升级为协同优化的投资组合，最大化整体资本效率。

### 研究和开发方向

**9.1 Portfolio Optimizer**

- 当前：三策略各自独立管理资金（3:4:3 初始分配）
- 目标：建立跨策略的 Portfolio Optimizer，动态调整三策略的资金分配比例
- 算法候选：
  - 均值-方差优化（Markowitz）
  - 风险平价（Risk Parity）
  - 最大 Sharpe 组合

**9.2 动态权重调整**

- 问题：三策略的固定 3:4:3 比例不随市场环境变化
- 目标：根据近 30 日各策略 Sharpe，动态调整资金分配
- 规则：Sharpe 最高的策略获得更多资金，最低的减少
- 约束：任一策略资金比例 ≥ 10%（不完全退出）

**9.3 行业轮动**

- 目标：在投资组合层面引入行业动量信号
- 实现：每周计算各行业近 20 日超额收益，增加强势行业暴露
- 数据来源：`DailyPrice` 行业聚合 + `InstitutionalFlow` 机构资金

**9.4 资金分配效率**

- 问题：不同市场环境下（牛/熊/震荡），三策略的表现差异很大
- 目标：识别市场状态（regime），动态切换策略权重
- 市场状态分类：趋势市（DAY/SWING 增权）/ 震荡市（LONG 增权）/ 极端市（全部减仓）

### 评估指标

- Portfolio Sharpe ↑（高于单策略）
- Capital Efficiency（投资资金 / 总资金）↑
- 相关性（三策略间）↓

---

## 七、Phase 10 — Execution Optimization

**依赖：** Phase 9 完成（有稳定的组合层）

### 目标

优化交易执行层，减少摩擦成本，改善成交质量。

### 研究和开发方向

**10.1 成交优化**

- 当前：使用固定价格信号（AI 评分日收盘价）作为参考价
- 问题：实际成交价与参考价存在差异（T+1 开盘价）
- 研究方向：基于历史开盘价与前日收盘价的偏差分布，建立成交价预估模型

**10.2 滑点模型**

- 目标：建立滑点估算模型，在回测中引入更真实的成本
- 参数：股票流动性（成交量）、买卖价差、市场影响
- 意义：使 Backtest 结果更接近真实表现

**10.3 流动性过滤**

- 当前：成交量过滤只有简单阈值
- 目标：建立多层流动性评分：日均成交额 / 波动率 / 价差
- 用途：拒绝执行流动性过低的信号（即使 AI 分高）

**10.4 交易成本核算**

- 目标：精确追踪每笔交易的实际成本（佣金 + 税 + 滑点）
- 意义：使 `StrategyTradeResult.returnAmount` 反映净收益，不是毛收益
- 日本证券交易成本参考：SBI 佣金 + 0.315% 印花税

### 评估指标

- 滑点成本 / 笔（降低）
- 净 Alpha（扣除所有成本后）
- 成交率（信号被成功执行的比例）

---

## 八、Phase 11 — Production Intelligence

**依赖：** Phase 10 完成（有完整的执行数据）；本阶段长期持续运行

### 目标

建立自动化的智能报告和异常分析系统，使系统能够自主发现问题、解释行为、比较策略。

### 研究和开发方向

**11.1 自动日报**

- 触发：每日 17:30 JST（Daily Validation 后）
- 内容：
  - 当日三策略成交摘要（成交数 / 胜率 / Alpha）
  - 当日 Validation 状态（PASS/FAIL）
  - 主要异常事件（如有）
  - Phase 7 启动条件进度
- 输出：Management 中的日报 API + 可选 LINE 推送

**11.2 自动周报**

- 触发：每周五 17:45 JST
- 内容：
  - 本周三策略绩效对比
  - Learning Grade 变化趋势
  - Backtest 主要 Horizon 数据
  - 下周观察重点
- 输出：Strategy Center 周报 Tab（新增）

**11.3 自动月报**

- 触发：每月最后一个交易日 18:00 JST
- 内容：
  - 月度累计 Alpha / Sharpe / MaxDrawdown
  - 与上月对比
  - Phase 7 启动条件完成进度
  - 下月优化重点
- 输出：Strategy Center 月报下载（PDF / JSON）

**11.4 异常分析**

- 触发：Incident Report 生成时
- 功能：自动分析 Incident 原因类型
  - 数据源异常（J-Quants / Yahoo Finance 数据缺失）
  - 脚本运行失败（cron 超时 / 网络问题）
  - 策略异常（信号为0 / 持仓数量异常）
- 输出：Incident Detail API（供 Strategy Center 稳定化 Tab 显示）

**11.5 AI 解释**

- 目标：对每日 Top10 推荐生成可读的中文解释
- 输入：StrategyRecommendation + StockScore + 新闻摘要
- 实现：GPT 生成解释文本（严格 Prompt 约束，禁止幻觉数字）
- 输出：Strategy Center 推荐列表增加「AI解读」列

**11.6 策略比较**

- 目标：在 Strategy Center 中增加三策略横向比较视图
- 内容：
  - 同期 Alpha 对比图（折线）
  - Sharpe / MaxDrawdown / WinRate 对比表
  - 最佳策略推荐（基于综合评分）

### 评估指标

- 报告生成准时率（> 99%）
- 异常识别准确率
- 用户满意度（内部）

---

## 九、版本规划

| 版本范围 | 对应阶段 | 预计时间 |
|---------|---------|---------|
| v17.x | T1 完成 / T1 封版 | 2026-06-30 ✅ 完成 |
| **v18.0–v18.x** | **Phase 7.1 — 参数优化** | T1 条件满足后启动 |
| v18.x–v18.xx | Phase 7.2 — Feature 优化 | Phase 7.1 完成后 |
| **v19.0–v19.x** | **Phase 7.3 — AI 模型升级** | v18.xx 完成后 |
| v19.x–v19.xx | Phase 7.4 / Phase 8 | Phase 7.3 验证后 |
| **v20.0–v20.x** | **Phase 7.5 / Phase 9** | 长期 |
| v20.x+ | Phase 10 / Phase 11 | 长期持续 |

**版本命名规则：**

- `v18.0.0` = Phase 7.1 正式启动（第一个参数优化上线）
- `v18.x.y` = Phase 7.1 / 7.2 内的增量优化
- `v19.0.0` = Phase 7.3 正式启动（AI 模型第一次升级）
- `v20.0.0` = Phase 9 正式启动（Portfolio Optimizer 上线）

---

## 十、开发纪律

**T2 的所有功能开发必须遵循以下流程，不得跳过任何步骤：**

```
Step 1 — Roadmap
  在 T2-Roadmap.md 或 AI-Strategy-Optimization.md 中确认该功能在规划内
  （如不在规划内，先提议并 Review）
  │
  ▼
Step 2 — 设计文档
  为该功能编写设计文档（可以是 Roadmap 文档的子节，也可以是独立文档）
  明确：假设 / 评估指标 / 实现方案 / 回滚方案
  │
  ▼
Step 3 — Review
  开发者自审或团队审查设计文档
  确认：不违反 T2 核心约束 / 评估指标可度量 / 实现方案合理
  │
  ▼
Step 4 — Coding
  编写代码，遵循 Module Responsibility 边界
  每次只做一项优化（禁止多项同时进行）
  │
  ▼
Step 5 — Backtest Validation
  在历史数据上验证效果
  必须在 Alpha + Sharpe 两个核心指标上均有改善
  │
  ▼
Step 6 — Production
  上线，观察 30 天真实数据变化
  在 StrategyBacktestSummary + StrategyLearningReport 中追踪效果
  │
  ▼
Step 7 — 结论记录
  将结论（有效 / 无效 / 部分有效）记录到 CHANGELOG.md 和相关设计文档
  如无效则回滚并记录原因
```

**禁止的开发行为：**

| 禁止 | 原因 |
|------|------|
| 跳过设计文档直接编码 | 无法事后验证效果 |
| 同时进行多项优化 | 无法定位效果来源 |
| 不做 Backtest 直接上线 | 无法预判风险 |
| 上线后不追踪效果 | 优化可能损害系统 |
| 修改 Schema 以支持新功能 | 违反 T2 核心约束 |
| 绕过 Roadmap 文档添加功能 | 破坏整体规划一致性 |

---

## 十一、T1 封版确认

| 项目 | 状态 |
|------|------|
| Trading Architecture V1 | ✅ **FROZEN** |
| 三策略引擎（DAY/SWING/LONG） | ✅ 运行中 |
| Strategy Recommendation Engine | ✅ 运行中 |
| Strategy Backtest Engine | ✅ 运行中 |
| Strategy Learning Engine | ✅ 运行中 |
| Strategy Center UI | ✅ 上线（v17.16.0） |
| Daily Validation（T1 稳定化） | ✅ 运行中（v17.17.0，首日 ALL PASS） |
| Phase 7 Roadmap 文档 | ✅ 完成（v17.17.x） |
| **T2 Roadmap 文档（本文档）** | ✅ **完成** |

**T1 正式封版日期：2026-06-30**

---

## 十二、当前状态与下一步

```
现在（2026-06-30）
  T1 封版 ✅
  T2 Roadmap 建立 ✅
  系统进入：稳定运行 + 数据积累阶段
  │
  ▼
等待（预计 ~30 个交易日 ≈ 6–7 周）
  T1 Stabilization 满足 7 个 Phase 7 条件
  │
  ▼
Phase 7.1 启动
  v18.0.0 — 第一个参数优化上线
  （具体内容见 AI-Strategy-Optimization.md P0-001 起）
```

**结论：T1 正式封版。项目正式进入 T2 — 由数据驱动的持续 AI 策略优化阶段。**

---

*本文档是 T2 的顶层规划文档。任何 T2 功能的开发必须能在本文档中找到对应的规划条目。如有新方向，先更新本文档经 Review 通过，再开始开发。*
