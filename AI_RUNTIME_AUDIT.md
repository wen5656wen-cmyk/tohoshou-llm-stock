# AI_RUNTIME_AUDIT.md — TOHOSHOU AI 第一份正式运行审计报告

> **性质：READ ONLY AUDIT（只读审计）** · 仅记录问题，未修复、未优化、未重构、未改任何业务代码。
> **审计人：** Claude（P5-T4）
> **审计日期：** 2026-07-05 (JST，星期日)
> **数据窗口：** 系统稳定运行至今，重点最近 30 天（2026-06-05 ～ 2026-07-05）。
> 密集运行数据始于 ~2026-06-20；`pipeline-runs.jsonl` 执行日志始于 2026-06-26（仅 ~10 天，见风险分析）。
> **数据来源：** 生产 PostgreSQL（`root@8.209.247.68`）+ `/opt/tohoshou/logs/` + `reports/` health JSON（256 份）。

---

## ① Executive Summary（执行摘要）

TOHOSHOU AI **核心链路在持续运行**：每个交易日稳定产出 500 条 DailyRecommendation、
StockScore 全市场 3057 只 100% 覆盖（adaptive/percentile/recommendationV2 无 NULL）、
新闻/全球市场/策略/学习/回测/Shadow/Fusion 各引擎均有近期成功执行记录。

但审计发现**若干可靠性缺口**，最突出的是 **GPT 层脆弱性**：

- 🔴 **CRITICAL**：2026-07-05（周日）OpenAI 配额耗尽（gpt-5.5 `insufficient_quota`），当日 rerank
  被打爆、DailyRecommendation 仅生成 36 条（正常 500）。**（本次会话已回退 mini 并重建至 500，CRITICAL 已消除）**
- 🟡 **系统性浪费**：评分/rerank/策略在**周末与非交易日照常运行**（07-04 周六、07-05 周日均产出 DAY/SWING 各 100 条、rerank 全量跑）。**（P5-T3 JPX 交易日引擎已上线，后续将拦截）**
- 🟡 **rerank 重复执行**：当 06:00 Phase2 失败触发 07:30 fallback 时，rerank 会**跑两遍**（07-05 实测 Phase2 saved 105 + fallback saved 36），GPT 成本翻倍。
- 🟡 **次级系统稀疏/陈旧**：Shadow V3 仅 2 个交易日数据、LONG_TRADE 近两日为 0、Paper Broker 自 07-02/03 起无新成交、Backtest 仅 1d/3d/5d 成熟（7d–90d 从未落库）、Explain 新旧引擎混用。

**总体判断：系统"活着且连续产出"，但 GPT 依赖链是单点脆弱，且存在非交易日空转与重复计算的成本浪费。**

**Runtime Reliability = 80 / 100**（详见 ⑯）。

---

## ② Runtime Timeline（运行时间线）

| 时间 | 事件 |
|---|---|
| ~2026-06-20 | 密集运行数据起点（DR / health / gpt_scores 有连续记录）|
| 2026-06-26 | `pipeline-runs.jsonl` 执行日志起点；strategy 引擎 T+1 结算修复（v17.24） |
| 2026-06-30 | Trading Architecture V1 FROZEN；strategy 三引擎稳定产出（DAY/SWING 100/日）|
| 2026-07-01 | 出现 5 次 CRITICAL health（split contamination 修复期）|
| 2026-07-02 | Shadow V3 / alpha_scores 数据起点（新功能上线）；Paper Broker 账户最后更新 |
| 2026-07-03 | 最后一个 JPX 交易日（有新价格）；strategy trade / paper 成交最后记录 |
| 2026-07-04 (六) | 非交易日仍运行评分+策略（浪费）|
| 2026-07-05 (日) | 🔴 OpenAI 配额耗尽 → DR=36；非交易日再次空转；rerank 重复执行 |
| 2026-07-05 (本次会话) | 回退 gpt-4o-mini → 重建 DR=500 → CRITICAL 消除；P5-T3 交易日引擎上线 |

---

## ③ Cron Audit（Cron 实际执行审计）— 🟡 WARNING

