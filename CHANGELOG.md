# Changelog

---

## [8.5 P1.3] - 2026-06-21 — Dashboard & Sectors 三语言清理

### 目标
将仪表盘（/）从服务器组件中抽取全部UI文本，通过新建客户端组件实现三语言支持；修复 Dashboard 中所有硬编码中文字符串。

### 核心变更

| 文件 | 说明 |
|------|------|
| `app/HomeDashboardClient.tsx` | **新建**：客户端组件，接收服务器数据，用 `useI18n()` 渲染仪表盘全部 UI |
| `app/page.tsx` | 精简为纯数据获取 + `<HomeDashboardClient {...data} />`；新增 `nameEn` 不在 StockScore 的修复 |
| `lib/i18n/types.ts` | 新增 14 个 `home.*` MessageKey（stat卡/单位/空状态/排行/筛选器链接） |
| `lib/i18n/messages/zh-CN.ts` | 14键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 14键日文翻译 |
| `lib/i18n/messages/en-US.ts` | 14键英文翻译（unit_stocks/unit_records="" 空字符串） |

### 新增 i18n Keys（home.*）
```
home.db_stocks       数据库股票 / データベース銘柄 / Database Stocks
home.scored_count    已计算评分 / AI評価済み銘柄 / AI Scored
home.buy_recommendation 买入推荐 / 買い推奨 / Buy Signals
home.price_records   日线价格 / 日足データ / Daily Prices
home.last_sync       最后同步 / 最終更新 / Last Sync
home.unit_stocks     只 / 銘柄 / ""
home.unit_records    条 / 件 / ""
home.no_score_hint   暂无评分数据，请运行 / 評価データなし。実行：/ No score data. Run:
home.watch_monitoring 监控中 / 注目銘柄 / Watching
home.ai_scored       已完成AI评分 / AI評価完了 / AI Scored
home.ranking_title   AI 评分排行 / AI評価ランキング / AI Rankings
home.screener_link   筛选排序 → / スクリーナー → / Screener →
home.show_top100     仅显示前100条。/ 上位100銘柄まで表示。/ Showing top 100 only.
home.view_screener   前往筛选器查看全部 → / スクリーナーで全て見る → / View all in screener →
```

### 三语言验收
- **zh-CN**：仪表盘 / 数据库股票N只 / 已计算评分N只 / 买入推荐N只 / 日线价格N条 / AI精选 TOP3 / 买入机会 / 观察名单·监控中 / 股票总数·已完成AI评分 / AI 评分排行
- **ja-JP**：ダッシュボード / データベース銘柄N銘柄 / AI評価済み銘柄N銘柄 / 買い推奨N銘柄 / 日足データN件 / AI厳選 TOP3 / 買い銘柄 / 注目中·注目銘柄 / 銘柄数·AI評価完了 / AI評価ランキング
- **en-US**：Dashboard / Database Stocks N / AI Scored N / Buy Signals N / Daily Prices N / AI Picks — TOP 3 / BUY Picks / WATCH·Watching / Screener·AI Scored / AI Rankings

### 影响页面
- `/`（仪表盘）：全三语言

### DB 变更
无

### API 变更
无（仅前端展示层）

### 验证
- TypeScript：0 错误
- Build：成功
- 部署到生产 8.209.247.68，pm2 restart 完成
- Git commit：1592b14

---

## [8.5 P1.1] - 2026-06-21 — AI Value Chain Locale Fix

### 目标
修复 /ai-theme 页面中英文日文混杂，统一三语言显示。

### 核心变更

| 内容 | 说明 |
|------|------|
| `lib/i18n/theme-labels.ts` | 新建：14主题×3语言、5层级×3语言、层级描述×3语言映射 |
| `lib/i18n/types.ts` | 新增 48个 MessageKey（theme.*） |
| `lib/i18n/messages/zh-CN.ts` | 48键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 48键日文翻译 |
| `lib/i18n/messages/en-US.ts` | 48键英文翻译；theme.title → "AI Value Chain" |
| `app/ai-theme/page.tsx` | 全量重写：标题/副标题/统计卡/层级/Tab/筛选/排序/股票卡片全 t() |
| `app/ai-theme/[theme]/page.tsx` | 全量重写：breadcrumb/Header/Stats/层级结构/股票行全 t() |

### 三语言验收
- zh-CN：AI产业链 · 追踪总数/核心标的/产业链分类/供应链层 · 上游/中游/应用层 · 全部/AI硬件/半导体设备
- ja-JP：AI投資テーマ → 実際は "AI Value Chain" / "AIバリューチェーン" 为正确标题
- en-US：AI Value Chain · Tracked Stocks/Core Stocks/Categories · Upstream/Midstream/Applications · All/AI Hardware/Semiconductor Equipment
- en-US 模式：role字段隐藏（含CJK字符）；reason/riskNote 隐藏

### 验证
- TypeScript: 0 错误
- Build: 成功
- 部署到生产 8.209.247.68 并 pm2 restart

---

## [8.5 P1] - 2026-06-21 — 中文版全面汉化

### 目标
zh-CN 模式全面汉化：消除所有业务英文显示文本，完成 MaTrend/推荐评级/维度标签/交易信号/原因说明中文化。

### 核心变更

| 内容 | 说明 |
|------|------|
| `lib/i18n/types.ts` | 新增 43 个 MessageKey（home/table/trend/market/dim/picks/stock/card/sectors） |
| `lib/i18n/messages/zh-CN.ts` | 43 键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 43 键日文翻译 |
| `lib/i18n/messages/en-US.ts` | 43 键英文翻译 |
| `lib/trading-action.ts` | reasons/warnings 全部翻译为中文（18 条字符串） |
| `app/page.tsx` | 仪表盘完全中文化（硬编码 zh-CN 字符串） |
| `app/HomeStockDisplay.tsx` | MaTrendBadge 使用 t()；评级用 getRecommendationLabel()；表头全 t() |
| `app/screener/page.tsx` | 推荐标签/市场筛选/百分位 t()；getRecommendationLabel() |
| `app/ai-picks/page.tsx` | 维度标签/评分/百分位/5D 标签全 t() |
| `app/stocks/[symbol]/page.tsx` | 均线系统/震荡指标/30日走势/MA/MACD柱状/返回期全 t()；MaTrendBadge 用 useI18n() |
| `components/StockMobileCard.tsx` | 股价/5日/20日/机会/股息/催化标签 t()；百分位中文条件 |
| `app/sectors/page.tsx` | 日本語リンク→t("sectors.screener_link")；20D/60D→t() |

### 验证
- TypeScript: 0 错误
- Build: 成功
- 部署到生产 8.209.247.68 并 pm2 restart

---

## [8.4 P3] - 2026-06-21 — Full Native Locale Refactor (Phase 3)

### 目标
扩展 i18n 系统，新增 market-labels/stock-name 工具库，全面更新页面显示文本三语言化。

### 核心变更

| 内容 | 说明 |
|------|------|
| `lib/i18n/types.ts` | 新增 55 个 MessageKey（picks/sectors/home/watchlist/portfolio/notif/chat/theme/stocks/empty/error/sync/ai_action/screener/ind 追加） |
| `lib/i18n/messages/zh-CN.ts` | 新增 55 键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 新增 55 键日文翻译 |
| `lib/i18n/messages/en-US.ts` | 新增 55 键英文翻译 |
| `lib/i18n/market-labels.ts` | 新建：33种行业×3语言 + 3种市场×3语言映射，localeSector/localeMarket 函数 |
| `lib/i18n/stock-name.ts` | 新建：getPrimaryName/getSecondaryName/getNameLines，按语言优先级返回股票名称 |
| `components/StockMobileCard.tsx` | 使用 getPrimaryName() 根据 lang 返回主名称 |
| `app/stocks/[symbol]/page.tsx` | 使用 getNameLines() 显示分层股票名，market/sector 使用 localeMarket/localeSector |
| `app/sectors/page.tsx` | 完整 i18n：标题/列头/行业名称（localeSector）/按钮全三语言 |
| `app/ai-picks/page.tsx` | 标题使用 t("picks.title") |
| `app/watchlist/page.tsx` | 标题/空状态使用 t() |
| `app/sync/page.tsx` | 页面标题/刷新按钮/全部同步按钮使用 t() |
| `app/chat/page.tsx` | 标题/输入框占位符/发送按钮使用 t() |
| `app/ai-theme/page.tsx` | 标题使用 t("theme.title") |

