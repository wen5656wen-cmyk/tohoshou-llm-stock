# P21-T5-4 · System Workspace Design Review

> 本轮**仅设计审计**。未修改任何代码 / UI / API / 数据库 / i18n。未 commit / push / deploy。
> 日期：2026-07-21 ｜ 前置：T5-1 ✅ · T5-2 ✅ · T5-3（Research Workspace）✅
> 基线来源：当前生产代码实测（T5-3B Batch 4 之后）。

---

## 1. 当前 IA

### 1.1 导航结构

系统工作区在 `nav-config.ts` 中**只有 1 个节点**：

| key | 标签 | 目标 |
|---|---|---|
| `system` | 系统总览（`ws.systemOverview`） | `/admin/mission-control` |

即：**放开系统工作区 = 一次性放开该 Hub 下的全部 6 个 Tab**，没有任何 Tab 级导航或权限粒度。

### 1.2 SystemHub 六个 Tab

| Tab | 中文标签 | 组件 | 行数 | i18n | 硬编码 CJK | 主 API |
|---|---|---|---|---|---|---|
| `overview` | 系统概览 | MissionControlView | 329 | ❌ | **43** | `/api/admin/mission-control` |
| `runtime` | **Runtime** | RuntimeView | 168 | ❌ | **24** | `/api/admin/runtime` |
| `health` | **Health** | HealthView | 58 | ✅ | 2 | `/api/health/status` |
| `verify` | 数据校验 | VerifyView | 523 | ❌ | **58** | `/api/admin/verify` |
| `sync` | 同步 | SyncView | 732 | ⚠️ 部分 | **57** | `/api/sync/status` + **POST 写端点** |
| `deploy` | 部署 | DeployView | 48 | ✅ | 2 | `/api/admin/deployments` |

**合计硬编码 CJK 186 行；6 个组件中 3 个完全没接 i18n。**

### 1.3 无导航入口的系统页

| 页面 | 归属 | 状态 |
|---|---|---|
| `/admin/universe` | admin（T5-1 已确认） | 内部页，无导航入口 |
| `/admin/mission-audit` | admin（T5-1 修正） | 内部页，无导航入口 |

---

## 2. 页面职责矩阵

| Tab | 它解决什么问题 | 目标用户 | 应属工作区 | 判定 |
|---|---|---|---|---|
| **overview** | 今天系统跑到哪一步、哪条链路停了 | 老板 / 运维 | System | ✅ 归属正确 |
| **runtime** | Runtime 可靠性、GPT 调用量、日志时间线 | 运维 / 工程 | System | ✅ 归属正确 |
| **health** | 数据健康守卫的 CRITICAL / WARNING 摘要 | 老板 / 运维 | System | ✅ 归属正确 |
| **verify** | 生产就绪校验 + **每日推荐明细与 GPT 评分** | 工程 | System（内容存疑） | ⚠️ **职责漂移**，见 §3.2 |
| **sync** | 数据源新鲜度 + **手动触发同步（写操作）** | 运维专属 | System | ✅ 但风险最高 |
| **deploy** | 近 20 次部署记录 | 老板 / 运维 | System | ✅ 归属正确 |
| `/admin/universe` | 哪些股票被排除出 AI 股票池 | 运维 | System | ✅（T2 从 `/stocks` 迁入） |
| `/admin/mission-audit` | Mission 决策回放审计 | 运维 | System | ✅（T5-1 修正归属） |

---

## 3. Workspace 边界分析

### 3.1 三区当前边界

```
Boss（7 节点）    决策总览 · 股票中心 · 行业分析 · 深度研究 · 今日简报 · Mission Lab · AI战绩档案
Research（5 节点）① 数据探索 ② 因子研究 ③ AI 分析 ④ 实验验证 ⑤ 研究结论
System（1 节点）  系统总览 → 6 Tab
```

### 3.2 发现的边界问题

