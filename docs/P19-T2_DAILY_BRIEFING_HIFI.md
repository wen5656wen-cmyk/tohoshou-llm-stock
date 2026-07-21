# P19-T2 · 今日简报 Daily Briefing — Hi-Fi Design / IA / API Contract

> 状态：**Hi-Fi 待批准**（Design First 第 2 级）· 前置：`docs/P19-IA_BRIEFING_TRACKRECORD.md`（IA Freeze 已批）
> 日期：2026-07-21 · 页面：`/decision-v2?tab=strategy`（导航标签拟改「今日简报」）
> **本阶段不写代码。**

**唯一问题**：今天系统运行到哪里、接下来要做什么、今天需要关注什么。

---

## 0. 设计前的实测（三项发现直接改变设计）

### 发现 ①：时间轴的数据源已存在，但**不可靠**
`/api/admin/mission-control` 的 `todayPipeline.steps` 已有 13 步带 `SUCCESS/WAITING/SKIPPED` + `lastRunAt`。但实测：

| 步骤 | mission-control 显示 | 真实落库 | 结论 |
|---|---|---|---|
| `compute_scores` 计算综合评分 | `SUCCESS · 2026-07-04T23:00Z` | `StockScore.computedAt = 2026-07-21 07:08 JST` | ❌ **陈旧 17 天** |
| `dataFreshness.stockScore` | `latestDate 2026-07-21 / 3018 只` | 同上 | ✅ 正确 |

根因：`todayPipeline` 的状态来自 `logs/pipeline-runs.jsonl`（既有 P2-003 / P1-002 技术债），而 `dataFreshness` 直接查表。**同一份 API 里两套判据自相矛盾。**

→ **设计决策**：本页时间轴**不复用 STEP_DEFS**，改用**直接 DB 证据**判定。这不是重复造轮子——它用的是更可靠的判据，且只覆盖 6 个决策链路节点。系统全部 13 步任务通过入口跳 `/admin/mission-control`，**不搬内容**。

### 发现 ②：需求示例中的「22:00 日终复盘」**不存在**
实际 cron 22:00 = `ニュース取得` + `日終メタ同期`；**持仓每日复盘在 15:15 收盘链路内**（P17-02A，不新增 cron）。已按真实 cron 修正节点表，不虚构节点。

### 发现 ③：今日事件多数日子是空的
| 事件源 | 实测（2026-07-21） | 处理 |
|---|---|---|
| TDnet `Disclosure` | 今日 **0** 条 · 近 48h **1** 条 | 窗口放宽为**近 48 小时**，否则常年空白 |
| 研究日历 `ResearchCalendarEvent` | 全表 3 条，最近 `2026-07-26` | 窗口取**未来 14 天**，今日无则显「本周无」 |
| 财报发表预定 | **无数据源**（`/fins/announcement` 未接） | 显式标「未接入」 |
| 除权息 | **无数据源**（`Dividend.exDivDate` 全表 0） | 显式标「未接入」 |

---

## 1. 页面结构（Hi-Fi · 桌面 1400px）

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║ ● 今日简报 · 2026-07-21（周二 · 交易日）           当前 12:39 JST · 上午盘 · 行情 🟢  ║
╚════════════════════════════════════════════════════════════════════════════════════╝

② 今日状态（四格 · 每格自带 As Of）
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ 市场状态          │ Mission 状态      │ AI 推荐状态       │ 系统健康          │
│ 震荡市 ⚠趋势降级  │ 双 Mission 进行中 │ Top10 已生成      │ CRITICAL 0        │
│ 风险 MEDIUM      │ W29 +0.1% ·6天    │ 建仓 3 只         │ WARNING 4         │
│ ──────────────   │ M07 −0.1% ·28天   │ ──────────────    │ ──────────────    │
│ as of 07-17 收盘  │ as of 12:39 实时  │ as of 07-17 15:15 │ as of 12:00       │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘

① 今日执行时间轴（★核心 · 真实 DB 证据）
┌────────────────────────────────────────────────────────────────────────────────────┐
│ 今日执行进度   ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  4/6 已产出                系统全部任务 →       │
│ ────────────────────────────────────────────────────────────────────────────────── │
│ ✓ 07:30  AI 评分                 已产出 07:08 JST · 3,018 只          [已完成]      │
│ ✓ 08:20  Mission 决策准备         已产出 · 12 笔决策                   [已完成]      │
│ ✓ 09:30  Mission 开盘成交         已产出 · 12 笔成交 / 0 跳过           [已完成]      │
│ ◉ 09:00–15:30 盘中行情刷新        进行中 · 最后报价 12:24 JST（源延迟15分）[进行中]   │
│ ○ 15:15  收盘决策                 未产出 · 约 2h36m 后                 [下一步] ←    │
│ ○ 15:15+ 持仓复盘 + NAV 快照      未产出                               [未开始]      │
│ ────────────────────────────────────────────────────────────────────────────────── │
│ ⓘ 状态基于「当日是否已产出对应数据」，非 cron 执行日志（后者实测与落库不一致）        │
└────────────────────────────────────────────────────────────────────────────────────┘

③ 今日事件                                    ④ 今日待办
┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│ 📰 TDnet 披露（近 48h）        1 条 │  │ 📌 Mission 待执行            0 笔  │
│   · 7203.T 決算短信  07-20 16:30   │  │    今日 12 笔已全部成交 ✓          │
│                                    │  │                        → Mission   │
│ 🗓 研究日历（未来 14 天）      1 条 │  │ ⚠ 持仓触及止盈/止损          0 只  │
│   · 07-26 AI半导体 版本复核        │  │    5 只持仓均在区间内              │
│                        → 深度研究  │  │                    → 决策总览      │
│                                    │  │                                    │
│ 📊 财报发表预定          ⊘ 未接入  │  │ 🔺 风险提醒                  1 项  │
│ 💰 除权除息日            ⊘ 未接入  │  │    · 长期趋势数据不足(量纲断裂)    │
│   需接 J-Quants /fins/announcement │  │                    → 决策总览      │
└────────────────────────────────────┘  └────────────────────────────────────┘

