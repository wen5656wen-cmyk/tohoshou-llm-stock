# P20 · 今日事件补全设计（财报发表预定 / 除权除息）

> 状态：**设计稿 · 待批准**　｜　方案：**A3**　｜　日期：2026-07-21
> 本文档为实现前的唯一依据。未经批准不得执行 migration，不得写实现代码。

---

## 0. 实测事实基线（生产采样，非估计）

| 事实 | 数值 | 来源 |
|---|---|---|
| `quote().earningsTimestampStart` 有值率 | 93%（279/300） | Top300 抽样 |
| ↳ 其中日期**未过期** | **23%**（68/300） | 同上 |
| ↳ 其中日期**已过期** | 70%（211/300） | 同上，实例 `9343.T→2025-05-09` |
| `quote().earningsTimestamp` 有值率 | 24%（71/300），与 Start 同日 60/71 | 同上 |
| `quote().exDividendDate` 有值率 | **0%**（0/200） | 批量接口不返回该字段 |
| `quoteSummary().calendarEvents.exDividendDate` 有值率 | **88%**（35/40） | Top40 抽样 |
| 批量 quote 吞吐 | 50 只/批，200 只 1167ms → 全市场 ≈ **18 秒** | 实测 |
| 逐只 quoteSummary 吞吐 | 108ms/只 → 全市场 ≈ **5.4 分钟**（串行，未含限速） | 实测 |
| `Dividend` 表现状 | 32,321 行，`exDivDate` 非空 **0**，`payDate` 非空 **0** | 生产 DB |
| J-Quants `/v1/fins/announcement` | **HTTP 410**（v1 全线下线） | 生产实测 |
| J-Quants `/v2/fins/announcement` | **HTTP 403 endpoint does not exist** | 生产实测 |
| J-Quants `/v2/fins/dividend` | **HTTP 403 not available on your subscription** | 生产实测 |

**单位口径（强制）**：`earningsTimestampStart / earningsTimestampEnd / earningsTimestamp` 在 yahoo-finance2 v3 中**已是 `Date` 对象**。
**禁止 `× 1000`**，禁止 `new Date(v * 1000)`。违反会得到 `+058661-11` 这类越界日期（首次探测已实证）。

---

## 1. 数据范围（方案 A3）

| 项 | 范围 | 理由 |
|---|---|---|
| **除权除息** | **全市场**（≈3018 只） | 覆盖率 88%，成本可接受，字段已存在 |
| **财报发表预定** | **当前持仓 ∪ 今日 TOP10**（≈20 只） | 全市场未过期覆盖率仅 23%，全量扫描既昂贵又误导；今日事件本就服务于持仓与今日关注标的 |

**页面必须标注范围，禁止暗示全市场覆盖。**

---

## 2. Schema 设计（仅新增财报预定所需，最小变更）

### 2.1 新增模型 `EarningsSchedule`

```prisma
model EarningsSchedule {
  id           Int      @id @default(autoincrement())
  symbol       String                        // "7203.T"，与全站 symbol 口径一致
  earningsDate DateTime @db.Date             // JST 日历日；仅存「未过期」日期
  confirmed    Boolean  @default(false)      // earningsTimestamp 与 Start 同日 → true
  source       String   @default("yahoo")    // 数据源标识，便于未来换源
  fetchedAt    DateTime @default(now())      // 本行最后一次成功刷新的时间

  @@unique([symbol])                         // 一只股票只保留「下一个」财报日
  @@index([earningsDate])
}
```

| 字段 | 类型 | Nullable | 说明 |
|---|---|---|---|
| `id` | Int | 否 | 自增主键 |
| `symbol` | String | 否 | 唯一键 |
| `earningsDate` | Date | **否** | 行存在 ⇔ 有有效未过期日期；无日期则**不建行**（而非存 null） |
| `confirmed` | Boolean | 否，默认 false | 交叉校验结果 |
| `source` | String | 否，默认 "yahoo" | |
| `fetchedAt` | DateTime | 否 | 刷新时间，用于断点续跑与陈旧判定 |

