// ── GET /api/decision/track-record（P19-T1 · AI 战绩档案 · 只读聚合）──────────────
// 全站唯一业绩验证入口的数据源。回答「AI 到底准不准」，三条**口径不同、绝不合并**的业绩线：
//   ① 信号线 signal      = AI 每日推荐 TOP10 的前瞻表现（纸面，未扣成本）
//        DailyRecommendation(gptRank≤10) × BacktestPositionResult(选定 horizon)
//   ② 实验线 experiment  = AI Mission Lab 每期战绩（前向实验，含滑点）
//        AiMission / AiMissionNav / AiMissionTrade
//   ③ 账户线 account     = 我的真实账户平仓战绩（真实，含手续费）
//        UserTrade(side=SELL) / UserHolding
//
// ⚠️ 硬边界（P19-T1 设计批准项）：
//   · **零写入**，只 SELECT；无 Schema 变更；不改评分/交易/资金链路/Decision·Mission Engine/Cron
//   · **不新建第二套业绩计算**：每笔收益/Alpha/持有天数一律**直取落库字段**
//     （BacktestPositionResult.returnPct·alphaVsTopix / AiMissionNav.alpha / UserTrade.returnPct·benchTopixPct）
//     本路由只做分组统计（计数/均值/中位/比率），绝不按价格重算任何一笔收益。
//   · 样本 < MIN_SAMPLE 的分组一律回传 sufficient=false，由前端灰显且不给结论。
//   · 失败隔离：任一线出错只让该线 available=false，其余照常返回。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 样本充分性阈值（前端不得硬编码，一律读本字段）。 */
const MIN_SAMPLE = 20;
/** 允许的持有期（仅列 BacktestPositionResult 实际存在的档，实测无 20d/30d/60d/90d）。 */
const HORIZONS = ["1d", "3d", "5d", "7d", "10d"] as const;
const DEFAULT_HORIZON = "7d";
const REC_TAKE = 500;

type Horizon = (typeof HORIZONS)[number];
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const r2 = (v: number) => +v.toFixed(2);
const r3 = (v: number) => +v.toFixed(3);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 分组统计：只做计数/均值/比率，不碰价格。 */
function groupStat(rows: { ret: number; alpha: number | null }[]) {
  const rets = rows.map((r) => r.ret);
  const alphas = rows.map((r) => r.alpha).filter((v): v is number => v != null);
  const n = rets.length;
  return {
    n,
    hitRate: n ? r2((rets.filter((v) => v > 0).length / n) * 100) : null,
    avgReturn: n ? r3(mean(rets)!) : null,
    medianReturn: n ? r3(median(rets)!) : null,
    alpha: alphas.length ? r3(mean(alphas)!) : null,
    sufficient: n >= MIN_SAMPLE,
  };
}