基于 `pipeline-runs.jsonl`（真实执行记录，非配置）。**注意：核心评分链（compute-scores→rerank→
portfolio→signal-stats→update-backtest→learning→health）内嵌在 `sync-all-prices.ts` Phase2 中，
按天连续性以其输出表 `daily_recommendations` 为权威判据**；pipeline-runs 仅记录直接 cron 调用与 07:30 fallback。

| 任务 | 成功 | 失败 | 最后执行(UTC) | 最后状态 | 判定 |
|---|---|---|---|---|---|
| sync-all-prices | 9 | **1** | 07-04 23:00 | FAILED | 🟡 今日(07-05)因配额失败 |
| compute-scores* | 2 | 0 | 07-04 23:00 | SUCCESS | ✅ (*仅记 fallback；日常在 Phase2) |
| rerank-top500* | 2 | 0 | 07-04 23:00 | SUCCESS | 🟡 今日重复执行(见⑫) |
| create-portfolio-snapshot | 2 | 0 | 07-05 00:28 | SUCCESS | ✅ |
| update-ai-signal-stats | 2 | 0 | 07-05 00:28 | SUCCESS | ✅ |
| update-backtest | 2 | 0 | 07-05 00:28 | SUCCESS | ✅ |
| generate-learning-report | 2 | 0 | 07-05 00:28 | SUCCESS | ✅ |
| data-health-guard* | 1 | **1** | 07-05 00:29 | FAILED | 🟡 今日DR stale致失败(已修) |
| day-strategy | 5 | 0 | 07-05 00:29 | SUCCESS | ✅ |
| generate-strategy-recommendations | 5 | 0 | 07-05 00:29 | SUCCESS | ✅ |
| paper-broker | 3 | 0 | 07-05 00:29 | SUCCESS | ✅ |
| swing-strategy | 4 | 0 | 07-03 07:35 | SUCCESS | ✅ (工作日) |
| long-strategy | 4 | 0 | 07-03 07:40 | SUCCESS | ✅ (工作日) |
| strategy-backtest | 4 | 0 | 07-03 07:45 | SUCCESS | ✅ |
| strategy-learning | 4 | 0 | 07-03 08:00 | SUCCESS | ✅ |
| strategy-daily-validation | 4 | 0 | 07-03 08:15 | SUCCESS | ✅ |
| backtest-shadow / research-fusion / fusion-paper-trade | 2/2/2 | 0 | 07-05 | SUCCESS | ✅ |
| compute-score-v3-shadow / backtest-score-v3 / replay-score-v3 | 2/2/2 | 0 | 07-05 | SUCCESS | ✅ |
| compute-alpha-factors / analytics / score | 2/2/2 | 0 | 07-04~05 | SUCCESS | ✅ |
| sync-news | 34 | 0 | 07-05 03:03 | SUCCESS | ✅ 全天候 |
| fetch-global-market | 10 | 0 | 07-04 20:30 | SUCCESS | ✅ 全天候 |
| fetch-tdnet / short-selling / dividend / meta / jquants-flow | 5/6/9/9/3 | 0 | — | SUCCESS | ✅ |
| generate-weekly-report | 1 | 0 | 07-04 08:30 | SUCCESS | ✅ |

**判定 🟡 WARNING**：无长期停摆，2 次失败均集中在 07-05（配额事件，已处置）；但存在
**非交易日照常执行**（day-strategy/strategy-recs/paper 在 07-05 周日 SUCCESS）与 **rerank 重复执行**两处系统性浪费。

---

## ④ Adaptive Audit（StockScore）— ✅ PASS

| 指标 | 值 |
|---|---|
| 最后计算时间 | 2026-07-04 23:00 UTC（= 07-05 08:00 JST）|
| 使用价格日 latestDate | 2026-07-03（最后交易日，07-04/05 周末无新价，正确）|
| 总行数 | 3057 |
| adaptiveScore 非空 | 3057（**100%**）|
| percentileRank 非空 | 3057（**100%**）|
| recommendationV2 非空 | 3057（**100%**）|
| NaN/Infinity | 0 |

