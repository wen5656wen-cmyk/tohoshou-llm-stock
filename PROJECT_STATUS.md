# PROJECT_STATUS.md — TOHOSHOU AI 日本股票AI分析系统

> **最后更新：** 2026-06-21
> **版本：** v8.1（STRONG_BUY 阈值放宽 + CHIP_DESIGN 6只 + 供应链矢印修复，已部署生产）
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
| PM2 进程 | `tohoshou-web`（port 3000）+ `tohoshou-cron` |

---

## 二、部署命令（每次必须完整执行）

### 标准部署（前端/API 改动）
```bash
npm run build
sshpass -p 'Wen565656' rsync -avz --exclude node_modules .next/ root@8.209.247.68:/opt/tohoshou/.next/
# rsync 后验证 .env 未被覆盖：
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 "grep 'DATABASE_URL\|APP_URL' /opt/tohoshou/.env"
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 "pm2 restart tohoshou-web --update-env"
```

### Schema 变更（改了 prisma/schema.prisma）
```bash
npx prisma generate                  # 本地重新生成 Prisma client
npm run build
sshpass -p 'Wen565656' scp prisma/schema.prisma root@8.209.247.68:/opt/tohoshou/prisma/
sshpass -p 'Wen565656' rsync -avz --exclude node_modules .next/ root@8.209.247.68:/opt/tohoshou/.next/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx prisma db push --accept-data-loss && npx prisma generate && pm2 restart tohoshou-web --update-env"
```

### Script/Lib 变更（改了 scripts/ 或 lib/）
```bash
sshpass -p 'Wen565656' rsync -avz scripts/ root@8.209.247.68:/opt/tohoshou/scripts/
sshpass -p 'Wen565656' rsync -avz lib/ root@8.209.247.68:/opt/tohoshou/lib/
# 然后按需执行脚本或 pm2 restart
```

### ⚠️ .env 规则
- `rsync .next/` **不会** 覆盖 .env（只有 `rsync ./` 整个目录才会）
- 每次部署后确认：`DATABASE_URL="postgresql://tohoshou:123456@127.0.0.1:5432/llm_stock"`
- 确认：`APP_URL=https://aitohoshou.com`

### 重算 AI 评分
```bash
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx scripts/compute-scores.ts 2>&1 | tail -20"
```

### 快速健康检查
```bash
# 系统状态（11源是否全 REAL）
curl -s "https://aitohoshou.com/api/sync/status" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('realCount:', d['summary']['realCount'], '/', len(d['sources']))
for s in d['sources']: print(f'  {s[\"id\"]}: {s[\"status\"]}')
"

# AI产业链地图
curl -s https://aitohoshou.com/api/ai-theme | python3 -c "
import json,sys; d=json.load(sys.stdin); s=d['summary']
print('uniqueSymbols:', s['uniqueSymbols'], 'coreStocks:', s['coreStocks'], 'buyCount:', s['buyCount'])
print('themes:', [(t['label'],t['count']) for t in d['themes'][:3]])
"

# PM2 状态
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 'pm2 list'
```

---

## 三、数据库现状（2026-06-21 生产，v8.0 部署后）

| 表 | 条目数 | 状态 |
|----|--------|------|
| Stock | **3,716** | ✅ TSE 全量，中文名 100% 覆盖 |
| DailyPrice | **7,912,513+** | ✅ 最新 2026-06-19 |
| Financial | **35,986** | ✅ J-Quants 财报 |
| StockScore | **3,714** | ✅ v7.8，dividendScore + shortSellingSource 全量 |
| Disclosure | **4,691+** | ✅ TDnet REAL，最新 2026-06-19 |
| News | **1,590+** | ✅ Kabutan |
| GlobalMarket | **1** | ✅ 2026-06-20，score=7，VIX=16.78 |
| InstitutionalFlow | **216** | ✅ jquants_investor_types，最新 2026-06-12 |
| ShortSellingRatio | **2** | ✅ 2026-06-19，38.8%，jpx_real |
| Dividend | **32,315** | ✅ 3,693只，最新2026年 |
| **AITheme** | **109** | ✅ **v8.1：14分类，84只，39核心（CHIP_DESIGN 6只）** |
| **UserAiSettings** | **0+** | ✅ **v7.9.3 新：AI启停设置，按需创建** |
| LineUser | 1 | owner: U3223b03bb5879a9dabf2ce27b0f09524 |

