# AI Strategy Optimization — Phase 7 设计文档

**文档版本：** v1.0.0  
**创建日期：** 2026-06-30  
**状态：** PENDING（等待 T1 Stabilization 完成）  
**关联文档：** `docs/Trading-Architecture.md` / `docs/Module-Responsibility.md`

---

## 一、文档目的

Phase 7 不是重构，不是改架构，不是颠覆现有设计。

Phase 7 的唯一目的是：

> **利用真实交易数据的积累，持续优化 AI 策略的参数、特征和决策质量。**

Trading Architecture V1 已经定义了完整的三策略体系（DAY / SWING / LONG），建立了数据管道、回测引擎和学习系统。这些基础设施保持不变。Phase 7 在此基础上做「精调」，不做「重建」。

---

## 二、铁律：什么不能动

| 禁止操作 | 说明 |
|---------|------|
| 修改 Trading Architecture | `docs/Trading-Architecture.md` 定义的整体架构冻结 |
| 修改 Module Responsibility | `docs/Module-Responsibility.md` 定义的模块职责冻结 |
| 修改数据库 Schema | 禁止新增 / 删除 / 重命名任何表或字段 |
| 修改三策略引擎核心流程 | `day-strategy.ts` / `swing-strategy.ts` / `long-strategy.ts` 的主流程冻结 |
| 修改 SR Engine | Strategy Recommendation 的生成逻辑冻结 |
| 修改 Backtest Engine | `strategy-backtest.ts` 的统计计算逻辑冻结 |
| 修改 Learning Engine | `strategy-learning.ts` 的评分公式冻结 |

**唯一允许修改的范围：**

| 允许操作 | 说明 |
|---------|------|
| 参数优化 | 阈值、过滤条件、持仓天数上限等数值参数 |
| 权重优化 | AI 评分各维度的权重系数 |
| AI 模型升级 | 在 `lib/ai-score.ts` 内部替换算法实现，接口不变 |
| 风控优化 | 止盈止损阈值、仓位上限、集中度限制等 |
| Feature Selection | 选择哪些特征进入评分，不新增 Schema 字段 |

---

## 三、Phase 7 启动条件

**以下 7 个条件必须全部满足，才允许 Phase 7 开始编码：**

| # | 条件 | 目标 | 意义 |
|---|------|------|------|
| 1 | DAY 成交数 | ≥ 100 笔 | 足够的日内交易样本 |
| 2 | SWING 平仓数 | ≥ 30 笔 | 足够的摆动交易样本 |
| 3 | LONG 平仓数 | ≥ 20 笔 | 足够的长线交易样本 |
| 4 | DAY Learning Grade | ≥ B | 日内策略已具备基本预测能力 |
| 5 | SWING Learning Grade | ≥ C | 摆动策略已具备基本预测能力 |
| 6 | LONG Learning Grade | ≥ C | 长线策略已具备基本预测能力 |
| 7 | 连续 Health CRITICAL=0 | 30 个交易日 | 系统稳定运行验证 |

条件状态由 `StrategyDailyValidation.phase7Ready` 字段自动更新，可在 Strategy Center → 稳定化 Tab 查看实时进度。

**在条件满足前：禁止开始任何 Phase 7 开发工作。**

---

## 四、Day Strategy 优化研究

### 4.1 背景

Day Strategy 在当天买入、当天平仓（T+0 日内交易模拟）。核心问题是：如何从当天的 Top100 推荐中选出最优的入场候选，以及在什么条件下触发退出。

### 4.2 入场选股优化（研究方向）

**Top5 vs Top10 对比**

- 假设：rank 越靠前，Alpha 越高，但集中度风险越大
- 研究问题：Top5 的胜率和 Alpha 是否显著高于 Top6–10？
- 数据来源：`StrategyTradeResult`（entryRank 字段）+ `StrategyBacktestSummary`
- 方法：按 rank 分层统计 winRate / avgAlpha / Sharpe，观察是否存在明显断层

**成交量过滤**

