# P19-T1 · AI 战绩档案 — Hi-Fi Design / IA / API Contract

> 状态：**Hi-Fi 待批准**（Design First 第 2 级）· 前置：`docs/P19-IA_BRIEFING_TRACKRECORD.md`（IA Freeze 已批）
> 日期：2026-07-21 · 页面：`/decision-v2?tab=history`（导航标签拟改「AI 战绩档案」）
> **本阶段不写代码。**

---

## 0. 设计前的数据实测（决定设计形态，非假设）

生产只读探针（2026-07-21）：

| 线 | 真实数据量 | 对设计的约束 |
|---|---|---|
| **信号线** | TOP10 决策日 **25 天**（06-20~07-21）· TOP10 行 **250** | 可做切片，但需按 horizon 分别统计 |
| BacktestPositionResult 各持有期 | `1d 5756` · `3d 2190` · `5d 1146` · `7d 1146` · `10d 1145`；**无 20d/30d/60d/90d** | 持有期切片**只出这 5 档**，不画空档 |
| 现有 `/api/decision/history` | 7d 仅 join 到 **20 笔 / 2 决策日** | 说明短持有期样本远大于 7d → **必须允许切 horizon**，否则永远样本不足 |
| feat_* 覆盖 | `feat_stockStyle` 190/250 · `feat_sector` 190/250（76%） | 风格/行业切片可用，但**必须标覆盖率** |
| **实验线** | AiMission **2 期均 ACTIVE** · Trade 12（平仓 **0**）· Nav **2** | 现阶段只能显「进行中 + 目标进度」，归档战绩为空 |
| **账户线** | user_trades BUY 6 / **SELL 1** · 持仓 6 | 平仓仅 1 笔 → 全部指标必须标「样本不足」 |

**结论：三条线现在样本都很薄。页面必须在 N=1 时仍然诚实可用，在 N=1000 时仍然正确。** 这是本设计的第一约束，不是附加要求。

---

## 1. 页面结构（Hi-Fi · 桌面 1400px）

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║  ● 数据口径 · 截至 2026-07-21   信号线 25 决策日 · 实验线 2 期 · 账户线 1 笔平仓     ║  ← 口径条
╚══════════════════════════════════════════════════════════════════════════════════╝

① 三线总览（横向三卡 · 点击锚点滚到对应详情）
┌──────────────────────────┬──────────────────────────┬──────────────────────────┐
│ 信号线          [纸面信号] │ 实验线        [前向实验]  │ 账户线        [真实账户]  │
│                          │                          │                          │
│  命中率  50%             │  达成率  —               │  胜率  —                 │
│  ────────────────────    │  ────────────────────    │  ────────────────────    │
│  已结算   20 笔 / 2 决策日│  周期     2 期进行中      │  平仓     1 笔           │
│  平均收益 −1.6%          │  W29     +0.1% / +5%     │  平均收益 —              │
│  Alpha    −3.5%          │  M07     −0.1% / +20%    │  平均持有 —              │
│                          │                          │                          │
│  ⚠ 样本不足 (N=20<20)    │  ⏳ 进行中 · 无归档战绩   │  ⚠ 样本不足 (N=1<20)     │
└──────────────────────────┴──────────────────────────┴──────────────────────────┘
   ↑ 三张卡结构完全一致，便于横向对比；口径徽章常驻，防止被当成同一套数字

② 信号线详情 —— AI 推荐 TOP10 的前瞻表现
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 📶 信号线 · AI 推荐 TOP10          持有期  [1d] [3d] [5d] (7d) [10d]              │
│ ──────────────────────────────────────────────────────────────────────────────── │
│  已结算 20 笔 · 2 决策日 │ 命中率 50% │ 平均 −1.6% │ 中位 −0.9% │ Alpha −3.5%      │
│  最好 +20.9% 505A.T      │ 最差 −20.6% 9256.T                    ⚠ 样本不足      │
│ ──────────────────────────────────────────────────────────────────────────────── │
│  按决策日的 TOP10 平均收益                                                        │
│    +4% ┤     ▇                                                                   │
│     0% ┼──▇──┼──────────────────────────────────────────────────                 │
│    −4% ┤        ▇                                                                │
│        06-25  06-26                          （每根 = 一个决策日，灰色 = 未结算） │
│ ──────────────────────────────────────────────────────────────────────────────── │
│  切片  [AI 分档] [风格] [行业] [持有期]        ← 回答「AI 在什么情况下准」          │
│  ┌────────────┬──────┬────────┬──────────┬────────┐                              │
│  │ 分组        │ 样本 │ 命中率 │ 平均收益 │ Alpha  │                              │
│  ├────────────┼──────┼────────┼──────────┼────────┤                              │
│  │ AI 80+     │   3  │  —     │   —      │  —     │ ← N<20 整行灰显 + 不给结论    │
│  │ AI 70–79   │  14  │  —     │   —      │  —     │                              │
│  │ AI 60–69   │   3  │  —     │   —      │  —     │                              │
│  └────────────┴──────┴────────┴──────────┴────────┘                              │
│  覆盖率提示：风格/行业切片基于 190/250 行有 feat_* 快照（76%）                     │
│ ──────────────────────────────────────────────────────────────────────────────── │
│  决策记录（40 行，可滚动）                                                        │
│  日期 │ 股票 │ 推荐价 │ 收益 │ Alpha │ 命中 │ AI │ 风格 │ 行业        ← 行可点击   │
└──────────────────────────────────────────────────────────────────────────────────┘

