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
/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/decision/insights（P17-03 · AI Decision Center V1.0 聚合分析）
// 单端点聚合：今日决策变化(§5) + AI Alpha 分窗(§8) + Learning Status(§9)。
// 全部只读、批量查询（无 N+1）；不改任何核心表/评分/Runtime。④Today's Decisions/⑥Health/⑦Performance 由前端派生。

function jstMidnightUTC(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${s}T00:00:00.000Z`);
}
const nearestOnOrBefore = <T extends { date: Date }>(rows: T[], cutoff: Date): T | null => {
  let best: T | null = null;
  for (const r of rows) { if (r.date.getTime() <= cutoff.getTime()) { if (!best || r.date > best.date) best = r; } }
  return best;
};

export async function GET(req: Request) {
  const denied = await guardAdminRoute(req);
  if (denied) return denied;

  const p = prisma as any;
  try {
    const holdings = await p.userHolding.findMany({ orderBy: { openDate: "asc" } });
    const symbols: string[] = holdings.map((h: any) => h.symbol);
    const today0 = jstMidnightUTC();

    // ── 并行批量读取（无 N+1）───────────────────────────────────────────────
    const win = [7, 30, 90];
    const maxDays = 95;
    const priceFrom = new Date(today0.getTime() - maxDays * 86_400_000);
    const gmFrom = new Date(today0.getTime() - (maxDays + 5) * 86_400_000);
    const [prices, gmRows, navRows, changeRows, decCount, reviewCount, hitCount, missCount, closedCount] = await Promise.all([
      symbols.length ? p.dailyPrice.findMany({ where: { symbol: { in: symbols }, date: { gte: priceFrom } }, select: { symbol: true, date: true, close: true }, orderBy: { date: "asc" } }) : Promise.resolve([]),
      p.globalMarket.findMany({ where: { date: { gte: gmFrom } }, select: { date: true, topix: true, nikkei: true }, orderBy: { date: "asc" } }),
      p.portfolioNavSnapshot.findMany({ where: { date: { gte: priceFrom } }, orderBy: { date: "asc" }, select: { date: true, equity: true, topix: true, nikkei: true } }),
      symbols.length ? p.tradeDecisionHistory.findMany({ where: { symbol: { in: symbols }, decidedAt: { gte: today0 } }, orderBy: { decidedAt: "desc" } }) : Promise.resolve([]),
      p.tradeDecisionHistory.count(),
      p.tradeDecisionHistory.count({ where: { source: "DAILY_REVIEW" } }),
      p.tradeDecisionHistory.count({ where: { outcome: "HIT" } }),
      p.tradeDecisionHistory.count({ where: { outcome: "MISS" } }),
      p.userTrade.count({ where: { side: "SELL" } }),
    ]);

    // ── §5 今日决策变化：今日的 timeline 行 + 其前一条动作（prevAction）─────────
    const changes: any[] = [];
    if (changeRows.length) {
      const bySym = new Map<string, any[]>();
      for (const r of changeRows) { if (!bySym.has(r.symbol)) bySym.set(r.symbol, []); bySym.get(r.symbol)!.push(r); }
      for (const [sym, rows] of bySym) {
        const todayRow = rows[0]; // 最新一条（decidedAt desc）
        const prevRow = await p.tradeDecisionHistory.findFirst({ where: { symbol: sym, decidedAt: { lt: todayRow.decidedAt } }, orderBy: { decidedAt: "desc" }, select: { action: true } });
        const prevAction = prevRow?.action ?? null;
        if (prevAction && prevAction !== todayRow.action) {
          changes.push({ symbol: sym, name: todayRow.name, prevAction, action: todayRow.action, reasonKey: todayRow.reasonKey, returnPct: todayRow.returnPct, aiScore: todayRow.aiScore });
        }
      }
    }

    // ── §8 AI Alpha：分窗 Portfolio vs TOPIX/Nikkei ──────────────────────────
    const priceBySym = new Map<string, { date: Date; close: number }[]>();
    for (const r of prices) { if (!priceBySym.has(r.symbol)) priceBySym.set(r.symbol, []); priceBySym.get(r.symbol)!.push({ date: r.date, close: Number(r.close) }); }
    const latestClose = (sym: string) => { const a = priceBySym.get(sym); return a && a.length ? a[a.length - 1].close : null; };
    const closeAt = (sym: string, cutoff: Date) => { const a = priceBySym.get(sym); if (!a) return null; const r = nearestOnOrBefore(a, cutoff); return r ? r.close : null; };
    const gmAt = (field: "topix" | "nikkei", cutoff: Date): number | null => {
      const r = nearestOnOrBefore(gmRows.filter((x: any) => x[field] != null), cutoff); return r ? Number((r as any)[field]) : null;
    };
    const gmLatest = (field: "topix" | "nikkei"): number | null => {
      const arr = gmRows.filter((x: any) => x[field] != null); return arr.length ? Number((arr[arr.length - 1] as any)[field]) : null;
    };
    // 权重 = 当前市值（shares × 最新收盘）
    const weights = holdings.map((h: any) => { const c = latestClose(h.symbol); return { h, c, w: c != null ? h.shares * c : 0 }; });
    const totalW = weights.reduce((a: number, x: any) => a + x.w, 0);
    const pctChg = (now: number | null, then: number | null) => (now != null && then != null && then > 0 ? (now / then - 1) * 100 : null);

    // 真账户 NAV 序列（有足够历史时优先用真实净值算 alpha）
    const navSorted = [...navRows].sort((a: any, b: any) => a.date.getTime() - b.date.getTime());
    const navLatest = navSorted.length ? navSorted[navSorted.length - 1] : null;
    const navAt = (cutoff: Date) => nearestOnOrBefore(navSorted, cutoff);

    const windows = win.map((d) => {
      const cutoff = new Date(today0.getTime() - d * 86_400_000);
      // ① 优先：真实 NAV 快照跨越该窗口 → 实测（NAV 收益 vs 同日指数收益）
      const navThen = navAt(cutoff);
      if (navLatest && navThen && navThen.date.getTime() < navLatest.date.getTime() && navThen.equity > 0) {
        const port = (navLatest.equity / navThen.equity - 1) * 100;
        const topix = pctChg(navLatest.topix ?? gmLatest("topix"), navThen.topix ?? gmAt("topix", cutoff));
        const nikkei = pctChg(navLatest.nikkei ?? gmLatest("nikkei"), navThen.nikkei ?? gmAt("nikkei", cutoff));
        return { key: `${d}D`, port: round(port), topix: round(topix), nikkei: round(nikkei), alpha: port != null && topix != null ? round(port - topix) : null, mode: "nav" };
      }
      // ② 回退：当前持仓回看近似（市值加权个股区间收益 vs 指数区间收益）
      let port: number | null = null;
      if (totalW > 0) {
        let acc = 0, wsum = 0;
        for (const { h, c, w } of weights) {
          const then = closeAt(h.symbol, cutoff);
          const r = pctChg(c, then);
          if (r != null && w > 0) { acc += w * r; wsum += w; }
        }
        port = wsum > 0 ? acc / wsum : null;
      }
      const topix = pctChg(gmLatest("topix"), gmAt("topix", cutoff));
      const nikkei = pctChg(gmLatest("nikkei"), gmAt("nikkei", cutoff));
      return { key: `${d}D`, port: round(port), topix: round(topix), nikkei: round(nikkei), alpha: port != null && topix != null ? round(port - topix) : null, mode: "estimate" };
    });

    // Since Start：加权未实现收益 vs 各自建仓日以来 TOPIX
    let sinceStart: any = { port: null, topix: null, nikkei: null, alpha: null };
    if (totalW > 0) {
      let pAcc = 0, tAcc = 0, nAcc = 0, wsum = 0;
      for (const { h, c, w } of weights) {
        if (w <= 0 || c == null || h.avgCost <= 0) continue;
        const pr = (c / h.avgCost - 1) * 100;
        const tThen = gmAt("topix", new Date(h.openDate)); const tNow = gmLatest("topix");
        const nThen = gmAt("nikkei", new Date(h.openDate)); const nNow = gmLatest("nikkei");
        const tr = pctChg(tNow, tThen), nr = pctChg(nNow, nThen);
        pAcc += w * pr; if (tr != null) tAcc += w * tr; if (nr != null) nAcc += w * nr; wsum += w;
      }
      const port = wsum > 0 ? pAcc / wsum : null, topix = wsum > 0 ? tAcc / wsum : null, nikkei = wsum > 0 ? nAcc / wsum : null;
      sinceStart = { port: round(port), topix: round(topix), nikkei: round(nikkei), alpha: port != null && topix != null ? round(port - topix) : null };
    }

    // ── §9 Learning Status（仅统计，不实现学习）────────────────────────────
    const readyKey = closedCount >= 30 ? "dv.ls.ready" : closedCount >= 10 ? "dv.ls.partial" : "dv.ls.collecting";
    const learning = { closedTrades: closedCount, decisionRecords: decCount, reviewRecords: reviewCount, hit: hitCount, miss: missCount, datasetSize: closedCount, readyKey };

    return NextResponse.json({ ok: true, changes, alpha: { windows, sinceStart, navDays: navSorted.length }, learning });
  } catch (e: any) {
    console.error("[decision/insights]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}

function round(v: number | null | undefined, d = 2): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return Math.round(v * 10 ** d) / 10 ** d;
}