- 假设：低流动性股票的 AI 评分信号噪声更大
- 研究问题：设定成交量下限（如 3 千万日元/日）能否提高胜率？
- 候选参数：最近 5 日均量 ≥ N 万日元
- 风险：过滤后样本量下降，需权衡信号质量与覆盖率

**波动率过滤**

- 假设：超高波动率股票（ATR > N%）不适合日内策略
- 研究问题：ATR 过滤能否降低最大单日亏损？
- 候选参数：5 日 ATR < 5%（可调）
- 评估指标：MaxDrawdown / Recovery Factor

**行业过滤**

- 假设：当日大盘行情影响行业板块，某些行业表现与 AI 信号相关性低
- 研究问题：行业动量过滤（近 5 日行业涨幅 > 0）能否改善 Alpha？
- 候选参数：行业近 N 日涨幅 > M%

**时间过滤**

- 假设：月末、财报密集期、TOPIX 再平衡日附近信号质量下降
- 研究问题：识别低质量信号日并跳过，能否改善年化 Sharpe？
- 数据来源：`GlobalMarket` + 日本财报日历

### 4.3 退出规则优化（研究方向）

DAY 策略当前为固定时间退出。研究是否引入：
- 涨幅止盈（如 +3% 止盈）
- 跌幅止损（如 -2% 止损）
- 尾盘强制平仓（15:25 JST）

---

## 五、Swing Strategy 优化研究

### 5.1 背景

Swing Strategy 持仓 5–20 日，通过技术面 + AI 信号判断中期趋势。核心问题是退出时机和动态止损。

### 5.2 退出规则优化（研究方向）

**固定 20 日退出 vs 动态退出**

- 当前：持仓满 20 日强制退出
- 研究问题：持仓满 20 日时，是否应根据当前 AI 评分决定继续持有还是退出？
- 候选方案：若持仓 20 日时 finalScore ≥ 65 + 未亏损，则延期至 30 日
- 风险：增加持仓集中度风险

**AI 退出阈值**

- 当前：AI 评分降至 HOLD 以下触发退出
- 研究问题：最优退出阈值是多少？50? 55? 60?
- 方法：回测各阈值对应的胜率 / Sharpe，选最优
- 数据来源：`StrategyTradeResult` 中记录的 exitReason

**止盈优化**

- 候选方案：浮盈 +15% 时设置追踪止损（Trailing Stop）@ -5%
- 研究问题：追踪止损能否捕获更多上涨空间同时保护利润？
- 评估指标：Profit Factor / Max Favorable Excursion

**止损优化**

- 当前止损：-10%
- 研究问题：-10% 是否过宽？-7% 或 -8% 能否降低最大单笔亏损？
- 方法：按不同止损阈值分层统计 MaxDrawdown / Recovery Factor

**ATR 动态止损**

- 候选方案：止损 = 入场价 - 2 × ATR(14)
- 意义：根据个股波动率自适应设置止损，高波动股宽松、低波动股收紧
- 数据来源：`DailyPrice` 计算 ATR

### 5.3 持仓规模优化

- 当前：等权分配
- 研究问题：AI 评分高的股票是否应分配更多仓位？（Kelly 部分实现）
- 候选方案：仓位 ∝ finalScore（归一化后上限 2×等权）

---

## 六、Long Strategy 优化研究

### 6.1 背景

Long Strategy 持仓 30–90 日，专注基本面强 + AI 评分高的 STRONG_BUY 股票。核心问题是如何识别真正的长线机会，以及行业轮动时机。

### 6.2 入场条件优化（研究方向）

**STRONG_BUY 阈值优化**

- 当前：adaptiveScore ≥ 75 AND percentileRank ≤ 5%
- 研究问题：提升阈值（adaptiveScore ≥ 80）能否提高 Alpha？样本量是否足够？
- 方法：按不同阈值比较入场后 30/60/90 日的 Alpha 分布

**基本面过滤**

- 假设：Long Strategy 需要更强的基本面支撑
- 候选过滤条件：
  - ROE ≥ 10%
  - 近 4 季 EPS 连续正增长
  - 负债率 ≤ 60%
  - fundamentalScore ≥ 20（满分 25）
