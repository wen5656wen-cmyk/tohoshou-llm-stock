# TECH DEBT — TOHOSHOU AI

> Created: 2026-06-26 (v13.7.1 Stabilization Audit)
> Updated: 2026-06-26
> Format: Each entry has Priority / Discovered / Description / Impact / Fix Suggestion

---

## Fixed in v13.7.1

| Item | Fixed |
|------|-------|
| **P0** lib/ not in deploy sequence → isHardBlockedStock TypeError in cron | CLAUDE.md updated |
| **P1** fillRate > 100% in learning report (filled/fillable instead of filled/total) | generate-learning-report.ts fixed |
| **P2** update-ai-signal-stats + generate-learning-report missing from PIPELINE_STAGES | mission-control/route.ts + generate-learning-report.ts fixed |

---

## Open Items

### P2-001 — Research API Memory Spike at Scale
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** `GET /api/admin/research` uses `$queryRawUnsafe` to load ALL joined rows (feat_* × outcomes) into JS memory. Currently 0 rows (no feat_*). At 30 days: ~5,000 rows × 30 features = ~15MB per request. At 90 days: ~27,000 rows × 30 features = ~80MB per request. This runs on `tohoshou-web` (max 768MB). If multiple users call this simultaneously while cron is also running, OOM risk increases.
**Impact:** Potential OOM restart of tohoshou-web during research dashboard load after 90+ days.
**Fix Suggestion:** Add a cursor-based batch loader or LIMIT 10000 rows; compute Pearson in streaming chunks. Alternatively, pre-compute correlation matrix daily via cron and cache to a JSON report file.
**Auto-resolves:** No — grows with time.

### P2-002 — computeMA Null-Safety in feat_* Snapshot
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** In `rerank-top500.ts`, `priceHistMap` is built via `arr.push(r.adjClose ?? r.close)`. If `adjClose` and `close` are both null for a DailyPrice row, `null` is pushed into the array. `computeMA(prices, n)` and `computeVolatility20d(prices)` receive arrays that may contain null values. TypeScript type says `number[]` but runtime may have `null` elements.
**Impact:** `feat_ma20`, `feat_ma60`, `feat_volatility20d` could be NaN or cause arithmetic errors for stocks with missing price data. Downstream backtest analysis would receive corrupted numeric features.
**Fix Suggestion:** In the priceHistMap build loop, filter nulls: `const price = r.adjClose ?? r.close; if (price != null) arr.push(price);`
**Auto-resolves:** No — affects all future feat_* writes for stocks with missing DailyPrice data.

### P2-003 — pipeline-runs.jsonl Never Created (Mission Control NEVER_RUN)
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** `pipeline-runs.jsonl` is written by `cron-scheduler.ts` after each stage's `run()` call. It was never created because all 07:30 JST pipeline runs were either killed by PM2 restarts (Steps 1-6 deploys) or the cron process itself was restarted. Mission Control shows NEVER_RUN for all 10 stages. Health Score = 45/100 (RED, pipelineStatus=0).
**Impact:** Mission Control is unreliable until the first full pipeline completion. Expected to auto-resolve after 2026-06-27 07:30 JST cron run (first day with correct lib/ deployed).
**Fix Suggestion:** Write a START entry to JSONL at the beginning of `run()` before `execSync`, then UPDATE the entry on completion. This makes the log resilient to mid-run kills. Current "append-only at finish" design loses data when the process is killed.
**Auto-resolves:** Partially — first successful run tomorrow will create the file and populate stages.

### P2-004 — generate-learning-report Missing from Cron's run() Sequence in CLAUDE.md Documentation
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** CLAUDE.md's cron schedule description says "07:30 AI評分+rerank+健全性" but doesn't list the full chain: compute-scores → rerank-top500 → create-portfolio-snapshot → update-ai-signal-stats → update-backtest → generate-learning-report → data-health-guard.
**Impact:** Future documentation confusion, especially around which stages are expected to appear in pipeline-runs.jsonl.
**Fix Suggestion:** Update the CLAUDE.md cron schedule note to list all 10 stages explicitly.
**Auto-resolves:** No.

### P2-005 — regressionDetection: INSUFFICIENT_DATA (single VersionSnapshot)
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** Regression detection requires ≥2 VersionSnapshots with the same schemaVersion. Currently only `20260626-v7.7` (schema-v2.3) exists. The second snapshot will be created when the model version changes or after 30+ days of data accumulation.
**Impact:** Learning report shows `regressionStatus: INSUFFICIENT_DATA`. No regression alerts possible. Cannot detect if model performance degrades.
**Fix Suggestion:** No immediate action. When the model is updated (new version registered in ExperimentRegistry and VersionSnapshot created), regression detection will activate automatically. Expected: v7.8+ or when Walk-Forward analysis begins (after 30 trading days).
**Auto-resolves:** Yes — after second VersionSnapshot of same schemaVersion is created.

### P2-006 — BacktestPositionResult fillable 1d horizon edge case
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** For 1d horizon, HORIZON_CAL_DAYS=4 means positions are "fillable" after 4 calendar days. But DailyPrice syncs next-day close, so positions can be filled before reaching the 4-day threshold. The `fillable` count (572) is less than `filled` count (1069) because 497 positions were filled "early" (DailyPrice was available before calendar threshold). Learning report now shows `fillRate = filled/total` (correct), but `fillable` metric itself may confuse researchers.
**Impact:** Minor display confusion in learning report. Functional impact: none (actual fill status in DB is correct).
**Fix Suggestion:** Rename `fillable` to `pastCalendarThreshold` to clarify it's a conservative estimate, not the actual expected-filled count.
**Auto-resolves:** No — requires documentation/naming update.