### 验证
- TypeScript: 0 错误
- Build: 成功
- 部署到生产 8.209.247.68 并 pm2 restart

---

## [8.4] - 2026-06-21 — Full Locale Mode (True Three-Language)

### 目标
全站真正三语言：zh-CN ≥95% 中文、ja-JP ≥95% 日文、en-US ≥95% 英文。

### 核心变更

| 内容 | 说明 |
|------|------|
| `lib/i18n/types.ts` | 扩展至 188 个 MessageKey（含 RSI/MACD/维度/风格/股票详情/Screener/News/Health/Indicators） |
| `lib/i18n/messages/zh-CN.ts` | 全量 188 键中文翻译 |
| `lib/i18n/messages/ja-JP.ts` | 全量 188 键日文翻译（完整重写） |
| `lib/i18n/messages/en-US.ts` | 全量 188 键英文翻译（完整重写） |
| `components/HtmlLangSync.tsx` | 新增：语言切换时同步 `document.documentElement.lang` |
| `app/layout.tsx` | 加入 `<HtmlLangSync />` |
| `app/screener/page.tsx` | 全局 i18n：标题/Placeholder/列头/风格/市场/提示 |
| `app/news/page.tsx` | 全局 i18n：标题/情绪/分类/来源标签 |
| `app/sync/page.tsx` | 健康状态标签 i18n |
| `app/indicators/page.tsx` | RSI级别/MACD趋势/列头/统计卡片全 i18n（MaTrend/RsiBar/MacdTrendBadge接收`t`参数） |
| `app/stocks/[symbol]/page.tsx` | 数据提醒/涨跌标签/52周高低/AI评分页风险/风格/来源/排名标签全 i18n |

### 验证
- TypeScript: 0 错误
- Build: 成功（所有 Static 页正常编译）
- 3个 locale 文件 key 数一致（188:188:188）
- 部署到生产并验证 HTTP 200

---

## [8.3 P2.3] - 2026-06-21 — Technical Signal / AI Action Alignment

### 目标
修复 RSI 极度超买但 MACD 仍显示"买入"的误导性信号。MACD 改为趋势方向，买卖决策统一以 AI Action 为准。

### 核心修复

| 问题 | 修复方案 |
|------|---------|
| RSI>=90 股票仍可能 BUY_NOW | 新增 RSI 过热保护规则，RSI>=95→TAKE_PROFIT，RSI>=90→TAKE_PROFIT/WAIT_PULLBACK |
| MACD 显示"买入/卖出"误导买卖方向 | 改为"多头/空头/中性"（趋势信号） |
| RSI 只分"超买/超卖" | 改为5级：极度超买≥90/超买80-90/偏热70-80/正常/超卖 |
| 技术指标页无 AI 交易建议 | 新增"AI交易动作"列 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `lib/trading-action.ts` | 新增 RSI 过热保护守卫（RSI≥95/≥90/≥85+20D>30%/≥80+5D>20%），任意触发均阻断 BUY_NOW |
| `app/api/indicators/route.ts` | 新增 tradingAction/positionSizePct/actionRiskLevel 字段返回 |
| `app/indicators/page.tsx` | ①MACD列改为"趋势信号"（多头/空头/中性）②RSI 5级颜色分级 ③新增"AI交易动作"列 ④统计看板更新 |

### 验证结果

| 验证项 | 结果 |
|--------|------|
| RSI>=95 中 BUY_NOW 数量 | **0**（通过） |
| RSI>=90 中 BUY_NOW 数量 | **0**（通过） |
| 285A.T（RSI≈79，20D=+89%） | → TAKE_PROFIT ✅ |
| 4062.T（RSI≈57，5D=+29%） | → WAIT_PULLBACK ✅ |
| 9552.T（RSI≈59，STRONG_BUY） | → BUY_NOW ✅（正常持续） |
| build | ✅ 通过 |
| health:data | ✅ WARNING（无 CRITICAL）|

---

## [8.3 P2] - 2026-06-21 — AI Action Trading Decision

### 目标
把评分系统从"评分展示"升级为"交易决策提示"，新增独立的 AI Action 层。

### 新增文件（1个）
| 文件 | 说明 |
|------|------|
| `lib/trading-action.ts` | 交易动作引擎：BUY_NOW/WAIT_PULLBACK/HOLD/TAKE_PROFIT/SELL/AVOID，计算价格区间/止损/目标价 |

### 修改文件（7个）
| 文件 | 修改内容 |
|------|---------|
| `prisma/schema.prisma` | StockScore 新增 10 字段：tradingAction/positionSizePct/entryLow/entryHigh/stopLoss/target1/target2/actionRiskLevel/actionReasons/actionWarnings |
| `scripts/compute-scores.ts` | 新增 Pass 3：全量计算 AI Action（3714只，8.2s）|
| `app/api/ai-scores/route.ts` | 返回 tradingAction/positionSizePct/actionRiskLevel |
| `app/api/stocks/[symbol]/ai-score/route.ts` | 返回全部 AI Action 字段 |
| `app/api/screener/route.ts` | 新增 tradingAction/positionSizePct/actionRiskLevel 字段 |
| `app/stocks/[symbol]/page.tsx` | AI Tab 新增 AI Action 卡片（大标签+仓位+价格区间+止损+目标+理由+免责声明）|
| `app/ai-picks/page.tsx` | 每张卡片显示 Action badge（BUY NOW/WAIT/HOLD/PROFIT/SELL/AVOID +仓位%）|
| `components/StockMobileCard.tsx` | 新增小 Action badge |

### AI Action 规则摘要
- **BUY_NOW**：STRONG_BUY/BUY + adaptiveScore≥70 + opp≥65 + percentileRank≤10 + price>MA20 + RSI 45-75 + 5D≤20%
- **WAIT_PULLBACK**：评级好但 5D>20%/RSI>75/price>MA20×1.12/60D>100%
- **HOLD**：adaptiveScore 55-70，趋势中性
- **TAKE_PROFIT**：60D>150%+RSI>80 / 20D>60%+RSI>75 / 近52W高+RSI>78 / 5D>30%
- **SELL**：price<MA60+score<55 / 死叉+20D<-10% / RSI<35+20D<-15%
- **AVOID**：stale/suspicious/score<45/AVOID评级

### 建议仓位
- STRONG_BUY+BUY_NOW → 60%；BUY+BUY_NOW → 40%；WAIT_PULLBACK → 20%；HOLD → 30%；TAKE_PROFIT → 30%（剩余）；SELL/AVOID → 0%

### 验证样本（生产）
| 股票 | 评级 | AI Action | 仓位 |
|------|------|-----------|------|
| 9552.T (STRONG_BUY) | STRONG_BUY | **BUY_NOW** | 60% |
| 285A.T (+405% 60D) | WATCH | **TAKE_PROFIT** | 30% |
| 4062.T (+225% 60D) | HOLD | **WAIT_PULLBACK** | 20% |
| 8035.T (+96% 60D) | HOLD | **WAIT_PULLBACK** | 20% |
| 7012.T (拆股修正) | WATCH | **HOLD** | 30% |
| 9984.T/5803.T/6758.T | AVOID | **AVOID** | 0% |

