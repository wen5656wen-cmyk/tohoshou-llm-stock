# P21-T1 · Governance Decision Report

> 100% 只读。未修改任何代码 / API / 数据库 / Schema / 导航 / 页面。未 commit / push / deploy。
> 日期：2026-07-21 ｜ 前置：P21-S0 ✅ · P21-S1 ✅ · P21-S2 ✅

---

## 1. Executive Summary

1. **审计缺口已关闭。** v3 补审完成（3 个子标签），**UNKNOWN 归零**，31 个治理单元全部有裁决。
2. **Research 与 Admin 均不可开放**，但阻断项的构成已改变 —— S1 引入了一个新的 **P0 生产缺陷**。
3. **最紧急的不是治理，是 API 分层。** 三个决策读取接口误挂在 `/api/admin/` 下，S1 加固后老板工作区处于**半可用割裂状态**：`/api/decision/*` 返回 200，`/api/admin/closing-decision|decision-center|decision-overview` 返回 401。这是**当前正在发生的产品缺陷**，必须先于一切治理工作。
4. **v3 发现一个组内导航全面失效**：5 个跨面板跳转按钮全是 no-op（`Hub:65` 遇 `key===active` 直接 return，而 NAV_MAP 把 calibration/freeze 都映射为 "v3"）。
5. **治理面从 31 降到 6** —— KEEP 仅 6 个单元，DELETE 5、MERGE 5、INTERNAL 15。

---

## 2. v3 补审结果

`?tab=v3`（Scoring V3）确切含 **3 个子标签**（`ResearchWorkspaceHub.tsx:82-86`），子标签为本地 state 不进 URL。

### 2.1 `shadow`（默认子标签）— ScoreV3Panel.tsx（218 行）

| 项 | 内容 |
|---|---|
| 实际职责 | 只读展示当日 Adaptive Score V3 影子评分全表（≤3000 行，渲染截 600），含评级分布、动态权重、维度覆盖、V2 对比、逐股 explanation、CSV 导出 |
| 数据来源 | `AdaptiveScoreV3Shadow`（`schema:1693`）+ `StockScore`（V2 对比列） |
| API | `GET /api/scoring-v3/shadow?limit=3000` |
| 是否仍被使用 | **是** —— `compute-score-v3-shadow.ts` 每日 **10:15 JST** cron 活跃写入（`cron-scheduler.ts:358-363`）；另有第二消费者 `research-overview/route.ts:69` |
| 是否重复 | **否** —— 与 alpha:score 概念相似但表不同、算法不同（V3 = 动态权重+风险层+regime 门控；Alpha = 因子合成） |
| 独立价值 | 全站唯一可见 `scoreV3 / confidence / riskAdjustment / 动态权重 / 逐股中文 explanation` |
| 写操作 | 无 |
| 是否应继续存在 | **KEEP（INTERNAL）** |
| 缺陷 | 0% i18n（44 行 CJK 硬编码）；错误提示命令名错误（提示 `compute-scores`，实为 `compute-score-v3-shadow`）；跳转按钮 no-op |

### 2.2 `calibration` — CalibrationPanel.tsx（219 行）

| 项 | 内容 |
|---|---|
| 实际职责 | V3 标定报告：动态评级阈值切点、Confidence 分布、维度数据质量、STRONG_BUY 统计、就绪度 Grade（A 可上线 / B 继续 Shadow / C 调整 / D 禁止）、30 日历史 |
| 数据来源 | `AdaptiveScoreV3Calibration`（`schema:1721`，date 唯一），route 纯透传无计算 |
| API | `GET /api/scoring-v3/calibration` |
| 是否仍被使用 | **是** —— 同一 cron 每日 upsert；另被 `/api/scoring-v3/freeze` 与 `gen-v3-final-review.ts:19` 消费 |
| 是否重复 | **否** —— 无其它页面展示阈值/Confidence/Readiness |
| 独立价值 | 全站唯一的 V3 上线就绪度与动态阈值视图 |
| 是否应继续存在 | **KEEP（INTERNAL）**，建议与 freeze 合并为「V3 上线评审」 |
| **缺陷（严重）** | **空态会崩溃**：route 空数据返回 `{date:null}`（`route:9`），Panel 只判 `!d`（`:68`），随后 `cs.mean.toFixed(1)`（`:87`）抛 TypeError → 表一旦清空即白屏 |

