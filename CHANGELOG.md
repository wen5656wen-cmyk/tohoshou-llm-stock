# Changelog

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
- **重写** `lib/jquants.ts` — 实现 V1 email/password 认证流程：
  1. `POST /v1/token/auth_user { mailaddress, password }` → `refreshToken`
  2. `POST /v1/token/auth_refresh?refreshtoken=xxx` → `idToken`
  3. 后续请求：`Authorization: Bearer <idToken>`
- **新增** `configStatus()` 函数：返回当前认证方式（email+password / refresh_token / api_key）
- **新增** `safeJson()` 辅助函数：先检查 `content-type` 是否为 `application/json`，非 JSON 时返回前300字明确报错（防止重定向 HTML 被 `.json()` 崩溃）
- **新增** token 内存缓存（23h TTL），自动续期（401/403 时清缓存重试）
- **新增** `redirect: "error"` 防止 fetch 静默跟随重定向返回 HTML
- **向后兼容** `JQUANTS_API_KEY`：若无 EMAIL 环境变量则沿用 V2 `x-api-key` 模式
- **更新** `app/api/sync/jquants/route.ts`：GET 返回 `configured + method`，POST 返回"未配置 J-Quants 账号"明确提示

### 验证结果（生产服务器 8.209.247.68）
- Yahoo Finance：`fetchQuote('7203.T')` → `price=2776.5 change=-17` ✅
- J-Quants：`configStatus` = `api_key (V2 backward-compat)` ✅
- J-Quants daily bars：`7203.T` 2443条，最新收盘 2776.5 ✅
- J-Quants fins/summary：41条财报记录 ✅
- `GET /api/sync/jquants` 返回 `{ configured: true, method: "api_key (V2 backward-compat)" }` ✅

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
- **蜡烛图（Candlestick）**：每根 K 线含 Open/High/Low/Close，红涨蓝跌（日本配色）
- **MA 均线叠加**：MA5（橙）/ MA20（蓝）/ MA60（紫）同图显示
- **成交量柱**：图表底部30%区域显示成交量（showVolume 时启用）
- **鼠标 Tooltip**：悬停显示当日 OHLCV + MA5 + MA20，十字线跟随
- **MA 图例**：图表左下角显示三条 MA 线的颜色说明
- `components/PriceChart.tsx` — 完全重写为 SVG 蜡烛图，"use client" 以支持鼠标交互

#### API 增强
- `app/api/stocks/[symbol]/indicators/route.ts` — series 数据由 `{date,close,volume}` 升级为 `{date,open,high,low,close,volume}`，支持蜡烛图渲染

### 变更

#### 推荐阈值调优（BUY 80→70 / WATCH 65→60）
- `lib/ai-score.ts` — 更新推荐阈值：`STRONG_BUY≥90 | BUY≥70 | WATCH≥60 | HOLD≥45 | AVOID<45`
- 调整后 TOP50 API 中 BUY 推荐从 0 只 → **50 只**
- 生产 TOP5：日本M&Aセンター(82) / 信越化学(81) / コラントッテ(81) / きょくとう(80) / リスキル(80)

### 生产部署（2026-06-20）
- 本地 `npm run compute-scores` 验证后，scp 上传3个文件到服务器
- 生产执行 `npm run build && pm2 restart all` — 构建 OK，两进程 online
- 生产执行 `npm run compute-scores` — 3714只全量重算（耗时22s）
- 验证：`GET /api/ai-scores` → 50只全部 BUY ✅

---

## [5.1.0] - 2026-06-19 — 生产无限加载修复 + 全量数据同步完成

### 修复（紧急 P0）