| # | 问题 | 证据 | 等级 |
|---|---|---|---|
| **B1** | **`verify` Tab 职责漂移** —— 它名为「数据校验」，但实际内容包含**每日推荐明细、GPT 评分、买入参考价、7/30/90 日收益**。这是**业务数据**，不是系统健康。与 Boss 的「AI 战绩档案」（业绩验证唯一权威入口）内容重叠 | `VerifyView.tsx` `module=dailyrec` | **P1** |
| **B2** | **`/api/health/status` 被三区共用** —— System 的 `health`/`verify`/`sync` 三个 Tab + Boss 的「今日简报」都在调它。数据源相同但各自渲染，口径未统一 | 4 个组件 | P2 |
| **B3** | **`/api/admin/mission-control` 被两处消费** —— System 的 `overview` 与已停用的 `SystemDashboard.tsx` | 2 个组件 | P2 |
| **B4** | **Boss 的「今日简报」时间轴与 System 的 `overview` 管线视图重复** —— 展示同一批 cron 步骤，但**判据不同**（简报纯 DB 落库判定；overview 13 步中仅 2 步用 DB，其余读 `pipeline-runs.jsonl`），两者可能给出矛盾状态 | `briefing/route.ts:5-13` vs `mission-control/route.ts:478-575` | **P1** |
| **B5** | `dv-sectors`（Boss）与 `rs-explore`（Research）共用 `/screener?tab=sectors` | `nav-config.ts` | P2（T1 已裁决留 T8） |

**结论：System 与 Boss 之间存在 2 处实质重复（B1、B4），与 Research 之间无重复。**

---

## 4. 重复功能清单

| 能力 | 重复位置 | 数据源相同？ | 口径相同？ | 建议唯一权威入口 |
|---|---|---|---|---|
| 管线执行状态 | System `overview` · Boss「今日简报」 | 部分（DB vs 日志） | **否** —— overview 仅 2/13 步用 DB | **看老板**：今日简报；**看运维**：overview，但须补齐时间源 |
| 推荐明细 / 业绩 | System `verify` · Boss「AI 战绩档案」 | 同为 `DailyRecommendation` | 否（verify 是原始明细，战绩档案是统计） | **AI 战绩档案**；verify 应剥离该模块 |
| 数据健康 | System `health` · `verify` · `sync` 三处各调一次 | **是**（同一 `/api/health/status`） | 各自渲染 | **health** Tab |
| 部署记录 | System `deploy` | 唯一 | — | 无重复 ✅ |

---

## 5. 导航问题

| # | 问题 | 等级 |
|---|---|---|
| **N1** | **系统工作区只有 1 个导航节点**，6 个 Tab 无侧栏入口。放开工作区 = 一次放开全部，**无法按受众分级**（老板可见 overview/health/deploy，运维专属 runtime/verify/sync） | **P0** |
| **N2** | **无 Breadcrumb** —— 从 `overview` 的诊断卡跳到 `/admin/research?tab=analysis&sub=score`（研究区）后，**没有返回路径**，且工作区被静默切换 | P1 |
| **N3** | `ws.systemOverview`（系统总览）与 `sys.tab.overview`（系统概览）**两个近义标签指向同一处**，工作区名与 Tab 名撞车 | P2 |
| **N4** | `/admin/universe`、`/admin/mission-audit` 两个系统页**无任何导航入口**，只能手输 URL | P1 |
| **N5** | `MissionControlView` 的诊断卡链接指向 `/strategy`、`/admin/research` —— **跨工作区跳转**，落地后侧栏整个切换 | P2 |

---

## 6. 术语问题

### 6.1 中文界面里的裸英文（应替换）

| 当前 | 位置 | 建议 |
|---|---|---|
| **Runtime** | `sys.tab.runtime`（zh 与 ja 都是 "Runtime"） | **运行状态** / 稼働状態 |
| **Health** | `sys.tab.health`（zh 与 ja 都是 "Health"） | **数据健康** / データ健全性 |
| `Production Integrity` · `Cron Health` · `Pending Trend` | MissionControlView / 相关卡片标题 | 中文化 |
| `Reliability` · `GPT Runtime` | RuntimeView | 中文化 |

### 6.2 允许保留（行业标准缩写）

`GPT` · `PM2` · `Cron` · `API` · `CRITICAL` / `WARNING` / `PASS` · `commit` · `build`

