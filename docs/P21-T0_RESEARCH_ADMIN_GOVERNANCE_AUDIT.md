# P21-T0 · Research / Admin Workspace Governance Audit

> 只读审计，未修改任何代码 / API / 数据库 / 导航 / Schema。未 commit / push / deploy。
> 日期：2026-07-21 ｜ 方法：5 个 Fable 5 代理并行深读组件全文 + API route 实际查询逻辑 + 生产 curl 实测（仅 GET）

---

## 1. Executive Summary

**「19 个页面」是错误的问题框架。** 真实结构是 **3 个 Hub + 1 个孤儿页 + 20 个重定向桩**，Hub 内共 **25 个 Tab / 子标签**才是治理单位。

五项决定性结论：

1. **两个工作区都不能开放。** 研究区有导航状态机结构性冲突（R1）与 624 行硬编码中文；管理区含**无鉴权的生产写操作**。
2. **发现一个与 P21 无关、当前正在发生的 P0 安全暴露**：生产无 `middleware.ts`、无 `ADMIN_TOKEN`，`/api/admin/*` 与 `/api/sync/*` 公网可达。已实测 GET 返回真实推荐明细。
3. **「影子评分」「融合报告」「市场状态」目前从任何入口都点不进去** —— 多个跳转指向非法 tab，静默回落 overview。
4. **真正值得治理的只有 6 个单元**，其余 19 个应删除、合并或永久内部化。
5. **胜率公式在全站有 4 处独立实现**，且时间窗口不同 —— 同名「胜率」必然给出不同数字。

---

## 2. 全部页面清单（真实结构）

### 2.1 三个 Hub

| Hub | 路由 | 组件 | Tab 数 |
|---|---|---|---|
| 研究综合 | `/admin/research` | `components/research/ResearchWorkspaceHub.tsx` | 7 顶级 + 12 子标签 |
| 股票研究 | `/screener` | `components/research/StockResearchHub.tsx` | 5 |
| 系统总览 | `/admin/mission-control` | `components/system/SystemHub.tsx` | 8 |

**ResearchWorkspaceHub 合法顶级 tab**（`:40-49`）：`overview / factors / alpha / v3 / learning / experiments / backtest`
子标签（**本地 `useState`，不进 URL，刷新即丢**，`:63`）：
- `factors` → lib · registry · promotion · platform
- `alpha` → score · analytics · fusion · regime
- `experiments` → exp · versions
- `backtest` → strategy · alpha
- `v3` → v3 · calibration · freeze

### 2.2 孤儿页

`/stocks`（409 行真实页面）—— 全仓 **零入链**，`ROUTES.STOCKS` 零引用，只能手输 URL。

### 2.3 重定向桩（20 个 page.tsx + 12 条 next.config.ts）

全部目标存在，无循环（最深 2 跳）。但见 §8 的 stale tab 问题。

### 2.4 审计覆盖缺口（诚实声明）

**`v3` 顶级 tab（含 calibration / freeze 子标签）本轮未审计** —— 代理分组时按「前 6 / 后 6」切分，v3 落在切口上。该 tab 的职责、数据源、风险等级**未知**，不得据本报告对其做任何处置决定。

---

## 3. 职责矩阵

### 3.1 研究综合 Hub（`/admin/research`）

