// ── P18-M1-H1 · Mission Health Guard API（只读）──────────────────────────────
import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { runMissionHealth } from "@/lib/mission-lab/health";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  try {
    const health = await runMissionHealth();
    return NextResponse.json(health);
  } catch (e) {
    return NextResponse.json({ status: "CRITICAL", error: (e as Error).message, checks: [] }, { status: 500 });
  }
}