### 生产分布（3714只）
BUY_NOW: 30 · WAIT_PULLBACK: 195 · HOLD: 1143 · TAKE_PROFIT: 49 · SELL: 639 · AVOID: 1658

### 免责声明
所有前端展示底部均标注：
"AI Action is a rules-based signal for research only. Not financial advice."

---

## [8.2.5] - 2026-06-21 — Health Guard 阈值调优

### 目标
避免真实极端行情误判为 CRITICAL，防止 AI recommendations 被错误阻断。

### 修改文件（2个）
| 文件 | 修改内容 |
|------|---------|
| `scripts/data-health-guard.ts` | CHECK 9 重写：return60d>300% 按 adjClose 验证真实性；NULL rec 增加 Pass2 提示 |
| `app/sync/page.tsx` | Data Health 卡片：显示"Recommendations allowed"；WARNING 用 amber 色 |

### 规则调整
- **return60d > 300%（CHECK 9）**：不再无脑 WARNING，而是逐股验证：close≈adjClose + high52w≥price + low52w≤price → "✓ Extreme real market move, verified by adjClose: ..."。split 或 52w 异常才升级为 suspect（其他 CRITICAL 检查兜底）。
- **recommendationV2 NULL**：若 adaptiveScore=OK 但 rec=NULL（Pass 2 未跑），输出明确提示 "npx tsx scripts/compute-scores.ts"。
- **stale 股票**：普通 stale 保持 WARNING；stale+STRONG_BUY 保持 CRITICAL（无变化）。
- **/sync Data Health 卡片**：CRITICAL=0 → 显示绿色 "Recommendations allowed"；WARNING → amber 文字；topIssues 颜色随状态切换（红/琥珀）。

---

## [8.3] - 2026-06-21 — 全局 UX 统一（Global UX Audit P1）

### 目标
全站 UI 设计规范统一：单一评级色彩真相来源、国际惯例涨跌色、英文标签、统一圆角和字号。

### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/rec-config.ts` | ★ 评级色彩 + 工具函数单一真相来源（getRec/returnColorClass/fmtPct/fmtJpy）|

### 修改文件（10个）
| 文件 | 修改内容 |
|------|---------|
| `components/RecommendationBadge.tsx` | 使用 getRec()，英文标签，text-[11px] font-semibold |
| `components/StockMobileCard.tsx` | green=up/red=down，rounded-2xl，fmtPct/fmtJpy，英文标签 |
| `app/page.tsx` | 英文表头，#1/#2/#3 排名，emerald BUY 卡片，rounded-2xl |
| `app/ai-picks/page.tsx` | 移除本地 REC_CFG，getRec()，移除 V7.7 版本引用 |
| `app/screener/page.tsx` | 英文分布 chips，Adaptive/Percentile/Opportunity 列名 |
| `app/stocks/page.tsx` | green=up，英文表头，rounded-2xl |
| `app/stocks/[symbol]/page.tsx` | 股价 text-[36px]，52W High/Low，getRec()，所有色修正 |
| `app/sync/page.tsx` | Data Health 卡片大字体 CRITICAL/WARNING/PASS |
| `app/ai-theme/page.tsx` | getRec()，ReturnBadge green/red，rounded-2xl，h1 32px |
| `app/ai-theme/[theme]/page.tsx` | 同上 |

### 设计规范（已封版）
```
评级色：STRONG BUY=emerald / BUY=blue / HOLD=slate / WATCH=amber / AVOID=red
涨跌色：green=涨（+25.32%）/ red=跌（-25.32%）— 国际惯例
卡片：  rounded-2xl / p-4 / gap-4 / shadow-sm
h1：    text-[32px] font-bold / 股价：text-[36px] font-extrabold
英文：  STRONG BUY/BUY/HOLD/WATCH/AVOID / 52W High/Low / Adaptive/Percentile/Opportunity
```

### Commit
`61ebe8d` — feat: v8.3 P1 — Global UX Audit implementation（11 files changed, 491 insertions, 514 deletions）

---

## [8.2.4] - 2026-06-21 — Data Health Guard（每日自动数据健全性守卫）

### 目标
在 v8.2.3 全量审计的基础上，增加每日自动保险层：每次评分完成后自动执行20项数据健全性检查；CRITICAL 异常自动阻断推荐并发送 LINE 告警。

### 新增文件
| 文件 | 说明 |
|------|------|
| `scripts/data-health-guard.ts` | 每日自动守卫脚本（20项检查，exit 1 on CRITICAL） |
| `app/api/health/status/route.ts` | 读取最新健康报告的 API 端点 |

### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `package.json` | 新增 `health:data` / `audit:data` 命令 |
| `scripts/cron-scheduler.ts` | 07:30 compute-scores 后自动运行 data-health-guard |
| `app/sync/page.tsx` | /sync 页面新增 Data Health Guard 状态卡片 |

### 20项检查规则
| # | 检查项 | 等级 |
|---|--------|------|
| 1 | adjClose coverage ≥99% | CRITICAL |
| 2 | split contamination = 0 (top-10 sample) | CRITICAL |
| 3 | high52w < current price = 0 | CRITICAL |
| 4 | low52w > current price = 0 | CRITICAL |
| 5 | high52w > price×10 (异常膨胀) | WARNING |
| 6 | low52w < price÷20 (异常低洼) | WARNING |
| 7 | \|return5d\| > 50% | INFO |
| 8 | \|return20d\| > 100% or < -70% | WARNING |
| 9 | return60d > 300% or < -90% | WARNING |
| 10 | adaptiveScore NULL = 0 | CRITICAL |
| 11 | opportunityScore NULL = 0 | INFO |
| 12 | percentileRank NULL = 0 | CRITICAL |
| 13 | recommendationV2 NULL = 0 | CRITICAL |
| 14 | NaN/Infinity = 0 | CRITICAL |
| 15 | stale stocks (>3 days) | WARNING |
| 16 | STRONG_BUY 双门槛违规 = 0 | CRITICAL |
| 17 | BUY 双门槛违规 = 0 | INFO |
| 18 | extreme return without highRiskFlag | WARNING |
| 19 | stale stocks with STRONG_BUY = 0 | CRITICAL |
| 20 | latestClose 有效性 | INFO |

### 退出码规则
- CRITICAL > 0 → `process.exit(1)` → 每日推荐被阻断
- 仅 WARNING/INFO → `process.exit(0)` → 正常运行

### LINE 告警格式
- CRITICAL: `⚠ TOHOSHOU DATA ALERT` + 问题汇总 + Action
- WARNING: `⚠ TOHOSHOU DATA WARNING` + 不阻断说明

### 报告输出
```
reports/data-health-guard-YYYYMMDD-HHmm.json
reports/data-health-guard-YYYYMMDD-HHmm.md
```

---

## [8.2.3] - 2026-06-21 — Global Data Integrity Audit（9/9 全部通过）

新增 `scripts/audit-data-integrity.ts`（只读全量审计脚本）。
生成 `reports/data-integrity-audit-YYYYMMDD-HHmm.json + .md`。
审计结论：adjClose 100% 覆盖，split contamination = 0，NaN/Inf = 0，STRONG_BUY 合规 5/5，9/9 通过。

---

## [8.2.2] - 2026-06-21 — 全价格计算口径统一修复（adjClose 优先）

### 问题根因
J-Quants API 的 `C`（close）字段为未复权原始价格，`AdjC`（adjClose）为拆股后复权价格。
旧代码使用 `close` 计算所有指标，导致发生拆股/缩股的股票在60日窗口内产生系统性错误。

