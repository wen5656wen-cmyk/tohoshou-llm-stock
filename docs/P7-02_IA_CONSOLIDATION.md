# P7-02 信息架构整合与页面收敛方案

> 只做分析与方案，不改代码 / 不部署 / 不删数据库 / 不改业务逻辑。日期 2026-07-16。基线 v17.92.0。
> 页面判定基于真实代码：逐 page.tsx + 组件层 grep 实际 fetch 的 /api 路径，非按名称。

---

## 一、37 页职责盘点（含真实数据源）

状态图例：🟢生产 · 🟠孤儿(无导航入口) · 🔵legacy重定向 · ⚪占位 · ⚫死代码

| # | 路由 | 名称 | 核心用途 | 真实数据源/API | 状态 | 功能重复对象 | 建议 |
|---|---|---|---|---|---|---|---|
| 1 | `/` | 指挥中心 | 首页总览+选股 | CommandCenter(server聚合 TodayIntel/Health/Market/Screener) | 🟢 | decision-center(超集) | **重写为老板首页** |
| 2 | `/admin/decision-center` | 决策驾驶舱 | 6区聚合总览 | /api/admin/decision-center | 🟢 | `/`、closing、ai-top-picks、feature-platform | **合并→决策中心「全景」Tab** |
| 3 | `/admin/closing-decision` | 收盘决策 | 15:15最终决策 | /api/admin/closing-decision | 🟢 | decision-center | **合并→决策中心 Tab** |
| 4 | `/admin/ai-top-picks` | AI五选 | Top5实验 | /api/admin/ai-top-picks | 🟢Exp | decision-center内嵌、daily推荐 | **合并→决策中心 Tab** |
| 5 | `/watchlist/daily` | 每日关注池 | SB/BUY固化池 | /api/watchlist/daily* | 🟢 | ai-top-picks、推荐 | **合并→决策中心 Tab** |
| 6 | `/strategy` | 策略中心 | 三策略推荐/稳定/报告 | /api/strategy/* + reports/weekly·monthly | 🟢 | — | **保留(策略与回测主页)** |
| 7 | `/backtest` | 回测中心 | 策略回测+摘要 | /api/backtest/strategy·summary + learning + mission-control | 🟢 | research?tab=backtest(Alpha回测) | **合并→策略与回测 Tab** |
| 8 | `/portfolio` | AI投资组合 | Paper模拟盘 | /api/portfolio/paper | 🟢 | — | **保留(交易与持仓主页)** |
| 9 | `/watchlist` | 个人自选 | 自选CRUD | /api/watchlist + /api/stocks | 🟠含硬编码中文 | watchlist/daily(语义冲突) | **合并→交易与持仓「我的自选」Tab(修i18n)** |
| 10 | `/admin/research` | 研究中心 | 因子/Alpha/regime/fusion/V3 hub | research + research-overview + alpha* + regime + fusion + scoring-v3* + mission-control | 🟢 | 是天然聚合hub | **保留(数据与学习主页/hub)** |
| 11 | `/admin/features` | 因子注册中心 | 83因子静态目录 | 静态catalog(无API) | 🟢 | feature-promotion/platform | **合并→研究中心「因子」Tab** |
| 12 | `/admin/feature-promotion` | 因子晋升 | 晋升建议 | /api/admin/feature-promotion | 🟢 | features/platform | **合并→研究中心「因子」Tab** |
| 13 | `/admin/feature-platform` | 因子平台 | 平台日报/Integrity | /api/admin/feature-platform | 🟢 | features/promotion | **合并→研究中心「因子」Tab** |
| 14 | `/admin/learning-report` | 学习报告 | AI学习总结 | learning-report + mission-control | 🟢 | research(影子验证) | **合并→研究中心「学习」Tab** |
| 15 | `/admin/versions` | 版本中心 | 版本快照/对比 | version-timeline + versions + compare | 🟢 | — | **合并→研究中心「版本」Tab** |
| 16 | `/admin/experiments` | 实验室 | 实验登记 | 仅 /api/health/status | 🟠疑废(表无写入源) | — | **隐藏(暂留Tab,数据空)** |
| 17 | `/news` | 新闻情报 | 新闻列表 | /api/news | 🟢 | — | **合并→股票研究 Tab** |
| 18 | `/admin/mission-control` | 任务控制台 | 全站系统总览 | /api/admin/mission-control | 🟢 | verify/runtime/sync部分重叠 | **保留(系统管理主页/hub)** |
| 19 | `/admin/runtime` | Runtime可靠性 | 流水线/GPT日志 | /api/admin/runtime | 🟢 | mission-control | **合并→系统管理 Tab** |
| 20 | `/admin/verify` | 数据校验 | 完整性校验 | verify + health | 🟢 | mission-control | **合并→系统管理 Tab** |
| 21 | `/sync` | 数据中心 | 同步状态/触发 | sync/status + sync/jobs + health | 🟢 | mission-control | **合并→系统管理 Tab** |
| 22 | `/screener` | AI选股 | 全市场筛选 | /api/screener + gpt-score | 🟢(仅移动入口) | `/`内嵌screener | **保留(股票研究主页),桌面补入口** |
| 23 | `/stocks/[symbol]` | 个股详情 | 单股全景 | stocks/[symbol]/intelligence·indicators + financials + watchlist | 🟢叶子 | — | **保留(叶子详情页)** |
| 24 | `/ai-theme` | AI产业链 | 主题选股 | /api/ai-theme | 🟠(仅移动入口) | sectors | **合并→股票研究 Tab** |
| 25 | `/ai-theme/[theme]` | 主题详情 | 单主题成分 | ai-theme + gpt-score | 🟢叶子 | — | **保留(叶子)** |
| 26 | `/sectors` | 行业分析 | 行业排行 | /api/sectors | 🟠(仅移动入口) | ai-theme | **合并→股票研究 Tab** |
| 27 | `/indicators` | 技术指标榜 | 指标排行 | /api/indicators | 🟠孤儿 | screener/stocks | **合并→股票研究 Tab** |
| 28 | `/stocks` | TOP500列表 | 股票列表 | /api/indicators | 🟠孤儿 | screener | **重定向→/screener** |
| 29 | `/coming-soon` | 占位页 | ?feature=回退 | 无 | ⚪工具 | — | **保留(工具)** |
| 30 | `/ai-picks` | AI精选(旧) | 旧GPT重排 | /api/ai-scores | 🔵307→`/` | 决策中心 | **重定向保留→决策中心** |
| 31 | `/alpha` | 旧因子 | — | 客户端stub | 🔵307→research?tab=factors | research | **重定向** |
| 32 | `/alpha/score` | 旧影子评分 | — | stub | 🔵307→research?tab=score | research | **重定向** |
| 33 | `/alpha/backtest` | 旧回测 | — | stub | 🔵307→research?tab=backtest | research | **重定向** |
| 34 | `/alpha/report` | 旧分析 | — | stub | 🔵307→research?tab=analytics | research | **重定向** |
| 35 | `/fusion/report` | 旧融合报告 | — | stub | 🔵307→research?tab=fusion | research | **重定向** |
| 36 | `/fusion/paper` | Fusion模拟 | 真实页被遮蔽 | /api/fusion/paper | ⚫死代码+拦截 | research fusion | **补重定向→research?tab=fusion,页面文件删** |
| 37 | `/market-regime` | 市场状态 | — | 仅客户端replace | 🔵(未进next.config) | research?tab=regime | **补next.config 307** |

**另:死组件**（非页面,可直接删）：`app/HomeDashboardClient.tsx`、`app/SystemDashboard.tsx`（0 import,被 CommandCenter 取代）+ `DashboardView` 默认导出/`PipelineCompact`/`QuickActions` 死导出。

---

## 二、按老板实际任务重新分类（A–G）

| 任务 | 含义 | 归入的现有模块 |
|---|---|---|
| **A. 今天是否交易** | BUY/WATCH/CASH | closing-decision、decision-center(regime/risk)、market-regime |
| **B. 买哪只股票** | 今日推荐/候选 | ai-top-picks(五选)、watchlist/daily(关注池)、`/`(TodayIntel)、screener、ai-theme、sectors、indicators |
| **C. 当前持仓怎么办** | 持仓操作建议 | portfolio(Paper)、watchlist(自选)、strategy(持仓/退出) |
| **D. 个股为什么值得买** | 单股解释 | stocks/[symbol](含 ExplainPanel/AI决策)、ai-theme/[theme]、news、financials |
| **E. 策略是否有效** | 策略绩效/回测/学习 | strategy、backtest、learning-report、research(fusion/regime) |
| **F. 数据和模型是否正常** | 因子/影子/模型健康 | research(因子/Alpha/V3)、features/promotion/platform、versions、experiments、verify(数据完整性) |
| **G. 系统是否正常运行** | Health/Cron/部署 | mission-control、runtime、sync、verify(健康)、deployments |

**分层结论**：A/B/C/D = 老板日常（决策+研究+交易）；E = 半技术（策略验证）；F/G = 纯管理员（数据/模型/系统）。→ 前 4 类进老板可见一级导航，F/G 折叠进管理员区。

---

## 三、新一级导航（6 个,其中 2 个管理员折叠）

### 1️⃣ 决策中心 `/`（老板默认落地 · 任务 A+B）
- **主页面**：老板首页（重写,见§五）
- **内部 Tab**：今日决策(closing-decision) · AI五选(ai-top-picks) · 每日关注池(watchlist/daily) · 全景(decision-center)
- **合并旧页**：decision-center、closing-decision、ai-top-picks、watchlist/daily、ai-picks(重定向)
- **默认展示**：今日 BUY/WATCH/CASH + 第一推荐 + 建议组合 + 持仓提示 + 市场风险 + 数据新鲜度 + 下次任务时间
- **管理员限定**：无（全部老板可见）

### 2️⃣ 股票研究 `/screener`（任务 B+D）
- **主页面**：AI 选股器（screener）
- **内部 Tab**：选股器 · 行业(sectors) · 产业链(ai-theme) · 指标榜(indicators) · 新闻(news)
- **叶子页**：个股详情 stocks/[symbol]、主题详情 ai-theme/[theme]（上下文进入）
- **合并旧页**：sectors、ai-theme、indicators、news、stocks(列表→重定向 screener)
- **默认展示**：全市场筛选结果（评分/评级/涨跌）
- **管理员限定**：无

### 3️⃣ 策略与回测 `/strategy`（任务 C+E）
- **主页面**：策略中心
- **内部 Tab**：策略推荐 · 稳定性 · 报告（现有）+ **回测**（合并 /backtest 的策略回测 + research 的 Alpha 回测双源分子 tab）
- **合并旧页**：backtest、alpha/backtest(重定向)
- **默认展示**：三策略今日推荐 + 绩效
- **管理员限定**：回测原始参数（可选折叠）

### 4️⃣ 交易与持仓 `/portfolio`（任务 C）
- **主页面**：AI 投资组合（Paper Broker）
- **内部 Tab**：AI 组合 · **我的自选**(watchlist personal,修 i18n)
- **合并旧页**：watchlist、fusion/paper(重定向)
- **默认展示**：当前持仓 + 盈亏 + 操作建议
- **管理员限定**：无

### 5️⃣ 数据与学习 `/admin/research` 🔒管理员（任务 F）
- **主页面**：研究中心（已是多 tab hub）
- **内部 Tab**：总览 · **因子**(features+promotion+platform 三合一) · Alpha(score/analytics/backtest) · 市场状态(regime) · 融合(fusion) · **V3 影子**(shadow/calibration/freeze/readiness) · **学习报告**(learning-report) · **版本**(versions) · 实验室(experiments,隐藏)
- **合并旧页**：features、feature-promotion、feature-platform、learning-report、versions、experiments、alpha/*、fusion/report、market-regime、scoring-v3 面板
- **默认展示**：研究总览（因子健康/Alpha/regime）
- **管理员限定**：全部（老板默认不可见）

### 6️⃣ 系统管理 `/admin/mission-control` 🔒管理员（任务 G）
- **主页面**：任务控制台
- **内部 Tab**：总览 · 运行时(runtime) · 数据校验(verify) · 同步(sync) · 部署历史(deployments)
- **合并旧页**：runtime、verify、sync
- **默认展示**：Health/Cron/Web/DB/部署/版本
- **管理员限定**：全部

> 老板日常只见 **1–4**（4 个一级）；**5–6** 折叠在「管理员」区，需切换角色/展开才显示。一级总数 = 6（满足 ≤6）。

---

## 四、8 个重点整合方案

**1. 六个驾驶舱合并** → 以「决策中心」为唯一驾驶舱：`/` 老板首页(轻) + decision-center 作「全景」Tab(重)；closing-decision/ai-top-picks/watchlist-daily/feature-platform 从独立页降为 Tab 或被首页/全景内嵌。侧栏「决策」类由 5 项 → 1 项。

**2. 每日推荐 / AI五选 / 收盘决策整合** → 三者是**同一决策的不同时间切面**：晨间推荐(DailyRecommendation/`/`)→ 盘中五选(ai-top-picks)→ 收盘决策(closing-decision 15:15)。统一为决策中心内「晨/盘/收」三时段 Tab，共享同一「今日决策」框架，避免三个独立页各说各话。

**3. 因子三页合一** → features(注册/静态) + feature-promotion(晋升) + feature-platform(平台/Integrity) 职责连续，合为研究中心「因子」大 Tab 下的 3 个子视图（目录/晋升/平台）。数据源不变，仅收口 UI 入口。

**4. 两套回测合并** → `/backtest`(StrategyBacktestResult 策略回测) 与 research?tab=backtest(AlphaBacktestResult Alpha 回测)是**不同数据的两类回测**。统一放「策略与回测」的「回测」Tab 下分「策略回测/因子回测」两子标签，消除双正式入口。

**5. Watchlist 语义统一** → 明确三层语义：**推荐池**(系统产出,DailyRecommendation)→ **每日关注池**(AI 固化 SB/BUY,watchlist/daily,归决策中心)→ **我的自选**(用户手动 CRUD,watchlist,归交易与持仓)。三者路径/命名分离，不再 /watchlist 与 /watchlist/daily 混淆。

**6. 数据健康/Cron/部署/日志归系统管理** → verify(数据完整性)+runtime(流水线/GPT日志)+sync(同步)+deployments(部署史) 全并入 mission-control 的 Tab，系统管理由 6 项 → 1 hub。

**7. 学习报告/影子验证/模型表现统一** → learning-report(学习总结)+V3 影子(scoring-v3 面板)+因子平台表现 归入研究中心，作「学习/模型表现」Tab 群，与「数据/因子」并列，统一「模型是否正常」视图。

**8. 桌面/移动导航同源** → 现状：Sidebar 用 `lib/routes.ts` ROUTES(20 次)，移动 MobileBottomNav/Drawer **硬编码路径**（两套不同源，导致 screener/ai-theme/sectors 仅移动可达）。方案：抽 `lib/navigation/nav-config.ts` 单一配置（一级+Tab+图标+权限+移动可见标记），桌面侧栏与移动底栏/抽屉都从它派生，一处改两端生效。

---

## 五、老板首页设计（`/` 重写）

**只回答 7 个问题，零开发指标/零表名/零 Cron 技术细节：**

```
┌─ 今日建议 ────────────────────────────┐
│  🟢 BUY TODAY / 🟡 WATCH ONLY / ⚪ STAY CASH │  ← closing-decision.decision
│  一句话理由（机会分/市场/风险汇总）              │
├─ 今日第一推荐 ──────────────────────────┤
│  7203.T 丰田  信心A  买区¥x–y 止盈z 止损w      │  ← closing-decision.firstPick
├─ 今日建议组合 ──────────────────────────┤
│  3-5 只 + 各仓位%（迷你卡）                    │  ← closing-decision.portfolio
├─ 当前持仓操作 ──────────────────────────┤
│  持有N/加仓M/减仓K + 需关注的1-2条              │  ← portfolio/paper 派生
├─ 市场风险 ───────────────────────────┤
│  regime BULL/SIDEWAYS/BEAR + 风险 低/中/高      │  ← decision-center/regime
├─ 数据新鲜度 ─────────────────────────┤
│  价格✓今日 · 评分✓07:30 · 新闻✓ (绿/黄点)      │  ← health/mission-control 派生
├─ 下次关键任务 ───────────────────────┤
│  收盘决策 15:15 · 距现在 2h13m                 │  ← cron 静态时刻表派生
└─ 每块右上「查看详情 →」进对应页面 ──────────┘
```
- 数据全部来自**现有 API**（closing-decision / portfolio-paper / decision-center / health），无需新算法、新表。
- 技术内容（Integrity/GPT token/流水线阶段）**移出首页**，收进「系统管理」，「查看详情」按需进入。

---

## 六、页面数量对照

| 项 | 当前 | 目标后 |
|---|---:|---:|
| 总页面(page.tsx) | 37 | 37(文件保留,靠导航收敛) |
| **独立主页面**(nav 一级/叶子渲染) | ~20 | **9**（6 hub + 个股详情 + 主题详情 + coming-soon） |
| 改为 Tab 承载 | 0 | **19**（decision/closing/ai-top-picks/watchlist-daily/sectors/ai-theme/indicators/news/backtest/watchlist/features/promotion/platform/learning/versions/runtime/verify/sync/experiments） |
| 隐藏(暂留代码,无入口) | 3(孤儿) | **2**（experiments 空数据、stocks 列表） |
| 重定向(301/307) | 6 | **8**（+market-regime、fusion/paper） |
| 最终删除 | 0 | **2 死组件** + 观察期后 legacy 页面文件(alpha*/fusion*/ai-picks 约 7) |
| **老板日常可见** | ~15+ | **≤8**（4 一级 hub + 个股/主题详情 + 关注/新闻 tab） |

