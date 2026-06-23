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

*此文档为永久开发规范，以后所有任务必须遵守。*
