export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * News 同步 Admin API（P12-INFRA-03：已接线到 lib/ingest News Core）
 * ════════════════════════════════════════════════════════════════════════════
 * 本 Route 只负责入口职责：读取请求 / 参数转换 / 调用 Core / 映射回原有 Response。
 * 摄入编排（抓取・解析・去重・持久化・统计・错误结果）全部在 lib/ingest/news-core.ts。
 *
 * 🔒 外部可观察行为与 e1c6f60 完全一致（内部实现不同，结果不得变）：
 *   · GET / POST 的 JSON 字段、HTTP 状态、错误文案一致
 *   · SyncJob 状态流转一致；POST 立即返回 jobId，同步在后台异步执行
 *     （nginx 60s 超时下必须保留 jobId + 轮询语义，不得改成同步返回）
 *   · **SyncLog.durationMs 继续保持既有行为（恒为 null）** —— 由 NEWS_PROFILE_API 承载。
 *     这是已知缺陷，本任务**只保留不修复**（归属 P12-INFRA-06）。
 *
 * 接线范围仅此一处。scripts/sync-news.ts（cron 关键链）仍用原实现，
 * 待 P12-INFRA-04 且本任务观察期结束后再切。
 *
 * 鉴权：原实现无鉴权（Admin 区无 auth 中间件）→ 本次**未新增也未移除**，保持一致。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CONSOLE_LOGGER,
  DEFAULT_NEWS_FETCHERS,
  NEWS_PROFILE_API,
  SYSTEM_CLOCK,
  autoFailStaleJob,
  createNewsJob,
  findRunningJob,
  isStale,
  runNewsSync,
  selectNewsSymbols,
} from "@/lib/ingest";

const deps = { prisma, logger: CONSOLE_LOGGER, clock: SYSTEM_CLOCK };

export async function GET() {
  const runningJob = await findRunningJob(deps);

  const [lastSync, newsCount, stockSpecific, highImportance] = await Promise.all([
    prisma.syncLog.findFirst({
      where: { source: "news" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.news.count(),
    prisma.news.count({ where: { relatedSymbolConfidence: { gte: 70 } } }),
    prisma.news.count({ where: { importance: { gte: 7 } } }),
  ]);

  return NextResponse.json({
    configured: true,
    runningJob: runningJob
      ? { jobId: runningJob.id, processed: runningJob.processed, total: runningJob.total }
      : null,
    lastSync,
    newsCount,
    stockSpecificCount: stockSpecific,
    marketCount: newsCount - stockSpecific,
    highImportanceCount: highImportance,
  });
}

export async function POST() {
  const existingJob = await findRunningJob(deps);

  let staleAutoFailed = false;

  if (existingJob) {
    const ageMs = Date.now() - existingJob.createdAt.getTime();
    if (!isStale(existingJob, Date.now())) {
      return NextResponse.json({
        success: true,
        skipped: true,
        jobId: existingJob.id,
        status: existingJob.status,
        message: "已有正在运行的新闻同步任务",
        total: existingJob.total,
        processed: existingJob.processed,
      });
    }
    // Stale job (>2h) — auto-fail and allow new job
    await autoFailStaleJob(deps, existingJob);
    console.warn(`[news] stale job ${existingJob.id} auto-failed (age: ${Math.round(ageMs / 60000)}min)`);
    staleAutoFailed = true;
  }

  const symbols = await selectNewsSymbols(deps);
  const job = await createNewsJob(deps, symbols.length);

  // 火后不管：立即返回 jobId，由前端轮询 /api/sync/jobs/[jobId]（与原实现一致）
  void runNewsSync(deps, DEFAULT_NEWS_FETCHERS, NEWS_PROFILE_API, job.id, symbols, Date.now());

  return NextResponse.json({
    success: true,
    staleAutoFailed,
    jobId: job.id,
    status: "RUNNING",
    message: `新闻同步任务已开始，共 ${symbols.length} 只股票`,
    total: symbols.length,
    processed: 0,
    syncedAt: new Date().toISOString(),
  });
}