### 2.3 `freeze` — FreezeMonitorPanel.tsx（218 行）

| 项 | 内容 |
|---|---|
| 实际职责 | 展示一次性「V3 Shadow Freeze v1」冻结验证期进度 + Replay 前向 V2 vs V3 收益 |
| 数据来源 | **硬编码常量** `lib/scoring-v3/freeze.ts:4-10`（commit ca95896，2026-07-03 → 2026-07-10，目标 90）+ Calibration 表 + **文件** `reports/score-v3-replay.json` |
| API | `GET /api/scoring-v3/freeze` |
| 是否仍被使用 | **功能上已过期** —— 今天 2026-07-21，`endDate=2026-07-10`，`isFreezeOver` 恒 true，已过期 11 天；但 cron 仍每日 10:35 跑 replay、**每周五 16:45 无限期重跑评审** |
| 是否重复 | **是** —— 每日就绪度历史与 calibration 子标签**完全同源同口径**（都读 Calibration 表） |
| 独立价值 | 唯一展示 Replay 前向收益证据；但「进度监控」价值已随窗口结束消失 |
| 是否应继续存在 | **DELETE** |
| 删除依据（代码级） | ① `FREEZE` 是硬编码一次性窗口且已过期 11 天（`freeze.ts:7-8`）；② 到期产物是 `docs/V3_FINAL_PRODUCTION_REVIEW.md` 供人读，不需 UI；③ 每日历史与 calibration 重复；④ `computedAt` 取 `new Date()`（`route:11,39`）—— **请求时刻冒充数据时刻** |

### 2.4 v3 组内导航全面失效（新发现）

`Hub:65` 的 `goTop` 遇 `key === active` 直接 return，而 `NAV_MAP:54` 把 `calibration`/`freeze` 都映射为 `"v3"` → 在 v3 组内点击任何跨面板按钮**既不换 URL 也不切子标签**。

失效按钮 **5 个**：`ScoreV3Panel:124,214` · `CalibrationPanel:97,216` · `FreezeMonitorPanel:103,215`
另有死代码：`CalibrationPanel:62` 的 `goScore` 定义后从未使用。

外部死链：`?tab=calibration` / `?tab=freeze` 全仓**零命中**，无外部链接指向它们（不构成死链）。

### 2.5 孤儿 API

`GET /api/scoring-v3/backtest`（17 行）**无任何前端消费者**（全仓 grep 仅自身 + 写脚本）→ **DELETE 或接入**。

---

## 3. 完整职责矩阵（31 个治理单元）

### 3.1 Research Hub `/admin/research`（17 单元）

| 单元 | 谁负责 | 数据源 | 独立价值 | 裁决 |
|---|---|---|---|---|
| overview | 研究运营驾驶舱 | mission-control API + research API | **无** | **DELETE** |
| factors:lib | AlphaFactor 矩阵浏览 | `alpha_factors` | CSV 导出 | INTERNAL |
| factors:registry | 静态代码常量镜像 | **无 DB 无 API** | 无 | INTERNAL |
| factors:promotion | 因子晋升建议 | `factor_alpha_results` | **有** | INTERNAL |
| factors:platform | cron 健康 + Integrity | 同上 + `GlobalMarket` | **有** | INTERNAL |
| alpha:score | 影子 vs 正式分歧 | `alpha_scores` ⋈ `stock_scores` | **有** | INTERNAL |
| alpha:analytics | 因子有效性 IC/夏普 | `alpha_factor_reports` | **有** | INTERNAL |
| alpha:fusion | 融合权重研究 | `RegimeFusionResult` | **有** | INTERNAL |
| alpha:regime | MarketRegime 历史序列 | `MarketRegime` | 历史序列 | INTERNAL |
| **v3:shadow** | V3 影子评分全表 | `AdaptiveScoreV3Shadow` | **有** | INTERNAL |
| **v3:calibration** | V3 就绪度与阈值 | `AdaptiveScoreV3Calibration` | **有** | INTERNAL |
| **v3:freeze** | 已过期冻结窗口 | 硬编码常量 + JSON 文件 | 已消失 | **DELETE** |
| learning | 每日学习报告 | 文件 `reports/latest-learning.json` | 部分 | **MERGE** |
| experiments:exp | 「AI 研发中心」 | **除 health 外全硬编码** | **无** | **DELETE** |
| experiments:versions | 版本对比 | `VersionSnapshot` + raw SQL | **有** | INTERNAL |
| backtest:strategy | 策略回测摘要 | learning-report 文件 | 无 | **MERGE** |
| backtest:alpha | 影子策略回测矩阵 | `AlphaBacktestResult` | **有** | INTERNAL |

