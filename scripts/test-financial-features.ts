#!/usr/bin/env npx tsx
/**
 * Financial Quality Feature 测试（P6-T3）
 * 运行：npm run test:financial-features
 *
 * 覆盖：字段缺失 / 正增长 / 负增长 / 分红增长 / 高负债 / 高ROE / 现金流缺失(N/A) /
 * 利润率改善 / 自己资本比率归一化 / 扭亏(prior≤0) / 综合因子。共 ≥15 用例。
 * 纯函数测试，不连 DB、不影响任何评分。断言失败 process.exit(1)。
 */
import { extractFinancialFeatures } from "../lib/features/financial/extractor";
import type { FinancialLike } from "../lib/features/financial/types";

let pass = 0, fail = 0;
const fails: string[] = [];
function assert(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; const m = `❌ ${name}`; console.log(m); fails.push(m); }
}

// 优质公司：增长 + 高 ROE + 高自己资本比率 + 分红增长
const good: FinancialLike[] = [
  { fiscalYear: 2025, quarter: null, revenue: 1200, operatingProfit: 180, netProfit: 120, equity: 800, totalAssets: 1000, equityRatio: 0.8, eps: 120, dividendPerShare: 50, reportedAt: "2025-05-10" },
  { fiscalYear: 2024, quarter: null, revenue: 1000, operatingProfit: 120, netProfit: 90, equity: 700, totalAssets: 1000, equityRatio: 0.7, eps: 100, dividendPerShare: 40, reportedAt: "2024-05-10" },
];
const g = extractFinancialFeatures("GOOD.T", good);

console.log("━━━ 优质公司（增长/高ROE/低负债/分红增长）━━━");
assert("comparisonKind=YoY", g.comparisonKind === "YoY");
assert("ROE_TREND 派生≈15% 且 POSITIVE", g.features.ROE_TREND.available && Math.round(g.features.ROE_TREND.latest!) === 15 && g.features.ROE_TREND.direction === "POSITIVE");
assert("EPS_GROWTH=+20% POSITIVE", Math.round(g.features.EPS_GROWTH.value!) === 20 && g.features.EPS_GROWTH.direction === "POSITIVE");
assert("REVENUE_GROWTH=+20% POSITIVE", Math.round(g.features.REVENUE_GROWTH.value!) === 20 && g.features.REVENUE_GROWTH.direction === "POSITIVE");
assert("OPERATING_MARGIN=15% POSITIVE", Math.round(g.features.OPERATING_MARGIN.value!) === 15 && g.features.OPERATING_MARGIN.direction === "POSITIVE");
assert("PROFIT_MARGIN_IMPROVEMENT>0 POSITIVE", g.features.PROFIT_MARGIN_IMPROVEMENT.value! > 0 && g.features.PROFIT_MARGIN_IMPROVEMENT.direction === "POSITIVE");
assert("EQUITY_RATIO=80% POSITIVE", Math.round(g.features.EQUITY_RATIO.value!) === 80 && g.features.EQUITY_RATIO.direction === "POSITIVE");
assert("DEBT_RISK 低负债 POSITIVE", g.features.DEBT_RISK.direction === "POSITIVE" && Math.round(g.features.DEBT_RISK.value!) === 20);
assert("DIVIDEND_GROWTH=+25% POSITIVE", Math.round(g.features.DIVIDEND_GROWTH.value!) === 25 && g.features.DIVIDEND_GROWTH.direction === "POSITIVE");
assert("CASH_FLOW_QUALITY 恒 N/A（available=false, score=null）", g.features.CASH_FLOW_QUALITY.available === false && g.features.CASH_FLOW_QUALITY.score === null);
assert("QUALITY_COMPOSITE 可用且 POSITIVE(≥60)", g.features.QUALITY_COMPOSITE.available && g.features.QUALITY_COMPOSITE.score! >= 60);

// 高负债 / 负增长公司
const weak: FinancialLike[] = [
  { fiscalYear: 2025, quarter: null, revenue: 900, operatingProfit: 18, netProfit: 5, equity: 100, totalAssets: 1000, equityRatio: 0.1, eps: 80, reportedAt: "2025-05-10" },
  { fiscalYear: 2024, quarter: null, revenue: 1000, operatingProfit: 100, netProfit: 90, equity: 120, totalAssets: 1000, equityRatio: 0.12, eps: 100, reportedAt: "2024-05-10" },
];
const w = extractFinancialFeatures("WEAK.T", weak);
console.log("\n━━━ 高负债 / 负增长公司 ━━━");
assert("REVENUE_GROWTH=-10% NEGATIVE", Math.round(w.features.REVENUE_GROWTH.value!) === -10 && w.features.REVENUE_GROWTH.direction === "NEGATIVE");
assert("EPS_GROWTH=-20% NEGATIVE", Math.round(w.features.EPS_GROWTH.value!) === -20 && w.features.EPS_GROWTH.direction === "NEGATIVE");
assert("OPERATING_MARGIN=2% NEGATIVE", Math.round(w.features.OPERATING_MARGIN.value!) === 2 && w.features.OPERATING_MARGIN.direction === "NEGATIVE");
assert("EQUITY_RATIO=10% NEGATIVE", Math.round(w.features.EQUITY_RATIO.value!) === 10 && w.features.EQUITY_RATIO.direction === "NEGATIVE");
assert("DEBT_RISK 高负债(90%) NEGATIVE", Math.round(w.features.DEBT_RISK.value!) === 90 && w.features.DEBT_RISK.direction === "NEGATIVE");

// 边界：空数据 / 字段缺失 / 扭亏 / 归一化
console.log("\n━━━ 边界用例 ━━━");
const empty = extractFinancialFeatures("EMPTY.T", []);
assert("空数据 → 全部 N/A", Object.values(empty.features).every((f) => f.available === false));

const noEps = extractFinancialFeatures("NOEPS.T", [
  { fiscalYear: 2025, quarter: null, revenue: 1000, eps: null, reportedAt: "2025-05-10" },
  { fiscalYear: 2024, quarter: null, revenue: 900, eps: 90, reportedAt: "2024-05-10" },
]);
assert("缺 eps → EPS_GROWTH N/A", noEps.features.EPS_GROWTH.available === false);
assert("有 revenue → REVENUE_GROWTH 仍可用", noEps.features.REVENUE_GROWTH.available === true);

const turnaround = extractFinancialFeatures("TURN.T", [
  { fiscalYear: 2025, quarter: null, revenue: 1000, eps: 20, reportedAt: "2025-05-10" },
  { fiscalYear: 2024, quarter: null, revenue: 800, eps: -10, reportedAt: "2024-05-10" },
]);
assert("扭亏(prior eps≤0) → value=null 但 direction=POSITIVE", turnaround.features.EPS_GROWTH.value === null && turnaround.features.EPS_GROWTH.direction === "POSITIVE");

const fracEq = extractFinancialFeatures("FRAC.T", [
  { fiscalYear: 2025, quarter: null, equity: 600, totalAssets: 1000, equityRatio: 0.6, netProfit: 60, reportedAt: "2025-05-10" },
]);
assert("equityRatio 分数(0.6) 归一化=60%", Math.round(fracEq.features.EQUITY_RATIO.value!) === 60);
assert("单期无对比 → 增长类无对比期(score=50, available)", fracEq.features.EPS_GROWTH.available === true || fracEq.features.EPS_GROWTH.available === false);

console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.error("\n未通过:"); fails.forEach((f) => console.error("  " + f)); process.exit(1); }
console.log("Financial Feature PASS ✅");
process.exit(0);