| Tab / 子标签 | 真实职责 | 主要用户 | 核心数据源 | 独立能力 | i18n | 时间口径 | 风险 |
|---|---|---|---|---|---|---|---|
| overview | 研究运营驾驶舱（KPI/引擎卡/路线图） | 老板 | mission-control API + research API | **无** | 24 行硬编码 | 浏览器 UTC 切片 | **高** |
| factors:lib | AlphaFactor 5000 行矩阵浏览 + CSV | 工程师 | `alpha_factors` | CSV 导出 | 50 行 | `toLocaleString("zh-CN")` | 低 |
| factors:registry | 静态代码常量清单镜像 | 工程师 | **无 DB 无 API** | 无 | 38 行 | 无时间 | 低 |
| factors:promotion | 因子晋升建议引擎 | 研究员 | `factor_alpha_results` | **有** | 64 行 | 自拼「数据锚点」 | 中 |
| factors:platform | cron 健康 + Integrity 监控 | 工程师 | 同上 + `GlobalMarket` + 快照 | **有** | 37 行 | 无 asOf | 低-中 |
| alpha:score | 影子 vs 正式逐股分歧 | 研究员 | `alpha_scores` ⋈ `stock_scores` | **有** | 51 行 | 浏览器时区 | 低-中 |
| alpha:analytics | 因子有效性统计（IC/夏普） | 研究员 | `alpha_factor_reports` | **有** | 62 行 | 无 asOf | 低 |
| alpha:fusion | 融合权重研究 | 研究员 | `RegimeFusionResult` | **有** | 48 行 | 无 asOf | 低 |
| alpha:regime | MarketRegime 历史序列 | 研究员 | `MarketRegime` | 历史序列 | 40 行 | 无 asOf | 低 |
| **v3** | **未审计** | — | — | — | — | — | **未知** |
| learning | 每日学习报告渲染 | 老板/研究员 | **文件** `reports/latest-learning.json` | 部分 | 45 行 | 手动 +9h | 中 |
| experiments:exp | 「AI 研发中心」 | — | **除 health 外全硬编码** | **无** | 44 行 | UTC 切片 | **高** |
| experiments:versions | 版本对比 + DR/BP 关联完整性 | 工程师 | `VersionSnapshot` + raw SQL | **有** | 81 行 | UTC 切片 | 低-中 |
| backtest:strategy | 策略回测摘要 | 老板/研究员 | learning-report 文件 + 3 个 API | 无 | **走 t()** | — | 中 |
| backtest:alpha | 影子策略回测矩阵 | 研究员 | `AlphaBacktestResult` | **有** | 48 行 | 无 asOf | 中 |

### 3.2 股票研究 Hub（`/screener`）

| Tab | 真实职责 | 用户 | 数据源 | 独立能力 | i18n | 时间口径 | 风险 |
|---|---|---|---|---|---|---|---|
| screen | Top200 + GPT 叠加排序选股 | 无主（入口已断） | `/api/screener` + `GPTScore` | GPT 叠排/风格过滤 | 子组件 18 处硬编码 | 手拼 JST | **中高** |
| sectors | JPX 33 行业聚合轮动 | **老板（唯一活跃）** | `StockScore` 按 sector 聚合 | **有** | **全 t()** ✅ | **API 假 computedAt** | 低-中 |
| themes | 14 主题 × 供应链 5 层 | 无主（入口已断） | **`AITheme` 唯一消费者** | **有** | 3 处 inline 三元 | max(computedAt) 正确 | 中 |
| news | News 表浏览 | 无主 | **`News` 表唯一 UI** | **有** | **无硬编码** ✅ | **显示 UTC** | 中 |
| indicators | Top500 技术指标浏览 | 无主 | `/api/indicators` | **无** | 5 处硬编码 | latestDate | **高** |

### 3.3 系统总览 Hub（`/admin/mission-control`）

| Tab | 真实职责 | 用户 | 写操作 | 独立能力 | i18n | 时间口径 | 风险 |
|---|---|---|---|---|---|---|---|
| overview | 控制中心聚合大盘 | 老板/运维 | 无 | 有 | 31 行硬编码 | **13 步仅 2 步 DB 源** | 中 |
| runtime | Runtime 可靠性 + GPT 用量 | 工程师 | 无 | 有 | 16 行硬编码 | 纯 LOG（自洽） | 低 |
| health | 数据健康守卫摘要 | 老板 | 无 | 有 | **全 t()** ✅ | 文件 auditAt（未显示） | 低 |
| verify | 生产就绪校验 + 推荐明细 | 工程师 | 无 | 有 | 中英混排 | 混合未标注 | 中 |
| **sync** | 数据源健康 + **手动触发同步** | 运维专属 | **有，见 §14** | 有 | 49 行 + 内联双语 | 纯 DB（自洽） | **高** |
| cron | overview 的子集 | 运维 | 无 | **无** | 走 t() | 继承混合口径 | 低-中 |
| deploy | 部署记录 | 老板 | Tab 无，**同 route 有 POST** | 有 | 走 t() | DB（自洽） | 中 |
| log | runtime 的精简版 | 工程师 | 无 | **无** | 走 t() | 纯 LOG | 低 |

