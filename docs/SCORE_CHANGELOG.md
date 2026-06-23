# TOHOSHOU AI — Score Formula Changelog

> **版本管理规则**
> - 每次评分/回测公式变更，必须在本文件新增一个版本节
> - 禁止修改已发布版本的历史记录
> - 变更内容必须对应新建 `docs/BACKTEST_RULES_V{N}.md`
> - 同步更新 `CHANGELOG.md` 主版本记录

---

## V1 — 2026-06-23

**Commit:** `37512e5`
**冻结状态:** ✅ FROZEN
**规则文档:** `docs/BACKTEST_RULES_V1.md`
**Build:** ✅ PASS · **Health:** ✅ CRITICAL=0

### 评分体系

#### RawScore（totalScore）— 五维固定权重

```
RawScore = technicalScore(30) + fundamentalScore(25) + moneyFlowScore(20)
         + newsSentimentScore(15) + globalTrendScore(10)
         = 0–100
```

#### AdaptiveScore — 动态风格权重

```
AdaptiveScore = Σ w[dimension] × (dimensionScore / maxDimension) × 100
```

| StockStyle | tech | fund | money | news | global |
|------------|------|------|-------|------|--------|
| VALUE_DEFENSIVE | 0.20 | 0.50 | 0.15 | 0.10 | 0.05 |
| GROWTH_MOMENTUM | 0.30 | 0.20 | 0.30 | 0.10 | 0.10 |
| QUALITY_COMPOUNDER | 0.25 | 0.35 | 0.20 | 0.10 | 0.10 |
| SPECULATIVE_MOMENTUM | 0.35 | 0.10 | 0.30 | 0.15 | 0.10 |
| CYCLICAL_EXPORTER | 0.25 | 0.25 | 0.20 | 0.10 | 0.20 |
| DOMESTIC_DEFENSIVE | 0.20 | 0.40 | 0.15 | 0.15 | 0.10 |

#### FinalScore — GPT 混合分

```
FinalScore = AdaptiveScore × 0.7 + GPTScore × 0.3
无GPT时: FinalScore = AdaptiveScore
```

#### RecommendationV2 — 双门槛评级

```
STRONG_BUY : AdaptiveScore ≥ 75  AND  percentileRank ≤ 5
BUY        : AdaptiveScore ≥ 70  AND  percentileRank ≤ 15
HOLD       : AdaptiveScore ≥ 60
WATCH      : AdaptiveScore ≥ 45
AVOID      : AdaptiveScore < 45
```

### TradingAction 触发条件（优先级顺序）

```
1. AVOID      adaptiveScore < 45 / stale / price = 0
2. SELL       adaptiveScore < 55 AND price < MA60 / 死叉+20d跌10% / RSI<35+20d跌15%
3. TAKE_PROFIT RSI≥95 / RSI≥90 / RSI≥85+20d>30% / RSI≥80+5d>20%
               / return60d>150%+RSI>80 / return20d>60%+RSI>75 / 5d>30%
4. BUY_NOW    STRONG_BUY或BUY + adaptive≥70 + opp≥65 + pct≤10
               + price>MA20 + RSI∈[45,75] + 5d≤20%
5. WAIT_PULLBACK BUY+5d>20% / RSI>75 / price>MA20×1.12 / 60d>100% / 近52wHigh
6. HOLD       默认（不满足以上任何条件）
```

| TradingAction | 建议仓位 | 说明 |
|--------------|---------|------|
| BUY_NOW (STRONG_BUY) | 60% | 强烈买入信号 |
| BUY_NOW (BUY) | 40% | 买入信号 |
| WAIT_PULLBACK | 20% | 等待回调入场 |
| HOLD | 30% | 持有观察 |
| TAKE_PROFIT | 20–30% | 止盈减仓 |
| SELL | 0% | 清仓 |
| AVOID | 0% | 回避 |

### GPT Safety Caps

| 条件 | FinalScore 上限 |
|------|----------------|
| 数据陈旧（stale > 2天） | ≤ 55 |
| return60d > 300% | ≤ 75 |
| RSI > 90 | ≤ 75 |

### 回测规则

```
EntryPrice  = 推荐日后第一个交易日开盘价（raw open）
ExitPrice   = adjClose ?? close
Return(N)   = (exitPrice - entryPrice) / entryPrice × 100 (%)
回测周期    = 7 / 30 / 90 交易日
组合规格    = TOP5 / TOP10 / TOP20 / TOP50 / TOP100 / ALL
WinRate     = count(return > 0) / count(filled) × 100 (%)
MaxGain     = bestReturn（组合内最优个股收益，非逐日净值）
MaxDrawdown = worstReturn（组合内最差个股收益，简化版）
```

---

## V2 — [待发布]

> 此节在下一次评分变更时填写。

**变更说明模板：**

```
Commit: [hash]
变更内容:
  - FinalScore: AdaptiveScore × [旧权重] → × [新权重]
  - GPTScore:   × [旧权重] → × [新权重]
  - 新增指标: [指标名] → [维度] + [权重]
  - 删除指标: [指标名]
  - 回测周期: 新增 14 日 / 修改 90 日阈值
  - StockStyle: 新增 [style] / 修改 [style] 权重
原因: [业务原因]
规则文档: docs/BACKTEST_RULES_V2.md
```

---

*本文件由 Claude Code 在 2026-06-23 会话中创建。*
*禁止修改历史版本节内容。*
