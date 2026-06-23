# TOHOSHOU AI — BACKTEST RULES V1

> **⛔ FROZEN — DO NOT MODIFY THIS FILE**
> 本文件记录 v10.4 版本评分与回测规则的完整快照，已永久冻结。
> 修改评分逻辑时，必须新增 `BACKTEST_RULES_V2.md`，禁止覆盖本文件。

---

## 一、系统版本

| 字段 | 值 |
|------|-----|
| **Version** | v10.4（Scoring: V7.7, Backtest: V10.1.1, TradingAction: V8.3 P2） |
| **Commit Hash** | `37512e5` |
| **Freeze Date** | 2026-06-23 |
| **Build Result** | ✅ PASS — `next build` compiled successfully in 1982ms, 29/29 pages |
| **Health Result** | ✅ CRITICAL=0 — `npm run health:data` Status: WARNING ✅17 ❌0 ⚠️4（全为非核心警告） |
| **主要评分文件** | `lib/ai-score.ts` · `scripts/compute-scores.ts` · `lib/trading-action.ts` |
| **回测文件** | `scripts/update-backtest.ts` · `scripts/rerank-top500.ts` |
| **Schema** | `prisma/schema.prisma`（StockScore · GPTScore · DailyRecommendation · BacktestResult） |

---

## 二、综合评分公式

### 2.1 RawScore（totalScore）—— 五维固定权重

```
RawScore (0-100) = technicalScore + fundamentalScore + moneyFlowScore
                 + newsSentimentScore + globalTrendScore
```

| 维度 | 最大分 | 说明 |
|------|--------|------|
| technicalScore | 30 | MA趋势 + MACD + RSI + 动量 |
| fundamentalScore | 25 | 营业利润率 + ROE + EPS + 自有资本比率 |
| moneyFlowScore | 20 | 机构流入 + 趋势稳定性 + 空压 |
| newsSentimentScore | 15 | 近30日新闻情绪比率 |
| globalTrendScore | 10 | 全球市场趋势（NASDAQ/VIX/USDJPY/Nikkei） |

---

### 2.2 AdaptiveScore —— 动态风格权重（主排名指标）

```
AdaptiveScore (0-100) =
  w.tech   × (technicalScore / 30)
+ w.fund   × (fundamentalScore / 25)
+ w.money  × (moneyFlowScore / 20)
+ w.news   × (newsSentimentScore / 15)
+ w.global × (globalTrendScore / 10)
```

乘以 100 后四舍五入，clamp 到 [0, 100]。

各 StockStyle 的权重 `w`：

| StockStyle | tech | fund | money | news | global |
|------------|------|------|-------|------|--------|
| VALUE_DEFENSIVE | 0.20 | 0.50 | 0.15 | 0.10 | 0.05 |
| GROWTH_MOMENTUM | 0.30 | 0.20 | 0.30 | 0.10 | 0.10 |
| QUALITY_COMPOUNDER | 0.25 | 0.35 | 0.20 | 0.10 | 0.10 |
| SPECULATIVE_MOMENTUM | 0.35 | 0.10 | 0.30 | 0.15 | 0.10 |
| CYCLICAL_EXPORTER | 0.25 | 0.25 | 0.20 | 0.10 | 0.20 |
| DOMESTIC_DEFENSIVE | 0.20 | 0.40 | 0.15 | 0.15 | 0.10 |

StockStyle 分类逻辑（`lib/ai-score.ts` `classifyStockStyle()`）：
- SMALL scale + (无盈利 OR 60日涨幅>15%) → **SPECULATIVE_MOMENTUM**（highRiskFlag=true）
- sector 含「電機・精密|自動車・輸送機|鉄鋼・非鉄|機械」→ **CYCLICAL_EXPORTER**
- opMargin > 15% AND ROE > 15% → **QUALITY_COMPOUNDER**
- sector 含「情報通信」→ **GROWTH_MOMENTUM**
- sector 含「食品|小売|建設・資材|不動産|医薬品|エネルギー|電力」→ **VALUE_DEFENSIVE**
- 其余 → **DOMESTIC_DEFENSIVE**