✅ 老板可见 ≤10 · 系统主页面 9 ≤15。

---

## 七、迁移原则（强约束,全程遵守）

- ❌ 不改：生产评分逻辑(compute-scores/ai-score)、策略算法、Paper Broker、资金链路
- ❌ 不删数据库数据/表；不立即删旧 URL（先 301/应用内重定向,观察 2 周）
- ✅ 页面合并后**必须验证新旧 API 数据一致**（同 API 换外壳,截图/字段比对）
- ✅ 保持现有权限（管理员区不对老板暴露）与三语 i18n（合并页所有文案过 t()，修 /watchlist 硬编码中文）
- ✅ 保持手机端可用（导航同源后移动端同步收敛）
- 🔒 **决策中心整合会内嵌 closing-decision/ai-top-picks，这些是只读展示层，不碰其生成脚本/评分**——属安全区；但严禁顺手改其后端

---

## 八、分阶段实施计划

| 阶段 | 修改范围 | 涉及页面 | 风险 | 触冻结区? | 验收 | 回滚 |
|---|---|---|---|---|---|---|
| **P7-02A 导航统一** | 抽 `lib/navigation/nav-config.ts` 单一源,桌面/移动派生;一级收敛为6(4+2折叠) | Sidebar/Mobile*/routes.ts | 低 | 否(纯导航层) | 桌面=移动入口一致;三语;移动可用;各页仍可达 | git revert nav-config;导航是纯展示 |
| **P7-02B 决策页合并** | `/`重写老板首页;decision-center/closing/ai-top-picks/watchlist-daily 降 Tab(路由保留,加 host?tab=) | 1,2,3,4,5,30 | 中 | 否(只读展示层,不碰生成脚本) | 新首页7问全渲染;各 Tab 数据与旧独立页**逐字段一致**(截图比对);老板首页无技术指标 | 首页组件独立,回退旧 CommandCenter;Tab 页文件未删 |
| **P7-02C 研究/因子/回测合并** | features+promotion+platform→研究中心因子Tab;learning/versions→Tab;`/backtest`→策略Tab(策略+Alpha双子标签) | 7,10-16 | 中 | 否(研究层只读) | 研究中心各 Tab API 一致;回测双源正确分列;学习/版本数据不变 | Tab 内嵌旧页组件,回退独立路由 |
| **P7-02D 系统管理收口** | runtime/verify/sync→mission-control Tab;deployments 接入 | 18-21 | 低 | 否(管理员只读) | 系统 Tab 全绿;Health/Cron/部署一致 | 组件复用,回退独立页 |
| **P7-02E 重定向+死码清理** | market-regime/fusion-paper 补 next.config 307;stocks列表→screener;删2死组件+死导出;legacy 页面文件观察2周后删 | 27,28,31-37 + 死组件 | 低→中 | 否 | smoke:legacy 全 307+Location 正确;死组件删后 build 0;2周无回归后删文件 | next.config 单条回退;死组件删除有 git |

