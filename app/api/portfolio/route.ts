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

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const portfolios = await prisma.portfolio.findMany({
    include: {
      stock: {
        select: { price: true, changeRate: true, nameZh: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const symbols = portfolios.map((p) => p.symbol).filter(Boolean);

  // Batch fetch StockScore + GPTScore for all portfolio symbols
  const [scoreRows, gptRows] = await Promise.all([
    prisma.stockScore.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true,
        latestClose: true, return5d: true, return20d: true,
        adaptiveScore: true, percentileRank: true, recommendationV2: true,
      },
    }),
    prisma.gPTScore.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, gptScore: true, finalScore: true, gptRating: true, gptRank: true },
    }),
  ]);

  const scoreMap = new Map(scoreRows.map((s) => [s.symbol, s]));
  const gptMap   = new Map(gptRows.map((g) => [g.symbol, g]));

  const items = portfolios.map((p) => {
    const currentPrice = p.stock?.price ?? p.avgPrice;
    const value = currentPrice * p.shares;
    const cost = p.avgPrice * p.shares;
    const pnl = value - cost;
    const pnlRate = cost > 0 ? (pnl / cost) * 100 : 0;

    const base = scoreMap.get(p.symbol) ?? null;
    const gpt  = gptMap.get(p.symbol) ?? null;

    const adaptiveScore   = base?.adaptiveScore ?? null;
    const finalScore      = gpt?.finalScore ?? adaptiveScore ?? 0;
    const effectiveRating = gpt?.gptRating ?? base?.recommendationV2 ?? "HOLD";

    const score = base
      ? {
          adaptiveScore,
          finalScore,
          gptScore:       gpt?.gptScore ?? null,
          gptRank:        gpt?.gptRank ?? null,
          gptRating:      gpt?.gptRating ?? null,
          effectiveRating,
          recommendationV2: base.recommendationV2,
          latestClose:    base.latestClose,
          return5d:       base.return5d,
          return20d:      base.return20d,
        }
      : null;

    return {
      ...p,
      currentPrice,
      value,
      pnl,
      pnlRate,
      score,
    };
  });

  // Sort: finalScore DESC → gptRank ASC
  items.sort((a, b) => {
    const fa = a.score?.finalScore ?? 0;
    const fb = b.score?.finalScore ?? 0;
    if (Math.abs(fb - fa) > 0.01) return fb - fa;
    const ra = a.score?.gptRank ?? 9999;
    const rb = b.score?.gptRank ?? 9999;
    return ra - rb;
  });

  const totalValue = items.reduce((s, i) => s + i.value, 0);
  const totalCost  = items.reduce((s, i) => s + i.avgPrice * i.shares, 0);
  const totalPnl   = totalValue - totalCost;

  return NextResponse.json({ items, totalValue, totalCost, totalPnl });
}

export async function POST(req: NextRequest) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

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
