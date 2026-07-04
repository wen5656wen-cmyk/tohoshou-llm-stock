# TOHOSHOU AI — Legacy 路由收敛（LEGACY_ROUTES）

> P4-T4（2026-07-05）· **Redirect First，不删除**。旧路由已被 AI 研究中心 / AI 指挥中心覆盖，
> 统一 **307 临时重定向**到新入口；**观察 2 周**（至 ~2026-07-19）确认无访问需求后，
> 由 P4-T5/T6 再考虑物理删除旧页面组件（本阶段不删任何文件/API/脚本/表）。

---

## 重定向映射

| Legacy Route | New Route（真实 tab key） | 覆盖入口 | Status | 状态 |
|---|---|---|---|---|
| `/alpha` | `/admin/research?tab=factors`（Alpha因子库） | AI 研究中心 · 因子研究 | 307 | Redirected |
| `/alpha/score` | `/admin/research?tab=score`（影子评分） | AI 研究中心 · Shadow·Alpha | 307 | Redirected |
| `/alpha/backtest` | `/admin/research?tab=backtest`（Alpha策略回测） | AI 研究中心 · Shadow·Alpha | 307 | Redirected |
| `/alpha/report` | `/admin/research?tab=analytics`（因子分析） | AI 研究中心 · 因子研究 | 307 | Redirected |
| `/fusion/paper` | `/admin/research?tab=fusion`（AI融合策略研究） | AI 研究中心 · 市场与融合 | 307 | Redirected |
| `/fusion/report` | `/admin/research?tab=fusion`（AI融合策略研究） | AI 研究中心 · 市场与融合 | 307 | Redirected |
| `/ai-picks` | `/`（AI 指挥中心） | 首页 | 307 | Redirected |

> **命名说明**：PROJECT_AUDIT / 任务书使用的 `?group=factor&tab=alpha-factors` 等为语义别名；
> 研究中心页面实际读取 `?tab=<key>`，故重定向目标直接采用真实 tab key（`factors`/`analytics`/`score`/`backtest`/`fusion`），确保用户**落到正确的功能 tab**，无需改动研究中心页面。

---

## 实现方式

- **服务器级重定向**：`next.config.ts` 的 `redirects()`，`permanent: false` → **307 Temporary Redirect**（先临时，观察期后改 `permanent: true` = 308）。
- redirects 在 Next.js 路由中**先于文件系统匹配**，故即便 `app/alpha/*`、`app/fusion/*`、`app/ai-picks/*` 页面文件仍存在，也会被重定向拦截（旧文件保留、不删除、不破坏 build / 书签 / 外链）。
- 源路径 query 会自动透传（如 `/ai-picks?filter=BUY` → `/?filter=BUY`，无害）。

---

## 导航清理（第四部分）

全站**活跃**导航（Sidebar / CommandCenter / 研究卡片 / 版本中心 / 学习报告 / 策略 / 控制中心）**均无**指向 legacy 路由的链接（核实：首页现渲染 `CommandCenter`，已移除含 legacy 链接的 QuickActions）。历史遗留链接均位于**未渲染的死组件**，本次一并清理：

| 位置 | 处理 | 说明 |
|---|---|---|
| `lib/routes.ts` `PAPER_TRADING` | `/fusion/paper` → `/admin/research?tab=fusion` | 唯一 consumer 为死组件 DashboardView QuickAction；避免二次跳转 |
| `app/HomeDashboardClient.tsx` | 3 处 `/ai-picks*` → `/` | 未被任何页面引用（死组件） |
| `app/SystemDashboard.tsx` | `/fusion/paper` → `/admin/research?tab=fusion` | 未被任何页面引用（死组件） |
| `components/mobile/MobileHeader.tsx` | `"/ai-picks": "nav.ai_picks"` **保留** | 仅 route→标题映射（非 href）；重定向后用户永不落此路由，键不会命中，无害 |
| `lib/app-url.ts` `aiPicksUrl()` | **保留** | 外链 URL 生成工具（历史，LINE 已移除）；`/ai-picks` 已重定向，外链仍可用 |

---

## Smoke Test

```bash
npm run smoke:legacy          # 默认对 https://aitohoshou.com 验证 7 条 legacy → 307 + Location 正确
BASE=http://localhost:3000 npm run smoke:legacy
```
脚本：`scripts/smoke-legacy-routes.ts`（fetch `redirect:"manual"`，断言 status ∈ {307,308} 且 Location 命中目标）。

---

## 观察期与后续

| 阶段 | 动作 | 时间 |
|---|---|---|
| P4-T4（本次） | 建立 307 重定向 + 导航清理 + smoke | 2026-07-05 |
| 观察期 | 监控是否仍有访问旧路由需求 | ~2026-07-05 → 2026-07-19（2 周） |
| P4-T5/T6（后续） | 若无需求：307→308；再评估物理删除 `app/alpha/*`、`app/fusion/*`、`app/ai-picks/*` 页面组件 | ≥ 2026-07-19 |

> **本阶段不删除**：数据库表 / API（`/api/alpha/*`、`/api/fusion/*` 仍被研究中心使用）/ Alpha·Fusion 计算脚本 / 研究中心组件 / 任何业务逻辑。安全收敛，非激进删除。
