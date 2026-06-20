# Changelog

---

## [7.5.0] - 2026-06-20 — 动态权重评分 + GPT Phase 1（稳定基线）

### 概述
- **TOHOSHOU AI V4（动态权重评分）**：`adaptiveScore` 按 6 种股票风格（StockStyle）对 5 维度差异化加权，脱离固定权重
- **v7.5 新增字段**：`rawScore / adaptiveScore / stockStyle / highRiskFlag / fxSensitivity / catalystScore`
- **GPT Phase 1**：接入 GPT-4o-mini，`POST /api/chat` 处理 4 种自然语言意图，全部数据来自 DB，无幻觉
- **OpenAI baseURL 固定**：`lib/openai.ts` + `lib/ai-agent.ts` 均显式 pin `https://api.openai.com/v1`，防 `OPENAI_BASE_URL=deepseek` 劫持
- **localhost 全站清零**：所有实际 URL 统一至 `https://aitohoshou.com`，grep 0 处匹配

### 新增文件
- `lib/openai.ts` — GPT-4o-mini 客户端，显式 pin OpenAI baseURL；`isOpenAIConfigured()`；DB-grounded 规则注释
- `lib/llm/client.ts` — 统一 LLM 客户端工厂（`llmClient()` / `LLM_MODEL()` / `isLLMConfigured()`）
- `lib/llm/router.ts` — Intent Router（quickParse 正则快路 + GPT JSON 模式慢路）；返回 8 种 `LLMIntent` 类型
- `app/api/chat/route.ts` — `POST /api/chat`；4 意图：today_picks / stock_analysis / theme_best / theme_outlook；DB 取数 + GPT 格式化；OPENAI_API_KEY 缺失时返回 503
- `app/api/stocks/[symbol]/alternatives/route.ts` — 同风格替代股，优先同行业，最多5只，按 adaptiveScore 排序
- `prisma/migrations/20260620_add_ai_themes/` — AITheme 表迁移（已应用）
- `prisma/migrations/20260620_score_source_fields/` — StockScore 新字段迁移（已应用）

### 修改文件
- `prisma/schema.prisma` — StockScore 新增 6 字段：`rawScore / adaptiveScore / stockStyle / highRiskFlag / fxSensitivity / catalystScore`；新增 `PortfolioDiagnosis` 模型
- `lib/ai-score.ts` — 新增 `StockStyle` 类型 / `STYLE_WEIGHTS` map / `classifyStockStyle()` / `computeAdaptiveScore()` / `computeFxSensitivity()` / `computeCatalystScore()`；`ScoreInput` 扩展 sector/industry/scaleCategory/disclosureCategories；`AiScoreResult` 扩展全部 v7.5 字段
- `lib/ai-agent.ts` — **修复 baseURL 劫持 bug**：当 `OPENAI_API_KEY` 存在时强制 `https://api.openai.com/v1` + `gpt-4o-mini`，不再被 `OPENAI_BASE_URL=deepseek` 覆盖
- `scripts/compute-scores.ts` — 新增 disclosure 查询 + sector/industry/disclosureCategories 传入 + 全部 v7.5 字段写入 scorePayload
- `app/api/ai-scores/route.ts` — select + mapping 新增 v7.5 字段及默认值
- `lib/app-url.ts` — 新增（v7.4.0），本次复用；已覆盖所有 LINE Flex 按钮 + 脚本 URL
- `lib/daily-picks-report.ts` — `aiPicksUrl()` 替换 hardcoded localhost
- `scripts/send-daily-picks.ts` — 同上

### v7.5 评分体系

#### 6 种 StockStyle 及权重分配
| 风格 | 技术 | 基本面 | 资金 | 新闻 | 全球 |
|------|------|--------|------|------|------|
| VALUE_DEFENSIVE | 15% | 50% | 15% | 10% | 10% |
| GROWTH_MOMENTUM | 35% | 20% | 25% | 10% | 10% |
| QUALITY_COMPOUNDER | 25% | 35% | 20% | 10% | 10% |
| SPECULATIVE_MOMENTUM | 40% | 10% | 30% | 15% | 5% |
| CYCLICAL_EXPORTER | 30% | 20% | 20% | 10% | 20% |
| DOMESTIC_DEFENSIVE | 20% | 35% | 25% | 15% | 5% |