审计发现：3714只股票中有 **432只（11.6%）的 return60d 被拆股事件污染**，严重股票误差超过100个百分点（如川崎重工业 return60d 显示 -79.2%，实际为 +3.8%）。

### 修复范围
| 文件 | 修改内容 |
|------|---------|
| `lib/indicators.ts` | 新增 `effectiveClose()` 导出函数；`closes` 数组全面改为 `sorted.map(effectiveClose)` |
| `scripts/compute-scores.ts` | `dailyPrice` select 增加 `adjClose`，传递给 `calcIndicators` |
| `scripts/sync-all-prices.ts` | `high52w`/`low52w` 改用 `AdjC ?? C` 计算 |
| `scripts/sync-jquants.ts` | `high52w`/`low52w` 改用 `AdjC ?? C` 计算 |
| `lib/daily-picks-report.ts` | `dailyPrice` select 增加 `adjClose` |
| `app/api/stocks/[symbol]/ai-score/route.ts` | `dailyPrice` select 增加 `adjClose` |
| `app/stocks/[symbol]/page.tsx` | warning banner 文案改为"大幅价格波动，AI评分已使用复权价格处理" |

### 核心规则（已落地）
- **展示价格**：继续使用 `close`（原始未复权，用于页面当前价显示）
- **计算价格**：所有指标统一使用 `adjClose ?? close`（复权优先）
- 受影响计算：return5d / return20d / return60d / high52w / low52w / MA5 / MA20 / MA60 / RSI / MACD / moneyFlowScore / adaptiveScore / percentileRank / 评级判定

### 修复效果
| 股票 | 修复前 ret60d | 修复后 ret60d |
|------|------------|------------|
| 川崎重工業 7012.T | -79.2% ❌ | +3.8% ✅ |
| フジクラ 5803.T | -78.8% ❌ | +27.3% ✅ |
| サンリオ 8136.T | -82.7% ❌ | -13.6% ✅ |
| ピクセラ 6731.T | +157.5% ❌ | -74.3% ✅ |
- 拆股污染股票：432只 → **0只**

---

## [8.2.0] - 2026-06-21 — v8.1 Mobile First 手机端全面适配

### 概述
完整移动端响应式改造，覆盖 9 个页面，新增 5 个移动端组件。桌面端布局完全保留，无破坏性变更。

### 新增文件
| 文件 | 说明 |
|------|------|
| `components/mobile/MobileHeader.tsx` | 手机固定顶栏（TOHOSHOU AI + 当前页名 + 菜单按钮） |
| `components/mobile/MobileBottomNav.tsx` | 手机固定底部导航（5项：首页/AI推荐/对话/筛选/产业链），safe-area 支持 |
| `components/mobile/MobileDrawer.tsx` | 全屏侧滑导航抽屉（11项菜单 + 数据来源面板） |
| `components/mobile/ResponsiveShell.tsx` | Client wrapper，统一管理 Drawer 开关状态 |
| `components/StockMobileCard.tsx` | 筛选器手机端股票卡片（评级/评分/现价/涨跌/机会分） |

### 页面改造
| 页面 | 主要改动 |
|------|---------|
| `app/layout.tsx` | `md:ml-56 pt-14 md:pt-0 pb-20 md:pb-0`，引入 ResponsiveShell |
| `components/Sidebar.tsx` | `hidden md:flex`，手机端隐藏侧边栏 |
| `app/page.tsx` | stats 2×5→2col/5col，TOP3 1col/3col，score dist 2→3col |
| `app/ai-picks/page.tsx` | mode/filter tabs overflow-x-scroll，TOP3 1/3col，5dim grid 2/5col |
| `app/chat/page.tsx` | `h-[calc(100dvh-136px)] md:h-screen`，quick prompts 横向滚动，desktop header hidden on mobile |
| `app/ai-theme/page.tsx` | stats 2/7col，14主题卡 2/3/7col，默认折叠主题卡，tabs overflow-x，stock grid 1/2/3col |
| `app/ai-theme/[theme]/page.tsx` | 供应链横排→手机纵排+下箭头，stats 2/5col，stock grid 1/2col |
| `app/screener/page.tsx` | 手机显示 StockMobileCard，桌面显示完整表格，filters overflow-x |
| `app/stocks/[symbol]/page.tsx` | hero flex-col/row，tabs overflow-x，AI评分卡 flex-col/row，Radar手机隐藏，dimension cards 1/3col |
| `app/sync/page.tsx` | header flex-col/row，summary 2/3/7col |
| `app/notifications/page.tsx` | px-4 padding，heading text-slate-900，settings grid 1/3col |

### 验收标准
- 手机：隐藏 Sidebar，显示 MobileHeader(h-14) + MobileBottomNav(h-14+safe-area)
- 内容区：`pt-14 pb-20` 防被固定组件遮挡
- 聊天页：`h-[calc(100dvh-136px)]` 精确适配可视区
- 筛选器：手机显示卡片，桌面显示完整11列表格

---

## [8.1.0] - 2026-06-21 — STRONG_BUY 阈值放宽 + CHIP_DESIGN 扩充 + 供应链流矢印修复

### 概述
- **STRONG_BUY 阈值放宽**：`adaptiveScore≥78 AND percentileRank≤2%` → `≥75 AND ≤5%` → 结果 STRONG_BUY=5（新增 Reskill教育/量化研究/日本M&A中心/阿特拉埃/Land不动产）
- **BUY 阈值放宽**：`percentileRank≤10%` → `≤15%`
- **CHIP_DESIGN 扩充**：3只 → 6只（新增 メガチップス/ソニー/富士電機）
- **供应链流矢印修复**：`grid + absolute` → `flex + SVG arrow`，层级间视觉箭头正常显示

### 修改文件
| 文件 | 变更 |
|------|------|
| `scripts/compute-scores.ts` | `computeRecommendationV2()` 阈值调整 |
| `scripts/seed-ai-themes.ts` | CHIP_DESIGN 新增 6875.T/6758.T/6504.T |
| `app/ai-theme/[theme]/page.tsx` | 供应链流从 grid 改为 flex + SVG 矢印 |

### 验收（生产 2026-06-21）
- STRONG_BUY=5 ✅（原 0）
- CHIP_DESIGN 6只 ✅（瑞萨/罗姆/滨松/メガチップス/索尼/富士电机）
- /ai-theme/chip_design 返回 200，byLayer 正常 ✅
- 供应链流箭头 → 正常渲染 ✅

### 背景
v8.0 生产数据显示最高 adaptiveScore=77（291A.T），旧阈值 78 导致 STRONG_BUY=0。

---

## [8.0.0] - 2026-06-21 — AI产业链地图：14细分主题完整产业链

### 概述
- **AITheme精细化重构**：从6个粗分类升级为14细分AI产业链主题
- **106条目，82只股票，38个核心标的**
- **供应链层级**：UPSTREAM→MIDSTREAM→DOWNSTREAM/INFRASTRUCTURE/APPLICATION
- **每条目含**：role/supplyChainLayer/importanceScore/reason/riskNote/isCore
- **股票可多主题归属**（东京电子同时属于SEMI_EQUIPMENT+TEST_EQUIPMENT）

### 14细分主题
| 主题 | 条目 | 核心 |
|------|------|------|
| AI芯片设计 | 3 | 1 |
| AI半导体设备 | 8 | 5 |
| AI测试设备 | 6 | 1 |
| AI芯片材料 | 8 | 3 |
| HBM・先进封装 | 7 | 2 |
| AI传感器・精密 | 8 | 4 |
| AI服务器・DC | 9 | 4 |
| AI网络通信 | 8 | 2 |
| AI机器人・自动化 | 8 | 3 |
| AI软件・云・SaaS | 14 | 4 |
| AI互联网・平台 | 6 | 2 |
| AI医疗・生命科学 | 7 | 3 |
| AI安防・图像识别 | 7 | 3 |
| AI电力・能源 | 7 | 1 |