---

### 2.3 FinalScore —— GPT 混合分（排行榜主显示）

```
FinalScore = adaptiveScore × 0.7 + gptScore × 0.3
```

- 无 GPT 评分时：`FinalScore = adaptiveScore`（fallback）
- gptScore 来自 `GPTScore.gptScore`（`scripts/rerank-top500.ts`）
- 代码位置：`scripts/rerank-top500.ts` Step 3，comment: `V10: 70/30 blend`

---

### 2.4 RecommendationV2 —— 双门槛评级（`compute-scores.ts`）

```
STRONG_BUY : adaptiveScore ≥ 75  AND  percentileRank ≤ 5
BUY        : adaptiveScore ≥ 70  AND  percentileRank ≤ 15
HOLD       : adaptiveScore ≥ 60
WATCH      : adaptiveScore ≥ 45
AVOID      : adaptiveScore < 45
```

`percentileRank` = 1–100，**越小越优**（1 = 全市场前 1%）。

---

## 三、TechnicalScore 组成（满分 30）

代码：`lib/ai-score.ts` `calcAiScore()` 技术面段落

```
technicalScore = maTrendScore + macdScore + rsiScore + momentumScore
               ≤ 30
```

### 3.1 MA 趋势得分（maTrendScore，满分 12）

| MA趋势 | 分值 | 判断条件 |
|--------|------|---------|
| GOLDEN | 12 | MA5 > MA20 > MA60（黄金叉，多头趋势全面确立） |
| BULLISH | 9 | MA5 > MA20（短期上涨趋势延续） |
| NEUTRAL | 5 | 均线收敛，方向未明 |
| BEARISH | 2 | MA5 < MA20（短期走弱） |
| DEAD | 0 | MA5 < MA20 < MA60（死亡叉，空头压力沉重） |

MA 趋势由 `lib/indicators.ts` `calcIndicators()` 计算，需最少 20 条 DailyPrice（`MIN_PRICE_COUNT = 20`）。

### 3.2 MACD 得分（macdScore，满分 8）

| 信号 | 分值 | 条件 |
|------|------|------|
| BUY | 8 | MACD > Signal（macdSignalLabel = "BUY"） |
| SELL | 1 | MACD < Signal（macdSignalLabel = "SELL"） |
| 接近零轴 | 5 | \|macdHist\| < 0.5 |
| 无明确信号 | 3 | 其余情况 |

### 3.3 RSI 得分（rsiScore，满分 6）

| RSI 范围 | 分值 | 含义 |
|---------|------|------|
| null | 3 | 数据缺失，中性处理 |
| ≥ 80 | 1 | 严重超买，回调风险高 |
| 70–79 | 2 | 超买区域，追高须谨慎 |
| 60–69 | 5 | 强势区，动能良好 |
| 40–59 | 6 | **中性健康区间（最高分）** |
| 30–39 | 4 | 弱势区，存在反弹空间 |
| 20–29 | 2 | 超卖区，短期反弹可能 |
| < 20 | 1 | 极度超卖 |

### 3.4 动量得分（momentumScore，满分 4，基于 return20d）

| return20d | 分值 |
|-----------|------|
| null | 2 |
| > 15% | 4 |
| 8–15% | 3 |
| 2–8% | 2 |
| -3–2% | 1 |
| < -3% | 0 |

### 3.5 Volume / 52 周高低点 / 量比（不计入 TechnicalScore，用于 TradingAction）

这些指标在 `StockScore` 表中存储，在 `lib/trading-action.ts` 中用于触发 TradingAction 信号，**不参与 TechnicalScore 分值计算**：