---

## 四、数据库 Schema 完整结构（v8.0）

### 核心模型

```
Stock           — symbol @unique，nameZh 100%覆盖，3716条
Financial       — (stockId, fiscalYear, quarter) @unique
DailyPrice      — (symbol, date) @unique，7.9M条
Dividend        — (symbol, year, quarter) @unique，32315条
                  yieldRate: % 形式（如 3.42 = 3.42%）
                  payoutRatio: 0-1 小数（J-Quants 返回格式，内部×100使用）
Disclosure      — url @unique，4691件，TDnet REAL
News            — url @unique，relatedSymbolConfidence 0-100
SyncLog         — 同步日志（source/status/message/itemCount/durationMs）
SyncJob         — id cuid，PENDING|RUNNING|SUCCESS|FAILED
```

### StockScore（★主读表，symbol @id）

```
technicalScore     Int?      0-30 (J-Quants 价格技术面)
fundamentalScore   Int?      0-25 (J-Quants 财务)
moneyFlowScore     Int?      0-20 (J-Quants investor-types)
newsSentimentScore Int?      0-15 (Kabutan)
globalTrendScore   Int?      0-10 (Yahoo Finance NASDAQ/VIX/日経)
totalScore         Int?      0-100 (= rawScore，旧字段保留)
rawScore           Float?    = totalScore（向后兼容）
adaptiveScore      Float?    动态权重归一化分 0-100 ← 主评分字段
stockStyle         String?   VALUE_DEFENSIVE | GROWTH_MOMENTUM | QUALITY_COMPOUNDER
                              | SPECULATIVE_MOMENTUM | CYCLICAL_EXPORTER | DOMESTIC_DEFENSIVE
highRiskFlag       Boolean   @default(false)
fxSensitivity      String?   EXPORT_POSITIVE | IMPORT_SENSITIVE | FX_NEUTRAL | DOMESTIC_NEUTRAL
catalystScore      Float?    TDnet公告评分（baseline 5，±调整）
percentileRank     Float?    全市场百分位（越低越好，1=前1%）
marketRank         Int?      绝对排名（1=最佳）
recommendation     String?   旧版评级（totalScore判定）
recommendationV2   String?   ★双门槛：STRONG_BUY|BUY|HOLD|WATCH|AVOID
recommendationReason String? 评级中文理由
opportunityScore   Float?    综合机会分 0-100
opportunityRank    Int?      机会分排名
opportunityLabel   String?   STEADY | HIGH_RISK_SPECULATIVE
dividendScore      Int?      配当质量分 0-10 ← v7.8
shortSellingSource String?   jpx_real | fallback ← v7.8
scoreSource        String?   REAL | PARTIAL | FALLBACK
moneyFlowSource    String?   jquants_investor_types | jpx_file | jpx_manual | v2_proxy | synthetic
globalTrendSource  String?   yahoo | v2_default
latestDate         String?   最新价格日期（YYYY-MM-DD）
latestClose        Float?    最新收盘价

[indexes: totalScore DESC, adaptiveScore DESC, recommendationV2, percentileRank, computedAt DESC, market, recommendation]
```

### ShortSellingRatio（v7.8）

```
(date, market) @unique
date             DateTime @db.Date
market           String @default("ALL")  ← "ALL" = 全市场
shortSellRatio   Float?   % 例: 38.8
shortSellValue   Float?   百万円
totalTradingValue Float?  百万円
source           String   jpx_real | FALLBACK
```

### AITheme（v8.0 大幅扩展）