#### 新字段说明
- `rawScore`：等同原 `totalScore`（向后兼容）
- `adaptiveScore`：各维度归一化 0→1 后按风格权重加权 ×100
- `stockStyle`：6 种风格之一（sector + 财务特征分类）
- `highRiskFlag`：SPECULATIVE_MOMENTUM 且近期大涨时为 true
- `fxSensitivity`：EXPORT_POSITIVE / IMPORT_SENSITIVE / FX_NEUTRAL / DOMESTIC_NEUTRAL
- `catalystScore`：TDnet 公告类别打分（baseline=5，增发−3，业绩修正+3 等）

### GPT Phase 1 — `/api/chat` 验收结果
| 查询 | Intent | 字数 | 无幻觉 | DB数据 |
|------|--------|------|--------|--------|
| 今天买什么？ | top_picks | 418 | ✅ | ✅ StockScore TOP5 |
| 分析7203 | stock_analysis | 312 | ✅ | ✅ ¥2,776.5 score=46 |
| 科技股谁最强？ | theme_best | 288 | ✅ | ✅ 情報通信セクター |
| 半导体还能买吗？ | theme_outlook | 253 | ✅ | ✅ GlobalMarket+InstitutionalFlow |

### alternatives API 验收结果
- 7203.T (CYCLICAL_EXPORTER, adaptive=46) → 5只，最高 6161.T adaptive=73
- 8035.T (CYCLICAL_EXPORTER, adaptive=68) → 5只
- 9983.T (VALUE_DEFENSIVE, adaptive=67) → 1只（3333.T adaptive=68）

### 规则（勿改）
- `rawScore/adaptiveScore` 均不影响 `recommendation`（仍按 `totalScore` 的 ≥90/80/65/50 阈值）
- 禁止为提升 BUY 数量而调高 adaptive 评分或降低 BUY 阈值
- GPT 回复必须来自 DB；DB 无数据时返回"暂无真实数据"

---

## [7.4.0] - 2026-06-20 — LINE 对话入口 V2 + 全链接修复

### 新增
- `lib/app-url.ts`: 中央 URL 工具（getBaseUrl / normalizeSymbolForUrl / stockUrl / aiPicksUrl 等8个函数）
- LINE 对话 V2：7个新意图（AI推荐/科技股/全市场/新闻/通知/持仓/帮助）→ 返回 Flex Message
- `lib/line-flex.ts` 新增 7 个 V2 构建器：buildAiPicksChatFlex / buildAiThemeChatFlex / buildMarketSummaryFlex / buildNotificationStatusFlex / buildHelpFlex / buildWelcomeFlex / buildGroupJoinFlex
- `scripts/validate-line-links.ts`: 全量验证所有 LINE Flex 按钮 URL（+HTTP 200 检查）
- `npm run validate:line-links`: 部署前必跑验证

### 修复
- 修复所有 LINE Flex Message 按钮 URL（之前 `line-agent.ts` fallback 为 `localhost:3000`）
- webhook 返回类型从 `string | null` 升级为 `LineMessage[] | null`（支持 Flex 直接返回）
- Follow/Join 欢迎消息改为 V2 Flex Card
- `lib/line-agent.ts` APP_URL localhost 错误 fallback → 使用 `getBaseUrl()`

### 验证结果
- validate:line-links → 0错误，9核心页面全部 HTTP 200
- 所有 Flex 按钮 URL: https://aitohoshou.com/* 正确
- normalizeSymbolForUrl: 7203→7203.T, 291A→291A.T ✅

---

## [7.3.0] - 2026-06-20 — LINE 中文名 + Flex Message 智能推送

### 概述
- **全面 Flex Message 升级**：所有 LINE 推送改为 LINE Flex Message 富文本卡片，禁止纯文本股票列表
- **股票中文名统一**：新增 `getStockDisplayName()` 工具，所有推送优先显示 nameZh
- **通知管理系统**：新增 `/notifications` 管理页、`NotificationSetting` DB 模型、6 个 API 路由
- **异动提醒**：新增 `check-alerts.ts` 每30分钟检测价格涨跌≥5%/出来高≥2x/HIGH新闻，去重推送

