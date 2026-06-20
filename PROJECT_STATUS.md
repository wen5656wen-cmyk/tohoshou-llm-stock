# PROJECT_STATUS.md — TOHOSHOU AI 日本股票AI分析系统

> **最后更新：** 2026-06-20
> **版本：** v7.0.0（TOHOSHOU AI V3：GlobalMarket 真实数据接入）
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
id:1  tohoshou-cron  online  cron jobs
```

### 快速操作
```bash
# SSH 登录
ssh root@8.209.247.68   # 密码: Wen565656

# 部署单个文件（本地改完后）
sshpass -p 'Wen565656' scp -o StrictHostKeyChecking=no <本地文件> root@8.209.247.68:/opt/tohoshou/<目标路径>

# 服务器构建重启（⚠️ rsync 会覆盖 .env，需修复）
sshpass -p 'Wen565656' rsync -avz --exclude node_modules \
  .next/ root@8.209.247.68:/opt/tohoshou/.next/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "pm2 restart tohoshou-web"

# 查看日志
pm2 logs tohoshou-web --lines 50

# 重算 AI 评分（改了 scoring 逻辑后必须执行）
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx scripts/compute-scores.ts"

# 抓取最新全球市场数据（建议每交易日执行）
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx scripts/fetch-global-market.ts"

# 验证数据源状态
curl -s https://aitohoshou.com/api/market-data | python3 -c \
  "import sys,json; d=json.load(sys.stdin); \
   gm=d['globalMarket']; print('GlobalMarket:', gm['date'], 'score='+str(gm['score']), gm['source']); \
   print('scoringMode:', d['scoringMode'])"
```

---

## 三、数据库现状（2026-06-20 生产实测）

| 表 | 条目数 | 状态 |
|----|--------|------|
| Stock | **3,716** | ✅ TSE 全量（3716/3716 中文名 100% 覆盖）|
| DailyPrice | **7,912,513** | ✅ 全量同步完成，最新日期 2026-06-19 |
| Financial | **35,986** | ✅ J-Quants 财报 |
| StockScore | **3,714** | ✅ V3 评分引擎，全量已重算 |
| News | **1,590** | ✅ Kabutan 新闻（387条材料分类）|
| GlobalMarket | **1** | ✅ 2026-06-20，score=7，source=yahoo |
| InstitutionalFlow | **4** | ⚠️ 2026-06-20，source=synthetic（JPX 海外不可访问）|
| SyncJob | 1+ | 异步任务记录 |
| WatchList | 0 | 用户未添加 |
| LineUser | 1 | owner: U3223b03bb5879a9dabf2ce27b0f09524 |
| LineGroup | 0 | Bot 尚未加入任何群 |

---

## 四、TOHOSHOU AI 评分体系（当前版本：V3）

### 100分5维度（V2结构，V3接入真实数据）

| 维度 | 字段 | 满分 | 数据源（V3状态）|
|------|------|------|----------------|
| 技術面 | technicalScore | 30 | J-Quants 价格数据（实时）|
| 基本面 | fundamentalScore | 25 | J-Quants 财务数据（实时）|
| 資金面 | moneyFlowScore | 20 | **JPX 机构流向（当前 fallback → V2 proxy）**|
| 新闻情绪 | newsSentimentScore | 15 | Kabutan 新闻 DB（实时）|
| 全球趋势 | globalTrendScore | 10 | **Yahoo Finance NASDAQ/日経（实时 ✅）**|

### 评级阈值
```
STRONG_BUY ≥ 90
BUY        ≥ 80
HOLD       ≥ 65
WATCH      ≥ 50
AVOID      < 50
```

### 评分分布（2026-06-20，3714只）
| 评级 | 数量 |
|------|------|
| STRONG_BUY | 0 |
| BUY | 0 |
| HOLD | 410 |
| WATCH | 1463 |
| AVOID | 1841 |
| 平均分 | 49.8 / 最高分 79 |

### TOP10（截至 2026-06-20）
| 排名 | 代码 | 名称 | 总分 |
|------|------|------|------|
| 1 | 9552.T | 量化研究控股 | 79 |
| 2 | 4063.T | 信越化学工业 | 78 |
| 3 | 429A.T | Techsend光掩模 | 78 |
| 4 | 6194.T | 阿特拉埃人才科技 | 77 |
| 5 | 6235.T | Optorun | 76 |
| 6 | 6806.T | 广濑电机 | 76 |
| 7 | 4431.T | Smaregi | 76 |
| 8 | 9983.T | 迅销/优衣库 | 76 |
| 9 | 8918.T | Land不动产 | 76 |
| 10 | 6278.T | Union Tool | 75 |

---

## 五、已完成功能

### 数据同步
- [x] **Yahoo Finance Japan** — 股价实时报价（`lib/yahoo.ts` + `lib/yahooFinance.ts`）
- [x] **J-Quants** — 日线价格 + 财报（`lib/jquants.ts`，V1 认证 + 异步任务）
- [x] **Kabutan 新闻** — 关联股票新闻 + 情绪分类（`lib/kabutan.ts`，双 bug 已修复）
- [x] **TDnet** — 适时披露（`lib/tdnet.ts`，爬虫模式）
- [x] **异步同步任务** — `SyncJob` 表 + `GET /api/sync/jobs/[jobId]`，解决 504 超时
- [x] **GlobalMarket 数据** — `scripts/fetch-global-market.ts`，Yahoo Finance，每日写入 DB

### AI 评分引擎（V3）
- [x] `lib/ai-score.ts` — V3 评分引擎：真实 GlobalMarket + JPX fallback
- [x] `scripts/compute-scores.ts` — 全量3714只股票预计算，预加载 GlobalMarket/InstitutionalFlow
- [x] `scripts/fetch-global-market.ts` — Yahoo Finance 抓取 NASDAQ/VIX/USDJPY/Nikkei
- [x] `scripts/fetch-institutional-flow.ts` — JPX 机构流向抓取 + synthetic fallback
- [x] `app/api/market-data/route.ts` — 数据源状态验证 API
- [x] `lib/scoring.ts` — AIAnalysis-based 旧评分（与 ai-score.ts 分离，勿混淆）

### 前端页面（全部 HTTP 200）
- [x] `/` 首页 · `/stocks` 列表 · `/indicators` 技术指标
- [x] `/ai-picks` AI 推荐（V3 5维度，資金面/情绪/全球）
- [x] `/screener` 筛选 · `/sectors` 行业
- [x] `/stocks/[symbol]` 个股详情（SVG K线图 + OHLCV + MA5/20/60）
- [x] `/news` 新闻 · `/sync` 同步管理（含异步进度条）
- [x] `/watchlist` 关注 · `/portfolio` 持仓

### LINE Bot
- [x] `app/api/line/webhook/route.ts` — Webhook 处理（已注册并验证）
- [x] `lib/line-chat.ts` — 股票查询对话（上下文感知）
- [x] `scripts/send-daily-line.ts` — 每日 AI 推荐推送
- [x] **Webhook URL**：`https://aitohoshou.com/api/line/webhook`
- [x] LINE Owner User ID：`U3223b03bb5879a9dabf2ce27b0f09524`

