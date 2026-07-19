// ── P18-M1-H1 · Mission Health Guard API（只读）──────────────────────────────
import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { runMissionHealth } from "@/lib/mission-lab/health";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const health = await runMissionHealth();
    return NextResponse.json(health);
  } catch (e) {
    return NextResponse.json({ status: "CRITICAL", error: (e as Error).message, checks: [] }, { status: 500 });
  }
}
