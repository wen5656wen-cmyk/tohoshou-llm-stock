# TOHOSHOU AI — Training Dataset Specification

> **目标模型：TOHOSHOU MODEL V1**
> 基于历史回测数据训练，预测日本股票未来收益率、胜率和风险等级。

---

## 一、数据来源

| 表名 | 用途 |
|------|------|
| `DailyRecommendation` | 每日推荐快照（Features + Labels） |
| `StockScore` | 推荐时的实时评分快照（补充 Features） |
| `GPTScore` | GPT 子维度分（补充 Features） |
| `BacktestResult` | 组合统计（验证集基准） |
| `GlobalMarket` | 宏观市场环境（上下文 Features） |
| `InstitutionalFlow` | 机构资金流向（资金面 Features） |

**数据时间范围：** 2026-06-20 起（首批 DailyRecommendation 生成日），每日 Pipeline 自动追加

---

## 二、Features（输入特征）

### 2.1 评分特征（核心信号）

| 特征名 | 来源字段 | 类型 | 范围 | 说明 |
|--------|---------|------|------|------|
| `rawScore` | `StockScore.totalScore` | Float | 0–100 | 五维固定权重总分 |
| `adaptiveScore` | `DailyRecommendation.adaptiveScore` | Float | 0–100 | 动态风格权重分（主排名） |
| `gptScore` | `DailyRecommendation.gptScore` | Float | 0–100 | GPT 综合评分 |
| `finalScore` | `DailyRecommendation.finalScore` | Float | 0–100 | adaptive×0.7 + gpt×0.3 |
| `gptRank` | `DailyRecommendation.gptRank` | Int | 1–500 | Top500 排名 |
| `percentileRank` | `StockScore.percentileRank` | Float | 1–100 | 市场分位（越低越优） |
| `opportunityScore` | `StockScore.opportunityScore` | Float | 0–100 | 机会分 |

### 2.2 StockStyle 分类特征

| 特征名 | 来源字段 | 类型 | 可选值 |
|--------|---------|------|--------|
| `stockStyle` | `StockScore.stockStyle` | String | VALUE_DEFENSIVE / GROWTH_MOMENTUM / QUALITY_COMPOUNDER / SPECULATIVE_MOMENTUM / CYCLICAL_EXPORTER / DOMESTIC_DEFENSIVE |
| `highRiskFlag` | `StockScore.highRiskFlag` | Boolean | true / false |
| `recommendationV2` | `StockScore.recommendationV2` | String | STRONG_BUY / BUY / HOLD / WATCH / AVOID |
| `tradingAction` | `StockScore.tradingAction` | String | BUY_NOW / WAIT_PULLBACK / HOLD / TAKE_PROFIT / SELL / AVOID |
| `actionRiskLevel` | `StockScore.actionRiskLevel` | String | LOW / MEDIUM / HIGH / EXTREME |

### 2.3 技术面特征（TechnicalScore 子维度）

| 特征名 | 来源字段 | 类型 | 范围 |
|--------|---------|------|------|
| `technicalScore` | `StockScore.technicalScore` | Int | 0–30 |
| `maTrend` | `StockScore.maTrend` | String | GOLDEN / BULLISH / NEUTRAL / BEARISH / DEAD |
| `macdSignalLabel` | `StockScore.macdSignalLabel` | String | BUY / SELL / NEUTRAL |
| `rsi14` | `StockScore.rsi14` | Float | 0–100 |
| `return5d` | `StockScore.return5d` | Float | % |
| `return20d` | `StockScore.return20d` | Float | % |
| `return60d` | `StockScore.return60d` | Float | % |

### 2.4 基本面特征（FundamentalScore 子维度）

| 特征名 | 来源字段 | 类型 | 范围 |
|--------|---------|------|------|
| `fundamentalScore` | `StockScore.fundamentalScore` | Int | 0–25 |
| `opMarginPct` | 计算：operatingProfit/revenue×100 | Float | % |
| `roe` | 计算：netProfit/equity×100 | Float | % |
| `eps` | `Financial.eps` | Float | ¥ |
| `equityRatio` | `Financial.equityRatio` | Float | 0–1 |

### 2.5 新闻情绪特征（NewsScore）

| 特征名 | 来源字段 | 类型 | 范围 |
|--------|---------|------|------|
| `newsSentimentScore` | `StockScore.newsSentimentScore` | Int | 0–15 |
| `catalystScore` | `StockScore.catalystScore` | Float | 0–10 |
| `positiveNewsCount` | 计算：News 表近30日 | Int | 0–N |
| `negativeNewsCount` | 计算：News 表近30日 | Int | 0–N |

### 2.6 资金面特征（MoneyFlowScore）

