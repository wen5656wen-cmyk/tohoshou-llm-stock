# 隔夜强势确认策略 Overnight Momentum Shadow · 只读审计报告

> 状态：**只读审计（未开发、未改任何生产代码/表）**
> 日期：2026-07-22
> 结论级别：**PROMOTION_BLOCKED**（按 spec 字面标准，当前数据地基无法达成实盘 Shadow 门槛）
> 建议路径：**A · 收盘 EOD 前向 Shadow**（已选定，页面另走完整 Design First）

---

## 0. 一句话结论

Spec 本身写得很专业（闸门与评分分离、缺数据一律 NO_SIGNAL、成本三档压测、禁未来函数、Shadow 隔离），
但**按它自己的标准在当前系统上落不了地**——卡在两个「地基级」缺失，均非写代码可解决，属**数据采购/基建**问题：

1. **没有实时盘中行情** → 整套「15:23 尾盘实时确认」前提不成立。
2. **没有可回测的历史深度** → 整套「5 年、无幸存者偏差」验证门槛做不出来。

**软件架构侧几乎全部可复用**（Mission Lab 引擎、Shadow 隔离范式、交易日历、cron、健康面板、鉴权、i18n），
真正需新建的很少。问题不是「能不能写」，而是「拿什么数据喂它」。

---

## 1. 审计方法

对 `/Users/wenzhiyong/llm-stock`（Next.js 16 + Prisma + Postgres，92 个 model）做只读审计，
分五路并行取证，全部附 `文件:行号` 证据：

1. 数据源与实时能力
2. 回测引擎与数据质量
3. 策略/实验/Mission Lab/track-record 架构复用
4. 事件与催化剂数据能力
5. cron / 健康面板 / i18n / 鉴权 / 交易日历 / Design First

---

## 2. 两个地基级阻断（Blocker）

### Blocker 1 — 无实时盘中行情（击穿 spec 第一、三、六节）

- **数据源分工**：J-Quants = 唯一历史日线 EOD 源（`lib/jquants.ts:222`，端点仅 `/equities/bars/daily`，**无任何盘中/分钟端点**）；Yahoo = 所有「实时」报价源。
- **Yahoo 日股固有 15–20 分钟延迟**，代码多处白纸黑字承认：
  - `app/api/mission-lab/quotes/route.ts:24`「Yahoo 免费源对日股报价固有约 15–20 分钟延迟…绝不伪装成 tick 级实时」
  - `CHANGELOG.md:231`「实测 quoteAgeSec≈901（~15 分）」；`CHANGELOG.md:252`「Phase2 09:30（避 Yahoo 15–20 分钟延迟）」
  - Mission Lab 正因此把成交推迟到 09:30 而非开盘瞬间。
- **15:23 调用 Yahoo 大概率拿到 ~15:03–15:08 的价**，日股 15:30 收盘，尾盘最后 7 分钟根本抓不到。
- **无 VWAP**（全库 `vwap` 0 命中）、**无分钟 K**、**无盘中时点快照时间序列**
  （`RealtimeMarket` 每股一行、被覆盖、无时点标签，`prisma/schema.prisma:367-384`）。
- **无 sameTimeRvol 历史基准**（全库 0 命中）；成交量最细粒度 = 全日量（`DailyPrice.volume`）。
  → spec 第五节自己已预判此点（要求从上线日向前累积快照、历史只能用 proxyRvol），**这点 spec 是诚实的，可接受**。

**判定：当前系统无法在 15:23 拿到当日 15:23 的真实价/量/VWAP。**

### Blocker 2 — 无可回测的历史深度（击穿 spec 第十一节）

- **历史深度不足**：`DailyPrice` 仅约 **1–1.5 年**（`sync-all-prices.ts:118` 硬编码 `DATE_RANGE_DAYS=400`，无 5 年回填脚本）；
  真实推荐记录（`DailyRecommendation`）始于 2026-06-20，仅约 **1 个月**。**连「5 年」跨度都不具备。**
- **幸存者偏差（最致命，不可修复）**：库内只有当前在市个股，建库前退市公司不存在；
  回测在所有历史日都套用「今天仍存活的 `aiEnabled` 宇宙」（`compute-scores.ts:194-224`、`backtest-shadow.ts:68`）
  → 胜率/收益被**结构性高估**。即便补齐 5 年行情，只要股票池仍来自当前宇宙，结果就不可信。
