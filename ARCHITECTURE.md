# TOHOSHOU AI — Architecture Freeze Document

**Schema Version:** schema-v2.3
**Frozen:** 2026-06-26
**Status:** APPROVED — No structural redesign before Step 8 implementation complete

> **Rule:** Any change that contradicts this document requires explicit written approval
> before a single line of code is written. Silent structural evolution is forbidden.

---

## Part 1: Table Ownership and Source of Truth

### 1.1 Source of Truth Registry

| Table | Source of Truth For | Owner Script | Rebuild From |
|-------|---------------------|--------------|--------------|
| `Stock` | Current stock metadata + latest price | `sync-all-prices.ts`, `sync-stock-meta.ts` | J-Quants API |
| `DailyPrice` | All historical OHLCV data | `sync-all-prices.ts` | J-Quants API |
| `StockScore` | Current-day computed scores (overwritten daily) | `compute-scores.ts` | DailyPrice + Financial + GlobalMarket + News |
| `DailyRecommendation` | T0 immutable recommendation snapshots | `rerank-top500.ts` (T0), `update-backtest.ts` (T+1 entry only) | Cannot rebuild — is the primary record |
| `BacktestPositionResult` | Per-symbol per-horizon backtest results | `update-backtest.ts` | DailyPrice + DailyRecommendation |
| `BacktestResult` | Cohort-aggregated backtest statistics | `update-backtest.ts` | BacktestPositionResult (fully rebuildable) |
| `PortfolioSnapshot` | Daily AI portfolio state | `create-portfolio-snapshot.ts` | DailyRecommendation + DailyPrice (partially rebuildable) |
| `GlobalMarket` | Daily macro market data | `fetch-global-market.ts` | Yahoo Finance API |
| `News` | Stock news articles | `sync-news.ts` | Kabutan + TDnet scrapers |
| `AIAnalysis` | Per-stock GPT analysis | `rerank-top500.ts` | Not rebuildable (GPT output, non-deterministic) |
| `VersionSnapshot` | Model version registry | Manual + `compute-scores.ts` auto-upsert | Manual record |
| `BacktestPositionResult` | Per-symbol backtest ground truth | `update-backtest.ts` | DailyPrice + DailyRecommendation |
| `ExperimentRegistry` | Model experiment history | Human-maintained | Not applicable |

### 1.2 Table Immutability Classification

#### IMMUTABLE (rows never updated after finalization)

```
DailyPrice              — immutable after sync; split-adjusted AdjC overwrites only
DailyRecommendation     — immutable after T+1 entryPrice fill; see Write Paths
BacktestPositionResult  — immutable after compute; upsert on recompute only
AIAnalysis              — immutable after GPT call
```

**DailyRecommendation finalization boundary:**
```
T0  → rerank-top500.ts writes all fields except entry*
T+1 → update-backtest.ts fills entryDate, entryPrice, entryPriceType
      (only when entryPrice IS NULL — never overwrites filled values)
T+N → permanently immutable, no further writes
```

#### MUTABLE (overwritten on each run)

```
Stock           — daily price/change/high52w/low52w overwritten
StockScore      — daily full overwrite (it is a cache, not a history table)
GlobalMarket    — one row per date, written once, not updated
```

#### DERIVED (fully rebuildable from source tables)

```
BacktestResult          — rebuild: aggregate BacktestPositionResult
PortfolioSnapshot       — partially rebuildable (entryPrice from DailyRecommendation.buyPrice)
AISignalDailyStat       — rebuild: aggregate DailyRecommendation + BacktestPositionResult
```

#### APPEND-ONLY REGISTRIES (human-maintained)

```
VersionSnapshot         — append only, never delete or update past rows
ExperimentRegistry      — append only, status field is the only mutable column
```

---

## Part 2: Allowed Write Paths

### 2.1 DailyRecommendation Write Path (strict)

