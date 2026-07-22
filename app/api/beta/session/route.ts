// ── P22-S3 · Beta 会话端点（与 admin/session 独立）──────────────────────────
// POST   { password } → 校验 BETA_ACCESS_PASSWORD → 写 httpOnly beta_access Cookie
// DELETE               → 退出 Beta，清 Cookie
// GET                  → 只回报「当前是否有 Beta/Admin 访问权」，绝不回显密码
//
// ⚠️ 本路由被 middleware 豁免（否则无法登录 Beta）。校验逻辑复用 lib/beta-auth
//    的常量时间比较，不另写一套；不修改 admin 侧任何逻辑。

import { NextResponse } from "next/server";
import {
  BETA_SESSION_COOKIE, BETA_TTL_SEC,
  betaPasswordMatches, issueBetaSession, isBetaConfigured, verifyBetaRequest,
} from "@/lib/beta-auth";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // via 区分凭证来源：admin 是超集，永远可进；退出按钮仅对 beta 会话显示。
  const beta = await verifyBetaRequest(req);
  const admin = !beta && (await verifyAdminRequest(req)) === "OK";
  return NextResponse.json({
    authenticated: beta || admin,
    via: beta ? "beta" : admin ? "admin" : null,
    configured: isBetaConfigured(),
  });
}

export async function POST(req: Request) {
  if (!isBetaConfigured()) {
    return NextResponse.json({ error: "BETA_ACCESS_NOT_CONFIGURED" }, { status: 503 });
  }
  let body: { password?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const supplied = typeof body.password === "string" ? body.password : "";
  if (!supplied || !betaPasswordMatches(supplied)) {
    // 不记录、不回显收到的值
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const value = await issueBetaSession();
  if (!value) return NextResponse.json({ error: "BETA_ACCESS_NOT_CONFIGURED" }, { status: 503 });
  const res = NextResponse.json({ authenticated: true });
  res.cookies.set(BETA_SESSION_COOKIE, value, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: BETA_TTL_SEC,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ authenticated: false });
  res.cookies.set(BETA_SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
