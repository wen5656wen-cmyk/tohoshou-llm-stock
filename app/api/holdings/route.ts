// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuotesBatch } from "@/lib/yahoo";
import { deriveHoldingActions, type PaperPositionInput, type Quote } from "@/lib/decision-engine";
import { guardAdminRoute } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */

// ── GET /api/holdings（P16-01 · 真实用户持仓 + 实时估值 + AI 动作 + 汇总）──────────
// 只读复用 StockScore(目标/止损/评分) + Yahoo 实时价 + lib/decision-engine 的持仓动作纯函数。
// 不改 Decision Engine / Runtime Ranking / PaperBroker / 任何现有逻辑。

function withTimeout<T>(pr: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([pr, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const p = prisma as any;
  try {
    const [account, holdings] = await Promise.all([
      p.userAccount.findFirst({ orderBy: { id: "asc" } }),
      p.userHolding.findMany({ orderBy: { openDate: "asc" } }),
    ]);
    const cash: number = account?.cash ?? 0;
    if (!holdings.length) {
      return NextResponse.json({ account: { cash }, holdings: [], summary: emptySummary(cash) });
    }

    const symbols: string[] = holdings.map((h: any) => h.symbol);
    const [quotes, scoreRows] = await Promise.all([
      withTimeout(fetchQuotesBatch(symbols), 1500, [] as any[]),
      p.stockScore.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, nameZh: true, name: true, target1: true, stopLoss: true, actionRiskLevel: true, adaptiveScore: true, sector: true } }),
    ]);
    const qMap = new Map<string, Quote>((quotes as any[]).map((q) => [q.symbol, q]));
    const sMap = new Map<string, any>(scoreRows.map((r: any) => [r.symbol, r]));
    const now = new Date();

    // 复用 deriveHoldingActions（纯函数，单一来源）计算 止损/减仓/止盈/持有
    const paperInputs: PaperPositionInput[] = holdings.map((h: any) => {
      const sc = sMap.get(h.symbol);
      const price = qMap.get(h.symbol)?.price ?? null;
      const ret = price != null && h.avgCost > 0 ? (price / h.avgCost - 1) * 100 : null;
      return { symbol: h.symbol, name: h.name, strategyType: null, entryPrice: h.avgCost, currentPrice: price, returnPct: ret, actionRiskLevel: sc?.actionRiskLevel ?? null, target1: sc?.target1 ?? null, stopLoss: sc?.stopLoss ?? null, updatedAt: h.updatedAt?.toISOString() ?? null };
    });
    const actions = new Map(deriveHoldingActions(paperInputs, qMap).map((a) => [a.symbol, a]));

    let totalCost = 0, marketValue = 0, todayPnl = 0;
    const rows = holdings.map((h: any) => {
      const q = qMap.get(h.symbol);
      const sc = sMap.get(h.symbol);
      const price = q?.price ?? null;
      const prev = q?.previousClose ?? null;
      const cost = h.shares * h.avgCost;
      const mv = price != null ? h.shares * price : cost;
      const upnl = mv - cost;
      const todayChg = price != null && prev != null && prev > 0 ? (price / prev - 1) * 100 : null;
      totalCost += cost; marketValue += mv;
      if (price != null && prev != null) todayPnl += h.shares * (price - prev);
      const act = actions.get(h.symbol);
      return {
        // name = 日文原名（StockScore 规范名，回退持仓记录名）；nameZh 供前端按 locale 解析。
        symbol: h.symbol, name: sc?.name ?? h.name, nameZh: sc?.nameZh ?? null, shares: h.shares, avgCost: h.avgCost, openDate: h.openDate.toISOString().slice(0, 10), note: h.note ?? null,
        currentPrice: price, cost, marketValue: mv, unrealizedPnl: upnl, returnPct: h.avgCost > 0 && price != null ? (price / h.avgCost - 1) * 100 : null,
        todayChangePct: todayChg, holdingDays: daysBetween(new Date(h.openDate), now),
        action: act?.action ?? "HOLD", sellPct: act?.sellPct ?? 0, reasonKey: act?.reasonKey ?? "dv.hold.rk.hold",
        target: sc?.target1 ?? null, stop: sc?.stopLoss ?? null, ai: sc?.adaptiveScore ?? null, sector: sc?.sector ?? null,
      };
    });

    const upnl = marketValue - totalCost;
    // 仓位/现金比率用 max(0,cash)：用户未注资现金(cash≤0)→视为满仓(仓位100%/现金0%)，避免负现金致比率失真。
    const cashForRatio = Math.max(0, cash);
    const equity = marketValue + cashForRatio;
    const summary = {
      count: rows.length, totalCost, marketValue, cash, equity,
      unrealizedPnl: upnl, unrealizedPct: totalCost > 0 ? (upnl / totalCost) * 100 : null,
      todayPnl, todayPct: marketValue - todayPnl > 0 ? (todayPnl / (marketValue - todayPnl)) * 100 : null,
      positionPct: equity > 0 ? (marketValue / equity) * 100 : 100,
      cashPct: equity > 0 ? (cashForRatio / equity) * 100 : 0,
    };
    return NextResponse.json({ account: { cash }, holdings: rows, summary });
  } catch (e: any) {
    console.error("[holdings GET]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}

function emptySummary(cash: number) {
  return { count: 0, totalCost: 0, marketValue: 0, cash, equity: cash, unrealizedPnl: 0, unrealizedPct: null, todayPnl: 0, todayPct: null, positionPct: 0, cashPct: cash > 0 ? 100 : 0 };
}
