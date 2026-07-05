#!/usr/bin/env npx tsx
/**
 * Feature Validation Engine 测试（P6-T5）
 * 运行：npm run test:feature-validation
 *
 * 覆盖：Coverage / HitRate / Alpha / Sample / Confidence / Recommendation /
 * Boundary / Empty Feature / computeStats / registry 汇总。共 ≥25 用例。
 * 纯函数测试，不连 DB、不影响任何评分。断言失败 process.exit(1)。
 */
import { evaluateFeature, emptyInput } from "../lib/features/validation/engine";
import { computeStats, deriveConfidence, deriveValidationScore, type FeatureObservation } from "../lib/features/validation/statistics";
import { getFeatureValidations, getValidationSummary } from "../lib/features/validation/registry";
import type { ValidationInput } from "../lib/features/validation/types";

let pass = 0, fail = 0;
const fails: string[] = [];
function assert(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; const m = `❌ ${name}`; console.log(m); fails.push(m); }
}
function inp(o: Partial<ValidationInput>): ValidationInput {
  return { coverage: 80, sampleSize: 50, hitRate: 55, avgReturn: 1, alpha: 1, winRate: 55, informationGain: null, ...o };
}

console.log("━━━ Empty / Pending ━━━");
const e = evaluateFeature(emptyInput(), "Shadow");
assert("空输入 → WATCH", e.recommendation === "WATCH");
assert("空输入 → pending=true", e.pending === true);
assert("空输入 → confidence LOW", e.confidence === "LOW");
assert("空输入 → validationScore null", e.validationScore === null);
assert("空输入 → stage=Shadow 透传", e.stage === "Shadow");

console.log("\n━━━ Recommendation ━━━");
assert("PROMOTE: hit75 alpha6 sample50 cov80", evaluateFeature(inp({ hitRate: 75, alpha: 6 }), "Shadow").recommendation === "PROMOTE");
assert("KEEP: hit65 alpha2", evaluateFeature(inp({ hitRate: 65, alpha: 2 }), "Shadow").recommendation === "KEEP");
assert("REMOVE: hit40 alpha-2", evaluateFeature(inp({ hitRate: 40, alpha: -2 }), "Shadow").recommendation === "REMOVE");
assert("WATCH 中间: hit55 alpha1", evaluateFeature(inp({ hitRate: 55, alpha: 1 }), "Shadow").recommendation === "WATCH");

console.log("\n━━━ Sample / Coverage 守卫 ━━━");
assert("Sample<30 阻止 PROMOTE → WATCH", evaluateFeature(inp({ hitRate: 75, alpha: 6, sampleSize: 20 }), "Shadow").recommendation === "WATCH");
assert("Sample<30 → LOW 置信", evaluateFeature(inp({ sampleSize: 20 }), "Shadow").confidence === "LOW");
assert("Coverage<20 → WATCH", evaluateFeature(inp({ hitRate: 75, alpha: 6, coverage: 10 }), "Shadow").recommendation === "WATCH");

console.log("\n━━━ Boundary（严格 > / <）━━━");
assert("hit=70(非>70) → 落 KEEP 非 PROMOTE", evaluateFeature(inp({ hitRate: 70, alpha: 6 }), "Shadow").recommendation === "KEEP");
assert("hit=60(非>60) alpha2 → WATCH", evaluateFeature(inp({ hitRate: 60, alpha: 2 }), "Shadow").recommendation === "WATCH");
assert("alpha=5(非>5) hit75 → KEEP 非 PROMOTE", evaluateFeature(inp({ hitRate: 75, alpha: 5 }), "Shadow").recommendation === "KEEP");
assert("alpha=0(非>0) hit65 → WATCH", evaluateFeature(inp({ hitRate: 65, alpha: 0 }), "Shadow").recommendation === "WATCH");
assert("hit=45(非<45) alpha-2 → WATCH 非 REMOVE", evaluateFeature(inp({ hitRate: 45, alpha: -2 }), "Shadow").recommendation === "WATCH");

console.log("\n━━━ Confidence 分层 ━━━");
assert("sample=29 → LOW", deriveConfidence(29) === "LOW");
assert("sample=30 → MEDIUM", deriveConfidence(30) === "MEDIUM");
assert("sample=99 → MEDIUM", deriveConfidence(99) === "MEDIUM");
assert("sample=100 → HIGH", deriveConfidence(100) === "HIGH");
assert("sample=null → LOW", deriveConfidence(null) === "LOW");

console.log("\n━━━ validationScore ━━━");
assert("score(hit70,alpha5)=59.0", deriveValidationScore(inp({ hitRate: 70, alpha: 5 })) === 59);
assert("score 缺 alpha → null", deriveValidationScore(inp({ alpha: null })) === null);

console.log("\n━━━ computeStats（从观测）━━━");
const obs: FeatureObservation[] = [
  { signal: true, forwardReturn: 3, benchmarkReturn: 1, covered: true },
  { signal: true, forwardReturn: -1, benchmarkReturn: 1, covered: true },
  { signal: true, forwardReturn: 5, benchmarkReturn: 1, covered: true },
];
const st = computeStats(obs, 10);
assert("computeStats sampleSize=3", st.sampleSize === 3);
assert("computeStats hitRate≈66.7", Math.round(st.hitRate!) === 67);
assert("computeStats coverage=30(3/10)", Math.round(st.coverage!) === 30);
assert("computeStats alpha≈1.33", Math.abs(st.alpha! - 1.333) < 0.01);
assert("computeStats winRate≈66.7(vs bench)", Math.round(st.winRate!) === 67);
assert("computeStats 空 → sampleSize null", computeStats([]).sampleSize === null);

console.log("\n━━━ Registry 汇总（真实 catalog）━━━");
const sum = getValidationSummary();
const rows = getFeatureValidations();
assert("total=83", sum.total === 83);
assert("Production 因子标 KEEP=46", sum.keep === 46);
assert("Shadow/Disabled pending WATCH=37", sum.watch === 37 && sum.pending === 37);
assert("byStage.Production=46", sum.byStage.Production === 46);
assert("byStage.Shadow=37", sum.byStage.Shadow === 37);
assert("每个 feature 都有 validation 结果", rows.every((r) => r.validation != null));

console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.error("\n未通过:"); fails.forEach((f) => console.error("  " + f)); process.exit(1); }
console.log("Validation Engine PASS ✅");
process.exit(0);
