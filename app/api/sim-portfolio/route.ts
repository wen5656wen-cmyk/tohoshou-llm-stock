// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdminRoute } from "@/lib/admin-auth";

export type SimPositionItem = {
  id: number;
  symbol: string;
  name: string;
  nameZh: string | null;
  avgCost: number;
  shares: number;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  returnPct: number | null;
};

export type SimTradeItem = {
  id: number;
  symbol: string;
  name: string;
  nameZh: string | null;
  action: string;
  shares: number;
  price: number;
  amount: number;
  realizedPnl: number | null;
  createdAt: string;
};

export type SimPortfolioData = {
  id: number;
  initialCash: number;
  currentCash: number;
  realizedPnl: number;
  holdingsValue: number;
  totalAssets: number;
  unrealizedPnl: number;
  totalPnl: number;
  returnPct: number;
  positions: SimPositionItem[];
  trades: SimTradeItem[];
};

async function getOrCreatePortfolio() {
  let portfolio = await prisma.simPortfolio.findFirst({ select: { id: true } });
  if (!portfolio) {
    portfolio = await prisma.simPortfolio.create({
      data: { initialCash: 100_000_000, currentCash: 100_000_000, realizedPnl: 0 },
      select: { id: true },
    });
  }
  return portfolio.id;
}

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const portfolioId = await getOrCreatePortfolio();

  const [portfolio, positions, trades] = await Promise.all([
    prisma.simPortfolio.findUnique({ where: { id: portfolioId } }),
    prisma.simPosition.findMany({ where: { portfolioId }, orderBy: { updatedAt: "desc" } }),
    prisma.simTrade.findMany({ where: { portfolioId }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  if (!portfolio) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Batch-fetch current prices
  const symbols = [...new Set(positions.map((p) => p.symbol))];
  const scoreRows = symbols.length > 0
    ? await prisma.stockScore.findMany({
        where: { symbol: { in: symbols } },
        select: { symbol: true, latestClose: true },
      })
    : [];
  const priceMap = new Map(scoreRows.map((r) => [r.symbol, r.latestClose ?? null]));

  const positionItems: SimPositionItem[] = positions.map((pos) => {
    const px = priceMap.get(pos.symbol) ?? null;
    const mv = px != null ? px * pos.shares : null;
    const upnl = mv != null ? mv - pos.avgCost * pos.shares : null;
    const ret = upnl != null && pos.avgCost > 0 ? (upnl / (pos.avgCost * pos.shares)) * 100 : null;
    return {
      id: pos.id,
      symbol: pos.symbol,
      name: pos.name,
      nameZh: pos.nameZh,
      avgCost: pos.avgCost,
      shares: pos.shares,
      currentPrice: px,
      marketValue: mv,
      unrealizedPnl: upnl,
      returnPct: ret,
    };
  });

  const holdingsValue = positionItems.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const totalAssets = portfolio.currentCash + holdingsValue;
  const unrealizedPnl = positionItems.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
  const totalPnl = unrealizedPnl + portfolio.realizedPnl;
  const returnPct = portfolio.initialCash > 0 ? (totalPnl / portfolio.initialCash) * 100 : 0;

  const tradeItems: SimTradeItem[] = trades.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    name: t.name,
    nameZh: t.nameZh,
    action: t.action,
    shares: t.shares,
    price: t.price,
    amount: t.amount,
    realizedPnl: t.realizedPnl,
    createdAt: t.createdAt.toISOString(),
  }));

  const data: SimPortfolioData = {
    id: portfolio.id,
    initialCash: portfolio.initialCash,
    currentCash: portfolio.currentCash,
    realizedPnl: portfolio.realizedPnl,
    holdingsValue,
    totalAssets,
    unrealizedPnl,
    totalPnl,
    returnPct,
    positions: positionItems,
    trades: tradeItems,
  };

  return NextResponse.json(data);
}

// Reset portfolio back to initial state
export async function DELETE(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const portfolioId = await getOrCreatePortfolio();
  await prisma.$transaction([
    prisma.simTrade.deleteMany({ where: { portfolioId } }),
    prisma.simPosition.deleteMany({ where: { portfolioId } }),
    prisma.simPortfolio.update({
      where: { id: portfolioId },
      data: { currentCash: 100_000_000, realizedPnl: 0, initialCash: 100_000_000 },
    }),
  ]);
  return NextResponse.json({ reset: true });
}
