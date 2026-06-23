# TOHOSHOU AI — Architecture Overview

**Version:** v8.9.5  
**Updated:** 2026-06-23

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
  ├── DailyRecommendation    ← rerank-top500.ts Step 8
  ├── BacktestResult         ← update-backtest.ts
  ├── DeploymentLog          ← record-deployment.ts + POST /api/admin/deployments
  └── RealtimeMarket         ← /api/realtime-market (on-demand)

API Routes (Next.js 16 App Router, force-dynamic)
  ├── /api/screener          → StockScore + GPTScore
  ├── /api/watchlist         → WatchList + StockScore + GPTScore + RealtimeMarket + Stock(52W)
  ├── /api/stocks/[symbol]   → Stock + StockScore + Financial + News
  ├── /api/admin/verify      → multi-module health check (8 modules)
  ├── /api/admin/deployments → DeploymentLog CRUD
  ├── /api/chat              → intent engine + query engine + answer builder
  └── /api/sync/*            → async sync jobs with jobId polling

UI Pages
  ├── /                      → dashboard (top picks, market overview)
  ├── /screener              → AI screener (3+4 column grid)
  ├── /watchlist             → 4-column compact watchlist cards
  ├── /ai-theme              → supply chain theme map
  ├── /stocks/[symbol]       → stock detail + AI score breakdown
  ├── /backtest              → backtest results
  ├── /portfolio             → portfolio tracker
  ├── /news                  → news feed
  ├── /sync                  → system status page
  └── /admin/verify          → production verification center + deploy history
```

---

## Scoring Pipeline (pre-computed, never on-demand)

```
07:30 JST cron
  └── compute-scores.ts
        ├── Pass 1: per-stock — technical/fundamental/moneyFlow/news/global scores
        │          → StockScore (upsert, ~3700 stocks, ~45s)
        └── Pass 2: market-wide — percentileRank, marketRank, recommendationV2

After compute-scores (manual or cron):
  └── rerank-top500.ts
        ├── Load top-500 StockScore by adaptiveScore
        ├── GPT scoring loop (JSON-only, intent=stock analysis)
        ├── Sort by finalScore → gptRank
        ├── Upsert GPTScore
        └── Step 8: upsert DailyRecommendation (date+symbol composite key)
```

**Rule:** API routes NEVER call `compute-scores` or GPT on demand. All factual content comes from DB.

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

## Admin / DevOps Layer (v8.9.5)

```
/admin/verify page
  ├── Banner: PRODUCTION READY (ready, blockingIssues, allowRec, warnings)
  ├── Modules (8): system, data_sync, daily_rec, ai_scores, backtest, cron, health, api_routes
  ├── DailyRec snapshot (filterable by date/symbol)
  ├── Historical snapshot (by symbol)
  ├── Backtest results + picks
  └── Deployment History (deployment_logs table, latest first)

/api/admin/deployments
  ├── GET  ?limit=20  → list DeploymentLog rows (newest first)
  └── POST           → create DeploymentLog (used by record-deployment.ts + CI)

scripts/record-deployment.ts
  └── CLI writer → local DB (then POST to prod API separately)
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Scores pre-computed | API latency < 50ms; no GPT cost on user requests |
| PrismaPg adapter | Required for Next.js edge-compatible connection pooling |
| `adaptiveScore` as primary rank | Stock-style-aware weighting; more accurate than fixed-weight |
| `recommendationV2` dual-threshold | Both absolute (≥70) and relative (top 15%) required for BUY |
| RealtimeMarket separate table | On-demand sync; not stale-safe for scoring pipeline |
| DeploymentLog in DB | Queryable, persistent, shown in admin UI; no flat-file drift |

---

## Prisma Setup (critical)

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });
```

- Singleton from `lib/prisma.ts` in API routes
- Direct instantiation in `scripts/` (relative imports only — `@/` not supported)
- After schema change: `npx prisma db push --accept-data-loss` + `npx prisma generate` (both local and production)

---

## Production Infrastructure

| Component | Value |
|-----------|-------|
| Server | `root@8.209.247.68` |
| App path | `/opt/tohoshou/` |
| Domain | `https://aitohoshou.com` |
| PM2 web | `tohoshou-web` (port 3000) |
| PM2 cron | `tohoshou-cron` |
| Deploy | rsync `.next/` (does not overwrite `.env`) |
| Schema | `scp prisma/schema.prisma` → `npx prisma db push` |

---

## i18n

Three locales: `zh-CN` (primary) · `ja-JP` · `en-US`  
All strings via `t()` from `useI18n()`. Exception: stock codes, technical abbreviations, brand names.  
Admin pages (`/admin/verify`) use bilingual inline format: `中文 / English`.
