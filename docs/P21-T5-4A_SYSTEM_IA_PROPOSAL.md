# P21-T5-4A · System Workspace IA Proposal

> 本轮**仅架构设计**。未修改任何代码 / UI / API / 数据库 / i18n。未 commit / push / deploy。
> 日期：2026-07-21 ｜ 前置：T5-4 Design Review ✅ APPROVED
> 基线：当前生产代码实测。

---

## 1. 新 IA

### 1.1 设计依据：运行 → 监控 → 维护 → 部署

当前 6 个 Tab 按**技术模块**排列（overview / runtime / health / verify / sync / deploy），运维要回答「今天数据对不对」得在 health、verify、overview 三处来回跳。新 IA 按**运维实际提问顺序**重排：

```
① 运行        今天跑了吗？跑到哪一步？哪里失败了？
      ↓
② 监控        产出的数据可不可信？有没有 CRITICAL？
      ↓
③ 维护        股票池、Mission 审计、配置对不对？
      ↓
④ 操作        需要我动手补数据 / 重跑 / 发布吗？   ← 唯一含写操作的区域
```

### 1.2 新 IA 结构

| 阶段 | 导航节点 | 承载内容 | 受众 | 写操作 |
|---|---|---|---|---|
| **① 运行** | 运行状态 | 今日管线 13 步 · Runtime 可靠性 · GPT 用量 · 日志时间线 | 老板 / 运维 | ❌ |
| **② 监控** | 数据健康 | 数据健康守卫摘要 · 生产就绪校验（剥离推荐明细后） | **老板** | ❌ |
| **③ 维护** | 系统维护 | AI 股票池 · Mission 审计 · 版本与部署记录 | 运维 | ❌ |
| **④ 操作** | **运维操作**（独立区） | 数据同步触发 · 未来的重建/清理/重置 | **运维专属** | ✅ **全部写操作集中于此** |

**Tab 6 → 4；导航节点 1 → 4；写操作从「散落在 sync Tab」变为「独立隔离区」。**

### 1.3 为什么比现在合理

| 维度 | 现状 | 新 IA |
|---|---|---|
| 排列依据 | 技术模块 | 运维提问顺序 |
| 「数据可不可信」 | 分散在 health / verify / overview **三处** | 收敛到 **② 监控** 一处 |
| 写操作位置 | 混在 `sync` Tab，与只读监控并排 | **④ 操作** 独立区，物理隔离 |
| 受众分级 | 不可能（只有 1 个导航节点） | 每个节点独立标注受众，可分批开放 |
| 无入口页面 | `/admin/universe`、`/admin/mission-audit` 无入口 | 归入 **③ 维护**，有入口 |

---

## 2. 页面职责矩阵

| 页面 | 目标用户 | 输入 | 输出 | 只读 | 写操作 | Workspace |
|---|---|---|---|---|---|---|
| **运行状态·今日管线** | 老板 / 运维 | `StockScore.computedAt` · `AiMission.*Date` · `pipeline-runs.jsonl` | 13 步执行状态 + 时间 + 来源标记 | ✅ | ❌ | System |
| **运行状态·Runtime** | 运维 | `logs/pipeline-phases-*.jsonl` · `logs/gpt-runtime-*.jsonl` | 30 天可靠性趋势 · GPT 调用/重试/429/token | ✅ | ❌ | System |
| **数据健康·守卫摘要** | **老板** | `reports/data-health-guard-*.json` | CRITICAL / WARNING / PASS / 覆盖率 | ✅ | ❌ | System |
| **数据健康·就绪校验** | 运维 | DB 多表 + `.git/HEAD` + `.next/BUILD_ID` | 8 模块 PASS/WARN/FAIL | ✅ | ❌ | System |
| **系统维护·AI 股票池** | 运维 | `Stock.aiEnabled` / `excludeReason` | 排除股清单与原因 | ✅ | ⚠️ 见 §7 | System |
| **系统维护·Mission 审计** | 运维 | `ai_mission_*` | Mission 决策回放 | ✅ | ❌ | System |
| **系统维护·版本与部署** | 老板 / 运维 | `DeploymentLog` · `VersionSnapshot` | 近 20 次部署 + 版本快照 | ✅ | ❌ | System |
| **运维操作·数据同步** | **运维专属** | `SyncLog` + 各表最新日期 | 数据源新鲜度 + **触发按钮** | ❌ | ✅ | System |