- 数据来源：`Financial` 表

**行业轮动**

- 假设：处于上升周期的行业中的 STRONG_BUY 股票胜率更高
- 研究问题：加入行业相对强度过滤（行业近 20 日 Alpha > 0），能否改善 LONG 策略？
- 数据来源：`DailyPrice` 按行业聚合 + `AITheme` 主题动量

**财报周期**

- 假设：财报披露前 20 日内不入场，避免不确定性风险
- 研究问题：回避财报窗口期能否降低极端亏损概率？
- 数据来源：`Disclosure` 表（TDnet 财报预期日）

### 6.3 退出规则优化

**90 日强制退出 vs 分阶段退出**

- 候选方案：60 日时评估，若 Alpha > +5% 且 AI 评分仍 ≥ 70，延至 90 日
- 风险：持仓周期延长，仓位占用增加

**基本面恶化退出**

- 候选触发：fundamentalScore 较入场时下降 ≥ 5 分
- 实现：每周计算持仓股的最新 fundamentalScore，与入场时对比

---

## 七、AI 模型优化研究（暂不开发）

以下方向已列入研究列表，**当前全部暂不开发**，待 Phase 7 正式启动后逐步评估。

| 方向 | 描述 | 预计阶段 |
|------|------|---------|
| 权重自动学习 | 用历史 Alpha 数据回归优化 5 维度权重系数 | Phase 7.2 |
| Feature Selection | SHAP 分析识别对 Alpha 贡献最大的特征 | Phase 7.2 |
| XGBoost | 替换部分线性评分为树模型 | Phase 7.3 |
| LightGBM | 轻量级 GBDT，适合大量级特征 | Phase 7.3 |
| CatBoost | 处理类别特征（行业/风格） | Phase 7.3 |
| AutoML | 自动化超参数搜索 | Phase 7.3 |
| Bayesian Optimization | 贝叶斯优化评分权重 | Phase 7.2 |
| 强化学习 | 将策略决策建模为 MDP，Agent 自动学习交易规则 | Phase 7.5 |

**重要约束：** 任何 AI 模型升级必须满足：
- 接口不变（输入输出格式与现有 `lib/ai-score.ts` 兼容）
- 可回测验证（在历史数据上对比新旧模型 Alpha）
- 可回滚（旧模型参数保留，新模型并行运行至少 30 日验证）

---

## 八、Learning 引擎优化研究

### 8.1 Feature 价值评估

**研究问题：** 当前 5 个评分维度中，哪些对 Alpha 贡献最大？

| 维度 | 当前权重 | 待研究问题 |
|------|---------|-----------|
| technicalScore | 30% | MA/RSI/MACD 各自对 Alpha 的贡献比例 |
| fundamentalScore | 25% | ROE vs EPS vs 负债率：哪个最预测性？ |
| moneyFlowScore | 20% | 机构资金数据与 Alpha 的相关性是否稳定？ |
| newsSentimentScore | 15% | 新闻情绪是否真正提供 Alpha 还是噪声？ |
| globalTrendScore | 10% | VIX/USDJPY 对个股 Alpha 的影响强度 |

### 8.2 新闻情绪有效性评估

- 假设：当前新闻情绪评分质量参差不齐，部分无价值新闻拉低信号质量
- 研究方法：对比「带高情绪分」vs「低情绪分」的持仓，Alpha 差异是否显著
- 行动方向：若无显著差异，考虑降低 newsSentimentScore 权重

### 8.3 分策略权重差异化

- 当前：三策略使用同一套评分权重
- 研究问题：DAY/SWING/LONG 最优的评分维度权重是否不同？
  - DAY 可能更依赖 technicalScore + globalTrendScore
  - LONG 可能更依赖 fundamentalScore + moneyFlowScore
- 实现路径：在 `classifyStockStyle()` 中按策略类型调整 adaptiveWeight

---

## 九、风控优化研究

### 9.1 最大回撤控制

