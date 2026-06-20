# PROJECT_STATUS.md — TOHOSHOU AI 日本股票AI分析系统

> **最后更新：** 2026-06-20
> **版本：** v5.2.0（K 线图升级 + 推荐阈值优化 + 生产全量重算）
> **下次启动继续位置：** [→ 见最下方 NEXT SESSION](#next-session)

---

## 一、系统概况

| 项目 | 详情 |
|------|------|
| 域名 | https://aitohoshou.com |
| 服务器 | 8.209.247.68（阿里云）|
| SSH | `ssh root@8.209.247.68`，密码：Wen565656 |
| 应用目录（生产）| `/opt/tohoshou/` |
| 本地目录 | `/Users/wenzhiyong/llm-stock/` |
| 本地 DB | PostgreSQL Docker `localhost:15432` / DB: `llm_stock` |
| 生产 DB | PostgreSQL `127.0.0.1:5432` / DB: `llm_stock` / user: tohoshou |

---

## 二、生产服务器状态（2026-06-19）

### PM2 进程
```
id:0  tohoshou-web   online  ~190MB  port 3000
id:1  tohoshou-cron  online  ~90MB   cron jobs
```

### 快速操作
```bash
# SSH 登录
ssh root@8.209.247.68   # 密码: Wen565656

# 部署单个文件（本地改完后）
sshpass -p 'Wen565656' scp -o StrictHostKeyChecking=no <本地文件> root@8.209.247.68:/opt/tohoshou/<目标路径>

# 服务器构建重启
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npm run build && pm2 restart all --update-env"

# 查看日志
pm2 logs tohoshou-web --lines 50
```

---

## 三、数据库现状（2026-06-19 生产实测）

| 表 | 条目数 | 状态 |
|----|--------|------|
| Stock | **3,716** | ✅ TSE 全量 |
| DailyPrice | **7,912,242** | ✅ 全量同步完成，最新日期 2026-06-19 |
| Financial | **13,619** | ✅ J-Quants 财报全量 |
| StockScore | **3,714** | ✅ 99.9% 已评分（3716只中3714只）|
| News | 0 | ⚠️ 待同步 |
| WatchList | 0 | 用户未添加 |
| LineUser | 1 | owner: U3223b03bb5879a9dabf2ce27b0f09524 |
| LineGroup | 0 | Bot 尚未加入任何群 |

### 当前 TOP5 AI评分（最高 73 = WATCH）
```
1. ショーボンドHD (1414.T)  73分  WATCH  上涨概率65%
2. エムビーエス (1401.T)    72分  WATCH  上涨概率65%
3. 日鉄鉱業 (1515.T)        72分  WATCH  上涨概率66%
4. ライオン (4912.T)         72分  WATCH  上涨概率67%
5. キヤノン (7751.T)         72分  WATCH  上涨概率67%
```

> 注：当前 BUY 阈值为 80，最高分 73，所以没有任何 BUY 推荐。
> 下次若要出现 BUY，在 `lib/ai-score.ts` 末尾将 BUY 阈值从 80 改为 70。

---

## 四、页面状态（全部 HTTP 200）

| URL | 状态 | 响应时间 | 数据来源 |
|-----|------|---------|----------|
| / | ✅ | 0.18s | StockScore |
| /stocks | ✅ | 0.28s | StockScore TOP500（读 /api/indicators）|
| /indicators | ✅ | 0.25s | StockScore TOP500 |
| /ai-picks | ✅ | 0.08s | StockScore TOP50（读 /api/ai-scores）|
| /screener | ✅ | — | StockScore TOP50 + 市场统计 |
| /sectors | ✅ | — | StockScore 按行业聚合 |
| /stocks/[symbol] | ✅ | — | Stock + DailyPrice + StockScore |
| /watchlist | ✅ | — | WatchList 表（空）|
| /portfolio | ✅ | — | Portfolio 表（空）|
| /news | ✅ | — | News 表（空，待同步）|
| /sync | ✅ | — | 管理页面 |

**已修复：无限加载问题（2026-06-19）**
- 根因：`/api/indicators` 和 `/api/ai-scores` 对 3716 只股票并发 Promise.all → OOM → PM2 崩溃 → 前端 fetch 永不 resolve
- 修复：改为单次读取 StockScore 预计算表，无实时计算

---

## 五、API 路由

| 端点 | 说明 | 关键参数 |
|------|------|----------|
| GET `/api/stocks` | 分页股票列表 | ?q=&market=&sector=&page=1&limit=50 |
| GET `/api/indicators` | StockScore TOP500，含技术指标 | — |
| GET `/api/ai-scores` | StockScore TOP50，含AI评分 | — |
| GET `/api/screener` | StockScore TOP50 + 全市场统计 | — |
| GET `/api/stocks/[symbol]` | 个股详情 + 最近价格 | — |
| GET `/api/stocks/[symbol]/indicators` | 个股技术指标 | — |
| GET `/api/stocks/[symbol]/ai-score` | 个股 AI 评分 | — |
| GET `/api/financials/[symbol]` | 个股财报 | — |
| GET `/api/prices/[symbol]` | 历史价格 | ?days=60 |
| GET `/api/sectors` | 行业统计 | — |
| GET/POST `/api/watchlist` | 自选股管理 | — |
| POST `/api/line/webhook` | LINE Bot Webhook（待注册）| — |

---

## 六、技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 框架 | Next.js App Router + Turbopack | 16.2.9 |
| ORM | Prisma（prisma.config.ts 驱动 URL）| 7.8.0 |
| DB 适配 | @prisma/adapter-pg + pg | — |
| UI | Tailwind CSS v4（无 config 文件）| ^4 |
| AI | OpenAI SDK → DeepSeek API | ^6.44.0 |
| LINE | 自建 lib/line.ts | — |
| 数据 | J-Quants API v2 + yahoo-finance2 | — |

### 关键踩坑（必读）
- **Next.js 16 动态路由 params 是 Promise**，必须 `const { symbol } = await params`
- **Prisma 7 scripts**：不能用 `@/` 别名，用相对路径；PrismaClient 必须传 adapter
- **Tailwind v4**：CSS 入口文件用 `@import "tailwindcss"`，无 tailwind.config.js
- **日本股票颜色**：红=涨，蓝=跌（与 A 股相反）
- **J-Quants 代码**：5 位（4 位代码 + "0"），市场 0111=Prime/0112=Standard/0113=Growth
- **禁止 API route 里 Promise.all 全市场**：3716只 → OOM → 崩溃

---

## 七、脚本命令

```bash
npm run dev                  # 本地开发 localhost:3000
npm run build                # 生产构建
npm run sync-meta            # 同步股票元数据（名称/行业/市值）
npm run sync-prices-recent   # 同步全量最新价格（3716只，约1.5小时）✅已完成
npm run sync-financials      # 同步J-Quants财报（3716只，约2-3小时）✅已完成
npm run compute-scores       # 重算全部StockScore（约10分钟）✅已完成
npm run line:test            # 发送LINE测试推送
npm run line:test:dry        # 预览LINE测试推送（不发送）
npm run send-daily-line      # 发送LINE每日AI日报
npm run line:groups          # 列出Bot所在LINE群组
```

---

## 八、数据库模型（13个）

| 模型 | 表名 | 关键字段 |
|------|------|----------|
| Stock | `"Stock"` | symbol(unique), name, market, sector, price |
| DailyPrice | `"DailyPrice"` | symbol+date(unique), open/high/low/close, volume |
| Financial | `"Financial"` | stockId+fiscalYear+quarter(unique), revenue, netProfit, roe, eps |
| **StockScore** | `"StockScore"` | **symbol(pk), totalScore, technicalScore, fundamentalScore, riskScore, recommendation, rsi14, macd, maTrend** |
| News | `"News"` | stockId, title, source, publishedAt, sentiment |
| AIAnalysis | `"AIAnalysis"` | stockId, score, recommendation, summary |
| Portfolio | `"Portfolio"` | symbol, shares, avgPrice |
| Disclosure | `"Disclosure"` | symbol, title, category, publishedAt |
| Dividend | `"Dividend"` | symbol+year+quarter(unique), dividend, yieldRate |
| SyncLog | `"SyncLog"` | source, status, itemCount |
| WatchList | `watch_list` | symbol(unique), targetPrice |
| LineUser | `line_users` | userId(unique), lastSymbol（上下文记忆）|
| LineGroup | `line_groups` | groupId(unique), isActive |

**Prisma 操作：**
```bash
npx prisma migrate dev        # 本地新增迁移
npx prisma generate           # schema变更后重新生成client
npx prisma migrate deploy     # 生产应用迁移（在/opt/tohoshou执行）
npx prisma studio             # GUI查看数据
```

---

## 九、AI 评分算法（lib/ai-score.ts V2）

**权重：** 技术面(40%) + 基本面(40%) + 风险面(20%) = 总分 100

**技术面（满40分）：**
- MA趋势(0-10)：GOLDEN=10, BULLISH=8, NEUTRAL=5, BEARISH=2, DEAD=0
- MACD(0-5)：BUY=5, NEUTRAL=2, SELL=1（V2修复，旧SELL=0）
- RSI(0-5)：40-60=5, 60-70=4, 30-40=4, 70-80=3, 80+=1, ≤30=3（V2调整）
- 20日涨幅(0-10)：+10%+=10, +5-10=8, 0-5=5, -5-0=3, -10--5=1, ≤-10=0
- 60日涨幅(0-10)：同上尺度

**基本面（满40分）：**
- 营业利润率(0-8)：20%+=8, 15-20=7, 10-15=6, 5-10=4, 0-5=2, 负=0，缺失=**12**
- ROE(0-8)：20%+=8, 15-20=7, 10-15=6, 5-10=4, 0-5=2, 负=0，缺失=**12**
- EPS(0-8)：正EPS按价格占比，负=0，缺失=**12**
- 自有资本比率(0-8)：50%+=8, 40-50=7, 30-40=6, 20-30=4, 10-20=2, <10=0，缺失=**12**
- 数据完整性(0-20)：5条+4期=20, 4条=16, 3条=11, 1条=6, 0条=**10**（V2修复，旧=0）

**风险面（满20分）：**
- 波动率(0-7)、RSI安全性(0-7)、近期涨幅异动(0-6)

**推荐阈值（待优化）：**
```typescript
// lib/ai-score.ts 末尾
if (total >= 90) rec = "STRONG_BUY";
else if (total >= 80) rec = "BUY";   // ← 建议改为 70
else if (total >= 65) rec = "WATCH"; // ← 建议改为 60
else if (total >= 45) rec = "HOLD";
else rec = "AVOID";
```

---

## 十、LINE Bot 状态

| 功能 | 状态 | 备注 |
|------|------|------|
| LINE_OWNER_USER_ID | ✅ | U3223b03bb5879a9dabf2ce27b0f09524（已写入生产 .env）|
| 广播推送 | ✅ | LINE_CHANNEL_ACCESS_TOKEN 已配置 |
| Webhook 接收 | ⚠️ 待注册 | 需在 LINE Developers 填写 Webhook URL |
| 聊天意图 | ✅ | 7203、トヨタ、丰田、今日推荐、新闻、分析7203、为什么、帮助 |
| 上下文记忆 | ✅ | LineUser.lastSymbol（问"为什么"→用上次查的股票）|
| 每日日报 | ✅ 设计 | 08:30 JST，cron-scheduler.ts，生产 tohoshou-cron 运行中 |

**注册 Webhook：**
1. 登录 https://developers.line.biz
2. 选择 TOHOSHOU AI channel（Channel ID: 2010449475）
3. Messaging API → Webhook URL → 填写：`https://aitohoshou.com/api/line/webhook`
4. 点击 Verify 验证
5. 开启 "Use webhook" 开关

---

## 十一、TODO

### P0 — 最优先
- [ ] **注册 LINE Webhook**：填 `https://aitohoshou.com/api/line/webhook`，用户才能聊天
- [x] **调低推荐阈值**：BUY 从 80 → 70，WATCH 从 65 → 60 ✅ v5.2.0

### P1 — 重要
- [x] **重算 StockScore**：生产重算完成（3714只）✅ v5.2.0
- [ ] **同步新闻数据**：访问 `/sync` 页面触发，或直接 `POST /api/sync`
- [x] **个股 K 线图**：蜡烛图 + MA均线 + 成交量 + Tooltip ✅ v5.2.0

### P2 — 功能完善
- [ ] **WatchList UI**：/watchlist 已建，添加"加入自选"按钮到个股详情页
- [ ] **Portfolio UI**：/portfolio 持仓记录和盈亏计算
- [ ] **每日价格自动同步**：验证 cron-scheduler 在生产正常执行
- [ ] **Telegram Bot**：TELEGRAM_CHAT_ID 未填写（`npm run telegram:chat-id` 获取）

### P3 — 数据维护
- [ ] **财报季同步**：每季度末 `npm run sync-financials`
- [ ] **新闻数据清理**：当前测试数据时间戳为 2024 年，需更新

---

## NEXT SESSION

**下次启动，按顺序执行：**

```bash
# === 第一步：调整评分阈值让 BUY 推荐出现 ===
# 编辑 lib/ai-score.ts，找到最后的推荐逻辑
# 将 BUY 阈值从 >=80 改为 >=70
# 将 WATCH 阈值从 >=65 改为 >=60

# === 第二步：重算评分 ===
npm run compute-scores

# === 第三步：验证结果 ===
curl https://aitohoshou.com/api/ai-scores | python3 -c "
import sys,json; d=json.load(sys.stdin)
for s in d['scores'][:5]: print(s['symbol'], s['totalScore'], s['recommendation'])
"

# === 第四步：注册 LINE Webhook（需要浏览器）===
# https://developers.line.biz → TOHOSHOU AI → Webhook URL
# 填入: https://aitohoshou.com/api/line/webhook

# === 第五步（可选）：画个股 K 线图 ===
# /stocks/[symbol]/page.tsx 添加 recharts LineChart
# 数据来源：/api/prices/[symbol]?days=60
```

**验证生产是否正常：**
```bash
curl https://aitohoshou.com/api/stocks | python3 -c "import sys,json; d=json.load(sys.stdin); print('stocks total=', d['total'])"
curl https://aitohoshou.com/api/ai-scores | python3 -c "import sys,json; d=json.load(sys.stdin); print('ai-scores=', len(d['scores']))"
pm2 list   # 在服务器上运行
```
