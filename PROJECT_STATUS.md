# PROJECT_STATUS.md — TOHOSHOU AI 日本股票AI分析系统

> **最后更新：** 2026-06-20
> **版本：** v7.5.0（动态权重评分 + GPT Phase 1 — 稳定基线）
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

## 二、生产服务器状态（2026-06-20）

### PM2 进程
```
id:0  tohoshou-web   online  port 3000
id:1  tohoshou-cron  online  cron jobs（含周五16:30+周一07:15 JPX自动sync）
```

### ⚠️ rsync 必须修复 .env（每次 rsync 后执行）
```bash
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 "
  sed -i 's|postgresql://postgres:123456@localhost:15432/llm_stock|postgresql://tohoshou:123456@127.0.0.1:5432/llm_stock|g' /opt/tohoshou/.env
  sed -i 's|NEXT_PUBLIC_APP_URL=http://localhost:3000|NEXT_PUBLIC_APP_URL=https://aitohoshou.com|g' /opt/tohoshou/.env
"
```

### 快速操作
```bash
# 标准部署（改了前端/API）
npm run build
sshpass -p 'Wen565656' rsync -avz --exclude node_modules .next/ root@8.209.247.68:/opt/tohoshou/.next/
# ↑ 上面必须接着修复 .env（见上方）
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 "pm2 restart tohoshou-web"

# 改了 prisma schema → 额外步骤
npx prisma generate
sshpass -p 'Wen565656' scp prisma/schema.prisma root@8.209.247.68:/opt/tohoshou/prisma/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx prisma db push --accept-data-loss && npx prisma generate && pm2 restart tohoshou-web"

# 重算 AI 评分
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx scripts/compute-scores.ts"

# AI 评分必须先抓全球市场
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx scripts/fetch-global-market.ts"

# 手动触发 J-Quants 机构资金同步
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx scripts/fetch-jquants-investor-types.ts"

# 健康检查
curl -s https://aitohoshou.com/api/sync | python3 -c "
import json,sys; d=json.load(sys.stdin); da=d.get('dataAuthority',{})
print('Flow:', da.get('institutionalFlow',{}).get('source'), da.get('institutionalFlow',{}).get('date'))
print('ScoreDist:', da.get('scoreSourceDist'))
"
```

---

## 三、数据库现状（2026-06-20 生产实测）

| 表 | 条目数 | 状态 |
|----|--------|------|
| Stock | **3,716** | ✅ TSE 全量（中文名 100% 覆盖）|
| DailyPrice | **7,912,513** | ✅ 最新日期 2026-06-19 |
| Financial | **35,986** | ✅ J-Quants 财报 |
| StockScore | **3,714** | ✅ V3.1，全部 scoreSource=REAL |
| News | **1,590** | ✅ Kabutan（387条材料分类）|
| GlobalMarket | **1** | ✅ 2026-06-20，score=7，VIX=16.78，source=yahoo |
| InstitutionalFlow | **216** | ✅ jquants_investor_types，最新 2026-06-12，**无 synthetic** |
| AITheme | **38** | ✅ 6分类科技股主题（新增）|
| SyncJob | 1+ | 异步任务记录 |
| LineUser | 1 | owner: U3223b03bb5879a9dabf2ce27b0f09524 |

---

## 四、TOHOSHOU AI 评分体系 V4（当前，v7.5.0）

### 100分5维度（固定维度 → 动态权重）

| 维度 | 字段 | 满分 | 数据源 | 状态 |
|------|------|------|--------|------|
| 技術面 | technicalScore | 30 | J-Quants 价格 | ✅ 实时 |
| 基本面 | fundamentalScore | 25 | J-Quants 财务 | ✅ 实时 |
| 資金面 | moneyFlowScore | 20 | **J-Quants investor-types API** | ✅ REAL |
| 新闻情绪 | newsSentimentScore | 15 | Kabutan DB | ✅ 实时 |
| 全球趋势 | globalTrendScore | 10 | Yahoo Finance NASDAQ/VIX/日経 | ✅ 实时 |