```
(symbol, theme) @unique  ← v8.0 从 symbol @unique 改为复合唯一键（一股多主题）
symbol           String
theme            String   14种主题（见下方主题列表）
subTheme         String?  细分方向
role             String?  公司在产业链中的角色描述
supplyChainLayer String?  UPSTREAM|MIDSTREAM|DOWNSTREAM|INFRASTRUCTURE|APPLICATION
importanceScore  Int      1-10，产业链重要度
reason           Text?    纳入理由
riskNote         Text?    风险提示
isCore           Boolean  @default(false)
@@index([theme]), @@index([symbol]), @@index([supplyChainLayer]), @@index([isCore])
@@map("ai_themes")

当前数据：106条，82只股票，38核心标的，14主题
```

### AITheme 14主题

| theme | label | 条目 | 颜色 |
|-------|-------|------|------|
| CHIP_DESIGN | AI芯片设计 | 3 | indigo |
| SEMI_EQUIPMENT | AI半导体设备 | 8 | blue |
| TEST_EQUIPMENT | AI测试设备 | 6 | cyan |
| CHIP_MATERIAL | AI芯片材料 | 8 | teal |
| HBM_PACKAGING | HBM・先进封装 | 7 | violet |
| SENSOR_PRECISION | AI传感器・精密 | 8 | purple |
| SERVER_DC | AI服务器・DC | 9 | amber |
| NETWORK | AI网络通信 | 8 | orange |
| ROBOT_AUTO | AI机器人・自动化 | 8 | emerald |
| SOFTWARE_CLOUD | AI软件・云・SaaS | 14 | sky |
| INTERNET_PLATFORM | AI互联网・平台 | 6 | pink |
| MEDICAL_LIFE | AI医疗・生命科学 | 7 | rose |
| SECURITY_VISION | AI安防・图像识别 | 7 | red |
| POWER_INFRA | AI电力・能源 | 7 | yellow |

### UserAiSettings（v7.9.3）

```
userId         String @unique  LINE userId 或 web sessionId
aiEnabled      Boolean @default(true)
mode           String @default("STOCK")  STOCK | CHAT | OFF
strictRealData Boolean @default(true)
@@map("user_ai_settings")
```

### 其他表

```
GlobalMarket    — date @db.Date @unique；nasdaq/sp500/vix/nikkei/usdjpy/score
InstitutionalFlow — (date, investorType, market) @unique；weekly JPX 资金流
                   @@unique named: date_investorType_market
Portfolio / WatchList / LineUser / LineGroup — 辅助表
PortfolioDiagnosis — Schema已建，功能待实现
NotificationLog / NotificationSetting / TelegramUser / AIAnalysis
```

完整 Schema 见 `prisma/schema.prisma`

---

## 五、TOHOSHOU AI 评分体系 V7.8

### 双门槛评级（recommendationV2）
```
STRONG_BUY：adaptiveScore ≥78 AND percentileRank ≤2%
BUY：adaptiveScore ≥70 AND percentileRank ≤10%
HOLD：adaptiveScore ≥60
WATCH：adaptiveScore ≥45
AVOID：adaptiveScore <45
```

### 评分分布（2026-06-21 生产，3714只）
| 评级 | 数量 |
|------|------|
| STRONG_BUY | 5（v8.1 放宽阈值≥75 AND ≤5%：Reskill教育77/量化研究76/日本M&A75/阿特拉埃75/Land75）|
| BUY | ~30（v8.1 放宽 BUY percentileRank≤15%）|
| HOLD | ~200 |
| WATCH | ~1680 |
| AVOID | ~1830 |
| 市场温度 | COLD ❄️ |

### Cron 调度（Asia/Tokyo）
```
05:30 每日    → fetch-global-market.ts
06:00 每日    → sync-all-prices.ts
07:00 工作日  → fetch-tdnet.ts
07:00/12/18/22 → Kabutan 新闻
07:30 每日    → compute-scores.ts（含 dividendScore + shortSellingSource）
08:00 工作日  → send-morning-brief.ts（LINE）
08:30 每日    → send-daily-line.ts（LINE TOP10）
12:30 工作日  → send-midday-flash.ts（LINE）
15:45 工作日  → send-closing-summary.ts（LINE）
16:35 工作日  → send-line-risk-alert.ts（LINE）
18:30 工作日  → fetch-short-selling-ratio.ts
周五 16:30    → fetch-jquants-investor-types.ts
周一 07:15    → fetch-jquants-investor-types.ts（备份）
22:00 每日    → sync-stock-meta.ts
22:30 每日    → fetch-dividend-history.ts
```