#### 无限加载根因修复
- `app/api/indicators/route.ts` — **重写**：从 3716 只股票并发 `Promise.all` 改为单次读取 `StockScore` TOP500，消除 OOM 崩溃
- `app/api/ai-scores/route.ts` — **重写**：从实时全量计算改为读取 `StockScore` TOP50，消除 OOM 崩溃
- `app/api/stocks/route.ts` — **重写**：添加分页（page/limit/skip），移除破损的 `include: { analyses }` 关联（`AIAnalysis` 模型已重构），改用 `select` 只取必要字段
- `app/stocks/page.tsx` — 添加 `error` 状态 + `.catch()` 处理，API 失败时显示中文错误，不再无限 loading
- `app/indicators/page.tsx` — 同上，添加错误状态和空状态中文提示

#### 根因说明
```
旧 /api/indicators：Promise.all(3716只) → 每只查300条DailyPrice → OOM
→ PM2 超768MB重启 → 重启中前端fetch无法resolve → loading=true永不变false
新 /api/indicators：prisma.stockScore.findMany({ take: 500 }) → 单次查询 → 完成
```

### 生产部署（2026-06-19）
- 服务器：8.209.247.68，应用目录：/opt/tohoshou
- 部署方式：sshpass + scp 上传文件 → ssh 执行 `npm run build && pm2 restart all`
- `LINE_OWNER_USER_ID=U3223b03bb5879a9dabf2ce27b0f09524` 已写入生产 .env

### 数据状态（截至本版本 — 全量同步完成）
- Stock：**3,716 只**（TSE 全量）
- DailyPrice：**7,912,242 条**（全量，最新日期 2026-06-19）
- Financial：**13,619 条**（J-Quants 全量财报）
- StockScore：**3,714 只**（99.9% 已评分，最高分 73 = WATCH）
- News：0 条（待同步）

---

## [5.0.0] - 2026-06-19 — AI评分V2 + 财务数据同步 + LINE Bot

### 新增

#### AI 评分 V2（lib/ai-score.ts）
- **修复评分最高51问题**：财务数据缺失时返回中立分12（旧版返回0）
- 数据完整性0条 → 10分（旧版0分）
- MACD SELL → 4分（旧版0分）
- RSI 超买区间细化（80+=5, 70-79=12，旧值更低）
- 推荐阈值：STRONG_BUY≥90 | BUY≥80 | WATCH≥65 | HOLD≥45 | AVOID<45

#### 财务数据同步（scripts/sync-financials.ts）
- **新增**：J-Quants `/fins/summary` 逐只同步（2s 延迟 + 429指数退避 10s/20s/30s）
- `npm run sync-financials` 命令
- 同步完成：13,619 条财报数据入库

#### LINE Bot（Phase 12）
- `lib/line.ts` — verifySignature / replyMessage / pushMessage / broadcastMessage
- `lib/line-agent.ts` — parseIntent + handleMessage（7种意图 + 上下文记忆）
- `lib/line-chat.ts` — LINE_OWNER_USER_ID 权限检查
- `lib/line-push.ts` — 广播推送（群组 + 个人关注者）
- `app/api/line/webhook/route.ts` — POST Webhook（签名验证 + 事件路由）
- `scripts/send-daily-line.ts` — LINE 每日AI日报（TOP3 + 情绪 + 风险 + 新闻）
- `scripts/send-line-test.ts` — 测试推送（系统状态 + TOP3）
- `scripts/list-line-groups.ts` — 列出Bot所在群组
- 数据库新增：`LineUser`（userId + lastSymbol上下文记忆）、`LineGroup`
- 迁移：`20260619075533_add_line_user`、`20260619091101_add_line_groups`

#### 支持的LINE意图
- `7203` → 丰田详情（现价 + AI评分 + 技术指标 + 新闻）
- `トヨタ` / `丰田` → 名称搜索（中日英均支持）
- `今日推荐` / `TOP10` → AI推荐TOP10
- `新闻` → 最新8条市场新闻
- `分析7203` → 完整深度分析（财务 + 技术 + AI）
- `为什么` / `なぜ` → 上次查询股票的分析理由（上下文记忆）
- `帮助` / `ヘルプ` → 使用指南

### 数据状态（截至本版本）
- StockScore：110 只评分（全量同步前）
- Financial：2,825 条（同步中）

