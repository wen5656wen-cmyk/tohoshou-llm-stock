# P7-03 产品级全盘审查 · TOHOSHOU AI 产品最终整理报告

> 只读产品审查，未改任何代码 / 未部署。日期 2026-07-16。基线 = B-3 后真实状态（HEAD 含 P7-02B-1/2/3）。
> 全部基于当前真实代码扫描（38 个 page.tsx + nav-config + next.config 逐一核验），非猜测。

---

## 一、逐页面检查（当前 38 个 page.tsx）

图例：🟢每天 · 🟡偶尔 · 🟠管理/调试 · 🔴已废弃 · ⚫Shadow ｜ 入口：nav=有一级导航 / tab=hub内Tab / leaf=上下文进入 / URL=仅直达 / redir=重定向壳

### A. 核心 Hub 与老板页（生产·有入口）
| 页面 | URL | 一级导航 | 功能 | 主要 API | 生产 | 入口 | 生命周期 | 建议 |
|---|---|---|---|---|---|---|---|---|
| 首页 | `/` | 首页 | 今日总览(CommandCenter) | server 聚合 | ✅ | nav | 🟢 | 保留(B-2 老板首页规格待并入) |
| 决策中心 | `/decision-center` | 决策中心 | 6 Tab 决策 hub | closing/decision-center/ai-top-picks/watchlist | ✅ | nav | 🟢 | 保留(hub) |
| 股票研究 | `/screener` | 股票研究 | 7 Tab 研究 hub | screener/sectors/ai-theme/news/indicators/research | ✅ | nav | 🟢 | 保留(hub) |
| 策略与回测 | `/strategy` | 策略与回测 | 三策略推荐/稳定/报告 | strategy/* + reports | ✅ | nav | 🟢 | 保留(B-4 并回测 Tab) |
| 交易与持仓 | `/portfolio` | 交易与持仓 | Paper 模拟盘 | portfolio/paper | ✅ | nav | 🟢 | 保留(B-5 并我的自选) |
| 个股详情 | `/stocks/[symbol]` | — | 单股全景 | stocks/[symbol]/intelligence·indicators+financials | ✅ | leaf | 🟢 | 保留(唯一详情叶子) |
| 主题详情 | `/ai-theme/[theme]` | — | 单主题成分 | ai-theme+gpt-score | ✅ | leaf | 🟡 | 保留(叶子) |

### B. 管理员 Hub（生产·admin 折叠入口）
| 页面 | URL | 功能 | 主要 API | 入口 | 生命周期 | 建议 |
|---|---|---|---|---|---|---|
| 数据与学习 | `/admin/research` | 研究中心 10 子Tab(综合/Alpha/regime/fusion/V3×3) | admin/research + alpha* + regime + fusion + scoring-v3* | nav(admin) | 🟠 | 保留(hub) |
| 系统管理 | `/admin/mission-control` | 全站系统总览 | admin/mission-control | nav(admin) | 🟠 | 保留(hub) |

### C. 重定向壳（旧 URL→hub Tab，B-2/B-3 建，书签不失效）
| 旧 URL | → 目标 | 方式 |
|---|---|---|
| `/admin/closing-decision` | `/decision-center?tab=closing` | 应用内重定向 |
| `/admin/ai-top-picks` | `/decision-center?tab=top-picks` | 应用内重定向 |
| `/admin/decision-center` | `/decision-center?tab=cockpit` | 应用内重定向 |
| `/watchlist/daily` | `/decision-center?tab=watchlist` | 应用内重定向 |
| `/sectors` | `/screener?tab=sectors` | 应用内重定向 |
| `/ai-theme` | `/screener?tab=themes` | 应用内重定向 |
| `/news` | `/screener?tab=news` | 应用内重定向 |
| `/indicators` | `/screener?tab=indicators` | 应用内重定向 |

### D. 孤儿页（真实页面·**当前无 nav 入口**·仅直达 200·待 B-4/5/6 收编）
| 页面 | URL | 功能 | 应归属 | 生命周期 | 建议 |
|---|---|---|---|---|---|
| 回测中心 | `/backtest` | 策略回测+摘要 | 策略与回测 Tab | 🟠 | 合并(B-4) |
| 因子中心 | `/admin/features` | 83 因子静态目录 | 数据与学习 Tab | 🟠 | 合并(B-5) |
| 因子晋升 | `/admin/feature-promotion` | 晋升建议 | 数据与学习 Tab | 🟠 | 合并(B-5) |
| 因子平台 | `/admin/feature-platform` | 平台/Integrity | 数据与学习 Tab | 🟠 | 合并(B-5) |
| 学习报告 | `/admin/learning-report` | AI 学习总结 | 数据与学习 Tab | 🟠 | 合并(B-5) |
| 版本中心 | `/admin/versions` | 版本快照/对比 | 数据与学习 Tab | 🟠 | 合并(B-5) |
| 实验室 | `/admin/experiments` | 实验登记(表无写入源) | 数据与学习 Tab | 🔴 | 隐藏(数据空,B-5) |
| Runtime | `/admin/runtime` | 流水线/GPT 日志 | 系统管理 Tab | 🟠 | 合并(B-6) |
| 数据校验 | `/admin/verify` | 完整性校验 | 系统管理 Tab | 🟠 | 合并(B-6) |
| 数据中心 | `/sync` | 同步状态/触发 | 系统管理 Tab | 🟠 | 合并(B-6) |
| 个人自选 | `/watchlist` | 自选 CRUD(含硬编码中文) | 交易与持仓 Tab | 🟠 | 合并(B-5,修 i18n) |
| TOP500 列表 | `/stocks` | 股票列表 | 与选股重复 | 🔴 | 重定向→/screener |

### E. Legacy 废弃壳（next.config/客户端重定向，页面文件仍在）
| 页面 | URL | → | 方式 | 建议 |
|---|---|---|---|---|
| AI 精选(旧) | `/ai-picks` | `/` | next.config 307 | 🔴 观察后删文件 |
| 旧因子 | `/alpha` | research?tab=factors | 307+客户端 | 🔴 删 |
| 旧影子评分 | `/alpha/score` | research?tab=score | 307+客户端 | 🔴 删 |
| 旧回测 | `/alpha/backtest` | research?tab=backtest | 307+客户端 | 🔴 删 |
| 旧分析 | `/alpha/report` | research?tab=analytics | 307+客户端 | 🔴 删 |
| 旧融合报告 | `/fusion/report` | research?tab=fusion | 307+客户端 | 🔴 删 |
| Fusion 模拟 | `/fusion/paper` | research?tab=fusion | 307(遮蔽真实页) | 🔴 删死页 |
| 市场状态 | `/market-regime` | research?tab=regime | **仅客户端**(未进 next.config) | 🔴 补 307 或删 |

### F. 工具
| 占位页 | `/coming-soon` | ?feature= 回退 | URL | ⚪ | 保留(工具) |

**死组件（非页面，0 import，仍未删）**：`app/HomeDashboardClient.tsx`、`app/SystemDashboard.tsx`；`DashboardView` 默认导出/`PipelineCompact`/`QuickActions` 死导出。

---

## 二、重复功能检查（现状）

| 功能 | 重复实例 | 现状 |
|---|---|---|
| **驾驶舱/总览** | `/`(首页) + `/decision-center?tab=cockpit`(决策驾驶舱) + `/decision-center?tab=overview`(今日总览) | 已收进决策中心，但**首页 vs 今日总览仍语义重叠**（B-2 首页规格尚未落地）→ 待并 |
| **研究中心/研究分析** | `/screener?tab=research`(ResearchCenter 概览) + `/admin/research`(同 ResearchCenter + 全工具) | 刻意分层(老板概览/管理员全工具)，非纯重复，但 ResearchCenter 组件两处渲染 |
| **回测** | `/backtest`(策略回测·StrategyBacktestResult) + `/admin/research?tab=backtest`(Alpha 回测·AlphaBacktestResult) | **不同数据**，B-4 将并为两子标签 |
| **股票详情** | 仅 `/stocks/[symbol]` **一处**(已统一，所有页 buildStockUrl 指向它) | ✅ 无重复 |
| **因子入口** | `/admin/features` + `/admin/feature-promotion` + `/admin/feature-platform` **三页并存** | 待 B-5 合为一个因子 Tab |
| **学习报告** | `/admin/learning-report` **一处** + `/admin/research` V3/影子验证有重叠展示 | 主体单一 |
| **监控页面** | `/admin/mission-control` + `/admin/runtime` + `/admin/verify` + `/sync` **四页** | 待 B-6 合为系统管理 Tab |
| **列表/选股** | `/screener`(全功能) + `/stocks`(TOP500 列表) | `/stocks` 与选股重复，应重定向 |

---

## 三、缺失功能检查（老板/管理员现在找不到入口的）

> 根因：B-1 已把一级导航收敛为 7，但 B-4/B-5/B-6 的 Tab 尚未建，导致以下功能**仍可直达 URL(200) 但左侧菜单无入口**。

| 功能 | 以前入口 | 现状 | 恢复于 |
|---|---|---|---|
| 回测 | 侧栏「回测」 | ❌ 无 nav(仅 /backtest 直达) | B-4 |
| 因子中心/晋升/平台 | 侧栏 3 项 | ❌ 无 nav | B-5 |
| 学习报告 | 侧栏「学习报告」 | ❌ 无 nav | B-5 |
| 版本中心 | 侧栏「版本中心」 | ❌ 无 nav | B-5 |
| 实验室 | 侧栏「实验室」 | ❌ 无 nav | B-5(隐藏) |
| Runtime/数据校验/同步 | 侧栏系统组 3 项 | ❌ 无 nav | B-6 |
| 我的自选 | 侧栏(曾孤儿) | ❌ 无 nav | B-5 |
| 行业/主题/新闻/指标 | (曾仅移动) | ✅ 已恢复(股票研究 Tab, B-3) | 已修 |
| 决策/五选/关注池/收盘 | 侧栏多项 | ✅ 已恢复(决策中心 Tab, B-2) | 已修 |

**结论**：决策类(B-2)、研究类(B-3)入口已恢复；**回测、因子三页、学习、版本、系统运维、我的自选仍是 nav 盲区**，是 B-4/5/6 必须闭合的缺口。

---

## 四 & 五、页面职责 + 生命周期

| 页面 | 老板为何打开 | 频率 | 生命周期 |
|---|---|---|---|
| `/` 首页 | 今天怎么做 | 每天 | 🟢 |
| `/decision-center` | 今日建议/五选/关注/收盘 | 每天多次 | 🟢 |
| `/screener` 选股 | 买哪只 | 每天 | 🟢 |
| `/stocks/[symbol]` | 为什么买这只 | 每天 | 🟢 |
| `/portfolio` | 持仓怎么办 | 每天 | 🟢 |
| `/strategy` | 策略有效吗 | 每周 | 🟢 |
| `/screener`新闻/行业/主题/指标 | 研究辅助 | 偶尔 | 🟡 |
| `/backtest` | 回测验证 | 每周(管理) | 🟠 |
| `/admin/research` | 因子/模型健康 | 管理员 | 🟠 |
| `/admin/mission-control`·runtime·verify·sync | 系统正常吗 | 管理员 | 🟠 |
| `/admin/features`·promotion·platform·learning·versions | 模型/数据 | 管理员 | 🟠 |
| `/admin/experiments` | (表空) | 几乎没人 | 🔴 |
| `/stocks`列表·`/ai-picks`·`/alpha*`·`/fusion*`·`/market-regime` | — | 无人(重定向/legacy) | 🔴 |
| V3 影子(research?tab=v3/calibration/freeze) | 未上线引擎观察 | 管理员偶尔 | ⚫ |

---

## 六、老板一天流程模拟（当前可达性）

```
09:00 盘前   → 首页「今日建议/第一推荐」  ✅ 一步到位
09:30 选股   → 股票研究?tab=screen         ✅ hub 内切 Tab
09:35 早盘五选 → 决策中心?tab=top-picks      ✅ hub 内切 Tab
盘中 盯盘    → 决策中心?tab=watchlist       ✅
     看个股  → /stocks/[symbol]            ✅ 统一详情
15:15 收盘   → 决策中心?tab=closing         ✅
收盘后 持仓  → 交易与持仓 /portfolio        ✅
回测        → 策略与回测(策略) ✅ ; /backtest ❌ 无 nav(待 B-4)
学习/模型    → 数据与学习(admin) ✅ ; /admin/learning-report ❌ 无 nav(待 B-5)
```
**来回跳/绕路评估**：决策类、研究类、交易类已无需跳多页（hub 内 Tab 切换，不整页刷新）。**残留绕路 = 回测与学习/因子/系统运维**：目前老板/管理员要靠直达 URL 或旧书签进入（nav 无入口）→ B-4/5/6 闭合后消除。**首页 vs 决策中心「今日总览」仍有轻微重复打开**（两处看今日建议）→ B-2 首页规格落地后统一。

---

## 七、API 检查（沿用 P7-00，B-1/2/3 未改任何 API）

- **无页面调用的 API（~30 个疑似废弃）**：单股 6 子接口(ai-decision/ai-score/gpt-score/strategy/alternatives/analysis，被 `intelligence` 取代)、`sim-portfolio/*`(整套无前端)、`portfolio/{summary,trend,history,snapshots}`、`backtest/{cohorts,health,trend}`、`market-data`/`market-stats`/`realtime-market`/`prices/[symbol]`/`ai-signal-stats`/`disclosures`、`sync`(旧编排器)+`sync/yahoo`、`admin/{deployments GET,experiments,portfolio-debug}`、`scoring-v3/backtest`、`strategy/performance`。
- **调用多个 API 的页面**：决策中心「今日总览」调 2 个(closing-decision + decision-center) → 可聚合为 1 个 overview 接口(非必须)。`/backtest` 调 4 个(backtest/strategy·summary + learning + mission-control)。
- **应聚合**：`mission-control`/`decision-center`/`research-overview`/`ai-top-picks` 四个总览接口字段重叠(都聚合 stockScore+globalMarket)；市场类 `market-data`/`market-stats`/`realtime-market`/`regime` 重叠(仅 regime 存活)。

---

## 八、数据库检查（61 表，沿用 P7-00，未变）

- **生产活跃**：Stock/DailyPrice/Financial/StockScore/DailyRecommendation/GPTScore/News/Disclosure/InstitutionalFlow/GlobalMarket/DailyAIWatchlist/ClosingDecision/AiTopPick*/Strategy*(7)/Paper*(5)/PortfolioSnapshot* 等。
- **仅 Shadow**：`AdaptiveScoreV3Shadow`/`AdaptiveScoreV3Calibration`(V3 未上线)、`AlphaScore`(影子)、`FactorAlphaResult`。
- **仅测试/诊断**：`BacktestError`(诊断日志)。
- **疑似废弃(可清退)**：`Portfolio`(只写不读)、`SimPortfolio`/`SimPosition`/`SimTrade`(无前端消费者)、`ExperimentRegistry`(零写入源·疑空)、`VersionSnapshot`(只读不写·陈旧)。
- **废弃字段**：`DailyRecommendation` 的 return/exitDate/price 7·30·90d(schema 标 DEPRECATED)、`StockScore.shadow*`/rawScore/riskScore、`GlobalMarket.sox/cpi/fedRate`。

