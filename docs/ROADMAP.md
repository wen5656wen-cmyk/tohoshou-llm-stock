# TOHOSHOU AI — Roadmap

**Version:** v8.9.5  
**Updated:** 2026-06-23

---

## Completed (This Session — v8.9.x)

| Version | Feature |
|---------|---------|
| v8.9 | `/admin/verify` 8-module production health center |
| v8.9.1 | Standardized API response + rerank `timeHorizon` crash fix + `risks[]` array safety |
| v8.9.2 | `/admin/verify` bilingual (zh/en) + Sidebar entry |
| v8.9.3 | MobileDrawer — 系统校验 entry (root cause: Sidebar hidden on mobile < 768px) |
| v8.9.4 | Watchlist 4-column compact cards (RSI·MA·52W·量比, Score 74 format, icon buttons) |
| v8.9.5 | Deployment History: DeploymentLog DB table + `record-deployment.ts` script + `GET/POST /api/admin/deployments` + UI in verify page |

---

## P0 — Critical (Must Fix Next)

*None in this repository.*

---

## P1 — High Priority

| # | Issue | Target Version | Notes |
|---|-------|----------------|-------|
| P1-1 | `gptRank=null` for 193 stocks | v8.10 | Next scheduled rerank fixes; monitor via `/admin/verify` |
| P1-2 | DailyRecommendation today=0 after 07:00 JST | v8.10 | Cron reliability; add health alert |
| P1-3 | RealtimeMarket data has no staleness indicator | v8.10 | Add `updatedAt` check in watchlist API; show staleness warning |
| P1-4 | `maTrendDisplay` in watchlist page doesn't handle `null` gracefully | v8.10 | Already handled but needs test with fresh data |

---

## P2 — Medium Priority

| # | Feature | Notes |
|---|---------|-------|
| P2-1 | Screener desktop card redesign (same as watchlist compact style) | Apply RSI·MA·52W row; remove old chip row |
| P2-2 | Backtest win-rate chart (time-series) | Currently only table view |
| P2-3 | Portfolio P&L calculation (using DailyPrice history) | Currently only current price |
| P2-4 | `/admin/verify` auto-refresh every 5 min in background | WebSocket or polling interval |
| P2-5 | `record-deployment.ts` — warn when `--files` value contains commas (ambiguous parsing) | UX improvement |

---

## P3 — Low Priority / Future

| # | Feature | Notes |
|---|---------|-------|
| P3-1 | Mobile PWA optimization | Screener/watchlist mobile layout |
| P3-2 | Dividend calendar page | From Dividend table |
| P3-3 | Sector rotation heatmap | Aggregate by sector + return period |
| P3-4 | Deployment History CI integration | GitHub Actions → auto POST to /api/admin/deployments |

---

## Architecture Milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| 5-dimension scoring (v7.x) | ✅ Done | tech/fund/flow/news/global |
| Adaptive stock-style scoring (v7.5) | ✅ Done | 6 styles |
| GPT rerank overlay (v8.x) | ✅ Done | Top 500 daily |
| Backtest pipeline (v8.x) | ✅ Done | 7d/30d/90d return tracking |
| Production ops center (v8.9) | ✅ Done | /admin/verify + deployment history |
| Deployment logging system (v8.9.5) | ✅ Done | DB + script + API + UI |
| Realtime market integration | 🟡 Partial | RealtimeMarket table populated on-demand |
| User auth system | ❌ Not planned | Internal tool only |