| 字段 | 用途 |
|------|------|
| MA5 / MA20 / MA60 | TechnicalScore 的 maTrendScore + TradingAction 入场/止损价计算 |
| RSI14 | TechnicalScore 的 rsiScore + TradingAction RSI 超买保护层 |
| return5d | TechnicalScore 的 shortPressureScore（间接）+ TradingAction 暴涨保护 |
| return20d | TechnicalScore 的 momentumScore + TradingAction WAIT_PULLBACK 判断 |
| return60d | MoneyFlowScore 的 inflowScore（fallback）+ TradingAction 极端涨幅保护 |
| high52w / low52w | TradingAction：BUY_NOW 阻断条件、WAIT_PULLBACK 条件、target2 警告 |
| volume / volumeRatio | `RealtimeMarket` 表存储，Portfolio 仪表盘展示，**不进入 StockScore 评分** |
| turnoverRate | `RealtimeMarket` 表存储，仪表盘展示，**不进入 StockScore 评分** |

> 如需将 Volume/VolumeRatio 纳入评分，须在 `lib/ai-score.ts` 新增维度并在 BACKTEST_RULES_V2.md 记录变更。

---

## 四、FundamentalScore 组成（满分 25）

代码：`lib/ai-score.ts`

```
fundamentalScore = opMarginScore + roeScore + epsScore + equityRatioScore
                 ≤ 25
```

### 4.1 营业利润率得分（opMarginScore，满分 8）

| opMargin = operatingProfit / revenue × 100 | 分值 |
|--------------------------------------------|------|
| null | 4（中性） |
| revenue = 0 | 2 |
| > 30% | 8（卓越） |
| 20–30% | 7（优秀） |
| 15–20% | 6（良好） |
| 10–15% | 4（平均） |
| 5–10% | 2（偏低） |
| 0–5% | 1（薄利） |
| ≤ 0% | 0（亏损） |

### 4.2 ROE 得分（roeScore，满分 7）

| ROE = netProfit / equity × 100 | 分值 |
|-------------------------------|------|
| null / equity ≤ 0 | 3（中性） |
| > 25% | 7（卓越） |
| 18–25% | 6（优秀） |
| 12–18% | 5（良好） |
| 8–12% | 3（一般） |
| 3–8% | 1（偏低） |
| 0–3% | 0（极低） |
| < 0% | 0（净资产亏损） |

### 4.3 EPS 得分（epsScore，满分 5）

| 条件 | 分值 |
|------|------|
| null | 2（中性） |
| eps < 0 | 0（亏损） |
| eps = 0 | 1 |
| eps > 500 或 eps > 200 | 5 |
| eps > 100 | 4 |
| PER < 12（eps > 0） | 5（低估值） |
| PER 12–20 | 3（合理） |
| eps > 50 | 3 |
| 其他 | 2 |

> PER = latestClose / eps

### 4.4 自有资本比率得分（equityRatioScore，满分 5）

| equityRatio（0–1 小数） | 分值 |
|------------------------|------|
| null | 2（中性） |
| > 60% | 5（极为稳健） |
| 50–60% | 4（稳定） |
| 40–50% | 3（良好） |
| 30–40% | 2（一般） |
| 20–30% | 1（偏弱） |
| ≤ 20% | 0（高杠杆） |

> **注：PE/PB/营收增长率/净利润增长率/现金流等字段在 schema 中有存储，但 v10.4 评分公式中不直接参与 FundamentalScore 分项计算。仅通过 opMargin/ROE/EPS/equityRatio 四项体现。**

---

## 五、NewsScore（newsSentimentScore，满分 15）

### 5.1 新闻来源

| 来源 | 类型 | 表 |
|------|------|-----|
| Kabutan | 日本财经新闻 | `News` |
| TDnet（東証適時開示） | 上市公司公告 | `Disclosure` |

> Yahoo Finance Japan 未直接用于 newsScore，但 Yahoo Finance（`yahoo-finance2`）用于股价/全球市场数据同步。

### 5.2 计算公式

```
参数：positiveCount（正面新闻数）、negativeCount（负面新闻数）、totalCount
范围：近30日，relatedSymbolConfidence ≥ 70 的新闻

ratio = (positiveCount - negativeCount) / totalCount
newsSentimentScore = clamp(round(8 + ratio × 7), 0, 15)
```

