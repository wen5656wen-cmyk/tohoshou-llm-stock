// ─────────────────────────────────────────────────────────────────────────────
// P26 Phase 3 · 真实 ComputeAdapter（#2）。**接入真实计算**：spawn 真实 Python 流水线
// （data/minute_hist 真实分钟 → Indicator → Feature → Decision → Strategy，as-of 截断无未来）。
// **禁 Mock/Demo/Fake/Static** —— 每次调用都是实时计算，返回实时 ComputeInputs。
// ─────────────────────────────────────────────────────────────────────────────
import { execFile } from "child_process";
import { join } from "path";
import type { ComputeInputs, RunParams } from "./types";
import type { ComputeAdapter } from "./runtime";

const PY = process.env.CORE_DAILY_PYTHON || "python3";
const COMPUTE = join(process.cwd(), "research", "minute", "core_daily", "compute_inputs.py");
export const VALIDATION_SCRIPT = join(process.cwd(), "research", "minute", "core_daily", "validation_inputs.py");

/** spawn Python，返回 stdout（超时/非零退出/空输出 → 抛错，由调用方转 DATA_INSUFFICIENT）。 */
export function runPython(script: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(PY, [script, ...args], { maxBuffer: 64 * 1024 * 1024, timeout: 180_000 }, (err, stdout) => {
      if (err) return reject(err);
      const out = stdout.trim();
      if (!out) return reject(new Error("EMPTY_PYTHON_OUTPUT"));
      resolve(out);
    });
  });
}

/** 真实流水线适配器。 */
export class PythonPipelineAdapter implements ComputeAdapter {
  readonly name = "python_pipeline";
  constructor(private readonly version: string) {}

  async getInputs(params: RunParams): Promise<ComputeInputs | null> {
    try {
      const out = await runPython(COMPUTE, [
        `--strategy=${params.strategyId}`,
        `--date=${params.tradeDate}`,
        `--asof=${params.asOf}`,
        `--version=${this.version}`,
      ]);
      return JSON.parse(out) as ComputeInputs;
    } catch {
      return null; // 计算/数据失败 → 上层判 DATA_INSUFFICIENT（绝不默认 BUY）
    }
  }
}