### 3.2 Screener `/screener`（5 单元）

| 单元 | 数据源 | 独立价值 | 裁决 |
|---|---|---|---|
| screen | `/api/screener` + `GPTScore` | GPT 叠排、风格过滤 | **MERGE** → 股票中心 |
| sectors | `StockScore` 按 sector 聚合 | **有**（唯一 JPX 33 行业聚合） | **KEEP** |
| themes | **`AITheme` 唯一消费者** | **有**（供应链 5 层） | **KEEP** |
| news | **`News` 表唯一 UI** | **有** | **KEEP** |
| indicators | `/api/indicators` | **无** | **DELETE** |

### 3.3 `/stocks`（1 单元）

| 单元 | 数据源 | 裁决 |
|---|---|---|
| /stocks | **与 indicators 同一 API** | **DELETE**，排除股 universe 能力 **MOVE** 至管理区 |

### 3.4 System Hub `/admin/mission-control`（8 单元）

| 单元 | 写操作 | 独立价值 | 裁决 |
|---|---|---|---|
| overview | 无 | 有 | **KEEP**（须修假绿灯） |
| runtime | 无 | 有 | INTERNAL |
| health | 无 | 有 | **KEEP** |
| verify | 无 | 有 | INTERNAL |
| **sync** | **有（触发同步）** | 有 | INTERNAL（最高优先排除） |
| cron | 无 | **无** | **MERGE** → overview |
| deploy | Tab 无 | 有 | **KEEP** |
| log | 无 | **无** | **MERGE** → runtime |

---

## 4. 唯一权威入口矩阵

**原则：一个能力，只能有一个正式入口。**

| 能力 | 唯一权威入口 | 应删除/降级的旧入口 | 依据 |
|---|---|---|---|
| **业绩验证（胜率/收益/Alpha）** | **AI 战绩档案** `/decision-v2?tab=history` | learning · backtest:strategy · versions:compare · `/backtest` 独立页 | 同表 `backtest_position_results`，公式相同但**4 处独立实现**且时间窗不同 → 同名数字必然打架 |
| **全市场股票浏览** | **股票中心** `/decision-v2?tab=recommendations` | screen · indicators · `/stocks` | screen 与股票中心**同一 `/api/screener`**；indicators 与 `/stocks` **同一 `/api/indicators`** |
| **市场状态判定** | **Decision Overview** | alpha:regime（历史序列可留 INTERNAL） | 同表 `MarketRegime`，阈值相同但**代码重复两处** |
| **行业轮动** | **sectors** `/screener?tab=sectors` | — | 唯一 JPX 33 行业聚合 |
| **产业深研** | **`/deep-research`** | themes（战略重叠，长期需合流） | 两套平行分类法：`AITheme` vs `ResearchIndustry` |
| **公告** | **今日简报 TDnet 模块** | — | `Disclosure` 表 |
| **新闻情绪** | **news** `/screener?tab=news` | — | `News` 表，与 Disclosure **不同表不重复** |
| **系统健康** | **mc:overview** + **mc:health** | cron（overview 子集）· log（runtime 同 API） | cron/log 复用完全相同的 API |
| **日志观测** | **mc:runtime** | log | 同一 `/api/admin/runtime` |
| **因子研究** | **factors:promotion** | registry（静态无数据） | promotion 是唯一基于真实前向收益的晋升决策 |
| **V3 评审** | **v3:shadow + v3:calibration** | v3:freeze | freeze 的历史与 calibration 同源同口径 |
| **版本治理** | **experiments:versions** | experiments:exp（不读 `ExperimentRegistry`，名不副实） | exp 除 health 外全硬编码 |

