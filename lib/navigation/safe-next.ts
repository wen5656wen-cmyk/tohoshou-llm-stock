// ── 登录后返回地址校验（P21-P0-Boss）─────────────────────────────────────────
//
// `?next=` 完全来自 URL，属不可信输入。若原样交给 router.replace()，
// 攻击者可构造 /admin/login?next=https://evil.com —— 用户在**我们的域名**上输入
// ADMIN_TOKEN，登录成功后被送去钓鱼站。这就是开放重定向。
//
// 因此只接受**站内相对路径**，其余一律静默回退默认页：不报错、不跳转，
// 攻击者拿不到跳转，正常用户也不会卡住。

export const DEFAULT_NEXT = "/admin/mission-control";

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  // 必须以单个 / 开头：排除 https://evil.com、evil.com、javascript:...
  if (!raw.startsWith("/")) return DEFAULT_NEXT;
  // "//evil.com" 与 "/\evil.com" 浏览器都解析为站外地址
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_NEXT;
  // "/javascript:alert(1)" 之类的带协议片段
  if (/^\/\s*[a-z][a-z0-9+.-]*:/i.test(raw)) return DEFAULT_NEXT;
  return raw;
}