### 6.3 System 区未发现的遗留术语

`V3` · `Alpha` · `Calibration` · `Fusion` · `Registry` —— **这些在 System 区均无出现**（它们是 Research 区术语，已在 T5-3A 统一）。

---

## 7. API 返回展示文案问题

**这是本次审计最重要的发现。** 违反 P19 确立的「API 禁返展示文案」原则的接口如下：

| API | 中文字符串数 | 性质 | 前端是否直接渲染 | 等级 |
|---|---|---|---|---|
| **`/api/admin/mission-control`** | **43 条** | 步骤名 `s.name`、结果摘要 `resultSummary`、错误信息 `errorMessage`、诊断说明与建议 | **是** —— `MissionControlView:219-221` 直出 | **P0** |
| **`/api/sync/status`** | **25 条** | cron 时刻表说明（「05:30 JST 每日」「16:30 JST 每周五 + 07:15 每周一（备份）」） | 是 | **P1** |
| `lib/features/promotion/shadow-diagnostics.ts` | 6 条 | `PENDING_REASON_LABEL` 原因码中文标签 | 是（研究区两页） | **P1**（T5-3B 已登记为 R-1） |

**mission-control 的 43 条尤其严重** —— 其中包含大段诊断建议文案，例如：

```
"个别股票 return60d 计算疑似跨越真实除权除息（split）区间，收益率可能失真，影响 AI 评分与回测统计口径"
"交易长期卡在 WAITING_CLOSE 意味着收盘价缺失"
"价格覆盖率不足会导致下游评分/策略推荐使用不完整数据"
```

这些是**面向人的解释性文案**，写死在 API 里。后果：

1. **日文界面显示中文** —— 系统概览页在 ja-JP 下会大面积显示中文
2. 无法通过 i18n 治理 —— 组件侧再怎么改也没用
3. 与 Research 区的 R-1 是**同一类问题**，但规模大 7 倍

**其余系统 API（`runtime` / `health/status` / `verify` / `deployments`）中文字符串 = 0 ✅**

---

## 8. 问题分级

### P0（阻断开放）

| # | 问题 | 影响 |
|---|---|---|
| **P0-1** | `/api/admin/mission-control` 返回 43 条中文展示文案 | 日文界面大面积中文；组件层无法治理 |
| **P0-2** | 系统工作区只有 1 个导航节点，6 Tab 无法按受众分级 | 放开即把含写操作的 `sync` 暴露给老板 |
| **P0-3** | `overview` 状态条**硬编码常绿**（API / Database / AI Engine `ok:true` 无实际探测） | 给老板错误的系统健康信号 |

> P0-3 沿用 T1 的发现，本轮复核仍然存在。

### P1

| # | 问题 |
|---|---|
| P1-1 | `verify` Tab 职责漂移，混入推荐明细与业绩数据（与 AI 战绩档案重复） |
| P1-2 | `overview` 管线 13 步中仅 2 步用 DB 判据，与今日简报可能矛盾 |
| P1-3 | `/api/sync/status` 返回 25 条中文 cron 说明 |
| P1-4 | 3 个组件零 i18n、186 行硬编码 CJK |
| P1-5 | `sync` 的写操作按钮无二次确认（误点即重算全市场评分） |
| P1-6 | `/admin/universe`、`/admin/mission-audit` 无导航入口 |
| P1-7 | 无 Breadcrumb，跨工作区跳转后无返回路径 |

### P2

| # | 问题 |
|---|---|
| P2-1 | `Runtime` / `Health` 等裸英文 Tab 标签 |
| P2-2 | `/api/health/status` 被四处各自渲染，口径未统一 |
| P2-3 | `ws.systemOverview` 与 `sys.tab.overview` 标签撞车 |
| P2-4 | 诊断卡跨工作区跳转导致侧栏静默切换 |
| P2-5 | `SystemDashboard.tsx` 已停用但仍消费 mission-control API |

---

## 9. 建议方案（仅设计，不实施）

### 9.1 IA 是否符合「输入 → 处理 → 输出 → 维护」