- **拆股复权**：仅 `adjClose` 被复权，`open/high/low` 全是原始价（`schema.prisma:89-104` 无 adjOpen/adjHigh/adjLow）；
  跨拆股入场价与日内 TP/SL 判定失真（`BACKTEST_RULES_V1.md:623` 已知限制）。历史真发生过量纲断裂事故（v18.2.1 / v18.46.0）。
- **未来函数**：价格核心因子有 as-of 防护（`lib/safety-rules.ts:98-131`），
  但**催化剂/事件用 `now()-30d` 窗口而非回测 as-of 日**（`compute-scores.ts:276,289`），不可重放。
- **无成交可得性标记**：无涨跌停/特别气配/停牌历史字段（`DailyPrice` 仅 `volume`），回测会把「一字板买不进」当成正常成交。
- **现有三个「回测」脚本本质都是对已落库推荐做前瞻统计**（`strategy-backtest.ts`/`compute-strategy-backtest.ts`/`backtest-shadow.ts`），
  **没有一个能在任意历史日重建当时真实推荐再交易**。

**判定：现有数据无法支撑一次诚实的、无幸存者偏差、拆股复权、无未来函数的 5 年隔夜回测。**

---

## 3. 事件/催化剂闸门（spec 第二、三、四、七节）

- **实时 Shadow 阶段约 5–6 成可用**：财报日/除息日临近（前瞻）、TDnet 催化剂存在性、
  25 类事件分类器（`lib/events/classify.ts`，含上调业绩/回购/增发/法律风险）实时可用、shadow 已跑通（`event-shadow-report.ts`）。
- **多类硬闸门数据源缺失，无法执行**：
  - 分析师**评级**——无任何数据源。
  - 大股东**减持**——无大量保有报告/EDINET 源，仅 TDnet 标题偶发命中。
  - **信用规制/日々公表/監理/特設注意**——无 JPX 状态源；`risk-adjustment.ts:10,39` 的 `marginRestricted` 有定义但**无人写入、惩罚恒为 0**。
- **5 年历史回测里 catalystGate 无法诚实复原**：
  TDnet/News 仅约 **1 个月**深度（源站仅留近 30 天、无回填脚本，`fetch-tdnet.ts:24-25` 只抓近 5 个交易日）；
  `EarningsSchedule`/`exDivDate` **只存未来、过期即删**（`sync-earnings-schedule.ts:108`），无历史财报日/除息日序列。

---

## 4. 策略逐节 × 现状可行性对照

| Spec 章节 | 可行性 | 说明 |
|---|---|---|
| 一、15:23 实时终筛 | ❌ 不可行 | 无实时盘中行情，15:23 拿到延迟 15+ 分钟的价 |
| 二、股票池硬过滤 | 🟡 半 | 市场/价/20日均额可做；当日预计成交额、连续无成交、涨停无法成交缺 |
| 二、事件过滤 | 🟡 半 | 实时 5–6 成；减持/监管/信用规制无源；历史回测 ❌ |
| 三、大盘硬门控 | 🟡 半 | 指数/USDJPY/原油有；TOPIX 当日 VWAP ❌、全市场涨跌家数占比缺 |
| 四、个股价格趋势 | ✅ 可做 | 涨幅/跳空/MA/RSI/距高/closeLocation/上影线均日频可算 |
| 五、sameTimeRvol | ❌/🟡 | 实时无历史基准；回测只能 proxyRvol（spec 已承认） |
| 六、K线尾盘强度 | 🟡 半 | closeLocation/上影线可（日 OHLC）；VWAP、14:30后放量、最后30分钟 ❌（需分钟数据） |
| 七、催化剂验证 | 🟡 半 | 实时 5–6 成；历史回测 ❌ |
| 八、100分评分 | ✅ 可做 | 15+15+20+15+10+10+10+5=100 求和正确、闸门与评分分离清晰 |
| 九、模拟执行 | ✅ 可做 | 复用 Mission Lab 引擎，补收盘买入腿 |
| 十、审计字段 | ✅ 可做 | 字段清单合理 |
| 十一、5年回测门槛 | ❌ 无法达成 | 历史深度不足 + 幸存者偏差不可修复 + 催化剂/事件不可回测 |
| 十二、页面 | 🟡 需走 Design First 十二步 | 不能直接码 UI |
| 十三、API/Cron | ✅ 现成 | 15:23 空档；15:15 撞收盘决策三连、次日 09:00 撞 Alpha 群，需错点 |
| 十四、测试验收 | ✅ 可做 | jpx-calendar / split-adjustment 测试范式现成 |