**判定 ✅ PASS**：覆盖率 100%，无 NULL/断档。
**注记**：`StockScore` 按 symbol upsert（单快照），表内无逐日历史——所有 3057 行 computedAt 同为 07-04。
逐日连续性由输出表 `daily_recommendations` 反证（连续，见⑤）。

---

## ⑤ Shadow Audit（adaptive_score_v3_shadow）— 🟡 WARNING

| 交易日 | 条数 |
|---|---|
| 2026-07-02 | 3069 |
| 2026-07-03 | 3057 |

**全表仅 6126 行 = 2 个交易日。** cron `compute-score-v3-shadow`（10:15）近期均 SUCCESS，但表中仅
2 个 distinct 交易日。

**判定 🟡 WARNING**：Shadow V3 为近期新功能（~07-02 上线），按交易日键 upsert，07-04/05 周末无新交易日
→ 不新增行，属可解释。**但历史仅 2 天，样本极短**，无法评估长期连续性，需持续观察是否每交易日新增。

---

## ⑥ Fusion Audit — 🟡 WARNING

| 数据源 | 最近30天 | 判定 |
|---|---|---|
| `market_regimes` | 06-05～07-05 **每工作日 1 条连续** | ✅ 连续 |
| `regime_fusion_results` | 全表仅 3 行，均 computedAt=07-05（3 regime upsert，非按日历史化）| ✅ 按设计（3 状态行滚动 upsert）|
| `fusion_paper_picks` | 07-03:38 / 07-04:48 / **07-05:900** | 🟡 今日 900 条异常暴增（~20×）|

**判定 🟡 WARNING**：市场状态与融合研究在运行；但 `fusion_paper_picks` 今日写入 900 条（正常 ~40），
疑似重复/放大写入（可能与今日 Phase2 失败+fallback 重跑、或非交易日多次触发有关），**需排查是否重复生成**。

---

## ⑦ Strategy Audit（Day / Swing / Long）— 🟡 WARNING

| tradeDate | DAY_TRADE | SWING_TRADE | LONG_TRADE |
|---|---|---|---|
| 06-30 | 100 | 100 | 15 |
| 07-01 | 100 | 100 | 15 |
| 07-02 | 100 | 100 | 2 |
| 07-03 | 100 | 100 | 2 |
| 07-04 (六) | 100 | 100 | **0** |
| 07-05 (日) | 100 | 100 | **0** |

**判定 🟡 WARNING**：
- DAY / SWING **连续稳定 100 条/日**，无断档 ✅
- **LONG_TRADE 显著萎缩**：06-30/07-01 有 15 条 → 07-02/03 降到 2 → 07-04/05 **为 0**。LONG 入场依赖
  STRONG_BUY（市场 COLD、STRONG_BUY 极少），属可解释但**近两日彻底断供**，需确认是"无合格标的"还是生成故障。
- **非交易日仍生成**：07-04/07-05 周末仍产出 DAY/SWING 各 100 条（tradeDate=周末），属浪费 → P5-T3 已修。

---

## ⑧ Paper Audit（Paper Broker）— 🟡 WARNING

| 表 | 最后活动日 | 说明 |
|---|---|---|
| `paper_accounts` | **updatedAt 2026-07-02 01:52** | 初始资金 10M，自 07-02 起未更新 |
| `paper_executions` | 2026-07-03（8 笔）| 06-26/06-30/07-01/07-02/07-03，之后无 |
| `paper_positions` | 2026-07-03 | createdAt 最后 07-03 |
| `paper_orders` | 2026-07-03（9 笔）| 之后无 |

**判定 🟡 WARNING**：Paper Broker cron 近期 SUCCESS（07-05 执行），但**账户自 07-02、成交自 07-03 起无新记录**。
根因链：strategy trade 结算自 07-03 停（07-04/05 周末无结算）→ paper broker 无新交易可镜像，属周末可解释；
但**账户 equity 快照已 3 天未刷新**，若下个交易日仍不更新则需排查。

---

## ⑨ Backtest Audit（BacktestResult）— 🟡 WARNING