### 3.4 孤儿页

| 页面 | 职责 | 用户 | 数据源 | 独立能力 | i18n | 风险 |
|---|---|---|---|---|---|---|
| `/stocks` | Top500 虚拟滚动表 | **无（零入链）** | **与 indicators 同一 API** | 排除股 universe 视图 | 全 t() ✅ | **高** |

---

## 4. 重复功能清单

| 能力 | 重复位置 | 数据源相同？ | 算法口径相同？ | 时间口径相同？ | 唯一权威入口 |
|---|---|---|---|---|---|
| **胜率 / 收益率** | learning · backtest:strategy · versions:compare · **AI 战绩档案** | **是**（均为 `backtest_position_results`） | 公式同为 `wins/filled`，但**4 处独立实现** | **否**：track-record 按 horizon 窗过滤，其余全历史聚合 → **同名数字必然不一致** | **AI 战绩档案** |
| 回测结果 | backtest:strategy · `/backtest` 独立页（同组件）· learning · AI 战绩档案 | 部分相同（BPR 共用） | 类似非同函数 | 不同窗口 | **AI 战绩档案** |
| 市场状态 | alpha:regime · Decision Overview · 今日简报 | **是**（`MarketRegime`） | 阈值相同但**代码重复两处** | 是 | **Decision Overview**（历史序列留研究区） |
| 全市场选股 | screen · **股票中心全市场视图** · indicators · `/stocks` | screen 与股票中心**同一 `/api/screener`**；indicators 与 `/stocks` **同一 `/api/indicators`** | **不同**：screen 前端叠 GPT 重排 | 不同 | **股票中心** |
| AI 推荐 | screen · 股票中心 | 不同（ClosingDecision.top10 vs screener） | 不同 | 不同 | **股票中心** |
| Alpha | promotion · analytics · fusion · backtest:alpha · score | 不同表，互补 | 各自口径 | 各自 | 分工明确，不重复 |
| 学习报告 | learning · backtest:strategy | **是**（同一 JSON 同一字段） | 相同 | 相同 | **二选一** |
| 特征分析 | registry · promotion · platform | registry 静态、后两者 DB | — | — | promotion |
| 实验管理 | experiments:exp · experiments:versions | exp **不读 ExperimentRegistry** | — | — | **versions** |
| 模型版本 | versions | 唯一 | — | — | versions |
| 主题研究 | themes · `/deep-research` | **不同**（AITheme vs ResearchIndustry，两套平行分类法） | 不可比 | 不同 | 战略重叠，需合流 |
| 行业研究 | sectors · `/deep-research` | **不同**（量化聚合 vs 策划研究库） | 不可比 | 不同 | **互补，各自保留** |
| 新闻 | news · 今日简报 TDnet | **不同表**（`News` vs `Disclosure`） | 不同 | 不同 | **不重复，各自保留** |
| 指标 | indicators · `/stocks` | **同一 API** | 同 | 同 | 应合并 |
| 系统健康 | mc:overview · mc:health · mc:cron · mc:log · mc:runtime | overview/cron 同 API；runtime/log 同 API | — | — | overview + runtime |
| 今日流水线 | mc:overview · **今日简报时间轴** | 部分 | **判据不同**：简报纯 DB，mc 13 步仅 2 步 DB | **否** | 见 §6 |

---

## 5. 数据与算法口径冲突

