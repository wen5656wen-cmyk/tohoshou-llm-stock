# TOHOSHOU AI — 项目完整审计包（PROJECT_AUDIT）

> 只读审计快照，供第三方（ChatGPT）独立架构审核使用。生成时未修改任何代码。
> **生成时间**：2026-07-05 · **审计基准 Commit**：`6c588cf`

---

## 第一部分 · 项目基本信息

| 项 | 值 |
|----|----|
| 项目名称 | TOHOSHOU AI（AI 日本股票分析与精选系统，域名 aitohoshou.com） |
| GitHub Repository | `tohoshou-llm-stock`（owner: wen5656wen-cmyk） |
| Remote URL | https://github.com/wen5656wen-cmyk/tohoshou-llm-stock.git |
| 当前 Branch | `main`（生产分支） |
| 当前 Commit Hash | `6c588cfa39873a189153c225c4c8f65128d6758e`（short `6c588cf`） |
| 最新 Tag | `v2.0.0-universe-stable`（仓库仅 1 个 tag；版本以 CHANGELOG `v17.77.0` 为准，两者不同步） |
| 语义版本（CHANGELOG） | **v17.77.0**（2026-07-05） |
| Node 版本 | package.json 未声明 engines；本地 v26.0.0；生产 PM2 运行（建议锁定 LTS） |
| Next.js | **16.2.9**（App Router；构建用 `next build --webpack`，dev 用 `--turbopack`） |
| React / React-DOM | **19.2.4** |
| TypeScript | `^5` |
| Prisma / @prisma/client | **^7.8.0**（**必须用 `@prisma/adapter-pg ^7.8.0`**，非默认直连） |
| 数据库类型 | **PostgreSQL**（`provider = "postgresql"`，client `prisma-client-js`） |
| OpenAI SDK | `openai ^6.44.0` |
| 当前 GPT Model | **`gpt-5.5`**（`OPENAI_MODEL` env，代码默认 `lib/openai.ts` `GPT_MODEL = "gpt-5.5"`）。约束：仅接受 `max_completion_tokens`、`temperature:1` |
| DeepSeek | `AI_MODEL=deepseek-chat`（`lib/ai.ts`，与 OpenAI 分离，用于翻译/意图类，未走 openai.com） |
| 其它依赖 | node-cron ^4.4.1 · pg ^8.22.0 · dayjs ^1.11.21 · zod ^4.4.3 · yahoo-finance2 ^3.15.3 |
| 部署方式 | **手动**：`npm run build` → `rsync .next/ + public/`（有 public 变更时）+ `rsync lib/ scripts/`（cron 直跑 tsx）→ `pm2 restart tohoshou-web`（改 cron-scheduler 才 restart `tohoshou-cron`）。**无 GitHub Actions**（`.github/workflows` 不存在） |
| 生产服务器 | `root@8.209.247.68`，应用路径 `/opt/tohoshou/`（SSH 凭证单独管理，未写入本文档） |
| Nginx | `deploy/02-nginx.conf`（反代 3000） |
| 部署脚本 | `deploy/01-setup-server.sh` · `02-nginx.conf` · `03-deploy-app.sh` |
| PM2 配置 | `ecosystem.config.js`（见第六部分） |
| 部署历史 | `DeploymentLog` 表 + `/api/admin/deployments`，累计 **137** 次部署 |

**PM2 进程**
- `tohoshou-web` — `next start`，fork，port 3000，max_memory_restart 768M，NODE_ENV=production
- `tohoshou-cron` — `npx tsx scripts/cron-scheduler.ts`，fork，**TZ=Asia/Tokyo**，max_memory 512M（node-cron 常驻，改 schedule 必须 restart）
- `tohoshou-ai-daily-pipeline` — ⚠️ **已停用/弃用**（cron_restart `0 21 * * *`；被 tohoshou-cron 取代，保留但 stopped；已知 P1 建议清除，防 double-run race）

**P5 更新补充（2026-07-05 · 🏁 P5 COMPLETE）**

| 项 | 值 |
|----|----|
| P5 Status | ✅ **COMPLETE**（Freeze，除 Bug Fix 外禁改）|
| **Runtime Reliability** | **92 / 100**（P5.5 稳定化后，P0 全关闭）|
| 当前 GPT Model（修正）| **`gpt-4o-mini`**（P5.5 由 gpt-5.5 回退——gpt-5.5 该账户 `insufficient_quota` 受限；`OPENAI_MODEL` env + 4 处代码默认值均已回退）|
| 当前 Commit（更新）| `52ac8da`（P5 收尾）|
| 部署累计（更新）| **147**（本会话 #145 mini回退+JPX / #146 Feature Registry / #147 Runtime 稳定化）|

