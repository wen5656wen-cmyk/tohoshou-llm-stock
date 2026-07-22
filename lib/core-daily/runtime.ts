// ─────────────────────────────────────────────────────────────────────────────
// P26 Phase 2 · Core Daily Runtime（#2/#4 骨架）。
// 数据链路：ComputeAdapter.getInputs → 完整性检查 → (缺失→DATA_INSUFFICIENT/NO_SIGNAL) → 落库。
// Phase 2：ComputeAdapter=NotWired（无分钟计算/数据）→ 一律 DATA_INSUFFICIENT（诚实）。
// Phase 3 才接真实计算(Indicator→Feature→Decision→Strategy)与分钟数据。
// **绝不默认 BUY、绝不跳过完整性检查。**
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import type { ComputeInputs, RunParams, RunResult, RunStatus, GateResult } from "./types";
import { checkIntegrity } from "./integrity";
import { persistRun, persistSignals } from "./storage";
import { logCoreDaily, nowMs } from "./logging";

/** 计算适配器：提供某 (策略,日期,时点) 的运行输入。返回 null = 无数据/无计算。 */
export interface ComputeAdapter {
  readonly name: string;
  getInputs(params: RunParams): Promise<ComputeInputs | null>;
}

/** Phase 2 适配器：不接计算/数据 → 恒返 null → DATA_INSUFFICIENT。 */
export class NotWiredAdapter implements ComputeAdapter {
  readonly name = "not_wired";
  async getInputs(): Promise<ComputeInputs | null> {
    return null;
  }
}

/** 运行一次 Core Daily（手动触发；本层不含 cron）。append-only 落库。 */
export async function runCoreDaily(
  db: PrismaClient,
  adapter: ComputeAdapter,
  params: RunParams,
  declaredVersion: string,
): Promise<RunResult> {
  const runId = randomUUID();
  const startedAt = new Date();
  const t0 = nowMs();
  logCoreDaily("RUN_START", { runId, adapter: adapter.name, ...params, declaredVersion });

  let runStatus: RunStatus = "OK";
  let gateResult: GateResult = "NA";
  let gateBreadth: number | null = null;
  let gateReasons: string[] = [];
  let candidateCount = 0;
  let shadowBuyCount = 0;
  let dataVersion: string | null = null;
  let failureReason: string | null = null;

  let inputs: ComputeInputs | null = null;
  try {
    inputs = await adapter.getInputs(params);
  } catch (e) {
    runStatus = "ERROR";
    failureReason = `ADAPTER_ERROR:${e instanceof Error ? e.name : "UNKNOWN"}`;
  }

  const integrity = checkIntegrity(inputs);

  if (runStatus !== "ERROR" && integrity.status === "FAIL") {
    // 核心数据缺失 → DATA_INSUFFICIENT → NO_SIGNAL（0 shadow buy），绝不默认 BUY
    runStatus = "DATA_INSUFFICIENT";
    failureReason = integrity.reasons[0] ?? "DATA_INSUFFICIENT";
  } else if (runStatus === "OK" && inputs) {
    // Phase 3 路径：完整性通过 → 用计算输入落信号
    gateResult = inputs.gateResult;
    gateBreadth = inputs.breadth;
    gateReasons = inputs.gateReasons;
    dataVersion = inputs.dataVersion;
    candidateCount = inputs.signals.filter((s) => s.inCandidatePool).length;
    shadowBuyCount = inputs.signals.filter((s) => s.decision === "SHADOW_BUY").length;
    await persistSignals(db, runId, params, declaredVersion, inputs.signals);
  }

  const finishedAt = new Date();
  const durationMs = nowMs() - t0;

  await persistRun(db, {
    runId,
    params,
    strategyVersion: inputs?.strategyVersion ?? declaredVersion,
    runStatus,
    integrityStatus: integrity.status,
    integrityReasons: integrity.reasons,
    gateResult,
    gateBreadth,
    gateReasons,
    candidateCount,
    shadowBuyCount,
    dataVersion,
    failureReason,
    startedAt,
    finishedAt,
    durationMs,
  });

  const result: RunResult = {
    runId,
    runStatus,
    integrityStatus: integrity.status,
    integrityReasons: integrity.reasons,
    gateResult,
    candidateCount,
    shadowBuyCount,
    failureReason,
    durationMs,
  };
  logCoreDaily("RUN_END", { ...result });
  return result;
}
