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

  const { symbol, shares, price, name, nameZh } = body as {
    symbol?: string;
    shares?: number;
    price?: number;
    name?: string;
    nameZh?: string | null;
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

  const amount = price * shares;

  // Get or create portfolio
  let portfolio = await prisma.simPortfolio.findFirst();
  if (!portfolio) {
    portfolio = await prisma.simPortfolio.create({
      data: { initialCash: 1_000_000, currentCash: 1_000_000, realizedPnl: 0 },
    });
  }

  if (portfolio.currentCash < amount) {
    return NextResponse.json(
      { error: "insufficient_cash", available: portfolio.currentCash, required: amount },
      { status: 422 }
    );
  }

  // Fetch stock name from DB if not provided
  const stockInfo = !name
    ? await prisma.stock.findUnique({ where: { symbol }, select: { name: true, nameZh: true } })
    : null;
  const stockName = name ?? stockInfo?.name ?? symbol;
  const stockNameZh = nameZh !== undefined ? nameZh : (stockInfo?.nameZh ?? null);

  // Upsert position with weighted average cost
  const existing = await prisma.simPosition.findUnique({
    where: { portfolioId_symbol: { portfolioId: portfolio.id, symbol } },
  });

  await prisma.$transaction(async (tx) => {
    if (existing) {
      const totalShares = existing.shares + shares;
      const newAvgCost = (existing.avgCost * existing.shares + price * shares) / totalShares;
      await tx.simPosition.update({
        where: { id: existing.id },
        data: { shares: totalShares, avgCost: newAvgCost, name: stockName, nameZh: stockNameZh },
      });
    } else {
      await tx.simPosition.create({
        data: {
          portfolioId: portfolio.id,
          symbol,
          name: stockName,
          nameZh: stockNameZh,
          avgCost: price,
          shares,
        },
      });
    }

    await tx.simPortfolio.update({
      where: { id: portfolio.id },
      data: { currentCash: { decrement: amount } },
    });

    await tx.simTrade.create({
      data: {
        portfolioId: portfolio.id,
        symbol,
        name: stockName,
        nameZh: stockNameZh,
        action: "BUY",
        shares,
        price,
        amount,
      },
    });
  });

  return NextResponse.json({ ok: true, symbol, shares, price, amount });
}