| 分值区间 | 含义 |
|---------|------|
| 13–15 | 情绪强烈积极（正面新闻占主导） |
| 10–12 | 正面居多 |
| 8–9 | 中性 |
| 5–7 | 负面偏多，情绪偏谨慎 |
| 0–4 | 负面主导，明显偏空 |

- **无新闻时默认分值：8**（中性）
- **最大加分：+15**（纯正面新闻）
- **最大减分：0**（纯负面新闻）
- 函数位置：`lib/ai-score.ts` `calcNewsSentiment()`

### 5.3 Disclosure CatalystScore（独立字段，不进 NewsScore）

`catalystScore` (0–10) 由 `lib/ai-score.ts` `computeCatalystScore()` 单独计算，存于 `StockScore.catalystScore`，用于 OpportunityScore。

| Disclosure 类别 | 加减分 |
|----------------|--------|
| FORECAST_REVISION | +3 |
| BUYBACK | +2 |
| EARNINGS | +2 |
| DIVIDEND | +1 |
| EQUITY（增发） | -3 |
| MATERIAL（重大事项） | -2 |

基准值 = 5，clamp [0, 10]。

---

## 六、GPTScore

### 6.1 GPT 参与的分析维度（7 个子维度，各 0–100）

| 维度 | 字段 | 说明 |
|------|------|------|
| 商业质量 | businessQuality | 商业模式、竞争壁垒 |
| 成长性 | growthScore | 营收/利润增长趋势 |
| 行业趋势 | industryScore | 行业景气度与政策 |
| 护城河 | moatScore | 可持续竞争优势 |
| 估值 | valuationScore | 当前估值是否合理 |
| 催化剂 | catalystScore | 近期潜在正面事件 |
| 风险 | riskScore | 下行风险评估 |

GPT 还输出：摘要（summaryZh/summaryJa/summaryEn）、投资论点（thesisZh/Ja/En）、优势（strengths[]）、风险（risks[]）、催化剂（catalysts[]）、时间窗口（timeHorizon：1-3M/3-6M/6-12M）。

### 6.2 GPT 综合分计算

GPT prompt 中不含 adaptiveScore/percentileRank/recommendationV2/tradingAction（防锚定），只提供原始财务数据（PER/PBR/ROE/dividend/marketCap/52w range/opMargin/EPS 等）+ MA/RSI 描述性文字。

```
gptScore = GPT 返回的 0–100 整数
```

### 6.3 FinalScore 混合

```
FinalScore = adaptiveScore × 0.7 + gptScore × 0.3
```

### 6.4 GPT 安全上限（Safety Caps）

| 条件 | FinalScore 上限 |
|------|----------------|
| 数据陈旧（stale > 2天） | ≤ 55 |
| return60d > 300%（异常涨幅） | ≤ 75 |
| RSI > 90 | ≤ 75 |

- **GPT 最大贡献：** gptScore=100 → FinalScore 提升至多 `100 × 0.3 = +30` 分（在 adaptiveScore=70 时使 FinalScore=100）
- **GPT 最大拖累：** gptScore=0 → FinalScore 降至至多 `-0.3 × adaptiveScore`
- **缓存策略：** 24h hash 缓存，hash = SHA256(close|adaptive|return20d|return60d|percentile)[:16]

---

## 七、Trading Action（交易信号）

代码：`lib/trading-action.ts` `computeTradingAction()`

### 7.1 六种信号优先级（按触发顺序）

| 优先级 | 信号 | 建议仓位 | 进入条件（任一满足） |
|--------|------|---------|---------------------|
| 1 | **AVOID** | 0% | stale=true \| price≤0 \| adaptiveScore<45 \| recommendationV2=AVOID \| (MA20=null AND MA60=null) |
| 2 | **SELL** | 0% | (adaptiveScore<55 AND price<MA60) \| (MA20<MA60 AND return20d<-10%) \| (RSI<35 AND return20d<-15%) |
| 3 | **TAKE_PROFIT** | 20–30% | RSI≥95 \| (RSI≥90 AND 大涨) \| (RSI≥85 AND return20d>30%) \| (RSI≥80 AND return5d>20%) \| (return60d>150% AND RSI>80) \| (return20d>60% AND RSI>75) \| (price≥52wHigh×0.98 AND RSI>78) \| return5d>30% |
| 4 | **BUY_NOW** | 40–60% | 见 7.2 |
| 5 | **WAIT_PULLBACK** | 20% | 见 7.3 |
| 6 | **HOLD** | 30% | 默认（不满足上述任何条件） |

