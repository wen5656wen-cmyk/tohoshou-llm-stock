# P21-T5 · Research & System Workspace Design Proposal

> 本轮只做设计。未修改任何代码 / API / 数据库。未 commit / push / deploy。
> 日期：2026-07-21 ｜ 前置：S0–S2 ✅ · T1 ✅ · T2 ✅ · T3 ✅ · T4 ✅
> **基线已刷新**：T2/T3/T4 改动了大量结构，本设计基于**当前真实状态**重新核准，非沿用 T0/T1 的旧快照。

---

## 1. Design Goals

1. **职责唯一** —— 一个能力一个入口，研究区不混系统功能，系统区不混研究与股票浏览。
2. **入口唯一** —— 消除双前缀、无归属页、孤儿 API。
3. **层级更浅** —— 研究区从「Hub 5 顶级 Tab + 16 子标签」压到「5 阶段 + 13 子标签」，且阶段名即研究流程。
4. **老板一眼知道去哪** —— 导航标签用**做什么**命名（数据探索 / 因子研究 / AI 分析 / 实验验证 / 研究结论），而不是用内部术语（factors / alpha / v3）。

---

## 2. Responsibility Matrix

### 2.1 Research Workspace 现状（T4 后）

| 单元 | 路由 | 真实职责 | 数据源 | 判定 |
|---|---|---|---|---|
| 股票研究·行业 | `/screener?tab=sectors` | JPX 33 行业聚合轮动 | `StockScore` 按 sector | **保留** |
| 股票研究·主题 | `?tab=themes` | 14 主题 × 供应链 5 层 | `AITheme`（唯一消费者） | **保留** |
| 股票研究·新闻 | `?tab=news` | News 表浏览 | `News`（唯一 UI） | **保留** |
| factors:lib | `?tab=factors&sub=lib` | AlphaFactor 矩阵浏览 + CSV | `alpha_factors` | 保留 |
| factors:registry | `&sub=registry` | 静态代码常量镜像 | **无 DB 无 API** | **空壳** → 见 §2.3 |
| factors:promotion | `&sub=promotion` | 因子晋升建议 | `factor_alpha_results` | 保留 |
| factors:platform | `&sub=platform` | 因子平台 Integrity + cron 新鲜度 | 同上 + `GlobalMarket` | 保留（**非系统健康**） |
| alpha:score | `?tab=alpha&sub=score` | 影子 vs 正式逐股分歧 | `alpha_scores` | 保留 |
| alpha:analytics | `&sub=analytics` | 因子有效性 IC/夏普 | `alpha_factor_reports` | 保留 |
| alpha:fusion | `&sub=fusion` | 融合权重研究 | `RegimeFusionResult` | 保留 |
| alpha:regime | `&sub=regime` | MarketRegime 历史序列 | `MarketRegime` | 保留 |
| v3:shadow | `?tab=v3&sub=shadow` | V3 影子评分全表 | `AdaptiveScoreV3Shadow` | 保留 |
| v3:calibration | `&sub=calibration` | V3 就绪度与阈值 | `AdaptiveScoreV3Calibration` | 保留（**须修空态崩溃**） |
| experiments:versions | `?tab=experiments` | 版本对比 + 关联完整性 | `VersionSnapshot` | 保留 |
| backtest:alpha | `?tab=backtest` | 影子策略回测矩阵 | `AlphaBacktestResult` | 保留 |
| 学习报告 | `/admin/learning-report` | 数据完整性 / 回填进度 / 回归检测 | 文件 `reports/latest-learning.json` | **移动**（转正为研究结论） |

### 2.2 System Workspace 现状（T4 后）

