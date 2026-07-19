// ── 组合每日净值快照（真账户 NAV 序列）──────────────────────────────────────
// 每交易日收盘写一条 PortfolioNavSnapshot：equity = 持仓市值 + 现金 + 同日 TOPIX/Nikkei。
// 供 AI Alpha 用真实净值序列对比指数（历史积累后 7D/30D/90D 变为实测，非当前持仓回看）。
// 不改任何核心表；写失败不影响主流程。相对导入（cron 经 tsx 加载）。
import { prisma } from "../prisma";
import { fetchQuotesBatch } from "../yahoo";
import type { Quote } from "../decision-engine";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function jstTodayDate(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${s}T00:00:00.000Z`);
}
function withTimeout<T>(pr: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([pr, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}

export async function writeNavSnapshot(): Promise<any> {
  const p = prisma as any;
  const [holdings, account, gm] = await Promise.all([
    p.userHolding.findMany(),
    p.userAccount.findFirst({ orderBy: { id: "asc" } }),
    p.globalMarket.findFirst({ where: { OR: [{ topix: { not: null } }, { nikkei: { not: null } }] }, orderBy: { date: "desc" }, select: { topix: true, nikkei: true } }),
  ]);
  const cash: number = account?.cash ?? 0;
  const symbols: string[] = holdings.map((h: any) => h.symbol);
  const quotes: Quote[] = symbols.length ? await withTimeout(fetchQuotesBatch(symbols), 8000, [] as any[]) : [];
  const qMap = new Map<string, Quote>(quotes.map((q) => [q.symbol, q]));

  let marketValue = 0;
  for (const h of holdings) {
    const price = qMap.get(h.symbol)?.price ?? null;
    marketValue += price != null ? h.shares * price : h.shares * h.avgCost; // 无实时价回退成本，避免漏计
  }
  // 与页面「总资产」口径一致：未注资(cash≤0)视为满仓，equity=持仓市值；避免负现金污染 NAV/alpha。
  const equity = marketValue + Math.max(0, cash);
  const date = jstTodayDate();
  const data = { equity, marketValue, cash, positions: holdings.length, topix: gm?.topix ?? null, nikkei: gm?.nikkei ?? null };
  return p.portfolioNavSnapshot.upsert({ where: { date }, create: { date, ...data }, update: data });
}
