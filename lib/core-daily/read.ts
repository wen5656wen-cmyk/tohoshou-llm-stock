// ─────────────────────────────────────────────────────────────────────────────
// P26 Phase 4 · Core Daily Read 查询层（**只读** DB → 机器码对象）。
// 仅 import prisma + 类型 + api-http 助手。**禁** import runtime/adapters/validation/registry(runtime)/
// engines/python/child_process。仅 findMany/findFirst/findUnique/count/aggregate。零实时计算。
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/prisma";
import { toYmd, toIso, BUSINESS_TZ, readRegistryStrategy, ApiError } from "./api-http";

export type LatestStatus = "NO_RUN" | "RUN_FAILED" | "DATA_INSUFFICIENT" | "NO_SIGNAL" | "SHADOW_BUY";

type RunModel = Awaited<ReturnType<typeof prisma.coreDailyRun.findFirst>>;
type SignalModel = Awaited<ReturnType<typeof prisma.coreDailySignal.findFirst>>;
type ValidationModel = Awaited<ReturnType<typeof prisma.coreDailyValidation.findFirst>>;

/** 纯函数：由 run 最终机器状态派生 /latest 状态（可单测；不因 signals 空自动判 NO_SIGNAL）。 */
export function deriveLatestStatus(run: { runStatus: string; shadowBuyCount: number } | null): LatestStatus {
  if (!run) return "NO_RUN";
  if (run.runStatus === "ERROR") return "RUN_FAILED";
  if (run.runStatus === "DATA_INSUFFICIENT") return "DATA_INSUFFICIENT";
  if (run.runStatus === "OK") return run.shadowBuyCount > 0 ? "SHADOW_BUY" : "NO_SIGNAL";
  return "RUN_FAILED";
}

function shapeRun(r: NonNullable<RunModel>) {
  return {
    runId: r.runId, strategyId: r.strategyId, strategyVersion: r.strategyVersion,
    tradeDate: toYmd(r.tradeDate), asOf: r.asOf, marketSession: r.marketSession,
    runStatus: r.runStatus, integrityStatus: r.integrityStatus, integrityReasons: r.integrityReasons,
    gateResult: r.gateResult, gateBreadth: r.gateBreadth, gateReasons: r.gateReasons,
    candidateCount: r.candidateCount, shadowBuyCount: r.shadowBuyCount, dataVersion: r.dataVersion,
    failureReason: r.failureReason, durationMs: r.durationMs,
    startedAt: toIso(r.startedAt), finishedAt: toIso(r.finishedAt), createdAt: toIso(r.createdAt),
  };
}
function shapeSignal(s: NonNullable<SignalModel>) {
  return {
    runId: s.runId, strategyId: s.strategyId, tradeDate: toYmd(s.tradeDate), asOf: s.asOf, symbol: s.symbol,
    inCandidatePool: s.inCandidatePool, asOfChangePct: s.asOfChangePct, decision: s.decision,
    confidence: s.confidence, refClose: s.refClose, entryLow: s.entryLow, entryHigh: s.entryHigh,
    topRules: s.topRules, failureReason: s.failureReason, createdAt: toIso(s.createdAt),
  };
}
function shapeValidation(v: NonNullable<ValidationModel>) {
  return {
    runId: v.runId, strategyId: v.strategyId, tradeDate: toYmd(v.tradeDate), symbol: v.symbol,
    refClose: v.refClose, nextOpen: v.nextOpen, grossPct: v.grossPct, netPct: v.netPct,
    slippagePct: v.slippagePct, costPct: v.costPct, fillState: v.fillState, success: v.success,
    failureReason: v.failureReason, validatedAt: toIso(v.validatedAt),
  };
}

