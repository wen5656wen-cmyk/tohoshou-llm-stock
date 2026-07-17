# P11 Architecture Baseline — Sentiment / Event / Score 架构基线

> **版本**：Baseline v1.0 · **冻结日**：2026-07-17 · **状态**：🔒 FROZEN
>
> 本文档是 P11 全系列（SCORE-01/02 · DATA-01/02/03 · ARCH-01/02/03 · FREEZE-01）的最终结论。
> **此后所有评分相关开发（Sentiment / Event / Explain / Gate / Score / Recommendation）必须以本文档为唯一依据。**
> 与本文件冲突的提案一律驳回；推翻本文件任一结论，需新开 ADR 并附生产实测证据。

**P11 全系列产出方式**：8 个只读分析/设计任务 · **0 行业务代码修改 · 0 次写库 · 0 次部署**。
本文档所有数字均来自生产库实测（2026-07-17），非推断、非估算。

---

## 1. Executive Summary

**我们找到了什么。** 系统的新闻情绪 98.2% 是 NEUTRAL，最初看起来像分类器坏了。深挖到底，**分类器只是表层，真正的根因是「EventType 缺失」**：系统只有 7 个粗糙的 `category` 和 3 个值的 `sentiment`，中间那层「客观上发生了什么」从来没有存在过。一个 `BUYBACK` 类别里混着「新回购决议」（真利好，36 条）、「回购进度月报」（法定例行、零信息，330 条）、「回购已结束」（偏空，48 条）——**它们方向完全相反，却共用一个标签**。Explain、Gate、Score 三个消费者都只能拿这个坏输入去猜。

**Shadow 推翻了原设计，这是 P11 最有价值的产出。** P11-ARCH-01 提出「BUYBACK → POSITIVE」并称之为修 Bug。P11-ARCH-02 用生产数据（复现校验 `REPLICATION ok=3038 bad=0`，与生产分数逐股完全一致）证明：这个「修复」会把 82.7% 的例行月报变成买入信号，给 KDDI/SECOM/SMC 这类现金充裕大盘股一个**每月自动续期的 +4 分补贴**（TOPIX Large70 命中率达全市场基准的 7.4×），并让当日 Decision Center 头号推荐从 4424.T 错误易主给 4493.T。**从「沉默的漏判」变成「主动的误报」，那会更糟。**

**三次直觉判断都被实测推翻。** ① 「大量股票卡在 69 分」——实际只有 18 只（0.6%），分布完全正常（μ=49.89 / median=50 / σ=10.18）；② 「解除覆盖后 BUY 会到 90–130（3–4×）」——实测 49（错误规则）/ 33–35（正确规则），因为 news 权重仅 0.10–0.15，**数学上就推不动**；③ 「解除覆盖是最高危动作」——实测它对推荐**逐股零影响**，是最安全的一步。**结论：按实测风险排序，不按直觉排序。**

**因此路线图倒过来了。** 先做 **P12-DATA/EXPLAIN**：覆盖提升 7.2×（388 → 2791 只）、建立 EventType、**让 Explain 讲「回购进度月报」而不是「利好」**——零推荐影响，纯收益，且**先把人工防线立起来再动推荐**。再做 **P12-GATE**：修复一个既有生产缺陷——**今天一家公司发员工期权就会被 Gate1 踢出 AI Top Picks**（258/322 的 EQUITY 都是期权/新株予約権）。最后才是 **P12-SCORE**，然后是 **P14（权重/门槛）**。

**必须写进每份汇报的期望管理**：**修好 Sentiment 几乎不会改变推荐结果**（BUY 31 → 33–35）。真正的收益是**数据覆盖、可解释性、Gate 正确性**，**不在分数**。想让 BUY 数量有实质变化，只能走门槛/权重路线——而那要求先处置 `globalTrendScore`（全市场 σ=0 却占 10 分）和 `percentileRank`（≤15% 从不生效），**合计 25% 权重实际失效**。**在这个地基上调 70/75，是在坏地基上找平。**

---

## 2. Architecture Decision Records

### ADR-001 · EventType 必须独立于 Sentiment

- **状态**：✅ ACCEPTED（2026-07-17 冻结）
- **背景**：系统只有 `category`（7 类）与 `sentiment`（3 值），缺「客观发生了什么」这一层。

**决策**：建立 `EventType` 作为独立的一等公民；`Sentiment` 降级为其派生物。

**依据（P11-ARCH-02 生产实测）**：一个 `BUYBACK` 类别内混着方向完全相反的事件——

| 子类 | 实测条数 | 占比 | 真实方向 |
|---|---|---|---|
| BUYBACK_PROGRESS（取得状況 · 月度进度报告） | 330 | 72.2% | **FLAT**（法定例行，零新信息） |
| BUYBACK_COMPLETED（取得終了 · 回购结束） | 48 | 10.5% | **FLAT/偏空**（买盘支撑消失） |
| BUYBACK_DECIDED（取得の決定 · 新决议） | 36 | 7.9% | **UP** |
| BUYBACK_CANCEL（消却 · 注销） | 6 | 1.3% | **UP** |
| BUYBACK_DISPOSAL（処分 · 再出售） | 1 | 0.2% | **DOWN** |
| 其他 | 36 | 7.9% | — |

