// 🔒 P21-P0-API-G1 · 访问级别：AUTHENTICATED（个人资产 / 决策数据）
//
// 逻辑分类是 AUTHENTICATED —— 属于账户主人，而非运维。本轮技术上暂与 ADMIN_ONLY
// 共用 admin_session Cookie / x-admin-token（系统单租户，尚无普通用户体系）。
// **凭证相同不等于分类相同**：后续拆权限等级时，本文件应归入用户级而非管理员级。
//
// 封闭前状态：未登录公网可读写（P21-P0-API 审计实测 200）。
// ── P18 · AI Mission Lab · 只读聚合 API（M3-v1 · /decision-v2?tab=portfolio 接管）──
// 只读 ai_mission_*（+ StockScore 只读取公司名）；后端聚合，前端零指标计算；缺数据显空态，绝不伪造。
// 不改评分/Decision Engine/PaperBroker/资金链路。
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getJPXTradingDayStatus } from "@/lib/trading-calendar/jpx";
import { guardAdminRoute } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  try {
    const missions = await prisma.aiMission.findMany({
      where: { status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: [{ missionType: "asc" }, { startDate: "desc" }],
    });
    // 每 type 取最新一个（当前进行中/最近）
    const byType = new Map<string, typeof missions[number]>();
    for (const m of missions) if (!byType.has(m.missionType)) byType.set(m.missionType, m);
    const chosen = [...byType.values()];

    const views: Json[] = [];
    for (const m of chosen) {
      const [positions, navs, decisions, trades] = await Promise.all([
        prisma.aiMissionPosition.findMany({ where: { missionId: m.id, status: "OPEN" }, orderBy: { openedAt: "desc" } }),
        prisma.aiMissionNav.findMany({ where: { missionId: m.id }, orderBy: { date: "asc" } }),
        prisma.aiMissionDecision.findMany({ where: { missionId: m.id }, orderBy: { decidedAt: "desc" }, take: 60 }),
        prisma.aiMissionTrade.findMany({ where: { missionId: m.id }, orderBy: { executedAt: "desc" }, take: 60 }),
      ]);

      // symbol → 公司名（StockScore 只读）
      const syms = [...new Set([...positions.map((p) => p.symbol), ...decisions.map((d) => d.symbol).filter((s): s is string => !!s), ...trades.map((t) => t.symbol)])];
      const scores = syms.length ? await prisma.stockScore.findMany({ where: { symbol: { in: syms } }, select: { symbol: true, name: true, nameZh: true } }) : [];
      const nameOf = new Map(scores.map((s) => [s.symbol, s.nameZh || s.name]));

      const tradeByDecision = new Map(trades.filter((t) => t.decisionId).map((t) => [t.decisionId as string, t]));
      const positionsValue = positions.reduce((s, p) => s + p.marketValue, 0);
      const latestNav = navs.length ? navs[navs.length - 1] : null;

      // 今日待跟单 = 最近一批 decidedAt（同一 JST 交易日）的决策
      // ⚠️ 必须按 JST 日历日分组，不能用 toISOString()（= UTC 日）：08:20 JST 是前一日 23:20Z、
      // 09:30 JST 是当日 00:30Z，两者会被 UTC 切成两天 → latestDay 显示昨日，且同一交易日的
      // Phase1/Phase2 决策被拆散、漏出「今日」。日历日一律取全站唯一来源 getJPXTradingDayStatus().date。
      const jstDayOf = (d: Date) => getJPXTradingDayStatus(d).date;
      const latestDay = decisions.length ? jstDayOf(decisions[0].decidedAt) : null;
      const todayDecisions = decisions
        .filter((d) => latestDay && jstDayOf(d.decidedAt) === latestDay)
        .map((d) => {
          const tr = tradeByDecision.get(d.id);
          return {
            id: d.id, action: d.action, symbol: d.symbol, name: d.symbol ? nameOf.get(d.symbol) ?? d.symbol : null,
            qty: d.qty, status: d.status, refPrice: d.refPrice,
            aiScore: d.aiScore, recommendation: d.recommendation, riskLevel: d.riskLevel,
            executionPrice: tr?.executionPrice ?? null, followablePriceLow: tr?.followablePriceLow ?? null, followablePriceHigh: tr?.followablePriceHigh ?? null,
            marketPriceAt: tr?.marketPriceAt ?? null, priceSource: tr?.priceSource ?? null,
            executionWindow: d.executionWindow, signalTime: d.signalTime, decidedAt: d.decidedAt, explainWhy: d.explainWhy,
          };
        });

      views.push({
        id: m.id, missionType: m.missionType, periodLabel: m.periodLabel, status: m.status,
        startDate: m.startDate, endDate: m.endDate, strategyVersion: m.strategyVersion,
        summary: {
          initialCapital: m.initialCapital, cashJpy: m.cashJpy, positionsValue: +positionsValue.toFixed(2),
          equityJpy: m.equityJpy, realizedPnl: m.realizedPnl,
          returnPct: +((m.equityJpy / m.initialCapital - 1) * 100).toFixed(2),
          targetPct: m.targetPct, drawdownPct: latestNav?.drawdownPct ?? 0,
          positionCount: positions.length,
        },
        todayDecisions, latestDay,
        positions: positions.map((p) => ({
          symbol: p.symbol, name: nameOf.get(p.symbol) ?? p.symbol, qty: p.qty, avgCost: p.avgCost,
          lastPrice: p.lastPrice, marketValue: p.marketValue, unrealizedPnl: p.unrealizedPnl, unrealizedPct: p.unrealizedPct,
          maxUnrealizedGain: p.maxUnrealizedGain, maxDrawdownPct: p.maxDrawdownPct, takeProfitPrice: p.takeProfitPrice, stopLossPrice: p.stopLossPrice, openedAt: p.openedAt,
        })),
        nav: navs.map((n) => ({ date: n.date.toISOString().slice(0, 10), equity: n.equityJpy, returnPct: n.returnPct, topixReturn: n.topixReturn, nikkeiReturn: n.nikkeiReturn, alpha: n.alpha, drawdownPct: n.drawdownPct })),
        log: [
          ...decisions.map((d) => ({ kind: "decision" as const, at: d.decidedAt, action: d.action, symbol: d.symbol, name: d.symbol ? nameOf.get(d.symbol) ?? d.symbol : null, qty: d.qty, status: d.status, explainWhy: d.explainWhy })),
          ...trades.map((t) => ({ kind: "trade" as const, at: t.executedAt, action: t.action, symbol: t.symbol, name: nameOf.get(t.symbol) ?? t.symbol, qty: t.qty, price: t.executionPrice ?? t.price, followLow: t.followablePriceLow, followHigh: t.followablePriceHigh, realizedPnl: t.realizedPnl, returnPct: t.returnPct, isWin: t.isWin })),
        ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 40),
      });
    }

    return NextResponse.json({ missions: views, asOf: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, missions: [] }, { status: 500 });
  }
}
