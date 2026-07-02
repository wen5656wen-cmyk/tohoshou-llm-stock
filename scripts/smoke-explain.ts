// T2 P3 AI Explain — smoke test (spec §14).
// Runs 5 checks against the /api/strategy/explain endpoint:
//   1. DAY_TRADE  Top10 symbol explains OK
//   2. SWING_TRADE Top10 symbol explains OK
//   3. LONG_TRADE Top10 symbol explains OK
//   4. A non-Top10 symbol explains (未入选原因) OK
//   5. A null/unknown symbol does not crash (graceful INSUFFICIENT)
//
// Read-only: it does not write anything. Picks live symbols directly from the DB,
// then calls the HTTP endpoint. Usage:
//   BASE_URL=http://localhost:3000 npx tsx scripts/smoke-explain.ts
//   BASE_URL=https://aitohoshou.com npx tsx scripts/smoke-explain.ts

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const STRATEGIES = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const;

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

async function main() {
  console.log(`[smoke-explain] BASE_URL=${BASE_URL}\n`);

  for (const strategyType of STRATEGIES) {
    const latest = await (prisma as any).strategyRecommendation.findFirst({
      where: { strategyType },
      orderBy: { tradeDate: "desc" },
      select: { tradeDate: true },
    });
    if (!latest) {
      check(`${strategyType} Top10`, false, "no recommendation data in DB");
      continue;
    }
    const tradeDate = latest.tradeDate.toISOString().slice(0, 10);

    // Check 1-3: a Top10 symbol
    const top = await (prisma as any).strategyRecommendation.findFirst({
      where: { strategyType, tradeDate: latest.tradeDate, isTop10: true },
      orderBy: { rank: "asc" },
      select: { symbol: true },
    });
    if (top) {
      const { status, body, ms } = await callExplain(strategyType, top.symbol, tradeDate);
      const ok =
        status === 200 && body.found === true && body.isTop10 === true &&
        Array.isArray(body.reasons) && body.scoreBreakdown != null;
      check(
        `${strategyType} Top10 (${top.symbol})`,
        ok,
        `status=${status} conclusion=${body.conclusion} reasons=${body.reasons?.length} ${ms}ms`,
      );
    } else {
      check(`${strategyType} Top10`, false, "no Top10 rows for latest date");
    }

    // Check 4: a non-Top10 symbol (only meaningful for the first strategy that has one)
    if (strategyType === "DAY_TRADE") {
      const notTop = await (prisma as any).strategyRecommendation.findFirst({
        where: { strategyType, tradeDate: latest.tradeDate, isTop10: false },
        orderBy: { rank: "asc" },
        select: { symbol: true },
      });
      if (notTop) {
        const { status, body, ms } = await callExplain(strategyType, notTop.symbol, tradeDate);
        const ok =
          status === 200 && body.found === true && body.isTop10 === false &&
          body.conclusion === "NOT_TOP10" && Array.isArray(body.missingReasons);
        check(
          `Non-Top10 (${notTop.symbol})`,
          ok,
          `status=${status} rank=${body.rank} gap=${body.scoreGap} cutoff=${body.top10CutoffScore} ${ms}ms`,
        );
      } else {
        check("Non-Top10", false, "no non-Top10 rows found");
      }
    }
  }

  // Check 5: unknown symbol — must not crash, returns graceful shape
  {
    const { status, body, ms } = await callExplain("DAY_TRADE", "0000_NOPE.T");
    const ok = status === 200 && body.found === false && body.conclusion === "INSUFFICIENT";
    check("Null/unknown symbol", ok, `status=${status} found=${body.found} conclusion=${body.conclusion} ${ms}ms`);
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
