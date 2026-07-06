import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/watchlist/daily/[id]
 * body: { status?, isStarred?, isMuted?, isFocus?, note? }
 *
 * User actions on a single dated pool row: 取消关注 / 恢复关注 / 加星 / 重点观察 /
 * 备注. Only affects THIS row (this date) — history is never deleted. Never
 * touches AI snapshot fields (entryPrice/score/rank/recommendation) or scoring.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rowId = Number(id);
  if (!Number.isInteger(rowId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.isStarred === "boolean") data.isStarred = body.isStarred;
  if (typeof body.isFocus === "boolean") data.isFocus = body.isFocus;
  if (typeof body.isMuted === "boolean") {
    data.isMuted = body.isMuted;
    // keep status coherent with mute: 取消关注 → MUTED, 恢复关注 → ACTIVE
    data.status = body.isMuted ? "MUTED" : "ACTIVE";
  }
  if (typeof body.status === "string" && (body.status === "ACTIVE" || body.status === "MUTED")) {
    data.status = body.status;
    data.isMuted = body.status === "MUTED";
  }
  if ("note" in body) {
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
    data.note = note && note.length > 0 ? note : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  try {
    const updated = await prisma.dailyAIWatchlist.update({ where: { id: rowId }, data });
    return NextResponse.json({ ok: true, item: updated });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
