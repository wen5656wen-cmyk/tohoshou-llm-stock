import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/holdings/history — 历史交易（SELL 平仓记录）+ 是否跑赢 TOPIX/Nikkei
export async function GET() {
  const p = prisma as any;
  try {
    const rows = await p.userTrade.findMany({ where: { side: "SELL" }, orderBy: [{ tradeDate: "desc" }, { id: "desc" }], take: 200 });
    const history = rows.map((r: any) => ({
      id: r.id, symbol: r.symbol, name: r.name, shares: r.shares, sellPrice: r.price, avgCost: r.avgCostAtSell,
      sellDate: r.tradeDate.toISOString().slice(0, 10), reason: r.reason, note: r.note,
      realizedPnl: r.realizedPnl, returnPct: r.returnPct, holdingDays: r.holdingDays,
      benchTopixPct: r.benchTopixPct, benchNikkeiPct: r.benchNikkeiPct,
      beatTopix: r.returnPct != null && r.benchTopixPct != null ? r.returnPct > r.benchTopixPct : null,
      beatNikkei: r.returnPct != null && r.benchNikkeiPct != null ? r.returnPct > r.benchNikkeiPct : null,
    }));
    const realizedTotal = history.reduce((a: number, x: any) => a + (x.realizedPnl ?? 0), 0);
    const wins = history.filter((x: any) => (x.realizedPnl ?? 0) > 0).length;
    return NextResponse.json({ history, summary: { count: history.length, realizedTotal, winRate: history.length ? (wins / history.length) * 100 : null } });
  } catch (e: any) {
    console.error("[holdings/history]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