```
ALLOWED writes:
  1. rerank-top500.ts       → T0 bulk insert (date + symbol + all non-entry fields)
  2. update-backtest.ts     → T+1 fill: entryDate, entryPrice, entryPriceType
                               Guard: WHERE entryPrice IS NULL (never overwrite)

FORBIDDEN writes:
  ✗ update-backtest.ts writing return7d/30d/90d/exitDate*/price* (DEPRECATED fields)
  ✗ Any API route modifying DailyRecommendation
  ✗ Any script writing to DailyRecommendation after T+1 entry is filled
  ✗ data-health-guard.ts modifying DailyRecommendation
  ✗ compute-scores.ts modifying DailyRecommendation
```

### 2.2 BacktestPositionResult Write Path

```
ALLOWED writes:
  1. update-backtest.ts     → upsert by (recDate, symbol, horizon)
                               Recompute is safe; upsert is idempotent

FORBIDDEN writes:
  ✗ rerank-top500.ts modifying BacktestPositionResult
  ✗ Any API route modifying BacktestPositionResult
  ✗ Manual SQL updates in production without explicit architecture approval
```

### 2.3 StockScore Write Path

```
ALLOWED writes:
  1. compute-scores.ts      → full daily overwrite, all fields

FORBIDDEN writes:
  ✗ Any API route modifying StockScore
  ✗ rerank-top500.ts modifying StockScore fields other than through compute-scores
```

### 2.4 VersionSnapshot Write Path

```
ALLOWED writes:
  1. compute-scores.ts      → auto-upsert on start if current versionSnapshotId not in DB
  2. Manual SQL             → to create baseline or retroactive records only

FORBIDDEN writes:
  ✗ Updating any field of an existing VersionSnapshot row
  ✗ Deleting any VersionSnapshot row
  ✗ compute-scores.ts changing endDate of previous version (only manual operation)
```

---

## Part 3: Migration Rules

### 3.1 Additive-Only Constraint

All schema migrations must be strictly additive. No exceptions without architecture review.

```
ALLOWED migrations:
  ✓ ADD COLUMN (nullable only — never NOT NULL without default)
  ✓ CREATE TABLE (new tables only)
  ✓ CREATE INDEX
  ✓ Extend enum values (String fields — no enum types used)

FORBIDDEN migrations:
  ✗ DROP COLUMN (use DEPRECATED label in Data Dictionary instead)
  ✗ DROP TABLE
  ✗ ALTER COLUMN TYPE
  ✗ RENAME COLUMN
  ✗ RENAME TABLE
  ✗ ADD NOT NULL constraint to existing nullable column
  ✗ Changing @@unique or @@id constraints
```

### 3.2 Migration Ordering

When multiple migrations are needed in one release:
```
Order:
  1. New tables with no dependencies
  2. New tables that reference existing tables (soft FK preferred)
  3. New columns on existing tables (nullable)
  4. New indexes

Never in same transaction:
  - Schema changes + data migrations
  - Two tables with circular FK dependencies
```

### 3.3 Production Migration Procedure

```bash
# Schema change workflow
npx prisma db push --accept-data-loss   # apply to production DB
npx prisma generate                      # regenerate client
rsync lib/ scripts/ to production
pm2 restart tohoshou-web --update-env
pm2 restart tohoshou-cron --update-env  # MUST restart cron too
```

---

## Part 4: Version Management

### 4.1 VersionSnapshot Design

```
Table: VersionSnapshot

id               String @id     -- Format: "YYYYMMDD-{modelVersion}"
                                 -- Example: "20260626-v7.7", "20260715-v7.8"
modelVersion     String          -- Human-readable: "v7.7", "v8.0"
scoreVersion     String          -- Scoring formula version: "adaptive-v3"
schemaVersion    String          -- Feature schema version: "schema-v2.3" ← NEW
ruleEngineVer    String          -- From VERSION_SNAPSHOT.ruleEngineVersion
scoringSchemaVer String          -- From VERSION_SNAPSHOT.scoringSchemaVersion
llmModelVer      String          -- e.g., "gpt-4o-mini-2024-07-18"
startDate        DateTime @db.Date
endDate          DateTime? @db.Date   -- null = current active version
isBaseline       Boolean @default(false)
changeLog        String?
experimentId     String?              -- FK to ExperimentRegistry.id
createdAt        DateTime @default(now())
```

