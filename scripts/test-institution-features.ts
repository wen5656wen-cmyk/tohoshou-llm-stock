#!/usr/bin/env npx tsx
/**
 * Institution Flow Feature 测试（P6-T4）
 * 运行：npm run test:institution-features
 *
 * 覆盖：连续买入 / 连续卖出 / 数据缺失(N/A) / reversal(看多·看空) / momentum /
 * stability / score / 各部门流 / 跨市场汇总 / 周数不足。共 ≥20 用例。
 * 纯函数测试，不连 DB、不影响任何评分。断言失败 process.exit(1)。
 */
import { extractInstitutionFeatures } from "../lib/features/institution/extractor";
import type { InstitutionalFlowLike } from "../lib/features/institution/types";

let pass = 0, fail = 0;
const fails: string[] = [];
function assert(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; const m = `❌ ${name}`; console.log(m); fails.push(m); }
}
const WK = ["2026-05-01", "2026-05-08", "2026-05-15", "2026-05-22", "2026-05-29"];
function row(week: string, investorType: string, net: number, market = "TSEPrime"): InstitutionalFlowLike {
  return { date: week, investorType, market, netAmount: net };
}

// ── A. 外资连续买入 + 动量向上（5 周）──
const A = extractInstitutionFeatures(
  WK.map((w, i) => row(w, "foreigners", [-50, 100, 200, 300, 400][i])),
);
console.log("━━━ A. 外资买入 streak + momentum ━━━");
assert("FOREIGN_BUY latest=400 POSITIVE", A.features.FOREIGN_BUY.value === 400 && A.features.FOREIGN_BUY.direction === "POSITIVE");
assert("FOREIGN_BUY score>50", (A.features.FOREIGN_BUY.score ?? 0) > 50);
assert("FOREIGN_BUY_STREAK=4", A.features.FOREIGN_BUY_STREAK.value === 4);
assert("FOREIGN_SELL 非卖出 NEUTRAL", A.features.FOREIGN_SELL.direction === "NEUTRAL");
assert("NET_FLOW_MOMENTUM POSITIVE", A.features.NET_FLOW_MOMENTUM.available && A.features.NET_FLOW_MOMENTUM.direction === "POSITIVE");
assert("FLOW_STABILITY=0.8(4/5)", A.features.FLOW_STABILITY.value === 0.8);
assert("FLOW_REVERSAL 无反转(value 0)", A.features.FLOW_REVERSAL.value === 0 && A.features.FLOW_REVERSAL.direction === "NEUTRAL");
assert("SMART_MONEY_SCORE POSITIVE", A.features.SMART_MONEY_SCORE.direction === "POSITIVE");

// ── B. 外资连续卖出 ──
const B = extractInstitutionFeatures(
  ["2026-05-01", "2026-05-08", "2026-05-15"].map((w, i) => row(w, "foreigners", [50, -100, -200][i])),
);
console.log("\n━━━ B. 外资卖出 ━━━");
assert("FOREIGN_BUY latest=-200 NEGATIVE", B.features.FOREIGN_BUY.value === -200 && B.features.FOREIGN_BUY.direction === "NEGATIVE");
assert("FOREIGN_SELL NEGATIVE 卖压=100", B.features.FOREIGN_SELL.direction === "NEGATIVE" && B.features.FOREIGN_SELL.score === 100);
assert("FOREIGN_BUY_STREAK=0 NEGATIVE", B.features.FOREIGN_BUY_STREAK.value === 0 && B.features.FOREIGN_BUY_STREAK.direction === "NEGATIVE");

// ── C. 看多反转 ──
const C = extractInstitutionFeatures(
  ["2026-05-01", "2026-05-08", "2026-05-15"].map((w, i) => row(w, "foreigners", [-100, -50, 200][i])),
);
console.log("\n━━━ C. 看多反转 ━━━");
assert("FLOW_REVERSAL 看多 POSITIVE value=1 score=80", C.features.FLOW_REVERSAL.value === 1 && C.features.FLOW_REVERSAL.direction === "POSITIVE" && C.features.FLOW_REVERSAL.score === 80);

// ── D. 看空反转 ──
const D = extractInstitutionFeatures(
  ["2026-05-01", "2026-05-08", "2026-05-15"].map((w, i) => row(w, "foreigners", [100, 50, -200][i])),
);
console.log("\n━━━ D. 看空反转 ━━━");
assert("FLOW_REVERSAL 看空 NEGATIVE score=20", D.features.FLOW_REVERSAL.direction === "NEGATIVE" && D.features.FLOW_REVERSAL.score === 20);

// ── E. 空数据 → 全 N/A ──
const E = extractInstitutionFeatures([]);
console.log("\n━━━ E. 数据缺失 ━━━");
assert("空数据 → 全部 N/A", Object.values(E.features).every((f) => f.available === false));
assert("空数据 weeks=0", E.weeks === 0);

// ── F. 周数不足 ──
const Fset = extractInstitutionFeatures([row("2026-05-29", "foreigners", 100)]);
console.log("\n━━━ F. 周数不足 ━━━");
assert("单周 FOREIGN_BUY 可用", Fset.features.FOREIGN_BUY.available === true);
assert("单周 NET_FLOW_MOMENTUM N/A(<2周)", Fset.features.NET_FLOW_MOMENTUM.available === false);
assert("单周 FLOW_STABILITY N/A(<3周)", Fset.features.FLOW_STABILITY.available === false);

// ── G. 多部门 ──
const G = extractInstitutionFeatures([
  row("2026-05-29", "foreigners", 100), row("2026-05-29", "trust_bank", 50),
  row("2026-05-29", "dealer", -30), row("2026-05-29", "individual", -80),
  row("2026-05-29", "insurance", 20),
]);
console.log("\n━━━ G. 多部门 ━━━");
assert("TRUST_BANK_FLOW 可用", G.features.TRUST_BANK_FLOW.available === true && G.features.TRUST_BANK_FLOW.value === 50);
assert("DEALER_FLOW 可用 NEGATIVE", G.features.DEALER_FLOW.available === true && G.features.DEALER_FLOW.direction === "NEGATIVE");
assert("RETAIL_FLOW 可用", G.features.RETAIL_FLOW.available === true && G.features.RETAIL_FLOW.value === -80);
assert("SMART_MONEY(外资100+信托50+保险20=170) POSITIVE", G.features.SMART_MONEY_SCORE.value === 170 && G.features.SMART_MONEY_SCORE.direction === "POSITIVE");

// ── H. 无外资但有信托 ──
const H = extractInstitutionFeatures([row("2026-05-29", "trust_bank", 50)]);
console.log("\n━━━ H. 部门缺失隔离 ━━━");
assert("无 foreigners → FOREIGN_BUY N/A", H.features.FOREIGN_BUY.available === false);
assert("有 trust_bank → TRUST_BANK_FLOW 可用", H.features.TRUST_BANK_FLOW.available === true);

// ── I. 跨市场汇总 ──
const I = extractInstitutionFeatures([
  row("2026-05-29", "foreigners", 100, "TSEPrime"),
  row("2026-05-29", "foreigners", 200, "TSEStandard"),
]);
console.log("\n━━━ I. 跨市场汇总 ━━━");
assert("跨市场求和 foreign=300", I.features.FOREIGN_BUY.value === 300);

console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.error("\n未通过:"); fails.forEach((f) => console.error("  " + f)); process.exit(1); }
console.log("Institution Feature PASS ✅");
process.exit(0);
