import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── GET /api/decision/history（P14-DEV-06 · 只读聚合 · 不改算法/Schema/Cron）────────
// Decision Review Center：「AI 过去的决策表现如何」。后端统一计算，前端零指标计算。
// 真实来源（逐模块）：
//   ①③④⑤⑥ 每笔前瞻收益 SSOT = BacktestPositionResult(horizon=7d, returnPct/alphaVsTopix)
//            join DailyRecommendation(gptRank≤10 → 决策级 TOP10；feat_* 真实因子快照/理由/AI评分)
//   ① 累计收益/最大回撤 ← StrategySnapshot(逐日 NAV 形态→真实回撤；cumulativeReturnPct 资本加权→累计)
//     胜率 ← PaperPosition(CLOSED)；累计推荐数 ← DailyRecommendation.count
//   ② Timeline ← ClosingDecision(逐日一条) join 该 recDate 的 TOP10 7d 平均前瞻收益
//   ③ Records  ← DailyRecommendation join StockScore(名称/目标/止损/现价) + BPR(最终收益)
//   ④ 6 类 ← DailyRecommendation.feat_* 主导因子归类 + AITheme(热点)
//   ⑤⑥ ← 已结算 TOP10 按胜/负拆分（真实 returnPct 驱动）
//   ⑦ AI Learning ← 硬降级：项目内无任何"AI 学习/规则权重变更"真实产物（StrategyBacktestResult 亦为空），
//                    仅确定性 StrategyLearningReport 就绪度评级（明示"非 AI 学习总结"），绝不伪造。

