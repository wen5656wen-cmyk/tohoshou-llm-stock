// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeStock } from "@/lib/ai";
import { guardAdminRoute } from "@/lib/admin-auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const denied = await guardAdminRoute(_req);
  if (denied) return denied;

  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);

  const stock = await prisma.stock.findUnique({
    where: { symbol: decoded },
    include: {
      financials: { orderBy: [{ fiscalYear: "desc" }, { quarter: "desc" }], take: 2 },
      news: { orderBy: { publishedAt: "desc" }, take: 10 },
      disclosures: { orderBy: { publishedAt: "desc" }, take: 10 },
    },
  });

  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentFin = stock.financials[0] ?? null;
  const prevFin = stock.financials[1] ?? null;

  const result = await analyzeStock(
    stock,
    currentFin,
    prevFin,
    stock.news,
    stock.disclosures
  );

  await prisma.stock.update({
    where: { id: stock.id },
    data: { aiScore: result.score },
  });

  return NextResponse.json(result);
}
