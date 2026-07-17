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

const HOLD_DAYS = 5; // 一周 ≈ 5 个交易日

interface Bar { date: string; open?: number; high?: number; low?: number; close: number; adjClose?: number | null }
interface Snap {
  date: string;
  verdict: "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH" | null;
  verdictReason: string | null;
  top1: {
    symbol: string; name: string | null; aiScore: number | null; gptScore: number | null;
    price: number | null; target1: number | null; stopLoss: number | null;
    entryLow: number | null; entryHigh: number | null; confidence: string | null; holdPeriod: string | null;
  } | null;
  portfolio: { symbol: string; name: string | null; weight: number }[];
}
type Outcome = {
  status: "verifying" | "done";
  daysElapsed: number;
  weekReturn: number | null;
  actualHighRaw: number | null;
  reachedTarget: boolean | null;
  hitStop: boolean | null;
  stars: number | null;
  review: string;
};

const VERDICT_TONE: Record<string, "green" | "amber" | "red"> = { BUY_TODAY: "green", WATCH_ONLY: "amber", STAY_CASH: "red" };
const jpy = (v: number | null | undefined) => (v == null ? "—" : `¥${Math.round(v).toLocaleString()}`);
const pct1 = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(Math.round(v * 10) / 10).toFixed(1)}%`);

/** 由已实现收益派生星级（客观复盘，不含任何预测）：≥+10% 5★ / ≥+5% 4★ / ≥0 3★ / ≥−5% 2★ / else 1★ */
const starsOf = (r: number): number => (r >= 10 ? 5 : r >= 5 ? 4 : r >= 0 ? 3 : r >= -5 ? 2 : 1);

/** 用复权序列计算推荐日之后的真实表现；交易日不足 → verifying（绝不提前判定成败） */
function evaluate(bars: Bar[], d: string, target: number | null, stop: number | null): Outcome | null {
  const asc = [...bars].sort((a, b) => (a.date < b.date ? -1 : 1));
  const i = asc.findIndex((b) => b.date === d);
  if (i < 0) return null; // 推荐日不在序列中（停牌等）→ 无法验证，安全空态
  const base = asc[i];
  const baseAdj = base.adjClose ?? base.close;
  if (!(baseAdj > 0)) return null;
  const ratio = base.close > 0 ? baseAdj / base.close : 1; // D 日复权比例：原始价 → 复权尺度

  const after = asc.slice(i + 1); // ← 严格只用 D 之后已发生的 bar，杜绝前视偏差
  if (after.length < HOLD_DAYS) {
    return { status: "verifying", daysElapsed: after.length, weekReturn: null, actualHighRaw: null, reachedTarget: null, hitStop: null, stars: null, review: "" };
  }
  const win = after.slice(0, HOLD_DAYS);
  const endAdj = win[win.length - 1].adjClose ?? win[win.length - 1].close;
  const weekReturn = (endAdj / baseAdj - 1) * 100;
  const adjOf = (b: Bar, v: number | undefined) => (v != null && b.close > 0 ? v * ((b.adjClose ?? b.close) / b.close) : (b.adjClose ?? b.close));
  const actualHigh = Math.max(...win.map((b) => adjOf(b, b.high)));
  const actualLow = Math.min(...win.map((b) => adjOf(b, b.low)));

  const targetAdj = target != null ? target * ratio : null;
  const stopAdj = stop != null ? stop * ratio : null;
  const reachedTarget = targetAdj != null ? actualHigh >= targetAdj : null;
  const hitStop = stopAdj != null ? actualLow <= stopAdj : null;

  const review = reachedTarget
    ? `${HOLD_DAYS} 个交易日内触及目标价，达标`
    : hitStop
    ? `${HOLD_DAYS} 个交易日内触及止损价`
    : weekReturn >= 0
    ? "未触及目标价，但收于正收益"
    : "未触及目标价，收于负收益";

  return { status: "done", daysElapsed: after.length, weekReturn, actualHighRaw: ratio > 0 ? actualHigh / ratio : actualHigh, reachedTarget, hitStop, stars: starsOf(weekReturn), review };
}

export default function DecisionHistory() {
  const { t } = useI18n();
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
      setOutcomes((o) => ({ ...o, [s.date]: evaluate(bars, s.date, s.top1!.target1, s.top1!.stopLoss) }));
    } catch { setOutcomes((o) => ({ ...o, [s.date]: null })); }
  }, []);

  useEffect(() => {
    snaps.forEach((s) => { if (outcomes[s.date] === undefined) void loadOutcome(s); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaps]);

  if (loading) return <AppLoading label={t("dc.history.title")} />;
  if (error) return <AppEmptyState title={t("dc.ov.loadFail")} desc={error} />;
  if (!snaps.length) return <AppEmptyState title={t("dc.h.empty")} />;

  return (
    <div className="max-w-[980px] mx-auto space-y-3">
      <AppCard>
        <div className="text-[11px]" style={{ color: COLORS.textFaint }}>ℹ️ {t("dc.h.basis")}</div>
      </AppCard>

      <div className="rounded-xl overflow-hidden" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-semibold" style={{ background: COLORS.tile, color: COLORS.textFaint }}>
          <div className="col-span-2">{t("dc.ov.freshness")}</div>
          <div className="col-span-2">{t("dc.h.decision")}</div>
          <div className="col-span-3">{t("dc.h.firstPick")}</div>
          <div className="col-span-2">{t("dc.ov.portfolio")}</div>
          <div className="col-span-2 text-right">{t("dc.h.weekReturn")}</div>
          <div className="col-span-1 text-right">{t("dc.h.success")}</div>
        </div>

        {snaps.map((s) => {
          const o = outcomes[s.date];
          const isOpen = open === s.date;
          const pending = o === undefined || o?.status === "verifying";
          return (
            <div key={s.date} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
              <button onClick={() => setOpen(isOpen ? null : s.date)} className="w-full grid grid-cols-12 gap-2 px-4 py-2.5 text-left items-center hover:opacity-80 transition-opacity">
                <div className="col-span-2 text-[12px] tabular-nums" style={{ color: COLORS.text }}>{s.date}</div>
                <div className="col-span-2">
                  {s.verdict ? <AppBadge tone={VERDICT_TONE[s.verdict]}>{t(`dc.verdict.${s.verdict}` as Parameters<typeof t>[0])}</AppBadge> : <span style={{ color: COLORS.textFaint }}>—</span>}
                </div>
                <div className="col-span-3 text-[12px] truncate" style={{ color: COLORS.text }}>
                  {s.top1 ? <>{s.top1.name ?? s.top1.symbol} <span className="font-mono text-[10px]" style={{ color: COLORS.textFaint }}>{s.top1.symbol}</span></> : "—"}
                </div>
                <div className="col-span-2 text-[12px]" style={{ color: COLORS.textSecondary }}>{s.portfolio.length ? `${s.portfolio.length}` : "—"}</div>
                <div className="col-span-2 text-right text-[13px] font-semibold tabular-nums"
                  style={{ color: o?.status === "done" ? ((o.weekReturn ?? 0) >= 0 ? COLORS.success : COLORS.danger) : COLORS.textFaint }}>
                  {o?.status === "done" ? pct1(o.weekReturn) : pending ? t("dc.h.verifying") : "—"}
                </div>
                <div className="col-span-1 text-right text-[12px]">
                  {o?.status === "done" && o.stars ? <span style={{ color: COLORS.warning }}>{"★".repeat(o.stars)}</span> : <span style={{ color: COLORS.textFaint }}>—</span>}
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-3 text-[12px]" style={{ background: COLORS.tile }}>
                  {!s.top1 ? (
                    <div className="pt-2" style={{ color: COLORS.textFaint }}>{t("dc.ov.noData")}</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 pt-2">
                      <Kv k="AI / GPT" v={`${s.top1.aiScore ?? "—"} / ${s.top1.gptScore ?? "—"}`} />
                      <Kv k={t("dc.h.buyPrice")} v={jpy(s.top1.price)} />
                      <Kv k={t("dc.ov.entryRange")} v={s.top1.entryLow != null ? `${jpy(s.top1.entryLow)}~${jpy(s.top1.entryHigh)}` : "—"} />
                      <Kv k={t("dc.ov.target")} v={jpy(s.top1.target1)} />
                      <Kv k={t("dc.ov.stopLossP")} v={jpy(s.top1.stopLoss)} />
                      <Kv k={t("dc.ov.holdPeriod")} v={s.top1.holdPeriod ?? "—"} />
                      {o?.status === "done" ? (
                        <>
                          <Kv k={t("dc.h.actualHigh")} v={jpy(o.actualHighRaw)} />
                          <Kv k={t("dc.h.finalReturn")} v={pct1(o.weekReturn)} tone={(o.weekReturn ?? 0) >= 0 ? COLORS.success : COLORS.danger} />
                          <Kv k={t("dc.h.reached")} v={o.reachedTarget ? "✅" : "❌"} />
                          <Kv k={t("dc.h.review")} v={o.review} />
                        </>
                      ) : (
                        <Kv k={t("dc.h.success")} v={`${t("dc.h.verifying")} · ${t("dc.h.needMore")}${o?.status === "verifying" ? `（${o.daysElapsed}/${HOLD_DAYS}）` : ""}`} tone={COLORS.textFaint} />
                      )}
                      {s.verdictReason && <div className="md:col-span-2 pt-1" style={{ color: COLORS.textSecondary }}>▸ {s.verdictReason}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