const num = (v: unknown): number | null => { if (v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const STRATS = ["DAY_TRADE", "SWING_TRADE", "LONG_TRADE"] as const;
const MOMENTUM = new Set(["SPECULATIVE_MOMENTUM", "GROWTH_MOMENTUM"]);
const CATS = ["breakout", "trend", "hot", "news", "flow", "value"] as const;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// 按推荐时主导因子归 6 类（真实 feat_* 快照，非贴标签）
function categorize(r: any, themeSet: Set<string>): string {
  const news = (r.feat_newsSentimentScore ?? 0) / 15;
  const flow = (r.feat_moneyFlowScore ?? 0) / 20;
  const fund = (r.feat_fundamentalScore ?? 0) / 25;
  const tech = (r.feat_technicalScore ?? 0) / 30;
  const maxDim = Math.max(news, flow, fund, tech);
  if (news === maxDim && news >= 0.6) return "news";
  if (flow === maxDim && flow >= 0.5) return "flow";
  if (fund === maxDim && fund >= 0.5) return "value";
  if (themeSet.has(r.symbol)) return "hot";
  if (MOMENTUM.has(r.feat_stockStyle ?? "")) return "breakout";
  return "trend";
}

export async function GET() {
  const p = prisma as any;
  try {
    const [totalRecs, top10Recs, closings, themeRows, snaps, closedPos, learnRows] = await Promise.all([
      p.dailyRecommendation.count(),
      p.dailyRecommendation.findMany({ where: { gptRank: { lte: 10 } }, orderBy: { date: "desc" }, take: 400, select: { date: true, symbol: true, gptRank: true, buyPrice: true, entryPrice: true, gptScore: true, adaptiveScore: true, recommendation: true, summaryZh: true, feat_technicalScore: true, feat_fundamentalScore: true, feat_moneyFlowScore: true, feat_newsSentimentScore: true, feat_stockStyle: true, stopLossPct: true } }),
      p.closingDecision.findMany({ orderBy: { date: "desc" }, take: 30, select: { date: true, verdict: true, verdictReason: true, regime: true, avgAiScore: true, summary: true, top10: true } }),
      p.aITheme.findMany({ select: { symbol: true }, distinct: ["symbol"] }),
      p.strategySnapshot.findMany({ where: { strategyType: { in: STRATS as unknown as string[] } }, orderBy: { snapshotDate: "asc" }, select: { strategyType: true, snapshotDate: true, totalValue: true, cumulativeReturnPct: true } }),
      p.paperPosition.findMany({ where: { status: "CLOSED" }, select: { returnAmount: true } }),
      p.strategyLearningReport.findMany({ orderBy: { reportDate: "desc" }, take: 12, select: { strategyType: true, reportDate: true, grade: true, integrityScore: true, recommendation: true } }),
    ]);
    const themeSet = new Set<string>(themeRows.map((r: any) => r.symbol));

    // ── 每笔前瞻收益：BacktestPositionResult(7d) 按 (recDate,symbol) join ────────────
    const recDates = [...new Set<string>(top10Recs.map((r: any) => iso(r.date)!))];
    const dateObjs = recDates.map((d) => new Date(d + "T00:00:00.000Z"));
    const bpr = recDates.length
      ? await p.backtestPositionResult.findMany({ where: { horizon: "7d", returnPct: { not: null }, recDate: { in: dateObjs } }, select: { recDate: true, symbol: true, returnPct: true, alphaVsTopix: true } })
      : [];
    const bprMap = new Map<string, { ret: number; alpha: number | null }>();
    for (const b of bpr) bprMap.set(`${iso(b.recDate)}|${b.symbol}`, { ret: b.returnPct, alpha: num(b.alphaVsTopix) });
    const retOf = (r: any) => bprMap.get(`${iso(r.date)}|${r.symbol}`) ?? null;

    // 已结算 TOP10（有 7d 前瞻收益）
    const settled = top10Recs.map((r: any) => ({ r, o: retOf(r) })).filter((x: any) => x.o != null);

    // ── ① Performance Summary ──────────────────────────────────────────────────────
    const rets = settled.map((x: any) => x.o.ret as number);
    const alphas = settled.map((x: any) => x.o.alpha).filter((v: any): v is number => v != null);
    const winners = rets.filter((v: number) => v > 0).length;
    const hitRate = rets.length ? (winners / rets.length) * 100 : null;
    const avgReturn = mean(rets);
    const alpha = mean(alphas);
    let best: { v: number; sym: string } | null = null, worst: { v: number; sym: string } | null = null;
    for (const x of settled) { const v = x.o.ret; if (best == null || v > best.v) best = { v, sym: x.r.symbol }; if (worst == null || v < worst.v) worst = { v, sym: x.r.symbol }; }
    const cohortDays = new Set(settled.map((x: any) => iso(x.r.date))).size;

    // 累计收益（三策略 cumulativeReturnPct 资本加权）+ 最大回撤（逐日 NAV 形态）
    const latestByStrat = new Map<string, { tv: number | null; cum: number | null }>();
    for (const s of snaps) latestByStrat.set(s.strategyType, { tv: num(s.totalValue), cum: num(s.cumulativeReturnPct) }); // snaps asc → 末次覆盖=最新
    let baseSum = 0, nowSum = 0, haveCum = false;
    for (const st of STRATS) { const e = latestByStrat.get(st); if (e?.tv != null && e.cum != null) { const b = e.tv / (1 + e.cum / 100); baseSum += b; nowSum += e.tv; haveCum = true; } }
    const cumulativeReturn = haveCum && baseSum > 0 ? (nowSum / baseSum - 1) * 100 : null;
    // 逐日组合 NAV（三策略 totalValue 前向填充，仅当三策略都出现后计入）→ 真实回撤（形态无关基数）
    const dateSet = [...new Set<string>(snaps.map((s: any) => iso(s.snapshotDate)!).filter(Boolean))].sort();
    const byDate = new Map<string, any[]>();
    for (const s of snaps) { const d = iso(s.snapshotDate)!; if (!byDate.has(d)) byDate.set(d, []); byDate.get(d)!.push(s); }
    const lastVal = new Map<string, number>(); const nav: number[] = [];
    for (const d of dateSet) { for (const s of byDate.get(d) ?? []) if (s.totalValue != null) lastVal.set(s.strategyType, s.totalValue); if (lastVal.size === STRATS.length) nav.push(STRATS.reduce((a, st) => a + (lastVal.get(st) ?? 0), 0)); }
    let peak = -Infinity, maxDrawdown: number | null = null;
    for (const v of nav) { if (v > peak) peak = v; if (peak > 0) { const dd = ((v - peak) / peak) * 100; if (maxDrawdown == null || dd < maxDrawdown) maxDrawdown = dd; } }
    const closedWins = closedPos.filter((c: any) => (c.returnAmount ?? 0) > 0).length;
    const winRate = closedPos.length > 0 ? (closedWins / closedPos.length) * 100 : null;

    const summary = {
      totalRecommendations: totalRecs, cumulativeReturn, hitRate, avgReturn, alpha,
      bestReturn: best?.v ?? null, bestSymbol: best?.sym ?? null,
      worstReturn: worst?.v ?? null, worstSymbol: worst?.sym ?? null,
      maxDrawdown, winRate, cohortDays, horizon: "7d",
    };

    // ── ④⑤⑥ 策略分类统计（真实 feat_* 归类 + 胜/负拆分） ──────────────────────────
    const acc: Record<string, { n: number; ret: number[]; win: number }> = {};
    const winAcc: Record<string, number> = {}, lossAcc: Record<string, number> = {}, lossRet: Record<string, number[]> = {};
    for (const c of CATS) { acc[c] = { n: 0, ret: [], win: 0 }; winAcc[c] = 0; lossAcc[c] = 0; lossRet[c] = []; }
    let stopHits = 0;
    for (const x of settled) {
      const cat = categorize(x.r, themeSet); const ret = x.o.ret as number;
      acc[cat].n++; acc[cat].ret.push(ret); if (ret > 0) { acc[cat].win++; winAcc[cat]++; } else { lossAcc[cat]++; lossRet[cat].push(ret); }
      if (x.r.stopLossPct != null && ret <= -Math.abs(x.r.stopLossPct)) stopHits++;
    }
    const strategyAnalysis = CATS.map((c) => ({ categoryKey: `dv.dh.cat.${c}`, count: acc[c].n, avgReturn: mean(acc[c].ret), hitRate: acc[c].n ? (acc[c].win / acc[c].n) * 100 : null })).sort((a, b) => b.count - a.count);
    const totalWins = Object.values(winAcc).reduce((a, b) => a + b, 0);
    const totalLoss = Object.values(lossAcc).reduce((a, b) => a + b, 0);
    const successReasons = CATS.filter((c) => winAcc[c] > 0).map((c) => ({ categoryKey: `dv.dh.cat.${c}`, count: winAcc[c], pct: totalWins ? (winAcc[c] / totalWins) * 100 : null, avgReturn: mean(acc[c].ret.filter((x) => x > 0)) })).sort((a, b) => b.count - a.count);
    const failureReasons = CATS.filter((c) => lossAcc[c] > 0).map((c) => ({ categoryKey: `dv.dh.cat.${c}`, count: lossAcc[c], pct: totalLoss ? (lossAcc[c] / totalLoss) * 100 : null, avgReturn: mean(lossRet[c]) })).sort((a, b) => b.count - a.count);

    // ── ② Timeline（ClosingDecision + 该 recDate TOP10 7d 平均前瞻收益） ────────────
    const retByDate = new Map<string, number[]>();
    for (const x of settled) { const d = iso(x.r.date)!; if (!retByDate.has(d)) retByDate.set(d, []); retByDate.get(d)!.push(x.o.ret); }
    const timeline = closings.map((c: any) => {
      const top = Array.isArray(c.top10) ? (c.top10 as any[]).slice(0, 3).map((t) => t.name ?? t.symbol) : [];
      const dr = retByDate.get(iso(c.date)!);
      return { date: iso(c.date), verdict: c.verdict ?? null, verdictReason: c.verdictReason ?? null, regime: c.regime ?? null, avgAiScore: num(c.avgAiScore), summary: c.summary ?? null, finalReturn: dr && dr.length ? mean(dr) : null, topPicks: top };
    });

    // ── ③ Records（已结算 TOP10 优先→有真实前瞻收益供复盘，再补最近进行中，取 40） ──
    const settledKeys = new Set(settled.map((x: any) => `${iso(x.r.date)}|${x.r.symbol}`));
    const recent = [...settled.map((x: any) => x.r), ...top10Recs.filter((r: any) => !settledKeys.has(`${iso(r.date)}|${r.symbol}`))].slice(0, 40);
    const recSyms = [...new Set<string>(recent.map((r: any) => r.symbol))];
    const scoreRows = recSyms.length ? await p.stockScore.findMany({ where: { symbol: { in: recSyms } }, select: { symbol: true, name: true, nameZh: true, target1: true, stopLoss: true, latestClose: true } }) : [];
    const sMap = new Map<string, any>(scoreRows.map((r: any) => [r.symbol, r]));
    const records = recent.map((r: any) => {
      const sc = sMap.get(r.symbol); const o = retOf(r); const ret = o ? o.ret : null;
      const st = ret == null ? { key: "dv.dh.ex.holding", tone: "neutral" } : ret > 0 ? { key: "dv.dh.ex.hit", tone: "green" } : { key: "dv.dh.ex.miss", tone: "red" };
      return { date: iso(r.date), symbol: r.symbol, name: sc?.nameZh || sc?.name || r.symbol, buyPrice: num(r.buyPrice ?? r.entryPrice), currentPrice: num(sc?.latestClose), target1: num(sc?.target1), stopLoss: num(sc?.stopLoss), finalReturn: ret, aiScore: num(r.gptScore ?? r.adaptiveScore), recommendation: r.recommendation ?? null, reason: r.summaryZh ?? null, statusKey: st.key, statusTone: st.tone };
    });

    // ── ⑦ AI Learning（硬降级） ────────────────────────────────────────────────────
    const seen = new Set<string>();
    const readiness = learnRows.filter((r: any) => { if (seen.has(r.strategyType)) return false; seen.add(r.strategyType); return true; })
      .map((r: any) => ({ strategyType: r.strategyType, reportDate: iso(r.reportDate), grade: r.grade ?? null, integrityScore: num(r.integrityScore), recommendation: r.recommendation ?? null }));
    const aiLearning = { available: false, note: "系统评分权重为按风格静态配置（STYLE_WEIGHTS 硬编码），无随时间学习的规则提权/降权记录", readiness };

    return NextResponse.json({
      empty: top10Recs.length === 0 && closings.length === 0 && totalRecs === 0,
      summary, timeline, records, strategyAnalysis, successReasons, failureReasons,
      analysis: { settledCount: settled.length, stopHits, totalWins, totalLoss },
      aiLearning,
      asOf: iso(closings[0]?.date) ?? (settled[0] ? iso(settled[0].r.date) : null),
      sourceStatus: { backtest: settled.length ? "ok" : "insufficient", closing: closings.length ? "ok" : "missing", nav: nav.length >= 2 ? "ok" : "insufficient", learning: readiness.length ? "ok" : "missing" },
    });
  } catch (e: any) {
    console.error("[decision/history]", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
