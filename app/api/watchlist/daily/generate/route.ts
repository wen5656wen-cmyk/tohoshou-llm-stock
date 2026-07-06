import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDailyWatchlist } from "@/lib/daily-watchlist/generate";

export const dynamic = "force-dynamic";

/**
 * POST /api/watchlist/daily/generate   body: { date?: "YYYY-MM-DD" }
 * Manually (re)generate the day's AI watchlist pool from DailyRecommendation.
 * Idempotent upsert — entryPrice & user flags are preserved on re-run.
 * Read-only vs scoring/recommendation (pure derived snapshot).
 */
export async function POST(req: NextRequest) {
  let dateISO: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.date === "string") dateISO = body.date;
  } catch {
    /* no body → default to today */
  }
  try {
    const res = await generateDailyWatchlist(prisma, dateISO);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "generate failed" },
      { status: 500 },
    );
  }
}