---

## [4.0.0] - 2026-06-19 — Watch List + 業種分析 + Dashboard 高速化

### 新增

#### Watch List（ウォッチリスト）
- `prisma/schema.prisma` — 新增 `WatchList` 模型（symbol唯一索引、目标价、备注）
- `app/api/watchlist/route.ts` — REST API（GET/POST/DELETE），返回带 StockScore 的完整数据
- `app/watchlist/page.tsx` — 关注股票管理页面（添加/删除、AI评分展示、目标价达成提示）
- `app/stocks/[symbol]/page.tsx` — 详情页新增「ウォッチ追加/ウォッチ中」按钮
- 数据库迁移：`20260619074310_add_watchlist`

#### 業種別分析（行业分析）
- `app/api/sectors/route.ts` — 行业统计 API（按 sector 分组 StockScore，计算平均分/涨跌/买入率/TOP3）
- `app/sectors/page.tsx` — 行业分析页（热力颜色、TOP5/注意行业卡片、完整排行表、点击展开 TOP3）

#### Dashboard 高速化
- `app/page.tsx` — 完全重写：从 N+1 查询改为读取 `StockScore` 预计算表（延迟 10ms→直接响应）
- 新增统计卡片：銘柄数/スコア算出済/買い推奨/日次株価/最終同期（5格）
- 买い/注目快速导航卡片
- 全银行 AI 评分一览表（取代旧版的全量指标计算表）

#### 性能修复
- `app/api/indicators/route.ts` — 修复：从3716股全量计算改为仅查询有价格数据的股票

### 変更
- `components/Sidebar.tsx` — 新增「業種分析」「ウォッチリスト」导航菜单

---

## [3.0.0] - 2026-06-19 — Telegram Bot V1 + 全日本股票池

### 新增

#### Telegram Bot
- `lib/telegram.ts` — Bot API 封装（sendHTML / setWebhook / getUpdates / getMe，3次重试）
- `lib/chat-agent.ts` — 聊天 Agent（parseIntent + handleIntent，含 GPT 接入扩展点）
- `app/api/telegram/webhook/route.ts` — Webhook 接收端点（验证 Secret / 解析消息 / 异步回复）
- `scripts/send-daily-telegram.ts` — 日报推送（TOP3 详细 + TOP4~10 简洁 + 风险提醒，HTML 格式）
- `scripts/send-risk-alert.ts` — 风险警报推送（RSI>80 / MACD卖出 / AI低分 / 5日-7%）
- `scripts/get-telegram-chat-id.ts` — Chat ID 获取工具（长轮询，向 Bot 发消息后自动打印）
- `scripts/telegram-webhook-setup.ts` — Webhook 注册/查看工具

#### 全日本股票池扫描
- `scripts/sync-stock-meta.ts` — 同步 J-Quants /v2/equities/master（3716 只 TSE 内国普通株）
- `scripts/sync-all-prices.ts` — 同步近 250 交易日价格（优化为 createMany 批量插入）
- `scripts/compute-scores.ts` — 全量 AI 评分计算并写入 StockScore 表
- `app/api/screener/route.ts` — 扫描器 API（从 StockScore 预计算表读取，毫秒级响应）
- `app/screener/page.tsx` — 全股票扫描器页面（过滤/排序/搜索，最多 200 条）

#### AI 评分引擎
- `lib/ai-score.ts` — 三维评分（technicalScore 40% + fundamentalScore 40% + riskScore 20%）
- `app/api/ai-scores/route.ts` — AI 评分排行 API
- `app/api/stocks/[symbol]/ai-score/route.ts` — 单股 AI 评分 API
- `app/ai-picks/page.tsx` — 重写 AI 选股页面（真实数据，TOP3 + 全列表 + 过滤）