| 特征名 | 来源字段 | 类型 | 范围 |
|--------|---------|------|------|
| `moneyFlowScore` | `StockScore.moneyFlowScore` | Int | 0–20 |
| `moneyFlowSource` | `StockScore.moneyFlowSource` | String | jpx / v2_proxy / synthetic |
| `foreignersNet` | `InstitutionalFlow.netAmount`（foreigners） | Float | 億円 |
| `trustNet` | `InstitutionalFlow.netAmount`（trust） | Float | 億円 |

### 2.7 全球市场特征（GlobalTrendScore）

| 特征名 | 来源字段 | 类型 |
|--------|---------|------|
| `globalTrendScore` | `StockScore.globalTrendScore` | Int 0–10 |
| `nasdaqChange` | `GlobalMarket.nasdaqChange` | Float % |
| `vix` | `GlobalMarket.vix` | Float |
| `usdjpy` | `GlobalMarket.usdjpy` | Float |
| `nikkeiChange` | `GlobalMarket.nikkeiChange` | Float % |

### 2.8 GPT 子维度特征

| 特征名 | 来源字段 | 类型 | 范围 |
|--------|---------|------|------|
| `gpt_businessQuality` | `GPTScore.businessQuality` | Int | 0–100 |
| `gpt_growthScore` | `GPTScore.growthScore` | Int | 0–100 |
| `gpt_industryScore` | `GPTScore.industryScore` | Int | 0–100 |
| `gpt_moatScore` | `GPTScore.moatScore` | Int | 0–100 |
| `gpt_valuationScore` | `GPTScore.valuationScore` | Int | 0–100 |
| `gpt_catalystScore` | `GPTScore.catalystScore` | Int | 0–100 |
| `gpt_riskScore` | `GPTScore.riskScore` | Int | 0–100 |
| `gpt_confidence` | `GPTScore.confidence` | String | LOW / MEDIUM / HIGH |
| `gpt_action` | `GPTScore.action` | String | POSITIVE / NEUTRAL / NEGATIVE |
| `gpt_timeHorizon` | `GPTScore.timeHorizon` | String | 1-3M / 3-6M / 6-12M |

---

## 三、Labels（预测目标）

### 3.1 主要回归目标

| 目标名 | 来源字段 | 类型 | 范围 | 说明 |
|--------|---------|------|------|------|
| `futureReturn7d` | `DailyRecommendation.return7d` | Float | % | 7 交易日后收益率 |
| `futureReturn14d` | — | Float | % | 🔵 未来预留（schema 不含） |
| `futureReturn30d` | `DailyRecommendation.return30d` | Float | % | 30 交易日后收益率 |
| `futureReturn90d` | `DailyRecommendation.return90d` | Float | % | 90 交易日后收益率 |

### 3.2 衍生分类目标

| 目标名 | 派生公式 | 类型 | 说明 |
|--------|---------|------|------|
| `win7d` | `return7d > 0` | Boolean | 7日胜负 |
| `win30d` | `return30d > 0` | Boolean | 30日胜负 |
| `win90d` | `return90d > 0` | Boolean | 90日胜负 |
| `winRate_cohort` | `BacktestResult.winRate` | Float % | 同批推荐组合胜率 |
| `maxGain_cohort` | `BacktestResult.bestReturn` | Float % | 组合内最高收益（简化） |
| `maxDrawdown_cohort` | `BacktestResult.maxDrawdown` | Float % | 组合内最大回撤（简化） |
| `excessVsNikkei` | `BacktestResult.excessVsNikkei` | Float % | 超额收益 vs 日经225 |

### 3.3 风险分类目标

| 目标名 | 派生方式 | 类型 | 说明 |
|--------|---------|------|------|
| `riskBucket` | return7d 分桶：<-10% / -10~0% / 0~10% / >10% | String | 4档风险/收益桶 |
| `extremeLoss` | `return30d < -20%` | Boolean | 极端亏损标志 |
| `bigWin` | `return30d > 30%` | Boolean | 大涨标志 |

---

## 四、数据分割规则

```
训练集：最早批次到最近 90 交易日之前的所有 cohort（确保 return90d 已填充）
验证集：最近 90 交易日到最近 30 交易日之间（return90d 未知，可用 return7d/30d）
测试集：最近 30 交易日（仅 return7d 可用）
```

> 严格按时间切割，禁止随机 shuffle（防止未来信息泄露）

---

## 五、TOHOSHOU MODEL V1 设计

### 5.1 训练目标

| 子模型 | 预测目标 | 架构建议 |
|--------|---------|---------|
| **ReturnRegressor** | futureReturn7d / 30d | LightGBM Regressor |
| **WinClassifier** | win7d / win30d | LightGBM Classifier |
| **RiskClassifier** | riskBucket / extremeLoss | LightGBM Classifier |
| **RankScorer** | 组合内相对排名 | LambdaRank / XGBoost Ranking |

### 5.2 核心假设

