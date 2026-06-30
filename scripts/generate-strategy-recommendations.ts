#!/usr/bin/env npx tsx
/**
 * scripts/generate-strategy-recommendations.ts  — Strategy Recommendation Engine (Phase 3)
 *
 * Reads StockScore (pre-computed by compute-scores.ts) and generates:
 *   - Top 100 candidates per strategy type (DAY_TRADE, SWING_TRADE, LONG_TRADE)
 *   - Marks top 10 of each with isTop10 = true
 *   - Upserts to StrategyRecommendation table
 *   - Legacy sync: updates DailyRecommendation.strategyType for top 10 symbols per strategy
 *
 * Usage:
 *   npx tsx scripts/generate-strategy-recommendations.ts
 *   npx tsx scripts/generate-strategy-recommendations.ts --dry-run
 *   npx tsx scripts/generate-strategy-recommendations.ts --date=2026-06-30
 *   npx tsx scripts/generate-strategy-recommendations.ts --dry-run --date=2026-06-30
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Prisma ────────────────────────────────────────────────────────────────────
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ── Constants ─────────────────────────────────────────────────────────────────
const TOP_N    = 100;
const TOP10_N  = 10;

// Strategy types we generate for
type StrategyType = "DAY_TRADE" | "SWING_TRADE" | "LONG_TRADE";

// Legacy DailyRecommendation.strategyType mapping
const LEGACY_MAP: Record<StrategyType, string> = {
  DAY_TRADE:   "DAY",
  SWING_TRADE: "SWING",
  LONG_TRADE:  "POSITION",
};

// ── CLI args ──────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const dateArg = process.argv.find(a => a.startsWith("--date="))?.split("=")[1];

// ── Logging ───────────────────────────────────────────────────────────────────
const startedAt = new Date();
let stepIdx = 0;

function step(msg: string) {
  stepIdx++;
  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(`\n[Step ${stepIdx}] ${msg}  (+${elapsed}s)`);
}

function row(label: string, value: string | number) {
  console.log(`  ${label.padEnd(32)} ${value}`);
}

// ── JST date helper ───────────────────────────────────────────────────────────
function jstDate(d?: Date): Date {
  const src = d ?? new Date();
  const jst = new Date(src.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

// ── Score computation helpers ─────────────────────────────────────────────────

/** Normalize a raw score to 0-100 given its theoretical maximum. */
function norm(raw: number | null | undefined, max: number): number {
  if (raw == null) return 0;
  return Math.min(100, Math.max(0, (raw / max) * 100));
}

interface StockScoreRow {
  symbol:             string;
  adaptiveScore:      number | null;
  technicalScore:     number | null;
  fundamentalScore:   number | null;
  moneyFlowScore:     number | null;
  newsSentimentScore: number | null;
  recommendationV2:   string | null;
  computedAt:         Date;
}

interface ScoredRow {
  symbol:          string;
  finalScore:      number;
  aiScore:         number;   // adaptiveScore (raw, 0-100)
  technicalNorm:   number;
  fundamentalNorm: number;
  moneyFlowNorm:   number;
  newsSentimentNorm: number;
  computedAt:      Date;
}

function computeDayScore(s: StockScoreRow): number {
  const tech   = norm(s.technicalScore,     30);
  const mf     = norm(s.moneyFlowScore,     20);
  const news   = norm(s.newsSentimentScore, 15);
  const fund   = norm(s.fundamentalScore,   25);
  return tech * 0.40 + mf * 0.30 + news * 0.20 + fund * 0.10;
}

function computeSwingScore(s: StockScoreRow): number {
  const adaptive = s.adaptiveScore ?? 0;
  const tech     = norm(s.technicalScore,     30);
  const mf       = norm(s.moneyFlowScore,     20);
  const news     = norm(s.newsSentimentScore, 15);
  const fund     = norm(s.fundamentalScore,   25);
  return adaptive * 0.30 + tech * 0.30 + mf * 0.20 + news * 0.10 + fund * 0.10;
}

function computeLongScore(s: StockScoreRow): number {
  const adaptive = s.adaptiveScore ?? 0;
  const tech     = norm(s.technicalScore,     30);
  const mf       = norm(s.moneyFlowScore,     20);
  const news     = norm(s.newsSentimentScore, 15);
  const fund     = norm(s.fundamentalScore,   25);
  return fund * 0.35 + adaptive * 0.30 + mf * 0.15 + tech * 0.10 + news * 0.10;
}