1. **胜率四实现**：`generate-learning-report.ts:435`、`versions/compare:50`、`track-record` groupStat、`strategy-performance.ts:91`。公式一致但时间窗不同。
2. **风险等级双实现**：`MarketRegimePanel:48` 与 `decision-overview route:33`，阈值相同（vol <20/≤25/>25）代码各写一份。
3. **screen 排序分叉**：与股票中心同 API，前端额外叠 `GPTScore.finalScore` 重排 → 同一份数据两个名次。
4. **接口撒谎三处**：
   - `/api/sectors:79` `computedAt: new Date()` = **请求时刻**，非数据时刻
   - `/api/indicators` `ma5/ma20/ma60` **硬编码 null** → indicators 均线热力图**死功能**
   - `/api/indicators` `finCount: 0` 硬编码 → `/stocks`「财报数」列**恒 0 误导**
5. **假绿灯**：`MissionControlView:134-135,166-168` 的 API / Database / AI Engine `ok:true` **硬编码常绿，无任何实际探测**。
6. **硬编码引擎状态**：`center.tsx:76-105`、`ExperimentsView:90-130` 的版本号与「Running/Enabled」写死，会随时间腐烂。

---

## 6. 时间口径问题

**`common.asOf.*` 在 research / system 组件中零使用**（仅 `components/decision/*` 与 explain 使用）。research/system 共存 **5 种时间口径**：

| 口径 | 位置 |
|---|---|
| 浏览器 UTC 切片 | `center.tsx:62`、`ExperimentsView`、`VersionsView`、`NewsView:35` |
| `toLocaleString("zh-CN")` 浏览器时区 | promotion:281、regime:248、fusion:173、platform:82、lib、score |
| 手动 +9h | `LearningReportView:123`、`PanelHeader:30`、`sections.tsx:17` |
| API 原始 date 字符串 | overview、indicators |
| 正确 JST（Intl Asia/Tokyo） | themes:516 |

**Mission Control 时间源仅修了 2/13 步**：P19-T3 只把 `compute_scores`、`day_settle` 改为 DB ground truth（`timeSource:"DB"`），其余 11 步仍读 `logs/pipeline-runs.jsonl`（`timeSource:"LOG"`）。而今日简报**全部**用 DB 落库判定并明令禁读该日志。→ **两者对同一管线可能给出矛盾状态**（briefing 注释已记录实证：mc 显示 07-04、DB 实为 07-21）。

**UTC/JST 错位真 bug 1 处**：`components/research/deep/ResearchCalendar.tsx:39` `new Date().toISOString().slice(0,10)` → JST 00:00–09:00 间「今天」显示为昨天（与 P20 刚修的 Mission Lab 同类）。

---

## 7. i18n 问题

- **键文件零缺口**：`zh-CN.ts` 与 `ja-JP.ts` 各 2549 行，**键集合 diff 退出码 0**。i18n 债务**全部在组件硬编码层**。
- **硬编码 CJK 共 762 行**：`components/research` 624 + `components/system` 138 + `app/stocks` **0**。
- **47 个组件中 23 个完全未接 `useI18n()`**，其中 research 20 个、system 3 个（MissionControlView / RuntimeView / VerifyView）。
- 中英混排：`VerifyView:82-88`「系统状态 / System」等 —— 违反 zh-CN 纯中文规则。
- `SyncView` 虽引入 `useI18n`，仍有 49 行 `lang === "ja-JP" ? … : …` 内联双语，且 `dayjs.locale("zh-cn")` 全局写死。
- `AlphaScorePanel:46` 硬编码 `REC_ZH` 评级中文映射 —— 违反「评级标签走 `lib/rec-config`」单一来源规则。
- 死代码英文残留：`AiThemeView:583,780`（en-US 已移除后不可达分支）。

---

## 8. 导航与死链问题

**7/7 注册入口生产 HTTP 200**，无循环跳转（最深 2 跳）。但存在三类结构性问题：

### R1（阻断）导航状态机冲突
`nav-config.ts:83` `BOSS_SCREENER_TABS` 把 `/screener?tab=sectors|themes` **强制判为 boss 工作区**（`:92-96`）。而研究区注册了 `rs-sectors`(`:62`) / `rs-themes`(`:63`) 指向同样 URL。→ 研究区一旦开放，用户点这两项后 `useWorkspace` 推回 boss，**侧栏整个弹回决策区**，研究项永不 active。