### 2.1 职责漂移的重新归类

| 单元 | 现状归属 | 问题 | 新归属 |
|---|---|---|---|
| `verify` 的**每日推荐明细 / GPT 评分 / 买入价 / 7·30·90 日收益** | System `verify` Tab | **业务数据混进系统校验**，且与 Boss「AI 战绩档案」重复 | **移出 System** → 能力已由 AI 战绩档案承载，**直接删除该模块** |
| `verify` 的 8 模块就绪校验 | System `verify` | 归属正确 | **② 监控** |
| `sync` 的数据源新鲜度展示 | System `sync` | 与写操作混放 | **④ 操作**（展示与触发同页，但整页隔离） |
| `/admin/universe` | 无入口内部页 | 用户找不到 | **③ 维护** |
| `/admin/mission-audit` | 无入口内部页 | 用户找不到 | **③ 维护** |
| `SystemDashboard.tsx` | 已停用组件 | 仍消费 mission-control API | **删除** |

---

## 3. Sidebar 设计

```
┌─ 系统 System ──────────────┐
│ ① 运行状态                  │  /admin/mission-control?tab=runtime
│ ② 数据健康                  │  ?tab=health
│ ③ 系统维护                  │  ?tab=maintenance
│ ─────────────────────────  │  ← 分隔线：以下为写操作区
│ ⚠ 运维操作                  │  ?tab=ops
└────────────────────────────┘
```

**设计要点**：

1. **分隔线 + ⚠ 标记**把写操作区在视觉上与只读区切开 —— 不是靠文字提醒，是靠布局。
2. 每个节点携带受众标记（实现时用 `audience: "boss" | "ops"` 字段），支持**分批开放**：先开 ①②③ 给老板，④ 仅运维。
3. 节点数 1 → 4，但**不超过 Research 的 5 个**，侧栏视觉负担可控。

---

## 4. Hub / Tab 设计

### 4.1 层级

```
第 1 层  工作区切换器          [决策] [研究] [系统]
第 2 层  Sidebar 四阶段        ① 运行状态 … ④ 运维操作
第 3 层  Hub 内子标签（URL）    ?tab=X&sub=Y
第 4 层  页面内容              口径条 → 结论卡 → 明细 → 边界声明
```

沿用 Research 区已验证的 `?tab=X&sub=Y` URL 化方案（T3 建立、T5-3A 复用），保证深链可分享、刷新不丢、跨面板跳转不 no-op。

### 4.2 子标签分配

| Tab | 子标签 | 承接自 |
|---|---|---|
| `runtime` ① 运行状态 | 今日管线 · Runtime 指标 | overview + runtime |
| `health` ② 数据健康 | 守卫摘要 · 就绪校验 | health + verify（剥离后） |
| `maintenance` ③ 系统维护 | 股票池 · Mission 审计 · 版本与部署 | universe + mission-audit + deploy |
| `ops` ④ 运维操作 | 数据同步 | sync |

### 4.3 Legacy Tab 映射（不留 404）

| 旧 | 新 |
|---|---|
| `?tab=overview` | `?tab=runtime&sub=pipeline` |
| `?tab=runtime` | `?tab=runtime&sub=metrics` |
| `?tab=health` | `?tab=health&sub=guard` |
| `?tab=verify` | `?tab=health&sub=readiness` |
| `?tab=sync` | `?tab=ops&sub=sync` |
| `?tab=deploy` | `?tab=maintenance&sub=deploy` |

外部重定向桩 `/sync` · `/admin/verify` · `/admin/runtime` 同步更新目标。

---

## 5. Breadcrumb 方案

### 5.1 现状

**全站没有 Breadcrumb 组件**（grep 仅命中 `/ai-theme/[theme]` 一处局部实现）。跨工作区跳转后（如 `overview` 诊断卡 → `/admin/research?tab=analysis`），侧栏静默切换且无返回路径。