### 4.2 schemaVersion Definition

`schemaVersion` captures the feature schema — specifically which `feat_*` fields exist and their semantic meaning at the time of this version.

```
schemaVersion = "schema-v2.3"

Increment schemaVersion when:
  ✓ New feat_* field added to DailyRecommendation
  ✓ Semantic meaning of existing feat_* field changes
  ✓ Core score field is added/removed from DailyRecommendation

Do NOT increment schemaVersion when:
  ✗ Only modelVersion or scoreVersion changes (same features, different weights)
  ✗ Bug fix in existing score calculation (fix via new modelVersion + same schemaVersion)
  ✗ New non-feat_* field added (e.g., a new metadata field)

Format: "schema-v{MAJOR}.{MINOR}"
  MAJOR: Breaking change (feat_* removed or semantically changed — requires migration review)
  MINOR: Additive change (new feat_* added)
  Example progression: schema-v2.3 → schema-v2.4 → schema-v3.0
```

### 4.3 versionSnapshotId Generation Rule

```typescript
// In compute-scores.ts, called at startup:
const versionSnapshotId =
  `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${VERSION_SNAPSHOT.ruleEngineVersion}`;
// Example: "20260626-v7.7"

// Upsert (safe to run multiple times per day):
await prisma.versionSnapshot.upsert({
  where: { id: versionSnapshotId },
  create: {
    id: versionSnapshotId,
    modelVersion: VERSION_SNAPSHOT.ruleEngineVersion,
    scoreVersion: VERSION_SNAPSHOT.scoringSchemaVersion,
    schemaVersion: CURRENT_SCHEMA_VERSION,  // constant in safety-rules.ts
    startDate: today,
    ...
  },
  update: {},  // never update existing rows
});
```

### 4.4 Version Propagation Chain

```
lib/safety-rules.ts (VERSION_SNAPSHOT, CURRENT_SCHEMA_VERSION)
  ↓ compute-scores.ts writes
StockScore.versionSnapshotId, .modelVersion, .scoreVersion, .schemaVersion
  ↓ rerank-top500.ts reads from StockScore, writes to
DailyRecommendation.versionSnapshotId, .modelVersion, .scoreVersion, .schemaVersion
  ↓ update-backtest.ts copies (denormalized) to
BacktestPositionResult.versionSnapshotId, .modelVersion, .scoreVersion, .schemaVersion
  ↓ generate-learning-report.ts reads, groups by versionSnapshotId
LearningReport.versionComparison
```

Single source of truth: `lib/safety-rules.ts`. Changing model version = change one file.

---

## Part 5: Data Compatibility Rules

### 5.1 Learning Report Comparability Check

Before generating any version comparison in LearningReport, validate:

```typescript
function areVersionsComparable(
  versionA: VersionSnapshot,
  versionB: VersionSnapshot
): ComparabilityResult {

  // Rule 1: Schema must match
  if (versionA.schemaVersion !== versionB.schemaVersion) {
    return {
      comparable: false,
      status: "NOT_COMPARABLE",
      reason: `Schema mismatch: ${versionA.schemaVersion} vs ${versionB.schemaVersion}. ` +
              `feat_* fields differ — comparison would produce misleading statistics.`,
      allowedComparisons: [],
    };
  }

  // Rule 2: Minimum sample size
  const MIN_SAMPLES = 30;
  if (versionA.sampleCount < MIN_SAMPLES || versionB.sampleCount < MIN_SAMPLES) {
    return {
      comparable: false,
      status: "INSUFFICIENT_DATA",
      reason: `Requires >= ${MIN_SAMPLES} samples per version for statistical validity.`,
      allowedComparisons: [],
    };
  }

  // Rule 3: Horizon comparability (only compare horizons where both have data)
  const comparableHorizons = HORIZONS.filter(h =>
    versionA.horizonSampleCounts[h] >= MIN_SAMPLES &&
    versionB.horizonSampleCounts[h] >= MIN_SAMPLES
  );

  return {
    comparable: true,
    status: "COMPARABLE",
    comparableHorizons,
    schemaVersion: versionA.schemaVersion,
  };
}
```