③ 实验线详情 —— AI Mission Lab 归档战绩（★ 当前完全缺失的视图）
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 🧪 实验线 · Mission Lab                              已结束 0 期 · 进行中 2 期     │
│ ──────────────────────────────────────────────────────────────────────────────── │
│ 期次    状态     初始      当前/期末   收益/目标      达成   回撤   vsTOPIX  交易  │
│ ───────────────────────────────────────────────────────────────────────────────  │
│ W29    进行中   ¥10.0M    ¥9,990,906  +0.1% / +5%    2%    −0.1%   −1.5%    4    │
│        ▓▓░░░░░░░░░░░░░░░░░░░░ 剩 6 天                              → Mission Lab │
│ M07    进行中   ¥10.0M    ¥9,990,380  −0.1% / +20%   0%    −0.1%   −1.8%    8    │
│        ▓░░░░░░░░░░░░░░░░░░░░░ 剩 28 天                             → Mission Lab │
│ ──────────────────────────────────────────────────────────────────────────────── │
│ 归档聚合：已结束 0 期 → 达成率 / 平均收益 / 胜率 暂无（首期结束后自动出现）         │
└──────────────────────────────────────────────────────────────────────────────────┘

④ 账户线详情 —— 我的真实账户
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 💼 账户线 · 真实账户                    平仓 1 笔 · 持仓 6 只  → Decision Center   │
│ ──────────────────────────────────────────────────────────────────────────────── │
│  胜率 — │ 平均收益 — │ 平均持有 — 天 │ 盈亏比 — │ 跑赢 TOPIX — │ ⚠ 样本不足 N=1   │
│ ──────────────────────────────────────────────────────────────────────────────── │
│  平仓明细                                                                         │
│  日期 │ 股票 │ 股数 │ 卖出价 │ 收益% │ 实现盈亏 │ 持有 │ vsTOPIX │ 原因           │
└──────────────────────────────────────────────────────────────────────────────────┘

⑤ 三线对照（仅当 ≥2 条线样本充足时才渲染，否则整块隐藏）
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ⚖ 三线对照            ⚠ 口径不同，不可相加、不可取平均、不可合并为「总胜率」        │
│  线    │ 口径              │ 样本 │ 命中/胜率 │ 平均收益 │ Alpha │ 基准            │
│  信号线 │ 纸面·未扣成本      │ 20  │ 50%      │ −1.6%   │ −3.5% │ TOPIX          │
│  实验线 │ 前向·含滑点0.1%    │ 0   │ —        │ —       │ —     │ TOPIX/Nikkei   │
│  账户线 │ 真实·含手续费      │ 1   │ —        │ —       │ —     │ TOPIX/Nikkei   │
└──────────────────────────────────────────────────────────────────────────────────┘

