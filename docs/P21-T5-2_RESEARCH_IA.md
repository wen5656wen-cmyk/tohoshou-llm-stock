# P21-T5-2 · Research Workspace IA Proposal

> 本轮只做信息架构设计。未修改任何代码 / UI / API / 数据库。未 commit / push / deploy。
> 日期：2026-07-21 ｜ 前置：T5 Design ✅ · T5-1 ✅
> **基线来源**：当前生产代码实测（T2/T3/T4/T5-1 之后），**未引用 T0/T1 历史快照**。

---

## 1. Current IA Baseline

### 1.1 导航节点（`nav-config.ts`，research 工作区共 4 个）

| key | 标签 | 目标 |
|---|---|---|
| `rs-home` | 股票研究 | `/admin/research` |
| `rs-sectors` | 行业 | `/screener?tab=sectors&ws=research` |
| `rs-themes` | 主题研究 | `/screener?tab=themes&ws=research` |
| `rs-news` | 新闻 | `/screener?tab=news&ws=research` |

### 1.2 研究 Hub `/admin/research`（5 顶级 × 13 子标签）

| 顶级 | 当前标签 | 子标签 | 组件 | API | 数据源 | 真实使用 |
|---|---|---|---|---|---|---|
| `factors` | 因子 | `lib` 因子库 | AlphaFactorsPanel | `/api/alpha?limit=5000` | `alpha_factors` | ✅ 每日 cron |
| | | `registry` 因子注册 | FeaturesView | **无 fetch** | **TS 源码常量** | ⚠️ 静态，统计恒空 |
| | | `promotion` 因子晋升 | FeaturePromotionView | `/api/admin/feature-promotion` | `factor_alpha_results` | ✅ 每日 09:20 |
| | | `platform` 因子平台 | FeaturePlatformView | `/api/admin/feature-platform` | 同上 + `GlobalMarket` + 快照 | ✅ |
| `alpha` | **Alpha** | `score` 影子评分 | AlphaScorePanel | `/api/alpha/score?limit=3000` | `alpha_scores` ⋈ `stock_scores` | ✅ 每日 |
| | | `analytics` 因子分析 | AlphaAnalyticsPanel | `/api/alpha/report?period=` | `alpha_factor_reports` | ✅ 每日 |
| | | `fusion` **Fusion** | FusionReportPanel | `/api/fusion/report` | `RegimeFusionResult` | ✅ |
| | | `regime` 市场状态 | MarketRegimePanel | `/api/regime?limit=200` | `MarketRegime` | ✅ 每日 09:45 |
| `v3` | **Scoring V3** | `shadow` **Shadow** | ScoreV3Panel | `/api/scoring-v3/shadow?limit=3000` | `AdaptiveScoreV3Shadow` | ✅ 每日 10:15 |
| | | `calibration` **Calibration** | CalibrationPanel | `/api/scoring-v3/calibration` | `AdaptiveScoreV3Calibration` | ✅ 每日 10:15 |
| `experiments` | 实验 | `versions` 版本 | VersionsView | `/api/admin/versions` + `version-timeline` + `versions/compare` | `VersionSnapshot` + raw SQL | ✅ |
| `backtest` | 研究回测 | `alpha` **Alpha 回测** | AlphaBacktestPanel | `/api/alpha/backtest?period=` | `AlphaBacktestResult` | ✅ |

### 1.3 股票研究 `/screener`（3 Tab）

| Tab | 标签 | 组件 | 数据源 | 真实使用 |
|---|---|---|---|---|
| `sectors` | 行业 | SectorsView | `StockScore` 按 sector 聚合 | ✅（**boss 也在用**） |
| `themes` | 主题研究 | AiThemeView | `AITheme`（全站唯一消费者） | ✅ |
| `news` | 新闻 | NewsView | `News`（全站唯一 UI） | ✅ |

### 1.4 游离页

| 页面 | 归属 | 状态 |
|---|---|---|
| `/admin/learning-report` | research（T5-1 已确认唯一归属） | **无导航入口**，只能手输 URL |