| Tab | 真实职责 | 写操作 | 判定 |
|---|---|---|---|
| overview | 控制中心聚合大盘 | 无 | 保留（**须修假绿灯**） |
| runtime | Runtime 可靠性 + GPT 用量 + 日志时间线 | 无 | 保留（T2 已并入 log） |
| health | 数据健康守卫摘要 | 无 | 保留 |
| verify | 生产就绪校验 + 推荐明细 | 无 | 保留（运维专属） |
| **sync** | 数据源健康 + **手动触发同步** | **有** | 保留（**最高风险，须二次确认**） |
| deploy | 部署记录 | 无 | 保留 |
| AI Universe | `/admin/universe` 排除股视图 | 无 | **移动** → 配置 |

### 2.3 缺陷与空白（本轮核准新发现）

| # | 问题 | 证据 | 处置 |
|---|---|---|---|
| **D1** | `/admin/learning-report` **同时在** `ADMIN_PREFIXES` 与 `RESEARCH_PREFIXES`，research 先匹配胜出 | `nav-config.ts:70,74` | 从 ADMIN 移除（它归研究） |
| **D2** | `/admin/mission-audit` **两个前缀都不在** → `workspaceForPath` 回落 **boss** —— 一个管理页出现在老板工作区 | `nav-config.ts:70-76` + 页面存在 | 加入 ADMIN_PREFIXES，并入系统区 Mission Tab |
| **D3** | 三个 admin API **零前端消费者** | `/api/admin/experiments` · `/api/admin/health/mission` · `/api/admin/portfolio-debug` | health/mission 接入 Mission Tab；另两个删除 |
| **D4** | `factors:registry` 数据源是 TS 源码常量，所有统计恒空 | `lib/features/catalog.ts` | 降级为「因子登记（只读）」，明确标注非实时 |
| **D5** | `v3:calibration` 空数据崩溃 | `CalibrationPanel:68,87` | 实现阶段修 |
| **D6** | 系统区无 Mission 视图 | — | 新增 Mission Tab |
| **D7** | 系统区无 Config 视图 | — | 新增 配置 Tab（承接 universe + sync） |

**汇总**：保留 15 · 移动 2 · 新增 2 · 删除 2（孤儿 API）· 空壳降级 1。

---

## 3. Research Workspace IA

### 3.1 五阶段研究流程（导航即流程）

```
① 数据探索  →  ② 因子研究  →  ③ AI 分析  →  ④ 实验验证  →  ⑤ 研究结论
   看市场          找因子         看模型         验效果          下结论
```

| 阶段 | 路由 | 子页 | 回答什么问题 |
|---|---|---|---|
| **① 数据探索** | `/screener?ws=research` | 行业轮动 · 主题研究 · 新闻情绪 | 市场在发生什么？ |
| **② 因子研究** | `/admin/research?tab=factors` | 因子库 · 因子登记 · 晋升建议 · 因子平台 | 哪些因子有效、该不该上线？ |
| **③ AI 分析** | `?tab=analysis` | 影子分歧 · 因子效力 · 融合权重 · 市场状态 · V3 影子 · V3 标定 | 模型现在怎么想？与正式版差在哪？ |
| **④ 实验验证** | `?tab=experiments` | 策略回测 · 版本对比 | 改动到底有没有变好？ |
| **⑤ 研究结论** | `?tab=conclusions` | 学习报告 | 数据够不够、结论能不能下？ |

### 3.2 结构变化

| | 现状 | 新设计 |
|---|---|---|
| Hub 顶级 Tab | 5（factors/alpha/v3/experiments/backtest） | **4**（factors/analysis/experiments/conclusions） |
| 子标签总数 | 16 | **13** |
| 侧栏节点 | 4（rs-home + 3 个 screener） | **5**（五阶段各一个） |
| 命名 | 内部术语（alpha / v3） | **业务语言**（AI 分析 / 实验验证） |

**alpha 与 v3 合并为「AI 分析」**：两者都是「模型输出 vs 正式版」的对照，分成两个顶级 Tab 是按**实现代际**切分而非按**用途**切分 —— 老板不需要知道哪个是 v3。