- **Runtime Timeline（新增可观测性）**：`logs/pipeline-phases-<JST>.jsonl`（per-phase 开始/结束/耗时/状态/来源 phase2·fallback·cron）+ `logs/gpt-runtime-<JST>.jsonl`；`/admin/runtime` + `GET /api/admin/runtime` 展示 30 天 Reliability 趋势 + Pipeline Timeline + GPT Runtime（只读聚合日志/报告，不查 DB）。
- **Pipeline Tracker（P5.5 · P5 Stable）**：`lib/pipeline-tracker.ts`——按阶段完成标记；07:30 fallback `isPhaseCompletedToday()` 幂等跳过今日已成功阶段 → 修复 R3（rerank 每天只跑一次）。
- **GPT Runtime Logger（P5.5）**：`lib/gpt-runtime.ts`——rerank GPT 计量（model/token/retry/429/quota/耗时），观测层 try/catch 包裹，评分零改动。
- **Explain Engine（P5-T1/T2 · P5 Stable）**：`lib/explain/`（10 文件）+ `GET /api/explain/[symbol]`；纯派生只读，接入股票详情页 + 策略中心抽屉。旧 `/api/strategy/explain` 并行保留（Paper/策略抽屉下半部仍用，待统一）。
- **JPX Trading Calendar（P5-T3 · P5 Stable）**：`lib/trading-calendar/jpx.ts`——交易日判断；cron 7 slot guard 非交易日跳过（周末/日本祝日/年末年初），杜绝非交易日空转烧 GPT。
- **Feature Registry（P6-T1 · P6 起点）**：`lib/features/` + `/admin/features`——因子登记中心，不参与计算。**P6 Baseline**：Total 57 / Production 46 / Shadow 11 / Disabled 0 / Category 9 / Source 10。

---

## 第二部分 · 目录结构（3 层）

```
llm-stock/
├── app/                       # Next.js App Router（29 页面 + 83 API）
│   ├── admin/                 # experiments / learning-report / mission-control / research / verify / versions
│   ├── ai-picks/  ai-theme/[theme]/  alpha/{backtest,report,score}/
│   ├── api/                   # 83 route.ts（见第四部分）
│   ├── backtest/  coming-soon/  fusion/{paper,report}/  indicators/
│   ├── market-regime/  news/  portfolio/  screener/  sectors/
│   ├── stocks/[symbol]/  strategy/  sync/  watchlist/
│   ├── layout.tsx  page.tsx  globals.css  favicon.ico
│   ├── HomeDashboardClient.tsx  HomeStockDisplay.tsx  SystemDashboard.tsx
├── components/                # 47 个 .tsx
│   ├── backtest/  command-center/  dashboard/  mobile/  news/
│   ├── paper-trading/  research/  screener/  stock-detail/
│   └── Sidebar.tsx  PriceChart.tsx  Skeleton.tsx  …（顶层若干）
├── lib/                       # 67 个 .ts（业务/数据/评分核心）
│   ├── alpha/  i18n/{messages,types}  market-regime/  navigation/
│   ├── portfolio/  scoring-v3/  strategy/
│   └── ai-score.ts  scoring.ts  scoring-engine.ts  prisma.ts  openai.ts  ai.ts  jquants.ts  yahoo.ts  …
├── scripts/                   # 59 个 .ts（cron + CLI；cron-scheduler.ts 为调度入口）
├── prisma/                    # schema.prisma（54 model / 4 enum）+ migrations/ + seed.ts
├── docs/                      # 17 篇架构/规则文档
├── deploy/                    # 服务器部署脚本 + nginx.conf
├── hooks/                     # useScrollRestoration.ts（⚠️ 未引用）
├── public/                    # PWA 图标 + manifest.webmanifest
├── types/  logs/  reports/
├── ecosystem.config.js  next.config.ts  package.json  tsconfig.json
└── CLAUDE.md  CHANGELOG.md  README.md  ARCHITECTURE.md  PROJECT_STATUS.md  TECH_DEBT.md
```

---

## 第三部分 · 页面（App Router，29 个）

