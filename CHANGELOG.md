# Changelog

---

## [7.0.0] - 2026-06-20 — TOHOSHOU AI V3：全球市场真实数据接入第一阶段

### 概述

将 V2 的两个"固定默认值"替换为真实市场数据：
- `globalTrendScore`：改为从 Yahoo Finance 抓取 NASDAQ/VIX/USDJPY/日经指数，动态计算 0-10 分
- `moneyFlowScore`：预留 JPX 机构资金流接口，JPX 不可访问时自动 fallback 到 V2 代理评分

### 新增

#### `scripts/fetch-global-market.ts` (新 npm run fetch-global-market)
- 从 Yahoo Finance 抓取：NASDAQ (^IXIC), VIX (^VIX), USD/JPY (JPY=X), 日经 (^N225), TOPIX (^TOPX)
- 评分逻辑：NASDAQ变化(3pts) + VIX水平(3pts) + USD/JPY区间(2pts) + 日经变化(2pts) → 0-10分
- 写入 `GlobalMarket` 表
- 当日数据：NASDAQ +1.91%，日经 +0.28%，USD/JPY 161.27，score=7

#### `scripts/fetch-institutional-flow.ts` (新 npm run fetch-institutional-flow)
- 目标：JPX「投資部門別売買動向」周次 CSV（外資/投信/法人/個人）
- 当前状态：JPX 网站从海外服务器不可访问 → 自动 fallback 写入 synthetic 中性数据
- 当 JPX 数据获取成功时：替换 `calcInflow(return60d)` 为 `calcRealInflow(foreigners+trust)` (0-8分)
- 写入 `InstitutionalFlow` 表（date, investorType, market, buyAmount, sellAmount, netAmount, source）

#### `app/api/market-data/route.ts`
- 验证接口：返回 GlobalMarket/InstitutionalFlow 最新状态、数据新鲜度、scoring mode
- scoringMode: `{ globalTrend: "yahoo_v3"|"v2_default_7", moneyFlow: "jpx_v3"|"synthetic_neutral"|"v2_proxy" }`

### 修改

#### `prisma/schema.prisma`
- `InstitutionalFlow`：重构为市场整体投资部门数据（investorType, market, buyAmount, sellAmount, netAmount, source）
- `GlobalMarket`：新增字段 nasdaqChange, nikkei, nikkeiChange, topix, topixChange, source

#### `lib/ai-score.ts`
- 新增类型 `GlobalMarketData`, `InstitutionalFlowData`
- `ScoreInput` 新增可选字段 `globalMarketData`, `institutionalFlowData`
- `calcGlobalTrendReal()`: 从实时 GlobalMarket 数据计算 globalTrendScore
- `calcRealInflow()`: 从 JPX 机构资金流数据计算 inflow 分量（0-8分）
- `AiScoreResult` 新增 `moneyFlowSource`, `globalTrendSource` 用于透明度展示
- 数据缺失时完整 fallback：JPX synthetic/缺失 → V2 proxy；GlobalMarket 缺失/过期 → 默认7

#### `scripts/compute-scores.ts`
- 评分前预加载最新 GlobalMarket（≤7天）和 InstitutionalFlow（≤14天）
- 日志输出数据日期、score、source，以及是否使用 fallback

### 生产数据状态 (2026-06-20)

| 维度 | 数据源 | 状态 |
|------|--------|------|
| globalTrendScore | Yahoo Finance (NASDAQ/日経) | ✓ 实时 score=7/10 |
| moneyFlowScore | JPX (海外不可访问) | → V2 proxy fallback |
| newsSentimentScore | Kabutan 新闻 | 不变 |
| technicalScore | J-Quants 价格数据 | 不变 |
| fundamentalScore | J-Quants 财务数据 | 不变 |

### 评分分布（全量 3714 只）

| 评级 | 数量 |
|------|------|
| STRONG_BUY | 0 |
| BUY | 0 |
| HOLD | 410 |
| WATCH | 1463 |
| AVOID | 1841 |
| 平均分 | 49.8 |
| 最高分 | 79 |

---

## [6.1.0] - 2026-06-20 — TOHOSHOU AI V2 稳定性复查（V1残留清零）

