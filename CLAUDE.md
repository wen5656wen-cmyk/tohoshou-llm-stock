# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **WARNING — Next.js 16**: This is NOT the Next.js you trained on. Route params **must be awaited**: `const { symbol } = await params`. Use `"use client"` + `useParams()` hook for client components.

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
npm run fetch-institutional-flow   # Fetch JPX investor flow → InstitutionalFlow table
npm run compute-scores             # Recompute all 3700+ StockScore entries (~45s)

# Data sync scripts
npm run sync-meta                  # Sync stock metadata
npm run sync-prices-recent         # Sync recent daily prices
npm run fetch-dividend-history     # J-Quants → Dividend table
npm run fetch-short-selling        # JPX PDF → ShortSellingRatio table
npm run seed:ai-themes             # Reset AITheme table (109 entries, 14 themes)

# LINE push (all support DRY_RUN=1 prefix for preview)
npm run line:morning-brief         # 08:00 JST pre-market brief
npm run line:midday-flash          # 12:30 JST midday movers
npm run line:closing-summary       # 15:45 JST post-market summary
npm run send-daily-line            # Full TOP10 daily report
npm run line:risk-alert            # Risk alert push

# Testing
npm run test:intent-engine         # Intent engine: 14 intent tests (requires live DB)
npm run test:intent-engine:dry     # Intent-only tests (SKIP_DB=1, no DB needed)
npm run validate:line-links        # Validate all LINE Flex button URLs resolve correctly

# Cron scheduler (production: pm2 process tohoshou-cron)
npm run cron
```

---

## Architecture

### Core Data Flow

```
External APIs → DB tables → StockScore (pre-computed) → API routes → UI pages
                                                       ↘ Chat pipeline → LINE / Web
```

**Scores are never computed on demand in API routes.** `scripts/compute-scores.ts` runs on a schedule (07:30 JST via cron) and writes all scores to `StockScore`. API routes read directly from that table. The one exception is `GET /api/stocks/[symbol]/ai-score`, which re-computes live indicators but reads `adaptiveScore`/`percentileRank`/`recommendationV2` from the pre-computed `StockScore` row.

### Scoring Pipeline (`lib/ai-score.ts`)

5 dimensions, 100 points total:

| Dimension | Max | Source |
|---|---|---|
| `technicalScore` | 30 | DailyPrice → `lib/indicators.ts` (MA/RSI/MACD/momentum) |
| `fundamentalScore` | 25 | Financial table (op margin, ROE, EPS, equity ratio) |
| `moneyFlowScore` | 20 | InstitutionalFlow (JPX) → fallback to return60d proxy |
| `newsSentimentScore` | 15 | News table (Kabutan + TDnet), positive/negative ratio |
| `globalTrendScore` | 10 | GlobalMarket table (Yahoo Finance NASDAQ/VIX/USDJPY/Nikkei) |

`adaptiveScore` is the primary ranking metric — it re-weights the 5 dimensions per stock style (6 styles: `VALUE_DEFENSIVE`, `GROWTH_MOMENTUM`, `QUALITY_COMPOUNDER`, `SPECULATIVE_MOMENTUM`, `CYCLICAL_EXPORTER`, `DOMESTIC_DEFENSIVE`). Style is auto-classified in `classifyStockStyle()` by sector pattern + financial metrics.

`compute-scores.ts` runs in two passes: Pass 1 computes per-stock scores, Pass 2 derives `percentileRank`/`marketRank`/`recommendationV2` across the whole market.

### Rating Thresholds (v8.1 — `recommendationV2` dual-threshold)

```
STRONG_BUY  adaptiveScore ≥ 75  AND  percentileRank ≤ 5%
BUY         adaptiveScore ≥ 70  AND  percentileRank ≤ 15%
HOLD        adaptiveScore ≥ 60
WATCH       adaptiveScore ≥ 45
AVOID       adaptiveScore < 45
```

`percentileRank` is 1-100 where **lower = better** (1 = top 1% of market). Both conditions must hold for STRONG_BUY and BUY.

### AI Chat Pipeline (`/api/chat` + LINE webhook)

Both Web and LINE share identical logic — single source of truth:

```
message
  → detectSystemCommand()    [lib/ai-control.ts]   # START/STOP/RESET/STATUS — bypass all
  → getAiEnabled(userId)     [lib/ai-control.ts]   # if false → PAUSE_MSG, bypass all
  → parseUserIntent()        [lib/intent-engine.ts] # regex-first (~90%) + GPT fallback (JSON only)
  → queryDatabase()          [lib/query-engine.ts]  # DB only, no GPT, answerSource="DB"
  → buildWebAnswer()         [lib/answer-builder.ts] # formatted text, no GPT
  or buildLineMessages()     [lib/answer-builder.ts] # LINE Flex cards
