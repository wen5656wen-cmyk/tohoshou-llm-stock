// Compute strategy-based backtest results with stop-loss / take-profit simulation
// v15.0 — Three-Strategy System
//
// Reads: DailyRecommendation (with entryDate/entryPrice), DailyPrice, GlobalMarket
// Writes: StrategyBacktestResult
//
// Usage:
//   npx tsx scripts/compute-strategy-backtest.ts            # all DR rows
//   SINCE=2026-06-01 npx tsx scripts/compute-strategy-backtest.ts  # limit by recDate

import { PrismaClient } from "@prisma/client";
import { PrismaPg }     from "@prisma/adapter-pg";
import * as dotenv      from "dotenv";
import { classifyStrategy } from "../lib/strategy/strategy-classifier";

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ── Strategy parameters ───────────────────────────────────────────────────────

const STRATEGY_CONFIG = {
  DAY:      { targetPct: 3.0,  stopPct: -2.0, maxDays: 1  },
  SWING:    { targetPct: 8.0,  stopPct: -4.0, maxDays: 10 },
  POSITION: { targetPct: 20.0, stopPct: -8.0, maxDays: 60 },
} as const;

type ExitReason = "TAKE_PROFIT" | "STOP_LOSS" | "TIME_EXIT" | "OPEN" | "INSUFFICIENT_DATA";

type SimResult = {
  exitDate:    string | null;
  exitPrice:   number | null;
  exitReason:  ExitReason;
  holdingDays: number | null;
  returnPct:   number | null;
  isWin:       boolean | null;
};

type PriceRow = {
  date:  Date;
  open:  number | null;
  high:  number | null;
  low:   number | null;
  close: number;
};

// ── Simulate single strategy exit ─────────────────────────────────────────────

function simulateExit(
  entryPrice:  number,
  strategyType: "DAY" | "SWING" | "POSITION",
  pricesAfter: PriceRow[],  // sorted ascending, starting from entry day+1
): SimResult {
  const { targetPct, stopPct, maxDays } = STRATEGY_CONFIG[strategyType];
  const tpPrice = entryPrice * (1 + targetPct / 100);
  const slPrice = entryPrice * (1 + stopPct / 100);

  for (let i = 0; i < Math.min(pricesAfter.length, maxDays); i++) {
    const p = pricesAfter[i];
    const high  = p.high  ?? p.close;
    const low   = p.low   ?? p.close;
    const open  = p.open  ?? p.close;
    const close = p.close;

    const hitTP = high >= tpPrice;
    const hitSL = low  <= slPrice;

    if (hitTP && hitSL) {
      // Same day: whichever happens first inferred by open direction
      if (open >= entryPrice) {
        // Opened strong → assume take-profit triggered before stop
        const exitP = tpPrice;
        return { exitDate: p.date.toISOString().slice(0, 10), exitPrice: exitP, exitReason: "TAKE_PROFIT", holdingDays: i + 1, returnPct: returnPct(entryPrice, exitP), isWin: true };
      } else {
        const exitP = slPrice;
        return { exitDate: p.date.toISOString().slice(0, 10), exitPrice: exitP, exitReason: "STOP_LOSS", holdingDays: i + 1, returnPct: returnPct(entryPrice, exitP), isWin: false };
      }
    }

    if (hitTP) {
      return { exitDate: p.date.toISOString().slice(0, 10), exitPrice: tpPrice, exitReason: "TAKE_PROFIT", holdingDays: i + 1, returnPct: returnPct(entryPrice, tpPrice), isWin: true };
    }

    if (hitSL) {
      return { exitDate: p.date.toISOString().slice(0, 10), exitPrice: slPrice, exitReason: "STOP_LOSS", holdingDays: i + 1, returnPct: returnPct(entryPrice, slPrice), isWin: false };
    }

    // Last allowed day → TIME_EXIT at close
    if (i === maxDays - 1) {
      return { exitDate: p.date.toISOString().slice(0, 10), exitPrice: close, exitReason: "TIME_EXIT", holdingDays: i + 1, returnPct: returnPct(entryPrice, close), isWin: close > entryPrice };
    }
  }

  // No price data for full holding period
  if (pricesAfter.length > 0) {
    const last = pricesAfter[pricesAfter.length - 1];
    return { exitDate: last.date.toISOString().slice(0, 10), exitPrice: last.close, exitReason: "TIME_EXIT", holdingDays: pricesAfter.length, returnPct: returnPct(entryPrice, last.close), isWin: last.close > entryPrice };
  }

  return { exitDate: null, exitPrice: null, exitReason: "OPEN", holdingDays: null, returnPct: null, isWin: null };
}

