// P26 Phase 4 · GET /api/admin/core-daily/statistics —— 只读，ADMIN_ONLY。
// 主源 CoreDailyHistory(source=HISTORY)；空则 CoreDailyValidation 只读聚合(source=DB_AGGREGATE)；
// 皆空则 NO_DATA(source=NONE)。绝不生成研究裁决，validationStatus 仅透传/NOT_AVAILABLE。
import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { getStatistics } from "@/lib/core-daily/read";
import { handleError, parseStr, DEFAULT_STRATEGY } from "@/lib/core-daily/api-http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const strategy = parseStr(sp.get("strategy")) ?? parseStr(sp.get("strategyId")) ?? DEFAULT_STRATEGY;
    const historyKey = parseStr(sp.get("historyKey"), 64);
    return NextResponse.json(await getStatistics(strategy, historyKey));
  } catch (e) {
    return handleError(e);
  }
}