### 新增文件
- `lib/stock-display-name.ts` — `getStockDisplayName(nameZh→name→nameEn→symbol)` / `getStockSubName()`
- `lib/line-flex.ts` — 7个 Flex Message 构建器：`buildMorningReportFlex` / `buildMiddayFlex` / `buildCloseReportFlex` / `buildAlertFlex` / `buildRiskAlertFlex` / `buildStockCard` / `buildTestFlex`
- `scripts/check-alerts.ts` — 异动提醒脚本（价格涨跌≥5% / 出来高≥2x / HIGH新闻）
- `app/notifications/page.tsx` — 通知管理页（测试按钮 + 设置 + 日志）
- `app/api/line/test-flex/route.ts` — `POST /api/line/test-flex`
- `app/api/notifications/settings/route.ts` — GET/POST 通知设置
- `app/api/notifications/logs/route.ts` — GET 推送日志
- `app/api/notifications/send-morning-report/route.ts` — POST 立即发送朝報
- `app/api/notifications/send-close-report/route.ts` — POST 立即发送大引けまとめ
- `app/api/notifications/check-alerts/route.ts` — POST 触发异动检查

### 修改文件
- `lib/line.ts` — 新增 `LineFlexMessage` / `FlexBubble` / `FlexCarousel` 等所有 Flex 类型 + `flexMsg()` 构建器
- `lib/line-push.ts` — export `flexMsg`
- `scripts/send-morning-brief.ts` — 改为 `buildMorningReportFlex`，写入 NotificationLog
- `scripts/send-closing-summary.ts` — 改为 `buildCloseReportFlex`，写入 NotificationLog
- `scripts/send-midday-flash.ts` — 改为 `buildMiddayFlex`，写入 NotificationLog
- `scripts/send-line-risk-alert.ts` — 改为 `buildRiskAlertFlex`，写入 NotificationLog
- `scripts/cron-scheduler.ts` — 新增每工作日 09:00-16:00 每30分钟 `check-alerts.ts`
- `components/Sidebar.tsx` — 新增"🔔 通知管理"导航
- `prisma/schema.prisma` — 更新 `NotificationLog`（symbols String[], errorMessage），新增 `NotificationSetting`
- `package.json` — 新增 `line:check-alerts` / `line:check-alerts:dry` npm scripts

### Flex Message 设计规范
- **颜色**：BUY=#27AE60(绿) WATCH=#E67E22(橙) AVOID=#C0392B(红) 按钮=#3B82F6(蓝)
- **日本股价色**：涨=红 跌=蓝（日本惯例）
- **名称优先级**：nameZh → name(nameJa) → nameEn → symbol（不允许空白）
- **每报最多 TOP5**，每条包含：中文名/代码/AI评分/推荐等级/理由/涨跌幅

---

## [7.2.0] - 2026-06-20 — V3.1 J-Quants 机构资金实时接入 + 日本科技股主题筛选

### 概述
- **TOHOSHOU AI V3.1**：资金面评分升级为 J-Quants `/v2/equities/investor-types` 真实数据，3714只股票全部 scoreSource=REAL
- **日本科技股・AI产业链**：新增 `/ai-theme` 主题筛选页，覆盖 6 分类 38 只核心科技股

---

### V3.1 — J-Quants 机构资金流接入

#### `scripts/fetch-jquants-investor-types.ts`（新增）
- 调用 J-Quants `/v2/equities/investor-types`，获取 TSEPrime/TSEStandard/TSEGrowth 三市场
- 9种投资者类型：foreigners/trust/corp/individual/dealer/trust_bank/insurance/bank/other
- API 单位 ¥1 → 除以 1e8 → 億円写入 DB
- source = `"jquants_investor_types"`，authority rank = 1（最高）
- 支持 `--dry-run`、`--weeks=N` 参数
- npm scripts：`sync:institutional-flow` / `sync:institutional-flow:dry`