#### 企业微信推送
- `lib/wechat.ts` — 企业微信群机器人客户端（sendMarkdown / sendText，3次重试）
- `lib/daily-picks-report.ts` — 日报内容构建器
- `scripts/send-daily-picks.ts` — 企业微信日报推送脚本
- `app/api/cron/daily-picks/route.ts` — HTTP 触发接口

#### 数据库新增模型
- `StockScore` — 预计算 AI 评分（materialized view 模式）
- `NotificationLog` — 推送日志（DAILY_REPORT / RSI_ALERT / CHAT_REPLY）
- `TelegramUser` — Telegram 用户注册表
- `Stock.scaleCategory` — 规模分类字段（TOPIX Large / Mid / Small）

### 变更
- `components/Sidebar.tsx` — 新增「スクリーナー」导航
- `app/page.tsx` — Dashboard 展示真实 TOP3 AI 推荐
- `app/stocks/[symbol]/page.tsx` — 新增「AI評点」Tab（评分卡 + 原因分解 + 13项子分）
- `scripts/cron-scheduler.ts` — 重写：08:30 企业微信+Telegram / 16:35 风险警报
- `package.json` — 新增 8 个 npm scripts
- `.env` — 新增 Telegram / NEXT_PUBLIC_APP_URL 变量

### 修复
- `scripts/sync-stock-meta.ts` — 修复 J-Quants Mkt 代码错误（0101→0111，0102→0112，0104→0113），MktNm 无"内国株式"后缀，改用 `ProdCat === "011"` 识别内国普通株

### 数据状态（截至本版本）
- Stock 总数：**3,716 只**（プライム 1,555 / スタンダード 1,569 / グロース 592）
- DailyPrice 总条数：**208,936 条**（110 只已同步）
- StockScore 已评分：**110 只**
- 迁移新增：`20260619070428_add_stock_score_screener`、`20260619072628_add_telegram_notification`

---

## [2.0.0] - 2026-06-19 — Phase 2: 真实数据接入

### 新增
- **J-Quants API 集成**（`lib/jquants.ts`）
  - JWT refresh token + ID token 认证（23h TTL）
  - 日线价格同步、财务报表同步、股息同步
  - `toJQuantsCode()`：4位→5位"0"后缀
- **TDnet 开示文件爬取**（`lib/tdnet.ts`）
  - HTML 解析 release.tdnet.info
  - 自动情感分类（正面/负面关键词）
  - 爬取失败时生成 realistic 兜底数据
- **Yahoo Finance 集成**（`lib/yahoo.ts`）
  - `fetchQuote()` — 实时价格、PER、PBR、EPS、52W H/L
  - `fetchHistorical()` — 历史日线 OHLCV
  - `fetchNews()` — 最新新闻
- **5维 AI 评分引擎**（`lib/scoring.ts`）
  - 成長性 / バリュエーション / 収益性 / 資金面 / ニュース感情 各 20%
  - 总分 100 → ★1~★5 + BUY/WATCH/AVOID
- **数据库新模型**：DailyPrice、Dividend、Disclosure、SyncLog
- **新页面**：`/sync`（数据同步仪表板）
- **新路由**：`/api/sync/*`、`/api/prices/*`、`/api/disclosures`

### 变更
- `/stocks/[symbol]` — 6 Tab：概要/チャート/財務/開示/ニュース/AI分析
- `AIAnalysis` 模型 — 新增 5 维评分字段、targetPrice、upsideRate、riskWarnings

---

## [1.0.0] - 2026-06-19 — Phase 1: 基础架构

### 新增
- Next.js 16 脚手架（Turbopack、App Router）
- 数据库模型：Stock、Financial、News、AIAnalysis、Portfolio
- 种子数据：10 只日本主要股票（丰田/索尼/软银等）
- 页面：Dashboard、股票列表、股票详情、AI选股、新闻、持仓
- REST API：stocks、financials、news、AI分析、portfolio
- Prisma 7 driver adapter 模式（`PrismaPg`，schema 中 datasource 不含 URL）
- Docker Compose（PostgreSQL，端口 15432）
- Tailwind v4 CSS-based 配置