### v7.5 新增字段（StockScore）
| 字段 | 说明 |
|------|------|
| `rawScore` | = totalScore（向后兼容） |
| `adaptiveScore` | 按 stockStyle 动态权重加权后的归一化分（0-100） |
| `stockStyle` | VALUE_DEFENSIVE / GROWTH_MOMENTUM / QUALITY_COMPOUNDER / SPECULATIVE_MOMENTUM / CYCLICAL_EXPORTER / DOMESTIC_DEFENSIVE |
| `highRiskFlag` | SPECULATIVE 且近期大涨时 true |
| `fxSensitivity` | EXPORT_POSITIVE / IMPORT_SENSITIVE / FX_NEUTRAL / DOMESTIC_NEUTRAL |
| `catalystScore` | TDnet 公告类别得分（baseline 5，增发−3，业绩修正+3 等）|

### 评级阈值（勿改）
```
STRONG_BUY ≥ 90
BUY        ≥ 80
HOLD       ≥ 65
WATCH      ≥ 50
AVOID      < 50
```
⚠️ recommendation 仍按 totalScore（rawScore）判定，不用 adaptiveScore。禁止降低阈值制造 BUY。

### 评分分布（2026-06-20，3714只）
| 评级 | 数量 |
|------|------|
| STRONG_BUY | 0 |
| BUY | 0 |
| HOLD | ~206 |
| WATCH | ~1680 |
| AVOID | ~1828 |
| rawScore 最高 | 74（291A.T、9552.T）|
| adaptiveScore 最高 | 77（291A.T — QUALITY_COMPOUNDER 加权提升）|

### 数据权威分布（V4）
```
REAL    3714 / 100%   ← 两个维度均为真实数据
PARTIAL    0
FALLBACK   0
```

### InstitutionalFlow 数据权威体系
```
source 权威：jquants_investor_types(1) = jpx(1) > jpx_file(2) > jpx_manual(3) > synthetic(99)
当前生产：216行 jquants_investor_types，TSEPrime市场，最新2026-06-12
外国人净=-4.9億円，投信净=+0.9億円
compute-scores.ts 优先选 REAL_FLOW_SOURCES，market="TSEPrime"
REAL_MONEY_SOURCES（ai-score.ts 两处都要有）= ["jquants_investor_types","jpx","jpx_file","jpx_manual"]
```

### Cron 自动调度（Asia/Tokyo）
```
周五 16:30  → fetch-jquants-investor-types.ts（正式）
周一 07:15  → fetch-jquants-investor-types.ts（备份，防周五失败）
05:30 每日  → fetch-global-market.ts
06:00 每日  → sync-all-prices.ts
07:00/12/18/22 → Kabutan 新闻
07:30 每日  → compute-scores.ts（AI评分）
08:00 工作日 → send-morning-brief.ts
08:30 每日  → send-daily-line.ts
12:30 工作日 → send-midday-flash.ts
15:45 工作日 → send-closing-summary.ts
16:35 工作日 → send-line-risk-alert.ts
22:00 每日  → sync-stock-meta.ts
```

---

## 五、已完成功能

### v7.5.0 新功能（稳定基线，2026-06-20）
- [x] **动态权重评分 adaptiveScore** — `lib/ai-score.ts` 新增 `classifyStockStyle()` / `computeAdaptiveScore()` / `computeFxSensitivity()` / `computeCatalystScore()`；6 种 StockStyle 对应不同维度权重
- [x] **StockScore 新字段** — `rawScore / adaptiveScore / stockStyle / highRiskFlag / fxSensitivity / catalystScore` 全量写入 3714 只股票
- [x] **`PortfolioDiagnosis` 数据模型** — schema 已加，待后续持仓诊断功能使用
- [x] **`GET /api/stocks/[symbol]/alternatives`** — 同风格替代股 API，优先同行业，最多5只
- [x] **GPT Phase 1：`POST /api/chat`** — 4 意图（today_picks/stock_analysis/theme_best/theme_outlook）；GPT 仅整理回复，所有数据来自 DB；无 OPENAI_API_KEY 时返回 503
- [x] **`lib/openai.ts`** — GPT-4o-mini 客户端，显式 pin `https://api.openai.com/v1`
- [x] **`lib/llm/client.ts` + `lib/llm/router.ts`** — 统一 LLM 工厂 + Intent Router
- [x] **`lib/ai-agent.ts` baseURL 修复** — OpenAI key 存在时强制 OpenAI URL，不被 `OPENAI_BASE_URL=deepseek` 劫持（LINE 自然语言回复修复）
- [x] **localhost 全站清零** — grep 0 处实际 URL（仅注释/检测器引用）
- [x] **build + pm2 验证通过** — `npm run build` TypeScript 无错误，49条路由，生产 pm2 均 online

