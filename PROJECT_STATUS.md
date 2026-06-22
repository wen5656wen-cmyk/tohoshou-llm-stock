# PROJECT_STATUS.md — TOHOSHOU AI 日本股票AI分析系统

> **最后更新：** 2026-06-22
> **版本：** v10.1.1（Backtest 完全自动化封版 — daily pipeline 自动 --all + health API + BacktestError + Sync 卡片）
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
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 "pm2 restart tohoshou-web --update-env"
```

### Schema 变更（改了 prisma/schema.prisma）
```bash
npx prisma generate
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
```

### ⚠️ .env 规则
- `rsync .next/` **不会** 覆盖 .env（只有 `rsync ./` 整个目录才会）
- 确认：`DATABASE_URL="postgresql://tohoshou:123456@127.0.0.1:5432/llm_stock"`
- 确认：`APP_URL=https://aitohoshou.com`

### 重算 AI 评分
```bash
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx scripts/compute-scores.ts 2>&1 | tail -20"
```

### 快速健康检查
```bash
curl -s "https://aitohoshou.com/api/sync/status" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('realCount:', d['summary']['realCount'], '/', len(d['sources']))
for s in d['sources']: print(f'  {s[\"id\"]}: {s[\"status\"]}')
"
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 'pm2 list'
```

---

## 三、数据库现状（2026-06-22 生产）

| 表 | 条目数 | 状态 |
|----|--------|------|
| Stock | **3,716** | ✅ TSE 全量，中文名 100% 覆盖 |
| DailyPrice | **7,912,513+** | ✅ 最新 2026-06-19，adjClose 100% 覆盖 |
| Financial | **35,986** | ✅ J-Quants 财报 |
| StockScore | **3,714** | ✅ v8.1 阈值，dividendScore + shortSellingSource 全量 |
| Disclosure | **4,691+** | ✅ TDnet REAL |
| News | **1,590+** | ✅ Kabutan |
| GlobalMarket | **1** | ✅ 2026-06-20，VIX=16.78 |
| InstitutionalFlow | **216** | ✅ jquants_investor_types |
| ShortSellingRatio | **2** | ✅ 2026-06-19，38.8%，jpx_real |
| Dividend | **32,315** | ✅ 3,693只，最新2026年 |
| AITheme | **109** | ✅ v8.1：14分类，84只，39核心（CHIP_DESIGN 6只）|
| UserAiSettings | **0+** | ✅ v7.9.3 新：AI启停设置 |
| LineUser | 1 | owner: U3223b03bb5879a9dabf2ce27b0f09524 |
| DailyRecommendation | **500** | ✅ v10.0：2026-06-20 cohort，等待 2026-06-23 entryPrice 填充 |
| BacktestResult | **0** | 🟡 v10.1：等待价格填充后自动生成（WAITING_PRICE 为预期状态）|
| BacktestError | **0** | ✅ v10.1.1：新建，监控数据缺失 |

---

## 四、数据库 Schema 完整结构

### 核心评分表：StockScore（symbol @id）

```
adaptiveScore      Float?    动态权重归一化分 0-100 ← 主评分字段
technicalScore     Int?      0-30
fundamentalScore   Int?      0-25
moneyFlowScore     Int?      0-20
newsSentimentScore Int?      0-15
globalTrendScore   Int?      0-10
totalScore         Int?      0-100（向后兼容）
stockStyle         String?   VALUE_DEFENSIVE | GROWTH_MOMENTUM | QUALITY_COMPOUNDER
                              | SPECULATIVE_MOMENTUM | CYCLICAL_EXPORTER | DOMESTIC_DEFENSIVE
highRiskFlag       Boolean   @default(false)
percentileRank     Float?    全市场百分位（越低越好，1=前1%）
marketRank         Int?      绝对排名（1=最佳）
recommendationV2   String?   ★STRONG_BUY|BUY|HOLD|WATCH|AVOID（双门槛）
opportunityScore   Float?    综合机会分 0-100
dividendScore      Int?      配当质量分 0-10 (v7.8)
scoreSource        String?   REAL | PARTIAL | FALLBACK
latestClose        Float?    最新收盘价（未复权，仅展示）
latestDate         String?   最新价格日期（YYYY-MM-DD）
[indexes: adaptiveScore DESC, recommendationV2, percentileRank, computedAt DESC]
```

