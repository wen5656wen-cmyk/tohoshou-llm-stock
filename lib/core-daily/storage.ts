// ─────────────────────────────────────────────────────────────────────────────
// P26 Phase 2 · Validation Storage（#5）+ Run/Signal/History 持久化。
// **append-only**：一律 create / createMany，绝不 update 历史行、绝不覆盖。
// ─────────────────────────────────────────────────────────────────────────────
import type { PrismaClient } from "@prisma/client";
import type { RunParams, RunStatus, GateResult, IntegrityStatus, SignalInput, FillState, ValidationFailure } from "./types";

export interface ValidationRow {
  runId: string;
  strategyId: string;
  strategyVersion: string;
  tradeDate: string;
  symbol: string;
  refClose: number | null;
  nextOpen: number | null;
  grossPct: number | null;
  slippagePct: number | null;
  costPct: number | null;
  netPct: number | null;
  fillState: FillState;
  success: boolean | null;
  failureReason: ValidationFailure | null;
  validatedAt: Date;
}

/** append-only：写次日验证（绝不覆盖历史）。 */
export async function persistValidation(db: PrismaClient, rows: ValidationRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db.coreDailyValidation.createMany({
    data: rows.map((v) => ({
      runId: v.runId,
      strategyId: v.strategyId,
      strategyVersion: v.strategyVersion,
      tradeDate: new Date(v.tradeDate),
      symbol: v.symbol,
      refClose: v.refClose,
      nextOpen: v.nextOpen,
      grossPct: v.grossPct,
      slippagePct: v.slippagePct,
      costPct: v.costPct,
      netPct: v.netPct,
      fillState: v.fillState,
      success: v.success,
      failureReason: v.failureReason,
      validatedAt: v.validatedAt,
    })),
    skipDuplicates: true,
  });
}

export interface RunRow {
  runId: string;
  params: RunParams;
  strategyVersion: string;
  runStatus: RunStatus;
  integrityStatus: IntegrityStatus;
  integrityReasons: string[];
  gateResult: GateResult;
  gateBreadth: number | null;
  gateReasons: string[];
  candidateCount: number;
  shadowBuyCount: number;
  dataVersion: string | null;
  failureReason: string | null;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
}

/** append-only：写运行头（含运行时日志字段 #6）。 */
export async function persistRun(db: PrismaClient, r: RunRow): Promise<void> {
  await db.coreDailyRun.create({
    data: {
      runId: r.runId,
      strategyId: r.params.strategyId,
      strategyVersion: r.strategyVersion,
      tradeDate: new Date(r.params.tradeDate),
      asOf: r.params.asOf,
      marketSession: r.params.marketSession,
      runStatus: r.runStatus,
      integrityStatus: r.integrityStatus,
      integrityReasons: r.integrityReasons,
      gateResult: r.gateResult,
      gateBreadth: r.gateBreadth,
      gateReasons: r.gateReasons,
      candidateCount: r.candidateCount,
      shadowBuyCount: r.shadowBuyCount,
      dataVersion: r.dataVersion,
      failureReason: r.failureReason,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.durationMs,
    },
  });
}

/** append-only：写信号（Phase 3 有信号时）。 */
export async function persistSignals(
  db: PrismaClient,
  runId: string,
  params: RunParams,
  strategyVersion: string,
  signals: SignalInput[],
): Promise<void> {
  if (signals.length === 0) return;
  await db.coreDailySignal.createMany({
    data: signals.map((s) => ({
      runId,
      strategyId: params.strategyId,
      strategyVersion,
      tradeDate: new Date(params.tradeDate),
      asOf: params.asOf,
      symbol: s.symbol,
      inCandidatePool: s.inCandidatePool,
      asOfChangePct: s.asOfChangePct,
      decision: s.decision,
      confidence: s.confidence,
      refClose: s.refClose,
      entryLow: s.entryLow,
      entryHigh: s.entryHigh,
      topRules: s.topRules,
      failureReason: s.failureReason,
    })),
    skipDuplicates: true,
  });
}