### 1.5 基线发现的 4 个问题

| # | 问题 | 证据 |
|---|---|---|
| **B1** | **导航标签与内容不符** —— `rs-home` 标签是「股票研究」，指向的却是 `/admin/research`（因子/模型研究 Hub）。真正的股票研究 `/screener` 反而被拆成 3 个平级节点 | `nav-config.ts:60` |
| **B2** | **6 个标签在中文界面是裸英文** —— Alpha · Scoring V3 · Fusion · Shadow · Calibration · Alpha 回测 | `zh-CN.ts` 实测 |
| **B3** | **`/admin/learning-report` 无导航入口** —— 已批准设计中它是「⑤ 研究结论」，但目前只能手输 URL | 导航节点 4 个中无它 |
| **B4** | **`factors:registry` 是静态空壳** —— 无 fetch、数据来自 TS 源码常量、统计恒空 | `FeaturesView.tsx` |

### 1.6 重复入口检查

| 检查 | 结果 |
|---|---|
| Hub 内部同一面板两处可达 | **无**（T3 已把子标签 URL 化，NAV_MAP 一对一） |
| `/screener?tab=sectors` | ⚠️ **boss 与 research 各有一个入口**（`dv-sectors` / `rs-sectors`）—— 按 T1 裁决留到 T8 |
| 其余 | 无 |

---

## 2. Research Flow

### 2.1 五阶段与现有页面的映射

```
① 数据探索  →  ② 因子研究  →  ③ AI 分析  →  ④ 实验验证  →  ⑤ 研究结论
  市场在发生什么   哪些因子有效    模型现在怎么想   改动有没有变好   结论能不能下
```

| 阶段 | 归入的页面 | 页面数 |
|---|---|---|
| ① 数据探索 | 行业 · 主题 · 新闻 | 3 |
| ② 因子研究 | 因子库 · 因子登记 · 晋升建议 · 因子平台 | 4 |
| ③ AI 分析 | 影子对照 · 因子效力 · 融合权重 · 市场状态 · V3 影子 · V3 标定 | 6 |
| ④ 实验验证 | 策略回测 · 版本对比 | 2 |
| ⑤ 研究结论 | 学习报告 | 1 |

**合计 16 个页面，每个页面只属于一个阶段，无跨阶段重复。**

### 2.2 阶段归属的判据

| 页面 | 为什么归这个阶段 |
|---|---|
| 市场状态（regime） | ③ 而非 ① —— 它是**模型输出**的市场判定（MarketRegime 由 research-fusion 计算），不是原始数据浏览 |
| 因子平台（platform） | ② 而非系统区 —— 它检查的是**因子管线** Integrity（STALE_ALPHA / TOPIX 断裂），与系统区 `data-health-guard` 数据源完全不同 |
| V3 影子/标定 | ③ 而非 ④ —— 它们展示的是**模型当前状态**，不是「改动前后对比」 |
| 策略回测（backtest:alpha） | ④ —— 它是 PRODUCTION vs ALPHA 的**效果对比** |
| 学习报告 | ⑤ —— 它回答「数据够不够、能不能下结论」，是研究的出口 |

---

## 3. Terminology Audit

**原则**：老板首次进入即可理解；技术术语保留在文档与页面正文，不作为主导航标签。