---

## 九、组件检查

- **0 import 死组件（应删）**：`app/HomeDashboardClient.tsx`、`app/SystemDashboard.tsx`(实测 0 引用)；`components/dashboard/DashboardView` 默认导出 + `PipelineCompact` + `QuickActions` 死导出。
- **Legacy（应随页面删）**：`/alpha*`、`/fusion/*`、`/ai-picks`、`/market-regime` 的 stub 页组件。
- **B-2/B-3 移动的 View 全部 alive**：`components/decision/*View`(4) + `components/research/{Sectors,AiTheme,News,Indicators}View`(4) 各被对应 hub 引用 1 次 ✅。
- **重复**：ResearchCenter 组件在 `/admin/research` 与 `/screener?tab=research` 两处渲染(刻意分层，非 bug)。

---

## 十、TOHOSHOU AI 产品地图

### 🟢 老板版（每天可见，≤8）
```
首页 ── 今天怎么做（建议/第一推荐/组合/风险/新鲜度/下次任务）
决策中心 ── 今日总览 · 早盘五选 · 每日关注池 · 收盘决策 · 驾驶舱 · 历史
股票研究 ── 选股 · 行业 · 主题 · 产业链 · 新闻 · 指标 · 研究分析
          └ 个股详情（叶子）· 主题详情（叶子）
策略与回测 ── 策略 · 稳定性 · 报告 ·〔回测 B-4〕
交易与持仓 ── AI 组合 ·〔我的自选 B-5〕
```
### 🟠 管理员版（折叠，2 hub）
```
数据与学习 ── 综合 · 因子〔features+promotion+platform B-5〕· Alpha · regime · fusion · V3影子 · 学习 · 版本 · 实验(隐藏)
系统管理 ── 综合 ·〔Runtime · 数据校验 · 同步 B-6〕· 部署
```
### ⚫ 开发/Shadow 版（研究中心内，未上线）
```
Scoring V3（shadow/calibration/freeze）· AlphaScore 影子 · FactorAlphaResult
表：AdaptiveScoreV3Shadow/Calibration · AlphaScore
```