**小结：第四、八、九、十节现成能做；第一、六、十一节被数据地基卡死；第二、三、七节半残。**

---

## 5. 治理红线

- **Design First 十二步**（`docs/DESIGN_FIRST_GOVERNANCE.md`，2026-07-18 生效）：
  页面必须走 IA Freeze→Hi-Fi→Design Freeze→Assets→实现→**Design Compare 每页 ≥90**→Function→Release，
  复用 §4b 冻结组件、不得另造。**不能跳过直接码 UI。**
- **i18n 只剩 zh-CN / ja-JP**（en-US 已于 P17-00 移除，CLAUDE.md 顶部「三语」段已过时，以代码 `lib/i18n/types.ts:1` 为准）。整页 100% 同语言。
- **API 禁返展示文案**：`rejectReasons[]`/`catalystType`/`decision`/`exitStatus` 等**必须机器码 + params**，
  前端 `tx('ns.'+code)` 映射双语（范式见 `ProductionMonitor.tsx:60`）。**勿用**旧的中文单语 `status-labels.ts`。
- **鉴权**：只读 API 放 `/api/strategy/*` 或 `/api/alpha/*` 前缀即自动 ADMIN_ONLY（`middleware.ts` 已覆盖），写端点绝不进 Beta 白名单。
- **资金链路锁**：本策略无真钱、不接券商，**不触发** payment lock。
- **⚠️ track-record 污染风险**：实验线 `app/api/decision/track-record/route.ts:228` 的 `aiMission.findMany()` **无 missionType 过滤**，
  若复用 AiMission 行不加判别列，业绩会被混入 WEEKLY/MONTHLY 聚合，**违反「三口径绝不合并」**。
  → **规避方案：隔夜策略用完全独立表，不复用 AiMission 行，只复用引擎代码范式。**

---

## 6. 可复用清单

| 能力 | 复用 | 证据 | 注意 |
|---|---|---|---|
| 模拟执行（滑点/新鲜校验/原子现金） | `lib/mission-lab/engine.ts` `fillDecision` | `engine.ts:70-159` | 补「收盘买入腿」；Paper* 表可作账本，但 paper-broker 镜像逻辑不可用（无撮合） |
| 次日结算/NAV | `markAndSnapshot` + `AiMissionNav` | `engine.ts:162-199` | 直接复用范式 |
| 幂等 | CAS + `decisionId @unique` + `lastPrepare/ExecuteDate` + 崩溃恢复 | `engine.ts:77-105` | 照搬 |
| 隔离范式（不进生产） | `AdaptiveScoreV3Shadow` + `backtest-shadow.ts` 只读硬契约 | `schema:1691-1717`；`backtest-shadow.ts:10-11` | 照搬 |
| 交易日历 | `getJPXTradingDayStatus` / `nextTradingDayStr` | `lib/trading-calendar/jpx.ts`；`lib/decision-engine/phase.ts:42` | 「节假日前一交易日/周五」无现成函数，需自行组合 |
| cron 编排 | `runAsync`（超时+双日志）+ `isTradingDayGuard` + `pipeline-tracker` 文件级幂等 | `cron-scheduler.ts:93-194` | 改 cron 后须 `pm2 restart tohoshou-cron`，避开 07:30–14:00 JST |
| 健康面板 | `data-health-guard.ts` add() + Production Monitor alert code | `scripts/data-health-guard.ts`；`app/api/admin/production-monitor/route.ts:27-30` | 只回机器码 |
| 回测 | `backtest-shadow.ts` 范式（DailyPrice 重建、DRY_RUN、幂等 upsert） | `backtest-shadow.ts:2-14,189-195` | 建独立 shadow 结果表 |

---

## 7. 建议方案（路径 A · 仅方案，未实施）

### 核心原则（诚实降级）
- **不假装 15:23 实时**：信号在 15:30 收盘后、收盘价定稿时计算（spec 11.5 允许「买入价用真实收盘或尾盘代理」）；
  模拟买入 = 收盘价基准，模拟退出 = 次日开盘价。
- **实时项（VWAP/尾盘强度/sameTimeRvol）从上线日向前累积快照**，攒够约 20+ 交易日再启用；此前标 `DATA_INSUFFICIENT` 不猜测。
- **完全独立表，不复用 AiMission 行**（绕开 track-record 污染），仅复用引擎代码范式。
- **全程 Shadow 隔离**：表头只读硬契约，`OVERNIGHT_SHADOW_ENABLED` 默认关。

