// ── P22-S3 · Beta 只读白名单（单一来源）─────────────────────────────────────
//
// 这是「哪些接口 Beta 可读」的**唯一定义**。middleware 与各 route 都引用它，
// 避免两处分叉导致某端点在一层放宽、另一层收紧。
//
// ⚠️ 严格边界：
//   · 只列**只读研究数据**端点；写操作、Shadow/Freeze/Calibration、其它 admin
//     一律**不在此表** —— 它们保持 ADMIN_ONLY，Beta 永远 401。
//   · 白名单仅对 **GET** 生效。同一路径的 POST/PATCH/DELETE 不受影响，仍只 admin。
//     （research/review 的 GET 开放、POST 仍 admin，正是靠这一条。）

/** 精确路径匹配集（无参数端点）。 */
const EXACT = new Set<string>([
  "/api/alpha",
  "/api/fusion/paper",
  "/api/fusion/report",
  "/api/strategy/validation",
  "/api/strategy/overview", // Strategy Validation 页面框架必需的只读概览
  "/api/research/library",
  "/api/research/review",
  "/api/admin/ai-quality",
  "/api/admin/production-monitor",
]);

/** 前缀匹配（含动态子路由，如 /api/alpha/backtest、/api/alpha/7203.T）。 */
const PREFIX = [
  "/api/alpha/", // alpha/backtest, alpha/score, alpha/report, alpha/[symbol]
];

/**
 * 该请求是否属于 Beta 可读白名单。
 * **只对 GET 放行** —— 写方法一律返回 false（交回 admin only 路径处理）。
 */
export function isBetaReadable(pathname: string, method: string): boolean {
  if (method !== "GET") return false;
  if (EXACT.has(pathname)) return true;
  return PREFIX.some((p) => pathname.startsWith(p));
}