- **唯一性**：`@@unique([symbol])` —— 语义是「该股下一个财报日」，天然去重。
- **索引**：`@@index([earningsDate])` —— 支撑「今日/近 N 日财报」查询。
- **不建 null 行**：无有效日期 = 无行。避免「有行但无值」的第三种状态。

### 2.2 明确不改的部分

- ❌ 不改 `Dividend` 表结构（`exDivDate` / `payDate` 字段本已存在，直接写入）
- ❌ 不改 `StockScore`、评分、推荐、交易、Mission 任何表
- ❌ 不新增第二套日期工具（日历日一律 `getJPXTradingDayStatus(d).date`）

### 2.3 过期数据清理规则

| 规则 | 内容 |
|---|---|
| 清理条件 | `earningsDate < 今日 JST 日历日` |
| 执行时机 | 每次同步任务开始时先清理，再写入 |
| 方式 | 物理删除（`deleteMany`）——该表为纯派生缓存，无业务外键，无需软删 |
| 陈旧行 | `fetchedAt < 今日 - 14 天` 且未在本轮命中 → 一并删除（防止退市/换源后残留） |

### 2.4 Migration 与回滚

| 项 | 内容 |
|---|---|
| Migration | `npx prisma db push --accept-data-loss` + `npx prisma generate`（本仓库无 migration 历史，沿用既有方式） |
| 影响面 | **纯新增表**，不修改任何既有列，对现有查询零影响 |
| 回滚 | `DROP TABLE "EarningsSchedule";` + 回滚代码 commit。该表 100% 可从 Yahoo 重建，**无数据丢失风险** |
| 前置 | 本节经你批准后才执行；执行前后各跑一次 `npm run health:data` |

---

## 3. 数据规则

### 3.1 财报发表预定（写入 `EarningsSchedule`）

入库前必须**同时**满足，任一不满足即丢弃（不入库、不展示）：

1. `earningsTimestampStart` 存在且 `instanceof Date` 为真
2. `Number.isNaN(date.getTime()) === false`
3. 该日期的 **JST 日历日 ≥ 今日 JST 日历日**（未过期；当日财报保留）
4. 主字段固定为 `earningsTimestampStart`
5. `earningsTimestamp` 仅作**交叉校验**：与 Start 同日 → `confirmed = true`；不同日或缺失 → `confirmed = false`（**仍入库**，但页面区分标注）
6. **禁止 `× 1000`**

### 3.2 除权除息（写入既有 `Dividend.exDivDate`）

- 取数：`quoteSummary(symbol, { modules: ["calendarEvents"] }).calendarEvents.exDividendDate`
- **行映射规则（关键）**：`Dividend` 唯一键是 `[symbol, year, quarter]`，而 Yahoo 只给**一个**即将到来的除权日。规则：
  - 定位 `symbol` + `year = exDivDate 的 JST 年份` + `quarter = null` 的既有行 → **UPDATE 其 `exDivDate`**
  - **找不到匹配行 → 跳过并计入 `unmapped`，绝不新建 Dividend 行**（`dividend` 为必填 Float，凭空造行等于伪造派息数据）
  - 绝不写入「年份不匹配」的行（会把 2026 除权日写进 2025 行）
- `payDate` 本轮**不接**（Yahoo `dividendDate` 实测覆盖 0%），保持为空，页面不展示。

### 3.3 限速 / 重试 / 失败隔离 / 断点续跑

| 机制 | 设计 |
|---|---|
| 并发 | 最大 **4** 并发，请求间最小间隔 **150ms**（≈26 req/s 上限） |
| 重试 | 每只最多 **2 次**重试，退避 1s → 3s；仅对网络错误 / 429 / 5xx 重试，4xx（除 429）不重试 |
| 失败隔离 | 每只独立 `try/catch`，**单股失败绝不中断全市场任务**，失败计入 `failed[]` |
| 断点续跑 | 任务开始记录 `SyncJob`；已在**本 JST 日历日**成功刷新（`fetchedAt >= 今日 00:00 JST`）的 symbol 直接跳过 → 中断后重跑自动续 |
| 全局超时 | 20 分钟；超时则正常收尾（写入已完成部分 + 标记 `PARTIAL`），不回滚已写入数据 |
| 失败率闸门 | 失败率 > 30% → 任务标 `FAILED`，**不清理**旧数据（避免把好数据删掉换成空） |