const scoreBucket = (s: number | null | undefined): string =>
  s == null ? "unknown" : s >= 80 ? "80+" : s >= 70 ? "70-79" : s >= 60 ? "60-69" : "<60";

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const hz = (sp.get("horizon") ?? DEFAULT_HORIZON) as Horizon;
  const horizon: Horizon = HORIZONS.includes(hz) ? hz : DEFAULT_HORIZON;
  const line = sp.get("line") ?? "all";
  const want = (k: string) => line === "all" || line === k;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 60) || 60));

  const body: Record<string, unknown> = {
    asOf: iso(new Date()),
    sampleRule: { minSample: MIN_SAMPLE, note: "样本 < minSample 时不给结论，仅供观察" },
  };

  // ── ① 信号线 ────────────────────────────────────────────────────────────────
  if (want("signal")) {
    try {
      const recs = await prisma.dailyRecommendation.findMany({
        where: { gptRank: { lte: 10 } },
        orderBy: { date: "desc" },
        take: REC_TAKE,
        select: {
          date: true, symbol: true, gptRank: true, buyPrice: true, adaptiveScore: true,
          recommendation: true, summaryZh: true,
          feat_adaptiveScore: true, feat_stockStyle: true, feat_sector: true,
        },
      });
      const recDates = [...new Set(recs.map((r) => iso(r.date)!))];
      const dateObjs = recDates.map((d) => new Date(`${d}T00:00:00.000Z`));

      // 一次取回全部 horizon（供 horizonsAvailable 与「按持有期」切片），不做逐 horizon 查询
      const bpr = dateObjs.length
        ? await prisma.backtestPositionResult.findMany({
            where: { horizon: { in: [...HORIZONS] }, returnPct: { not: null }, recDate: { in: dateObjs } },
            select: { recDate: true, symbol: true, horizon: true, returnPct: true, alphaVsTopix: true },
          })
        : [];
      const key = (d: string, s: string, h: string) => `${d}|${s}|${h}`;
      const bprMap = new Map<string, { ret: number; alpha: number | null }>();
      for (const b of bpr) bprMap.set(key(iso(b.recDate)!, b.symbol, b.horizon), { ret: b.returnPct as number, alpha: b.alphaVsTopix ?? null });

      // 名称（StockScore 只读）
      const syms = [...new Set(recs.map((r) => r.symbol))];
      const scores = syms.length
        ? await prisma.stockScore.findMany({ where: { symbol: { in: syms } }, select: { symbol: true, name: true, nameZh: true } })
        : [];
      const nameOf = new Map(scores.map((s) => [s.symbol, { name: s.name, nameZh: s.nameZh }]));

      // 各 horizon 的可用样本（如实回传，前端据此标注每档样本量）
      const horizonsAvailable = HORIZONS.map((h) => {
        const hit = recs.filter((r) => bprMap.has(key(iso(r.date)!, r.symbol, h)));
        return { horizon: h, settled: hit.length, cohortDays: new Set(hit.map((r) => iso(r.date))).size };
      });

      const joined = recs.map((r) => ({ r, o: bprMap.get(key(iso(r.date)!, r.symbol, horizon)) ?? null }));
      const settledRows = joined.filter((x) => x.o != null) as { r: (typeof recs)[number]; o: { ret: number; alpha: number | null } }[];
      const stat = groupStat(settledRows.map((x) => x.o));

      type Extreme = { symbol: string; name: string | null; returnPct: number };
      let best: Extreme | null = null;
      let worst: Extreme | null = null;
      for (const x of settledRows) {
        const nm = nameOf.get(x.r.symbol);
        const item = { symbol: x.r.symbol, name: nm?.nameZh ?? nm?.name ?? null, returnPct: r2(x.o.ret) };
        if (!best || x.o.ret > best.returnPct) best = item;
        if (!worst || x.o.ret < worst.returnPct) worst = item;
      }

      // 按决策日（每根柱 = 一个决策日的 TOP10 平均收益）
      const cohortMap = new Map<string, { count: number; settled: { ret: number; alpha: number | null }[] }>();
      for (const x of joined) {
        const d = iso(x.r.date)!;
        const e = cohortMap.get(d) ?? { count: 0, settled: [] };
        e.count++;
        if (x.o) e.settled.push(x.o);
        cohortMap.set(d, e);
      }
      const byCohort = [...cohortMap.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .slice(0, 30)
        .map(([date, e]) => ({ date, count: e.count, settled: e.settled.length, ...groupStat(e.settled) }));

      // 切片：只在选定 horizon 的已结算样本上做分组
      const sliceBy = (pick: (r: (typeof recs)[number]) => string | null, labeler?: (k: string) => string) => {
        const m = new Map<string, { ret: number; alpha: number | null }[]>();
        for (const x of settledRows) {
          const k = pick(x.r) ?? "unknown";
          const arr = m.get(k) ?? [];
          arr.push(x.o);
          m.set(k, arr);
        }
        return [...m.entries()]
          .map(([k, rows]) => ({ key: k, label: labeler ? labeler(k) : k, ...groupStat(rows) }))
          .sort((a, b) => b.n - a.n);
      };
      const SCORE_ORDER = ["80+", "70-79", "60-69", "<60", "unknown"];
      const byScore = sliceBy((r) => scoreBucket(r.feat_adaptiveScore ?? r.adaptiveScore))
        .sort((a, b) => SCORE_ORDER.indexOf(a.key) - SCORE_ORDER.indexOf(b.key));
      const byStyle = sliceBy((r) => r.feat_stockStyle ?? null);
      const bySector = sliceBy((r) => r.feat_sector ?? null);
      const byHorizon = HORIZONS.map((h) => {
        const rows = recs.map((r) => bprMap.get(key(iso(r.date)!, r.symbol, h))).filter((v): v is { ret: number; alpha: number | null } => v != null);
        return { key: h, label: h, ...groupStat(rows) };
      });

      const records = joined.slice(0, limit).map(({ r, o }) => {
        const nm = nameOf.get(r.symbol);
        return {
          date: iso(r.date), symbol: r.symbol, name: nm?.nameZh ?? nm?.name ?? r.symbol, nameJa: nm?.name ?? null,
          buyPrice: r.buyPrice ?? null,
          returnPct: o ? r2(o.ret) : null,
          alpha: o?.alpha != null ? r2(o.alpha) : null,
          win: o ? o.ret > 0 : null,
          aiScore: r.feat_adaptiveScore ?? r.adaptiveScore ?? null,
          style: r.feat_stockStyle ?? null,
          sector: r.feat_sector ?? null,
          recommendation: r.recommendation ?? null,
          status: o ? "SETTLED" : "PENDING",
        };
      });

      const totalRecommendations = await prisma.dailyRecommendation.count();

      body.signal = {
        available: true,
        horizon,
        horizonsAvailable,
        summary: {
          settled: stat.n,
          pending: joined.length - stat.n,
          cohortDays: new Set(settledRows.map((x) => iso(x.r.date))).size,
          hitRate: stat.hitRate, avgReturn: stat.avgReturn, medianReturn: stat.medianReturn, alpha: stat.alpha,
          best, worst, sufficient: stat.sufficient,
        },
        byCohort,
        slices: { byScore, byStyle, bySector, byHorizon },
        // ⚠️ 两层覆盖率必须分开报：feat_* 只在 DailyRecommendation 创建时写入、永不回填，
        // 而「已结算」的恰是最老的决策日 → 全池覆盖率高不代表**已结算样本内**可用。
        // 实测 2026-07-21：全池 190/250 有 feat_*，但 7d 已结算的 20 笔中为 0 → 风格/行业切片不可用。
        coverage: {
          total: recs.length,
          withStyle: recs.filter((r) => r.feat_stockStyle != null).length,
          withSector: recs.filter((r) => r.feat_sector != null).length,
          settled: settledRows.length,
          settledWithStyle: settledRows.filter((x) => x.r.feat_stockStyle != null).length,
          settledWithSector: settledRows.filter((x) => x.r.feat_sector != null).length,
        },
        records,
        // ⚠️ 全量推荐数含大量未结算，不作为本页统计口径 → 仅作页脚脚注
        footnote: { totalRecommendations, note: "历史推荐总量（含未结算），非本页统计口径" },
      };
    } catch (e) {
      body.signal = { available: false, error: (e as Error).message };
    }
  }

  // ── ② 实验线 ────────────────────────────────────────────────────────────────
  if (want("experiment")) {
    try {
      const missions = await prisma.aiMission.findMany({ orderBy: [{ startDate: "desc" }] });
      const ids = missions.map((m) => m.id);
      const [navs, trades] = await Promise.all([
        ids.length ? prisma.aiMissionNav.findMany({ where: { missionId: { in: ids } }, orderBy: { date: "asc" }, select: { missionId: true, date: true, returnPct: true, drawdownPct: true, topixReturn: true, nikkeiReturn: true, alpha: true } }) : [],
        ids.length ? prisma.aiMissionTrade.findMany({ where: { missionId: { in: ids } }, select: { missionId: true, realizedPnl: true, isWin: true, returnPct: true, holdingDays: true } }) : [],
      ]);
      const now = Date.now();
      const rows = missions.map((m) => {
        const mn = navs.filter((n) => n.missionId === m.id);
        const last = mn.length ? mn[mn.length - 1] : null;
        const tr = trades.filter((t) => t.missionId === m.id);
        const closed = tr.filter((t) => t.realizedPnl != null);
        const wins = closed.filter((t) => t.isWin === true).length;
        // 收益优先取 NAV 落库值；无 NAV 时才由 equity/initial 派生（口径一致，不新建算法）
        const returnPct = last?.returnPct ?? (m.initialCapital > 0 ? r3((m.equityJpy / m.initialCapital - 1) * 100) : null);
        return {
          id: m.id, missionType: m.missionType, periodLabel: m.periodLabel, status: m.status,
          startDate: iso(m.startDate), endDate: iso(m.endDate),
          daysLeft: m.status === "ACTIVE" ? Math.max(0, Math.ceil((new Date(m.endDate).getTime() - now) / 864e5)) : null,
          initialCapital: m.initialCapital, equityJpy: r2(m.equityJpy), realizedPnl: r2(m.realizedPnl),
          returnPct, targetPct: m.targetPct,
          achievedPct: returnPct != null && m.targetPct > 0 ? r2(Math.max(0, (returnPct / m.targetPct) * 100)) : null,
          maxDrawdownPct: mn.length ? r3(Math.min(...mn.map((n) => n.drawdownPct))) : null,
          topixReturn: last?.topixReturn ?? null, nikkeiReturn: last?.nikkeiReturn ?? null, alpha: last?.alpha ?? null,
          trades: tr.length, closedTrades: closed.length,
          winRate: closed.length ? r2((wins / closed.length) * 100) : null,
          avgHoldingDays: closed.length ? r2(mean(closed.map((t) => t.holdingDays ?? 0))!) : null,
          navDays: mn.length,
        };
      });
      const finished = rows.filter((r) => r.status !== "ACTIVE");
      const finRet = finished.map((r) => r.returnPct).filter((v): v is number => v != null);
      const finAlpha = finished.map((r) => r.alpha).filter((v): v is number => v != null);
      body.experiment = {
        available: true,
        missions: rows,
        aggregate: {
          total: rows.length,
          active: rows.filter((r) => r.status === "ACTIVE").length,
          finished: finished.length,
          achieved: finished.filter((r) => r.returnPct != null && r.returnPct >= r.targetPct).length,
          achieveRate: finished.length ? r2((finished.filter((r) => r.returnPct != null && r.returnPct >= r.targetPct).length / finished.length) * 100) : null,
          avgReturn: finRet.length ? r3(mean(finRet)!) : null,
          avgAlpha: finAlpha.length ? r3(mean(finAlpha)!) : null,
          sufficient: finished.length >= 1, // 实验线以「已结束期数」为样本，1 期即可展示，但仍标注期数
        },
      };
    } catch (e) {
      body.experiment = { available: false, error: (e as Error).message };
    }
  }

  // ── ③ 账户线 ────────────────────────────────────────────────────────────────
  if (want("account")) {
    try {
      const [sells, openCount] = await Promise.all([
        prisma.userTrade.findMany({ where: { side: "SELL" }, orderBy: { tradeDate: "desc" }, take: limit,
          select: { tradeDate: true, symbol: true, name: true, shares: true, price: true, returnPct: true, realizedPnl: true, holdingDays: true, benchTopixPct: true, benchNikkeiPct: true, reason: true } }),
        prisma.userHolding.count(),
      ]);
      const closed = sells.length;
      const pnls = sells.map((s) => s.realizedPnl).filter((v): v is number => v != null);
      const rets = sells.map((s) => s.returnPct).filter((v): v is number => v != null);
      const days = sells.map((s) => s.holdingDays).filter((v): v is number => v != null);
      const winSum = pnls.filter((v) => v > 0).reduce((a, b) => a + b, 0);
      const lossSum = Math.abs(pnls.filter((v) => v < 0).reduce((a, b) => a + b, 0));
      const beat = sells.filter((s) => s.returnPct != null && s.benchTopixPct != null && s.returnPct > s.benchTopixPct).length;
      const withBench = sells.filter((s) => s.returnPct != null && s.benchTopixPct != null).length;
      body.account = {
        available: true,
        summary: {
          closed, openHoldings: openCount,
          winRate: pnls.length ? r2((pnls.filter((v) => v > 0).length / pnls.length) * 100) : null,
          avgReturn: rets.length ? r3(mean(rets)!) : null,
          medianReturn: rets.length ? r3(median(rets)!) : null,
          avgHoldingDays: days.length ? r2(mean(days)!) : null,
          profitFactor: lossSum > 0 ? r2(winSum / lossSum) : null,
          beatTopixRate: withBench ? r2((beat / withBench) * 100) : null,
          realizedPnlTotal: pnls.length ? r2(pnls.reduce((a, b) => a + b, 0)) : 0,
          sufficient: closed >= MIN_SAMPLE,
        },
        records: sells.map((s) => ({
          tradeDate: iso(s.tradeDate), symbol: s.symbol, name: s.name, shares: s.shares, price: s.price,
          returnPct: s.returnPct ?? null, realizedPnl: s.realizedPnl ?? null, holdingDays: s.holdingDays ?? null,
          benchTopixPct: s.benchTopixPct ?? null,
          excessPct: s.returnPct != null && s.benchTopixPct != null ? r2(s.returnPct - s.benchTopixPct) : null,
          reason: s.reason ?? null,
        })),
      };
    } catch (e) {
      body.account = { available: false, error: (e as Error).message };
    }
  }

  // ── ④ 三线对照（口径不同 → 仅并列，绝不合并计算）──────────────────────────────
  const sig = body.signal as { available?: boolean; summary?: { settled: number; hitRate: number | null; avgReturn: number | null; alpha: number | null; sufficient: boolean } } | undefined;
  const exp = body.experiment as { available?: boolean; aggregate?: { finished: number; achieveRate: number | null; avgReturn: number | null; avgAlpha: number | null } } | undefined;
  const acc = body.account as { available?: boolean; summary?: { closed: number; winRate: number | null; avgReturn: number | null; sufficient: boolean } } | undefined;
  const rows = [
    { line: "signal", basis: "纸面 · 未扣成本", n: sig?.summary?.settled ?? 0, rate: sig?.summary?.hitRate ?? null, avgReturn: sig?.summary?.avgReturn ?? null, alpha: sig?.summary?.alpha ?? null, benchmark: "TOPIX" },
    { line: "experiment", basis: "前向实验 · 含滑点 0.1%", n: exp?.aggregate?.finished ?? 0, rate: exp?.aggregate?.achieveRate ?? null, avgReturn: exp?.aggregate?.avgReturn ?? null, alpha: exp?.aggregate?.avgAlpha ?? null, benchmark: "TOPIX / Nikkei" },
    { line: "account", basis: "真实账户 · 含手续费", n: acc?.summary?.closed ?? 0, rate: acc?.summary?.winRate ?? null, avgReturn: acc?.summary?.avgReturn ?? null, alpha: null, benchmark: "TOPIX / Nikkei" },
  ];
  const sufficientLines = [sig?.summary?.sufficient, (exp?.aggregate?.finished ?? 0) >= 1, acc?.summary?.sufficient].filter(Boolean).length;
  body.comparison = {
    renderable: sufficientLines >= 2,
    reason: sufficientLines >= 2 ? null : `仅 ${sufficientLines} 条线样本充足（需 ≥2）`,
    rows,
    note: "三条线口径不同：禁止相加、取平均或合并为单一「总胜率」",
  };

  return NextResponse.json(body);
}