`EQUITY` 同构：258/322（80.1%）是员工期权/新株予約権，仅 42（13.0%）是真稀释増資；「子会社への増資」实为公司**对外投资**，非自身稀释。

**后果**：
- ✅ 事实可审计（`evidence[]` 可回溯判据）
- ✅ `EventType = f(title, category)` 为**纯函数** → **不加列、不改 Schema、`git revert` 即回滚**
- ⚠️ 约束：`EARNINGS + OTHER = 4837 条（79.8%）` 因 Disclosure 无正文而永久 `UNKNOWN` —— **数据天花板，本 ADR 明确不承诺解决**

**被否决的方案**：`category → sentiment` 直连。Shadow 证明它会把 82.7% 的例行月报变成买入信号，并给大盘股 7.4× 的结构性补贴。

---

### ADR-002 · Explain 必须消费 EventType

- **状态**：✅ ACCEPTED

**决策**：Explain 层只展示「发生了什么」；**禁止**展示「AI 认为利好」；**禁止**用 `sentiment` 给事实上色。

**依据**：P11-ARCH-02 中，当日 Decision Center 头号推荐从 4424.T 错误易主给 4493.T，触发源是一条**回购进度月报**。若 Explain 当时显示的是「回购进度月报（例行）」而非「利好」，**这个错误在设计评审前就会被人眼抓住**。

**核心论证**：Explain 是**最后一道人工防线**。防线的价值在于说事实——判断可以错，事实不能被粉饰。

**后果**：
- ✅ 影响面 100%（老板看到的每一条都被修正）
- ✅ 零分数影响 → **可且必须先于 Gate/Score 上线**
- ✅ 强度未知时必须诚实标注（如「新回购决议 · 强度未知（标题未含金额）」），**禁止用星级伪装成已知强度**

---

### ADR-003 · Score 不能直接消费 Category

- **状态**：✅ ACCEPTED

**决策**：`newsSentimentScore` 只接受 `direction ≠ UNKNOWN` 的 EventType 派生的 bounded eventScore。

**依据（数学的，不是偏好）**：

```
newsSentiment 权重 = 0.10 ~ 0.15（按 stockStyle，见 lib/ai-score.ts STYLE_WEIGHTS）
维度满分 = 15
满格翻转 8 → 15 对 adaptiveScore 的影响 = (15-8)/15 × 0.10 × 100 = ±4.7 分
```

**Sentiment 天生只能微调——这是既有权重的数学后果，不是设计选择。**

**实测印证**：修正规则下仅约 110 条事件带方向 → 预计 `BUY 31 → 33~35`。

**后果**：
- ⚠️ **必须写入期望管理**：修好 Sentiment **几乎不改变推荐结果**
- ✅ 收益在 Data 覆盖 + Explain + Gate，**不在分数**
- ❌ 任何「靠修 Sentiment 让 BUY 大幅增加」的提案，均违反本 ADR

---

### ADR-004 · GlobalTrend 保留市场统一因子

- **状态**：✅ ACCEPTED（保留现状，冻结改动）

**决策**：**不改 GlobalTrend 的计算逻辑。**

**依据（P11-SCORE-02）**：`globalTrendScore = GlobalMarket.score`，全市场 3038 只同值（σ=0）。这**不是 Bug**——宏观因子（NASDAQ/VIX/USDJPY/Nikkei）本就全市场共享，σ=0 是**设计的必然结果**，代码无缺陷；30 天内在 4→7 之间正常波动。

**真正的问题**：给一个 σ=0 的因子 **10 分（10% 权重）** → **对横截面排序零贡献**。这是 **Weight 决策**，不是 Bug 修复。

**后果**：
- 🚫 **禁止以「修 Bug」名义改 `calcGlobalTrendReal`** —— 无缺陷可修，改动只会制造新问题
- ➡️ 权重处置归入 **P14-SCORE-01**（与 `percentileRank` 一并决策）
- ✅ 保留统一因子的合理性：它表达「今天全市场的宏观环境」，语义正确，只是不该参与排序权重

---

### ADR-005 · 70/75 门槛本阶段冻结

- **状态**：✅ ACCEPTED（冻结至 P14）

**决策**：**禁止在 P12/P13 讨论或调整 70/75 门槛。**

**依据**：当前 adaptiveScore 有 **25% 权重实际失效**——

| 失效项 | 权重 | 实测 |
|---|---|---|
| `globalTrendScore` | 10% | σ=0，横截面零贡献 |
| `percentileRank ≤ 15%` | 门槛条件 | 对应 456 只，**实际 0 只被它挡下** |

**核心论证**：**在 25% 权重失效的分数上调门槛 = 在坏地基上找平。** 治标不治本，且会让后续回测基线作废两次。