⑥ 页脚：口径与样本规则说明（常驻，不可折叠）
```

**响应式**：≥1280px 三卡横排；768–1279px 三卡两列+一列；<768px 全部纵向堆叠，表格 `overflow-x-auto`。
**空态**：任一线 `available=false` → 该卡显「暂无数据」+ 一句「何时会有」（如「首期 Mission 结束后出现」）。

---

## 2. 模块说明

| # | 模块 | 唯一职责 | 不做什么 |
|---|---|---|---|
| ① | 三线总览 | 30 秒回答「AI 准不准」的三个层次 | 不做合并结论、不做总评分 |
| ② | 信号线详情 | AI **选股信号**的统计质量 + 在什么情况下准 | 不含成本/滑点，不等同实盘 |
| ③ | 实验线详情 | Mission Lab **每期**战绩与归档 | 不重复 Mission Lab 的当期持仓/待跟单 |
| ④ | 账户线详情 | 我的真实账户**平仓**战绩 | 不做持仓管理（归 Decision Center） |
| ⑤ | 三线对照 | 明示三者口径差异 | **绝不**给合并指标 |
| ⑥ | 页脚 | 口径与样本充分性规则 | — |

### 样本充分性规则（全页统一，硬规则）
- `N ≥ 20`：正常显示，允许结论性文案
- `0 < N < 20`：数值**灰显** + 徽章「样本不足 N=x」，**禁止**结论性文案（如「AI 在半导体最准」）
- `N = 0`：显「—」+ 一句何时会有
- 阈值 `MIN_SAMPLE = 20` 由 API 回传（`sampleRule.minSample`），前端不硬编码

---

## 3. 数据来源映射（UI 字段 → 表.字段 → 计算式）

### ② 信号线
| UI 字段 | 来源 | 计算 | 缺失行为 |
|---|---|---|---|
| 决策池 | `DailyRecommendation` where `gptRank ≤ 10` | 按 `date` 分组 | — |
| 每笔收益 | `BacktestPositionResult.returnPct` join `(recDate, symbol, horizon)` | **直接取，不重算** | 该笔标「进行中」 |
| 每笔 Alpha | `BacktestPositionResult.alphaVsTopix` | **直接取** | 显「—」 |
| 命中率 | 派生 | `count(returnPct>0) / settled` | N=0 →「—」 |
| 平均/中位收益 | 派生 | mean / median(returnPct) | 同上 |
| 最好/最差 | 派生 | max / min(returnPct) + symbol | 同上 |
| 持有期选项 | `BacktestPositionResult.horizon` distinct | 仅列**实际有数据**的档 | 无数据的档不渲染 |
| AI 分档切片 | `DailyRecommendation.feat_adaptiveScore` | 分桶 `<60 / 60–69 / 70–79 / 80+` | 归入「未知」桶 |
| 风格切片 | `feat_stockStyle` | 分组 | 覆盖率 190/250，页面标注 |
| 行业切片 | `feat_sector` | 分组 | 同上 |
| 股票名 | `StockScore.name / nameZh` | `getPrimaryName(lang)` | 回退 symbol |

⚠ **`totalRecommendations`(12274) 不再上首屏**，降为页脚脚注并标「含未结算」——这是 IA Freeze 定的诚实性红线。
⚠ 现有 history API 的「累计收益 +2.7%」来自 `StrategySnapshot`（三策略纸面组合），**与本线不同口径 → 本页不采用**。

### ③ 实验线
| UI 字段 | 来源 | 计算 |
|---|---|---|
| 期次/状态/目标 | `AiMission.periodLabel / status / targetPct / initialCapital / startDate / endDate` | 直取 |
| 当前/期末权益 | `AiMission.equityJpy` | 直取 |
| 收益% | `AiMissionNav.returnPct`（该期最后一条） | 直取，无则由 equity/initial 派生 |
| 达成率 | 派生 | `returnPct / targetPct`（下限 0） |
| 最大回撤 | `min(AiMissionNav.drawdownPct)` | 聚合 |
| vs TOPIX / Nikkei | `AiMissionNav.topixReturn / nikkeiReturn / alpha`（最后一条） | **直取，不重算** |
| 交易笔数 / 平仓笔数 | `AiMissionTrade` count / `realizedPnl != null` count | 聚合 |
| 胜率 | `AiMissionTrade.isWin` | `wins / closed`，closed=0 → 「—」 |
| 剩余天数 | 派生 | `endDate − today`（ACTIVE 才显） |

### ④ 账户线
| UI 字段 | 来源 | 计算 |
|---|---|---|
| 平仓笔数 | `UserTrade` where `side='SELL'` | count |
| 每笔收益% / 实现盈亏 / 持有天数 | `UserTrade.returnPct / realizedPnl / holdingDays` | **直取** |
| vs TOPIX | `UserTrade.benchTopixPct` | 直取；`returnPct − benchTopixPct` 为超额 |
| 胜率 | 派生 | `count(realizedPnl>0) / closed` |
| 盈亏比 | 派生 | `sum(win pnl) / |sum(loss pnl)|` |
| 跑赢 TOPIX 比例 | 派生 | `count(returnPct > benchTopixPct) / closed` |
| 当前持仓数 | `UserHolding` count | count |

**贯穿原则：页面不自己算任何一笔收益。** 收益/Alpha/持有天数一律取已落库结果，前端与 API 只做**分组统计**（均值/中位/计数/比率）。

---

## 4. API Contract — `GET /api/decision/track-record`

**只读 · 零写入 · 单聚合端点 · 无 N+1（约 8 条查询，无循环内查询）**

### Query
| 参数 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `horizon` | `1d\|3d\|5d\|7d\|10d` | `7d` | 信号线持有期；非法值回退默认 |
| `line` | `all\|signal\|experiment\|account` | `all` | 按需裁剪，减小载荷 |
| `limit` | 1–200 | `60` | 明细行数上限 |

### Response
```jsonc
{
  "asOf": "2026-07-21",
  "sampleRule": { "minSample": 20, "note": "样本 <20 不给结论" },

  "signal": {
    "available": true,
    "horizonsAvailable": [
      { "horizon": "1d", "settled": 120, "cohortDays": 12 },
      { "horizon": "7d", "settled": 20,  "cohortDays": 2  }
    ],
    "horizon": "7d",
    "summary": {
      "settled": 20, "cohortDays": 2, "pending": 230,
      "hitRate": 50.0, "avgReturn": -1.577, "medianReturn": -0.9,
      "alpha": -3.502,
      "best":  { "symbol": "505A.T", "name": "Geekly IT人才", "returnPct": 20.9 },
      "worst": { "symbol": "9256.T", "name": "サクシード",    "returnPct": -20.6 },
      "sufficient": false
    },
    "byCohort": [ { "date": "2026-06-26", "count": 10, "settled": 10, "avgReturn": -1.9, "hitRate": 40 } ],
    "slices": {
      "byScore":  [ { "key": "80+",   "label": "AI 80+",  "n": 3,  "hitRate": null, "avgReturn": null, "alpha": null, "sufficient": false } ],
      "byStyle":  [ { "key": "GROWTH_MOMENTUM", "n": 8, "...": "同上" } ],
      "bySector": [ { "key": "情報・通信業",      "n": 5, "...": "同上" } ],
      "byHorizon":[ { "key": "1d", "n": 120, "hitRate": 52.1, "avgReturn": 0.3, "alpha": 0.1, "sufficient": true } ]
    },
    "coverage": { "total": 250, "withStyle": 190, "withSector": 190 },
    "records": [
      { "date": "2026-06-26", "symbol": "6806.T", "name": "广濑电机",
        "buyPrice": 30250, "returnPct": -7.1, "alpha": -5.2, "win": false,
        "aiScore": 78, "style": "QUALITY_COMPOUNDER", "sector": "電気機器", "status": "SETTLED" }
    ],
    "footnote": { "totalRecommendations": 12274, "note": "历史推荐总量（含未结算），非本页统计口径" }
  },

  "experiment": {
    "available": true,
    "missions": [
      { "id": "cmr…", "missionType": "WEEKLY", "periodLabel": "2026-W29", "status": "ACTIVE",
        "startDate": "2026-07-19", "endDate": "2026-07-26", "daysLeft": 6,
        "initialCapital": 10000000, "equityJpy": 9990906,
        "returnPct": -0.09, "targetPct": 5, "achievedPct": 0,
        "maxDrawdownPct": -0.09, "topixReturn": 1.28, "nikkeiReturn": 1.18, "alpha": -1.37,
        "trades": 4, "closedTrades": 0, "winRate": null, "navDays": 1 }
    ],
    "aggregate": { "finished": 0, "achieved": 0, "achieveRate": null, "avgReturn": null, "avgAlpha": null, "sufficient": false }
  },

  "account": {
    "available": true,
    "summary": { "closed": 1, "openHoldings": 6, "winRate": null, "avgReturn": null,
                 "avgHoldingDays": null, "profitFactor": null, "beatTopixRate": null,
                 "realizedPnlTotal": 0, "sufficient": false },
    "records": [ { "tradeDate": "2026-07-xx", "symbol": "…", "name": "…", "shares": 100,
                   "price": 1234, "returnPct": 2.1, "realizedPnl": 2100, "holdingDays": 5,
                   "benchTopixPct": 0.8, "excessPct": 1.3, "reason": "TAKE_PROFIT" } ]
  },

  "comparison": {
    "renderable": false,
    "reason": "仅 1 条线样本充足",
    "rows": [ { "line": "signal", "basis": "纸面·未扣成本", "n": 20, "hitRate": 50, "avgReturn": -1.577, "alpha": -3.502, "benchmark": "TOPIX" } ],
    "note": "三条线口径不同，禁止相加/取平均/合并为总胜率"
  }
}
```

### 错误与降级
- 任一线查询失败 → 该线 `available:false` + `error` 字符串，**其余线照常返回**（失败隔离）
- 整体失败 → `500 { error }`，前端保留上一次数据并提示重试
- 缓存：`dynamic = "force-dynamic"`，不缓存（数据每日变化，量小）

### 性能预算
- 目标冷启动 < 500ms（对照：现有 `/api/decision/history` 与 `/api/decision/insights` 同量级）
- 查询清单：DailyRecommendation(1) · BacktestPositionResult(1) · StockScore names(1) · AiMission(1) · AiMissionNav(1) · AiMissionTrade groupBy(1) · UserTrade(1) · UserHolding count(1) = **8**

---

## 5. 跳转关系（只读引用，绝不复制能力）

```
                    ┌─────────────────────────┐
                    │   AI 战绩档案（本页）    │
                    │  唯一业绩验证入口        │
                    └───┬────────┬────────┬───┘
        信号线明细行点击 │        │        │ 账户线「查看持仓」
                        ▼        │        ▼
              StockDetailModal   │   Decision Center
              （复用现有组件，    │   ?tab=overview
                不新建报告）      │   （持仓/买卖/历史）
                                 │
                实验线某期点击 →  ▼
                        Mission Lab ?tab=portfolio&mission=2026-W29
                        （当期详情：待跟单/持仓/NAV/日志）

  反向：Decision Center 底部四栏（组合健康度/AI表现/AI超额/学习状态）
        → 保留「摘要卡」+「查看完整战绩 →」跳本页，**移除各自的深度统计**
        （消除同一指标三处各算各的）