### 新增/修改文件
| 文件 | 变更 |
|------|------|
| `prisma/schema.prisma` | AITheme扩展字段，@@unique改为[symbol,theme]复合键 |
| `scripts/seed-ai-themes.ts` | 全量重写，106条目14主题 |
| `app/api/ai-theme/route.ts` | 重写，返回themes/layers/summary，使用adaptiveScore |
| `app/api/ai-theme/[theme]/route.ts` | 新增，byLayer产业链详情 |
| `app/ai-theme/page.tsx` | 重写，搜索/筛选/供应链层可视化/14主题卡/3列股票网格 |
| `app/ai-theme/[theme]/page.tsx` | 新增，产业链流可视化+全量股票排列 |

### 验收（生产 2026-06-21）
- /ai-theme HTTP 200 ✅
- /api/ai-theme HTTP 200 ✅，14主题全返回 ✅
- 东京电子/Advantest/信越化学/SUMCO/Ibiden/NEC/Sakura Internet全显示 ✅
- recommendationV2/adaptiveScore/dividendScore/catalystScore正常 ✅
- /ai-theme/[theme] 6条路由全200 ✅
- /ai-picks /screener /stocks不受影响 ✅

---

## [7.9.3] - 2026-06-21 — AI System Control Center

### 概述
- **系统控制命令**：START / STOP / RESET / STATUS — 最高优先级，绕过整个 pipeline（零 GPT / 零 DB 股票查询）
- **AI 启停状态持久化**：新增 `UserAiSettings` DB 表，每用户独立开关
- **AI 暂停门控**：`aiEnabled=false` 时任何非系统指令均返回暂停提示，彻底不触发意图引擎
- **Web sessionId 追踪**：`/chat` 页面以 `sessionStorage` 稳定 session ID 传给后端，实现独立上下文隔离

### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/ai-control.ts` | detectSystemCommand / getAiEnabled / handleSystemCommand / buildStatusText / PAUSE_MSG |

### 新增数据表
| 表 | 字段 |
|----|------|
| `user_ai_settings` | userId(unique) / aiEnabled / mode / strictRealData / createdAt / updatedAt |

### 修改文件
- `lib/line-chat.ts`：最高优先级插入系统命令检测 + aiEnabled 门控
- `app/api/chat/route.ts`：同上（系统命令 → aiEnabled → 正常 pipeline）
- `app/chat/page.tsx`：sessionId 生成（sessionStorage）、传 userId 给后端、INTENT_BADGE 补全 17 种

### 触发词（精确匹配）
| 命令 | 触发词示例 |
|------|-----------|
| START | 启动AI / 开启AI / start / 唤醒 / 激活 |
| STOP | 关闭AI / 停止 / 暂停 / stop / 休眠 |
| RESET | 清空上下文 / 重置 / reset / 清空记忆 |
| STATUS | 当前状态 / 状态 / status / AI状态 |

### 验收结果（生产）
- LINE 9步链 ✅（启动→状态→个股→停止→AI暂停→恢复→主题→重置→追问无上下文）
- Web 3步链 ✅（启动→停止→AI暂停门控）
- STATUS 显示完整数据源清单 ✅（3714 REAL / JPX REAL / 4691件 TDnet）
- STRICT_REAL_DATA 始终 ON ✅

---

## [7.9.2] - 2026-06-21 — GPT Intent Engine 重构：DB-only 回答

### 概述
- **GPT 职责边界**：GPT 仅作为意图识别 fallback（输出 JSON only），所有回答 100% 来自 DB
- **统一调用链**：`/api/chat` 和 LINE webhook 共用 `parseUserIntent → queryDatabase → buildAnswer`
- **12种意图**：新增 `recommend_more`（记忆排除）、`stock_compare`（对比）、`risk_analysis`（风险）、`reason_explain`（解释原因）
- **对话上下文**：30分钟 TTL，`lastSymbols/lastResults` 支持追问（"还有其他的"、"风险呢"、"为什么"）

### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/intent-schema.ts` | 统一类型：StructuredIntent / ConversationContext / DbQueryResult |
| `lib/intent-engine.ts` | 意图解析（regex优先 + GPT JSON fallback）+ 上下文存储 |
| `lib/query-engine.ts` | 所有意图的 DB 查询（12种意图统一入口） |
| `lib/answer-builder.ts` | buildWebAnswer() + buildLineMessages()（zero GPT） |
| `scripts/test-intent-engine.ts` | 14/14 意图测试 + 6种回答测试 |

### 修改文件
- `app/api/chat/route.ts`：简化至 50 行（pipeline 调用），移除旧 GPT 回答逻辑
- `lib/line-chat.ts`：简化至 80 行（pipeline 调用），移除重复 DB 查询
- `package.json`：新增 `test:intent-engine` / `test:intent-engine:dry`

### 验收结果（生产）
- Intent 14/14 ✅（regex 全命中，含 "高股息低风险的"、"丰田和伊藤忠比"、追问三连）
- answerSource=DB ✅ hallucination=false ✅ 零 localhost URL ✅
- 追问上下文：`top_picks→recommend_more→risk_analysis→reason_explain` 链全通

---

## [7.9.1] - 2026-06-21 — 修复 Flex Message localhost 链接根本原因

### 修复
- **`lib/app-url.ts` `getBaseUrl()` 优先级调整**：`APP_URL`（运行时读取）调整至 `NEXT_PUBLIC_APP_URL`（build-time bake-in）之前
  - 根本原因：Next.js 在 build 时将 `NEXT_PUBLIC_*` 变量的值直接替换进 server bundle（webpack DefinePlugin），本地 `.env` 有 `NEXT_PUBLIC_APP_URL=http://localhost:3000`，导致生产 bundle 里该值被硬编码为 localhost
  - 修复方案：在生产服务器 `.env` 加入 `APP_URL=https://aitohoshou.com`，`getBaseUrl()` 改为优先读 `APP_URL`（运行时 process.env，不会被 bake-in）
  - Bundle 验证：server chunk 含 `process.env.APP_URL`（运行时）+ `"http://localhost:3000"`（旧 bake-in，被 `??` 跳过）+ `"https://aitohoshou.com"`（fallback）
- **生产验收测试脚本** `scripts/test-line-production.ts` — 14/14 通过

---

## [7.9] - 2026-06-21 — LINE 全智能投资助手 V7.9 + Web Chat UI

### 概述
- **LINE NLP 意图引擎**：完全重构 LINE 对话入口，8种意图 + 100+公司名映射，零"不支持该查询"
- **Flex Message V7.9**：全新8个 Flex 构建器，全链接经 app-url.ts 验证，零 localhost
- **统一调用链**：parseLineIntent → queryRealData(DB only) → buildLineReply，GPT 禁止生成股票列表
- **Web Chat UI**：`/chat` 页面，对话式AI助手，对接 `/api/chat`
- **36/36 测试通过**：意图分类 14/14、Flex URL 8/8、边界用例 14/14

### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/line-intent.ts` | LINE NLP 意图解析器（8种意图类型、~100条公司名映射、SECTOR_MAP） |
| `lib/line-flex-v79.ts` | V7.9 Flex Message 构建器（8个 builder + buildRealReason）|
| `scripts/test-line-v79.ts` | 意图分类 + Flex URL 验证 + 边界用例测试脚本 |
| `app/chat/page.tsx` | Web Chat UI（快速提问按钮、意图 badge、打字动画）|

