// ── P22-S3 · Beta 访问鉴权（与 Admin 完全独立）───────────────────────────────
//
// ⚠️ 铁律：Beta ≠ Admin。本文件**不修改、不削弱** admin-auth 的任何逻辑。
//   · Beta 是一套独立的低权限凭证：只用于**白名单只读页面/接口**（见 beta-access.ts）
//   · Beta 凭证**永远无法**通过 guardAdminRoute —— 写操作、Shadow/Freeze/Calibration、
//     其它 /api/admin/* 仍然只认 admin_session / x-admin-token
//   · guardBetaOrAdmin 只用在白名单只读 GET 端点；它接受 (beta OR admin)，
//     admin 永远也能进（admin 权限是 beta 的超集）
//
// Cookie：beta_access = HMAC-SHA256(BETA_ACCESS_PASSWORD, "beta.v1.<exp>")
//   · 不含密码明文（泄露 Cookie ≠ 泄露密码）
//   · 30 天有效期签进 payload，客户端改期即验签失败
//   · httpOnly + Secure + SameSite=Lax + Path=/
//
// 运行环境：被 middleware 引用，必须 Edge 兼容 —— 只用 Web Crypto，不 import node:crypto。

import { constantTimeEqual } from "@/lib/admin-auth";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const BETA_SESSION_COOKIE = "beta_access";
export const BETA_TTL_SEC = 30 * 24 * 3600;

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

export function isBetaConfigured(): boolean {
  const p = process.env.BETA_ACCESS_PASSWORD;
  return typeof p === "string" && p.length > 0;
}

/** 校验用户提交的密码（常量时间比较）。 */
export function betaPasswordMatches(supplied: string): boolean {
  const expected = process.env.BETA_ACCESS_PASSWORD;
  if (!expected) return false;
  return constantTimeEqual(supplied, expected);
}

/** 签发 Beta 会话值（写入 httpOnly Cookie）。不含密码明文。 */
export async function issueBetaSession(nowSec: number = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const password = process.env.BETA_ACCESS_PASSWORD;
  if (!password) return null;
  const exp = nowSec + BETA_TTL_SEC;
  const payload = `beta.v1.${exp}`;
  return `${payload}.${await hmac(password, payload)}`;
}

async function betaSessionValid(value: string, nowSec: number): Promise<boolean> {
  const password = process.env.BETA_ACCESS_PASSWORD;
  if (!password) return false;
  const parts = value.split(".");
  // 形如 beta.v1.<exp>.<sig> → 4 段
  if (parts.length !== 4 || parts[0] !== "beta" || parts[1] !== "v1") return false;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp <= nowSec) return false;
  const expected = await hmac(password, `beta.v1.${parts[2]}`);
  return constantTimeEqual(parts[3], expected);
}

/** 仅校验 Beta 凭证（不含 admin）。用于 /api/beta/session 的状态查询。 */
export async function verifyBetaRequest(req: Request): Promise<boolean> {
  if (!process.env.BETA_ACCESS_PASSWORD) return false;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${BETA_SESSION_COOKIE}=([^;]+)`));
  if (!m) return false;
  return betaSessionValid(decodeURIComponent(m[1]), Math.floor(Date.now() / 1000));
}

/**
 * 判定「Beta 或 Admin」是否放行（白名单只读端点用）。
 * admin 是 beta 的超集 —— admin 凭证永远也能进。
 * 返回 true = 放行；false = 拒绝。
 */
export async function verifyBetaOrAdmin(req: Request): Promise<boolean> {
  if (await verifyBetaRequest(req)) return true;
  const verdict = await verifyAdminRequest(req);
  return verdict === "OK";
}

/**
 * Route 级守卫（白名单只读 GET 端点用）。**不替代 guardAdminRoute** ——
 * 后者继续保护所有写操作与非白名单 admin 端点。
 * 返回 null 放行；返回 Response 已拒绝，调用方原样 return。
 */
export async function guardBetaOrAdmin(req: Request): Promise<Response | null> {
  if (await verifyBetaOrAdmin(req)) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