### AITheme（symbol+theme 复合唯一键）

```
(symbol, theme) @@unique[symbol_theme]
supplyChainLayer  String?  UPSTREAM|MIDSTREAM|DOWNSTREAM|INFRASTRUCTURE|APPLICATION
importanceScore   Int      1-10
isCore            Boolean  @default(false)
14主题：CHIP_DESIGN|SEMI_EQUIPMENT|TEST_EQUIPMENT|CHIP_MATERIAL|HBM_PACKAGING|
        SENSOR_PRECISION|SERVER_DC|NETWORK|ROBOT_AUTO|SOFTWARE_CLOUD|
        INTERNET_PLATFORM|MEDICAL_LIFE|SECURITY_VISION|POWER_INFRA
```

### 其他关键表
```
DailyPrice   (symbol, date) @unique — adjClose 用于计算，close 用于展示
Financial    (stockId, fiscalYear, quarter) @unique
Dividend     (symbol, year, quarter) @unique — yieldRate:% / payoutRatio:0-1
ShortSellingRatio (date, market) @unique — source: jpx_real | FALLBACK
GlobalMarket  date @db.Date @unique
InstitutionalFlow (date, investorType, market) @unique [date_investorType_market]
UserAiSettings userId @unique — aiEnabled/mode/strictRealData
```

完整 Schema：`prisma/schema.prisma`

---

## 五、TOHOSHOU AI 评分体系 v8.1（封版）

### 双门槛评级（recommendationV2）
```
STRONG_BUY：adaptiveScore ≥75 AND percentileRank ≤5%
BUY：        adaptiveScore ≥70 AND percentileRank ≤15%
HOLD：       adaptiveScore ≥60
WATCH：      adaptiveScore ≥45
AVOID：      adaptiveScore <45
```

### 评分分布（2026-06-21 生产，3714只）
| 评级 | 数量 |
|------|------|
| STRONG_BUY | 5（Reskill 291A/量化研究/日本M&A/阿特拉埃/Land）|
| BUY | ~30 |
| 市场温度 | COLD ❄️ |

### Cron 调度（Asia/Tokyo）
```
05:30 每日    → fetch-global-market.ts
06:00 每日    → sync-all-prices.ts
07:00 工作日  → fetch-tdnet.ts
07:00/12/18/22 → Kabutan 新闻
07:30 每日    → compute-scores.ts → data-health-guard.ts（自动守卫）
08:00 工作日  → send-morning-brief.ts（LINE）
08:30 每日    → daily-ai-pipeline.ts（含 Step 8: update-backtest --all，自动回测填充）
12:30 工作日  → send-midday-flash.ts（LINE）
15:45 工作日  → send-closing-summary.ts（LINE）
16:35 工作日  → send-line-risk-alert.ts（LINE）
18:30 工作日  → fetch-short-selling-ratio.ts
周五 16:30    → fetch-jquants-investor-types.ts
周一 07:15    → fetch-jquants-investor-types.ts（备份）
22:00 每日    → sync-stock-meta.ts
22:30 每日    → fetch-dividend-history.ts
```

> **回测自动化**：每日 08:30 JST `daily-ai-pipeline` Step 8 固定执行 `update-backtest --all`（10分钟超时），**无需人工干预**。

---

## 六、v8.3 UX 设计规范（已落地，2026-06-21）

> **这是全站 UI 规范，修改任何页面必须遵守**

### 评级色彩系统（`lib/rec-config.ts` 单一真相来源）
```typescript
// 所有页面/组件 import from "@/lib/rec-config"，禁止本地定义 REC_CFG
STRONG_BUY: emerald-600 / bg-emerald-50 / border-emerald-200
BUY:        blue-600    / bg-blue-50    / border-blue-200
HOLD:       slate-500   / bg-slate-100  / border-slate-200
WATCH:      amber-500   / bg-amber-50   / border-amber-200
AVOID:      red-500     / bg-red-50     / border-red-200

// 核心工具函数
getRec(key)                    // 返回 { label, bg, text, border, solid, color, glow }
returnColorClass(val)          // val>=0 → text-emerald-600, val<0 → text-red-500
fmtPct(val, decimals=2)        // "+25.32%" / "-25.32%"
fmtJpy(val)                    // "¥1,234,567"
```