### 修复（全站 V1 残留清零）
- `app/api/ai-scores/route.ts`：新增 moneyFlowScore/newsSentimentScore/globalTrendScore/newsSummary 返回；删除全零 V1 detail 对象
- `app/ai-picks/page.tsx`：类型、标签、进度条全面升级为5维度（"安全性(40%)" → "資金/情绪/全球"）
- `app/page.tsx`：首页 TOP3 "安全性" → "資金面"，新增 moneyFlowScore 查询
- `app/screener/page.tsx`：副标题 "技术40%+基本面40%+安全性20%" → "技術/30+基本面/25+資金面/20+情绪/15+全球/10"
- `lib/ai-agent.ts`：LINE 完整分析中 "安全性" → "資金面" (2处)
- `lib/line-agent.ts`：LINE 推送评分拆解中 "安全性" → "資金面"

---

## [6.0.0] - 2026-06-20 — TOHOSHOU AI V2（100分5维度评分系统）

---

## [5.8.0] - 2026-06-20 — 全量股票中文名填充（100% 覆盖）

### 新增

#### `scripts/seed-all-chinese-names.ts`
- **目标**：3716 只 TSE 股票全部获得 `nameZh`，覆盖率从 167/3716 (4.5%) → 3716/3716 (100%)
- 翻译优先级：手动精确映射（305只）> 保留已有 > 自动翻译
- **手动映射**：~305 只知名企业（丰田/索尼/三菱UFJ/任天堂/基恩士等主要行业龙头）
- **自动翻译规则（三级流水线）**：
  1. **全角归一化**：`Ａ-Ｚ` / `０-９` / `　` → ASCII 半角
  2. **片假名→中文词典**（60+ 条）：`ホールディングス→控股`, `テクノロジー→技术`, `グループ→集团` 等
  3. **日语汉字→简体中文字典**（90+ 字）：`東→东`, `電→电`, `極→极`, `銀→银`, `証→证` 等
- 执行命令：`npm run seed-all-zh`（跳过已有）/ `npm run seed-all-zh:force`（全量覆盖）
- 生产已执行：**3716/3716 = 100%，0 失败**

### 质量验收
- `極洋 → 极洋`（汉字转换）
- `東洋水産 → 东洋水产`（東→东, 産→产）
- `ウエストホールディングス → ウエスト控股`（片假名转换）
- `信越化学工業 → 信越化学工业`（手动 + 工業→工业）
- `黒田グループ → 黑田集团`（黒→黑, グループ→集团）

---

## [5.7.0] - 2026-06-20 — 中文名显示体系（nameZh）

### 新增

#### DB Schema：`Stock.nameZh` + `StockScore.nameZh`
- 新增 `nameZh TEXT` 字段到 `Stock` 和 `StockScore` 表
- 迁移：`prisma/migrations/20260620_add_name_zh/migration.sql`
- 本地 `prisma db push` + `prisma generate` 已同步

#### 中文名种子数据（`scripts/seed-chinese-names.ts`）
- 覆盖 **168 只**主要日本上市股票的中文名
- 包括：丰田汽车 / 索尼集团 / 软银集团 / 任天堂 / 三菱UFJ金融集团 / 东京电子 / 基恩士 / 迅销集团（优衣库）/ 日本M&A中心 / 东京海上控股 等
- 执行：`npm run seed-zh-names`

#### 个股详情页 Header 重设计
- **第一行**：`nameZh`（font-size: 40px, bold, #111827）— 无中文名时隐藏
- **第二行**：`name`（日文名，18px, #4B5563；无中文名时升为主标题）
- **第三行**：`nameEn`（英文名，16px, #6B7280）— 有时显示
- **第四行**：股票代码灰蓝 Badge（monospace, 圆角）+ 市场 + 行业 chips
- 效果示例：极东 / きょくとう / Kyokuto Co.,Ltd. / `2300.T`

#### 列表页股票格
- 有中文名：`nameZh`（粗体主行）+ `name`（日文小字）+ `symbol`（灰色）
- 无中文名：`name`（原样）+ `symbol`

#### 搜索升级（三端同步）
- 列表页搜索：同时匹配 `symbol` / `nameZh` / `name`（含 `.T` 去除后数字搜索）
- `/api/stocks` 搜索：增加 `nameZh` + `nameEn`（不区分大小写）到 OR 条件
- 搜索框提示文字更新：`搜索：代码（7203）、中文名（丰田）、日文名（トヨタ）`

