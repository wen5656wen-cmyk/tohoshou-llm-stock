# Deep Research · 统一调度基础设施（P17 Track 1）

> 唯一 Scheduler（`lib/research/scheduler.ts`），统一供 **Benchmark / Daily / Weekly / Trigger**——禁重复实现。
> Job History 复用现有 `ResearchJob`，**不新增数据结构**。

## 1. Scheduler 架构

```mermaid
flowchart LR
  subgraph Callers["调用方（统一入口 runResearchJob）"]
    B[Benchmark]:::c
    D[Daily]:::c
    W[Weekly]:::c
    T[Trigger]:::c
  end
  B & D & W & T --> RJ["runResearchJob(spec, work)"]
  RJ --> DR{dryRun?}
  DR -- yes --> PLAN["返回计划(不落库)"]
  DR -- no --> IDEM{幂等窗口内已 SUCCESS?}
  IDEM -- yes --> SKIP1["SKIPPED: idempotent"]
  IDEM -- no --> LOCK["pg advisory lock\n(专用连接持有全程)"]
  LOCK -- 未取得 --> SKIP2["SKIPPED: locked(另一实例运行中)"]
  LOCK -- 取得 --> JOB["ResearchJob: RUNNING"]
  JOB --> RETRY["Retry 循环 ≤ maxAttempts\n每次 withTimeout(work)"]
  RETRY -- 成功 --> OK["Job SUCCESS\n+token/cost/duration/versionId"]
  RETRY -- 全部失败 --> FAIL["Job FAILED + error\n(失败隔离:记录不抛出)"]
  classDef c fill:#EAF3FF,stroke:#007AFF;
```

**能力**：分布式锁(pg advisory，跨进程/主机) · Retry(退避) · Timeout(单次 work) · 幂等(窗口内已成功则跳过) · dry-run(仅计划) · Job History(ResearchJob) · 失败隔离(错误记录在 Job，不抛出；批量用 `runResearchJobsIsolated`)。

## 2. Job 生命周期流程

```mermaid
stateDiagram-v2
  [*] --> PENDING: create
  PENDING --> RUNNING: attempt 1（持锁）
  RUNNING --> RETRYING: work 失败且 attempt<max（退避）
  RETRYING --> RUNNING: 下次 attempt
  RUNNING --> SUCCESS: work 成功 → versionId/token/cost/duration
  RETRYING --> FAILED: 达 maxAttempts → error
  RUNNING --> FAILED: timeout / 达 maxAttempts
  SUCCESS --> [*]
  FAILED --> [*]
```

`ResearchJob` 字段映射：`status`(PENDING/RUNNING/RETRYING/SUCCESS/FAILED) · `attempt`/`maxAttempts` · `provider`/`model` · `tokenUsage`/`estimatedCost`/`durationMs` · `error` · `versionId` · `startedAt`/`finishedAt`。

## 3. 分布式锁（无新表）

Postgres advisory lock：`pg_try_advisory_lock(hashtextextended(key,0))`，key=`research:{jobType}:{industryKey|targetKey|global}`。
专用单 `pg.Client` 连接持有锁**全程**（避免连接池导致 unlock 走到别的连接），结束 `pg_advisory_unlock` 并关闭连接。

## 4. 统一用法（Phase 5 / Daily / Weekly / Trigger / Benchmark 共用）

```ts
import { runResearchJob } from "@/lib/research/scheduler";
import { getResearchProvider } from "@/lib/research/providers";

await runResearchJob(
  { jobType: "INDUSTRY_DEEP", industryKey: "AI_HBM", provider: "anthropic", model: process.env.RESEARCH_STRONG_MODEL, maxAttempts: 3, timeoutMs: 600_000 },
  async () => {
    const prov = getResearchProvider({ role: "strong" });
    const r = await prov.run("AI_HBM");
    // …engine 落库(AI_RESEARCHED，待人审)… 返回用量供 Job History
    return { tokenUsage: { total: r.usage.totalTokens }, estimatedCost: r.usage.estimatedCost, versionId: undefined };
  }
);
```

`dryRun: true` → 只返回计划（含是否会被幂等跳过），不落库、不执行；Dashboard「System Health」读 ResearchJob 各 jobType 最近状态 + Queue 深度 + Scheduler(pg_advisory) 可用性。