### 5.2 设计

```
系统 › 运行状态 › 今日管线
决策 › 今日简报                      ← 跨区跳转后显示来源
```

**三条规则**：

1. **常驻于 Hub 顶部**，格式 `工作区 › 阶段 › 子标签`
2. **跨工作区跳转时**，Breadcrumb 首段显示**目标工作区**并在其后附「← 返回 {来源工作区}」链接 —— 让切换**可感知、可返回**
3. 复用已有的 `lib/navigation/back.ts` 机制（`getBackHref` / `getBackLabel`），不新造轮子

### 5.3 跨区跳转的处理原则

System 的诊断卡目前会跳到 Research（`?tab=analysis&sub=score`）与 `/strategy`。新设计下：

- **保留跳转**（诊断需要下钻是合理的）
- 但目标 URL 携带 `?from=system`，Breadcrumb 据此渲染返回链接
- 与 T3 建立的 `?ws=` 提示机制一致，不引入第二套

---

## 6. Workspace 边界

| 工作区 | 职责 | 绝不包含 |
|---|---|---|
| **Boss** | 经营决策：今天买什么、持仓怎样、业绩如何 | 系统状态 · 因子研究 · 写操作 |
| **Research** | 研究分析：因子有没有效、模型怎么想、改动有没有变好 | 经营决策 · 系统运维 |
| **System** | 系统运行、监控、维护 | **业务数据明细**（推荐/评分/收益）· 研究分析 |

### 6.1 本设计消除的三处交叉

| # | 交叉 | 处置 |
|---|---|---|
| **X1** | System `verify` 含推荐明细 / GPT 评分 / 收益 | **删除该模块** —— 属 Boss 域，AI 战绩档案已承载 |
| **X2** | System `overview` 管线视图与 Boss「今日简报」时间轴重复且**判据不同** | **分工明确**：老板看简报（纯 DB 判据）；运维看运行状态（含 DB/LOG 来源标记）。System 侧须**补齐 13 步时间源**，并在每步标注来源，让不一致可见 |
| **X3** | `/api/health/status` 被 4 处各自渲染 | System 侧收敛到 **② 数据健康** 一处；Boss 侧「今日简报」保留（它只取健康摘要一个数字，非重复呈现） |

---

## 7. 写操作隔离方案

### 7.1 全站写操作清单（实测 25 个端点）

| 类别 | 端点 | 归属 |
|---|---|---|
| **数据同步（spawn / 批量写）** | `/api/sync` · `/sync/scores` · `/sync/global-market` · `/sync/jquants` · `/sync/news` · `/sync/tdnet` · `/sync/yahoo` | **④ 运维操作** |
| **股票池配置** | `/api/admin/stocks/[symbol]/ai-universe` | ③ 维护（单股开关，低风险） |
| **部署记录写入** | `/api/admin/deployments` POST | 由 CI/脚本调用，**不在 UI 暴露** |
| 业务写（非 System 域） | holdings · portfolio · sim-portfolio · watchlist · research/review · stocks/analysis | Boss / Research，不在本设计范围 |

### 7.2 隔离设计

**④ 运维操作** 是唯一含写操作的区域，设计上预留三层防护：

| 层 | 内容 | 本轮 | 后续 |
|---|---|---|---|
| **L1 视觉隔离** | 独立 Tab + 侧栏分隔线 + ⚠ 标记 | ✅ 设计已含 | — |
| **L2 二次确认** | 弹窗写明后果（「将重算全市场 3700+ 条评分」），需输入确认 | 预留挂点 | T5-4D |
| **L3 权限控制** | `audience: "ops"` 字段，未来接入角色即可生效 | 预留字段 | 待权限系统 |
| **L4 审计日志** | 记录 who / what / when，写入既有 `SyncLog` | 预留字段 | 待定 |

**硬规则**：`③ 维护` 与 `①② 只读区` **绝不出现任何触发按钮**。`ai-universe` 的单股开关虽是写操作，但影响面是「一只股票是否参与评分」，与「重算全市场」不同量级，故留在 ③ 但需二次确认。

---