### 排版规范
```
h1 页面标题：     text-[32px] font-bold leading-tight
股票名称：         text-[15px] font-bold
当前股价：         text-[36px] font-extrabold tabular-nums
卡片数字：         text-2xl font-bold tabular-nums
评级 Badge：       text-[11px] font-semibold
描述文字：         text-xs font-medium text-slate-500
```

### 布局规范
```
卡片圆角：         rounded-2xl（全站统一，禁止 rounded-xl / rounded-lg 用于卡片）
卡片内边距：       p-4
卡片间距：         gap-4
卡片阴影：         shadow-sm
Tab 容器：         bg-slate-100 rounded-xl p-1（内部 rounded-lg）
```

### 颜色规范
```
涨跌色：           国际惯例 green=涨 red=跌（禁止日本惯例 red=涨 blue=跌）
涨跌格式：         "+25.32%" / "-25.32%"（含符号，2位小数，禁止 ▲▼）
```

### 英文标签（已统一）
```
评级：       STRONG BUY / BUY / HOLD / WATCH / AVOID
52周高低：   52W High / 52W Low
指标列名：   Tech / Fund / Flow / News / Global
评分列名：   Adaptive / Percentile / Opportunity
MA趋势：     Bullish / Strong / Neutral / Weak / Bearish
```

---

## 七、已完成功能（完整历史）

### v10.1.1 — Backtest 完全自动化封版（2026-06-22，commit def9fc0）✅
- [x] `BacktestError` 模型：NO_DAILY_PRICE / NO_ENTRY_PRICE / NO_EXIT_PRICE 错误追踪
- [x] `scripts/update-backtest.ts` v10.1.1：错误追踪 + batch createMany + FORCE 清除旧错误
- [x] `scripts/daily-ai-pipeline.ts` Step 8：固定 `--all`，超时 10min，每日自动填充
- [x] `GET /api/backtest/health`：fillRate7d/30d/90d + status(HEALTHY/WAITING_PRICE/PARTIAL/FAILED) + recentErrors
- [x] `/sync` Backtest 健康卡片：状态badge(🟢/🟡/🔴) + fill rates + 最新价格日
- **当前状态**：WAITING_PRICE（latestPriceDate=2026-06-19，等待 2026-06-23 周一开盘后价格同步，下次 pipeline 自动填充）

### v10.1 — Backtest 真实交易日入场/出场+组合+基准（2026-06-22，commit 9e2bbb5）✅
- [x] Entry = 次交易日开盘价（无未来函数），Exit = 严格第N交易日 adjClose??close
- [x] TOP5/TOP10/TOP20/ALL 等权组合统计
- [x] Nikkei225/TOPIX 同期基准对比，alpha 超额收益
- [x] `GET /api/backtest/summary` 新结构：portfolios 嵌套 + benchmark 字段
- [x] `/backtest` 页面：组合对比表 + benchmark 列
- [x] 修复：Prisma 7 生产 DB 列名为 camelCase，raw SQL 需引用带引号的列名

### v10.0 — Backtest MVP + finalScore 70/30 公式（2026-06-21）✅
- [x] `DailyRecommendation` 模型：每日保存 Top500 快照
- [x] `BacktestResult` 模型：per cohort × horizon 聚合统计
- [x] `scripts/update-backtest.ts`：price7d/30d/90d 填充 + 聚合
- [x] `GET /api/backtest/summary` + `/backtest` 页面（三语言）
- [x] `finalScore = adaptiveScore×0.7 + gptScore×0.3`

### v8.3 — 全局 UX 统一（2026-06-21，commit 61ebe8d）
- [x] `lib/rec-config.ts` — 新建，评级色彩/工具函数单一真相来源
- [x] `components/RecommendationBadge.tsx` — 使用 getRec()，英文标签
- [x] `components/StockMobileCard.tsx` — green/red，rounded-2xl，英文标签
- [x] `app/page.tsx` — 英文表头，无 emoji 排名，emerald BUY 卡片
- [x] `app/ai-picks/page.tsx` — 移除本地 REC_CFG，getRec()
- [x] `app/screener/page.tsx` — 英文分布 chips，英文列标题
- [x] `app/stocks/page.tsx` — green=up，英文表头，rounded-2xl
- [x] `app/stocks/[symbol]/page.tsx` — 股价 36px，"52W High/Low"，getRec()，所有色修正
- [x] `app/sync/page.tsx` — Data Health 卡片大字体 CRITICAL/WARNING/PASS
- [x] `app/ai-theme/page.tsx` — getRec()，ReturnBadge green/red，rounded-2xl
- [x] `app/ai-theme/[theme]/page.tsx` — 同上