---

## 十一、三个最终问题

### 1. 必须保留（核心，9 个主页面 + 2 叶子）
`/`(首页)、`/decision-center`、`/screener`、`/strategy`、`/portfolio`、`/admin/research`、`/admin/mission-control` + 叶子 `/stocks/[symbol]`、`/ai-theme/[theme]` + 工具 `/coming-soon`。

### 2. 应立即合并（收进已建/待建 hub Tab）
- 已合并(B-2/3)：closing-decision/ai-top-picks/decision-center/watchlist-daily → 决策中心；sectors/ai-theme/news/indicators → 股票研究。
- **待合并**：`/backtest`→策略(B-4)；`/admin/{features,feature-promotion,feature-platform,learning-report,versions,experiments}` + `/watchlist`→数据与学习/交易(B-5)；`/admin/{runtime,verify}` + `/sync`→系统管理(B-6)。

### 3. 可直接删除（死代码/废弃，不影响功能）
- 死组件：`app/HomeDashboardClient.tsx`、`app/SystemDashboard.tsx` + DashboardView 死导出。
- Legacy 页面文件(观察期后)：`/ai-picks`、`/alpha`+`/alpha/*`、`/fusion/report`、`/fusion/paper`、`/market-regime`、`/stocks`(列表)。
- 废弃表：`Portfolio`、`Sim*`(3)；先核实空表后 `ExperimentRegistry`/`VersionSnapshot`。