function returnPct(entry: number, exit: number): number {
  return Math.round(((exit - entry) / entry) * 10000) / 100;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const since  = process.env.SINCE ? new Date(process.env.SINCE) : undefined;
  const DRY_RUN = process.env.DRY_RUN === "1";

  console.log("🎯 compute-strategy-backtest v15.0");
  if (since) console.log(`  SINCE: ${since.toISOString().slice(0, 10)}`);
  if (DRY_RUN) console.log("  DRY_RUN mode — no writes");

  // Fetch DR rows with entry data
  const drRows = await prisma.dailyRecommendation.findMany({
    where: {
      entryDate:  { not: null },
      entryPrice: { not: null },
      ...(since ? { date: { gte: since } } : {}),
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      symbol: true,
      entryDate: true,
      entryPrice: true,
      // Strategy classification inputs (feat_* snapshot)
      feat_technicalScore:    true,
      feat_fundamentalScore:  true,
      feat_moneyFlowScore:    true,
      feat_adaptiveScore:     true,
      feat_rsi14:             true,
      feat_maTrend:           true,
      feat_stockStyle:        true,
      feat_highRiskFlag:      true,
      overallConfidence:      true,
      recommendation:         true,
    },
  });

  console.log(`  ${drRows.length} DR rows with entry data`);

  if (drRows.length === 0) {
    console.log("  Nothing to process.");
    await prisma.$disconnect();
    return;
  }

  // Collect all unique symbols + date ranges needed
  const symbolSet = new Set(drRows.map((r) => r.symbol));
  const allSymbols = Array.from(symbolSet);

  // Min/Max entry dates for price range query
  const entryDates = drRows.map((r) => r.entryDate!.getTime());
  const minEntry = new Date(Math.min(...entryDates));
  const maxEntry = new Date(Math.max(...entryDates));
  const maxExit  = new Date(maxEntry.getTime() + 65 * 86_400_000); // +65 cal days = ~60 trading days

  console.log(`  Fetching prices for ${allSymbols.length} symbols (${minEntry.toISOString().slice(0, 10)} – ${maxExit.toISOString().slice(0, 10)})…`);

  // Batch price fetch (group by symbol to avoid huge IN query)
  const BATCH = 100;
  const priceMap = new Map<string, PriceRow[]>();
  for (let i = 0; i < allSymbols.length; i += BATCH) {
    const batch = allSymbols.slice(i, i + BATCH);
    const rows = await prisma.dailyPrice.findMany({
      where: {
        symbol: { in: batch },
        date: { gte: minEntry, lte: maxExit },
      },
      orderBy: [{ symbol: "asc" }, { date: "asc" }],
      select: { symbol: true, date: true, open: true, high: true, low: true, close: true },
    });
    for (const r of rows) {
      const arr = priceMap.get(r.symbol) ?? [];
      arr.push({ date: r.date, open: r.open ? Number(r.open) : null, high: r.high ? Number(r.high) : null, low: r.low ? Number(r.low) : null, close: Number(r.close) });
      priceMap.set(r.symbol, arr);
    }
  }

  // Fetch TOPIX benchmark prices for alpha calculation
  const topixRows = await prisma.globalMarket.findMany({
    where: { date: { gte: minEntry, lte: maxExit } },
    orderBy: { date: "asc" },
    select: { date: true, topix: true },
  });
  const topixByDate = new Map<string, number>();
  for (const r of topixRows) {
    if (r.topix != null) topixByDate.set(r.date.toISOString().slice(0, 10), Number(r.topix));
  }

  // Process each DR row × 3 strategies
  let written = 0;
  let skipped = 0;

  for (const dr of drRows) {
    const strategy = classifyStrategy({
      technicalScore:     dr.feat_technicalScore     ?? null,
      fundamentalScore:   dr.feat_fundamentalScore   ?? null,
      moneyFlowScore:     dr.feat_moneyFlowScore      ?? null,
      adaptiveScore:      dr.feat_adaptiveScore       ?? null,
      rsi14:              dr.feat_rsi14               ?? null,
      maTrend:            dr.feat_maTrend             ?? null,
      stockStyle:         dr.feat_stockStyle          ?? null,
      highRiskFlag:       dr.feat_highRiskFlag        ?? null,
      overallConfidence:  dr.overallConfidence        ?? null,
      recommendation:     dr.recommendation           ?? null,
    });

    const recDateStr  = dr.date.toISOString().slice(0, 10);
    const entryDateMs = dr.entryDate!.getTime();
    const entryPrice  = dr.entryPrice!;
    const allPrices   = (priceMap.get(dr.symbol) ?? []).filter((p) => p.date.getTime() > entryDateMs);

    // Simulate for each strategy type (always write all 3 for analysis)
    for (const stype of ["DAY", "SWING", "POSITION"] as const) {
      const { targetPct, stopPct, maxDays } = STRATEGY_CONFIG[stype];
      const pricesToUse = allPrices.slice(0, maxDays + 5);

      let sim: SimResult;
      if (pricesToUse.length === 0) {
        sim = { exitDate: null, exitPrice: null, exitReason: "OPEN", holdingDays: null, returnPct: null, isWin: null };
      } else {
        sim = simulateExit(entryPrice, stype, pricesToUse.slice(0, maxDays));
      }

      // Alpha vs TOPIX
      let alphaPct: number | null = null;
      if (sim.exitDate && sim.returnPct != null) {
        const entryTopix = topixByDate.get(dr.entryDate!.toISOString().slice(0, 10));
        const exitTopix  = topixByDate.get(sim.exitDate);
        if (entryTopix && exitTopix && entryTopix > 0) {
          const benchRet = Math.round(((exitTopix - entryTopix) / entryTopix) * 10000) / 100;
          alphaPct = Math.round((sim.returnPct - benchRet) * 100) / 100;
        }
      }

      if (!DRY_RUN) {
        await prisma.strategyBacktestResult.upsert({
          where: { recDate_symbol_strategyType: { recDate: dr.date, symbol: dr.symbol, strategyType: stype } },
          create: {
            recDate:       dr.date,
            symbol:        dr.symbol,
            strategyType:  stype,
            entryDate:     dr.entryDate,
            entryPrice,
            exitDate:      sim.exitDate ? new Date(sim.exitDate) : null,
            exitPrice:     sim.exitPrice,
            exitReason:    sim.exitReason,
            holdingDays:   sim.holdingDays,
            returnPct:     sim.returnPct,
            alphaPct,
            isWin:         sim.isWin,
          },
          update: {
            entryPrice,
            exitDate:   sim.exitDate ? new Date(sim.exitDate) : null,
            exitPrice:  sim.exitPrice,
            exitReason: sim.exitReason,
            holdingDays: sim.holdingDays,
            returnPct:  sim.returnPct,
            alphaPct,
            isWin:      sim.isWin,
            computedAt: new Date(),
          },
        });
        written++;
      } else {
        const stratKey = stype === strategy.strategyType ? `[★${stype}]` : `[${stype}]`;
        process.stdout.write(`  ${dr.symbol.padEnd(10)} ${recDateStr} ${stratKey.padEnd(11)} ${sim.exitReason.padEnd(18)} ret=${sim.returnPct?.toFixed(1).padStart(6) ?? "    —"}\n`);
        skipped++;
      }
    }
  }

  if (DRY_RUN) {
    console.log(`\n  [DRY_RUN] simulated ${skipped} rows — no writes`);
  } else {
    console.log(`\n  ✅ written ${written} StrategyBacktestResult rows`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
