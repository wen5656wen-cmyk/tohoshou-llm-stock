"use client";

// ── 决策中心 · 历史验证（P9-DECISION-01）─────────────────────────────────────
// 只回答一个问题：过去每次推荐，到底赚没赚到钱。
//
// 数据来源（全部现有只读 API，零后端改动）：
//   · /api/admin/closing-decision?date=YYYY-MM-DD → 当日 verdict/第一推荐/组合/AI分/GPT分/买区/目标/止损
//   · /api/stocks/[symbol]/indicators             → 该股 300 日 OHLCV(含 adjClose) → 前端自行计算实际表现
//
// ⚠️ 价格口径（统一复权，拆股安全 + 杜绝前视偏差）：
//   · 基准 = 推荐日 D 的 **复权收盘价 adjClose_D**（决策于当日 15:15 作出，以当日收盘对齐）
//   · 一周收益 = adjClose_{D+5交易日} / adjClose_D − 1
//   · 实际最高价 = max(high × adjClose/close) over (D, D+5] —— 按各日复权比例换算
//   · 目标/止损为 D 日原始价 → 换算到复权尺度再比较：target_adj = target × (adjClose_D / close_D)
//   · **只使用 D 之后已经发生的 bar**；D 之后交易日 < 5 → 显示「验证中」，绝不提前判定成败。

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppCard, AppLoading, AppEmptyState, AppBadge, COLORS } from "@/components/ui";
import { localeSector } from "@/lib/i18n/market-labels";
import { HOLD_DAYS, evaluateOutcome, type Bar, type Outcome } from "@/lib/decision/outcome";
import { verdictTone } from "@/lib/decision/verdict";

