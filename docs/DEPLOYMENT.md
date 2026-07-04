# TOHOSHOU AI — 部署指南（DEPLOYMENT）

> P4-T1 工程化治理引入 GitHub Actions CI/CD。**生产系统处于 V3 Freeze**，部署仍为**人工触发**（不自动 push 部署）。
> 本文档覆盖：本地手动部署 · CI · Deploy Workflow · Secrets · 何时重启 cron · PM2 说明 · 回滚。

---

## 0. 生产拓扑速览

| 项 | 值 |
|----|----|
| 服务器 | `root@8.209.247.68`，应用路径 `/opt/tohoshou/` |
| 进程 | `tohoshou-web`（`next start`，:3000）· `tohoshou-cron`（`tsx scripts/cron-scheduler.ts`，TZ=Asia/Tokyo） |
| 反代 | Nginx（`deploy/02-nginx.conf`）→ 3000，域名 `aitohoshou.com` |
| 构建 | `npm run build`（`next build --webpack`） |
| 健康检查 | `GET https://aitohoshou.com/api/health/status`（`criticalCount` 必须为 0） |

> `toho-finance` 是同服务器上的**另一个独立项目**，与本项目无关，任何部署/PM2 操作都不得触碰它。

---

## 1. 本地手动部署（现有方式，仍可用）

```bash
# 1. 构建（必须）
npm run build
# 2. 健康门槛（在服务器上验证；本地无 DB）
sshpass -p '<pass>' ssh root@8.209.247.68 "cd /opt/tohoshou && npm run health:data"   # 需 CRITICAL=0
# 3. 同步产物（.next 必须；public 有图标/manifest 变更时必须）
rsync -avz --exclude node_modules .next/ root@8.209.247.68:/opt/tohoshou/.next/
rsync -avz public/                        root@8.209.247.68:/opt/tohoshou/public/
# 4. lib/ + scripts/ 必须同步（cron 直跑 tsx，不走 .next）
rsync -avz lib/     root@8.209.247.68:/opt/tohoshou/lib/
rsync -avz scripts/ root@8.209.247.68:/opt/tohoshou/scripts/
# 5. 重启 web（始终）
ssh root@8.209.247.68 "cd /opt/tohoshou && pm2 restart tohoshou-web --update-env && pm2 save"
# 6. 仅当 scripts/cron-scheduler.ts 改动 且 当前不在 07:30–15:00 JST：重启 cron
ssh root@8.209.247.68 "cd /opt/tohoshou && pm2 restart tohoshou-cron --update-env && pm2 save"
# 7. 记录部署 + 验证
curl https://aitohoshou.com/api/health/status
```

**易踩坑**：① `public/` 变更必须单独 rsync（曾致图标 404）；② node-cron 常驻内存，改 `cron-scheduler.ts` 后**不重启 cron 就不生效**（曾漏跑一整天）。

---

## 2. GitHub Actions CI（`.github/workflows/ci.yml`）

**触发**：`push` / `pull_request` → `main`。**只做安全检查，不部署、不连生产 DB、不跑 cron。**

步骤：`checkout → setup-node@20 → npm ci → prisma generate（仅生成 client，不连库）→ typecheck（`npm run typecheck`）→ lint（`npm run lint`，非阻断）→ build`。

- 用 dummy `DATABASE_URL`（`postgresql://ci:ci@localhost/ci`）让 Prisma/Next 能构建，**不使用任何生产 Secret**。
- Lint 在 P4 引导期**非阻断**（有问题只 `::warning::`），后续可收紧为阻断。

---

## 3. GitHub Actions Deploy（`.github/workflows/deploy.yml`）

**触发**：仅 `workflow_dispatch`（Actions 页面手动点击 “Run workflow”）。**不随 push 自动部署**（V3 Freeze 期人工可控）。

**输入（inputs）**
| 输入 | 默认 | 说明 |
|------|------|------|
| `restart_cron` | `false` | 仅当 `scripts/cron-scheduler.ts` 改动才设 `true`；**禁止在 07:30–15:00 JST 执行**（会中断流水线） |
| `install_deps` | `false` | 仅当 `package.json`/lockfile 改动才设 `true`（服务器 `npm ci`） |
| `sync_prisma` | `false` | 同步 `prisma/schema.prisma`（**不自动迁移**，需人工在服务器跑 migrate） |

**流程**：`checkout(fetch-depth 2) → node20 → npm ci → prisma generate → build → 检测 config 变更 → SSH 建连 → rsync（.next --delete-after / public --delete-after / lib / scripts / package.json+lock+ecosystem）→ [可选] sync prisma → [可选] 服务器 npm ci → pm2 restart tohoshou-web --update-env + pm2 save → [guarded] pm2 restart tohoshou-cron → pm2 list → 健康检查（CRITICAL=0 门槛）`。