---

## 六、已完成功能（完整历史）

### v8.0 — AI产业链地图（2026-06-21，已部署）
- [x] **AITheme 精细化重构** — 6分类→14细分，symbol @unique → @@unique([symbol,theme])
- [x] **新字段** — subTheme/role/supplyChainLayer/importanceScore/reason/riskNote/isCore
- [x] **106条数据** — 82只股票，38核心标的，一股多主题支持
- [x] **供应链层分类** — UPSTREAM/MIDSTREAM/DOWNSTREAM/INFRASTRUCTURE/APPLICATION
- [x] **`scripts/seed-ai-themes.ts`** 全量重写
- [x] **`GET /api/ai-theme`** 重写 — themes/layers/summary，使用 adaptiveScore/dividendScore/catalystScore
- [x] **`GET /api/ai-theme/[theme]`** 新增 — byLayer产业链详情
- [x] **`/ai-theme` 页面** 重写 — 搜索/筛选/供应链层可视化/14主题卡/3列网格
- [x] **`/ai-theme/[theme]` 页面** 新增 — 产业链流可视化+全量排序

### v7.9.3 — AI System Control（2026-06-21，已部署）
- [x] **`UserAiSettings` 表** — userId/aiEnabled/mode/strictRealData
- [x] **`lib/ai-control.ts`** — detectSystemCommand/getAiEnabled/handleSystemCommand/buildStatusText/PAUSE_MSG
- [x] **4系统命令** — START/STOP/RESET/STATUS，最高优先级，绕过全部pipeline
- [x] **LINE + Web 双端门控** — aiEnabled=false 拦截所有非系统消息
- [x] **Web sessionId** — crypto.randomUUID()，sessionStorage存储，userId 传给 /api/chat
- [x] **INTENT_BADGE** 扩展 — 17种 badge（含 system_start/stop/reset/status/paused）
- [x] 验收：LINE 9/9 ✅，Web 6/6 ✅

### v7.9.2 — GPT Intent Engine（2026-06-21，已部署）
- [x] **`lib/intent-schema.ts`** — StructuredIntent/ConversationContext/DbQueryResult 统一类型
- [x] **`lib/intent-engine.ts`** — regex优先（~90%命中）+ GPT JSON fallback，30分钟 TTL 上下文
- [x] **`lib/query-engine.ts`** — 12种意图 DB 查询统一入口（queryDatabase）
- [x] **`lib/answer-builder.ts`** — buildWebAnswer() + buildLineMessages()，zero GPT
- [x] **12种意图** — top_picks/recommend_more/stock_analysis/stock_compare/theme_rank/sector_outlook/market_overview/risk_analysis/reason_explain/data_source/help/unknown
- [x] **`/api/chat` + `lib/line-chat.ts`** 重写为统一 pipeline
- [x] **`scripts/test-intent-engine.ts`** — 14/14 intent ✅ + 6 answer tests
- [x] 验收：answerSource=DB ✅，hallucination=false ✅，零 localhost ✅

### v7.9 — LINE 全智能投资助手（2026-06-21）
- [x] lib/line-intent.ts（8种意图，~100条公司名映射）
- [x] lib/line-flex-v79.ts（8个 Flex builder，全 app-url.ts 验证）
- [x] lib/line-chat.ts（统一调用链，UNKNOWN→HELP）
- [x] /chat 页面（GPT Phase 2 Web UI，对话气泡，快捷提问，意图 badge）
- [x] 36/36 测试通过

### v7.8 — 空売り比率 + 配当スコア（2026-06-20）
- [x] ShortSellingRatio 表，JPX PDF 解析，source=jpx_real
- [x] dividendScore 0-10（calcDividendScore，3714只全量）
- [x] Sync Center 11源全 REAL
- [x] 股票详情 AI Tab 扩展（配当卡 + 空売りカード）