interface Snap {
  date: string;
  verdict: "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH" | null;
  verdictReason: string | null;
  top1: {
    symbol: string; name: string | null; aiScore: number | null; gptScore: number | null;
    price: number | null; target1: number | null; target2: number | null; stopLoss: number | null;
    entryLow: number | null; entryHigh: number | null; confidence: string | null; holdPeriod: string | null;
  } | null;
  portfolio: { symbol: string; name: string | null; weight: number }[];
  top10: { symbol: string; sector?: string | null; reason?: string | null }[];
}
const jpy = (v: number | null | undefined) => (v == null ? "—" : `¥${Math.round(v).toLocaleString()}`);
const pct1 = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(Math.round(v * 10) / 10).toFixed(1)}%`);

/** Outcome Badge：星级 → i18n key（Excellent/Good/Neutral/Weak/Failed） */
const OUTCOME_KEY: Record<number, string> = { 5: "dc.h.oExcellent", 4: "dc.h.oGood", 3: "dc.h.oNeutral", 2: "dc.h.oWeak", 1: "dc.h.oFailed" };
/** AI 置信度校准：高分低收益→过度乐观 / 中低分高收益→偏保守 / 其余→校准良好（仅描述，不改评分） */
function calibrate(ai: number | null, ret: number | null): "opt" | "cons" | "ok" | null {
  if (ai == null || ret == null) return null;
  if (ai >= 80 && ret < 2) return "opt";
  if (ai < 75 && ret >= 8) return "cons";
  return "ok";
}

/** 每笔决策的复盘要点 i18n key（仅基于已发生事实，不推测） */
function lessonKey(o: Outcome, liq: boolean): string {
  if (o.status !== "done") return "dc.rv.lVerifying";
  if (o.hitStop) return "dc.rv.lHitStop";
  if (o.reachedT2) return "dc.rv.lT2";
  if (o.reachedTarget) return "dc.rv.lT1";
  if ((o.weekReturn ?? 0) > 0) return liq ? "dc.rv.lLiqOk" : "dc.rv.lPosNoTarget";
  return "dc.rv.lNeg";
}
/** 失败原因 i18n key（仅在 done 且判定为失败时使用） */
function mistakeKey(o: Outcome): string {
  if (o.hitStop) return "dc.rv.mStop";
  if (o.reachedTarget && (o.weekReturn ?? 0) < 0) return "dc.rv.mFakeBreak";
  return "dc.rv.mNeg";
}
const isFailure = (o: Outcome) => o.status === "done" && (o.hitStop === true || (o.weekReturn ?? 0) < 0);

export default function DecisionHistory() {
  const { t, lang } = useI18n();
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome | null>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const first = await fetch("/api/admin/closing-decision", { cache: "no-store" }).then((r) => r.json());
        const dates: string[] = Array.isArray(first?.availableDates) ? first.availableDates : [];
        const rows = await Promise.all(
          dates.map(async (d) => {
            const j = d === first?.date ? first : await fetch(`/api/admin/closing-decision?date=${d}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
            if (!j || j.empty) return null;
            return {
              date: j.date ?? d, verdict: j.verdict ?? null, verdictReason: j.verdictReason ?? null,
              top1: j.top1 ?? null, portfolio: Array.isArray(j.portfolio) ? j.portfolio : [],
              top10: Array.isArray(j.top10) ? j.top10 : [],
            } as Snap;
          }),
        );
        if (!alive) return;
        setSnaps(rows.filter((r): r is Snap => !!r));
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "load failed"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const loadOutcome = useCallback(async (s: Snap) => {
    if (!s.top1) { setOutcomes((o) => ({ ...o, [s.date]: null })); return; }
    try {
      const j = await fetch(`/api/stocks/${encodeURIComponent(s.top1.symbol)}/indicators`, { cache: "no-store" }).then((r) => r.json());
      const bars: Bar[] = Array.isArray(j?.series?.all) ? j.series.all : [];
      setOutcomes((o) => ({ ...o, [s.date]: evaluateOutcome(bars, s.date, s.top1!.target1, s.top1!.target2, s.top1!.stopLoss) }));
    } catch { setOutcomes((o) => ({ ...o, [s.date]: null })); }
  }, []);

  useEffect(() => {
    snaps.forEach((s) => { if (outcomes[s.date] === undefined) void loadOutcome(s); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaps]);

  if (loading) return <AppLoading label={t("dc.history.title")} />;
  if (error) return <AppEmptyState title={t("dc.ov.loadFail")} desc={error} />;
  if (!snaps.length) return <AppEmptyState title={t("dc.h.empty")} />;

  // ── P13-DECISION-05 AI Review Center 聚合（仅统计已验证 done 决策；无 done → 等待验证，禁止推测）──
  const RECENT = 20;
  const top1Meta = (s: Snap) => {
    const row = s.top10?.find((r) => r.symbol === s.top1?.symbol);
    return { sector: row?.sector ?? null, liq: /流动性/.test(row?.reason ?? "") };
  };
  const recent = snaps.slice(0, RECENT);
  const rows = recent.map((s) => ({ s, o: outcomes[s.date], meta: top1Meta(s) }));
  const doneRows = rows.filter((x): x is { s: Snap; o: Outcome; meta: { sector: string | null; liq: boolean } } => !!x.o && x.o.status === "done" && !!x.s.top1);
  const n = doneRows.length;
  const waitingCount = recent.filter((s) => { const o = outcomes[s.date]; return !!s.top1 && (o === undefined || o?.status === "verifying"); }).length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const acc = n
    ? {
        n,
        successRate: (doneRows.filter((x) => (x.o.weekReturn ?? 0) >= 0).length / n) * 100,
        avgReturn: mean(doneRows.map((x) => x.o.weekReturn ?? 0)),
        avgDD: mean(doneRows.map((x) => x.o.maxDD ?? 0)),
        avgHold: mean(doneRows.map((x) => x.o.holdDays ?? 0)),
        t1Rate: (doneRows.filter((x) => x.o.reachedTarget).length / n) * 100,
        t2Rate: (doneRows.filter((x) => x.o.reachedT2).length / n) * 100,
        stopRate: (doneRows.filter((x) => x.o.hitStop).length / n) * 100,
      }
    : null;
  // Section 2：按行业准确率
  const secMap = new Map<string, { n: number; win: number }>();
  for (const x of doneRows) {
    if (!x.meta.sector) continue;
    const e = secMap.get(x.meta.sector) ?? { n: 0, win: 0 };
    e.n++; if ((x.o.weekReturn ?? 0) >= 0) e.win++;
    secMap.set(x.meta.sector, e);
  }
  const bySector = [...secMap.entries()].map(([sec, v]) => ({ sec, n: v.n, rate: (v.win / v.n) * 100 })).sort((a, b) => b.rate - a.rate);
  // Section 4：失败案例 / Section 5：最佳决策
  const mistakes = doneRows.filter((x) => isFailure(x.o)).map((x) => ({ date: x.s.date, symbol: x.s.top1!.symbol, name: x.s.top1!.name, ret: x.o.weekReturn, reason: mistakeKey(x.o) }));
  const best = [...doneRows].sort((a, b) => (b.o.weekReturn ?? 0) - (a.o.weekReturn ?? 0)).slice(0, 5);
  // Section 6：校准 + 结果分布
  const calRows = doneRows.map((x) => ({ date: x.s.date, symbol: x.s.top1!.symbol, name: x.s.top1!.name, ai: x.s.top1!.aiScore, ret: x.o.weekReturn, cal: calibrate(x.s.top1!.aiScore, x.o.weekReturn) }));
  const calTone: Record<string, string> = { opt: COLORS.danger, cons: COLORS.warning, ok: COLORS.success };
  const calLabel = (c: string | null) => (c === "opt" ? t("dc.h.calOptimistic") : c === "cons" ? t("dc.h.calConservative") : c === "ok" ? t("dc.h.calAccurate") : "—");
  const dist = [5, 4, 3, 2, 1].map((st) => ({ st, count: doneRows.filter((x) => x.o.stars === st).length }));
  const Waiting = () => <div className="text-[12px]" style={{ color: COLORS.textFaint }}>⚪ {t("dc.h.waiting")}</div>;

  return (
    <div className="max-w-[980px] mx-auto space-y-3">
      <AppCard>
        <div className="text-[11px]" style={{ color: COLORS.textFaint }}>ℹ️ {t("dc.h.basis")}</div>
      </AppCard>

      {/* ═══ SECTION 1 · 复盘概览（最近 N 次）═══ */}
      <AppCard header={
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.rv.summary")}</span>
          <span className="text-[11px]" style={{ color: COLORS.textFaint }}>{t("dc.h.recent")} {acc ? acc.n : 0}</span>
        </div>
      }>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {acc ? (
            <>
              <AccTile k={t("dc.h.successRate")} v={pct1(acc.successRate).replace("+", "")} tone={acc.successRate >= 50 ? COLORS.success : COLORS.danger} />
              <AccTile k={t("dc.h.avgReturn")} v={pct1(acc.avgReturn)} tone={acc.avgReturn >= 0 ? COLORS.success : COLORS.danger} />
              <AccTile k={t("dc.h.avgDD")} v={pct1(acc.avgDD)} tone={COLORS.danger} />
              <AccTile k={t("dc.h.avgHold")} v={`${Math.round(acc.avgHold * 10) / 10}${t("dc.h.days")}`} />
              <AccTile k={t("dc.h.t1Rate")} v={pct1(acc.t1Rate).replace("+", "")} tone={COLORS.primary} />
              <AccTile k={t("dc.rv.t2Rate")} v={pct1(acc.t2Rate).replace("+", "")} tone={COLORS.primary} />
              <AccTile k={t("dc.h.stopRate")} v={pct1(acc.stopRate).replace("+", "")} tone={acc.stopRate > 0 ? COLORS.danger : COLORS.textSecondary} />
            </>
          ) : (
            <div className="col-span-2 sm:col-span-4 lg:col-span-7"><Waiting /></div>
          )}
          <AccTile k={t("dc.rv.waitCount")} v={`${waitingCount}`} tone={COLORS.textSecondary} />
        </div>
      </AppCard>

      {/* ═══ SECTION 2 · AI 学到了什么（按行业准确率）═══ */}
      <AppCard header={
        <div>
          <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.rv.learned")}</span>
          <span className="text-[11px] ml-2" style={{ color: COLORS.textFaint }}>{t("dc.rv.learnedNote")}</span>
        </div>
      }>
        {bySector.length ? (
          <div className="space-y-1.5">
            {bySector.map((x) => (
              <div key={x.sec} className="flex items-center gap-2 text-[12px]">
                <span className="w-40 truncate shrink-0" style={{ color: COLORS.text }}>{localeSector(x.sec, lang)}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: COLORS.tile }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, x.rate)}%`, background: x.rate >= 50 ? COLORS.success : COLORS.danger }} />
                </div>
                <span className="w-24 text-right tabular-nums shrink-0" style={{ color: x.rate >= 50 ? COLORS.success : COLORS.danger }}>{Math.round(x.rate)}% <span className="text-[10px]" style={{ color: COLORS.textFaint }}>({x.n})</span></span>
              </div>
            ))}
          </div>
        ) : <Waiting />}
      </AppCard>

      {/* ═══ SECTION 3 · 决策时间轴 ═══ */}
      <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.rv.timeline")}</span>}>
        <div>
          {rows.map(({ s, o, meta }, i) => {
            const isOpen = open === s.date;
            const lessonTxt = o && o.status === "done" ? t(lessonKey(o, meta.liq) as Parameters<typeof t>[0]) : t("dc.rv.lVerifying");
            const done = o?.status === "done";
            return (
              <div key={s.date} className="flex items-stretch gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: done ? ((o!.weekReturn ?? 0) >= 0 ? COLORS.success : COLORS.danger) : COLORS.border }} />
                  {i < rows.length - 1 && <div className="w-px flex-1 my-1" style={{ background: COLORS.borderSoft }} />}
                </div>
                <div className="flex-1 min-w-0 pb-3">
                  <button onClick={() => setOpen(isOpen ? null : s.date)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[12px] tabular-nums font-semibold" style={{ color: COLORS.text }}>{s.date}</span>
                      {s.verdict && <AppBadge tone={verdictTone(s.verdict)}>{t(`dc.verdict.${s.verdict}` as Parameters<typeof t>[0])}</AppBadge>}
                      <span className="text-[12px] truncate min-w-0 flex-1" style={{ color: COLORS.text }}>{s.top1 ? <>{s.top1.name ?? s.top1.symbol} <span className="font-mono text-[10px]" style={{ color: COLORS.textFaint }}>{s.top1.symbol}</span></> : "—"}</span>
                      <span className="text-[13px] font-semibold tabular-nums shrink-0" style={{ color: done ? ((o!.weekReturn ?? 0) >= 0 ? COLORS.success : COLORS.danger) : COLORS.textFaint }}>{done ? pct1(o!.weekReturn) : t("dc.h.verifying")}</span>
                      {done && o!.stars && <span className="text-[12px] shrink-0" style={{ color: COLORS.warning }}>{"★".repeat(o!.stars)}</span>}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: COLORS.textSecondary }}>
                      <span style={{ color: COLORS.textFaint }}>{t("dc.rv.lesson")}：</span>{lessonTxt}
                    </div>
                  </button>
                  {isOpen && s.top1 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 pt-2 mt-1 text-[12px]" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                      <Kv k="AI / GPT" v={`${s.top1.aiScore ?? "—"} / ${s.top1.gptScore ?? "—"}`} />
                      <Kv k={t("dc.h.buyPrice")} v={jpy(s.top1.price)} />
                      <Kv k={t("dc.ov.entryRange")} v={s.top1.entryLow != null ? `${jpy(s.top1.entryLow)}~${jpy(s.top1.entryHigh)}` : "—"} />
                      <Kv k={t("dc.ov.target")} v={jpy(s.top1.target1)} />
                      {done ? (
                        <>
                          <Kv k={t("dc.h.day1")} v={pct1(o!.day1)} tone={(o!.day1 ?? 0) >= 0 ? COLORS.success : COLORS.danger} />
                          <Kv k={t("dc.h.day3")} v={pct1(o!.day3)} tone={(o!.day3 ?? 0) >= 0 ? COLORS.success : COLORS.danger} />
                          <Kv k={t("dc.h.day5")} v={pct1(o!.weekReturn)} tone={(o!.weekReturn ?? 0) >= 0 ? COLORS.success : COLORS.danger} />
                          <Kv k={t("dc.h.maxDD")} v={pct1(o!.maxDD)} tone={COLORS.danger} />
                          <Kv k={`T1 / ${t("dc.h.t2")}`} v={`${o!.reachedTarget ? "✅" : "❌"} / ${o!.reachedT2 == null ? "—" : o!.reachedT2 ? "✅" : "❌"}`} />
                          <Kv k={t("dc.h.outcome")} v={o!.stars ? `${"★".repeat(o!.stars)} ${t(OUTCOME_KEY[o!.stars] as Parameters<typeof t>[0])}` : "—"} tone={COLORS.warning} />
                        </>
                      ) : (
                        <Kv k={t("dc.h.success")} v={`${t("dc.h.verifying")}${o?.status === "verifying" ? `（${o.daysElapsed}/${HOLD_DAYS}）` : ""}`} tone={COLORS.textFaint} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </AppCard>

      {/* ═══ SECTION 4 · 失败案例 ═══ */}
      <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.rv.mistakes")}</span>}>
        {!n ? <Waiting /> : mistakes.length ? (
          <div className="space-y-1">
            {mistakes.map((m) => (
              <div key={m.date} className="flex items-center justify-between gap-2 text-[12px] py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span className="truncate min-w-0" style={{ color: COLORS.text }}><span style={{ color: COLORS.danger }}>✗ </span>{m.name ?? m.symbol} <span className="font-mono text-[10px]" style={{ color: COLORS.textFaint }}>{m.symbol}</span> <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{m.date}</span></span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="tabular-nums" style={{ color: COLORS.danger }}>{pct1(m.ret)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${COLORS.danger}14`, color: COLORS.danger }}>{t(m.reason as Parameters<typeof t>[0])}</span>
                </span>
              </div>
            ))}
          </div>
        ) : <div className="text-[12px]" style={{ color: COLORS.textSecondary }}>✅ {t("dc.rv.noMistakes")}</div>}
      </AppCard>

      {/* ═══ SECTION 5 · 最佳决策（Top5）═══ */}
      <AppCard header={<span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.rv.best")}</span>}>
        {best.length ? (
          <div className="space-y-1">
            {best.map((x, i) => (
              <div key={x.s.date} className="flex items-center justify-between gap-2 text-[12px] py-1" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span className="truncate min-w-0" style={{ color: COLORS.text }}><span style={{ color: COLORS.textFaint }}>{i + 1}. </span>{x.s.top1!.name ?? x.s.top1!.symbol} <span className="font-mono text-[10px]" style={{ color: COLORS.textFaint }}>{x.s.top1!.symbol}</span> <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{x.s.date}</span></span>
                <span className="flex items-center gap-2 shrink-0 tabular-nums">
                  <span className="font-semibold" style={{ color: (x.o.weekReturn ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>{pct1(x.o.weekReturn)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${COLORS.success}14`, color: COLORS.success }}>{x.o.reachedT2 ? t("dc.rv.lT2") : x.o.reachedTarget ? t("dc.rv.lT1") : "★".repeat(x.o.stars ?? 0)}</span>
                </span>
              </div>
            ))}
          </div>
        ) : <Waiting />}
      </AppCard>

      {/* ═══ SECTION 6 · 统计（校准 + 结果分布）═══ */}
      <AppCard header={
        <div>
          <span className="text-[13px] font-semibold" style={{ color: COLORS.text }}>{t("dc.rv.stats")}</span>
          <span className="text-[11px] ml-2" style={{ color: COLORS.textFaint }}>{t("dc.h.calibration")} · {t("dc.rv.dist")}</span>
        </div>
      }>
        {n ? (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] mb-1.5" style={{ color: COLORS.textFaint }}>{t("dc.h.calibration")} · <span>{t("dc.h.calNote")}</span></div>
              <div className="space-y-1">
                {calRows.map((c) => (
                  <div key={c.date} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate min-w-0" style={{ color: COLORS.text }}>{c.name ?? c.symbol} <span className="font-mono text-[10px]" style={{ color: COLORS.textFaint }}>{c.symbol}</span></span>
                    <span className="flex items-center gap-2 shrink-0 tabular-nums">
                      <span style={{ color: COLORS.textSecondary }}>AI {c.ai ?? "—"}</span>
                      <span style={{ color: COLORS.textFaint }}>→</span>
                      <span style={{ color: (c.ret ?? 0) >= 0 ? COLORS.success : COLORS.danger }}>{pct1(c.ret)}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${calTone[c.cal ?? "ok"]}14`, color: calTone[c.cal ?? "ok"] }}>{calLabel(c.cal)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-2" style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
              <div className="text-[11px] mb-1.5" style={{ color: COLORS.textFaint }}>{t("dc.rv.dist")}</div>
              <div className="space-y-1">
                {dist.map((d) => (
                  <div key={d.st} className="flex items-center gap-2 text-[12px]">
                    <span className="w-16 shrink-0" style={{ color: COLORS.warning }}>{"★".repeat(d.st)}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: COLORS.tile }}>
                      <div className="h-full rounded-full" style={{ width: `${n ? (d.count / n) * 100 : 0}%`, background: COLORS.warning }} />
                    </div>
                    <span className="w-8 text-right tabular-nums shrink-0" style={{ color: COLORS.textSecondary }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : <Waiting />}
      </AppCard>
    </div>
  );
}

function Kv({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5" style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
      <span style={{ color: COLORS.textFaint }}>{k}</span>
      <span className="font-medium text-right ml-3" style={{ color: tone ?? COLORS.text }}>{v}</span>
    </div>
  );
}

function AccTile({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: COLORS.tile }}>
      <div className="text-[10px] leading-tight" style={{ color: COLORS.textFaint }}>{k}</div>
      <div className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color: tone ?? COLORS.text }}>{v}</div>
    </div>
  );
}