| 研究方向 | 描述 |
|---------|------|
| 策略级别熔断 | 若 DAY 策略单日亏损 > -3%，当日停止新开仓 |
| 周级别熔断 | 若任一策略当周累计亏损 > -8%，下周降低仓位 50% |
| 月级别熔断 | 若月度 MaxDrawdown > -15%，当月剩余时间停止交易 |

### 9.2 仓位管理

**Kelly 准则（部分实现）**

- Kelly f = (p × b - q) / b，其中 p=胜率，q=败率，b=赔率
- 限制：Kelly 仓位上限为等权的 2 倍（防过度集中）
- 实现阶段：Phase 7.4

**仓位集中度**

- 当前：单股仓位上限 = 总资金 / N（等权）
- 候选改进：单股仓位不超过总资金 15%，单行业不超过 30%

### 9.3 VaR 风险评估

- 研究方向：计算投资组合的 95% VaR（历史模拟法）
- 用途：每日验证当前持仓的风险暴露是否在可接受范围内
- 实现阶段：Phase 7.4

### 9.4 资金利用率

- 当前问题：SWING/LONG 策略可能大量资金处于闲置状态
- 研究方向：当资金利用率 < 50% 时，是否适当放宽入场条件
- 约束：不能为了利用资金而降低信号质量

---

## 十、统一评估指标体系

所有 Phase 7 优化的效果必须通过以下指标体系评估，结论才被认可：

| 指标 | 计算方式 | 优先级 |
|------|---------|--------|
| **Alpha** | 策略收益 - TOPIX 同期收益 | ★★★★★ |
| **Sharpe Ratio** | (μ - Rf) / σ，年化，Rf=0 | ★★★★★ |
| **Sortino Ratio** | (μ - Rf) / σ_downside | ★★★★ |
| **Max Drawdown** | 峰到谷最大回撤幅度 | ★★★★ |
| **Win Rate** | 盈利成交 / 总成交 | ★★★ |
| **Profit Factor** | 总盈利 / 总亏损 | ★★★ |
| **Recovery Factor** | 总收益 / Max Drawdown | ★★★ |

**评估规则：**
- 任何参数修改必须在至少 30 笔历史成交上回测，方可认为有统计意义
- 改进必须在 Alpha + Sharpe 两个核心指标上均有提升（不允许牺牲 Sharpe 换 Alpha）
- 回测必须使用严格的 Out-of-Sample 测试集（不允许在同一数据上训练+评估）

---

## 十一、优化优先级列表

### P0 — 高优先级（Phase 7 启动后优先研究）

| ID | 策略 | 优化方向 | 预期收益 | 实现难度 |
|----|------|---------|---------|---------|
| P0-001 | DAY | Top5 vs Top10 对比分析 | 胜率提升预期 | 低 |
| P0-002 | DAY | 成交量过滤（均量 ≥ 3000万日元） | 降低噪声 | 低 |
| P0-003 | SWING | 止损阈值优化（-7% vs -10%） | 降低 MaxDrawdown | 低 |
| P0-004 | SWING | AI 退出阈值研究（50/55/60 对比） | Alpha 提升预期 | 低 |
| P0-005 | ALL | Learning 各维度权重有效性分析 | 评分质量提升 | 中 |

### P1 — 中优先级（P0 完成后推进）

| ID | 策略 | 优化方向 | 预期收益 | 实现难度 |
|----|------|---------|---------|---------|
| P1-001 | SWING | ATR 动态止损 | Sortino 提升 | 中 |
| P1-002 | SWING | 追踪止盈（Trailing Stop） | Profit Factor 提升 | 中 |
| P1-003 | LONG | 基本面过滤（ROE / EPS / 负债率） | Alpha 稳定性提升 | 中 |
| P1-004 | DAY | 波动率过滤（ATR < 5%） | MaxDrawdown 降低 | 低 |
| P1-005 | ALL | 分策略差异化评分权重 | Alpha 提升 | 高 |

### P2 — 低优先级（条件成熟后研究）

