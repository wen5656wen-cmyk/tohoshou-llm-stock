export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * P12-INFRA-02：编排逻辑已提取到 lib/ingest/news.ts（与 scripts/sync-news.ts 共享）。
 * 本文件只负责 API 入口特有的部分：lib/prisma 单例、GET 状态查询、
 * POST 返回 jobId 后台异步执行（nginx 60s 超时下必须保留 jobId/轮询语义）。
 * **行为与重构前逐字一致** —— 含 SyncLog.durationMs=null 这一既有缺陷（见 lib/ingest/types.ts）。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  autoFailStaleJob,
  createNewsJob,
  findRunningJob,
  isStale,
  runNewsSync,
  selectNewsSymbols,
} from "@/lib/ingest";

const deps = { prisma };

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
    if (!isStale(existingJob)) {
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

  void runNewsSync(deps, job.id, symbols, {
    logPrefix: "[news]",
    fatalLabel: "background sync fatal error:",
    startMs: null, // 既有行为：API 侧 SyncLog.durationMs 恒为 null
    logDone: false,
  });

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
