// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDailyWatchlist } from "@/lib/daily-watchlist/generate";
import { guardAdminRoute } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/watchlist/daily/generate   body: { date?: "YYYY-MM-DD" }
 * Manually (re)generate the day's AI watchlist pool from DailyRecommendation.
 * Idempotent upsert — entryPrice & user flags are preserved on re-run.
 * Read-only vs scoring/recommendation (pure derived snapshot).
 */
export async function POST(req: NextRequest) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

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