### Schema（additive，不动既有表）
- `OvernightSignal` — 每 (tradeDate, symbol, strategyVersion) 一行，含 spec 第十节全部字段（结算字段 nullable 次日回填）。
- `OvernightBacktestResult` — 分年/市场状态/星期/行业/评分区间 × 三档成本。
- `IntradaySnapshot` — (symbol, tradeDate, snapTime∈{14:45,15:15,15:23}, cumVolume, price, quoteAgeSec)，向前累积 sameTimeRvol 基准。
- 枚举：`OvernightDecision`/`OvernightExitStatus`/`OvernightGateStatus`（全机器码）。

### Cron 时点（均过 `isTradingDayGuard` + 开关）
| JST | 脚本 | 作用 | 冲突 |
|---|---|---|---|
| 15:15 | `overnight-prepare` | 候选池初筛 + 15:15 快照 | 🟡 与收盘决策三连并发抢 Yahoo（不互斥） |
| 15:23 | `overnight-snapshot` | 15:23 快照（前向累积） | ✅ 空档 |
| 15:50 | `overnight-finalize` | 收盘价定稿→出 SHADOW_BUY/NO_SIGNAL | ✅ 空档 |
| T+1 07:35 | `overnight-settle` | 用 J-Quants 权威开盘价结算 | ✅ 06:00 同步后、07:45 前空档 |

### 预计修改文件
- **新建**：`lib/overnight/{config,gates,score,engine,snapshot,calendar}.ts`、
  `scripts/overnight-{prepare,finalize,snapshot,settle,backtest}.ts`、
  `scripts/test-overnight-{gates,score,settlement,calendar}.ts`、
  `app/api/strategy/overnight/route.ts`
- **改动**：`prisma/schema.prisma`、`scripts/cron-scheduler.ts`、`scripts/data-health-guard.ts`、
  `lib/i18n/messages/{zh-CN,ja-JP}.ts`
- **不碰**：所有生产评分/交易/资金链路/AiMission/DailyRecommendation/track-record 表。

### 回测（诚实标注）
- 走 `backtest-shadow.ts` 范式，用 proxyRvol；报告明确标 `proxy≠sameTimeRvol`，
  VWAP/尾盘强度/催化剂/事件在历史段为 `NOT_BACKTESTABLE`。
- 结果一律带 `SURVIVORSHIP_BIAS_UNCORRECTED` + `HISTORY_DEPTH_INSUFFICIENT`，状态钉死 `RESEARCH_ONLY`；
  真正验证走**前向累积到 500 样本**。

### Spec 建议修订（小瑕疵）
- RSI 统一为 `55–72 通过 / >72 排除`（消除原文 72–75 空洞）。
- 成本以 0.50% 压测为基准情形（0.30% 往返对 ¥500–8000 中小盘偏乐观）。
- 「次日」全部按「下一交易日」实现（周五买 = 周一卖 = 3 天缺口，故周五/节前禁开仓逻辑正确）。

### 风险与回滚
- 关 `OVERNIGHT_SHADOW_ENABLED` + 不 restart cron = 零生产影响；schema 纯 additive；独立表回滚不影响既有功能。
- **首要风险**：若强行走字面 spec（在延迟数据上算 15:23），会产出「看似精确实则错误」的信号，比不做更糟——恰好违反 spec「禁止猜测和降级放行」。
- **次要风险**：策略先验偏弱（强收盘股常隔夜反转），很可能长期验不过 55%/1.15 门槛——这不是缺陷，正是 Shadow 的意义，但要预期它大概率长期停 `RESEARCH_ONLY`。

---

## 8. 待拍板事项

1. **结算口径**：次日 J-Quants 权威开盘价（推荐，07:35，权威/复权一致/无延迟）vs 坚持 09:00 实时 Yahoo（更脏）。
2. **是否投入路径 B 数据采购**（实时低延迟行情源 + 5 年历史分钟数据 + 退市股宇宙）——决定能否实现字面 spec。
3. **开发启动**：本报告仅审计与方案，未写任何代码；开发需另行确认。

---

## 附：最终状态口径

- 若采用路径 A 落地：初始且长期状态 = **RESEARCH_ONLY**（前向样本 <500、且历史回测门槛不可达）。
- 若强行套用 spec 第十一节实盘门槛：**PROMOTION_BLOCKED**（数据地基不可达，不得进入生产推荐、不自动交易）。

> 隔夜强势确认策略审计完成；在回测与样本外门槛全部通过前，保持 Shadow，不进入生产推荐、不自动交易。