**backtest 与 experiments 合并为「实验验证」**：T2 之后两者各只剩 1 个子标签（backtest:alpha、experiments:versions），各占一个顶级 Tab 不成比例。

### 3.3 边界检查

- ❌ **不含系统功能** —— `factors:platform` 虽名为「平台健康」，其内容是**因子管线** Integrity（STALE_ALPHA / BROKEN_LINK / TOPIX 断裂），属研究基础设施，不是服务器健康。系统区的 health 是 `data-health-guard`，两者数据源完全不同，不重复。
- ❌ **不含股票浏览** —— 全市场浏览已于 T4 收敛到股票中心；研究区的「数据探索」是行业/主题/新闻三个**聚合视角**，不做个股列表。
- ✅ **无重复入口** —— `learning-report` 从游离内部页转正为 ⑤，不再有第二处。

---

## 4. System Workspace IA

### 4.1 六项职责

| 职责 | Tab | 内容 | 受众 |
|---|---|---|---|
| **① Runtime** | 运行时 | Runtime 可靠性 30 天趋势 · GPT 调用/重试/429/token · Pipeline 时间线 · **日志**（T2 已并入） | 运维 |
| **② Health** | 数据健康 | data-health-guard 摘要（CRITICAL/WARNING/PASS/覆盖率） | **老板可见** |
| **③ Deploy** | 部署记录 | 近 20 次部署（commit/build/摘要/时间） | **老板可见** |
| **④ Logs** | —— | **并入 Runtime**（T2 已裁决：与 runtime 复用完全相同的 API） | 运维 |
| **⑤ Mission** | Mission | **新增**：Mission 健康（`/api/admin/health/mission`，现无 UI）+ Mission 审计回放（`/admin/mission-audit`，现错落在 boss） | 运维 |
| **⑥ Config** | 配置 | **新增**：AI 股票池管理（`/admin/universe`）+ 数据同步（sync，**加二次确认**） | 运维专属 |
| （总览） | 总览 | 聚合大盘（须修假绿灯） | **老板可见** |
| （校验） | 生产校验 | verify（暴露推荐明细） | 运维专属 |

### 4.2 Tab 结构

```
系统  overview · runtime · health · mission · deploy · config · verify     （7 Tab）
      └ 老板可见：overview · health · deploy
      └ 运维专属：runtime · mission · config · verify
```

**为什么 sync 收进「配置」而不单列**：它是全站唯一含生产写操作的 UI（`POST /api/sync/scores` 会重写 3700+ 条评分）。放在「配置」下并加二次确认，比作为一级 Tab 更难被误点。

### 4.3 边界检查

- ❌ **不混研究功能** —— 因子平台 Integrity 留在研究区，不进系统健康。
- ❌ **不混股票浏览** —— `/admin/universe` 是**股票池管理**（哪些股票参与 AI 评分），不是股票浏览；它不含价格/评分/排序，只有排除原因。

---

## 5. Hi-Fi Layout — Research Workspace

### 5.1 侧栏（五阶段）

```
┌─ 研究 ────────────┐
│ ① 数据探索         │  ← /screener?ws=research
│ ② 因子研究         │  ← /admin/research?tab=factors
│ ③ AI 分析          │  ← ?tab=analysis
│ ④ 实验验证         │  ← ?tab=experiments
│ ⑤ 研究结论         │  ← ?tab=conclusions
└───────────────────┘
```

