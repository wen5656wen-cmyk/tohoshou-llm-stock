# TOHOSHOU AI Development Rules

**永久开发规范 — 所有任务必须遵守，无例外。**

---

## Rule 1. 完成 ≠ 写完代码

任何任务必须按以下顺序执行：

```
Code
↓
Build
↓
Health
↓
API Verify
↓
DB Verify
↓
Page Verify
↓
Production Verify
↓
Acceptance Report
```

没有全部通过，**不允许**写：
- Completed
- Done
- Deployed
- Production Ready

必须写：**PASS / FAIL**

---

## Rule 2. 页面必须真实验证

新增页面必须：
1. 实际访问 URL
2. 返回 HTTP 200
3. 输出页面关键内容
4. 至少验证主要模块数据

**禁止：**
- "页面应该正常"
- "理论可访问"
- "无法截图"

必须真实验证。

---

## Rule 3. API 必须真实请求

新增 API 必须：
- curl API
- 输出 JSON
- 验证关键字段
- 标记 PASS / FAIL

**禁止：**
- "理论返回"
- "应该正常"

---

## Rule 4. 数据库必须验证

涉及数据库必须：
- SQL 查询
- 输出结果
- 验证记录数

**禁止：**
- 只看 Prisma Schema
- 只看代码

---

## Rule 5. AI / Rerank / Cron

涉及 compute-scores / rerank / DailyRecommendation / Backtest / Cron，必须：
1. 等待任务完成
2. 运行 `npm run health:data`
3. 查询数据库
4. 验证 API
5. 输出最终状态

**禁止：**
- "waiting…"
- "wakeup later"
- "background maybe finished"

必须确认最终结果。

---

## Rule 6. Production Acceptance Report

最终报告统一格式：

```
MODIFIED FILES:

BUILD:         PASS / FAIL
HEALTH:        PASS / FAIL
API VERIFY:    PASS / FAIL
PAGE VERIFY:   PASS / FAIL
DATABASE VERIFY: PASS / FAIL
PM2:           PASS / FAIL
PRODUCTION:    YES / NO

REMAINING ISSUES:
```

**没有 YES，不允许写部署完成。**

---

---

## Rule 7. Deployment History（v8.9.5 起强制）

每次 production deploy 完成后，必须执行以下步骤，缺一不可：

### 7.1 本地记录（写入本地 DB）

```bash
npm run record:deployment -- \
  --commit=<7位hash> \
  --summary="<本次变更摘要>" \
  --productionReady=true \
  --build=PASS \
  --health=PASS \
  --api=PASS \
  --page=PASS \
  --database=PASS \
  --pm2=PASS \
  "--files=file1.tsx,file2.ts" \
  "--warnings=w1,w2" \
  --blockingIssues="" \
  --operator=Claude
```

### 7.2 生产记录（POST 到生产 API 写入生产 DB）

```bash
curl -s -X POST "https://aitohoshou.com/api/admin/deployments" \
  -H "Content-Type: application/json" \
  -d '{ ...same fields as JSON... }'
```

### 7.3 验证写入成功

```bash
curl -s "https://aitohoshou.com/api/admin/deployments" | head -c 500
```

确认 `total` 增加，最新记录位于 `rows[0]`。

### 7.4 Rule 6 验收报告追加字段

```
MODIFIED FILES:
BUILD:               PASS / FAIL
HEALTH:              PASS / FAIL
API VERIFY:          PASS / FAIL
PAGE VERIFY:         PASS / FAIL
DATABASE VERIFY:     PASS / FAIL
PM2:                 PASS / FAIL
DEPLOYMENT HISTORY:  PASS / FAIL  ← 新增必填
LATEST DEPLOYMENT:   <commit hash>
PRODUCTION:          YES / NO
REMAINING ISSUES:
```

**没有写入 Deployment History，不允许写 Production Completed。**

---

---

## Rule 8. 生产域名与事实来源统一（v10.1.1 起强制）

### 8.1 唯一生产验收域名

```
✅ 正确：https://aitohoshou.com
❌ 禁止：https://tohoshou.com
```

任何 curl、验收报告、文档中涉及生产 URL，必须使用 `https://aitohoshou.com`。`tohoshou.com` 不是生产验收域名，禁止出现在验收报告中。

### 8.2 事实来源层级（优先级从高到低）

| 数据 | 事实来源 | 禁止来源 |
|------|---------|---------|
| 生产 ready 状态 | `curl https://aitohoshou.com/api/admin/verify` | 代码推断、build 日志 |
| DailyRecommendation 条数 | 生产 DB `psql` 查询 | PROJECT_STATUS.md 的旧记录 |
| 部署历史 | `curl https://aitohoshou.com/api/admin/deployments` | git log 推断 |
| Backtest 状态 | `curl https://aitohoshou.com/api/backtest/health` | update-backtest 脚本输出 |
| 股票/评分数量 | `curl https://aitohoshou.com/api/admin/verify` (.meta) | schema 或代码注释 |

### 8.3 文档更新前必须核验

更新 PROJECT_STATUS.md / CHANGELOG.md 中任何数字或状态前，必须先运行：
```bash
curl -s https://aitohoshou.com/api/admin/verify
curl -s https://aitohoshou.com/api/backtest/health
# 如涉及 DailyRecommendation 具体条数，必须 psql 查询
```

**禁止根据上一次会话记忆填写状态数字。**

---

*此文档为永久开发规范，以后所有任务必须遵守。*