| 当前名称 | 建议名称（zh） | 建议名称（ja） | 修改原因 |
|---|---|---|---|
| **Alpha**（顶级） | 取消该顶级（并入「AI 分析」） | — | 裸英文；且「Alpha」在金融语境指超额收益，此处却是因子模型分组，双重误导 |
| **Scoring V3**（顶级） | 取消该顶级（并入「AI 分析」） | — | 版本号不是功能名；老板不需要知道第几代 |
| 因子（顶级） | **因子研究** | ファクター研究 | 「因子」是名词，加「研究」明确这是做什么 |
| 实验（顶级） | **实验验证** | 検証 | 「实验」易被读成「正在做实验」，实际内容是版本对比验证 |
| 研究回测（顶级） | 并入「实验验证」 | — | T2 后只剩 1 个子标签，不成比例 |
| **Shadow**（子） | **影子模型** | シャドウモデル | 裸英文 |
| **Calibration**（子） | **上线就绪度** | 実装レディネス | 裸英文；且「标定」是内部术语，它实际回答「能不能上线」 |
| **Fusion**（子） | **模型融合** | モデル融合 | 裸英文 |
| **Alpha 回测**（子） | **策略回测** | 戦略バックテスト | 去掉内部代号 |
| 影子评分（子） | **影子对照** | シャドウ比較 | 它的内容是「影子 vs 正式的分歧」，「对照」比「评分」准确 |
| 因子分析（子） | **因子效力** | ファクター有効性 | 与「因子研究」阶段名重复；「效力」点明它测的是 IC/胜率 |
| 因子注册（子） | **因子登记（只读）** | ファクター登録（読取専用） | 明确它是静态清单，改动需改代码（B4） |
| 版本（子） | **版本对比** | 版数比較 | 「版本」不说明能做什么 |
| 股票研究（`rs-home` 标签） | **改指 `/screener`**，Hub 另起名 | 銘柄リサーチ | B1：标签与内容不符 |

**保留不改的技术词**：`RSI` `MACD` `IC` `RankIC` `TOPIX` `GPT` `AI` `Sharpe` —— 行业标准缩写，翻译反而更难懂。

---

## 4. Navigation Tree

```
研究 Research（5 个顶级节点 = 五阶段）
│
├─ ① 数据探索        /screener?ws=research
│     ├ 行业轮动      ?tab=sectors
│     ├ 主题研究      ?tab=themes
│     └ 新闻情绪      ?tab=news
│
├─ ② 因子研究        /admin/research?tab=factors
│     ├ 因子库        &sub=lib
│     ├ 因子登记      &sub=registry      （只读，静态）
│     ├ 晋升建议      &sub=promotion
│     └ 因子平台      &sub=platform
│
├─ ③ AI 分析         /admin/research?tab=analysis
│     ├ 影子对照      &sub=score
│     ├ 因子效力      &sub=analytics
│     ├ 模型融合      &sub=fusion
│     ├ 市场状态      &sub=regime
│     ├ 影子模型      &sub=shadow        （原 v3:shadow）
│     └ 上线就绪度    &sub=calibration   （原 v3:calibration）
│
├─ ④ 实验验证        /admin/research?tab=experiments
│     ├ 策略回测      &sub=backtest      （原 backtest:alpha）
│     └ 版本对比      &sub=versions
│
└─ ⑤ 研究结论        /admin/research?tab=conclusions
      └ 学习报告      （原游离页 /admin/learning-report 转正）
```

### 4.1 结构变化对照

| | 现状 | 新设计 |
|---|---|---|
| 侧栏节点 | 4（1 个错标 + 3 个平级 screener tab） | **5**（五阶段，各一个） |
| Hub 顶级 Tab | 5 | **4** |
| 子标签 | 13 | **13**（数量不变，只重组与更名） |
| 中文界面裸英文标签 | 6 | **0** |
| 无导航入口的页面 | 1（learning-report） | **0** |
| 标签与内容不符 | 1（rs-home） | **0** |

**不新增任何功能，仅重组入口与更名。**

---

## 5. Responsibility Matrix

