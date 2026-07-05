# JPX Trading Calendar（日本交易日引擎）— P5-T3

## 目的

让 TOHOSHOU AI **只在真实 JPX（東証）交易日**运行高成本的评分 / GPT rerank / 策略生成 /
Paper Broker 任务。周末和日本祝日不再浪费 GPT 配额、算力，也不再产生重复/无意义的推荐。

> 背景：2026-07-05（周日）系统仍完整跑了一轮 GPT rerank，叠加 OpenAI 配额问题当天烧掉大量额度，
> 且在非交易日生成了当日推荐。本引擎从源头避免这类浪费。

---

## 什么是交易日

某日在**日本时间（Asia/Tokyo）**下满足以下全部条件即为交易日：

1. 不是周六、周日
2. 不是日本法定祝日
3. 不在年末年初休市区间（12/31、1/1、1/2、1/3）
4. 不在预留特别休市日列表内（临时公告休市）

判断实现：`lib/trading-calendar/jpx.ts`

```ts
import { isJPXTradingDay, getJPXTradingDayStatus } from "@/lib/trading-calendar/jpx";
// 或脚本内相对路径：import ... from "../lib/trading-calendar/jpx";

isJPXTradingDay(new Date());              // → true | false
getJPXTradingDayStatus(new Date());
// → { isTradingDay: boolean, reason: string, date: "YYYY-MM-DD" }
```

`reason` 取值：`Trading Day` / `Weekend` / `Japan Holiday` / `Year-end Market Close` / `Special Market Close`

**时区安全**：函数内部一律用 `Intl.DateTimeFormat(timeZone: "Asia/Tokyo")` 取 JST 日历日 +
用 `Date.UTC` 推算星期，因此无论服务器 TZ（UTC 或 JST）结果都正确。

---

## 周末如何处理

- 周六 / 周日：`isTradingDay=false`，`reason=Weekend`。
- 被守卫的 Cron 任务直接跳过并打印 `[JPX_CALENDAR] SKIP_NON_TRADING_DAY ... reason=Weekend`。
- 部分策略 slot（16:35/16:40/16:45/17:00/17:15）的 cron 表达式本就是 `* * 1-5`（周一至周五），
  周末不会触发；guard 额外覆盖**祝日**这一维度。

## 日本祝日如何处理

- 祝日来自 `lib/trading-calendar/jpx.ts` 的固定表 `JP_HOLIDAYS`（离线，不联网）。
- 命中祝日：`reason=Japan Holiday`。
- 年末年初（12/31、1/1–1/3）由**规则**统一处理，跨年份自动生效，**不需要**列入祝日表；
  `reason=Year-end Market Close`。
- 临时休市（系统维护 / 国葬 / 灾害等）追加到 `SPECIAL_CLOSURES`；`reason=Special Market Close`。

**优先级**：年末年初 → 周末 → 特别休市 → 祝日。
（例：憲法記念日若落在周日，`reason` 记为 `Weekend`。）

---

## 哪些 Cron 会跳过（非交易日）

在 `scripts/cron-scheduler.ts` 中，以下 7 个 slot 在执行前调用 `isTradingDayGuard(...)`，
非交易日 `return` 跳过：

| Cron 时间 (JST) | slot / guard task | 实际覆盖的任务 |
|---|---|---|
| 06:00 | `sync-all-prices` | 株価同期 + Phase2 全链：compute-scores → rerank-top500 → create-portfolio-snapshot → update-ai-signal-stats → update-backtest → generate-learning-report → data-health-guard |
| 07:30 | `scoring-pipeline` | fallback 评分流水线 + day-strategy(T+1) + generate-strategy-recommendations + paper-broker |
| 16:35 | `swing-strategy` | Swing Trade Strategy |
| 16:40 | `long-strategy` | Long Trade Strategy |
| 16:45 | `strategy-backtest` | Strategy Backtest Engine |
| 17:00 | `strategy-learning` | Strategy Learning Engine |
| 17:15 | `strategy-daily-validation` | Strategy Daily Validation |

> 注：重型评分链并非由 cron 直接逐个调用，而是内嵌在 `sync-all-prices.ts` 的 Phase2。
> 因此守卫 06:00 这一个 slot 即可覆盖 compute-scores / rerank / portfolio / signal-stats /
> update-backtest / learning / data-health-guard 全部。
>
> `day-strategy.ts` 具备断点续跑（自动补齐未结算的历史交易日），跳过某个非交易日不会丢结算——
> 下一个交易日会自动补上。