**解冻条件（全部满足）**：
1. P12 全部上线并稳定 ≥14 个交易日
2. `globalTrendScore` 与 `percentileRank` 的处置已决策并上线（P14-SCORE-01）
3. V2 全量回填完成，无残留旧值
4. 用新口径重跑 ≥60 个再平衡日，产出新 winRate/Alpha 基线
5. **明确定义「BUY 目标数量区间」与「可接受 winRate 下限」**（否则无法判断调门槛是否成功）
6. Gate1 `EQUITY` 误拒缺陷已修复（P12-GATE-01）

**已证伪的相关判断**：「大量股票卡在 69 分」= 假（仅 18 只 / 0.6%，分布正常）。**门槛不是因为「卡分」才需要调。**

---

## 3. 最终架构图

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TDnet / Kabutan                                          【外部数据源】         │
│ 职责：提供原始披露。TDnet 6063 条 / 2791 只（近 30 日）                          │
│ 边界：Disclosure 无正文 → magnitude 类信息不可得                                │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Raw Event（原始事件）                                     【DATA · 存储】       │
│ 职责：忠实落库 title / category / publishedAt / importance                     │
│ 现状缺陷：sync-news:218/221 双重过滤 → 6063 条/2791 只 砍到 739 条/388 只（7.2×）│
│ 关键事实：conf≥70 实际只有 95 一个取值 → 入评分的 News 全部来自 Disclosure；     │
│           Kabutan(50/25/20) 从不参与评分                                       │
│ 归属：P12-DATA-01                                                             │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ EventType（事实层 · 架构核心新增）                          【DATA · 纯函数】    │
│ 职责：回答「客观上发生了什么」                                                   │
│   classifyEvent(title, category) → { eventType, direction, magnitude, evidence }│
│ 契约：· 纯函数，不写库、不加列 → git revert 即回滚                               │
│       · direction ∈ UP | DOWN | FLAT | UNKNOWN，仅 ~110 条有值                 │
│       · magnitude 今日恒为 null（Disclosure 无正文）                            │
│       · EARNINGS+OTHER 4837 条(79.8%) 永久 UNKNOWN —— 数据天花板，不承诺解决     │
│ 归属：P12-DATA-02（SSOT）                                                      │
└──────┬──────────────────────────────────┬────────────────────────────────────┘
       │                                  │
       ▼                                  ▼
┌─────────────────────────────┐  ┌──────────────────────────────────────────────┐
│ Explain（解释层）             │  │ Gate（硬拒绝层 · AI Top Picks）                │
│ 职责：讲事实，不讲判断         │  │ 职责：基于事实的一票否决                        │
│  ✅「回购进度月报（例行）」     │  │  判据：EventType（非 sentiment）               │
│  ✅「员工期权（非融资）」       │  │  EQUITY_DILUTION     → REJECT （42 条 真稀释） │
│  ❌「AI 认为利好」            │  │  EQUITY_STOCK_OPTION → PASS ★（258 条 修复误拒）│
│ 价值：最后一道人工防线          │  │  GUIDANCE_DOWN       → REJECT                │
│ 影响：100%（老板全看见）        │  │  MATERIAL_LEGAL      → REJECT                │
│ 分数影响：0                   │  │ 影响：改变推荐成分                             │
│ 归属：P12-EXPLAIN-01          │  │ 归属：P12-GATE-01                            │
└─────────────────────────────┘  └──────────────────┬───────────────────────────┘
                                                    ▼
                                 ┌──────────────────────────────────────────────┐
                                 │ Score（评分层）                【SCORE】        │
                                 │ 职责：弱微调，仅此而已                          │
                                 │  仅 direction≠UNKNOWN 计分 → bounded eventScore│
                                 │  → newsSentimentScore (0-15)                 │
                                 │ 硬约束：对 adaptiveScore 影响 ≤ ±4.7 分         │
                                 │        （0.10 权重 × 15 分维度，数学封顶）       │
                                 │ 预期：BUY 31 → 33~35                          │
                                 │ 归属：P12-SCORE-01                            │
                                 └──────────────────┬───────────────────────────┘
                                                    ▼
                                 ┌──────────────────────────────────────────────┐
                                 │ Recommendation（推荐层）      🚫 冻结          │
                                 │ 职责：adaptiveScore + percentileRank → 评级    │
                                 │ 状态：P11 全程未发现缺陷 —— 问题全在输入         │
                                 │ 禁止改动：引擎逻辑 / 70/75 门槛 / 权重           │
                                 │ 解冻：P14（ADR-005 六项条件）                   │
                                 └──────────────────────────────────────────────┘
```

**一句话契约**：**Event 是事实 → Explain 与 Gate 消费事实 → Score 只拿到一个被数学封顶的弱信号 → Recommendation 不动。**

---

## 4. Root Cause Tree

```
                          ┌─────────────────────────────────────┐
                          │  根因：EventType 缺失                 │
                          │  系统只有 category（7 类·太粗）        │
                          │  和 sentiment（3 值·有损）            │
                          │  中间那层「发生了什么」从来不存在        │
                          └──────────────┬──────────────────────┘
                                         │
   ┌─────────────────────────────────────┴─────────────────────────────────┐
   │                                                                       │
   ▼                                                                       ▼