### V3.1 新功能（本次会话）
- [x] **J-Quants investor-types API** — `scripts/fetch-jquants-investor-types.ts`，获取 TSEPrime/TSEStandard/TSEGrowth 9种投资者类型周度净买卖，source=jquants_investor_types
- [x] **数据权威体系** — `moneyFlowSource`/`globalTrendSource`/`scoreSource` 字段写入 StockScore
- [x] **InstitutionalFlow 权威优先查询** — compute-scores.ts 优先选 REAL_FLOW_SOURCES，不被 synthetic 覆盖
- [x] **Synthetic 数据清零** — 本地+生产 DB 已删除全部 synthetic 行，永不再写入
- [x] **数据同步 V3.1 页面** — `/sync` 显示 GlobalMarket/InstitutionalFlow/ScoreSource 三卡权威状态
- [x] **isReal 检查完整** — `sync/page.tsx` isReal 包含 jquants_investor_types，显示 REAL 而非 SYNTHETIC
- [x] **sync/route.ts 加固** — GET 优先查真实 InstitutionalFlow，避免 synthetic 日期抢占最新位

### LINE Flex Message 智能推送（v7.3.0）
- [x] **`lib/stock-display-name.ts`** — `getStockDisplayName()` 统一名称优先级：nameZh > name > nameEn > symbol
- [x] **`lib/line-flex.ts`** — 7个 Flex 构建器（朝報/午間/大引/アラート/リスク/個股/テスト）
- [x] **`lib/line.ts`** — 完整 FlexMessage 类型 + `flexMsg()` builder
- [x] **4个推送脚本全面升级** — morning-brief/midday-flash/closing-summary/risk-alert → Flex Message
- [x] **`scripts/check-alerts.ts`** — 价格≥5%/出来高≥2x/HIGH新闻异动检测，去重推送
- [x] **`app/notifications/page.tsx`** — 通知管理页（测试按钮/设置/日志）
- [x] **6个通知 API 路由** — settings/logs/send-morning-report/send-close-report/check-alerts/test-flex
- [x] **`NotificationSetting` DB 模型** — per-user 通知开关 + 阈值配置
- [x] **`NotificationLog` 升级** — symbols String[], errorMessage, 完整 type 枚举
- [x] **Cron 新增** — 工作日 09:00-16:00 每30分钟 check-alerts.ts
- [x] **Sidebar** — 新增"🔔 通知管理"导航
- [x] **全部 HTTP 200 验证** — /notifications, /api/notifications/settings, /api/notifications/logs

### AI 科技股主题（v7.2.0）
- [x] **AITheme 数据模型** — `prisma/schema.prisma` 新增 `AITheme`，`ai_themes` 表 + 索引
- [x] **38只科技股种子数据** — `scripts/seed-ai-themes.ts`，6分类完整覆盖，seed 时全量删重建避免残留
- [x] **`/api/ai-theme`** — 返回股票列表（LEFT JOIN StockScore）+ 分类汇总 + scored/unscored 标记
- [x] **`/ai-theme` 页面** — 日本科技股・AI产业链，6分类Tab+排序+5维度评分条+待评分显示
- [x] **Sidebar 更新** — "⚡AI产业链" 导航项

### 科技股 6 分类
| 分类 | theme key | 数量 | 代表 |
|------|-----------|------|------|
| 半导体设备 | SEMICONDUCTOR | 6 | 8035,6857,6920,7735,6146,3436 |
| 电子・传感器・精密 | ELECTRONICS | 7 | 6758,6861,6981,6762,6963,6965,6806 |
| 软件・AI・云 | SOFTWARE_AI | 9 | 3993,5574,4382,5132,9613★,9449,9719★,4684,4307 |
| 工业自动化・机器人 | INDUSTRIAL_AUTO | 5 | 6954,6506,6273,6645,6383 |
| 通信・数据中心 | TELECOM_DC | 5 | 9984,9432,9433,6701,6702 |
| 科技服务・互联网 | TECH_SERVICES | 6 | 6098,4751,4385,3994,4443,4478 |