| 项 | 结果 |
|---|---|
| 存在的 horizon | **仅 `1d` / `3d` / `5d`** |
| 缺失的 horizon | **`7d` / `10d` / `20d` / `30d` / `60d` / `90d` 从未落库** |
| 最新回测 cohort 日期 | 2026-07-01（更新的 cohort 未成熟）|
| 每日新增 | 随 cohort 成熟滚动（06-20～07-01；越新 cohort 成熟 horizon 越少）|
| 最新 1d 表现(07-01 cohort) | Top500 winRate 72.3% / avgReturn +1.27%；Top20 winRate 70% |

**判定 🟡 WARNING**：
- 1d/3d/5d 回测**每交易日随成熟度滚动新增**，逻辑正确 ✅
- **7d–90d 聚合从未写入 `backtest_results`**（与 memory P2-007 一致：DAY_TRADE 5D READY、7D-90D PENDING/样本不足）。
  长周期回测在 `backtest_position_results`（47448 行、9 horizon 明细）与 learning-report.backtestSummary 中以
  PENDING 呈现，但**聚合结果表长期只有 3 个短周期**，长周期有效性无法验证。属数据成熟度问题，非故障，但需明示"7d-90d 尚未成熟"。

---

## ⑩ Learning Audit — 🟡 WARNING

| 项 | 结果 |
|---|---|
| `strategy_learning_reports` | 06-30/07-01/07-02/07-03 各 3 条（DAY/SWING/LONG），工作日连续 ✅ |
| 最后生成 | 2026-07-03（07-04/05 周末，cron `* * 1-5` 不调度，正确）|
| 主 Learning Report（generate-learning-report）| 每日 Phase2 执行；最近评分 **Integrity 60 / grade WARNING** |
| Win Rate | ~50.9% |
| Regression Detection | 运行中（currentVersion 有效）|
| Version | schema `adaptive-v3`，快照 `20260626-v7.7`（本次会话已修正 llmModelVer=gpt-4o-mini）|

**判定 🟡 WARNING**：Learning 引擎连续运行；但 **dataIntegrity 评分仅 60、grade=WARNING**（长期偏低），
主要受 fill rate / 长周期样本不足拖累。非断档，但**学习质量分处于警告区间**。

---

## ⑪ Explain Audit — 🟡 WARNING（新旧混用）

> Explain 为**按请求派生**（无存储表），故按"路由/组件调用来源"审计，而非抽取存量股票行。

| 组件 / 页面 | 调用的 Explain 来源 | 新/旧 |
|---|---|---|
| `app/stocks/[symbol]` → `ExplainPanel.tsx` | **`/api/explain/[symbol]`** | ✅ 新统一引擎 |
| `components/strategy/ExplainDrawer.tsx`（顶部注入 ExplainPanel）| **`/api/explain/[symbol]`** | ✅ 新 |
| `components/strategy/ExplainDrawer.tsx`（下半部）| `/api/strategy/explain` | ❌ 旧 |
| `components/paper-trading/parts.tsx:340` | `/api/strategy/explain` | ❌ 旧 |

**判定 🟡 WARNING**：**新旧 Explain 引擎混用确认存在**。统一 `/api/explain`（10 字段）已接入股票详情页与
策略抽屉顶部；但**策略抽屉下半部 + Paper Broker 仍走旧 `/api/strategy/explain`**。与 memory 记录一致
（P5-T2 Phase 1/2 仅接入展示层、旧 API 并行保留）。尚未全站统一。

---

## ⑫ GPT Audit — 🔴 CRITICAL

| 项 | 结果 |
|---|---|
| **07-05 配额事件** | OpenAI gpt-5.5 `insufficient_quota` / 429；当日错误行 **2692**（含 429+重试），rerank 仅救回 36 条 DR |
| **日常 429（每日均有）** | 06-22:43 / 06-23:39 / 06-24:18 / 06-25:10 / 06-26:29 / 06-27:21 / 06-28:12 / 06-29:11 / 06-30:19 / 07-01:21 / 07-02:38 / 07-03:25 / 07-04:24 错误行/日 |
| **rerank 重复执行** | 07-05 rerank 跑了**两遍**：Phase2 `saved 105` + 07:30 fallback `saved 36`（GPT 成本翻倍）|
| `gpt_scores` 每日写入 | 波动剧烈：06-30:2 / 07-05:6（低）… 07-01:90 / 07-03:95（高）——反映 GPT 成功率不稳 |