```

**GPT role is strictly intent classification** — it outputs only `StructuredIntent` JSON. GPT never generates stock names, prices, scores, or natural language answers. All factual content comes from DB. `hallucination` field in response is always `false`.

Conversation context is stored in-memory with 30-minute TTL (`lib/intent-engine.ts` `CONTEXTS` Map). Web users pass `sessionId` (`web_{uuid}`) as `userId`; LINE uses LINE userId.

### 12 Intent Types (`lib/intent-schema.ts`)

`top_picks` / `recommend_more` / `stock_analysis` / `stock_compare` / `theme_rank` / `sector_outlook` / `market_overview` / `risk_analysis` / `reason_explain` / `data_source` / `help` / `unknown`

`unknown` always returns the help menu — never "unsupported query" text.

### System Commands (`lib/ai-control.ts`)

Exact-match regex patterns, processed before the intent engine:

| Command | Triggers |
|---|---|
| `START` | 启动AI / 开启AI / start / 唤醒 / 激活 |
| `STOP` | 关闭AI / 停止 / stop / 休眠 / 暂停 |
| `RESET` | 清空上下文 / 重置 / reset / 清空记忆 |
| `STATUS` | 当前状态 / 状态 / status / AI状态 |

Persisted to `UserAiSettings` table (`userId`, `aiEnabled`, `mode`).

### Prisma Setup (critical — non-standard)

**Must use the `PrismaPg` adapter**, not the default direct connection:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
```

In Next.js API routes, use the singleton from `lib/prisma.ts`. In standalone scripts, instantiate directly as above.

After every `prisma/schema.prisma` change: `npx prisma generate` locally, then on production: `npx prisma db push --accept-data-loss && npx prisma generate`.

### Key Schema Notes

- `StockScore` uses `symbol` as `@id` (not auto-increment) — upsert by symbol
- `AITheme` uses `@@unique([symbol, theme])` — one stock can belong to multiple themes
- `InstitutionalFlow` unique: `(date, investorType, market)` — named `date_investorType_market` in Prisma
- `News.relatedSymbolConfidence`: 0-100, ≥70 means article is specifically about a stock
- `SyncJob.id` is a `cuid()` string, not an integer
- `GlobalMarket.date` is `@db.Date @unique` — one row per calendar day
- `DailyPrice` unique: `(symbol, date)` — 7.9M rows, always query with `take` limits
- `Dividend.yieldRate` is in % form (e.g. 3.42 = 3.42%); `payoutRatio` is 0-1 decimal

### Data Sources

| Source | Lib | Table(s) | Notes |
|---|---|---|---|
| J-Quants (JPX) | `lib/jquants.ts` | `DailyPrice`, `Financial` | Env: `JQUANTS_EMAIL+PASSWORD` or `JQUANTS_REFRESH_TOKEN` or `JQUANTS_API_KEY` |
| Yahoo Finance | `lib/yahoo.ts`, `lib/yahooFinance.ts` | `Stock`, `GlobalMarket` | `yahoo-finance2` v3: must use `new YahooFinance()` instance; VIX uses `yf.quote()` |
| Kabutan news | `lib/kabutan.ts` | `News` | Scraper |
| TDnet | `lib/tdnet.ts` | `Disclosure` | Cookie-based scraper; `catalystScore` derived from Disclosure events |
| JPX investor flow | `scripts/fetch-jquants-investor-types.ts` | `InstitutionalFlow` | Weekly; production server may not reach JPX → fallback `source="synthetic"` |
| JPX short selling | `scripts/fetch-short-selling-ratio.ts` | `ShortSellingRatio` | PDF parse via `pdftotext` (system: `apt install poppler-utils`) |
| Global market | `scripts/fetch-global-market.ts` | `GlobalMarket` | Run before `compute-scores` to get fresh data |

### AITheme Queries (v8.0 — multi-theme per stock)

```typescript
// A stock can appear in multiple themes — use symbol+theme composite key
const themeRows = await prisma.aITheme.findMany({
  where: { theme: "SEMI_EQUIPMENT" },
  orderBy: [{ isCore: "desc" }, { importanceScore: "desc" }],
});

// Upsert key is symbol_theme (composite)
await prisma.aITheme.upsert({
  where: { symbol_theme: { symbol, theme } },
  create: { ... },
  update: { ... },
});
```