### 多语言
- [x] 3716/3716 股票中文名覆盖率 100%（手动305只 + 自动3411只）

---

## 六、API 路由一览

| 端点 | 说明 |
|------|------|
| `GET /api/sync` | 同步状态总览 |
| `POST /api/sync/jquants` | J-Quants 同步（立即返回 jobId，fire-and-forget）|
| `GET /api/sync/jobs/[jobId]` | 异步任务进度查询 `{ status, processed, total, pct }` |
| `POST /api/sync/news` | Kabutan 新闻同步 |
| `POST /api/sync/yahoo` | Yahoo Finance 同步 |
| `POST /api/sync/tdnet` | TDnet 适时披露同步 |
| `GET /api/indicators` | 股票指标列表（StockScore TOP500）|
| `GET /api/ai-scores` | AI 推荐列表（TOP50，V3字段）|
| `GET /api/market-data` | GlobalMarket + InstitutionalFlow 数据源状态 ★V3新增 |
| `GET /api/stocks/[symbol]/indicators` | 个股技术指标 + OHLCV 序列（K线数据）|
| `GET /api/stocks/[symbol]/financials` | 个股财报 |
| `POST /api/line/webhook` | LINE Bot Webhook |

---

## 七、数据库 Schema（完整模型列表）

```
Stock           — 股票基本信息（3,716只 TSE，含nameZh）
Financial       — 财务数据（stockId+fiscalYear+quarter unique）
DailyPrice      — 日线OHLCV（symbol+date unique，7.9M条）
Dividend        — 配当历史
Disclosure      — TDnet适时披露
News            — Kabutan新闻（url unique，category/relatedSymbolConfidence）
AIAnalysis      — 深度AI分析（旧lib/scoring.ts使用，与StockScore分离）
Portfolio       — 持仓
SyncLog         — 同步历史日志
SyncJob         — 异步任务（id cuid, status PENDING|RUNNING|SUCCESS|FAILED）

StockScore      — AI预计算评分（symbol pk）★主要读取表
  technicalScore    Int? (0-30)
  fundamentalScore  Int? (0-25)
  moneyFlowScore    Int? (0-20)  ← riskScore 的别名（同步写入）
  newsSentimentScore Int? (0-15)
  globalTrendScore  Int? (0-10)
  riskScore         Int? (legacy alias = moneyFlowScore)
  totalScore        Int? (0-100)
  recommendation    String? (STRONG_BUY|BUY|HOLD|WATCH|AVOID)
  summaryReason     String? (含 [yahoo]/[v2_proxy] 数据源标签)
  newsSummary       String?

GlobalMarket    — 全球市场快照（V3新增）★每日写入
  date          DateTime @unique
  nasdaq        Float?   nasdaqChange Float?
  sp500         Float?   vix          Float?
  nikkei        Float?   nikkeiChange Float?
  topix         Float?   topixChange  Float?
  usdjpy        Float?
  score         Int?     (0-10, 综合得分)
  source        String   (yahoo | manual)

InstitutionalFlow — JPX机构资金流（V3新增）★目前synthetic
  date          DateTime @db.Date
  investorType  String   (foreigners|trust|corp|individual|dealer)
  market        String   @default("ALL")
  buyAmount     Float?   sellAmount Float?  netAmount Float?
  source        String   (jpx | synthetic)
  @@unique([date, investorType, market])

NotificationLog — 通知日志
TelegramUser    — Telegram用户（预留）
LineGroup       — LINE群组
LineUser        — LINE用户（userId unique，lastSymbol上下文）
WatchList       — 关注列表
```