| Route | 用途 | 状态 |
|-------|------|------|
| `/` | AI 指挥中心（首页 Dashboard + Screener 合并，v17.65） | Production |
| `/screener` | AI 选股（兼容保留，逻辑现由 ScreenerBody 承载） | Production |
| `/stocks` | 股票列表 | Production |
| `/stocks/[symbol]` | 股票详情 / AI 决策页 | Production |
| `/strategy` | 策略中心（三策略 · 浅色，v17.75） | Production |
| `/portfolio` | AI 自动交易 / Paper Broker（浅色，v17.76） | Production |
| `/backtest` | AI 历史回测中心 | Production |
| `/news` | 新闻资讯 | Production |
| `/watchlist` | 自选股 | Production |
| `/sectors` | 板块 | Production |
| `/market-regime` | 市场状态 | Production |
| `/indicators` | 技术指标 | Production |
| `/admin/research` | AI 研究中心（概览 + 9 面板，浅色，v17.73） | Production |
| `/admin/mission-control` | 控制中心 V2（浅色，v17.73） | Production |
| `/admin/learning-report` | 学习报告（汉化，v17.77） | Production |
| `/admin/verify` | 数据校验中心 | Production |
| `/admin/versions` | 版本中心 | Production |
| `/admin/experiments` | AI 研发中心（命名统一 + 汉化，v17.72） | Production |
| `/sync` | 同步状态 | Production |
| `/coming-soon` | 占位跳转页 | Production |
| `/ai-picks` | AI 精选（早期页面） | Legacy / 保留 |
| `/ai-theme` · `/ai-theme/[theme]` | AI 主题（14 主题供应链） | Production（低频） |
| `/alpha` · `/alpha/{score,backtest,report}` | Alpha 引擎独立页（早于研究中心整合，现研究中心为主入口） | Legacy / 保留（未在主导航） |
| `/fusion/paper` · `/fusion/report` | Fusion 独立页（早于研究中心整合） | Legacy / 保留 |

> 说明：`/alpha/*`、`/fusion/*`、`/ai-picks` 为研究中心整合前的独立路由，功能已被 `/admin/research?tab=*` 覆盖，路由仍可访问但未在主导航暴露（潜在可归并/下线，见第十部分）。

---

## 第四部分 · API（83 个 route.ts，按域分组）

| 域 / URL | 用途 | 主要调用来源 |
|----------|------|-------------|
| **股票/行情** | | |
| `/api/stocks` `/api/stocks/[symbol]` | 股票列表/详情（支持代码/中日英名搜索） | 首页 SearchBox、stocks 页 |
| `/api/stocks/[symbol]/{intelligence,ai-score,ai-decision,analysis,indicators,strategy,alternatives,gpt-score}` | 个股 AI 智能/评分/决策/指标 | 股票详情页 |
| `/api/prices/[symbol]` `/api/indicators` `/api/financials/[symbol]` | 价格/指标/财务 | 详情、图表 |
| `/api/market-data` `/api/market-stats` `/api/realtime-market` `/api/regime` `/api/sectors` | 大盘/板块/市场状态 | 首页、market-regime、sectors |
| **选股/评分** | | |
| `/api/screener` | 选股列表（预计算 StockScore 读取） | 首页/screener |
| `/api/ai-scores` `/api/gpt-score` `/api/ai-signal-stats` | AI/GPT 评分、信号统计 | screener、回测 |
| `/api/ai-theme` `/api/ai-theme/[theme]` | AI 主题 | ai-theme 页 |
| **Alpha / Shadow / Fusion / V3** | | |
| `/api/alpha` `/api/alpha/[symbol]` `/api/alpha/score` `/api/alpha/backtest` `/api/alpha/report` | Alpha 因子库/评分/回测/有效性 | 研究中心 因子研究/Shadow·Alpha 面板 |
| `/api/fusion/report` `/api/fusion/paper` | 融合研究/融合模拟 | 研究中心 Fusion 面板 |
| `/api/scoring-v3/{shadow,calibration,freeze,backtest}` | V3 动态评分/校准/冻结/回测 | 研究中心 V3 组面板 |
| **回测** | | |
| `/api/backtest/{summary,cohorts,strategy,health,trend}` | 回测汇总/队列/策略/健康/趋势 | /backtest、mission-control |
| **策略** | | |
| `/api/strategy/{overview,[type],explain,performance,validation}` | 策略总览/明细/解释/表现/校验 | /strategy、Paper Broker Explain |
| **组合 / Paper** | | |
| `/api/portfolio` `/api/portfolio/{[id],paper,history,summary,trend,snapshots,snapshots/[date]}` | 组合/Paper 账户/快照/趋势 | /portfolio |
| `/api/sim-portfolio` `/api/sim-portfolio/{buy,sell}` | 模拟买卖（早期 sim） | 早期模拟页 |
| **新闻/披露** | | |
| `/api/news` `/api/disclosures` | 新闻/TDnet 披露 | /news |
| **同步** | | |
| `/api/sync` `/api/sync/{jquants,news,tdnet,yahoo,scores,global-market,status,jobs/[jobId]}` | 各数据源同步 + 异步 Job | /sync |
| **报表** | | |
| `/api/reports/{weekly,monthly}` | 周/月报 | /strategy 报告 tab |
| **Admin / 运维** | | |
| `/api/admin/mission-control` | 控制中心聚合（状态/流水线/新鲜度/策略/pm2/health） | mission-control、research 概览、learning-report、experiments |
| `/api/admin/{learning-report,research,research-overview,verify,versions,version-timeline,versions/compare,experiments,deployments,portfolio-debug}` | 运维/研究/版本/部署 | 各 admin 页 |
| `/api/admin/stocks/[symbol]/ai-universe` | AI universe 手工纳入 | 股票详情 admin 控件 |
| `/api/health/status` | 健康摘要 | verify、experiments、mission-control |
| `/api/watchlist` | 自选股 | /watchlist |

