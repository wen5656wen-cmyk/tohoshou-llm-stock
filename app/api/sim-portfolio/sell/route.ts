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

export async function POST(req: NextRequest) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { symbol, shares, price } = body as {
    symbol?: string;
    shares?: number;
    price?: number;
  };

  if (!symbol || typeof shares !== "number" || typeof price !== "number") {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (shares <= 0 || shares % 100 !== 0) {
    return NextResponse.json({ error: "shares_must_be_100_multiple" }, { status: 400 });
  }
  if (price <= 0) {
    return NextResponse.json({ error: "invalid_price" }, { status: 400 });
  }

  const portfolio = await prisma.simPortfolio.findFirst();
  if (!portfolio) return NextResponse.json({ error: "no_portfolio" }, { status: 404 });

  const position = await prisma.simPosition.findUnique({
    where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol } },
  });

  if (!position) return NextResponse.json({ error: "no_position" }, { status: 422 });
  if (shares > position.shares) {
    return NextResponse.json(
      { error: "exceed_holding", holding: position.shares, requested: shares },
      { status: 422 }
    );
  }

  const amount = price * shares;
  const realizedPnl = (price - position.avgCost) * shares;

  await prisma.$transaction(async (tx) => {
    const remaining = position.shares - shares;
    if (remaining === 0) {
      await tx.simPosition.delete({ where: { id: position.id } });
    } else {
      await tx.simPosition.update({ where: { id: position.id }, data: { shares: remaining } });
    }

    await tx.simPortfolio.update({
      where: { id: portfolio.id },
      data: {
        currentCash: { increment: amount },
        realizedPnl: { increment: realizedPnl },
      },
    });

    await tx.simTrade.create({
      data: {
        portfolioId: portfolio.id,
        symbol,
        name: position.name,
        nameZh: position.nameZh,
        action: "SELL",
        shares,
        price,
        amount,
        realizedPnl,
      },
    });
  });

  return NextResponse.json({ ok: true, symbol, shares, price, amount, realizedPnl });
}