┌─ NEWS（数据层）─────────────────┐                         ┌─ EVENT（缺失层）──────────────┐
│                                │                         │                              │
│ TDnet 6063 条/2791 只           │                         │   ✗ 不存在                    │
│        │                       │                         │                              │
│        │ ① sync-news:218       │                         │  应有：BUYBACK_DECIDED(36)    │
│        │   symbol IN top200 ───┼──✂ 砍 7.2×              │        BUYBACK_PROGRESS(330)  │
│        │ ② sync-news:221       │                         │        BUYBACK_COMPLETED(48)  │
│        │   take:500        ────┼──✂                      │        EQUITY_DILUTION(42)    │
│        ▼                       │                         │        EQUITY_STOCK_OPTION(258)│
│   News 739 条/388 只            │                         │                              │
│        │                       │                         │  因缺失 → 下游只能拿 category  │
│        │ ③ :227 二次覆盖         │                         │           去猜情绪 → 全线失真  │
│        │   丢弃 Disclosure.sentiment                      └───────────┬──────────────────┘
│        │ ④ 双分类器(tdnet / news-utils)                                │
│        │ ⑤「自己株式取得」vs「自己株式の取得」失配 ──► BUYBACK 457 条 100% NEUTRAL
│        ▼                       │                                     │
│  sentiment: 98.2% NEUTRAL      │                                     │
└────────┬───────────────────────┘                                     │
         │                                                             │
         │  ⚠️ 关键：conf≥70 实际只有 95 一个取值                          │
         │     → 参与评分的 News 全部来自 Disclosure，Kabutan 从不入评分     │
         │                                                             │
    ┌────┴──────────────────┬──────────────────────┐                   │
    ▼                       ▼                      ▼                   │
┌─ EXPLAIN ─────┐    ┌─ GATE ────────────┐   ┌─ SCORE ──────────┐      │
│               │    │                   │   │                  │      │
│ 拿 sentiment  │    │ Gate1 用 sentiment│   │ newsSentiment    │      │
│ 上色事实       │    │ + category        │   │ = 8 (3001/3038)  │      │
│               │    │                   │   │      │           │      │
│「利好：自己     │    │ ❌ EQUITY 无条件拒 │   │      │ 权重0.10-0.15    │
│  株式取得」    │    │   → 258/322 是员工 │   │      ▼           │      │
│               │    │     期权 → 误拒    │   │  adaptiveScore   │      │
│ 人眼无法识破   │    │                   │   │  影响 ≤ ±4.7 分 ◄─┼──────┘
│「这是月报」    │    │ ⚠️ 与 Explain 共享 │   │                  │  数学封顶
└───────────────┘    │   同一个坏输入     │   │  max=76, BUY=31  │
         │           └───────────────────┘   └──────────────────┘
         │                     │                      │
         └─────────────────────┴──────────────────────┘
                               │
                    ┌──────────▼───────────────────────────────┐
                    │ 三者共享同一个坏输入 → 同时失真            │
                    │ 但影响量级完全不同：                       │
                    │   Explain 100%（老板看到的全是错标签）      │
                    │   Gate    结构性误拒（今日窗口恰好=0）      │
                    │   Score   ≤ ±4.7 分（数学上就动不了）      │
                    └──────────────────────────────────────────┘

【独立并行的两个问题 —— 与 Sentiment 无关，但污染同一个 adaptiveScore】
   globalTrendScore : 全市场 σ=0（3038 只同值），占 10 分 = 10% 权重恒定
   percentileRank   : ≤15% 对应 456 只，从不生效（0 只被它挡下）
   → 合计 25% 权重实际失效
