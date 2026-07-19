// ── 共享管理员守卫（沿用 app/api/admin/* 既有约定）──────────────────────────
// 未设 ADMIN_TOKEN → 放行（信任环境/单用户）；已设 → 校验 x-admin-token 头或 ?token 查询。
// 用于 Deep Research 写操作(Review) 与敏感运营读(Dashboard)。绝不返回/记录 token。
export function checkAdminAuth(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return true;
  const header = req.headers.get("x-admin-token") ?? "";
  let query = "";
  try { query = new URL(req.url).searchParams.get("token") ?? ""; } catch { /* noop */ }
  return header === token || query === token;
}