★ 9613.T（NTT Data）和 9719.T（SCSK）不在 Stock / StockScore 表，页面显示"评分待生成"，名字从 API 内置 `SYMBOL_NAME_FALLBACK` 取得。

### 已评分科技股 TOP10（2026-06-20）
| 排名 | 代码 | 中文名 | 分类 | 分数 |
|------|------|--------|------|------|
| 1 | 6806.T | 广濑电机 | ELECTRONICS | 71 |
| 2 | 6146.T | 迪斯科 | SEMICONDUCTOR | 70 |
| 3 | 6981.T | 村田制作所 | ELECTRONICS | 69 |
| 4 | 6273.T | SMC | INDUSTRIAL_AUTO | 69 |
| 5 | 8035.T | 东京电子 | SEMICONDUCTOR | 68 |

### 数据同步
- [x] Yahoo Finance Japan（股价实时报价）
- [x] J-Quants（日线价格 + 财报 + investor-types 机构流向）
- [x] Kabutan 新闻（情绪分类，双 bug 已修复）
- [x] TDnet 适时披露（爬虫模式）
- [x] GlobalMarket（Yahoo Finance，每日 05:30 JST 自动）
- [x] 异步任务模式（SyncJob 表，解决 504 超时）

### 前端页面（全部 HTTP 200）
- [x] `/` `/stocks` `/indicators` `/ai-picks` `/screener` `/sectors`
- [x] `/stocks/[symbol]` 个股详情（SVG K线图 + OHLCV + MA）
- [x] `/news` `/sync`（V3.1 数据权威状态面板）`/watchlist` `/portfolio`
- [x] **`/ai-theme`**（新增）日本科技股・AI产业链主题筛选

### LINE Bot
- [x] Webhook：`https://aitohoshou.com/api/line/webhook`
- [x] 每日早报 08:00 / 午间 12:30 / 收盘 15:45 / 风险预警 16:35 JST

---

## 六、数据库 Schema（完整模型）

```
Stock           — 3716只TSE（symbol unique，nameZh 100%覆盖）
Financial       — 财务（stockId+fiscalYear+quarter unique）
DailyPrice      — 日线OHLCV（symbol+date unique，7.9M条）
Dividend        — 配当历史
Disclosure      — TDnet适时披露
News            — Kabutan（url unique，relatedSymbolConfidence 0-100）
AIAnalysis      — 深度AI分析（旧lib/scoring.ts，与StockScore分离）
Portfolio       — 持仓
SyncLog         — 同步日志
SyncJob         — 异步任务（id cuid，PENDING|RUNNING|SUCCESS|FAILED）

StockScore      — AI预计算评分（symbol pk）★主读表
  technicalScore     Int? (0-30)
  fundamentalScore   Int? (0-25)
  moneyFlowScore     Int? (0-20)
  newsSentimentScore Int? (0-15)
  globalTrendScore   Int? (0-10)
  riskScore          Int? (legacy = moneyFlowScore)
  totalScore         Int? (0-100)
  recommendation     String? (STRONG_BUY|BUY|HOLD|WATCH|AVOID)
  moneyFlowSource    String? ← V3.1新增
  globalTrendSource  String? ← V3.1新增
  scoreSource        String? ← V3.1新增 (REAL|PARTIAL|FALLBACK)
  rawScore           Float?  ← v7.5新增 (= totalScore, 向后兼容)
  adaptiveScore      Float?  ← v7.5新增 (动态权重归一化分)
  stockStyle         String? ← v7.5新增 (6种风格分类)
  highRiskFlag       Boolean ← v7.5新增 @default(false)
  fxSensitivity      String? ← v7.5新增 (EXPORT_POSITIVE等4种)
  catalystScore      Float?  ← v7.5新增 (TDnet公告评分)
  [indexes: totalScore DESC, computedAt DESC, market, recommendation]

PortfolioDiagnosis — 持仓诊断（v7.5新增，待后续功能）
  id/symbol/portfolioId/riskLevel/diagnosis/suggestedAction/triggerReason/createdAt
  [indexes: symbol, createdAt DESC]

GlobalMarket    — 全球市场快照（date @unique）
  date/nasdaq/nasdaqChange/sp500/vix/nikkei/nikkeiChange/topix/topixChange/usdjpy
  score Int? (0-10)  source String (yahoo|manual)

InstitutionalFlow — JPX机构资金流（周度）
  date DateTime @db.Date
  investorType String  (foreigners|trust|corp|individual|dealer|trust_bank|insurance|bank|other)
  market String        (TSEPrime|TSEStandard|TSEGrowth|ALL)
  buyAmount/sellAmount/netAmount Float?  (億円)
  source String        (jquants_investor_types|jpx|jpx_file|jpx_manual|synthetic)
  @@unique([date, investorType, market]) named: date_investorType_market

AITheme         — 科技股主题分类（V3.1新增）★ 38只
  symbol String @unique
  theme  String  (SEMICONDUCTOR|ELECTRONICS|SOFTWARE_AI|INDUSTRIAL_AUTO|TELECOM_DC|TECH_SERVICES)
  @@map("ai_themes")  @@index([theme])

NotificationLog / TelegramUser / LineGroup / LineUser / WatchList / SyncJob
```