### 5.2 ③ AI 分析（子标签最多，作为布局范例）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ② 因子研究   ③ AI 分析   ④ 实验验证   ⑤ 研究结论            ← Hub 顶级 Tab   │
├──────────────────────────────────────────────────────────────────────────────┤
│  [影子分歧] [因子效力] [融合权重] [市场状态] [V3 影子] [V3 标定]  ← 子标签(URL) │
├──────────────────────────────────────────────────────────────────────────────┤
│  ⓘ 数据截至 2026-07-21 07:08 JST · 来源 alpha_scores            ↻ 刷新        │ ← 口径条
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌── 结论卡（1 行，先给判断再给数据）─────────────────────────────────────┐ │
│  │  影子模型与正式版分歧 18 只（高分歧 3 只）· 平均偏离 +2.4 分             │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  代码     名称           正式分  影子分  偏离   贡献因子          评级        │
│  9343.T   アイビス         76      81    +5.0   相对强弱 +0.32   STRONG_BUY  │ ← 明细表
│  ⋯                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│  ⓘ 影子模型不参与实盘决策，仅用于对照验证。                    [导出 CSV]     │ ← 边界声明
└──────────────────────────────────────────────────────────────────────────────┘
```

| 区域 | 显示什么 | 为什么 | 主要交互 |
|---|---|---|---|
| Hub 顶级 Tab | 四阶段 | 阶段名即流程，老板不必懂术语 | 切换（进 URL） |
| 子标签 | 该阶段的分析视角 | T3 已 URL 化，可深链、刷新不丢 | 切换（进 URL） |
| **口径条** | 数据截至 + 来源表 + 刷新 | 研究区 13 个页面**目前零 `common.asOf.*`**，5 种时间口径混用 —— 统一到这里 | 点 ↻ 重取 |
| **结论卡** | 一句话判断 + 关键数字 | 现状是「一上来就是 3000 行表格」，看不出结论。先给判断 | 只读 |
| 明细表 | 逐股/逐因子数据 | 研究员的实际工作面 | 排序、点行进详情 |
| **边界声明** | 「不参与实盘决策」 | 影子/回测类页面必须声明，避免被当成操作建议 | — |

### 5.3 其余阶段套用同一骨架

**口径条 → 结论卡 → 明细 → 边界声明**，四段式统一。差异只在明细表的列。

- **② 因子研究**：结论卡 = 「建议晋升 2 个 · 建议下线 1 个 · 影子中 8 个」
- **④ 实验验证**：结论卡 = 「最新版本 vs 上一版：7 日胜率 −3.2pp（WARNING）」
- **⑤ 研究结论**：结论卡 = 「数据完整性 92% · 回填进度 1146/3018 · 未检出回归」

---

## 6. Hi-Fi Layout — System Workspace

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  总览  运行时  数据健康  Mission  部署记录  配置  生产校验                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  ⓘ 各区块自带数据时间（管线状态来自 DB 落库，非 cron 日志）                   │ ← 口径声明
├──────────────────────────────────────────────────────────────────────────────┤
│  🟢 数据健康 CRITICAL 0    🟡 管线 11/13    🟢 部署 #268    🟢 Mission 2/2    │ ← 状态条(真实探测)
├──────────────────────────────────────────────────────────────────────────────┤
│  今日管线                                                                     │
│  ✓ 07:08 AI 评分   3018 只   ·DB                                             │
│  ✓ 08:20 Mission Prepare  12 笔  ·DB                                         │ ← 每步标 DB/LOG 来源
│  ○ 15:15 收盘决策（下一步）                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│  数据新鲜度 · 服务状态 · 近期错误                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

| 区域 | 显示什么 | 为什么 | 交互 |
|---|---|---|---|
| **状态条** | 4 个真实探测的健康灯 | **现状是硬编码常绿**（API/DB/AI Engine `ok:true` 无任何探测）—— 必须改真实探测，否则给老板错误的安全感 | 点击进对应 Tab |
| **今日管线** | 13 步 + 每步 `·DB` / `·LOG` 来源标记 | **现状仅 2/13 步用 DB 判据**，其余读 `pipeline-runs.jsonl`，与今日简报的 DB 判据可能矛盾。标出来源，让不一致可见 | 点步骤看详情 |
| 数据新鲜度 | 各表最新日期 | 判断哪条链路停了 | — |
| **Mission Tab** | Mission 健康 + 审计回放 | 承接目前**无 UI 的** `/api/admin/health/mission` 与错落在 boss 的 `/admin/mission-audit` | 选 Mission 回放 |
| **配置 Tab** | AI 股票池 + 数据同步 | 同步按钮**加二次确认弹窗**（写操作会重算全市场评分） | 确认后触发 |

---

## 7. Navigation Tree（最终拓扑）

```
决策 Boss（P19 IA Freeze，本轮不动）
  决策总览      /decision-v2?tab=overview
  股票中心      /decision-v2?tab=recommendations     ← T4 已合并
  行业分析      /screener?tab=sectors                ← ⚠️ 与研究区重复，T8 移除
  深度研究      /deep-research
  今日简报      /decision-v2?tab=strategy
  AI Mission Lab /decision-v2?tab=portfolio
  AI 战绩档案    /decision-v2?tab=history