---

## 九、最终交付

### 清单1 ·《新导航树》

```
【老板可见】
├─ 1. 决策中心 /                      (老板首页)
│     └ Tab: 今日决策 · AI五选 · 每日关注池 · 全景
├─ 2. 股票研究 /screener
│     ├ Tab: 选股器 · 行业 · 产业链 · 指标榜 · 新闻
│     └ 叶子: 个股详情 /stocks/[symbol] · 主题详情 /ai-theme/[theme]
├─ 3. 策略与回测 /strategy
│     └ Tab: 策略推荐 · 稳定性 · 报告 · 回测(策略/因子)
└─ 4. 交易与持仓 /portfolio
      └ Tab: AI组合 · 我的自选

【管理员折叠】
├─ 5. 数据与学习 /admin/research 🔒
│     └ Tab: 总览 · 因子(注册/晋升/平台) · Alpha · 市场状态 · 融合 · V3影子 · 学习报告 · 版本 · 实验室(隐藏)
└─ 6. 系统管理 /admin/mission-control 🔒
      └ Tab: 总览 · 运行时 · 数据校验 · 同步 · 部署历史

【工具】/coming-soon (占位回退)
```

### 清单2 ·《旧页面 → 新页面映射表》

| 旧路由 | 新归属 | 方式 |
|---|---|---|
| / | 决策中心(首页,重写) | 重写 |
| /admin/decision-center | 决策中心?tab=全景 | Tab |
| /admin/closing-decision | 决策中心?tab=今日决策 | Tab |
| /admin/ai-top-picks | 决策中心?tab=五选 | Tab |
| /watchlist/daily | 决策中心?tab=关注池 | Tab |
| /ai-picks | 决策中心 | 307(已) |
| /screener | 股票研究(主页) | 保留+桌面补入口 |
| /sectors | 股票研究?tab=行业 | Tab |
| /ai-theme | 股票研究?tab=产业链 | Tab |
| /indicators | 股票研究?tab=指标榜 | Tab |
| /news | 股票研究?tab=新闻 | Tab |
| /stocks(列表) | /screener | 重定向 |
| /stocks/[symbol] | 股票研究/叶子 | 保留 |
| /ai-theme/[theme] | 股票研究/叶子 | 保留 |
| /strategy | 策略与回测(主页) | 保留 |
| /backtest | 策略与回测?tab=回测 | Tab |
| /alpha/backtest | 策略与回测?tab=回测(因子) 或 research | 307(已) |
| /portfolio | 交易与持仓(主页) | 保留 |
| /watchlist | 交易与持仓?tab=我的自选 | Tab(修i18n) |
| /fusion/paper | research?tab=fusion | 补307+删死页 |
| /admin/research | 数据与学习(主页hub) | 保留 |
| /admin/features | 研究中心?tab=因子 | Tab |
| /admin/feature-promotion | 研究中心?tab=因子 | Tab |
| /admin/feature-platform | 研究中心?tab=因子 | Tab |
| /admin/learning-report | 研究中心?tab=学习 | Tab |
| /admin/versions | 研究中心?tab=版本 | Tab |
| /admin/experiments | 研究中心?tab=实验室 | Tab(隐藏) |
| /alpha,/alpha/score,/alpha/report,/fusion/report | research 对应 tab | 307(已) |
| /market-regime | research?tab=regime | 补next.config 307 |
| /admin/mission-control | 系统管理(主页hub) | 保留 |
| /admin/runtime | 系统管理?tab=运行时 | Tab |
| /admin/verify | 系统管理?tab=校验 | Tab |
| /sync | 系统管理?tab=同步 | Tab |
| /coming-soon | 工具 | 保留 |
| HomeDashboardClient/SystemDashboard(组件) | — | 删除 |

### 清单3 ·《分阶段实施计划》
P7-02A 导航统一 → P7-02B 决策合并 → P7-02C 研究/因子/回测合并 → P7-02D 系统管理收口 → P7-02E 重定向+死码清理（详见§八表）。

---

## 最终结论

- **推荐一级导航数量**：**6**（老板可见 4 + 管理员折叠 2）
- **推荐老板可见页面数量**：**≤8**（4 一级 hub + 个股/主题详情 + 关注/新闻 Tab）
- **推荐系统主页面数量**：**9**（6 hub + 2 叶子 + coming-soon），远低于 15 上限
- **第一阶段从哪起**：**P7-02A 导航统一**——纯导航层、零风险、不触任何冻结区、不动任何 API/数据/逻辑，却立刻把「桌面/移动不同源 + 一级 20 项」的混乱收敛为「6 一级 + 单一配置源」，为后续 B/C/D 的 Tab 合并铺好承载框架。改错也只需 git revert 一个 nav-config 文件。