完整 Schema 见 `prisma/schema.prisma`

---

## 七、API 路由一览

| 端点 | 说明 |
|------|------|
| `GET /api/sync` | 同步状态 + V3.1 dataAuthority（GlobalMarket/InstitutionalFlow/ScoreDist）|
| `POST /api/sync/jquants` | J-Quants 同步（立即返回 jobId）|
| `GET /api/sync/jobs/[jobId]` | 异步任务进度 |
| `POST /api/sync/news` | 新闻同步（异步）|
| `POST /api/sync/yahoo` | Yahoo Finance 同步 |
| `POST /api/sync/tdnet` | TDnet 同步 |
| `GET /api/ai-scores` | AI推荐列表（TOP50）含 v7.5 所有字段 |
| `GET /api/ai-theme` | 科技股主题列表（38只，scored/unscored 均返回）|
| `GET /api/indicators` | 技术指标列表（StockScore TOP500）|
| `GET /api/screener` | 全市场筛选 |
| `GET /api/stocks/[symbol]/indicators` | 个股技术指标 + OHLCV 序列 |
| `GET /api/stocks/[symbol]/alternatives` | 同风格替代股（最多5只）★v7.5新增 |
| `GET /api/stocks/[symbol]/financials` | 个股财报 |
| `POST /api/chat` | GPT Phase 1：自然语言 4 意图，数据来自 DB ★v7.5新增 |
| `POST /api/line/webhook` | LINE Bot Webhook |

---

## 八、已安装依赖（关键包）

| 包 | 版本 | 重要注意 |
|----|------|---------|
| `next` | 16.2.9 | App Router；Route Params **必须** `await params` |
| `@prisma/client` | ^7.8.0 | **必须用 PrismaPg adapter**，不是默认 datasource |
| `@prisma/adapter-pg` | ^7.8.0 | 与 prisma/client 同版本 |
| `yahoo-finance2` | ^3.15.3 | **v3 必须实例化** `new YahooFinance()`；VIX 用 `yf.quote()` 而非 `historical()` |
| `node-html-parser` | ^7.1.0 | Kabutan 爬虫 |
| `openai` | ^6.44.0 | DeepSeek API（兼容 OpenAI 接口）|
| `node-cron` | ^4.4.1 | Cron 调度 |
| `dayjs` | ^1.11.21 | 日期处理 |
| `axios` | ^1.18.0 | HTTP client |
| `zod` | ^4.4.3 | 数据验证 |
| `xlsx` | ^0.18.5 | XLSX 文件解析（JPX CSV 导入用）|
| `tailwindcss` | ^4 | `@import "tailwindcss"`，**无 tailwind.config.js** |

### npm scripts 完整列表
```bash
npm run compute-scores              # 全量重算 AI 评分（~25s，3714只）
npm run fetch-global-market         # 抓取 Yahoo Finance → GlobalMarket DB
npm run sync:institutional-flow     # 抓取 J-Quants investor-types → InstitutionalFlow DB
npm run sync:institutional-flow:dry # 预览（不写DB）
npm run sync-meta                   # 同步股票元数据
npm run sync-prices-recent          # 同步最近价格
npm run cron                        # 启动 cron 调度器
npm run seed:ai-themes              # 重置科技股主题分类数据（38只）
npm run send-daily-line             # LINE 每日推送
npm run line:morning-brief          # LINE 早报
npm run line:midday-flash           # LINE 午间快报
npm run line:closing-summary        # LINE 收盘总结
npm run line:risk-alert             # LINE 风险预警
```