完整 Schema 见 `prisma/schema.prisma`

---

## 八、已安装依赖（关键包）

| 包 | 版本 | 重要注意 |
|----|------|---------|
| `next` | 16.2.9 | App Router；Route Params 需 `await params` |
| `@prisma/client` | ^7.8.0 | 用 `adapter-pg`（PrismaPg），不是旧 datasource pg |
| `@prisma/adapter-pg` | ^7.8.0 | 必须与 prisma/client 同版本 |
| `yahoo-finance2` | ^3.15.3 | **v3 必须实例化** `new YahooFinance()`，见 `lib/yahooFinance.ts`；`yf.historical()` = `chart()` 的 alias，`^VIX` 某些日期 close=null 会触发 validation warning，已处理 |
| `node-html-parser` | ^7.1.0 | Kabutan 新闻爬虫 |
| `openai` | ^6.44.0 | DeepSeek API（兼容 OpenAI 接口）|
| `node-cron` | ^4.4.1 | Cron 调度 |
| `axios` | ^1.18.0 | HTTP client |
| `dayjs` | ^1.11.21 | 日期处理 |
| `zod` | ^4.4.3 | 数据验证 |

npm scripts 重要命令：
```bash
npm run compute-scores          # 全量重算 AI 评分
npm run fetch-global-market     # 抓取全球市场数据写入 GlobalMarket
npm run fetch-institutional-flow # 抓取 JPX 机构流向（当前 fallback）
npm run sync-meta               # 同步股票元数据
npm run sync-prices-recent      # 同步最近价格
npm run cron                    # 启动 cron 调度器
npm run send-daily-line         # 发送每日 LINE 推送
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

### 改 schema 后必须执行
```bash
npx prisma generate           # 本地
npx prisma db push --accept-data-loss  # 生产（无迁移历史时）
npm run build                 # prisma generate 后必须重新 build
```

### Kabutan 新闻爬虫关键修复（勿回退）
```typescript
// Bug 1: parseKabutanDate 必须有 isNaN 防护
const valid = (d: Date) => !isNaN(d.getTime()) ? d : null;
// Bug 2: category 在 <div> 上
const catEl = row.querySelector(".newslist_ctg");  // 正确
```

### V3 数据来源标签（summaryReason 中）
```
[yahoo]    = globalTrendScore 来自 Yahoo Finance 实时数据
[v2_proxy] = moneyFlowScore 来自 V2 return60d 代理（JPX 不可用时）
[jpx]      = moneyFlowScore 来自真实 JPX 机构流向（未来）
```

### rsync 部署注意
```
⚠️ rsync 会覆盖生产 .env！每次 rsync 后必须通过 ssh sed 修复 .env
```

---

## 十、部署流程

```bash
# 标准部署（改了前端/API）
npm run build
sshpass -p 'Wen565656' rsync -avz --exclude node_modules \
  .next/ root@8.209.247.68:/opt/tohoshou/.next/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "pm2 restart tohoshou-web"

# 改了 prisma schema → 额外步骤
npx prisma generate
sshpass -p 'Wen565656' scp prisma/schema.prisma root@8.209.247.68:/opt/tohoshou/prisma/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx prisma generate && npm run build && pm2 restart tohoshou-web"

# 改了 scoring 逻辑 → 重算评分
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx scripts/compute-scores.ts"