### 5.2 Comparability Status Enum

```
COMPARABLE          — same schemaVersion, sufficient samples, comparison is valid
NOT_COMPARABLE      — schemaVersion differs, comparison forbidden
INSUFFICIENT_DATA   — fewer than 30 samples in one or both versions
PARTIAL             — comparable on some horizons only
```

### 5.3 When schemaVersion Changes Mid-Experiment

If an experiment crosses a schemaVersion boundary (e.g., feat_* added mid-experiment):

```
1. Close the current ExperimentRegistry entry (set endDate, status=ABANDONED)
2. Create a new VersionSnapshot with the new schemaVersion
3. Create a new ExperimentRegistry entry for the new version
4. LearningReport marks pre-boundary data as NOT_COMPARABLE with post-boundary data
5. Factor analysis only uses data with matching schemaVersion
```

---

## Part 6: Feature Dictionary (feat_* Append-Only Contract)

### 6.1 Rules

```
ALLOWED:
  ✓ Append new feat_* fields to DailyRecommendation (additive migration)
  ✓ Populate new feat_* from T+next pipeline run onward
  ✓ Mark old feat_* as "DEPRECATED" in this dictionary (field stays in schema)

FORBIDDEN:
  ✗ Rename any feat_* field (breaks historical data alignment)
  ✗ Change the semantic meaning of an existing feat_* field
  ✗ Recycle a DEPRECATED feat_* name for a different meaning
  ✗ Remove a feat_* field from schema
  ✗ Change the calculation formula without incrementing schemaVersion
```

**Why:** Historical DailyRecommendation rows store feat_* values computed under the
old formula. If the formula changes without a schemaVersion bump, Learning Report
would mix incompatible feature vectors in factor analysis.

### 6.2 Current feat_* Registry (schema-v2.3, 30 fields)

| Group | Field | Type | Source | Status |
|-------|-------|------|--------|--------|
| **Momentum** | feat_return5d_pre | Float? | DailyPrice 5d pre-rec return | Active |
| | feat_return20d_pre | Float? | DailyPrice 20d pre-rec return | Active |
| | feat_return60d_pre | Float? | DailyPrice 60d pre-rec return | Active |
| | feat_volatility20d | Float? | DailyPrice σ 20d daily returns | Active |
| **Technical** | feat_rsi14 | Float? | indicators.ts RSI(14) | Active |
| | feat_maTrend | String? | GOLDEN\|BULLISH\|BEARISH\|DEAD | Active |
| | feat_macdSignalLabel | String? | BUY\|SELL\|NEUTRAL | Active |
| | feat_beta | Float? | Stock.beta (60d vs TOPIX) | Active |
| | feat_liquidityBucket | String? | HIGH\|MID\|LOW (avg daily turnover) | Active |
| **Fundamental** | feat_pbr | Float? | Stock.pbr | Active |
| | feat_per | Float? | Stock.per | Active |
| | feat_roe | Float? | Stock.roe | Active |
| | feat_dividendYield | Float? | Stock.dividend | Active |
| **Market Env** | feat_topixReturn5d | Float? | GlobalMarket.topixChange 5d | Active |
| | feat_topixReturn20d | Float? | GlobalMarket aggregated 20d | Active |
| | feat_usdjpy | Float? | GlobalMarket.usdjpy | Active |
| | feat_vix | Float? | GlobalMarket.vix | Active |
| | feat_marketTemperature | String? | COLD\|COOL\|NORMAL\|HOT\|OVERHEATED | Active |
| | feat_marketRank | Int? | StockScore.marketRank | Active |
| **Score Composite** | feat_technicalScore | Int? | StockScore.technicalScore | Active |
| | feat_fundamentalScore | Int? | StockScore.fundamentalScore | Active |
| | feat_moneyFlowScore | Int? | StockScore.moneyFlowScore | Active |
| | feat_newsSentimentScore | Int? | StockScore.newsSentimentScore | Active |
| | feat_globalTrendScore | Int? | StockScore.globalTrendScore | Active |
| | feat_percentileRank | Float? | StockScore.percentileRank | Active |
| | feat_stockStyle | String? | StockScore.stockStyle | Active |
| | feat_highRiskFlag | Boolean? | StockScore.highRiskFlag | Active |
| **Classification** | feat_sector | String? | Stock.sector at T0 | Active |
| | feat_industry | String? | Stock.industry at T0 | Active |
| | feat_marketCap | Float? | Stock.marketCap at T0 | Active |