### v8.2.4 — Data Health Guard（2026-06-21，commit b1faeb3）
- [x] `scripts/data-health-guard.ts` — 20项检查，CRITICAL→exit 1
- [x] `app/api/health/status/route.ts` — 健康报告 API
- [x] `scripts/cron-scheduler.ts` — 07:30 compute-scores 后自动触发

### v8.2.3 — Global Data Integrity Audit（9/9 全部通过）
- [x] `scripts/audit-data-integrity.ts` — 只读审计脚本
- [x] 结论：adjClose 100% 覆盖，split contamination=0，STRONG_BUY 合规 5/5

### v8.2.2 — adjClose 价格修复（432只拆股污染→0）
- [x] `lib/indicators.ts` — effectiveClose()，adjClose 优先
- [x] `scripts/compute-scores.ts` — 全链路传递 adjClose
- [x] 展示用 close，计算用 adjClose??close

### v8.1 — STRONG_BUY 阈值放宽 + CHIP_DESIGN 扩充
- [x] STRONG_BUY ≥75 AND ≤5%（旧：≥78 AND ≤2%）
- [x] BUY percentileRank ≤15%（旧：≤10%）
- [x] CHIP_DESIGN 3只→6只

### v8.0 — AI产业链地图（14分类，供应链可视化）

### v7.9.3 — AI System Control（START/STOP/RESET/STATUS）

### v7.9.2 — GPT Intent Engine（12意图，DB-only 回答）

### v7.8 — 空売り比率 + 配当スコア

### v7.7 — 双门槛评级 + 市场温度

---

## 八、API 路由一览

| 端点 | 说明 |
|------|------|
| `GET /api/sync/status` | 11个数据源综合状态 |
| `POST /api/sync/scores` | 触发 compute-scores |
| `GET /api/market-stats` | 市场温度 + BUY分布 + TOP列表 |
| `GET /api/ai-scores?mode=top\|opportunity\|high_risk` | AI推荐列表 |
| `GET /api/screener` | 全市场筛选（q=关键字，sort=字段，limit=200）|
| `GET /api/ai-theme` | AI产业链地图（14主题）|
| `GET /api/ai-theme/[theme]` | 单主题产业链详情（byLayer）|
| `GET /api/stocks/[symbol]/ai-score` | 个股AI评分 |
| `GET /api/health/status` | Data Health Guard 最新报告 |
| `GET /api/backtest/summary` | 回测汇总（cohorts + portfolios + winners/losers）|
| `GET /api/backtest/health` | 回测健康状态（fillRate + status + recentErrors）|
| `POST /api/chat` | 自然语言对话（Intent Engine v7.9.2）|
| `POST /api/line/webhook` | LINE Bot Webhook |

---

## 九、关键文件索引

### 设计规范
```
lib/rec-config.ts           ← ★ v8.3 评级色彩/工具函数单一真相来源（所有页面从此 import）
```

### 核心 Lib
```
lib/intent-schema.ts        ← v7.9.2 统一类型
lib/intent-engine.ts        ← v7.9.2 意图解析（regex + GPT fallback，30min TTL）
lib/query-engine.ts         ← v7.9.2 12种意图 DB 查询
lib/answer-builder.ts       ← v7.9.2 buildWebAnswer()/buildLineMessages()（zero GPT）
lib/ai-control.ts           ← v7.9.3 系统控制（START/STOP/RESET/STATUS）
lib/ai-score.ts             ← 评分引擎（calcDividendScore）
lib/market-temperature.ts   ← MarketTemperature 计算
lib/app-url.ts              ← getBaseUrl()，APP_URL 优先
lib/prisma.ts               ← Prisma singleton（PrismaPg adapter 必须）
```

### 关键脚本
```
scripts/compute-scores.ts           ← 双 Pass 全量评分（每日 07:30 JST）
scripts/data-health-guard.ts        ← 每日 20项健康守卫（v8.2.4）
scripts/audit-data-integrity.ts     ← 只读全量审计（v8.2.3）
scripts/seed-ai-themes.ts           ← AI产业链 109条数据
scripts/cron-scheduler.ts           ← 全部 cron 定时任务
```

