// ─────────────────────────────────────────────────────────────────────────────
// P26 Phase 2/3 · Data Integrity（#3）。核心数据缺失 → 立即 DATA_INSUFFICIENT → NO_SIGNAL。
// 禁止：默认 BUY / 跳过检查。缺失项以机器码累计。**按当前策略的 requiredIntegrity 判定**
// （overnight_v1 用 breadth 代理 → 不含 TOPIX；未来策略可各自声明所需项）。
// ─────────────────────────────────────────────────────────────────────────────
import type { ComputeInputs, IntegrityCode, IntegrityStatus } from "./types";

export interface IntegrityResult {
  status: IntegrityStatus;
  reasons: IntegrityCode[];
}

const ALL_CODES: IntegrityCode[] = [
  "MINUTE_INCOMPLETE",
  "VWAP_ABNORMAL",
  "VOLUME_ABNORMAL",
  "BREADTH_MISSING",
  "TOPIX_MISSING",
  "STRATEGY_VERSION_MISSING",
];

/** 逐项完整性检查（仅检查该策略 requiredIntegrity 声明的项）。inputs=null → 全部缺失。 */
export function checkIntegrity(inputs: ComputeInputs | null): IntegrityResult {
  if (!inputs) {
    return { status: "FAIL", reasons: ALL_CODES };
  }
  const req = new Set<IntegrityCode>(inputs.requiredIntegrity);
  const reasons: IntegrityCode[] = [];
  if (req.has("MINUTE_INCOMPLETE") && !inputs.minuteComplete) reasons.push("MINUTE_INCOMPLETE");
  if (req.has("VWAP_ABNORMAL") && !inputs.vwapOk) reasons.push("VWAP_ABNORMAL");
  if (req.has("VOLUME_ABNORMAL") && !inputs.volumeOk) reasons.push("VOLUME_ABNORMAL");
  if (req.has("BREADTH_MISSING") && (inputs.breadth === null || Number.isNaN(inputs.breadth)))
    reasons.push("BREADTH_MISSING");
  if (req.has("TOPIX_MISSING") && !inputs.topixOk) reasons.push("TOPIX_MISSING");
  if (req.has("STRATEGY_VERSION_MISSING") && !inputs.strategyVersion) reasons.push("STRATEGY_VERSION_MISSING");
  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}