**Total: 30 fields.** Any addition bumps schemaVersion MINOR (schema-v2.3 → schema-v2.4).

---

## Part 7: Pipeline State Management

### 7.1 pipelineRunId Design

Every cron pipeline execution generates a `pipelineRunId`:

```
Format: "{YYYYMMDD}-{RUN_SLOT}"
Run slots: AM (morning chain), PM (if added), MANUAL (ad-hoc runs)

Examples:
  "20260626-AM"      — standard 07:30 JST cron chain
  "20260626-MANUAL"  — manual run via CLI
  "20260627-AM"      — next day

Generation (in cron-scheduler.ts, at start of runAiChain()):
  const pipelineRunId = `${todayJST()}-${runSlot}`;
```

### 7.2 pipelineRunId Usage

Written to these records during each pipeline run:

```
StockScore.pipelineRunId         — which run computed this score
DailyRecommendation.pipelineRunId — which run generated this recommendation
BacktestPositionResult.pipelineRunId — which run computed this backtest result
```

**Use cases:**
- Debugging: "Which recommendations came from the stuck run on 2026-07-15?"
- Rerun detection: Filter out partial runs from analysis
- Incident investigation: Isolate records from a problematic pipeline run
- Partial rollback: Mark a specific pipelineRunId's BacktestPositionResult as invalid

### 7.3 pipelineRunId is NOT a primary key

`pipelineRunId` is an optional metadata field. Core uniqueness constraints remain:
- `StockScore`: symbol (PK)
- `DailyRecommendation`: unique(date, symbol)
- `BacktestPositionResult`: unique(recDate, symbol, horizon)

If a run fails and restarts (same day), the new pipelineRunId overwrites the previous
one on upsert. This is correct — we want the latest successful run's metadata.

---

## Part 8: Missing Data Policy

### 8.1 NULL Interpretation Standard

NULL in this codebase has exactly one meaning: **"the system never computed or received this value."**

NULL does NOT mean:
- "not applicable"
- "unknown"
- "zero"
- "not available"

### 8.2 Field-Level NULL Semantics

| Scenario | Correct representation | Wrong representation |
|----------|------------------------|----------------------|
| feat_pbr: company has no published PBR | NULL | 0.0 |
| feat_dividendYield: stock pays no dividend | 0.0 | NULL |
| BacktestPositionResult.exitPrice: exit date not yet reached | NULL | 0.0 |
| BacktestPositionResult.returnPct: exit date not yet reached | NULL | 0.0 |
| feat_marketTemperature: GlobalMarket data missing | NULL | "UNKNOWN" |
| BacktestPositionResult.errorReason: no error | NULL | "" |

### 8.3 String Fields: Sentinel Values

String fields that can have "not applicable" state use these exact sentinels:

```
"N/A"          — data not applicable to this stock/context
"UNKNOWN"      — data exists but could not be parsed/classified
"PENDING"      — data expected but not yet available
```

These sentinels are ONLY valid in explicitly documented fields. All others use NULL.

### 8.4 Factor Analysis NULL Handling

When computing factor correlations in Learning Report / Factor Analysis:
- Exclude NULL feat_* values (do not impute with mean/median)
- Report sample size after NULL exclusion
- Minimum non-NULL samples per factor: 100 before reporting correlation

