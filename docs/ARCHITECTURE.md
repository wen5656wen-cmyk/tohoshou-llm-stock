# TOHOSHOU AI — Architecture Overview

**Version:** v14.0.1  
**Updated:** 2026-06-26

---

## System Topology

```
External APIs
  ├── J-Quants (JPX)        → DailyPrice, Financial, InstitutionalFlow
  ├── Yahoo Finance          → Stock, GlobalMarket
  ├── Kabutan / TDnet        → News, Disclosure
  └── JPX (PDF)              → ShortSellingRatio

DB (PostgreSQL + Prisma 7 + PrismaPg adapter)
  ├── StockScore             ← pre-computed by compute-scores.ts (cron 07:30 JST)
  ├── GPTScore               ← rerank-top500.ts (cron, top 500 only)
  ├── DailyRecommendation    ← rerank-top500.ts Step 8 (含 feat_* 30 字段 CREATE-only)
  ├── BacktestPositionResult ← update-backtest.ts (schema-v2.3 不可变真实收益)
  ├── BacktestResult         ← update-backtest.ts (schema-v1.0 派生汇总，向后兼容)
  ├── VersionSnapshot        ← rerank-top500.ts Step 9
  ├── ExperimentRun          ← 实验平台手动/API 写入
  ├── DeploymentLog          ← record-deployment.ts + POST /api/admin/deployments
  └── RealtimeMarket         ← /api/realtime-market (on-demand)

File System (production: /opt/tohoshou/)
  ├── logs/pipeline-runs.jsonl  ← cron 每次运行追加（JSONL，一行 = 一个 stage）
  └── reports/
        ├── latest-learning.json              ← 最新学习报告（软链接）
        └── learning-report-YYYY-MM-DD.json   ← 每日快照

API Routes (Next.js 16 App Router, force-dynamic)
  ├── /api/screener              → StockScore + GPTScore
  ├── /api/watchlist             → WatchList + StockScore + GPTScore + RealtimeMarket + Stock(52W)
  ├── /api/stocks/[symbol]       → Stock + StockScore + Financial + News
  ├── /api/admin/verify          → multi-module health check (8 modules)
  ├── /api/admin/deployments     → DeploymentLog CRUD
  ├── /api/admin/mission-control → 10-stage pipeline 可见性 + Health Score + feat_* coverage
  ├── /api/admin/learning-report → reports/latest-learning.json 读取（404 if not generated）
  ├── /api/admin/versions        → VersionSnapshot CRUD
  ├── /api/admin/experiments     → ExperimentRun CRUD
  ├── /api/admin/research/*      → 只读分析（factor exposure, distribution, correlation）
  └── /api/sync/*                → async sync jobs with jobId polling

UI Pages
  ├── /                          → 今日总览（主驾驶舱：Mission Control 数据 + DR 统计）
  ├── /screener                  → AI选股（3+4 列网格）
  ├── /portfolio                 → AI组合追踪（DailyRecommendation Top10）
  ├── /backtest                  → 回测验证（v2.3 9-Horizon KPI 矩阵 + v1 历史表）
  ├── /news                      → 新闻资讯
  ├── /sync                      → 同步状态
  ├── /admin/mission-control     → Pipeline 10 阶段运营仪表盘
  ├── /admin/learning-report     → 学习报告（Integrity Score + 9-Horizon + 回归检测）
  ├── /admin/research            → 因子研究分析（feat_* 分布 / 相关矩阵）
  ├── /admin/versions            → VersionSnapshot 版本中心
  ├── /admin/experiments         → ExperimentRun 实验管理
  └── /admin/verify              → 生产校验中心 + 部署历史
```

---

## Architecture v2.3 — 四个不可变决策（2026-06-26 冻结）

| # | 决策 | 理由 |
|---|------|------|
| 1 | `DailyRecommendation` = T0 快照，feat_* CREATE-only | 不可变特征保证回测无未来数据 |
| 2 | `BacktestPositionResult` = per-symbol 真实收益（不可变） | 不可变真值表，`update-backtest` 只写不改 |
| 3 | `BacktestResult` = 派生汇总（可更新） | 允许 win-rate 公式迭代 |
| 4 | `VersionSnapshot` = 比较锚点 | 版本间回归检测的基准 |

**feat_* 字段（30 个）：** 写入时机 = `rerank-top500.ts` CREATE 路径，UPDATE 路径不触碰。  
现有 604 行覆盖率 = 0%（v14.0.0-IA 部署前的行，下次 cron 后新行开始积累）。

---

## Scoring Pipeline（预计算，绝不按需）

