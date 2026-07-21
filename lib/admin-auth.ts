// ── 全站唯一管理员守卫（P21-S1 · fail-closed）────────────────────────────────
//
// ⚠️ 本文件是**唯一**的鉴权实现。禁止任何 route 自己再写一套 token 判断、
//    自己定义 header 名、或自己拼 401 —— 重复实现正是 R0 能长期存在的原因。
//
// R0 根因（已由 P21-S0 实测确认）：旧实现为
//     const token = process.env.ADMIN_TOKEN;
//     if (!token) return true;          // ← 未配置即放行
//   生产 .env 从未配置 ADMIN_TOKEN，于是全部 /api/admin/* 与 /api/sync/* 对公网敞开。
//   **fail-open 已改为 fail-closed：未配置 = 配置错误 = 503，绝不放行。**
//
// 两条合法凭证（都不把密钥暴露到浏览器）：
//   1. `x-admin-token` 头 —— 服务端内部调用 / cron / scripts 用，token 只存在于服务器环境
//   2. `admin_session` httpOnly Cookie —— 浏览器管理页用；**Cookie 内不含 token 本身**，
//      而是 HMAC-SHA256(key=ADMIN_TOKEN, msg="v1.<exp>")，泄露 Cookie ≠ 泄露密钥
//
// 运行环境：本模块被 middleware 引用，必须 **Edge 兼容** —— 只用 Web Crypto，
//   不得 import node:crypto。

export const ADMIN_TOKEN_HEADER = "x-admin-token";
export const ADMIN_SESSION_COOKIE = "admin_session";
export const SESSION_TTL_SEC = 7 * 24 * 3600;

export type AuthVerdict = "OK" | "UNCONFIGURED" | "DENIED";

/** 常量时间比较，避免按字符提前返回泄露前缀信息。 */
export function constantTimeEqual(a: string, b: string): boolean {
  // 长度不同也跑满循环，避免用耗时区分「长度错」与「内容错」
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

export function isAdminConfigured(): boolean {
  const t = process.env.ADMIN_TOKEN;
  return typeof t === "string" && t.length >= 32;
}

/** 签发会话值（供 /api/admin/session 写入 httpOnly Cookie）。不含 token 明文。 */
export async function issueSession(nowSec: number = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return null;
  const exp = nowSec + SESSION_TTL_SEC;
  const payload = `v1.${exp}`;
  return `${payload}.${await hmac(token, payload)}`;
}

async function sessionValid(value: string, nowSec: number): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp <= nowSec) return false;
  const expected = await hmac(token, `v1.${parts[1]}`);
  return constantTimeEqual(parts[2], expected);
}

/**
 * 受保护请求的唯一判定入口。
 * 返回 UNCONFIGURED 时调用方必须返回 503（配置错误），**不得放行**。
 *
 * ⚠️ 只认 header 与 Cookie。**不接受 ?token= 查询参数** —— URL 会进 access log、
 *    Referer 与浏览器历史，旧实现支持它本身就是泄露面，P21-S1 一并移除。
 */
export async function verifyAdminRequest(req: Request): Promise<AuthVerdict> {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return "UNCONFIGURED";

  const header = req.headers.get(ADMIN_TOKEN_HEADER);
  if (header && constantTimeEqual(header, token)) return "OK";

  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_SESSION_COOKIE}=([^;]+)`));
  if (m && (await sessionValid(decodeURIComponent(m[1]), Math.floor(Date.now() / 1000)))) return "OK";

  return "DENIED";
}

/**
 * Route 级守卫（P21-S2 · 纵深防御）。
 *
 * middleware 已覆盖 /api/admin/* 与 /api/sync/*，但那是**单点依赖**：matcher 配错、
 * middleware 被删、或 handler 被内部直接调用，保护就消失。故每个受保护 handler
 * 的第一行必须再调用本函数 —— 双保险，任一层都能独立拒绝。
 *
 * 用法（必须是函数体第一行，先于 body 解析 / spawn / exec / prisma / fs）：
 *   const denied = await guardAdminRoute(req);
 *   if (denied) return denied;
 *
 * 返回 null 表示放行；返回 Response 表示已拒绝，调用方必须原样 return。
 */
export async function guardAdminRoute(req: Request): Promise<Response | null> {
  const verdict = await verifyAdminRequest(req);
  if (verdict === "UNCONFIGURED") {
    return Response.json(
      { error: "ADMIN_TOKEN_NOT_CONFIGURED", message: "Server misconfiguration: admin auth is not configured." },
      { status: 503 }
    );
  }
  if (verdict === "DENIED") return Response.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

/**
 * 兼容旧调用点（app/api/research/* 等）的同步包装。
 * ⚠️ 仅支持 header 凭证；浏览器会话由 middleware 统一处理，故此处不做 Cookie 校验。
 * 与旧版行为的**唯一差别**：未配置 ADMIN_TOKEN 时返回 false（fail-closed）。
 */
export function checkAdminAuth(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false; // ← 旧版此处 return true，即 R0 根因
  const header = req.headers.get(ADMIN_TOKEN_HEADER);
  return !!header && constantTimeEqual(header, token);
}