---

## 九、关键代码知识

### Prisma 初始化（必须用 adapter）
```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
```

### 生产脚本规范（Node 22 不支持 top-level await CJS）
```typescript
// ✅ 必须用 async function main() 包裹
async function main() { ... }
main().catch((e) => { console.error(e); process.exit(1); });
```

### Schema 变更流程
```bash
# 本地
npx prisma db push --accept-data-loss   # 同步到本地Docker DB
npx prisma generate                      # 重新生成客户端
npm run build                            # 必须重新 build

# 生产
sshpass -p 'Wen565656' scp prisma/schema.prisma root@8.209.247.68:/opt/tohoshou/prisma/
sshpass -p 'Wen565656' ssh root@8.209.247.68 "cd /opt/tohoshou && npx prisma db push --accept-data-loss && npx prisma generate"
```

### REAL_MONEY_SOURCES（ai-score.ts 两处都要维护）
```typescript
// lib/ai-score.ts line ~96（computeScoreSource）和 line ~375（calcAiScore）两处均需包含：
const REAL_MONEY_SOURCES = ["jquants_investor_types", "jpx", "jpx_file", "jpx_manual"];
```

### compute-scores.ts 数据优先查询规范
```typescript
// 先找 REAL 数据，无 REAL 才用 synthetic
const latestRealFlow = await prisma.institutionalFlow.findFirst({
  where: { source: { in: REAL_FLOW_SOURCES } },
  orderBy: { date: "desc" },
});
const latestFlowDate = latestRealFlow ?? await prisma.institutionalFlow.findFirst({
  orderBy: { date: "desc" },
});
```

### AITheme API 关键设计
- `GET /api/ai-theme`：先查 StockScore（scored=true），再查 Stock 表（unscored），两者都没有则用 SYMBOL_NAME_FALLBACK
- 返回字段：`{ stocks[], themeSummary[], totalCount, scoredCount, updatedAt }`
- stocks 排序：scored 在前（按 totalScore DESC），unscored 在后
- 9613.T / 9719.T 不在 Stock/StockScore 表，从 SYMBOL_NAME_FALLBACK 取名字显示"评分待生成"

### rsync 部署注意
```
⚠️ rsync 会覆盖生产 .env！每次 rsync 后必须通过 ssh sed 修复 .env（见"二、快速操作"）
```

---

## 十、已知问题

### P2 — 9613.T / 9719.T 无评分数据
- **NTT Data（9613.T）和 SCSK（9719.T）** 不在 Stock 表，因此不会被 J-Quants 同步到 DailyPrice，也不会进入 StockScore
- 当前处理：`/api/ai-theme` 通过 `SYMBOL_NAME_FALLBACK` 显示名字，页面显示"评分待生成"
- 如果需要修复：手动插入 Stock 表记录，然后触发 J-Quants 同步 + compute-scores

### P2 — BUY/STRONG_BUY 阈值过高
- 当前最高分 74（全市场），科技股最高分 71（广濑电机）
- BUY 阈值 80，STRONG_BUY 阈值 90，导致 BUY/STRONG_BUY 均为 0
- 考虑：调整阈值（评分本身是否有天花板需分析）

### P3 — TDnet 真实数据
- `lib/tdnet.ts` 大多数时候 fallback 到 mock 数据

### P3 — LINE Flex Message
- 当前推送为纯文本，未升级为富文本卡片格式

---

## <a id="next-session"></a>NEXT SESSION — 下次启动继续位置

### 当前系统状态（2026-06-20，v7.5.0 稳定基线）

