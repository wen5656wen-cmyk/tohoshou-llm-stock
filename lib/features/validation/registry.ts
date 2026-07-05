// ── TOHOSHOU AI · Feature Validation Registry（P6-T5）───────────────────────
// 把 Feature Catalog 与验证结果结合。**只读派生、不落库、不影响任何评分。**
// 当前无 Backtest 样本 → shadow 因子 pending（WATCH），生产因子标 KEEP（历史已验证，
// 本引擎 V1 不重算样本）。未来将真实统计通过 inputs 传入即可产出实质建议。

import { getAllFeatures } from "../registry";
import { evaluateFeature, emptyInput } from "./engine";
import {
  type FeatureValidation, type ValidationInput, type ValidationResult,
  type ValidationStage, type ValidationSummary,
} from "./types";

/** status → 当前 pipeline 阶段。 */
export function stageFromStatus(status: string): ValidationStage {
  if (status === "PRODUCTION") return "Production";
  if (status === "SHADOW") return "Shadow";
  return "Registry"; // DISABLED / 其它
}

/**
 * 全部 Feature 的验证视图。
 * @param inputs 可选：feature id → 真实统计（未来 Backtest 喂入）；缺省则 pending。
 */
export function getFeatureValidations(inputs?: Map<string, ValidationInput>): FeatureValidation[] {
  return getAllFeatures().map((f) => {
    const stage = stageFromStatus(f.status);
    const input = inputs?.get(f.id);
    let validation: ValidationResult;

    if (input) {
      validation = evaluateFeature(input, stage);
    } else if (f.status === "PRODUCTION") {
      validation = {
        ...evaluateFeature(emptyInput(), stage),
        recommendation: "KEEP", confidence: "HIGH", pending: false,
        reasons: ["已在生产（历史验证，本引擎 V1 未重算样本）"],
      };
    } else {
      // SHADOW / DISABLED：等待 Backtest 样本
      validation = evaluateFeature(emptyInput(), stage);
    }

    return {
      id: f.id, name: f.name, category: f.category, source: f.source,
      status: f.status, version: f.version, validation,
    };
  });
}

/** 验证汇总（KEEP/WATCH/REMOVE/PROMOTE/pending + 阶段分布）。 */
export function getValidationSummary(inputs?: Map<string, ValidationInput>): ValidationSummary {
  const rows = getFeatureValidations(inputs);
  const s: ValidationSummary = {
    total: rows.length, keep: 0, watch: 0, remove: 0, promote: 0, pending: 0,
    byStage: { Registry: 0, Shadow: 0, Validation: 0, Learning: 0, Production: 0 },
  };
  for (const r of rows) {
    const rec = r.validation.recommendation;
    if (rec === "KEEP") s.keep++;
    else if (rec === "WATCH") s.watch++;
    else if (rec === "REMOVE") s.remove++;
    else if (rec === "PROMOTE") s.promote++;
    if (r.validation.pending) s.pending++;
    s.byStage[r.validation.stage]++;
  }
  return s;
}
