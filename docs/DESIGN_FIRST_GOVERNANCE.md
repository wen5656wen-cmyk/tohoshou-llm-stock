# TOHOSHOU Product Governance v1.0（P0-GOV-01 / P0-GOV-02 · 立即生效）

> 本文件是全站产品与 UI 的**唯一标准与流程宪法**。所有模块开发必须遵循。
> 立即生效日：2026-07-18。此后 Decision / Research / Management / Strategy / Trading / Learning 全部适用。
> **Build PASS ≠ Product PASS**：功能/数据/API/Build/Health/Deploy 全绿，仍可能因 UI 偏离设计而不予放行。

---

## 0. 项目定位（不可动摇）

TOHOSHOU 是**专业金融终端**，对标：**Bloomberg Terminal · FactSet · LSEG Workspace · Wind**。

它**不是**：后台管理系统 / 数据展示平台 / Admin Dashboard。

任何 UI 决策若偏离「专业金融终端」气质（信息密度、层级、专业度、终端风格），即为偏差。

---

## 1. 错误流程（已废止）

```
Prompt → Claude 理解 → Claude 自行设计 → 开发 → Build PASS → 上线
```

**Build PASS ≠ Design PASS。** 该流程导致「实现与冻结设计明显偏差」，即日起废止。

---

## 2. Product Governance 十二步流水线（唯一合法流程）

每个模块必须按顺序走完十二步，任一步未 Freeze/PASS，禁止进入下一步。**任何模块不得跳过任何一步。**

| 步 | 名称 | 产出 / 门槛 |
|---|---|---|
| ① | Product Definition | 模块目标、唯一问题、边界 |
| ② | Information Architecture (IA) | 模块 / 导航 / 工作流 → **IA Freeze** |
| ③ | User Flow | 关键路径与状态流转 |
| ④ | High Fidelity Design | 每页高保真：**Desktop / Tablet / Mobile**（+Dark，Light 如规划）|
| ⑤ | **Design Freeze** | 视觉稿冻结，未经批准不得变更 |
| ⑥ | Design Assets 整理 | 入库 `docs/design/`，成为唯一 UI 标准（见 §3）|
| ⑦ | Claude Implementation | **100% 还原 Design Assets，不得重新设计** |
| ⑧ | Design Compare | 逐页 Design vs Implementation → **Design Score，每页 ≥90 否则禁进下一模块** |
| ⑨ | UI Polish | 修补 Gap 至达标 |
| ⑩ | Function Review | 数据 / API / 性能 |
| ⑪ | Build / Health | Build PASS + Health CRITICAL=0 |
| ⑫ | Production Release | 仅当 **Design PASS + Function PASS** 才允许 Production |

### 关键约束
- **Prompt / Chat 记录 / Claude 理解 都不是 UI 标准；唯一标准 = Design Assets。**
- **Claude 不负责重新设计**；负责实现 = 100% 还原 Design Assets。允许实现，不允许自由发挥 UI。
- **⑧ 未达 90 分 → 禁止进入下一模块。** ⑤⑥ Freeze 后未经明确批准不得变更。
- **④ High Fidelity Design 为实现的强制前置**：无可视基线不得进入 ⑦（Decision 就是漏了这步 → 本次根因）。

---

## 3. Design Assets（唯一 UI 标准）

所有设计资产统一管理，**不得散落在聊天记录**。必须包含：

UI 图片 / 效果图 / 组件规范 / 颜色 / 字体 / Spacing / Icon / Table / Card / Chart / Interaction。

- 存放位置：`docs/design/`（视觉稿、组件规范）+ 代码 token 单源 `lib/design-tokens.ts` / `lib/decision/ds.ts` / `components/ui`。
- **Design Assets 是唯一 UI 标准**；实现与之冲突时，改实现，不改标准（除非正式解冻）。

---

## 4. Design Compare 检查项（⑧ 逐页核对 · 22 项）

Layout · Grid · Spacing · Typography · Header · Navigation · Card · Table · Chart · Component · Hierarchy · Information Density · Interaction · Animation · Responsive · Visual Style · Language · Color · Icon · Empty State · Loading · Skeleton。

每页产出 **Design Score /100**，维度：**Layout · Visual · Consistency · Professional · Bloomberg Style**。**< 90 不予放行。**

## 4b. Design System Freeze（全模块共享，Claude 不得重新设计）

统一冻结组件：**Header · Sidebar · Top Navigation · Context Bar · KPI Card · Summary Card · Table · Chart · Badge · Status · Button · Dialog · Drawer · Filter · Search · Pagination**。
所有模块共享同一套；新页面只能组合复用，不得另造视觉变体。

---

## 5. 语言规范（Language Driven · 硬性）

**切换语言后，整页 100% 同语言。** 中文→整页中文；日文→整页日文；英文→整页英文。

覆盖：**Button · Tooltip · Badge · Chart · Legend · Status · Loading · Empty · Breadcrumb · Modal · Notification · Table Header** —— 全部统一。

### 强制工程规则（违反即 P0）
1. **组件层禁止硬编码 CJK**：所有 UI 文案走 `t()`（`useI18n`）。例外仅限技术缩写与代码（RSI/MACD/MA/AI/TOPIX/股票代码等）。
2. **API 禁止返回展示文案**：后端只返回**数据 + i18n 键**，绝不返回中文/日文/英文成句供前端直接渲染（历史 bug 根源）。
3. 每次 UI 改动后运行：`grep -rnE '"[^"]*[一-鿿ぁ-んァ-ヶ]' app/ components/ --include="*.tsx"` → 新增/修改文件应为 0（百分位前缀等既有例外除外）。
4. 三语切换需实测截图佐证（每页 zh/ja/en 各一张）。

### Language Review（新增固定门槛）
覆盖 Title · Subtitle · Button · Tooltip · Badge · Status · Chart · Legend · Table · Empty · Loading · Modal · Notification · Breadcrumb · Sidebar —— 全部 100% Driven by Locale。未通过 Language Review 的页面，Design Compare 直接判不合格。

---

## 6. 每模块三报告（完成后必须输出）

**Design Review** · **Function Review** · **Deployment Review** —— 缺一不可。

---

## 7. 当前状态台账

| 模块 | IA | Hi-Fi Design | Design Score | 状态 |
|---|---|---|---|---|
| Decision | ✅ Freeze v1 | ❌ 缺高保真视觉稿 | **86.6**（4/5 页 <90，语言未过） | **未 PASS**，须先修 P0 语言 + P1 组件统一后复评 ≥90 |
| Research | — | — | — | 未启动（受 Decision 门槛阻塞） |
| Management | — | — | — | 未启动 |

> Decision 遗留详见 `P14-UI-00 Decision Design Review`（Top20 修复项）。**在 Decision 每页复评 ≥90 前，禁止进入 P15 Research。**

---

## 8. 流程缺口修补（本次根因）

Decision 走了「无二级视觉稿」的捷径，导致实现凭 Claude 自行设计。**今后二级 High Fidelity Design 为强制前置**：先有可视基线（高保真稿或 HTML 静态稿），Claude 才允许进入四级实现。