#### `compute-scores.ts` 同步
- 每次重算 AI 评分时，同步将 `Stock.nameZh` 写入 `StockScore.nameZh`

### 生产部署步骤（额外）
```bash
# 生产 DB 迁移（SSH进入服务器）
psql $DATABASE_URL -c "ALTER TABLE \"Stock\" ADD COLUMN IF NOT EXISTS \"nameZh\" TEXT;"
psql $DATABASE_URL -c "ALTER TABLE \"StockScore\" ADD COLUMN IF NOT EXISTS \"nameZh\" TEXT;"

# 同步 prisma schema + regenerate
rsync prisma/schema.prisma root@8.209.247.68:/opt/tohoshou/prisma/
ssh root@8.209.247.68 "cd /opt/tohoshou && npx prisma generate"

# 填充中文名
rsync scripts/seed-chinese-names.ts root@8.209.247.68:/opt/tohoshou/scripts/
ssh root@8.209.247.68 "cd /opt/tohoshou && npx tsx scripts/seed-chinese-names.ts"
```

### 修改文件

| 文件 | 变更类型 |
|------|---------|
| `prisma/schema.prisma` | 新增 `nameZh` 字段（Stock + StockScore）|
| `prisma/migrations/20260620_add_name_zh/migration.sql` | 新增 |
| `scripts/seed-chinese-names.ts` | **新增**：168 只股票中文名种子 |
| `scripts/compute-scores.ts` | 同步 `nameZh` 到 StockScore |
| `app/api/indicators/route.ts` | 返回 `nameZh` |
| `app/api/stocks/route.ts` | 搜索 + 返回 `nameZh` |
| `app/stocks/[symbol]/page.tsx` | Header 重设计（4行层级）|
| `app/stocks/page.tsx` | 列表格：nameZh + name + symbol |
| `package.json` | 新增 `seed-zh-names` 命令 |

### 生产部署（2026-06-20 已完成）✅

| 步骤 | 结果 |
|------|------|
| DB ALTER TABLE Stock + StockScore | ✅ |
| npx prisma generate（生产） | ✅ |
| seed-chinese-names.ts（生产） | ✅ 167 只 |
| npm run build + rsync .next/ | ✅ |
| pm2 restart tohoshou-web | ✅ online |

**验收结果**
- `GET /api/stocks/2300.T` → `nameZh:"极东"` ✅
- 搜索「极东」→ 2300.T ✅ | 搜索「2300」→ 2300.T ✅
- 搜索「Kyokuto」→ 2300.T ✅ | 搜索「丰田」→ 7203.T 等 ✅
- 无 nameZh 的股票（nameZh=null）→ 日文名正常降级显示 ✅
- indicators TOP500 中 39 只展示中文名，128 只在 TOP500 外（评分问题，非 nameZh 问题）

---

## [5.6.0] - 2026-06-20 — LINE Webhook 上线 + 智能推送规划

### 完成

#### LINE Bot 全面上线（验证通过）

- **Webhook URL 已注册**：`https://aitohoshou.com/api/line/webhook`
  - LINE Developers Console 已填入并启用 Use webhook
  - GET 健康检查返回：`{"status":"LINE webhook active","version":"ai-chat"}`
- **LINE 推送验证通过**：主动推送消息已成功送达
- **用户消息自动回复验证通过**：向 Bot 发送股票代码自动返回 AI 分析

### 规划（下阶段 P1）

#### LINE 智能推送升级（待开发）

| 功能 | 说明 |
|------|------|
| 每日早报 | 08:00 JST，STRONG_BUY TOP5 卡片 |
| 午间快报 | 12:30 JST，涨跌幅 > 5% 异动股 |
| 收盘总结 | 15:45 JST，日涨跌榜 + AI 分析 |
| 异动提醒 | 价格突破 52w 高/低、量能异常 |
| 持仓提醒 | WatchList 重要新闻 / 业绩公告 |
| Flex Message | 富文本卡片格式（`lib/line-flex.ts`）|
| NotificationSetting | 用户订阅偏好表（DB 新增）|
| NotificationLog | 推送历史记录表（DB 新增）|

---

## [5.5.0] - 2026-06-20 — 新闻同步改异步任务（消除 504 超时）

### 改进

#### 新闻同步 `POST /api/sync/news` 改为 fire-and-forget 异步模式