## 8. API 边界规范

### 8.1 规范（建议确立为全站约束）

> **API 只返回机器可读的事实，不返回给人看的句子。**

**允许返回**：`code`（枚举码）· `enum` · `boolean` · `number` · `timestamp`（ISO）· `identifier`
**禁止返回**：中文 / 日文 / 英文展示文案 · 完整提示语 · 完整诊断建议 · 已格式化的时间字符串

**唯一例外**：**真实世界数据本身**（如 TDnet 公告标题、公司名、新闻标题）—— 那是数据，不是文案。

### 8.2 治理清单（实测，按严重度排序）

| # | API | 违规条数 | 文案类型 | 等级 |
|---|---|---|---|---|
| **G1** | `/api/admin/mission-control` | **43** | 步骤名 · 结果摘要 · 错误信息 · **整段诊断建议** | **P0** |
| **G2** | `/api/sync/status` | **25** | cron 时刻表说明（「16:30 JST 每周五 + 07:15 每周一（备份）」） | **P1** |
| G3 | `lib/features/promotion/shadow-diagnostics.ts` | 6 | `PENDING_REASON_LABEL` 原因码标签 | P1（T5-3B R-1） |
| G4 | `/api/sync/jquants` · `/sync/global-market` · `/sync/jobs/[jobId]` · `/sync/scores` · `/sync/news` · `/sync` | 13 | 同步结果/错误提示 | P2 |
| G5 | `/api/indicators` | 4 | `rsiSignal` 返回「超买/超卖/正常」（**当前无前端消费**） | P2 |
| G6 | `/api/sectors` · `/scoring-v3/*` · `/research/*` · `/mission-lab/quotes` · `/holdings/*` | 各 1–3 | 零散提示语 | P2 |

**System 区四个 API 清白**：`/api/admin/runtime` · `/api/health/status` · `/api/admin/verify` · `/api/admin/deployments` 中文字符串 **= 0** ✅

### 8.3 G1 的三类文案与对应改法

| 类型 | 例子 | 改法 |
|---|---|---|
| 步骤名 | 「计算综合评分」 | API 返 `stepKey: "compute_scores"`，前端 `t("sys.step.compute_scores")` |
| 结果摘要 | 「3018 只股票已评分」 | API 返 `{ metric: "scored", value: 3018 }`，前端组装 |
| **诊断建议** | 「价格覆盖率不足会导致下游评分/策略推荐使用不完整数据」 | API 返 `diagnosisCode: "PRICE_COVERAGE_LOW"`，文案入 i18n 双语 |

---

## 9. 术语治理方案

### 9.1 应替换

| 当前 | 推荐名称（zh） | 推荐名称（ja） | 理由 |
|---|---|---|---|
| **Runtime**（Tab 名） | **运行状态** | 稼働状態 | 裸英文；且它实际内容是「可靠性趋势 + 调用量」 |
| **Health**（Tab 名） | **数据健康** | データ健全性 | 裸英文；「Health」太泛，实指数据健康守卫 |
| **Production Integrity** | **链路完整性** | パイプライン完全性 | 与「生产环境」易混，实指数据链路 |
| **Cron Health** | **定时任务状态** | 定期実行の状態 | — |
| **Pending Trend** | **待办趋势** | 保留トレンド | — |
| **Reliability** | **可靠性** | 信頼性 | — |
| 系统概览 / 系统总览 | 统一为**系统**（工作区名）+ 四阶段名 | システム | 现有两个近义标签撞车 |

### 9.2 保留（行业标准）

`GPT` · `API` · `Cron` · `PM2` · `PASS` / `WARNING` / `CRITICAL` · `commit` · `build` · `JST`

---

## 10. 与现状对比