```
✅ v7.5.0 动态权重评分上线
   - adaptiveScore / stockStyle / fxSensitivity / catalystScore 全量写入（3714只）
   - 6种 StockStyle 风格权重，QUALITY_COMPOUNDER 最高 adaptive=77
   - /api/stocks/[symbol]/alternatives 上线（同风格替代股）

✅ GPT Phase 1 上线
   - POST /api/chat：4意图，全部数据来自 DB，无幻觉
   - lib/openai.ts + lib/ai-agent.ts：显式 pin api.openai.com，防 DeepSeek 劫持
   - LINE 自然语言路由修复（ai-agent.ts baseURL bug 已修）

✅ localhost 全站清零
   - grep 0处实际 URL，所有链接统一 https://aitohoshou.com

✅ LINE Flex Message 全面上线（v7.3.0/v7.4.0）
   - 所有推送 Flex Message 富文本卡片
   - LINE V2 对话入口：7意图+Flex Card 回复
   - 通知管理页 /notifications

✅ TOHOSHOU AI V4（原V3.1）— 5维度全部真实数据
   - REAL 3714/3714（100%），含 jquants_investor_types

✅ 生产 build + pm2 验证
   - npm run build 通过（49条路由，TypeScript无错误）
   - tohoshou-web + tohoshou-cron 均 online
```

### 未完成（按优先级）

#### P2 — 评分阈值调整（2小时）
当前最高 rawScore=74，BUY 阈值 80，导致 0 只 BUY。
`adaptiveScore` 最高已达 77（动态权重），但 recommendation 仍按 rawScore 判定。
方案 A：调低阈值 `STRONG_BUY≥85, BUY≥75`，改 `lib/ai-score.ts` recommendation 逻辑。
方案 B：让 recommendation 改用 adaptiveScore 判定（需评估影响面）。

#### P2 — 9613.T / 9719.T 评分待生成
NTT Data / SCSK 不在 Stock 表，需手动插入后触发同步：
```sql
INSERT INTO "Stock" ("symbol","name","nameZh","market","createdAt","updatedAt")
VALUES ('9613.T','ＮＴＴデータグループ','NTT Data集团','プライム',NOW(),NOW()),
       ('9719.T','ＳＣＳＫホールディングス','SCSK控股','プライム',NOW(),NOW())
ON CONFLICT ("symbol") DO NOTHING;
```

#### P2 — GPT Phase 2（Web Chat UI）
当前 `/api/chat` 仅 API，无前端界面。
可在 `/ai-picks` 或新页面 `/chat` 增加对话框 UI，调用现有 `/api/chat`。

#### P3 — PortfolioDiagnosis 功能
Schema 已建（v7.5.0），待实现：持仓诊断逻辑 + `/api/portfolio/[id]/diagnose` 端点 + 前端展示。

#### P3 — TDnet 真实数据
`lib/tdnet.ts` 主要返回 mock。改进方向：对接 TDnet RSS 或 J-Quants 財務情報 API。
`catalystScore` 已有 TDnet category 处理逻辑，真实数据接入后自动生效。

#### P3 — 管理员支付路径同步 billItem（LINE quota 不相关，此项为 yahoo-auction 项目）
此项属于另一个项目，此处不列出。

### 快速健康检查
```bash
# 生产数据权威状态
curl -s "https://aitohoshou.com/api/sync" | python3 -c "
import json,sys; d=json.load(sys.stdin); da=d.get('dataAuthority',{})
fl = da.get('institutionalFlow',{}); ss = da.get('scoreSourceDist',{})
print('Flow source:', fl.get('source'), '| date:', fl.get('date','')[:10], '| age:', fl.get('ageDays'),'days')
print('ScoreSource:', ss)
"

# GPT Chat 快速验证
curl -s -X POST "https://aitohoshou.com/api/chat" \
  -H "Content-Type: application/json" -d '{"message":"分析7203"}' | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('intent:', d['intent'], '| len:', len(d['reply']))"

# alternatives API
curl -s "https://aitohoshou.com/api/stocks/7203.T/alternatives" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('style:', d['stockStyle'], '| alts:', len(d['alternatives']))"

# adaptiveScore TOP5
curl -s "https://aitohoshou.com/api/ai-scores?sort=adaptive&limit=5" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); [print(s['symbol'], 'raw=', s.get('rawScore'), 'adaptive=', s.get('adaptiveScore'), 'style=', s.get('stockStyle')) for s in d.get('scores', d)[:5]]"

# PM2 状态
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 'pm2 list'

# localhost 清零验证
grep -rn "localhost\|127\.0\.0\.1" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next . | grep -v "//.*localhost" | grep -v "#.*localhost"
```