## 哪些 Cron 继续运行（不跳过）

以下任务**不**调用 guard，周末 / 祝日照常运行：

- `sync-news`（07:00 / 12:00 / 18:00 / 22:00）— 新闻全天候
- `fetch-global-market`（05:30）— 全球市场（美股/VIX/USDJPY 周末也有隔夜/前值）
- Weekly Report（土 17:30）/ Monthly Report（月末 18:00）
- Deployment log / health check API（`/api/health/status` 只读展示，随时可查）
- `fetch-tdnet` / `fetch-short-selling` / `sync-stock-meta` / `fetch-dividend-history` /
  J-Quants 机构资金流向 — 均维持原调度（元数据/披露类，未纳入本次守卫范围）

### data-health-guard 与非交易日

`data-health-guard` 内嵌在 06:00 的 Phase2 中，随评分链一起在**非交易日被跳过**（不运行即不会把
「价格 stale」误报为 CRITICAL）。健康状态 API 会展示上一交易日的结果（陈旧但不误报），下一交易日
自动刷新。

> 之所以采用「随流水线一起跳过」而非「修改 data-health-guard 的严重级别判定」，是为了严守
> P5-T3 最高原则：**不修改任何评分/策略/健康检查逻辑**。若未来需要「周末仍跑一次交易日感知的
> 健康检查」，应给 data-health-guard 增加 trading-day-aware 模式（独立任务，届时再评估）。

---

## 日志格式

统一前缀 `[JPX_CALENDAR]`，便于 grep 审计：

```
# 非交易日跳过
[JPX_CALENDAR] SKIP_NON_TRADING_DAY task=sync-all-prices date=2026-07-05 reason=Weekend

# 交易日正常
[JPX_CALENDAR] TRADING_DAY task=sync-all-prices date=2026-07-06
```

（实际行会带 cron logger 前缀 `[时间 JST] [INFO]`，`[JPX_CALENDAR] ...` 为其后缀，可直接 grep。）

查看：`grep JPX_CALENDAR /opt/tohoshou/logs/cron-scheduler.log`

---

## 如何更新祝日列表

祝日表位于 `lib/trading-calendar/jpx.ts` 的 `JP_HOLIDAYS`（键为 `YYYY-MM-DD`）。

1. **每年**从官方 JPX 日历核对并补充下一年度：
   https://www.jpx.co.jp/corporate/calendar/
2. 需要手工维护的是**移动祝日**：Happy Monday（成人の日/海の日/敬老の日/スポーツの日）、
   春分の日 / 秋分の日（天文测定，官方公告）、以及振替休日（补假）。
3. **年末年初（12/31、1/1–1/3）无需维护**——由规则自动覆盖任意年份。
4. 临时休市：追加到 `SPECIAL_CLOSURES`（`YYYY-MM-DD` 字符串数组）。
5. 改完运行 `npm run test:jpx-calendar` 回归。

> 当前表已核验 **2026**（权威）；**2027** 为前瞻值，启用前请对照官方日历复核春分/秋分/振替休日。

---

## 为什么不要周末跑 AI 评分

1. **无新数据**：非交易日没有新的 K 线 / 收盘价，重算评分只是用旧数据重复覆盖，无增量价值。
2. **烧 GPT 配额**：GPT rerank Top500 每天约 500 次调用；周末+祝日一年约 ~120 天，等于白烧
   ~1/3 的调用量与费用（2026-07-05 周日那轮正是典型浪费）。
3. **避免误导**：在非交易日生成「当日推荐 / 当日快照」会让 DailyRecommendation、Portfolio、
   健康检查出现非交易日日期，污染回测与统计口径。
4. **降低误报**：非交易日跑 data-health-guard 容易把「价格未更新」误判为 CRITICAL。

---

## 测试

```bash
npm run test:jpx-calendar
```

覆盖：普通工作日 / 周六 / 周日 / 元旦 / 成人之日 / 黄金周（宪法记念日周日、儿童节、振替休日）/
春分 / 年末 12/31 / 年初 1/1–1/3 / 黄金周中的非祝日工作日（5/1）。全部 14 例应 PASS。

---

## 第四部分（未来计划，本次未实现）— Sunday Pre-Market Preparation

未来可在**周日晚**（如周日 22:00 JST）追加一个准备任务：刷新新闻 + 全球市场数据，
为周一开盘预热。属于「保留任务在周末运行」的扩展，不涉及评分/策略，留待后续独立任务实现。
