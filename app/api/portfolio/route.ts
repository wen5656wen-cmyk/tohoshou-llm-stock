import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const portfolios = await prisma.portfolio.findMany({
    include: {
      stock: {
        select: { price: true, changeRate: true, aiScore: true, nameZh: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const items = portfolios.map((p) => {
    const currentPrice = p.stock?.price ?? p.avgPrice;
    const value = currentPrice * p.shares;
    const cost = p.avgPrice * p.shares;
    const pnl = value - cost;
    const pnlRate = cost > 0 ? (pnl / cost) * 100 : 0;
    return { ...p, currentPrice, value, pnl, pnlRate };
  });

  const totalValue = items.reduce((s, i) => s + i.value, 0);
  const totalCost = items.reduce((s, i) => s + i.avgPrice * i.shares, 0);
  const totalPnl = totalValue - totalCost;

  return NextResponse.json({ items, totalValue, totalCost, totalPnl });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, name, shares, avgPrice, note } = body;

  if (!symbol || !name || !shares || !avgPrice) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const stock = await prisma.stock.findUnique({ where: { symbol } });

  const portfolio = await prisma.portfolio.create({
    data: {
      stockId: stock?.id ?? null,
      symbol,
      name,
      shares: Number(shares),
      avgPrice: Number(avgPrice),
      note: note || null,
    },
  });

  return NextResponse.json(portfolio, { status: 201 });
}
