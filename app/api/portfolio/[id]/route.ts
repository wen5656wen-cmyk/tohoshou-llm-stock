// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdminRoute } from "@/lib/admin-auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdminRoute(_req);
  if (denied) return denied;

  const { id } = await params;

  await prisma.portfolio.delete({ where: { id: Number(id) } });

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();

  const portfolio = await prisma.portfolio.update({
    where: { id: Number(id) },
    data: {
      shares: body.shares !== undefined ? Number(body.shares) : undefined,
      avgPrice: body.avgPrice !== undefined ? Number(body.avgPrice) : undefined,
      note: body.note,
    },
  });

  return NextResponse.json(portfolio);
}
