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

export const dynamic = "force-dynamic";

// ── GET /api/decision/portfolio（P14-DEV-05 · 只读聚合 · 不改算法/Schema/Cron）─────
// 回答唯一问题：「若完全按 TOHOSHOU AI 推荐交易，当前组合表现如何」。
// SSOT = AI Paper Broker（¥10M 连续账户，镜像 day/swing/long 三策略池）——项目内既有的
// 「AI 模拟组合」权威账户。本端只读聚合、后端统一计算，前端零重复计算：
//   · 汇总/持仓/绩效/风险/现金 ← PaperAccount + PaperPosition + PaperCashLog + StockScore(join)
//   · 每日净值走势 + 最大回撤   ← StrategySnapshot（三池 totalValue 逐日重构组合 NAV）
//   · benchmark 走势(TOPIX/日经) ← GlobalMarket
//   · 板块分配                   ← 持仓按 StockScore.sector 归并
//   · 调仓/交易记录              ← PaperExecution（真实买卖成交）
// 无真实来源的字段（Sharpe/Sortino/Calmar/Treynor/InfoRatio/TrackingError、独立调仓事件表）
// 一律返回 null / 空 + insufficient 标记，前端显「—」，绝不伪造。这是 AI 模拟组合，非真实券商账户。

const STRATS = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const;
const POOL: Record<string, number> = { DAY_TRADE: 3_000_000, SWING_TRADE: 4_000_000, LONG_TRADE: 3_000_000 };
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const daysBetween = (a: Date | null, b: Date) => (a ? Math.max(0, Math.round((b.getTime() - new Date(a).getTime()) / 86_400_000)) : null);
const num = (v: unknown): number | null => { if (v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

// 持仓状态统一 5 态（价格客观判定优先，回退 tradingAction；调仓无独立事件源→不判定）
function holdingStatus(price: number | null, target: number | null, stop: number | null, action: string | null): { key: string; tone: string } {
  if (price != null && stop != null && price <= stop) return { key: "dv.pf.st.STOP", tone: "red" };
  if (price != null && target != null && price >= target) return { key: "dv.pf.st.TP", tone: "green" };
  if (action === "WAIT_PULLBACK" || action === "AVOID") return { key: "dv.pf.st.WATCH", tone: "amber" };
  return { key: "dv.pf.st.HOLD", tone: "blue" };
}

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const p = prisma as any;
  try {
    const account = await p.paperAccount.findFirst({ orderBy: { id: "asc" } });
    if (!account) return NextResponse.json({ empty: true, note: "AI 模拟账户尚未初始化" });
    const accountId = account.id;
    const initialCapital: number = account.initialCapital ?? 10_000_000;

    const [openPositions, closedPositions, recentExecs, snaps] = await Promise.all([
      p.paperPosition.findMany({ where: { accountId, status: "OPEN" }, orderBy: { entryDate: "desc" } }),
      p.paperPosition.findMany({ where: { accountId, status: "CLOSED" }, select: { symbol: true, entryDate: true, exitDate: true, returnAmount: true, returnPct: true } }),
      p.paperExecution.findMany({ where: { accountId }, orderBy: [{ execDate: "desc" }, { id: "desc" }], take: 20, select: { execDate: true, strategyType: true, symbol: true, side: true, quantity: true, price: true, amount: true } }),
      p.strategySnapshot.findMany({ where: { strategyType: { in: STRATS as unknown as string[] } }, orderBy: { snapshotDate: "asc" }, select: { strategyType: true, snapshotDate: true, totalValue: true, topixReturnPct: true } }),
    ]);

    // ── StockScore 富化：名称 / AI评分 / 目标·止损价 / 行业 / 动作 / 风险 ───────────
    // Stock 主表兜底名称/行业（部分持仓可能未在 StockScore 评分表中，如未评分/退市股）。
    const symbols = [...new Set<string>(openPositions.map((x: any) => x.symbol).concat(recentExecs.map((x: any) => x.symbol)))];
    const [scoreRows, stockRows] = symbols.length
      ? await Promise.all([
          p.stockScore.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, name: true, nameZh: true, sector: true, adaptiveScore: true, target1: true, stopLoss: true, tradingAction: true, actionRiskLevel: true } }),
          p.stock.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true, name: true, nameZh: true, sector: true } }),
        ])
      : [[], []];
    const stMap = new Map<string, any>((stockRows as any[]).map((r: any) => [r.symbol, r]));
    const sMap = new Map<string, any>((scoreRows as any[]).map((r: any) => {
      const st = stMap.get(r.symbol);
      return [r.symbol, { ...r, name: r.name ?? st?.name ?? null, nameZh: r.nameZh ?? st?.nameZh ?? null, sector: r.sector ?? st?.sector ?? null }];
    }));
    // StockScore 缺失的持仓：用 Stock 主表补名称/行业（无评分/目标/止损）
    for (const [sym, st] of stMap) if (!sMap.has(sym)) sMap.set(sym, { symbol: sym, name: st.name ?? null, nameZh: st.nameZh ?? null, sector: st.sector ?? null });
    const nm = (s: string) => sMap.get(s)?.nameZh || sMap.get(s)?.name || s;

    // ── 汇总（现金按池 = 最新 cash-log） ───────────────────────────────────────────
    const cash: Record<string, number> = { ...POOL };
    for (const s of STRATS) {
      const last = await p.paperCashLog.findFirst({ where: { accountId, strategyType: s }, orderBy: { id: "desc" }, select: { cashAfter: true } });
      if (last) cash[s] = last.cashAfter;
    }
    const byStrat: Record<string, any[]> = { DAY_TRADE: [], SWING_TRADE: [], LONG_TRADE: [] };
    for (const pos of openPositions) byStrat[pos.strategyType]?.push(pos);
    const pools = STRATS.map((s) => {
      const posVal = byStrat[s].reduce((a, x) => a + (x.currentValue ?? 0), 0);
      return { strategyType: s, poolCapital: POOL[s], cash: cash[s], positionsValue: posVal, total: cash[s] + posVal, openCount: byStrat[s].length };
    });
    const totalCash = pools.reduce((a, x) => a + x.cash, 0);
    const positionsValue = pools.reduce((a, x) => a + x.positionsValue, 0);
    const totalAssets = totalCash + positionsValue;
    const realizedPnl = closedPositions.reduce((a: number, x: any) => a + (x.returnAmount ?? 0), 0);
    const unrealizedPnl = openPositions.reduce((a: number, x: any) => a + (x.returnAmount ?? 0), 0);
    const cumulativePnl = totalAssets - initialCapital;
    const cumulativePnlPct = initialCapital > 0 ? (cumulativePnl / initialCapital) * 100 : null;

    // 今日已实现盈亏（最新成交日平仓）
    const latestExecDate = recentExecs[0]?.execDate ? iso(recentExecs[0].execDate) : null;
    const todayPnl = latestExecDate
      ? closedPositions.filter((x: any) => iso(x.exitDate) === latestExecDate).reduce((a: number, x: any) => a + (x.returnAmount ?? 0), 0)
      : 0;
    const todayReturnPct = totalAssets - todayPnl !== 0 ? (todayPnl / (totalAssets - todayPnl)) * 100 : null;

    // ── 每日组合净值序列（三池 totalValue 前向填充求和；EOD 快照） ───────────────
    const dateSet = [...new Set<string>(snaps.map((s: any) => iso(s.snapshotDate)!).filter(Boolean))].sort();
    const lastVal: Record<string, number> = { ...POOL };
    const byDate = new Map<string, any[]>();
    for (const s of snaps) { const d = iso(s.snapshotDate)!; if (!byDate.has(d)) byDate.set(d, []); byDate.get(d)!.push(s); }
    // benchmark：GlobalMarket 逐日 topix/nikkei，对齐到快照日（on-or-before）
    const startD = dateSet[0] ? new Date(dateSet[0] + "T00:00:00.000Z") : null;
    const gm = startD
      ? await p.globalMarket.findMany({ where: { date: { gte: new Date(startD.getTime() - 7 * 86_400_000) } }, orderBy: { date: "asc" }, select: { date: true, topix: true, nikkei: true } })
      : [];
    const gmOnOrBefore = (d: string) => { let best: any = null; for (const g of gm) { if (iso(g.date)! <= d) best = g; else break; } return best; };
    const navPoints = dateSet.map((d) => {
      for (const s of byDate.get(d) ?? []) if (s.totalValue != null) lastVal[s.strategyType] = s.totalValue;
      const nav = STRATS.reduce((a, st) => a + lastVal[st], 0);
      const g = gmOnOrBefore(d);
      return { date: d, nav: Math.round(nav), topix: num(g?.topix), nikkei: num(g?.nikkei) };
    });
    // 最大回撤（全历史 NAV 峰谷）
    let peak = -Infinity, maxDrawdown: number | null = null;
    for (const pt of navPoints) { if (pt.nav > peak) peak = pt.nav; if (peak > 0) { const dd = ((pt.nav - peak) / peak) * 100; if (maxDrawdown == null || dd < maxDrawdown) maxDrawdown = dd; } }
    const navInsufficient = navPoints.length < 2;
    // 组合累计 vs TOPIX（全历史，用于 alpha；net 用 live 汇总，bench 用 GlobalMarket）
    const firstG = navPoints.find((x) => x.topix != null)?.topix ?? null;
    const lastG = [...navPoints].reverse().find((x) => x.topix != null)?.topix ?? null;
    const topixFullPct = firstG != null && lastG != null && firstG !== 0 ? ((lastG - firstG) / firstG) * 100 : null;
    const firstNk = navPoints.find((x) => x.nikkei != null)?.nikkei ?? null;
    const lastNk = [...navPoints].reverse().find((x) => x.nikkei != null)?.nikkei ?? null;
    const nikkeiFullPct = firstNk != null && lastNk != null && firstNk !== 0 ? ((lastNk - firstNk) / firstNk) * 100 : null;
    const alpha = cumulativePnlPct != null && topixFullPct != null ? cumulativePnlPct - topixFullPct : null;

    // ── 绩效 / 胜率 ────────────────────────────────────────────────────────────────
    const wins = closedPositions.filter((c: any) => (c.returnAmount ?? 0) > 0);
    const nClosed = closedPositions.length;
    const winRate = nClosed > 0 ? (wins.length / nClosed) * 100 : null;
    const cashRatio = totalAssets > 0 ? (totalCash / totalAssets) * 100 : null;

    // ── 风险（客观、可追溯，不用 ML） ─────────────────────────────────────────────
    const posVals = openPositions.map((x: any) => x.currentValue ?? 0).sort((a: number, b: number) => b - a);
    const maxSingle = totalAssets > 0 && posVals.length ? (posVals[0] / totalAssets) * 100 : null;
    const top5 = totalAssets > 0 && posVals.length ? (posVals.slice(0, 5).reduce((a: number, x: number) => a + x, 0) / totalAssets) * 100 : null;
    const cr = cashRatio ?? 0, ms = maxSingle ?? 0;
    const riskLevel = cr < 15 || ms > 35 ? "HIGH" : cr >= 40 && ms <= 20 ? "LOW" : "MEDIUM";

    // ── 持仓表 ────────────────────────────────────────────────────────────────────
    const now = latestExecDate ? new Date(latestExecDate) : new Date(navPoints.at(-1)?.date ?? Date.now());
    const holdings = openPositions.map((pos: any) => {
      const sc = sMap.get(pos.symbol);
      const price = num(pos.currentPrice);
      const target = num(sc?.target1), stop = num(sc?.stopLoss);
      const st = holdingStatus(price, target, stop, sc?.tradingAction ?? null);
      return {
        symbol: pos.symbol, name: nm(pos.symbol), strategyType: pos.strategyType,
        entryDate: iso(pos.entryDate), holdingDays: daysBetween(pos.entryDate, now),
        entryPrice: num(pos.entryPrice), currentPrice: price,
        returnPct: num(pos.returnPct), returnAmount: num(pos.returnAmount),
        target1: target, stopLoss: stop, aiScore: num(sc?.adaptiveScore),
        sector: sc?.sector ?? null, riskLevel: sc?.actionRiskLevel ?? null,
        statusKey: st.key, statusTone: st.tone,
      };
    });

    // ── 板块分配（直接按持仓归并，正确处理同一标的多池重复持仓） ──────────────────
    const secMap = new Map<string, number>();
    for (const pos of openPositions) { const k = sMap.get(pos.symbol)?.sector ?? "—"; secMap.set(k, (secMap.get(k) ?? 0) + (pos.currentValue ?? 0)); }
    const sectorAlloc = [...secMap.entries()].map(([sector, value]) => ({ sector, value, pct: positionsValue > 0 ? (value / positionsValue) * 100 : null }))
      .sort((a, b) => b.value - a.value);

    // ── 调仓 / 交易记录（真实成交，无独立调仓事件表 → 用 PaperExecution 透传） ─────
    const rebalance = recentExecs.map((e: any) => ({ date: iso(e.execDate), symbol: e.symbol, name: nm(e.symbol), side: e.side, quantity: e.quantity, price: num(e.price), amount: num(e.amount), strategyType: e.strategyType }));

    // ── ⑧ AI 调仓建议（模板派生，无模型调用；全部来自真实数据） ──────────────────
    const sorted = [...holdings].sort((a, b) => (b.returnAmount ?? 0) - (a.returnAmount ?? 0));
    const topContributor = sorted[0] && (sorted[0].returnAmount ?? 0) > 0 ? { symbol: sorted[0].symbol, name: sorted[0].name, amount: sorted[0].returnAmount } : null;
    const worst = sorted.at(-1);
    const topDetractor = worst && (worst.returnAmount ?? 0) < 0 ? { symbol: worst.symbol, name: worst.name, amount: worst.returnAmount } : null;
    const suggestionKey = riskLevel === "HIGH" ? "dv.pf.sug.caution" : todayPnl < 0 && riskLevel === "MEDIUM" ? "dv.pf.sug.watch" : "dv.pf.sug.normal";

    return NextResponse.json({
      empty: false,
      mode: "paper", isPaper: true, initialCapital,
      summary: { totalAssets, totalCash, positionsValue, cumulativePnl, cumulativePnlPct, todayPnl, realizedPnl, unrealizedPnl, positionCount: openPositions.length },
      performance: {
        todayReturnPct, cumulativeReturnPct: cumulativePnlPct, alpha, maxDrawdown, winRate, cashRatio,
        benchTopixPct: topixFullPct, benchNikkeiPct: nikkeiFullPct,
        beatTopix: cumulativePnlPct != null && topixFullPct != null ? cumulativePnlPct > topixFullPct : null,
        // 本阶段不实现（无真实来源）→ 前端显 —
        sharpe: null, sortino: null, calmar: null, treynor: null, informationRatio: null, trackingError: null,
      },
      holdings,
      nav: { insufficient: navInsufficient, points: navPoints, note: "EOD 组合净值（三策略池日快照重构）" },
      risk: { riskLevel, maxSingleStock: maxSingle, top5Concentration: top5, cashRatio, strategyAllocation: pools.map((x) => ({ strategyType: x.strategyType, pct: totalAssets > 0 ? (x.total / totalAssets) * 100 : null })) },
      cash: { totalCash, cashRatio, pools: pools.map((x) => ({ strategyType: x.strategyType, cash: x.cash, poolCapital: x.poolCapital, positionsValue: x.positionsValue, openCount: x.openCount })) },
      sectorAlloc,
      rebalance, rebalanceNote: "反映真实买卖成交（无独立调仓事件表）",
      aiSuggestion: { suggestionKey, riskLevel, todayPnl, topContributor, topDetractor },
      asOf: navPoints.at(-1)?.date ?? latestExecDate ?? null,
      sourceStatus: { account: "ok", nav: navInsufficient ? "insufficient" : "ok", score: scoreRows.length ? "ok" : "missing" },
    });
  } catch (e: any) {
    console.error("[decision/portfolio]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