| ID | 策略 | 优化方向 | 预期收益 | 实现难度 |
|----|------|---------|---------|---------|
| P2-001 | LONG | 行业轮动过滤 | 趋势对齐 | 高 |
| P2-002 | LONG | 财报周期回避 | 降低突发亏损 | 中 |
| P2-003 | ALL | Kelly 仓位管理 | 资金效率提升 | 高 |
| P2-004 | ALL | 新闻情绪权重评估 | 信号质量提升 | 中 |
| P2-005 | ALL | VaR 风险模型 | 风控体系完善 | 高 |

---

## 十二、Phase 7 路线图

```
T1 Stabilization（当前）
连续30交易日验证 + 数据积累
│
└─► 满足7个启动条件
    │
    ▼
Phase 7.1 — 参数优化（预计 T1 完成后 1–2 个月）
  P0 优化全部完成
  DAY: Top5/量过滤/波动率过滤
  SWING: 止损阈值/-AI退出阈值
  目标：Sharpe > 1.0 for DAY
  │
  ▼
Phase 7.2 — Feature 优化（预计 +1 个月）
  Learning 维度有效性分析
  分策略差异化权重
  新闻情绪权重重评
  目标：DAY Alpha > +3% annualized vs TOPIX
  │
  ▼
Phase 7.3 — AI 模型升级（预计 +2 个月）
  XGBoost / LightGBM 替代线性评分（部分维度）
  Bayesian Optimization 权重搜索
  新旧模型 30 日并行验证
  目标：模型切换后 Alpha 不下降
  │
  ▼
Phase 7.4 — 风险模型（预计 +1 个月）
  Kelly 仓位管理
  VaR 评估
  策略级别熔断机制
  目标：MaxDrawdown < 15% annualized
  │
  ▼
Phase 7.5 — 自动参数学习（预计 +3 个月）
  参数自动搜索（Bayesian / 网格搜索）
  在线学习机制（参数随市场环境自适应）
  目标：参数无需手动调整，自动保持最优
```

---

## 十三、Phase 7 开发规则

**规则一：先文档，后编码**

任何 Phase 7 的优化，必须先在本文档（`AI-Strategy-Optimization.md`）中：
1. 明确研究假设
2. 确定评估指标
3. 通过 Review（开发者自审或团队审查）

才能开始编码。禁止直接修改策略代码而不更新本文档。

**规则二：优化必须可回滚**

所有参数修改必须通过配置化方式实现（`SystemConfig` 表或环境变量），禁止硬编码新参数，以便在优化效果不理想时快速回滚。

**规则三：结果必须可验证**

每次优化上线后，必须在 `StrategyBacktestSummary` + `StrategyLearningReport` 中观察 30 天变化趋势，才能判定优化是否有效。

**规则四：禁止同时进行多项优化**

每次只允许进行一项优化实验，避免效果叠加导致无法定位改进来源。

**规则五：Architecture 边界不可跨越**

即使在 Phase 7 内，以下操作仍然被永久禁止：
- 修改 `StrategyDailyValidation` / `StrategyLearningReport` 等表的字段语义
- 绕过 `generate-strategy-recommendations.ts` 直接向策略引擎注入信号
- 在策略引擎中直接访问 `DailyRecommendation`（已弃用表）

---

## 十四、当前状态

| 项目 | 状态 |
|------|------|
| Trading Architecture V1 | **FROZEN** |
| T1 Stabilization | **运行中**（首日 2026-06-30：ALL PASS ✅）|
| Phase 7 启动条件 | 7/7 待满足 |
| DAY 成交 | 5 / 100 |
| SWING 平仓 | 0 / 30 |
| LONG 平仓 | 0 / 20 |
| DAY Learning Grade | C（目标 B） |
| SWING Learning Grade | D（目标 C） |
| LONG Learning Grade | D（目标 C） |
| 连续 Health CRITICAL=0 | 0 / 30 天 |

**结论：系统正式进入稳定运行 + 数据积累阶段。等待满足 Phase 7 启动条件。**

---

*本文档由 Trading Architecture V1 Stabilization（T1）任务建立，作为 Phase 7 唯一设计基准。任何 Phase 7 开发必须以本文档为准，修改本文档需经 Review 通过。*
