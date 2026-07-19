// ── P18-M1-H2 · Mission Audit（只读回放：Signal→Decision→Explain→Execution→Position→NAV）──
// 全部派生自已有 ai_mission_*（trade + decision + nav），绝不重复存储、绝不修改任何交易。
import { prisma } from "../prisma";

interface HoldSnap { symbol: string; qty: number; avgCost: number }
export interface AuditReplay {
  tradeId: string; executedAt: Date; missionType: string; periodLabel: string;
  symbol: string; name: string; action: string; qty: number;
  signalTime: Date | null; marketPriceAt: Date | null; priceSource: string | null;
  executionPrice: number | null; suggestedLow: number | null; suggestedHigh: number | null;
  aiScore: number | null; industryHeat: number | null; newsImpact: number | null; riskLevel: string | null;
  recommendation: string | null; rulesTriggered: string[]; strategyVersion: string | null; explainWhy: string | null;
  positionBefore: HoldSnap | null; positionAfter: HoldSnap | null;
  cashBefore: number | null; cashAfter: number | null;
  realizedPnl: number | null; returnPct: number | null;
  missionReturn: number | null; alpha: number | null;
}

const dstr = (d: Date) => d.toISOString().slice(0, 10);
const asStrArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function buildAuditTimeline(limit = 200): Promise<AuditReplay[]> {
  const trades = await prisma.aiMissionTrade.findMany({ orderBy: { executedAt: "desc" }, take: limit });
  if (!trades.length) return [];
  const decIds = trades.map((t) => t.decisionId).filter((s): s is string => !!s);
  const misIds = [...new Set(trades.map((t) => t.missionId))];
  const [decisions, missions] = await Promise.all([
    decIds.length ? prisma.aiMissionDecision.findMany({ where: { id: { in: decIds } } }) : Promise.resolve([]),
    prisma.aiMission.findMany({ where: { id: { in: misIds } }, select: { id: true, missionType: true, periodLabel: true } }),
  ]);
  const decMap = new Map(decisions.map((d) => [d.id, d]));
  const misMap = new Map(missions.map((m) => [m.id, m]));

  // NAV（按 mission + 成交日）
  const navKeys = trades.map((t) => ({ missionId: t.missionId, date: new Date(`${dstr(t.executedAt)}T00:00:00.000Z`) }));
  const navs = navKeys.length ? await prisma.aiMissionNav.findMany({ where: { OR: navKeys }, select: { missionId: true, date: true, returnPct: true, alpha: true } }) : [];
  const navMap = new Map(navs.map((n) => [`${n.missionId}|${dstr(n.date)}`, n]));

  // 名称
  const syms = [...new Set(trades.map((t) => t.symbol))];
  const scores = syms.length ? await prisma.stockScore.findMany({ where: { symbol: { in: syms } }, select: { symbol: true, name: true, nameZh: true } }) : [];
  const nameMap = new Map(scores.map((s) => [s.symbol, s.nameZh || s.name]));

  return trades.map((t) => {
    const d = t.decisionId ? decMap.get(t.decisionId) : undefined;
    const mis = misMap.get(t.missionId);
    const snaps = (d?.holdingsSnapshot as HoldSnap[] | undefined) ?? [];
    const before = snaps.find((h) => h.symbol === t.symbol) ?? null;
    const isBuy = t.action === "BUY" || t.action === "ADD";
    const price = t.executionPrice ?? t.price;
    let after: HoldSnap | null = null;
    if (before) {
      if (isBuy) { const q = before.qty + t.qty; after = { symbol: t.symbol, qty: q, avgCost: +((before.qty * before.avgCost + t.qty * price) / q).toFixed(2) }; }
      else { const q = before.qty - t.qty; after = q > 0 ? { symbol: t.symbol, qty: q, avgCost: before.avgCost } : { symbol: t.symbol, qty: 0, avgCost: before.avgCost }; }
    } else if (isBuy) {
      after = { symbol: t.symbol, qty: t.qty, avgCost: price };
    }
    const cashBefore = d?.cashJpy ?? null;
    const cashAfter = cashBefore == null ? null : +(cashBefore + (isBuy ? -t.amount : t.amount)).toFixed(2);
    const nav = navMap.get(`${t.missionId}|${dstr(t.executedAt)}`);
    return {
      tradeId: t.id, executedAt: t.executedAt, missionType: mis?.missionType ?? "—", periodLabel: mis?.periodLabel ?? "—",
      symbol: t.symbol, name: nameMap.get(t.symbol) ?? t.symbol, action: t.action, qty: t.qty,
      signalTime: t.signalTime, marketPriceAt: t.marketPriceAt, priceSource: t.priceSource,
      executionPrice: price, suggestedLow: t.followablePriceLow, suggestedHigh: t.followablePriceHigh,
      aiScore: d?.aiScore ?? null, industryHeat: d?.industryHeat ?? null, newsImpact: d?.newsImpact ?? null, riskLevel: d?.riskLevel ?? null,
      recommendation: d?.recommendation ?? null, rulesTriggered: asStrArr(d?.rulesTriggered), strategyVersion: d?.strategyVersion ?? null, explainWhy: d?.explainWhy ?? null,
      positionBefore: before, positionAfter: after,
      cashBefore, cashAfter, realizedPnl: t.realizedPnl, returnPct: t.returnPct,
      missionReturn: nav?.returnPct ?? null, alpha: nav?.alpha ?? null,
    };
  });
}