---

## 4. API Contract（`GET /api/decision/briefing`）

仅替换 `events.earnings` / `events.exDividend` 两个节点，其余字段不动。
**继续遵守「API 禁返展示文案」——只回结构化标识，文案全部由前端 i18n 渲染。**

### 4.1 `events.earnings`

```jsonc
{
  "available": true,
  "scope": "HOLDINGS_AND_TOP10",        // 枚举，前端翻译为范围说明
  "scopeCount": 18,                      // 本次实际查询的标的数
  "coverage": { "queried": 18, "withDate": 5, "confirmed": 3 },
  "items": [
    { "symbol": "7203.T", "date": "2026-08-04", "confirmed": true, "held": true, "inTop10": false }
  ],
  "asOf": "2026-07-21T22:45:00.000Z",   // EarningsSchedule.fetchedAt 最大值
  "state": "OK"                          // OK | NO_CONFIRMED_DATA
}
```

- `items` 仅含 **JST 今日及未来**的日期，按日期升序。
- 当 `withDate === 0` → `state: "NO_CONFIRMED_DATA"`，`items: []`。
  **前端此时显示「当前数据源未确认」，禁止显示「今日 0 家」。**

### 4.2 `events.exDividend`

```jsonc
{
  "available": true,
  "scope": "MARKET_WIDE",
  "windowDays": 14,
  "coverage": { "universe": 3018, "withExDiv": 2640, "pct": 87.5, "unmapped": 112 },
  "items": [
    { "symbol": "7203.T", "date": "2026-09-29", "held": false }
  ],
  "asOf": "2026-07-20T14:00:00.000Z",
  "state": "OK"                          // OK | NO_CONFIRMED_DATA
}
```

- `items` = 未来 `windowDays` 天内的除权日，按日期升序。
- `coverage.pct` **必须回传并展示** —— 全市场但非 100%，不得暗示完整。
- `withExDiv === 0` → `state: "NO_CONFIRMED_DATA"`。

### 4.3 移除

`needKey` 字段在两节点接入后移除（`br.need.announcement` / `br.need.exDivDate` 两条 i18n 一并删除）。

---

## 5. Hi-Fi 页面设计（今日简报 · 今日事件模块）

现有四行结构不变（TDnet / 研究日历 / 财报发表预定 / 除权除息），仅后两行由「⊘ 未接入」变为真实内容。