**本 Workflow 绝不会**：跑 DB 迁移 / 清表 / 重算评分 / 重跑推荐 / 改 env / 执行 cron 脚本 / 自动重启 cron（除非 `restart_cron=true`）/ 删除 legacy code。

---

## 4. GitHub Secrets 配置

在 GitHub 仓库 `Settings → Secrets and variables → Actions` 配置（**切勿提交进仓库，日志不打印**）：

| Secret | 说明 | 示例 |
|--------|------|------|
| `SSH_HOST` | 生产服务器 IP/域名 | `8.209.247.68` |
| `SSH_USER` | SSH 用户 | `root` |
| `SSH_PRIVATE_KEY` | 部署私钥（PEM/OpenSSH，对应公钥需在服务器 `~/.ssh/authorized_keys`） | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_PORT` | SSH 端口（可选，默认 22） | `22` |
| `REMOTE_APP_PATH` | 服务器应用路径 | `/opt/tohoshou` |

> 建议为 CI/CD **单独生成一对部署密钥**（`ssh-keygen -t ed25519 -C github-deploy`），公钥加入服务器 `authorized_keys`，私钥存入 `SSH_PRIVATE_KEY`，与人工运维密钥分离，便于轮换/吊销。生产 `environment: production` 可配 required reviewers 加二次确认。

---

## 5. 何时需要重启 tohoshou-cron

`tohoshou-cron` 运行 node-cron，**调度在进程启动时一次性注册到内存**。因此：

- **必须重启 cron**：改动 `scripts/cron-scheduler.ts`（新增/删除/修改 `cron.schedule()`）后 —— 否则新调度不生效。
- **改脚本内容但不动 schedule**（如 `compute-scores.ts` 逻辑）：只需 rsync `scripts/`，cron 下次触发即用新代码，**无需重启**。
- **禁止重启窗口**：`07:30–15:00 JST`（rerank-top500 + 策略快照流水线运行中，重启会中断并丢失 `pipeline-runs.jsonl` 写入）。
- Deploy Workflow 会在检测到 `cron-scheduler.ts` / `ecosystem.config.js` / `package.json` 变更时输出 `::warning::` 提示；只有 `restart_cron=true` 才真正重启。

---

## 6. PM2 进程说明

| 进程 | 作用 | 备注 |
|------|------|------|
| `tohoshou-web` | Next.js `next start` :3000 | 每次部署都 restart；`max_memory_restart 768M` |
| `tohoshou-cron` | node-cron 调度（`scripts/cron-scheduler.ts`） | 仅改调度才 restart；`TZ=Asia/Tokyo`，`max_memory 512M` |
| ~~`tohoshou-ai-daily-pipeline`~~ | ⚠️ **已于 P4-T1（2026-07-05）删除** | 弃用的一次性 pipeline（`cron_restart 0 21 * * *`），已被 tohoshou-cron 取代；`pm2 delete` + `pm2 save` 持久化，并从 `ecosystem.config.js` 移除定义，防止 `pm2 start ecosystem.config.js` 误恢复导致 double-run race。**禁止重新添加**。 |

常用命令：
```bash
pm2 list                                   # 查看进程
pm2 restart tohoshou-web --update-env      # 重启 web（读最新 env）
pm2 save                                   # 持久化进程表（防重启后丢失/复活幽灵）
pm2 logs tohoshou-cron --lines 100         # 看 cron 日志
```

---

## 7. 回滚方法

**代码回滚（推荐）**
```bash
git revert <bad-commit>        # 生成反向 commit（保留历史）
git push origin main
# 然后手动触发 Deploy Workflow（或本地 build + rsync + pm2 restart tohoshou-web）
```
或回退到已知良好 commit 后重新构建部署：
```bash
git checkout <good-commit> -- .   # 或 git reset --hard <good-commit>（谨慎）
npm run build && rsync .next/ ... && pm2 restart tohoshou-web
```

**快速回滚（不改 Git，服务器侧）**：若上次部署前对 `/opt/tohoshou/.next` 做过备份，可 `rsync` 备份目录覆盖回去 + `pm2 restart tohoshou-web`。建议部署前 `cp -r .next .next.bak.<date>` 留一份。

**PM2 层**：`pm2 restart tohoshou-web` 不改代码；如进程异常 `pm2 reload` / `pm2 delete + pm2 start ecosystem.config.js`（会拉起 web + cron 两个，**不会**再拉起已删除的 pipeline）。

**数据层**：本仓库工作流**从不自动迁移/清表/重算**。数据回滚需人工评估（Prisma 无自动 down migration；依赖 DB 备份）。

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-05 (P4-T1) | 引入 `.github/workflows/{ci,deploy}.yml`；新增 `npm run typecheck`；删除 PM2 幽灵进程 `tohoshou-ai-daily-pipeline` 并从 `ecosystem.config.js` 移除；新增本文档 |
