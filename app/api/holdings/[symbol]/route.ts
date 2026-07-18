import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */

// PATCH /api/holdings/[symbol] — 编辑（成本/数量/备注）；DELETE — 删除持仓（不产生卖出流水）
const num = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export async function PATCH(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const p = prisma as any;
  const { symbol } = await params;
  try {
    const b = await req.json();
    const data: any = {};
    const avgCost = num(b.avgCost), shares = num(b.shares);
    if (avgCost != null && avgCost > 0) data.avgCost = avgCost;
    if (shares != null && shares > 0) data.shares = shares;
    if (b.note !== undefined) data.note = b.note ? String(b.note) : null;
    if (!Object.keys(data).length) return NextResponse.json({ error: "无可更新字段" }, { status: 400 });
    const holding = await p.userHolding.update({ where: { symbol: decodeURIComponent(symbol) }, data });
    return NextResponse.json({ ok: true, holding });
  } catch (e: any) {
    console.error("[holdings PATCH]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const p = prisma as any;
  const { symbol } = await params;
  try {
    await p.userHolding.delete({ where: { symbol: decodeURIComponent(symbol) } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[holdings DELETE]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