```
┌─ 📅 今日事件 ─────────────────────────── 数据截至 2026-07-21 22:45 JST ─┐
│                                                                          │
│  📢 TDnet 披露                                    近 48 小时 · 6 条      │
│     …（不变）                                                            │
│                                                                          │
│  🔬 研究日历                                      近 14 天 · 3 项        │
│     …（不变）                                                            │
│                                                                          │
│  📊 财报发表预定            范围：持仓 + 今日 TOP10（18 只）· 已确认 3 只 │
│     ┌────────────────────────────────────────────────────────────┐      │
│     │ 08-04  7203.T  トヨタ自動車          ✓已确认    〔持仓〕    │      │
│     │ 08-11  4194.T  ビジョナル            ⚠待确认    〔TOP10〕   │      │
│     └────────────────────────────────────────────────────────────┘      │
│     ℹ️ 来源 Yahoo Finance；仅覆盖持仓与今日关注标的，非全市场            │
│                                                                          │
│  💰 除权除息日                      全市场 · 未来 14 天 · 覆盖率 87.5%   │
│     ┌────────────────────────────────────────────────────────────┐      │
│     │ 07-29  7203.T  トヨタ自動車                     〔持仓〕    │      │
│     │ 07-30  9343.T  アイビス                                     │      │
│     └────────────────────────────────────────────────────────────┘      │
│     ℹ️ 来源 Yahoo Finance；全市场覆盖率 87.5%，非 100%                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**空态（`state: NO_CONFIRMED_DATA`）**：

```
│  📊 财报发表预定            范围：持仓 + 今日 TOP10（18 只）             │
│     ⊘ 当前数据源未确认                                                   │
│     ℹ️ 来源 Yahoo Finance；该范围内暂无确认日期，不代表全市场无财报      │
```

- ✅ 「当前数据源未确认」
- ❌ 严禁「今日 0 家」「全市场无事件」
- 持仓标记复用现有 `held` 徽章样式；`confirmed=false` 用 ⚠ 而非隐藏（诚实展示不确定性）。

---

## 6. 文案修正（i18n · zh-CN + ja-JP 双语同步）

| 键 | 处置 |
|---|---|
| `br.need.announcement` | **删除**（内容为已失效的 J-Quants v1 端点） |
| `br.need.exDivDate` | **删除** |
| `br.foot.notConnected` | **改写**：不再提任何 J-Quants 端点 |
| `br.evt.earnings.scope` | 新增：「范围：持仓 + 今日 TOP10（{n} 只）」 |
| `br.evt.earnings.srcNote` | 新增：「来源 Yahoo Finance；仅覆盖持仓与今日关注标的，非全市场」 |
| `br.evt.earnings.unconfirmed` | 新增：「当前数据源未确认」 |
| `br.evt.exdiv.scope` | 新增：「全市场 · 未来 {d} 天 · 覆盖率 {pct}%」 |
| `br.evt.exdiv.srcNote` | 新增：「来源 Yahoo Finance；全市场覆盖率非 100%」 |
| `br.evt.confirmed` / `br.evt.pending` | 新增：「已确认」/「待确认」 |

**禁止**在任何新文案中出现 `/fins/announcement`、`/fins/dividend` 或其它已废弃端点。

---

## 7. Cron / 同步策略

| 任务 | 脚本 | 频率 | 槽位（JST） | 成本 |
|---|---|---|---|---|
| 财报预定（持仓+TOP10） | `sync-earnings-schedule.ts` | 每日 | **07:45**（`45 7 * * *`，在 07:30 评分之后、08:00 早报之前，确保 TOP10 已产出） | 1 批 quote，< 2 秒 |
| 除权息全市场 | `sync-ex-dividend.ts` | 每周 | **周日 23:00**（`0 23 * * 0`，避开所有交易日任务） | ≈ 8–10 分钟（含限速） |
| 除权息增量（持仓+TOP10） | 同脚本 `--scope=focus` | 每日 | **07:50**（`50 7 * * *`） | ≈ 20 只 × 108ms ≈ 3 秒 |

已核对：`45 7` / `50 7` / `0 23 * * 0` 三个槽位当前**均未占用**。

> ⚠️ **新增 `cron.schedule()` 必须 `pm2 restart tohoshou-cron`**（仅 restart web 不会重新加载注册 —— 这是 06-29 漏跑一整天的根因）。
> ⚠️ 重启 cron **禁止在 07:30–14:00 JST** 窗口执行（会杀掉运行中的 rerank-top500 管线）。
> → 部署窗口定为 **当日 15:30 之后 或 次日 07:00 之前**。

---

## 8. 验收标准

| # | 项 | 判据 |
|---|---|---|
| 1 | Schema | `EarningsSchedule` 建表成功；`Dividend` 结构 **diff 为空** |
| 2 | 无过期数据 | `SELECT count(*) FROM "EarningsSchedule" WHERE "earningsDate" < 今日JST` = **0** |
| 3 | 单位正确 | 全表 `earningsDate` 落在 今日 ~ 今日+400 天 内，**无 `+0586xx` 类越界值** |
| 4 | 除权息写入 | `Dividend.exDivDate` 非空行数 **> 2000**；`unmapped` 数量已记录并披露 |
| 5 | 行映射正确 | 抽查 20 行：`year(exDivDate) === Dividend.year`，**100% 一致** |
| 6 | 失败隔离 | 人为让 1 只失败，任务仍跑完，`failed[]` 含该只，其余照常写入 |
| 7 | 断点续跑 | 中途 kill 后重跑，已完成 symbol 被跳过，总耗时显著下降 |
| 8 | API 契约 | `events.earnings` / `events.exDividend` 结构符合 §4；**不含任何展示文案** |
| 9 | 空态文案 | 构造 `withDate=0`，页面显示「当前数据源未确认」，**无「今日 0 家」** |
| 10 | 范围标注 | 财报行明确标「持仓 + 今日 TOP10」；除权息行明确标覆盖率 % |
| 11 | 废弃端点 | `grep -rn "fins/announcement" lib/ app/ components/` = **0 命中** |
| 12 | 双语 | zh-CN / ja-JP 整页 100% 同语言，无英文 as-of 泄漏 |
| 13 | 回归 | Build PASS / TS 0 Error / Health CRITICAL=0 / 7 页 Smoke Test 全 PASS |
| 14 | Cron | `pm2 list` 显示 cron 已重启；次日 07:45 / 07:50 实际产出可查 |

---

## 9. 风险与回滚

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | 财报覆盖率仅 ~23%，用户误读为「全市场无财报」 | **高** | 强制范围标注 + 空态用「未确认」而非「0 家」（§5、§6） |
| R2 | 陈旧日期入库（Yahoo 大量返回去年日期） | **高** | §3.1 规则 3 强制「≥ 今日 JST」过滤；验收项 2/3 卡死 |
| R3 | `× 1000` 单位错误 | 中 | §0 明令禁止 + 验收项 3 值域检查 |
| R4 | 除权息行映射错年份，污染既有 32,321 行 | **高** | 严格年份匹配，不匹配即跳过；**绝不新建 Dividend 行**；验收项 5 抽查 |
| R5 | 全市场任务拖垮生产 | 中 | 并发 4 + 150ms 间隔 + 20 分钟超时；周日 23:00 低峰执行 |
| R6 | Yahoo 限流/封禁 | 中 | 限速 + 退避重试；失败率 > 30% 即停并保留旧数据 |
| R7 | 忘记重启 cron 导致任务不生效 | 中 | §7 明确写入部署清单；验收项 14 |
| R8 | Yahoo 字段/结构变更 | 低 | `source` 字段预留换源能力；该表纯派生，可整表重建 |

### 回滚方案（分层，任一层可独立执行）

| 层 | 操作 | 影响 |
|---|---|---|
| L1 前端 | 回滚页面 commit | 恢复「⊘ 未接入」显示，数据保留 |
| L2 API | 回滚 briefing route commit | 两节点回到 `available:false` |
| L3 Cron | 删除新增 `cron.schedule` + `pm2 restart tohoshou-cron` | 停止同步，已有数据保留 |
| L4 数据 | `UPDATE "Dividend" SET "exDivDate"=NULL WHERE "source"='yahoo-exdiv';` | 需在写入时打 source 标记方可精确回滚（**已纳入实现要求**） |
| L5 Schema | `DROP TABLE "EarningsSchedule";` | 无业务依赖，零损失 |

> ⚠️ L4 的前提：写入 `exDivDate` 时必须能识别「本次写入的行」。因不得改 `Dividend` 结构，采用**写入前快照**：把被更新行的 `(id, 原 exDivDate)` 存入 `reports/exdiv-backup-<ts>.json`，回滚时按快照还原。此文件不进 git。

---

## 10. 边界声明

本设计**仅**涉及：`EarningsSchedule` 新表、`Dividend.exDivDate` 值填充、`briefing` API 两节点、今日简报事件模块 UI、相关 i18n、两个新同步脚本、三条 cron。

**不改**：评分逻辑 / 推荐算法 / 交易与资金链路 / Decision Engine / Mission Engine / Deep Research / 实时行情 / 其它任何 API 与页面 / `Dividend` 及任何既有表的结构。

---

**设计到此结束，等待批准。批准后方可进入实现。**