---

## 十、已安装依赖（完整）

### 生产依赖
```
next: 16.2.9                ← App Router；Route Params 必须 await params
react: 19.2.4
react-dom: 19.2.4
@prisma/client: ^7.8.0      ← 必须用 PrismaPg adapter
@prisma/adapter-pg: ^7.8.0
prisma: ^7.8.0
pg: ^8.22.0
yahoo-finance2: ^3.15.3     ← v3：必须 new YahooFinance()；VIX 用 yf.quote()
openai: ^6.44.0
node-cron: ^4.4.1
node-html-parser: ^7.1.0    ← Kabutan/TDnet 爬虫
axios: ^1.18.0
dayjs: ^1.11.21
zod: ^4.4.3
xlsx: ^0.18.5
```

### 开发依赖
```
tailwindcss: ^4             ← @import "tailwindcss"，无 tailwind.config.js
@tailwindcss/postcss: ^4
typescript: ^5
eslint: ^9 + eslint-config-next: 16.2.9
@types/node: ^20 / @types/react: ^19 / @types/react-dom: ^19
@types/node-cron: ^3.0.11 / @types/pg: ^8.20.0
```

### 生产服务器系统包
```
poppler-utils   # pdftotext，用于解析 JPX 空売り比率 PDF
# 验证：which pdftotext → /usr/bin/pdftotext
```

### npm scripts 完整列表
```bash
npm run dev                         # 开发服务器（port 3000）
npm run build                       # 生产构建
npx tsc --noEmit                    # 类型检查
npm run compute-scores              # 全量重算 AI 评分
npm run fetch-global-market         # Yahoo Finance → GlobalMarket
npm run fetch-short-selling         # JPX PDF → ShortSellingRatio
npm run fetch-dividend-history      # J-Quants → Dividend
npm run fetch-institutional-flow    # J-Quants → InstitutionalFlow
npm run sync-meta                   # 同步股票元数据
npm run sync-prices-recent          # 同步最近价格
npm run seed:ai-themes              # 重置 AITheme（109条）
npm run health:data                 # 运行数据健康守卫（20项检查）
npm run audit:data                  # 运行全量数据完整性审计
npm run update-backtest             # 填充未填充的 backtest cohorts（普通模式）
npm run update-backtest:force       # 强制重填所有 cohorts（--all）— pipeline 每日自动执行此命令
npm run test:intent-engine          # 意图引擎测试（需 live DB）
npm run test:intent-engine:dry      # 意图只测（SKIP_DB=1）
npm run cron                        # 启动 cron 调度器
npm run line:morning-brief          # LINE 早报（DRY_RUN=1 预览）
npm run line:midday-flash           # LINE 午间
npm run line:closing-summary        # LINE 收盘
npm run line:risk-alert             # LINE 风险预警
npm run send-daily-line             # LINE 每日推送（全版）
```

---

## 十一、关键代码规则（新 Claude 必读）

### Prisma 初始化（必须用 adapter）
```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
// scripts/ 中直接实例化；API routes 用 lib/prisma.ts singleton
```

### Next.js 16 Route Params（必须 await）
```typescript
// 服务端 API Route：
export async function GET(_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
}
// 客户端组件（"use client"）：
import { useParams } from "next/navigation";
const params = useParams();
```

### scripts/ 路径规则
```typescript
import { prisma } from "../lib/prisma";   // ✅ 相对路径
import { prisma } from "@/lib/prisma";    // ❌ scripts 不支持 @/ 别名
```

### UX 规则（v8.3 封版）
```typescript
// 禁止在任何页面本地定义 REC_CFG，必须从 lib/rec-config.ts 导入
import { getRec, returnColorClass, fmtPct, fmtJpy } from "@/lib/rec-config";
// 禁止 text-[#e74c3c] / text-[#2980b9]（旧日本惯例色），禁止 ▲▼ 符号
// 禁止 rounded-xl 用于卡片（统一 rounded-2xl）
```

### Intent Engine Pipeline（line-chat.ts / api/chat）
```
1. detectSystemCommand(text) → 命中 → handleSystemCommand() → 立即返回
2. getAiEnabled(userId) → false → 返回 PAUSE_MSG
3. parseUserIntent(text, context) → GPT JSON fallback
4. queryDatabase(intent) → DB only
5. buildWebAnswer(data) / buildLineMessages(data) → zero GPT
```