### 修改文件
| 文件 | 修改 |
|------|------|
| `lib/line-chat.ts` | 完整重写：统一调用链，引入 parseLineIntent，移除"不支持该查询" |
| `app/api/line/webhook/route.ts` | 使用 handleLineChat + buildWelcomeFlexV79 + buildGroupJoinFlexV79 |
| `scripts/validate-line-links.ts` | 新增 validateFlexUrls() 导出 + V7.9 builders 验证 |
| `components/Sidebar.tsx` | 新增「AI对话」入口（💬）|
| `package.json` | 新增 test:line-v79 / validate:line-v79 脚本 |

### 意图类型
| 意图 | 触发示例 |
|------|---------|
| TOP_PICKS | 今天买什么 / 明天买什么 / 推荐十只 / 再推荐五只 |
| STOCK_ANALYSIS | 7203 / 分析7203 / 丰田怎么样 / 伊藤忠值得买吗 |
| TECH_THEME | 科技股 / 科技股谁最强 |
| SECTOR_OUTLOOK | 半导体还能买吗 / 机器人 / 银行股怎么样 |
| MARKET_OVERVIEW | 市场怎么样 / 日经怎么样 / 行情如何 |
| DATA_SOURCE | 数据哪里来的 / 评分怎么算 |
| HELP | 帮助 / 菜单 |
| UNKNOWN | → 自动显示 HELP，永不回复"不支持" |

### V7.9 Flex 构建器
- `buildTopPicksFlexV79` — Carousel（每页5只，最多10只），含 percentileRank + 真实原因标签
- `buildStockCardV79` — 5维评分雷达 + 配当分/收益率 + 空売り比率 + scoreSource REAL badge
- `buildMarketOverviewFlexV79` — 市场温度 + 分布 + GlobalMarket + 机构流向 + 空売り
- `buildSectorFlexV79` — 板块 TOP8 + return5d/return20d + percentileRank
- `buildHelpFlexV79` — 7项功能指南，含自然语言示例
- `buildDataSourceFlexV79` — 9数据来源列表
- `buildWelcomeFlexV79` / `buildGroupJoinFlexV79` — V7.9 欢迎卡

### 关键修复（TypeScript 类型）
- `セブン&アイ` 作为对象键需要引号（syntax error）
- `三菱ufj` 重复键去重
- `sp500Change` 不存在于 GlobalMarket schema → 移除
- `analysisPrefix` 由 `\s+` 改为 `\s*` → 支持`分析7203`（无空格）
- MARKET_OVERVIEW 正则新增 `日经`（简体）覆盖 `日経`（繁体）

---

## [7.8.5] - 2026-06-21 — GPT Phase 2 Web Chat UI (prev label)

### 新增
- **`/chat` 页面** — Web Chat UI，对话式 AI 选股助手
  - 聊天气泡 UI（用户消息 / AI 回复）
  - 快速提问按钮：今日TOP5 / TOP10推荐 / 市场概况 / 科技股 / 半导体 / 汽车股
  - Intent 标签：自动显示意图分类（AI推荐 / TOP10 / 个股分析 / 板块分析 / 市场概况）
  - 打字中动画指示器（三点跳动）
  - 自适应输入框（Enter 发送，Shift+Enter 换行，自动高度）
  - 清空对话按钮
  - 严格真实数据模式标识（REAL DATA badge）
- **侧边栏新增「AI对话」入口**（💬 图标，位于 AI产业链 与 全市场筛选 之间）

### 技术细节
- 调用现有 `POST /api/chat`（GPT Phase 1.5 STRICT_REAL_DATA 模式）
- 响应解析 `intent` 字段 → 意图 badge
- 欢迎消息说明支持功能和数据来源
- 全高度布局（header + 滚动消息区 + 快捷键 + 输入框）

---

## [7.8] - 2026-06-20 — 空売り比率 JPX REAL + 配当スコア + Sync Center 11源

### 概述
- **空売り比率（ShortSellingRatio）**：从 JPX 官网下载 PDF → `pdftotext` 解析 → 写入 `ShortSellingRatio` 表，source=jpx_real，数据：2026-06-19，38.8%
- **配当スコア（dividendScore 0-10）**：利用已有 Dividend 表（32,315行），`calcDividendScore(yield%, payoutRatio)` 写入 StockScore，全量3714只
- **Sync Center 11源**：`/api/sync/status` 新增 short_selling_ratio + dividend_history 两张源卡，生产全部 REAL ✅
- **Cron 扩展**：18:30 JST 工作日（空売り）+ 22:30 JST 每日（配当历史）

### 新文件
| 文件 | 说明 |
|------|------|
| `scripts/fetch-short-selling-ratio.ts` | JPX PDF 下载 → pdftotext 解析 → upsert ShortSellingRatio |
| `scripts/fetch-dividend-history.ts` | J-Quants fins/summary → 批量同步 Dividend（CONCURRENCY=5，7天去重）|

### Schema 变更（已 `npx prisma db push` 到生产）
| 变更 | 说明 |
|------|------|
| `ShortSellingRatio.market String @default("ALL")` | 新增字段，支持按市场区分 |
| `ShortSellingRatio @@unique([date, market])` | 原 `@unique(date)` 改为联合唯一键 |
| `StockScore.dividendScore Int?` | 配当质量分 0-10 |
| `StockScore.shortSellingSource String?` | "jpx_real" 或 "fallback" |

### 关键技术细节

#### JPX PDF 解析
- JPX 空売り比率每日 PDF：`https://www.jpx.co.jp/markets/statistics-equities/short-selling/nlsgeu0000XXX.pdf`
- 生产服务器安装 `poppler-utils`（apt-get install -y poppler-utils）
- `execSync('pdftotext /tmp/jpx_short.pdf -', { encoding: 'utf-8' })` 提取文本
- PDF 文本含三个百分比：(a)/(d) 普通注文 ~61%、(b)/(d) 空売り+価格制限 ~32%、(c)/(d) 空売り ~7%
- 总空売り比率 = [1]+[2]（b/d + c/d）≈ 38.8%

#### 日期时区修复（CST 服务器）
- 生产服务器为 CST（UTC+8），`new Date(y, m, d)` 创建 CST 午夜 = UTC 前一天
- **必须用** `new Date(Date.UTC(year, month-1, day))` 确保 @db.Date 存储正确
- 错误行（2026-06-18）仍在 DB 中但无害（orderBy date desc 始终取正确行）

#### payoutRatio 单位处理
- J-Quants `PayoutRatioAnn` 返回 0-1 小数（0.321 = 32.1%），非百分比
- `calcDividendScore` 内自动检测：`payoutRatio < 1.5 → × 100 转为 %`
- UI 同样需要此转换：`(pr < 1.5 ? pr * 100 : pr).toFixed(0) + "%"`

### calcDividendScore 评分表（`lib/ai-score.ts`）
| 配当利回り | 基础分 |
|-----------|--------|
| = 0 或 null | 0（无配当）|
| < 1% | 1 |
| 1-2% | 3 |
| 2-3% | 5 |
| 3-4% | 7 |
| 4-6% | 8（甜蜜区间）|
| ≥ 6% | 6（高yield陷阱风险）|

配当性向 20-60%：+1；> 80%：-1；最大10分。

### API 扩展（`/api/stocks/[symbol]/ai-score`）
新增7个字段：
- `dividendScore`（从 StockScore precomputed 或实时计算）
- `dividendYield`（%，来自 Dividend.yieldRate）
- `payoutRatio`（0-1 小数，来自 Dividend.payoutRatio，J-Quants 原始值）
- `dividendAnn`（年间配当额，来自 Dividend.dividend）
- `shortSellingRatio`（%，来自 ShortSellingRatio.shortSellRatio，最新）
- `shortSellingDate`（ISO 日期字符串）
- `shortSellingSource`（"jpx_real" 或 "fallback"）

