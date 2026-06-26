# TOHOSHOU AI — API Route Map

**Version:** v14.0.1  
**Updated:** 2026-06-26

All routes are Next.js 16 App Router, under `app/api/`. Dynamic routes use `export const dynamic = "force-dynamic"`.

---

## Stock Data

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/stocks` | — | List/search stocks from StockScore |
| GET | `/api/stocks/[symbol]` | — | Stock detail: Stock + StockScore + Financial + News |
| GET | `/api/stocks/[symbol]/ai-score` | — | Live AI score breakdown (re-computes indicators) |
| GET | `/api/stocks/[symbol]/indicators` | — | Technical indicators snapshot |
| GET | `/api/stocks/[symbol]/analysis` | — | AI analysis summary |
| GET | `/api/stocks/[symbol]/alternatives` | — | Similar stocks |
| GET | `/api/stocks/[symbol]/gpt-score` | — | GPTScore row |
| GET | `/api/prices/[symbol]` | — | Daily price history |
| GET | `/api/realtime-market` | — | Realtime snapshot (volumeRatio, MA, 52W) |

---

## Screener & Watchlist

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/screener` | — | Filtered stock list with scores |
| GET | `/api/watchlist` | — | User watchlist + enriched scores (incl. week52Pct, volumeRatio) |
| POST | `/api/watchlist` | — | Add stock to watchlist |
| DELETE | `/api/watchlist?symbol=` | — | Remove from watchlist |

---

## Sectors / Themes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sectors` | — | Sector summary with score aggregates |
| GET | `/api/ai-theme` | — | AI theme list (14 themes) |

---

## Sync / Jobs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sync/status` | — | Last sync timestamps per source |
| POST | `/api/sync/jquants` | — | Trigger J-Quants price sync → returns jobId |
| POST | `/api/sync/scores` | — | Trigger score compute → returns jobId |
| POST | `/api/sync/news` | — | Trigger news sync → returns jobId |
| POST | `/api/sync/global-market` | — | Trigger global market sync |
| POST | `/api/sync/tdnet` | — | Trigger TDnet disclosure sync |
| POST | `/api/sync/yahoo` | — | Trigger Yahoo Finance meta sync |
| GET | `/api/sync/jobs/[jobId]` | — | Poll async job status (PENDING/RUNNING/SUCCESS/FAILED) |

---

## Backtest

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/backtest/summary` | — | BacktestResult cohort summary (schema-v1.0 派生) |
| GET | `/api/backtest/health` | — | Backtest data health check |
| GET | `/api/backtest/trend` | — | Return trend by horizon |

---

## Portfolio

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/portfolio` | — | User portfolios + DailyRecommendation Top10 |
| GET | `/api/portfolio/snapshots` | — | DailyPortfolioSnapshot 历史快照 |
| POST | `/api/portfolio` | — | Create/update portfolio position |
| DELETE | `/api/portfolio` | — | Remove position |

---

## Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/verify` | ADMIN_TOKEN (optional) | Multi-module production health check (8 modules) |
| GET | `/api/admin/verify?module=dailyrec` | — | DailyRecommendation snapshot |
| GET | `/api/admin/verify?module=history&symbol=` | — | Per-symbol recommendation history |
| GET | `/api/admin/verify?module=backtest` | — | Backtest picks + cohort results |
| GET | `/api/admin/deployments` | ADMIN_TOKEN (optional) | List deployment history (newest first) |
| POST | `/api/admin/deployments` | ADMIN_TOKEN (optional) | Record a new deployment |
| GET | `/api/admin/mission-control` | — | Pipeline 10-stage 可见性 + Health Score + feat_* coverage + 5 backtest horizons |
| GET | `/api/admin/learning-report` | — | reports/latest-learning.json 读取（404 if not generated） |
| GET | `/api/admin/versions` | — | VersionSnapshot 列表 |
| POST | `/api/admin/versions` | — | 创建 VersionSnapshot |
| GET | `/api/admin/experiments` | — | ExperimentRun 列表 |
| POST | `/api/admin/experiments` | — | 创建 ExperimentRun |
| PATCH | `/api/admin/experiments/[id]` | — | 更新 ExperimentRun 状态 |
| GET | `/api/admin/research/factor-exposure` | — | 因子暴露分析 (feat_* 字段分布) |
| GET | `/api/admin/research/distribution` | — | 评分/收益分布统计 |
| GET | `/api/admin/research/correlation` | — | 因子相关矩阵 |