⑤ 页脚：数据口径与未接入项说明
```

**响应式**：≥1280 四格一行 + 事件/待办两列；768–1279 二格两行 + 单列；<768 全纵向。

---

## 2. 模块说明

| # | 模块 | 唯一职责 | 不做什么 |
|---|---|---|---|
| ① | 今日执行时间轴 | **今天系统跑到哪一步、下一步是什么** | 不做全量 13 步运维视图（跳 Mission Control） |
| ② | 今日状态 | 四个维度的当前态 + 各自 As Of | 不重算 regime / 不重算风险七项 / 不列候选 |
| ③ | 今日事件 | 今天有什么外部事件要注意 | 不做新闻流、不做逐股分析 |
| ④ | 今日待办 | 今天我要做的动作 | 不做下单、不做持仓管理（跳转） |

---

## 3. 时间轴节点定义（真实 cron ↔ DB 证据）

| 节点 | 真实 cron | 判定证据（只读） | 状态取值 |
|---|---|---|---|
| **07:30 AI 评分** | `30 7 * * *` compute-scores + rerank | `StockScore.computedAt ≥ 今日 00:00 JST` + 当日计数 | 已产出 / 未产出 |
| **08:20 Mission 决策准备** | `20 8 * * *` mission-lab-prepare | `AiMission.lastPrepareDate == today` + 当日 `AiMissionDecision` 计数 | 已产出 / 未产出 / 已跳过(非交易日或未启用) |
| **09:30 Mission 开盘成交** | `30 9 * * *` mission-lab-execute | `AiMission.lastExecuteDate == today` + 当日 `AiMissionTrade` 计数 + `SKIPPED` 决策数 | 已产出(N 成交/M 跳过) / 未产出 |
| **09:00–15:30 盘中行情** | 非 cron，前端轮询 | 复用 M1.1 `marketOpen` / `marketPriceAt` | 进行中 / 未开盘 / 已收盘 |
| **15:15 收盘决策** | `15 15 * * *` generate-closing-decision | `ClosingDecision.date == today` | 已产出 / 未产出（**下一步**） |
| **15:15+ 持仓复盘 + NAV 快照** | 同上 cron 链路内（不新增 schedule） | 当日 `TradeDecisionHistory(source=DAILY_REVIEW)` + `PortfolioNavSnapshot` + `AiMissionNav` | 已产出 / 未产出 |

### 状态语义（措辞必须精确）
- 用「**已产出 / 未产出**」，**不用**「已执行 / 未执行」——本页判据是**数据是否存在**，不是 cron 日志。
  实测 `PortfolioNavSnapshot` 今日已有 1 条而 15:15 未到（懒触发/其它路径写入），若写「cron 已执行」即为错误断言。
- 「下一步」= 时间上最近的一个未产出节点，高亮标注 + 倒计时。
- 非交易日：整条轴显「今日休市（原因）」，各节点标「已跳过」。

---

## 4. 数据来源映射（含 As Of）

| UI 字段 | 来源 | As Of 字段 |
|---|---|---|
| **② 市场状态** regime / 风险 / trendDegraded | `/api/admin/decision-center` 的 `market`（v18.46.0 已含 `regimeAsOf` / `trendDegraded`） | `market.regimeAsOf` |
| **② Mission 状态** | `AiMission` + 最新 `AiMissionNav`；实时权益复用 `/api/mission-lab/quotes` | 行情 `marketPriceAt`（含源延迟标注） |
| **② AI 推荐状态** verdict / 建仓只数 | `ClosingDecision.verdict` + `portfolio.length` | `ClosingDecision.date + decidedAtJst` |
| **② 系统健康** CRITICAL / WARNING 计数 | `/api/health`（既有） | `health.generatedAt` |
| **① 时间轴各节点** | 见 §3 | 每节点自带产出时间 |
| **③ TDnet** | `Disclosure` 近 48h，与持仓/候选 symbol 交叉，按 `importance` 排序 | `publishedAt` |
| **③ 研究日历** | `ResearchCalendarEvent` `status=SCHEDULED` 未来 14 天 | `scheduledAt` |
| **③ 财报/除权息** | **无源** | 固定显「未接入」+ 所需数据源 |
| **④ Mission 待执行** | `AiMissionDecision.status = READY_FOR_OPEN` | `decidedAt` |
| **④ TP/SL 提醒** | `/api/holdings` 的 `currentPrice` vs `target` / `stop`（**前端比价，不重算策略**） | 持仓价 as-of |
| **④ 风险提醒** | `/api/admin/decision-overview` 的 `risks[]` 中 level≥HIGH 项 + `trendDegraded` | 同 ② |

**贯穿原则**：不新增任何统计体系；所有数值直取已有 API/表；页面只做「存在性判定 + 比价 + 计数」。

---

## 5. API Contract — `GET /api/decision/briefing`

**只读 · 零写入 · 单聚合端点 · 无 N+1（约 10 条轻查询，均带索引）**

```jsonc
{
  "asOf": "2026-07-21T03:39:00.000Z",
  "jstDate": "2026-07-21",
  "weekday": "TUE",
  "tradingDay": true,
  "session": "MORNING",              // PRE|MORNING|LUNCH|AFTERNOON|CLOSED|HOLIDAY
  "nonTradingReason": null,

  "timeline": {
    "producedCount": 4, "totalCount": 6,
    "nextNodeKey": "closing_decision",
    "nodes": [
      { "key": "ai_score", "labelKey": "br.node.aiScore", "schedule": "07:30",
        "state": "PRODUCED",          // PRODUCED | RUNNING | PENDING | SKIPPED
        "producedAt": "2026-07-21T07:08:36+09:00",
        "detail": { "count": 3018 },
        "evidence": "StockScore.computedAt" },
      { "key": "mission_prepare", "schedule": "08:20", "state": "PRODUCED",
        "detail": { "decisions": 12 }, "evidence": "AiMission.lastPrepareDate" },
      { "key": "mission_execute", "schedule": "09:30", "state": "PRODUCED",
        "detail": { "trades": 12, "skipped": 0 }, "evidence": "AiMissionTrade" },
      { "key": "intraday_quotes", "schedule": "09:00-15:30", "state": "RUNNING",
        "detail": { "marketPriceAt": "...", "lagSec": 901 }, "evidence": "Yahoo quote" },
      { "key": "closing_decision", "schedule": "15:15", "state": "PENDING",
        "etaMinutes": 156, "evidence": "ClosingDecision.date" },
      { "key": "review_nav", "schedule": "15:15+", "state": "PENDING",
        "detail": { "reviews": 1, "portfolioNav": 1, "missionNav": 2 },
        "evidence": "TradeDecisionHistory / PortfolioNavSnapshot / AiMissionNav" }
    ],
    "note": "状态基于当日数据是否已产出，非 cron 执行日志"
  },

  "status": {
    "market":  { "regime": "SIDEWAYS", "riskLevel": "MEDIUM", "trendDegraded": true, "asOf": "2026-07-17" },
    "mission": { "active": 2, "rows": [{ "periodLabel": "2026-W29", "returnPct": 0.1, "targetPct": 5, "daysLeft": 6 }], "asOf": "2026-07-21T12:24+09:00" },
    "recommendation": { "verdict": "BUY_TODAY", "portfolioCount": 3, "asOf": "2026-07-17 15:15 JST" },
    "system": { "critical": 0, "warning": 4, "asOf": "2026-07-21T12:00+09:00" }
  },

  "events": {
    "tdnet":    { "available": true,  "windowHours": 48, "items": [{ "symbol": "7203.T", "name": "…", "title": "…", "category": "EARNINGS", "publishedAt": "…", "held": true }] },
    "research": { "available": true,  "windowDays": 14,  "items": [{ "title": "AI半导体 版本复核", "eventType": "REVIEW", "scheduledAt": "2026-07-26" }] },
    "earnings": { "available": false, "reason": "NOT_CONNECTED", "need": "J-Quants /fins/announcement" },
    "exDividend": { "available": false, "reason": "NOT_CONNECTED", "need": "Dividend.exDivDate（当前全表为空）" }
  },

  "todo": {
    "missionPending": { "count": 0, "note": "今日 12 笔已全部成交", "items": [] },
    "tpSlAlerts": { "count": 0, "items": [{ "symbol": "…", "kind": "NEAR_TP|HIT_TP|NEAR_SL|HIT_SL", "price": 0, "target": 0, "stop": 0 }] },
    "riskAlerts": { "count": 1, "items": [{ "key": "trend_degraded", "level": "INFO", "labelKey": "br.risk.trendDegraded" }] }
  }
}
```

**降级**：任一子块失败 → 该块 `available:false` + `error`，其余照常（失败隔离）。
**性能预算**：冷启动 < 400ms。

---

## 6. 跳转关系

| 出口 | 目标 | 说明 |
|---|---|---|
| 时间轴「系统全部任务 →」 | `/admin/mission-control` | 13 步运维视图，不搬内容 |
| Mission 待执行 → | `/decision-v2?tab=portfolio` | Mission Lab |
| TP/SL 提醒 → | `/decision-v2?tab=overview` | 持仓管理 |
| 风险提醒 → | `/decision-v2?tab=overview` | 风险面板 |
| 研究日历 → | `/deep-research/calendar` | 研究日历 |
| TDnet 条目 → | `StockDetailModal`（复用） | 逐股报告 |
| AI 推荐状态 → | `/decision-v2?tab=recommendations` | 股票中心 |

---

## 7. 边界

**不做**：❌ 零 Schema 变更 · ❌ 不改评分 · ❌ 不改交易与资金链路 · ❌ 不改 Decision/Mission Engine · ❌ 不改 Cron（**不新增任何 schedule**）· ❌ 不新增统计体系 · ❌ 不重算 regime/风险/收益 · ❌ 不复制 Mission Control 的运维视图

**做**：✅ 新增 1 个只读聚合 API `GET /api/decision/briefing`（零写入）· ✅ 重写 `DecisionStrategyV2.tsx` · ✅ 导航改名「今日简报」· ✅ i18n 双语

**删除的空壳**（当前页 60% 内容）：假交易时间轴 8 节点「计划待生成」· 重复第 3/4 次的 verdict（顶部执行条/收盘计划/AI 备注）· 与决策总览重复的风险七项 · 弱于行业分析的行业重点。
**保留并迁移**：今日战术 5 分类 → 评估后决定是否并入「今日待办」（唯一有独立价值的部分）。

**单独立项 P19-X**（不混入本次）：接 J-Quants `/fins/announcement` + 补 `Dividend.exDivDate` → 才能有真正的财报/除权日历。

---

## 8. 验收标准（Hi-Fi 级）

- [ ] 页面**不存在**任何「计划待生成」类空壳
- [ ] 时间轴每个节点显示真实产出时间与计数，措辞为「已产出/未产出」而非「已执行」
- [ ] 「下一步」节点唯一、高亮、带倒计时
- [ ] 每个模块显示各自 As Of，且**不同 As Of 不得混排为同一时间**
- [ ] 未接入项（财报/除权息）显式标注并说明所需数据源
- [ ] 所有出口指向既有页面，无新建重复能力
- [ ] 非交易日整轴显「休市 + 原因」，节点标「已跳过」
- [ ] zh/ja 各自 100% 纯净；1440 / 834 / 390 三档无横向溢出
