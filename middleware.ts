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
import { verifyBetaOrAdmin } from "@/lib/beta-auth";
import { isBetaReadable } from "@/lib/beta-access";

// ── P21-P0-API-G1 · 紧急封闭（个人资产读写）─────────────────────────────────
//
// S1 封闭的是**管理面**（/api/admin、/api/sync）。但资产数据从来不在管理面下 ——
// P21-P0-API 审计实测：/api/holdings 未登录返回真实持仓 6 只（shares/avgCost/
// unrealizedPnl/cash/equity），/api/mission-lab 返回 8 个仓位 + NAV + 当日成交价，
// 且 14 个写接口（buy/sell/delete/watchlist…）零鉴权 —— 任何人可改你的持仓。
// 那比 S1 修掉的洞更严重，因为它**可写**。
//
// 分类说明（本轮技术凭证相同，逻辑等级不同，后续拆分）：
//   ADMIN_ONLY     /api/admin  /api/sync                    运维
//   AUTHENTICATED  以下全部                                  账户主人
//
// ⚠️ 有意**不**纳入的公开接口，改前逐一确认过：
//   · /api/mission-lab/quotes —— 纯 Yahoo 行情，无账户字段（故只匹配
//     "/api/mission-lab" 精确路径，不用 :path*）
//   · /api/stocks/*、/api/prices/*、/api/news 等 —— 公开市场数据，
//     仅其中的写端点 /api/stocks/:symbol/analysis 单独纳入
export const config = {
  matcher: [
    // ADMIN_ONLY
    "/api/admin/:path*",
    "/api/sync/:path*",
    // AUTHENTICATED —— 个人资产 / 决策数据（父路径与子路径都要写，
    // ":path*" 不匹配父路径本身）
    "/api/holdings",
    "/api/holdings/:path*",
    "/api/mission-lab",            // 注意：不含 /quotes（纯行情，保持公开）
    "/api/decision/:path*",
    "/api/portfolio",
    "/api/portfolio/:path*",
    "/api/sim-portfolio",
    "/api/sim-portfolio/:path*",
    "/api/watchlist",
    "/api/watchlist/:path*",
    "/api/explain/:path*",
    "/api/stocks/:symbol/analysis", // 写端点；其余 /api/stocks/* 保持公开

    // ── P21-P0-API-G2 · ADMIN_ONLY（内部研究 / 实验 / 回测 / 系统状态）──────
    // 内部评分实验、Shadow/Freeze/Calibration、融合模型、Alpha 分析与回测、
    // 研究资料与 Review、系统健康、内部策略业绩 —— 既非公开市场数据，
    // 也非 Boss 决策读取。封闭前均为未登录 200。
    "/api/scoring-v3/:path*",
    "/api/fusion/:path*",
    "/api/alpha",
    "/api/alpha/:path*",
    "/api/backtest/:path*",
    "/api/strategy/:path*",
    "/api/health/status",
    // ⚠️ 只锁 research 的这两个，不用 "/api/research/:path*" —— 该前缀下还有
    //    company / industry / calendar / graph / industries / version 等公司与
    //    行业资料，本轮裁定未覆盖，不擅自扩大范围。
    "/api/research/library",
    "/api/research/review",
  ],
};

const SESSION_PATH = "/api/admin/session";
const BETA_SESSION_PATH = "/api/beta/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 登录端点自身必须豁免（它们负责校验凭证并签发会话）
  if (pathname === SESSION_PATH || pathname === BETA_SESSION_PATH) return NextResponse.next();

  // ── P22-S3 · Beta 只读白名单放宽 ──────────────────────────────────────────
  // 白名单内的**只读 GET**：接受 (Beta 或 Admin)。Beta ≠ Admin，且此放宽**仅限
  // GET** —— 同路径的写方法、以及白名单外的一切，下面仍走 admin-only 判定，
  // 权限一分未降。research/review 的 GET 在此放行、POST 落到 admin-only，正是靠这里。
  if (isBetaReadable(pathname, req.method)) {
    if (await verifyBetaOrAdmin(req)) return NextResponse.next();
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