- **时序一致性**：特征值为推荐当日快照，label 为推荐日后第 N 交易日收盘价
- **无未来信息泄露**：所有特征仅使用推荐日 T 时刻前已知数据
- **等权组合**：BacktestResult 以等权组合为基准，模型需能提升 TOP10 组合 WinRate

### 5.3 基准线（v10.4 规则引擎）

| 指标 | 规则引擎基准 | 模型目标 |
|------|------------|---------|
| TOP10 WinRate (7d) | 待积累 | > 基准 +5pp |
| TOP10 AvgReturn (30d) | 待积累 | > 日经225 基准 +3pp |
| maxDrawdown | 待积累 | < 基准 |

> 基准数据需在 2026-07-15 后（≥10个 cohort）方可计算，首次训练建议在 2026-09-01 之后（≥50个 cohort）。

### 5.4 Feature Importance 预期排序（假设）

基于评分逻辑设计，预期最重要特征：

```
1. percentileRank       # 市场相对位置
2. adaptiveScore        # 综合实力
3. opportunityScore     # 机会强度
4. rsi14                # 技术面超买/超卖
5. gpt_moatScore        # 护城河（GPT评估）
6. return20d            # 近期动量
7. moneyFlowScore       # 资金流向
8. gpt_growthScore      # 成长性（GPT评估）
9. fundamentalScore     # 基本面
10. tradingAction_enc   # 交易信号（编码）
```

---

## 六、数据质量规则

### 6.1 过滤条件（训练时排除）

```
排除：entryPrice = null（未填充入场价）
排除：entryPrice = 0（数据质量问题）
排除：BacktestError.reason = "NO_DAILY_PRICE"
排除：StockScore.priceCount < 20（数据不足）
排除：return60d > 500%（极端异常值，可能数据错误）
排除：adaptiveScore = null
```

### 6.2 异常值处理

```
return7d / return30d / return90d：clip 到 [-80%, +500%]（保留极端大涨，截断除牌情况）
rsi14：clip 到 [0, 100]
adaptiveScore / finalScore / gptScore：clip 到 [0, 100]
foreignersNet：clip 到 [-10000, 10000]（億円）
```

### 6.3 缺失值处理

| 特征 | 缺失处理策略 |
|------|------------|
| gptScore | 以 adaptiveScore 填充（fallback 逻辑一致） |
| foreignersNet | 以 0 填充（无机构数据等同中性） |
| rsi14 | 以 50 填充（中性值） |
| fundamentalScore | 以全市场中位数填充 |
| newsSentimentScore | 以 8 填充（无新闻默认中性） |

---

## 七、模型版本管理

| 版本 | 训练数据范围 | 特征集 | 状态 |
|------|------------|--------|------|
| TOHOSHOU-MODEL-V1 | 2026-06-20 起，≥50 cohort | V1 Features（本文档） | 🔵 待训练 |
| TOHOSHOU-MODEL-V2 | 待定 | V2 Features（含 return14d） | 🔵 未规划 |

---

## 八、数据导出 SQL 模板

```sql
-- 训练集导出：已知 return30d 的推荐记录
SELECT
  dr.date,
  dr.symbol,
  dr.gpt_rank,
  dr.final_score,
  dr.adaptive_score,
  dr.gpt_score,
  dr.return_7d   AS future_return_7d,
  dr.return_30d  AS future_return_30d,
  dr.return_90d  AS future_return_90d,
  -- 实时评分快照（推荐日当天 StockScore）
  ss.technical_score,
  ss.fundamental_score,
  ss.money_flow_score,
  ss.news_sentiment_score,
  ss.global_trend_score,
  ss.adaptive_score    AS ss_adaptive_score,
  ss.opportunity_score,
  ss.percentile_rank,
  ss.stock_style,
  ss.trading_action,
  ss.action_risk_level,
  ss.rsi14,
  ss.return_20d,
  ss.return_60d,
  ss.high_risk_flag,
  -- GPT 子维度
  gs.business_quality,
  gs.growth_score,
  gs.industry_score,
  gs.moat_score,
  gs.valuation_score,
  gs.catalyst_score  AS gpt_catalyst_score,
  gs.risk_score      AS gpt_risk_score,
  gs.confidence,
  gs.action          AS gpt_action
FROM daily_recommendations dr
LEFT JOIN stock_score ss ON ss.symbol = dr.symbol
LEFT JOIN gpt_scores  gs ON gs.symbol = dr.symbol
WHERE dr.entry_price IS NOT NULL
  AND dr.entry_price != 0
  AND dr.return_30d IS NOT NULL
ORDER BY dr.date ASC, dr.gpt_rank ASC;
```

---

*本文件由 Claude Code 在 2026-06-23 会话中创建。*
*数据积累达到 ≥50 cohort 后开始首次训练（预计 2026-09-01 之后）。*
