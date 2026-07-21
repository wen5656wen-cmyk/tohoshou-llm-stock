// ── P21-S1 · 生产 API 鉴权中间件（R0 修复的核心）─────────────────────────────
//
// 为什么必须用 middleware 而不是逐 route 加守卫：
//   `/api/sync/*` 的 7 个写端点签名是 `export async function POST()` —— **不接收
//   request 参数**，结构上连读取 token 头的能力都没有；而函数体第一行就是
//   spawn(compute-scores) / prisma 写入。middleware 在 handler 执行**之前**运行，
//   是唯一能在副作用之前拦截、且无需改动这些 handler 签名的位置。
//
// 覆盖：/api/admin/* 与 /api/sync/* 的**全部方法**（GET/POST/PUT/PATCH/DELETE）。
// 例外：/api/admin/session —— 登录端点本身，否则永远无法换取会话。
//
// fail-closed：未配置 ADMIN_TOKEN → 503 ADMIN_TOKEN_NOT_CONFIGURED，绝不放行。

import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const config = {
  matcher: ["/api/admin/:path*", "/api/sync/:path*"],
};

const SESSION_PATH = "/api/admin/session";

export async function middleware(req: NextRequest) {
  // 登录端点自身必须豁免（它负责校验 token 并签发会话）
  if (req.nextUrl.pathname === SESSION_PATH) return NextResponse.next();

  const verdict = await verifyAdminRequest(req);

  if (verdict === "UNCONFIGURED") {
    // 配置错误 ≠ 放行。宁可整个管理面不可用，也不对公网敞开。
    return NextResponse.json(
      { error: "ADMIN_TOKEN_NOT_CONFIGURED", message: "Server misconfiguration: admin auth is not configured." },
      { status: 503 }
    );
  }

  if (verdict === "DENIED") {
    // ⚠️ 不回显收到的 token、不区分「无凭证」与「凭证错误」，避免探测。
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}