### v7.7 — 双门槛评级 + 市场温度（2026-06-20）
- [x] recommendationV2 双门槛（BUY=35，COLD ❄️）
- [x] MarketTemperature，opportunityScore，percentileRank
- [x] TDnet REAL（Cookie 方案，4691件）

### v7.5-v7.6 — 动态权重（2026-06-14）
- [x] adaptiveScore / stockStyle / fxSensitivity / catalystScore
- [x] GPT Phase 1 /api/chat（4意图）
- [x] LINE Flex Message V7.5

---

## 七、API 路由一览

| 端点 | 说明 |
|------|------|
| `GET /api/sync/status` | 11个数据源综合状态 |
| `POST /api/sync/scores` | 触发 compute-scores（150s超时）|
| `POST /api/sync/jquants` | J-Quants ��步（返回 jobId）|
| `GET /api/sync/jobs/[jobId]` | 异步任务进度 |
| `GET /api/market-stats` | 市场温度 + BUY分布 + TOP列表 |
| `GET /api/ai-scores?mode=top\|opportunity\|high_risk` | AI推荐列表 |
| `GET /api/stocks/[symbol]/ai-score` | 个股AI评分（含 dividendScore/shortSellingRatio）|
| `GET /api/stocks/[symbol]/alternatives` | 同风格替代股 |
| `GET /api/screener` | 全市场筛选 |
| `GET /api/ai-theme` | AI产业链地图（106条，14主题）|
| `GET /api/ai-theme/[theme]` | 单主题产业链详情（byLayer）← v8.0 新 |
| `POST /api/chat` | 自然语言对话（Intent Engine v7.9.2）|
| `POST /api/line/webhook` | LINE Bot Webhook |

---

## 八、关键文件索引

### 核心 Lib
```
lib/intent-schema.ts    ← v7.9.2 统一类型（StructuredIntent/ConversationContext/DbQueryResult）
lib/intent-engine.ts    ← v7.9.2 意图解析（regex + GPT fallback，30min TTL）
lib/query-engine.ts     ← v7.9.2 12种意图 DB 查询
lib/answer-builder.ts   ← v7.9.2 buildWebAnswer()/buildLineMessages()（zero GPT）
lib/ai-control.ts       ← v7.9.3 系统控制（START/STOP/RESET/STATUS）
lib/line-chat.ts        ← v7.9.2 LINE 统一 pipeline（pipeline gate: sysCmd → aiEnabled → intent）
lib/line-intent.ts      ← v7.9 LINE regex 意图解析（parseLineIntent）
lib/line-flex-v79.ts    ← v7.9 Flex Message builders（8个）
lib/ai-score.ts         ← v7.8 评分引擎（calcDividendScore，REAL_MONEY_SOURCES）
lib/market-temperature.ts ← v7.7 MarketTemperature 计算
lib/app-url.ts          ← getBaseUrl()，APP_URL 优先
lib/prisma.ts           ← Prisma singleton（PrismaPg adapter）
lib/line.ts             ← LINE API 基础（textMsg等）
lib/tdnet.ts            ← TDnet REAL Cookie 方案
```

### 关键脚本
```
scripts/compute-scores.ts          ← 双 Pass 全量评分（每日 07:30 JST）
scripts/seed-ai-themes.ts          ← v8.0 AI产业链 106条数据写入
scripts/fetch-short-selling-ratio.ts ← JPX PDF → ShortSellingRatio
scripts/fetch-dividend-history.ts  ← J-Quants → Dividend
scripts/fetch-global-market.ts     ← Yahoo Finance → GlobalMarket
scripts/fetch-jquants-investor-types.ts ← JPX → InstitutionalFlow
scripts/test-intent-engine.ts      ← Intent Engine 测试（14/14）
scripts/cron-scheduler.ts          ← 全部 cron 定时任务
```

