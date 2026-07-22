// P26 Phase 4 · GET /api/admin/core-daily/latest —— 只读，ADMIN_ONLY。
import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { getLatestView } from "@/lib/core-daily/read";
import { handleError, parseStr, DEFAULT_STRATEGY } from "@/lib/core-daily/api-http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const strategy = parseStr(sp.get("strategy")) ?? DEFAULT_STRATEGY;
    return NextResponse.json(await getLatestView(strategy));
  } catch (e) {
    return handleError(e);
  }
}