# 验证
curl -s https://aitohoshou.com/api/market-data
```

---

## 十一、已知问题 & TODO

### 优先级说明：P0=阻塞 P1=重要 P2=中等 P3=低

### P1 — V3 数据源改进

#### InstitutionalFlow（JPX 机构资金流）
- [ ] **JPX 数据当前不可用**：`www.jpx.co.jp` 从海外服务器（Alibaba HK）不可访问，
  `scripts/fetch-institutional-flow.ts` 始终 fallback 写 synthetic 中性数据
- **影响**：`moneyFlowScore` inflow 组件对所有股票使用 V2 proxy（`calcInflow(return60d)`）
- **备选方案**：① 使用日本 IP 的 VPN/代理抓取 ② 替代数据源（Investing.com、Bloomberg 日本市场流向）③ 手动上传每周 CSV

#### VIX 数据
- [ ] `^VIX` 通过 `yf.historical()` 获取时某些日期 close=null（Yahoo Finance V3 schema 验证问题）
  → 当前使用 1.5 分中性值，不影响评分稳定性
- **改进**：改用 `yf.quote('^VIX')` 获取实时 VIX 报价（更可靠）

### P2 — LINE 智能推送升级
- [x] **每日早报**：`scripts/send-morning-brief.ts`，08:00 JST，HOLD+ TOP5 + 全球市場
- [x] **午间快报**：`scripts/send-midday-flash.ts`，12:30 JST，異動株 + MACD シグナル
- [x] **收盘总结**：`scripts/send-closing-summary.ts`，15:45 JST，市場총括 + 底打ち候補
- [x] cron-scheduler.ts：05:30/08:00/12:30/15:45 JST 已加入
- [ ] **Flex Message 卡片**：升级现有文本消息为富文本卡片格式（待开发）

### P2 — 数据源
- [ ] **TDnet 真实数据**：当前 `lib/tdnet.ts` 大多数时候 fallback 到 mock 数据
- [ ] **J-Quants 定时同步**：当前需手动触发

### P3
- [ ] LINE Bot 群组功能
- [ ] News 页面关键词搜索 / 按股票过滤
- [ ] V3 第二阶段：新闻情绪真实接入（TDnet 公告扩充 Kabutan 覆盖率）

---

## <a id="next-session"></a>NEXT SESSION — 下次启动继续位置

### 当前状态（2026-06-20，v7.0.0）

#### 已完成
- ✅ **TOHOSHOU AI V1** — 基础5维度评分体系（AIAnalysis 路线，`lib/scoring.ts`）
- ✅ **TOHOSHOU AI V2** — 100分新5维度（技術/基本/資金/情绪/全球，`lib/ai-score.ts`）
- ✅ **TOHOSHOU AI V3 第一阶段** — 真实全球市场数据接入（Yahoo Finance → GlobalMarket DB）
- ✅ **V1 残留全部清零** — 全站 "安全性" 改为 "資金面"，评分描述更新为5维度
- ✅ **3714只股票 V3 评分已重算完成**（生产）

#### 当前 scoring 状态
```
globalTrendScore  ← Yahoo Finance 实时 ✅（每次 compute-scores 前需先 fetch-global-market）
moneyFlowScore    ← V2 proxy（return60d）⚠️ JPX 不可用 fallback
newsSentimentScore← Kabutan DB 实时 ✅
technicalScore    ← J-Quants 价格 ✅
fundamentalScore  ← J-Quants 财务 ✅
```

### 下次第一件事（推荐2选1）

#### 选项 B — JPX 机构流向替代方案（半天）
为 `scripts/fetch-institutional-flow.ts` 增加备用数据源：
Investing.com 日本市场机构买卖（周报页面），或改为手动上传模式（上传 JPX CSV 到 `/api/admin/upload-jpx-flow`）

#### 选项 D — LINE Flex Message 卡片升级（1天）
将现有文本消息升级为 LINE Flex Message 富文本卡片格式：
- 朝報カード：株名 + スコア + 変化率バー + ボタン（詳細リンク）
- 大引けカード：市場スコアゲージ + TOP3 銘柄一覧
- 实现方法：`lib/line.ts` 增加 `flexMsg()` helper，调整各推送脚本

### 快速健康检查

```bash
# 生产状态
curl -s https://aitohoshou.com/api/market-data

# 评分分布
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx -e \"
const {PrismaClient}=require('@prisma/client');
const {PrismaPg}=require('@prisma/adapter-pg');
const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
p.stockScore.groupBy({by:['recommendation'],_count:{recommendation:true}}).then(r=>{console.log(r);p.\$disconnect()})
\""

# PM2 状态
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 'pm2 list'

# 最新日志
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  'pm2 logs tohoshou-web --lines 10 --nostream 2>/dev/null | tail -15'
```