---

## Part 9: Time Zone Policy

### 9.1 Canonical Rule

```
Business Date   = JST (Asia/Tokyo, UTC+9)
All DB storage  = UTC (PostgreSQL timestamps without timezone)
Trading Calendar = JPX (Japan Exchange Group) business days
Server display  = JST for logs, UTC for API responses
```

### 9.2 Date Disambiguation

When "today" is referenced in code:

```typescript
// Business date (JST) — use for:
//   DailyRecommendation.date, PortfolioSnapshot.date, cron trigger dates
const todayJST = (): string => {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
};
// Returns "2026-06-26" at 00:30 JST even though UTC is still 2026-06-25

// UTC timestamp — use for:
//   computedAt, createdAt, lastSyncAt (all datetime fields)
const nowUTC = (): Date => new Date();
```

### 9.3 J-Quants Date Convention

J-Quants daily price data uses JST business dates:
- `DailyPrice.date = 2026-06-25` means the JST trading session of June 25
- Stored in PostgreSQL as `2026-06-25 00:00:00+00` (midnight UTC, treated as date-only)
- Never query `DailyPrice.date` with UTC time comparisons — always use date-only comparison

### 9.4 Look-Ahead Time Reference

For look-ahead bias checks (V10, V11):
- "Today's recommendation" = DailyRecommendation.date in JST
- "Data cutoff" = StockScore.latestDate in JST
- Rule: `StockScore.latestDate (JST) < DailyRecommendation.date (JST)`
  = strictly yesterday's price used for today's recommendation ✓

### 9.5 Server Configuration

```
PostgreSQL server timezone: UTC+8 (CST, verified 2026-06-26)
Node.js cron process TZ:    Asia/Tokyo (set in execSync env)
PM2 ecosystem:              TZ=Asia/Tokyo in env block
```

⚠️ PostgreSQL is UTC+8 (not UTC+9). When querying with NOW():
- Use explicit UTC timestamps in WHERE clauses (not NOW() - INTERVAL)
- Or use date-only comparisons which are timezone-agnostic
- Reference: 2026-06-26 verified — `NOW()` returns `2026-06-26 11:18+08`

---

## Part 10: Forbidden Operations

The following operations are absolutely prohibited without architecture review approval:

```
DATA INTEGRITY:
  ✗ UPDATE DailyRecommendation SET <any_field> WHERE entryPrice IS NOT NULL
  ✗ DELETE FROM DailyRecommendation
  ✗ UPDATE BacktestPositionResult SET <any_field>  [use upsert only]
  ✗ Compute returnPct from DailyRecommendation.return7d/30d/90d (DEPRECATED)
  ✗ Write return data to DailyRecommendation (use BacktestPositionResult)

SCHEMA:
  ✗ DROP any column (mark DEPRECATED in this document instead)
  ✗ ALTER any column type
  ✗ RENAME any table or column
  ✗ ADD NOT NULL to existing nullable column without default

VERSION MANAGEMENT:
  ✗ Compare versionSnapshotId by comparing modelVersion strings directly
  ✗ Update an existing VersionSnapshot row
  ✗ Delete any VersionSnapshot row
  ✗ Run LearningReport comparison across different schemaVersions

CODE:
  ✗ Hardcode version strings ("v7.7") outside lib/safety-rules.ts
  ✗ Use WHERE clause with NOW() - INTERVAL on lastSyncAt (timezone issue — use fixed timestamp)
  ✗ Read GlobalMarket.topixClose (column is named topix and topixChange)
  ✗ Write feat_* to StockScore (feat_* belongs in DailyRecommendation only)
```

---

## Part 11: fill-entry-price Implementation Spec

### 11.1 Purpose

DailyRecommendation.entryPrice = first available open price after recommendation date.
This is the "execution price" — what an investor would pay buying at next-day open.

### 11.2 Trigger