> 全部 API 为 **只读或幂等运维**；评分/推荐由 cron 预计算写入表，API 读表（唯一例外 `/api/stocks/[symbol]/ai-score` 实时重算指标但读预计算 adaptiveScore）。

---

## 第五部分 · AI 架构（调用关系 ASCII Flow）

```
                        外部数据源
   J-Quants(行情/财报)  Yahoo(全球指数/VIX)  Kabutan(新闻)  TDnet(披露)  JPX(机构流向/空卖)
        │                    │                  │              │            │
        ▼                    ▼                  ▼              ▼            ▼
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │  DB 表：DailyPrice · Financial · GlobalMarket · News · Disclosure ·            │
 │         InstitutionalFlow · ShortSellingRatio · MarketRegime                  │
 └───────────────────────────────────────────────────────────────────────────────┘
        │
        ▼  scripts/compute-scores.ts（07:30 JST，Pass1 逐股 + Pass2 全市场分位）
 ┌───────────────────────────────┐
 │  AI 评分引擎 (lib/ai-score.ts) │  5 维：technical30 fundamental25 moneyFlow20 news15 global10
 │  → adaptiveScore（主排名）     │  6 风格自适应加权 → recommendationV2(SB/BUY/HOLD/WATCH/AVOID)
 │  → StockScore（每股预计算）    │  双阈值：SB≥75&≤5% · BUY≥70&≤15% · HOLD≥60 · WATCH≥45 · AVOID<45
 └───────────────┬───────────────┘
                 │
                 ▼  scripts/rerank-top500.ts（GPT Rerank，07:30 之后）  ← OpenAI gpt-5.5（意图/评分叠加）
        ┌────────┴─────────────────────────────────────────────┐
        ▼                        ▼                              ▼
 ┌─────────────┐        ┌──────────────────┐          ┌──────────────────┐
 │  ADAPTIVE   │        │   SHADOW (Alpha) │  影子     │  MARKET REGIME    │  牛/震荡/熊
 │  正式评分 V2 │◄──对照─┤  6 因子复合评分   │  评分     │  门控 + 权重调整   │
 │  (生产)      │        │  (不影响生产)     │          └────────┬─────────┘
 └──────┬──────┘        └────────┬─────────┘                   │
        │                        │                             ▼
        │                        │                   ┌───────────────────────┐
        │                        └──────────────────►│  FUSION (研究)         │
        │                                            │  w·影子 + (1-w)·正式    │  最优 w 按 regime 历史搜索
        │                                            │  RegimeFusionResult     │  (研究模式，不上线)
        │                                            └───────────┬───────────┘
        │                                                        │
        ▼                                                        ▼
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │  ADAPTIVE SCORE V3 (Shadow, 冻结中)  scripts/compute-score-v3-shadow · 10:15    │
 │  动态权重 + 风险层 + 市场状态门控 → AdaptiveScoreV3Shadow / …V3Calibration       │
 │  Freeze：SCORING_ENGINE=v2 保持，每日 10:35 累计前向证据，Fri 16:45 最终评审      │
 └───────────────┬───────────────────────────────────────────────────────────────┘
                 │  DailyRecommendation（strategyType 标记）
                 ▼
 ┌──────────────────────────────────────────────────────────┐
 │  STRATEGY（三策略引擎，共享评分/独立规则/独立资金池 3:4:3） │
 │   Day(≥75,当日)  Swing(≥70,3-10日)  Long(≥80SB,20-90日)   │  16:35/16:40 + 07:30 day(T+1)
 │   → StrategyRecommendation / StrategyPosition / …Snapshot  │
 └───────────────┬──────────────────────────────────────────┘
                 │
        ┌────────┴───────────────┐
        ▼                        ▼
 ┌──────────────┐        ┌──────────────────────────┐
 │  BACKTEST     │        │  PAPER TRADING (Broker)   │  ¥100M 模拟账户
 │  逐 horizon   │        │  镜像策略成交 → PaperAccount│  10:00 fusion-paper + 07:30 paper-broker
 │  vs TOPIX     │        │  /Position/Execution      │  (只读策略表，不影响生产)
 └──────┬───────┘        └──────────────────────────┘
        │
        ▼  scripts/generate-learning-report.ts（07:30 / 17:00）
 ┌──────────────────────────────────────────────────────────┐
 │  LEARNING（学习报告）integrityScore(3:4:3 加权) · fillRate  │
 │  · 特征覆盖 feat_* · 回归检测(需≥2 VersionSnapshot)         │
 └──────────────────────────────────────────────────────────┘
        │
        ▼
 ┌──────────────────────────────────────────────────────────┐
 │  RECOMMENDATION 输出：screener / stocks / strategy / portfolio 页面读预计算表 │
 └──────────────────────────────────────────────────────────┘
```

