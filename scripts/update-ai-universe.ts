#!/usr/bin/env npx tsx
/**
 * P1-T2 — AI Universe Guard (periodic automatic exclusion).
 *
 * Identifies stocks unsuitable for AI scoring and flips them out of the universe:
 *   SYSTEM: delisted / 整理, long-term suspended / 監理
 *   AUTO:   ETF, ETN, J-REIT, Preferred (name match); insufficient data; low turnover
 *
 * Manual priority (LOCKED):
 *   - aiExcludeSource === "MANUAL" is NEVER touched — a manual exclude is not
 *     auto-recovered, and a manual override (aiEnabled=true + source MANUAL + rule
 *     kept as a warning) is not re-excluded.
 *   - Auto/System exclusions are self-healing: when a stock no longer matches any
 *     rule, the guard re-enables it (StockScore is rebuilt by the next compute-scores).
 *
 * Newly auto/system-excluded stocks have their StockScore purged immediately so every
 * StockScore-driven flow (rerank / gpt / ai-scores / sync-news / strategy-recs /
 * portfolio / backtest) drops them at once — same contract as the T1 manual switch.
 *
 * Usage:  npm run update-ai-universe            (apply)
 *         DRY_RUN=1 npm run update-ai-universe  (preview, no writes)
 * Env:    AI_UNIVERSE_MIN_TURNOVER_JPY (default 5_000_000)
 *         AI_UNIVERSE_MIN_BARS_30D     (default 10)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { classifyAutoExclude, type AutoVerdict } from "../lib/ai-universe";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const MIN_TURNOVER_JPY = Number(process.env.AI_UNIVERSE_MIN_TURNOVER_JPY ?? 5_000_000);
const MIN_RECENT_BARS = Number(process.env.AI_UNIVERSE_MIN_BARS_30D ?? 10);
const WINDOW_DAYS = 30;

async function main() {
  const now = new Date();
  console.log(`=== AI Universe Guard ${DRY_RUN ? "(DRY RUN)" : ""} ===`);
  console.log(`thresholds: minTurnover=¥${MIN_TURNOVER_JPY.toLocaleString()}  minBars(${WINDOW_DAYS}d)=${MIN_RECENT_BARS}\n`);

  // ── Load all stocks with the fields the rules need ─────────────────────────
  const stocks = await prisma.stock.findMany({
    select: {
      symbol: true, name: true, sector: true,
      isDelisted: true, isSuspended: true, tradingStatus: true, listingStatus: true,
      aiEnabled: true, excludeReason: true, aiExcludeSource: true, aiExcludeRule: true,
    },
    orderBy: { symbol: "asc" },
  });

  // ── Recent-window aggregates: turnover (avgVol×avgClose) + bar count ────────
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000);
  const agg = await prisma.dailyPrice.groupBy({
    by: ["symbol"],
    where: { date: { gte: since } },
    _avg: { volume: true, close: true },
    _count: { symbol: true },
  });
  const turnoverMap = new Map<string, number>();
  const barsMap = new Map<string, number>();
  for (const a of agg) {
    const vol = a._avg.volume ?? 0;
    const close = a._avg.close ?? 0;
    turnoverMap.set(a.symbol, vol * close);
    barsMap.set(a.symbol, a._count.symbol);
  }

  const th = { minTurnoverJpy: MIN_TURNOVER_JPY, minRecentBars: MIN_RECENT_BARS };

  let skippedManual = 0;
  let newlyExcluded = 0;
  let updatedExcluded = 0;
  let recovered = 0;
  let clearedStale = 0;
  let purgedScores = 0;
  const byReason: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const examples: string[] = [];

  for (const s of stocks) {
    // Manual decisions are untouchable (both manual-exclude and manual-override).
    if (s.aiExcludeSource === "MANUAL") { skippedManual++; continue; }

    const barsRaw = barsMap.get(s.symbol);
    const recentBars = barsRaw ?? null;
    const turnoverJpy = turnoverMap.has(s.symbol) ? turnoverMap.get(s.symbol)! : null;

    const verdict: AutoVerdict | null = classifyAutoExclude(
      {
        name: s.name, sector: s.sector,
        isDelisted: s.isDelisted, isSuspended: s.isSuspended,
        tradingStatus: s.tradingStatus, listingStatus: s.listingStatus,
        turnoverJpy, recentBars,
      },
      th
    );

    if (verdict) {
      const changed =
        s.aiEnabled === true ||
        s.excludeReason !== verdict.reason ||
        s.aiExcludeSource !== verdict.source ||
        s.aiExcludeRule !== verdict.rule;
      if (!changed) continue;

      const isNew = s.aiEnabled === true;
      if (isNew) newlyExcluded++; else updatedExcluded++;
      byReason[verdict.reason] = (byReason[verdict.reason] ?? 0) + (isNew ? 1 : 0);
      bySource[verdict.source] = (bySource[verdict.source] ?? 0) + (isNew ? 1 : 0);
      if (isNew && examples.length < 12) examples.push(`${s.symbol} ${verdict.reason}/${verdict.rule} [${verdict.source}]`);

      if (!DRY_RUN) {
        await prisma.$transaction([
          prisma.stock.update({
            where: { symbol: s.symbol },
            data: {
              aiEnabled: false,
              excludeReason: verdict.reason,
              aiExcludeSource: verdict.source,
              aiExcludeRule: verdict.rule,
              aiExcludeUpdatedAt: now,
            },
          }),
          prisma.stockScore.deleteMany({ where: { symbol: s.symbol } }),
        ]);
        purgedScores++;
      }
    } else {
      // No rule matches.
      if (s.aiEnabled === false && (s.aiExcludeSource === "AUTO" || s.aiExcludeSource === "SYSTEM")) {
        recovered++;
        if (examples.length < 12) examples.push(`${s.symbol} RECOVER (was ${s.excludeReason})`);
        if (!DRY_RUN) {
          await prisma.stock.update({
            where: { symbol: s.symbol },
            data: {
              aiEnabled: true, excludeReason: null,
              aiExcludeSource: null, aiExcludeRule: null, aiExcludeUpdatedAt: now,
            },
          });
        }
      } else if (
        s.aiEnabled === true &&
        (s.aiExcludeSource === "AUTO" || s.aiExcludeSource === "SYSTEM") &&
        s.aiExcludeRule != null
      ) {
        // stale auto markers on an enabled stock — clear them
        clearedStale++;
        if (!DRY_RUN) {
          await prisma.stock.update({
            where: { symbol: s.symbol },
            data: { aiExcludeSource: null, aiExcludeRule: null },
          });
        }
      }
    }
  }

  console.log("── Summary ─────────────────────────────────────────────");
  console.log(`stocks scanned        : ${stocks.length}`);
  console.log(`skipped (MANUAL)      : ${skippedManual}`);
  console.log(`newly excluded        : ${newlyExcluded}`);
  console.log(`re-classified         : ${updatedExcluded}`);
  console.log(`auto-recovered        : ${recovered}`);
  console.log(`stale markers cleared : ${clearedStale}`);
  console.log(`StockScore purged     : ${DRY_RUN ? "(dry)" : purgedScores}`);
  console.log(`by reason (new)       : ${JSON.stringify(byReason)}`);
  console.log(`by source (new)       : ${JSON.stringify(bySource)}`);
  if (examples.length) {
    console.log("examples:");
    examples.forEach((e) => console.log(`  ${e}`));
  }
  if (DRY_RUN) console.log("\n(DRY RUN — no writes performed)");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