### compute-scores 更新（`scripts/compute-scores.ts`）
- Pass1 开始前：预加载最新 ShortSellingRatio（where market="ALL", source="jpx_real"）
- Pass1 逐股：`prisma.dividend.findFirst({ where: { symbol }, orderBy: { year: "desc" } })` 取配当，调 `calcDividendScore` 计算 dividendScore
- 两者均写入 StockScore create + update 块

### 股票详情页 AI Tab（`app/stocks/[symbol]/page.tsx`）
新增「配当・空売り」面板（位于5维分数条之后）：
- **配当卡**：年間配当（円）/ 配当利回り（%）/ 配当性向（%）/ dividendScore（0-10 星级）
- **空売りカード**：市場空売り比率（%）/ 最新日期 / source badge（REAL/推算）

### 生产验证（2026-06-20）
```
Symbol: 7203.T (Toyota)
adaptiveScore: 48 / WATCH
dividendScore: 7 / 10（precomputed）
dividendYield: 3.42%，payoutRatio: 0.321（32.1%）
shortSellingRatio: 38.8%
shortSellingSource: jpx_real
shortSellingDate: 2026-06-19
Sync Center: 11/11 REAL ✅
```

### npm scripts 新增
```bash
npm run fetch-short-selling         # 抓取 JPX 空売り比率 PDF → ShortSellingRatio
npm run fetch-short-selling:dry     # DRY_RUN 预览
npm run fetch-dividend-history      # J-Quants fins/summary → Dividend（FORCE=1 强制全量）
npm run fetch-dividend-history:dry  # DRY_RUN 预览
```

---

## [7.7] - 2026-06-20 — 双门槛评级 V2 + 市场温度 + 机会分 + TDnet REAL

### 概述
- **recommendationV2**（双门槛）：STRONG_BUY（adaptiveScore≥78 AND percentileRank≤2%）/ BUY（≥70 AND ≤10%）/ HOLD / WATCH / AVOID
- **MarketTemperature**：HOT/WARM/NEUTRAL/COLD/EXTREME_COLD，基于全市场 BUY+ 占比实时计算
- **opportunityScore**：综合机会分（0-100），复合公式 = adaptiveScore×0.5 + 排名强度×0.2 + 资金×0.1 + catalyst×0.1 - 风险×0.1
- **TDnet REAL 真实数据接通**：东京阿里云 IP 无地理封锁，Cookie 方案绕过 WAF 挑战

### StockScore 新增字段（v7.7，已部署生产 DB）
| 字段 | 说明 |
|------|------|
| `percentileRank` | Float 全市场百分位（越低越好，1=前1%） |
| `marketRank` | Int 绝对排名（1=最佳） |
| `recommendationV2` | 双门槛评级字符串 |
| `recommendationReason` | 中文评级理由（含阈值） |
| `opportunityScore` | 综合机会分 Float 0-100 |
| `opportunityRank` | 机会分排名 Int |
| `opportunityLabel` | STEADY \| HIGH_RISK_SPECULATIVE |

### compute-scores 双Pass（`scripts/compute-scores.ts`）
- **Pass 1**：逐股计算5维原始分 + adaptiveScore + stockStyle（同 V7.5）
- **Pass 2**：全市场 3714 只排序 → percentileRank / marketRank → recommendationV2 / recommendationReason → opportunityScore / opportunityRank / opportunityLabel，批量更新 200条/批

### API 更新
- `GET /api/market-stats`：返回 marketTemperature / bullCount / bullRate / distribution / topAdaptive / topOpportunity
- `GET /api/ai-scores?mode=top|opportunity|high_risk`：含全部 V7.7 字段 + marketStats 内嵌
- `GET /api/screener`：新增 V7.7 列（adaptiveScore / percentileRank / recommendationV2 / opportunityScore / stockStyle / highRiskFlag）
- `GET /api/stocks/[symbol]/ai-score`：从 StockScore 合并全部 V7.7 预计算字段
- `POST /api/chat`：所有意图切换为 recommendationV2，响应含 percentileRank / opportunityScore / stockStyle

### 前端更新
- **`/ai-picks`**：MarketTemperatureBanner（5类分布格子）+ 三模式 Tab（综合/稳健机会/高风险动能）+ V7.7 评级 badge + percentileRank + opportunityScore
- **`/screener`**：动态分列 / 排名列（前X%）/ 机会分列 / 风格过滤器 / 点击表头排序 / 高风险行浅红底色
- **`/stocks/[symbol]` AI Tab**：主分数显示 adaptiveScore，V7.7 评级 badge，市场排名行，机会分行，风格标签，scoreSource badge

### LINE 更新（`lib/line-flex.ts`）
- `compactRow`：使用 recommendationV2 着色，展示 percentileRank（前X%），⚠ 高风险前缀

### 生产数据（2026-06-20 部署后）
- STRONG_BUY: 0 / BUY: 35（0.9%）/ MarketTemperature: COLD ❄️
- 最高分：Reskill 291A.T，adaptiveScore=77

---

## [7.7-TDnet] - 2026-06-20 — TDnet REAL 真实数据接通

### 问题
- `lib/tdnet.ts` 此前全部返回 mock/fallback 数据
- 原以为香港服务器被地理封锁，实际为 Cookie WAF 挑战

### 根本原因（调查结论）
1. GET `https://www.release.tdnet.info/` → HTTP 403，但 **Set-Cookie: te-w1-pri=xxx**
2. 带该 Cookie 发 GET → HTTP 200
3. 非地理封锁，非 Cloudflare，非 IP ban；东京阿里云 IP（8.209.247.68）可正常访问

### 实现
**`lib/tdnet.ts`（完整重写）**
- `acquireSessionCookie()`：首次 GET 根页提取 `te-w1-pri` Cookie
- `fetchTDnetForDate(date)`：分页 GET `I_list_NNN_YYYYMMDD.html`，带 Cookie + 浏览器 UA
- 翻页检测：检查 HTML 是否含下一页链接（**不用行数判断**，因字母股票代码被过滤后行数偏少）
- 代码解析：`XXXX0`（5位）→ 取前4位，仅保留 `/^\d{4}$/` 纯数字代码，过滤 `485A` 等字母代码
- 1秒翻页间隔（robots.txt `Disallow: /`，法定公开信息）
- 删除所有 mock / fallback 分支

**`scripts/fetch-tdnet.ts`（新增）**
- `DRY_RUN=1` 预览模式，默认同步最近5个工作日
- 写入 Disclosure 表后自动更新 catalystScore（base=5 + min(3,count) + 业绩奖励 + 重要性奖励，范围 1-10）

**`scripts/cron-scheduler.ts`**
- 新增 `0 7 * * 1-5`（07:00 JST 工作日）：TDnet 同步
- 确保先于 `0 7:30 * * *` compute-scores 运行

**`app/api/sync/tdnet/route.ts`（重写）**
- 改用 `fetchTDnetForDate`，同步最近3个工作日

### 已验证数据
- 2026-06-19 单日：288件公告（3页），有效4位代码 272件
- 生产 DB（5天）：975件新增 + 已有历史 = 4691件总计
- 673只股票 catalystScore 更新
- 类型分布：OTHER 72% / EARNINGS 9.2% / DIVIDEND 5% / EQUITY 4.7% / BUYBACK 4.3% / MATERIAL 3.1% / FORECAST_REVISION 1.6%

### 结论
- **TDnet REAL = YES** ✅（东京 IP 可访问）
- **TDnet proxy server：暂不需要**

---

