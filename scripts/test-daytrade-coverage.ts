#!/usr/bin/env npx tsx
/**
 * Test: Day Trade TradeResult coverage (JPX-calendar-aware) — CHECK S33 logic.
 *
 * Verifies that weekends / Japan holidays / year-end closures are NOT counted
 * as missing Day Trade settlements, while genuine trading-day gaps still are.
 *
 * Run: npm run test:daytrade-coverage
 * No DB required (pure function + offline JPX calendar).
 */
import { countConsecutiveMissingTradingDays } from "../lib/trading-calendar/coverage";

// midnight-UTC Date === how tradeDate (@db.Date) is stored; interpreted as JST day
const d = (s: string) => new Date(s + "T00:00:00.000Z");

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`); }
}

console.log("Day Trade coverage (JPX-aware) tests:\n");

// 1) The exact production false-positive: weekends unsettled, Friday settled → OK
check("prod scenario (Sun/Sat unsettled + Fri settled) → missing 0",
  countConsecutiveMissingTradingDays([
    { tradeDate: d("2026-07-05"), hasResult: false }, // Sun
    { tradeDate: d("2026-07-04"), hasResult: false }, // Sat
    { tradeDate: d("2026-07-03"), hasResult: true },  // Fri settled
    { tradeDate: d("2026-07-02"), hasResult: true },
  ]).missing, 0);

// 2) Genuine single trading-day gap still reported
check("single trading-day gap (Fri unsettled, Thu settled) → missing 1",
  countConsecutiveMissingTradingDays([
    { tradeDate: d("2026-07-03"), hasResult: false }, // Fri
    { tradeDate: d("2026-07-02"), hasResult: true },  // Thu
  ]), { missing: 1, missingDates: ["2026-07-03"] });

// 3) Two consecutive trading-day gaps → CRITICAL (missing >= 2)
check("two consecutive trading-day gaps → missing 2",
  countConsecutiveMissingTradingDays([
    { tradeDate: d("2026-07-03"), hasResult: false }, // Fri
    { tradeDate: d("2026-07-02"), hasResult: false }, // Thu
    { tradeDate: d("2026-07-01"), hasResult: true },  // Wed
  ]).missing, 2);

// 4) Weekend skipped BUT genuine Friday gap still counts (weekends don't mask it)
check("weekends skipped + Fri genuine gap → missing 1",
  countConsecutiveMissingTradingDays([
    { tradeDate: d("2026-07-05"), hasResult: false }, // Sun skip
    { tradeDate: d("2026-07-04"), hasResult: false }, // Sat skip
    { tradeDate: d("2026-07-03"), hasResult: false }, // Fri MISSING
    { tradeDate: d("2026-07-02"), hasResult: true },  // Thu settled
  ]), { missing: 1, missingDates: ["2026-07-03"] });

// 5) Japan holiday (海の日 2026-07-20) skipped
check("Japan holiday (2026-07-20 海の日) unsettled → missing 0",
  countConsecutiveMissingTradingDays([
    { tradeDate: d("2026-07-20"), hasResult: false }, // Mon holiday skip
    { tradeDate: d("2026-07-17"), hasResult: true },  // Fri settled
  ]).missing, 0);

// 6) Year-end closure (01-01) skipped
check("year-end (2026-01-01) unsettled → missing 0",
  countConsecutiveMissingTradingDays([
    { tradeDate: d("2026-01-01"), hasResult: false }, // year-end skip
    { tradeDate: d("2025-12-30"), hasResult: true },  // trading day settled
  ]).missing, 0);

// 7) All settled → missing 0
check("all trading days settled → missing 0",
  countConsecutiveMissingTradingDays([
    { tradeDate: d("2026-07-03"), hasResult: true },
    { tradeDate: d("2026-07-02"), hasResult: true },
  ]).missing, 0);

// 8) maxTradingDays cap respected (many gaps, cap = 5)
check("cap at maxTradingDays=5 → missing 5",
  countConsecutiveMissingTradingDays([
    { tradeDate: d("2026-07-03"), hasResult: false },
    { tradeDate: d("2026-07-02"), hasResult: false },
    { tradeDate: d("2026-07-01"), hasResult: false },
    { tradeDate: d("2026-06-30"), hasResult: false },
    { tradeDate: d("2026-06-29"), hasResult: false },
    { tradeDate: d("2026-06-26"), hasResult: false }, // 6th trading day — not examined
  ]).missing, 5);

// 9) Empty input → missing 0
check("empty candidates → missing 0",
  countConsecutiveMissingTradingDays([]), { missing: 0, missingDates: [] });

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} PASS`);
process.exit(fail === 0 ? 0 : 1);
