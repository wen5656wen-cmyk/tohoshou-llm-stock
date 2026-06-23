# TOHOSHOU AI — Known Issues

**Version:** v8.9.5  
**Updated:** 2026-06-23

---

## Active Issues

### P0 — Blocking (must fix before feature work)

*None in this repository.*

---

### P1 — High Priority

| ID | Description | Root Cause | File | Workaround |
|----|-------------|------------|------|------------|
| P1-1 | 193 stocks have `gptRank=null` | Rerank didn't run today or ran with < 500 stocks | `scripts/rerank-top500.ts` | Run `npm run rerank:top500`; monitor at `/admin/verify` |
| P1-2 | `DailyRecommendation today=0` after 07:00 JST | Cron reliability or GPT rate limit | `scripts/cron-scheduler.ts` | Manual: `npm run rerank:top500` |
| P1-3 | `RealtimeMarket` staleness invisible | No `updatedAt` check in watchlist API | `app/api/watchlist/route.ts` | Users see stale volumeRatio/turnoverRate with no warning |

---

### P2 — Medium Priority

| ID | Description | Root Cause | File |
|----|-------------|------------|------|
| P2-1 | `week52Pct` uses Stock table `high52w/low52w` which may be stale (J-Quants sync lag) | J-Quants `high52w` updated weekly | `app/api/watchlist/route.ts` |
| P2-2 | `getList()` in `record-deployment.ts` splits on comma — values with commas silently break | No escape mechanism for comma in CLI args | `scripts/record-deployment.ts` |
| P2-3 | `DeploymentRow` badge loop uses unsafe `keyof` cast — adding non-string-valued key breaks silently | No TypeScript narrowing to string keys | `app/admin/verify/page.tsx:641` |

---

### P3 — Low Priority

| ID | Description |
|----|-------------|
| P3-1 | `/admin/verify` "Copy Acceptance Report" uses `BUILD: (local: npm run build)` placeholder — doesn't read actual build status |
| P3-2 | Backtest result count showing 0 — `update-backtest.ts` needs to run after 7d/30d from first DailyRecommendation |

---

## Recently Fixed (This Session)

| Fixed | Version | Description |
|-------|---------|-------------|
| ✅ | v8.9.1 | `rerank-top500.ts` crash: `timeHorizon: undefined` rejected by Prisma (required String field) |
| ✅ | v8.9.1 | `rerank-top500.ts` crash: `risks[]` array contained nested arrays from malformed GPT response |
| ✅ | v8.9.3 | `MobileDrawer.tsx` missing 系统校验 entry — Sidebar.tsx is `hidden md:flex`, mobile uses Drawer |
| ✅ | v8.9.5 | `week52Pct` unclamped — stale 52W high could yield >100%; fixed with `Math.min(100, Math.max(0, ...))` |
| ✅ | v8.9.5 | `deployments/route.ts` no try/catch on DB calls — added error handling for both GET and POST |
| ✅ | v8.9.5 | `deployments/route.ts` `Invalid Date` from malformed `deployedAt` string swallowed silently — added `isNaN` guard |

---

## Data / Environment

| Issue | Notes |
|-------|-------|
| `latestPriceDate = 2026-06-22` | Weekend/holiday gap — normal |
| `healthAllowRec = true` | System is accepting recommendations |
| `BacktestResult = 0 errors` | No backtest data yet (need 7d from DailyRecommendation start) |
| `GlobalMarket` | Populated daily by cron at 05:30 JST |

---

## How to Report a New Issue

1. Add to this file under the appropriate P-level
2. Include: Description, Root Cause, File:Line, Workaround
3. When fixed: move to "Recently Fixed" table with version