- **根因**：Top 200 只 Kabutan 新闻抓取耗时约 160 秒（800ms 间隔 × 200 只），nginx 60s 超时导致 504
- **修复**：参照 jquants 异步方案重写 `app/api/sync/news/route.ts`
  - `POST`：防重检查 → 创建 SyncJob（`source="news"`, `total=200`）→ `void runNewsSync()` 后台执行 → 立即返回 `{ jobId, status:"RUNNING", total, processed:0 }`
  - 后台 `runNewsSync`：Yahoo(50只) → Kabutan(200只，每只更新进度) → TDnet
  - 进度跟踪：每处理完一只 Kabutan 股票，更新 `SyncJob.processed / successCount / failedCount`
  - 完成后写 SyncLog（与之前一致）
- **前端** `app/sync/page.tsx`：
  - 新增 `newsJobStatus` state + `newsPollTimer` ref
  - 新增 `startNewsPolling(jobId)` 函数（每3秒轮询 `/api/sync/jobs/:jobId`）
  - `runSync("news")` 检测 `data.jobId` → 触发轮询（与 jquants 对称）
  - 新闻卡片显示「异步任务」badge + `JobProgressPanel` 进度条
  - 轮询完成（SUCCESS/FAILED）后自动刷新全局 SyncStatus

### 修改文件

| 文件 | 变更类型 |
|------|---------|
| `app/api/sync/news/route.ts` | 重写：异步任务 + fire-and-forget |
| `app/sync/page.tsx` | 更新：news 轮询 + 进度条 |

---

## [5.4.0] - 2026-06-20 — Kabutan 新闻修复 + J-Quants 504 异步任务

### 修复

#### Kabutan 新闻爬虫（P0，两处 bug）

**Bug 1：无效 Date 导致 Prisma 批量静默失败**
- 现象：`upsert` 全部走 `.catch(() => null)`，DB 新闻条数一直为 0
- 根因：`parseKabutanDate` 对 `MM/DD HH:mm` 格式拼接 `new Date("2026-00-00T...")` → `NaN`，Prisma 在校验阶段抛 `Invalid value for argument 'publishedAt'`
- 修复：`lib/kabutan.ts` — 新增 `valid()` 包装：`const valid = (d: Date) => !isNaN(d.getTime()) ? d : null`，两条正则分支均经过 `valid()` 后才返回

**Bug 2：CSS 选择器指向错误元素**
- 现象：所有 1542 篇文章 `relatedSymbolConfidence=25`，无一被分类为材料（50）
- 根因：代码用 `td[class*='newslist_ctg']`，但实际 Kabutan HTML 结构为 `<td><div class="newslist_ctg newsctg_kaiji_b">...</div></td>`，class 在 `<div>` 上而非 `<td>`
- 修复：改为 `row.querySelector(".newslist_ctg")`

**修复结果（生产验证）**
- 新闻总条数：0 → **1,590 条**
- confidence=50 材料新闻：0 → **387 条**
- 修复后执行 `npm run compute-scores` → 3,714 只股票 AI 评分全量更新

#### J-Quants 同步 504 Gateway Time-out（P0）

- 现象：`/sync` 页面点击 J-Quants 立即同步返回 HTTP 504（nginx 60s 超时），Top200 近90天数据耗时 30+ 分钟
- 修复：**异步任务模式（fire-and-forget）**

**新增 SyncJob 数据表**（`prisma/schema.prisma` + `prisma/migrations/20260620_add_sync_job/migration.sql`）

**重写** `app/api/sync/jquants/route.ts`
- `POST`：防重检查 → 创建 SyncJob → `void runJQuantsSync()` 后台执行 → 立即返回 `{ success:true, jobId, status:"RUNNING", total, processed:0 }`
- `runJQuantsSync`：Top200，批次10只，300ms 间隔，每批更新进度，单只失败不中断，完成写 SyncLog

**新增** `app/api/sync/jobs/[jobId]/route.ts`
- `GET`：返回 `{ jobId, status, total, processed, successCount, failedCount, pct, startedAt, finishedAt }`

**更新** `app/sync/page.tsx`
- 新增 `jobStatus` state + `pollTimer` ref + `startPolling(jobId)` 函数（每3秒轮询）
- 新增 `JobProgressPanel` 组件：进度条 + pct% + processed/total

