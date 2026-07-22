// P26 Phase 4 · GET /api/admin/core-daily/signals —— 只读，cursor 分页，ADMIN_ONLY。tradeDate 必填。
import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { listSignals } from "@/lib/core-daily/read";
import { handleError, ApiError, parseStr, parseDate, parseEnum, parseLimit, parseCursor } from "@/lib/core-daily/api-http";

export const dynamic = "force-dynamic";

const AS_OF = ["15:15", "15:23", "09:00"] as const;
const DECISION = ["SHADOW_BUY", "NO_SIGNAL", "AVOID"] as const;

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const tradeDate = parseDate(sp.get("tradeDate"));
    if (!tradeDate) throw new ApiError("INVALID_ARGUMENT", 400, "tradeDate (YYYY-MM-DD) is required");
    return NextResponse.json(
      await listSignals({
        strategyId: parseStr(sp.get("strategyId")),
        tradeDate,
        asOf: parseEnum(sp.get("asOf"), AS_OF),
        decision: parseEnum(sp.get("decision"), DECISION),
        symbol: parseStr(sp.get("symbol"), 12),
        runId: parseStr(sp.get("runId"), 64),
        cursor: parseCursor(sp.get("cursor")),
        limit: parseLimit(sp.get("limit")),
      }),
    );
  } catch (e) {
    return handleError(e);
  }
}