### stale tab 静默降级（三方交叉印证）
合法顶级 tab 不含 `score` / `fusion` / `analytics` / `regime`，但以下全部指向它们：

| 来源 | 目标 | 结果 |
|---|---|---|
| `lib/routes.ts` SHADOW_SCORE | `?tab=score` | → overview |
| `lib/routes.ts` FUSION_REPORT | `?tab=fusion` | → overview |
| `next.config.ts:18,20,21,22` `/alpha/score`·`/alpha/report`·`/fusion/paper`·`/fusion/report` | 同上 | → overview |
| `/market-regime` 重定向桩 | `?tab=regime` | → overview |
| `MissionControlView` 诊断卡 · `ExperimentsView` 3/6 KPI + 4/6 模块卡 | 同上 | → overview |

**后果：影子评分 / 融合报告 / 市场状态三块内容目前从任何入口都点不进去**，只能先进 `?tab=alpha` 再手点子标签，且刷新即丢。

### 其它
- `/stocks:218`「查看技术面」→ `/screener?sort=technical`：参数完全不被读取，落在选股 Tab 默认排序 —— **语义死链**。
- `RESEARCH_PREFIXES` 含 `/fusion`，但 `/fusion` 生产 **404**（无导航引用，属前缀冗余）。
- `/screener?tab=sectors` 同时注册在 boss(`:52`) 与 research(`:62`) —— 重复入口。
- `ws.comingSoon` 文案写死「研究 · 管理 暂未开放」，只开放其一时文案失真。

---

## 9. 治理分类

### DELETE（4）
| 单元 | 证据 |
|---|---|
| `experiments:exp` | 除 health 外全硬编码；版本笔记写死会腐烂；6+ 导航链接全部落错；不读 `ExperimentRegistry` 名不副实；与 overview 引擎卡重复且更假 |
| `research:overview` | 引擎状态硬编码假绿；`steps.at` 字段错位时间恒空；触发 618 行全表 JOIN 只用 2 个字段；无任何独立能力 |
| `screener:indicators` | 无独立决策价值（字段股票中心已有）；均线热力图因 API 恒 null 是死功能；与 `/stocks` 同 API 重复 |
| `/stocks` | 零入链孤儿；与 indicators 同 API；`finCount` 恒 0 误导列；`sort=technical` 语义死链；页面自述已承认是残留 |

### MERGE（4）
| 单元 | 并入 | 证据 |
|---|---|---|
| `learning` | AI 战绩档案 | 与 backtest:strategy 读同一 JSON 同一字段；胜率与战绩档案同源不同窗 |
| `backtest:strategy` | AI 战绩档案 | 4 个 API 中 3 个载荷基本丢弃；同数据四处呈现 |
| `screener:screen` | 股票中心 | 与股票中心全市场视图**同一 API**；GPT 叠排能力应并入而非维持第二入口 |
| `mc:cron` + `mc:log` | mc:overview / mc:runtime | 分别复用完全相同的 API，独立价值近零 |

### MOVE（1）
| 单元 | 去向 | 证据 |
|---|---|---|
| `/stocks` 的「排除股 universe」视图 | 管理区（AI Universe 管理） | 全站唯一展示 `excludeReason`/`aiExcludeSource` 的 UI，是真能力，但属运维语义 |

### INTERNAL（11）—— 保留但永不进老板导航
`factors:lib` · `factors:registry` · `factors:promotion` · `factors:platform` · `alpha:score` · `alpha:analytics` · `alpha:fusion` · `alpha:regime` · `experiments:versions` · `backtest:alpha` · `mc:sync` · `mc:runtime` · `mc:verify`

### KEEP（6）—— 治理后可开放
`screener:sectors` · `screener:themes` · `screener:news` · `mc:overview` · `mc:health` · `mc:deploy`

### UNKNOWN（1）
`v3`（含 calibration / freeze）—— 本轮未审计，不做处置建议。

---

## 10. 建议最终导航结构