```

---

## 5. P12 Roadmap

### 5.1 子任务拆分

#### P12-DATA-01 · 解除 sync-news 双重过滤

| 项 | 内容 |
|---|---|
| **目标** | 覆盖 388 只 → 2791 只（**7.2×**） |
| **修改文件** | `scripts/sync-news.ts:218`（移除 `symbol: { in: symbols }`）、`:221`（移除 `take: 500`） |
| **风险** | 🟢 **最低**。Shadow-B 对 BUY/Top10/Top20/Top50 **逐股等同** Shadow-A → 推荐零影响。约束源于 v5.5.0 nginx 60s 超时，该约束已消失（cron 窗口 30min / 实测 198s） |
| **回滚** | `git revert` 单文件两行；无数据污染（News 增量写入） |

#### P12-DATA-02 · EventType SSOT + Shadow 复跑

| 项 | 内容 |
|---|---|
| **目标** | 建立事实层唯一来源；产出新旧差异报告 |
| **修改文件** | `lib/events/types.ts` ✨新增、`lib/events/classify.ts` ✨新增、`scripts/event-shadow-report.ts` ✨新增（只读）、`lib/tdnet.ts:77`（删除重复分类器）、`lib/news-utils.ts:50`（委托 SSOT）、`scripts/sync-news.ts:113,227`（停止二次覆盖） |
| **风险** | 🟢 **零**。新增文件不接线；删重复实现时词表不变 → 分数不变 |
| **回滚** | `git revert`；EventType 是纯函数，无库存量，无迁移 |

#### P12-EXPLAIN-01 · Explain 改讲事实

| 项 | 内容 |
|---|---|
| **目标** | Catalyst / DisclosureCard / Cockpit 展示 EventType 事实标签，消灭「AI 认为利好」 |
| **修改文件** | `lib/explain/gap.ts`（`CATALYST_META` → EventType 驱动）、`components/DisclosureCard.tsx`、`components/decision/DecisionCockpitView.tsx` |
| **风险** | 🟢 **零分数影响**（纯展示层）。唯一风险为 i18n 三语覆盖遗漏 |
| **回滚** | `git revert` + rebuild + `pm2 restart tohoshou-web`；无数据变更 |

#### P12-GATE-01 · Gate1 改用 EventType

| 项 | 内容 |
|---|---|
| **目标** | 修复**既有生产缺陷**：`category === "EQUITY"` 无条件拒绝 → 258/322（80.1%）是员工期权被误拒出 AI Top Picks |
| **修改文件** | `lib/ai-top-picks/gates.ts`（判据 `sentiment` → `eventType`）、`scripts/generate-ai-top-picks.ts:79-82`（`isHighNegative` 重写） |
| **风险** | 🟠 **中 —— 改变推荐成分**。ARCH-02 实测当日 `GATE1_NEWLY_REJECTED=0`、`POOL_REMOVED=0`，但**那是 5 天窗口的单日快照，非结构性保证**（财报季结论会变） |
| **回滚** | `git revert` + 重跑 `generate-ai-top-picks`；Top Picks 为每日重算产物，回滚即恢复 |

#### P12-SCORE-01 · newsSentiment 接 bounded eventScore

| 项 | 内容 |
|---|---|
| **目标** | `newsSentimentScore` 由 EventType 驱动；预计 **BUY 31 → 33~35** |
| **修改文件** | `lib/events/score.ts` ✨新增、`lib/ai-score.ts:422`（`calcNewsSentiment`）、`scripts/compute-scores.ts:296-299`（pos/neg 计数 → EventType 聚合）、`scripts/backfill-sentiment.ts` ✨新增（幂等 + DRY_RUN） |
| **风险** | 🟠 **中**。唯一写 `StockScore` 的任务。影响数学封顶 ≤±4.7 分；**须防大盘股偏袒**（Large70 命中率不得 > 基准 3×） |
| **回滚** | 改前 `StockScore` + `News` + `Disclosure` **JSON 快照**（~15MB，沿用 P8-DATA-03 先例）→ `git revert` + 重跑 `compute-scores`（幂等）。**无需 Schema 版本列**（ADR-001） |

### 5.2 Apply 顺序（严格 · 禁止跨阶段）

```
   P12-DATA-01 ──► P12-DATA-02 ──► P12-EXPLAIN-01 ──► P12-GATE-01 ──► P12-SCORE-01
   （7天观察）      （3天观察）        （3天观察）          （14天观察）      （14天观察）
   零推荐影响       零推荐影响         零推荐影响            改推荐成分        改推荐分数
                                        ▲                    ▲
                                        │                    │
                                 人工防线必须先立起          须先跑 Shadow 复跑
                                                                    │
                                                                    ▼
                                                            🚫 P14（门槛/权重）
                                                            解冻条件见 ADR-005