**生产验证（2026-06-20）**
- POST 立即返回 jobId（无504）✅
- 进度条每3秒更新 ✅
- 后台同步：60/200 已处理，success=60，failed=0 ✅
- Financial 表：13,619 → 35,986 条（同步中持续增加）✅

### 修改文件

| 文件 | 变更类型 |
|------|---------|
| `lib/kabutan.ts` | 修复：parseKabutanDate NaN + CSS 选择器 |
| `prisma/schema.prisma` | 新增：SyncJob model |
| `prisma/migrations/20260620_add_sync_job/migration.sql` | 新增 |
| `app/api/sync/jquants/route.ts` | 重写：异步任务 + fire-and-forget |
| `app/api/sync/jobs/[jobId]/route.ts` | 新增：任务进度查询 |
| `app/sync/page.tsx` | 更新：轮询 + JobProgressPanel |

---

## [5.3.0] - 2026-06-20 — 数据源同步修复（Yahoo Finance + J-Quants）

### 修复

#### Yahoo Finance Japan（P0 修复）
- **根因**：`yahoo-finance2` v3 改为实例模式，调用 `YahooFinance.quote()` 静态方法会抛 "Call `const yahooFinance = new YahooFinance()` first"
- **新增** `lib/yahooFinance.ts` — 统一单例封装：`export const yahooFinance = new YahooFinance()`
- **更新** `lib/yahoo.ts` — 移除旧 `require("yahoo-finance2").default`，改为 `import { yahooFinance } from "@/lib/yahooFinance"`
- 修复 `fetchQuote` 返回类型：v3 返回联合类型，改用 `any` + `num()` 辅助函数安全提取数值字段
- 修复 `fetchNews` 中 `providerPublishTime` 类型：v3 返回 `Date`（旧 v2 为 `number`），兼容两种类型

#### J-Quants（P0 修复）
- **重写** `lib/jquants.ts` — 实现 V1 email/password 认证流程
- **新增** `configStatus()` 函数：返回当前认证方式
- **新增** token 内存缓存（23h TTL），自动续期
- **向后兼容** `JQUANTS_API_KEY`：V2 `x-api-key` 模式

### 修改文件

| 文件 | 变更类型 |
|------|---------|
| `lib/yahooFinance.ts` | **新增**：yahoo-finance2 单例 |
| `lib/yahoo.ts` | 修复：import + 类型 + fetchNews |
| `lib/jquants.ts` | 重写：V1 auth + content-type 防护 + token 缓存 |
| `app/api/sync/jquants/route.ts` | 更新：错误提示 + configStatus |

---

## [5.2.0] - 2026-06-20 — K 线图升级 + 推荐阈值优化 + 生产全量重算

### 新增

#### K 线图（PriceChart.tsx 完全重写）
- **蜡烛图（Candlestick）**：含 Open/High/Low/Close，红涨蓝跌（日本配色）
- **MA 均线**：MA5（橙）/ MA20（蓝）/ MA60（紫）同图显示
- **成交量柱**：图表底部30%区域
- **鼠标 Tooltip**：悬停显示 OHLCV + MA5/MA20，十字线跟随

#### API 增强
- `app/api/stocks/[symbol]/indicators/route.ts` — series 数据由 `{date,close,volume}` 升级为 `{date,open,high,low,close,volume}`

### 变更
- `lib/ai-score.ts` — 推荐阈值：`STRONG_BUY≥90 | BUY≥70 | WATCH≥60 | HOLD≥45 | AVOID<45`
- 调整后 TOP50 中 BUY 推荐从 0 只 → **50 只**

---

## [5.1.0] - 2026-06-19 — 生产无限加载修复 + 全量数据同步完成

### 修复（紧急 P0）
- `app/api/indicators/route.ts` — 从 3716 只股票并发 `Promise.all` 改为单次读 `StockScore` TOP500
- `app/api/ai-scores/route.ts` — 同上修复

### 全量数据同步
- DailyPrice：7,912,242 条（TSE 全3716只，近90天）
- Financial：13,619 条
- StockScore：3,714 只全量评分

---

## [5.0.0] - 2026-06-19 — 初始版本

- Next.js 16 + Prisma 7 + PostgreSQL
- J-Quants / Yahoo Finance / Kabutan / TDnet 数据源
- AI 评分引擎（5维度）
- LINE Bot 集成
- 生产部署：aitohoshou.com（阿里云 8.209.247.68）