// ── /latest ──────────────────────────────────────────────────────────────────
export async function getLatestView(strategyId: string) {
  const latest = await prisma.coreDailyRun.findFirst({
    where: { strategyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!latest) {
    const h = readRegistryStrategy(strategyId, "NOT_AVAILABLE");
    return { status: "NO_RUN" as LatestStatus, tradeDate: null, currentStrategy: h, run: null,
             signals: [], validation: null, dataStatus: { code: "NO_RUN", missingFields: [] }, timezone: BUSINESS_TZ };
  }
  const finalRun =
    (await prisma.coreDailyRun.findFirst({
      where: { strategyId, tradeDate: latest.tradeDate, asOf: "15:23" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })) ?? latest;
  const status = deriveLatestStatus(finalRun);
  const signals =
    status === "SHADOW_BUY"
      ? (await prisma.coreDailySignal.findMany({
          where: { runId: finalRun.runId, decision: "SHADOW_BUY" }, orderBy: [{ confidence: "desc" }, { symbol: "asc" }],
        })).map(shapeSignal)
      : [];
  const vRows = await prisma.coreDailyValidation.findMany({
    where: { strategyId, tradeDate: finalRun.tradeDate }, orderBy: [{ netPct: "desc" }],
  });
  return {
    status, tradeDate: toYmd(finalRun.tradeDate),
    currentStrategy: readRegistryStrategy(strategyId, finalRun.strategyVersion),
    run: shapeRun(finalRun), signals, validation: vRows.length ? vRows.map(shapeValidation) : null,
    dataStatus: { code: finalRun.integrityStatus === "PASS" ? finalRun.runStatus : "DATA_INSUFFICIENT",
                  missingFields: finalRun.integrityReasons },
    timezone: BUSINESS_TZ,
  };
}

// ── /runs（cursor 分页）──────────────────────────────────────────────────────
export interface RunsQuery {
  strategyId?: string; tradeDate?: string; asOf?: string; runStatus?: string; marketSession?: string;
  strategyVersion?: string; cursor?: number; limit: number;
}
export async function listRuns(q: RunsQuery) {
  const where = {
    ...(q.strategyId ? { strategyId: q.strategyId } : {}),
    ...(q.strategyVersion ? { strategyVersion: q.strategyVersion } : {}),
    ...(q.tradeDate ? { tradeDate: new Date(q.tradeDate) } : {}),
    ...(q.asOf ? { asOf: q.asOf } : {}),
    ...(q.runStatus ? { runStatus: q.runStatus } : {}),
    ...(q.marketSession ? { marketSession: q.marketSession } : {}),
    ...(q.cursor ? { id: { lt: q.cursor } } : {}),
  };
  const rows = await prisma.coreDailyRun.findMany({ where, orderBy: { id: "desc" }, take: q.limit + 1 });
  const hasMore = rows.length > q.limit;
  const items = (hasMore ? rows.slice(0, q.limit) : rows);
  return { items: items.map((r) => ({ ...shapeRun(r), id: r.id })), hasMore, nextCursor: hasMore ? items[items.length - 1].id : null };
}

// ── /run/:runId ────────────────────────────────────────────────────────────
export async function getRunDetail(runId: string) {
  const run = await prisma.coreDailyRun.findUnique({ where: { runId } });
  if (!run) throw new ApiError("CORE_DAILY_RUN_NOT_FOUND", 404, "core daily run not found", { runId });
  const [signals, validations] = await Promise.all([
    prisma.coreDailySignal.findMany({ where: { runId }, orderBy: [{ decision: "desc" }, { confidence: "desc" }] }),
    prisma.coreDailyValidation.findMany({ where: { runId }, orderBy: [{ netPct: "desc" }] }),
  ]);
  return { run: shapeRun(run), signals: signals.map(shapeSignal), validations: validations.map(shapeValidation), timezone: BUSINESS_TZ };
}

// ── /signals（cursor 分页）────────────────────────────────────────────────────
export interface SignalsQuery {
  strategyId?: string; tradeDate: string; asOf?: string; decision?: string; symbol?: string; runId?: string;
  cursor?: number; limit: number;
}
export async function listSignals(q: SignalsQuery) {
  const where = {
    ...(q.strategyId ? { strategyId: q.strategyId } : {}),
    tradeDate: new Date(q.tradeDate),
    ...(q.asOf ? { asOf: q.asOf } : {}),
    ...(q.decision ? { decision: q.decision } : {}),
    ...(q.symbol ? { symbol: q.symbol } : {}),
    ...(q.runId ? { runId: q.runId } : {}),
    ...(q.cursor ? { id: { lt: q.cursor } } : {}),
  };
  const rows = await prisma.coreDailySignal.findMany({ where, orderBy: { id: "desc" }, take: q.limit + 1 });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items: items.map((s) => ({ ...shapeSignal(s), id: s.id })), hasMore, nextCursor: hasMore ? items[items.length - 1].id : null };
}

// ── /validations（cursor 分页；不隐藏失败）────────────────────────────────────
export interface ValidationsQuery {
  strategyId?: string; tradeDate: string; symbol?: string; fillState?: string;
  cursor?: number; limit: number;
}
export async function listValidations(q: ValidationsQuery) {
  const where = {
    ...(q.strategyId ? { strategyId: q.strategyId } : {}),
    tradeDate: new Date(q.tradeDate),
    ...(q.symbol ? { symbol: q.symbol } : {}),
    ...(q.fillState ? { fillState: q.fillState } : {}),
    ...(q.cursor ? { id: { lt: q.cursor } } : {}),
  };
  const rows = await prisma.coreDailyValidation.findMany({ where, orderBy: { id: "desc" }, take: q.limit + 1 });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items: items.map((v) => ({ ...shapeValidation(v), id: v.id })), hasMore, nextCursor: hasMore ? items[items.length - 1].id : null };
}

// ── /statistics（HISTORY | DB_AGGREGATE | NO_DATA）────────────────────────────
export async function getStatistics(strategyId: string, historyKey?: string) {
  const hist = await prisma.coreDailyHistory.findFirst({
    where: { strategyId, ...(historyKey ? { historyKey } : {}) }, orderBy: [{ computedAt: "desc" }, { id: "desc" }],
  });
  if (hist) {
    return {
      status: "OK", source: "HISTORY", historyStatus: "AVAILABLE",
      strategyId, strategyVersion: hist.strategyVersion, historyKey: hist.historyKey,
      sampleCount: hist.n, netWinRate: hist.netWinRate, netMean: hist.netMean, netMedian: hist.netMedian,
      breakEvenCost: hist.breakEvenCost, netIdeal: hist.netIdeal, netBase: hist.netBase, netStress: hist.netStress,
      sharpe: hist.sharpe, cumNetCurve: hist.cumNetCurve, source_detail: hist.source,
      validationStatus: readRegistryStrategy(strategyId, hist.strategyVersion).validationStatus,
      computedAt: toIso(hist.computedAt), timezone: BUSINESS_TZ,
    };
  }
  const sampleCount = await prisma.coreDailyValidation.count({ where: { strategyId } });
  if (sampleCount === 0) {
    return { status: "NO_DATA", source: "NONE", historyStatus: "NOT_AVAILABLE",
             strategyId, validationStatus: readRegistryStrategy(strategyId, "NOT_AVAILABLE").validationStatus, timezone: BUSINESS_TZ };
  }
  const [agg, executedCount, grossWinCount, netWinCount, anyRow, span] = await Promise.all([
    prisma.coreDailyValidation.aggregate({
      where: { strategyId },
      _avg: { grossPct: true, netPct: true, slippagePct: true },
      _sum: { grossPct: true, netPct: true }, _max: { netPct: true }, _min: { netPct: true },
    }),
    prisma.coreDailyValidation.count({ where: { strategyId, fillState: { startsWith: "FILLED" } } }),
    prisma.coreDailyValidation.count({ where: { strategyId, grossPct: { gt: 0 } } }),
    prisma.coreDailyValidation.count({ where: { strategyId, netPct: { gt: 0 } } }),
    prisma.coreDailyValidation.findFirst({ where: { strategyId }, select: { strategyVersion: true } }),
    prisma.coreDailyValidation.aggregate({ where: { strategyId }, _min: { tradeDate: true }, _max: { tradeDate: true } }),
  ]);
  const rate = (n: number) => (sampleCount ? Number((n / sampleCount).toFixed(4)) : null);
  return {
    status: "OK", source: "DB_AGGREGATE", historyStatus: "NOT_AVAILABLE",
    strategyId, strategyVersion: anyRow?.strategyVersion ?? "NOT_AVAILABLE",
    sampleCount, executedCount, failedCount: sampleCount - executedCount,
    grossWinCount, netWinCount, grossWinRate: rate(grossWinCount), netWinRate: rate(netWinCount),
    averageGrossReturn: agg._avg.grossPct, averageNetReturn: agg._avg.netPct,
    medianGrossReturn: null, medianNetReturn: null, medianStatus: "NOT_COMPUTED",
    cumulativeGrossReturn: agg._sum.grossPct, cumulativeNetReturn: agg._sum.netPct,
    averageSlippage: agg._avg.slippagePct, maxGain: agg._max.netPct, maxLoss: agg._min.netPct,
    dateFrom: span._min.tradeDate ? toYmd(span._min.tradeDate) : null,
    dateTo: span._max.tradeDate ? toYmd(span._max.tradeDate) : null,
    validationStatus: readRegistryStrategy(strategyId, anyRow?.strategyVersion ?? "NOT_AVAILABLE").validationStatus,
    timezone: BUSINESS_TZ,
  };
}