**GPT 角色**：仅在 `scripts/rerank-top500.ts`（Top500 重排）+ `scripts/gpt-score-overlay.ts`（评分叠加）实际调用 OpenAI gpt-5.5；News/Explain/Learning/Daily/Strategy 摘要均为 DB/规则派生，不直接调用 GPT。

---

## 第六部分 · Cron（`scripts/cron-scheduler.ts`，TZ=Asia/Tokyo）

| Cron 表达式 | 时间(JST) | 脚本/动作 | 作用 |
|-------------|-----------|-----------|------|
| `0 0 * * *` | 00:00 | 日次重置 | 每日状态重置 |
| `0 5 * * *` | 05:00 | update-ai-universe（AI Universe Guard） | 股票池守卫 |
| `30 5 * * *` | 05:30 | fetch-global-market | 全球指数(NASDAQ/VIX/USDJPY/Nikkei) |
| `0 6 * * *` | 06:00 | sync-all-prices（子进程，2h 超时） | 全市场行情同步 |
| `0 7 * * *` | 07:00 | sync-news | 新闻(第1轮) |
| `0 7 * * 1-5` | 07:00(工作日) | fetch-tdnet | TDnet 披露 |
| `30 7 * * *` | 07:30 | **主流水线**（watchdog→）compute-scores → rerank-top500 → create-portfolio-snapshot → update-ai-signal-stats → update-backtest → generate-learning-report → data-health-guard；并 day-strategy(T+1) → generate-strategy-recommendations → paper-broker | 核心 AI 评分/推荐/回测/学习/结算 |
| `45 8 * * *` | 08:45 | compute-alpha-factors | Alpha 因子库 |
| `0 9 * * *` | 09:00 | compute-alpha-analytics | Alpha 有效性分析 |
| `15 9 * * *` | 09:15 | compute-alpha-score | Alpha 影子评分 |
| `30 9 * * *` | 09:30 | backtest-shadow | Alpha 影子回测 |
| `45 9 * * *` | 09:45 | research-fusion | Adaptive Fusion 研究 |
| `0 10 * * *` | 10:00 | fusion-paper-trade | Fusion 模拟盘 |
| `15 10 * * *` | 10:15 | compute-score-v3-shadow | Adaptive Score V3 影子 |
| `35 10 * * *` | 10:35 | replay-score-v3（V3 历史回放） | Freeze 每日前向证据累计 |
| `0 12 * * *` | 12:00 | sync-news | 新闻(第2轮) |
| `35 16 * * 1-5` | 16:35 | swing-strategy | 波段策略引擎 |
| `40 16 * * 1-5` | 16:40 | long-strategy | 长线策略引擎 |
| `45 16 * * 1-5` | 16:45 | strategy-backtest | 策略回测引擎 |
| `45 16 * * 5` | Fri 16:45 | V3 Freeze 最终评审 | 冻结到期评审 |
| `0 17 * * 1-5` | 17:00 | strategy-learning | 策略学习引擎 |
| `15 17 * * 1-5` | 17:15 | strategy-daily-validation | 策略日校验 |
| `30 17 * * 6` | Sat 17:30 | generate-weekly-report | 周报 |
| `0 18 * * *` | 18:00 | sync-news | 新闻(第3轮) |
| `0 18 28-31 * *` | 月末 18:00 | generate-monthly-report | 月报(内部判定月末) |
| `30 18 * * 1-5` | 18:30 | fetch-short-selling-ratio | JPX 空卖比率 |
| `0 22 * * *` | 22:00 | sync-news + sync-stock-meta | 新闻(第4轮) + 元数据同步 |
| `30 22 * * *` | 22:30 | fetch-dividend-history | 配当历史 |
| `30 16 * * 5` | Fri 16:30 | fetch-jquants-investor-types | JPX 机构资金流向(周次) |
| `15 7 * * 1` | Mon 07:15 | 週初备份 | 周初快照 |
| `0 21 * * *`(UTC) | 06:00 | ⚠️ tohoshou-ai-daily-pipeline（PM2 cron_restart） | **已弃用/stopped**，建议清除 |