---

### `/api/admin/mission-control` Response Shape

```typescript
{
  healthScore: {
    score: number;           // 0-100
    components: {
      dataFreshness: number; pipelineStatus: number;
      featureCoverage: number; healthGuard: number;
    };
    grade: "GREEN" | "YELLOW" | "WARNING" | "RED";
  };
  pipeline: {
    stages: Array<{
      name: string; status: "SUCCESS" | "FAILED" | "NEVER_RUN" | "WARNING";
      lastRunAt: string | null; duration: number | null;
    }>;
    lastFullRunAt: string | null;
  };
  featureCoverage: { latestDate: string; totalRows: number; overallPct: number };
  version: { current: string; schemaVersion: string; modelVersion: string };
  backtest: {
    horizons: Array<{
      horizon: string; sampleCount: number; filledCount: number;
      winRate: number | null; avgReturn: number | null; status: string;
    }>;
  };
  freshness: {
    sources: Array<{ name: string; days: number; status: "FRESH" | "STALE" | "MISSING" }>;
  };
}
```

### `/api/admin/learning-report` Response Shape

```typescript
{
  reportDate: string;          // "YYYY-MM-DD"
  generatedAt: string;         // ISO UTC
  reportVersion: string;       // "v1.0"
  engineVersion: string;       // "learning-engine-v1.0"
  dataIntegrity: {
    score: number;             // 0-100
    grade: string;             // "GREEN"|"YELLOW"|"WARNING"|"RED"|"CRITICAL"
    components: Record<string, {
      score: number;
      [key: string]: unknown;  // stagesChecked, violations, fillRate, etc.
    }>;
  };
  dataReadiness: {
    tradingDays: number;
    latestCohortDate: string;
    availableHorizons: string[];
    sampleCounts: Record<string, number>;
    filledCounts: Record<string, number>;
    featureCoverage: { latestDate: string; totalRows: number; overallPct: number; note: string };
    expectedFillDates: { "30d": string | null; "90d": string | null };
  };
  backtestSummary: Array<{
    horizon: string; sampleCount: number; filledCount: number; fillRate: number;
    winRate: number | null; avgReturn: number | null; medianReturn: number | null;
    alpha: number | null; bestReturn: number | null; worstReturn: number | null;
    status: "READY" | "PARTIAL" | "INSUFFICIENT" | "PENDING";
  }>;
  versionComparison: VersionComparisonEntry[];
  regressionDetection: {
    status: "OK" | "WARNING" | "CRITICAL" | "INSUFFICIENT_DATA";
    delta: number | null;
    currentVersion: string; baselineVersion: string | null;
  };
  recommendations: string[];
}
```

### `/api/admin/verify` Response Shape

```typescript
{
  ready: boolean;
  blockingIssues: string[];
  warnings: string[];
  modules: Array<{
    key: string; name: string;
    status: "PASS" | "WARNING" | "FAIL";
    current: string | number | boolean | null;
    expected: string; message: string; fixHint: string;
  }>;
  checkedAt: string;   // ISO UTC
  meta: { stockCount, priceSyncOk, healthCritical, healthAllowRec }
}
```

### `/api/admin/deployments` Response Shape

```typescript
// GET
{ total: number; rows: DeploymentRow[] }

// POST body
{
  commitHash: string; summary: string; modifiedFiles: string[];
  buildStatus: string; healthStatus: string; apiStatus: string;
  pageStatus: string; databaseStatus: string; pm2Status: string;
  productionReady: boolean; warnings: string[]; blockingIssues: string[];
  operator?: string; deployedAt?: string;
}
```

---

## Auth Notes

- 大多数路由开放（无 auth）— 仅内部工具
- `/api/admin/*` 路由检查 `ADMIN_TOKEN` 环境变量；若未设置，所有人可访问
- Auth via `x-admin-token` header 或 `?token=` query param
