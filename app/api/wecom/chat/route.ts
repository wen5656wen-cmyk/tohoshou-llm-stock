/**
 * POST /api/wecom/chat
 * 企业微信智能机器人实时问答接口（v11.2）
 *
 * Auth：Authorization: Bearer <CHAT_API_TOKEN>
 *   - 若 CHAT_API_TOKEN 未配置，生产环境打 WARNING，开发环境允许访问
 *
 * Request body（支持 query / message / text 三种字段）：
 *   { "query": "7203能买吗" }
 *   { "message": "今日推荐" }
 *   { "text": "STRONG BUY" }
 *
 * Response：
 *   { ok: true, type: "stock"|"recommendations"|"strong_buy"|"backtest"|"help", text: string, data?: unknown }
 *   { ok: false, text: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { handleWecomQuery } from "@/lib/wecom-chat";

export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): { pass: boolean; status?: number; msg?: string } {
  const token = process.env.CHAT_API_TOKEN;

  if (!token) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[wecom/chat] ⚠️ CHAT_API_TOKEN 未配置 — 生产环境任何请求均可访问此接口，请尽快设置"
      );
    }
    return { pass: true };
  }

  const auth = req.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${token}`) {
    return { pass: false, status: 401, msg: "认证失败，请在请求头中携带正确的 Authorization: Bearer <token>" };
  }
  return { pass: true };
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.pass) {
    return NextResponse.json({ ok: false, text: auth.msg }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, text: "请求格式错误，请发送 JSON 格式数据" }, { status: 400 });
  }

  // 兼容 query / message / text 三种字段
  const message = String(body.query ?? body.message ?? body.text ?? "").trim();
  if (!message) {
    return NextResponse.json(
      { ok: false, text: "请输入查询内容，例如：7203 或 今日推荐" },
      { status: 400 }
    );
  }

  try {
    const result = await handleWecomQuery(message);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[wecom/chat] 查询错误:", err);
    return NextResponse.json(
      { ok: false, text: "暂时无法查询，请稍后再试。" },
      { status: 500 }
    );
  }
}

// GET 用于健康检查 / WeChat Work 域名验证
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "TOHOSHOU AI WeCom Chat",
    version: "v11.2",
    endpoints: ["POST /api/wecom/chat"],
  });
}