14 themes: `CHIP_DESIGN` / `SEMI_EQUIPMENT` / `TEST_EQUIPMENT` / `CHIP_MATERIAL` / `HBM_PACKAGING` / `SENSOR_PRECISION` / `SERVER_DC` / `NETWORK` / `ROBOT_AUTO` / `SOFTWARE_CLOUD` / `INTERNET_PLATFORM` / `MEDICAL_LIFE` / `SECURITY_VISION` / `POWER_INFRA`

Supply chain layers: `UPSTREAM` → `MIDSTREAM` → `DOWNSTREAM` / `INFRASTRUCTURE` / `APPLICATION`

### URL Utilities (critical for LINE messages)

All URLs in LINE Flex messages and buttons **must** use `lib/app-url.ts` helpers. Never hardcode `localhost` or relative paths:

```typescript
import { stockUrl, aiPicksUrl, screenerUrl, aiThemeUrl } from "@/lib/app-url";
// Uses APP_URL env var (server-side) → NEXT_PUBLIC_APP_URL (build-time) → hardcoded production URL
```

### Async Job Pattern

Long-running syncs (J-Quants, news) return a `jobId` immediately:

1. POST to `/api/sync/jquants` → returns `{ jobId, total }`
2. Poll `GET /api/sync/jobs/[jobId]` every 3s → `{ status, processed, total, pct }`
3. Status: `PENDING → RUNNING → SUCCESS | FAILED`

### LINE Push Infrastructure

```typescript
import { pushToAll, textMsg } from "../lib/line-push";
// Sends to all active LineGroup rows + individual followers
const result = await pushToAll([textMsg(message)], groupIds);
```

Check `DRY_RUN=1` env var before sending. All scripts exit early if `!isConfigured()` from `lib/line.ts`.

Cron schedule (Asia/Tokyo, `scripts/cron-scheduler.ts`):
- 05:30 GlobalMarket · 06:00 price sync · 07:00/12/18/22 news
- 07:30 AI scores · 08:00 morning brief · 08:30 daily report
- 12:30 midday flash · 15:45 closing summary · 16:35 risk alert
- 18:30 short selling · 22:00 meta sync · 22:30 dividend history
- Fri 16:30 / Mon 07:15 JPX investor types

### scripts/ Path Rule

Scripts use relative imports — `@/` alias is **not** supported:

```typescript
import { prisma } from "../lib/prisma";   // ✅
import { prisma } from "@/lib/prisma";    // ❌ fails in scripts/
```

### Production Deployment

Server: `root@8.209.247.68`, app at `/opt/tohoshou/`, PM2: `tohoshou-web` (port 3000), `tohoshou-cron`.

```bash
# Standard deploy (frontend/API changes) — rsync of .next/ does NOT overwrite .env
npm run build
sshpass -p 'Wen565656' rsync -avz --exclude node_modules .next/ root@8.209.247.68:/opt/tohoshou/.next/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 "pm2 restart tohoshou-web --update-env"

# After schema changes — push schema + regenerate on server
sshpass -p 'Wen565656' scp prisma/schema.prisma root@8.209.247.68:/opt/tohoshou/prisma/
sshpass -p 'Wen565656' rsync -avz --exclude node_modules .next/ root@8.209.247.68:/opt/tohoshou/.next/
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx prisma db push --accept-data-loss && npx prisma generate && pm2 restart tohoshou-web --update-env"

# After scripts/lib changes only (no rebuild needed)
sshpass -p 'Wen565656' rsync -avz scripts/ root@8.209.247.68:/opt/tohoshou/scripts/
sshpass -p 'Wen565656' rsync -avz lib/ root@8.209.247.68:/opt/tohoshou/lib/

# Run a script on production (must cd first — dotenv resolves .env from CWD)
sshpass -p 'Wen565656' ssh -o StrictHostKeyChecking=no root@8.209.247.68 \
  "cd /opt/tohoshou && npx tsx scripts/compute-scores.ts 2>&1 | tail -30"
```

### OpenAI Client

`lib/openai.ts` pins to `https://api.openai.com/v1` explicitly — this prevents `OPENAI_BASE_URL` env var (used for legacy DeepSeek routes) from hijacking intent classification. Model: `OPENAI_MODEL` env var, default `gpt-4o-mini`.