研究 Research（五阶段）
  ① 数据探索    /screener?ws=research        → 行业轮动 · 主题研究 · 新闻情绪
  ② 因子研究    /admin/research?tab=factors  → 因子库 · 因子登记 · 晋升建议 · 因子平台
  ③ AI 分析     ?tab=analysis                → 影子分歧 · 因子效力 · 融合权重 · 市场状态 · V3影子 · V3标定
  ④ 实验验证    ?tab=experiments             → 策略回测 · 版本对比
  ⑤ 研究结论    ?tab=conclusions             → 学习报告

系统 System
  总览          /admin/mission-control?tab=overview   （老板可见）
  数据健康      ?tab=health                           （老板可见）
  部署记录      ?tab=deploy                           （老板可见）
  运行时        ?tab=runtime                          （运维，含日志）
  Mission       ?tab=mission                          （运维，新增）
  配置          ?tab=config                           （运维，含 universe + sync）
  生产校验      ?tab=verify                           （运维）

删除
  /api/admin/experiments · /api/admin/portfolio-debug        （零消费者孤儿 API）

重定向（不留 404）
  /admin/research?tab=alpha|v3      → ?tab=analysis&sub=…
  /admin/research?tab=backtest      → ?tab=experiments&sub=backtest
  /admin/learning-report            → ?tab=conclusions
  /admin/mission-audit              → /admin/mission-control?tab=mission
  /admin/universe                   → /admin/mission-control?tab=config