| 维度 | 现状 | 新 IA |
|---|---|---|
| 导航节点 | **1** | **4**（可分批开放） |
| Tab 数 | 6 | 4 |
| 写操作位置 | 混在 `sync` Tab，与只读并排 | **独立 ④ 运维操作区**，视觉隔离 |
| 受众分级 | 不可能 | 每节点标注 `boss` / `ops` |
| 无入口页面 | 2（universe / mission-audit） | **0** |
| 「数据可不可信」 | 分散 3 处 | 收敛 1 处 |
| Breadcrumb | **无** | 三段式 + 跨区返回 |
| 业务数据混入 | `verify` 含推荐明细与收益 | **已剥离** |
| 中文界面裸英文 | Runtime · Health 等 6 处 | **0** |
| API 展示文案 | 68 条（mission-control 43 + sync/status 25） | 治理清单已列，T5-4B 处理 |

---

## 11. 风险评估

| # | 风险 | 类型 | 等级 | 缓解 |
|---|---|---|---|---|
| **R1** | `/api/admin/mission-control` 是 **827 行**的聚合 API，改返回结构影响面大 | 实现 | **高** | 新增 `stepKey` / `diagnosisCode` 字段与旧字段**并存**，前端切换完成后再删旧字段；分两次部署 |
| **R2** | 删除 `verify` 的推荐明细模块，若有人依赖该视图 | 迁移 | 中 | 该能力 AI 战绩档案已完整覆盖；下线前在页面留一轮跳转提示 |
| **R3** | Tab key 全部改名，旧深链失效 | 兼容 | 中 | `LEGACY_TAB` 映射（T3/T5-3A 已验证两次），外部重定向桩同步更新 |
| **R4** | 补齐 13 步时间源需触碰 827 行 API 的判定逻辑 | 实现 | 中 | 只改**时间来源**，不动**状态判定**；逐步灰度 |
| **R5** | 真实健康探测上线后可能立刻由全绿变黄/红 | **认知** | 中 | 这是修复不是回退；上线前先跑一次真实结果并向你说明 |
| **R6** | 四阶段命名与 Research 五阶段风格一致，但阶段数不同（4 vs 5） | 认知 | 低 | 两区职责本就不同，强行对齐反而牵强 |
| **R7** | Breadcrumb 为全站新增组件，可能影响其它工作区布局 | 实现 | 低 | 先只在 System Hub 内启用，验证后再考虑推广 |
| **R8** | System 区 3 个组件零 i18n、186 行 CJK | 实现 | 低 | 与 T5-3B 同套路，已有成熟流程 |
| **R9** | 系统工作区尚未开放，改动当前不可见 | — | **优势** | 可在开放前一次到位，老板不经历中间态 |

---

## 12. 是否建议进入实现阶段

### ✅ 建议进入，但**必须先做 API 层**

理由与 T5-4 Review 一致并已被批准：`mission-control` 的 43 条文案是**组件层无论如何治理不了的**。若先做 UI i18n，做完后日文界面仍大面积中文，等于白做一轮 500+ 行组件改造。

### 建议拆分

| 阶段 | 内容 | 风险 | 独立部署 |
|---|---|---|---|
| **T5-4B** | API 文案治理：G1（43 条）+ G2（25 条）+ G3（6 条） | **高**（触碰 827 行 API） | ✅ 新旧字段并存，两次部署 |
| **T5-4C** | IA 重构：6 Tab → 4 阶段 · 导航 1 → 4 节点 · Legacy 映射 · Breadcrumb | 中 | ✅ |
| **T5-4D** | 组件 Design First：3 个零 i18n 组件 + 186 行 CJK + 术语替换 | 低 | ✅ 可分批 |
| **T5-4E** | 真实健康探测 + 补齐 13 步时间源 + verify 剥离推荐明细 | 中 | ✅ |
| **T5-4F** | 全量验收 | — | — |

### 需要你裁定的 5 件事

1. **四阶段 IA（运行 / 监控 / 维护 / 操作）是否批准？**
2. **写操作独立为 ④ 运维操作区**，与只读区物理隔离，是否批准？
3. **API 边界规范**（只返 code/enum/number/timestamp，不返文案）是否确立为**全站约束**？若确立，G4–G6 的 P2 项也应逐步治理。
4. **`verify` 剥离推荐明细模块**是否批准？（该能力 AI 战绩档案已有）
5. **Breadcrumb 先只在 System Hub 内启用**，还是一次推广到三区？

---

**架构设计到此结束，未修改任何代码。等待设计评审。**