```
07:30 JST cron（tohoshou-cron PM2）
  └── compute-scores.ts         (~90min)
        ├── Pass 1: per-stock — technical/fundamental/moneyFlow/news/global
        │          → StockScore (upsert, ~3700 stocks)
        └── Pass 2: market-wide — percentileRank, marketRank, recommendationV2

  └── rerank-top500.ts          (~2.5h)
        ├── Load top-500 by adaptiveScore
        ├── GPT scoring loop (JSON-only)
        ├── Upsert GPTScore
        ├── Step 8: CREATE DailyRecommendation (含 feat_* 30 字段)
        └── Step 9: Upsert VersionSnapshot

  └── create-portfolio-snapshot  (~即时)
  └── update-ai-signal-stats     (~即时)
  └── update-backtest.ts         (~20min)
        └── 从 DailyRecommendation 回填 BacktestPositionResult.actualReturn

  └── generate-learning-report.ts (~即时)
        └── 写入 reports/learning-report-YYYY-MM-DD.json + latest-learning.json

  └── data-health-guard.ts       (~即时)

Pipeline 完成时间：约 13:00 JST
每个 stage 写一行到 logs/pipeline-runs.jsonl（Mission Control 数据源）
```

**规则：** API 路由绝不调用 compute-scores 或 GPT。所有事实内容来自 DB。

---

## 9-Horizon 回测系统（schema-v2.3）

| Horizon | HORIZON_CAL_DAYS | 首次可填日期（从 2026-06-26 起） |
|---------|-----------------|-------------------------------|
| 1d | 4 | 2026-06-30 |
| 3d | 6 | 2026-07-02 |
| 5d | 9 | 2026-07-05 |
| 7d | 12 | 2026-07-08 |
| 10d | 17 | 2026-07-13 |
| 20d | 32 | 2026-07-28 |
| 30d | 46 | 2026-08-11 |
| 60d | 92 | 2026-09-26 |
| 90d | 132 | 2026-11-05 |

---

## Watchlist Data Flow (v8.9.4)

```
GET /api/watchlist
  ├── WatchList (all rows)
  ├── StockScore (symbol batch) — latestClose, return5/20d, rsi14, maTrend, scores
  ├── Stock (symbol batch)      — nameZh, nameEn, high52w, low52w
  ├── GPTScore (symbol batch)   — finalScore, gptRank, gptRating
  └── RealtimeMarket (symbol batch) — volumeRatio, turnoverRate

week52Pct = clamp(0,100, round((close - low52w) / (high52w - low52w) * 100))
```

---

## Admin / DevOps Layer（v14.0.x）

```
/admin/mission-control
  ├── Health Score (100pt: dataFreshness/pipelineStatus/featureCoverage/healthGuard 各25)
  ├── 10 Pipeline Stages（pipeline-runs.jsonl）
  ├── feat_* 覆盖率
  ├── 5 Backtest Horizons（1d/3d/7d/30d/90d）
  └── Data Freshness 各数据源

/admin/learning-report
  ├── Integrity Score（67pt WARNING → 目标 ≥75pt GREEN 在首次 cron 后）
  ├── 9-Horizon 回测表（winRate/avgReturn/alpha/fillRate）
  ├── 数据就绪度网格
  ├── 回归检测（需 ≥2 VersionSnapshot）
  └── 建议事项列表

/admin/verify
  ├── Banner: PRODUCTION READY
  ├── 8 个模块健康检查
  ├── DailyRec 快照
  └── DeploymentLog 历史

/api/admin/deployments
  ├── GET  ?limit=20  → DeploymentLog 列表
  └── POST           → 创建 DeploymentLog
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Scores pre-computed | API latency < 50ms；无 GPT 按需成本 |
| PrismaPg adapter | Next.js edge-compatible connection pooling |
| `adaptiveScore` primary rank | 股票风格自适应权重；比固定权重更准确 |
| `recommendationV2` dual-threshold | 绝对值(≥70) AND 相对值(top 15%) 双条件 |
| RealtimeMarket 独立表 | 按需同步；不安全用于评分流水线 |
| DeploymentLog in DB | 可查询、持久化、admin UI 展示 |
| feat_* CREATE-only | 保证特征快照不可变，回测无未来数据污染 |
| pipeline-runs.jsonl | JSONL 追加写，cron 外部不依赖 DB 可观测 |
| reports/ JSON 快照 | 学习报告与 DB 解耦，可离线阅读 |

---

## Prisma Setup (critical)

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });
```

- Singleton from `lib/prisma.ts` in API routes
- Direct instantiation in `scripts/`（相对路径，`@/` 不支持）
- Schema 变更后：`npx prisma db push --accept-data-loss` + `npx prisma generate`（本地和生产都要执行）

---

## Production Infrastructure

| Component | Value |
|-----------|-------|
| Server | `root@8.209.247.68` |
| App path | `/opt/tohoshou/` |
| Domain | `https://aitohoshou.com` |
| PM2 web | `tohoshou-web` (port 3000) |
| PM2 cron | `tohoshou-cron` |
| PM2 (停用) | `tohoshou-ai-daily-pipeline`（stopped，待清除） |
| Deploy web | rsync `.next/` + `lib/` + `scripts/`（不覆盖 .env） |
| Deploy schema | scp schema → `npx prisma db push` → `npx prisma generate` |
| Cron window | 07:30–13:00 JST — 禁止重启 tohoshou-cron |

---

## i18n

三个 locale：`zh-CN`（主要）· `ja-JP` · `en-US`  
所有字符串通过 `t()` from `useI18n()`。例外：股票代码、技术缩写、品牌名。  
Admin 页面（`/admin/verify`）使用双语内联格式。