#### 数据权威体系（新增）
- **AUTHORITY_RANK**：`jquants_investor_types(1) = jpx(1) > jpx_file(2) > jpx_manual(3) > synthetic(99)`
- `StockScore` 新增 3 字段：`moneyFlowSource` / `globalTrendSource` / `scoreSource`
- `computeScoreSource()`：REAL = 两维度均真实；PARTIAL = 一个；FALLBACK = 无
- `REAL_MONEY_SOURCES`（`lib/ai-score.ts` 两处）= `["jquants_investor_types","jpx","jpx_file","jpx_manual"]`

#### `scripts/compute-scores.ts` 加固
- 优先选 `REAL_FLOW_SOURCES` 查 InstitutionalFlow，不被 synthetic 日期抢占最新位
- `FLOW_MAX_AGE_DAYS` 从 14 → 21 天（周度数据，允许3周内有效）
- J-Quants 数据自动用 market="TSEPrime"，legacy/synthetic 用 market="ALL"

#### `scripts/cron-scheduler.ts`
- 新增：**周五 16:30 JST** → `fetch-jquants-investor-types.ts`（正式）
- 新增：**周一 07:15 JST** → `fetch-jquants-investor-types.ts`（备份）

#### Synthetic 数据清零
- 本地 DB + 生产 DB 全部 synthetic 行已删除（4行）
- `scripts/fetch-institutional-flow.ts` 旧脚本不再自动写 synthetic
- 永不再写入 synthetic

#### `app/api/sync/route.ts` V3.1 升级
- GET 返回 `dataAuthority` 块：GlobalMarket 状态 / InstitutionalFlow 状态 / scoreSourceDist
- InstitutionalFlow 查询：优先查真实 sources，fallback 才用最新任意行
- `app/sync/page.tsx`：`isReal` 检查补全 `jquants_investor_types`，修复"SYNTHETIC"误显

#### 生产结果（2026-06-20）
```
InstitutionalFlow: 216行 jquants_investor_types（无 synthetic）
最新日期: 2026-06-12  外国人净=-4.9億円  投信净=+0.9億円
scoreSource: REAL 3714 / 100%
```

---

### AI 科技股主题筛选

#### `prisma/schema.prisma` — 新增 `AITheme` model
```prisma
model AITheme {
  id        Int      @id @default(autoincrement())
  symbol    String   @unique
  theme     String   // SEMICONDUCTOR|ELECTRONICS|SOFTWARE_AI|INDUSTRIAL_AUTO|TELECOM_DC|TECH_SERVICES
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([theme])
  @@map("ai_themes")
}
```

#### `scripts/seed-ai-themes.ts`（新增）
- 38只日本核心科技股，6分类
- seed 策略：先全量 deleteMany 再重建，避免旧 symbol 残留
- npm scripts：`seed:ai-themes`

| 分类 | key | 数量 |
|------|-----|------|
| 半导体设备 | SEMICONDUCTOR | 6 |
| 电子・传感器・精密 | ELECTRONICS | 7 |
| 软件・AI・云 | SOFTWARE_AI | 9 |
| 工业自动化・机器人 | INDUSTRIAL_AUTO | 5 |
| 通信・数据中心 | TELECOM_DC | 5 |
| 科技服务・互联网 | TECH_SERVICES | 6 |

#### `app/api/ai-theme/route.ts`（新增）
- 查 AITheme 全部 symbol → 分批查 StockScore（scored=true）+ Stock 表（unscored）
- 两者都无则用 `SYMBOL_NAME_FALLBACK`（9613.T NTT Data / 9719.T SCSK）
- 返回：`{ stocks[], themeSummary[], totalCount, scoredCount, updatedAt }`
- themeSummary 含：avgScore / buyCount / count / scoredCount / topSymbol

#### `app/ai-theme/page.tsx`（新增）
- 标题：「日本科技股・AI产业链」+ 「科技主题」标签
- 统计面板：科技股总数 / 已评分数量 / 平均分 / BUY数量 / 最高分
- 分类汇总卡（6张，可点击跳转 Tab）
- Tab 切换：全部 / 6分类
- 排序：综合评分 / 5日涨跌 / 20日涨跌
- 股票卡：5维度评分条 + 涨跌幅 + AI摘要，unscored 显示"评分待生成"

#### `components/Sidebar.tsx` 更新
- 在"AI推荐"后新增 `⚡AI产业链` 导航项，链接 `/ai-theme`