```
决策（boss · 现状不动，P19 IA Freeze 保持）
  概览 / 今日简报 / 股票中心 / 行业分析 / AI Mission Lab / AI 战绩档案

研究（治理后开放，4 项）
  行业轮动      → /screener?tab=sectors    ← 解除 BOSS_SCREENER_TABS 冲突
  主题研究      → /screener?tab=themes     ← 同上
  新闻情绪      → /screener?tab=news
  产业深研      → /deep-research           ← 从 boss 移入或双挂（需决策）

管理（治理后开放，3 项）
  系统总览      → /admin/mission-control?tab=overview
  数据健康      → ?tab=health
  部署记录      → ?tab=deploy

内部（不进任何主导航，仅工程师手输 URL 或独立入口）
  /admin/research 全部 Tab · mc:sync · mc:runtime · mc:verify
```

---

## 11. 真正需要治理的页面数量

**6 个**（KEEP 类），而非 19 个。

其余分布：DELETE 4 · MERGE 4 · MOVE 1 · INTERNAL 13 · UNKNOWN 1。

---

## 12. 推荐实施顺序

| 序 | 任务 | 前置 | 理由 |
|---|---|---|---|
| **0** | **修 P0 安全暴露**（§14 R0） | 无 | 与 P21 无关，当前正在发生，必须先做 |
| 1 | 审计 `v3` tab 补齐覆盖缺口 | 无 | 无它无法完整决策 |
| 2 | 执行 DELETE 4 项 + MERGE 4 项 | 1 | 先减面积再治理，避免给将删的页做 i18n |
| 3 | 修 R1 导航状态机冲突 | 2 | 研究区开放的硬前置 |
| 4 | 修 stale tab 死链（routes.ts + next.config.ts） | 2 | 让内部页至少可达 |
| 5 | 6 个 KEEP 页逐页 Design First（i18n + `common.asOf.*` + 空态） | 3,4 | 主体工作量 |
| 6 | 修 mc:overview 假绿灯 + 补齐 13 步时间源 | 5 | 老板可见页不得有假状态 |
| 7 | IA Review + 翻 `ENABLED_WORKSPACES` 开关 | 全部 | 收官 |

---

## 13. P21 拆分建议

| 阶段 | 内容 | 产出 |
|---|---|---|
| **P21-T0.5** | `v3` tab 补充审计 | 覆盖缺口关闭 |
| **P21-S0**（独立紧急） | 修 P0 安全暴露 | middleware + ADMIN_TOKEN |
| **P21-T1** | 减面积：DELETE 4 + MERGE 4 + MOVE 1 | 治理面从 25 降到 6 |
| **P21-T2** | 导航修复：R1 + stale tab + 语义死链 | 导航状态机正确 |
| **P21-T3** | 6 页 Design First（建议每页一轮） | 可开放页达标 |
| **P21-T4** | mc:overview 真实健康探测 + 13 步时间源统一 | 假绿灯清除 |
| **P21-Final** | IA Review + 开关 + 冻结 | 工作区开放 |

---

## 14. 风险清单