> 关键运维铁律：改 `cron-scheduler.ts` 后**必须** `pm2 restart tohoshou-cron`（node-cron 常驻内存）；07:30–15:00 JST 窗口内禁止重启（会中断流水线）。

---

## 第七部分 · 数据库（Prisma，54 model / 4 enum，主要模型）

**用户/行情/基础**：`Stock`（元数据）·`DailyPrice`（7.9M 行，`@@unique(symbol,date)`）·`Financial`·`Dividend`·`GlobalMarket`（每日唯一）·`RealtimeMarket`·`News`·`Disclosure`·`InstitutionalFlow`·`ShortSellingRatio`·`MarketRegime`（牛/震荡/熊）

**AI 评分/推荐**：`StockScore`（`@id=symbol`，预计算评分）·`GPTScore`·`AISignalDailyStat`·`DailyRecommendation`（含 strategyType/feat_*）·`AITheme`（`@@unique(symbol,theme)`，14 主题）

**Alpha / Shadow / Fusion / V3**：`AlphaFactor`·`AlphaFactorReport`·`AlphaScore`·`AlphaBacktestResult`·`RegimeFusionResult`·`FusionPaperPick`·`AdaptiveScoreV3Shadow`·`AdaptiveScoreV3Calibration`

**策略（三体系）**：`StrategyRecommendation`·`StrategyPosition`·`StrategySnapshot`·`StrategyCapitalLog`·`StrategyTradeResult`·`StrategyBacktestResult`·`StrategyBacktestSummary`·`StrategyDailyValidation`·`StrategyLearningReport`·`StrategyLearningSummary`

**回测**：`BacktestResult`·`BacktestPositionResult`·`BacktestError`

**组合 / Paper**：`Portfolio`·`PortfolioSnapshot`·`PortfolioSnapshotPosition`·`PaperAccount`·`PaperPosition`·`PaperExecution`·`PaperOrder`·`PaperCashLog`·`SimPortfolio`·`SimPosition`·`SimTrade`（早期 sim）·`WatchList`

**版本/实验/运维**：`VersionSnapshot`·`ExperimentRegistry`·`DeploymentLog`·`SyncJob`·`SyncLog`

> 注：`Sim*` 系列为早期模拟组合，`Paper*` 为现行 Paper Broker，功能重叠（技术债，见第九部分）。

---

## 第八部分 · UI 组件统计

