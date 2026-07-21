// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
import { NextRequest, NextResponse } from "next/server";
import { runDailyReview } from "@/lib/trading/daily-review";
import { guardAdminRoute } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */

// POST /api/holdings/review — AI 每日跟踪：全量/单只重算持仓动作，动作变化则追加 Decision Timeline。
// 参数（body 或 query）：reviewAll=true（默认）/ reviewSymbol=XXXX / dryRun=true。
// 按需触发；同一逻辑亦由收盘 Cron 步骤（scripts/daily-holding-review.ts）调用。单一来源 = deriveHoldingAction。
function truthy(v: unknown): boolean {
  return v === true || v === "true" || v === "1" || v === 1;
}

export async function POST(req: NextRequest) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  try {
    const url = req.nextUrl;
    let body: any = {};
    try { body = await req.json(); } catch { /* 无 body 允许 */ }
    const reviewSymbol = (body.reviewSymbol ?? url.searchParams.get("reviewSymbol") ?? undefined) || undefined;
    const dryRun = truthy(body.dryRun) || truthy(url.searchParams.get("dryRun"));
    const summary = await runDailyReview({ reviewAll: true, reviewSymbol: reviewSymbol ? String(reviewSymbol) : undefined, dryRun });
    return NextResponse.json(summary);
  } catch (e: any) {
    console.error("[holdings review]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
