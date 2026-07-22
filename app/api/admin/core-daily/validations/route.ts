// P26 Phase 4 · GET /api/admin/core-daily/validations —— 只读，cursor 分页，ADMIN_ONLY。
// 含毛/净/滑点/成交九态/失败原因；**不隐藏失败交易**。tradeDate 必填。
import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { listValidations } from "@/lib/core-daily/read";
import { handleError, ApiError, parseStr, parseDate, parseEnum, parseLimit, parseCursor } from "@/lib/core-daily/api-http";

export const dynamic = "force-dynamic";

const FILL_STATE = [
  "FILLED_FULL", "FILLED_PARTIAL", "NOT_FILLED_NO_CLOSE", "NOT_FILLED_LIMIT_EVENT",
  "NOT_FILLED_SPECIAL_QUOTE", "NOT_FILLED_BROKER_REJECT", "NOT_FILLED_ORDER_LATE",
  "NOT_FILLED_NO_LIQUIDITY", "FILL_UNCERTAIN",
] as const;

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const tradeDate = parseDate(sp.get("tradeDate"));
    if (!tradeDate) throw new ApiError("INVALID_ARGUMENT", 400, "tradeDate (YYYY-MM-DD) is required");
    return NextResponse.json(
      await listValidations({
        strategyId: parseStr(sp.get("strategyId")),
        tradeDate,
        symbol: parseStr(sp.get("symbol"), 12),
        fillState: parseEnum(sp.get("fillState"), FILL_STATE),
        cursor: parseCursor(sp.get("cursor")),
        limit: parseLimit(sp.get("limit")),
      }),
    );
  } catch (e) {
    return handleError(e);
  }
}