### 7.2 BUY_NOW 严格条件（全部必须满足）

```
recommendationV2 ∈ {STRONG_BUY, BUY}
AND adaptiveScore ≥ 70
AND opportunityScore ≥ 65
AND percentileRank ≤ 10
AND price > MA20
AND (MA20 ≥ MA60 OR return20d > 0)
AND RSI ∈ [45, 75]
AND (return5d ≤ 20% OR return5d = null)
AND suspicious = false
AND stale = false
```

- STRONG_BUY → positionSizePct = **60%**
- BUY → positionSizePct = **40%**

### 7.3 WAIT_PULLBACK 条件（任一满足）

```
(recommendationV2 ∈ {STRONG_BUY, BUY} AND return5d > 20%)
OR RSI > 75
OR price > MA20 × 1.12
OR return60d > 100%
OR (price ≥ 52wHigh × 0.97 AND return5d > 5%)
```

### 7.4 价格计算规则

| 信号 | entryLow | entryHigh | stopLoss | target1 | target2 |
|------|---------|----------|---------|---------|---------|
| BUY_NOW | price × 0.97 | price × 1.02 | min(MA60, price×0.92) | price × 1.15 | price × 1.30 |
| WAIT_PULLBACK | max(MA20, price×0.90) | price × 0.96 | MA60 (or price×0.88) | price × 1.15 | price × 1.30 |
| HOLD | — | — | MA60 | price × 1.15 | price × 1.30 |
| TAKE_PROFIT | — | — | price × 0.90 | price × 1.15 | price × 1.30 |

target2 > 52wHigh × 1.20 时追加警告。

### 7.5 风险等级（actionRiskLevel）

| 风险等级 | 条件 |
|---------|------|
| EXTREME | suspicious=true \| return60d>200% \| RSI>85 \| volatility>80 |
| HIGH | return60d>100% \| RSI>75 \| volatility>50 |
| MEDIUM | return60d>50% \| RSI>65 \| volatility>30 |
| LOW | 其余 |

---

## 八、股票排序规则

### 8.1 排行榜主排序（mode=top，`app/api/ai-scores/route.ts` line 168–176）

```typescript
merged.sort((a, b) => {
  const fd = b.finalScore - a.finalScore;          // 第一关键字：FinalScore DESC
  if (Math.abs(fd) > 0.01) return fd;
  const ad = b.adaptiveScore - a.adaptiveScore;    // 第二关键字：AdaptiveScore DESC
  if (Math.abs(ad) > 0.01) return ad;
  return (a.percentileRank ?? 100) - (b.percentileRank ?? 100);  // 第三关键字：percentileRank ASC
});
```

**实际三级排序：**

| 级别 | 字段 | 方向 |
|------|------|------|
| 1 | FinalScore | DESC |
| 2 | AdaptiveScore | DESC |
| 3 | percentileRank | ASC（越小越优） |

> 注：本版本不使用 RiskReward / VolumeRatio / MarketCap 作为排序关键字。

### 8.2 其他模式排序

| mode | 主排序字段 | 过滤条件 |
|------|-----------|---------|
| opportunity | opportunityScore DESC | highRiskFlag = false |
| high_risk | opportunityScore DESC | highRiskFlag = true |
| tech | adaptiveScore DESC | stockStyle ∈ {GROWTH_MOMENTUM, SPECULATIVE_MOMENTUM, QUALITY_COMPOUNDER} |
| value | adaptiveScore DESC | stockStyle ∈ {VALUE_DEFENSIVE, DOMESTIC_DEFENSIVE, CYCLICAL_EXPORTER} |

