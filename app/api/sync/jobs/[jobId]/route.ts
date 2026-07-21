export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  // P21-S2 纵深防御：middleware 之外的第二道闸门，必须先于任何副作用。
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  const { jobId } = await params;

  if (!jobId) {
    return NextResponse.json({ success: false, error: "jobId 必填" }, { status: 400 });
  }

  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });

  if (!job) {
    return NextResponse.json({ success: false, error: "任务不存在" }, { status: 404 });
  }

  const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;

  return NextResponse.json({
    jobId: job.id,
    source: job.source,
    status: job.status,
    total: job.total,
    processed: job.processed,
    successCount: job.successCount,
    failedCount: job.failedCount,
    errorMessage: job.errorMessage,
    pct,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
  });
}