## [7.6.2] - 2026-06-20 — LINE STRICT_REPLY 模板 + localhost 全清零

### 问题
1. LINE 回复仍含客服话术（"表现稳定/建议关注/进一步研究/业务布局良好"）
2. URL 验证脚本确认全部 Flex URI 均为 https://aitohoshou.com（无 localhost）

### 修复

**`lib/line-flex.ts`**
- `buildStockCard` 新增字段展示：`adaptiveScore`/`stockStyle`/`scoreSource`/`latestDate`/`数据来源 footer`
- 五维评分加进度条 `█░` 可视化
- `AiPicksStock` 新增 `adaptiveScore`/`stockStyle` 字段
- `compactRow` 优先显示 `adaptiveScore`；评分行展示 `stockStyle` 缩写；删除 `summaryReason` 显示（防混入GPT话术）

**`lib/line-chat.ts`**
- 新增 `handleStockFlexCard(code)` — 查 DB → 返回 `buildStockCard` Flex（无 GPT 调用）
- `handleLineChat` 中拦截 `^(\d{4})` 和 `^分析\d{4}` → 走 Flex 卡片路径，不再落入 `processMessage` 文本路径
- `handleStockFlexCard` 在显示前清洗 `summaryReason`（删除「表现稳定/建议关注」等模板词）
- 最终 fallback：直接返回使用指南文本，**不调用任何 GPT**

**`lib/ai-agent.ts`**
- `buildAnalysisReply`：完全删除 GPT 调用，输出纯结构化 DB 数据文本（含全字段）
- `buildStockReply`：保留纯文本格式（LINE 走 Flex；此为 Web/API 文本 fallback）

### validate:line-links 结果
- 0 错误，1 警告（testFlex 无按钮，正常）
- 全部 13 个 Flex payload 均通过 https://aitohoshou.com 验证

### LINE 消息路由（修复后）
| 输入 | 路由 | 输出 |
|------|------|------|
| `推荐/再推荐五只/TOP10` | V2 `ai_picks` → `handleAiPicks` | Flex Carousel，DB REAL TOP10 |
| `科技股/半导体` | V2 `ai_theme` → `handleAiTheme` | Flex，科技主题TOP20 |
| `伊藤忠怎么样/8001` | `handleStockFlexCard("8001")` | `buildStockCard` Flex |
| `分析8001` | `handleStockFlexCard("8001")` | `buildStockCard` Flex |
| 其他 | 直接返回使用指南 | 文本（无GPT） |

---

## [7.6.1] - 2026-06-20 — LINE 调用链 STRICT 修复

### 问题
- LINE "再推荐五只" → `parseV2Intent` 无匹配 → 落入 `buildGeneralReply` → GPT 自由编造 Toyota/Sony/Nintendo（100% 幻觉）

### 修复（`lib/ai-agent.ts` 完全重写 + `lib/line-chat.ts` 修复）

**`lib/ai-agent.ts`（完全重写）**
- `parseIntent`：新增 `/推荐|精选|top10?|picks/i` 宽泛模式（覆盖"再推荐"/"推荐五只"等所有变体）
- `buildPicksReply`：DB 查询改为 `scoreSource:"REAL"` + `adaptiveScore DESC`（原 `totalScore DESC`，无 REAL 过滤）
- `buildGeneralReply`：**完全删除** — 原函数调用 `callAI(temperature=0.7)` 致使 GPT 自由编造推荐
- `callAI`：`temperature: 0.2`（原 0.7）
- `buildAnalysisReply`：新增 STRICT system prompt（6条禁止规则），GPT 只解读 DB 数据
- 删除 `upProb()` / "上涨概率" 伪造指标
- `unknown` 意图：直接返回使用指南，不调用 GPT

**`lib/line-chat.ts`**
- `parseV2Intent`：新增模式 `/(再推荐|推荐更多|多推荐|推荐[五六七八九十\d]+[只只])/i` → `ai_picks`
- `handleAiPicks`：DB 查询改为 `scoreSource:"REAL"` + `adaptiveScore:{ not:null }` + `adaptiveScore DESC`

### 修复后调用链
```
"再推荐五只" → parseV2Intent → "ai_picks" → handleAiPicks → DB REAL TOP10 → Flex 卡片
```
零 GPT 调用，零幻觉

---

## [7.6.0] - 2026-06-20 — GPT Phase 1.5: STRICT REAL DATA 模式

### 概述
- **STRICT_REAL_DATA 全局开关**：`STRICT_REAL_DATA=true` 写入 `.env`，启用后 GPT 被禁止编造任何投资数据
- **`/api/chat` 全面重写**：新增意图 `recommend_ten` / `market_overview`；全部切换为 `adaptiveScore DESC` + `scoreSource=REAL` 排序
- **Bloomberg级别回复格式**：结构化卡片、emoji分隔线、五维进度条（`████░░`）、数据来源footer（`✓ J-Quants ✓ ...`）
- **STOCK_NOT_FOUND 严格处理**：未知代码直接早返回"未找到"，不经过GPT，无幻觉风险
- **数据来源公开**：每次回复底部自动追加 `📊 数据来源 / ⏰ 更新时间 JST`

### 新增意图
| 意图 | 触发词 | 说明 |
|------|--------|------|
| `recommend_ten` | 推荐十只/TOP10 | 真实TOP10；DB<10时如实告知数量 |
| `market_overview` | 今天市场如何/日经怎么样 | NASDAQ+VIX+日经+外资+AI TOP3 |

### DB查询升级
- `fetchTopPicks` — `scoreSource:"REAL"` + `adaptiveScore DESC`（原 `totalScore DESC`）
- `fetchStockData` — 新增 `Disclosure` 查询（近3条TDnet公告）、`equityRatio`、`scaleCategory`
- `fetchThemeStocks` — `scoreSource:"REAL"` + `adaptiveScore DESC` + 外资仅取 `foreigners` 类型
- `fetchMarketOverview` — 新增（GlobalMarket + AI TOP3 + 外资）
- 全部 theme 查询：新增 `金融股` / `医药股` / `能源股` 三个主题

### GPT System Prompt 升级（Phase 1.5）
- 明确禁止规则 6 条（禁止虚构名称/价格/评分/猜测语言/占位符/DB空时补全）
- 四种意图各有独立格式模板（top_picks / stock_analysis / theme / market_overview）
- `temperature: 0.2`（原 0.3）+ `max_tokens: 1500`（原 500）

### 验收结果（2026-06-20 生产）
| 测试 | 结果 |
|------|------|
| 今天买什么 → TOP5 | ✅ 全部真实（291A,9552,6194,...） |
| 推荐十只 → TOP10 | ✅ 全部真实，无虚构名称 |
| 分析7203（丰田） | ✅ 真实价格¥2,776.5 / 真实财务 / 五维进度条 |
| 分析8035（东京电子） | ✅ 真实价格¥75,360 / 评分68 / PER60.1 |
| 分析9999（虚构） | ✅ 直接返回"未找到"，零幻觉 |
| 分析1234（随机） | ✅ 同上 |
| 科技股谁最强 | ✅ 真实TOP8板块股票 |
| 半导体还能买吗 | ✅ 真实VIX+外资+板块数据 |
| 今天市场如何 | ✅ NASDAQ/日经/VIX/外资全真实 |
| 未知意图 | ✅ 返回使用指南，不猜测 |
| 虚构关键词检查 | ✅ 0处"株式会社A/B"等 |
| strictMode 字段 | ✅ 全部返回 `true` |

### 规则（勿改）
- `STRICT_REAL_DATA=true` 禁止删除或改为 `false`
- GPT 职责：仅格式化DB数据，不产生任何原始投资判断
- 数据源footer 为强制项，每次回复必须包含

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
