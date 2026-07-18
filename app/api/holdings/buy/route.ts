import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */

// POST /api/holdings/buy — 加入持有 / 加仓（真实用户持仓，手工维护）
// { symbol, name, price, shares, tradeDate?, fee?, note? }。加权平均成本；账户现金减。
const num = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function jstToday(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
const toDate = (s?: string) => new Date(`${s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : jstToday()}T00:00:00.000Z`);

export async function POST(req: Request) {
  const p = prisma as any;
  try {
    const b = await req.json();
    const symbol = String(b.symbol || "").trim();
    const price = num(b.price), shares = num(b.shares);
    const fee = num(b.fee) ?? 0;
    if (!symbol || price == null || price <= 0 || shares == null || shares <= 0) {
      return NextResponse.json({ error: "symbol/price/shares 必填且为正" }, { status: 400 });
    }
    const name = String(b.name || symbol);
    const tradeDate = toDate(b.tradeDate);

    const existing = await p.userHolding.findUnique({ where: { symbol } });
    let holding;
    if (existing) {
      const newShares = existing.shares + shares;
      const newCost = (existing.shares * existing.avgCost + shares * price) / newShares;
      const openDate = new Date(existing.openDate) < tradeDate ? existing.openDate : tradeDate;
      holding = await p.userHolding.update({ where: { symbol }, data: { shares: newShares, avgCost: newCost, openDate, name } });
    } else {
      holding = await p.userHolding.create({ data: { symbol, name, shares, avgCost: price, openDate: tradeDate, note: b.note ? String(b.note) : null } });
    }
    await p.userTrade.create({ data: { symbol, name, side: "BUY", shares, price, fee, tradeDate, note: b.note ? String(b.note) : null } });

    // 账户现金减（自动建账户）
    const acc = await p.userAccount.findFirst({ orderBy: { id: "asc" } });
    const spend = price * shares + fee;
    if (acc) await p.userAccount.update({ where: { id: acc.id }, data: { cash: acc.cash - spend } });
    else await p.userAccount.create({ data: { cash: -spend, initialCapital: 0 } });

    return NextResponse.json({ ok: true, holding });
  } catch (e: any) {
    console.error("[holdings/buy]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
