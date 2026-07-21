// ── P21-S1 · 管理会话端点（浏览器换取 httpOnly Cookie）───────────────────────
// POST   { token } → 校验后写入 httpOnly Cookie（Cookie 内不含 token 明文）
// DELETE            → 登出，清除 Cookie
// GET               → 只回报「当前是否已登录」，绝不回显 token
//
// ⚠️ 本路由被 middleware 豁免（否则无法登录）。因此它必须自己完成校验，
//    且校验逻辑复用 lib/admin-auth 的常量时间比较，不另写一套。

import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE, SESSION_TTL_SEC,
  constantTimeEqual, issueSession, isAdminConfigured, verifyAdminRequest,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "ADMIN_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }
  const verdict = await verifyAdminRequest(req);
  return NextResponse.json({ authenticated: verdict === "OK" });
}

export async function POST(req: Request) {
  // fail-closed：未配置密钥时不允许任何人登录
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "ADMIN_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const supplied = typeof body.token === "string" ? body.token : "";
  const expected = process.env.ADMIN_TOKEN as string;
  if (!supplied || !constantTimeEqual(supplied, expected)) {
    // ⚠️ 不记录、不回显收到的值
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const value = await issueSession();
  if (!value) return NextResponse.json({ error: "ADMIN_TOKEN_NOT_CONFIGURED" }, { status: 503 });

  const res = NextResponse.json({ authenticated: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, value, {
    httpOnly: true,          // JS 读不到 → XSS 也偷不走
    secure: true,            // 仅 HTTPS
    sameSite: "lax",         // 阻断跨站 CSRF 触发写接口
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ authenticated: false });
  res.cookies.set(ADMIN_SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