### 8.3 候选范围

- 最低 priceCount ≥ 20（MIN_PRICE_COUNT）
- mode=top：先取前 600 条（adaptiveScore DESC），re-sort 后截取前 N 条

---

## 九、回测规则（Backtest）

代码：`scripts/update-backtest.ts` v10.1.1

### 9.1 入场价格（Entry Price）

```
entryDate  = 推荐日期后第一个交易日（prices[0].date）
entryPrice = prices[0].open（当日开盘价，非收盘价，非调整价）
entryPriceType = "NEXT_OPEN"
```

**已知限制（设计如此，不视为 bug）：**
- entryPrice 使用原始开盘价（无 adjOpen）
- exitPrice 使用调整收盘价（adjClose）
- 股票分拆时两者口径不同步（低优先级 TODO）

### 9.2 出场价格（Exit Price）

```
exitDate7d  = entryDate 后第 8 个交易日（prices[7].date）
exitDate30d = entryDate 后第 31 个交易日（prices[30].date）
exitDate90d = entryDate 后第 91 个交易日（prices[90].date）
exitPrice   = adjClose ?? close（优先使用调整收盘价）
priceSource = "ADJUSTED"（有 adjClose）or "RAW"（只有 close）
```

### 9.3 收益率计算

```
Return(N) = round((exitPrice - entryPrice) / entryPrice × 10000) / 100  (%)
```

| 字段 | 含义 | 状态 |
|------|------|------|
| return7d | 7 交易日后收益率（%） | ✅ 已存储 |
| return30d | 30 交易日后收益率（%） | ✅ 已存储 |
| return90d | 90 交易日后收益率（%） | ✅ 已存储 |
| return14d | 14 交易日后收益率（%） | 🔵 未来预留（v10.4 schema 不含此字段，需迁移后启用） |

> **注：v10.4 回测周期为 7 / 30 / 90 交易日，不含 14 日。若需增加 14 日，须新增 schema 字段 `exitDate14d`/`price14d`/`return14d` 并在 BACKTEST_RULES_V2.md 记录。**

### 9.4 组合统计（BacktestResult）

**组合规格（portfolioSize）：** TOP5 / TOP10 / TOP20 / TOP50 / TOP100 / ALL（按 gptRank 排序截取）

| 统计字段 | 公式 |
|---------|------|
| winRate | winners / filled × 100（%） |
| avgReturn | 等权均值 = sum(returns) / count（%） |
| medianReturn | 中位数（偶数取均值，保留2位小数） |
| bestReturn | max(returns) |
| worstReturn | min(returns) |
| maxDrawdown | worstReturn（简化版：组合内最差个股收益） |
| excessVsNikkei | avgReturn − benchmarkNikkeiReturn |
| excessVsTopix | avgReturn − benchmarkTopixReturn |

```
winRate    = winners / filled × 100
winners    = count(return > 0)
losers     = count(return ≤ 0)
MaxGain    = bestReturn
MaxDrawdown = worstReturn（简化：组合最差个股，非逐日净值曲线）
```

### 9.5 基准收益（Benchmark）

```
benchmarkNikkeiReturn = (Nikkei225[exitDate] - Nikkei225[entryDate]) / Nikkei225[entryDate] × 100
benchmarkTopixReturn  = (TOPIX[exitDate] - TOPIX[entryDate]) / TOPIX[entryDate] × 100
数据来源：GlobalMarket 表，exitDate 后最近 7 日内的记录
```

### 9.6 数据错误分类（BacktestError.reason）

| 错误类型 | 触发条件 |
|---------|---------|
| NO_DAILY_PRICE | 推荐日后 5 天内无任何 DailyPrice 记录 |
| NO_ENTRY_PRICE | prices[0].open = 0 |
| NO_EXIT_PRICE(7d) | 推荐日后 > 15 天仍无 prices[7] |
| NO_EXIT_PRICE(30d) | 推荐日后 > 50 天仍无 prices[30] |
| NO_EXIT_PRICE(90d) | 推荐日后 > 135 天仍无 prices[90] |