### 关键 API 路由
```
app/api/chat/route.ts              ← v7.9.3 gate: sysCmd → aiEnabled → intent → DB → answer
app/api/ai-theme/route.ts          ← v8.0 重写（themes/layers/summary）
app/api/ai-theme/[theme]/route.ts  ← v8.0 新增（byLayer 详情）
app/api/line/webhook/route.ts      ← LINE webhook
app/api/sync/status/route.ts       ← 11源状态聚合
app/api/stocks/[symbol]/ai-score/route.ts ← 个股评分（含 v7.8 字段）
```

### 关键页面
```
app/ai-theme/page.tsx              ← v8.0 重写（产业链地图，搜索/筛选/3列网格）
app/ai-theme/[theme]/page.tsx      ← v8.0 新增（产业链流可视化）
app/chat/page.tsx                  ← v7.9.3 Web 对话（sessionId + intent badge）
app/ai-picks/page.tsx              ← AI推荐榜
app/screener/page.tsx              ← 全市场筛选
app/sync/page.tsx                  ← Sync Center
```

---

## 九、已安装依赖

### package.json dependencies
```
next: 16.2.9                ← App Router；Route Params 必须 await params
react: 19.2.4
react-dom: 19.2.4
@prisma/client: ^7.8.0      ← 必须用 PrismaPg adapter
@prisma/adapter-pg: ^7.8.0
prisma: ^7.8.0
pg: ^8.22.0
yahoo-finance2: ^3.15.3     ← v3：必须 new YahooFinance()；VIX 用 yf.quote()
openai: ^6.44.0             ← DeepSeek/OpenAI 兼容接口
node-cron: ^4.4.1
node-html-parser: ^7.1.0    ← Kabutan/TDnet 爬虫
axios: ^1.18.0
dayjs: ^1.11.21
zod: ^4.4.3
xlsx: ^0.18.5
```

### devDependencies
```
tailwindcss: ^4             ← @import "tailwindcss"，无 tailwind.config.js
@tailwindcss/postcss: ^4
typescript: ^5
eslint: ^9
eslint-config-next: 16.2.9
@types/node: ^20
@types/react: ^19
@types/react-dom: ^19
@types/node-cron: ^3.0.11
@types/pg: ^8.20.0
```

### 生产服务器系统包（apt 安装）
```bash
poppler-utils   # pdftotext，用于解析 JPX 空売り比率 PDF
# 验证：which pdftotext → /usr/bin/pdftotext
```

### npm scripts 完整列表
```bash
npm run dev                         # 开发服务器（port 3000）
npm run build                       # 生产构建（部署前必须）
npx tsc --noEmit                    # 类型检查（不构建）
npm run compute-scores              # 全量重算 AI 评分
npm run fetch-global-market         # 抓取 Yahoo Finance → GlobalMarket
npm run fetch-short-selling         # 抓取 JPX PDF → ShortSellingRatio
npm run fetch-short-selling:dry     # 预览（不写DB）
npm run fetch-dividend-history      # J-Quants → Dividend
npm run fetch-dividend-history:dry  # 预览
npm run fetch-institutional-flow    # J-Quants investor-types → InstitutionalFlow
npm run sync-meta                   # 同步股票元数据
npm run sync-prices-recent          # 同步最近价格
npm run cron                        # 启动 cron 调度器
npm run seed:ai-themes              # 重置 AITheme（v8.0：106条）
npm run test:intent-engine          # 意图引擎测试（APP_URL=https://...）
npm run test:intent-engine:dry      # 跳过 DB 的意图只测（SKIP_DB=1）
npm run line:morning-brief          # LINE 早报
npm run line:midday-flash           # LINE 午间
npm run line:closing-summary        # LINE 收盘
npm run line:risk-alert             # LINE 风险预警
npm run send-daily-line             # LINE 每日推送（全版）
```

---

## 十、关键代码规则（新 Claude 必读）

### Prisma 初始化（必须用 adapter）
```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
// ⚠️ scripts/ 中直接实例化；API routes 用 lib/prisma.ts singleton
```

### Next.js 16 Route Params（必须 await）
```typescript
// 服务端组件 / API Route：
export async function GET(_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
}
// 客户端组件（"use client"）：
import { useParams } from "next/navigation";
const params = useParams();
const theme = params?.theme as string;
```