---

## 5. KEEP / MERGE / DELETE / MOVE / INTERNAL

### DELETE（5）

| 单元 | 删除依据（代码级） |
|---|---|
| `research:overview` | 引擎状态硬编码假绿（`center.tsx:76-105`）；`steps.at` 字段错位致时间列恒空（期待 `at`，API 返 `lastRunAt`）；触发 618 行全表 JOIN 只用 `dataConfidence`+`overallCoverage` 两个字段；**无任何独立能力** |
| `experiments:exp` | 除 `/api/health/status` 外**全部硬编码**（`ExperimentsView:90-130`）；版本笔记写死会腐烂（`:124-130`）；6+ 导航链接指向非法 tab 静默落 overview；**不读 `ExperimentRegistry`**，名不副实 |
| `v3:freeze` | `FREEZE` 硬编码一次性窗口，`endDate=2026-07-10` 已过期 11 天（`freeze.ts:7-8`）；历史数据与 calibration 同源重复；`computedAt` 用 `new Date()` 冒充数据时刻（`route:11,39`） |
| `screener:indicators` | 决策字段（`tradingAction`/`positionSizePct`）股票中心已有，**无独占价值**；均线热力图因 `/api/indicators` 的 `ma5/ma20/ma60` 硬编码 null 而**永远是死功能**；与 `/stocks` 同 API |
| `/stocks` | **零入链孤儿**（`ROUTES.STOCKS` 零引用，全仓无 `href="/stocks"`）；与 indicators 同 API；`finCount` 硬编码 0 致「财报数」列**恒 0 误导**；`sort=technical` 参数不被任何代码读取（语义死链）；页面自述「完整选股功能请前往 AI选股」已承认自己是残留 |

**附**：孤儿 API `/api/scoring-v3/backtest` 无消费者 → 一并 DELETE 或接入。

### MERGE（5）

| 单元 | 并入 | 依据 |
|---|---|---|
| `learning` | AI 战绩档案 | 与 backtest:strategy 读**同一 JSON 同一 `backtestSummary` 字段**；胜率与战绩档案同源不同窗 |
| `backtest:strategy` | AI 战绩档案 | 4 个 API 中 3 个载荷基本丢弃（只用 `cohortCount`、`totalRows>0` 布尔）；同数据四处呈现 |
| `screener:screen` | 股票中心 | 与股票中心全市场视图**同一 `/api/screener`**；独有的 GPT 叠排应并入而非维持第二入口 |
| `mc:cron` | mc:overview | 复用**完全相同**的 `/api/admin/mission-control`（827 行）只渲染 4 个 KPI |
| `mc:log` | mc:runtime | 复用**完全相同**的 `/api/admin/runtime` |

### MOVE（1）

`/stocks` 的**排除股 universe 视图**（`excludeReason` / `aiExcludeSource` 徽章，`page.tsx:341-352`）→ 管理区 AI Universe 管理。理由：全站唯一展示该能力，但属运维语义。

### INTERNAL（15）—— 保留但永不进老板主导航

`factors:lib` · `factors:registry` · `factors:promotion` · `factors:platform` · `alpha:score` · `alpha:analytics` · `alpha:fusion` · `alpha:regime` · `v3:shadow` · `v3:calibration` · `experiments:versions` · `backtest:alpha` · `mc:runtime` · `mc:verify` · `mc:sync`

**判据**：含写操作 / 术语密度要求理解模型内部结构 / 回答的是工程问题而非业务问题。