```

**四条铁律**：

1. **禁止跨阶段**：前一任务未满足 DoD 全部条件，后一任务不得启动。
2. **Explain 必须先于 Gate/Score**（ADR-002）—— **先把人工防线立起来，再动推荐**。这是 ARCH-02 用真实误判（4424→4493）换来的教训。
3. **Gate/Score 上线前必须 Shadow 复跑**：用新 EventType 规则重跑 ARCH-02 脚本，**`REPLICATION` 必须 = 3038/3038**，否则口径已漂移，结论作废。
4. **禁止在 P12 内讨论 70/75**（ADR-005）。任何「顺便调一下门槛」的提议一律拒绝。

**排序原则（P11 最重要的方法论产出）**：

> **按「是否改变推荐结果」排序，不按「问题看起来多严重」排序。**
> P11-ARCH-01 凭直觉把「解除覆盖」列为最高危压轴；P11-ARCH-02 实测证明它对推荐**逐股零影响**，是最安全的一步。**直觉排序错了，实测排序对。**

### 5.3 后续阶段

| 阶段 | 目标 | 风险 | 前置 |
|---|---|---|---|
| **P14-SCORE-01** | 处置 `globalTrendScore`（σ=0 占 10 分）与 `percentileRank`（100% 失效） | 🔴 高 | P12 全部完成并稳定 |
| **P14-SCORE-02** | 门槛 70/75 重标定 | 🔴 高 | ADR-005 六项条件全满足 |

---

## 6. Definition of Done

**全局前置**（每个子任务无例外）：`npm run build` exit 0 · `npm run health:data` CRITICAL=0 · 三语 i18n 无混排 · 未触碰 `CLAUDE.md` Never-Commit 清单。

| 任务 | Build | Health | Shadow | Rollback 演练 | 业务验收（硬断言） |
|---|---|---|---|---|---|
| **P12-DATA-01** | exit 0 | CRITICAL=0 | 免（已由 ARCH-02 Scenario B 证明零影响） | revert 单文件已验证 | `News(conf≥70)` 覆盖股票数 ≥ 2400；**`BUY 数量波动 ≤ ±2`**；cron `sync-news` 耗时 < 25min |
| **P12-DATA-02** | exit 0 | CRITICAL=0 | ✅ **必须**：`REPLICATION = 3038/3038`；产出 EventType 分布报告 | revert 已验证（纯函数无存量） | `distinct EventType ≥ 12`；`BUYBACK_PROGRESS ≈ 330`、`BUYBACK_DECIDED ≈ 36`、`EQUITY_STOCK_OPTION ≈ 258`；**`adaptiveScore` 逐股变化 = 0**（未接线） |
| **P12-EXPLAIN-01** | exit 0 | CRITICAL=0 | 免（纯展示） | revert + rebuild + restart 已验证 | UI **零处**出现「AI 认为利好」；回购月报显示为「回购进度月报（例行）」；**`adaptiveScore` 逐股变化 = 0**；三语齐备 |
| **P12-GATE-01** | exit 0 | CRITICAL=0 | ✅ **必须**：新旧 Gate1 成分 diff，**逐只人工复核** | revert + 重跑 generate 已验证 | `EQUITY_STOCK_OPTION` 误拒 = 0；Gate1 拒绝数变化 **≤ ±2**（超出即熔断 revert）；每条拒绝均附 `evidence[]` |
| **P12-SCORE-01** | exit 0 | CRITICAL=0 | ✅ **必须**：全量 Shadow，`REPLICATION = 3038/3038` | **快照 + revert + 重跑 compute-scores 全流程演练通过** | **`BUY ∈ [31, 40]`**（超出即熔断）；`CROSS70_DOWN = 0`；**Large70 命中率 ≤ 基准 3×**（防大盘股偏袒）；`newsSentiment≠8` 股票数连续 14 天波动 <±15% |

**熔断规则**：任一硬断言超阈值 → **立即 revert，不得现场调参**。

---

## 7. Frozen Decisions

### 7.1 不可动摇的事实（均经生产实测，2026-07-17）

| # | 事实 | 证据 |
|---|---|---|
| F1 | adaptiveScore 分布正常 | μ=49.89 · median=50 · σ=10.18 · max=76；69 分仅 18 只（0.6%） |
| F2 | `globalTrendScore` 全市场 σ=0，占 10% 权重 | 3038 只同值；30 天在 4~7 波动；**不是 Bug** |
| F3 | `percentileRank ≤15%` 从不生效 | 对应 456 只，实际 **0 只**被挡下 |
| F4 | `relatedSymbolConfidence` 是来源类型标签，非匹配置信度 | 硬编码 95/50/25/20；distinct=6；**≥70 等价于「只要官方披露」** |
| F5 | News 覆盖被砍 7.2× | 6063 条/2791 只 → 739 条/388 只（`sync-news:218/221`） |
| F6 | BUYBACK 仅 7.9% 是真利好 | 决议 36 / 月报 330 / 结束 48 / 消却 6 / 処分 1 / 其他 36 |
| F7 | EQUITY 仅 13.0% 是真稀释 | 真増資 42 / 员工期权 258 / 其他 22 |
| F8 | newsSentiment 数学上影响 ≤ ±4.7 分 | 权重 0.10–0.15 × 15 分维度 |
| F9 | EARNINGS+OTHER 79.8% 永久无方向 | 4837 条；Disclosure **无正文**；无 LLM |
| F10 | Shadow 口径可 100% 复现生产 | `REPLICATION ok=3038 bad=0` |

### 7.2 已证伪清单（🚫 禁止复活）

| 已证伪 | 真相 |
|---|---|
| × 大量股票卡在 69 分 | 仅 18 只（0.6%），分布正常 |
| × GlobalTrend 是 Bug | 是 Design + Weight，代码无缺陷 |
| × GlobalScore 恒等 = 异常 | σ=0 是设计必然，异常的是给它 10 分权重 |
| × Sentiment 分类器是根因 | 分类器是表层，根因是 EventType 缺失 |
| × BUYBACK = POSITIVE | 仅 7.9% 是真利好（Shadow 证伪） |
| × EQUITY = NEGATIVE | 仅 13.0% 是真稀释 |
| × BUY 会到 90–130 | 实测 49（错误规则）/ 33–35（正确规则） |
| × 解除覆盖是最高危 | 实测对推荐逐股零影响，最安全 |
| × V2 致 Gate1 大量新增拒绝 | 实测 `GATE1_NEWLY_REJECTED = 0` |
| × `relatedSymbolConfidence` 是匹配置信度 | 是硬编码来源类型标签 |
| × `take:200` 是必要性能约束 | nginx 60s 约束早已消失 |

> 其中 **3 条源自直觉推断而非数据**（卡 69 分 / BUY 90–130 / 解除覆盖最高危），全部被生产实测推翻。
> **这是本 Baseline 存在的理由：拒绝直觉，只认数据。**

### 7.3 确定的问题清单

- **根因**：EventType 缺失（Design gap）
- **Bug**：`「自己株式の取得」` 词表失配 · Gate1 无条件拒绝 EQUITY（既有生产缺陷）
- **Technical Debt**：News 覆盖双重过滤 · 双分类器 · sync-news 二次覆盖 · `relatedSymbolConfidence` 命名误导
- **Design + Weight**：`globalTrendScore` σ=0 占 10 分 · `percentileRank` 死条件
- **Data Issue（不可修）**：EARNINGS/OTHER 79.8% 无方向

### 7.4 冻结清单（🚫 未经新 ADR 不得改动）

| 对象 | 依据 |
|---|---|
| `GlobalTrend` 计算逻辑 | ADR-004（不是 Bug） |
| `Recommendation Engine` | P11 全程未发现缺陷 —— 问题全在输入 |
| `70 / 75 门槛` | ADR-005（25% 权重失效） |
| `Prisma Schema` / 新增列 | ADR-001（纯函数，revert 即回滚） |
| `percentileRank` 公式 | 待 P14 决策 |
| `Portfolio Builder` / `Closing Decision` / `Watchlist Engine` | P11 未涉及，无证据 |
| `Cron` 调度 | 窗口充裕（198s / 30min） |
| `AI Top Picks` 打分与排序 | 仅改 Gate1 判据（P12-GATE-01） |
| **对 EARNINGS/OTHER 猜方向** | F9 —— `の` 失配就是这么来的 |

### 7.5 期望管理（必须写进每份 P12 汇报）

> **修好 Sentiment 几乎不改变推荐结果（BUY 31 → 33~35）。**
> 收益在 **数据覆盖（7.2×）+ 可解释性 + Gate 正确性**，**不在分数**。
> 想让 BUY 数量实质变化，只能走门槛/权重路线（P14），而那要求先处置 **25% 失效权重**。
> **任何承诺「修 Sentiment 让 BUY 大幅增加」的方案，违反 ADR-003，直接驳回。**

### 7.6 决策速查

| 有人提议… | 依据 | 裁决 |
|---|---|---|
| 「BUYBACK 是利好，判 POSITIVE」 | ADR-001 / F6 | ❌ 驳回（82.7% 是例行月报） |
| 「GlobalTrend 全市场同值，修一下」 | ADR-004 / F2 | ❌ 驳回（不是 Bug，是权重决策 → P14） |
| 「顺便把门槛调到 65」 | ADR-005 / F3 | ❌ 驳回（25% 权重失效，坏地基找平） |
| 「加个 `sentimentVersion` 列好回滚」 | ADR-001 | ❌ 驳回（纯函数，revert 即回滚） |
| 「Explain 显示 AI 判断更直观」 | ADR-002 | ❌ 驳回（防线必须说事实） |
| 「先做 Score 见效快」 | §5.2 铁律 2 | ❌ 驳回（Explain 必须先行） |
| 「EARNINGS 标题有『増収』就判利好」 | F9 / §7.4 | ❌ 驳回（v1 老路，`の` 失配同源） |

---

## 附录 · P11 任务索引

| 任务 | 类型 | 核心产出 |
|---|---|---|
| P11-SCORE-01 | Analysis | adaptiveScore 分布正常（F1）；`percentileRank` 从不生效（F3） |
| P11-SCORE-02 | Analysis | `globalTrendScore` 是 Design+Weight 非 Bug（F2）；`newsSentimentScore` 是 Data 问题 |
| P11-DATA-01 | Analysis | `relatedSymbolConfidence` 是来源类型标签（F4） |
| P11-DATA-02 | Analysis | `take:200` 约束已消失；覆盖可安全扩展 |
| P11-DATA-03 | Analysis | `の` 失配 Bug；双分类器；二次覆盖；EARNINGS/OTHER 无方向（F9） |
| P11-ARCH-01 | Design | 首版 Sentiment V2 设计（**其 BUYBACK→POSITIVE 规则后被 ARCH-02 证伪**） |
| P11-ARCH-02 | Shadow | `REPLICATION 3038/3038`（F10）；证伪 BUYBACK=POSITIVE（F6）与 EQUITY=NEGATIVE（F7）；实测风险重排 |
| P11-ARCH-03 | Design Freeze | 三层架构（Event / Explain / Score）最终定稿 |
| P11-FREEZE-01 | Freeze | ADR-001~005；Apply 顺序；DoD |
| P11-DOC-01 | Documentation | 本文档 |

---

## 附录 B · P12 实施状态索引

> ⚠️ 本节**只记录实施进度与实测勘误线索**，不构成对上文冻结决策的修改。
> 冻结正文（§1–§7）的任何变更，仍须新开 ADR。

| 任务 | 状态 | 版本 | Commit | 备注 |
|---|---|---|---|---|
| **P12-DATA-01** · EventType 数据层 | ✅ 已完成（2026-07-17） | v18.9.0 | 见 CHANGELOG | 按 **ADR-001 采用纯函数不落库**；零 Schema 改动；推荐结果零变化（实测） |
| **P12-INFRA-01** · 摄入管线审计 | ✅ 已完成（2026-07-17） | — | — | 确认 API/scripts 两套实现；TDnet 已实际漂移 |
| **P12-INFRA-02** · 提取 Ingestion Core | ✅ 已完成（2026-07-17） | v18.9.2 | 见 CHANGELOG | **Zero Wiring —— 已提取，未接线**。生产入口 7/7 与 e1c6f60 逐字节相同；删除重复代码 0 行 |
| **P12-INFRA-03** · **切 News Admin API** | ✅ 已完成（2026-07-17） | v18.10.0 | 见 CHANGELOG | **仅接线 `app/api/sync/news/route.ts` 一处**；外部行为与 e1c6f60 一致；`durationMs=null` 保留；TDnet 未纳入。**观察期 ≥3 自然日进行中** |
| P12-INFRA-04 · **后切 scripts** | 🚫 观察期未结束前禁止开始 | — | — | cron 命脉，必须最后；需先实跑 `npx tsx scripts/sync-news.ts` 验证 |
| P12-INFRA-05 · 删除重复代码 | ⏸ 未开始 | — | — | 含处置孤儿 `/api/sync/route.ts` |
| P12-INFRA-06 · **TDnet 行为裁决** | ⏸ 未开始 | — | — | code4 / title / **catalystScore** 漂移，需先裁决再统一 |
| P12-DATA-02 · 解除 sync-news 双重过滤 | ⏸ 未开始 | — | — | 编号说明见下 |
| P12-EXPLAIN-01 · Explain 改讲事实 | ⏸ 未开始 | — | — | ADR-002：必须先于 Gate/Score |
| P12-GATE-01 · Gate1 改用 EventType | ⏸ 未开始 | — | — | 需 Shadow 复跑 |
| P12-SCORE-01 · newsSentiment 接 eventScore | ⏸ 未开始 | — | — | 需快照 + Shadow |
| P14-SCORE-01 / -02 · 权重与门槛 | 🚫 冻结 | — | — | ADR-005 六项条件 |

**编号偏离备案**：§5.1 中 DATA-01 = 解除双重过滤、DATA-02 = EventType SSOT；
实际实施时按指令对调（EventType 先行，且明令本轮不得解除过滤）。二者均为零推荐影响，
不违反任何 ADR，仅为顺序重排，特此备案。

### 实测勘误线索（待新 ADR 确认，正文暂不修改）

| 条目 | 冻结正文所述 | P12-DATA-01 实测 | 影响 |
|---|---|---|---|
| **F7** `EQUITY 仅 13.0% 是真稀释` | 真増資 42 / 322 = 13.0%；员工期权 258 = 80.1% | **真融资 150 / 321 = 46.7%**；员工期权 107 = 33.3%（30 日，样本已人工核验） | 🟡 **数量级需勘误**。根因：ARCH-02 临时分桶脚本把 `新株予約権` 判在 `第三者割当` 之前，将 MSワラント（第三者割当による新株予約権）误计为员工期权。**核心结论不受影响** —— 53.3% 仍非稀释融资，故「EQUITY≠NEGATIVE」与「Gate1 无条件拒绝 EQUITY 是缺陷」依然成立。留待 P12-GATE-01 开 ADR 处理。 |
| **F6** `BUYBACK 仅 7.9% 是真利好` | 月报 330 / 457 = 72.2% | **月报 403 / 572 = 70.5%**（含 News，30 日） | 🟢 **独立复现，结论稳固**。 |

### 新增遗留项（P11 未记录）

1. `app/api/sync/news/route.ts`、`app/api/sync/tdnet/route.ts` 与 `scripts/sync-news.ts`、
   `scripts/fetch-tdnet.ts` 是**两套并行重复实现**（共 5 个写入点）。后续任何摄入侧改动
   若只改 scripts，API 路径将静默不一致。
   → P12-INFRA-01 已审计；INFRA-02 已提取 Core（未接线）；切换见 INFRA-03/04/05。
   **News 两套确为复制品（219/318 行逐字相同）；TDnet 两套是不同程序**，
   已确认漂移：api 丢 `code4` / 不更新 `title` / **完全跳过 `catalystScore`**（评分输入静默分裂）
   / 天数 3 vs 5 / SyncLog 公式各异 / 日期字符串 UTC vs 本地。**归属 P12-INFRA-06 先裁决后统一。**
2. `News.category`（IR/MARKET/OTHER/EARNINGS/DIVIDEND/GUIDANCE/BUYBACK）与
   TDnet `DisclosureCategory`（EARNINGS/FORECAST_REVISION/BUYBACK/DIVIDEND/EQUITY/MATERIAL/OTHER）
   **是两套不通用的词表**。任何跨表按 category 聚合的逻辑都必须同时覆盖两套。

---

**P11 全系列封存。本 Baseline 为此后所有评分开发的唯一依据。**