### scripts/ 路径规则
```typescript
// scripts/ 文件必须用相对路径，禁止 @/ 别名
import { prisma } from "../lib/prisma";   // ✅
import { prisma } from "@/lib/prisma";    // ❌ scripts 不支持
```

### Intent Engine Pipeline 顺序（line-chat.ts / api/chat）
```
1. detectSystemCommand(text) → 命中 → handleSystemCommand() → 立即返回（绕过全部）
2. getAiEnabled(userId) → false → 返回 PAUSE_MSG（绕过全部）
3. parseUserIntent(text, context) → GPT JSON fallback
4. queryDatabase(intent) → DB only
5. buildWebAnswer(data) / buildLineMessages(data) → zero GPT
6. setContext(userId, nextCtx)
```

### 系统命令触发词（精确匹配）
```
START:  启动AI/开启AI/start/唤醒/激活/开机/resume/重启AI
STOP:   关闭AI/停止AI/停止/stop/休眠/暂停/关机/下线
RESET:  清空上下文/重置/reset/清空记忆/清空对话
STATUS: 当前状态/状态/status/AI状态/系统状态
```

### dividendScore 计算（v7.8）
```typescript
// lib/ai-score.ts: calcDividendScore(yieldRate%, payoutRatio)
// yieldRate:   来自 Dividend.yieldRate（% 形式，如 3.42）
// payoutRatio: 来自 Dividend.payoutRatio（0-1 小数，内部自动×100）
// 0%=0, <1%=1, <2%=3, <3%=5, <4%=7, <6%=8, ≥6%=6（高yield陷阱）
// payout 20-60%: +1, >80%: -1；max=10
```

### ShortSellingRatio 查询（v7.8）
```typescript
const latest = await prisma.shortSellingRatio.findFirst({
  where: { market: "ALL" },
  orderBy: { date: "desc" },
  select: { date: true, shortSellRatio: true, source: true },
});
```

### AITheme 查询（v8.0）
```typescript
// 多主题查询：一个 symbol 可有多行
const themeRows = await prisma.aITheme.findMany({
  where: { theme: "SEMI_EQUIPMENT" },
  select: { symbol: true, role: true, supplyChainLayer: true, importanceScore: true, isCore: true },
  orderBy: [{ isCore: "desc" }, { importanceScore: "desc" }],
});
// Upsert key: symbol_theme（复合）
await prisma.aITheme.upsert({
  where: { symbol_theme: { symbol, theme } },
  create: { ... },
  update: { ... },
});
```

### 日期处理
```typescript
// ⚠️ 服务器 CST（UTC+8），new Date(y,m,d) 会创建 CST 午夜 → UTC 前一天
const date = new Date(Date.UTC(year, month - 1, day)); // ✅ 正确
```

### REAL_MONEY_SOURCES
```typescript
// lib/ai-score.ts 两处都要维护（computeScoreSource + calcAiScore）
const REAL_MONEY_SOURCES = ["jquants_investor_types", "jpx", "jpx_file", "jpx_manual"];
```

---

## 十一、已知问题

| 优先级 | 问题 | 位置 | 解决方案 |
|--------|------|------|---------|
| P2 | STRONG_BUY=0（最高分77，门槛78） | `scripts/compute-scores.ts` → `computeRecommendationV2()` | 调整为 adaptiveScore≥75 AND percentileRank≤5% |
| P2 | 9613.T/9719.T 无 StockScore 评分 | J-Quants 未覆盖这两只 | 手动添加到 Stock 表或单独评分 |
| P3 | ShortSellingRatio 有1条时区 bug 旧行（2026-06-18）| DB | 无运行时影响（orderBy desc 取正确行），可清理 |
| P3 | 服务器 tsc 构建时 webhook/route.ts 第98行类型错误 | `app/api/line/webhook/route.ts` | 本地 build 正常，rsync .next/ 绕过，不影响运行 |
| P3 | STRONG_BUY=0 市场温度 COLD | compute-scores.ts | 见 P2 |
| P3 | PortfolioDiagnosis 功能未实现 | Schema 已建 | 待未来迭代 |

