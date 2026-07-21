// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logManualDecision, sellReasonKey } from "@/lib/trading/decision-log";
import { guardAdminRoute } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */

// POST /api/holdings/sell — 卖出（部分/全部）。全部卖出 → 移出持有、进入 History。
// { symbol, price, shares, tradeDate?, fee?, reason, note? }。自动算收益/持仓天数/基准对比。
const num = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function jstToday(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
const toDate = (s?: string) => new Date(`${s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : jstToday()}T00:00:00.000Z`);
const REASONS = ["TAKE_PROFIT", "STOP_LOSS", "MANUAL", "REBALANCE", "OTHER"];

// 同期基准涨跌 %（GlobalMarket nearest on-or-before）
async function benchPct(p: any, field: "topix" | "nikkei", from: Date, to: Date): Promise<number | null> {
  const [a, b] = await Promise.all([
    p.globalMarket.findFirst({ where: { date: { lte: from }, [field]: { not: null } }, orderBy: { date: "desc" }, select: { [field]: true } }),
    p.globalMarket.findFirst({ where: { date: { lte: to }, [field]: { not: null } }, orderBy: { date: "desc" }, select: { [field]: true } }),
  ]);
  const s = a?.[field], e = b?.[field];
  return s != null && e != null && s > 0 ? ((e - s) / s) * 100 : null;
}

export async function POST(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const p = prisma as any;
  try {
    const b = await req.json();
    const symbol = String(b.symbol || "").trim();
    const price = num(b.price), shares = num(b.shares);
    const fee = num(b.fee) ?? 0;
    const reason = REASONS.includes(String(b.reason)) ? String(b.reason) : "MANUAL";
    if (!symbol || price == null || price <= 0 || shares == null || shares <= 0) {
      return NextResponse.json({ error: "symbol/price/shares 必填且为正" }, { status: 400 });
    }
    const holding = await p.userHolding.findUnique({ where: { symbol } });
    if (!holding) return NextResponse.json({ error: "无此持仓" }, { status: 404 });
    if (shares > holding.shares + 1e-6) return NextResponse.json({ error: "卖出数量超过持有" }, { status: 400 });

    const tradeDate = toDate(b.tradeDate);
    const avgCost = holding.avgCost;
    const realizedPnl = (price - avgCost) * shares - fee;
    const returnPct = avgCost > 0 ? (price / avgCost - 1) * 100 : null;
    const holdingDays = Math.max(0, Math.round((tradeDate.getTime() - new Date(holding.openDate).getTime()) / 86_400_000));
    const [benchTopixPct, benchNikkeiPct] = await Promise.all([
      benchPct(p, "topix", new Date(holding.openDate), tradeDate),
      benchPct(p, "nikkei", new Date(holding.openDate), tradeDate),
    ]);

    await p.userTrade.create({ data: {
      symbol, name: holding.name, side: "SELL", shares, price, fee, tradeDate, reason, note: b.note ? String(b.note) : null,
      avgCostAtSell: avgCost, realizedPnl, returnPct, holdingDays, benchTopixPct, benchNikkeiPct,
    } });

    const remaining = holding.shares - shares;
    if (remaining <= 1e-6) await p.userHolding.delete({ where: { symbol } });
    else await p.userHolding.update({ where: { symbol }, data: { shares: remaining } }); // avgCost 不变

    // P17-02：追加决策时间线 + Learning（全部卖出=CLOSED，部分=REDUCE；outcome 由本次收益方向）。
    await logManualDecision({
      symbol, name: holding.name, action: remaining <= 1e-6 ? "CLOSED" : "REDUCE",
      price, returnPct, realizedPnl, holdingDays, reasonKey: sellReasonKey(reason),
      outcome: returnPct != null ? (returnPct > 0 ? "HIT" : "MISS") : null,
      reasonText: b.note ? String(b.note) : null, tradeDate,
    });

    const acc = await p.userAccount.findFirst({ orderBy: { id: "asc" } });
    const proceeds = price * shares - fee;
    if (acc) await p.userAccount.update({ where: { id: acc.id }, data: { cash: acc.cash + proceeds } });
    else await p.userAccount.create({ data: { cash: proceeds, initialCapital: 0 } });

    return NextResponse.json({ ok: true, realizedPnl, returnPct, holdingDays, closed: remaining <= 1e-6 });
  } catch (e: any) {
    console.error("[holdings/sell]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
