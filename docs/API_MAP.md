# TOHOSHOU AI — API Route Map

**Version:** v8.9.5  
**Updated:** 2026-06-23

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

## AI / Chat

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/chat` | — | Web AI chat (intent engine → DB → answer) |
| POST | `/api/wecom/callback` | HMAC | WeChat Work message webhook |
| POST | `/api/wecom/chat` | HMAC | WeChat Work chat handler |

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
| GET | `/api/backtest/summary` | — | BacktestResult cohort summary |
| GET | `/api/backtest/health` | — | Backtest data health check |
| GET | `/api/backtest/trend` | — | Return trend by horizon |

---

## Portfolio

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/portfolio` | — | User portfolios |
| POST | `/api/portfolio` | — | Create/update portfolio position |
| DELETE | `/api/portfolio` | — | Remove position |
| GET | `/api/watchlist` | — | (see above) |

---

## Admin (v8.9+)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/verify` | ADMIN_TOKEN (optional) | Multi-module production health check |
| GET | `/api/admin/verify?module=dailyrec` | — | DailyRecommendation snapshot |
| GET | `/api/admin/verify?module=history&symbol=` | — | Per-symbol recommendation history |
| GET | `/api/admin/verify?module=backtest` | — | Backtest picks + cohort results |
| GET | `/api/admin/deployments` | ADMIN_TOKEN (optional) | List deployment history (newest first) |
| POST | `/api/admin/deployments` | ADMIN_TOKEN (optional) | Record a new deployment |

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
  operator?: string; deployedAt?: string;   // ISO string, defaults to now()
}
```

---

## Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notifications` | — | User notification list |

---

## Auth Notes

- Most routes are open (no auth) — internal tooling only, no user auth system
- `/api/admin/*` routes check `ADMIN_TOKEN` env var; if unset, open to all
- Auth via `x-admin-token` header OR `?token=` query param