/** Filter and score a full StockScore list for one strategy. Returns top-N sorted rows. */
function buildCandidates(
  allScores:    StockScoreRow[],
  strategy:     StrategyType,
): ScoredRow[] {
  // 1. Filter
  let filtered: StockScoreRow[];
  if (strategy === "LONG_TRADE") {
    filtered = allScores.filter(s => s.recommendationV2 === "STRONG_BUY");
  } else {
    // DAY_TRADE and SWING_TRADE: exclude AVOID
    filtered = allScores.filter(s => s.recommendationV2 !== "AVOID");
  }

  // 2. Score
  const scored: ScoredRow[] = filtered.map(s => {
    let finalScore: number;
    if (strategy === "DAY_TRADE")   finalScore = computeDayScore(s);
    else if (strategy === "SWING_TRADE") finalScore = computeSwingScore(s);
    else                             finalScore = computeLongScore(s);

    return {
      symbol:           s.symbol,
      finalScore,
      aiScore:          s.adaptiveScore ?? 0,
      technicalNorm:    norm(s.technicalScore,     30),
      fundamentalNorm:  norm(s.fundamentalScore,   25),
      moneyFlowNorm:    norm(s.moneyFlowScore,     20),
      newsSentimentNorm: norm(s.newsSentimentScore, 15),
      computedAt:       s.computedAt,
    };
  });

  // 3. Sort descending by finalScore
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // 4. Take top N
  return scored.slice(0, TOP_N);
}

// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  const border = "═".repeat(60);
  console.log(border);
  console.log(`  Strategy Recommendation Engine  ${DRY_RUN ? "🔍 DRY RUN" : ""}`);
  console.log(`  Started: ${startedAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} JST`);
  console.log(border);

  // ── Step 1: Determine runDate ───────────────────────────────────────────────
  step("Determine runDate");

  let runDate: Date;
  if (dateArg) {
    const [y, m, d] = dateArg.split("-").map(Number);
    runDate = new Date(Date.UTC(y, m - 1, d));
    row("Mode",    "explicit --date");
    row("runDate", dateArg);
  } else {
    runDate = jstDate();
    const iso = runDate.toISOString().slice(0, 10);
    row("Mode",    "today JST");
    row("runDate", iso);
  }

  // ── Step 2: Idempotency check ───────────────────────────────────────────────
  step("Idempotency check");

  const existingCount = await (prisma as any).strategyRecommendation.count({
    where: { tradeDate: runDate },
  });

  row("Existing rows for runDate", existingCount);

  if (existingCount > 0) {
    console.log(`\n  ⚠  StrategyRecommendation rows already exist for ${runDate.toISOString().slice(0, 10)}.`);
    console.log("  Skipping generation to preserve idempotency. Use a different --date to re-run.");
    await prisma.$disconnect();
    return;
  }

  // ── Step 3: Read all StockScore rows ───────────────────────────────────────
  step("Read StockScore (adaptiveScore not null)");

  const allScores: StockScoreRow[] = await prisma.stockScore.findMany({
    where: {
      adaptiveScore: { not: null },
    },
    select: {
      symbol:             true,
      adaptiveScore:      true,
      technicalScore:     true,
      fundamentalScore:   true,
      moneyFlowScore:     true,
      newsSentimentScore: true,
      recommendationV2:   true,
      computedAt:         true,
    },
  });

  row("Total StockScore rows loaded", allScores.length);

  // ── Step 4: Per-strategy: filter → score → sort → upsert ───────────────────
  step("Generate and upsert StrategyRecommendation (3 strategies)");

  const strategies: StrategyType[] = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"];

  // Collect top-10 symbols per strategy for legacy sync
  const top10ByStrategy: Record<StrategyType, string[]> = {
    DAY_TRADE:   [],
    SWING_TRADE: [],
    LONG_TRADE:  [],
  };

  for (const strategy of strategies) {
    const candidates = buildCandidates(allScores, strategy);
    const candidateCount = (() => {
      // Count pre-slice candidates for logging
      let filtered: StockScoreRow[];
      if (strategy === "LONG_TRADE") {
        filtered = allScores.filter(s => s.recommendationV2 === "STRONG_BUY");
      } else {
        filtered = allScores.filter(s => s.recommendationV2 !== "AVOID");
      }
      return filtered.length;
    })();

    console.log(`\n  ${strategy}:`);
    console.log(`    Total candidates after filter: ${candidateCount}`);

    // Print top 5
    const preview = candidates.slice(0, 5);
    for (let i = 0; i < preview.length; i++) {
      const c = preview[i];
      console.log(
        `    # ${(i + 1).toString().padStart(2)}  ${c.symbol.padEnd(12)}` +
        `finalScore=${c.finalScore.toFixed(1).padStart(5)}  aiScore=${c.aiScore.toFixed(1).padStart(5)}`
      );
    }
    if (candidates.length > 5) {
      console.log(`    … +${candidates.length - 5} more`);
    }

    // Collect top-10 symbols
    top10ByStrategy[strategy] = candidates.slice(0, TOP10_N).map(c => c.symbol);

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Skipping ${candidates.length} upserts.`);
      continue;
    }

    // Upsert each candidate
    let upserted = 0;
    for (let idx = 0; idx < candidates.length; idx++) {
      const c    = candidates[idx];
      const rank = idx + 1;
      const isTop10 = rank <= TOP10_N;

      await (prisma as any).strategyRecommendation.upsert({
        where: {
          strategyType_tradeDate_symbol: {
            strategyType: strategy,
            tradeDate:    runDate,
            symbol:       c.symbol,
          },
        },
        create: {
          strategyType:    strategy,
          tradeDate:       runDate,
          symbol:          c.symbol,
          rank,
          isTop10,
          aiScore:         c.aiScore,
          finalScore:      c.finalScore,
          technicalScore:  c.technicalNorm,
          fundamentalScore: c.fundamentalNorm,
          newsScore:       c.newsSentimentNorm,
          moneyFlowScore:  c.moneyFlowNorm,
          sourceScoreDate: c.computedAt,
        },
        update: {
          rank,
          isTop10,
          aiScore:          c.aiScore,
          finalScore:       c.finalScore,
          technicalScore:   c.technicalNorm,
          fundamentalScore: c.fundamentalNorm,
          newsScore:        c.newsSentimentNorm,
          moneyFlowScore:   c.moneyFlowNorm,
          sourceScoreDate:  c.computedAt,
        },
      });
      upserted++;
    }

    console.log(`    Upserted ${upserted} rows.`);
  }

  // ── Step 5: Legacy sync → DailyRecommendation.strategyType ─────────────────
  step("Legacy sync → DailyRecommendation.strategyType");

  // Check if any DailyRecommendation rows exist for runDate
  const drCount = await (prisma as any).dailyRecommendation.count({
    where: { date: runDate },
  });

  row("DailyRecommendation rows for runDate", drCount);

  if (drCount === 0) {
    console.log("  No DailyRecommendation rows for this date — skipping legacy sync.");
  } else {
    for (const strategy of strategies) {
      const top10Symbols = top10ByStrategy[strategy];
      const legacyType   = LEGACY_MAP[strategy];

      if (top10Symbols.length === 0) {
        console.log(`  ${strategy}: no top-10 symbols, skipping.`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would updateMany DailyRecommendation strategyType='${legacyType}' for ${top10Symbols.length} symbols.`);
        continue;
      }

      const updated = await (prisma as any).dailyRecommendation.updateMany({
        where: {
          date:   runDate,
          symbol: { in: top10Symbols },
        },
        data: {
          strategyType: legacyType,
        },
      });

      console.log(`  ${strategy} → strategyType='${legacyType}': updated ${updated.count} DailyRecommendation rows.`);
    }
  }

  // ── Step 6: Summary ─────────────────────────────────────────────────────────
  step("Summary");

  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  row("runDate",   runDate.toISOString().slice(0, 10));
  row("DRY RUN",   DRY_RUN ? "yes" : "no");
  row("Strategies", strategies.length.toString());
  row("Top-N per strategy", TOP_N.toString());
  row("isTop10 threshold",  TOP10_N.toString());
  row("Elapsed",   `${elapsed}s`);

  console.log(`\n${DRY_RUN ? "  [DRY RUN] No DB writes were performed." : "  Done."}`);
  console.log(border);

  await prisma.$disconnect();
}

// ═══════════════════════════════════════════════════════════════════════════════
main().catch(e => {
  console.error("CRASH:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