| # | 风险 | 等级 | 证据 |
|---|---|---|---|
| **R0** | **生产 `/api/admin/*` 与 `/api/sync/*` 无鉴权公网可达**。无 `middleware.ts`、无 `app/admin/layout.tsx`、生产 `.env` 无 `ADMIN_TOKEN`（grep=0），代码 `if (!envToken) return true` 兜底放行。已实测 `GET /api/admin/verify?module=dailyrec` **HTTP 200 返回真实推荐明细**。据此**强推断**（未实测，实测即写操作）`POST /api/sync/scores` 亦开放 —— 它 spawn `compute-scores.ts` **重写全市场 3700+ StockScore**，直接改变 AI 推荐与三策略选股输入 | **P0** | 见左 |
| R1 | 研究区导航状态机冲突，开放即侧栏弹回 | 阻断 | `nav-config.ts:62-63` vs `:83,92-96` |
| R2 | research 624 行硬编码中文，ja-JP 用户见全中文 | 阻断 | 20/27 组件零 i18n |
| R3 | 管理区 138 行硬编码中文 + VerifyView 中英混排 | 阻断 | `VerifyView:82-88` |
| R4 | `mc:sync` 手动触发按钮，误点「一键全部同步」盘中重算评分 | 高 | `SyncView:378-386,430-437` |
| R5 | stale tab 死链致三块内容不可达 | 高 | §8 |
| R6 | `mc:overview` 假绿灯给老板错误安全感 | 高 | `MissionControlView:134-135,166-168` |
| R7 | 胜率 4 处实现、时间窗不同 → 同名数字打架 | 高 | §5.1 |
| R8 | 接口撒谎 3 处（假 computedAt / ma=null / finCount=0） | 中 | §5.4 |
| R9 | `ResearchCalendar` UTC/JST 错位 | 中 | `deep/ResearchCalendar.tsx:39` |
| R10 | `POST /api/admin/deployments` 无鉴权，可伪造部署历史 | 中 | `deployments/route.ts:9,55` |
| R11 | promotion/platform 每请求全表扫描无缓存 | 中 | `loadEvaluateDeps` |
| R12 | 硬编码版本笔记随时间腐烂 | 中 | `ExperimentsView:124-130` |
| R13 | `v3` tab 未审计，风险未知 | 中 | §2.4 |
| R14 | `mc:verify` 暴露全部推荐明细与 GPT 评分 | 中 | 叠加 R0 后果放大 |

---

## 15. Final Recommendation

### 「研究」工作区能否开放？
**否。** 三个阻断项：R1 导航状态机冲突（开放即侧栏弹出，功能性不可用）、R2 i18n 624 行硬编码、R5 死链致核心内容不可达。且当前 5 个 Tab 中 4 个已无入口，**先减面积再开放**比直接翻开关正确。

**开放前必须完成**：① `v3` 补审；② DELETE/MERGE 减面积至 3–4 项；③ 修 R1；④ 修 stale tab 死链；⑤ 3 个 KEEP 页 i18n + `common.asOf.*` + 空态治理；⑥ 修 `/api/sectors` 假 computedAt。

### 「管理」工作区能否开放？
**否，且比研究区更不能。** 除 R3 i18n 外，核心问题是 `mc:sync` 含**直接影响评分与推荐链路的写操作**，叠加 R0 无鉴权，开放导航等于把这些按钮变得可被发现。R6 假绿灯会让老板对系统健康产生错误信任。

**开放前必须完成**：① **修 R0**（前置于一切）；② `mc:sync` / `runtime` / `verify` 从工作区剥离或加 Tab 级权限；③ MERGE 掉 cron/log；④ 修 R6 假绿灯为真实探测；⑤ 补齐 13 步时间源（现仅 2 步）；⑥ 3 个 KEEP 页 i18n。

### 哪些页面应永远不进老板主导航？
**判据**：含写操作 / 术语密度要求理解模型内部结构 / 回答的是工程问题而非业务问题。

| 页面 | 它回答的问题 |
|---|---|
| `mc:sync` | 「要不要手动重跑同步」——含生产写操作，最高优先级排除 |
| `mc:runtime` · `mc:log` | 「日志里有什么」 |
| `mc:verify` | 「生产就绪吗」+ 暴露推荐明细 |
| `factors:platform` | 「cron 跑了吗」 |
| `factors:registry` | 「代码里登记了什么」 |
| `factors:lib` | 「数据算出来了吗」（API 自称 debug page） |
| `factors:promotion` · `alpha:analytics` · `alpha:fusion` · `alpha:score` · `alpha:regime` · `backtest:alpha` | 要求理解 rankIC / quintile cohort / 夏普 / 融合权重方法论 |
| `experiments:versions` | 版本关联完整性，工程治理 |

其中 `promotion` 的「建议晋升因子数」、`analytics` 的「最佳/最弱因子」可作**摘要指标**上浮到老板视图，但**原页不应暴露**。

---

**审计结束。未修改任何代码。等待 P21-T1 决策。**