### P2-007 — VersionCompare: schemaVersion cross-check prevents legacy-baseline comparison
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** `/api/admin/versions/compare?a=20260626-v7.7&b=legacy-baseline` returns `comparisonAllowed: false` because schema-v2.3 ≠ schema-v1.0. This is correct behavior (incompatible feature spaces), but the Version Center UI doesn't pre-warn users when selecting versions from different schemaVersions. Users may attempt the comparison and see only the "not comparable" message.
**Impact:** UX friction. No functional issue.
**Fix Suggestion:** In the Compare tab UI (`app/admin/versions/page.tsx`), add a warning badge next to the dropdown when selected versions have different schemaVersions.
**Auto-resolves:** No.

### P2-008 — Research Dashboard empty state quality data misleading
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** The Quality tab shows ALL 30 feat_* fields with coveragePct=0% and unexpectedNulls listing all 30 fields. This is expected during the pre-data period (2774 DR rows predate feat_* deployment). However the `unexpectedNulls` label sounds like a production alert when it's actually a known limitation.
**Impact:** Research Dashboard Quality tab is alarming for 2774 existing rows. Expected to auto-resolve starting 2026-06-27 for new rows, but historical rows will permanently show 0%.
**Fix Suggestion:** Add a note in Quality tab: "Historical DR rows (before 2026-06-27) do not have feat_* data. Only rows created by rerank-top500.ts v13.4.0+ contain feat_* snapshots." Also consider renaming `unexpectedNulls` to `nullFields` and adding a `knownNullBefore` date.
**Auto-resolves:** Partially — new rows (from 2026-06-27) will show 100% coverage, but the 2774 legacy rows will remain at 0%.

### P2-009 — Cron restarted 44 times (↺ 44 in PM2 status)
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** `tohoshou-cron` shows ↺ 44 restarts in PM2. Most are from manual `pm2 restart` during Steps 1-6 development deploys. With `autorestart: true`, any unexpected cron exit also triggers a restart. The 44 restarts killed in-progress rerank-top500 runs (2.5h job), preventing pipeline-runs.jsonl from being written.
**Impact:** pipeline-runs.jsonl never created today (2026-06-26). Future deploys should NOT restart tohoshou-cron during 07:30–14:00 JST.
**Fix Suggestion:** CLAUDE.md now documents "NEVER restart tohoshou-cron during 07:30–14:00 JST". Add a deploy-time check: `pm2 describe tohoshou-cron | grep uptime` and abort cron restart if uptime < 6h and current JST is 07:30–14:00.
**Auto-resolves:** No — requires operational discipline.

### P2-010 — Research API: `void outcomes` TypeScript suppression
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** In `app/api/admin/research/route.ts`, there is a `void outcomes;` comment to suppress an "unused variable" TypeScript warning. This indicates a type-unsafe workaround that should be cleaned up.
**Impact:** Minor code smell. No functional impact.
**Fix Suggestion:** Refactor the code to eliminate the unused variable, or use `_outcomes` naming convention.
**Auto-resolves:** No.

### P2-011 — `tohoshou-ai-daily-pipeline` PM2 process: stopped state
**Priority:** P2
**Discovered:** 2026-06-26 (v13.7.1 audit)
**Description:** PM2 shows `tohoshou-ai-daily-pipeline` process (id=2) in `stopped` state with `autorestart: false`. This is an alternative pipeline runner (daily-ai-pipeline.ts) with `cron_restart: "0 21 * * *"`. It conflicts architecturally with `tohoshou-cron` which also runs the 07:30 JST pipeline.
**Impact:** If accidentally started, both pipelines would run simultaneously (double compute-scores, double rerank-top500, race condition on DailyRecommendation upserts). Currently harmless because it's stopped.
**Fix Suggestion:** Remove `tohoshou-ai-daily-pipeline` from ecosystem.config.js entirely. It's superseded by `tohoshou-cron`. Verify no one depends on it before removal.
**Auto-resolves:** No — cleanup required.

---

## Closed / Won't Fix

| Item | Status |
|------|--------|
| DailyRecommendation.return7d/30d/90d deprecated fields | KNOWN — additive-only schema rule, kept for backwards compat |
| StockScore read in research API (mutable table) | DESIGN — research reads current feat_* from DR (immutable), not StockScore |
| feat_* 0% on historical DR rows | EXPECTED — pre-dates feat_* feature, documented in learning report |

---

## Monitoring Thresholds (for 90-day continuous operation)

| Metric | Warning | Critical | Current |
|--------|---------|----------|---------|
| Research API memory | >40MB/request | >100MB/request | ~0MB (no data) |
| Cron restart count / month | >5 | >10 | — |
| pipeline-runs.jsonl size | >5MB | >20MB | 0 (pending) |
| DailyPrice table size | >10M rows | >20M rows | 7.9M |
| BP fill lag (1d horizon) | >95% unfilled after 1 week | — | 34% unfilled |
| rerank-top500 duration | >3.5h | >4.5h (near timeout) | ~2.5h |

---

*This file is maintained by the stabilization phase. Add new debt items as discovered.*