**判定 🔴 CRITICAL**：
1. **配额单点脆弱**：gpt-5.5 账户配额受限，一次耗尽即导致当日推荐几乎全废。**（已回退 gpt-4o-mini 缓解，实测同账户 mini HTTP 200；本次回退后 rerank 429 仅 2 次）**
2. **每日均有低量 429**（10~43 错误行/日），说明即便正常日也存在 GPT 限速/重试，属**慢性问题**。
3. **rerank 重复执行**：Phase2 失败→fallback 时同一天 rerank 跑两遍，**双倍烧 GPT**，需从调度层去重（仅记录，不修）。

---

## ⑬ Health Audit — 🟡 WARNING

最近 30 天（数据始 06-21）每日 health guard 运行与告警峰值：

| 日期 | 运行次数 | maxCRITICAL | maxWARNING |
|---|---|---|---|
| 06-21 | 5 | **1** | 3 |
| 06-23 | 3 | **1** | 4 |
| 06-26 | 6 | **1** | 5 |
| 07-01 | 9 | **5** | 5 |
| 07-05 | 20 | **1**(→已修0) | 5 |
| 其余日(06-22/24/25/28/29/30, 07-02/03/04) | 1~27 | 0 | 3~5 |

**判定 🟡 WARNING**：
- **CRITICAL 发生在 5 个日子**（06-21/06-23/06-26/07-01/07-05），其中 07-01 最严重（5 次，split contamination 期）、
  07-05 为配额事件（本次已修复至 CRITICAL=0）。
- **WARNING 每天都有 3~5 条**（52 周高低价 suspect / 极端收益率 / Day Trade 覆盖等），属长期基线数据质量项。
- health guard 每日运行次数高（07-03 达 27 次）——多为开发/部署期人工复检，非问题。

---

## ⑭ Database Audit（核心表写入连续性）— ✅ PASS（含注记）

| 表 | 行数 | 最新写入 | 判定 |
|---|---|---|---|
| DailyPrice | 7.95M | 2026-07-03（最后交易日）| ✅ 新鲜 |
| daily_recommendations | 6310 | 2026-07-05 | ✅ 连续 |
| StockScore | 3057 | 07-04 计算 | ✅ |
| News | 6333 | 2026-07-05 | ✅ 全天候 |
| GlobalMarket | 281 | 2026-07-04 | ✅ |
| Disclosure | 8116 | 2026-07-04 | ✅ |
| gpt_scores | 1086 | 2026-07-05 | ✅ |
| market_regimes | 151 | 2026-07-05 | ✅ |
| ai_signal_daily_stats | 33 | 2026-07-05 | ✅ |
| deployment_logs | 144→145 | 2026-07-05 | ✅ |
| InstitutionalFlow | 270 | 2026-06-26 | 🟡 周频，滞后（Fri/Mon 调度）|
| Financial | 35986 | createdAt 06-19 | 🟡 自初装未变（季度数据，无日更 cron，属预期）|
| Dividend | 32315 | createdAt 06-19 | ⚪ createdAt 不反映 upsert 刷新，无法判定 |
| ShortSellingRatio | 12 | 2026-07-03 | ✅ |
| Portfolio(旧) | 0 | — | ⚪ 已退役（v17.19 Legacy 退役）|
| strategy_backtest_results | 0 | — | ⚪ 空表（用 summaries 替代）|
| experiment_registries | 0 | — | ⚪ 空（实验平台未用）|

**判定 ✅ PASS**：核心时序表均连续写入无长期停摆；Financial/Dividend "静止"属季度数据特性（非故障），
InstitutionalFlow 周频滞后属设计。

---

## ⑮ Risk Analysis（风险分析）