---

## 十、Daily Recommendation Snapshot

每日保存字段（`DailyRecommendation` 表，`@@map("daily_recommendations")`）：

| 字段 | 类型 | 状态 | 说明 |
|------|------|------|------|
| date | Date | ✅ 已存储 | 推荐日期（JST） |
| symbol | String | ✅ 已存储 | 股票代码 |
| gptRank | Int | ✅ 已存储 | Top500 排名（1=最佳），等同于 `rank` |
| finalScore | Float | ✅ 已存储 | adaptiveScore×0.7 + gptScore×0.3 |
| adaptiveScore | Float | ✅ 已存储 | 动态权重规则分 |
| gptScore | Float | ✅ 已存储 | GPT 综合分（0–100） |
| gptRating | String? | ✅ 已存储 | STRONG_BUY/BUY/HOLD/WATCH/AVOID |
| buyPrice | Float? | ✅ 已存储 | 推荐时参考价（= `price`，StockScore.latestClose） |
| summaryZh | Text? | ✅ 已存储 | GPT 中文摘要 |
| entryDate | Date? | ✅ 已存储 | 实际入场日（推荐后第一个交易日） |
| entryPrice | Float? | ✅ 已存储 | 入场开盘价（NEXT_OPEN） |
| entryPriceType | String? | ✅ 已存储 | "NEXT_OPEN" |
| exitDate7d/30d/90d | Date? | ✅ 已存储 | 出场日（第 7/30/90 交易日） |
| priceSource | String? | ✅ 已存储 | "ADJUSTED" / "RAW" |
| price7d/30d/90d | Float? | ✅ 已存储 | 出场收盘价（= futureReturn 计算基础） |
| return7d | Float? | ✅ 已存储 | 7 交易日收益率（%= futureReturn7d） |
| return30d | Float? | ✅ 已存储 | 30 交易日收益率（%= futureReturn30d） |
| return90d | Float? | ✅ 已存储 | 90 交易日收益率 |
| filledAt | DateTime? | ✅ 已存储 | 最后一次价格填充时间 |
| createdAt | DateTime | ✅ 已存储 | 快照创建时间 |
| **name** | String | 🔵 未来预留 | 推荐时公司名称快照（现从 StockScore.name 查询） |
| **rawScore** | Float | 🔵 未来预留 | 固定权重总分快照（现从 StockScore 查询） |
| **stockStyle** | String | 🔵 未来预留 | 推荐时的 StockStyle 快照 |
| **tradingAction** | String | 🔵 未来预留 | 推荐时的 TradingAction 快照 |
| **technicalScore** | Int | 🔵 未来预留 | 技术面子分快照 |
| **fundamentalScore** | Int | 🔵 未来预留 | 基本面子分快照 |
| **return14d** | Float | 🔵 未来预留 | 14 交易日收益率（v10.4 schema 不含） |
| **maxGain** | Float | 🔵 未来预留 | 持有期内最大涨幅（需逐日扫描，现用 BacktestResult.bestReturn 近似） |
| **maxDrawdown** | Float | 🔵 未来预留 | 持有期内最大回撤（需逐日扫描，现用 BacktestResult.maxDrawdown 近似） |
| **win** | Boolean | 🔵 未来预留 | 胜负标志（可从 `return7d > 0` 实时派生，无需单独存储） |

**v10.4 派生计算方式（无对应 DB 字段时）：**
```
win(7d)  = return7d IS NOT NULL AND return7d > 0
maxGain  = BacktestResult.bestReturn（等权组合内最优个股，非单股最大涨幅）
maxDrawdown = BacktestResult.maxDrawdown（= worstReturn，简化版）
```

---

## 十一、代码定位

### 核心文件

