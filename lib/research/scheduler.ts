// ── Deep Research · 统一调度基础设施（P17 Track 1）───────────────────────────
// 唯一 Scheduler，统一供 Benchmark / Daily / Weekly / Trigger（禁重复实现）：
//   分布式锁(pg advisory) · Retry · Timeout · 幂等 · dry-run · Job History(ResearchJob) · 失败隔离。
// ⚠️ 不新增数据结构：Job History 复用现有 ResearchJob。锁用 Postgres advisory lock（跨进程/主机）。
import { Client } from "pg";
import { prisma } from "../prisma";

export type JobType = "INDUSTRY_DEEP" | "COMPANY_DEEP" | "DAILY" | "WEEKLY" | "TRIGGER" | "BENCHMARK";

export interface JobSpec {
  jobType: JobType;
  industryKey?: string;
  targetKey?: string;
  provider?: string;
  model?: string;
  maxAttempts?: number;      // 默认 3
  timeoutMs?: number;        // 单次 work 超时，默认 600s
  dryRun?: boolean;          // 只返回计划，不执行不落库
  idempotencyWindowH?: number; // 该窗口内已 SUCCESS 则跳过（默认 DAILY=20h，其它不校验除非指定）
  backoffMs?: number;        // 重试基础退避，默认 1000
}
export interface WorkResult { versionId?: string; tokenUsage?: unknown; estimatedCost?: number; }
export type JobStatus = "SUCCESS" | "FAILED" | "SKIPPED" | "DRY_RUN";
export interface JobRunReport {
  status: JobStatus; jobId?: string; skippedReason?: string; attempts?: number;
  durationMs?: number; versionId?: string; error?: string; lockKey: string; plan?: Record<string, unknown>;
}

const lockKeyFor = (s: JobSpec) => `research:${s.jobType}:${s.industryKey ?? s.targetKey ?? "global"}`;

// 分布式锁：专用单连接持有 advisory lock 全程（避免连接池导致 unlock 走到别的连接）。
async function withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<{ locked: boolean; result?: T }> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const r = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [key]);
    if (!r.rows[0]?.locked) return { locked: false };
    try { return { locked: true, result: await fn() }; }
    finally { await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]); }
  } finally { await client.end(); }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`job timeout ${ms}ms`)), ms))]);
}

// 幂等：窗口内已有同 jobType + 目标 的 SUCCESS Job → 跳过。复用 ResearchJob 现有列，不新增字段。
async function alreadySucceeded(spec: JobSpec): Promise<boolean> {
  const windowH = spec.idempotencyWindowH ?? (spec.jobType === "DAILY" ? 20 : 0);
  if (!windowH) return false;
  const since = new Date(Date.now() - windowH * 3600_000);
  const n = await prisma.researchJob.count({ where: { jobType: spec.jobType, status: "SUCCESS", ...(spec.industryKey ? { industryKey: spec.industryKey } : {}), ...(spec.targetKey ? { targetKey: spec.targetKey } : {}), finishedAt: { gte: since } } });
  return n > 0;
}

// 统一入口：所有研究任务经此运行。失败隔离——错误被捕获记录在 Job 上，返回而非抛出。
export async function runResearchJob(spec: JobSpec, work: (ctx: { attempt: number }) => Promise<WorkResult>): Promise<JobRunReport> {
  const lockKey = lockKeyFor(spec);
  const maxAttempts = spec.maxAttempts ?? 3;
  const timeoutMs = spec.timeoutMs ?? 600_000;
  const backoff = spec.backoffMs ?? 1000;

  if (spec.dryRun) {
    const idem = await alreadySucceeded(spec);
    return { status: "DRY_RUN", lockKey, plan: { jobType: spec.jobType, industryKey: spec.industryKey, targetKey: spec.targetKey, provider: spec.provider, model: spec.model, maxAttempts, timeoutMs, wouldSkipIdempotent: idem } };
  }
  if (await alreadySucceeded(spec)) return { status: "SKIPPED", lockKey, skippedReason: "idempotent(窗口内已成功)" };

  const outcome = await withAdvisoryLock(lockKey, async (): Promise<JobRunReport> => {
    const job = await prisma.researchJob.create({ data: { jobType: spec.jobType, industryKey: spec.industryKey, targetKey: spec.targetKey, provider: spec.provider, model: spec.model, status: "RUNNING", maxAttempts, attempt: 0, startedAt: new Date() } });
    const t0 = Date.now();
    let lastErr = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await prisma.researchJob.update({ where: { id: job.id }, data: { attempt, status: attempt > 1 ? "RETRYING" : "RUNNING" } });
      try {
        const res = await withTimeout(work({ attempt }), timeoutMs);
        const durationMs = Date.now() - t0;
        await prisma.researchJob.update({ where: { id: job.id }, data: { status: "SUCCESS", tokenUsage: (res.tokenUsage as object) ?? undefined, estimatedCost: res.estimatedCost, durationMs, versionId: res.versionId, finishedAt: new Date() } });
        return { status: "SUCCESS", jobId: job.id, attempts: attempt, durationMs, versionId: res.versionId, lockKey };
      } catch (e) {
        lastErr = (e as Error).message;
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, backoff * attempt));
      }
    }
    const durationMs = Date.now() - t0;
    await prisma.researchJob.update({ where: { id: job.id }, data: { status: "FAILED", error: lastErr, durationMs, finishedAt: new Date() } });
    return { status: "FAILED", jobId: job.id, attempts: maxAttempts, durationMs, error: lastErr, lockKey };
  });

  if (!outcome.locked) return { status: "SKIPPED", lockKey, skippedReason: "locked(另一实例正在运行同一任务)" };
  return outcome.result!;
}

// 批量失败隔离：逐任务独立运行，单个失败不影响其它。
export async function runResearchJobsIsolated(items: { spec: JobSpec; work: (ctx: { attempt: number }) => Promise<WorkResult> }[]): Promise<JobRunReport[]> {
  const settled = await Promise.allSettled(items.map((it) => runResearchJob(it.spec, it.work)));
  return settled.map((s, i) => (s.status === "fulfilled" ? s.value : { status: "FAILED" as JobStatus, lockKey: lockKeyFor(items[i].spec), error: String((s as PromiseRejectedResult).reason) }));
}