| 页面 | 职责 | 阶段 | 处置 |
|---|---|---|---|
| SectorsView | JPX 33 行业聚合轮动 | ① | **保留** |
| AiThemeView | 14 主题 × 供应链 5 层 | ① | **保留** |
| NewsView | News 表浏览与情绪过滤 | ① | **保留** |
| AlphaFactorsPanel | AlphaFactor 矩阵浏览 + CSV | ② | **保留** |
| FeaturesView | 静态因子清单镜像 | ② | **重命名**「因子登记（只读）」+ 标注静态 |
| FeaturePromotionView | 因子晋升建议 | ② | **保留** |
| FeaturePlatformView | 因子管线 Integrity | ② | **保留** |
| AlphaScorePanel | 影子 vs 正式逐股分歧 | ③ | **重命名**「影子对照」 |
| AlphaAnalyticsPanel | 因子 IC/夏普/胜率 | ③ | **重命名**「因子效力」 |
| FusionReportPanel | 融合权重研究 | ③ | **重命名**「模型融合」 |
| MarketRegimePanel | MarketRegime 历史序列 | ③ | **保留** |
| ScoreV3Panel | V3 影子评分全表 | ③ | **重命名**「影子模型」+ **合并**入 AI 分析 |
| CalibrationPanel | V3 就绪度与阈值 | ③ | **重命名**「上线就绪度」+ **合并**入 AI 分析 |
| AlphaBacktestPanel | 影子策略回测矩阵 | ④ | **重命名**「策略回测」+ **合并**入实验验证 |
| VersionsView | 版本对比与关联完整性 | ④ | **重命名**「版本对比」 |
| LearningReportView | 数据完整性 / 回填 / 回归 | ⑤ | **移动**（游离页 → Hub ⑤，转正） |

**16 个页面，全部有唯一归宿。删除 0（T2 已删完该删的）。**

---

## 6. Hi-Fi Information Architecture（文字版）

### 6.1 层次

```
第 1 层：工作区切换器          [决策] [研究] [系统]
第 2 层：阶段侧栏（5 项）       ① 数据探索 … ⑤ 研究结论
第 3 层：子标签（URL 可寻址）    ?tab=X&sub=Y
第 4 层：页面内容               口径条 → 结论卡 → 明细 → 边界声明（T5 已批准骨架）
```

**最大深度 3 层可达任意页面**（工作区 → 阶段 → 子标签），当前也是 3 层，但第 2 层从「4 个语义混乱的节点」变为「5 个流程阶段」。

### 6.2 进入路径

| 场景 | 路径 |
|---|---|
| 首次进入研究区 | 工作区切换器 → 研究 → **默认落到 ① 数据探索** |
| 从决策区跳研究 | 老板在「行业分析」看到某行业 → 研究区 ① 数据探索·行业轮动（同页，工作区不同） |
| 直接深链 | `/admin/research?tab=analysis&sub=fusion` → 精确落到「模型融合」（T3 已实现 URL 化） |
| 手输旧 URL | `?tab=alpha&sub=fusion` → 映射到 `?tab=analysis&sub=fusion` |

### 6.3 默认落点

| 层级 | 默认 |
|---|---|
| 研究工作区 | **① 数据探索**（`/screener?ws=research`，Tab 默认 `sectors`） |
| `/admin/research` 无参数 | **② 因子研究**（`?tab=factors&sub=lib`） |
| 各阶段无 `sub` | 该阶段第一个子标签 |

**为什么工作区默认是 ① 而不是 Hub**：研究流程从「看市场」开始，而不是从「看因子」开始。老板进研究区第一眼应该是行业轮动，不是 5000 行因子矩阵。

### 6.4 返回路径

| 从 | 返回 |
|---|---|
| 任意子标签 | 阶段侧栏常驻，一次点击可切任意阶段 |
| 个股详情弹窗 | 关闭即回原页原状态（URL 未变） |
| `/stocks/[symbol]` 详情页 | 面包屑返回来源（`lib/navigation/back.ts` 已有机制） |
| 研究区 → 决策区 | 工作区切换器（顶部常驻） |

### 6.5 页面之间的关系

```
① 数据探索 ──发现候选──> 决策区·股票中心（跨工作区，单向）
② 因子研究 ──晋升建议──> ③ AI 分析（看模型是否已采纳）
③ AI 分析  ──分歧标的──> ④ 实验验证（回测验证该分歧）
④ 实验验证 ──结果汇总──> ⑤ 研究结论
⑤ 研究结论 ──数据不足──> ② 因子研究（回到源头补数据）
```

**唯一跨工作区链接**：① → 股票中心（研究发现 → 决策执行）。其余全部在研究区内闭环，符合 T5「三工作区边界明确、互不跳转」的要求。

---

## 7. Risks