### KEEP（6）—— 治理后可开放

`screener:sectors` · `screener:themes` · `screener:news` · `mc:overview` · `mc:health` · `mc:deploy`

**UNKNOWN：0**（v3 补审已关闭缺口）

---

## 6. Research 是否可以开放？

# ❌ 否

| 优先级 | Blocker | 证据 |
|---|---|---|
| **P0** | **API 分层导致老板工作区半可用**（先于一切） | `/api/decision/*` 200 vs `/api/admin/closing-decision\|decision-center\|decision-overview` 401，实测 |
| **P1** | 导航状态机冲突：`BOSS_SCREENER_TABS` 把 `?tab=sectors\|themes` 判回 boss，研究区点了即弹出 | `nav-config.ts:62-63` vs `:83,92-96` |
| **P1** | i18n：research 20/27 组件零 `useI18n()`，624 行硬编码中文 → ja-JP 用户见全中文 | grep 证据 |
| **P1** | stale tab 死链：`?tab=score`/`fusion`/`analytics`/`regime` 全部静默落 overview，致「影子评分/融合报告/市场状态」**从任何入口都点不进去** | `routes.ts` · `next.config.ts:18,20-22` · `/market-regime` 桩 vs `Hub:40-49` |
| **P1** | v3 组内 5 个跨面板按钮全 no-op | `Hub:65` + `NAV_MAP:54` |
| **P2** | `common.asOf.*` 零使用，research 存 5 种时间口径 | §T0 报告 |
| **P2** | `calibration` 空数据崩溃 | `CalibrationPanel:68,87` |
| **P2** | `/api/sectors:79` `computedAt = new Date()` 假时间 | 同上 |
| **P2** | `ResearchCalendar:39` UTC/JST 错位 | `toISOString().slice(0,10)` |

---

## 7. Admin 是否可以开放？

# ❌ 否，且比 Research 更不能

| 优先级 | Blocker | 证据 |
|---|---|---|
| **P0** | 同上 API 分层 P0 | 实测 |
| **P0** | `mc:sync` 含**直接影响评分与推荐链路的触发按钮**，开放导航等于让它可被发现 | `SyncView:378-386,430-437` → `POST /api/sync/scores` → 重写 3700+ StockScore |
| **P1** | `mc:overview` **假绿灯**：API/Database/AI Engine `ok:true` 硬编码，无任何实际探测 | `MissionControlView:134-135,166-168` |
| **P1** | 时间源仅修 2/13 步，其余 11 步仍读 `pipeline-runs.jsonl`，与今日简报的 DB 判据**可能矛盾** | `mission-control/route.ts:478-575` |
| **P1** | i18n：`MissionControlView`/`RuntimeView`/`VerifyView` 零 i18n，138 行硬编码 + 中英混排 | `VerifyView:82-88` |
| **P2** | `mc:verify` 暴露全部推荐明细与 GPT 评分 | 已被 S1 鉴权覆盖，但仍不宜给老板 |

> **安全说明**：S1/S2 已把 `/api/admin/*` 与 `/api/sync/*` 全部封闭（middleware + Route Guard 双保险，实测未授权全 401）。因此「开放工作区」不再等于「暴露公网」，但**导航可发现性**仍是真实风险 —— 已登录的运维误点 sync 会真实触发生产写入。

---

## 8. 最终建议导航结构