---

## 十二、最终统计

| 项 | 数量 |
|---|---:|
| **当前页面(page.tsx)** | **38** |
| 建议保留(独立主页面+叶子+工具) | **10**（7 hub/主页 + 2 叶子 + coming-soon） |
| 建议合并为 Tab | **12**（backtest / features×3 / learning / versions / experiments / runtime / verify / sync / watchlist / 已建 hub 之外的待收编） |
| 建议隐藏 | **2**（experiments 空数据 / stocks 列表） |
| 建议删除(legacy+死组件) | **8 页**（ai-picks/alpha×4/fusion×2/market-regime）+ 2 死组件文件 |
| 已收敛为重定向壳(B-2/3) | **8** |
| **最终老板每天看到** | **≤8**（4 一级 hub + 个股/主题详情 + 关注/新闻 Tab） |
| **最终管理员看到** | **2**（数据与学习 + 系统管理，折叠） |
| 最终系统主页面 | **9**（≤15 目标内） |

---

## 结论（P7 最终版）

TOHOSHOU AI 经 P7-02B-1/2/3 已完成：一级导航 20→7、决策类 5 页→1 hub(6Tab)、研究类 7 页→1 hub(7Tab)，个股详情统一、旧书签不失效、评分/策略/交易/Cron/DB 零改动。

**剩余闭合项（B-4/5/6）**：回测→策略、因子三页+学习+版本+实验+我的自选→数据与学习/交易、运维三页→系统管理。完成后老板日常 ≤8 页、管理员 2 折叠 hub、废弃 legacy/死组件进入清理期。

**产品健康度**：核心决策/研究/交易动线已顺畅无绕路；唯一残留是回测/管理类的 nav 盲区（URL 可达、菜单缺失），非功能缺失，属收尾工程。