**当前不符合。** 六个 Tab 是按**技术模块**排列（overview / runtime / health / verify / sync / deploy），不是按运维心智流程。

**建议新 IA —— 按「数据从哪来 → 跑得怎样 → 结果对不对 → 系统本身」四段：**

| 阶段 | Tab | 回答什么问题 | 受众 |
|---|---|---|---|
| **① 输入** | **数据源** | 数据从哪来、新鲜不新鲜、要不要手动补 | 运维 |
| **② 处理** | **运行状态** | 今天的管线跑到哪、有没有失败、耗时多久 | 老板 / 运维 |
| **③ 输出** | **数据健康** | 产出的数据可不可信、有没有 CRITICAL | **老板** |
| **④ 维护** | **系统与发布** | 版本、部署记录、股票池配置、Mission 审计 | 运维 |

**映射关系：**

```
① 数据源      ← sync（含写操作，加二次确认）
② 运行状态    ← overview + runtime（含日志）
③ 数据健康    ← health + verify（剥离推荐明细后）
④ 系统与维护  ← deploy + /admin/universe + /admin/mission-audit
```

**Tab 数 6 → 4，导航节点 1 → 4**，且每个节点可独立标注受众。

### 9.2 API 展示文案的治理方向

`/api/admin/mission-control` 的 43 条文案分三类，处置不同：

| 类别 | 例子 | 建议 |
|---|---|---|
| **步骤名** | 「计算综合评分」 | 改回 `stepKey`，前端 `t("sys.step." + key)` |
| **结果摘要** | 「3018 只股票已评分」 | API 返 `{ count: 3018 }`，前端组装文案 |
| **诊断建议** | 「价格覆盖率不足会导致…」 | API 返 `diagnosisCode`，文案入 i18n |

`/api/sync/status` 的 cron 时刻表说明同理 —— 返回结构化的 `{ cron: "30 5 * * *" }`，前端本地化。

### 9.3 verify Tab 的职责收敛

- **保留**：8 模块生产就绪校验（这是真正的「数据校验」）
- **剥离**：每日推荐明细 / GPT 评分 / 买入价 / 收益 → 已由 **AI 战绩档案**承载
- 剥离后 `VerifyView` 从 523 行大幅缩减

### 9.4 状态条改真实探测

`overview` 的 API / Database / AI Engine 三盏灯改为真实探测。**须提前告知：修复后可能立刻由全绿变黄/红** —— 那是修复，不是回退。

---

## 10. 是否建议进入开发

### ⚠️ 建议：**先做 API 层，再做 UI 层**

理由：`/api/admin/mission-control` 的 43 条中文文案是**组件层无法治理的**。如果先做 UI i18n（像 T5-3B 那样），做完之后日文界面**仍然大面积中文** —— 相当于白做一轮。

### 建议拆分

| 阶段 | 内容 | 前置 | 风险 |
|---|---|---|---|
| **T5-4A** | API 展示文案治理：`mission-control`（43 条）+ `sync/status`（25 条）+ `shadow-diagnostics`（6 条，即 T5-3B 的 R-1） | 无 | **中** —— 改 API 返回结构，需同步改前端消费点 |
| **T5-4B** | IA 重构：6 Tab → 4 阶段，导航 1 → 4 节点 | T5-4A | 中 |
| **T5-4C** | 组件 Design First：3 个零 i18n 组件 + 186 行 CJK + 术语替换 | T5-4B | 低 |
| **T5-4D** | 真实健康探测 + 补齐 13 步时间源 + verify 职责收敛 | T5-4C | 中 |
| **T5-4E** | 验收 | 全部 | — |

### 需要你裁定的 4 件事

1. **是否接受「先 API 后 UI」的顺序？**（我强烈建议接受 —— 否则 UI 白做）
2. **IA 从 6 Tab 收敛为 4 阶段（输入/处理/输出/维护）是否批准？**
3. **`verify` 剥离推荐明细**是否批准？（该能力 AI 战绩档案已有）
4. **状态条改真实探测**，接受可能立刻变黄/红？

---

**审计结束，未修改任何代码。等待设计评审。**
