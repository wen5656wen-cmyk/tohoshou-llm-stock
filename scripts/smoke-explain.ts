// T2 P3/P4 AI Explain — smoke test.
// Verifies the /api/strategy/explain endpoint across every explanationType (spec §10):
//   1. DAY_TRADE  Top10 symbol           → RECOMMENDED
//   2. DAY_TRADE  rank 11~100 symbol     → NOT_TOP10
//   3. SWING_TRADE rank 11~100 symbol    → NOT_TOP10
//   4. LONG_TRADE scored-but-not-in-pool → NOT_CANDIDATE (or DATA_INSUFFICIENT)
//   5. unknown symbol                    → DATA_INSUFFICIENT (no crash)
//
// Read-only: it does not write anything. Picks live symbols directly from the DB,
// then calls the HTTP endpoint. Usage:
//   BASE_URL=http://localhost:3000 npx tsx scripts/smoke-explain.ts

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail: string) {
  const mark = ok ? "✅" : "❌";
  if (ok) pass++;
  else fail++;
  console.log(`${mark} ${name} — ${detail}`);
}

async function callExplain(strategyType: string, symbol: string, tradeDate?: string) {
  const qs = new URLSearchParams({ strategyType, symbol });
  if (tradeDate) qs.set("tradeDate", tradeDate);
  const url = `${BASE_URL}/api/strategy/explain?${qs.toString()}`;
  const t0 = Date.now();
  const res = await fetch(url);
  const ms = Date.now() - t0;
  const body = await res.json();
  return { status: res.status, body, ms };
}

async function latestDate(strategyType: string): Promise<string | null> {
  const latest = await (prisma as any).strategyRecommendation.findFirst({
    where: { strategyType },
    orderBy: { tradeDate: "desc" },
    select: { tradeDate: true },
  });
  return latest ? latest.tradeDate.toISOString().slice(0, 10) : null;
}

async function firstSymbol(strategyType: string, isTop10: boolean): Promise<{ symbol: string; tradeDate: string } | null> {
  const d = await latestDate(strategyType);
  if (!d) return null;
  const row = await (prisma as any).strategyRecommendation.findFirst({
    where: { strategyType, tradeDate: new Date(d), isTop10 },
    orderBy: { rank: isTop10 ? "asc" : "asc" },
    select: { symbol: true },
  });
  return row ? { symbol: row.symbol, tradeDate: d } : null;
}

async function main() {
  console.log(`[smoke-explain] BASE_URL=${BASE_URL}\n`);

  // 1. DAY Top10 → RECOMMENDED
  {
    const t = await firstSymbol("DAY_TRADE", true);
    if (t) {
      const { status, body, ms } = await callExplain("DAY_TRADE", t.symbol, t.tradeDate);
      const ok = status === 200 && body.explanationType === "RECOMMENDED" && body.scoreBreakdown != null;
      check(`DAY RECOMMENDED (${t.symbol})`, ok, `type=${body.explanationType} conclusion=${body.conclusion} reasons=${body.reasons?.length} ${ms}ms`);
    } else check("DAY RECOMMENDED", false, "no Top10 data");
  }

  // 2. DAY rank 11~100 → NOT_TOP10
  {
    const t = await firstSymbol("DAY_TRADE", false);
    if (t) {
      const { status, body, ms } = await callExplain("DAY_TRADE", t.symbol, t.tradeDate);
      const ok =
        status === 200 && body.explanationType === "NOT_TOP10" &&
        Array.isArray(body.shortfalls) && Array.isArray(body.improvementFactors);
      check(`DAY NOT_TOP10 (${t.symbol})`, ok, `type=${body.explanationType} rank=${body.rank} gap=${body.scoreGap} imp=${body.improvementFactors?.length} ${ms}ms`);
    } else check("DAY NOT_TOP10", false, "no non-Top10 rows");
  }

  // 3. SWING rank 11~100 → NOT_TOP10
  {
    const t = await firstSymbol("SWING_TRADE", false);
    if (t) {
      const { status, body, ms } = await callExplain("SWING_TRADE", t.symbol, t.tradeDate);
      const ok = status === 200 && body.explanationType === "NOT_TOP10" && Array.isArray(body.improvementFactors);
      check(`SWING NOT_TOP10 (${t.symbol})`, ok, `type=${body.explanationType} rank=${body.rank} gap=${body.scoreGap} short=${body.shortfalls?.length} ${ms}ms`);
    } else check("SWING NOT_TOP10", false, "no non-Top10 rows");
  }

  // 4. LONG scored but not in pool → NOT_CANDIDATE (or DATA_INSUFFICIENT)
  {
    const d = await latestDate("LONG_TRADE");
    // A scored symbol that is NOT among LONG recommendation rows for that date.
    const poolSymbols: string[] = d
      ? (await (prisma as any).strategyRecommendation.findMany({
          where: { strategyType: "LONG_TRADE", tradeDate: new Date(d) },
          select: { symbol: true },
        })).map((r: any) => r.symbol)
      : [];
    const scored = await (prisma as any).stockScore.findFirst({
      where: poolSymbols.length ? { symbol: { notIn: poolSymbols } } : {},
      select: { symbol: true },
    });
    if (scored) {
      const { status, body, ms } = await callExplain("LONG_TRADE", scored.symbol, d ?? undefined);
      const ok =
        status === 200 &&
        (body.explanationType === "NOT_CANDIDATE" || body.explanationType === "DATA_INSUFFICIENT");
      check(`LONG NOT_CANDIDATE (${scored.symbol})`, ok, `type=${body.explanationType} adaptive=${body.adaptiveScore} short=${body.shortfalls?.length} imp=${body.improvementFactors?.length} ${ms}ms`);
    } else check("LONG NOT_CANDIDATE", false, "no scored symbol outside pool");
  }

  // 5. unknown symbol → DATA_INSUFFICIENT
  {
    const { status, body, ms } = await callExplain("DAY_TRADE", "0000_NOPE.T");
    const ok = status === 200 && body.explanationType === "DATA_INSUFFICIENT" && body.found === false;
    check("Unknown symbol DATA_INSUFFICIENT", ok, `type=${body.explanationType} found=${body.found} ${ms}ms`);
  }

  console.log(`\n[smoke-explain] PASS=${pass} FAIL=${fail}`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("[smoke-explain] fatal", e);
  await prisma.$disconnect();
  process.exit(1);
});
