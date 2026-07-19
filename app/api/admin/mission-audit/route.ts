// ── P18-M1-H2 · Mission Audit API（只读回放 + 健康）───────────────────────────
import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { buildAuditTimeline } from "@/lib/mission-lab/audit";
import { runMissionHealth } from "@/lib/mission-lab/health";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [timeline, health] = await Promise.all([buildAuditTimeline(200), runMissionHealth()]);
    return NextResponse.json({ health, timeline, asOf: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, timeline: [], health: null }, { status: 500 });
  }
}
