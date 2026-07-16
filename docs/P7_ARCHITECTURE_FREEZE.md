# P7 Architecture Freeze — TOHOSHOU AI 架构冻结规范

> 生效日期：2026-07-16（P7-06 上线，部署 #169，commit ab73c45）。
> 本文档是 P7 阶段的最终架构约束。**P8 及以后所有开发必须遵守本规范。**

---

## 1. 最终 Workspace 结构

系统固定采用 **Workspace → Hub → Tab** 三层架构。共 **3 个工作区**，软切换（无鉴权），默认老板：

| 工作区 | 默认落地 | 一级入口数 | 定位 |
|---|---|---|---|
| 🟢 **boss（老板）** | `/decision-center` | 4 | 每日决策/选股/交易 |
| 🟠 **admin（管理员）** | `/admin/mission-control` | 1 | 系统运维 |
| 🔬 **research（研究）** | `/admin/research` | 1 | 模型/因子/回测 |

工作区由 **URL 推导**（`workspaceForPath`）：research/admin 前缀命中对应区，其余归老板。localStorage 记忆；刷新保持；新浏览器默认老板。

---

## 2. 最终导航树

```
切换器：[老板] 管理员 研究   默认=老板

🟢 老板工作区（4 一级入口）
├─ 决策中心 /decision-center      → 6 Tab
├─ 股票中心 /screener             → 7 Tab
├─ 策略     /strategy
└─ 我的持仓 /portfolio
   └ 叶子：/stocks/[symbol] · /ai-theme/[theme] · 工具 /coming-soon

🟠 管理员工作区（1 一级入口）
└─ 系统总览 /admin/mission-control → 8 Tab

🔬 研究工作区（1 一级入口）
└─ 研究综合 /admin/research        → 7 Tab
```

**一级入口总数 = 6**（老板 4 + 管理员 1 + 研究 1）。

---

## 3. 最终 Hub 结构（3 Hub）

### 决策中心 Hub `/decision-center`（6 Tab）
`今日总览 · 早盘AI五选 · 每日关注池 · 收盘决策 · 决策驾驶舱 · 历史记录`

### 股票研究 Hub `/screener`（7 Tab）
`选股 · 行业 · 主题 · 产业链 · 新闻 · 指标 · 研究分析`

### 研究综合 Hub `/admin/research`（7 Tab）
`研究概览 · 因子(库/注册/晋升/平台) · Alpha(评分/分析/Fusion/Regime) · Scoring V3(Shadow/Calibration/Freeze) · 学习 · 实验(实验/版本) · 研究回测(策略/Alpha)`

### Mission Control Hub `/admin/mission-control`（8 Tab）
`系统概览 · Runtime · Health · 数据校验 · 同步 · Cron · 部署 · 日志`

---

## 4. URL 规范

- **一级入口**：`/<hub>`（如 `/decision-center`、`/admin/research`、`/admin/mission-control`）。
- **Tab**：`/<hub>?tab=<tabKey>`（顶级 Tab 走 URL，刷新保持）。分组内子标签为本地态。
- **叶子详情页**：`/stocks/[symbol]`、`/ai-theme/[theme]`（上下文进入，不在一级导航）。
- **旧 URL**：全部保留，`redirect()` 应用内重定向到对应 `?tab=`（`force-dynamic`，无长缓存）。**禁止删除旧 URL。**
- **所有导航配置唯一来源**：`lib/navigation/nav-config.ts`（桌面 Sidebar / 移动 BottomNav+Drawer / 切换器同源）。**禁止硬编码路径。**

---

## 5. 新增功能规范（强制）

> **以后新增任何功能，必须遵守 Workspace → Hub → Tab。禁止新增一级导航。**

- 新功能先判定归属工作区（老板/管理员/研究）。
- 在对应 Hub 内**新增一个 Tab**（或子标签）承载，**不得新增一级入口**。
- Tab 必须 `next/dynamic` 懒加载 + 仅激活挂载。
- 复用现有组件/API，不复制业务逻辑，不复制 API。
- 新页面文案全部走 `t()`（三语），`app/` 保持 CJK-free（视图组件放 `components/`）。
- 老板工作区**禁止**出现运维/模型/因子/回测明细/技术指标入口。

**违反本规范（新增一级导航、老板区塞技术页、硬编码路径）视为架构回退，不得合并。**

---

## 6. Legacy 清理计划（观察期后执行，非本阶段）

| 类别 | 项 | 处置 |
|---|---|---|
| 死组件 | `app/HomeDashboardClient.tsx`、`app/SystemDashboard.tsx` + DashboardView 死导出 | 可直接删（0 引用） |
| Legacy 重定向页 | `/ai-picks`、`/alpha`+`/alpha/*`、`/fusion/report`、`/fusion/paper`、`/market-regime` | 观察 2 周后删文件（next.config 重定向保留） |
| 孤儿/重复页 | `/stocks`(TOP500 列表，与选股重复)、`/watchlist`(个人自选) | stocks→重定向 /screener；watchlist→并入交易 Tab 或废弃 |
| 废弃表 | `Portfolio`、`SimPortfolio/SimPosition/SimTrade` | 先核实无消费者后清退 |
| 疑似空表 | `ExperimentRegistry`、`VersionSnapshot` | 核实生产行数后决定 |
| 废弃字段 | `DailyRecommendation` 回测列、`StockScore.shadow*` 等 | 先切读取源再清 |

> 清理为独立 P，纯移除，不涉资金/评分逻辑。删除前须生产核实无隐藏消费者。

---

## 7. P8 开始前必须遵守的架构规范

1. **三工作区不变**：boss/admin/research，默认老板。不得增设第 4 工作区（除非重大产品决策）。
2. **一级导航冻结在 6 个**：老板 4 + 管理员 1 + 研究 1。**禁止新增。**
3. **新功能 = Hub 内新 Tab**，走 `nav-config` 登记，桌面/移动同源。
4. **冻结区不动**：评分(V2/calcAiScore)、Scoring V3(保持 Shadow，见 P7-01)、GPT rerank、三策略、Paper Broker、资金链路、Cron 时间与逻辑、DB schema、API 返回字段、P5 Runtime Freeze、P6 Freeze、AI Top Picks V1.1 冻结。
5. **改评分/资金链前须 `/review payment`**（沿用既有规则）。
6. **部署协议不变**：build→health(CRITICAL=0)→rsync .next+lib→重启 web（cron 仅 cron-scheduler 变更时重启，避 07:30–14:00 JST）→record deployment。
7. **Scoring V3 去留**：P7-01 裁决为「条件性升级」——需指定 owner 走 P7-02 重验证(上行窗口+Readiness≥90)方可切生产，否则归档删除。**在此之前 V3 永远 Shadow-only，禁止 SCORING_ENGINE=v3。**

---

**P7 Architecture Freeze 正式生效。整个系统从此按「人怎么用」生长（Workspace→Hub→Tab），不再按「开发者加了什么」堆积。**
