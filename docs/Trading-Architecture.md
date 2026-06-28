# Trading Architecture Baseline（交易架构基线）

> **架构文档 · 仅作设计规范** — 本文档描述三交易体系的设计意图和实施路线。  
> 本文档不包含任何代码实现。所有实施必须以本文档为唯一设计依据。  
> 违反本文档的实现视为架构错误，不得合并。

---

## 目录

1. [文档目的](#1-文档目的)
2. [三交易体系总体架构](#2-三交易体系总体架构)
3. [Day Trade（日内交易）](#3-day-trade日内交易)
4. [Swing Trade（波段交易）](#4-swing-trade波段交易)
5. [Long Trade（趋势持仓）](#5-long-trade趋势持仓)
6. [AI 评分与策略的关系](#6-ai-评分与策略的关系)
7. [资金管理](#7-资金管理)
8. [Snapshot（快照）](#8-snapshot快照)
9. [Portfolio（组合）](#9-portfolio组合)
10. [Backtest（回测）](#10-backtest回测)
11. [Learning（学习报告）](#11-learning学习报告)
12. [Cron（调度规划）](#12-cron调度规划)
13. [数据库规划（仅设计）](#13-数据库规划仅设计)
14. [UI 规划](#14-ui-规划)
15. [实施路线](#15-实施路线)
16. [暂不开发](#16-暂不开发)
17. [变更记录](#17-变更记录)

---

## 1. 文档目的

### 为什么需要三交易体系

TOHOSHOU AI 的核心目标是验证 AI 在日本股票市场的选股能力。  
单一策略无法覆盖市场的多种状态——趋势市、震荡市、事件驱动市对应的最优持仓时间完全不同。

**三交易体系的存在理由：**

| 市场状态 | 最适策略 | 原因 |
|----------|----------|------|
| 短期波动强、日内方向明确 | Day Trade | 不隔夜，规避隔夜风险 |
| 有明确上行趋势、持续3-10日 | Swing Trade | 捕捉波段收益，及时止损 |
| 基本面驱动、行业趋势明确 | Long Trade | 持有足够时间等待价值释放 |

三套策略共用同一套 AI 评分作为信号来源，但买卖规则、持仓时间、风控阈值各自独立。  
这样既节约了 AI 推理成本，又能在不同时间维度独立验证 AI 选股能力。

### 设计原则

**原则一：共享信号，独立规则**  
三套策略使用同一个 AI 综合评分作为入场信号，但持仓规则、出场规则、止损阈值完全独立。

**原则二：独立资金池**  
三套策略使用独立的模拟资金池，收益不混算。这是为了能独立评估每套策略的 Alpha。

**原则三：独立 Backtest**  
三套策略的回测结果独立统计，不合并。合并统计会掩盖各策略的真实表现。

**原则四：统一学习**  
三套策略的学习报告汇总到同一个 Learning 系统，形成整体模型质量视图。

**原则五：时间维度不重叠**  
Day（1日）、Swing（3-10日）、Long（20-90日）的持仓时间不重叠，避免一只股票在多个策略中同时计算收益造成数据混乱。

### 适用范围

本文档适用于：

- 策略引擎开发（`scripts/` 下的 strategy 相关脚本）
- Portfolio Snapshot 构建逻辑（`lib/snapshot-builder.ts`）
- Backtest 计算逻辑（`lib/backtest*.ts`）
- Cron 调度规划（`lib/cron-jobs.ts`）
- 数据库 schema 设计（`prisma/schema.prisma`）
- UI 页面规划（`app/portfolio/`、`app/backtest/`）

### 不适用范围

本文档不适用于：

- AI 评分计算逻辑（`lib/safety-rules.ts`、`lib/scoring/`）
- 新闻同步逻辑（`lib/news/`）
- 用户认证、会员体系（本系统无此功能）
- 真实资金操作（本系统仅模拟，禁止接入真实券商 API）

---

## 2. 三交易体系总体架构

### 数据流总览

```
┌─────────────────────────────────────────────────────────┐
│                     数据输入层                           │
│  J-Quants 行情  ·  TDnet 财报  ·  新闻情绪  ·  全球指数 │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    AI 评分引擎                           │
│  technicalScore · fundamentalScore · newsSentimentScore │
│  globalTrendScore · opportunityScore                    │
│  → adaptiveScore（综合评分）                            │
│  → recommendationV2（STRONG_BUY / BUY / HOLD / …）      │
└───────────────┬─────────────────────────────────────────┘
                │  共享同一套评分信号
      ┌─────────┼─────────┐
      │         │         │
      ▼         ▼         ▼
  Day Trade  Swing Trade  Long Trade
  （30%资金） （40%资金）  （30%资金）
  1日持仓    3-10日持仓   20-90日持仓
      │         │         │
      └─────────┼─────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│              Snapshot（每日快照）                        │
│  三套策略各自生成独立 Snapshot                           │
│  记录：持仓 · 收益 · Alpha · P&L                        │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Backtest（回测验证）                        │
│  Day：1d 胜率 · 收益                                    │
│  Swing：5d / 7d 胜率 · 收益 · Alpha                    │
│  Long：20d / 30d / 90d 胜率 · 收益 · Alpha             │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Learning（学习报告）                        │
│  三套策略汇总 → integrityScore · 数据成熟度 · 特征覆盖率 │
└─────────────────────────────────────────────────────────┘
```

### 三策略资金分配（3:4:3）

```
总模拟资金 ¥100,000,000
├── Day Trade   30%  → ¥30,000,000
├── Swing Trade 40%  → ¥40,000,000
└── Long Trade  30%  → ¥30,000,000
```

### 策略独立性原则

```
同一只股票在同一日期，最多出现在一个策略的持仓中。
（避免重复计算收益，避免资金池重叠）
```

---

## 3. Day Trade（日内交易）

### 定义

> 当日买入，当日收盘前卖出，不隔夜持仓。

### 买入时机

| 条件 | 规则 |
|------|------|
| 信号来源 | 当日 DailyRecommendation，strategyType = `DAY` |
| 评级要求 | STRONG_BUY 或 BUY |
| 评分阈值 | adaptiveScore ≥ 75 |
| 买入时间 | 当日 9:00 JST（开盘价） |
| 最大持仓数 | 5 只（等权分配，每只占 Day 资金池 20%） |

### 卖出时机

| 条件 | 规则 |
|------|------|
| 止盈 | 收益 ≥ +1.5%（当日） |
| 止损 | 收益 ≤ -1.0%（当日） |
| 强制平仓 | 14:30 JST（收盘前30分钟无论收益如何全部卖出） |
| 持仓时间 | 最长 1 个交易日（不隔夜） |

### 是否隔夜

**禁止隔夜。** Day Trade 的核心原则是零隔夜风险。  
14:30 JST 无论盈亏，全部平仓。

### 收益统计

- **统计口径**：当日开盘价买入 → 当日收盘价（或止盈/止损价）卖出
- **收益率**：`(exitPrice - entryPrice) / entryPrice`
- **Alpha**：vs 当日 TOPIX 涨跌幅
- **统计周期**：每日单独统计，不跨日累计

### Backtest 周期

| 指标 | 回测 horizon |
|------|-------------|
| 胜率 | 1d |
| 平均收益 | 1d |
| Alpha | 1d |

### Snapshot

- 生成时机：每个交易日 **16:00 JST**（收盘结算后）
- 内容：当日平仓结果 · 累计 P&L · 资金池余额
- 周末 / 节假日：不生成（无交易）

### Portfolio

- Day Trade 使用独立 Portfolio（不与 Swing/Long 混算）
- 标识字段：`strategyType = 'DAY'`

---

## 4. Swing Trade（波段交易）

### 定义

> 持仓 3-10 个交易日，捕捉短期趋势性收益，设置止盈止损。

### 买入规则

| 条件 | 规则 |
|------|------|
| 信号来源 | 当日 DailyRecommendation，strategyType = `SWING` |
| 评级要求 | STRONG_BUY 或 BUY |
| 评分阈值 | adaptiveScore ≥ 70 |
| 技术评分 | technicalScore ≥ 65 |
| 买入时间 | 推荐日次日开盘（T+1 开盘价，规避 Look-Ahead Bias） |
| 最大持仓数 | 5 只（等权分配，每只占 Swing 资金池 20%） |

### 卖出规则

| 触发条件 | 规则 |
|----------|------|
| 止盈 | 收益 ≥ +5%（7日内达到） |
| 止损 | 收益 ≤ -3%（7日内触发） |
| 时间止损 | 持仓满 10 个交易日，无论盈亏，收盘平仓 |
| 评级降级 | AI 评级降为 HOLD 或以下，次日开盘平仓 |

### 持仓规则

- 持仓时间：3-10 个交易日
- 最短持仓：1 个交易日（即使次日触发止损也须等 T+1）
- 不得与 Day Trade 持仓同一只股票

### 止盈 / 止损

```
止盈线：+5%
───────────────────────────────  ← 止盈平仓
        持仓区间（3-10日）
───────────────────────────────  ← 止损平仓
止损线：-3%
```

### Snapshot

- 生成时机：每个交易日 **15:30 JST**（收盘后）
- 内容：当前持仓 · 持仓天数 · 未实现收益 · 累计已实现 P&L
- 周末 / 节假日：**生成**（持仓未平，快照反映最后收盘价）

### Portfolio

- Swing Trade 使用独立 Portfolio
- 标识字段：`strategyType = 'SWING'`

### Backtest 周期

| 指标 | 回测 horizon |
|------|-------------|
| 胜率 | 5d、7d |
| 平均收益 | 5d、7d |
| Alpha | 5d、7d |
| 最大持仓天数 | 10d |

---

## 5. Long Trade（趋势持仓）

### 定义

> 持仓 20-90 个交易日，追踪基本面驱动的中长期趋势，等待价值充分释放。

### 买入规则

| 条件 | 规则 |
|------|------|
| 信号来源 | 当日 DailyRecommendation，strategyType = `POSITION` |
| 评级要求 | STRONG_BUY |
| 评分阈值 | adaptiveScore ≥ 80 |
| 基本面评分 | fundamentalScore ≥ 70 |
| 买入时间 | 推荐日次日开盘（T+1 开盘价） |
| 最大持仓数 | 5 只（等权分配，每只占 Long 资金池 20%） |

### 卖出规则

| 触发条件 | 规则 |
|----------|------|
| 止盈 | 收益 ≥ +15%（持仓期内任意时点） |
| 止损 | 收益 ≤ -8%（30日内触发） |
| 时间止损 | 持仓满 90 个交易日，收盘强制平仓 |
| 评级连续降级 | 连续3日评级降为 HOLD 或以下，次日开盘平仓 |

### 长期持仓规则

- 持仓时间：20-90 个交易日
- 不得与 Day Trade / Swing Trade 持仓同一只股票
- 持仓期间不因短期波动触发调仓，仅依赖上述卖出规则

### Alpha

- 对比基准：TOPIX 同期涨跌幅
- 统计周期：20d、30d、60d、90d
- Alpha 公式：`strategyReturn - topixReturn`（同期）

### Snapshot

- 生成时机：每个交易日 **15:30 JST**（收盘后）
- 内容：当前持仓 · 持仓天数 · 未实现收益 · Alpha · 累计已实现 P&L
- 周末 / 节假日：**生成**（反映最后收盘价）

### Portfolio

- Long Trade 使用独立 Portfolio
- 标识字段：`strategyType = 'POSITION'`

### Backtest 周期

| 指标 | 回测 horizon |
|------|-------------|
| 胜率 | 20d、30d、60d、90d |
| 平均收益 | 20d、30d、60d、90d |
| Alpha | 20d、30d、60d、90d |
| 最大回撤 | 90d |

---

## 6. AI 评分与策略的关系

### 共享评分（三策略共用）

以下评分由 AI 统一计算，三套策略共同使用同一数值：

| 评分字段 | 含义 | 三策略共享 |
|----------|------|-----------|
| `adaptiveScore` | AI 综合评分（0-100） | ✅ |
| `technicalScore` | 技术面评分 | ✅ |
| `fundamentalScore` | 基本面评分 | ✅ |
| `newsSentimentScore` | 新闻情绪评分 | ✅ |
| `globalTrendScore` | 全球市场趋势评分 | ✅ |
| `recommendationV2` | AI 推荐评级 | ✅ |

**共享原因：** AI 评分的计算成本较高，统一计算后供三套策略使用，避免重复推理。

### 策略独立规则

以下内容三套策略各自独立，**不得共享**：

| 内容 | Day | Swing | Long | 原因 |
|------|-----|-------|------|------|
| 评分阈值 | ≥75 | ≥70 | ≥80 | 各策略风险承受不同 |
| 入场时机 | 当日9:00 | T+1开盘 | T+1开盘 | 时间维度不同 |
| 止盈线 | +1.5% | +5% | +15% | 持仓时间差异 |
| 止损线 | -1.0% | -3% | -8% | 风险容忍度不同 |
| 最大持仓天数 | 1日 | 10日 | 90日 | 策略定义不同 |
| Portfolio Snapshot | 独立 | 独立 | 独立 | 收益不混算 |
| Backtest horizon | 1d | 5d/7d | 20d-90d | 验证维度不同 |

### 评分流程图

```
J-Quants 行情数据
TDnet 财报数据           → compute-scores（每日 09:00 UTC cron）
新闻情绪数据                │
全球市场数据               ▼
                    StockScore（per symbol）
                    adaptiveScore / technicalScore / …
                         │
                         ▼
                  rerank-top500（每日 10:00 UTC cron）
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     Day 策略筛选   Swing 策略筛选  Long 策略筛选
     adaptiveScore≥75  ≥70           ≥80
     recommendationV2  BUY+          STRONG_BUY
          │              │              │
          ▼              ▼              ▼
     DailyRecommendation（strategyType 字段标记）
```

---

## 7. 资金管理

### 推荐方案：独立资金池

**结论：三套策略使用独立资金池，不得相互借用。**

| 策略 | 模拟资金 | 占比 | 最大单笔 | 最大持仓数 |
|------|----------|------|----------|-----------|
| Day Trade | ¥30,000,000 | 30% | ¥6,000,000 | 5只 |
| Swing Trade | ¥40,000,000 | 40% | ¥8,000,000 | 5只 |
| Long Trade | ¥30,000,000 | 30% | ¥6,000,000 | 5只 |
| **合计** | **¥100,000,000** | **100%** | | |

### 为什么独立资金池

**原因 1：Alpha 独立可比**  
如果三套策略共享资金，Swing Trade 的盈利会提升 Day Trade 可用资金，导致各策略的 Alpha 无法独立评估。

**原因 2：回测独立可信**  
独立资金池确保每套策略的回测结果只反映该策略自身的表现，不受其他策略影响。

**原因 3：调试定位清晰**  
当某套策略出现异常时，独立资金池能精准定位问题来源，不会因资金共享导致连锁影响。

### 资金再平衡规则

- 每套资金池余额独立结算，不跨池转移
- 亏损不从其他资金池补充
- 每个自然月月初，各池从初始金额重置（模拟环境）

### 仓位计算规则

```
单笔仓位 = 对应资金池总额 / 最大持仓数

Day Trade 单笔：¥30,000,000 / 5 = ¥6,000,000
Swing Trade 单笔：¥40,000,000 / 5 = ¥8,000,000
Long Trade 单笔：¥30,000,000 / 5 = ¥6,000,000
```

等权分配，不按评分加权（避免评分高估导致过度集中）。

---

## 8. Snapshot（快照）

### 定义

Snapshot 是某一时间点的策略状态快照，用于记录持仓、收益、Alpha。  
Snapshot 是不可变的（CREATE-only，生成后禁止修改）。

### 生成时机

| 策略 | 生成时间 | 生成条件 |
|------|----------|----------|
| Day Trade | 每交易日 16:00 JST | 当日有交易记录（无论盈亏） |
| Swing Trade | 每交易日 15:30 JST | 有持仓或有平仓记录 |
| Long Trade | 每交易日 15:30 JST | 有持仓或有平仓记录 |

### 不生成的情况

| 情况 | 处理方式 |
|------|----------|
| 周末（周六/周日） | Day Trade 不生成；Swing/Long **生成**（反映持仓状态） |
| 日本法定节假日 | Day Trade 不生成；Swing/Long **生成** |
| 无持仓且无交易 | 三套策略均不生成（避免空快照污染数据库） |
| 数据同步未完成 | 推迟生成，待 J-Quants 价格数据到位后补生成 |

### Snapshot 内容字段

```
StrategySnapshot {
  id
  snapshotDate         -- 快照日期（JST）
  strategyType         -- DAY / SWING / POSITION
  totalValue           -- 资金池总市值（持仓市值 + 现金）
  cashBalance          -- 现金余额
  positionCount        -- 当前持仓数
  unrealizedPnl        -- 未实现盈亏
  realizedPnl          -- 已实现盈亏（累计）
  returnPct            -- 总收益率
  alpha                -- vs TOPIX 同期
  maxDrawdown          -- 最大回撤（截至本日）
  topixReturn          -- TOPIX 同期收益率（对照）
  createdAt
}
```

### 历史快照查询

- 按 `strategyType` + `snapshotDate` 范围查询
- 不允许删除或修改历史快照
- 最多保留2年滚动历史

---

## 9. Portfolio（组合）

### 三套独立 Portfolio

三套策略各自维护独立的 Portfolio，不得合并统计。

```
Portfolio
├── Day Trade Portfolio    （标识：strategyType = 'DAY'）
├── Swing Trade Portfolio  （标识：strategyType = 'SWING'）
└── Long Trade Portfolio   （标识：strategyType = 'POSITION'）
```

### Portfolio 核心指标

每套 Portfolio 独立统计以下指标：

| 指标 | 含义 | 统计方式 |
|------|------|----------|
| 总收益率 | 相对初始资金 | `(currentValue - initialCapital) / initialCapital` |
| Alpha | 相对 TOPIX | `strategyReturn - topixReturn`（同期） |
| 胜率 | 盈利笔数 / 总交易笔数 | 已平仓交易 |
| 最大回撤 | 峰值到谷值最大跌幅 | 滚动计算 |
| 夏普比率 | 风险调整后收益 | （待实施阶段实现） |

### 共同展示（汇总视图）

在 UI 层提供三套 Portfolio 的汇总视图：

```
总组合概览
├── 总市值：Day + Swing + Long 合计
├── 总收益率：加权平均（3:4:3）
├── 综合 Alpha：加权平均
└── 各策略独立展示栏（三列并排）
```

**注意：汇总视图仅用于展示，收益计算仍以独立 Portfolio 为准。**

### 买卖记录

每笔买卖记录须包含：

```
StrategyTrade {
  id
  symbol
  strategyType         -- DAY / SWING / POSITION
  tradeType            -- BUY / SELL
  price
  quantity             -- 股数（模拟）
  amount               -- 金额
  tradeDate            -- 交易日期（JST）
  holdingDays          -- 持仓天数（仅 SELL 时填写）
  returnPct            -- 本笔收益率（仅 SELL 时填写）
  exitReason           -- TAKE_PROFIT / STOP_LOSS / TIME_STOP / RATING_DOWNGRADE
}
```

---

## 10. Backtest（回测）

### 三套独立 Backtest

三套策略各自维护独立的回测结果，不得合并。

| 策略 | 回测 horizon | 主要指标 |
|------|-------------|---------|
| Day Trade | 1d | 胜率、均收益、Alpha（日内） |
| Swing Trade | 5d、7d | 胜率、均收益、Alpha |
| Long Trade | 20d、30d、60d、90d | 胜率、均收益、Alpha、最大回撤 |

### 回测统计指标

每套策略、每个 horizon 独立统计：

| 指标 | 定义 |
|------|------|
| `winRate` | 正收益笔数 / 总笔数（%） |
| `avgReturn` | 所有笔均收益率（%） |
| `medianReturn` | 收益率中位数（%） |
| `alpha` | 均 Alpha（策略均收益 - TOPIX 同期均收益） |
| `maxDrawdown` | 最大回撤（%，Long Trade 专项） |
| `sampleCount` | 样本总数 |
| `filledCount` | 有 exitPrice 的样本数（有效样本） |
| `fillRate` | `filledCount / sampleCount`（%） |

### 数据成熟度

由于 Long Trade 持仓时间最长，不同 horizon 的回测数据成熟需要不同时间：

```
Day（1d）     → 需要 4 个自然日积累
Swing（7d）   → 需要 12 个自然日积累
Long（30d）   → 需要 46 个自然日积累
Long（90d）   → 需要 132 个自然日积累
```

**fillRate < 30% 时，该 horizon 的回测结果不显示（标注「数据积累中」）。**

### 回测生命周期

```
DailyRecommendation 生成（T+0）
    ↓
T+1：买入价格锁定（entryPrice = T+1 开盘价）
    ↓
T+N：exitPrice 陆续填入（N = horizon 天数）
    ↓
update-backtest cron 每日更新 fillRate 和统计指标
    ↓
Backtest 页面展示当前成熟度
```

---

## 11. Learning（学习报告）

### 定义

学习报告汇总三套策略的模型质量表现，形成系统整体的「AI 学习成果」视图。

### 三套策略汇总方式

```
Learning Report
├── Day Trade 学习摘要
│   ├── 1d fillRate
│   ├── 1d 胜率趋势（最近30日）
│   └── 模型稳定性（胜率标准差）
│
├── Swing Trade 学习摘要
│   ├── 5d / 7d fillRate
│   ├── 胜率趋势
│   └── Alpha 稳定性
│
├── Long Trade 学习摘要
│   ├── 20d / 30d fillRate
│   ├── 胜率趋势
│   └── Alpha vs TOPIX 稳定性
│
└── 整体摘要
    ├── integrityScore（0-100）
    ├── 三策略综合胜率（加权平均 3:4:3）
    ├── 整体 Alpha
    └── feat_* 特征覆盖率（30字段）
```

### integrityScore 计算（三策略加权）

```
integrityScore = (
  dayScore × 0.30 +
  swingScore × 0.40 +
  longScore × 0.30
)

各策略子分 = (pipelineScore + fillRateScore + alphaScore) / 3
```

### 学习报告生成时机

- 每日 `generate-learning-report` cron 生成
- 仅在三套策略均有有效 Backtest 数据时生成完整报告
- 数据不足时，生成「部分报告」并标注哪些 horizon 尚在积累中

---

## 12. Cron（调度规划）

### 每日调度时间表（JST）

```
07:00 JST  同步全球市场（fetch-global-market）
           ↓
07:15 JST  同步当日股票行情（sync-all-prices）
           ↓
07:30 JST  流水线正式启动
           │
           ├── compute-scores（AI 评分计算，≈90分钟）
           │       ↓
           ├── rerank-top500（推荐排名生成，≈2.5小时）
           │       ↓
           ├── create-day-strategy-snapshot     ← Day 策略快照
           │       ↓
           ├── create-swing-strategy-snapshot   ← Swing 策略快照
           │       ↓
           ├── create-long-strategy-snapshot    ← Long 策略快照
           │       ↓
           ├── update-backtest（回测更新）
           │       ↓
           ├── generate-learning-report（学习报告）
           │       ↓
           └── data-health-guard（数据健康检查）

16:00 JST  Day Trade Snapshot 生成（收盘结算后）
```

### 各策略 Snapshot 生成时机（详细）

| 快照类型 | 触发时间 | 触发条件 | 依赖数据 |
|----------|----------|----------|---------|
| Day Snapshot | 16:00 JST 每交易日 | 当日有 Day 策略推荐 | 当日 J-Quants 收盘价 |
| Swing Snapshot | 15:30 JST 每交易日 | 有 Swing 持仓或平仓 | 当日收盘价 |
| Long Snapshot | 15:30 JST 每交易日 | 有 Long 持仓或平仓 | 当日收盘价 |
| Backtest 更新 | 每日 update-backtest cron | 固定每日更新 | 收盘价（entryPrice/exitPrice） |
| 学习报告 | 每日 generate-learning-report | 固定每日更新 | Backtest 数据 |

### 禁止在以下窗口重启 Cron

```
07:30 JST — 15:00 JST
（rerank-top500 和策略快照生成窗口，重启会中断流水线）
```

---

## 13. 数据库规划（仅设计）

> **⚠ 本节仅为设计规范，禁止在本文档发布前执行任何 migration。**  
> 实施须等待 Phase 1 评审通过后方可进行。

### 现有表（已实现）

```
DailyRecommendation     ← 每日推荐（含 strategyType 字段）
BacktestPositionResult  ← 逐笔回测结果（per symbol per horizon）
BacktestResult          ← 回测聚合（已废弃，由 BacktestPositionResult 替代）
PortfolioSnapshot       ← 当前组合快照（strategyType 已有）
```

### 需要新增的表（设计草案）

#### StrategyPosition（策略持仓记录）

```
StrategyPosition {
  id              Int           @id @autoincrement
  symbol          String
  strategyType    String        -- DAY / SWING / POSITION
  entryDate       DateTime      -- 买入日期（JST）
  entryPrice      Decimal       -- 买入价格
  quantity        Int           -- 持仓数量（模拟）
  exitDate        DateTime?     -- 平仓日期（null=未平仓）
  exitPrice       Decimal?      -- 平仓价格（null=未平仓）
  exitReason      String?       -- TAKE_PROFIT / STOP_LOSS / TIME_STOP / RATING_DOWNGRADE
  holdingDays     Int?          -- 持仓天数（平仓后填写）
  returnPct       Decimal?      -- 收益率（平仓后填写）
  alpha           Decimal?      -- 相对 TOPIX Alpha（平仓后填写）
  topixReturn     Decimal?      -- TOPIX 同期收益率（对照）
  createdAt       DateTime
  updatedAt       DateTime
}
```

#### StrategyCapitalLog（资金池流水）

```
StrategyCapitalLog {
  id              Int           @id @autoincrement
  strategyType    String        -- DAY / SWING / POSITION
  logDate         DateTime      -- 日期（JST）
  cashBalance     Decimal       -- 现金余额
  positionValue   Decimal       -- 持仓市值
  totalValue      Decimal       -- 总市值
  realizedPnl     Decimal       -- 累计已实现盈亏
  unrealizedPnl   Decimal       -- 未实现盈亏
  returnPct       Decimal       -- 总收益率
  alpha           Decimal       -- vs TOPIX
  maxDrawdown     Decimal       -- 最大回撤（截至本日）
  createdAt       DateTime
}
```

#### StrategyBacktestSummary（策略级回测汇总）

```
StrategyBacktestSummary {
  id              Int           @id @autoincrement
  strategyType    String        -- DAY / SWING / POSITION
  horizon         String        -- 1d / 5d / 7d / 20d / 30d / 60d / 90d
  sampleCount     Int
  filledCount     Int
  fillRate        Decimal
  winRate         Decimal?
  avgReturn       Decimal?
  medianReturn    Decimal?
  alpha           Decimal?
  maxDrawdown     Decimal?
  computedAt      DateTime
  createdAt       DateTime
}
```

### ER 图（关系图）

```
DailyRecommendation
  │ symbol, strategyType, date
  │ adaptiveScore, recommendationV2
  │
  ├──────────────────────────────────┐
  │                                  │
  ▼                                  ▼
StrategyPosition              BacktestPositionResult
  │ symbol, strategyType         symbol, horizon, strategyType
  │ entryDate, entryPrice        entryPrice, exitPrice
  │ exitDate, exitPrice          returnPct, alpha
  │ returnPct, alpha             filledAt
  │
  ▼
StrategyCapitalLog
  │ strategyType, logDate
  │ totalValue, returnPct, alpha
  │
  ▼
StrategyBacktestSummary
  │ strategyType, horizon
  │ winRate, avgReturn, alpha
  │
  ▼
PortfolioSnapshot（已有）
  strategyType, snapshotDate
  totalValue, returnPct, alpha
```

### 现有表字段补充（需要但暂未实现）

| 表 | 需要新增字段 | 原因 |
|----|-------------|------|
| `DailyRecommendation` | `strategyType`（已有）、`entryPrice`（已有）| 已实现 |
| `BacktestPositionResult` | `strategyType` | 区分三套策略 |
| `PortfolioSnapshot` | `strategyType`（已有）、`maxDrawdown` | 最大回撤 |

---

## 14. UI 规划

### AI策略页面（待新建）`/strategy`

> 职责：展示三套策略的实时表现。

**页面布局：**

```
┌─────────────────────────────────────────────────────────┐
│  AI 策略总览                                            │
│  总市值 ¥XXX  ·  总收益率 X.X%  ·  综合 Alpha X.X%     │
├─────────────────────────────────────────────────────────┤
│  [ Day Trade ]  [ Swing Trade ]  [ Long Trade ]  ← Tabs │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  当前表现                                               │
│  ┌─────────┬──────────┬──────────┐                     │
│  │ 资金池  │ 当前持仓 │ 今日收益 │                     │
│  └─────────┴──────────┴──────────┘                     │
│                                                         │
│  持仓列表                                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 代码  │ 买入价 │ 现价  │ 持仓天数 │ 收益率 │ Alpha │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  收益曲线（折线图，对比 TOPIX）                          │
│                                                         │
│  历史回测摘要                                           │
│  胜率 X.X%  ·  均收益 +X.X%  ·  Alpha +X.X%            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 三套 Tab 各自展示

| Tab | 核心展示内容 |
|-----|-------------|
| Day Trade | 今日已平仓记录、今日 P&L、1d 胜率 |
| Swing Trade | 当前持仓（持仓天数/未实现收益）、5d/7d 胜率 |
| Long Trade | 当前持仓（Alpha/未实现收益）、20d/30d/90d 胜率 |

### 模块归属（遵循 Module Responsibility Baseline）

| 内容 | 所属模块 |
|------|----------|
| 三策略持仓概览 | `/strategy`（待新建）或归入 `/portfolio` |
| 三策略回测胜率 | `/backtest` |
| 三策略学习报告 | `/admin/learning-report` |
| 三策略同步状态 | `/sync` |

**注意：** `/strategy` 页面的最终定位须在实施前通过 Module Responsibility 审查。

---

## 15. 实施路线

> 以下各 Phase 顺序执行，不得跳相。  
> 每个 Phase 完成前，禁止启动下一 Phase。

---

### Phase 1：数据库

**目标：** 新增三策略所需的数据库表和字段

**任务清单：**

- [ ] `schema.prisma` 新增 `StrategyPosition` 表
- [ ] `schema.prisma` 新增 `StrategyCapitalLog` 表
- [ ] `schema.prisma` 新增 `StrategyBacktestSummary` 表
- [ ] `BacktestPositionResult` 新增 `strategyType` 字段
- [ ] 执行 migration（本地验证 + 生产部署）
- [ ] 编写 seed 数据（测试用）

**验收：** `npx prisma studio` 确认所有表和字段存在

---

### Phase 2：策略引擎

**目标：** 实现三套策略的买卖逻辑

**任务清单：**

- [ ] `scripts/day-strategy.ts` — Day Trade 买卖逻辑
- [ ] `scripts/swing-strategy.ts` — Swing Trade 买卖逻辑
- [ ] `scripts/long-strategy.ts` — Long Trade 买卖逻辑
- [ ] `lib/strategy/capital-pool.ts` — 独立资金池管理
- [ ] 单元测试：买入/止损/时间止损/评级降级 场景

**验收：** 本地模拟运行，`StrategyPosition` 表有正确数据

---

### Phase 3：Portfolio

**目标：** 三套 Portfolio 独立快照生成

**任务清单：**

- [ ] `lib/snapshot-builder.ts` 扩展支持三策略快照
- [ ] `scripts/create-day-strategy-snapshot.ts`
- [ ] `scripts/create-swing-strategy-snapshot.ts`
- [ ] `scripts/create-long-strategy-snapshot.ts`
- [ ] `StrategyCapitalLog` 写入逻辑

**验收：** 手动运行后，三个 `StrategyCapitalLog` 有独立数据

---

### Phase 4：Backtest

**目标：** 三套策略各自的回测计算

**任务清单：**

- [ ] `scripts/update-backtest.ts` 扩展 `strategyType` 维度
- [ ] `StrategyBacktestSummary` 写入逻辑
- [ ] `fillRate` 按 `strategyType` 独立计算
- [ ] API `GET /api/backtest?strategyType=DAY` 支持策略过滤

**验收：** `/backtest` 页面可按策略类型切换查看回测数据

---

### Phase 5：Learning

**目标：** 学习报告纳入三套策略维度

**任务清单：**

- [ ] `scripts/generate-learning-report.ts` 扩展三策略汇总
- [ ] `integrityScore` 按 3:4:3 加权计算
- [ ] `/admin/learning-report` 页面新增三策略分列视图

**验收：** 学习报告展示三套策略独立的 fillRate 和胜率趋势

---

### Phase 6：UI

**目标：** 新建 `/strategy` 页面，展示三套策略实时表现

**任务清单：**

- [ ] `app/strategy/page.tsx` 新建，含三 Tab
- [ ] 持仓列表、收益曲线、Alpha 展示
- [ ] Module Responsibility Check：确认归属
- [ ] 导航菜单新增「AI策略」入口

**验收：** 所有 12 模块 Module Responsibility PASS，`productionReady: true`

---

## 16. 暂不开发

本次建立 Trading Architecture Baseline 后，以下内容**明确暂不开发**：

| 内容 | 原因 | 计划时间 |
|------|------|----------|
| 真实资金对接（券商 API） | 系统定位为模拟，不涉及真实交易 | 无计划 |
| Day Trade 实时盘中执行 | 需要实时 tick 数据，成本过高 | 无计划 |
| 动态仓位调整（Kelly 公式） | 先验证等权仓位的有效性 | Phase 6 之后评估 |
| 多账户管理 | 单一模拟账户足够验证策略 | 无计划 |
| 移动端推送（持仓提醒） | 未集成推送服务 | 无计划 |
| 夏普比率 / 最大回撤曲线 | Phase 4 之后数据积累足够再实现 | Phase 4+ |
| 跨策略套利信号 | 架构设计为三策略独立，不支持跨策略信号 | 无计划 |
| 回测参数动态优化（网格搜索） | 避免过拟合，当前规则固化 | 无计划 |

**暂不开发不等于永不开发。** 以上内容如需推进，须先更新本文档的实施路线，再提交开发计划。

---

## 17. 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| v17.8.0 | 2026-06-28 | 首次建立 Trading Architecture Baseline（16节） | Claude |

*本文档随项目迭代持续维护。每次架构调整必须同步更新此表。*