```
决策（boss · P19 IA Freeze 保持不动）
  概览            /decision-v2?tab=overview
  今日简报        /decision-v2?tab=strategy
  股票中心        /decision-v2?tab=recommendations   ← 吸收 screen 的 GPT 叠排
  行业分析        /deep-research
  AI Mission Lab  /decision-v2?tab=portfolio
  AI 战绩档案     /decision-v2?tab=history           ← 吸收 learning / backtest:strategy

研究（治理后开放，3 项）
  行业轮动        /screener?tab=sectors    ← 须先解除 BOSS_SCREENER_TABS 冲突
  主题研究        /screener?tab=themes     ← 同上
  新闻情绪        /screener?tab=news

系统（治理后开放，3 项）
  系统总览        /admin/mission-control?tab=overview   ← 须先修假绿灯 + 补齐 13 步时间源
  数据健康        ?tab=health
  部署记录        ?tab=deploy

内部（不进任何主导航；工程师手输 URL）
  /admin/research 全部 Tab（factors 4 · alpha 4 · v3 2 · versions · backtest:alpha）
  mc:sync · mc:runtime · mc:verify
  AI Universe 管理（承接 /stocks 的排除股视图）

已下线
  research:overview · experiments:exp · v3:freeze · indicators · /stocks
  mc:cron（并入 overview）· mc:log（并入 runtime）
  /api/scoring-v3/backtest（孤儿 API）
```

---

## 9. P21 后续任务拆分

| 任务 | 范围 | 风险 | 独立部署 | 停机 | 影响生产 |
|---|---|---|---|---|---|
| **P21-T2**（**最高优先**）API 分层迁移 | 3 个决策端点 `/api/admin/{closing-decision,decision-center,decision-overview}` → `/api/decision/*`，更新 `provider.tsx` 等 6 处调用方，旧路径保留 301 | **中** —— 触及老板工作区数据链路，须逐页回归 | ✅ | 否 | **是**（修复当前割裂状态） |
| **P21-T3** 减面积（DELETE 5 + MERGE 5 + MOVE 1） | 删除 5 个单元与其组件/路由；learning + backtest:strategy 能力并入战绩档案；screen 并入股票中心；cron/log 并入；排除股视图迁管理区 | 中 | ✅ | 否 | 是（页面消失） |
| **P21-T4** 导航修复 | `BOSS_SCREENER_TABS` 冲突、stale tab（`routes.ts` + `next.config.ts`）、v3 组内 no-op、`/stocks` 语义死链 | 低 | ✅ | 否 | 是（跳转行为变化） |
| **P21-T5** 6 个 KEEP 页 Design First | i18n（`useI18n` + zh/ja）、`common.asOf.*`、空态诚实、`/api/sectors` 假 computedAt | 低 | ✅（建议每页一轮） | 否 | 是 |
| **P21-T6** mc:overview 真实健康探测 | 假绿灯改真实探测；13 步时间源补齐（现 2/13） | 中 —— 触碰 827 行聚合 API | ✅ | 否 | 是 |
| **P21-T7** 开放与冻结 | IA Review → `ENABLED_WORKSPACES` 加 research/admin → `ws.comingSoon` 文案同步 | 低 | ✅ | 否 | 是 |

**建议顺序**：T2 → T3 → T4 → T5 → T6 → T7。
理由：T2 是**当前正在发生的缺陷**，与治理无关但优先级最高；T3 先减面积，避免给将删的页做 i18n；T4/T5/T6 依赖减面积后的稳定集合。

---

## 10. Final Recommendation

1. **立刻做 P21-T2**（API 分层）。它不是治理，是修一个 S1 引入的生产缺陷 —— 老板现在打开决策页会看到一半数据缺失。
2. **治理面只有 6 个单元**，不是 31 个。先执行 T3 减面积，让后续 i18n/Design First 的工作量从 31 降到 6。
3. **两个工作区都不能开放**，P0/P1 阻断项共 9 条。
4. **v3 保留 shadow + calibration，删除 freeze** —— 前两者有每日 cron 活跃写入与唯一数据，后者是过期 11 天的一次性实验。
5. **一并处置周五 16:45 的 `gen-v3-final-review` cron** —— 冻结已结束，它在无限期重跑。
6. 记录一个**本轮未处置的独立问题**：`/api/decision/*` 与 `/api/mission-lab` 对公网返回 200，其中含持仓、净值、推荐与业绩数据。这不是 R0 残留（它们从不在 `/api/admin/*` 范围内），而是一个产品决策：你的投研结论是否应当公开可读。安全阶段已冻结，未处理。

---

**报告结束。未修改任何代码。等待最终治理决策。**