#### 生产结果（2026-06-20）
```
ai_themes: 38只，6分类
已评分: 36/38（9613.T NTT Data、9719.T SCSK 不在Stock表，显示评分待生成）
TOP1: 广濑电机 6806.T 71pt
平均分: ~53pt
HTTP 200 ✅
```

---

### 修改文件汇总

| 文件 | 变更 |
|------|------|
| `prisma/schema.prisma` | 新增 AITheme model；StockScore 新增 moneyFlowSource/globalTrendSource/scoreSource |
| `prisma/migrations/20260620_add_ai_themes/migration.sql` | 新增 |
| `prisma/migrations/20260620_score_source_fields/migration.sql` | 新增 |
| `scripts/fetch-jquants-investor-types.ts` | 新增：J-Quants investor-types 周度同步 |
| `scripts/seed-ai-themes.ts` | 新增：38只科技股种子数据（后续调整为6分类版本）|
| `scripts/compute-scores.ts` | 更新：scoreSource/moneyFlowSource/globalTrendSource 写入；REAL_FLOW_SOURCES 优先查询 |
| `scripts/cron-scheduler.ts` | 更新：周五16:30+周一07:15 J-Quants 机构流向自动同步 |
| `lib/ai-score.ts` | 更新：两处 REAL_MONEY_SOURCES 均含 jquants_investor_types；computeScoreSource() |
| `app/api/ai-theme/route.ts` | 新增：科技股主题 API |
| `app/api/sync/route.ts` | 更新：dataAuthority 块；InstitutionalFlow 优先查真实源 |
| `app/ai-theme/page.tsx` | 新增：科技股主题筛选页面 |
| `app/sync/page.tsx` | 更新：isReal 含 jquants_investor_types；DataAuthorityStatus 面板 |
| `components/Sidebar.tsx` | 更新：新增 AI产业链 导航项 |
| `package.json` | 更新：sync:institutional-flow / seed:ai-themes |

---

## [7.1.0] - 2026-06-20 — VIX 实时修复 + LINE 智能推送升级（朝報/午間/大引）

### 修复

#### `scripts/fetch-global-market.ts`
- VIX 抓取改用 `yf.quote("^VIX").regularMarketPrice`（实时报价），不再依赖 `historical()` — 旧方式某些日期 close=null 导致 VIX 显示 N/A
- 保留 fallback：quote 失败时回退到 `historical()`
- 验证：VIX 由 "N/A" → 实时 16.78

### 新增

#### `scripts/send-morning-brief.ts` (npm run line:morning-brief)
- 每个工作日 **08:00 JST** 在开场前30分钟推送
- 内容：昨夜グローバル市場（NASDAQ/VIX/USDJPY/日経）→ AI推薦 TOP5（HOLD以上）→ 超買警戒（RSI≥75）
- 市場スコア进度条可视化

#### `scripts/send-midday-flash.ts` (npm run line:midday-flash)
- 每个工作日 **12:30 JST** 午間速報
- 内容：急騰株（5日+5%以上・AI注目）→ 急落株（-5%以下）→ MACD 買転換シグナル → 市場体温
- 无注目銘柄时自动跳过，不推送

#### `scripts/send-closing-summary.ts` (npm run line:closing-summary)
- 每个工作日 **15:45 JST** 大引け後总结
- 内容：市場総括（分布 + 平均スコア棒グラフ）→ AI推薦銘柄パフォーマンス → 底打ちサイン候補 → 本日注目ニュース

### 修改

#### `scripts/cron-scheduler.ts`
- 新增 **05:30 JST** GlobalMarket 取得（AI評分前に確保）
- 新增 **08:00 JST** LINE 朝報（工作日）
- 新增 **12:30 JST** LINE 午間速報（工作日）
- 新增 **15:45 JST** LINE 大引けまとめ（工作日）
- 各 LINE 推送统一用 `hasLine()` 判断

#### `package.json`
- 新增 scripts：`line:morning-brief` / `line:morning-brief:dry` / `line:midday-flash` / `line:midday-flash:dry` / `line:closing-summary` / `line:closing-summary:dry`

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