---

## <a id="next-session"></a>NEXT SESSION — 下次启动继续位置

### 当前系统基线（2026-06-21，v8.1，全部已部署生产）

```
✅ v8.1 STRONG_BUY 阈值放宽 + CHIP_DESIGN 扩充
   - STRONG_BUY：≥78 AND ≤2% → ≥75 AND ≤5%（结果 5只）
   - BUY：percentileRank ≤10% → ≤15%
   - CHIP_DESIGN：3只 → 6只（新增 メガチップス/索尼/富士電機）
   - 供应链流矢印：grid+absolute → flex+SVG arrow（视觉正常）

✅ v8.0 AI产业链地图（14细分主题，109条，84只，39核心）
   - /ai-theme 页面完全重构（搜索/供应链层/14主题卡/3列网格）
   - /ai-theme/[theme] 新增产业链流可视化
   - /api/ai-theme 返回 themes/layers/summary（adaptiveScore为主）
   - /api/ai-theme/[theme] 新增 byLayer 产业链详情

✅ v7.9.3 AI System Control
   - UserAiSettings 表（userId unique/aiEnabled/mode）
   - lib/ai-control.ts（START/STOP/RESET/STATUS 4命令）
   - LINE + Web 双端 gate：sysCmd最高优先 → aiEnabled门控 → 正常pipeline
   - LINE 9/9 验收通过，Web 6/6 验收通过

✅ v7.9.2 GPT Intent Engine（DB-only 回答，zero GPT for answers）
   - lib/intent-schema.ts / intent-engine.ts / query-engine.ts / answer-builder.ts
   - 12种意图，regex优先+GPT JSON fallback，30min TTL 上下文
   - 14/14 intent 测试通过，answerSource=DB, hallucination=false

✅ v7.9 LINE 全智能投资助手（36/36 测试通过）

✅ v7.8 空売り比率 + 配当スコア + 11源 Sync Center（全 REAL）

✅ v7.7 双门槛评级 + 市场温度（BUY=35，COLD ❄️）

✅ TypeScript 0错误 + npm run build 通过 + pm2 online
```

### 推荐 TODO（按优先级）

#### ~~P2 — 放宽 STRONG_BUY 阈值~~ ✅ v8.1 已完成
#### ~~P2 — AI产业链 CHIP_DESIGN 扩充~~ ✅ v8.1 已完成（6只）
#### ~~P2 — 搜索中文公司名~~ ✅ 已支持（前端 nameZh.includes 已实现）
#### ~~P2 — 供应链矢印~~ ✅ v8.1 已修复

#### P3 — LINE 生产对话实测
用真实 LINE Bot 账号发送以下消息验证 v7.9.3：
- 「停止」→ 🛑 AI 已暂停
- 「今天买什么」→「AI 当前已暂停」
- 「启动AI」→ 🟢 已启动
- 「今天买什么」→ TOP5 Flex Message
- 「还有吗」→ 推荐更多（exclude lastSymbols）
- 「当前状态」→ 状态卡（v7.9.3 含数据源清单）

#### P3 — PortfolioDiagnosis 持仓诊断
Schema 已建，待实现诊断逻辑 + `/api/portfolio/[id]/diagnose` 端点 + 前端展示。

### 第一步操作建议

```bash
# 1. 验证当前生产状态
curl -s https://aitohoshou.com/api/ai-theme | python3 -c "
import json,sys; d=json.load(sys.stdin); s=d['summary']
print('OK — uniqueSymbols:', s['uniqueSymbols'], 'coreStocks:', s['coreStocks'])
"

# 2. 验证 AI System Control
curl -s -X POST https://aitohoshou.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"当前状态","userId":"check_001"}' | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print('STATUS:', d.get('intent'), d.get('reply','')[:50])"

# 3. 验证 Intent Engine
curl -s -X POST https://aitohoshou.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"今天买什么","userId":"check_001"}' | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d.get('intent'), d.get('answerSource'), d.get('hallucination'))"
```

---

*最后更新：2026-06-21 | v8.0 | 系统已停止开发，待下次会话继续*
