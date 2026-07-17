#!/usr/bin/env npx tsx
/**
 * 拆股复权自动测试 (requirement #6) — offline, deterministic, no DB / no network.
 *
 * Guards against regression of the split-contamination bug:
 *   • across a split day the ADJUSTED series must stay continuous
 *     (no ≈ -66.7% fake single-day drop from a 1:3 split);
 *   • MA/RSI/returns computed from adjClose must be split-safe;
 *   • the raw (unadjusted) series still exhibits the cliff — proving the detector
 *     and the repair diff (computeAdjCloseUpdates) actually catch/fix it;
 *   • the chart ratio (adjClose/close) reconstructs a continuous close series.
 *
 * Fixtures: real J-Quants 325A.T data around its 2026-06-29 1:3 split, plus a
 * synthetic clean 1:3 split long enough to exercise return60d / MA60.
 *
 * Run: npm run test:split-adjustment
 */

import { calcIndicators, type PriceRow } from "../lib/indicators";
import {
  findAdjCloseCliffs,
  computeAdjCloseUpdates,
  adjRatio,
  effAdj,
} from "../lib/split-adjust";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`); }
}

// ── Fixture 1: REAL 325A.T around the 2026-06-29 1:3 split ────────────────────
// [date, rawClose, correctAdjClose] straight from J-Quants /equities/bars/daily.
const R: [string, number, number][] = [
  ["2026-05-20", 3400, 1133.3], ["2026-05-21", 3710, 1236.7], ["2026-05-22", 3590, 1196.7],
  ["2026-05-25", 3480, 1160.0], ["2026-05-26", 3545, 1181.7], ["2026-05-27", 3465, 1155.0],
  ["2026-05-28", 3535, 1178.3], ["2026-05-29", 3480, 1160.0], ["2026-06-01", 3635, 1211.7],
  ["2026-06-02", 3740, 1246.7], ["2026-06-03", 3800, 1266.7], ["2026-06-04", 3885, 1295.0],
  ["2026-06-05", 3995, 1331.7], ["2026-06-08", 3795, 1265.0], ["2026-06-09", 3815, 1271.7],
  ["2026-06-10", 3820, 1273.3], ["2026-06-11", 3710, 1236.7], ["2026-06-12", 3700, 1233.3],
  ["2026-06-15", 3650, 1216.7], ["2026-06-16", 3675, 1225.0], ["2026-06-17", 3765, 1255.0],
  ["2026-06-18", 3790, 1263.3], ["2026-06-19", 4040, 1346.7], ["2026-06-22", 3980, 1326.7],
  ["2026-06-23", 4200, 1400.0], ["2026-06-24", 4165, 1388.3], ["2026-06-25", 4105, 1368.3],
  ["2026-06-26", 4135, 1378.3],
  ["2026-06-29", 1351, 1351.0], // ← 1:3 split ex-date
  ["2026-06-30", 1402, 1402.0], ["2026-07-01", 1343, 1343.0], ["2026-07-02", 1367, 1367.0],
  ["2026-07-03", 1350, 1350.0], ["2026-07-06", 1423, 1423.0], ["2026-07-07", 1443, 1443.0],
  ["2026-07-08", 1429, 1429.0], ["2026-07-09", 1412, 1412.0], ["2026-07-10", 1400, 1400.0],
  ["2026-07-13", 1400, 1400.0], ["2026-07-14", 1415, 1415.0], ["2026-07-15", 1418, 1418.0],
  ["2026-07-16", 1637, 1637.0],
];

const SPLIT = "2026-06-29";
const fixedRows: PriceRow[]  = R.map(([date, close, adj]) => ({ date, close, adjClose: adj }));
const brokenRows: PriceRow[] = R.map(([date, close]) => ({ date, close, adjClose: close })); // stale == close

// single-day return on the effective (adjusted) series at the split day
function splitDayReturn(rows: PriceRow[]): number {
  const i = rows.findIndex(r => r.date === SPLIT);
  const prev = effAdj(rows[i - 1]), cur = effAdj(rows[i]);
  return (cur - prev) / prev;
}

console.log("\n=== 拆股复权自动测试 ===\n");

console.log("Fixture 1 — REAL 325A.T (1:3 @ 2026-06-29):");
// FIXED series: continuous, split-safe
const fixedSplitRet = splitDayReturn(fixedRows);
ok("复权价拆股日单日收益连续（|ret| < 20%）", Math.abs(fixedSplitRet) < 0.20, `got ${(fixedSplitRet * 100).toFixed(1)}%`);
ok("复权序列无跳空（findAdjCloseCliffs = 0）", findAdjCloseCliffs(R.map(([d, c, a]) => ({ date: d, close: c, adjClose: a }))).length === 0);

const fixedInd = calcIndicators("325A.T", fixedRows);
ok("复权 return20d 非污染（> -20%）", (fixedInd.return20d ?? -99) > -20, `got ${fixedInd.return20d?.toFixed(2)}%`);
ok("复权 RSI14 非崩溃（> 30）", (fixedInd.rsi14 ?? 0) > 30, `got ${fixedInd.rsi14?.toFixed(1)}`);

// BROKEN series: the historical bug reproduces exactly
const brokenSplitRet = splitDayReturn(brokenRows);
ok("原始价拆股日出现 ≈ -66.7% 假跌", brokenSplitRet < -0.6 && brokenSplitRet > -0.72, `got ${(brokenSplitRet * 100).toFixed(1)}%`);
ok("坏数据被 cliff 检测器捕获", findAdjCloseCliffs(brokenRows.map(r => ({ date: String(r.date), close: r.close, adjClose: r.adjClose ?? null }))).length > 0);
const brokenInd = calcIndicators("325A.T", brokenRows);
ok("坏数据 return20d 呈现约 -56% 污染", (brokenInd.return20d ?? 0) < -40, `got ${brokenInd.return20d?.toFixed(2)}%`);

// Repair diff: broken → fresh yields corrections only on pre-split rows
const storedBroken = R.map(([d, c]) => ({ date: d, adjClose: c }));
const fresh        = R.map(([d, c, a]) => ({ date: d, close: c, adjClose: a }));
const updates = computeAdjCloseUpdates(storedBroken, fresh);
const preSplitCount = R.filter(([d]) => d < SPLIT).length;
ok("修复 diff 覆盖全部拆股前行", updates.length === preSplitCount, `updates=${updates.length} expected=${preSplitCount}`);
ok("修复 diff 不动拆股后行（已正确）", updates.every(u => u.date < SPLIT));

// Genuine move (already adjusted): zero updates
const genuineStored = R.map(([d, , a]) => ({ date: d, adjClose: a }));
ok("真实波动（stored==fresh）产生 0 修复", computeAdjCloseUpdates(genuineStored, fresh).length === 0);

// Chart ratio reconstructs a continuous close series
const chartCloses = R.map(([, c, a]) => c * adjRatio(c, a));
let maxChartJump = 0;
for (let i = 1; i < chartCloses.length; i++) {
  maxChartJump = Math.max(maxChartJump, Math.abs((chartCloses[i] - chartCloses[i - 1]) / chartCloses[i - 1]));
}
ok("图表 ratio 重建的收盘序列连续（最大单日 < 20%）", maxChartJump < 0.20, `maxJump ${(maxChartJump * 100).toFixed(1)}%`);

// ── Fixture 2: SYNTHETIC clean 1:3 split, 70 bars (exercises return60d/MA60) ──
console.log("\nFixture 2 — SYNTHETIC 1:3 split (70 bars):");
const PRE = 40, POST = 30;
const synFixed: PriceRow[] = [];
const synBroken: PriceRow[] = [];
for (let i = 0; i < PRE + POST; i++) {
  const d = `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`;
  const raw = i < PRE ? 3000 : 1000;      // 1:3 split at i=PRE
  const adj = 1000;                        // correctly back-adjusted → flat
  synFixed.push({ date: d, close: raw, adjClose: adj });
  synBroken.push({ date: d, close: raw, adjClose: raw });
}
const synFixedInd = calcIndicators("SYN", synFixed);
const synBrokenInd = calcIndicators("SYN", synBroken);
ok("合成复权 return60d ≈ 0（|.| < 5%）", Math.abs(synFixedInd.return60d ?? 99) < 5, `got ${synFixedInd.return60d?.toFixed(2)}%`);
ok("合成复权 MA60 ≈ 1000", Math.abs((synFixedInd.ma60 ?? 0) - 1000) < 1, `got ${synFixedInd.ma60?.toFixed(1)}`);
ok("合成坏数据 return60d ≈ -66.7%（复现 bug）", (synBrokenInd.return60d ?? 0) < -60, `got ${synBrokenInd.return60d?.toFixed(2)}%`);
ok("合成坏数据被 cliff 检测器捕获", findAdjCloseCliffs(synBroken.map(r => ({ date: String(r.date), close: r.close, adjClose: r.adjClose ?? null }))).length === 1);

console.log(`\n${"─".repeat(40)}`);
console.log(`${fail === 0 ? "✅" : "❌"}  ${pass}/${pass + fail} PASS`);
if (fail > 0) process.exit(1);
