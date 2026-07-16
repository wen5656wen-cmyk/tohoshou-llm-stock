# P7 Architecture Governance — TOHOSHOU AI 架构治理规范（永久）

> 生效日期：2026-07-16。承接 `docs/P7_ARCHITECTURE_FREEZE.md`。
> **本文档是 P8 及以后所有开发任务的最高架构约束。任何违反本规范的开发，必须先进行 Architecture Review。**

---

## 0. 铁律

系统永久固定为 **Workspace → Hub → Tab** 三层。

> **禁止再回到「增加一个页面 / 增加一个一级菜单 / 增加一个新的中心」的旧模式。**

当前架构基线（冻结值）：

| 层 | 值 | 明细 |
|---|---:|---|
| Workspace | **3** | Boss · Admin · Research |
| 一级导航 | **6** | Boss 4 + Admin 1 + Research 1 |
| Hub | **4** | Decision Center · Stock Center · Research Hub · Mission Control |
| Tab | 28 | 决策6 + 股票7 + 研究7 + 系统8 |
| 老板每天可见 | ≤4 | |

---

## 1. Architecture Gate（任何开发开始前必答，缺一不可）

**① 属于哪个 Workspace？** `Boss` / `Admin` / `Research`
**② 属于哪个 Hub？** `Decision Center` / `Stock Center` / `Research Hub` / `Mission Control`
**③ 属于哪个 Tab？** 已有 Tab（填 tab key）/ 新增 Tab

> 若新增 Tab，**必须书面说明「为什么不能放进任何已有 Tab」**，并经架构评审通过。
> 三问任一无法回答 → **不得开发**。

---

## 2. 禁止事项（硬红线）

- ❌ 新增一级导航
- ❌ 新增 Workspace
- ❌ 新增 Hub（除非架构评审）
- ❌ 新增独立 Dashboard
- ❌ 新增独立 Center
- ❌ 新增重复详情页（个股详情唯一 = `/stocks/[symbol]`）
- ❌ 新增重复 API（先查现有接口能否复用/扩展字段）
- ❌ 新增重复数据库表/字段

---

## 3. 新功能承载优先级

```
已有 Tab   →  已有 Hub（新增 Tab，需评审）  →  已有 Workspace（新增 Hub，需架构评审）
```

- **Tab**：优先塞进已有 Tab；实在放不下才新增 Tab（需说明理由 + 评审）。
- **Hub**：新增 Hub 必须经架构评审（默认不批）。
- **Workspace**：**永久禁止新增。**

---

## 4. UI Review（每个功能上线前必答）

| 问题 | 处置 |
|---|---|
| 老板是否需要？ | 否 → **禁止出现在老板工作区** |
| 管理员是否需要？ | 是 → Mission Control 的 Tab |
| 研究是否需要？ | 是 → Research Hub 的 Tab |

> 判定「谁需要」决定归属工作区。老板不需要的，一律进 Admin / Research。

---

## 5. 老板体验标准（不可妥协）

- 老板工作区**恒定 4 个一级入口**：决策中心 · 股票中心 · 策略 · 我的持仓。
- 每天 95% 工作 **10 次点击以内**完成。
- 老板工作区**禁止**：技术词汇 · 研究入口 · 运维入口 · 内部表名 · Cron/流水线细节。
- 技术内容一律「查看详情」跳研究/管理区。

---

## 6. 管理员标准

- 所有系统维护统一进入 **Mission Control**（`/admin/mission-control`）。
- **不得再新增** Runtime / Verify / Health / Deployment / Sync / Cron / Log 独立页面 —— 全部作为 Mission Control 的 Tab。

---

## 7. 研究标准

- 所有 Alpha / Fusion / Regime / Factor / Learning / Version / Experiment / Backtest / Scoring V3 统一进入 **Research Hub**（`/admin/research`）。
- **不得新增任何新的研究入口** —— 全部作为 Research Hub 的 Tab（或子标签）。

---

## 8. URL 规范

- 新 URL 优先用无 `/admin/` 前缀的顶层 hub 路径：`/decision-center` `/screener` `/portfolio` `/strategy` `/research` `/system`。
- **避免继续新增 `/admin/xxxx`** 独立路由。
- Tab 一律 `?tab=<key>`；叶子详情 `/stocks/[symbol]`、`/ai-theme/[theme]`。
- 旧 URL **长期保留**，统一 `redirect()` 应用内重定向到对应 `?tab=`，**禁止删除**。
- 导航唯一来源 `lib/navigation/nav-config.ts`，桌面/移动同源，**禁止硬编码路径**。

---

## 9. Legacy / Shadow / Dead Code

- 新增功能**不得依赖 Legacy**。
- **不得新增 Shadow**（`SCORING_ENGINE=v3` 之外不得再建影子引擎；V3 去留见 P7-01）。
- **不得新增 Dead Component**（上线即被引用）。
- 每个 PR 必须说明：**是否影响 Legacy 清理**（见 Freeze 文档 §6 清理清单）。

---

## 10. P8 开发规范

> P8 所有需求，**必须先回答 Architecture Gate 三问（Workspace / Hub / Tab）**，否则不得开发。

- 冻结区不动：评分(V2/calcAiScore)、Scoring V3(Shadow-only)、GPT rerank、三策略、Paper Broker、资金链、Cron、DB schema、API 返回字段、P5/P6/V1.1 冻结。
- 改评分/资金链前须 `/review payment`。
- 部署协议：build → health(CRITICAL=0) → rsync .next+lib → 重启 web（cron 仅 cron-scheduler 变更时重启，避 07:30–14:00 JST）→ record deployment。

---

## 11. 月度架构巡检（每月执行，任一不达标即触发 Architecture Review）

| 指标 | 目标 |
|---|---:|
| 一级导航 | ≤ 6 |
| Workspace | = 3 |
| Hub | = 4 |
| 老板一级入口 | ≤ 4 |
| 孤儿页面（200 但无入口） | 0 |
| Nav 盲区 | 0 |
| 重复详情页 | 0 |
| 重复 API | 0（新增不得重复） |
| 重复数据库 | 0（新增不得重复） |
| Health | CRITICAL = 0 |

---

## 12. 交付报告新增段落（强制模板）

> 以后所有开发完成后，交付报告**必须包含以下 Architecture Check 段**：

```
## Architecture Check
- Workspace：<Boss / Admin / Research>
- Hub：<Decision Center / Stock Center / Research Hub / Mission Control>
- Tab：<已有 tab key / 新增 tab（附评审理由）>
- 是否新增一级导航：NO
- 是否新增 Hub：NO
- 是否新增 Workspace：NO
- 是否影响 P7 Freeze：NO
```

任一为 YES → 该 PR 必须先通过 **Architecture Review** 方可合并。

---

**本规范为 P8 及以后所有开发任务的最高架构约束。与 `P7_ARCHITECTURE_FREEZE.md` 共同构成 TOHOSHOU AI 的永久架构基线。**