| 指标 | 数值 |
|------|------|
| 页面（page.tsx） | 29 |
| API route.ts | 83 |
| components/*.tsx | 47 |
| lib/*.ts | 67 |
| scripts/*.ts | 59 |
| Prisma model / enum | 54 / 4 |

**超过 500 行的文件（技术债/重构候选）**
| 行数 | 文件 |
|------|------|
| 1835 | `app/strategy/page.tsx`（**最大**，含 SM 内联 + 十余子组件 + Tab，建议拆分） |
| 1478 | `lib/i18n/types.ts`（手动 Messages 接口，i18n 三语言必需） |
| 1473 ×3 | `lib/i18n/messages/{zh-CN,ja-JP,en-US}.ts`（三语言文案，体量正常） |
| 806 | `app/api/admin/mission-control/route.ts`（运维聚合，逻辑密集） |
| 732 | `app/sync/page.tsx` |
| 702 | `app/ai-theme/page.tsx` |
| 648 | `lib/ai-score.ts`（评分核心，勿轻改） |
| 618 | `app/api/admin/research/route.ts` |
| 605 | `app/admin/research/page.tsx`（研究中心壳 + 9 面板编排 + center overview） |
| 523 | `app/admin/verify/page.tsx` |
| 519 | `app/api/admin/verify/route.ts` |
| 513 | `app/SystemDashboard.tsx` |

**可抽象/重复组件**
- 三处独立 dark→light 调色板已分别内联（`components/research/kit.tsx` 的 `RM`、`components/paper-trading/parts.tsx` 的 `M`、`app/strategy/page.tsx` 的 `SM`、`app/admin/mission-control/page.tsx` 的 `M`、`components/research/center.tsx` 的 `M`）——**建议统一抽到共享 design-token 模块**（当前各页复制同一套 Apple 调色板 + SHADOW 常量）。
- KPI 卡 / Section / Table / StatusBadge / Timeline / StackBar 在 `research/kit.tsx` 已抽象；Strategy / Paper Broker / Mission Control 仍各自内联同类原语（可复用 kit）。
- `Badge`/`Pill`/`Dot`/`Card` 在 mission-control、center、paper-trading、strategy 各自定义（**重复**，可合并）。

---

## 第九部分 · Known Issues（UI / 性能 / 架构 / 技术债）

**架构 / 技术债**
1. **设计 token 未统一**：Apple 浅色调色板（bg#F7F8FA/card#FFF/border#E8EAED/SHADOW）在 research/paper-trading/strategy/mission-control/center 各自复制内联，应抽共享模块。
2. **原语组件重复**：Card/Badge/Dot/KpiCard 多处重定义（research kit 已抽象，其它页未复用）。
3. **Sim* 与 Paper* 表功能重叠**：早期 `SimPortfolio/SimPosition/SimTrade` + `sim-portfolio` API 与现行 `Paper*` 并存，早期路由可下线。
4. **Legacy 路由**：`/alpha/*`、`/fusion/*`、`/ai-picks` 已被 `/admin/research?tab=*` 覆盖，仍可访问但未在导航（可归并/下线）。
5. **Tag 与版本不同步**：git 仅 `v2.0.0-universe-stable` 一个 tag，实际 CHANGELOG 已到 v17.77.0（建议补 tag）。
6. **无 CI/CD**：全手动 rsync + pm2；`public/` 变更需单独 rsync（易漏，曾导致图标 404）；改 cron 忘 restart 曾漏跑一整天（P0 历史）。
7. **node engines 未锁定**：package.json 无 `engines.node`，本地 v26 与生产环境可能不一致。

**性能**
8. `app/strategy/page.tsx` 1835 行单文件；研究面板大表默认 render 上限 600 行（已加保护）。
9. `DailyPrice` 7.9M 行，查询须带 `take` 限制（已在规范中）。

**数据/运行态**
10. **feat_* 覆盖 / 回归检测**：`regressionDetection = INSUFFICIENT_DATA`（需 ≥2 个同 schemaVersion 的 VersionSnapshot，当前仅 1 个）。
11. **回测周期未成熟**：1D/3D/5D READY，7D-90D PENDING（设计预期，随时间成熟；30d≈2026-08、90d≈2026-11）。
12. **PM2 幽灵进程**：`tohoshou-ai-daily-pipeline` 已停用但保留，存 double-run race 隐患（P1，建议 `pm2 delete`）。
13. **V3 Freeze 冻结中**：`SCORING_ENGINE=v2`，V3 为影子，切换需人工评审（就绪度 76.8 / Grade B，未达 90 门槛）。
14. `docs/KNOWN_ISSUES.md` 与 `docs/ROADMAP.md` 停留在 v14.0.1（2026-06-26），未随 v17 更新（文档债）。

**P5.5 已关闭（Runtime Stabilization，2026-07-05）**
15. ~~**rerank 重复执行（R3）**~~：✅ 已修复——`pipeline-tracker` 幂等，07:30 fallback 跳过今日已成功阶段，rerank 每天只跑一次。
16. ~~**Fusion Paper 900 异常（R4）**~~：✅ 澄清为误报——900 是 `computedAt` 每日刷新时间戳非新建行，986 行=986 唯一键、0 重复。
17. ~~**07-05 OpenAI 配额耗尽（gpt-5.5 insufficient_quota）**~~：✅ 已回退 gpt-4o-mini 缓解（同账户可用）+ 新增 GPT Runtime 日志早期发现；根因（账户配额）属外部，需人工在 OpenAI 侧处理。
18. **Explain 新旧混用**（P5-T2 遗留）：Paper Broker + 策略抽屉下半部仍走旧 `/api/strategy/explain`，待全站统一（非故障，低优先级）。

---

## 第十部分 · Dead Code（未引用，**仅报告不删除**）

**未引用组件**（grep 全库 0 引用，删除前请二次确认动态引用）
- `components/NewsCard.tsx`
- `components/RecommendationBadge.tsx`
- `components/PriceChange.tsx`
- `components/AIScoreBadge.tsx`
- `components/DisclosureCard.tsx`
- `components/StockMobileCard.tsx`
- `components/research/BossDashboard.tsx`（研究中心重构后弃用）
- `components/research/PanelHeader.tsx`（9 面板改用 kit 后弃用）
- `components/dashboard/SearchBox.tsx`（v17.67.1 移除指挥中心搜索后保留，"未来可用"）

**未引用 Hook**
- `hooks/useScrollRestoration.ts`（0 引用）

**孤立 Script**（未在 package.json / cron-scheduler 引用）
- `scripts/sync-jquants.ts`
- `scripts/backfill-daily-rec-20260622.ts`（一次性回填）
- `scripts/smoke-explain.ts`（冒烟测试）
- `scripts/repair-stale-return60d.ts`（一次性修复）

**未引用页面**：无严格 dead 页（所有 page.tsx 皆有效路由）；但 `/alpha/*` `/fusion/*` `/ai-picks` 为功能已被覆盖的 Legacy 路由（软 dead，见第九部分）。

> 说明：以上为静态 grep 结论，可能存在动态/字符串拼接引用；删除前建议逐一确认。本次审计**未删除任何文件**。

---

## 第十一部分 · GitHub

- **Repository URL**：`https://github.com/wen5656wen-cmyk/tohoshou-llm-stock.git`
- **Production Branch**：`main`
- **审计 Commit**：`6c588cf`

**最近 20 个 Commit**
```
6c588cf v17.77.0: 学习报告 (Learning Report) 全面汉化 (P3-T27)
ccbd8b3 v17.76.0: AI 自动交易 (Paper Broker) UI V2 统一浅色 Dashboard (P3-T26)
8a4537f v17.75.0: 策略中心 UI V2 统一浅色 Dashboard (P3-T25)
e703b9c v17.74.0: PWA 桌面图标升级 (股票 AI 专属 App Icon) (P3-T24)
08d8bea v17.73.0: Mission Control V2 + Research Center 统一浅色重构 (P3-T23)
e67c386 v17.72.0: AI 研发中心命名统一 (Research Center Naming Unification) (P3-T22)
e25ab72 v17.71.2: 控制中心 (/admin/mission-control) 全页汉化
80f1b4b v17.71.1: AI 研发中心 (/admin/experiments) 全页汉化
46d77c3 v17.71.0: AI研究中心·V3组终章重构 (P3-T19.4)
858b1b1 v17.70.0: AI研究中心·Shadow·Alpha 组深色重建 (P3-T19.3)
b95cfbd v17.69.0: AI研究中心·市场与融合组深色重建 (P3-T19.2)
9b1bb88 v17.68.0: AI研究中心·因子研究组深色重建 (P3-T19.1)
07a4dc6 v17.67.1: 指挥中心搜索去重
8320962 v17.67.0: 首页信息架构精炼 (P3-T20 Home × Screener Unified)
f413db8 v17.66.0: 研究中心统一深色终端 Shell + 分组导航
919989a v17.65.0: AI 指挥中心 (Dashboard + Screener 合并) (P3-T19)
438e293 v17.64.0: 研究分析 → AI 研究中心 重构 + 版本中心 LLM 修正 (P3-T18)
340aba4 v17.63.0: OpenAI 模型升级 GPT-4o-mini → GPT-5.5
4ae3b5a v17.62.0: AI历史回测 → AI Backtest Intelligence 重构 (P3-T19)
2ab3fd3 v17.61.0: 版本中心 + 新闻资讯 Premium UI 联合重构 (P3-T18)
```

---

## 第十二部分 · Roadmap

**已完成（近期 P3 系列，v17.x）**
- AI 研究中心：概览 + 9 子面板（因子研究2 / 市场与融合2 / Shadow·Alpha2 / V3组3）统一深色→**浅色 Apple Dashboard**
- 全站浅色统一（P3-T23~T26）：首页 / AI选股 / 研究中心 / 控制中心 V2 / 策略中心 / 研发中心 / 自动交易 Paper Broker
- 全站汉化（P3-T21/T22/T27）：研发中心 / 控制中心 / 学习报告 全页中文
- PWA 图标升级（P3-T24）：蓝渐变 + K线 + AI 星光 + manifest
- OpenAI 升级 gpt-4o-mini → **gpt-5.5**（v17.63）
- 三策略体系（Day/Swing/Long）+ Paper Broker（¥100M 模拟）+ Backtest + Learning 全链路
- Adaptive Score V3（影子，冻结验证中）

**正在开发 / 观测**
- V3 Freeze 冻结验证（7 天窗口，就绪度 76.8/Grade B；达 90 门槛后人工评审是否上线替换 V2）
- 回测周期成熟度累计（7D-90D PENDING → 逐步 READY）
- regressionDetection 待第 2 个 VersionSnapshot 后启用

**下一阶段（建议 / 已规划未落地）**
- 统一 design-token 模块，消除各页调色板/原语重复（技术债 #1/#2）
- Legacy 路由归并/下线（`/alpha/*` `/fusion/*` `/ai-picks`，Sim* 表）
- 清理 dead code（第十部分）+ 补 git tag + 锁 node engines + 引入 CI/CD
- 刷新 `docs/KNOWN_ISSUES.md` / `docs/ROADMAP.md` 到 v17 基线
- 三策略架构文档 Phase 未落地项（StrategyPosition 等已建，UI `/strategy` 已上线）
- 未来模块（Coming Soon）：Portfolio Engine / Factor Lab / Adaptive V4 / AI Explain / Institution Flow / Macro Engine / Risk Engine

---

*本文档为只读审计快照，未修改/删除/格式化任何源码。审计基准 Commit `6c588cf`，分支 `main`。*