| 功能 | 文件路径 | 核心函数 | 关键行 |
|------|---------|---------|-------|
| **五维评分** | `lib/ai-score.ts` | `calcAiScore()` | L495 |
| **MA/RSI/MACD 指标计算** | `lib/indicators.ts` | `calcIndicators()` | — |
| **动态风格分类** | `lib/ai-score.ts` | `classifyStockStyle()` | L43 |
| **AdaptiveScore 计算** | `lib/ai-score.ts` | `computeAdaptiveScore()` | L83 |
| **配息分计算** | `lib/ai-score.ts` | `calcDividendScore()` | L473 |
| **全量评分脚本** | `scripts/compute-scores.ts` | `main()` | L89 |
| **RecommendationV2 双门槛** | `scripts/compute-scores.ts` | `computeRecommendationV2()` | L27 |
| **OpportunityScore** | `scripts/compute-scores.ts` | `computeOpportunityScore()` | L55 |
| **Trading Action** | `lib/trading-action.ts` | `computeTradingAction()` | L111 |
| **价格计算（Entry/Stop/Target）** | `lib/trading-action.ts` | `buildPrices()` | L66 |
| **GPT Top500 Rerank** | `scripts/rerank-top500.ts` | `main()` | — |
| **FinalScore 混合** | `scripts/rerank-top500.ts` | Step 3 注释 | L6 |
| **GPT 安全上限** | `scripts/rerank-top500.ts` | `applySafetyCaps()` | L116 |
| **回测价格填充** | `scripts/update-backtest.ts` | `main()` → per-stock loop | L179 |
| **BacktestResult 聚合** | `scripts/update-backtest.ts` | portfolioSizes loop | L305 |
| **排行榜排序** | `app/api/ai-scores/route.ts` | `merged.sort()` | L168 |
| **StockScore 写入** | `scripts/compute-scores.ts` | `prisma.stockScore.upsert()` | Pass 1 末尾 |
| **Schema 定义** | `prisma/schema.prisma` | `model StockScore` | L224 |
| **Schema - GPTScore** | `prisma/schema.prisma` | `model GPTScore` | L519 |
| **Schema - DailyRecommendation** | `prisma/schema.prisma` | `model DailyRecommendation` | L568 |
| **Schema - BacktestResult** | `prisma/schema.prisma` | `model BacktestResult` | L604 |

### StockScore 关键字段说明

| DB 字段 | 类型 | 含义 |
|---------|------|------|
| symbol | String @id | 股票代码（主键） |
| adaptiveScore | Float? | 动态权重分（主排名指标） |
| percentileRank | Float? | 市场百分位（1=最优） |
| marketRank | Int? | 全市场绝对排名 |
| recommendationV2 | String? | 双门槛评级 |
| opportunityScore | Float? | 机会分（0–100） |
| tradingAction | String? | BUY_NOW/WAIT_PULLBACK/HOLD/TAKE_PROFIT/SELL/AVOID |
| entryLow/entryHigh | Float? | 建议入场区间 |
| stopLoss | Float? | 止损价 |
| target1/target2 | Float? | 目标价 |
| actionRiskLevel | String? | LOW/MEDIUM/HIGH/EXTREME |

---

## 附录：已知限制（v10.4 设计如此，不视为 bug）

1. **entryPrice vs exitPrice 口径不一致**：entry=raw open，exit=adjClose，股票分拆时有偏差
2. **maxDrawdown 简化版**：取组合内最差个股收益，非日度净值曲线最大回撤
3. **基准查询**：GlobalMarket 使用"最近 7 日内第一条"，非严格同交易日
4. **不含摩擦成本**：无手续费、滑点、税务
5. **SystemConfig TOCTOU**：`computeScores` 事务外查询 SystemConfig（低优先级）
6. **newsSentimentScore 来源**：仅 Kabutan + TDnet，不含 Yahoo Finance Japan
7. **WAIT_PULLBACK/HOLD stopLoss**：若 MA60=null 则 stopLoss=null（数据不足时）

---

*本文档由 Claude Code 在 2026-06-23 会话中自动生成并冻结。*
*后续版本变更记录于 `CHANGELOG.md`，规则更新请创建 `BACKTEST_RULES_V2.md`。*
