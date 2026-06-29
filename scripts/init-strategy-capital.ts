#!/usr/bin/env npx tsx
/**
 * scripts/init-strategy-capital.ts
 * Idempotent initialization of three independent strategy capital pools.
 *
 * Capital allocation (3:4:3 per Trading-Architecture.md §7):
 *   DAY_TRADE   ¥30,000,000  (30%)
 *   SWING_TRADE ¥40,000,000  (40%)
 *   LONG_TRADE  ¥30,000,000  (30%)
 *
 * Usage: npm run strategy:init-capital
 * Safe to run multiple times — skips already-initialized pools.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const INITIAL_CAPITAL: Record<string, number> = {
  DAY_TRADE:   30_000_000,
  SWING_TRADE: 40_000_000,
  LONG_TRADE:  30_000_000,
};

function jstDate(): Date {
  const now = new Date();
  // Return today's date in JST as a UTC midnight date for @db.Date storage
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

function fmt(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

async function main() {
  console.log("=== Strategy Capital Pool Initializer ===\n");

  const logDate = jstDate();
  const logDateStr = logDate.toISOString().slice(0, 10);
  console.log(`Init date (JST): ${logDateStr}\n`);

  for (const [strategyType, capital] of Object.entries(INITIAL_CAPITAL)) {
    // Check if any capital log already exists for this strategy
    const existing = await (prisma as any).strategyCapitalLog.findFirst({
      where: { strategyType },
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      // Already initialized — report current latest state
      const latest = await (prisma as any).strategyCapitalLog.findFirst({
        where: { strategyType },
        orderBy: { createdAt: "desc" },
      });
      console.log(`✅ [${strategyType}] Already initialized`);
      console.log(`   First log: ${(existing as any).logDate.toISOString().slice(0, 10)}`);
      console.log(`   Latest total: ${fmt((latest as any).totalAfter)}`);
      console.log(`   Cash: ${fmt((latest as any).cashAfter)}  Invested: ${fmt((latest as any).investedAfter)}\n`);
      continue;
    }

    // Create initial log entry
    await (prisma as any).strategyCapitalLog.create({
      data: {
        strategyType,
        logDate,
        cashBefore:     0,
        cashAfter:      capital,
        investedBefore: 0,
        investedAfter:  0,
        totalBefore:    0,
        totalAfter:     capital,
        changeAmount:   capital,
        changeReason:   "INITIAL_SETUP",
      },
    });

    console.log(`🆕 [${strategyType}] Initialized`);
    console.log(`   Initial capital: ${fmt(capital)}`);
    console.log(`   Cash: ${fmt(capital)}  Invested: ¥0\n`);
  }

  // Summary
  console.log("─".repeat(50));
  console.log("Current capital pool status:\n");

  let totalCapital = 0;
  for (const strategyType of Object.keys(INITIAL_CAPITAL)) {
    const latest = await (prisma as any).strategyCapitalLog.findFirst({
      where: { strategyType },
      orderBy: { createdAt: "desc" },
    });

    if (!latest) {
      console.log(`  ${strategyType.padEnd(14)} — no data`);
      continue;
    }

    const l = latest as any;
    const pnl = l.totalAfter - INITIAL_CAPITAL[strategyType];
    const pnlSign = pnl >= 0 ? "+" : "";
    console.log(`  ${strategyType.padEnd(14)}  total=${fmt(l.totalAfter)}  cash=${fmt(l.cashAfter)}  PnL=${pnlSign}${fmt(pnl)}`);
    totalCapital += l.totalAfter;
  }

  console.log(`${"─".repeat(50)}`);
  console.log(`  TOTAL           ${fmt(totalCapital)}`);
  console.log(`\n✅ Capital init complete`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Init failed:", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
