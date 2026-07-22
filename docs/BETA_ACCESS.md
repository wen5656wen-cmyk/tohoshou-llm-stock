# BETA_ACCESS — 研究工作区 Beta 访问指南

> Created: 2026-07-22 (P22-S3 / S4 / S3-HOTFIX)
> 生产域名：https://aitohoshou.com
> 相关代码：`lib/beta-auth.ts` · `lib/beta-access.ts` · `lib/research-permission.ts` · `components/beta/BetaAccessGate.tsx` · `app/api/beta/session/route.ts`

---

## 1. Beta 入口

**Research（研究）Workspace** —— 内部测试者可通过 Beta 密码访问只读研究页。

- **入口路径**：`/admin/research`（顶部导航「研究」按钮，或直连 URL）
- **密码**：`5566`
  - ⚠️ **不硬编码**：代码只读环境变量 `BETA_ACCESS_PASSWORD`（存生产 `.env`，**未提交 Git**）。
  - 轮换：改 `.env` 的 `BETA_ACCESS_PASSWORD` 并 `pm2 restart tohoshou-web --update-env` 即可；改后已发出的 Beta Cookie 全部失效（HMAC key 变化）。
  - 本文档写明 `5566` 仅为团队内部说明；如需保密请轮换环境变量。
- **Cookie**：验证成功后写入 `beta_access` httpOnly Cookie，**有效期 30 天**，30 天内免再输密码。
  - 属性：`HttpOnly · Secure（生产）· SameSite=Lax · Path=/`；Cookie 内**不含密码明文**（存 HMAC 签名）。
- **退出 Beta**：研究页右下角「退出 Beta」按钮（清 Cookie）。仅 Beta 会话显示；管理员会话不显示此按钮。

---

## 2. 访问方式（三态）

| 身份 | 进入研究工作区 |
|---|---|
| **Admin（管理员）** | **免登录**（已有 admin 会话即免 Beta 密码；admin 是超集，权限高于 Beta） |
| **Beta** | 输一次 Beta 密码 → 30 天免密 |
| **None（未登录）** | 弹 Beta 密码框，输入 `5566` 进入 |

判定由 `BetaAccessGate` 统一负责（读 `GET /api/beta/session` 的 `via` = admin / beta / null）。

---

## 3. 当前开放（Beta 可访问 · 只读）

| 功能 | 依赖只读 API |
|---|---|
| ✅ Alpha | `/api/alpha` `/api/alpha/*` |
| ✅ Fusion | `/api/fusion/paper` `/api/fusion/report` |
| ✅ Strategy Validation | `/api/strategy/validation`（+ `/api/strategy/overview` 框架） |
| ✅ Research Library | `/api/research/library` |
| ✅ Research Review | `/api/research/review`（**仅 GET**） |
| ✅ AI Quality | `/api/admin/ai-quality` |
| ✅ Production Monitor | `/api/admin/production-monitor` |

白名单单一来源：`lib/beta-access.ts`（`isBetaReadable`，**仅 GET 生效**）。前端可见性单一来源：`lib/research-permission.ts`（`BETA_VISIBLE_FEATURES`，逐条对应白名单）。

**原则：UI 可见 = 实际可访问** —— Beta 看到的 tab/卡片都能点开，不会出现「点进去才 401」。

---

## 4. 当前关闭（Beta 不可访问，仅 Admin）

以下对 Beta **一律 401 / 前端隐藏**，未因 Beta 开放而降低任何权限：

- ❌ **Shadow**（`/api/scoring-v3/shadow`）
- ❌ **Calibration**（`/api/scoring-v3/calibration`）
- ❌ **Freeze**（`/api/scoring-v3/freeze`）
- ❌ **Promotion / Platform / Registry**（因子晋升 / 平台 / 登记，`/api/admin/feature-*`）
- ❌ **Learning**（研究结论，`/api/admin/learning-report`）
- ❌ **Reports**（strategy 周月报）· **Versions**（内部实验版本）
- ❌ **Strategy DAY / SWING / LONG**（`/api/strategy/[type]`）
- ❌ **Admin Workspace**（管理工作区，导航关闭）
- ❌ **所有写操作**（POST/PATCH/DELETE，含 `research/review` POST、sync、持仓/观察名单写等）

保护机制：middleware 白名单**仅对 GET** 放宽 Beta；写方法与白名单外一律走 `guardAdminRoute`（只认 admin_session / x-admin-token）。`guardAdminRoute` 与 `verifyAdminRequest` 在 P22 全程**未删除、未修改**。

---

## 5. 安全边界小结

- Beta ≠ Admin：Beta 是独立的低权限只读凭证，**永远无法**通过 `guardAdminRoute`。
- 免密仅在有效凭证存在时发生（Beta 30 天 / Admin 90 天），全新访客必须输密码 / 登录。
- 密码轮换 = 改 `.env` + 重启；所有旧 Cookie 立即失效。
