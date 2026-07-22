// P26 Phase 4 · GET /api/admin/core-daily/runs —— 只读，cursor 分页，ADMIN_ONLY。
import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { listRuns } from "@/lib/core-daily/read";
import { handleError, parseStr, parseDate, parseEnum, parseLimit, parseCursor } from "@/lib/core-daily/api-http";

export const dynamic = "force-dynamic";

const AS_OF = ["15:15", "15:23", "09:00"] as const;
const RUN_STATUS = ["OK", "DATA_INSUFFICIENT", "ERROR"] as const;
const MARKET_SESSION = ["PRE_CLOSE", "CLOSE", "OPEN"] as const;

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    return NextResponse.json(
      await listRuns({
        strategyId: parseStr(sp.get("strategyId")),
        strategyVersion: parseStr(sp.get("strategyVersion")),
        tradeDate: parseDate(sp.get("tradeDate")),
        asOf: parseEnum(sp.get("asOf"), AS_OF),
        runStatus: parseEnum(sp.get("runStatus"), RUN_STATUS),
        marketSession: parseEnum(sp.get("marketSession"), MARKET_SESSION),
        cursor: parseCursor(sp.get("cursor")),
        limit: parseLimit(sp.get("limit")),
      }),
    );
  } catch (e) {
    return handleError(e);
  }
}