Runs as **Step 1 of update-backtest.ts**, before any BacktestPositionResult computation.

### 11.3 Logic

```typescript
// Pseudocode
const unfilled = await prisma.dailyRecommendation.findMany({
  where: { entryPrice: null },
  select: { id: true, date: true, symbol: true },
});

for (const rec of unfilled) {
  // Find first trading day after rec.date
  const nextPrice = await prisma.dailyPrice.findFirst({
    where: {
      symbol: rec.symbol,
      date: { gt: rec.date },  // strictly after recommendation date
    },
    orderBy: { date: 'asc' },
    select: { date: true, open: true },
  });

  if (!nextPrice) continue;  // market hasn't opened yet — skip, try tomorrow

  // Write entry (only if still null — guard against race conditions)
  await prisma.dailyRecommendation.updateMany({
    where: { id: rec.id, entryPrice: null },  // double guard
    data: {
      entryDate: nextPrice.date,
      entryPrice: nextPrice.open,
      entryPriceType: 'OPEN',
    },
  });
}
```

### 11.4 Constraints

```
entryPriceType = "OPEN" always (first available open after rec date)
Guard:           WHERE entryPrice IS NULL on both findMany and updateMany
Timing:          Runs after sync-all-prices completes, before BacktestPositionResult upsert
Idempotent:      Yes — double NULL guard prevents overwriting filled entries
```

---

## Part 12: VersionSnapshot Initialization

### 12.1 Baseline Record (for pre-v2.3 data)

Run once after schema migration to tag existing DailyRecommendation rows:

```sql
-- Insert legacy baseline snapshot
INSERT INTO "VersionSnapshot" (
  id, "modelVersion", "scoreVersion", "schemaVersion",
  "ruleEngineVer", "scoringSchemaVer", "llmModelVer",
  "startDate", "isBaseline", "changeLog", "createdAt"
) VALUES (
  '00000000-legacy',
  'pre-v2.3',
  'unknown',
  'schema-pre-v2.3',
  'unknown',
  'unknown',
  'unknown',
  '2026-06-20',  -- first DailyRecommendation date in DB
  true,
  'Retroactive baseline for pre-v2.3 records. feat_* fields are NULL for these records.',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Tag all existing DailyRecommendation rows without versionSnapshotId
UPDATE "DailyRecommendation"
SET "versionSnapshotId" = '00000000-legacy'
WHERE "versionSnapshotId" IS NULL;
```

### 12.2 Current Production Snapshot

Run once to register the current production version:

```sql
INSERT INTO "VersionSnapshot" (
  id, "modelVersion", "scoreVersion", "schemaVersion",
  "ruleEngineVer", "scoringSchemaVer", "llmModelVer",
  "startDate", "isBaseline", "changeLog", "createdAt"
) VALUES (
  '20260626-v7.7',  -- update date to actual first run date
  'v7.7',
  'adaptive-v3',
  'schema-v2.3',
  'v7.7',
  'adaptive-v3',
  'gpt-4o-mini',
  '2026-06-26',
  false,
  'First version tracked under Architecture v2.3. Baseline for all future version comparisons.',
  NOW()
) ON CONFLICT (id) DO NOTHING;
```

---

## Part 13: P2 Future Extensions

The following are pre-approved as future additions that do NOT require architecture review,
provided they follow the additive-only migration rule:

```
PortfolioBacktestResult    — portfolio-level return aggregation (vs stock-level)
FactorExposure             — (symbol, date, factorName, value) narrow table for factor regression
ExecutionCostModel         — slippage + commission estimation for realistic backtest
WalkForwardRegistry        — structured out-of-sample validation windows
```

These do not redesign existing tables. They are new tables that read from existing ones.

---

## Approval Record

| Version | Date | Approver | Status |
|---------|------|----------|--------|
| schema-v2.3 | 2026-06-26 | User (Architecture Review) | APPROVED |

**Next architecture review:** Before any schema-v3.0 migration (MAJOR version bump).
Minor additions (schema-v2.x) may proceed with documentation update only.
