# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **WARNING — Next.js 16**: This is NOT the Next.js you trained on. APIs, conventions, and file structure differ. Read `node_modules/next/dist/docs/` before writing Next.js-specific code. Route params **must be awaited**: `const { symbol } = await params`.

---

## Commands

```bash
# Development
npm run dev              # Next.js dev server (port 3000)
npm run build            # Production build (required before deploying)
npx tsc --noEmit         # Type-check without building

# Database
npx prisma generate      # Regenerate client after schema changes
npx prisma db push --accept-data-loss  # Apply schema to production (no migration history)
npx prisma studio        # Local DB GUI

# AI Scoring pipeline (run in this order)
npm run fetch-global-market        # Fetch NASDAQ/VIX/USDJPY/Nikkei → GlobalMarket table
npm run fetch-institutional-flow   # Fetch JPX investor flow → InstitutionalFlow table (may fallback to synthetic)
npm run compute-scores             # Recompute all 3700+ StockScore entries (~1-2 min)

# Data sync scripts
npm run sync-meta                  # Sync stock metadata
npm run sync-prices-recent         # Sync recent daily prices

# LINE push (all support DRY_RUN=1 prefix for preview)
npm run line:morning-brief         # 08:00 JST pre-market brief
npm run line:midday-flash          # 12:30 JST midday movers
npm run line:closing-summary       # 15:45 JST post-market summary
npm run send-daily-line            # Full TOP10 daily report
npm run line:risk-alert            # Risk alert push

# Cron scheduler (production: pm2 process tohoshou-cron)
npm run cron
```

---

## Architecture

### Core Data Flow

```
External APIs → DB tables → StockScore (pre-computed) → API routes → UI pages
```

**Scores are never computed on demand in API routes.** `scripts/compute-scores.ts` runs on a schedule (07:30 JST via cron) and writes all scores to `StockScore`. API routes read directly from that table.

### Scoring Pipeline (`lib/ai-score.ts`)

5 dimensions, 100 points total:

| Dimension | Max | Source |
|---|---|---|
| `technicalScore` | 30 | DailyPrice → `lib/indicators.ts` (MA/RSI/MACD/momentum) |
| `fundamentalScore` | 25 | Financial table (op margin, ROE, EPS, equity ratio) |
| `moneyFlowScore` | 20 | InstitutionalFlow (JPX) → fallback to return60d proxy |
| `newsSentimentScore` | 15 | News table (Kabutan + TDnet), positive/negative ratio |
| `globalTrendScore` | 10 | GlobalMarket table (Yahoo Finance NASDAQ/VIX/USDJPY/Nikkei) |

`moneyFlowSource` and `globalTrendSource` fields in `AiScoreResult` track whether real or fallback data was used. When `InstitutionalFlow.source === "jpx"`, real data path is used; otherwise falls back to `return60d` proxy.

Before running `compute-scores`, always run `fetch-global-market` first so `GlobalMarket` table has fresh data.

### Prisma Setup (critical — non-standard)

**Must use the `PrismaPg` adapter**, not the default direct connection:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
```

In Next.js API routes, use the singleton from `lib/prisma.ts`. In standalone scripts, instantiate directly as above.

After every `prisma/schema.prisma` change: `npx prisma generate` locally, then on production: `npx prisma generate && npm run build`.

### Data Sources

| Source | Lib | Table(s) | Notes |
|---|---|---|---|
| J-Quants (JPX) | `lib/jquants.ts` | `DailyPrice`, `Financial` | Env: `JQUANTS_EMAIL+PASSWORD` or `JQUANTS_REFRESH_TOKEN` or `JQUANTS_API_KEY` |
| Yahoo Finance | `lib/yahoo.ts`, `lib/yahooFinance.ts` | `Stock`, `GlobalMarket` | `yahoo-finance2` v3: must use `new YahooFinance()` instance |
| Kabutan news | `lib/kabutan.ts` | `News` | Scraper; `relatedSymbolConfidence >= 70` = stock-specific |
| TDnet | `lib/tdnet.ts` | `Disclosure` | Scraper; often falls back to mock |
| JPX investor flow | `scripts/fetch-institutional-flow.ts` | `InstitutionalFlow` | JPX unreachable from HK server → `source="synthetic"` |
| Global market | `scripts/fetch-global-market.ts` | `GlobalMarket` | VIX uses `yf.quote()`, others use `yf.historical()` |

### Async Job Pattern

Long-running syncs (J-Quants, news) return a `jobId` immediately and process in the background:

1. POST to `/api/sync/jquants` → returns `{ jobId, total }`
2. Poll `GET /api/sync/jobs/[jobId]` every 3s → `{ status, processed, total, pct }`
3. Status: `PENDING → RUNNING → SUCCESS | FAILED`

Jobs are tracked in the `SyncJob` table.

### LINE Push Infrastructure

All push scripts use `lib/line-push.ts`:

```typescript
import { pushToAll, textMsg } from "../lib/line-push";
// Sends to all active LineGroup rows + broadcasts to individual followers
const result = await pushToAll([textMsg(message)], groupIds);
```

Check `DRY_RUN=1` env var before sending. All scripts exit early if `!isConfigured()` from `lib/line.ts`.

Cron schedule (Asia/Tokyo timezone, `scripts/cron-scheduler.ts`):
- 05:30 GlobalMarket fetch · 06:00 price sync · 07:00/12/18/22 news
- 07:30 AI scores · 08:00 morning brief · 08:30 daily report
- 12:30 midday flash · 15:45 closing summary · 16:35 risk alert · 22:00 meta sync

### Production Deployment

Server: `root@8.209.247.68`, app at `/opt/tohoshou/`, PM2 processes: `tohoshou-web` (port 3000), `tohoshou-cron`.

```bash
# Standard deploy (frontend/API changes)
npm run build
sshpass -p 'Wen565656' rsync -avz --exclude node_modules .next/ root@8.209.247.68:/opt/tohoshou/.next/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 "pm2 restart tohoshou-web"

# After schema changes — also push schema + regenerate on server
sshpass -p 'Wen565656' scp prisma/schema.prisma root@8.209.247.68:/opt/tohoshou/prisma/
sshpass -p 'Wen565656' ssh root@8.209.247.68 "cd /opt/tohoshou && npx prisma generate && npm run build && pm2 restart tohoshou-web"

# After scoring logic changes — recompute scores
sshpass -p 'Wen565656' ssh root@8.209.247.68 "cd /opt/tohoshou && npx tsx scripts/compute-scores.ts"

# Run scripts on production (must cd first — dotenv/config resolves .env from CWD)
sshpass -p 'Wen565656' ssh root@8.209.247.68 "cd /opt/tohoshou && npx tsx scripts/<script>.ts"
```

⚠️ `rsync` overwrites `.env` on the server. After any rsync, verify `.env` is intact before restarting.

### Key Schema Notes

- `StockScore` uses `symbol` as `@id` (not an auto-increment) — upsert by symbol
- `InstitutionalFlow` unique constraint: `(date, investorType, market)` — named `date_investorType_market` in Prisma
- `News.relatedSymbolConfidence`: 0-100, ≥70 means article is specifically about a stock
- `SyncJob.id` is a `cuid()` string, not an integer
- `GlobalMarket.date` is `@db.Date @unique` — one row per calendar day
- `DailyPrice` unique: `(symbol, date)` — 7.9M rows, query with `take` limits

### Rating Thresholds (do not change)

```
STRONG_BUY ≥ 90
BUY        ≥ 80
HOLD       ≥ 65
WATCH      ≥ 50
AVOID      < 50
```