### 系统命令触发词（精确匹配）
```
START:  启动AI/开启AI/start/唤醒/激活
STOP:   关闭AI/停止/stop/休眠/暂停
RESET:  清空上下文/重置/reset/清空记忆
STATUS: 当前状态/状态/status/AI状态
```

### 价格字段规则（v8.2.2）
```
展示用：close（未复权原始价格）
计算用：adjClose ?? close（复权优先）
DailyPrice 查询必须 orderBy: { date: "desc" }, take: 300（与 compute-scores 一致）
```

### 日期处理
```typescript
const date = new Date(Date.UTC(year, month - 1, day)); // ✅ 避免 CST 时区偏移
```

---

## 十二、已知问题（低优先级）

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P3 | PortfolioDiagnosis | Schema 已建，功能待实现 |
| P3 | ShortSellingRatio 时区 bug | 2026-06-18 数据行清理（无运行时影响）|
| P3 | 本地 DB schema drift | dividendScore、ShortSellingRatio.market 列未迁移到本地 |
| P3 | H5/小程序 `PackageImages` img src | 未经 proxyImgMedium（低优先级）|

---

<a name="next-session"></a>
## NEXT SESSION — 下次启动继续位置

### 当前状态（2026-06-22 会话结束时）
- **v10.1.1 已完成并部署**（commit def9fc0）
- 回测系统完全自动化，每日 pipeline 自动执行 `update-backtest --all`
- **无需人工执行 update-backtest**，下一次 pipeline 运行（2026-06-23 08:30 JST）自动填充
- 生产回测状态：`WAITING_PRICE`（latestPriceDate=2026-06-19，等待 2026-06-23 价格同步）
- DailyRecommendation：500 条（cohort 2026-06-20），entryPrice 全部 null（等待次日开盘）

### 2026-06-23 周一预期自动流程
```
06:00 JST  → sync-all-prices（同步 2026-06-23 价格，含 open 字段）
08:30 JST  → daily-ai-pipeline
              Step 1-7: 全链路数据+评分+rerank+保存新 cohort
              Step 8: update-backtest --all
                → 填充 2026-06-20 cohort 的 entryPrice（2026-06-23 open）
                → 生成 TOP5/TOP10/TOP20/ALL × 7d 初始 BacktestResult（7d 回报尚无，需等更多天）
```

### 等待验证（周一之后）
- `curl https://aitohoshou.com/api/backtest/health` → 应返回 `status: "HEALTHY"` 或 `"PARTIAL"`
- `/backtest` 页面应显示 entryPrice 已填充
- Sync Center `/sync` 的 Backtest 卡片应从 🟡 WAITING_PRICE 变为 🟢 HEALTHY

### 下次可以做的事情

#### 选项 A：v10.2 — Backtest 功能扩展
- `/backtest` 页面历史趋势图（多 cohort 的 avgReturn 折线图）
- BacktestError 页面（管理员查看，监控缺失数据）
- 扩展至多 cohort 日期统计（当前只显示最新一个 cohort）

#### 选项 B：v10.3 — AI Pipeline 优化
- GPT rerank 失败率监控（失败超过 10% 时告警）
- `/sync` 页面显示 daily pipeline 最近执行日志

#### 选项 C：v9.x — 其他功能
- `/portfolio` 实际功能（当前仅有 Schema，页面为空）
- LINE Bot 增强（sector_outlook/stock_compare 中文回答）
- 个股页增强（新闻情绪时间轴、同行业对比）

### 新 Claude 会话开发流程
```bash
# 1. 确认生产状态
sshpass -p 'Wen565656' ssh root@8.209.247.68 'pm2 list'
curl -s "https://aitohoshou.com/api/backtest/health"
curl -s "https://aitohoshou.com/api/sync/status" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['summary'])"

# 2. 本地开发
npm run dev   # http://localhost:3000

# 3. 修改代码后类型检查
npx tsc --noEmit

# 4. 部署
npm run build
sshpass -p 'Wen565656' rsync -avz --exclude node_modules .next/ root@8.209.247.68:/opt/tohoshou/.next/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 "pm2 restart tohoshou-web --update-env"
```