```

| 出口 | 目标 | 传参 | 说明 |
|---|---|---|---|
| 信号线明细行 | `StockDetailModal` | symbol | 复用，不新建研究报告 |
| 实验线期次 | `/decision-v2?tab=portfolio&mission=<periodLabel>` | periodLabel | **Mission Lab 需支持读取该参数并切到对应期**（T1 范围内的最小改动，不动其布局） |
| 账户线 | `/decision-v2?tab=overview` | — | 持仓管理仍归 Decision Center |
| Decision Center → 本页 | `/decision-v2?tab=history` | — | 四栏改摘要 + 跳转 |

⚠ 反向去重（Decision Center 四栏瘦身）是本次**核心目的之一**，若只加新页不去重，等于第四处重复统计。

---

## 6. 边界说明

**不做（硬边界）**
- ❌ 不改 `prisma/schema.prisma` —— **零 Schema 变更**
- ❌ 不改交易 / 资金链路 / `user_*` / `ai_mission_*` 任何写入路径
- ❌ 不改评分（`compute-scores` / `lib/ai-score.ts` / adaptiveScore / 5 维 / 权重 / 阈值）
- ❌ 不改 Decision Engine / Mission Engine / Strategy / Cron 时刻表
- ❌ 不新建第二套业绩计算：收益/Alpha/持有天数一律取已落库字段
- ❌ 不重跑历史、不补算 BacktestPositionResult

**做**
- ✅ 新增 1 个只读聚合 API `GET /api/decision/track-record`（零写入）
- ✅ 重写 `components/decision/pages/DecisionHistoryV2.tsx`（页面级，不动共享组件）
- ✅ Decision Center 底部四栏改摘要 + 跳转（删重复统计，不删数据）
- ✅ Mission Lab 增加读取 `?mission=` 参数切期（最小改动，布局不动）
- ✅ i18n 双语 zh-CN / ja-JP，无混排
- ✅ 复用 `lib/decision/ds`（fmtJpy/fmtPct/upDownColor）、`lib/company-name`、`components/ui`

**风险与已知限制（写进页面，不藏）**
1. 三条线样本目前都很薄（20 / 0 / 1），页面首日大面积显「样本不足」——这是**正确行为**，不是缺陷
2. 7d 样本远小于 1d，默认 horizon=7d 会显得数据少 → 已通过 horizon 切换缓解，并在 UI 标注各档样本量
3. feat_* 覆盖 76%，风格/行业切片有偏 → 页面标注覆盖率
4. 实验线归档战绩要等首期 Mission 结束（W29 约 07-26）才有值

---

## 7. 验收标准（Hi-Fi 级）

- [ ] 三条线口径徽章常驻，任何位置都不出现合并后的「总胜率」
- [ ] 所有 `N < 20` 的统计灰显 + 标样本量，且无结论性文案
- [ ] `totalRecommendations` 不在首屏，仅作页脚脚注并标「含未结算」
- [ ] 页面不出现任何自行计算的单笔收益（全部取自落库字段）
- [ ] 每个出口都指向既有页面/组件，无新建重复能力
- [ ] Decision Center 底部四栏已瘦身为摘要 + 跳转
- [ ] zh/ja 各自 100% 纯净；1440 / 834 / 390 三档无横向溢出
