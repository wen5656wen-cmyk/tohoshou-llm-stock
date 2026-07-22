// P26 Phase 4 · GET /api/admin/core-daily/run/:runId —— 只读，ADMIN_ONLY。runId 不存在→404。
import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { getRunDetail } from "@/lib/core-daily/read";
import { handleError, ApiError } from "@/lib/core-daily/api-http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  try {
    const { runId } = await params; // Next 16：params 必须 await
    if (!runId || runId.length > 64) throw new ApiError("INVALID_ARGUMENT", 400, "invalid runId");
    return NextResponse.json(await getRunDetail(runId));
  } catch (e) {
    return handleError(e);
  }
}