```

---

## 8. Migration Matrix

| 来源 | 目标 | 类型 |
|---|---|---|
| `/screener?tab=sectors\|themes\|news` | 研究 ① 数据探索 | 保留（加 `ws=research`） |
| Hub `?tab=factors`（4 子标签） | 研究 ② 因子研究 | 保留 |
| Hub `?tab=alpha`（4 子标签） | 研究 ③ AI 分析 | **合并** |
| Hub `?tab=v3`（2 子标签） | 研究 ③ AI 分析 | **合并** |
| Hub `?tab=backtest`（backtest:alpha） | 研究 ④ 实验验证 | **合并** |
| Hub `?tab=experiments`（versions） | 研究 ④ 实验验证 | 保留 |
| `/admin/learning-report`（内部页） | 研究 ⑤ 研究结论 | **移动**（转正） |
| SystemHub overview / runtime / health / verify / deploy | 系统 同名 Tab | 保留 |
| SystemHub sync | 系统 配置 Tab | **移动**（加二次确认） |
| `/admin/universe`（内部页） | 系统 配置 Tab | **移动** |
| `/admin/mission-audit`（现落 boss） | 系统 Mission Tab | **移动** |
| `/api/admin/health/mission`（无 UI） | 系统 Mission Tab | **接入** |
| `/api/admin/experiments`（零消费） | — | **删除** |
| `/api/admin/portfolio-debug`（零消费） | — | **删除** |

**所有页面均有最终归宿，无遗留。**

---

## 9. Risks

| # | 风险 | 类型 | 缓解 |
|---|---|---|---|
| R1 | Hub 顶级 Tab key 改名（alpha/v3/backtest → analysis/experiments），旧深链失效 | **导航兼容** | Hub 内 `LEGACY_TAB` 映射旧 key → 新 tab+sub；`next.config.ts` 与 `routes.ts` 同步更新（T3 已建立该模式） |
| R2 | 研究区 13 个组件 **20/27 零 i18n、624 行硬编码中文** | 迁移 | 实现阶段逐页接 `useI18n`；这是 T5 的主体工作量 |
| R3 | 研究区**零 `common.asOf.*`**，5 种时间口径混用 | 迁移 | 统一到「口径条」；`PanelHeader` 的手动 +9h 与 `toLocaleString("zh-CN")` 全部替换 |
| R4 | `v3:calibration` 空数据崩溃 | 实现 | 补 `confidenceStats` 存在性判断 |
| R5 | 系统区状态条改真实探测 → 可能立刻由绿变黄/红 | **认知** | 这是修复不是回退；上线前先看一次真实结果并向你说明 |
| R6 | 补齐 13 步时间源需改 827 行 `mission-control` API | 实现 | 只改时间来源判定，不动状态判定；逐步灰度 |
| R7 | sync 二次确认改变运维操作习惯 | 迁移 | 确认弹窗写明后果（「将重算全市场 3700+ 条评分」） |
| R8 | `/admin/mission-audit` 迁入系统区后，其 `?token=` 查询鉴权已被 S1 移除 | **权限** | 该页需改用 header/会话（S1 已提供），实现时一并修 |
| R9 | Mission Tab 首次接入 `/api/admin/health/mission`，该端点从无 UI 消费，返回结构未经前端验证 | 实现 | 实现前先 curl 验证结构，空态诚实 |
| R10 | 研究区 promotion/platform 每请求全表扫 `FactorAlphaResult` + `GlobalMarket` | 性能 | 加 60s 内存缓存（与 T4 的 quotes 缓存同模式） |
| R11 | `dv-sectors` 与 `rs-sectors` 重复入口仍在 | 治理 | 按 T1 裁决留到 **T8**，本轮不动（研究区未开放前移除会造成老板能力真空） |

---

## 10. Final Recommendation

### 需要你裁定的 4 件事

1. **研究区五阶段命名是否批准？** 关键是用「数据探索 / 因子研究 / AI 分析 / 实验验证 / 研究结论」替换 `factors / alpha / v3 / experiments / backtest`。
2. **`alpha` + `v3` 合并为「AI 分析」（6 子标签）是否可接受？** 6 个子标签偏多，但它们同属「模型输出对照」，按实现代际拆成两个顶级 Tab 更不合理。
3. **系统区新增 Mission 与 配置 两个 Tab 是否批准？** 前者承接目前无 UI 的 Mission 健康与错落在 boss 的审计页；后者收纳 universe + sync（sync 加二次确认）。
4. **状态条改真实探测**：修复后可能立刻显示黄/红（现在是硬编码全绿）。确认接受？

### 实现拆分建议

| 阶段 | 内容 | 独立部署 |
|---|---|---|
| **T5-M1** | 配置修正：D1 双前缀、D2 无归属页、删 2 个孤儿 API | ✅ 低风险，可先做 |
| **T5-M2** | 研究区 IA 重构：Tab 合并 + 旧深链映射 + ⑤ 转正 | ✅ |
| **T5-M3** | 研究区 Design First：13 页 i18n + `common.asOf.*` + 四段式骨架 + 修 calibration 崩溃 | ✅ 建议按阶段分批 |
| **T5-M4** | 系统区：新增 Mission / 配置 Tab + 真实探测 + 13 步时间源 | ✅ |
| **T5-M5** | 验收：双语 · 口径 · 死链 · Build/TS/Health · Smoke | — |

**建议 M1 先单独跑一轮**（纯配置修正，零 UI 风险），M2–M4 各一轮。

---

**设计到此结束，等待批准。批准后进入 P21-T5 Implementation。**