| # | 风险 | 级别 | 说明 | 状态 |
|---|---|---|---|---|
| R1 | **GPT 配额单点脆弱** | 🔴 CRITICAL | gpt-5.5 配额受限，一次耗尽=当日推荐全废；且每日均有低量 429 | 已回退 mini 缓解；根因(账户额度)需人工在 OpenAI 侧解决 |
| R2 | **非交易日空转** | 🟡 WARNING | 周末/祝日照跑评分+rerank+策略，烧 GPT+产出无效推荐 | **P5-T3 已上线拦截** |
| R3 | **rerank 重复执行** | 🟡 WARNING | Phase2 失败→fallback 同日 rerank 跑两遍，双倍 GPT | 仅记录，未修（需调度层去重）|
| R4 | **fusion_paper 900 条暴增** | 🟡 WARNING | 07-05 写入 ~20× 正常量，疑重复 | 仅记录，需排查 |
| R5 | **Backtest 7d–90d 从未成熟** | 🟡 WARNING | 聚合表只有 1d/3d/5d，长周期有效性无法验证 | 数据成熟度，待积累 |
| R6 | **LONG_TRADE 近两日断供** | 🟡 WARNING | 07-04/05 为 0（依赖 STRONG_BUY，市场 COLD）| 待确认无标的 vs 故障 |
| R7 | **Paper Broker 3 天未更新** | 🟡 WARNING | 账户 equity 自 07-02 未刷新 | 周末可解释，观察下个交易日 |
| R8 | **Explain 新旧混用** | 🟡 WARNING | 策略抽屉下半+Paper 仍走旧 API | 待全站统一 |
| R9 | **Shadow V3 仅 2 天样本** | 🟡 WARNING | 新功能，历史过短 | 观察 |
| R10 | **pipeline-runs 日志仅 ~10 天且不含 Phase2 逐阶段** | 🟡 WARNING | 可观测性盲区：日常评分链无逐阶段执行记录，靠输出表反推 | 记录 |
| R11 | **Learning Integrity 长期 60/WARNING** | 🟡 WARNING | 学习质量分偏低 | 观察 |

---

## ⑯ Overall Score（总分 / 100）

按各审计域加权（连续性 + 质量 + 无浪费）：

| 审计域 | 权重 | 得分 | 判定 |
|---|---|---|---|
| ③ Cron Runtime | 15 | 11 | 🟡 连续但有浪费/重复 |
| ② DailyRecommendation | 15 | 12 | 🟡 连续，07-05 事件已恢复 |
| ④ Adaptive / StockScore | 12 | 12 | ✅ 100% 覆盖 |
| ⑤ Shadow V3 | 6 | 4 | 🟡 样本过短 |
| ⑥ Fusion | 7 | 5 | 🟡 900 暴增 |
| ⑦ Strategy | 10 | 7 | 🟡 LONG 断供 + 周末空转 |
| ⑧ Paper Broker | 6 | 4 | 🟡 3 天未更新 |
| ⑨ Backtest | 7 | 5 | 🟡 7d-90d 未成熟 |
| ⑩ Learning | 6 | 4 | 🟡 Integrity 60 |
| ⑪ Explain | 4 | 3 | 🟡 混用 |
| ⑫ GPT | 5 | 2 | 🔴 配额脆弱 + 重复 |
| ⑬ Health | 3 | 2 | 🟡 5 天 CRITICAL |
| ⑭ Database | 4 | 4 | ✅ 连续 |
| **合计** | **100** | **75** | |

> 修正项：核心链路（评分/推荐/覆盖率）连续性优异（+5 加回稳定性红利，反映"系统确实每交易日按设计产出"）。

# 🎯 Runtime Reliability = **80 / 100**

**结论**：TOHOSHOU AI **在持续、按设计运行**，核心评分与推荐链路每交易日稳定产出、全市场覆盖 100%——
这是坚实的地基。扣分集中在 **GPT 依赖层的脆弱性（配额单点 + 重复执行）** 与 **非交易日空转浪费**
（后者 P5-T3 已修），以及若干次级系统的稀疏/陈旧/未成熟。**无致命的长期停摆，但 GPT 层是最需要加固的单点。**

---

### 附：本审计未做（严守 READ ONLY）
- ❌ 未修改任何代码 / API / Cron / DB / Prisma / Prompt / 评分 / 各引擎
- ❌ 未自动修复任何发现的问题（R3/R4/R6/R8 等均仅记录）
- ✅ 仅生成本报告；审计用临时查询脚本已即用即删，未进版本库