| # | 风险 | 类型 | 缓解 |
|---|---|---|---|
| **R1** | Hub 顶级 tab key 改名（`alpha`/`v3`/`backtest` → `analysis`/`experiments`），旧深链失效 | **导航兼容** | Hub 内建 `LEGACY_TAB` 映射表（T3 已建立该模式并验证）：`alpha→analysis`、`v3→analysis&sub=shadow`、`backtest→experiments&sub=backtest` |
| **R2** | `next.config.ts` 与 `lib/routes.ts` 中 5 条重定向指向旧 tab key | **深链接** | 与 R1 同批更新；T3 已做过一次同类改造，路径清楚 |
| **R3** | `/admin/learning-report` 转正后，旧 URL 需保持可达 | 深链接 | 保留为重定向桩 → `?tab=conclusions` |
| **R4** | 更名涉及 14 个 i18n 键的 zh + ja **双语**同步 | **i18n** | 键名不变只改值，types.ts 无需动；zh/ja 逐条对照修改 |
| **R5** | 研究区 20/27 组件仍零 `useI18n`、624 行硬编码中文 | i18n | **不在本轮范围** —— T5-3 Research Design 处理。本轮只动导航层标签 |
| **R6** | 历史文档（docs/ 下 P7/P14/P19 等）引用旧 tab key | **历史文档** | 不改历史文档（它们是当时的事实记录）；在 T5-2 实现时于 `nav-config.ts` 注释中留映射表 |
| **R7** | 老板已习惯现有 4 个节点位置 | **学习成本** | 五阶段带序号①–⑤，顺序即流程，比现状（因子/Alpha/Scoring V3 混排）更易学；且节点数只从 4 增到 5 |
| **R8** | 研究区尚未开放（`ENABLED_WORKSPACES=["boss"]`），本轮改动**当前无人可见** | 权限 | 这是优势：可在开放前完成全部重组，T8 开放时一次到位，老板不经历中间态 |
| **R9** | `rs-sectors` 与 boss 的 `dv-sectors` 仍是重复入口 | 治理 | 按 T1 裁决留到 **T8**（研究区开放前移除会造成老板能力真空） |
| **R10** | 「因子登记」是静态空壳，改名后仍无实质内容 | 认知 | 标签加「（只读）」+ 页面内说明「清单来自代码，变更需发版」，不伪装成可管理 |

---

## 8. Final Recommendation

### 需要你裁定的 4 件事

1. **五阶段侧栏（5 个节点）是否批准？** 替换现有 4 个（其中 1 个标签与内容不符）。
2. **术语更名 14 项是否批准？** 核心是消灭中文界面里的 6 个裸英文（Alpha / Scoring V3 / Fusion / Shadow / Calibration / Alpha 回测）。
3. **`alpha` + `v3` 合并为「AI 分析」（6 子标签）** —— T5 设计已批准，此处再次确认：6 个子标签偏多，但它们同属「模型输出对照」，按实现代际拆更不合理。
4. **研究区默认落点设为 ① 数据探索**（而非 Hub 的因子页）是否批准？

### 我的建议

**全量批准。** 三点理由：

1. **现在改成本最低** —— 研究区尚未开放（`ENABLED_WORKSPACES=["boss"]`），改动对老板**当前完全不可见**，不存在中间态体验断裂。T8 开放时一次到位。
2. **术语是最大的可用性障碍** —— 一个中文界面里出现「Alpha / Scoring V3 / Fusion / Shadow / Calibration」，老板第一次进去无法判断该点哪个。这不是美化，是可用性。
3. **本轮零功能变更** —— 16 个页面全部保留，只重组入口与更名，风险面仅在导航层，且 T3 已验证过同类改造的路径。

### 不建议纳入本轮的

- 研究区 624 行硬编码中文 → **T5-3 Research Design**
- `dv-sectors` / `rs-sectors` 重复入口 → **T8**
- 页面内四段式骨架（口径条/结论卡/边界声明）→ **T5-3**

---

**IA 设计到此结束，等待批准。批准后进入 P21-T5-2 Implementation。**
